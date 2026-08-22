export type ArtifactStatus = 'draft' | 'verified' | 'rejected' | 'blocked' | 'approved';

export type EpistemicLabel = 'VERIFIED' | 'UNVERIFIED' | 'ASSUMED' | 'INFERRED' | 'UNKNOWN';

export interface Artifact {
  artifact_id: string;
  stage: string;
  version: string;
  created_by: string;
  timestamp: string;
  inputs: string[];
  status: ArtifactStatus;
  content: Record<string, unknown>;
  assumptions: string[];
  unknowns: string[];
  verification: string[];
  confidence: number;
  epistemic?: Record<string, EpistemicLabel>;
}

export type StageId =
  | 'intake'
  | 'requirements_critic'
  | 'acceptance'
  | 'architecture'
  | 'threat_model'
  | 'test_strategy'
  | 'task_decomposition'
  | 'test_generation'
  | 'code_generation'
  | 'static_analysis'
  | 'sandbox_execution'
  | 'debugger'
  | 'regression'
  | 'integration'
  | 'security'
  | 'performance'
  | 'accessibility'
  | 'adversarial'
  | 'final_review'
  | 'traceability'
  | 'documentation'
  | 'release_candidate';

export interface StageDefinition {
  id: StageId;
  name: string;
  agent: string;
  description: string;
  requiredInputs: string[];
  produces: string[];
  gate?: string;
}

export type PipelineStatus = 'idle' | 'running' | 'paused' | 'blocked' | 'completed' | 'failed';

export interface PipelineRun {
  run_id: string;
  status: PipelineStatus;
  current_stage: StageId | null;
  started_at: string | null;
  completed_at: string | null;
  requirement: string;
  artifacts: Record<string, Artifact>;
  stage_history: { stage: StageId; status: string; duration_ms?: number; message?: string }[];
  errors: string[];
  workspace: VirtualFile[];
}

export interface VirtualFile {
  path: string;
  content: string;
  language: string;
}

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration_ms: number;
}

export interface ExecutionReport {
  exit_code: number;
  tests: TestResult[];
  stdout: string[];
  stderr: string[];
  duration_ms: number;
}
