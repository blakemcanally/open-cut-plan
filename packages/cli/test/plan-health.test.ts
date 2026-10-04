import { describe, expect, it } from "vitest";
import { cli, memoryIo, type MemoryIo } from "./helpers.ts";

const F = "wall.cutplan.json";

/** An inch project with two materials and no stock. */
async function bare(): Promise<MemoryIo> {
  const io = memoryIo();
  await cli(["new", F, "--name", "Wall", "--units", "in"], io);
  await cli(["materials", "add", F, "--name", "Ply 3/4", "--id", "p34", "--thickness", "3/4"], io);
  await cli(["materials", "add", F, "--name", 'Birch plywood 1/4"', "--id", "birch", "--thickness", "3/16"], io);
  return io;
}

describe("stock for the design materials", () => {
  it("adds the suggested sheet for each design material that has no enabled stock", async () => {
    const io = await bare();
    const args = ["design", "add", F, "--system", "kallax", "--cols", "1", "--rows", "1", "--material", "p34", "--back", "birch"];
    expect((await cli([...args, "--dry-run"], io)).stdout).toContain("Added stock p34-96x48 and birch-ply-1-4-4x8, because the design materials had no stock.");
    const result = await cli([...args, "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().addedStock).toEqual(["p34-96x48", "birch-ply-1-4-4x8"]);
    expect(result.file(F).stock.map((stock) => [stock.id, stock.material, stock.length, stock.width, stock.cost])).toEqual([
      ["p34-96x48", "p34", 96, 48, undefined],
      ["birch-ply-1-4-4x8", "birch", 96, 48, expect.any(Number)],
    ]);
    const again = await cli(["design", "add", F, "--system", "kallax", "--cols", "1", "--rows", "2", "--material", "p34", "--json"], io);
    expect(again.json().addedStock).toEqual([]);
    expect(again.file(F).stock).toHaveLength(2);
  });

  it("adds the suggested sheet when design set gives a material with no stock", async () => {
    const io = await bare();
    await cli(["stock", "add", F, "--material", "p34", "--length", "96", "--width", "48"], io);
    await cli(["design", "add", F, "--system", "kallax", "--cols", "1", "--rows", "1", "--material", "p34"], io);
    await cli(["materials", "add", F, "--name", "Oak", "--id", "oak", "--thickness", "3/4"], io);
    const result = await cli(["design", "set", F, "kallax-1x1", "--material", "oak", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().addedStock).toEqual(["oak-96x48"]);
  });
});

describe("stock add --suggested", () => {
  it("adds the suggested sheet of a material, and refuses a size or a catalogue size with it", async () => {
    const io = await bare();
    const result = await cli(["stock", "add", F, "--suggested", "--material", "p34", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().stock).toEqual({ id: "p34-96x48", material: "p34", length: 96, width: 48, quantity: null, kind: "sheet" });
    const catalog = await cli(["stock", "add", F, "--suggested", "--material", "birch", "--quantity", "2", "--json"], io);
    expect(catalog.json().stock).toMatchObject({ id: "birch-ply-1-4-4x8", material: "birch", quantity: 2, cost: expect.any(Number) });
    const conflict = await cli(["stock", "add", F, "--suggested", "--material", "p34", "--length", "10", "--json"], io);
    expect(conflict.code).toBe(2);
    expect(conflict.json().error.code).toBe("conflict");
    expect((await cli(["stock", "add", F, "--suggested", "--catalog", "mdf-3-4-4x8", "--json"], io)).code).toBe(2);
  });
});

describe("optimize with a material that has no stock", () => {
  it("gives the reason no-stock-for-material and tells how to add stock", async () => {
    const io = await bare();
    await cli(["parts", "add", F, "--name", "Side", "--length", "30", "--width", "12", "--material", "p34"], io);
    const result = await cli(["optimize", F, "--iterations", "5", "--json"], io);
    expect(result.json().unplaced).toEqual([{ part: "side", copy: 0, name: "Side", reason: "no-stock-for-material" }]);
    const text = await cli(["optimize", F, "--iterations", "5", "--dry-run"], io);
    expect(text.stdout).toContain("  not placed: Side (side copy 0): no-stock-for-material");
    expect(text.stdout).toContain(`  Ply 3/4 has no enabled stock. Add a sheet with: opencutplan stock add ${F} --suggested --material p34`);
  });
});
