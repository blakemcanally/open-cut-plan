import { sameRect, sizeAlong, type Rect } from "../geometry/rect.ts";
import { copyLabel, formatIn, formatSize, isOffcutSize, stockRect, type PlanContext } from "../plan/context.ts";
import type { Step } from "./sequence.ts";

export interface StepText {
  title: string;
  body: string;
}

const KIND_WORD = { rip: "rip", crosscut: "crosscut", trim: "trim" } as const;

export function describeStep(ctx: PlanContext, step: Step): StepText {
  const title = `Step ${step.step}. ${step.tool?.name ?? "No tool"}, ${KIND_WORD[step.kind]}.`;
  const sheet = ctx.project.plan?.sheets[step.sheetNumber - 1];
  const stock = sheet ? ctx.stock.get(sheet.stock) : undefined;
  const whole = stock !== undefined && sameRect(step.piece, stockRect(stock));
  const sentences = [`Piece: sheet ${step.sheetNumber}, ${whole ? "full sheet" : "panel"} ${formatSize(ctx, step.piece)}.`];

  if (step.kind === "trim") {
    sentences.push(`Trim ${formatIn(ctx, sizeAlong(step.piece, step.axis) - sizeAlong(step.remainder, step.axis))} off the edge.`);
    return { title, body: sentences.join(" ") };
  }

  const setting = formatIn(ctx, step.setting);
  const tool = step.tool?.type;
  const fence = tool === "table-saw" && step.axis === "y";
  if (fence) sentences.push(`Fence at ${setting}.`);
  else if (tool === "table-saw" || tool === "panel-saw") sentences.push(`Set the stop at ${setting}.`);
  else sentences.push(`Mark ${setting} from the edge.`);

  const names = (placements: readonly number[]) =>
    placements.map((index) => {
      const placement = sheet?.placements[index];
      const part = placement ? ctx.parts.get(placement.part) : undefined;
      return part && placement ? copyLabel(part, placement.copy) : "?";
    });
  const summary = (placements: readonly number[], rect: Rect, next: number | null) => {
    const contents = placements.length > 0 ? list(names(placements)) : isOffcutSize(ctx, rect) ? `offcut ${formatSize(ctx, rect)}` : "waste";
    return next === null ? contents : `${contents}, next at step ${next}`;
  };
  const released = summary(step.releasedPlacements, step.released, step.releasedNext);
  const remainder = summary(step.remainderPlacements, step.remainder, step.remainderNext);
  const [measured, other] = step.side === "released" ? [released, remainder] : [remainder, released];
  sentences.push(`${fence ? "Fence side" : "Measured side"}: ${measured}. Other side: ${other}.`);
  return { title, body: sentences.join(" ") };
}

function list(names: readonly string[]): string {
  if (names.length <= 4) return names.join(", ");
  return `${names.slice(0, 3).join(", ")}, and ${names.length - 3} more`;
}
