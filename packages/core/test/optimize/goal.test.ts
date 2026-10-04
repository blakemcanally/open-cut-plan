import { describe, expect, it } from "vitest";
import { analyzeProject } from "../../src/analysis.ts";
import type { Score } from "../../src/optimize/evaluate.ts";
import { compareChoice, compareOffcuts, createTradeOffs, describeGoal, extraCostPercent } from "../../src/optimize/goal.ts";
import { projectGoal } from "../../src/optimize/goal-setting.ts";
import { validatePlan } from "../../src/plan/validate.ts";
import { sampleProject } from "../helpers.ts";

const score = (over: Partial<Score>): Score => ({ unplaced: 0, cost: 100, largestOffcut: 0, offcuts: [], cuts: 10, cutLength: 500, sheets: 1, groupSpread: 0, ...over });

describe("compareOffcuts", () => {
  it("prefers the larger first area, then the larger second area, then the longer list", () => {
    expect(compareOffcuts([50], [40, 40])).toBeLessThan(0);
    expect(compareOffcuts([50, 10], [50, 20])).toBeGreaterThan(0);
    expect(compareOffcuts([50, 10], [50])).toBeLessThan(0);
    expect(compareOffcuts([], [1])).toBeGreaterThan(0);
    expect(compareOffcuts([50 + 1e-12], [50])).toBe(0);
    expect(compareOffcuts([], [])).toBe(0);
  });
});

describe("createTradeOffs", () => {
  it("chooses the best goal within the limit of the cheapest cost", () => {
    const list = createTradeOffs<string>("offcuts", 10);
    list.add(score({ cost: 100, offcuts: [10] }), "cheap");
    list.add(score({ cost: 108, offcuts: [90] }), "big offcut");
    list.add(score({ cost: 115, offcuts: [99] }), "too dear");
    expect(list.chosen()?.item).toBe("big offcut");
    expect(list.cheapest).toBe(100);
  });

  it("drops a plan when a cheaper plan moves the limit below it", () => {
    const list = createTradeOffs<string>("cuts", 10);
    list.add(score({ cost: 105, cuts: 3 }), "few cuts");
    list.add(score({ cost: 110, cuts: 20 }), "dear");
    list.add(score({ cost: 94, cuts: 30 }), "cheapest");
    expect(list.chosen()?.item).toBe("cheapest");
    expect(list.cheapest).toBe(94);
  });

  it("keeps a plan that costs exactly the limit", () => {
    const list = createTradeOffs<string>("cuts", 10);
    list.add(score({ cost: 100, cuts: 9 }), "cheap");
    list.add(score({ cost: 110, cuts: 2 }), "at the limit");
    expect(list.chosen()?.item).toBe("at the limit");
  });

  it("uses the plans with the fewest unplaced copies, and their own cheapest cost", () => {
    const list = createTradeOffs<string>("cuts", 10);
    list.add(score({ unplaced: 2, cost: 50, cuts: 1 }), "misses two");
    list.add(score({ unplaced: 0, cost: 200, cuts: 9 }), "fits");
    list.add(score({ unplaced: 1, cost: 10, cuts: 0 }), "misses one");
    expect(list.chosen()?.item).toBe("fits");
    expect(list.cheapest).toBe(200);
  });

  it("keeps the first of two equal plans, and uses the other scores to break a tie on the goal", () => {
    const list = createTradeOffs<string>("cuts", 10);
    list.add(score({ cuts: 5 }), "first");
    list.add(score({ cuts: 5 }), "second");
    expect(list.chosen()?.item).toBe("first");
    list.add(score({ cuts: 5, cost: 99 }), "cheaper");
    expect(list.chosen()?.item).toBe("cheaper");
  });

  it("chooses fewer cut steps, then the shorter cut length, for the goal cuts", () => {
    const list = createTradeOffs<string>("cuts", 10);
    list.add(score({ cuts: 5, cutLength: 300, largestOffcut: 90 }), "long");
    list.add(score({ cuts: 5, cutLength: 200 }), "short");
    expect(list.chosen()?.item).toBe("short");
    list.add(score({ cuts: 4, cutLength: 900 }), "fewer");
    expect(list.chosen()?.item).toBe("fewer");
  });

  it("starts from a given cheapest cost, and keeps a plan when no plan reaches that cost", () => {
    const list = createTradeOffs<string>("offcuts", 10, 100);
    list.add(score({ cost: 115, offcuts: [99] }), "over the start limit");
    expect(list.chosen()?.item).toBe("over the start limit");
    list.add(score({ cost: 109, offcuts: [5] }), "within");
    expect(list.chosen()?.item).toBe("within");
    expect(list.cheapest).toBe(100);
  });
});

describe("the group spread in the choice", () => {
  it("compares the group spread before the goal only when the groups stay together", () => {
    const spread = score({ groupSpread: 2, offcuts: [90], cuts: 3 });
    const together = score({ groupSpread: 0, offcuts: [10], cuts: 9 });
    for (const goal of ["offcuts", "cuts"] as const) {
      expect(compareChoice(goal, together, spread, true)).toBeLessThan(0);
      expect(compareChoice(goal, together, spread)).toBeGreaterThan(0);
    }
    expect(compareChoice("cost", score({ groupSpread: 1, largestOffcut: 50 }), score({ groupSpread: 0 }), true)).toBeGreaterThan(0);
  });

  it("keeps the groups together within the limit of the cheapest cost, and never goes over it", () => {
    const list = createTradeOffs<string>("offcuts", 10, Number.POSITIVE_INFINITY, true);
    list.add(score({ cost: 100, offcuts: [90], groupSpread: 3 }), "cheap");
    list.add(score({ cost: 108, offcuts: [10], groupSpread: 1 }), "together");
    list.add(score({ cost: 115, offcuts: [10], groupSpread: 0 }), "too dear");
    expect(list.chosen()?.item).toBe("together");
    const plain = createTradeOffs<string>("offcuts", 10);
    plain.add(score({ cost: 100, offcuts: [90], groupSpread: 3 }), "cheap");
    plain.add(score({ cost: 108, offcuts: [10], groupSpread: 1 }), "together");
    expect(plain.chosen()?.item).toBe("cheap");
  });
});

describe("extraCostPercent", () => {
  it("gives the extra cost in percent, rounded to one decimal, and 0 when the cheapest cost is 0", () => {
    expect(extraCostPercent(104.26, 100)).toBe(4.3);
    expect(extraCostPercent(100, 100)).toBe(0);
    expect(extraCostPercent(12, 0)).toBe(0);
  });
});

describe("describeGoal", () => {
  it("names the goal and the limit", () => {
    expect(describeGoal("cost", 10)).toBe("lowest cost");
    expect(describeGoal("offcuts", 10)).toBe("best offcuts, up to 10 % extra cost");
    expect(describeGoal("cuts", 0)).toBe("fewest cuts, with no extra cost");
  });
});

describe("the project goal", () => {
  it("uses the lowest cost for a goal that this app does not know, and says so", () => {
    const project = sampleProject();
    const unknown = { ...project, settings: { ...project.settings, optimizer: { ...project.settings.optimizer, goal: "time" } } };
    expect(projectGoal(unknown)).toBe("cost");
    expect(analyzeProject(unknown).issues.filter((issue) => issue.code === "unknown-goal")).toEqual([
      { severity: "warning", code: "unknown-goal", message: 'The optimizer goal "time" is not known to this app. The optimizer uses the lowest cost.', refs: [] },
    ]);
    expect(validatePlan(unknown).filter((issue) => issue.code === "unknown-goal")).toHaveLength(1);
    expect(analyzeProject(project).issues.some((issue) => issue.code === "unknown-goal")).toBe(false);
  });
});
