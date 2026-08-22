/**
 * Stage handlers — deterministic tools preferred; LLM only when needed.
 * Optimized: sandbox/regression/static skip extra LLM summarization for speed.
 */

import type { Artifact, StageId, VirtualFile } from '../types/artifact';
import { createArtifact } from '../store/blackboard';
import { runIndependentAgent } from './agentRuntime';
import { VirtualFS } from '../lib/virtualFs';
import { runTests, toRunnableModule } from '../lib/testRunner';

export interface StageResult {
  artifacts: Artifact[];
  workspaceFiles?: VirtualFile[];
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
  extraContext?: string
): Promise<Artifact> {
  const out = await runIndependentAgent({ stageId, requirement, artifacts, extraContext });
  return out.artifact;
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
  workspace: VirtualFS
): Promise<StageResult> {
  switch (stageId) {
    case 'test_generation': {
      const art = await llmStage(stageId, requirement, artifacts);
      const tests = filesFromParsed(art.content, 'test_files');
      if (tests.length) workspace.merge(tests);
      return { artifacts: [art], workspaceFiles: workspace.toArray() };
    }

    case 'code_generation': {
      const testCtx = workspace
        .getTestFiles()
        .map((f) => `--- ${f.path} ---\n${f.content}`)
        .join('\n\n');
      const art = await llmStage(
        stageId,
        requirement,
        artifacts,
        testCtx ? `Tests that must pass:\n${testCtx}` : undefined
      );
      const sources = filesFromParsed(art.content, 'source_files');
      if (sources.length) workspace.merge(sources);

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
      return { artifacts: [art], workspaceFiles: workspace.toArray() };
    }

    case 'static_analysis': {
      // Fully deterministic — no LLM round-trip
      const files = workspace.toArray();
      const issues: { file: string; severity: string; message: string }[] = [];
      for (const f of files) {
        if (/\beval\s*\(/.test(f.content))
          issues.push({ file: f.path, severity: 'error', message: 'uses eval()' });
        if (/new\s+Function\s*\(/.test(f.content) && !f.path.includes('test'))
          issues.push({ file: f.path, severity: 'warning', message: 'uses Function constructor' });
        if (/document\.write|innerHTML\s*=/.test(f.content))
          issues.push({ file: f.path, severity: 'error', message: 'unsafe DOM sink' });
        if (/api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i.test(f.content))
          issues.push({ file: f.path, severity: 'error', message: 'possible hardcoded secret' });
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
      art.verification = ['Deterministic static scan'];
      return { artifacts: [art] };
    }

    case 'sandbox_execution': {
      // Deterministic only — authoritative evidence, no LLM
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

      // Compact failing context only
      const failTests = ((exec?.content as { tests?: Array<{ passed: boolean; name: string; error?: string }> })
        ?.tests || [])
        .filter((t) => !t.passed)
        .slice(0, 8);

      const sourceCtx = workspace
        .toArray()
        .filter((f) => f.path.endsWith('.ts') || f.path.endsWith('.js'))
        .map((f) => `--- ${f.path} ---\n${f.content.slice(0, 2500)}`)
        .join('\n\n');

      const art = await llmStage(
        stageId,
        requirement,
        artifacts,
        `Failures:\n${JSON.stringify(failTests)}\n\nSource:\n${sourceCtx}`
      );

      const patches = filesFromParsed(art.content, 'patches');
      if (patches.length) workspace.merge(patches);
      return { artifacts: [art], workspaceFiles: workspace.toArray() };
    }

    case 'regression': {
      // Deterministic re-run only
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
      // Deterministic structure checks
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
        {
          applicable: hasUi,
          issues: [],
          status: hasUi ? 'PASS' : 'N/A',
        },
        [],
        'verified',
        0.9
      );
      return { artifacts: [art] };
    }

    case 'documentation': {
      const art = await llmStage(
        stageId,
        requirement,
        artifacts,
        `Files:\n${workspace
          .toArray()
          .map((f) => f.path)
          .join('\n')}`
      );
      const readme = typeof art.content.readme === 'string' ? art.content.readme : null;
      if (readme) workspace.write('README.md', readme, 'markdown');
      return { artifacts: [art], workspaceFiles: workspace.toArray() };
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
      const art = await llmStage(stageId, requirement, artifacts, extra);
      return { artifacts: [art] };
    }
  }
}
