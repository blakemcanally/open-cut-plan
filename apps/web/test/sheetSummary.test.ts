import { analyzeProject, defaultTools, sequencePlan, setToolChoice } from "@opencutplan/core";
import { describe, expect, it } from "vitest";
import { sheetSummary, summaryItems, type SheetSummary } from "../src/layout/sheetSummary.ts";
import { formatMoney } from "../src/reports/money.ts";
import { sampleProject } from "./helpers.ts";

const summaryText = (summary: SheetSummary, currency: string) =>
  summaryItems(summary, currency)
    .map((item) => item.text)
    .join(" · ");

function twoTools() {
  const project = sampleProject();
  project.tools = defaultTools("in");
  return setToolChoice(project, sequencePlan(project)[0]!, "table-saw");
}

describe("sheetSummary", () => {
  it("counts the cuts of each tool in profile order, and gives the share of the sheet that parts use and its cost", () => {
    const analysis = analyzeProject(twoTools());
    const summary = sheetSummary(analysis, "s1");
    expect(summary).toEqual({
      tools: [
        { tool: "table-saw", name: "Table saw", cuts: 1 },
        { tool: "track-saw", name: "Track saw", cuts: analysis.steps.length - 1 },
      ],
      utilization: (2 * 30 * 12) / (96 * 48),
      cost: 60,
    });
    expect(summaryText(summary, "USD")).toBe(`Table saw 1 cut · Track saw ${analysis.steps.length - 1} cuts · 16% used · ${formatMoney(60, "USD")}`);
    expect(summaryItems(summary, "USD").map((item) => item.tool)).toEqual(["table-saw", "track-saw", undefined, undefined]);
  });

  it("counts the cuts with no tool last, and leaves out the cost when the cost feature is off", () => {
    const project = sampleProject();
    project.tools[0]!.enabled = false;
    project.settings.features.cost = false;
    const analysis = analyzeProject(project);
    const summary = sheetSummary(analysis, "s1");
    expect(summary.tools).toEqual([{ tool: null, name: "No tool", cuts: analysis.steps.length }]);
    expect(summary.cost).toBeNull();
    expect(summaryText(summary, "USD")).toBe(`No tool ${analysis.steps.length} cuts · 16% used`);
    expect(summaryItems(summary, "USD")[0]!.tool).toBeNull();
  });

  it("gives an empty sheet no cuts, and leaves out a stock with no price", () => {
    const project = sampleProject();
    delete project.stock[0]!.cost;
    project.plan!.sheets[0]!.placements = [];
    const summary = sheetSummary(analyzeProject(project), "s1");
    expect(summary).toEqual({ tools: [], utilization: 0, cost: null });
    expect(summaryText(summary, "USD")).toBe("0% used");
  });

  it("gives no cuts when the cut order is off", () => {
    const project = sampleProject();
    project.settings.features.cutOrder = false;
    expect(sheetSummary(analyzeProject(project), "s1").tools).toEqual([]);
  });
});
