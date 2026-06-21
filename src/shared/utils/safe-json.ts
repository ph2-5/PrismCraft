// NOTE: This function does NOT validate that the parsed result matches type T.
// Callers are responsible for runtime validation if needed.
export function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (!raw) return fallback;
  try {
    return (typeof raw === "string" ? JSON.parse(raw) : raw) as T;
  } catch {
    return fallback;
  }
}

export function safeJsonParseArray<T>(raw: unknown): T[] {
  return safeJsonParse<T[]>(raw, []);
}

export function safeJsonParseRecord(raw: unknown): Record<string, unknown> {
  return safeJsonParse<Record<string, unknown>>(raw, {});
}
