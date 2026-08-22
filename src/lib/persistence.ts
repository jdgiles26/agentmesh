import { get, set, del } from 'idb-keyval';
import type { PipelineRun } from '../types/artifact';

const RUN_KEY = 'agentmesh-x:last-run';

export async function saveRun(run: PipelineRun): Promise<void> {
  try {
    await set(RUN_KEY, run);
  } catch {
    /* quota or private mode — ignore */
  }
}

export async function loadRun(): Promise<PipelineRun | null> {
  try {
    const run = await get<PipelineRun>(RUN_KEY);
    return run ?? null;
  } catch {
    return null;
  }
}

export async function clearSavedRun(): Promise<void> {
  try {
    await del(RUN_KEY);
  } catch {
    /* ignore */
  }
}
