// Small helpers for plain-object records.

/** A copy of `record` without `key`. */
export function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}
