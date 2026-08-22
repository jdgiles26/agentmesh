/**
 * Structured observability for agent steps (ai-agentic-workflows).
 * Records stage transitions, tool results, token estimates, and failures.
 */

export type TelemetryLevel = 'info' | 'warn' | 'error' | 'debug';

export interface TelemetryEvent {
  id: string;
  ts: string;
  run_id: string;
  stage_id?: string;
  agent_id?: string;
  level: TelemetryLevel;
  event: string;
  duration_ms?: number;
  tokens_in_est?: number;
  tokens_out_est?: number;
  status?: string;
  detail?: Record<string, unknown>;
}

const MAX_EVENTS = 500;
const events: TelemetryEvent[] = [];
const listeners = new Set<(ev: TelemetryEvent[]) => void>();

let seq = 0;

function emit() {
  const snap = [...events];
  listeners.forEach((fn) => fn(snap));
}

export function subscribeTelemetry(fn: (ev: TelemetryEvent[]) => void): () => void {
  listeners.add(fn);
  fn([...events]);
  return () => listeners.delete(fn);
}

export function getTelemetry(): TelemetryEvent[] {
  return [...events];
}

export function clearTelemetry(): void {
  events.length = 0;
  emit();
}

export function logTelemetry(
  partial: Omit<TelemetryEvent, 'id' | 'ts'> & { run_id: string }
): TelemetryEvent {
  const ev: TelemetryEvent = {
    id: `tel-${++seq}`,
    ts: new Date().toISOString(),
    ...partial,
  };
  events.push(ev);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  emit();
  return ev;
}

/** Rough token estimate (~4 chars/token) for browser cost control */
export function estimateTokens(text: string): number {
  return Math.ceil((text || '').length / 4);
}

export function summarizeTelemetry(runId: string): {
  events: number;
  errors: number;
  warnings: number;
  total_tokens_in_est: number;
  total_tokens_out_est: number;
  total_duration_ms: number;
} {
  const mine = events.filter((e) => e.run_id === runId);
  return {
    events: mine.length,
    errors: mine.filter((e) => e.level === 'error').length,
    warnings: mine.filter((e) => e.level === 'warn').length,
    total_tokens_in_est: mine.reduce((s, e) => s + (e.tokens_in_est || 0), 0),
    total_tokens_out_est: mine.reduce((s, e) => s + (e.tokens_out_est || 0), 0),
    total_duration_ms: mine.reduce((s, e) => s + (e.duration_ms || 0), 0),
  };
}
