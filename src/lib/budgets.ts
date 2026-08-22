/**
 * Per-run cost and iteration budgets (ai-agentic-workflows cost control).
 */

export interface RunBudget {
  max_stage_invocations: number;
  max_debug_rounds: number;
  max_estimated_tokens: number;
  max_wall_ms: number;
}

export const DEFAULT_BUDGET: RunBudget = {
  max_stage_invocations: 40,
  max_debug_rounds: 2,
  max_estimated_tokens: 120_000,
  max_wall_ms: 30 * 60 * 1000, // 30 minutes
};

export class BudgetTracker {
  readonly budget: RunBudget;
  stageInvocations = 0;
  debugRounds = 0;
  estimatedTokens = 0;
  readonly startedAt = Date.now();

  constructor(budget: Partial<RunBudget> = {}) {
    this.budget = { ...DEFAULT_BUDGET, ...budget };
  }

  recordStage(tokensIn = 0, tokensOut = 0): void {
    this.stageInvocations += 1;
    this.estimatedTokens += tokensIn + tokensOut;
  }

  recordDebugRound(): void {
    this.debugRounds += 1;
  }

  check(): { ok: boolean; reason?: string } {
    if (this.stageInvocations > this.budget.max_stage_invocations) {
      return { ok: false, reason: `Stage invocation budget exceeded (${this.stageInvocations}/${this.budget.max_stage_invocations})` };
    }
    if (this.debugRounds > this.budget.max_debug_rounds) {
      return { ok: false, reason: `Debug round budget exceeded (${this.debugRounds}/${this.budget.max_debug_rounds})` };
    }
    if (this.estimatedTokens > this.budget.max_estimated_tokens) {
      return { ok: false, reason: `Token budget exceeded (~${this.estimatedTokens}/${this.budget.max_estimated_tokens})` };
    }
    if (Date.now() - this.startedAt > this.budget.max_wall_ms) {
      return { ok: false, reason: 'Wall-clock time budget exceeded' };
    }
    return { ok: true };
  }
}
