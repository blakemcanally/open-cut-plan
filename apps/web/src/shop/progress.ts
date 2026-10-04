import { assemblySteps, sequencePlan, setToolChoice, type AssemblyStep, type Project, type Settings, type Step } from "@opencutplan/core";

export const APP_EXTENSION = "opencutplan.app";

/** Stored in `extensions["opencutplan.app"].progress` for the cut steps, and in `.assemblyProgress` for the assembly steps. */
export interface ShopProgress {
  /** The fingerprint of the steps that the ticks belong to. */
  sequence: string;
  done: number[];
}

export type ProgressField = "progress" | "assemblyProgress";

export interface ShopState {
  key: string;
  done: ReadonlySet<number>;
  /** True when steps were ticked for a sequence that has since changed. */
  stale: boolean;
}

/** The assembly steps of one design; `start` is the number of its first step in the whole checklist. */
export interface AssemblyGroup {
  design: string;
  name: string;
  start: number;
  steps: AssemblyStep[];
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function fingerprint(count: number, text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${count}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/** A short fingerprint of the steps: it changes when any cut, its order, or its tool changes. */
export function sequenceKey(steps: readonly Step[]): string {
  return fingerprint(steps.length, steps.map((s) => [s.sheet, s.kind, s.axis, round(s.at), round(s.from), round(s.to), s.tool?.id ?? ""].join(",")).join(";"));
}

/** The assembly steps of each design that can make parts, in design order. */
export function assemblyGroups(project: Project): AssemblyGroup[] {
  const groups: AssemblyGroup[] = [];
  let start = 1;
  for (const design of project.designs ?? []) {
    const steps = assemblySteps(project, design.id);
    if (!steps) continue;
    groups.push({ design: design.id, name: design.name, start, steps });
    start += steps.length;
  }
  return groups;
}

export function assemblyCount(groups: readonly AssemblyGroup[]): number {
  return groups.reduce((sum, group) => sum + group.steps.length, 0);
}

/** A short fingerprint of the assembly steps: it changes when the text of any step changes. */
export function assemblyKey(groups: readonly AssemblyGroup[]): string {
  return fingerprint(assemblyCount(groups), groups.map((group) => [group.design, ...group.steps.map((step) => `${step.title}\n${step.body}`)].join("\n")).join("\n\n"));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function readProgress(project: Project, field: ProgressField = "progress"): ShopProgress | null {
  const progress = asRecord(asRecord(project.extensions?.[APP_EXTENSION])?.[field]);
  if (!progress || typeof progress.sequence !== "string" || !Array.isArray(progress.done)) return null;
  const done = progress.done.filter((n): n is number => Number.isInteger(n) && n > 0);
  return { sequence: progress.sequence, done };
}

/** Keeps every other extension; removes the namespace and `extensions` when they become empty. */
export function writeProgress(project: Project, progress: ShopProgress | null, field: ProgressField = "progress"): Project {
  const app = { ...asRecord(project.extensions?.[APP_EXTENSION]) };
  if (progress) app[field] = progress;
  else delete app[field];
  const extensions: Record<string, unknown> = { ...project.extensions };
  if (Object.keys(app).length > 0) extensions[APP_EXTENSION] = app;
  else delete extensions[APP_EXTENSION];
  const { extensions: _old, ...rest } = project;
  return Object.keys(extensions).length > 0 ? { ...rest, extensions } : rest;
}

function checklistState(project: Project, field: ProgressField, key: string, count: number): ShopState {
  const progress = readProgress(project, field);
  if (!progress) return { key, done: new Set(), stale: false };
  if (progress.sequence !== key) return { key, done: new Set(), stale: progress.done.length > 0 };
  return { key, done: new Set(progress.done.filter((n) => n <= count)), stale: false };
}

function setDone(project: Project, field: ProgressField, state: ShopState, step: number, done: boolean): Project {
  const next = new Set(state.done);
  if (done) next.add(step);
  else next.delete(step);
  return writeProgress(project, next.size > 0 ? { sequence: state.key, done: [...next].sort((a, b) => a - b) } : null, field);
}

function keepTicks(project: Project, field: ProgressField, key: string, count: number): Project {
  const progress = readProgress(project, field);
  if (!progress) return project;
  const done = progress.done.filter((n) => n <= count);
  return writeProgress(project, done.length > 0 ? { sequence: key, done } : null, field);
}

export function shopState(project: Project, steps: readonly Step[]): ShopState {
  return checklistState(project, "progress", sequenceKey(steps), steps.length);
}

export function setStepDone(project: Project, steps: readonly Step[], step: number, done: boolean): Project {
  return setDone(project, "progress", shopState(project, steps), step, done);
}

/** Keeps the ticked step numbers for the new sequence. */
export function keepProgress(project: Project, steps: readonly Step[]): Project {
  return keepTicks(project, "progress", sequenceKey(steps), steps.length);
}

export function assemblyState(project: Project, groups: readonly AssemblyGroup[]): ShopState {
  return checklistState(project, "assemblyProgress", assemblyKey(groups), assemblyCount(groups));
}

export function setAssemblyStepDone(project: Project, groups: readonly AssemblyGroup[], step: number, done: boolean): Project {
  return setDone(project, "assemblyProgress", assemblyState(project, groups), step, done);
}

/** Keeps the ticked step numbers for the new assembly steps. */
export function keepAssemblyProgress(project: Project, groups: readonly AssemblyGroup[]): Project {
  return keepTicks(project, "assemblyProgress", assemblyKey(groups), assemblyCount(groups));
}

export const cutKey = (s: Step): string => [s.sheet, s.kind, s.axis, round(s.at), round(s.from), round(s.to)].join(",");

function moveTicks(project: Project, steps: readonly Step[], next: Project): Project {
  const state = shopState(project, steps);
  if (state.stale || state.done.size === 0) return next;
  const ticked = new Set(steps.filter((s) => state.done.has(s.step)).map(cutKey));
  const after = sequencePlan(next);
  return writeProgress(next, { sequence: sequenceKey(after), done: after.filter((s) => ticked.has(cutKey(s))).map((s) => s.step) });
}

/** Sets the tool of a cut and moves the ticks to the new step numbers of their cuts. Old ticks that are out of date stay as they are. */
export function chooseTool(project: Project, steps: readonly Step[], step: Step, tool: string): Project {
  return moveTicks(project, steps, setToolChoice(project, step, tool));
}

/** Sets the cut order and moves the ticks to the new step numbers of their cuts, as `chooseTool` does. */
export function chooseOrder(project: Project, orderMode: Settings["orderMode"]): Project {
  return moveTicks(project, sequencePlan(project), { ...project, settings: { ...project.settings, orderMode } });
}
