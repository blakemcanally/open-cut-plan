import { describe, expect, it } from "vitest";
import { cli, memoryIo, withExamples } from "./helpers.ts";

const SHELF = "shelf.cutplan.json";

async function newProject(units: "in" | "mm") {
  const io = memoryIo();
  await cli(["new", "p.json", "--name", "P", "--units", units], io);
  return io;
}

describe("catalog list", () => {
  it("lists the catalogue in inches without a file", async () => {
    const result = await cli(["catalog", "list", "--json"]);
    expect(result.code).toBe(0);
    const data = result.json();
    expect(data.units).toBe("in");
    expect(data.families).toContain("Hardwood plywood");
    const birch = data.materials.find((m: { id: string }) => m.id === "birch-ply-3-4");
    expect(birch).toMatchObject({ family: "Hardwood plywood", name: 'Birch plywood 3/4"', thickness: 0.703 });
    expect(birch.sizes[0]).toMatchObject({ id: "birch-ply-3-4-4x8", label: "4 × 8 ft", length: 96, width: 48, price: { usd: 76.83, store: "Lowe's", checked: "2026-10-04" } });
  });

  it("lists one family in millimetres, by its name or a slug", async () => {
    const byName = await cli(["catalog", "list", "--family", "MDF", "--units", "mm", "--json"]);
    expect(byName.json().materials.map((m: { id: string }) => m.id)).toEqual(["mdf-1-4", "mdf-1-2", "mdf-3-4"]);
    expect(byName.json().materials[2].sizes[0]).toMatchObject({ length: 2464, width: 1245 });
    const bySlug = await cli(["catalog", "list", "--family", "baltic-birch-plywood", "--json"]);
    expect(bySlug.json().materials).toHaveLength(3);
  });

  it("prints one row for each size, with the price, the store, and the date", async () => {
    const text = (await cli(["catalog", "list", "--family", "mdf"])).stdout;
    const lines = text.split("\n");
    expect(lines[0]).toMatch(/^size id\s+material\s+thickness\s+size\s+typical price/);
    expect(text).toMatch(/mdf-3-4-4x8\s+MDF 3\/4"\s+0\.75"\s+4 × 8 ft: 97" × 49"\s+49\.98 USD \(Home Depot, checked 2026-10-04\)/);
    expect(text).toContain("Prices are typical");
    const baltic = (await cli(["catalog", "list", "--family", "baltic birch plywood"])).stdout;
    expect(baltic).toMatch(/baltic-birch-18mm-5x5\s.*no price found/);
  });

  it("refuses an unknown family and lists the known ones", async () => {
    const result = await cli(["catalog", "list", "--family", "granite", "--json"]);
    expect(result.code).toBe(2);
    expect(result.json().error).toMatchObject({ code: "invalid-value", option: "family", known: expect.arrayContaining(["MDF"]) });
  });
});

describe("materials add --catalog", () => {
  it("adds a catalogue material with the actual thickness", async () => {
    const io = await newProject("mm");
    const result = await cli(["materials", "add", "p.json", "--catalog", "baltic-birch-18mm", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json()).toMatchObject({ material: { id: "baltic-birch-18mm", name: 'Baltic birch 3/4" (18 mm)', thickness: 18, grained: true }, added: true });
    expect(result.file("p.json").materials).toHaveLength(1);
    const named = await cli(["materials", "add", "p.json", "--catalog", "mdf-3-4", "--id", "mdf", "--color", "#ccc", "--json"], io);
    expect(named.json().material).toEqual({ id: "mdf", name: 'MDF 3/4"', thickness: 19.1, grained: false, color: "#ccc" });
  });

  it("does not add a material that the project has", async () => {
    const io = await newProject("in");
    await cli(["materials", "add", "p.json", "--catalog", "mdf-3-4"], io);
    const again = await cli(["materials", "add", "p.json", "--catalog", "mdf-3-4", "--json"], io);
    expect(again.code).toBe(0);
    expect(again.json()).toMatchObject({ material: { id: "mdf-3-4" }, added: false, changes: { materials: { added: [] } } });
    expect(again.file("p.json").materials).toHaveLength(1);
  });

  it("refuses an unknown catalogue id, and --name or --thickness with --catalog", async () => {
    const io = await newProject("in");
    const unknown = await cli(["materials", "add", "p.json", "--catalog", "granite", "--json"], io);
    expect(unknown.code).toBe(2);
    expect(unknown.json().error).toMatchObject({ code: "not-found", option: "catalog", id: "granite" });
    const conflict = await cli(["materials", "add", "p.json", "--catalog", "mdf-3-4", "--thickness", "1/2", "--json"], io);
    expect(conflict.code).toBe(2);
    expect(conflict.json().error).toMatchObject({ code: "conflict", option: "thickness" });
    const missing = await cli(["materials", "add", "p.json", "--name", "X", "--json"], io);
    expect(missing.code).toBe(2);
    expect(missing.json().error).toMatchObject({ code: "missing-option", option: "thickness" });
  });
});

describe("stock add --catalog", () => {
  it("adds the material and an unlimited sheet with the typical price", async () => {
    const io = await newProject("in");
    const result = await cli(["stock", "add", "p.json", "--catalog", "birch-ply-3-4-4x8", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json()).toMatchObject({
      stock: { id: "birch-ply-3-4-4x8", material: "birch-ply-3-4", length: 96, width: 48, quantity: null, kind: "sheet", cost: 76.83 },
      material: { id: "birch-ply-3-4", thickness: 0.703 },
      addedMaterial: true,
      added: true,
    });
  });

  it("gives no cost in another currency, and takes --quantity, --cost, --name, and --id", async () => {
    const io = await newProject("mm");
    await cli(["settings", "set", "p.json", "currency", "EUR"], io);
    const plain = await cli(["stock", "add", "p.json", "--catalog", "mdf-3-4-4x8", "--json"], io);
    expect(plain.json().stock).toEqual({ id: "mdf-3-4-4x8", material: "mdf-3-4", length: 2464, width: 1245, quantity: null, kind: "sheet" });
    const custom = await cli(["stock", "add", "p.json", "--catalog", "mdf-3-4-2x4", "--quantity", "2", "--cost", "30", "--name", "Small MDF", "--id", "small", "--json"], io);
    expect(custom.json()).toMatchObject({ stock: { id: "small", material: "mdf-3-4", quantity: 2, cost: 30, name: "Small MDF" }, addedMaterial: false, added: true });
  });

  it("makes no change when the project has the sheet", async () => {
    const io = await newProject("in");
    await cli(["stock", "add", "p.json", "--catalog", "mdf-3-4-4x8"], io);
    const again = await cli(["stock", "add", "p.json", "--catalog", "mdf-3-4-4x8", "--json"], io);
    expect(again.code).toBe(0);
    expect(again.json()).toMatchObject({ stock: { id: "mdf-3-4-4x8" }, added: false, changes: { stock: { added: [] } } });
    expect((await cli(["stock", "add", "p.json", "--catalog", "mdf-3-4-4x8"], io)).stdout).toContain("already");
  });

  it("refuses an unknown size, and --material, --length, --width, or --kind with --catalog", async () => {
    const io = withExamples();
    const unknown = await cli(["stock", "add", SHELF, "--catalog", "mdf-3-4", "--json"], io);
    expect(unknown.code).toBe(2);
    expect(unknown.json().error).toMatchObject({ code: "not-found", option: "catalog", id: "mdf-3-4" });
    for (const option of [["--material", "bb18"], ["--length", "10"], ["--width", "10"], ["--kind", "offcut"]]) {
      const conflict = await cli(["stock", "add", SHELF, "--catalog", "mdf-3-4-4x8", ...option, "--json"], io);
      expect(conflict.code, option[0]).toBe(2);
      expect(conflict.json().error, option[0]).toMatchObject({ code: "conflict" });
    }
    const missing = await cli(["stock", "add", SHELF, "--material", "bb18", "--length", "10", "--json"], io);
    expect(missing.json().error).toMatchObject({ code: "missing-option", option: "width" });
  });
});
