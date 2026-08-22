import type { TestResult, ExecutionReport } from '../types/artifact';

/**
 * Restricted in-browser test runner.
 * No access to DOM, fetch, or host filesystem.
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
      if (!actual) throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`);
    },
    toBeFalsy() {
      if (actual) throw new Error(`Expected falsy, got ${JSON.stringify(actual)}`);
    },
    toContain(item: unknown) {
      if (typeof actual === 'string') {
        if (!actual.includes(String(item))) {
          throw new Error(`Expected string to contain ${JSON.stringify(item)}`);
        }
        return;
      }
      if (Array.isArray(actual)) {
        if (!actual.includes(item)) {
          throw new Error(`Expected array to contain ${JSON.stringify(item)}`);
        }
        return;
      }
      throw new Error('toContain requires array or string');
    },
  });

  const modules: Record<string, Record<string, unknown>> = {};

  for (const [name, code] of Object.entries(sourceModules)) {
    try {
      const exports: Record<string, unknown> = {};
      const fn = new Function('exports', `${code}\n;`);
      fn(exports);
      modules[name] = exports;
    } catch (e) {
      stderr.push(`Module load error (${name}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  try {
    const collected: { name: string; fn: () => void | Promise<void> }[] = [];

    const testFn = (name: string, fn: () => void | Promise<void>) => {
      collected.push({ name, fn });
    };

    const require = (name: string) => {
      const key = name.replace(/^\.\//, '').replace(/\.ts$/, '').replace(/\.js$/, '');
      if (modules[key]) return modules[key];
      if (modules[name]) return modules[name];
      // try basename
      for (const k of Object.keys(modules)) {
        if (k.endsWith('/' + key) || k === key) return modules[k];
      }
      throw new Error(`Module not found: ${name}`);
    };

    const fakeConsole = {
      log: (...args: unknown[]) => stdout.push(args.map(String).join(' ')),
      error: (...args: unknown[]) => stderr.push(args.map(String).join(' ')),
      warn: (...args: unknown[]) => stdout.push('[warn] ' + args.map(String).join(' ')),
    };

    const runner = new Function('test', 'it', 'expect', 'require', 'console', testCode + '\n;');
    runner(testFn, testFn, expect, require, fakeConsole);

    for (const t of collected) {
      const tStart = performance.now();
      try {
        await Promise.resolve(t.fn());
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

    if (collected.length === 0) {
      results.push({
        name: '(no tests collected)',
        passed: false,
        error: 'No test() or it() calls found in test file',
        duration_ms: 0,
      });
    }
  } catch (e) {
    stderr.push(`Test runner error: ${e instanceof Error ? e.message : String(e)}`);
    results.push({
      name: '(suite load)',
      passed: false,
      error: e instanceof Error ? e.message : String(e),
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

/** Convert TS/ESM source into exports-object form for the sandbox */
export function toRunnableModule(source: string): string {
  let code = source;

  // Remove interface/type blocks
  code = code.replace(/export\s+interface\s+\w+[^{]*\{[\s\S]*?\}/g, '');
  code = code.replace(/export\s+type\s+\w+\s*=\s*[^;]+;/g, '');
  code = code.replace(/interface\s+\w+[^{]*\{[\s\S]*?\}/g, '');

  // Strip simple type annotations (naive but effective for generated code)
  code = code.replace(/(\w)\s*:\s*[A-Za-z_][\w<>\[\]|\s,&?]*(?=\s*[=,)\{])/g, '$1');
  code = code.replace(/\)\s*:\s*[A-Za-z_][\w<>\[\]|\s,&?]*(?=\s*[{])/g, ')');

  // export function foo( -> exports.foo = function foo(
  code = code.replace(/export\s+function\s+(\w+)\s*\(/g, 'exports.$1 = function $1(');

  // export const foo = -> exports.foo =
  code = code.replace(/export\s+const\s+(\w+)\s*=/g, 'exports.$1 =');

  // export { a, b }
  code = code.replace(/export\s*\{([^}]+)\}\s*;?/g, (_m, inner: string) => {
    return inner
      .split(',')
      .map((part: string) => {
        const name = part.trim().split(/\s+as\s+/).pop()!.trim();
        return `exports.${name} = ${name};`;
      })
      .join('\n');
  });

  // export default
  code = code.replace(/export\s+default\s+/g, 'exports.default = ');

  return code;
}
