import { describe, expect, it } from "vitest";
import { analyzeProject, planStats, samePlan, totalCutLength } from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

describe("planStats", () => {
  it("counts the sheets, the copies, the cuts, the cost, and the stock area of the plan", () => {
    const project = sampleProject();
    const stats = planStats(project);
    expect(stats).toMatchObject({
      sheets: 1,
      pinnedSheets: 0,
      copies: 2,
      placedCopies: 2,
      unplacedCopies: 0,
      currency: "USD",
      cost: 60,
      sheetsToBuy: 1,
      missingPrices: [],
      stockArea: 4608,
      utilization: 720 / 4608,
    });
    expect(stats.cutLength).toBe(totalCutLength(analyzeProject(project).steps));
    expect(stats.cutLength).toBeGreaterThan(0);
  });

  it("counts a copy in the tray as unplaced, and has no cost when the cost feature is off", () => {
    const project = sampleProject();
    project.plan!.sheets[0]!.placements.pop();
    project.settings = { ...project.settings, features: { ...project.settings.features, cost: false } };
    expect(planStats(project)).toMatchObject({ placedCopies: 1, unplacedCopies: 1, cost: null });
  });

  it("uses a given analysis of the same project", () => {
    const project = sampleProject();
    expect(planStats(project, analyzeProject(project))).toEqual(planStats(project));
  });
});

describe("samePlan", () => {
  it("is true only when the sheets and their placements are the same", () => {
    const project = sampleProject();
    const copy = structuredClone(project);
    expect(samePlan(project, copy)).toBe(true);
    copy.plan!.sheets[0]!.placements[1]!.x = 40;
    expect(samePlan(project, copy)).toBe(false);
    expect(samePlan({ ...project, plan: undefined }, { ...project, plan: { sheets: [] } })).toBe(true);
  });
});
