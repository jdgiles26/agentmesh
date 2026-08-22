/**
 * Stage handlers — deterministic tools preferred; LLM when needed.
 * Guardrails on generated code; telemetry on tool boundaries.
 */

import type { Artifact, StageId, VirtualFile } from '../types/artifact';
import { createArtifact } from '../store/blackboard';
import { runIndependentAgent } from './agentRuntime';
import { VirtualFS } from '../lib/virtualFs';
import { runTests, toRunnableModule } from '../lib/testRunner';
import { scanGeneratedCode } from '../lib/guardrails';
import { logTelemetry } from '../lib/telemetry';

export interface StageResult {
  artifacts: Artifact[];
  workspaceFiles?: VirtualFile[];
  tokensInEst?: number;
  tokensOutEst?: number;
}

function filesFromParsed(
  parsed: Record<string, unknown>,
  key: 'source_files' | 'test_files' | 'patches'
): VirtualFile[] {
  const arr = parsed[key];
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(
      (f): f is { path: string; content: string } =>
        !!f &&
        typeof f === 'object' &&
        typeof (f as { path: unknown }).path === 'string' &&
        typeof (f as { content: unknown }).content === 'string'
    )
    .map((f) => ({
      path:
        f.path.startsWith('src/') || f.path.endsWith('.md') || f.path === 'package.json'
          ? f.path
          : `src/${f.path}`,
      content: f.content,
      language: f.path.endsWith('.md')
        ? 'markdown'
        : f.path.endsWith('.json')
          ? 'json'
          : 'typescript',
    }));
}

async function llmStage(
  stageId: StageId,
  requirement: string,
  artifacts: Record<string, Artifact>,
  runId: string,
  extraContext?: string
): Promise<{ artifact: Artifact; tokensInEst: number; tokensOutEst: number }> {
  const out = await runIndependentAgent({
    stageId,
    requirement,
    artifacts,
    extraContext,
    runId,
  });
  return { artifact: out.artifact, tokensInEst: out.tokensInEst, tokensOutEst: out.tokensOutEst };
}

function runWorkspaceTests(workspace: VirtualFS) {
  const testFiles = workspace.getTestFiles();
  const sourceMods = workspace.getSourceModules();
  const runnable: Record<string, string> = {};
  for (const [name, code] of Object.entries(sourceMods)) {
    runnable[name] = toRunnableModule(code);
  }
  return { testFiles, runnable };
}

export async function executeStage(
  stageId: StageId,
  requirement: string,
  artifacts: Record<string, Artifact>,
  workspace: VirtualFS,
  runId = 'unknown'
): Promise<StageResult> {
  switch (stageId) {
    case 'test_generation': {
      const { artifact, tokensInEst, tokensOutEst } = await llmStage(
        stageId,
        requirement,
        artifacts,
        runId
      );
      const tests = filesFromParsed(artifact.content, 'test_files');
      if (tests.length) workspace.merge(tests);
      return { artifacts: [artifact], workspaceFiles: workspace.toArray(), tokensInEst, tokensOutEst };
    }

    case 'code_generation': {
      const testCtx = workspace
        .getTestFiles()
        .map((f) => `--- ${f.path} ---\n${f.content}`)
        .join('\n\n');
      const { artifact, tokensInEst, tokensOutEst } = await llmStage(
        stageId,
        requirement,
        artifacts,
        runId,
        testCtx ? `Tests that must pass:\n${testCtx}` : undefined
      );
      const sources = filesFromParsed(artifact.content, 'source_files');

      // Guardrail: scan generated source
      for (const f of sources) {
        const scan = scanGeneratedCode(f.content);
        if (!scan.ok) {
          logTelemetry({
            run_id: runId,
            stage_id: stageId,
            level: 'warn',
            event: 'code_guardrail_hit',
            detail: { file: f.path, findings: scan.findings },
          });
          // Strip clearly dangerous files from merge
          if (scan.findings.some((x) => /eval|innerHTML|PRIVATE KEY/i.test(x))) {
            continue;
          }
        }
        workspace.write(f.path, f.content, f.language);
      }

      if (!workspace.exists('package.json')) {
        workspace.write(
          'package.json',
          JSON.stringify(
            { name: 'agentmesh-generated', version: '0.1.0', private: true, type: 'module' },
            null,
            2
          ),
          'json'
        );
      }
      return { artifacts: [artifact], workspaceFiles: workspace.toArray(), tokensInEst, tokensOutEst };
    }

    case 'static_analysis': {
      const files = workspace.toArray();
      const issues: { file: string; severity: string; message: string }[] = [];
      for (const f of files) {
        const scan = scanGeneratedCode(f.content);
        for (const msg of scan.findings) {
          issues.push({
            file: f.path,
            severity: /eval|innerHTML|PRIVATE KEY|secret/i.test(msg) ? 'error' : 'warning',
            message: msg,
          });
        }
      }
      const hasError = issues.some((i) => i.severity === 'error');
      const art = createArtifact(
        'static_analysis',
        'Static Analysis Engineer',
        {
          files_scanned: files.length,
          issues,
          status: hasError ? 'FAIL' : issues.length ? 'PASS_WITH_WARNINGS' : 'PASS',
        },
        [],
        hasError ? 'blocked' : 'verified',
        0.95
      );
      art.verification = ['Deterministic static scan + guardrails'];
      logTelemetry({
        run_id: runId,
        stage_id: stageId,
        level: hasError ? 'error' : 'info',
        event: 'static_analysis',
        status: art.status,
        detail: { issue_count: issues.length },
      });
      return { artifacts: [art] };
    }

    case 'sandbox_execution': {
      const { testFiles, runnable } = runWorkspaceTests(workspace);

      if (testFiles.length === 0) {
        const art = createArtifact(
          'sandbox_execution',
          'Execution Validator',
          { error: 'No test files in workspace', status: 'FAIL', tests: [] },
          [],
          'blocked',
          0.2
        );
        art.verification = ['Deterministic sandbox'];
        return { artifacts: [art] };
      }

      const allTests: Array<Record<string, unknown>> = [];
      let exitCode = 0;
      const stdout: string[] = [];
      const stderr: string[] = [];
      let duration = 0;

      for (const tf of testFiles) {
        const report = await runTests(tf.content, runnable);
        allTests.push(...report.tests.map((t) => ({ ...t, file: tf.path })));
        stdout.push(...report.stdout);
        stderr.push(...report.stderr);
        duration += report.duration_ms;
        if (report.exit_code !== 0) exitCode = 1;
      }

      const passed = allTests.filter((t) => t.passed).length;
      const failed = allTests.filter((t) => !t.passed).length;

      const art = createArtifact(
        'sandbox_execution',
        'Execution Validator',
        {
          exit_code: exitCode,
          tests_passed: passed,
          tests_failed: failed,
          tests: allTests,
          stdout,
          stderr,
          duration_ms: duration,
          status: exitCode === 0 ? 'PASS' : 'FAIL',
        },
        [],
        exitCode === 0 ? 'verified' : 'blocked',
        exitCode === 0 ? 0.98 : 0.25
      );
      art.verification = ['Deterministic in-browser sandbox'];
      logTelemetry({
        run_id: runId,
        stage_id: stageId,
        level: exitCode === 0 ? 'info' : 'error',
        event: 'sandbox_execution',
        duration_ms: duration,
        status: exitCode === 0 ? 'PASS' : 'FAIL',
        detail: { passed, failed },
      });
      return { artifacts: [art] };
    }

    case 'debugger': {
      const exec = Object.values(artifacts)
        .filter((a) => a.stage === 'sandbox_execution')
        .pop();
      const failed = exec && (exec.content as { status?: string }).status === 'FAIL';

      if (!failed) {
        const art = createArtifact(
          'debugger',
          'Debugger',
          { status: 'NO_ACTION_NEEDED', failures_found: 0 },
          [],
          'verified',
          0.95
        );
        return { artifacts: [art] };
      }

      const failTests = (
        (exec?.content as { tests?: Array<{ passed: boolean; name: string; error?: string }> })?.tests || []
      )
        .filter((t) => !t.passed)
        .slice(0, 8);

      const sourceCtx = workspace
        .toArray()
        .filter((f) => f.path.endsWith('.ts') || f.path.endsWith('.js'))
        .map((f) => `--- ${f.path} ---\n${f.content.slice(0, 2500)}`)
        .join('\n\n');

      const { artifact, tokensInEst, tokensOutEst } = await llmStage(
        stageId,
        requirement,
        artifacts,
        runId,
        `Failures:\n${JSON.stringify(failTests)}\n\nSource:\n${sourceCtx}`
      );

      const patches = filesFromParsed(artifact.content, 'patches');
      for (const p of patches) {
        const scan = scanGeneratedCode(p.content);
        if (scan.ok || !scan.findings.some((x) => /eval|PRIVATE KEY/i.test(x))) {
          workspace.write(p.path, p.content, p.language);
        }
      }
      return {
        artifacts: [artifact],
        workspaceFiles: workspace.toArray(),
        tokensInEst,
        tokensOutEst,
      };
    }

    case 'regression': {
      const { testFiles, runnable } = runWorkspaceTests(workspace);
      let exitCode = 0;
      const allTests = [];
      for (const tf of testFiles) {
        const report = await runTests(tf.content, runnable);
        allTests.push(...report.tests);
        if (report.exit_code !== 0) exitCode = 1;
      }

      const art = createArtifact(
        'regression',
        'Regression Engineer',
        {
          tests_passed: allTests.filter((t) => t.passed).length,
          tests_failed: allTests.filter((t) => !t.passed).length,
          tests: allTests,
          status: exitCode === 0 ? 'PASS' : 'FAIL',
        },
        [],
        exitCode === 0 ? 'verified' : 'blocked',
        exitCode === 0 ? 0.95 : 0.3
      );
      art.verification = ['Deterministic regression suite'];
      return { artifacts: [art] };
    }

    case 'integration': {
      const files = workspace.toArray();
      const checks = {
        package_json: files.some((f) => f.path === 'package.json'),
        source: files.some((f) => f.path.startsWith('src/') && !f.path.includes('.test.')),
        tests: files.some((f) => f.path.includes('.test.')),
      };
      const ok = checks.package_json && checks.source && checks.tests;
      const art = createArtifact(
        'integration',
        'Integration Engineer',
        { checks, status: ok ? 'PASS' : 'FAIL' },
        [],
        ok ? 'verified' : 'blocked',
        0.9
      );
      art.verification = ['Deterministic workspace structure'];
      return { artifacts: [art] };
    }

    case 'performance': {
      const files = workspace.toArray();
      const bytes = files.reduce((s, f) => s + f.content.length, 0);
      const art = createArtifact(
        'performance',
        'Performance Engineer',
        {
          total_source_bytes: bytes,
          file_count: files.length,
          status: bytes < 80_000 ? 'ACCEPTABLE' : 'REVIEW',
        },
        [],
        'verified',
        0.85
      );
      art.verification = ['Deterministic size metrics'];
      return { artifacts: [art] };
    }

    case 'accessibility': {
      const hasUi = workspace
        .toArray()
        .some((f) => /\.html$|\.tsx$|\.jsx$/.test(f.path) || /react|dom/i.test(f.content));
      const art = createArtifact(
        'accessibility',
        'Accessibility Engineer',
        { applicable: hasUi, issues: [], status: hasUi ? 'PASS' : 'N/A' },
        [],
        'verified',
        0.9
      );
      return { artifacts: [art] };
    }

    case 'documentation': {
      const { artifact, tokensInEst, tokensOutEst } = await llmStage(
        stageId,
        requirement,
        artifacts,
        runId,
        `Files:\n${workspace
          .toArray()
          .map((f) => f.path)
          .join('\n')}`
      );
      const readme = typeof artifact.content.readme === 'string' ? artifact.content.readme : null;
      if (readme) workspace.write('README.md', readme, 'markdown');
      return {
        artifacts: [artifact],
        workspaceFiles: workspace.toArray(),
        tokensInEst,
        tokensOutEst,
      };
    }

    default: {
      const needsSource = ['security', 'adversarial', 'final_review'].includes(stageId);
      const extra = needsSource
        ? `Source:\n${workspace
            .toArray()
            .filter((f) => !f.path.endsWith('.md'))
            .map((f) => `--- ${f.path} ---\n${f.content.slice(0, 1500)}`)
            .join('\n\n')}`
        : undefined;
      const { artifact, tokensInEst, tokensOutEst } = await llmStage(
        stageId,
        requirement,
        artifacts,
        runId,
        extra
      );
      return { artifacts: [artifact], tokensInEst, tokensOutEst };
    }
  }
}
