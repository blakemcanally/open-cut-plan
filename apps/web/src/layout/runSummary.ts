import { formatArea, formatIn, type PlanContext, type PlanStats } from "@opencutplan/core";
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
