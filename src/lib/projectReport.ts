import type { Artifact, PipelineRun } from '../types/artifact';

export interface ProjectReport {
  project_status: 'PASS' | 'FAIL' | 'BLOCKED' | 'RUNNING' | 'IDLE';
  requirements: { satisfied: string; note: string };
  tests: { passed: number; failed: number; skipped: number };
  security: { critical: number; high: number; medium: number; low: number };
  static_analysis: string;
  performance: string;
  accessibility: string;
  known_limitations: string[];
  unresolved_risks: string[];
  changes: string[];
  rollback: string;
  artifact_count: number;
  workspace_files: string[];
  final_recommendation: string;
}

function latest(artifacts: Record<string, Artifact>, stage: string): Artifact | undefined {
  return Object.values(artifacts)
    .filter((a) => a.stage === stage)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
}

export function buildProjectReport(run: PipelineRun | null): ProjectReport {
  if (!run) {
    return {
      project_status: 'IDLE',
      requirements: { satisfied: 'NOT VERIFIED', note: 'No run' },
      tests: { passed: 0, failed: 0, skipped: 0 },
      security: { critical: 0, high: 0, medium: 0, low: 0 },
      static_analysis: 'NOT VERIFIED',
      performance: 'NOT VERIFIED',
      accessibility: 'NOT VERIFIED',
      known_limitations: [],
      unresolved_risks: [],
      changes: [],
      rollback: 'N/A',
      artifact_count: 0,
      workspace_files: [],
      final_recommendation: 'Start a pipeline after loading a local model.',
    };
  }

  const sandbox = latest(run.artifacts, 'sandbox_execution');
  const security = latest(run.artifacts, 'security');
  const staticA = latest(run.artifacts, 'static_analysis');
  const perf = latest(run.artifacts, 'performance');
  const a11y = latest(run.artifacts, 'accessibility');
  const review = latest(run.artifacts, 'final_review');
  const release = latest(run.artifacts, 'release_candidate');
  const critic = latest(run.artifacts, 'requirements_critic');

  const testsPassed = Number((sandbox?.content as { tests_passed?: number })?.tests_passed ?? 0);
  const testsFailed = Number((sandbox?.content as { tests_failed?: number })?.tests_failed ?? 0);

  const findings = ((security?.content as { findings?: Array<{ severity?: string }> })?.findings || []) as Array<{
    severity?: string;
  }>;
  const sev = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) {
    const s = (f.severity || '').toUpperCase();
    if (s === 'CRITICAL') sev.critical++;
    else if (s === 'HIGH') sev.high++;
    else if (s === 'MEDIUM') sev.medium++;
    else sev.low++;
  }

  let project_status: ProjectReport['project_status'] = 'RUNNING';
  if (run.status === 'completed') {
    const decision = String((review?.content as { decision?: string })?.decision || '').toUpperCase();
    const rel = String((release?.content as { status?: string })?.status || '').toUpperCase();
    if (decision === 'PASS' && rel === 'READY' && testsFailed === 0) project_status = 'PASS';
    else if (decision === 'BLOCKED' || run.status === 'blocked') project_status = 'BLOCKED';
    else project_status = 'FAIL';
  } else if (run.status === 'blocked') project_status = 'BLOCKED';
  else if (run.status === 'failed') project_status = 'FAIL';
  else if (run.status === 'idle') project_status = 'IDLE';

  const gaps = ((latest(run.artifacts, 'traceability')?.content as { gaps?: string[] })?.gaps || []) as string[];
  const risks = ((critic?.content as { risks?: string[] })?.risks || []) as string[];

  const rollback =
    String((release?.content as { rollback_plan?: string })?.rollback_plan || '') ||
    'Discard workspace and re-run pipeline from intake.';

  const changes = run.workspace.map((f) => f.path);

  let final_recommendation = 'Pipeline in progress.';
  if (project_status === 'PASS') {
    final_recommendation = 'Release candidate is READY based on tests, review, and gates.';
  } else if (project_status === 'BLOCKED') {
    final_recommendation = 'Blocked: resolve failing tests, security findings, or missing requirements.';
  } else if (project_status === 'FAIL') {
    final_recommendation = 'Failed verification. Inspect sandbox and final review artifacts.';
  }

  return {
    project_status,
    requirements: {
      satisfied: critic
        ? String((critic.content as { status?: string }).status || 'UNKNOWN')
        : 'NOT VERIFIED',
      note: risks[0] || 'See requirements_critic artifact',
    },
    tests: {
      passed: testsPassed,
      failed: testsFailed,
      skipped: 0,
    },
    security: sev,
    static_analysis: String((staticA?.content as { status?: string })?.status || 'NOT VERIFIED'),
    performance: String((perf?.content as { status?: string })?.status || 'NOT VERIFIED'),
    accessibility: String((a11y?.content as { status?: string })?.status || 'NOT VERIFIED'),
    known_limitations: gaps,
    unresolved_risks: risks,
    changes,
    rollback,
    artifact_count: Object.keys(run.artifacts).length,
    workspace_files: changes,
    final_recommendation,
  };
}
