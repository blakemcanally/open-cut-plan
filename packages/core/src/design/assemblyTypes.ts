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
