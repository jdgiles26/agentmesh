import { STAGES } from '../types/stages';
import type { StageId } from '../types/artifact';
import { useBlackboard } from '../store/blackboard';
import { runAgent } from '../agents/mockAgents';

/**
 * Core orchestrator.
 * Enforces stage order, quality gates, and independent agent invocations.
 * In a full implementation each stage would spin up a fresh model instance.
 */
export async function runPipeline() {
  const store = useBlackboard.getState();
  const { run } = store;
  if (!run || run.status !== 'running') return;

  for (const stage of STAGES) {
    // Check if still running (user may have paused/stopped)
    const current = useBlackboard.getState().run;
    if (!current || current.status !== 'running') return;

    store.setCurrentStage(stage.id);
    store.setStageStatus(stage.id, 'running');

    const start = performance.now();

    try {
      const artifacts = await runAgent(
        stage.id,
        run.requirement,
        current.artifacts
      );

      for (const art of artifacts) {
        store.addArtifact(art);
      }

      const duration = Math.round(performance.now() - start);
      store.setStageStatus(stage.id, 'completed', duration);

      // Simple gate simulation
      if (stage.gate) {
        // In real system: evaluate gate conditions from artifacts
        // For now we assume pass unless an artifact is blocked
        const blocked = artifacts.some((a) => a.status === 'blocked');
        if (blocked) {
          store.setPipelineStatus('blocked');
          store.addError(`Gate failed at ${stage.name}`);
          return;
        }
      }
    } catch (err) {
      const duration = Math.round(performance.now() - start);
      store.setStageStatus(stage.id, 'failed', duration);
      store.addError(`Stage ${stage.name} failed: ${String(err)}`);
      store.setPipelineStatus('failed');
      return;
    }
  }

  store.setCurrentStage(null);
  store.setPipelineStatus('completed');
}

export function getStageProgress(stageId: StageId): 'pending' | 'running' | 'completed' | 'failed' | 'blocked' {
  const { run } = useBlackboard.getState();
  if (!run) return 'pending';
  const entry = run.stage_history.find((h) => h.stage === stageId);
  if (!entry) return 'pending';
  if (entry.status === 'running') return 'running';
  if (entry.status === 'completed') return 'completed';
  if (entry.status === 'failed') return 'failed';
  return 'pending';
}
