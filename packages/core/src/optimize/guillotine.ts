import { EPSILON, area, type Rect } from "../geometry/rect.ts";
import { usableRect } from "../plan/context.ts";
import { orientations, placement, sizeOf, stockPool, type PackedSheet, type PackInput, type Packing } from "./pack.ts";

/** How a free rectangle is split after a part is placed in its top-left corner (Jylänki, "A Thousand Ways to Pack the Bin"). */
export type SplitRule = "short-axis" | "long-axis" | "min-area" | "max-area";

export const SPLIT_RULES: readonly SplitRule[] = ["short-axis", "long-axis", "min-area", "max-area"];

interface OpenSheet {
  sheet: PackedSheet;
  free: Rect[];
}

/**
 * Best-area-fit guillotine packing over all open sheets. Parts and free rectangles are grown by one kerf on their
 * far edges, so placed parts are at least one kerf apart and may still touch the far edge of the usable area.
 */
export function guillotinePack(input: PackInput, rule: SplitRule): Packing {
  const { ctx } = input;
  const kerf = ctx.kerf;
  const pool = stockPool(input);
  const open: OpenSheet[] = [];
  const unplaced: Packing["unplaced"] = [];

  for (const copy of input.order) {
    let best: { target: OpenSheet; index: number; rotated: boolean; fit: number; side: number } | null = null;
    const consider = (target: OpenSheet) => {
      target.free.forEach((free, index) => {
        for (const rotated of orientations(copy, input.rotation)) {
          const size = sizeOf(copy, rotated);
          const length = size.length + kerf;
          const width = size.width + kerf;
          if (length > free.length + EPSILON || width > free.width + EPSILON) continue;
          const fit = area(free) - length * width;
          const side = Math.min(free.length - length, free.width - width);
          if (!best || fit < best.fit - EPSILON || (Math.abs(fit - best.fit) <= EPSILON && side < best.side - EPSILON)) {
            best = { target, index, rotated, fit, side };
          }
        }
      });
    };
    for (const target of open) consider(target);
    if (!best) {
      const stock = pool.take(copy);
      if (stock === "no-stock") {
        unplaced.push({ part: copy.part.id, copy: copy.copy, reason: "no-stock" });
        continue;
      }
      const usable = usableRect(ctx, stock);
      const target: OpenSheet = {
        sheet: { stock, placements: [] },
        free: [{ ...usable, length: usable.length + kerf, width: usable.width + kerf }],
      };
      open.push(target);
      consider(target);
    }
    const chosen = best as { target: OpenSheet; index: number; rotated: boolean } | null;
    if (!chosen) {
      unplaced.push({ part: copy.part.id, copy: copy.copy, reason: "no-stock" });
      continue;
    }
    const free = chosen.target.free[chosen.index]!;
    const size = sizeOf(copy, chosen.rotated);
    chosen.target.sheet.placements.push(placement(copy, free.x, free.y, chosen.rotated));
    chosen.target.free.splice(chosen.index, 1, ...split(free, size.length + kerf, size.width + kerf, rule));
  }
  return { sheets: open.map((o) => o.sheet), unplaced };
}

function split(free: Rect, length: number, width: number, rule: SplitRule): Rect[] {
  const dl = free.length - length;
  const dw = free.width - width;
  const across: Rect[] = [
    { x: free.x + length, y: free.y, length: dl, width },
    { x: free.x, y: free.y + width, length: free.length, width: dw },
  ];
  const down: Rect[] = [
    { x: free.x + length, y: free.y, length: dl, width: free.width },
    { x: free.x, y: free.y + width, length, width: dw },
  ];
  const smaller = (rects: Rect[]) => Math.min(...rects.map(area));
  const useAcross =
    rule === "short-axis" ? dl <= dw
    : rule === "long-axis" ? dl > dw
    : rule === "min-area" ? smaller(across) <= smaller(down)
    : smaller(across) > smaller(down);
  return (useAcross ? across : down).filter((r) => r.length > EPSILON && r.width > EPSILON);
}
