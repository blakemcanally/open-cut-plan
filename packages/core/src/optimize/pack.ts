import type { Placement, Stock } from "../format/schema.ts";
import type { Size } from "../geometry/rect.ts";
import type { PlanContext } from "../plan/context.ts";
import { fitsStock, orientedSize, type Copy, type MaterialProblem, type UnplacedCopy } from "./problem.ts";

/** Which orientation a rotatable copy tries first: as defined, long side along the stock length, or short side along it. */
export type RotationPolicy = "keep" | "long" | "short";

export interface PackInput {
  ctx: PlanContext;
  problem: MaterialProblem;
  order: Copy[];
  /** Stock in the order new sheets are opened; offcuts come first. */
  stockOrder: Stock[];
  rotation: RotationPolicy;
  /** Prefer to put a copy with a group on a sheet that already holds that group. */
  affinity?: boolean;
}

export interface PackedSheet {
  stock: Stock;
  placements: Placement[];
}

export interface Packing {
  sheets: PackedSheet[];
  unplaced: UnplacedCopy[];
}

export function orientations(copy: Copy, policy: RotationPolicy): boolean[] {
  if (copy.orientations.length < 2 || policy === "keep") return copy.orientations;
  const longAlongLength = copy.part.length >= copy.part.width;
  return (policy === "long") === longAlongLength ? [false, true] : [true, false];
}

export function sizeOf(copy: Copy, rotated: boolean): Size {
  return orientedSize(copy.part, rotated);
}

export function placement(copy: Copy, x: number, y: number, rotated: boolean): Placement {
  return { part: copy.part.id, copy: copy.copy, x, y, rotated };
}

export interface StockPool {
  /** The next stock in order that has pieces left and fits the copy, or the reason there is none. */
  take(copy: Copy): Stock | "no-stock";
}

export function stockPool(input: PackInput): StockPool {
  const left = new Map(input.problem.available);
  return {
    take(copy) {
      for (const stock of input.stockOrder) {
        const n = left.get(stock.id);
        if (n === 0 || n === undefined) continue;
        if (!copy.orientations.some((r) => fitsStock(input.ctx, stock, orientedSize(copy.part, r)))) continue;
        if (n !== null) left.set(stock.id, n - 1);
        return stock;
      }
      return "no-stock";
    },
  };
}
