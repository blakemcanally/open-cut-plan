import { describe, expect, it } from "vitest";
import { addSuggestedStock, catalogSize, createProject, hasEnabledStock, materialStatus, materialStatusText, stocklessMaterials, suggestedStock, typicalPrice, withStockFor, type Project } from "../../src/index.ts";

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

describe("materialStatus and materialStatusText", () => {
  const part = (id: string, material: string) => ({ id, name: id, material, length: 10, width: 10, quantity: 3, grain: "none" as const });
  const sheet = (id: string, material: string, extra: Partial<Project["stock"][number]> = {}) => ({ id, material, length: 96, width: 48, quantity: null, kind: "sheet" as const, ...extra });

  it("counts the parts, the enabled stock sizes, and the enabled sheets with no price", () => {
    const base = project();
    const next: Project = {
      ...base,
      parts: [part("a", "birch"), part("b", "birch"), part("c", "plywood")],
      stock: [sheet("s1", "birch"), sheet("s2", "birch", { cost: 50 }), sheet("off", "birch", { kind: "offcut" }), sheet("old", "birch", { enabled: false })],
    };
    expect(materialStatus(next, "birch")).toEqual({ parts: 2, designs: 0, stock: 4, sizes: 3, sheets: 2, unpriced: 1 });
    expect(materialStatusText(materialStatus(next, "birch"))).toBe("Used by 2 parts · 3 sizes · 1 with no price");
    expect(materialStatusText(materialStatus(next, "plywood"))).toBe("Used by 1 part · no stock");
  });

  it("says no price when no enabled sheet has a price, and names a material that nothing uses", () => {
    const base = project();
    const next: Project = { ...base, parts: [part("a", "birch")], stock: [sheet("s1", "birch"), sheet("s2", "plywood", { cost: 10 })] };
    expect(materialStatusText(materialStatus(next, "birch"))).toBe("Used by 1 part · 1 size · no price");
    expect(materialStatusText(materialStatus(next, "plywood"))).toBe("Used by no parts · 1 size");
  });

  it("counts the designs that use the material for the box or the back", () => {
    const base = project();
    const design = { id: "d", name: "D", system: "custom", material: "plywood", width: { outside: 30, cells: 1 }, height: { outside: 30, cells: 1 }, depth: 12, back: { material: "birch" } };
    expect(materialStatus({ ...base, designs: [design] }, "birch").designs).toBe(1);
  });
});
