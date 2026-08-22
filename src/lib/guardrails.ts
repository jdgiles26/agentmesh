/**
 * Input/output guardrails for agent boundaries (ai-agentic-workflows).
 */

const SECRET_PATTERNS = [
  /api[_-]?key\s*[:=]\s*['"][^'"]{8,}['"]/i,
  /secret\s*[:=]\s*['"][^'"]{8,}['"]/i,
  /password\s*[:=]\s*['"][^'"]+['"]/i,
  /Bearer\s+[A-Za-z0-9\-_\.]+/,
  /-----BEGIN (RSA |OPENSSH )?PRIVATE KEY-----/,
];

const UNSAFE_CODE = [
  /\beval\s*\(/,
  /\bdocument\.write\s*\(/,
  /innerHTML\s*=/,
  /\bfetch\s*\(\s*['"]https?:\/\//i,
  /child_process|fs\.writeFile|process\.exit/,
];

export interface GuardResult {
  ok: boolean;
  findings: string[];
}

export function sanitizeRequirement(input: string): string {
  // Treat as data only — strip null bytes and extreme length
  return input.replace(/\0/g, '').slice(0, 12_000).trim();
}

export function scanForSecrets(text: string): GuardResult {
  const findings: string[] = [];
  for (const re of SECRET_PATTERNS) {
    if (re.test(text)) findings.push(`Possible secret matched: ${re.source.slice(0, 40)}`);
  }
  return { ok: findings.length === 0, findings };
}

export function scanGeneratedCode(code: string): GuardResult {
  const findings: string[] = [];
  for (const re of UNSAFE_CODE) {
    if (re.test(code)) findings.push(`Unsafe pattern: ${re.source}`);
  }
  const secrets = scanForSecrets(code);
  findings.push(...secrets.findings);
  return { ok: findings.length === 0, findings };
}

export function validateArtifactShape(content: unknown): GuardResult {
  if (content === null || typeof content !== 'object' || Array.isArray(content)) {
    return { ok: false, findings: ['Artifact content must be a JSON object'] };
  }
  return { ok: true, findings: [] };
}
