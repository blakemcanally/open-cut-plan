import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import { defaultTools, describeStep, EPSILON, formatLength, parseProject, planContext, sequencePlan, withCuts, type Project, type Step } from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

function shelf(): Project {
  const result = parseProject(EXAMPLES["living-room-shelf"]!());
  if (!result.ok) throw new Error("example did not load");
  return result.project;
}

const summary = (step: Step) => [step.step, step.kind, formatLength(step.setting, "in"), step.requires, step.releasedNext, step.remainderNext];

function setupChanges(steps: Step[]): number {
  const key = (step: Step) => `${step.tool?.id}|${step.kind}|${formatLength(step.setting, "in")}`;
  return steps.filter((step, i) => i > 0 && key(step) !== key(steps[i - 1]!)).length;
}

describe("sequencePlan", () => {
  it("orders the sample sheet: trims, rips, then crosscuts in each strip", () => {
    expect(sequencePlan(sampleProject()).map(summary)).toEqual([
      [1, "trim", '1/8"', null, null, 2],
      [2, "trim", '1/8"', 1, null, 3],
      [3, "trim", '1/8"', 2, null, 4],
      [4, "trim", '1/8"', 3, null, 5],
      [5, "rip", '12"', 4, 7, 6],
      [6, "rip", '12"', 5, 8, null],
      [7, "crosscut", '30"', 5, null, null],
      [8, "crosscut", '30"', 6, null, null],
    ]);
  });

  it("sends the full-sheet cuts to the track saw and the strip crosscuts to the table saw with the default tools", () => {
    const project = sampleProject();
    project.tools = defaultTools("in");
    expect(sequencePlan(project).map((step) => step.tool?.id)).toEqual(["track-saw", "track-saw", "track-saw", "track-saw", "track-saw", "track-saw", "table-saw", "table-saw"]);
  });

  it("describes the geometry of each cut", () => {
    const rip = sequencePlan(sampleProject())[4]!;
    expect(rip).toMatchObject({
      sheet: "s1",
      sheetNumber: 1,
      axis: "y",
      stage: 1,
      at: 12.3125,
      from: 0.25,
      to: 95.75,
      piece: { x: 0.25, y: 0.25, length: 95.5, width: 47.5 },
      released: { x: 0.25, y: 0.25, length: 95.5, width: 12 },
      remainder: { x: 0.25, y: 12.375, length: 95.5, width: 35.375 },
      releasedPlacements: [0],
      remainderPlacements: [1],
      side: "released",
    });
    expect(rip.tool?.id).toBe("ts");
  });

  it("sequences every living-room-shelf sheet in sheet order", () => {
    const steps = sequencePlan(shelf());
    expect(steps).toHaveLength(76);
    expect(steps.filter((step) => step.sheetNumber === 1).map(summary)).toEqual([
      [1, "trim", '1/8"', null, null, 2],
      [2, "trim", '1/8"', 1, null, 3],
      [3, "trim", '1/8"', 2, null, 4],
      [4, "trim", '1/8"', 3, null, 5],
      [5, "rip", '15 3/8"', 4, 8, 6],
      [6, "rip", '15 3/8"', 5, 9, 7],
      [7, "rip", '15 3/8"', 6, 10, null],
      [8, "crosscut", '56 17/32"', 5, null, null],
      [9, "crosscut", '56 17/32"', 6, null, null],
      [10, "crosscut", '42 19/32"', 7, null, 11],
      [11, "crosscut", '13 1/4"', 10, null, null],
    ]);
    expect(steps.map((step) => step.sheetNumber)).toEqual(steps.map((step) => step.sheetNumber).sort((a, b) => a - b));
  });

  it("groups cuts with the same setup across sheets in setup order, respecting dependencies", () => {
    const project = shelf();
    const bySheet = sequencePlan(project);
    project.settings.orderMode = "setup";
    const bySetup = sequencePlan(project);
    expect(bySetup).toHaveLength(bySheet.length);
    expect(bySetup.map((step) => step.step)).toEqual(bySetup.map((_, i) => i + 1));
    for (const step of bySetup) expect(step.requires ?? 0).toBeLessThan(step.step);
    expect(setupChanges(bySetup)).toBeLessThan(setupChanges(bySheet));
    const cutsOf = (steps: Step[]) => steps.map((step) => `${step.sheetNumber}|${step.axis}|${step.at}`).sort();
    expect(cutsOf(bySetup)).toEqual(cutsOf(bySheet));
  });

  it("puts the remainder at the fence when the released side is wider than the rip capacity", () => {
    const project = sampleProject();
    project.parts[0] = { ...project.parts[0]!, width: 40, quantity: 1 };
    project.plan!.sheets[0]!.placements = [{ part: "side", copy: 0, x: 0.25, y: 0.25, rotated: false }];
    project.tools[0] = { id: "ts", name: "Table saw", type: "table-saw", kerf: 0.125, enabled: true, maxRip: 20 };
    const rip = sequencePlan(project).find((step) => step.kind === "rip")!;
    expect(rip.side).toBe("remainder");
    expect(rip.setting).toBe(7.375);
  });

  it("leaves steps without a tool when no tool is enabled (kerf 0, so the 1/8\" gap takes two cuts)", () => {
    const project = sampleProject();
    project.tools[0]!.enabled = false;
    const steps = sequencePlan(project);
    expect(steps).toHaveLength(9);
    expect(steps.every((step) => step.tool === null && step.side === "released")).toBe(true);
  });

  it("never sets the fence, stop, or mark to a zero-size sliver", () => {
    const gap = sampleProject();
    gap.plan!.sheets[0]!.placements[1]!.y = 12.4375;
    gap.tools[0] = { id: "ts", name: "Table saw", type: "table-saw", kerf: 0.125, enabled: true, maxRip: 40 };
    const edge = sampleProject();
    edge.plan!.sheets[0]!.placements[0]!.x = 0.28125;
    for (const project of [gap, edge]) {
      const ctx = planContext(project);
      const cuts = sequencePlan(project).filter((step) => step.kind !== "trim");
      for (const step of cuts) {
        expect(step.setting).toBeGreaterThan(EPSILON);
        expect(describeStep(ctx, step).actions.join(" ")).not.toMatch(/ 0" from /);
      }
    }
    const sliver = sequencePlan(gap).find((step) => step.at === 12.375)!;
    expect([sliver.side, sliver.setting]).toEqual(["remainder", 35.3125]);
    expect(describeStep(planContext(gap), sliver).actions[0]).toBe('Set the fence 35 5/16" from the blade.');
    const stop = sequencePlan(edge).find((step) => step.at === 0.21875)!;
    expect([stop.side, stop.setting]).toEqual(["remainder", 95.46875]);
  });

  it("gives every non-trim step of the examples a positive setting in both order modes", () => {
    for (const build of Object.values(EXAMPLES)) {
      for (const orderMode of ["sheet", "setup"] as const) {
        const result = parseProject(build());
        if (!result.ok) throw new Error("example did not load");
        result.project.settings.orderMode = orderMode;
        const cuts = sequencePlan(result.project).filter((step) => step.kind !== "trim");
        for (const step of cuts) expect(step.setting).toBeGreaterThan(EPSILON);
      }
    }
  });

  it("returns no steps when cut order is off, and none for an empty sheet", () => {
    const off = sampleProject();
    off.settings.features.cutOrder = false;
    expect(sequencePlan(off)).toEqual([]);
    const empty = sampleProject();
    empty.plan!.sheets[0]!.placements = [];
    expect(sequencePlan(empty)).toEqual([]);
  });
});

describe("withCuts", () => {
  it("writes the sequence into each sheet's cuts", () => {
    const cuts = withCuts(sampleProject()).plan!.sheets[0]!.cuts!;
    expect(cuts).toHaveLength(8);
    expect(cuts[0]).toEqual({ step: 1, stage: 1, axis: "y", at: 0.1875, from: 0, to: 96, tool: "ts", trim: true });
    expect(cuts[4]).toEqual({ step: 5, stage: 1, axis: "y", at: 12.3125, from: 0.25, to: 95.75, tool: "ts" });
  });

  it("removes stale cuts when there is no sequence", () => {
    const project = withCuts(sampleProject());
    project.settings.features.cutOrder = false;
    expect(withCuts(project).plan!.sheets[0]).not.toHaveProperty("cuts");
    const { plan: _plan, ...noPlan } = project;
    expect(withCuts(noPlan).plan).toBeUndefined();
  });
});
