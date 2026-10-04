import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import { analyzeProject, analyzeSheets, parseProject, partLabels, planContext, regenerateDesigns, sequenceCuts, type Project } from "../../src/index.ts";
import { designProject, kallaxDesign, sampleProject } from "../helpers.ts";

function labelsOf(project: Project) {
  const ctx = planContext(project);
  const sheets = analyzeSheets(ctx);
  return partLabels(ctx, sheets, sequenceCuts(ctx, sheets));
}

describe("partLabels", () => {
  it("makes one label per part copy with its sheet and the step that frees it", () => {
    const project = sampleProject();
    expect(labelsOf(project)).toEqual([
      { part: "side", copy: 0, name: "Side 1", group: null, length: 30, width: 12, material: "Plywood 3/4", grain: "length", factoryEdge: false, sheetNumber: 1, step: 6 },
      { part: "side", copy: 1, name: "Side 2", group: null, length: 30, width: 12, material: "Plywood 3/4", grain: "length", factoryEdge: false, sheetNumber: 1, step: 7 },
    ]);
  });

  it("leaves the sheet and step empty for unplaced copies, and shows no grain when grain does not matter", () => {
    const project = sampleProject();
    project.plan!.sheets[0]!.placements.pop();
    project.settings.features.grain = false;
    const labels = labelsOf(project);
    expect(labels[1]).toMatchObject({ name: "Side 2", sheetNumber: null, step: null, grain: "none" });
  });

  it("says which copies ask for a factory edge, by their choice or by the rule", () => {
    const project = sampleProject();
    expect(labelsOf(project).map((label) => label.factoryEdge)).toEqual([false, false]);
    project.settings.factoryEdge = { minLength: 30 };
    expect(labelsOf(project).map((label) => label.factoryEdge)).toEqual([true, true]);
    project.parts[0] = { ...project.parts[0]!, factoryEdge: "none" };
    expect(labelsOf(project).map((label) => label.factoryEdge)).toEqual([false, false]);
  });

  it("names the group, and the unit of a design with more than one unit", () => {
    const project = regenerateDesigns(designProject([kallaxDesign({ quantity: 2 })]));
    const tops = labelsOf(project).filter((label) => label.part === "kx-top");
    expect(tops.map((label) => [label.name, label.group])).toEqual([
      ["Top 1", "Hall KALLAX 1 of 2"],
      ["Top 2", "Hall KALLAX 2 of 2"],
    ]);
    const single = labelsOf(regenerateDesigns(designProject([kallaxDesign()])));
    expect(single[0]!.group).toBe("Hall KALLAX");
    const grouped = sampleProject();
    grouped.parts[0]!.group = "Case";
    expect(labelsOf(grouped)[1]!.group).toBe("Case");
  });

  it("frees a part that fills the trimmed sheet at the last trim cut", () => {
    const project = sampleProject();
    project.parts[0] = { ...project.parts[0]!, length: 95.5, width: 47.5, quantity: 1 };
    project.plan!.sheets[0]!.placements = [{ part: "side", copy: 0, x: 0.25, y: 0.25, rotated: false }];
    expect(labelsOf(project)[0]).toMatchObject({ step: 4 });
  });

  it("gives no freeing step to a part that no cut frees", () => {
    const project = sampleProject();
    project.plan!.sheets[0]!.placements[1]!.x = 80;
    const labels = analyzeProject(project).labels;
    expect(labels.map((label) => label.step)).toEqual([7, null]);
    project.plan!.sheets[0]!.placements = [{ part: "side", copy: 0, x: 80, y: 40, rotated: false }];
    expect(analyzeProject(project).labels.map((label) => label.step)).toEqual([null, null]);
  });
});

describe("analyzeProject", () => {
  it("derives everything for the living-room shelf", () => {
    const result = parseProject(EXAMPLES["living-room-shelf"]!());
    if (!result.ok) throw new Error("example did not load");
    const analysis = analyzeProject(result.project);
    expect(analysis.issues).toEqual([]);
    expect(analysis.sheets).toHaveLength(7);
    expect(analysis.steps).toHaveLength(76);
    expect(analysis.labels).toHaveLength(31);
    expect(analysis.labels.every((label) => label.sheetNumber !== null && label.step !== null)).toBe(true);
    expect(analysis.shopping.materials).toHaveLength(2);
  });

  it("returns no labels when the labels feature is off", () => {
    const project = sampleProject();
    project.settings.features.labels = false;
    expect(analyzeProject(project).labels).toEqual([]);
  });
});
