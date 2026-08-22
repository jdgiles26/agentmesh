import { STAGES } from '../types/stages';
import type { StageId } from '../types/artifact';
import { useBlackboard } from '../store/blackboard';
import { executeStage } from '../agents/pipelineAgents';
import { VirtualFS } from '../lib/virtualFs';
import { isModelReady } from '../lib/modelEngine';

const workspace = new VirtualFS();

export function getWorkspace(): VirtualFS {
  return workspace;
}

const MAX_DEBUG_ROUNDS = 3;

/**
 * Full autonomous pipeline orchestrator.
 * - Requires loaded WebGPU/WASM model
 * - Each stage = fresh independent agent invocation
 * - Deterministic sandbox for tests
 * - Bounded debug loop on failure
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

  workspace.clear();
  let debugRounds = 0;

  for (let i = 0; i < STAGES.length; i++) {
    const stage = STAGES[i];
    const current = useBlackboard.getState().run;
    if (!current || current.status !== 'running') return;

    store.setCurrentStage(stage.id);
    store.setStageStatus(stage.id, 'running');

    const start = performance.now();

    try {
      const result = await executeStage(
        stage.id,
        run.requirement,
        current.artifacts,
        workspace
      );

      for (const art of result.artifacts) {
        store.addArtifact(art);
      }
      store.setWorkspace(workspace.toArray());

      const duration = Math.round(performance.now() - start);
      const blocked = result.artifacts.some((a) => a.status === 'blocked' || a.status === 'rejected');

      // Bounded autonomous debug loop
      if (blocked && (stage.id === 'sandbox_execution' || stage.id === 'regression') && debugRounds < MAX_DEBUG_ROUNDS) {
        store.setStageStatus(stage.id, 'completed', duration);

        // Inject debugger stage dynamically
        debugRounds++;
        store.setCurrentStage('debugger');
        store.setStageStatus('debugger', 'running');
        const dbgStart = performance.now();
        const latestArtifacts = useBlackboard.getState().run!.artifacts;
        const dbgResult = await executeStage('debugger', run.requirement, latestArtifacts, workspace);
        for (const art of dbgResult.artifacts) store.addArtifact(art);
        store.setWorkspace(workspace.toArray());
        store.setStageStatus('debugger', 'completed', Math.round(performance.now() - dbgStart));

        // Re-run sandbox
        store.setCurrentStage('sandbox_execution');
        store.setStageStatus('sandbox_execution', 'running');
        const reStart = performance.now();
        const reResult = await executeStage('sandbox_execution', run.requirement, useBlackboard.getState().run!.artifacts, workspace);
        for (const art of reResult.artifacts) store.addArtifact(art);
        store.setWorkspace(workspace.toArray());
        const reBlocked = reResult.artifacts.some((a) => a.status === 'blocked');
        store.setStageStatus('sandbox_execution', reBlocked ? 'blocked' : 'completed', Math.round(performance.now() - reStart));

        if (reBlocked && debugRounds >= MAX_DEBUG_ROUNDS) {
          store.setPipelineStatus('blocked');
          store.addError(`Pipeline blocked after ${MAX_DEBUG_ROUNDS} debug rounds at ${stage.name}`);
          return;
        }
        if (reBlocked) {
          // continue loop will retry logic only via debugRounds; fall through to block
          store.setPipelineStatus('blocked');
          store.addError(`Tests still failing after debug attempt ${debugRounds}`);
          return;
        }
        continue;
      }

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
      store.addError(`Stage ${stage.name}: ${err instanceof Error ? err.message : String(err)}`);
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
