import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import {
  defaultTools,
  describeStep,
  EPSILON,
  formatLength,
  parseProject,
  planContext,
  sequencePlan,
  setupKey,
  setupRuns,
  totalCutLength,
  withCuts,
  type Placement,
  type Project,
  type Step,
  type Tool,
} from "../../src/index.ts";
import { sampleProject, stripProject } from "../helpers.ts";

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
  it("orders the sample sheet: trims, a crosscut across the short side, then rips in the strip", () => {
    expect(sequencePlan(sampleProject()).map(summary)).toEqual([
      [1, "trim", '1/8"', null, null, 2],
      [2, "trim", '1/8"', 1, null, 3],
      [3, "trim", '1/8"', 2, null, 4],
      [4, "trim", '1/8"', 3, null, 5],
      [5, "crosscut", '30"', 4, 6, null],
      [6, "rip", '12"', 5, null, 7],
      [7, "rip", '12"', 6, null, null],
    ]);
  });

  it("rips strips first and crosscuts in each strip when that is shorter", () => {
    expect(sequencePlan(stripProject()).map(summary)).toEqual([
      [1, "trim", '1/8"', null, null, 2],
      [2, "trim", '1/8"', 1, null, 3],
      [3, "trim", '1/8"', 2, null, 4],
      [4, "trim", '1/8"', 3, null, 5],
      [5, "rip", '12"', 4, 7, 6],
      [6, "rip", '12"', 5, 8, null],
      [7, "crosscut", '90"', 5, null, null],
      [8, "crosscut", '90"', 6, null, null],
    ]);
  });

  it("sends the full-sheet cuts and the crosscuts of long strips to the track saw with the default tools", () => {
    const project = stripProject();
    project.tools = defaultTools("in");
    expect(sequencePlan(project).map((step) => step.tool?.id)).toEqual(Array(8).fill("track-saw"));
    const { maxCrosscutPiece: _, ...older } = project.tools[0] as Extract<Tool, { type: "table-saw" }>;
    project.tools[0] = older;
    expect(sequencePlan(project).map((step) => step.tool?.id)).toEqual([...Array(6).fill("track-saw"), "table-saw", "table-saw"]);
  });

  it("builds the cut tree around the crosscut piece limit of the table saw", () => {
    const project = sampleProject();
    project.tools[0] = { ...project.tools[0]!, type: "table-saw", maxCrosscutPiece: { length: 96, width: 12 } };
    const cuts = sequencePlan(project).filter((step) => step.kind !== "trim");
    expect(cuts.map((step) => [step.kind, step.tool?.id])).toEqual([
      ["rip", "ts"],
      ["rip", "ts"],
      ["crosscut", "ts"],
      ["crosscut", "ts"],
    ]);
  });

  it("describes the geometry of each cut", () => {
    const rip = sequencePlan(sampleProject())[5]!;
    expect(rip).toMatchObject({
      sheet: "s1",
      sheetNumber: 1,
      axis: "y",
      stage: 2,
      at: 12.3125,
      from: 0.25,
      to: 30.25,
      piece: { x: 0.25, y: 0.25, length: 30, width: 47.5 },
      released: { x: 0.25, y: 0.25, length: 30, width: 12 },
      remainder: { x: 0.25, y: 12.375, length: 30, width: 35.375 },
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
      [8, "crosscut", '~56 17/32"', 5, null, null],
      [9, "crosscut", '~56 17/32"', 6, null, null],
      [10, "crosscut", '~42 19/32"', 7, null, 11],
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

  it("finishes a saw setting before it starts a setting that a later cut of the first setting waits for", () => {
    const project = shelf();
    const [table, track] = defaultTools("in") as [Extract<Tool, { type: "table-saw" }>, Tool];
    const { maxCrosscutPiece: _, ...older } = table;
    project.tools = [older, track];
    project.settings.orderMode = "setup";
    const ctx = planContext(project);
    const keys = setupRuns(ctx, sequencePlan(project))
      .filter((run) => run[0]!.tool?.id === "table-saw")
      .map((run) => setupKey(ctx, run[0]!));
    expect(keys).toEqual(['table-saw|crosscut|56 17/32"', 'table-saw|crosscut|42 19/32"', 'table-saw|crosscut|27 7/32"', 'table-saw|crosscut|13 1/4"']);
  });

  it("keeps two rip settings that show at the same mark in one setup group", () => {
    const project = sampleProject();
    const ctx = planContext(project);
    const rip = sequencePlan(project).find((step) => step.kind === "rip")!;
    const exact = { ...rip, step: 1, setting: 13.1875 };
    const rounded = { ...rip, step: 2, setting: 13.188976378 };
    expect(formatLength(exact.setting, "in")).toBe('13 3/16"');
    expect(formatLength(rounded.setting, "in")).toBe('~13 3/16"');
    expect(setupKey(ctx, exact)).toBe(setupKey(ctx, rounded));
    expect(setupRuns(ctx, [exact, rounded])).toEqual([[exact, rounded]]);
  });

  it("keeps every cut in setup order, after the cut that makes its piece, with no more setup changes than sheet order", () => {
    const sizes = [
      [20, 10],
      [23, 11],
      [15, 8],
    ] as const;
    const cell = fc.record({ sheet: fc.integer({ min: 0, max: 2 }), x: fc.integer({ min: 0, max: 3 }), y: fc.integer({ min: 0, max: 3 }), size: fc.integer({ min: 0, max: 2 }) });
    fc.assert(
      fc.property(fc.array(cell, { maxLength: 18 }), fc.boolean(), (cells, defaults) => {
        const project = sampleProject();
        if (defaults) project.tools = defaultTools("in");
        project.parts = sizes.map(([length, width], i) => ({ id: `p${i}`, name: `P${i}`, material: "ply", length, width, quantity: 50, grain: "none" }));
        const used = new Set<string>();
        const sheets = [0, 1, 2].map((i) => ({ id: `s${i + 1}`, stock: "ply-4x8", placements: [] as Placement[] }));
        cells.forEach((c, copy) => {
          const key = `${c.sheet},${c.x},${c.y}`;
          if (used.has(key)) return;
          used.add(key);
          sheets[c.sheet]!.placements.push({ part: `p${c.size}`, copy, x: 0.25 + c.x * 24, y: 0.25 + c.y * 12, rotated: false });
        });
        project.plan = { sheets };
        const bySheet = sequencePlan(project);
        project.settings.orderMode = "setup";
        const bySetup = sequencePlan(project);
        const cut = (step: Step | undefined) => (step ? `${step.sheet}|${step.axis}|${step.at}|${step.from}|${step.to}` : null);
        const links = (steps: Step[]) => steps.map((step) => [cut(step), cut(steps[(step.requires ?? 0) - 1]), cut(steps[(step.releasedNext ?? 0) - 1]), cut(steps[(step.remainderNext ?? 0) - 1])].join(" "));
        expect(bySetup.map((step) => step.step)).toEqual(bySetup.map((_, i) => i + 1));
        for (const step of bySetup) {
          expect(step.requires ?? 0).toBeLessThan(step.step);
          expect(Math.min(step.releasedNext ?? Infinity, step.remainderNext ?? Infinity)).toBeGreaterThan(step.step);
        }
        expect(links(bySetup).sort()).toEqual(links(bySheet).sort());
        expect(setupChanges(bySetup)).toBeLessThanOrEqual(setupChanges(bySheet));
      }),
      { numRuns: 200 },
    );
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
    expect(steps).toHaveLength(8);
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
    expect([stop.side, stop.setting]).toEqual(["remainder", 30]);
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

describe("totalCutLength", () => {
  it("adds the length of every step, trims included", () => {
    expect(totalCutLength(sequencePlan(sampleProject()))).toBe(2 * 96 + 2 * 47.5 + 47.5 + 2 * 30);
    expect(totalCutLength(sequencePlan(stripProject()))).toBe(2 * 96 + 2 * 47.5 + 2 * 95.5 + 2 * 12);
    expect(totalCutLength([])).toBe(0);
  });
});

describe("withCuts", () => {
  it("writes the sequence into each sheet's cuts", () => {
    const cuts = withCuts(sampleProject()).plan!.sheets[0]!.cuts!;
    expect(cuts).toHaveLength(7);
    expect(cuts[0]).toEqual({ step: 1, stage: 1, axis: "y", at: 0.1875, from: 0, to: 96, tool: "ts", trim: true });
    expect(cuts[4]).toEqual({ step: 5, stage: 1, axis: "x", at: 30.3125, from: 0.25, to: 47.75, tool: "ts" });
  });

  it("removes stale cuts when there is no sequence", () => {
    const project = withCuts(sampleProject());
    project.settings.features.cutOrder = false;
    expect(withCuts(project).plan!.sheets[0]).not.toHaveProperty("cuts");
    const { plan: _plan, ...noPlan } = project;
    expect(withCuts(noPlan).plan).toBeUndefined();
  });
});
