import { sameLine } from "../edit/cutEdits.ts";
import { setSavedCuts } from "../edit/cuts.ts";
import type { Project, SavedCut } from "../format/schema.ts";
import type { Rect } from "../geometry/rect.ts";
import { planContext, stockRect } from "../plan/context.ts";
import { compareMeasures, createTreeSearch, measureTree, type CutTree, type TreeItem, type TreeMeasure, type TreeSearch } from "../plan/cutTree.ts";
import { rebuildTree, treeLines } from "../plan/savedCuts.ts";
import { analyzeSheets, treeRegion, treeToolCheck } from "../plan/sheets.ts";

export interface CutStats {
  /** Trims included. */
  cuts: number;
  length: number;
}

export interface SheetCutsResult {
  sheet: string;
  /** 1-based position in `plan.sheets`. */
  number: number;
  before: CutStats;
  after: CutStats;
  /** The lines to save, or null when the search found no tree with fewer cuts. */
  lines: SavedCut[] | null;
  passes: number;
  done: boolean;
  /** True when the last pass could join every run, so that a longer search finds no better tree. */
  complete: boolean;
}

export interface OptimizeCutsResult {
  sheets: SheetCutsResult[];
  done: boolean;
}

export interface OptimizeCutsOptions {
  /** The id of the one sheet to search. */
  sheet?: string;
  /** For each sheet; defaults to `settings.optimizer.timeLimitMs`. */
  timeLimitMs?: number;
  /** Stop each sheet after this pass and ignore the time, so that the result is the same on every computer. */
  passes?: number;
  now?: () => number;
}

export interface CutSearch {
  /** Runs for about `budgetMs`; true when every sheet is done. */
  step(budgetMs: number): boolean;
  result(): OptimizeCutsResult;
}

interface Target {
  sheet: string;
  number: number;
  kerf: number;
  region: Rect;
  items: readonly TreeItem[];
  /** The locked saved cuts, which every tree of the search keeps. */
  locked: SavedCut[];
  search: TreeSearch;
  start: TreeMeasure;
  best: { tree: CutTree; measure: TreeMeasure } | null;
  join: number;
  passes: number;
  startedAt: number | null;
  done: boolean;
  complete: boolean;
}

const stats = (measure: TreeMeasure): CutStats => ({ cuts: measure.cuts, length: measure.length });

/** Fewer cuts, with no more stuck parts and no more cuts that no tool can make. */
function fewerCuts(a: TreeMeasure, b: TreeMeasure): boolean {
  return a.stuck <= b.stuck && a.noTool <= b.noTool && a.cuts < b.cuts;
}

/** The tree with every locked line of the target, with a line that the search left in a waste piece added back; null when that fails the check. */
function withLocks(target: Target, tree: CutTree): CutTree | null {
  if (target.locked.length === 0) return tree;
  const lines = treeLines(tree);
  const missing = target.locked.filter((line) => !lines.some((other) => sameLine(other, line)));
  if (missing.length === 0) return tree;
  const root = rebuildTree(target.region, [...lines, ...missing], target.items, target.kerf);
  return root && { ...tree, root };
}

function lockedLines(target: Target, tree: CutTree): SavedCut[] {
  return treeLines(tree).map((line) => (target.locked.some((other) => sameLine(other, line)) ? { ...line, locked: true } : line));
}

/**
 * Searches the cut tree of each sheet with parts again and keeps every placement and every locked saved cut. A sheet
 * with stuck parts is not searched. Each sheet runs pass after pass with `createTreeSearch`, the join limit doubling
 * from 2, until a pass can join every run, the pass limit, or the time limit of the sheet.
 */
export function createCutSearch(project: Project, options: OptimizeCutsOptions = {}): CutSearch {
  const ctx = planContext(project);
  const now = options.now ?? Date.now;
  const timeLimit = options.timeLimitMs ?? project.settings.optimizer.timeLimitMs;
  const canCut = treeToolCheck(ctx);
  const targets: Target[] = analyzeSheets(ctx)
    .filter(({ sheet, items, tree }) => (options.sheet === undefined || sheet.id === options.sheet) && items.length > 0 && tree.stuck.length === 0)
    .map(({ sheet, index, stock, trim, items, tree, savedCuts }) => {
      const locked = savedCuts === "used" ? sheet.savedCuts!.filter((line) => line.locked) : [];
      return {
        sheet: sheet.id,
        number: index + 1,
        kerf: ctx.kerf,
        region: treeRegion({ stock, trim, items }),
        items,
        locked,
        search: createTreeSearch(stockRect(stock), items, ctx.kerf, trim, canCut, now, locked),
        start: measureTree(tree, ctx.kerf, canCut),
        best: null,
        join: 2,
        passes: 0,
        startedAt: null,
        done: false,
        complete: false,
      };
    });
  let current = 0;

  const result = (): OptimizeCutsResult => ({
    sheets: targets.map((target) => {
      const better = target.best && fewerCuts(target.best.measure, target.start) ? target.best : null;
      return {
        sheet: target.sheet,
        number: target.number,
        before: stats(target.start),
        after: stats(better?.measure ?? target.start),
        lines: better ? lockedLines(target, better.tree) : null,
        passes: target.passes,
        done: target.done,
        complete: target.complete,
      };
    }),
    done: current >= targets.length,
  });

  const finish = (target: Target, complete: boolean) => {
    target.done = true;
    target.complete = complete;
    current++;
  };

  return {
    step(budgetMs) {
      const end = now() + budgetMs;
      let ran = false;
      while (current < targets.length) {
        if (ran && now() >= end) return false;
        ran = true;
        const target = targets[current]!;
        target.startedAt ??= now();
        const limit = options.passes === undefined ? target.startedAt + timeLimit : Number.POSITIVE_INFINITY;
        const soon = Math.max(end, now() + 10);
        const deadline = Math.min(limit, soon);
        const out = target.search.run(target.join, Number.isFinite(deadline) ? deadline : undefined);
        if (!out) {
          if (now() >= limit) finish(target, false);
          continue;
        }
        target.passes++;
        const tree = withLocks(target, out.tree);
        const measure = tree && measureTree(tree, target.kerf, canCut);
        if (tree && measure && (!target.best || compareMeasures(measure, target.best.measure) < 0)) target.best = { tree, measure };
        if (!out.limited) finish(target, true);
        else if (options.passes !== undefined ? target.passes >= options.passes : now() >= limit) finish(target, false);
        else target.join *= 2;
      }
      return true;
    },
    result,
  };
}

/** The project with the lines of each sheet that the search improved saved on it. */
export function applyCutsResult(project: Project, result: OptimizeCutsResult): Project {
  let next = project;
  for (const sheet of result.sheets) if (sheet.lines) next = setSavedCuts(next, sheet.sheet, sheet.lines);
  return next;
}

export function optimizeCuts(project: Project, options: OptimizeCutsOptions = {}): { project: Project; result: OptimizeCutsResult } {
  const search = createCutSearch(project, options);
  while (!search.step(Number.POSITIVE_INFINITY));
  const result = search.result();
  return { project: applyCutsResult(project, result), result };
}
