import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Artifact, PipelineRun, StageId, PipelineStatus, VirtualFile } from '../types/artifact';
import { STAGES } from '../types/stages';

interface BlackboardState {
  run: PipelineRun | null;
  selectedArtifactId: string | null;
  selectedStageId: StageId | null;
  selectedFilePath: string | null;

  startRun: (requirement: string) => void;
  setStageStatus: (stage: StageId, status: string, duration_ms?: number) => void;
  addArtifact: (artifact: Artifact) => void;
  updateArtifact: (id: string, updates: Partial<Artifact>) => void;
  setCurrentStage: (stage: StageId | null) => void;
  setPipelineStatus: (status: PipelineStatus) => void;
  setWorkspace: (files: VirtualFile[]) => void;
  selectArtifact: (id: string | null) => void;
  selectStage: (id: StageId | null) => void;
  selectFile: (path: string | null) => void;
  addError: (error: string) => void;
  reset: () => void;
}

const createEmptyRun = (requirement: string): PipelineRun => ({
  run_id: uuidv4(),
  status: 'idle',
  current_stage: null,
  started_at: null,
  completed_at: null,
  requirement,
  artifacts: {},
  stage_history: [],
  errors: [],
  workspace: [],
});

export const useBlackboard = create<BlackboardState>((set, get) => ({
  run: null,
  selectedArtifactId: null,
  selectedStageId: null,
  selectedFilePath: null,

  startRun: (requirement: string) => {
    const run = createEmptyRun(requirement);
    run.status = 'running';
    run.started_at = new Date().toISOString();
    set({ run, selectedArtifactId: null, selectedStageId: null, selectedFilePath: null });
  },

  setStageStatus: (stage, status, duration_ms) => {
    const { run } = get();
    if (!run) return;
    const history = [...run.stage_history];
    const existing = history.findIndex((h) => h.stage === stage);
    if (existing >= 0) {
      history[existing] = { stage, status, duration_ms };
    } else {
      history.push({ stage, status, duration_ms });
    }
    set({ run: { ...run, stage_history: history } });
  },

  addArtifact: (artifact) => {
    const { run } = get();
    if (!run) return;
    set({
      run: {
        ...run,
        artifacts: { ...run.artifacts, [artifact.artifact_id]: artifact },
      },
    });
  },

  updateArtifact: (id, updates) => {
    const { run } = get();
    if (!run || !run.artifacts[id]) return;
    set({
      run: {
        ...run,
        artifacts: {
          ...run.artifacts,
          [id]: { ...run.artifacts[id], ...updates },
        },
      },
    });
  },

  setCurrentStage: (stage) => {
    const { run } = get();
    if (!run) return;
    set({ run: { ...run, current_stage: stage }, selectedStageId: stage });
  },

  setPipelineStatus: (status) => {
    const { run } = get();
    if (!run) return;
    const updates: Partial<PipelineRun> = { status };
    if (status === 'completed' || status === 'failed' || status === 'blocked') {
      updates.completed_at = new Date().toISOString();
    }
    set({ run: { ...run, ...updates } });
  },

  setWorkspace: (files) => {
    const { run } = get();
    if (!run) return;
    set({ run: { ...run, workspace: files } });
  },

  selectArtifact: (id) => set({ selectedArtifactId: id }),
  selectStage: (id) => set({ selectedStageId: id }),
  selectFile: (path) => set({ selectedFilePath: path }),

  addError: (error) => {
    const { run } = get();
    if (!run) return;
    set({ run: { ...run, errors: [...run.errors, error] } });
  },

  reset: () =>
    set({
      run: null,
      selectedArtifactId: null,
      selectedStageId: null,
      selectedFilePath: null,
    }),
}));

export function createArtifact(
  stage: string,
  created_by: string,
  content: Record<string, unknown>,
  inputs: string[] = [],
  status: Artifact['status'] = 'draft',
  confidence = 0.7
): Artifact {
  return {
    artifact_id: uuidv4(),
    stage,
    version: '1.0.0',
    created_by,
    timestamp: new Date().toISOString(),
    inputs,
    status,
    content,
    assumptions: [],
    unknowns: [],
    verification: [],
    confidence,
  };
}

export { STAGES };
