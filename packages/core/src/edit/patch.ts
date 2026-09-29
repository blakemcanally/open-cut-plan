/** A change to some fields; `undefined` removes an optional field. */
export type Patch<T> = { [K in keyof T]?: T[K] | undefined };

export function applyPatch<T extends object>(item: T, patch: Patch<T>): T {
  const next = { ...item } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next as T;
}

export function idsOf(items: readonly { id: string }[]): Set<string> {
  return new Set(items.map((item) => item.id));
}
