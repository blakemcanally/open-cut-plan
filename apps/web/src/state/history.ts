export const HISTORY_LIMIT = 100;
export const MERGE_MS = 1000;

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** The key and time of the last recorded edit; edits with the same key within `MERGE_MS` become one undo step. */
  last: { key: string; at: number } | null;
}

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], last: null };
}

export function record<T>(history: History<T>, next: T, key?: string, at: number = Date.now()): History<T> {
  if (Object.is(next, history.present)) return history;
  const last = key === undefined ? null : { key, at };
  if (key !== undefined && history.last?.key === key && at - history.last.at <= MERGE_MS) {
    return { ...history, present: next, future: [], last };
  }
  return { past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: next, future: [], last };
}

export function undo<T>(history: History<T>): History<T> {
  if (history.past.length === 0) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1]!,
    future: [history.present, ...history.future],
    last: null,
  };
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...future] = history.future;
  if (next === undefined) return history;
  return { past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: next, future, last: null };
}
