import type { Tool } from "../format/schema.ts";
import { EPSILON, fitsWithin, sizeAlong, type Axis, type Rect } from "../geometry/rect.ts";

export type CutKind = "rip" | "crosscut" | "trim";

/** The side of the cut whose size is set on the fence, stop, or mark. */
export type SettingSide = "released" | "remainder";

export interface CutGeometry {
  kind?: CutKind;
  axis: Axis;
  stage: number;
  /** Length of the cut line. */
  length: number;
  piece: Rect;
  released: Rect;
  remainder: Rect;
}

export interface ToolChoice {
  tool: Tool;
  side: SettingSide;
}

/** Cuts along the stock length (lines of constant y) are rips; lines of constant x are crosscuts. */
export function cutKind(axis: Axis, trim: boolean): CutKind {
  if (trim) return "trim";
  return axis === "y" ? "rip" : "crosscut";
}

const within = (value: number, limit: number | undefined) => limit === undefined || value <= limit + EPSILON;

/**
 * The released side, unless a non-trim cut releases a zero-size sliver (narrower than the kerf). Trim text never shows
 * the setting, so trims keep the released side.
 */
export function measuredSide(cut: Pick<CutGeometry, "kind" | "axis" | "released">): SettingSide {
  return cut.kind === "trim" || sizeAlong(cut.released, cut.axis) > EPSILON ? "released" : "remainder";
}

export function toolCanCut(tool: Tool, cut: CutGeometry, limits: boolean): SettingSide | null {
  const side = measuredSide(cut);
  if (!limits) return side;
  switch (tool.type) {
    case "table-saw": {
      if (tool.maxPiece && !fitsWithin(cut.piece, tool.maxPiece)) return null;
      if (cut.axis === "x") return within(cut.length, tool.maxCrosscut) ? side : null;
      if (side === "released" && within(sizeAlong(cut.released, "y"), tool.maxRip)) return "released";
      if (within(sizeAlong(cut.remainder, "y"), tool.maxRip)) return "remainder";
      return null;
    }
    case "track-saw":
    case "circular-saw":
      return within(cut.length, tool.maxCut) ? side : null;
    case "panel-saw":
      return within(cut.length, tool.maxCut) && (tool.maxStages === undefined || cut.stage <= tool.maxStages) ? side : null;
  }
}

/** The first tool, in profile order, that can make the cut. */
export function assignTool(tools: readonly Tool[], cut: CutGeometry, limits: boolean): ToolChoice | null {
  for (const tool of tools) {
    const side = toolCanCut(tool, cut, limits);
    if (side) return { tool, side };
  }
  return null;
}
