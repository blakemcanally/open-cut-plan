import { EPSILON, type Rect } from "../geometry/rect.ts";
import { usableRect } from "../plan/context.ts";
import { orientations, placement, sizeOf, stockPool, type PackedSheet, type PackInput, type Packing } from "./pack.ts";
import type { Copy } from "./problem.ts";

/**
 * Rips strips along the stock length at the width of the first part in each strip, crosscuts the strip into
 * segments, and re-rips narrower parts out of the rest of each segment.
 */
export function stripPack(input: PackInput): Packing {
  const { ctx } = input;
  const kerf = ctx.kerf;
  const pool = stockPool(input);
  const pending = [...input.order];
  const sheets: PackedSheet[] = [];
  const unplaced: Packing["unplaced"] = [];
  const held = new Set<string>();

  const find = (fits: (length: number, width: number) => boolean, wanted: (copy: Copy) => boolean): { copy: Copy; rotated: boolean } | null => {
    for (let i = 0; i < pending.length; i++) {
      const copy = pending[i]!;
      if (!wanted(copy)) continue;
      for (const rotated of orientations(copy, input.rotation)) {
        const size = sizeOf(copy, rotated);
        if (fits(size.length, size.width)) {
          pending.splice(i, 1);
          if (copy.group !== null) held.add(copy.group);
          return { copy, rotated };
        }
      }
    }
    return null;
  };
  const take = (fits: (length: number, width: number) => boolean) =>
    (input.affinity && held.size > 0 ? find(fits, (copy) => copy.group !== null && held.has(copy.group)) : null) ?? find(fits, () => true);

  while (pending.length > 0) {
    const stock = pool.take(pending[0]!);
    if (stock === "no-stock") {
      const copy = pending.shift()!;
      unplaced.push({ part: copy.part.id, copy: copy.copy, reason: "no-stock" });
      continue;
    }
    const usable: Rect = usableRect(ctx, stock);
    const right = usable.x + usable.length + EPSILON;
    const bottom = usable.y + usable.width + EPSILON;
    const sheet: PackedSheet = { stock, placements: [] };
    held.clear();
    let y = usable.y;
    for (;;) {
      const starter = take((length, width) => usable.x + length <= right && y + width <= bottom);
      if (!starter) break;
      const height = sizeOf(starter.copy, starter.rotated).width;
      let x = usable.x;
      let next: { copy: Copy; rotated: boolean } | null = starter;
      while (next) {
        const segment = sizeOf(next.copy, next.rotated).length;
        let yy = y;
        let row: { copy: Copy; rotated: boolean } | null = next;
        while (row) {
          sheet.placements.push(placement(row.copy, x, yy, row.rotated));
          yy += sizeOf(row.copy, row.rotated).width + kerf;
          const top = yy;
          row = take((length, width) => length <= segment + EPSILON && top + width <= y + height + EPSILON);
        }
        x += segment + kerf;
        const left = x;
        next = take((length, width) => left + length <= right && width <= height + EPSILON);
      }
      y += height + kerf;
    }
    sheets.push(sheet);
  }
  return { sheets, unplaced };
}
