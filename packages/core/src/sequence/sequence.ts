import type { Cut, PlanSheet, Project, Tool } from "../format/schema.ts";
import { otherAxis, sizeAlong, span, withSpan, type Axis, type Rect } from "../geometry/rect.ts";
import { formatIn, planContext, type PlanContext } from "../plan/context.ts";
import { nodeItems, type CutNode } from "../plan/cutTree.ts";
import { analyzeSheets, type SheetAnalysis } from "../plan/sheets.ts";
import { assignTool, cutKind, measuredSide, type CutKind, type SettingSide } from "./tools.ts";

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

/** Returns the project with each sheet's `cuts` set from the sequence; sheets without steps get no `cuts`. */
export function withCuts(project: Project): Project {
  if (!project.plan) return project;
  const steps = sequencePlan(project);
  const sheets = project.plan.sheets.map((sheet, index): PlanSheet => {
    const { cuts: _old, ...rest } = sheet;
    const cuts = steps.filter((step) => step.sheetNumber === index + 1).map(toCut);
    return cuts.length > 0 ? { ...rest, cuts } : rest;
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
  return ordered.map(({ id, ...cut }) => ({
    ...cut,
    step: stepOf.get(id)!,
    requires: step(cut.requires),
    releasedNext: step(cut.releasedNext),
    remainderNext: step(cut.remainderNext),
  }));
}

function collectSheet(ctx: PlanContext, analysis: SheetAnalysis, cuts: RawCut[]): void {
  const half = ctx.kerf / 2;
  const push = (geometry: Geometry, parent: RawCut | null, parentSide: SettingSide): RawCut => {
    const [from, to] = span(geometry.piece, otherAxis(geometry.axis));
    const choice = assignTool(ctx.tools, { ...geometry, length: to - from }, ctx.features.toolLimits);
    const side = choice?.side ?? measuredSide(geometry);
    const cut: RawCut = {
      ...geometry,
      id: cuts.length,
      sheet: analysis.sheet.id,
      sheetNumber: analysis.index + 1,
      from,
      to,
      tool: choice?.tool ?? null,
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

/**
 * Groups cuts that share a tool, cut kind, and displayed setting, taking any ready cut of the current setup before
 * switching. A cut is ready once the cut that makes its piece is done.
 */
function setupOrder(ctx: PlanContext, cuts: readonly RawCut[]): RawCut[] {
  const key = (cut: RawCut) => `${cut.tool?.id ?? ""}|${cut.kind}|${formatIn(ctx, cut.setting)}`;
  const done = new Set<number>();
  const ready = (cut: RawCut) => !done.has(cut.id) && (cut.requires === null || done.has(cut.requires));
  const order: RawCut[] = [];
  let current: string | null = null;
  while (order.length < cuts.length) {
    let next = current === null ? undefined : cuts.find((cut) => ready(cut) && key(cut) === current);
    if (!next) {
      next = cuts.find(ready)!;
      current = key(next);
    }
    done.add(next.id);
    order.push(next);
  }
  return order;
}
