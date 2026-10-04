import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  analyzeProject,
  createProject,
  factoryEdgeRequest,
  factoryEdgeSides,
  getsFactoryEdge,
  hasFactoryEdges,
  planContext,
  pushToFactoryEdges,
  sheetFactoryEdgeMisses,
  validatePlan,
  type Part,
  type Placement,
  type Project,
} from "../../src/index.ts";

/** An inch project with factory edges: an unlimited 96 × 48 sheet and a 40 × 12 part that asks for a long factory edge. */
function edgeProject(placements: Placement[] = []): Project {
  const base = createProject("Edges", "in");
  return {
    ...base,
    materials: [{ id: "ply", name: "Plywood", thickness: 0.75, grained: false }],
    stock: [{ id: "sheet", material: "ply", length: 96, width: 48, quantity: null, cost: 60, kind: "sheet" }],
    parts: [{ id: "long", name: "Long", material: "ply", length: 40, width: 12, quantity: 2, grain: "none", factoryEdge: "long" }],
    tools: [{ id: "ts", name: "Table saw", type: "table-saw", kerf: 0.125, enabled: true }],
    plan: { sheets: [{ id: "s1", stock: "sheet", placements }] },
  };
}

const at = (x: number, y: number, copy = 0, rotated = false): Placement => ({ part: "long", copy, x, y, rotated });

function sides(project: Project, placement: Placement) {
  const ctx = planContext(project);
  return factoryEdgeSides(ctx, ctx.stock.get("sheet")!, ctx.parts.get(placement.part)!, placement);
}

function gets(project: Project, placement: Placement) {
  const ctx = planContext(project);
  return getsFactoryEdge(ctx, ctx.stock.get("sheet")!, ctx.parts.get(placement.part)!, placement);
}

describe("factoryEdgeRequest", () => {
  const part = (patch: Partial<Part>): Part => ({ id: "p", name: "P", material: "ply", length: 40, width: 12, quantity: 1, grain: "none", ...patch });
  const withRule = (minLength?: number): Project => {
    const project = edgeProject();
    if (minLength !== undefined) project.settings.factoryEdge = { minLength };
    return project;
  };

  it("uses the choice of the part before the rule", () => {
    expect(factoryEdgeRequest(withRule(), part({ factoryEdge: "long" }))).toBe("long");
    expect(factoryEdgeRequest(withRule(10), part({ factoryEdge: "none" }))).toBeNull();
  });

  it("asks for a long edge when the long side of a part with no choice is at least the rule length", () => {
    expect(factoryEdgeRequest(withRule(), part({}))).toBeNull();
    expect(factoryEdgeRequest(withRule(40), part({}))).toBe("long");
    expect(factoryEdgeRequest(withRule(40.5), part({}))).toBeNull();
    expect(factoryEdgeRequest(withRule(40), part({ length: 12, width: 40 }))).toBe("long");
  });

  it("uses the rule for a choice that it does not know", () => {
    expect(factoryEdgeRequest(withRule(30), part({ factoryEdge: "both" }))).toBe("long");
    expect(factoryEdgeRequest(withRule(), part({ factoryEdge: "both" }))).toBeNull();
  });
});

describe("hasFactoryEdges", () => {
  const has = (patch: (project: Project) => void) => {
    const project = edgeProject();
    patch(project);
    const ctx = planContext(project);
    return hasFactoryEdges(ctx, ctx.stock.get("sheet")!);
  };

  it("is true for a sheet with no trim", () => {
    expect(has(() => {})).toBe(true);
    expect(has((p) => (p.settings.trim = 0.25))).toBe(false);
    expect(has((p) => ((p.settings.trim = 0.25), (p.stock[0]!.trim = 0)))).toBe(true);
    expect(has((p) => (p.stock[0]!.trim = 0.25))).toBe(false);
    expect(has((p) => ((p.settings.trim = 0.25), (p.settings.features.trim = false)))).toBe(true);
  });

  it("is false for an owned offcut, which has cut edges only", () => {
    expect(has((p) => ((p.stock[0]!.kind = "offcut"), (p.stock[0]!.trim = 0)))).toBe(false);
  });
});

describe("factoryEdgeSides and getsFactoryEdge", () => {
  it("gives the sides of a copy on the edge of the sheet", () => {
    const project = edgeProject();
    expect(sides(project, at(0, 0))).toEqual(["top", "left"]);
    expect(sides(project, at(56, 36))).toEqual(["right", "bottom"]);
    expect(sides(project, at(6, 6))).toEqual([]);
  });

  it("counts a long edge only", () => {
    const project = edgeProject();
    expect(gets(project, at(10, 0))).toBe(true);
    expect(gets(project, at(10, 36))).toBe(true);
    expect(gets(project, at(0, 10))).toBe(false);
    expect(gets(project, at(56, 10))).toBe(false);
  });

  it("finds the long edges of a turned copy", () => {
    const project = edgeProject();
    expect(sides(project, at(0, 4, 0, true))).toEqual(["left"]);
    expect(gets(project, at(0, 4, 0, true))).toBe(true);
    expect(gets(project, at(84, 4, 0, true))).toBe(true);
    expect(gets(project, at(10, 0, 0, true))).toBe(false);
  });

  it("allows a small rounding error", () => {
    expect(gets(edgeProject(), at(10, 36 - 1e-8))).toBe(true);
    expect(gets(edgeProject(), at(10, 1e-8))).toBe(true);
  });

  it("gives no factory edge on a trimmed sheet or an owned offcut", () => {
    const trimmed = edgeProject();
    trimmed.settings.trim = 0.25;
    expect(sides(trimmed, at(0.25, 0.25))).toEqual([]);
    const offcut = edgeProject();
    offcut.stock[0] = { ...offcut.stock[0]!, kind: "offcut", trim: 0 };
    expect(sides(offcut, at(0, 0))).toEqual([]);
  });
});

describe("pushToFactoryEdges", () => {
  it("moves the pieces with copies that ask for a factory edge against the edges of the sheet", () => {
    const project = edgeProject([at(0, 6), at(0, 19, 1)]);
    const ctx = planContext(project);
    const sheet = project.plan!.sheets[0]!;
    expect(sheetFactoryEdgeMisses(ctx, sheet)).toBe(2);
    const pushed = pushToFactoryEdges(ctx, sheet);
    expect(pushed).toEqual({ placements: [at(0, 0), at(0, 36, 1)], misses: 0 });
    expect(pushToFactoryEdges(ctx, { ...sheet, placements: pushed!.placements })).toBeNull();
  });

  it("changes nothing when no copy gains, on a trimmed sheet, or with no request", () => {
    expect(pushToFactoryEdges(planContext(edgeProject([at(0, 0), at(0, 36, 1)])), edgeProject([at(0, 0), at(0, 36, 1)]).plan!.sheets[0]!)).toBeNull();
    const trimmed = edgeProject([at(0.25, 6)]);
    trimmed.settings.trim = 0.25;
    expect(pushToFactoryEdges(planContext(trimmed), trimmed.plan!.sheets[0]!)).toBeNull();
    const none = edgeProject([at(0, 6)]);
    none.parts[0]!.factoryEdge = "none";
    expect(pushToFactoryEdges(planContext(none), none.plan!.sheets[0]!)).toBeNull();
  });

  it("keeps the parts on the sheet with no errors, turns no part, and always gives fewer misses", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ x: fc.integer({ min: 0, max: 7 }), y: fc.integer({ min: 0, max: 3 }), rotated: fc.boolean(), wanted: fc.boolean() }), { maxLength: 8 }),
        fc.constantFrom(0, 0.125, 0.5),
        (cells, kerf) => {
          const used = new Set<string>();
          const placements: Placement[] = [];
          for (const cell of cells) {
            const key = `${cell.x},${cell.y}`;
            if (used.has(key)) continue;
            used.add(key);
            placements.push({ part: cell.wanted ? "a" : "b", copy: placements.length, x: 0.5 + cell.x * 11.75, y: 0.5 + cell.y * 11.75, rotated: cell.rotated });
          }
          const project = edgeProject(placements);
          project.tools[0]!.kerf = kerf;
          project.parts = [
            { id: "a", name: "A", material: "ply", length: 11, width: 4, quantity: 32, grain: "none", factoryEdge: "long" },
            { id: "b", name: "B", material: "ply", length: 11, width: 6, quantity: 32, grain: "none" },
          ];
          const ctx = planContext(project);
          const sheet = project.plan!.sheets[0]!;
          const errors = (p: Project) => validatePlan(p).filter((issue) => issue.severity === "error");
          expect(errors(project)).toEqual([]);
          const pushed = pushToFactoryEdges(ctx, sheet);
          if (pushed === null) return;
          expect(errors({ ...project, plan: { sheets: [{ ...sheet, placements: pushed.placements }] } })).toEqual([]);
          expect(pushed.misses).toBeLessThan(sheetFactoryEdgeMisses(ctx, sheet));
          expect(pushed.placements.map(({ part, copy, rotated }) => ({ part, copy, rotated }))).toEqual(placements.map(({ part, copy, rotated }) => ({ part, copy, rotated })));
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("the factory-edge warning", () => {
  const edgeIssues = (project: Project) => validatePlan(project).filter((issue) => issue.code === "factory-edge" || issue.code === "unknown-factory-edge");

  it("warns once for each copy that asks for a factory edge and does not get one", () => {
    expect(edgeIssues(edgeProject([at(10, 6), at(10, 36, 1)]))).toEqual([
      {
        severity: "warning",
        code: "factory-edge",
        message: "Sheet 1: Long 1 asks for a factory edge on a long edge, but no long edge is on the edge of the sheet.",
        refs: [{ kind: "placement", sheet: "s1", index: 0 }],
      },
    ]);
    expect(edgeIssues(edgeProject([at(10, 0), at(0, 36, 1)]))).toEqual([]);
  });

  it("says when the stock has no factory edges", () => {
    const trimmed = edgeProject([at(0.25, 0.25)]);
    trimmed.settings.trim = 0.25;
    expect(edgeIssues(trimmed).map((issue) => issue.message)).toEqual(["Sheet 1: Long 1 asks for a factory edge, but the trim cuts off the factory edges of this sheet."]);
    const offcut = edgeProject([at(0, 0)]);
    offcut.stock[0] = { ...offcut.stock[0]!, kind: "offcut" };
    expect(edgeIssues(offcut).map((issue) => issue.message)).toEqual(["Sheet 1: Long 1 asks for a factory edge, but this sheet is an offcut, which has no factory edges."]);
  });

  it("follows the rule of the settings, and does not warn for copies that are not placed", () => {
    const project = edgeProject([at(10, 6)]);
    project.parts[0] = { ...project.parts[0]!, factoryEdge: undefined };
    expect(edgeIssues(project)).toEqual([]);
    project.settings.factoryEdge = { minLength: 36 };
    expect(edgeIssues(project).map((issue) => issue.refs)).toEqual([[{ kind: "placement", sheet: "s1", index: 0 }]]);
    project.settings.factoryEdge = { minLength: 48 };
    expect(edgeIssues(project)).toEqual([]);
  });

  it("warns about a request that this app does not know, and uses the rule", () => {
    const project = edgeProject([at(10, 6)]);
    project.parts[0] = { ...project.parts[0]!, factoryEdge: "both" };
    expect(edgeIssues(project)).toEqual([
      {
        severity: "warning",
        code: "unknown-factory-edge",
        message: 'The factory edge request "both" of Long is not known to this app. The part uses the rule for long parts in the settings.',
        refs: [{ kind: "part", part: "long", copy: 0 }],
      },
    ]);
  });
});

describe("analyzeProject", () => {
  it("gives the factory-edge warnings of the validator", () => {
    const project = edgeProject([at(10, 6)]);
    expect(analyzeProject(project).issues.filter((issue) => issue.code === "factory-edge")).toEqual(validatePlan(project).filter((issue) => issue.code === "factory-edge"));
    expect(analyzeProject(project).issues.some((issue) => issue.code === "factory-edge")).toBe(true);
  });
});
