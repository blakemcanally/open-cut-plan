import { describe, expect, it } from "vitest";
import { addDesignWithId, createProject, defaultDesignId, defaultDesignName, pickBackMaterial, pickBoxMaterial, presetDesign, type Project } from "../../src/index.ts";
import { designProject, kallaxDesign } from "../helpers.ts";

function pickDesignMaterials(project: Project) {
  const box = pickBoxMaterial(project);
  const back = pickBackMaterial(box.project, box.material);
  return { project: back.project, material: box.material, back: back.material };
}

describe("pickBoxMaterial and pickBackMaterial", () => {
  it("adds a material and a back material with a sheet each to a project that has none", () => {
    const picked = pickDesignMaterials(createProject("New", "mm"));
    expect(picked.material).toBe("plywood");
    expect(picked.back).toBe("plywood-6-mm");
    expect(picked.project.materials.map((m) => [m.id, m.name, m.thickness])).toEqual([
      ["plywood", "Plywood", 18],
      ["plywood-6-mm", "Plywood 6 mm", 6],
    ]);
    expect(picked.project.stock).toEqual([
      { id: "plywood-2440x1220", material: "plywood", length: 2440, width: 1220, quantity: null, kind: "sheet" },
      { id: "plywood-6-mm-2440x1220", material: "plywood-6-mm", length: 2440, width: 1220, quantity: null, kind: "sheet" },
    ]);
  });

  it("uses a thin material that the project has, and adds a sheet only for the material that has no enabled stock", () => {
    const project = { ...designProject(), designs: undefined };
    const picked = pickDesignMaterials({ ...project, stock: project.stock.filter((stock) => stock.material !== "ply6") });
    expect(picked).toMatchObject({ material: "ply18", back: "ply6" });
    expect(picked.project.materials).toEqual(project.materials);
    expect(picked.project.stock).toEqual([project.stock[0], { id: "ply6-2440x1220", material: "ply6", length: 2440, width: 1220, quantity: null, kind: "sheet" }]);
  });

  it("adds the catalogue sheet for a material with the catalogue name, and nothing for a material with stock", () => {
    const base = createProject("Shop", "in");
    const picked = pickDesignMaterials({
      ...base,
      materials: [
        { id: "birch", name: 'Birch plywood 3/4"', thickness: 45 / 64, grained: true },
        { id: "thin", name: "Thin", thickness: 0.25, grained: true },
      ],
      stock: [{ id: "thin-sheet", material: "thin", length: 48, width: 24, quantity: 1, kind: "sheet" }],
    });
    expect(picked).toMatchObject({ material: "birch", back: "thin" });
    expect(picked.project.stock.map((stock) => [stock.id, stock.material, stock.length, stock.width])).toEqual([
      ["thin-sheet", "thin", 48, 24],
      ["birch-ply-3-4-4x8", "birch", 96, 48],
    ]);
  });

  it("gives the new back stock the size of the first sheet of the carcass material, with no cost", () => {
    const base = createProject("Shop", "in");
    const picked = pickDesignMaterials({
      ...base,
      materials: [{ id: "birch", name: "Birch 3/4", thickness: 0.75, grained: true }],
      stock: [{ id: "birch-sheet", material: "birch", length: 97, width: 49, quantity: null, cost: 60, kind: "sheet" }],
    });
    expect(picked.back).toBe("plywood-1-4");
    expect(picked.project.materials.at(-1)).toEqual({ id: "plywood-1-4", name: 'Plywood 1/4"', thickness: 0.25, grained: false });
    expect(picked.project.stock.at(-1)).toEqual({ id: "plywood-1-4-97x49", material: "plywood-1-4", length: 97, width: 49, quantity: null, kind: "sheet" });
  });
});

describe("addDesignWithId", () => {
  const make = (id: string) => presetDesign({ system: "kallax", id, name: defaultDesignName("kallax", 2, 2), material: "ply18", cols: 2, rows: 2, units: "mm" });
  const base = defaultDesignId("kallax", 2, 2);

  it("gives the base as the id when it is free", () => {
    const result = addDesignWithId({ ...designProject(), designs: undefined }, base, make);
    expect(result).toMatchObject({ ok: true, id: "kallax-2x2" });
    expect(result.ok && result.project.designs!.map((design) => design.id)).toEqual(["kallax-2x2"]);
  });

  it("gives the next id when a design has the id", () => {
    const result = addDesignWithId(designProject([kallaxDesign({ id: "kallax-2x2" })]), base, make);
    expect(result).toMatchObject({ ok: true, id: "kallax-2x2-2" });
    expect(result.ok && result.project.designs!.map((design) => design.id)).toEqual(["kallax-2x2", "kallax-2x2-2"]);
  });

  it("gives the next id when a manual part has an id that the design would make", () => {
    const project = { ...designProject([]), parts: [{ id: "kallax-2x2-top", name: "Top", material: "ply18", length: 724, width: 390, quantity: 1, grain: "length" as const }] };
    expect(addDesignWithId(project, base, make)).toMatchObject({ ok: true, id: "kallax-2x2-2" });
  });
});
