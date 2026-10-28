import type { Board } from "./layout.ts";

/** A board of one unit: a box panel, the back or the front, or a divider or shelf board of `designLayout`. */
export type AssemblyBoard = { kind: "top" | "bottom" | "back" | "front" } | { kind: "side"; side: "left" | "right" } | Board;

/**
 * What a step does: drill or mark its boards, cut spacers, join its boards to each other off the unit (`subassembly`),
 * add its boards to the unit (`join`), check the diagonals (`square`), fit the legs, the feet, or the wall rail
 * (`mount`), fix the unit to the wall (`anchor`), or finish the surface of the unit with the finish steps of the design
 * (`finish`).
 */
export type AssemblyAction = "drill" | "mark" | "spacers" | "subassembly" | "join" | "square" | "mount" | "anchor" | "finish";

export interface AssemblyStep {
  title: string;
  body: string;
  action?: AssemblyAction;
  /** The boards that the step works on. A `join` step gives only the boards that it adds to the unit. */
  boards?: AssemblyBoard[];
}

/** The start of the first step when a design makes more than 1 unit, with a trailing space. */
export function buildCountText(quantity: number): string {
  return quantity > 1 ? `Build ${quantity} of these. The numbers in these steps are for one unit. ` : "";
}

export const LEFT: AssemblyBoard = { kind: "side", side: "left" };
export const RIGHT: AssemblyBoard = { kind: "side", side: "right" };
export const TOP: AssemblyBoard = { kind: "top" };
export const BOTTOM: AssemblyBoard = { kind: "bottom" };

export function joinList(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
