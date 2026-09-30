import { describe, expect, it } from "vitest";
import { compareScores, evaluate, type Score } from "../../src/optimize/evaluate.ts";
import { buildProblem } from "../../src/optimize/problem.ts";
import { sampleProject } from "../helpers.ts";

const score = (over: Partial<Score>): Score => ({ unplaced: 0, cost: 100, largestOffcut: 50, offcuts: [50], cuts: 10, sheets: 2, ...over });

describe("compareScores", () => {
  it("compares unplaced, then cost, then largest offcut (bigger wins), then cuts, then sheets", () => {
    const base = score({});
    expect(compareScores(score({ unplaced: 1, cost: 0 }), base)).toBeGreaterThan(0);
    expect(compareScores(score({ cost: 90, largestOffcut: 0 }), base)).toBeLessThan(0);
    expect(compareScores(score({ largestOffcut: 60, cuts: 99 }), base)).toBeLessThan(0);
    expect(compareScores(score({ cuts: 9, sheets: 9 }), base)).toBeLessThan(0);
    expect(compareScores(score({ sheets: 1 }), base)).toBeLessThan(0);
    expect(compareScores(score({ cost: 100 + 1e-12 }), base)).toBe(0);
  });
});

describe("evaluate", () => {
  const packing = (project: ReturnType<typeof sampleProject>) => {
    const problem = buildProblem({ ...project, plan: { sheets: [] } });
    const material = problem.materials[0]!;
    const stock = material.stock[0]!;
    return { problem, material, packing: { sheets: [{ stock, placements: project.plan!.sheets[0]!.placements }], unplaced: [] } };
  };

  it("scores a valid packing by price, offcut, cuts, and sheets", () => {
    const { problem, material, packing: p } = packing(sampleProject());
    const result = evaluate(problem, material, p, "t");
    expect(result.sheets.map((s) => s.id)).toEqual(["t1"]);
    expect(result.score).toMatchObject({ unplaced: 0, cost: 60, cuts: 8, sheets: 1 });
    expect(result.score.largestOffcut).toBeGreaterThan(0);
  });

  it("lists every offcut area, largest first, and no offcuts when the offcuts feature is off", () => {
    const { problem, material, packing: p } = packing(sampleProject());
    const { offcuts, largestOffcut } = evaluate(problem, material, p, "t").score;
    expect(offcuts.length).toBeGreaterThan(1);
    expect(offcuts).toEqual([...offcuts].sort((a, b) => b - a));
    expect(offcuts[0]).toBe(largestOffcut);
    const off = sampleProject();
    off.settings.features.offcuts = false;
    const other = packing(off);
    expect(evaluate(other.problem, other.material, other.packing, "t").score).toMatchObject({ offcuts: [], largestOffcut: 0 });
  });

  it("scores by stock area when a sheet stock has no price or the cost feature is off", () => {
    const project = sampleProject();
    project.settings.features.cost = false;
    const { problem, material, packing: p } = packing(project);
    expect(evaluate(problem, material, p, "t").score.cost).toBe(96 * 48);
  });

  it("drops a sheet no enabled tool can cut and reports its parts as no-tool", () => {
    const project = sampleProject();
    project.tools[0] = { id: "ts", name: "Table saw", type: "table-saw", kerf: 0.125, enabled: true, maxPiece: { length: 50, width: 30 } };
    const { problem, material, packing: p } = packing(project);
    const result = evaluate(problem, material, p, "t");
    expect(result.sheets).toEqual([]);
    expect(result.unplaced).toEqual([
      { part: "side", copy: 0, reason: "no-tool" },
      { part: "side", copy: 1, reason: "no-tool" },
    ]);
    expect(result.score).toMatchObject({ unplaced: 2, cost: 0, cuts: 0, sheets: 0 });
  });

  it("keeps sheets when no tool is enabled at all", () => {
    const project = sampleProject();
    project.tools[0]!.enabled = false;
    const { problem, material, packing: p } = packing(project);
    expect(evaluate(problem, material, p, "t").sheets).toHaveLength(1);
  });
});
