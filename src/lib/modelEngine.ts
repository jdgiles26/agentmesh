/**
 * WebGPU-first local inference engine.
 * Quantized dtypes, serialized generate queue, browser cache.
 */

import {
  pipeline,
  env,
  type TextGenerationPipeline,
} from '@huggingface/transformers';

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
let generateLock: Promise<void> = Promise.resolve();

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
  const snap = { ...status };
  listeners.forEach((fn) => fn(snap));
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
    const nav = navigator as Navigator & {
      gpu?: { requestAdapter: () => Promise<unknown> };
    };
    if (!nav.gpu) return false;
    const adapter = await nav.gpu.requestAdapter();
    return !!adapter;
  } catch {
    return false;
  }
}

async function tryLoad(
  modelId: string,
  device: 'webgpu' | 'wasm',
  dtype: string
): Promise<TextGenerationPipeline> {
  return (await pipeline('text-generation', modelId, {
    device,
    dtype,
    progress_callback: (p: { status?: string; progress?: number; file?: string }) => {
      if (p.status === 'progress' && typeof p.progress === 'number') {
        status.progress = Math.min(99, Math.round(p.progress));
        status.statusText = `Downloading ${p.file || 'weights'}… ${status.progress}%`;
        emit();
      }
    },
  })) as TextGenerationPipeline;
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
  emit();

  if (generator) {
    try {
      // @ts-expect-error optional dispose
      await generator.dispose?.();
    } catch {
      /* ignore */
    }
    generator = null;
  }

  const attempts: { device: 'webgpu' | 'wasm'; dtype: string; label: string }[] = webgpu
    ? [
        { device: 'webgpu', dtype: 'q4f16', label: 'WebGPU q4f16' },
        { device: 'webgpu', dtype: 'fp16', label: 'WebGPU fp16' },
        { device: 'wasm', dtype: 'q4', label: 'WASM q4' },
      ]
    : [{ device: 'wasm', dtype: 'q4', label: 'WASM q4' }];

  let lastError: unknown = null;

  for (const attempt of attempts) {
    status.statusText = `Loading ${modelId} (${attempt.label})…`;
    emit();
    try {
      generator = await tryLoad(modelId, attempt.device, attempt.dtype);
      currentModelId = modelId;
      currentBackend = attempt.device;
      status = {
        ...status,
        loaded: true,
        loading: false,
        backend: attempt.device,
        progress: 100,
        statusText: `Ready (${attempt.label}) — ${modelId}`,
        error: null,
      };
      emit();
      return;
    } catch (err) {
      lastError = err;
      generator = null;
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  status = {
    ...status,
    loaded: false,
    loading: false,
    backend: 'unavailable',
    progress: 0,
    statusText: 'Load failed',
    error: message,
  };
  emit();
  throw lastError instanceof Error ? lastError : new Error(message);
}

export async function unloadModel(): Promise<void> {
  if (generator) {
    try {
      // @ts-expect-error optional dispose
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

function normalizeOutput(result: unknown): string {
  const raw = Array.isArray(result) ? result[0] : result;
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof raw === 'object' && 'generated_text' in raw) {
    const gt = (raw as { generated_text: unknown }).generated_text;
    if (typeof gt === 'string') return gt.trim();
    if (Array.isArray(gt)) {
      const last = gt[gt.length - 1] as { content?: string } | string;
      return (typeof last === 'string' ? last : last?.content || '').trim();
    }
  }
  return '';
}

export async function generate(options: GenerateOptions): Promise<string> {
  if (!generator || !status.loaded) {
    throw new Error('Model not loaded. Call loadModel() first.');
  }

  const {
    systemPrompt,
    userPrompt,
    maxNewTokens = 1024,
    temperature = 0.2,
    topP = 0.9,
  } = options;

  // Allow up to 2048 for generative stages
  const tokens = Math.min(Math.max(maxNewTokens, 64), 2048);

  let output = '';
  const run = async () => {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const result = await generator!(messages, {
      max_new_tokens: tokens,
      temperature,
      top_p: topP,
      do_sample: temperature > 0.05,
      return_full_text: false,
    });

    output = normalizeOutput(result);
  };

  const prev = generateLock;
  let release!: () => void;
  generateLock = new Promise<void>((r) => {
    release = r;
  });
  await prev;
  try {
    await run();
  } finally {
    release();
  }

  return output;
}

export function isModelReady(): boolean {
  return status.loaded && !!generator;
}

export function getCurrentBackend(): InferenceBackend {
  return currentBackend;
}
