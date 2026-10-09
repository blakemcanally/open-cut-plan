import type { CutToolChoice, Project, SavedCut } from "../format/schema.ts";
import { EPSILON, otherAxis, span, type Rect } from "../geometry/rect.ts";
import { planContext } from "../plan/context.ts";
import { countNoTool, type CutNode } from "../plan/cutTree.ts";
import { orderLines, rebuildTree, treeLines } from "../plan/savedCuts.ts";
import { analyzeSheets, treeRegion, treeToolCheck, type SheetAnalysis } from "../plan/sheets.ts";
import { matchesChoice, sequencePlan } from "../sequence/sequence.ts";
import { setSavedCuts } from "./cuts.ts";

/** A cut line of a sheet, without the trims: a saved cut, a step, or a tool choice. */
export type CutLine = Pick<SavedCut, "axis" | "at" | "from" | "to">;

export type CutEnd = "from" | "to";

export interface CutStop {
  /** The new position of the end. */
  end: number;
  /** The length of the cut after the edit. */
  length: number;
  /** The cuts of the sheet after the edit, trims included. */
  cuts: number;
  /** The cuts on the same line that the edit joins into this cut. */
  joins: number;
  /** True when the edit gives the sheet more cuts that no enabled tool can make. */
  noTool: boolean;
  /** For a shorten stop: the position of the cut that goes across. */
  across?: number;
}

export interface SheetCuts {
  analysis: SheetAnalysis;
  region: Rect;
  kerf: number;
  /** The lines of the tree that the sheet uses, in the order of its cuts. */
  lines: SavedCut[];
  trims: number;
  noTool: number;
  canCut: ReturnType<typeof treeToolCheck>;
}

const near = (a: number, b: number) => Math.abs(a - b) <= EPSILON;

export function sameLine(a: CutLine, b: CutLine): boolean {
  return a.axis === b.axis && near(a.at, b.at) && near(a.from, b.from) && near(a.to, b.to);
}

/**
 * The cut lines of a sheet that can take a cut edit: its saved cuts when they pass the check, else the lines of the
 * automatic tree. Null when the sheet does not exist, has no parts, or has parts that no cut separates.
 */
export function sheetCuts(project: Project, sheetId: string): SheetCuts | null {
  const ctx = planContext(project);
  const analysis = analyzeSheets(ctx).find((sheet) => sheet.sheet.id === sheetId);
  if (!analysis || analysis.items.length === 0 || analysis.tree.stuck.length > 0) return null;
  const canCut = treeToolCheck(ctx);
  const lines = analysis.savedCuts === "used" ? [...analysis.sheet.savedCuts!] : treeLines(analysis.tree);
  return {
    analysis,
    region: treeRegion(analysis),
    kerf: ctx.kerf,
    lines,
    trims: analysis.tree.trims.length,
    noTool: canCut ? countNoTool(analysis.tree.root, ctx.kerf, canCut) : 0,
    canCut,
  };
}

interface Edited {
  lines: SavedCut[];
  root: CutNode;
  joins: number;
}

function check(sheet: SheetCuts, lines: readonly SavedCut[]): CutNode | null {
  return rebuildTree(sheet.region, lines, sheet.analysis.items, sheet.kerf);
}

/**
 * Moves one end of `lines[index]` out to `value`. The cuts on the same line inside the new extent join it, and each
 * cross cut that it now goes through splits in two. A split piece that the tree does not need goes. Null when the
 * result fails the check, or when the edit changes a locked line.
 */
function extendLines(sheet: SheetCuts, lines: readonly SavedCut[], index: number, end: CutEnd, value: number): Edited | null {
  const line = lines[index]!;
  if (line.locked || (end === "to" ? value <= line.to + EPSILON : value >= line.from - EPSILON)) return null;
  const from = end === "from" ? value : line.from;
  const to = end === "to" ? value : line.to;
  const half = sheet.kerf / 2;
  const c = line.at;
  const out: SavedCut[] = [];
  const pieces: SavedCut[] = [];
  let joins = 0;
  for (const [i, other] of lines.entries()) {
    if (i === index) {
      out.push({ ...line, from, to });
    } else if (other.axis === line.axis && near(other.at, c)) {
      if (other.from >= from - EPSILON && other.to <= to + EPSILON) {
        if (other.locked) return null;
        joins++;
      } else if (other.to > from + EPSILON && other.from < to - EPSILON) {
        return null;
      } else {
        out.push(other);
      }
    } else if (other.axis !== line.axis && other.at > from + EPSILON && other.at < to - EPSILON && other.from < c - EPSILON && other.to > c + EPSILON) {
      if (other.locked) return null;
      for (const piece of [
        { ...other, to: c - half },
        { ...other, from: c + half },
      ]) {
        if (piece.to - piece.from <= EPSILON) continue;
        out.push(piece);
        pieces.push(piece);
      }
    } else {
      out.push(other);
    }
  }
  let root = check(sheet, out);
  if (!root) return null;
  let result = out;
  for (const piece of pieces) {
    const without = result.filter((other) => other !== piece);
    const trimmed = check(sheet, without);
    if (trimmed) {
      result = without;
      root = trimmed;
    }
  }
  return { lines: result, root, joins };
}

function findLine(lines: readonly SavedCut[], line: CutLine): number {
  return lines.findIndex((other) => sameLine(other, line));
}

function stopOf(sheet: SheetCuts, edited: Edited, line: CutLine, end: number, across?: number): CutStop {
  return {
    end,
    length: line.to - line.from,
    cuts: edited.lines.length + sheet.trims,
    joins: edited.joins,
    noTool: sheet.canCut ? countNoTool(edited.root, sheet.kerf, sheet.canCut) > sheet.noTool : false,
    ...(across === undefined ? {} : { across }),
  };
}

function extendCandidates(sheet: SheetCuts, line: CutLine, end: CutEnd): number[] {
  const half = sheet.kerf / 2;
  const [lo, hi] = span(sheet.region, otherAxis(line.axis));
  const values = [end === "to" ? hi : lo];
  for (const other of sheet.lines) {
    if (other.axis === line.axis) {
      if (!near(other.at, line.at)) continue;
      if (end === "to" && other.from > line.to + EPSILON) values.push(other.to);
      if (end === "from" && other.to < line.from - EPSILON) values.push(other.from);
    } else if (other.from < line.at - EPSILON && other.to > line.at + EPSILON) {
      if (end === "to" && other.at - half > line.to + EPSILON) values.push(other.at - half);
      if (end === "from" && other.at + half < line.from - EPSILON) values.push(other.at + half);
    }
  }
  const unique = values.filter((value, i) => values.findIndex((other) => near(other, value)) === i);
  return unique.toSorted((a, b) => (end === "to" ? a - b : b - a));
}

interface Planned {
  stop: CutStop;
  edited: Edited;
  /** The line that the edit made from the selected cut. */
  line: SavedCut;
  /** The cut that the edit extends, before and after: the selected cut, or for a shorten the cut that goes across. */
  source: CutLine;
  extended: CutLine;
}

function planExtends(sheet: SheetCuts, line: CutLine, end: CutEnd): Planned[] {
  const index = findLine(sheet.lines, line);
  if (index < 0) return [];
  const planned: Planned[] = [];
  for (const value of extendCandidates(sheet, line, end)) {
    const edited = extendLines(sheet, sheet.lines, index, end, value);
    if (!edited) continue;
    const next = { ...sheet.lines[index]!, [end]: value };
    planned.push({ stop: stopOf(sheet, edited, next, value), edited, line: next, source: sheet.lines[index]!, extended: next });
  }
  return planned;
}

/** The cuts that end at the line from the side, between its ends, as [cut, the end of that cut at the line]. */
function crossers(sheet: SheetCuts, line: CutLine): [SavedCut, CutEnd][] {
  const half = sheet.kerf / 2;
  const out: [SavedCut, CutEnd][] = [];
  for (const other of sheet.lines) {
    if (other.axis === line.axis || other.at <= line.from + EPSILON || other.at >= line.to - EPSILON) continue;
    if (near(other.to, line.at - half)) out.push([other, "to"]);
    else if (near(other.from, line.at + half)) out.push([other, "from"]);
  }
  return out;
}

function planShortens(sheet: SheetCuts, line: CutLine, end: CutEnd): Planned[] {
  const half = sheet.kerf / 2;
  const planned: Planned[] = [];
  const seen: number[] = [];
  const order = crossers(sheet, line).toSorted(([a], [b]) => (end === "to" ? b.at - a.at : a.at - b.at));
  for (const [other, otherEnd] of order) {
    if (seen.some((at) => near(at, other.at))) continue;
    const index = findLine(sheet.lines, other);
    const past = extendCandidates(sheet, other, otherEnd).filter((value) => (otherEnd === "to" ? value > line.at + half : value < line.at - half));
    for (const value of past) {
      const edited = extendLines(sheet, sheet.lines, index, otherEnd, value);
      if (!edited) continue;
      const kept = end === "to" ? { ...line, to: other.at - half } : { ...line, from: other.at + half };
      const position = end === "to" ? kept.to : kept.from;
      const piece = edited.lines.find((candidate) => sameLine(candidate, kept));
      if (!piece) break;
      seen.push(other.at);
      planned.push({ stop: stopOf(sheet, edited, kept, position, other.at), edited, line: piece, source: other, extended: { ...other, [otherEnd]: value } });
      break;
    }
  }
  return planned;
}

/** The ends to which `end` of the cut can move out, nearest first. Each one passes the check. */
export function cutStops(project: Project, sheetId: string, line: CutLine, end: CutEnd): CutStop[] {
  const sheet = sheetCuts(project, sheetId);
  return sheet ? planExtends(sheet, line, end).map((plan) => plan.stop) : [];
}

/** The ends to which `end` of the cut can move in, nearest to that end first. Each one extends a cross cut through the cut. */
export function shortenStops(project: Project, sheetId: string, line: CutLine, end: CutEnd): CutStop[] {
  const sheet = sheetCuts(project, sheetId);
  return sheet ? planShortens(sheet, line, end).map((plan) => plan.stop) : [];
}

/** The tool choices for the new lines: a cut that came from an old cut keeps its choice while that tool can make it. */
function applyLines(project: Project, sheet: SheetCuts, lines: readonly SavedCut[], inherit: (line: SavedCut) => CutLine | null): Project {
  const sheetId = sheet.analysis.sheet.id;
  const choices = sheet.analysis.sheet.toolChoices ?? [];
  const kept: CutToolChoice[] = [];
  const moved: CutToolChoice[] = [];
  for (const line of lines) {
    const old = inherit(line) ?? line;
    const choice = choices.find((candidate) => matchesChoice(old, candidate));
    if (!choice) continue;
    const next = { ...choice, axis: line.axis, at: line.at, from: line.from, to: line.to };
    (sameLine(old, line) ? kept : moved).push(next);
  }
  const root = check(sheet, lines);
  let next = withChoices(setSavedCuts(project, sheetId, root ? orderLines(root, lines) : lines), sheetId, [...kept, ...moved]);
  if (moved.length === 0) return next;
  const steps = sequencePlan(next).filter((step) => step.sheet === sheetId);
  const over = moved.filter((choice) => steps.some((step) => matchesChoice(step, choice) && step.chosen && step.overLimit !== null));
  if (over.length > 0) next = withChoices(next, sheetId, [...kept, ...moved.filter((choice) => !over.includes(choice))]);
  return next;
}

function withChoices(project: Project, sheetId: string, choices: CutToolChoice[]): Project {
  const sheets = project.plan!.sheets.map((sheet) => {
    if (sheet.id !== sheetId) return sheet;
    const { toolChoices: _old, ...rest } = sheet;
    return choices.length > 0 ? { ...rest, toolChoices: choices } : rest;
  });
  return { ...project, plan: { ...project.plan!, sheets } };
}

/** The old cut of each new line: the same line, the cut that it was extended from, or the cut that it was split from. */
function lineSources(before: readonly SavedCut[], plan: Pick<Planned, "source" | "extended">) {
  return (line: SavedCut): CutLine | null => {
    if (before.some((old) => sameLine(old, line))) return line;
    if (sameLine(line, plan.extended)) return plan.source;
    return before.find((old) => old.axis === line.axis && near(old.at, line.at) && old.from <= line.from + EPSILON && old.to >= line.to - EPSILON) ?? null;
  };
}

/** Moves `end` of the cut out to `value`, a value of `cutStops`. Null when it is not a stop. */
export function extendCut(project: Project, sheetId: string, line: CutLine, end: CutEnd, value: number): Project | null {
  const sheet = sheetCuts(project, sheetId);
  if (!sheet) return null;
  const plan = planExtends(sheet, line, end).find((candidate) => near(candidate.stop.end, value));
  if (!plan) return null;
  return applyLines(project, sheet, plan.edited.lines, lineSources(sheet.lines, plan));
}

/** Moves `end` of the cut in to the cut at `across`, which then goes through it, as in `shortenStops`. Null when it is not a stop. */
export function shortenCut(project: Project, sheetId: string, line: CutLine, end: CutEnd, across: number): Project | null {
  const sheet = sheetCuts(project, sheetId);
  if (!sheet) return null;
  const plan = planShortens(sheet, line, end).find((candidate) => near(candidate.stop.across!, across));
  if (!plan) return null;
  return applyLines(project, sheet, plan.edited.lines, lineSources(sheet.lines, plan));
}

/** The sheet without the cut, or null when the cut is locked or the result fails the check, for example when the cut separates a part. */
export function removeCut(project: Project, sheetId: string, line: CutLine): Project | null {
  const sheet = sheetCuts(project, sheetId);
  if (!sheet) return null;
  const index = findLine(sheet.lines, line);
  if (index < 0 || sheet.lines[index]!.locked) return null;
  const lines = sheet.lines.filter((_, i) => i !== index);
  if (!check(sheet, lines)) return null;
  return applyLines(project, sheet, lines, (kept) => kept);
}

/**
 * The best join of the cut: the stop at each end that joins the most cuts on the same line, then gives the fewest
 * cuts. Null when no stop joins a cut.
 */
export function joinCut(project: Project, sheetId: string, line: CutLine): { project: Project; joins: number; line: CutLine } | null {
  let current = project;
  let selected: CutLine = line;
  let joins = 0;
  for (const end of ["to", "from"] as const) {
    const sheet = sheetCuts(current, sheetId);
    if (!sheet) return null;
    const best = planExtends(sheet, selected, end)
      .filter((plan) => plan.stop.joins > 0)
      .toSorted((a, b) => b.stop.joins - a.stop.joins || a.stop.cuts - b.stop.cuts)[0];
    if (!best) continue;
    current = applyLines(current, sheet, best.edited.lines, lineSources(sheet.lines, best));
    selected = best.line;
    joins += best.stop.joins;
  }
  return joins > 0 ? { project: current, joins, line: selected } : null;
}

/** True when the cut is a locked saved cut. */
export function isCutLocked(project: Project, sheetId: string, line: CutLine): boolean {
  return sheetCuts(project, sheetId)?.lines.some((other) => other.locked === true && sameLine(other, line)) ?? false;
}

/**
 * Locks or unlocks the cut, so that Optimize cuts keeps it or may change it. A lock on a sheet with automatic cuts
 * saves them first. Null when the sheet has no such cut.
 */
export function setCutLocked(project: Project, sheetId: string, line: CutLine, locked: boolean): Project | null {
  const sheet = sheetCuts(project, sheetId);
  if (!sheet) return null;
  const index = findLine(sheet.lines, line);
  if (index < 0) return null;
  const lines = sheet.lines.map((other, i) => {
    if (i !== index) return other;
    const { locked: _old, ...rest } = other;
    return locked ? { ...rest, locked: true } : rest;
  });
  return applyLines(project, sheet, lines, (kept) => kept);
}
