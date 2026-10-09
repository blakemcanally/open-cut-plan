import { sameLine } from "../edit/cutEdits.ts";
import { setSavedCuts, withPlacements } from "../edit/cuts.ts";
import type { Placement, Project, SavedCut } from "../format/schema.ts";
import type { Rect } from "../geometry/rect.ts";
import { planContext, stockRect } from "../plan/context.ts";
import { compareMeasures, createTreeSearch, measureTree, type CutTree, type TreeItem, type TreeMeasure, type TreeSearch } from "../plan/cutTree.ts";
import { rebuildTree, treeLines } from "../plan/savedCuts.ts";
import { compareFactoryEdgeMisses, sheetFactoryEdgeMissLengths } from "../plan/factoryEdges.ts";
import { analyzeSheets, treeRegion, treeToolCheck } from "../plan/sheets.ts";
import { slidePlacements, SLIDE_DIRECTIONS } from "./slide.ts";

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
  /** The new placements of the sheet when its parts slide for the lines, else null. */
  placements: Placement[] | null;
  /** The parts that slide. */
  slid: number;
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
  /**
   * Also search each sheet with its parts slid inside their pieces (see `slidePlacements`), to each corner. A slid
   * layout wins only with fewer cuts than the layout as it is. A pinned sheet, a sheet with locked cuts, and a slide
   * that gives more factory edge misses do not slide. The pass and time limits are for each layout.
   */
  slide?: boolean;
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
  /** The locked saved cuts, which every tree of the search keeps. */
  locked: SavedCut[];
  start: TreeMeasure;
  /** The layout as it is, then each slid layout. */
  layouts: Layout[];
}

interface Layout {
  target: Target;
  /** The slid placements, or null for the layout as it is. */
  placements: Placement[] | null;
  slid: number;
  items: readonly TreeItem[];
  search: TreeSearch;
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
function withLocks(layout: Layout, tree: CutTree): CutTree | null {
  const { target } = layout;
  if (target.locked.length === 0) return tree;
  const lines = treeLines(tree);
  const missing = target.locked.filter((line) => !lines.some((other) => sameLine(other, line)));
  if (missing.length === 0) return tree;
  const root = rebuildTree(target.region, [...lines, ...missing], layout.items, target.kerf);
  return root && { ...tree, root };
}

/** The layout with the best tree: a slid layout must have fewer cuts than the layout as it is. */
function bestLayout(target: Target): Layout | null {
  const [plain, ...slid] = target.layouts;
  let chosen = plain!.best ? plain! : null;
  for (const layout of slid) {
    if (!layout.best) continue;
    const better = !chosen ? true : chosen === plain ? fewerCuts(layout.best.measure, chosen.best!.measure) : compareMeasures(layout.best.measure, chosen.best!.measure) < 0;
    if (better) chosen = layout;
  }
  return chosen;
}

function lockedLines(target: Target, tree: CutTree): SavedCut[] {
  return treeLines(tree).map((line) => (target.locked.some((other) => sameLine(other, line)) ? { ...line, locked: true } : line));
}

/**
 * Searches the cut tree of each sheet with parts again and keeps every placement and every locked saved cut. A sheet
 * with stuck parts is not searched. Each sheet runs pass after pass with `createTreeSearch`, the join limit doubling
 * from 2, until a pass can join every run, the pass limit, or the time limit of the sheet. With `slide`, each slid
 * layout of the sheet runs in the same way after it, and the time limit of the sheet is shared by its layouts.
 */
export function createCutSearch(project: Project, options: OptimizeCutsOptions = {}): CutSearch {
  const ctx = planContext(project);
  const now = options.now ?? Date.now;
  const canCut = treeToolCheck(ctx);
  const targets: Target[] = analyzeSheets(ctx)
    .filter(({ sheet, items, tree }) => (options.sheet === undefined || sheet.id === options.sheet) && items.length > 0 && tree.stuck.length === 0)
    .map((analysis) => {
      const { sheet, index, stock, trim, items, tree, savedCuts } = analysis;
      const locked = savedCuts === "used" ? sheet.savedCuts!.filter((line) => line.locked) : [];
      const target: Target = { sheet: sheet.id, number: index + 1, kerf: ctx.kerf, region: treeRegion(analysis), locked, start: measureTree(tree, ctx.kerf, canCut), layouts: [] };
      const layout = (placements: Placement[] | null, layoutItems: readonly TreeItem[]): Layout => ({
        target,
        placements,
        slid: placements ? placements.filter((placement, i) => placement !== sheet.placements[i]).length : 0,
        items: layoutItems,
        search: createTreeSearch(stockRect(stock), layoutItems, ctx.kerf, trim, canCut, now, placements ? [] : locked),
        best: null,
        join: 2,
        passes: 0,
        startedAt: null,
        done: false,
        complete: false,
      });
      target.layouts.push(layout(null, items));
      if (options.slide && !sheet.pinned && locked.length === 0) {
        const misses = sheetFactoryEdgeMissLengths(ctx, sheet);
        const seen: Placement[][] = [];
        for (const direction of SLIDE_DIRECTIONS) {
          const placements = slidePlacements(analysis, ctx.kerf, ctx.units, direction);
          if (!placements || seen.some((other) => other.every((placement, i) => placement.x === placements[i]!.x && placement.y === placements[i]!.y))) continue;
          seen.push(placements);
          if (compareFactoryEdgeMisses(sheetFactoryEdgeMissLengths(ctx, { ...sheet, placements }), misses) > 0) continue;
          target.layouts.push(layout(placements, items.map((item) => ({ ...item, rect: { ...item.rect, x: placements[item.index]!.x, y: placements[item.index]!.y } }))));
        }
      }
      return target;
    });
  const layouts = targets.flatMap((target) => target.layouts);
  const timeLimit = (layout: Layout) => (options.timeLimitMs ?? project.settings.optimizer.timeLimitMs) / layout.target.layouts.length;
  let current = 0;

  const result = (): OptimizeCutsResult => ({
    sheets: targets.map((target) => {
      const chosen = bestLayout(target);
      const better = chosen?.best && fewerCuts(chosen.best.measure, target.start) ? chosen : null;
      return {
        sheet: target.sheet,
        number: target.number,
        before: stats(target.start),
        after: stats(better?.best!.measure ?? target.start),
        lines: better ? lockedLines(target, better.best!.tree) : null,
        placements: better?.placements ?? null,
        slid: better?.slid ?? 0,
        passes: target.layouts.reduce((sum, layout) => sum + layout.passes, 0),
        done: target.layouts.every((layout) => layout.done),
        complete: target.layouts.every((layout) => layout.complete),
      };
    }),
    done: current >= layouts.length,
  });

  const finish = (layout: Layout, complete: boolean) => {
    layout.done = true;
    layout.complete = complete;
    current++;
  };

  return {
    step(budgetMs) {
      const end = now() + budgetMs;
      let ran = false;
      while (current < layouts.length) {
        if (ran && now() >= end) return false;
        ran = true;
        const layout = layouts[current]!;
        layout.startedAt ??= now();
        const limit = options.passes === undefined ? layout.startedAt + timeLimit(layout) : Number.POSITIVE_INFINITY;
        const soon = Math.max(end, now() + 10);
        const deadline = Math.min(limit, soon);
        const out = layout.search.run(layout.join, Number.isFinite(deadline) ? deadline : undefined);
        if (!out) {
          if (now() >= limit) finish(layout, false);
          continue;
        }
        layout.passes++;
        const tree = withLocks(layout, out.tree);
        const measure = tree && measureTree(tree, layout.target.kerf, canCut);
        if (tree && measure && (!layout.best || compareMeasures(measure, layout.best.measure) < 0)) layout.best = { tree, measure };
        if (!out.limited) finish(layout, true);
        else if (options.passes !== undefined ? layout.passes >= options.passes : now() >= limit) finish(layout, false);
        else layout.join *= 2;
      }
      return true;
    },
    result,
  };
}

/** The project with the lines of each sheet that the search improved saved on it, after the slid placements of the sheet. */
export function applyCutsResult(project: Project, result: OptimizeCutsResult): Project {
  let next = project;
  for (const sheet of result.sheets) {
    if (!sheet.lines) continue;
    if (sheet.placements) next = slideSheet(next, sheet.sheet, sheet.placements);
    next = setSavedCuts(next, sheet.sheet, sheet.lines);
  }
  return next;
}

function slideSheet(project: Project, sheetId: string, placements: Placement[]): Project {
  const sheets = project.plan!.sheets.map((sheet) => (sheet.id === sheetId ? withPlacements(sheet, placements) : sheet));
  return { ...project, plan: { ...project.plan!, sheets } };
}

export function optimizeCuts(project: Project, options: OptimizeCutsOptions = {}): { project: Project; result: OptimizeCutsResult } {
  const search = createCutSearch(project, options);
  while (!search.step(Number.POSITIVE_INFINITY));
  const result = search.result();
  return { project: applyCutsResult(project, result), result };
}
