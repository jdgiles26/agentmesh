/**
 * Robustly extract a JSON object from model output.
 * Models often wrap JSON in markdown fences or add trailing text.
 */
export function extractJSON<T = Record<string, unknown>>(text: string): T {
  const trimmed = text.trim();

  // Direct parse
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    /* continue */
  }

  // Markdown fence
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim()) as T;
    } catch {
      /* continue */
    }
  }

  // First { ... last }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    } catch {
      /* continue */
    }
  }

  throw new Error('Failed to extract JSON from model output');
}
