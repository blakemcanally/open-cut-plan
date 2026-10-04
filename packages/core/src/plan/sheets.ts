import type { PlanSheet, Stock } from "../format/schema.ts";
import { assignTool, cutKind } from "../sequence/tools.ts";
import { placedRect, stockRect, treeMinOffcut, trimFor, type PlanContext } from "./context.ts";
import { buildCutTree, type CutTree, type TreeCut, type TreeItem } from "./cutTree.ts";

export interface SheetAnalysis {
  sheet: PlanSheet;
  /** 0-based position in `plan.sheets`. */
  index: number;
  stock: Stock;
  trim: number;
  items: TreeItem[];
  tree: CutTree;
}

/**
 * Builds the cut tree of every sheet whose stock exists. Placements with a missing part, a copy index past the
 * quantity, or a repeated part copy are left out; sheets with no remaining placements get no cuts. With tool limits on,
 * each tree has as few cuts that no enabled tool can make as it can. With the tree goal offcuts, each tree has the
 * largest offcut that it can before the shortest cuts.
 */
export function analyzeSheets(ctx: PlanContext): SheetAnalysis[] {
  const seen = new Set<string>();
  const result: SheetAnalysis[] = [];
  const canCut = ctx.features.toolLimits && ctx.tools.length > 0 ? (cut: TreeCut) => assignTool(ctx.tools, { ...cut, kind: cutKind(cut.axis, false) }, true) !== null : undefined;
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
    const tree = buildCutTree(stockRect(stock), items, ctx.kerf, items.length > 0 ? trim : 0, canCut, treeMinOffcut(ctx));
    result.push({ sheet, index, stock, trim, items, tree });
  });
  return result;
}
