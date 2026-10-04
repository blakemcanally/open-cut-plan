import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { designParts, designSheetEstimate, ESTIMATE_ITERATIONS, optimize, type Project } from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";

const SHEET = 2440 * 1220;

describe("designSheetEstimate", () => {
  it("counts the sheets of the case material for a design with no back", () => {
    const project = designProject();
    expect(designSheetEstimate(project, kallaxDesign())).toEqual([
      { material: "ply18", sheets: 2, sizes: [{ stock: "ply18-sheet", length: 2440, width: 1220, count: 2 }], unplaced: 0, noStock: false },
    ]);
  });

  it("counts each material, the case material first", () => {
    const estimate = designSheetEstimate(designProject([eketDesign()]), eketDesign());
    expect(estimate?.map(({ material, sheets, noStock }) => ({ material, sheets, noStock }))).toEqual([
      { material: "ply18", sheets: 1, noStock: false },
      { material: "ply6", sheets: 1, noStock: false },
    ]);
  });

  it("uses the design that it gets, not the design in the file", () => {
    const project = designProject();
    const wider = kallaxDesign({ quantity: 3 });
    expect(designSheetEstimate(project, wider)![0]!.sheets).toBeGreaterThan(designSheetEstimate(project, kallaxDesign())![0]!.sheets);
  });

  it("says when a material has no enabled sheet stock", () => {
    const base = designProject([eketDesign()]);
    const project: Project = {
      ...base,
      stock: [
        base.stock[0]!,
        { ...base.stock[1]!, enabled: false },
        { id: "ply6-offcut", material: "ply6", length: 1000, width: 800, quantity: 1, kind: "offcut" },
      ],
    };
    expect(designSheetEstimate(project, eketDesign())![1]).toEqual({ material: "ply6", sheets: 0, sizes: [], unplaced: 2, noStock: true });
  });

  it("ignores the stock quantities, the plan, and the other parts", () => {
    const base = designProject();
    const project: Project = {
      ...base,
      stock: [{ ...base.stock[0]!, quantity: 1 }, base.stock[1]!],
      parts: [{ id: "big", name: "Big", material: "ply18", length: 2400, width: 1200, quantity: 4, grain: "length" }],
      plan: { sheets: [{ id: "s1", stock: "ply18-sheet", placements: [{ part: "big", copy: 1, x: 0, y: 0, rotated: false }], pinned: true }] },
    };
    expect(designSheetEstimate(project, kallaxDesign())![0]!.sheets).toBe(2);
  });

  it("counts the copies that fit on no sheet, and the sheets by size", () => {
    const base = designProject();
    const project: Project = {
      ...base,
      stock: [
        { id: "small", material: "ply18", length: 1000, width: 500, quantity: null, kind: "sheet" },
        { id: "half", material: "ply18", length: 1220, width: 1220, quantity: null, kind: "sheet" },
      ],
    };
    const tall = kallaxDesign({ height: { openings: [335, 335, 335, 335, 335] } });
    const [estimate] = designSheetEstimate(project, tall)!;
    expect(estimate!.unplaced).toBe(3);
    expect(estimate!.sizes.reduce((sum, size) => sum + size.count, 0)).toBe(estimate!.sheets);
  });

  it("is null for a design with an error", () => {
    expect(designSheetEstimate(designProject(), kallaxDesign({ material: "nothing" }))).toBeNull();
  });

  it("gives the sheet count of the same short optimizer run on the design's parts", () => {
    const project = designProject();
    const parts = designParts(project, kallaxDesign())!;
    const run = optimize({ ...project, parts }, { iterations: ESTIMATE_ITERATIONS, seed: 1, goal: "cost", extraCostPercent: 0 });
    expect(designSheetEstimate(project, kallaxDesign())![0]!.sheets).toBe(run.sheets.length);
  });

  it("gives enough sheet area for the parts, for any grid", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), fc.integer({ min: 1, max: 4 }), fc.integer({ min: 1, max: 3 }), (columns, rows, quantity) => {
        const design = kallaxDesign({ width: { openings: Array(columns).fill(335) }, height: { openings: Array(rows).fill(335) }, quantity });
        const project = designProject([design]);
        const area = designParts(project, design)!.reduce((sum, part) => sum + part.length * part.width * part.quantity, 0);
        const [estimate] = designSheetEstimate(project, design)!;
        expect(estimate!.unplaced).toBe(0);
        expect(estimate!.sheets * SHEET).toBeGreaterThanOrEqual(area);
        expect(estimate!.sheets).toBeLessThanOrEqual(Math.ceil(area / SHEET) + 1);
      }),
      { numRuns: 30 },
    );
  });
});
