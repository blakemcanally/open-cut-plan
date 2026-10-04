import { EPSILON, sizeAlong, type Rect } from "../geometry/rect.ts";
import { formatIn, type PlanContext } from "../plan/context.ts";
import type { Step } from "../sequence/sequence.ts";
import { describeStep } from "../sequence/text.ts";
import { toolWarning } from "./colors.ts";

export interface SequenceRow {
  step: number;
  sheetNumber: number;
  /** Null for a cut that no enabled tool can make. */
  tool: string | null;
  /** "No tool" when `tool` is null. */
  toolName: string;
  /** For example `Fence 15 3/8"`, `Stop 24"`, `Mark 12" from the top`, or `Trim 1/4" off the left`. */
  setting: string;
  /** The part copies that the cut makes free, as in the results of `describeStep`. */
  parts: string[];
  /** True for a cut with no tool, or over a limit of its tool. */
  warning: boolean;
}

function edge(piece: Rect, side: Rect, axis: Step["axis"]): string {
  if (axis === "y") return side.y <= piece.y + EPSILON ? "top" : "bottom";
  return side.x <= piece.x + EPSILON ? "left" : "right";
}

function setting(ctx: PlanContext, step: Step): string {
  if (step.kind === "trim") {
    const amount = formatIn(ctx, sizeAlong(step.piece, step.axis) - sizeAlong(step.remainder, step.axis));
    return `Trim ${amount} off the ${edge(step.piece, step.released, step.axis)}`;
  }
  const value = formatIn(ctx, step.setting);
  const type = step.tool?.type;
  if (type === "table-saw" && step.axis === "y") return `Fence ${value}`;
  if (type === "table-saw" || type === "panel-saw") return `Stop ${value}`;
  return `Mark ${value} from the ${edge(step.piece, step[step.side], step.axis)}`;
}

/** One short row for each step, for a printed checklist at the saw. */
export function sequenceRows(ctx: PlanContext, steps: readonly Step[]): SequenceRow[] {
  return steps.map((step) => ({
    step: step.step,
    sheetNumber: step.sheetNumber,
    tool: step.tool?.id ?? null,
    toolName: step.tool?.name ?? "No tool",
    setting: setting(ctx, step),
    parts: describeStep(ctx, step)
      .results.filter((result) => result.kind === "part")
      .flatMap((result) => result.parts),
    warning: toolWarning(step),
  }));
}
