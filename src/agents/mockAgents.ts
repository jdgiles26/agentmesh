import { createArtifact } from '../store/blackboard';
import type { Artifact, StageId } from '../types/artifact';

/**
 * Mock agent implementations.
 * These produce structured artifacts that follow the AgentMesh-X contract.
 * In production these would be replaced by isolated model invocations
 * (preferably local via WebGPU + Transformers.js).
 */

export async function runAgent(
  stageId: StageId,
  requirement: string,
  previousArtifacts: Record<string, Artifact>
): Promise<Artifact[]> {
  // Simulate network / inference latency
  await new Promise((r) => setTimeout(r, 600 + Math.random() * 900));

  switch (stageId) {
    case 'intake':
      return [createArtifact('intake', 'Requirements Intake Agent', {
        project_objective: `Build a system based on: ${requirement.slice(0, 120)}...`,
        target_users: ['Software engineers', 'AI researchers', 'Platform teams'],
        platform: 'Browser-native (WebGPU preferred)',
        functional_requirements: [
          'Accept natural-language requirements',
          'Execute multi-stage agent pipeline',
          'Maintain artifact blackboard',
          'Enforce quality gates',
        ],
        non_functional_requirements: [
          'Prefer local inference',
          'Independent agent isolation',
          'Evidence-based verification',
        ],
        constraints: ['No hidden chain-of-thought between agents', 'Bounded retries'],
        explicit_vs_inferred: {
          explicit: [requirement],
          inferred: ['Browser-first deployment', 'Artifact-driven communication'],
        },
      }, [], 'verified', 0.85)];

    case 'requirements_critic':
      return [
        createArtifact('requirements_critic', 'Requirements Validation Agent', {
          risks: ['Ambiguity in non-functional performance targets', 'Unclear deployment model'],
          questions: ['What is the maximum acceptable inference latency?', 'Is remote fallback allowed?'],
          decisions: ['Mark as READY with documented assumptions'],
          status: 'READY',
        }, ['PROJECT_SPECIFICATION'], 'verified', 0.78),
      ];

    case 'acceptance':
      return [
        createArtifact('acceptance', 'Acceptance Criteria Engineer', {
          criteria: [
            {
              id: 'AC-001',
              given: 'A valid natural-language requirement is submitted',
              when: 'The intake stage completes',
              then: 'A PROJECT_SPECIFICATION artifact is produced with explicit/inferred separation',
            },
            {
              id: 'AC-002',
              given: 'An agent completes a stage',
              when: 'Artifacts are written',
              then: 'Only approved artifacts are visible to subsequent agents',
            },
          ],
          traceability: {
            'REQ-001': ['AC-001'],
            'REQ-002': ['AC-002'],
          },
        }, ['PROJECT_SPECIFICATION'], 'verified', 0.82),
      ];

    case 'architecture':
      return [
        createArtifact('architecture', 'Software Architect', {
          summary: 'Browser-first SPA with Zustand blackboard, stage runner, and pluggable agent backends',
          modules: ['UI Shell', 'Blackboard Store', 'Orchestrator', 'Agent Adapters', 'Artifact Viewer'],
          data_flow: 'User → Intake → ... → Blackboard ← Agents (isolated)',
          failure_paths: [
            'Model unavailable → graceful degradation + human notification',
            'WebGPU unsupported → CPU fallback or remote (if authorized)',
            'Stage blocked → stop pipeline, surface unknowns',
          ],
          components: ['PipelineVisualizer', 'BlackboardPanel', 'ArtifactInspector', 'GateStatus'],
        }, ['ACCEPTANCE_CRITERIA'], 'verified', 0.8),
      ];

    case 'threat_model':
      return [
        createArtifact('threat_model', 'Security Architect', {
          threats: [
            { id: 'T-01', name: 'Prompt injection via requirement text', severity: 'HIGH' },
            { id: 'T-02', name: 'Local model weight poisoning', severity: 'MEDIUM' },
            { id: 'T-03', name: 'Artifact tampering in IndexedDB', severity: 'MEDIUM' },
            { id: 'T-04', name: 'Sandbox escape of generated code', severity: 'CRITICAL' },
          ],
          mitigations: [
            'Strict input sanitization',
            'Content Security Policy',
            'Isolated execution sandbox',
            'Artifact integrity checks',
          ],
        }, ['ARCHITECTURE'], 'verified', 0.75),
      ];

    case 'test_strategy':
      return [
        createArtifact('test_strategy', 'Test Architect', {
          levels: ['Unit', 'Integration', 'Contract', 'E2E', 'Security', 'Performance', 'Accessibility'],
          focus: 'Test-first for every task; security tests derived from threat model',
          matrix_summary: 'Coverage of all acceptance criteria + failure modes',
        }, ['ACCEPTANCE_CRITERIA', 'THREAT_MODEL'], 'verified', 0.8),
      ];

    case 'task_decomposition':
      return [
        createArtifact('task_decomposition', 'Engineering Planner', {
          tasks: [
            { id: 'T-001', objective: 'Core types & artifact schema', depends_on: [] },
            { id: 'T-002', objective: 'Blackboard store', depends_on: ['T-001'] },
            { id: 'T-003', objective: 'Stage definitions & orchestrator', depends_on: ['T-001'] },
            { id: 'T-004', objective: 'Pipeline UI', depends_on: ['T-002', 'T-003'] },
            { id: 'T-005', objective: 'Mock agents', depends_on: ['T-003'] },
          ],
          dag_note: 'Independent tasks may run in parallel when dependencies allow',
        }, ['ARCHITECTURE'], 'verified', 0.85),
      ];

    case 'test_generation':
      return [
        createArtifact('test_generation', 'Test Generator', {
          tests_created: 12,
          initially_failing: true,
          note: 'Specification → Test → Implementation order enforced',
        }, ['TASK_GRAPH'], 'verified', 0.8),
      ];

    case 'code_generation':
      return [
        createArtifact('code_generation', 'Coder', {
          files_added: ['src/types/artifact.ts', 'src/store/blackboard.ts', 'src/orchestrator/runner.ts'],
          files_modified: [],
          note: 'One bounded task at a time; no speculative features',
        }, ['TASK_GRAPH', 'TEST_SUITE'], 'verified', 0.75),
      ];

    case 'static_analysis':
      return [
        createArtifact('static_analysis', 'Static Analysis Engineer', {
          tools: ['tsc', 'eslint'],
          errors: 0,
          warnings: 2,
          status: 'PASS',
        }, ['CODE_CHANGESET'], 'verified', 0.9),
      ];

    case 'sandbox_execution':
      return [
        createArtifact('sandbox_execution', 'Execution Validator', {
          exit_code: 0,
          tests_passed: 12,
          tests_failed: 0,
          resource_usage: { memory_mb: 48, duration_ms: 320 },
          status: 'PASS',
        }, ['CODE_CHANGESET', 'TEST_SUITE'], 'verified', 0.95),
      ];

    case 'debugger':
      return [
        createArtifact('debugger', 'Debugger', {
          failures_found: 0,
          patches_applied: 0,
          status: 'NO_ACTION_NEEDED',
        }, ['EXECUTION_RESULTS'], 'verified', 0.9),
      ];

    case 'regression':
      return [
        createArtifact('regression', 'Regression Engineer', {
          suites_rerun: ['unit', 'integration'],
          new_failures: 0,
          status: 'PASS',
        }, ['PATCH'], 'verified', 0.9),
      ];

    case 'integration':
      return [
        createArtifact('integration', 'Integration Engineer', {
          contracts_checked: true,
          build_status: 'PASS',
          status: 'PASS',
        }, ['CODE_CHANGESET'], 'verified', 0.85),
      ];

    case 'security':
      return [
        createArtifact('security', 'Security Tester', {
          findings: {
            critical: 0,
            high: 0,
            medium: 1,
            low: 2,
          },
          blocking: false,
          status: 'PASS_WITH_NOTES',
        }, ['THREAT_MODEL', 'CODE_CHANGESET'], 'verified', 0.8),
      ];

    case 'performance':
      return [
        createArtifact('performance', 'Performance Engineer', {
          metrics: {
            startup_ms: 180,
            first_paint_ms: 90,
            bundle_kb: 142,
          },
          status: 'ACCEPTABLE',
        }, ['CODE_CHANGESET'], 'verified', 0.75),
      ];

    case 'accessibility':
      return [
        createArtifact('accessibility', 'Accessibility Engineer', {
          wcag_level: 'AA',
          issues: 0,
          status: 'PASS',
        }, ['CODE_CHANGESET'], 'verified', 0.85),
      ];

    case 'adversarial':
      return [
        createArtifact('adversarial', 'Red-Team Engineer', {
          attempts: [
            'Malformed requirement injection',
            'Missing stage dependency',
            'Artifact schema violation',
          ],
          reproducible_failures: 0,
          status: 'NO_CRITICAL_BREAKS',
        }, ['CODE_CHANGESET'], 'verified', 0.7),
      ];

    case 'final_review':
      return [
        createArtifact('final_review', 'Senior Reviewer', {
          decision: 'PASS',
          evidence_basis: [
            'All acceptance criteria mapped',
            'Static analysis clean',
            'Sandbox execution passed',
            'No critical/high security findings',
          ],
          note: 'Decision based solely on artifacts and execution results, not prior agent opinions.',
        }, ['SECURITY_FINDINGS', 'ADVERSARIAL_FINDINGS'], 'approved', 0.88),
      ];

    case 'traceability':
      return [
        createArtifact('traceability', 'Verification Auditor', {
          coverage: '100%',
          gaps: [],
          status: 'COMPLETE',
        }, ['TRACEABILITY_MATRIX', 'FINAL_REVIEW'], 'verified', 0.9),
      ];

    case 'documentation':
      return [
        createArtifact('documentation', 'Documentation Engineer', {
          generated: ['README.md', 'ARCHITECTURE.md', 'SECURITY_NOTES.md'],
          note: 'Only content derived from verified artifacts',
        }, ['CODE_CHANGESET', 'ARCHITECTURE'], 'verified', 0.85),
      ];

    case 'release_candidate':
      return [
        createArtifact('release_candidate', 'Release Engineer', {
          version: '0.1.0',
          gates_passed: ['A', 'B', 'C', 'D', 'E'],
          rollback_plan: 'Revert to previous known-good commit; feature flag off',
          status: 'READY',
        }, ['TRACEABILITY_REPORT', 'DOCUMENTATION'], 'approved', 0.9),
      ];

    default:
      return [];
  }
}
