/**
 * WebGPU-first local inference engine using @huggingface/transformers.
 * Prefer WebGPU → WASM. Models cached in browser (Cache Storage / IndexedDB).
 */

import {
  pipeline,
  env,
  type TextGenerationPipeline,
} from '@huggingface/transformers';

// Configure transformers.js for browser
env.allowLocalModels = false;
env.useBrowserCache = true;

export type InferenceBackend = 'webgpu' | 'wasm' | 'unavailable';

export interface ModelStatus {
  loaded: boolean;
  loading: boolean;
  backend: InferenceBackend;
  modelId: string;
  progress: number;
  statusText: string;
  error: string | null;
  webgpuAvailable: boolean;
}

export interface GenerateOptions {
  maxNewTokens?: number;
  temperature?: number;
  topP?: number;
  systemPrompt: string;
  userPrompt: string;
}

// Small instruction models that fit in browser memory with WebGPU
export const SUPPORTED_MODELS = [
  {
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    label: 'Qwen2.5 0.5B Instruct',
    size: '~1GB',
    recommended: true,
  },
  {
    id: 'HuggingFaceTB/SmolLM2-360M-Instruct',
    label: 'SmolLM2 360M Instruct',
    size: '~700MB',
    recommended: false,
  },
  {
    id: 'onnx-community/Qwen2.5-1.5B-Instruct',
    label: 'Qwen2.5 1.5B Instruct',
    size: '~2GB',
    recommended: false,
  },
] as const;

const DEFAULT_MODEL = SUPPORTED_MODELS[0].id;

let generator: TextGenerationPipeline | null = null;
let currentModelId = DEFAULT_MODEL;
let currentBackend: InferenceBackend = 'unavailable';

const listeners = new Set<(s: ModelStatus) => void>();

let status: ModelStatus = {
  loaded: false,
  loading: false,
  backend: 'unavailable',
  modelId: DEFAULT_MODEL,
  progress: 0,
  statusText: 'Not loaded',
  error: null,
  webgpuAvailable: false,
};

function emit() {
  listeners.forEach((fn) => fn({ ...status }));
}

export function subscribeModelStatus(fn: (s: ModelStatus) => void): () => void {
  listeners.add(fn);
  fn({ ...status });
  return () => listeners.delete(fn);
}

export function getModelStatus(): ModelStatus {
  return { ...status };
}

export async function detectWebGPU(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !(navigator as Navigator & { gpu?: unknown }).gpu) {
      return false;
    }
    const gpu = (navigator as Navigator & { gpu: { requestAdapter: () => Promise<unknown> } }).gpu;
    const adapter = await gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

export async function loadModel(modelId: string = DEFAULT_MODEL): Promise<void> {
  if (status.loading) return;
  if (generator && currentModelId === modelId && status.loaded) return;

  status = {
    ...status,
    loading: true,
    loaded: false,
    progress: 0,
    statusText: 'Detecting WebGPU…',
    error: null,
    modelId,
  };
  emit();

  const webgpu = await detectWebGPU();
  status.webgpuAvailable = webgpu;
  status.statusText = webgpu ? 'WebGPU available — loading model…' : 'WebGPU unavailable — loading WASM backend…';
  emit();

  const device = webgpu ? 'webgpu' : 'wasm';

  try {
    // Dispose previous
    if (generator) {
      try {
        // @ts-expect-error dispose may exist
        await generator.dispose?.();
      } catch {
        /* ignore */
      }
      generator = null;
    }

    generator = await pipeline('text-generation', modelId, {
      device,
      dtype: webgpu ? 'fp16' : 'q4',
      progress_callback: (p: { status?: string; progress?: number; file?: string }) => {
        if (p.status === 'progress' && typeof p.progress === 'number') {
          status.progress = Math.round(p.progress);
          status.statusText = `Downloading ${p.file || 'weights'}… ${status.progress}%`;
          emit();
        } else if (p.status === 'done') {
          status.statusText = `Loaded ${p.file || ''}`;
          emit();
        }
      },
    }) as TextGenerationPipeline;

    currentModelId = modelId;
    currentBackend = device;
    status = {
      ...status,
      loaded: true,
      loading: false,
      backend: device,
      progress: 100,
      statusText: `Ready (${device.toUpperCase()}) — ${modelId}`,
      error: null,
    };
    emit();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    status = {
      ...status,
      loaded: false,
      loading: false,
      backend: 'unavailable',
      progress: 0,
      statusText: 'Load failed',
      error: message,
    };
    generator = null;
    emit();
    throw err;
  }
}

export async function unloadModel(): Promise<void> {
  if (generator) {
    try {
      // @ts-expect-error dispose may exist
      await generator.dispose?.();
    } catch {
      /* ignore */
    }
  }
  generator = null;
  currentBackend = 'unavailable';
  status = {
    ...status,
    loaded: false,
    loading: false,
    backend: 'unavailable',
    progress: 0,
    statusText: 'Unloaded',
    error: null,
  };
  emit();
}

/**
 * Fresh inference call — no conversation history carried between stages.
 * Each agent invocation is independent.
 */
export async function generate(options: GenerateOptions): Promise<string> {
  if (!generator || !status.loaded) {
    throw new Error('Model not loaded. Call loadModel() first.');
  }

  const {
    systemPrompt,
    userPrompt,
    maxNewTokens = 1024,
    temperature = 0.3,
    topP = 0.9,
  } = options;

  // Chat-style messages for instruct models
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const result = await generator(messages, {
    max_new_tokens: maxNewTokens,
    temperature,
    top_p: topP,
    do_sample: temperature > 0,
    return_full_text: false,
  });

  // Normalize output across pipeline versions
  const raw = Array.isArray(result) ? result[0] : result;
  let text = '';
  if (raw && typeof raw === 'object') {
    if ('generated_text' in raw) {
      const gt = (raw as { generated_text: unknown }).generated_text;
      if (typeof gt === 'string') text = gt;
      else if (Array.isArray(gt)) {
        // Some versions return message list
        const last = gt[gt.length - 1] as { content?: string } | string;
        text = typeof last === 'string' ? last : last?.content || '';
      }
    }
  }
  if (!text && typeof raw === 'string') text = raw;

  return text.trim();
}

export function isModelReady(): boolean {
  return status.loaded && !!generator;
}

export function getCurrentBackend(): InferenceBackend {
  return currentBackend;
}
