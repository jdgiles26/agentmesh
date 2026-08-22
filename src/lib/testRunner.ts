import type { TestResult, ExecutionReport } from '../types/artifact';

/**
 * Minimal in-browser test runner.
 * Executes simple assertion-based tests safely via Function constructor
 * with a restricted assertion API. Not a full sandbox — suitable for
 * generated unit tests that only use the provided expect helpers.
 */
export async function runTests(
  testCode: string,
  sourceModules: Record<string, string> = {}
): Promise<ExecutionReport> {
  const start = performance.now();
  const results: TestResult[] = [];
  const stdout: string[] = [];
  const stderr: string[] = [];

  const expect = (actual: unknown) => ({
    toBe(expected: unknown) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected: unknown) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
      }
    },
    toBeTruthy() {
      if (!actual) throw new Error(`Expected truthy value, got ${JSON.stringify(actual)}`);
    },
    toBeFalsy() {
      if (actual) throw new Error(`Expected falsy value, got ${JSON.stringify(actual)}`);
    },
    toContain(item: unknown) {
      if (!Array.isArray(actual) && typeof actual !== 'string') {
        throw new Error('toContain requires array or string');
      }
      if (!(actual as string | unknown[]).includes(item as never)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to contain ${JSON.stringify(item)}`);
      }
    },
  });

  // Build a simple module registry from source
  const modules: Record<string, unknown> = {};
  for (const [name, code] of Object.entries(sourceModules)) {
    try {
      // Extract exported functions via a constrained eval
      const fn = new Function(
        'exports',
        `${code}\n; return exports;`
      );
      const exports: Record<string, unknown> = {};
      fn(exports);
      modules[name] = exports;
    } catch (e) {
      stderr.push(`Module load error (${name}): ${String(e)}`);
    }
  }

  // Parse test cases: look for test("name", () => { ... }) or it("name", ...)
  const testRegex = /(?:test|it)\s*\(\s*["'`]([^"'`]*)["'`]\s*,\s*(async\s*)?\(\)\s*=>\s*\{/g;
  const tests: { name: string; body: string }[] = [];
  let match: RegExpExecArray | null;
  const source = testCode;

  // Simpler approach: wrap entire test file and collect results via a custom test function
  try {
    const collected: { name: string; fn: () => void | Promise<void> }[] = [];

    const testFn = (name: string, fn: () => void | Promise<void>) => {
      collected.push({ name, fn });
    };

    const require = (name: string) => {
      if (modules[name]) return modules[name];
      throw new Error(`Module not found: ${name}`);
    };

    // Execute test file in restricted context
    const runner = new Function(
      'test',
      'it',
      'expect',
      'require',
      'console',
      testCode + '\n;'
    );

    const fakeConsole = {
      log: (...args: unknown[]) => stdout.push(args.map(String).join(' ')),
      error: (...args: unknown[]) => stderr.push(args.map(String).join(' ')),
      warn: (...args: unknown[]) => stdout.push('[warn] ' + args.map(String).join(' ')),
    };

    runner(testFn, testFn, expect, require, fakeConsole);

    for (const t of collected) {
      const tStart = performance.now();
      try {
        await t.fn();
        results.push({
          name: t.name,
          passed: true,
          duration_ms: Math.round(performance.now() - tStart),
        });
      } catch (e) {
        results.push({
          name: t.name,
          passed: false,
          error: e instanceof Error ? e.message : String(e),
          duration_ms: Math.round(performance.now() - tStart),
        });
      }
    }
  } catch (e) {
    stderr.push(`Test runner error: ${String(e)}`);
    results.push({
      name: '(suite load)',
      passed: false,
      error: String(e),
      duration_ms: 0,
    });
  }

  const failed = results.filter((r) => !r.passed).length;

  return {
    exit_code: failed > 0 ? 1 : 0,
    tests: results,
    stdout,
    stderr,
    duration_ms: Math.round(performance.now() - start),
  };
}
