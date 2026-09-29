import { describe, expect, it } from "vitest";
import { buildProblem } from "../../src/optimize/problem.ts";
import { sampleProject } from "../helpers.ts";

describe("buildProblem", () => {
  it("expands copies with their allowed orientations and forces cutOrder on", () => {
    const project = sampleProject();
    project.settings.features.cutOrder = false;
    project.parts.push({ id: "shelf", name: "Shelf", material: "ply", length: 20, width: 10, quantity: 1, grain: "none" });
    const problem = buildProblem({ ...project, plan: { sheets: [] } });
    expect(problem.ctx.features.cutOrder).toBe(true);
    const [material] = problem.materials;
    expect(material!.copies.map((c) => [c.part.id, c.copy, c.orientations])).toEqual([
      ["side", 0, [false]],
      ["side", 1, [false]],
      ["shelf", 0, [false, true]],
    ]);
  });

  it("keeps pinned sheets, skips their copies, and counts their stock", () => {
    const project = sampleProject();
    project.stock[0]!.quantity = 3;
    project.plan!.sheets[0]!.pinned = true;
    project.parts[0]!.quantity = 3;
    const problem = buildProblem(project);
    expect(problem.pinned.map((s) => s.id)).toEqual(["s1"]);
    expect(problem.materials[0]!.copies.map((c) => c.copy)).toEqual([2]);
    expect(problem.materials[0]!.available.get("ply-4x8")).toBe(2);
  });

  it("puts offcuts first, leaves out disabled stock, and reports copies too large for every stock", () => {
    const project = sampleProject();
    project.stock.push(
      { id: "scrap", material: "ply", length: 40, width: 20, quantity: 1, kind: "offcut" },
      { id: "off", material: "ply", length: 200, width: 100, quantity: null, kind: "sheet", enabled: false },
    );
    project.parts.push({ id: "huge", name: "Huge", material: "ply", length: 100, width: 10, quantity: 2, grain: "length" });
    const [material] = buildProblem({ ...project, plan: { sheets: [] } }).materials;
    expect(material!.stock.map((s) => s.id)).toEqual(["scrap", "ply-4x8"]);
    expect(material!.tooLarge).toEqual([
      { part: "huge", copy: 0, reason: "too-large" },
      { part: "huge", copy: 1, reason: "too-large" },
    ]);
  });

  it("lets a grained part rotate only when its grain runs across it", () => {
    const project = sampleProject();
    project.parts[0]!.grain = "width";
    const [material] = buildProblem({ ...project, plan: { sheets: [] } }).materials;
    expect(material!.copies[0]!.orientations).toEqual([true]);
  });
});
