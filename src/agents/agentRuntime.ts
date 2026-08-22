/**
 * Independent agent runtime with context pruning, telemetry, and guardrails.
 */

import { generate, isModelReady } from '../lib/modelEngine';
import { extractJSON } from '../lib/jsonExtract';
import { STAGE_PROMPTS, PROMPT_VERSION } from './stagePrompts';
import type { StageId, Artifact } from '../types/artifact';
import { createArtifact } from '../store/blackboard';
import { STAGES } from '../types/stages';
import { logTelemetry, estimateTokens } from '../lib/telemetry';
import { validateArtifactShape } from '../lib/guardrails';

export interface AgentInput {
  stageId: StageId;
  requirement: string;
  artifacts: Record<string, Artifact>;
  extraContext?: string;
  runId?: string;
}

export interface AgentOutput {
  artifact: Artifact;
  rawModelText: string;
  parsed: Record<string, unknown>;
  tokensInEst: number;
  tokensOutEst: number;
}

const MAX_ARTIFACT_CHARS = 2800;
const MAX_EXTRA_CHARS = 4000;
const MAX_REQUIREMENT_CHARS = 1000;

const HIGH_VALUE_STAGES = new Set([
  'intake',
  'requirements_critic',
  'acceptance',
  'architecture',
  'threat_model',
  'test_strategy',
  'task_decomposition',
  'test_generation',
  'code_generation',
  'sandbox_execution',
  'security',
  'final_review',
]);

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 20) + '\n…[truncated]';
}

function compactContent(content: Record<string, unknown>): unknown {
  const json = JSON.stringify(content);
  if (json.length <= MAX_ARTIFACT_CHARS) return content;
  const prefer = [
    'status',
    'decision',
    'summary',
    'project_objective',
    'criteria',
    'tasks',
    'threats',
    'tests_passed',
    'tests_failed',
    'exit_code',
    'issues',
    'findings',
    'source_files',
    'test_files',
    'patches',
  ];
  const slim: Record<string, unknown> = {};
  for (const k of prefer) {
    if (k in content) slim[k] = content[k];
  }
  if (Object.keys(slim).length === 0) {
    return JSON.parse(truncate(json, MAX_ARTIFACT_CHARS));
  }
  const slimJson = JSON.stringify(slim);
  if (slimJson.length > MAX_ARTIFACT_CHARS) {
    return JSON.parse(truncate(slimJson, MAX_ARTIFACT_CHARS));
  }
  return slim;
}

function selectRelevantArtifacts(stageId: StageId, artifacts: Record<string, Artifact>): Artifact[] {
  const stageDef = STAGES.find((s) => s.id === stageId);
  const all = Object.values(artifacts).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const requiredHints = new Set(
    (stageDef?.requiredInputs || []).map((r) => r.toLowerCase().replace(/_/g, ''))
  );

  const scored = all.map((a) => {
    let score = 0;
    if (HIGH_VALUE_STAGES.has(a.stage as StageId)) score += 2;
    if (requiredHints.size && [...requiredHints].some((h) => a.stage.includes(h.slice(0, 6)))) score += 3;
    if (['sandbox_execution', 'code_generation', 'test_generation', 'debugger'].includes(a.stage)) score += 2;
    return { a, score };
  });

  scored.sort((x, y) => y.score - x.score);
  const picked = scored.slice(0, 8).map((s) => s.a);
  picked.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return picked;
}

function buildUserPrompt(input: AgentInput): string {
  const relevant = selectRelevantArtifacts(input.stageId, input.artifacts).map((a) => ({
    stage: a.stage,
    status: a.status,
    content: compactContent(a.content),
    assumptions: a.assumptions.slice(0, 5),
    unknowns: a.unknowns.slice(0, 5),
  }));

  const parts = [
    `## Requirement\n${truncate(input.requirement, MAX_REQUIREMENT_CHARS)}`,
    `## Artifacts\n${JSON.stringify(relevant)}`,
  ];

  if (input.extraContext) {
    parts.push(`## Context\n${truncate(input.extraContext, MAX_EXTRA_CHARS)}`);
  }

  parts.push('JSON only.');
  return parts.join('\n\n');
}

function mapStatus(parsed: Record<string, unknown>): Artifact['status'] {
  const s = String(parsed.status || parsed.decision || '').toUpperCase();
  if (['BLOCKED', 'FAIL', 'NOT_READY', 'REJECTED'].includes(s)) return 'blocked';
  if (['PASS', 'READY', 'APPROVED'].includes(s)) return 'approved';
  if (['VERIFIED', 'COMPLETE', 'N/A', 'ACCEPTABLE', 'REVIEWED', 'PATCHED', 'NO_ACTION_NEEDED'].includes(s)) {
    return 'verified';
  }
  if (parsed.status === 'verified' || parsed.status === 'approved') {
    return parsed.status as Artifact['status'];
  }
  return 'verified';
}

export async function runIndependentAgent(input: AgentInput): Promise<AgentOutput> {
  if (!isModelReady()) {
    throw new Error('Model not loaded. Load a WebGPU/WASM model before running the pipeline.');
  }

  const config = STAGE_PROMPTS[input.stageId];
  if (!config) throw new Error(`No prompt configured for stage ${input.stageId}`);

  const runId = input.runId || 'unknown';
  const userPrompt = buildUserPrompt(input);
  const systemPrompt = `${config.system}\nPrompt-v:${PROMPT_VERSION}\nJSON only. No markdown.`;
  const tokensInEst = estimateTokens(systemPrompt) + estimateTokens(userPrompt);
  const t0 = performance.now();

  logTelemetry({
    run_id: runId,
    stage_id: input.stageId,
    agent_id: `${input.stageId}-agent`,
    level: 'info',
    event: 'agent_start',
    tokens_in_est: tokensInEst,
  });

  const raw = await generate({
    systemPrompt,
    userPrompt,
    maxNewTokens: config.maxTokens,
    temperature: config.temperature,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = extractJSON(raw);
  } catch {
    logTelemetry({
      run_id: runId,
      stage_id: input.stageId,
      level: 'warn',
      event: 'json_repair_attempt',
    });
    const repairRaw = await generate({
      systemPrompt: 'Output ONLY valid JSON. No markdown fences.',
      userPrompt: `Convert to JSON:\n${raw.slice(0, 2500)}`,
      maxNewTokens: Math.min(config.maxTokens, 1024),
      temperature: 0.05,
    });
    parsed = extractJSON(repairRaw);
  }

  const shape = validateArtifactShape(parsed);
  if (!shape.ok) {
    logTelemetry({
      run_id: runId,
      stage_id: input.stageId,
      level: 'error',
      event: 'artifact_shape_invalid',
      detail: { findings: shape.findings },
    });
    throw new Error(`Invalid artifact shape: ${shape.findings.join('; ')}`);
  }

  const status = mapStatus(parsed);
  const assumptions = Array.isArray(parsed.assumptions) ? (parsed.assumptions as string[]).slice(0, 8) : [];
  const unknowns = Array.isArray(parsed.unknowns) ? (parsed.unknowns as string[]).slice(0, 8) : [];
  const tokensOutEst = estimateTokens(raw);
  const duration = Math.round(performance.now() - t0);

  const artifact = createArtifact(
    input.stageId,
    `${input.stageId}-agent`,
    parsed,
    selectRelevantArtifacts(input.stageId, input.artifacts).map((a) => a.artifact_id),
    status,
    status === 'blocked' ? 0.35 : 0.75
  );
  artifact.assumptions = assumptions;
  artifact.unknowns = unknowns;
  artifact.verification = ['Independent model invocation', `prompt_version=${PROMPT_VERSION}`];
  artifact.created_by = `${input.stageId}-agent`;

  logTelemetry({
    run_id: runId,
    stage_id: input.stageId,
    agent_id: artifact.created_by,
    level: status === 'blocked' ? 'warn' : 'info',
    event: 'agent_complete',
    duration_ms: duration,
    tokens_in_est: tokensInEst,
    tokens_out_est: tokensOutEst,
    status,
  });

  return { artifact, rawModelText: raw, parsed, tokensInEst, tokensOutEst };
}
