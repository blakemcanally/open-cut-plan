import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import { analyzeSheets, parseProject, planContext, shoppingList, type Project } from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

function shopping(project: Project) {
  const ctx = planContext(project);
  return shoppingList(ctx, analyzeSheets(ctx));
}

describe("shoppingList", () => {
  it("counts sheets to buy, prices them, and measures utilization", () => {
    expect(shopping(sampleProject())).toEqual({
      currency: "USD",
      materials: [
        {
          material: "ply",
          name: "Plywood 3/4",
          lines: [
            { stock: "ply-4x8", label: 'Plywood 3/4 96" × 48"', kind: "sheet", length: 96, width: 48, used: 1, buy: 1, unitCost: 60, lineCost: 60 },
          ],
          cost: 60,
          stockArea: 4608,
          partArea: 720,
          utilization: 0.15625,
        },
      ],
      sheets: [{ sheet: "s1", sheetNumber: 1, stock: "ply-4x8", stockArea: 4608, partArea: 720, utilization: 0.15625 }],
      total: 60,
      missingPrices: [],
    });
  });

  it("does not buy owned offcuts", () => {
    const project = sampleProject();
    project.stock.push({ id: "scrap", material: "ply", length: 40, width: 30, quantity: 1, kind: "offcut" });
    project.plan!.sheets.push({ id: "s2", stock: "scrap", placements: [] });
    const line = shopping(project).materials[0]!.lines[1]!;
    expect(line).toMatchObject({ stock: "scrap", used: 1, buy: 0, unitCost: null, lineCost: 0 });
    expect(shopping(project).total).toBe(60);
  });

  it("leaves the total empty when a bought sheet has no price", () => {
    const project = sampleProject();
    delete project.stock[0]!.cost;
    expect(shopping(project)).toMatchObject({ total: null, missingPrices: ["ply-4x8"] });
  });

  it("shows no prices when the cost feature is off", () => {
    const project = sampleProject();
    project.settings.features.cost = false;
    const list = shopping(project);
    expect(list.materials[0]!.lines[0]).toMatchObject({ unitCost: null, lineCost: null });
    expect(list).toMatchObject({ total: null, missingPrices: [] });
  });

  it("lists the living-room shelf's 5 + 2 sheets", () => {
    const result = parseProject(EXAMPLES["living-room-shelf"]!());
    if (!result.ok) throw new Error("example did not load");
    const list = shopping(result.project);
    expect(list.materials.map((material) => [material.material, material.lines[0]!.buy])).toEqual([
      ["bb18", 5],
      ["bb6", 2],
    ]);
    expect(list.missingPrices).toEqual(["bb18-5x5", "bb6-5x5"]);
  });
});
