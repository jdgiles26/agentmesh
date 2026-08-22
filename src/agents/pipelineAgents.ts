/**
 * Full autonomous stage handlers.
 * LLM agents produce artifacts; deterministic tools execute tests and scan code.
 */

import type { Artifact, StageId, VirtualFile } from '../types/artifact';
import { createArtifact } from '../store/blackboard';
import { runIndependentAgent } from './agentRuntime';
import { VirtualFS } from '../lib/virtualFs';
import { runTests, toRunnableModule } from '../lib/testRunner';
import { extractJSON } from '../lib/jsonExtract';

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
    .filter((f): f is { path: string; content: string } =>
      !!f && typeof f === 'object' && typeof (f as { path: unknown }).path === 'string' && typeof (f as { content: unknown }).content === 'string'
    )
    .map((f) => ({
      path: f.path.startsWith('src/') || f.path.endsWith('.md') || f.path === 'package.json' ? f.path : `src/${f.path}`,
      content: f.content,
      language: f.path.endsWith('.md') ? 'markdown' : f.path.endsWith('.json') ? 'json' : 'typescript',
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
      const testCtx = workspace.getTestFiles().map((f) => `--- ${f.path} ---\n${f.content}`).join('\n\n');
      const art = await llmStage(
        stageId,
        requirement,
        artifacts,
        testCtx ? `Existing test files that must pass:\n${testCtx}` : undefined
      );
      const sources = filesFromParsed(art.content, 'source_files');
      if (sources.length) workspace.merge(sources);

      // Ensure package.json exists
      if (!workspace.exists('package.json')) {
        workspace.write(
          'package.json',
          JSON.stringify({ name: 'agentmesh-generated', version: '0.1.0', private: true, type: 'module' }, null, 2),
          'json'
        );
      }
      return { artifacts: [art], workspaceFiles: workspace.toArray() };
    }

    case 'static_analysis': {
      // Deterministic scan + LLM summary
      const files = workspace.toArray();
      const issues: { file: string; severity: string; message: string }[] = [];
      for (const f of files) {
        if (/\beval\s*\(/.test(f.content)) issues.push({ file: f.path, severity: 'error', message: 'uses eval()' });
        if (/new\s+Function\s*\(/.test(f.content) && !f.path.includes('test')) {
          issues.push({ file: f.path, severity: 'warning', message: 'uses Function constructor' });
        }
        if (/document\.write|innerHTML\s*=/.test(f.content)) {
          issues.push({ file: f.path, severity: 'error', message: 'unsafe DOM sink' });
        }
        if (/api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i.test(f.content)) {
          issues.push({ file: f.path, severity: 'error', message: 'possible hardcoded API key' });
        }
      }

      const extra = `Deterministic scan results:\n${JSON.stringify(issues, null, 2)}\n\nFiles:\n${files.map((f) => f.path).join(', ')}`;
      const art = await llmStage(stageId, requirement, artifacts, extra);

      // Force block on deterministic errors
      if (issues.some((i) => i.severity === 'error')) {
        art.status = 'blocked';
        art.content = { ...art.content, issues, status: 'FAIL' };
      }
      return { artifacts: [art] };
    }

    case 'sandbox_execution': {
      const testFiles = workspace.getTestFiles();
      const sourceMods = workspace.getSourceModules();
      const runnable: Record<string, string> = {};
      for (const [name, code] of Object.entries(sourceMods)) {
        runnable[name] = toRunnableModule(code);
      }

      if (testFiles.length === 0) {
        const art = createArtifact(
          'sandbox_execution',
          'Execution Validator',
          { error: 'No test files in workspace', status: 'FAIL', tests: [] },
          [],
          'blocked',
          0.2
        );
        art.verification = ['Deterministic sandbox — no tests found'];
        return { artifacts: [art] };
      }

      // Run all test files
      const allTests = [];
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

      const execContent = {
        exit_code: exitCode,
        tests_passed: passed,
        tests_failed: failed,
        tests: allTests,
        stdout,
        stderr,
        duration_ms: duration,
        status: exitCode === 0 ? 'PASS' : 'FAIL',
      };

      // LLM summarizes authoritative results (does not invent)
      const summaryArt = await llmStage(
        stageId,
        requirement,
        artifacts,
        `Authoritative sandbox results (do not invent different numbers):\n${JSON.stringify(execContent, null, 2)}`
      );

      const art = createArtifact(
        'sandbox_execution',
        'Execution Validator',
        { ...execContent, llm_summary: summaryArt.content },
        [],
        exitCode === 0 ? 'verified' : 'blocked',
        exitCode === 0 ? 0.98 : 0.25
      );
      art.verification = ['Deterministic in-browser sandbox execution'];
      return { artifacts: [art] };
    }

    case 'debugger': {
      const exec = Object.values(artifacts).filter((a) => a.stage === 'sandbox_execution').pop();
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

      const sourceCtx = workspace
        .toArray()
        .map((f) => `--- ${f.path} ---\n${f.content}`)
        .join('\n\n');
      const art = await llmStage(
        stageId,
        requirement,
        artifacts,
        `Failing execution:\n${JSON.stringify(exec?.content, null, 2)}\n\nCurrent source:\n${sourceCtx}`
      );

      const patches = filesFromParsed(art.content, 'patches');
      if (patches.length) {
        workspace.merge(patches);
      }
      return { artifacts: [art], workspaceFiles: workspace.toArray() };
    }

    case 'regression': {
      // Always re-run tests deterministically
      const testFiles = workspace.getTestFiles();
      const sourceMods = workspace.getSourceModules();
      const runnable: Record<string, string> = {};
      for (const [name, code] of Object.entries(sourceMods)) {
        runnable[name] = toRunnableModule(code);
      }

      let exitCode = 0;
      const allTests = [];
      for (const tf of testFiles) {
        const report = await runTests(tf.content, runnable);
        allTests.push(...report.tests);
        if (report.exit_code !== 0) exitCode = 1;
      }

      const content = {
        tests_passed: allTests.filter((t) => t.passed).length,
        tests_failed: allTests.filter((t) => !t.passed).length,
        tests: allTests,
        status: exitCode === 0 ? 'PASS' : 'FAIL',
      };

      const summary = await llmStage(
        stageId,
        requirement,
        artifacts,
        `Regression results:\n${JSON.stringify(content, null, 2)}`
      );

      const art = createArtifact(
        'regression',
        'Regression Engineer',
        { ...content, llm_summary: summary.content },
        [],
        exitCode === 0 ? 'verified' : 'blocked',
        exitCode === 0 ? 0.95 : 0.3
      );
      art.verification = ['Deterministic re-execution of test suite'];
      return { artifacts: [art] };
    }

    case 'documentation': {
      const art = await llmStage(
        stageId,
        requirement,
        artifacts,
        `Workspace files:\n${workspace.toArray().map((f) => f.path).join('\n')}`
      );
      const readme = typeof art.content.readme === 'string' ? art.content.readme : null;
      if (readme) {
        workspace.write('README.md', readme, 'markdown');
      }
      return { artifacts: [art], workspaceFiles: workspace.toArray() };
    }

    default: {
      // Pure LLM stages
      const extra =
        stageId === 'security' || stageId === 'integration' || stageId === 'adversarial'
          ? `Source files:\n${workspace
              .toArray()
              .map((f) => `--- ${f.path} ---\n${f.content.slice(0, 2000)}`)
              .join('\n\n')}`
          : undefined;
      const art = await llmStage(stageId, requirement, artifacts, extra);
      return { artifacts: [art] };
    }
  }
}
