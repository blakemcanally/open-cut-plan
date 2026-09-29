import type { PlanSheet, Project } from "../format/schema.ts";
import { area } from "../geometry/rect.ts";
import { planContext } from "../plan/context.ts";
import type { PlanIssue } from "../plan/issues.ts";
import { checkLayout } from "../plan/layout.ts";
import { analyzeSheets } from "../plan/sheets.ts";
import { checkCuts } from "../plan/validate.ts";
import { listOffcuts } from "../reports/offcuts.ts";
import { sequenceCuts } from "../sequence/sequence.ts";
import type { Packing } from "./pack.ts";
import type { MaterialProblem, Problem, UnplacedCopy } from "./problem.ts";

/** Compared in field order; see `compareScores`. */
export interface Score {
  /** Copies that could not be placed. Fewer is better. */
  unplaced: number;
  /** Stock cost, or stock area when prices are missing or the cost feature is off. Owned offcuts count as 0. Lower is better. */
  cost: number;
  /** Area of the largest offcut. Bigger is better. */
  largestOffcut: number;
  /** Cut steps, including trims. Fewer is better. */
  cuts: number;
  sheets: number;
}

export interface Evaluated {
  sheets: PlanSheet[];
  unplaced: UnplacedCopy[];
  score: Score;
}

const RELATIVE = 1e-9;

function differ(a: number, b: number): boolean {
  return Math.abs(a - b) > RELATIVE * Math.max(1, Math.abs(a), Math.abs(b));
}

/** Negative when `a` is better than `b`, positive when worse, 0 when equal. */
export function compareScores(a: Score, b: Score): number {
  if (a.unplaced !== b.unplaced) return a.unplaced - b.unplaced;
  if (differ(a.cost, b.cost)) return a.cost - b.cost;
  if (differ(a.largestOffcut, b.largestOffcut)) return b.largestOffcut - a.largestOffcut;
  if (a.cuts !== b.cuts) return a.cuts - b.cuts;
  return a.sheets - b.sheets;
}

/** True when the material is scored by price: the cost feature is on and every sheet stock of it has a price. */
export function pricedMaterial(problem: Problem, material: MaterialProblem): boolean {
  return problem.ctx.features.cost && material.stock.every((s) => s.kind === "offcut" || s.cost !== undefined);
}

/**
 * Validates a packing with the same checks as a manual layout and drops every sheet that has an error;
 * the parts of a dropped sheet become unplaced. A plan-wide `no-tool` error (no tool is enabled) drops nothing.
 */
export function evaluate(problem: Problem, material: MaterialProblem, packing: Packing, prefix: string): Evaluated {
  const sheets: PlanSheet[] = packing.sheets.map((s, i) => ({ id: `${prefix}${i + 1}`, stock: s.stock.id, placements: s.placements }));
  const project: Project = { ...problem.ctx.project, plan: { sheets } };
  const ctx = planContext(project);
  const analyses = analyzeSheets(ctx);
  const steps = sequenceCuts(ctx, analyses);
  const layout = checkLayout(ctx);
  const issues = [...layout, ...checkCuts(ctx, layout, analyses, steps)];

  const dropped = new Map<string, "no-tool" | "not-guillotine">();
  for (const issue of issues) {
    if (issue.severity !== "error") continue;
    for (const id of sheetsOf(issue)) {
      if (dropped.get(id) !== "no-tool") dropped.set(id, issue.code === "no-tool" ? "no-tool" : "not-guillotine");
    }
  }

  const unplaced = [...material.tooLarge, ...packing.unplaced];
  const kept: PlanSheet[] = [];
  for (const sheet of sheets) {
    const reason = dropped.get(sheet.id);
    if (reason === undefined) kept.push(sheet);
    else for (const p of sheet.placements) unplaced.push({ part: p.part, copy: p.copy, reason });
  }
  const keptIds = new Set(kept.map((s) => s.id));
  const keptAnalyses = analyses.filter((a) => keptIds.has(a.sheet.id));
  const priced = pricedMaterial(problem, material);
  let cost = 0;
  for (const a of keptAnalyses) {
    if (a.stock.kind === "offcut") continue;
    cost += priced ? (a.stock.cost ?? 0) : area(a.stock);
  }
  const largestOffcut = Math.max(0, ...listOffcuts(ctx, keptAnalyses).map((o) => area(o.rect)));
  const order = new Map(problem.ctx.project.parts.map((p, i) => [p.id, i]));
  unplaced.sort((a, b) => (order.get(a.part) ?? 0) - (order.get(b.part) ?? 0) || a.copy - b.copy);
  return {
    sheets: kept,
    unplaced,
    score: {
      unplaced: unplaced.length,
      cost,
      largestOffcut,
      cuts: steps.filter((s) => keptIds.has(s.sheet)).length,
      sheets: kept.length,
    },
  };
}

function sheetsOf(issue: PlanIssue): string[] {
  const ids = new Set<string>();
  for (const ref of issue.refs) {
    if (ref.kind === "sheet" || ref.kind === "placement" || ref.kind === "cut") ids.add(ref.sheet);
  }
  return [...ids];
}
