import { describe, expect, it } from "vitest";
import { analyzeSheets, convertProjectUnits, createProject, listOffcuts, planContext, saveOffcutsToStock, unsavedOffcuts, validatePlan, type Offcut, type Project } from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

function offcuts(project: Project) {
  const ctx = planContext(project);
  return listOffcuts(ctx, analyzeSheets(ctx));
}

describe("listOffcuts", () => {
  it("lists waste pieces at least the minimum offcut size", () => {
    expect(offcuts(sampleProject())).toEqual([
      { sheet: "s1", sheetNumber: 1, stock: "ply-4x8", material: "ply", rect: { x: 30.375, y: 0.25, length: 65.375, width: 12 } },
      { sheet: "s1", sheetNumber: 1, stock: "ply-4x8", material: "ply", rect: { x: 30.375, y: 12.375, length: 65.375, width: 12 } },
      { sheet: "s1", sheetNumber: 1, stock: "ply-4x8", material: "ply", rect: { x: 0.25, y: 24.5, length: 95.5, width: 23.25 } },
    ]);
  });

  it("uses the minimum offcut setting and the offcuts feature", () => {
    const project = sampleProject();
    project.settings.minOffcut = { length: 70, width: 20 };
    expect(offcuts(project).map((offcut) => offcut.rect.width)).toEqual([23.25]);
    project.settings.features.offcuts = false;
    expect(offcuts(project)).toEqual([]);
  });

  it("lists nothing for a sheet without placements", () => {
    const project = sampleProject();
    project.plan!.sheets[0]!.placements = [];
    expect(offcuts(project)).toEqual([]);
  });
});

describe("saveOffcutsToStock", () => {
  it("adds each offcut as owned stock with no cost and no trim", () => {
    const project = sampleProject();
    const saved = saveOffcutsToStock(project, offcuts(project));
    expect(saved.stock.slice(1)).toEqual([
      { id: "ply-offcut", material: "ply", length: 65.375, width: 12, quantity: 1, cost: 0, kind: "offcut", trim: 0, name: "Offcut from Test, sheet 1" },
      { id: "ply-offcut-2", material: "ply", length: 65.375, width: 12, quantity: 1, cost: 0, kind: "offcut", trim: 0, name: "Offcut from Test, sheet 1" },
      { id: "ply-offcut-3", material: "ply", length: 95.5, width: 23.25, quantity: 1, cost: 0, kind: "offcut", trim: 0, name: "Offcut from Test, sheet 1" },
    ]);
    expect(project.stock).toHaveLength(1);
    expect(validatePlan(saved)).toEqual([]);
  });

  it("rounds saved sizes down to 1/64\" or 0.1 mm, ignoring float noise", () => {
    const offcut = (length: number, width: number): Offcut => ({ sheet: "s1", sheetNumber: 1, stock: "st", material: "m", rect: { x: 0, y: 0, length, width } });
    const mm = saveOffcutsToStock(createProject("Mm", "mm"), [offcut(265.60000000000014, 299.9999999999999), offcut(400.19, 150.06)]);
    expect(mm.stock.map((stock) => [stock.length, stock.width])).toEqual([
      [265.6, 300],
      [400.1, 150],
    ]);
    const inches = saveOffcutsToStock(createProject("In", "in"), [offcut(12.3456, 23.999999999999996)]);
    expect(inches.stock.map((stock) => [stock.length, stock.width])).toEqual([[12.34375, 24]]);
  });
});

describe("unsavedOffcuts", () => {
  it("still finds saved offcuts after a unit change and a project rename", () => {
    const saved = saveOffcutsToStock(sampleProject(), offcuts(sampleProject()));
    expect(unsavedOffcuts(saved, offcuts(saved))).toEqual([]);
    const mm = convertProjectUnits(saved, "mm");
    expect(unsavedOffcuts(mm, offcuts(mm))).toEqual([]);
    const renamed = { ...mm, project: { ...mm.project, name: "Renamed" } };
    expect(unsavedOffcuts(renamed, offcuts(renamed))).toEqual([]);
    expect(unsavedOffcuts(convertProjectUnits(renamed, "in"), offcuts(convertProjectUnits(renamed, "in")))).toEqual([]);
  });

  it("does not count an offcut from another sheet or of another size", () => {
    const project = sampleProject();
    const [first] = offcuts(project);
    const stock = saveOffcutsToStock(project, [first!]).stock.at(-1)!;
    const otherSheet = { ...project, stock: [...project.stock, { ...stock, name: "Offcut from Test, sheet 2" }] };
    expect(unsavedOffcuts(otherSheet, offcuts(otherSheet))).toHaveLength(3);
    const bigger = { ...project, stock: [...project.stock, { ...stock, length: stock.length + 1 / 32 }] };
    expect(unsavedOffcuts(bigger, offcuts(bigger))).toHaveLength(3);
  });
});
