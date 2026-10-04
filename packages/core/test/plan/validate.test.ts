import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import { parseProject, sequencePlan, validatePlan, type Project } from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

function pinwheel(): Project {
  const project = sampleProject();
  project.settings.trim = 0;
  project.settings.features.kerf = false;
  project.parts = [
    { id: "long", name: "Long", material: "ply", length: 20, width: 10, quantity: 4, grain: "none" },
    { id: "center", name: "Center", material: "ply", length: 10, width: 10, quantity: 1, grain: "none" },
  ];
  project.plan!.sheets[0]!.placements = [
    { part: "long", copy: 0, x: 0, y: 0, rotated: false },
    { part: "long", copy: 1, x: 20, y: 0, rotated: true },
    { part: "long", copy: 2, x: 10, y: 20, rotated: false },
    { part: "long", copy: 3, x: 0, y: 10, rotated: true },
    { part: "center", copy: 0, x: 10, y: 10, rotated: false },
  ];
  return project;
}

describe("validatePlan", () => {
  it("accepts the sample project and the living-room shelf", () => {
    expect(validatePlan(sampleProject())).toEqual([]);
    const shelf = parseProject(EXAMPLES["living-room-shelf"]!());
    if (!shelf.ok) throw new Error("example did not load");
    expect(validatePlan(shelf.project)).toEqual([]);
  });

  it("reports a pinwheel as not guillotine, only while cut order is on", () => {
    const project = pinwheel();
    expect(validatePlan(project)).toEqual([
      {
        severity: "error",
        code: "not-guillotine",
        message: "Sheet 1: Long 1, Long 2, Long 3, Long 4, and Center cannot be cut free with straight cuts that run across the whole piece.",
        refs: [0, 1, 2, 3, 4].map((index) => ({ kind: "placement", sheet: "s1", index })),
      },
    ]);
    project.settings.features.cutOrder = false;
    expect(validatePlan(project)).toEqual([]);
  });

  it("does not report overlapping parts again as not guillotine", () => {
    const project = sampleProject();
    project.plan!.sheets[0]!.placements[1]!.y = 6;
    expect(validatePlan(project).map((issue) => issue.code)).toEqual(["overlap"]);
  });

  it("reports a part placed wholly off the sheet as off-sheet only", () => {
    const project = sampleProject();
    project.plan!.sheets[0]!.placements[1]!.x = 200;
    expect(validatePlan(project).map((issue) => issue.code)).toEqual(["off-sheet"]);
    const shelf = parseProject(EXAMPLES["living-room-shelf"]!());
    if (!shelf.ok) throw new Error("example did not load");
    shelf.project.stock[0]!.length = 30;
    expect(() => validatePlan(shelf.project)).not.toThrow();
  });

  it("reports one issue when no tool is enabled", () => {
    const project = sampleProject();
    project.tools[0]!.enabled = false;
    expect(validatePlan(project)).toEqual([
      { severity: "error", code: "no-tool", message: "No tool is enabled. Add a tool or enable one on the Tools tab.", refs: [] },
    ]);
  });

  it("reports each cut no tool can make, unless tool limits are off", () => {
    const project = sampleProject();
    project.tools = [{ id: "ts", name: "Table saw", type: "table-saw", kerf: 0.125, enabled: true, maxCrosscut: 24 }];
    expect(validatePlan(project).map((issue) => issue.message)).toEqual([
      'No tool in your profile can make cut 3 (a 47 1/2" trim cut).',
      'No tool in your profile can make cut 4 (a 47 1/2" trim cut).',
    ]);
    expect(validatePlan(project)[0]!.refs).toEqual([{ kind: "cut", sheet: "s1", step: 3 }]);
    project.settings.features.toolLimits = false;
    expect(validatePlan(project)).toEqual([]);
  });

  it("chooses a tree with more cut length when the shortest one needs a stage that no tool can make", () => {
    const project = sampleProject();
    project.parts = [
      { id: "long", name: "Long", material: "ply", length: 95.5, width: 20, quantity: 1, grain: "none" },
      { id: "small", name: "Small", material: "ply", length: 10, width: 25, quantity: 1, grain: "none" },
    ];
    project.plan!.sheets[0]!.placements = [
      { part: "long", copy: 0, x: 0.25, y: 0.25, rotated: false },
      { part: "small", copy: 0, x: 0.25, y: 22.75, rotated: false },
    ];
    const saw = { id: "ps", name: "Panel saw", type: "panel-saw", kerf: 0.125, enabled: true, maxCut: 100, maxStages: 2 } as const;
    project.tools = [saw];
    expect(validatePlan(project)).toEqual([]);
    expect(Math.max(...sequencePlan(project).map((step) => step.stage))).toBe(2);
    project.tools = [{ ...saw, maxStages: 3 }];
    expect(Math.max(...sequencePlan(project).map((step) => step.stage))).toBe(3);
  });
});
