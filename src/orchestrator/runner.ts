import { STAGES } from '../types/stages';
import type { StageId } from '../types/artifact';
import { useBlackboard } from '../store/blackboard';
import { executeStage } from '../agents/pipelineAgents';
import { VirtualFS } from '../lib/virtualFs';
import { isModelReady } from '../lib/modelEngine';
import { BudgetTracker } from '../lib/budgets';
import { sanitizeRequirement } from '../lib/guardrails';
import { clearTelemetry, logTelemetry, summarizeTelemetry } from '../lib/telemetry';

const workspace = new VirtualFS();

export function getWorkspace(): VirtualFS {
  return workspace;
}

function yieldToUI(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Autonomous pipeline with budgets, telemetry, and guardrails
 * aligned to ai-agentic-workflows reliability patterns.
 */
export async function runPipeline() {
  const store = useBlackboard.getState();
  const { run } = store;
  if (!run || run.status !== 'running') return;

  if (!isModelReady()) {
    store.addError('Model not loaded. Load a local model (WebGPU preferred) before starting.');
    store.setPipelineStatus('failed');
    return;
  }

  const requirement = sanitizeRequirement(run.requirement);
  const budget = new BudgetTracker();
  clearTelemetry();
  workspace.clear();

  logTelemetry({
    run_id: run.run_id,
    level: 'info',
    event: 'pipeline_start',
    detail: { requirement: requirement.slice(0, 200) },
  });

  for (let i = 0; i < STAGES.length; i++) {
    const stage = STAGES[i];
    const current = useBlackboard.getState().run;
    if (!current || current.status !== 'running') {
      logTelemetry({ run_id: run.run_id, level: 'warn', event: 'pipeline_stopped' });
      return;
    }

    if (stage.id === 'debugger') continue;

    const budgetCheck = budget.check();
    if (!budgetCheck.ok) {
      store.addError(budgetCheck.reason || 'Budget exceeded');
      store.setPipelineStatus('blocked');
      logTelemetry({
        run_id: run.run_id,
        level: 'error',
        event: 'budget_exceeded',
        detail: { reason: budgetCheck.reason },
      });
      return;
    }

    store.setCurrentStage(stage.id);
    store.setStageStatus(stage.id, 'running');
    await yieldToUI();

    const start = performance.now();

    try {
      const result = await executeStage(
        stage.id,
        requirement,
        current.artifacts,
        workspace,
        run.run_id
      );

      budget.recordStage(result.tokensInEst || 0, result.tokensOutEst || 0);

      for (const art of result.artifacts) {
        store.addArtifact(art);
      }
      store.setWorkspace(workspace.toArray());

      const duration = Math.round(performance.now() - start);
      const blocked = result.artifacts.some(
        (a) => a.status === 'blocked' || a.status === 'rejected'
      );

      if (
        blocked &&
        (stage.id === 'sandbox_execution' || stage.id === 'regression') &&
        budget.debugRounds < budget.budget.max_debug_rounds
      ) {
        store.setStageStatus(stage.id, 'completed', duration);
        budget.recordDebugRound();

        store.setCurrentStage('debugger');
        store.setStageStatus('debugger', 'running');
        await yieldToUI();

        const dbgStart = performance.now();
        const latestArtifacts = useBlackboard.getState().run!.artifacts;
        const dbgResult = await executeStage(
          'debugger',
          requirement,
          latestArtifacts,
          workspace,
          run.run_id
        );
        budget.recordStage(dbgResult.tokensInEst || 0, dbgResult.tokensOutEst || 0);
        for (const art of dbgResult.artifacts) store.addArtifact(art);
        store.setWorkspace(workspace.toArray());
        store.setStageStatus('debugger', 'completed', Math.round(performance.now() - dbgStart));

        store.setCurrentStage('sandbox_execution');
        store.setStageStatus('sandbox_execution', 'running');
        await yieldToUI();

        const reStart = performance.now();
        const reResult = await executeStage(
          'sandbox_execution',
          requirement,
          useBlackboard.getState().run!.artifacts,
          workspace,
          run.run_id
        );
        for (const art of reResult.artifacts) store.addArtifact(art);
        store.setWorkspace(workspace.toArray());

        const reBlocked = reResult.artifacts.some((a) => a.status === 'blocked');
        store.setStageStatus(
          'sandbox_execution',
          reBlocked ? 'blocked' : 'completed',
          Math.round(performance.now() - reStart)
        );

        if (reBlocked) {
          store.setPipelineStatus('blocked');
          store.addError(
            `Tests still failing after debug attempt ${budget.debugRounds}/${budget.budget.max_debug_rounds}`
          );
          logTelemetry({
            run_id: run.run_id,
            level: 'error',
            event: 'debug_exhausted',
            detail: summarizeTelemetry(run.run_id),
          });
          return;
        }
        continue;
      }

      if (blocked) {
        store.setStageStatus(stage.id, 'blocked', duration);
        store.setPipelineStatus('blocked');
        store.addError(`Pipeline blocked at ${stage.name}`);
        logTelemetry({
          run_id: run.run_id,
          stage_id: stage.id,
          level: 'error',
          event: 'stage_blocked',
          duration_ms: duration,
        });
        return;
      }

      store.setStageStatus(stage.id, 'completed', duration);
    } catch (err) {
      const duration = Math.round(performance.now() - start);
      store.setStageStatus(stage.id, 'failed', duration);
      const msg = err instanceof Error ? err.message : String(err);
      store.addError(`Stage ${stage.name}: ${msg}`);
      store.setPipelineStatus('failed');
      logTelemetry({
        run_id: run.run_id,
        stage_id: stage.id,
        level: 'error',
        event: 'stage_failed',
        duration_ms: duration,
        detail: { error: msg },
      });
      return;
    }
  }

  store.setCurrentStage(null);
  store.setPipelineStatus('completed');
  logTelemetry({
    run_id: run.run_id,
    level: 'info',
    event: 'pipeline_complete',
    detail: summarizeTelemetry(run.run_id),
  });
}

export function getStageProgress(
  stageId: StageId
): 'pending' | 'running' | 'completed' | 'failed' | 'blocked' {
  const { run } = useBlackboard.getState();
  if (!run) return 'pending';
  const entry = run.stage_history.find((h) => h.stage === stageId);
  if (!entry) return 'pending';
  if (entry.status === 'running') return 'running';
  if (entry.status === 'completed') return 'completed';
  if (entry.status === 'failed') return 'failed';
  if (entry.status === 'blocked') return 'blocked';
  return 'pending';
}
