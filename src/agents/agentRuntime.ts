/**
 * Independent agent runtime.
 * Each call is a fresh model invocation with only the stage system prompt
 * and explicitly provided artifact context — no shared chat history.
 */

import { generate, isModelReady } from '../lib/modelEngine';
import { extractJSON } from '../lib/jsonExtract';
import { STAGE_PROMPTS, PROMPT_VERSION } from './stagePrompts';
import type { StageId, Artifact } from '../types/artifact';
import { createArtifact } from '../store/blackboard';

export interface AgentInput {
  stageId: StageId;
  requirement: string;
  artifacts: Record<string, Artifact>;
  extraContext?: string;
}

export interface AgentOutput {
  artifact: Artifact;
  rawModelText: string;
  parsed: Record<string, unknown>;
}

function buildUserPrompt(input: AgentInput): string {
  const relevant = Object.values(input.artifacts)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map((a) => ({
      stage: a.stage,
      status: a.status,
      content: a.content,
      assumptions: a.assumptions,
      unknowns: a.unknowns,
    }));

  const parts = [
    `## Original Requirement\n${input.requirement}`,
    `## Prior Artifacts (only source of truth from previous stages)\n${JSON.stringify(relevant, null, 2)}`,
  ];

  if (input.extraContext) {
    parts.push(`## Additional Context\n${input.extraContext}`);
  }

  parts.push('Respond with JSON only, matching the schema in your system instructions.');
  return parts.join('\n\n');
}

function mapStatus(parsed: Record<string, unknown>): Artifact['status'] {
  const s = String(parsed.status || parsed.decision || '').toUpperCase();
  if (s === 'BLOCKED' || s === 'FAIL' || s === 'NOT_READY' || s === 'REJECTED') return 'blocked';
  if (s === 'PASS' || s === 'READY' || s === 'VERIFIED' || s === 'COMPLETE' || s === 'APPROVED' || s === 'N/A' || s === 'ACCEPTABLE' || s === 'REVIEWED' || s === 'PATCHED') {
    return s === 'PASS' || s === 'READY' || s === 'APPROVED' ? 'approved' : 'verified';
  }
  if (parsed.status === 'verified' || parsed.status === 'approved') return parsed.status as Artifact['status'];
  return 'verified';
}

/**
 * Run a single independent agent for a stage.
 * Fresh model call every time.
 */
export async function runIndependentAgent(input: AgentInput): Promise<AgentOutput> {
  if (!isModelReady()) {
    throw new Error('Model not loaded. Load a WebGPU/WASM model before running the pipeline.');
  }

  const config = STAGE_PROMPTS[input.stageId];
  if (!config) throw new Error(`No prompt configured for stage ${input.stageId}`);

  const userPrompt = buildUserPrompt(input);

  const raw = await generate({
    systemPrompt: config.system + `\n\nPrompt version: ${PROMPT_VERSION}`,
    userPrompt,
    maxNewTokens: config.maxTokens,
    temperature: config.temperature,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = extractJSON(raw);
  } catch {
    // One repair attempt with stricter instruction
    const repairRaw = await generate({
      systemPrompt: config.system + '\n\nYour previous output was not valid JSON. Output ONLY a JSON object.',
      userPrompt: `Fix this into valid JSON only:\n${raw.slice(0, 3000)}`,
      maxNewTokens: config.maxTokens,
      temperature: 0.1,
    });
    parsed = extractJSON(repairRaw);
  }

  const status = mapStatus(parsed);
  const assumptions = Array.isArray(parsed.assumptions) ? (parsed.assumptions as string[]) : [];
  const unknowns = Array.isArray(parsed.unknowns) ? (parsed.unknowns as string[]) : [];

  const artifact = createArtifact(
    input.stageId,
    STAGE_PROMPTS[input.stageId] ? input.stageId + ' agent' : 'agent',
    parsed,
    Object.keys(input.artifacts),
    status,
    status === 'blocked' ? 0.35 : 0.75
  );
  artifact.assumptions = assumptions;
  artifact.unknowns = unknowns;
  artifact.verification = ['Independent model invocation', `prompt_version=${PROMPT_VERSION}`];

  // Set created_by from stage definition name would be nicer; keep stage id for now
  artifact.created_by = `${input.stageId}-agent`;

  return { artifact, rawModelText: raw, parsed };
}
