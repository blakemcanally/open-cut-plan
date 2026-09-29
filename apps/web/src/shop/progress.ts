import type { Project, Step } from "@opencutplan/core";

export const APP_EXTENSION = "opencutplan.app";

/** Stored in `extensions["opencutplan.app"].progress`. */
export interface ShopProgress {
  /** The `sequenceKey` of the steps that the ticks belong to. */
  sequence: string;
  done: number[];
}

export interface ShopState {
  key: string;
  done: ReadonlySet<number>;
  /** True when steps were ticked for a sequence that has since changed. */
  stale: boolean;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** A short fingerprint of the steps: it changes when any cut, its order, or its tool changes. */
export function sequenceKey(steps: readonly Step[]): string {
  const text = steps.map((s) => [s.sheet, s.kind, s.axis, round(s.at), round(s.from), round(s.to), s.tool?.id ?? ""].join(",")).join(";");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${steps.length}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function readProgress(project: Project): ShopProgress | null {
  const progress = asRecord(asRecord(project.extensions?.[APP_EXTENSION])?.progress);
  if (!progress || typeof progress.sequence !== "string" || !Array.isArray(progress.done)) return null;
  const done = progress.done.filter((n): n is number => Number.isInteger(n) && n > 0);
  return { sequence: progress.sequence, done };
}

/** Keeps every other extension; removes the namespace and `extensions` when they become empty. */
export function writeProgress(project: Project, progress: ShopProgress | null): Project {
  const app = { ...asRecord(project.extensions?.[APP_EXTENSION]) };
  if (progress) app.progress = progress;
  else delete app.progress;
  const extensions: Record<string, unknown> = { ...project.extensions };
  if (Object.keys(app).length > 0) extensions[APP_EXTENSION] = app;
  else delete extensions[APP_EXTENSION];
  const { extensions: _old, ...rest } = project;
  return Object.keys(extensions).length > 0 ? { ...rest, extensions } : rest;
}

export function shopState(project: Project, steps: readonly Step[]): ShopState {
  const key = sequenceKey(steps);
  const progress = readProgress(project);
  if (!progress) return { key, done: new Set(), stale: false };
  if (progress.sequence !== key) return { key, done: new Set(), stale: progress.done.length > 0 };
  return { key, done: new Set(progress.done.filter((n) => n <= steps.length)), stale: false };
}

export function setStepDone(project: Project, steps: readonly Step[], step: number, done: boolean): Project {
  const state = shopState(project, steps);
  const next = new Set(state.done);
  if (done) next.add(step);
  else next.delete(step);
  return writeProgress(project, next.size > 0 ? { sequence: state.key, done: [...next].sort((a, b) => a - b) } : null);
}

/** Keeps the ticked step numbers for the new sequence. */
export function keepProgress(project: Project, steps: readonly Step[]): Project {
  const progress = readProgress(project);
  if (!progress) return project;
  const done = progress.done.filter((n) => n <= steps.length);
  return writeProgress(project, done.length > 0 ? { sequence: sequenceKey(steps), done } : null);
}
