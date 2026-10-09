import { formatArea, formatIn, type OptimizeCutsResult, type PlanContext, type PlanStats } from "@opencutplan/core";
import { formatMoney } from "../reports/money.ts";

/** For example "3 sheets, $195.00, every part placed, 412" of cuts". The stock area takes the place of a cost that is not known. */
export function statsText(ctx: PlanContext, stats: PlanStats): string {
  const unplaced = stats.unplacedCopies;
  return [
    `${stats.sheets} ${stats.sheets === 1 ? "sheet" : "sheets"}`,
    stats.cost === null ? `${formatArea(stats.stockArea, ctx.units)} of stock` : formatMoney(stats.cost, stats.currency),
    unplaced === 0 ? "every part placed" : `${unplaced} ${unplaced === 1 ? "part" : "parts"} unplaced`,
    ...(ctx.features.cutOrder ? [`${formatIn(ctx, stats.cutLength)} of cuts`] : []),
  ].join(", ");
}

export function comparisonLines(ctx: PlanContext, before: PlanStats, after: PlanStats): [string, string] {
  return [`Before: ${statsText(ctx, before)}.`, `After: ${statsText(ctx, after)}.`];
}

/** One line for each searched sheet, for example "Sheet 1: 8 → 6 cuts, 272" → 258 1/2" of cuts." */
export function cutsLines(ctx: PlanContext, result: OptimizeCutsResult): string[] {
  return result.sheets.map((sheet) =>
    sheet.lines
      ? `Sheet ${sheet.number}: ${sheet.before.cuts} → ${sheet.after.cuts} cuts, ${formatIn(ctx, sheet.before.length)} → ${formatIn(ctx, sheet.after.length)} of cuts.`
      : `Sheet ${sheet.number}: ${sheet.before.cuts} cuts. No tree with fewer cuts was found.`,
  );
}

/** The part of the sheets that are done, from 0 to 1. */
export function cutsProgress(result: OptimizeCutsResult | null): number {
  if (!result || result.sheets.length === 0) return 0;
  return result.sheets.filter((sheet) => sheet.done).length / result.sheets.length;
}

/** For example "Sheet 3, pass 2 (2 of 4)". */
export function cutsStatus(result: OptimizeCutsResult | null): string {
  const index = result ? result.sheets.findIndex((sheet) => !sheet.done) : -1;
  const sheet = result?.sheets[index];
  if (!result || !sheet) return "Starting…";
  return `Sheet ${sheet.number}, pass ${sheet.passes + 1} (${index + 1} of ${result.sheets.length})`;
}
