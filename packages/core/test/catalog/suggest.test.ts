import { describe, expect, it } from "vitest";
import { addSuggestedStock, catalogSize, createProject, hasEnabledStock, stocklessMaterials, suggestedStock, typicalPrice, withStockFor, type Project } from "../../src/index.ts";

function project(units: "in" | "mm" = "in", currency = "USD"): Project {
  const base = createProject("Test", units);
  return {
    ...base,
    settings: { ...base.settings, currency },
    materials: [
      { id: "plywood", name: "Plywood", thickness: 0.75, grained: true },
      { id: "birch", name: 'Birch plywood 3/4"', thickness: 0.75, grained: true },
    ],
  };
}

describe("suggestedStock", () => {
  it("uses the largest catalogue size of the catalogue material with the same name, at the typical price in USD", () => {
    expect(suggestedStock(project(), "birch")).toEqual({ id: "birch-ply-3-4-4x8", material: "birch", length: 96, width: 48, quantity: null, kind: "sheet", cost: typicalPrice(catalogSize("birch-ply-3-4-4x8")!.size)!.usd });
  });

  it("finds the catalogue material by its id too, gives the size in millimetres, and no cost in another currency", () => {
    const base = project("mm", "EUR");
    const mm = { ...base, materials: [{ id: "mdf-3-4", name: "Board", thickness: 19, grained: false }] };
    expect(suggestedStock(mm, "mdf-3-4")).toEqual({ id: "mdf-3-4-4x8", material: "mdf-3-4", length: 2464, width: 1245, quantity: null, kind: "sheet" });
  });

  it("gives a 96 × 48 in sheet with no cost when no catalogue material matches", () => {
    expect(suggestedStock(project(), "plywood")).toEqual({ id: "plywood-96x48", material: "plywood", length: 96, width: 48, quantity: null, kind: "sheet" });
  });

  it("gives a 2440 × 1220 mm sheet in a millimetre project", () => {
    const mm = { ...project("mm"), materials: [{ id: "plywood", name: "Plywood", thickness: 18, grained: true }] };
    expect(suggestedStock(mm, "plywood")).toMatchObject({ length: 2440, width: 1220 });
  });

  it("gives the sheet an id that is not in use", () => {
    const base = project();
    const taken = { ...base, stock: [{ id: "plywood-96x48", material: "birch", length: 1, width: 1, quantity: null, kind: "sheet" as const }] };
    expect(suggestedStock(taken, "plywood").id).toBe("plywood-96x48-2");
  });
});

describe("hasEnabledStock and stocklessMaterials", () => {
  it("lists the materials of the parts that have no enabled stock, in material order", () => {
    const base = project();
    const next: Project = {
      ...base,
      materials: [...base.materials, { id: "spare", name: "Spare", thickness: 0.5, grained: false }],
      stock: [{ id: "off", material: "birch", length: 96, width: 48, quantity: null, kind: "sheet", enabled: false }],
      parts: [
        { id: "a", name: "A", material: "birch", length: 10, width: 10, quantity: 1, grain: "none" },
        { id: "b", name: "B", material: "plywood", length: 10, width: 10, quantity: 1, grain: "none" },
      ],
    };
    expect(hasEnabledStock(next, "birch")).toBe(false);
    expect(stocklessMaterials(next).map((material) => material.id)).toEqual(["plywood", "birch"]);
    const stocked = { ...next, stock: [...next.stock, { id: "on", material: "birch", length: 96, width: 48, quantity: null, kind: "offcut" as const }] };
    expect(hasEnabledStock(stocked, "birch")).toBe(true);
    expect(stocklessMaterials(stocked).map((material) => material.id)).toEqual(["plywood"]);
  });
});

describe("addSuggestedStock and withStockFor", () => {
  it("adds the suggested sheet and returns its id", () => {
    const result = addSuggestedStock(project(), "plywood");
    expect(result.stock).toBe("plywood-96x48");
    expect(result.project.stock).toEqual([suggestedStock(project(), "plywood")]);
  });

  it("adds a sheet only for each material that has no enabled stock, once", () => {
    const base = project();
    const stocked = { ...base, stock: [{ id: "mine", material: "birch", length: 60, width: 60, quantity: 2, kind: "sheet" as const }] };
    const next = withStockFor(stocked, ["plywood", "birch", "plywood", undefined]);
    expect(next.stock.map((stock) => stock.id)).toEqual(["mine", "plywood-96x48"]);
    expect(withStockFor(next, ["plywood", "birch"])).toBe(next);
  });
});
