import type { PlanSheet, Stock } from "../format/schema.ts";
import { placedRect, stockRect, trimFor, type PlanContext } from "./context.ts";
import { buildCutTree, type CutTree, type TreeItem } from "./cutTree.ts";

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
 * quantity, or a repeated part copy are left out; sheets with no remaining placements get no cuts.
 */
export function analyzeSheets(ctx: PlanContext): SheetAnalysis[] {
  const seen = new Set<string>();
  const result: SheetAnalysis[] = [];
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
    const tree = buildCutTree(stockRect(stock), items, ctx.kerf, items.length > 0 ? trim : 0);
    result.push({ sheet, index, stock, trim, items, tree });
  });
  return result;
}
