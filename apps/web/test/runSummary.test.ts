import { analyzeProject, formatIn, planStats, type Project } from "@opencutplan/core";
import { describe, expect, it } from "vitest";
import { comparisonLines, statsText } from "../src/layout/runSummary.ts";
import { formatMoney } from "../src/reports/money.ts";
import { sampleProject } from "./helpers.ts";

const withFeatures = (project: Project, features: Partial<Project["settings"]["features"]>): Project => ({
  ...project,
  settings: { ...project.settings, features: { ...project.settings.features, ...features } },
});

describe("statsText", () => {
  it("gives the sheets, the cost, the unplaced parts, and the cut length", () => {
    const project = sampleProject();
    const analysis = analyzeProject(project);
    const stats = planStats(project, analysis);
    expect(statsText(analysis.context, stats)).toBe(`1 sheet, ${formatMoney(60, "USD")}, 1 part unplaced, ${formatIn(analysis.context, stats.cutLength)} of cuts`);
  });

  it("gives the stock area when the cost feature is off, and no cut length when the cut order feature is off", () => {
    const project = withFeatures(sampleProject(), { cost: false, cutOrder: false });
    project.parts = project.parts.filter((part) => part.id === "side");
    const analysis = analyzeProject(project);
    expect(statsText(analysis.context, planStats(project, analysis))).toBe("1 sheet, 32.0 sq ft of stock, every part placed");
  });

  it("compares the plan before and after a run", () => {
    const project = withFeatures(sampleProject(), { cutOrder: false });
    const analysis = analyzeProject(project);
    const before = planStats(project, analysis);
    const after = { ...before, sheets: 2, cost: 120, unplacedCopies: 0 };
    const money = (value: number) => formatMoney(value, "USD");
    expect(comparisonLines(analysis.context, before, after)).toEqual([`Before: 1 sheet, ${money(60)}, 1 part unplaced.`, `After: 2 sheets, ${money(120)}, every part placed.`]);
  });
});
