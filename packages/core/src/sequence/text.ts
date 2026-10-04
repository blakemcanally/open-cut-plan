import { EPSILON, sameRect, sizeAlong, type Axis, type Rect } from "../geometry/rect.ts";
import type { Tool } from "../format/schema.ts";
import { copyLabel, formatIn, formatSize, isOffcutSize, stockRect, type PlanContext } from "../plan/context.ts";
import type { Step } from "./sequence.ts";
import type { ToolLimit } from "./tools.ts";

export type StepResultKind = "part" | "next" | "offcut" | "waste";

export interface StepResult {
  kind: StepResultKind;
  /** Where this side is at the saw; only the measured side of a rip or a crosscut has it. */
  where: string | null;
  size: string;
  parts: string[];
  next: number | null;
}

export interface StepText {
  title: string;
  headline: string;
  method: string;
  pickUp: string;
  actions: string[];
  /** The measured side first; for a trim, the removed strip first. */
  results: StepResult[];
  body: string;
}

type Edge = "top" | "bottom" | "left" | "right";

const MEANING = {
  rip: "a cut along the length of the sheet",
  crosscut: "a cut across the length of the sheet",
  trim: "a cut that removes the rough factory edge",
} as const;

const AWAY: Readonly<Record<Edge, string>> = { top: "below", bottom: "above", left: "to the right of", right: "to the left of" };

export const LIMIT_WORDS: Readonly<Record<ToolLimit, string>> = {
  maxRip: "widest rip",
  maxCrosscut: "longest crosscut",
  maxPiece: "largest piece",
  maxCrosscutPiece: "largest piece for a crosscut",
  maxCut: "longest cut",
  maxStages: "most cut stages",
  crosscutOnly: "crosscuts only",
};

type PieceLimit = "maxPiece" | "maxCrosscutPiece";

/** The limit and its value, for example `widest rip 24"`. */
export function limitText(ctx: PlanContext, tool: Tool, limit: ToolLimit): string {
  if (limit === "crosscutOnly") return "it makes crosscuts only";
  const values = tool as Partial<Record<"maxRip" | "maxCrosscut" | "maxCut" | "maxStages", number> & Record<PieceLimit, { length: number; width: number }>>;
  if (limit === "maxPiece" || limit === "maxCrosscutPiece") return `${LIMIT_WORDS[limit]} ${formatIn(ctx, values[limit]!.length)} × ${formatIn(ctx, values[limit]!.width)}`;
  if (limit === "maxStages") return `${LIMIT_WORDS[limit]} ${values.maxStages}`;
  return `${LIMIT_WORDS[limit]} ${formatIn(ctx, values[limit]!)}`;
}

const LABEL: Readonly<Record<StepResultKind, string>> = { part: "Part", next: "Next", offcut: "Offcut", waste: "Waste" };

function edgeOf(piece: Rect, side: Rect, axis: Axis): Edge {
  if (axis === "y") return side.y <= piece.y + EPSILON ? "top" : "bottom";
  return side.x <= piece.x + EPSILON ? "left" : "right";
}

export function resultLabel(result: StepResult): string {
  return result.kind === "part" && result.parts.length > 1 ? "Parts" : LABEL[result.kind];
}

export function resultSentence(result: StepResult): string {
  const head = result.where === null ? `${resultLabel(result)}:` : `${resultLabel(result)} (${result.where}):`;
  const parts = result.parts.join(", ");
  switch (result.kind) {
    case "part":
      return `${head} ${parts}, ${result.size}.`;
    case "next":
      return `${head} ${result.size}${parts ? ` with ${parts}` : ""}, for step ${result.next}.`;
    case "offcut":
      return `${head} ${result.size}. Set it aside.`;
    case "waste":
      return `${head} ${result.size}.`;
  }
}

export function describeStep(ctx: PlanContext, step: Step): StepText {
  const sheet = ctx.project.plan?.sheets[step.sheetNumber - 1];
  const stock = sheet ? ctx.stock.get(sheet.stock) : undefined;
  const whole = stock !== undefined && sameRect(step.piece, stockRect(stock));
  const pieceWord = whole ? "sheet" : "panel";
  const size = formatSize(ctx, step.piece);
  const pickUp = whole
    ? `the full sheet ${size} (sheet ${step.sheetNumber})`
    : step.requires !== null
      ? `the panel ${size} from step ${step.requires}`
      : `the panel ${size} on sheet ${step.sheetNumber}`;
  const method = `${step.tool?.name ?? "No tool"} · ${step.kind}: ${MEANING[step.kind]}`;

  const names = (placements: readonly number[]) =>
    list(
      placements.map((index) => {
        const placement = sheet?.placements[index];
        const part = placement ? ctx.parts.get(placement.part) : undefined;
        return part && placement ? copyLabel(part, placement.copy) : "?";
      }),
    );
  const result = (rect: Rect, placements: readonly number[], next: number | null, where: string | null): StepResult => {
    const parts = names(placements);
    const kind: StepResultKind = next !== null ? "next" : parts.length > 0 ? "part" : isOffcutSize(ctx, rect) ? "offcut" : "waste";
    return { kind, where, size: formatSize(ctx, rect), parts, next };
  };
  const released = (where: string | null) => result(step.released, step.releasedPlacements, step.releasedNext, where);
  const remainder = (where: string | null) => result(step.remainder, step.remainderPlacements, step.remainderNext, where);
  const finish = (headline: string, stepActions: string[], results: StepResult[]): StepText => {
    const warning =
      step.tool === null
        ? "No enabled tool can make this cut. Check the Tools tab."
        : step.overLimit
          ? `This cut is over a limit of the ${step.tool.name}: ${limitText(ctx, step.tool, step.overLimit)}.`
          : null;
    const actions = warning ? [warning, ...stepActions] : stepActions;
    return {
      title: `Step ${step.step} · ${headline}`,
      headline,
      method,
      pickUp,
      actions,
      results,
      body: [`Pick up ${pickUp}.`, ...actions.map((action, i) => `${i + 1}. ${action}`), ...results.map(resultSentence)].join(" "),
    };
  };

  if (step.kind === "trim") {
    const edge = edgeOf(step.piece, step.released, step.axis);
    const amount = trimAmount(ctx, step);
    return finish(`Trim ${amount} off the ${edge} edge`, [`Cut ${amount} off the ${edge} edge.`], [released(null), remainder(null)]);
  }

  const setting = formatIn(ctx, step.setting);
  const length = formatIn(ctx, step.to - step.from);
  const edge = edgeOf(step.piece, step[step.side], step.axis);
  const headline = step.side === "released" ? `Cut ${setting} off the ${pieceWord}` : `Cut the ${pieceWord} to ${setting}`;
  const guide = guideOf(step);
  let actions: string[];
  let where: string;
  if (guide === "fence") {
    actions = [`Set the fence ${setting} from the blade.`, `Put a ${length} edge of the ${pieceWord} against the fence.`, "Make the cut."];
    where = "between the fence and the blade";
  } else if (guide === "stop") {
    actions = [`Set the stop ${setting} from the blade.`, `Put a ${length} edge of the ${pieceWord} against the stop.`, "Make the cut."];
    where = "at the stop";
  } else {
    const line = step.tool?.type === "track-saw" ? "Put the edge of the track on the marks." : "Clamp a straightedge so that the blade cuts next to the marks.";
    actions = [`Mark ${setting} from the ${edge} edge, at the two ends of the cut.`, line, `Cut with the blade ${AWAY[edge]} the marks.`];
    where = `the ${edge} piece`;
  }
  const results = step.side === "released" ? [released(where), remainder(null)] : [remainder(where), released(null)];
  return finish(headline, actions, results);
}

export type Guide = "fence" | "stop" | "marks";

export function guideOf(step: Pick<Step, "tool" | "axis">): Guide {
  const type = step.tool?.type;
  if (type === "table-saw") return step.axis === "y" ? "fence" : "stop";
  return type === "panel-saw" || type === "miter-saw" ? "stop" : "marks";
}

export function trimAmount(ctx: PlanContext, step: Step): string {
  return formatIn(ctx, sizeAlong(step.piece, step.axis) - sizeAlong(step.remainder, step.axis));
}

/** What the user sets on the saw for the step, for example `Table saw · fence at 15 3/8"`. */
export function setupLabel(ctx: PlanContext, step: Step): string {
  const tool = step.tool?.name ?? "No tool";
  if (step.kind === "trim") return `${tool} · trim ${trimAmount(ctx, step)}`;
  return `${tool} · ${guideOf(step)} at ${formatIn(ctx, step.setting)}`;
}

function list(names: readonly string[]): string[] {
  if (names.length <= 4) return [...names];
  return [...names.slice(0, 3), `and ${names.length - 3} more`];
}
