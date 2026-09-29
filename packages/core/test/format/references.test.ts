import { describe, expect, it } from "vitest";
import { checkReferences, parseProject, serializeProject, type Project } from "../../src/index.ts";
import { designProject, kallaxDesign, sampleProject } from "../helpers.ts";

function sheet(project: Project) {
  return project.plan!.sheets[0]!;
}

describe("checkReferences", () => {
  it("accepts the sample project", () => {
    expect(checkReferences(sampleProject())).toEqual([]);
  });

  it("finds duplicate ids", () => {
    const project = sampleProject();
    project.materials.push({ ...project.materials[0]! });
    expect(checkReferences(project)).toEqual([
      { severity: "error", code: "duplicate-id", message: 'The id "ply" is used more than once in materials.', path: ["materials", 1, "id"] },
    ]);
  });

  it("finds a part with a missing material", () => {
    const project = sampleProject();
    project.parts[0]!.material = "oak";
    expect(checkReferences(project)).toEqual([
      { severity: "error", code: "bad-ref", message: 'Part "Side" uses material "oak", which does not exist.', path: ["parts", 0, "material"] },
    ]);
  });

  it("finds stock with a missing material", () => {
    const project = sampleProject();
    project.stock[0]!.material = "oak";
    const issues = checkReferences(project);
    expect(issues.map((issue) => issue.path)).toEqual([["stock", 0, "material"]]);
  });

  it("finds a sheet with missing stock", () => {
    const project = sampleProject();
    sheet(project).stock = "ply-5x5";
    expect(checkReferences(project)[0]).toMatchObject({ severity: "warning", code: "bad-ref", path: ["plan", "sheets", 0, "stock"] });
  });

  it("finds a placement of a missing part", () => {
    const project = sampleProject();
    sheet(project).placements[0]!.part = "door";
    expect(checkReferences(project)[0]).toMatchObject({
      severity: "warning",
      code: "bad-ref",
      message: 'Sheet "s1" places part "door", which does not exist.',
      path: ["plan", "sheets", 0, "placements", 0, "part"],
    });
  });

  it("finds a copy number past the part quantity", () => {
    const project = sampleProject();
    sheet(project).placements[1]!.copy = 2;
    expect(checkReferences(project)).toEqual([
      {
        severity: "warning",
        code: "bad-copy",
        message: 'Sheet "s1" places copy 3 of "Side", but its quantity is 2.',
        path: ["plan", "sheets", 0, "placements", 1, "copy"],
      },
    ]);
  });

  it("finds a copy placed twice", () => {
    const project = sampleProject();
    sheet(project).placements[1]!.copy = 0;
    expect(checkReferences(project)).toEqual([
      {
        severity: "warning",
        code: "duplicate-placement",
        message: 'Copy 1 of "Side" is placed more than once.',
        path: ["plan", "sheets", 0, "placements", 1],
      },
    ]);
  });

  it("finds a cut with a missing tool", () => {
    const project = sampleProject();
    sheet(project).cuts = [{ step: 1, stage: 1, axis: "y", at: 12.3125, from: 0, to: 96, tool: "router" }];
    expect(checkReferences(project)[0]).toMatchObject({ severity: "warning", code: "bad-ref", path: ["plan", "sheets", 0, "cuts", 0, "tool"] });
  });

  it("finds duplicate sheet ids as a warning", () => {
    const project = sampleProject();
    project.plan!.sheets.push({ id: "s1", stock: "ply-4x8", placements: [] });
    expect(checkReferences(project)).toEqual([
      { severity: "warning", code: "duplicate-id", message: 'The id "s1" is used more than once in plan.sheets.', path: ["plan", "sheets", 1, "id"] },
    ]);
  });

  it("finds duplicate ids in stock, parts, and tools as errors", () => {
    const project = sampleProject();
    project.stock.push({ ...project.stock[0]! });
    project.parts.push({ ...project.parts[0]! });
    project.tools.push({ ...project.tools[0]! });
    expect(checkReferences(project).map((issue) => [issue.severity, issue.code, issue.path[0]])).toEqual([
      ["error", "duplicate-id", "stock"],
      ["error", "duplicate-id", "parts"],
      ["error", "duplicate-id", "tools"],
    ]);
  });
});

describe("design references", () => {
  it("refuses two designs with the same id", () => {
    const project = designProject([kallaxDesign(), kallaxDesign({ name: "Second" })]);
    const result = parseProject(serializeProject(project));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors).toEqual([expect.objectContaining({ code: "duplicate-id", path: ["designs", 1, "id"] })]);
  });

  it("loads a part that names a missing design, with a warning", () => {
    const project = designProject([]);
    project.parts = [{ id: "old", name: "Old shelf", material: "ply18", length: 300, width: 200, quantity: 1, grain: "length", design: "gone" }];
    const result = parseProject(serializeProject(project));
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([expect.objectContaining({ severity: "warning", code: "design-missing", path: ["parts", 0, "design"] })]);
  });

  it("accepts a part that names an existing design", () => {
    const project = designProject([kallaxDesign()]);
    project.parts = [{ id: "kx-vertical", name: "Vertical panel", material: "ply18", length: 1430, width: 390, quantity: 3, grain: "length", design: "kx" }];
    expect(parseProject(serializeProject(project)).warnings).toEqual([]);
  });
});
