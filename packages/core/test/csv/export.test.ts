import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { exportPartsCsv, exportStockCsv, importPartsCsv, importStockCsv, type Grain } from "../../src/index.ts";
import { expectOk, sampleProject } from "../helpers.ts";

describe("exportPartsCsv", () => {
  it("writes our columns with material names", () => {
    expect(exportPartsCsv(sampleProject())).toBe("\uFEFFname,length,width,quantity,material,grain,group,notes\r\nSide,30,12,2,Plywood 3/4,length,,\r\n");
  });

  it("round-trips any part list through importPartsCsv", () => {
    const text = fc.stringMatching(/^[A-Za-z0-9](?:[A-Za-z0-9 ,;"'-]{0,18}[A-Za-z0-9])?$/);
    const size = fc.integer({ min: 1, max: 2_000_000 }).map((n) => n / 10_000);
    const part = fc.record({
      name: text,
      length: size,
      width: size,
      quantity: fc.integer({ min: 1, max: 50 }),
      grain: fc.constantFrom<Grain>("length", "width", "none"),
      group: fc.option(text, { nil: undefined }),
      notes: fc.option(text, { nil: undefined }),
    });
    fc.assert(
      fc.property(fc.array(part, { minLength: 1, maxLength: 20 }), (parts) => {
        const project = { ...sampleProject(), parts: parts.map((p, i) => ({ ...p, id: `p${i}`, material: "ply" })) };
        const imported = expectOk(importPartsCsv(exportPartsCsv(project), { units: "in" }));
        expect(imported.issues).toEqual([]);
        expect(imported.rows).toEqual(parts.map((p) => ({ ...p, material: "Plywood 3/4" })));
      }),
    );
  });
});

describe("exportStockCsv", () => {
  it("writes our columns and marks unlimited quantity", () => {
    expect(exportStockCsv(sampleProject())).toBe("\uFEFFmaterial,length,width,thickness,quantity,cost,kind,name\r\nPlywood 3/4,96,48,0.75,unlimited,60,sheet,\r\n");
  });

  it("round-trips through importStockCsv", () => {
    const project = sampleProject();
    project.stock.push({ id: "offcut", material: "ply", length: 30.5, width: 22, quantity: 1, kind: "offcut", name: "Bench, left side" });
    const imported = expectOk(importStockCsv(exportStockCsv(project), { units: "in" }));
    expect(imported.rows).toEqual([
      { material: "Plywood 3/4", length: 96, width: 48, thickness: 0.75, quantity: null, cost: 60, kind: "sheet" },
      { material: "Plywood 3/4", length: 30.5, width: 22, thickness: 0.75, quantity: 1, kind: "offcut", name: "Bench, left side" },
    ]);
  });
});
