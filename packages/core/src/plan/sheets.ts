import type { PlanSheet, Project, Stock } from "../format/schema.ts";
import { inset, type Rect } from "../geometry/rect.ts";
import { assignTool, cutKind } from "../sequence/tools.ts";
import { placedRect, planContext, stockRect, treeMinOffcut, trimFor, type PlanContext } from "./context.ts";
import { buildCutTree, type CutTree, type TreeCut, type TreeItem } from "./cutTree.ts";
import { linesInOrder, rebuildTree } from "./savedCuts.ts";

/** "used" when the saved cuts pass the check and make `tree`; "stale" when they fail it, so that `tree` is the automatic tree. */
export type SavedCutsState = "none" | "used" | "stale";

export interface SheetAnalysis {
  sheet: PlanSheet;
  /** 0-based position in `plan.sheets`. */
  index: number;
  stock: Stock;
  trim: number;
  items: TreeItem[];
  tree: CutTree;
  /** The tree from the placements alone; the same as `tree` unless the saved cuts are used. */
  automatic: CutTree;
  savedCuts: SavedCutsState;
  /** True when the saved cuts are used and each line comes after the line that makes its piece, so that the sheet order of the sequence follows the list. */
  savedOrder: boolean;
}

/** With tool limits on, whether an enabled tool can make a cut; else undefined. */
export function treeToolCheck(ctx: PlanContext): ((cut: TreeCut) => boolean) | undefined {
  return ctx.features.toolLimits && ctx.tools.length > 0 ? (cut: TreeCut) => assignTool(ctx.tools, { ...cut, kind: cutKind(cut.axis, false) }, true) !== null : undefined;
}

/**
 * Builds the cut tree of every sheet whose stock exists. Placements with a missing part, a copy index past the
 * quantity, or a repeated part copy are left out; sheets with no remaining placements get no cuts. With tool limits on,
 * each tree has as few cuts that no enabled tool can make as it can. With the tree goal offcuts, each tree has the
 * largest offcut that it can before the shortest cuts. A sheet whose saved cuts pass the check of `rebuildTree` gets the
 * saved tree instead.
 */
export function analyzeSheets(ctx: PlanContext): SheetAnalysis[] {
  const seen = new Set<string>();
  const result: SheetAnalysis[] = [];
  const canCut = treeToolCheck(ctx);
  (ctx.project.plan?.sheets ?? []).forEach((sheet, index) => {
    const stock = ctx.stock.get(sheet.stock);
    if (!stock) return;
    const items: TreeItem[] = [];
    sheet.placements.forEach((placement, i) => {
      const part = ctx.parts.get(placement.part);
      const key = `${placement.part}#${placement.copy}`;
      if (!part || placement.copy >= part.quantity || seen.has(key)) return;
      seen.add(key);
      items.push({ index: i, rect: placedRect(part, placement) });
    });
    const trim = trimFor(ctx, stock);
    const treeTrim = items.length > 0 ? trim : 0;
    const automatic = buildCutTree(stockRect(stock), items, ctx.kerf, treeTrim, canCut, treeMinOffcut(ctx));
    let tree = automatic;
    let savedCuts: SavedCutsState = "none";
    let savedOrder = false;
    if (sheet.savedCuts && sheet.savedCuts.length > 0) {
      const root = items.length > 0 ? rebuildTree(treeRegion({ stock, trim, items }), sheet.savedCuts, items, ctx.kerf) : null;
      savedCuts = root ? "used" : "stale";
      if (root) {
        tree = { trims: automatic.trims, root, stuck: [] };
        savedOrder = linesInOrder(root, sheet.savedCuts);
      }
    }
    result.push({ sheet, index, stock, trim, items, tree, automatic, savedCuts, savedOrder });
  });
  return result;
}

/** The rect that the tree of the sheet cuts: the stock inside the trim, or the whole stock when the sheet has no parts or no trim. */
export function treeRegion(analysis: Pick<SheetAnalysis, "stock" | "trim" | "items">): Rect {
  return analysis.items.length > 0 && analysis.trim > 0 ? inset(stockRect(analysis.stock), analysis.trim) : stockRect(analysis.stock);
}

/** The project with no `savedCuts` on the sheets whose saved cuts fail the check. */
export function withoutStaleSavedCuts(project: Project, sheets: readonly SheetAnalysis[] = analyzeSheets(planContext(project))): Project {
  const stale = new Set(sheets.filter((analysis) => analysis.savedCuts === "stale").map((analysis) => analysis.sheet.id));
  if (stale.size === 0 || !project.plan) return project;
  const plan = project.plan.sheets.map((sheet) => {
    if (!stale.has(sheet.id)) return sheet;
    const { savedCuts: _stale, ...rest } = sheet;
    return rest;
  });
  return { ...project, plan: { ...project.plan, sheets: plan } };
}
