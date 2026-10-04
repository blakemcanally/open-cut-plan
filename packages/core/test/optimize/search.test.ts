import fc from "fast-check";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import type { Project } from "../../src/format/schema.ts";
import { createProject } from "../../src/format/defaults.ts";
import { parseProject } from "../../src/format/parse.ts";
import { sameNumber } from "../../src/optimize/evaluate.ts";
import { costLimit, withinLimit } from "../../src/optimize/goal.ts";
import { analyzeProject } from "../../src/analysis.ts";
import { applyOptimizeResult, createSearch, optimize, type OptimizeResult } from "../../src/optimize/search.ts";
import { planContext } from "../../src/plan/context.ts";
import { compareFactoryEdgeMisses, sheetFactoryEdgeMissLengths } from "../../src/plan/factoryEdges.ts";
import { validatePlan } from "../../src/plan/validate.ts";
import { sequencePlan, totalCutLength } from "../../src/sequence/sequence.ts";
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

  it("gives the cut steps and the total cut length of each material in the score", () => {
    const project = load("living-room-shelf");
    const result = optimize(project, { iterations: 20 });
    const planned = applyOptimizeResult(project, result);
    const materialOf = new Map(planned.plan!.sheets.map((sheet) => [sheet.id, planned.stock.find((stock) => stock.id === sheet.stock)!.material]));
    for (const { material, score } of result.materials) {
      const steps = sequencePlan(planned).filter((step) => materialOf.get(step.sheet) === material);
      expect(score.cuts).toBe(steps.length);
      expect(score.cutLength).toBeCloseTo(totalCutLength(steps), 6);
    }
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

  it("reports the parts of a material with no stock, and plans the other materials", () => {
    const project = sampleProject();
    project.materials.push({ id: "mdf", name: "MDF", thickness: 0.75, grained: false });
    project.parts.push({ id: "door", name: "Door", material: "mdf", length: 20, width: 10, quantity: 1, grain: "none" });
    const result = optimize({ ...project, plan: { sheets: [] } }, { iterations: 10 });
    expect(result.unplaced).toEqual([{ part: "door", copy: 0, reason: "no-stock-for-material" }]);
    expect(result.sheets.flatMap((s) => s.placements.map((p) => p.part))).toEqual(["side", "side"]);
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

describe("the optimizer goal", () => {
  function twoStocks(a: { length: number; width: number; cost: number }, b: { length: number; width: number; cost: number }): Project {
    const base = createProject("Goal", "mm");
    return {
      ...base,
      materials: [{ id: "m", name: "M", thickness: 18, grained: false }],
      stock: [
        { id: "a", material: "m", ...a, quantity: null, kind: "sheet" },
        { id: "b", material: "m", ...b, quantity: null, kind: "sheet" },
      ],
      parts: [{ id: "p", name: "P", material: "m", length: 900, width: 900, quantity: 1, grain: "none" }],
      tools: [{ id: "t", name: "T", type: "table-saw", kerf: 3, enabled: true }],
    };
  }
  const stockOf = (project: Project, options: Parameters<typeof optimize>[1]) => optimize(project, { iterations: 60, ...options }).sheets.map((sheet) => sheet.stock);

  it("gives the same plans as before for the goal cost when the groups need not stay together", () => {
    const fingerprints = Object.fromEntries(
      ["living-room-shelf", "simple-bookcase-mm", "kallax-2x4-mm", "eket-wall-in"].map((name) => {
        const result = optimize(load(name), { iterations: 150, seed: 7, goal: "cost", keepGroupsTogether: false });
        const text = JSON.stringify({ sheets: result.sheets, unplaced: result.unplaced });
        return [name, createHash("sha256").update(text).digest("hex").slice(0, 16)];
      }),
    );
    expect(fingerprints).toEqual({
      "living-room-shelf": "33a240fe9e5d1e9c",
      "simple-bookcase-mm": "d9bf137a3ac8f8cc",
      "kallax-2x4-mm": "df858571c0e70e17",
      "eket-wall-in": "252be793e5f5e0fa",
    });
  });

  it("scores the offcuts of the trees that keep the largest offcut when the goal in the settings is offcuts, as the reports show them", () => {
    const bookcase = load("simple-bookcase-mm");
    const withGoal = (project: Project, goal: string): Project => ({ ...project, settings: { ...project.settings, optimizer: { ...project.settings.optimizer, goal } } });
    const result = optimize(withGoal(bookcase, "offcuts"), { iterations: 150, seed: 7 });
    const planned = applyOptimizeResult(withGoal(bookcase, "offcuts"), result);
    const areas = (project: Project, material: string) =>
      analyzeProject(project)
        .offcuts.filter((offcut) => offcut.material === material)
        .map((offcut) => offcut.rect.length * offcut.rect.width)
        .sort((a, b) => b - a);
    for (const { material, score } of result.materials) {
      expect(areas(planned, material).map(Math.round)).toEqual(score.offcuts.map(Math.round));
      expect(score.largestOffcut).toBeGreaterThanOrEqual(areas(withGoal(planned, "cost"), material)[0]!);
    }
    const hdf = result.materials.find((m) => m.material === "hdf3")!.score.largestOffcut;
    expect(hdf / areas(withGoal(planned, "cost"), "hdf3")[0]!).toBeGreaterThan(1.2);
  });

  it("keeps to plans with no bought stock when an owned offcut makes the cheapest cost 0", () => {
    const project = twoStocks({ length: 1000, width: 1000, cost: 100 }, { length: 2000, width: 1000, cost: 105 });
    project.stock = [{ id: "o", material: "m", length: 950, width: 950, quantity: 1, kind: "offcut" }, project.stock[1]!];
    const result = optimize(project, { iterations: 60, goal: "offcuts", extraCostPercent: 100 });
    expect(result.sheets.map((sheet) => sheet.stock)).toEqual(["o"]);
    expect(result.materials.map((m) => [m.score.cost, m.cheapestCost])).toEqual([[0, 0]]);
  });

  it("spends up to the limit for a larger offcut", () => {
    const project = twoStocks({ length: 1000, width: 1000, cost: 100 }, { length: 2000, width: 1000, cost: 105 });
    expect(stockOf(project, { goal: "cost" })).toEqual(["a"]);
    expect(stockOf(project, { goal: "offcuts", extraCostPercent: 10 })).toEqual(["b"]);
    expect(stockOf(project, { goal: "offcuts", extraCostPercent: 0 })).toEqual(["a"]);
    const result = optimize(project, { iterations: 60, goal: "offcuts", extraCostPercent: 10 });
    expect(result.materials.map((m) => [m.score.cost, m.cheapestCost])).toEqual([[105, 100]]);
  });

  it("spends up to the limit for fewer cuts", () => {
    const project = twoStocks({ length: 1000, width: 1000, cost: 100 }, { length: 900, width: 900, cost: 104 });
    expect(stockOf(project, { goal: "cuts", extraCostPercent: 10 })).toEqual(["b"]);
    expect(stockOf(project, { goal: "cuts", extraCostPercent: 3 })).toEqual(["a"]);
  });

  it("takes the goal and the limit from the settings, and uses the lowest cost for an unknown goal", () => {
    const project = twoStocks({ length: 1000, width: 1000, cost: 100 }, { length: 900, width: 900, cost: 104 });
    const withGoal = (goal: string, extraCostPercent: number): Project => ({ ...project, settings: { ...project.settings, optimizer: { ...project.settings.optimizer, goal, extraCostPercent } } });
    expect(stockOf(withGoal("cuts", 10), {})).toEqual(["b"]);
    expect(stockOf(withGoal("cuts", 2), {})).toEqual(["a"]);
    expect(stockOf(withGoal("time", 50), {})).toEqual(["a"]);
    expect(stockOf(withGoal("cuts", 10), { goal: "cost" })).toEqual(["a"]);
  });

  it("gives the cost of the chosen plan as the cheapest cost for the goal cost", () => {
    const result = optimize(load("simple-bookcase-mm"), { iterations: 30 });
    expect(result.materials.map((m) => m.cheapestCost)).toEqual(result.materials.map((m) => m.score.cost));
  });

  it("still tries the full number of iterations when a continued search runs the first stage again", () => {
    const project = load("living-room-shelf");
    const fresh = optimize(project, { iterations: 5, goal: "offcuts" });
    const start: OptimizeResult = { sheets: fresh.sheets, unplaced: [], materials: [], iterations: 0 };
    const cost = optimize(project, { iterations: 5, goal: "cost", start });
    expect(cost.iterations).toBe(5 * cost.materials.length);
    expect(optimize(project, { iterations: 5, goal: "offcuts", start }).iterations).toBeGreaterThan(cost.iterations);
  });

  it("never goes over the limit, also when it continues a search with or without the cheapest cost", () => {
    const arb = fc.record({
      goal: fc.constantFrom("offcuts" as const, "cuts" as const),
      extra: fc.integer({ min: 0, max: 40 }),
      stock: fc.array(fc.record({ length: fc.integer({ min: 30, max: 120 }), width: fc.integer({ min: 20, max: 60 }), cost: fc.integer({ min: 5, max: 60 }) }), { minLength: 1, maxLength: 3 }),
      parts: fc.array(fc.record({ length: fc.integer({ min: 2, max: 60 }), width: fc.integer({ min: 2, max: 40 }), quantity: fc.integer({ min: 1, max: 4 }) }), { minLength: 1, maxLength: 6 }),
      seed: fc.integer(),
    });
    fc.assert(
      fc.property(arb, (a) => {
        const base = createProject("Random", "in");
        const project: Project = {
          ...base,
          materials: [{ id: "m", name: "M", thickness: 0.75, grained: false }],
          stock: a.stock.map((s, i) => ({ id: `st${i}`, material: "m", ...s, quantity: null, kind: "sheet" as const })),
          parts: a.parts.map((p, i) => ({ id: `p${i}`, name: `P${i}`, material: "m", ...p, grain: "none" as const })),
          tools: [{ id: "t", name: "T", type: "table-saw", kerf: 0.125, enabled: true }],
        };
        const options = { iterations: 12, seed: a.seed, goal: a.goal, extraCostPercent: a.extra };
        const within = (result: OptimizeResult) => result.materials.every((m) => withinLimit(m.score.cost, costLimit(m.cheapestCost, a.extra)));
        let result = optimize(project, options);
        expect(within(result)).toBe(true);
        for (let run = 0; run < 3; run++) {
          const next = optimize(project, { ...options, start: result });
          expect(within(next)).toBe(true);
          expect(next.materials.every((m, i) => m.cheapestCost <= result.materials[i]!.cheapestCost)).toBe(true);
          result = next;
        }
        expect(within(optimize(project, { ...options, start: { ...result, materials: [] } }))).toBe(true);
      }),
      { numRuns: 60 },
    );
  });
});

describe("keeping groups together", () => {
  const sizes = [23.5, 23.4, 23.3, 23.2, 23.1, 23.0, 22.9, 22.8];
  /** Eight 47-long parts, four to a sheet; A and B alternate in size, so an order by size mixes them. */
  function twoGroups(): Project {
    const project = sampleProject();
    project.plan = { sheets: [] };
    project.parts = sizes.map((width, i) => ({ id: `p${i}`, name: `P${i}`, material: "ply", length: 47, width, quantity: 1, grain: "length" as const, group: i % 2 === 0 ? "A" : "B" }));
    return project;
  }
  const groupsOn = (result: OptimizeResult, project: Project) =>
    result.sheets.map((sheet) => [...new Set(sheet.placements.map((p) => project.parts.find((part) => part.id === p.part)!.group ?? ""))].toSorted((a, b) => a.localeCompare(b)).join(""));

  it("separates two groups that fit on two sheets mixed or separated at the same cost", () => {
    const project = twoGroups();
    const mixed = optimize(project, { iterations: 100, seed: 3, keepGroupsTogether: false });
    expect(mixed.sheets).toHaveLength(2);
    expect(groupsOn(mixed, project)).toContain("AB");
    const together = optimize(project, { iterations: 100, seed: 3 });
    expect(together.materials.map((m) => [m.score.cost, m.score.groupSpread])).toEqual([[120, 0]]);
    expect(groupsOn(together, project).toSorted((a, b) => a.localeCompare(b))).toEqual(["A", "B"]);
    expect(errors(applyOptimizeResult(project, together))).toEqual([]);
  });

  it("takes the setting from the project, and the option overrides it", () => {
    const project = twoGroups();
    const off: Project = { ...project, settings: { ...project.settings, optimizer: { ...project.settings.optimizer, keepGroupsTogether: false } } };
    expect(optimize(off, { iterations: 100, seed: 3 })).toEqual(optimize(project, { iterations: 100, seed: 3, keepGroupsTogether: false }));
    expect(optimize(off, { iterations: 100, seed: 3, keepGroupsTogether: true }).materials[0]!.score.groupSpread).toBe(0);
  });

  it("returns valid plans of grouped parts that account for every copy, the same for the same seed, with a sheet next to one that shares a group", () => {
    const arb = fc.record({
      kerf: fc.constantFrom(0, 0.125, 0.25),
      stock: fc.array(fc.record({ length: fc.integer({ min: 30, max: 120 }), width: fc.integer({ min: 20, max: 60 }), cost: fc.integer({ min: 5, max: 60 }), quantity: fc.option(fc.integer({ min: 1, max: 3 })) }), { minLength: 1, maxLength: 3 }),
      parts: fc.array(
        fc.record({ length: fc.integer({ min: 2, max: 60 }), width: fc.integer({ min: 2, max: 40 }), quantity: fc.integer({ min: 1, max: 4 }), grain: fc.constantFrom("length" as const, "none" as const), group: fc.option(fc.constantFrom("A", "B", "C")) }),
        { minLength: 1, maxLength: 8 },
      ),
      seed: fc.integer(),
    });
    fc.assert(
      fc.property(arb, (a) => {
        const base = createProject("Random", "in");
        const project: Project = {
          ...base,
          materials: [{ id: "m", name: "M", thickness: 0.75, grained: true }],
          stock: a.stock.map((s, i) => ({ id: `st${i}`, material: "m", ...s, kind: "sheet" as const })),
          parts: a.parts.map(({ group, ...p }, i) => ({ id: `p${i}`, name: `P${i}`, material: "m", ...p, ...(group === null ? {} : { group }) })),
          tools: [{ id: "t", name: "T", type: "table-saw", kerf: a.kerf, enabled: true }],
        };
        const result = optimize(project, { iterations: 40, seed: a.seed });
        expect(errors(applyOptimizeResult(project, result))).toEqual([]);
        const placed = result.sheets.reduce((n, s) => n + s.placements.length, 0);
        expect(placed + result.unplaced.length).toBe(a.parts.reduce((n, p) => n + p.quantity, 0));
        expect(optimize(project, { iterations: 40, seed: a.seed })).toEqual(result);
        const groupsOf = (index: number) => new Set(result.sheets[index]!.placements.map((p) => project.parts.find((part) => part.id === p.part)!.group).filter((group) => group !== undefined));
        const shares = (i: number, j: number) => [...groupsOf(i)].some((group) => groupsOf(j).has(group));
        const skipped = result.sheets.flatMap((_, i) => (i > 0 && !shares(i - 1, i) && result.sheets.some((__, j) => j > i && shares(i - 1, j)) ? [i] : []));
        expect(skipped).toEqual([]);
      }),
      { numRuns: 80 },
    );
  });

  it("gives the group spread of the chosen plan with the setting on or off", () => {
    const project = twoGroups();
    expect(optimize(project, { iterations: 100, seed: 3, keepGroupsTogether: false }).materials[0]!.score.groupSpread).toBe(2);
    expect(optimize(project, { iterations: 100, seed: 1, keepGroupsTogether: false }).materials[0]!.score.groupSpread).toBe(0);
  });

  it("never costs more or leaves more copies unplaced than the same search with the setting off", () => {
    const worse: string[] = [];
    for (const name of ["living-room-shelf", "simple-bookcase-mm", "kallax-2x4-mm", "eket-wall-in"]) {
      const project = load(name);
      for (const seed of [1, 2]) {
        for (const goal of ["cost", "offcuts", "cuts"] as const) {
          const off = optimize(project, { iterations: 80, seed, goal, keepGroupsTogether: false });
          const on = optimize(project, { iterations: 80, seed, goal, keepGroupsTogether: true });
          on.materials.forEach((m, i) => {
            const before = off.materials[i]!;
            const limit = goal === "cost" ? before.score.cost : costLimit(before.cheapestCost, 10);
            const fewerUnplaced = m.score.unplaced < before.score.unplaced;
            const ok = fewerUnplaced || (m.score.unplaced === before.score.unplaced && withinLimit(m.cheapestCost, before.cheapestCost) && withinLimit(m.score.cost, limit));
            const spreadOk = goal !== "cost" || fewerUnplaced || !sameNumber(m.score.cost, before.score.cost) || m.score.groupSpread <= before.score.groupSpread;
            if (!ok || !spreadOk) worse.push(`${name} ${seed} ${goal} ${m.material}`);
          });
        }
      }
    }
    expect(worse).toEqual([]);
  });
});

describe("factory edges", () => {
  /** An inch sheet with no trim: two 90 × 15 parts pack first, so the 90 × 10 part that asks for a factory edge lands in the middle strip. */
  function stripsProject(): Project {
    const base = createProject("Edges", "in");
    return {
      ...base,
      materials: [{ id: "m", name: "M", thickness: 0.75, grained: false }],
      stock: [{ id: "sheet", material: "m", length: 96, width: 48, quantity: null, cost: 60, kind: "sheet" }],
      parts: [
        { id: "wide", name: "Wide", material: "m", length: 90, width: 15, quantity: 2, grain: "none" },
        { id: "long", name: "Long", material: "m", length: 90, width: 10, quantity: 1, grain: "none", factoryEdge: "long" },
      ],
      tools: [{ id: "t", name: "T", type: "table-saw", kerf: 0.125, enabled: true }],
    };
  }
  const edgeWarnings = (project: Project, result: OptimizeResult) => validatePlan(applyOptimizeResult(project, result)).filter((issue) => issue.code === "factory-edge");
  const missLengths = (project: Project, result: OptimizeResult) => {
    const applied = applyOptimizeResult(project, result);
    const ctx = planContext(applied);
    return applied.plan!.sheets.flatMap((sheet) => sheetFactoryEdgeMissLengths(ctx, sheet)).sort((a, b) => b - a);
  };
  const withoutRequests = (project: Project): Project => {
    const { factoryEdge: _rule, ...settings } = project.settings;
    return { ...project, settings, parts: project.parts.map(({ factoryEdge: _edge, ...part }) => part) };
  };
  const factory = (project: Project): Project => ({ ...project, settings: { ...project.settings, trim: 0 }, stock: project.stock.map(({ trim: _trim, ...stock }) => stock) });
  const rules: Record<string, number> = { "living-room-shelf": 36, "simple-bookcase-mm": 900, "kallax-2x4-mm": 900, "eket-wall-in": 24 };

  it("puts a long part that asks for a factory edge against the edge of the sheet at the same cost", () => {
    const project = stripsProject();
    const plain = optimize(withoutRequests(project), { iterations: 60, seed: 1 });
    expect(edgeWarnings(project, plain)).toHaveLength(1);
    const result = optimize(project, { iterations: 60, seed: 1 });
    expect(edgeWarnings(project, result)).toEqual([]);
    expect(result.materials[0]!.score).toMatchObject({ factoryEdgeMisses: 0, cost: plain.materials[0]!.score.cost, unplaced: 0 });
    expect(errors(applyOptimizeResult(project, result))).toEqual([]);
  });

  it("gives the factory edges to the longest parts first when the rule asks for more edges than the sheet has", () => {
    const project = stripsProject();
    project.settings = { ...project.settings, factoryEdge: { minLength: 40 } };
    project.parts = [
      { id: "a", name: "A", material: "m", length: 90, width: 15, quantity: 1, grain: "none" },
      { id: "b", name: "B", material: "m", length: 85, width: 15, quantity: 1, grain: "none" },
      { id: "c", name: "C", material: "m", length: 80, width: 15, quantity: 1, grain: "none" },
    ];
    const result = optimize(project, { iterations: 60, seed: 1 });
    expect(result.materials[0]!.score).toMatchObject({ factoryEdgeMisses: 1, factoryEdgeMissLengths: [80], unplaced: 0 });
    expect(edgeWarnings(project, result).map((issue) => issue.message)).toEqual([expect.stringContaining("C asks for a factory edge")]);
  });

  it("gives the same plans as before when no part asks for a factory edge", () => {
    for (const name of ["living-room-shelf", "eket-wall-in"]) {
      const project = factory(load(name));
      const before = optimize(project, { iterations: 80, seed: 2 });
      const noMatch = { ...project, settings: { ...project.settings, factoryEdge: { minLength: 1e6 } } };
      expect(optimize(noMatch, { iterations: 80, seed: 2 })).toEqual(before);
      const refused = { ...project, settings: { ...project.settings, factoryEdge: { minLength: 1 } }, parts: project.parts.map((part) => ({ ...part, factoryEdge: "none" })) };
      expect(optimize(refused, { iterations: 80, seed: 2 })).toEqual(before);
      const trimmed = { ...load(name), settings: { ...load(name).settings, trim: 5, factoryEdge: { minLength: 1 } } };
      expect(optimize(trimmed, { iterations: 80, seed: 2 }).sheets).toEqual(optimize({ ...trimmed, settings: { ...trimmed.settings, factoryEdge: undefined } }, { iterations: 80, seed: 2 }).sheets);
    }
  });

  it("never costs more or leaves more copies unplaced, and never misses more factory edges, than the same search with no requests", () => {
    const worse: string[] = [];
    for (const name of Object.keys(rules)) {
      const project = factory(load(name));
      const ruled = { ...project, settings: { ...project.settings, factoryEdge: { minLength: rules[name]! } } };
      for (const seed of [1, 2]) {
        for (const goal of ["cost", "offcuts", "cuts"] as const) {
          const off = optimize(project, { iterations: 80, seed, goal });
          const on = optimize(ruled, { iterations: 80, seed, goal });
          const missesOff = missLengths(ruled, off);
          on.materials.forEach((m, i) => {
            const before = off.materials[i]!;
            const limit = goal === "cost" ? before.score.cost : costLimit(before.cheapestCost, 10);
            const ok = m.score.unplaced < before.score.unplaced || (m.score.unplaced === before.score.unplaced && withinLimit(m.cheapestCost, before.cheapestCost) && withinLimit(m.score.cost, limit));
            if (!ok) worse.push(`${name} ${seed} ${goal} ${m.material}`);
          });
          if (goal === "cost" && compareFactoryEdgeMisses(missLengths(ruled, on), missesOff) > 0) worse.push(`${name} ${seed} misses`);
          if (errors(applyOptimizeResult(ruled, on)).length > 0) worse.push(`${name} ${seed} ${goal} errors`);
        }
      }
    }
    expect(worse).toEqual([]);
  });

  it("returns valid plans on random projects with requests, never worse on cost than with no requests, the same for the same seed", () => {
    const arb = fc.record({
      kerf: fc.constantFrom(0, 0.125, 0.25),
      trim: fc.constantFrom(0, 0, 0.25),
      offcut: fc.boolean(),
      stock: fc.array(fc.record({ length: fc.integer({ min: 30, max: 120 }), width: fc.integer({ min: 20, max: 60 }), cost: fc.integer({ min: 5, max: 60 }), quantity: fc.option(fc.integer({ min: 1, max: 3 })) }), { minLength: 1, maxLength: 2 }),
      parts: fc.array(
        fc.record({ length: fc.integer({ min: 2, max: 80 }), width: fc.integer({ min: 2, max: 30 }), quantity: fc.integer({ min: 1, max: 4 }), grain: fc.constantFrom("length" as const, "none" as const), factoryEdge: fc.constantFrom("long", "none", undefined) }),
        { minLength: 1, maxLength: 6 },
      ),
      rule: fc.option(fc.integer({ min: 10, max: 80 })),
      seed: fc.integer(),
    });
    fc.assert(
      fc.property(arb, (a) => {
        const base = createProject("Random", "in");
        const project: Project = {
          ...base,
          settings: { ...base.settings, trim: a.trim, ...(a.rule === null ? {} : { factoryEdge: { minLength: a.rule } }) },
          materials: [{ id: "m", name: "M", thickness: 0.75, grained: true }],
          stock: [
            ...a.stock.map((s, i) => ({ id: `st${i}`, material: "m", ...s, kind: "sheet" as const })),
            ...(a.offcut ? [{ id: "off", material: "m", length: 40, width: 30, quantity: 1, kind: "offcut" as const }] : []),
          ],
          parts: a.parts.map(({ factoryEdge, ...p }, i) => ({ id: `p${i}`, name: `P${i}`, material: "m", ...p, ...(factoryEdge === undefined ? {} : { factoryEdge }) })),
          tools: [{ id: "t", name: "T", type: "table-saw", kerf: a.kerf, enabled: true }],
        };
        const result = optimize(project, { iterations: 30, seed: a.seed });
        expect(errors(applyOptimizeResult(project, result))).toEqual([]);
        const placed = result.sheets.reduce((n, s) => n + s.placements.length, 0);
        expect(placed + result.unplaced.length).toBe(a.parts.reduce((n, p) => n + p.quantity, 0));
        expect(optimize(project, { iterations: 30, seed: a.seed })).toEqual(result);
        expect(result.materials[0]!.score.factoryEdgeMisses).toBe(edgeWarnings(project, result).length);
        const plain = optimize(withoutRequests(project), { iterations: 30, seed: a.seed }).materials[0]!.score;
        const score = result.materials[0]!.score;
        expect(score.unplaced).toBeLessThanOrEqual(plain.unplaced);
        expect(score.unplaced < plain.unplaced || withinLimit(score.cost, plain.cost)).toBe(true);
      }),
      { numRuns: 80 },
    );
  });
});
