import { describe, expect, it } from "vitest";
import { regenerateDesigns } from "../../src/design/generate.ts";
import { buildProblem } from "../../src/optimize/problem.ts";
import { designProject, eketDesign, sampleProject } from "../helpers.ts";

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

  it("reports the copies of a material with no enabled stock as no-stock-for-material, not too-large", () => {
    const project = sampleProject();
    project.materials.push({ id: "mdf", name: "MDF", thickness: 0.75, grained: false });
    project.stock.push({ id: "mdf-off", material: "mdf", length: 96, width: 48, quantity: null, kind: "sheet", enabled: false });
    project.parts.push({ id: "door", name: "Door", material: "mdf", length: 20, width: 10, quantity: 2, grain: "none" });
    const materials = buildProblem({ ...project, plan: { sheets: [] } }).materials;
    expect(materials.find((m) => m.material === "mdf")!.tooLarge).toEqual([
      { part: "door", copy: 0, reason: "no-stock-for-material" },
      { part: "door", copy: 1, reason: "no-stock-for-material" },
    ]);
  });

  it("lets a grained part rotate only when its grain runs across it", () => {
    const project = sampleProject();
    project.parts[0]!.grain = "width";
    const [material] = buildProblem({ ...project, plan: { sheets: [] } }).materials;
    expect(material!.copies[0]!.orientations).toEqual([true]);
  });
});

describe("the groups of the copies", () => {
  it("gives each copy the colour key of its design unit or its group, and no key to a part without either", () => {
    const project = regenerateDesigns(designProject([eketDesign()]));
    project.parts.push(
      { id: "box", name: "Box", material: "ply18", length: 300, width: 200, quantity: 1, grain: "length", group: "Toy box" },
      { id: "loose", name: "Loose", material: "ply18", length: 300, width: 200, quantity: 1, grain: "length" },
    );
    const [material] = buildProblem(project).materials;
    const groups = (id: string) => material!.copies.filter((c) => c.part.id === id).map((c) => c.group);
    expect(groups("ek-top")).toEqual(["design:ek#1", "design:ek#2"]);
    expect(groups("ek-side")).toEqual(["design:ek#1", "design:ek#1", "design:ek#2", "design:ek#2"]);
    expect(groups("box")).toEqual(["group:Toy box"]);
    expect(groups("loose")).toEqual([null]);
  });

  it("counts the pinned sheets of the material that hold each group", () => {
    const project = sampleProject();
    project.parts[0]!.group = "Case";
    project.parts[0]!.quantity = 4;
    project.materials.push({ id: "mdf", name: "MDF", thickness: 0.5, grained: false });
    project.stock.push({ id: "mdf-4x8", material: "mdf", length: 96, width: 48, quantity: null, kind: "sheet" });
    project.parts.push({ id: "back", name: "Back", material: "mdf", length: 30, width: 20, quantity: 1, grain: "none", group: "Case" });
    project.plan = {
      sheets: [
        { id: "a", stock: "ply-4x8", pinned: true, placements: [{ part: "side", copy: 0, x: 0.25, y: 0.25, rotated: false }] },
        { id: "b", stock: "ply-4x8", pinned: true, placements: [{ part: "side", copy: 1, x: 0.25, y: 0.25, rotated: false }] },
        { id: "c", stock: "ply-4x8", placements: [{ part: "side", copy: 2, x: 0.25, y: 0.25, rotated: false }] },
      ],
    };
    const [ply, mdf] = buildProblem(project).materials;
    expect([...ply!.pinnedGroups]).toEqual([["group:Case", 2]]);
    expect([...mdf!.pinnedGroups]).toEqual([]);
  });
});

describe("the factory edge requests of the copies", () => {
  it("lists the parts of each material that ask for a factory edge, by their choice or by the rule", () => {
    const project = sampleProject();
    project.parts.push(
      { id: "long", name: "Long", material: "ply", length: 40, width: 10, quantity: 1, grain: "none" },
      { id: "kept", name: "Kept", material: "ply", length: 10, width: 10, quantity: 1, grain: "none", factoryEdge: "long" },
      { id: "plain", name: "Plain", material: "ply", length: 50, width: 10, quantity: 1, grain: "none", factoryEdge: "none" },
    );
    expect([...buildProblem(project).materials[0]!.factoryEdgeParts]).toEqual(["kept"]);
    project.settings.factoryEdge = { minLength: 30 };
    expect([...buildProblem(project).materials[0]!.factoryEdgeParts]).toEqual(["side", "long", "kept"]);
  });
});
