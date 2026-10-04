import { describe, expect, it } from "vitest";
import {
  addCatalogMaterial,
  addCatalogStock,
  catalogFor,
  catalogMaterial,
  catalogSize,
  createProject,
  projectMaterialFor,
  projectStockFor,
  typicalPrice,
  type Project,
} from "../../src/index.ts";

function project(units: "in" | "mm" = "in", currency = "USD"): Project {
  const base = createProject("Test", units);
  return { ...base, settings: { ...base.settings, currency } };
}

describe("catalogFor", () => {
  it("gives the sizes and the thickness in inches", () => {
    const birch = catalogFor("in").find((material) => material.id === "birch-ply-3-4")!;
    expect(birch).toMatchObject({ family: "Hardwood plywood", name: 'Birch plywood 3/4"', nominal: '3/4"', thickness: 0.703, grained: true });
    expect(birch.sizes[0]).toMatchObject({ id: "birch-ply-3-4-4x8", label: "4 × 8 ft", length: 96, width: 48 });
  });

  it("gives the sizes and the thickness in millimetres", () => {
    const birch = catalogFor("mm").find((material) => material.id === "birch-ply-3-4")!;
    expect(birch.thickness).toBe(17.9);
    expect(birch.sizes[0]).toMatchObject({ length: 2438, width: 1219 });
  });

  it("gives the lowest price of each size as its typical price", () => {
    const size = catalogFor("in").find((material) => material.id === "birch-ply-3-4")!.sizes.find((s) => s.id === "birch-ply-3-4-2x4")!;
    expect(size.listings.length).toBeGreaterThan(1);
    expect(size.price).toEqual({ usd: 29.72, store: "Home Depot", source: expect.stringMatching(/^https:\/\/www\.homedepot\.com\//), checked: "2026-10-04" });
    expect(size.price!.usd).toBe(Math.min(...size.listings.flatMap((listing) => (listing.priceUsd === null ? [] : [listing.priceUsd]))));
  });

  it("gives no price when no listing has one", () => {
    const size = catalogSize("baltic-birch-18mm-5x5")!.size;
    expect(typicalPrice(size)).toBeNull();
  });

  it("filters by family, without case", () => {
    const mdf = catalogFor("in", "mdf");
    expect(mdf.map((material) => material.id)).toEqual(["mdf-1-4", "mdf-1-2", "mdf-3-4"]);
    expect(catalogFor("in", "Nothing")).toEqual([]);
  });
});

describe("catalogMaterial and catalogSize", () => {
  it("find an entry by id", () => {
    expect(catalogMaterial("mdf-3-4")?.name).toBe('MDF 3/4"');
    expect(catalogMaterial("nothing")).toBeUndefined();
    expect(catalogSize("mdf-3-4-4x8")).toMatchObject({ material: { id: "mdf-3-4" }, size: { id: "mdf-3-4-4x8" } });
    expect(catalogSize("mdf-3-4")).toBeUndefined();
  });
});

describe("addCatalogMaterial", () => {
  it("adds the material with the actual thickness in the project units", () => {
    const result = addCatalogMaterial(project("mm"), "baltic-birch-18mm");
    expect(result).toMatchObject({ material: "baltic-birch-18mm", addedMaterial: true, stock: null, addedStock: false });
    expect(result.project.materials).toEqual([{ id: "baltic-birch-18mm", name: 'Baltic birch 3/4" (18 mm)', thickness: 18, grained: true }]);
    expect(result.project.stock).toEqual([]);
  });

  it("uses a material with the same name and thickness, and does not add it again", () => {
    const base = { ...project(), materials: [{ id: "bb", name: 'baltic birch 3/4" (18 mm) ', thickness: 0.709, grained: true }] };
    const result = addCatalogMaterial(base, "baltic-birch-18mm");
    expect(result).toMatchObject({ material: "bb", addedMaterial: false });
    expect(result.project).toBe(base);
  });

  it("uses a material with the catalogue id and the same thickness after a rename", () => {
    const base = { ...project("mm"), materials: [{ id: "mdf-3-4", name: "Shop MDF", thickness: 19.05, grained: false }] };
    expect(addCatalogMaterial(base, "mdf-3-4")).toMatchObject({ material: "mdf-3-4", addedMaterial: false });
  });

  it("adds a new material when the name is the same but the thickness is not", () => {
    const base = { ...project(), materials: [{ id: "mdf-3-4", name: 'MDF 3/4"', thickness: 0.5, grained: false }] };
    const result = addCatalogMaterial(base, "mdf-3-4");
    expect(result).toMatchObject({ material: "mdf-3-4-2", addedMaterial: true });
    expect(result.project.materials[1]).toMatchObject({ id: "mdf-3-4-2", thickness: 0.75 });
  });

  it("adds the largest sheet size too, when asked and the project has no sheet of the material", () => {
    const first = addCatalogMaterial(project(), "mdf-3-4", { sheet: true });
    expect(first).toMatchObject({ material: "mdf-3-4", stock: "mdf-3-4-4x8", addedStock: true });
    expect(first.project.stock).toEqual([{ id: "mdf-3-4-4x8", material: "mdf-3-4", length: 97, width: 49, quantity: null, kind: "sheet", cost: 49.98 }]);
    const again = addCatalogMaterial(first.project, "mdf-3-4", { sheet: true });
    expect(again).toMatchObject({ material: "mdf-3-4", stock: null, addedMaterial: false, addedStock: false });
    expect(again.project).toBe(first.project);
  });

  it("throws for an unknown id", () => {
    expect(() => addCatalogMaterial(project(), "nothing")).toThrow(/nothing/);
  });
});

describe("addCatalogStock", () => {
  it("adds the material and an unlimited sheet with the typical price in a USD project", () => {
    const result = addCatalogStock(project(), "birch-ply-3-4-2x4");
    expect(result).toMatchObject({ material: "birch-ply-3-4", stock: "birch-ply-3-4-2x4", addedMaterial: true, addedStock: true });
    expect(result.project.stock).toEqual([{ id: "birch-ply-3-4-2x4", material: "birch-ply-3-4", length: 47.75, width: 23.75, quantity: null, kind: "sheet", cost: 29.72 }]);
  });

  it("adds no cost in a project with another currency, and no cost when the size has no price", () => {
    expect(addCatalogStock(project("mm", "EUR"), "birch-ply-3-4-4x8").project.stock[0]).toEqual({
      id: "birch-ply-3-4-4x8",
      material: "birch-ply-3-4",
      length: 2438,
      width: 1219,
      quantity: null,
      kind: "sheet",
    });
    expect(addCatalogStock(project(), "baltic-birch-18mm-5x5").project.stock[0]).not.toHaveProperty("cost");
  });

  it("uses the quantity that the caller gives", () => {
    expect(addCatalogStock(project(), "mdf-1-2-4x8", { quantity: 3 }).project.stock[0]!.quantity).toBe(3);
  });

  it("uses a material and a sheet of the same size that the project has", () => {
    const first = addCatalogStock(project(), "mdf-1-2-4x8");
    const second = addCatalogStock(first.project, "mdf-1-2-2x4");
    expect(second).toMatchObject({ material: "mdf-1-2", addedMaterial: false, addedStock: true });
    expect(second.project.materials).toHaveLength(1);
    const again = addCatalogStock(second.project, "mdf-1-2-4x8");
    expect(again).toMatchObject({ stock: "mdf-1-2-4x8", addedStock: false });
    expect(again.project).toBe(second.project);
    expect(projectStockFor(again.project, "mdf-1-2-4x8")?.id).toBe("mdf-1-2-4x8");
    expect(projectMaterialFor(again.project, "mdf-1-2")?.id).toBe("mdf-1-2");
  });

  it("does not use an offcut of the same size, and gives a new stock id when the id is taken", () => {
    const base = addCatalogMaterial(project(), "mdf-1-2").project;
    const withOffcut = { ...base, stock: [{ id: "mdf-1-2-4x8", material: "mdf-1-2", length: 97, width: 49, quantity: 1, kind: "offcut" as const }] };
    const result = addCatalogStock(withOffcut, "mdf-1-2-4x8");
    expect(result).toMatchObject({ stock: "mdf-1-2-4x8-2", addedStock: true });
  });

  it("throws for an unknown id", () => {
    expect(() => addCatalogStock(project(), "mdf-1-2")).toThrow(/mdf-1-2/);
  });
});
