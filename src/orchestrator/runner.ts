import { STAGES } from '../types/stages';
import type { StageId } from '../types/artifact';
import { useBlackboard } from '../store/blackboard';
import { runRealAgent } from '../agents/realAgents';
import { VirtualFS } from '../lib/virtualFs';

const workspace = new VirtualFS();

export function getWorkspace(): VirtualFS {
  return workspace;
}

/**
 * Core orchestrator — real pipeline.
 * Each stage receives only prior artifacts + shared workspace.
 * Quality gates can block progression.
 */
export async function runPipeline() {
  const store = useBlackboard.getState();
  const { run } = store;
  if (!run || run.status !== 'running') return;

  workspace.clear();

  for (const stage of STAGES) {
    const current = useBlackboard.getState().run;
    if (!current || current.status !== 'running') return;

    store.setCurrentStage(stage.id);
    store.setStageStatus(stage.id, 'running');

    const start = performance.now();

    try {
      const result = await runRealAgent(
        stage.id,
        run.requirement,
        current.artifacts,
        workspace
      );

      for (const art of result.artifacts) {
        store.addArtifact(art);
      }

      if (result.workspaceUpdates) {
        store.setWorkspace(workspace.toArray());
      } else {
        // Keep workspace in sync even if no new files
        store.setWorkspace(workspace.toArray());
      }

      const duration = Math.round(performance.now() - start);

      // Gate / blocked check
      const blocked = result.artifacts.some((a) => a.status === 'blocked' || a.status === 'rejected');
      if (blocked) {
        store.setStageStatus(stage.id, 'blocked', duration);
        store.setPipelineStatus('blocked');
        store.addError(`Pipeline blocked at ${stage.name}`);
        return;
      }

      store.setStageStatus(stage.id, 'completed', duration);
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
