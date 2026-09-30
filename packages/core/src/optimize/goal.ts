import { compareScores, sameNumber, type Score } from "./evaluate.ts";
import type { OptimizerGoal } from "./goal-setting.ts";

const GOAL_NAMES: Readonly<Record<OptimizerGoal, string>> = { cost: "lowest cost", offcuts: "best offcuts", cuts: "fewest cuts" };

/** "lowest cost", or "best offcuts, up to 10 % extra cost". */
export function describeGoal(goal: OptimizerGoal, extra: number): string {
  if (goal === "cost") return GOAL_NAMES.cost;
  return extra > 0 ? `${GOAL_NAMES[goal]}, up to ${extra} % extra cost` : `${GOAL_NAMES[goal]}, with no extra cost`;
}

/** Negative when the offcut list `a` is better: the larger first area wins, then the larger second area, and so on. */
export function compareOffcuts(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined) return 1;
    if (y === undefined) return -1;
    if (!sameNumber(x, y)) return y - x;
  }
  return 0;
}

/** The order in which the search chooses among the plans within the cost limit. */
export function compareChoice(goal: OptimizerGoal, a: Score, b: Score): number {
  const byGoal = goal === "offcuts" ? compareOffcuts(a.offcuts, b.offcuts) : goal === "cuts" ? a.cuts - b.cuts : 0;
  return byGoal || compareScores(a, b);
}

export function costLimit(cheapest: number, extra: number): number {
  return cheapest * (1 + extra / 100);
}

export function withinLimit(cost: number, limit: number): boolean {
  return cost <= limit || sameNumber(cost, limit);
}

/** The extra cost of `cost` over `cheapest`, in percent, rounded to one decimal; 0 when `cheapest` is 0. */
export function extraCostPercent(cost: number, cheapest: number): number {
  if (cheapest <= 0 || withinLimit(cost, cheapest)) return 0;
  return Math.round(((cost - cheapest) / cheapest) * 1000) / 10;
}

export interface TradeOff<T> {
  score: Score;
  item: T;
}

export interface TradeOffs<T> {
  /** The lowest cost of the plans with the fewest unplaced copies so far. */
  readonly cheapest: number;
  add(score: Score, item: T): void;
  chosen(): TradeOff<T> | null;
}

/**
 * The plans of one material that no other plan beats on cost and on the choice order, among the plans with the fewest
 * unplaced copies. Plans over the cost limit leave the list, because the cheapest cost can only go down.
 */
export function createTradeOffs<T>(goal: OptimizerGoal, extra: number, cheapest = Number.POSITIVE_INFINITY): TradeOffs<T> {
  let entries: TradeOff<T>[] = [];
  let unplaced = Number.POSITIVE_INFINITY;
  let floor = cheapest;
  const notMore = (a: Score, b: Score) => withinLimit(a.cost, b.cost);
  const beats = (a: Score, b: Score) => notMore(a, b) && compareChoice(goal, a, b) <= 0;
  return {
    get cheapest() {
      return floor;
    },
    add(score, item) {
      if (score.unplaced > unplaced) return;
      if (score.unplaced < unplaced) {
        if (unplaced !== Number.POSITIVE_INFINITY) floor = Number.POSITIVE_INFINITY;
        unplaced = score.unplaced;
        entries = [];
      }
      floor = Math.min(floor, score.cost);
      if (entries.some((e) => beats(e.score, score))) return;
      entries = entries.filter((e) => !beats(score, e.score));
      entries.push({ score, item });
      const limit = costLimit(floor, extra);
      const kept = entries.filter((e) => withinLimit(e.score.cost, limit));
      // A start cost that no plan reaches again would otherwise leave the material with no plan.
      if (kept.length > 0) entries = kept;
    },
    chosen() {
      let best: TradeOff<T> | null = null;
      for (const entry of entries) {
        if (!best || compareChoice(goal, entry.score, best.score) < 0) best = entry;
      }
      return best;
    },
  };
}
