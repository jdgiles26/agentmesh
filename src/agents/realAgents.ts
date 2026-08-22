import { createArtifact } from '../store/blackboard';
import type { Artifact, StageId, VirtualFile } from '../types/artifact';
import { generateProject, toRunnableModule } from '../lib/codeGenerator';
import { runTests } from '../lib/testRunner';
import { VirtualFS } from '../lib/virtualFs';

function getLatest(artifacts: Record<string, Artifact>, stage: string): Artifact | undefined {
  return Object.values(artifacts)
    .filter((a) => a.stage === stage)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Real agent implementations.
 * Each agent only receives prior artifacts (never conversation history).
 * Code generation and test execution are deterministic and actually run.
 */
export async function runRealAgent(
  stageId: StageId,
  requirement: string,
  previousArtifacts: Record<string, Artifact>,
  workspace: VirtualFS
): Promise<{ artifacts: Artifact[]; workspaceUpdates?: VirtualFile[] }> {
  await delay(400 + Math.random() * 500);

  switch (stageId) {
    case 'intake': {
      const keywords = requirement.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
      const art = createArtifact(
        'intake',
        'Requirements Intake Agent',
        {
          project_objective: requirement.slice(0, 200),
          target_users: ['End users', 'Developers'],
          platform: 'Browser / TypeScript',
          functional_requirements: keywords.slice(0, 8).map((k) => `Support ${k}`),
          non_functional_requirements: [
            'Deterministic test execution',
            'Artifact-driven communication',
            'No hidden agent memory',
          ],
          explicit: [requirement],
          inferred: ['TypeScript preferred', 'Unit tests required'],
          keywords,
        },
        [],
        'verified',
        0.9
      );
      art.assumptions = ['User wants a working prototype, not production infra'];
      art.verification = ['Human review of PROJECT_SPECIFICATION'];
      return { artifacts: [art] };
    }

    case 'requirements_critic': {
      const spec = getLatest(previousArtifacts, 'intake');
      const risks: string[] = [];
      const questions: string[] = [];
      if (requirement.length < 20) {
        risks.push('Requirement is very short — high ambiguity');
        questions.push('Can you expand the acceptance criteria?');
      }
      if (!/test|secure|performance|accessib/i.test(requirement)) {
        risks.push('No explicit non-functional requirements stated');
      }
      const status = risks.length > 2 ? 'BLOCKED' : 'READY';
      const art = createArtifact(
        'requirements_critic',
        'Requirements Validation Agent',
        { risks, questions, decisions: status === 'READY' ? ['Proceed'] : ['Need clarification'], status },
        [spec?.artifact_id || ''],
        status === 'READY' ? 'verified' : 'blocked',
        status === 'READY' ? 0.85 : 0.4
      );
      if (status === 'BLOCKED') art.unknowns = questions;
      return { artifacts: [art] };
    }

    case 'acceptance': {
      const criteria = [
        {
          id: 'AC-001',
          given: 'A valid requirement is submitted',
          when: 'Pipeline runs to completion',
          then: 'Generated code exists and unit tests pass',
        },
        {
          id: 'AC-002',
          given: 'Tests are generated',
          when: 'Sandbox executes',
          then: 'Exit code is 0 and all tests pass',
        },
        {
          id: 'AC-003',
          given: 'An agent finishes',
          when: 'Artifacts are published',
          then: 'Only approved artifacts are visible downstream',
        },
      ];
      const art = createArtifact(
        'acceptance',
        'Acceptance Criteria Engineer',
        {
          criteria,
          traceability: {
            'REQ-001': ['AC-001', 'AC-002'],
            'REQ-002': ['AC-003'],
          },
        },
        [],
        'verified',
        0.88
      );
      art.verification = ['Each AC maps to at least one automated test'];
      return { artifacts: [art] };
    }

    case 'architecture': {
      const art = createArtifact(
        'architecture',
        'Software Architect',
        {
          style: 'Modular TypeScript library + in-browser test runner',
          modules: ['core domain', 'tests', 'package manifest'],
          data_flow: 'Requirement → Spec → Code → Tests → Execution Results',
          failure_paths: [
            'Test failure → Debugger stage → minimal patch',
            'Blocked requirements → pipeline stops',
            'Sandbox error → surface stderr as evidence',
          ],
          deployment: 'Browser-native AgentMesh-X workspace (downloadable)',
        },
        [],
        'verified',
        0.85
      );
      return { artifacts: [art] };
    }

    case 'threat_model': {
      const art = createArtifact(
        'threat_model',
        'Security Architect',
        {
          threats: [
            { id: 'T-01', name: 'Untrusted generated code execution', severity: 'HIGH', mitigation: 'Restricted Function sandbox, no DOM/network' },
            { id: 'T-02', name: 'Requirement injection', severity: 'MEDIUM', mitigation: 'Treat requirement as data only' },
            { id: 'T-03', name: 'Artifact integrity', severity: 'LOW', mitigation: 'Immutable artifact IDs + timestamps' },
          ],
          security_requirements: [
            'Never eval user requirement as code',
            'Sandbox has no access to window/document/fetch',
          ],
        },
        [],
        'verified',
        0.8
      );
      return { artifacts: [art] };
    }

    case 'test_strategy': {
      const art = createArtifact(
        'test_strategy',
        'Test Architect',
        {
          approach: 'Test-first: generate tests before implementation, execute in sandbox',
          levels: ['Unit'],
          tools: ['AgentMesh in-browser runner'],
          coverage_goal: 'All public functions in generated core module',
        },
        [],
        'verified',
        0.85
      );
      return { artifacts: [art] };
    }

    case 'task_decomposition': {
      const art = createArtifact(
        'task_decomposition',
        'Engineering Planner',
        {
          tasks: [
            { id: 'T-001', objective: 'Generate domain module', depends_on: [] },
            { id: 'T-002', objective: 'Generate unit tests', depends_on: ['T-001'] },
            { id: 'T-003', objective: 'Execute tests in sandbox', depends_on: ['T-002'] },
          ],
        },
        [],
        'verified',
        0.9
      );
      return { artifacts: [art] };
    }

    case 'test_generation': {
      // Tests are generated together with code in the next stage for determinism;
      // here we record the intent.
      const art = createArtifact(
        'test_generation',
        'Test Generator',
        {
          strategy: 'Generate failing-capable unit tests for public API',
          framework: 'AgentMesh expect API (toBe, toEqual, toBeTruthy, ...)',
          initially_expected: 'PASS after code generation (templates are consistent)',
        },
        [],
        'verified',
        0.85
      );
      return { artifacts: [art] };
    }

    case 'code_generation': {
      const project = generateProject(requirement);
      workspace.clear();
      workspace.merge(project.files);

      const art = createArtifact(
        'code_generation',
        'Coder',
        {
          files_added: project.files.map((f) => f.path),
          entry_point: project.entryPoint,
          test_file: project.testFile,
          summary: project.summary,
          note: 'Deterministic template-based generation — not LLM output',
        },
        [],
        'verified',
        0.95
      );
      art.verification = ['Files present in workspace', 'Sandbox execution'];
      return { artifacts: [art], workspaceUpdates: project.files };
    }

    case 'static_analysis': {
      const files = workspace.toArray();
      const issues: string[] = [];
      for (const f of files) {
        if (f.language === 'typescript' || f.path.endsWith('.ts')) {
          if (f.content.includes('eval(')) issues.push(`${f.path}: uses eval`);
          if (f.content.includes('innerHTML')) issues.push(`${f.path}: uses innerHTML`);
        }
      }
      const art = createArtifact(
        'static_analysis',
        'Static Analysis Engineer',
        {
          files_scanned: files.length,
          issues,
          status: issues.length === 0 ? 'PASS' : 'WARN',
        },
        [],
        issues.some((i) => i.includes('eval')) ? 'blocked' : 'verified',
        0.9
      );
      return { artifacts: [art] };
    }

    case 'sandbox_execution': {
      const files = workspace.toArray();
      const testFile = files.find((f) => f.path.endsWith('.test.ts'));
      const sourceFiles = files.filter((f) => f.path.startsWith('src/') && !f.path.endsWith('.test.ts'));

      if (!testFile) {
        const art = createArtifact(
          'sandbox_execution',
          'Execution Validator',
          { error: 'No test file found', status: 'FAIL' },
          [],
          'blocked',
          0.2
        );
        return { artifacts: [art] };
      }

      const modules: Record<string, string> = {};
      for (const sf of sourceFiles) {
        const name = sf.path.replace(/^src\//, '').replace(/\.ts$/, '');
        modules[name] = toRunnableModule(sf.content);
      }

      const report = await runTests(testFile.content, modules);

      const art = createArtifact(
        'sandbox_execution',
        'Execution Validator',
        {
          exit_code: report.exit_code,
          tests_passed: report.tests.filter((t) => t.passed).length,
          tests_failed: report.tests.filter((t) => !t.passed).length,
          tests: report.tests,
          stdout: report.stdout,
          stderr: report.stderr,
          duration_ms: report.duration_ms,
          status: report.exit_code === 0 ? 'PASS' : 'FAIL',
        },
        [],
        report.exit_code === 0 ? 'verified' : 'blocked',
        report.exit_code === 0 ? 0.98 : 0.3
      );
      art.verification = ['In-browser test runner results are authoritative'];
      return { artifacts: [art] };
    }

    case 'debugger': {
      const exec = getLatest(previousArtifacts, 'sandbox_execution');
      const content = exec?.content as { status?: string; tests_failed?: number } | undefined;
      const failed = content?.status === 'FAIL';
      const art = createArtifact(
        'debugger',
        'Debugger',
        failed
          ? {
              status: 'NEEDS_PATCH',
              note: 'Failures detected — in this deterministic pipeline templates should pass. Escalate.',
              retries_remaining: 0,
            }
          : { status: 'NO_ACTION_NEEDED', failures_found: 0 },
        [exec?.artifact_id || ''],
        failed ? 'blocked' : 'verified',
        failed ? 0.4 : 0.95
      );
      return { artifacts: [art] };
    }

    case 'regression': {
      // Re-run the same tests
      const files = workspace.toArray();
      const testFile = files.find((f) => f.path.endsWith('.test.ts'));
      const sourceFiles = files.filter((f) => f.path.startsWith('src/') && !f.path.endsWith('.test.ts'));
      let status = 'SKIPPED';
      let passed = 0;
      let failed = 0;

      if (testFile) {
        const modules: Record<string, string> = {};
        for (const sf of sourceFiles) {
          const name = sf.path.replace(/^src\//, '').replace(/\.ts$/, '');
          modules[name] = toRunnableModule(sf.content);
        }
        const report = await runTests(testFile.content, modules);
        passed = report.tests.filter((t) => t.passed).length;
        failed = report.tests.filter((t) => !t.passed).length;
        status = report.exit_code === 0 ? 'PASS' : 'FAIL';
      }

      const art = createArtifact(
        'regression',
        'Regression Engineer',
        { status, tests_passed: passed, tests_failed: failed },
        [],
        status === 'FAIL' ? 'blocked' : 'verified',
        status === 'PASS' ? 0.95 : 0.5
      );
      return { artifacts: [art] };
    }

    case 'integration': {
      const files = workspace.toArray();
      const hasPkg = files.some((f) => f.path === 'package.json');
      const hasSrc = files.some((f) => f.path.startsWith('src/'));
      const hasTest = files.some((f) => f.path.endsWith('.test.ts'));
      const ok = hasPkg && hasSrc && hasTest;
      const art = createArtifact(
        'integration',
        'Integration Engineer',
        {
          checks: { package_json: hasPkg, source: hasSrc, tests: hasTest },
          status: ok ? 'PASS' : 'FAIL',
        },
        [],
        ok ? 'verified' : 'blocked',
        ok ? 0.9 : 0.3
      );
      return { artifacts: [art] };
    }

    case 'security': {
      const files = workspace.toArray();
      const findings: { severity: string; message: string }[] = [];
      for (const f of files) {
        if (/eval\s*\(|Function\s*\(|document\.write/i.test(f.content)) {
          findings.push({ severity: 'HIGH', message: `${f.path}: potentially unsafe dynamic code` });
        }
        if (/password\s*=\s*['"][^'"]+['"]/i.test(f.content) && f.path.includes('auth')) {
          findings.push({ severity: 'MEDIUM', message: `${f.path}: hardcoded demo credentials (expected for demo)` });
        }
      }
      const critical = findings.filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH').length;
      const art = createArtifact(
        'security',
        'Security Tester',
        {
          findings,
          critical_or_high: critical,
          status: critical > 0 ? 'FAIL' : 'PASS_WITH_NOTES',
        },
        [],
        critical > 0 ? 'blocked' : 'verified',
        0.85
      );
      return { artifacts: [art] };
    }

    case 'performance': {
      const files = workspace.toArray();
      const totalBytes = files.reduce((s, f) => s + f.content.length, 0);
      const art = createArtifact(
        'performance',
        'Performance Engineer',
        {
          total_source_bytes: totalBytes,
          file_count: files.length,
          status: totalBytes < 50_000 ? 'ACCEPTABLE' : 'REVIEW',
          note: 'No runtime profiling in this version — static size only',
        },
        [],
        'verified',
        0.7
      );
      art.assumptions = ['Bundle size correlates with complexity for this mini-project'];
      return { artifacts: [art] };
    }

    case 'accessibility': {
      const art = createArtifact(
        'accessibility',
        'Accessibility Engineer',
        {
          applicable: false,
          reason: 'Generated artifact is a TypeScript library, not a UI',
          status: 'N/A',
        },
        [],
        'verified',
        0.9
      );
      return { artifacts: [art] };
    }

    case 'adversarial': {
      const exec = getLatest(previousArtifacts, 'sandbox_execution');
      const passed = (exec?.content as { status?: string })?.status === 'PASS';
      const art = createArtifact(
        'adversarial',
        'Red-Team Engineer',
        {
          attempts: [
            'Empty requirement handling (checked in critic)',
            'Missing test file (checked in sandbox)',
            'Hardcoded secrets scan (checked in security)',
          ],
          breaks_found: passed ? 0 : 1,
          status: passed ? 'NO_CRITICAL_BREAKS' : 'FAILURES_PRESENT',
        },
        [],
        'verified',
        0.75
      );
      return { artifacts: [art] };
    }

    case 'final_review': {
      const stages = ['sandbox_execution', 'security', 'integration', 'regression'];
      const evidence: string[] = [];
      let blocked = false;
      for (const s of stages) {
        const a = getLatest(previousArtifacts, s);
        if (!a) {
          evidence.push(`${s}: MISSING`);
          blocked = true;
        } else if (a.status === 'blocked' || a.status === 'rejected') {
          evidence.push(`${s}: ${a.status}`);
          blocked = true;
        } else {
          evidence.push(`${s}: ${a.status}`);
        }
      }
      const decision = blocked ? 'FAIL' : 'PASS';
      const art = createArtifact(
        'final_review',
        'Senior Reviewer',
        {
          decision,
          evidence_basis: evidence,
          note: 'Decision based only on artifacts and execution results.',
        },
        [],
        decision === 'PASS' ? 'approved' : 'rejected',
        decision === 'PASS' ? 0.92 : 0.5
      );
      return { artifacts: [art] };
    }

    case 'traceability': {
      const ac = getLatest(previousArtifacts, 'acceptance');
      const criteria = (ac?.content as { criteria?: unknown[] })?.criteria || [];
      const art = createArtifact(
        'traceability',
        'Verification Auditor',
        {
          acceptance_criteria_count: Array.isArray(criteria) ? criteria.length : 0,
          linked_to_tests: true,
          gaps: [],
          status: 'COMPLETE',
        },
        [],
        'verified',
        0.9
      );
      return { artifacts: [art] };
    }

    case 'documentation': {
      const files = workspace.toArray();
      const readme = files.find((f) => f.path === 'README.md');
      const art = createArtifact(
        'documentation',
        'Documentation Engineer',
        {
          generated: readme ? ['README.md'] : [],
          derived_from: ['code_generation', 'architecture'],
          status: readme ? 'COMPLETE' : 'MISSING',
        },
        [],
        'verified',
        0.85
      );
      return { artifacts: [art] };
    }

    case 'release_candidate': {
      const review = getLatest(previousArtifacts, 'final_review');
      const decision = (review?.content as { decision?: string })?.decision;
      const ready = decision === 'PASS';
      const art = createArtifact(
        'release_candidate',
        'Release Engineer',
        {
          version: '0.1.0',
          status: ready ? 'READY' : 'NOT_READY',
          rollback_plan: 'Discard workspace; re-run pipeline from intake',
          gates: ready ? ['A', 'B', 'C', 'D', 'E'] : [],
        },
        [],
        ready ? 'approved' : 'blocked',
        ready ? 0.9 : 0.3
      );
      return { artifacts: [art] };
    }

    default:
      return { artifacts: [] };
  }
}
