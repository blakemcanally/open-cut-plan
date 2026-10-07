import type { Cut, CutToolChoice, PlanSheet, Project, Tool } from "../format/schema.ts";
import { EPSILON, otherAxis, sizeAlong, span, withSpan, type Axis, type Rect } from "../geometry/rect.ts";
import { formatIn, planContext, type PlanContext } from "../plan/context.ts";
import { nodeItems, type CutNode } from "../plan/cutTree.ts";
import { analyzeSheets, type SheetAnalysis } from "../plan/sheets.ts";
import { assignTool, cutKind, measuredSide, toolCanCut, toolLimit, type CutKind, type SettingSide, type ToolLimit } from "./tools.ts";

export interface Step {
  /** 1-based position in the shop order. */
  step: number;
  sheet: string;
  /** 1-based position of the sheet in `plan.sheets`. */
  sheetNumber: number;
  kind: CutKind;
  axis: Axis;
  stage: number;
  at: number;
  from: number;
  to: number;
  /** The piece on the saw, the side the cut separates off, and the side that continues. */
  piece: Rect;
  released: Rect;
  remainder: Rect;
  /** Placement indices on each side. */
  releasedPlacements: number[];
  remainderPlacements: number[];
  tool: Tool | null;
  /** The tool that the cut analysis picks; `tool` is another tool when a stored choice sets it. */
  recommended: Tool | null;
  chosen: boolean;
  /** The limit of `tool` that the cut is over, or null. */
  overLimit: ToolLimit | null;
  side: SettingSide;
  /** Size of `side` across the cut line: the fence, stop, or mark setting. */
  setting: number;
  /** The step that makes `piece`, or null for a sheet's first cut. */
  requires: number | null;
  /** The next step that cuts each side, or null when that side is a part, waste, or stuck. */
  releasedNext: number | null;
  remainderNext: number | null;
}

interface RawCut extends Omit<Step, "step" | "requires" | "releasedNext" | "remainderNext"> {
  id: number;
  requires: number | null;
  releasedNext: number | null;
  remainderNext: number | null;
}

type Geometry = Pick<Step, "kind" | "axis" | "stage" | "at" | "piece" | "released" | "remainder" | "releasedPlacements" | "remainderPlacements">;

export function sequencePlan(project: Project): Step[] {
  const ctx = planContext(project);
  return sequenceCuts(ctx, analyzeSheets(ctx));
}

/** The sum of the cut lines of the steps, trims included. */
export function totalCutLength(steps: readonly Pick<Step, "from" | "to">[]): number {
  return steps.reduce((sum, step) => sum + (step.to - step.from), 0);
}

export function matchesChoice(cut: Pick<Step, "axis" | "at" | "from" | "to">, choice: CutToolChoice): boolean {
  return cut.axis === choice.axis && Math.abs(cut.at - choice.at) <= EPSILON && Math.abs(cut.from - choice.from) <= EPSILON && Math.abs(cut.to - choice.to) <= EPSILON;
}

/** Returns the project with each sheet's `cuts` set from the sequence, and only the `toolChoices` that match a cut. */
export function withCuts(project: Project): Project {
  if (!project.plan) return project;
  const steps = sequencePlan(project);
  const sheets = project.plan.sheets.map((sheet, index): PlanSheet => {
    const { cuts: _old, toolChoices, ...rest } = sheet;
    const sheetSteps = steps.filter((step) => step.sheetNumber === index + 1);
    const cuts = sheetSteps.map(toCut);
    const next: PlanSheet = cuts.length > 0 ? { ...rest, cuts } : rest;
    const kept = project.settings.features.cutOrder ? (toolChoices ?? []).filter((choice) => sheetSteps.some((step) => matchesChoice(step, choice))) : (toolChoices ?? []);
    if (kept.length > 0) next.toolChoices = kept;
    return next;
  });
  return { ...project, plan: { ...project.plan, sheets } };
}

function toCut(step: Step): Cut {
  const cut: Cut = { step: step.step, stage: step.stage, axis: step.axis, at: step.at, from: step.from, to: step.to };
  if (step.tool) cut.tool = step.tool.id;
  if (step.kind === "trim") cut.trim = true;
  return cut;
}

/** Returns no steps when the cutOrder feature is off. */
export function sequenceCuts(ctx: PlanContext, sheets: readonly SheetAnalysis[]): Step[] {
  if (!ctx.features.cutOrder) return [];
  const cuts: RawCut[] = [];
  for (const sheet of sheets) collectSheet(ctx, sheet, cuts);
  const ordered = ctx.project.settings.orderMode === "setup" ? setupOrder(ctx, cuts) : cuts;
  const stepOf = new Map(ordered.map((cut, i) => [cut.id, i + 1]));
  const step = (id: number | null) => (id === null ? null : stepOf.get(id)!);
  return ordered.map((cut) => ({
    kind: cut.kind,
    axis: cut.axis,
    stage: cut.stage,
    at: cut.at,
    piece: cut.piece,
    released: cut.released,
    remainder: cut.remainder,
    releasedPlacements: cut.releasedPlacements,
    remainderPlacements: cut.remainderPlacements,
    sheet: cut.sheet,
    sheetNumber: cut.sheetNumber,
    from: cut.from,
    to: cut.to,
    tool: cut.tool,
    recommended: cut.recommended,
    chosen: cut.chosen,
    overLimit: cut.overLimit,
    side: cut.side,
    setting: cut.setting,
    requires: step(cut.requires),
    releasedNext: step(cut.releasedNext),
    remainderNext: step(cut.remainderNext),
    step: stepOf.get(cut.id)!,
  }));
}

function collectSheet(ctx: PlanContext, analysis: SheetAnalysis, cuts: RawCut[]): void {
  const half = ctx.kerf / 2;
  const choices = analysis.sheet.toolChoices ?? [];
  const push = (geometry: Geometry, parent: RawCut | null, parentSide: SettingSide): RawCut => {
    const [from, to] = span(geometry.piece, otherAxis(geometry.axis));
    const cutGeometry = { ...geometry, length: to - from };
    const limits = ctx.features.toolLimits;
    const recommended = assignTool(ctx.tools, cutGeometry, limits);
    const stored = choices.find((choice) => matchesChoice({ axis: geometry.axis, at: geometry.at, from, to }, choice));
    const chosen = stored ? ctx.tools.find((tool) => tool.id === stored.tool) : undefined;
    const tool = chosen ?? recommended?.tool ?? null;
    const side = chosen ? (toolCanCut(chosen, cutGeometry, limits) ?? measuredSide(geometry)) : (recommended?.side ?? measuredSide(geometry));
    const cut: RawCut = {
      ...geometry,
      id: cuts.length,
      sheet: analysis.sheet.id,
      sheetNumber: analysis.index + 1,
      from,
      to,
      tool,
      recommended: recommended?.tool ?? null,
      chosen: chosen !== undefined,
      overLimit: tool ? toolLimit(tool, cutGeometry, limits) : null,
      side,
      setting: sizeAlong(geometry[side], geometry.axis),
      requires: parent?.id ?? null,
      releasedNext: null,
      remainderNext: null,
    };
    if (parent && parentSide === "released") parent.releasedNext = cut.id;
    if (parent && parentSide === "remainder") parent.remainderNext = cut.id;
    cuts.push(cut);
    return cut;
  };

  let last: RawCut | null = null;
  const all = analysis.items.map((item) => item.index);
  for (const trim of analysis.tree.trims) {
    last = push({ ...trim, kind: "trim", stage: 1, releasedPlacements: [], remainderPlacements: all }, last, "remainder");
  }

  const walk = (node: CutNode, parent: RawCut | null, parentSide: SettingSide): void => {
    if (node.kind !== "split") return;
    const [, hi] = span(node.rect, node.axis);
    let start = span(node.rect, node.axis)[0];
    let previous = parent;
    let previousSide = parentSide;
    const releasedBy: RawCut[] = [];
    node.cuts.forEach((at, i) => {
      const remainderStart = Math.min(hi, Math.max(start, at + half));
      const cut = push(
        {
          kind: cutKind(node.axis, false),
          axis: node.axis,
          stage: node.stage,
          at,
          piece: withSpan(node.rect, node.axis, start, hi),
          released: node.children[i]!.rect,
          remainder: withSpan(node.rect, node.axis, remainderStart, hi),
          releasedPlacements: nodeItems(node.children[i]!),
          remainderPlacements: node.children.slice(i + 1).flatMap(nodeItems),
        },
        previous,
        previousSide,
      );
      releasedBy.push(cut);
      previous = cut;
      previousSide = "remainder";
      start = remainderStart;
    });
    node.children.forEach((child, i) => {
      if (i < node.cuts.length) walk(child, releasedBy[i]!, "released");
      else walk(child, previous, "remainder");
    });
  };
  walk(analysis.tree.root, last, "remainder");
}

/** Cuts with the same key share a tool, a cut kind, and a displayed setting, so the saw does not change between them. */
export function setupKey(ctx: PlanContext, cut: Pick<Step, "tool" | "kind" | "setting">): string {
  return `${cut.tool?.id ?? ""}|${cut.kind}|${formatIn(ctx, cut.setting).replace(/^~/, "")}`;
}

/** Consecutive steps with the same setup. */
export function setupRuns(ctx: PlanContext, steps: readonly Step[]): Step[][] {
  const runs: Step[][] = [];
  for (const step of steps) {
    const last = runs.at(-1);
    if (last && setupKey(ctx, last[0]!) === setupKey(ctx, step)) last.push(step);
    else runs.push([step]);
  }
  return runs;
}

/**
 * Groups cuts that share a setup, taking any ready cut of the current setup before switching. A cut is ready once the
 * cut that makes its piece is done. The next setup is the first, in sheet order, whose remaining cuts wait only for
 * cuts that are done or of the same setup, so that it can finish in one run; when no setup can, the first ready cut
 * starts the next setup.
 */
function setupOrder(ctx: PlanContext, cuts: readonly RawCut[]): RawCut[] {
  const keys = cuts.map((cut) => setupKey(ctx, cut));
  const done = new Set<number>();
  const ready = (cut: RawCut) => !done.has(cut.id) && (cut.requires === null || done.has(cut.requires));
  const blocked = () => {
    const out = new Set<string>();
    for (const cut of cuts) {
      if (done.has(cut.id)) continue;
      for (let r = cut.requires; r !== null && !done.has(r); r = cuts[r]!.requires) {
        if (keys[r] !== keys[cut.id]) {
          out.add(keys[cut.id]!);
          break;
        }
      }
    }
    return out;
  };
  const order: RawCut[] = [];
  let current: string | null = null;
  while (order.length < cuts.length) {
    let next: RawCut | undefined = current === null ? undefined : cuts.find((cut) => ready(cut) && keys[cut.id] === current);
    if (!next) {
      const waiting = blocked();
      const candidates = cuts.filter(ready);
      next = candidates.find((cut) => !waiting.has(keys[cut.id]!)) ?? candidates[0]!;
      current = keys[next.id]!;
    }
    done.add(next.id);
    order.push(next);
  }
  return order;
}
