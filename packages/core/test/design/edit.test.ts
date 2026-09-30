import { describe, expect, it } from "vitest";
import {
  axisCells,
  defaultDesignName,
  detachDesign,
  materialInUse,
  presetAxis,
  presetDepth,
  regenerateDesigns,
  removeDesign,
  removeMaterial,
  renameDesign,
  type Part,
  type Project,
} from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";

const side: Part = { id: "side", name: "Side", material: "ply18", length: 900, width: 300, quantity: 2, grain: "length" };

function placed(project: Project): Project {
  const placements = project.parts.map((part) => ({ part: part.id, copy: 0, x: 0, y: 0, rotated: false }));
  return { ...project, plan: { sheets: [{ id: "s1", stock: "ply18-sheet", placements }] } };
}

const onSheet = (project: Project) => project.plan!.sheets[0]!.placements.map((p) => p.part);

describe("design names and presets", () => {
  it("names a design by its system and grid", () => {
    expect(defaultDesignName("kallax", 2, 4)).toBe("KALLAX 2x4");
    expect(defaultDesignName("eket", 2, 1)).toBe("EKET 2x1");
    expect(defaultDesignName("custom", 3, 2)).toBe("Custom 3x2");
  });

  it("counts the cells of an axis", () => {
    expect(axisCells({ openings: [335, 400] })).toBe(2);
    expect(axisCells({ outside: 700, cells: 3 })).toBe(3);
  });

  it("makes the preset axis and depth in the project units", () => {
    expect(presetAxis("kallax", 2, "mm")).toEqual({ openings: [335, 335] });
    expect(presetAxis("eket", 2, "in")).toEqual({ outside: 27.559055118, cells: 2 });
    expect(presetDepth("kallax", "in")).toBe(15.354330709);
    expect(presetDepth("eket", "mm")).toBe(350);
  });
});

describe("removeDesign", () => {
  it("removes the design, its parts, and their copies, and keeps the other parts", () => {
    const project = placed(regenerateDesigns({ ...designProject([kallaxDesign(), eketDesign()]), parts: [side] }));
    const next = removeDesign(project, "kx");
    expect(next.designs!.map((d) => d.id)).toEqual(["ek"]);
    expect(next.parts.map((p) => p.id)).toEqual(["side", "ek-vertical", "ek-horizontal", "ek-back"]);
    expect(onSheet(next)).toEqual(["side", "ek-vertical", "ek-horizontal", "ek-back"]);
  });

  it("leaves no designs field when the last design goes", () => {
    const next = removeDesign(regenerateDesigns(designProject()), "kx");
    expect("designs" in next).toBe(false);
    expect(next.parts).toEqual([]);
  });
});

describe("detachDesign", () => {
  it("keeps the parts and their copies as normal parts", () => {
    const project = placed(regenerateDesigns(designProject()));
    const next = detachDesign(project, "kx");
    expect("designs" in next).toBe(false);
    expect(next.parts.map((p) => [p.id, p.design])).toEqual([
      ["kx-vertical", undefined],
      ["kx-horizontal", undefined],
    ]);
    expect("design" in next.parts[0]!).toBe(false);
    expect(onSheet(next)).toEqual(["kx-vertical", "kx-horizontal"]);
    expect(regenerateDesigns(next)).toBe(next);
  });
});

describe("renameDesign", () => {
  it("changes the ids of the design, its parts, and their copies", () => {
    const project = placed(regenerateDesigns({ ...designProject(), parts: [side] }));
    const next = renameDesign(project, "kx", "hall");
    expect(next.designs![0]!.id).toBe("hall");
    expect(next.parts.map((p) => [p.id, p.design])).toEqual([
      ["side", undefined],
      ["hall-vertical", "hall"],
      ["hall-horizontal", "hall"],
    ]);
    expect(onSheet(next)).toEqual(["side", "hall-vertical", "hall-horizontal"]);
    expect(regenerateDesigns(next)).toBe(next);
  });
});

describe("materials that designs use", () => {
  it("counts the design material and the back material as in use", () => {
    const project = { ...designProject([eketDesign()]), stock: [] };
    expect(materialInUse(project, "ply18")).toBe(true);
    expect(materialInUse(project, "ply6")).toBe(true);
    expect(removeMaterial(project, "ply6")).toBe(project);
    expect(materialInUse({ ...designProject([kallaxDesign()]), stock: [] }, "ply6")).toBe(false);
  });

  it("takes the copies off the sheets when the design material changes", () => {
    const project = placed(regenerateDesigns(designProject([eketDesign()])));
    const birch = { ...project, materials: [...project.materials, { id: "birch18", name: "Birch 18", thickness: 18, grained: true }] };
    const next = regenerateDesigns({ ...birch, designs: [eketDesign({ material: "birch18" })] });
    expect(next.parts.map((p) => [p.id, p.material])).toEqual([
      ["ek-vertical", "birch18"],
      ["ek-horizontal", "birch18"],
      ["ek-back", "ply6"],
    ]);
    expect(onSheet(next)).toEqual(["ek-back"]);
  });
});
