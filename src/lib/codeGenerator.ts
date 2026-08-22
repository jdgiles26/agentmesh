import type { VirtualFile } from '../types/artifact';

export interface GeneratedProject {
  files: VirtualFile[];
  entryPoint: string;
  testFile: string;
  summary: string;
}

/**
 * Deterministic code generator.
 * Produces a real, runnable mini-project derived from the requirement text.
 * This is not LLM-based — it uses structured templates + requirement analysis
 * so that sandbox execution and tests are real and reproducible.
 */
export function generateProject(requirement: string, projectName = 'generated-app'): GeneratedProject {
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';
  const isTodo = /todo|task|list/i.test(requirement);
  const isCounter = /counter|increment|click/i.test(requirement);
  const isAuth = /auth|login|sign.?in/i.test(requirement);
  const isCalc = /calc|calculator|math/i.test(requirement);

  let domain: 'todo' | 'counter' | 'auth' | 'calc' | 'generic' = 'generic';
  if (isTodo) domain = 'todo';
  else if (isCounter) domain = 'counter';
  else if (isAuth) domain = 'auth';
  else if (isCalc) domain = 'calc';

  const files: VirtualFile[] = [];

  // package.json
  files.push({
    path: 'package.json',
    language: 'json',
    content: JSON.stringify(
      {
        name: slug,
        version: '0.1.0',
        private: true,
        type: 'module',
        scripts: {
          test: 'node --experimental-vm-modules node_modules/jest/bin/jest.js',
          build: 'tsc',
        },
      },
      null,
      2
    ),
  });

  // Core domain module + tests based on detected intent
  if (domain === 'todo') {
    files.push({
      path: 'src/todo.ts',
      language: 'typescript',
      content: `export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
}

export function createTodo(title: string): Todo {
  if (!title || !title.trim()) {
    throw new Error('Title is required');
  }
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    title: title.trim(),
    completed: false,
    createdAt: Date.now(),
  };
}

export function toggleTodo(todo: Todo): Todo {
  return { ...todo, completed: !todo.completed };
}

export function filterTodos(todos: Todo[], filter: 'all' | 'active' | 'completed'): Todo[] {
  if (filter === 'active') return todos.filter((t) => !t.completed);
  if (filter === 'completed') return todos.filter((t) => t.completed);
  return todos;
}
`,
    });
    files.push({
      path: 'src/todo.test.ts',
      language: 'typescript',
      content: `const { createTodo, toggleTodo, filterTodos } = require('todo');

test('createTodo requires a non-empty title', () => {
  let threw = false;
  try { createTodo(''); } catch { threw = true; }
  expect(threw).toBe(true);
});

test('createTodo returns a valid todo', () => {
  const t = createTodo('Buy milk');
  expect(t.title).toBe('Buy milk');
  expect(t.completed).toBe(false);
  expect(t.id).toBeTruthy();
});

test('toggleTodo flips completed', () => {
  const t = createTodo('Task');
  const toggled = toggleTodo(t);
  expect(toggled.completed).toBe(true);
  expect(toggleTodo(toggled).completed).toBe(false);
});

test('filterTodos works', () => {
  const a = createTodo('A');
  const b = toggleTodo(createTodo('B'));
  const list = [a, b];
  expect(filterTodos(list, 'active').length).toBe(1);
  expect(filterTodos(list, 'completed').length).toBe(1);
  expect(filterTodos(list, 'all').length).toBe(2);
});
`,
    });
  } else if (domain === 'counter') {
    files.push({
      path: 'src/counter.ts',
      language: 'typescript',
      content: `export function createCounter(initial = 0) {
  let value = initial;
  return {
    get: () => value,
    increment: (by = 1) => { value += by; return value; },
    decrement: (by = 1) => { value -= by; return value; },
    reset: () => { value = initial; return value; },
  };
}
`,
    });
    files.push({
      path: 'src/counter.test.ts',
      language: 'typescript',
      content: `const { createCounter } = require('counter');

test('starts at zero by default', () => {
  const c = createCounter();
  expect(c.get()).toBe(0);
});

test('increment and decrement', () => {
  const c = createCounter(10);
  expect(c.increment()).toBe(11);
  expect(c.increment(5)).toBe(16);
  expect(c.decrement(3)).toBe(13);
});

test('reset restores initial', () => {
  const c = createCounter(5);
  c.increment(10);
  expect(c.reset()).toBe(5);
});
`,
    });
  } else if (domain === 'auth') {
    files.push({
      path: 'src/auth.ts',
      language: 'typescript',
      content: `export interface Session {
  userId: string;
  token: string;
  expiresAt: number;
}

const users: Record<string, string> = {
  'demo@example.com': 'password123',
};

export function authenticate(email: string, password: string): Session | null {
  if (!email || !password) return null;
  if (users[email] !== password) return null;
  return {
    userId: email,
    token: btoa(email + ':' + Date.now()),
    expiresAt: Date.now() + 3600_000,
  };
}

export function isSessionValid(session: Session | null): boolean {
  if (!session) return false;
  return session.expiresAt > Date.now() && !!session.token;
}
`,
    });
    files.push({
      path: 'src/auth.test.ts',
      language: 'typescript',
      content: `const { authenticate, isSessionValid } = require('auth');

test('rejects empty credentials', () => {
  expect(authenticate('', '')).toBe(null);
});

test('rejects wrong password', () => {
  expect(authenticate('demo@example.com', 'wrong')).toBe(null);
});

test('accepts valid credentials', () => {
  const s = authenticate('demo@example.com', 'password123');
  expect(s).toBeTruthy();
  expect(s.userId).toBe('demo@example.com');
  expect(isSessionValid(s)).toBe(true);
});
`,
    });
  } else if (domain === 'calc') {
    files.push({
      path: 'src/calc.ts',
      language: 'typescript',
      content: `export function add(a: number, b: number): number { return a + b; }
export function sub(a: number, b: number): number { return a - b; }
export function mul(a: number, b: number): number { return a * b; }
export function div(a: number, b: number): number {
  if (b === 0) throw new Error('Division by zero');
  return a / b;
}
`,
    });
    files.push({
      path: 'src/calc.test.ts',
      language: 'typescript',
      content: `const { add, sub, mul, div } = require('calc');

test('add', () => { expect(add(2, 3)).toBe(5); });
test('sub', () => { expect(sub(10, 4)).toBe(6); });
test('mul', () => { expect(mul(3, 4)).toBe(12); });
test('div', () => { expect(div(10, 2)).toBe(5); });
test('div by zero throws', () => {
  let threw = false;
  try { div(1, 0); } catch { threw = true; }
  expect(threw).toBe(true);
});
`,
    });
  } else {
    // Generic utility module derived from requirement keywords
    files.push({
      path: 'src/core.ts',
      language: 'typescript',
      content: `/** Generated core module for: ${requirement.slice(0, 80).replace(/\n/g, ' ')} */

export function normalizeRequirement(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export function extractKeywords(text: string): string[] {
  const stop = new Set(['a', 'an', 'the', 'and', 'or', 'to', 'of', 'in', 'for', 'with', 'is', 'that']);
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !stop.has(w));
}

export function validateInput(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim().length > 0;
}
`,
    });
    files.push({
      path: 'src/core.test.ts',
      language: 'typescript',
      content: `const { normalizeRequirement, extractKeywords, validateInput } = require('core');

test('normalizeRequirement trims and collapses space', () => {
  expect(normalizeRequirement('  hello   world  ')).toBe('hello world');
});

test('extractKeywords filters stop words', () => {
  const kw = extractKeywords('Build a todo list for the user');
  expect(kw).toContain('build');
  expect(kw).toContain('todo');
  expect(kw).toContain('list');
  expect(kw).toContain('user');
});

test('validateInput', () => {
  expect(validateInput('ok')).toBe(true);
  expect(validateInput('')).toBe(false);
  expect(validateInput(null)).toBe(false);
});
`,
    });
  }

  // README
  files.push({
    path: 'README.md',
    language: 'markdown',
    content: `# ${slug}\n\nGenerated by **AgentMesh-X**.\n\n## Requirement\n\n${requirement}\n\n## Domain detected\n\n\"${domain}\"\n\n## Run tests\n\nTests are executable inside the AgentMesh-X sandbox.\n`,
  });

  const testFile = files.find((f) => f.path.endsWith('.test.ts'))!.path;
  const entryPoint = files.find((f) => f.path.startsWith('src/') && !f.path.endsWith('.test.ts'))!.path;

  return {
    files,
    entryPoint,
    testFile,
    summary: `Generated ${files.length} files for domain "${domain}"`,
  };
}

/** Convert TS-ish module source into a form the test runner can load via require() */
export function toRunnableModule(source: string): string {
  // Strip TypeScript type annotations at a basic level and convert export functions
  let code = source
    .replace(/export\s+interface\s+\w+[^{]*\{[^}]*\}/gs, '')
    .replace(/export\s+type\s+\w+\s*=\s*[^;]+;/g, '')
    .replace(/:\s*[A-Za-z][\w<>|,\s\[\]?]*/g, '') // naive type strip
    .replace(/export\s+function\s+/g, 'exports.')
    .replace(/export\s+const\s+/g, 'exports.')
    .replace(/export\s+\{/g, '/* export { */');

  // Fix "exports.name(" pattern from "export function name("
  code = code.replace(/exports\.(\w+)\s*\(/g, 'exports.$1 = function $1(');

  return code;
}
