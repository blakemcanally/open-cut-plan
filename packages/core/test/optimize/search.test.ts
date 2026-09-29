import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import type { Project } from "../../src/format/schema.ts";
import { createProject } from "../../src/format/defaults.ts";
import { parseProject } from "../../src/format/parse.ts";
import { applyOptimizeResult, createSearch, optimize } from "../../src/optimize/search.ts";
import { validatePlan } from "../../src/plan/validate.ts";
import { sampleProject } from "../helpers.ts";

function load(name: string): Project {
  const result = parseProject(EXAMPLES[name]!());
  if (!result.ok) throw new Error(name);
  return result.project;
}

const errors = (project: Project) => validatePlan(project).filter((i) => i.severity === "error");

describe("optimize", () => {
  it("plans the living-room shelf on at most 5 + 2 sheets with no errors", () => {
    const project = load("living-room-shelf");
    const result = optimize(project, { iterations: 20 });
    expect(result.unplaced).toEqual([]);
    expect(result.materials.map((m) => [m.material, m.score.sheets])).toEqual([
      ["bb18", 5],
      ["bb6", 2],
    ]);
    expect(errors(applyOptimizeResult(project, result))).toEqual([]);
  });

  it("plans the mm bookcase with its own saws and uses the owned offcut", () => {
    const project = load("simple-bookcase-mm");
    const result = optimize(project, { iterations: 30 });
    expect(result.unplaced).toEqual([]);
    expect(errors(applyOptimizeResult(project, result))).toEqual([]);
    expect(result.materials.map((m) => [m.material, m.score.cost])).toEqual([
      ["mdf18", 42],
      ["hdf3", 15],
    ]);
  });

  it("gives the same plan for the same seed and iteration count", () => {
    const project = load("living-room-shelf");
    const a = optimize(project, { iterations: 60, seed: 5 });
    const b = optimize(project, { iterations: 60, seed: 5 });
    expect(b).toEqual(a);
  });

  it("stops at the time limit and still returns a plan for every material", () => {
    const project = load("living-room-shelf");
    let clock = 0;
    const result = optimize(project, { timeLimitMs: 10, now: () => (clock += 1) });
    expect(result.materials).toHaveLength(2);
    expect(result.iterations).toBeGreaterThanOrEqual(2);
    expect(result.iterations).toBeLessThan(20);
  });

  it("uses an owned offcut before buying a sheet", () => {
    const project = sampleProject();
    project.stock.push({ id: "scrap", material: "ply", length: 40, width: 30, quantity: 1, kind: "offcut" });
    const result = optimize({ ...project, plan: { sheets: [] } }, { iterations: 20 });
    expect(result.sheets.map((s) => s.stock)).toEqual(["scrap"]);
    expect(result.materials[0]!.score.cost).toBe(0);
  });

  it("reports parts larger than every stock and parts past the stock quantity", () => {
    const project = sampleProject();
    project.stock[0]!.quantity = 1;
    project.parts = [
      { id: "big", name: "Big", material: "ply", length: 90, width: 40, quantity: 2, grain: "length" },
      { id: "huge", name: "Huge", material: "ply", length: 100, width: 10, quantity: 1, grain: "length" },
    ];
    const result = optimize({ ...project, plan: { sheets: [] } }, { iterations: 10 });
    expect(result.unplaced).toEqual([
      { part: "big", copy: 1, reason: "no-stock" },
      { part: "huge", copy: 0, reason: "too-large" },
    ]);
  });

  it("keeps pinned sheets unchanged and plans only the other copies", () => {
    const project = load("living-room-shelf");
    const pinned = { ...project.plan!.sheets[0]!, pinned: true };
    const input = { ...project, plan: { sheets: [pinned, ...project.plan!.sheets.slice(1)] } };
    const result = optimize(input, { iterations: 10 });
    expect(result.sheets[0]).toEqual(pinned);
    const ids = result.sheets.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const placed = result.sheets.flatMap((s) => s.placements.map((p) => `${p.part}#${p.copy}`));
    expect(new Set(placed).size).toBe(placed.length);
    expect(placed).toHaveLength(31);
    expect(errors(applyOptimizeResult(input, result))).toEqual([]);
  });

  it("continues from a previous result and never gets worse", () => {
    const project = load("simple-bookcase-mm");
    const first = optimize(project, { iterations: 5 });
    const more = optimize(project, { iterations: 30, start: first });
    expect(more.iterations).toBe(first.iterations + 60);
    first.materials.forEach((m, i) => {
      const next = more.materials[i]!.score;
      expect(next.unplaced).toBeLessThanOrEqual(m.score.unplaced);
      expect(next.cost).toBeLessThanOrEqual(m.score.cost);
    });
  });

  it("keeps the reason of copies a previous result left unplaced", () => {
    const project = sampleProject();
    const first = optimize(project, { iterations: 3 });
    const start = {
      ...first,
      sheets: [],
      unplaced: [
        { part: "side", copy: 0, reason: "no-tool" as const },
        { part: "side", copy: 1, reason: "no-tool" as const },
      ],
    };
    expect(createSearch(project, { start }).result().unplaced.map((u) => u.reason)).toEqual(["no-tool", "no-tool"]);
  });

  it("accounts for every copy when the result is read before the first step", () => {
    const project = load("living-room-shelf");
    const result = createSearch(project).result();
    expect(result.materials.map((m) => m.material)).toEqual(["bb18", "bb6"]);
    const placed = result.sheets.flatMap((s) => s.placements).length;
    const copies = project.parts.reduce((n, p) => n + p.quantity, 0);
    expect(placed + result.unplaced.length).toBe(copies);
  });

  it("drops copies that a new pinned sheet holds when searching on from an older result", () => {
    const project = load("living-room-shelf");
    const first = optimize(project, { iterations: 20 });
    const moved = first.sheets[0]!.placements[0]!;
    const edited: Project = {
      ...project,
      plan: { sheets: [...first.sheets, { id: "p1", stock: first.sheets[0]!.stock, pinned: true, placements: [{ ...moved, x: 0.25, y: 0.25 }] }] },
    };
    for (const seed of [1, 7]) {
      const result = optimize(edited, { start: first, iterations: 1, seed });
      const keys = result.sheets.flatMap((s) => s.placements.map((p) => `${p.part}#${p.copy}`));
      expect(new Set(keys).size).toBe(keys.length);
      expect(errors(applyOptimizeResult(edited, result))).toEqual([]);
    }
  });

  it("keeps no more seeded sheets than the stock now allows", () => {
    const project = sampleProject();
    project.parts[0]!.quantity = 20;
    const first = optimize(project, { iterations: 5 });
    expect(first.sheets.length).toBeGreaterThan(1);
    project.stock[0]!.quantity = 1;
    const result = createSearch(project, { start: first, iterations: 1 }).result();
    expect(result.sheets).toHaveLength(1);
    expect(errors(applyOptimizeResult(project, result))).toEqual([]);
  });

  it("runs one candidate per material when iterations is 0 or less", () => {
    expect(optimize(sampleProject(), { iterations: 0 }).iterations).toBe(1);
    expect(optimize(sampleProject(), { iterations: -5 }).iterations).toBe(1);
  });

  it("returns at once when there is nothing to plan", () => {
    const project = { ...sampleProject(), parts: [], plan: { sheets: [] } };
    expect(optimize(project, { now: () => 0 })).toEqual({ sheets: [], unplaced: [], materials: [], iterations: 0 });
  });

  it("steps in slices until finished", () => {
    const search = createSearch(load("living-room-shelf"), { iterations: 3 });
    let steps = 0;
    while (!search.step(0)) steps++;
    expect(steps).toBeGreaterThan(0);
    expect(search.result().iterations).toBe(6);
  });
});

describe("optimize on random projects", () => {
  const arb = fc.record({
    units: fc.constantFrom("in" as const, "mm" as const),
    kerf: fc.constantFrom(0, 0.125, 0.25, 2.2, 3.2),
    trim: fc.constantFrom(0, 0.25, 1),
    grained: fc.boolean(),
    grain: fc.boolean(),
    stock: fc.array(
      fc.record({
        length: fc.integer({ min: 20, max: 120 }),
        width: fc.integer({ min: 10, max: 60 }),
        quantity: fc.option(fc.integer({ min: 1, max: 3 })),
        offcut: fc.boolean(),
      }),
      { minLength: 1, maxLength: 3 },
    ),
    parts: fc.array(
      fc.record({
        length: fc.double({ min: 1, max: 70, noNaN: true }),
        width: fc.double({ min: 1, max: 40, noNaN: true }),
        quantity: fc.integer({ min: 1, max: 5 }),
        grain: fc.constantFrom("length" as const, "width" as const, "none" as const),
      }),
      { minLength: 1, maxLength: 8 },
    ),
    maxRip: fc.option(fc.integer({ min: 5, max: 60 })),
    seed: fc.integer(),
  });

  it("returns plans with no errors, and every copy is placed or reported unplaced", () => {
    fc.assert(
      fc.property(arb, (a) => {
        const base = createProject("Random", a.units);
        const project: Project = {
          ...base,
          materials: [{ id: "m", name: "M", thickness: 0.75, grained: a.grained }],
          stock: a.stock.map((s, i) => ({
            id: `st${i}`,
            material: "m",
            length: s.length,
            width: s.width,
            quantity: s.offcut ? (s.quantity ?? 1) : s.quantity,
            kind: s.offcut ? ("offcut" as const) : ("sheet" as const),
          })),
          parts: a.parts.map((p, i) => ({ id: `p${i}`, name: `P${i}`, material: "m", ...p })),
          tools: [
            { id: "t", name: "T", type: "table-saw", kerf: a.kerf, enabled: true, ...(a.maxRip === null ? {} : { maxRip: a.maxRip }) },
          ],
          settings: { ...base.settings, trim: a.trim, features: { ...base.settings.features, grain: a.grain } },
        };
        const result = optimize(project, { iterations: 15, seed: a.seed });
        expect(errors(applyOptimizeResult(project, result))).toEqual([]);
        const placed = result.sheets.reduce((n, s) => n + s.placements.length, 0);
        expect(placed + result.unplaced.length).toBe(a.parts.reduce((n, p) => n + p.quantity, 0));
        expect(result.unplaced.every((u) => u.reason !== "not-guillotine")).toBe(true);
      }),
      { numRuns: 150 },
    );
  });
});
