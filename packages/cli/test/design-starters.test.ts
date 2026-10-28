import { addStarterDesign, IKEA_NOTICE, regenerateDesigns, starterById, STARTERS } from "@opencutplan/core";
import { describe, expect, it } from "vitest";
import { cli, memoryIo, type MemoryIo } from "./helpers.ts";

const F = "hall.cutplan.json";

async function fresh(units: "mm" | "in" = "mm"): Promise<MemoryIo> {
  const io = memoryIo();
  await cli(["new", F, "--name", "Hall", "--units", units], io);
  return io;
}

const errorOf = (result: { json(): Record<string, any> }) => result.json().error;

describe("design starters", () => {
  it("lists the starters in order, with the notice", async () => {
    const result = await cli(["design", "starters", "--json"]);
    expect(result.code).toBe(0);
    const json = result.json();
    expect(json.starters.map((starter: { id: string }) => starter.id)).toEqual(["cube-shelf", "tv-bench", "media-unit", "bookcase", "wall-cubes", "nightstand", "crate", "stacking-shelf", "custom-grid"]);
    expect(json.starters).toEqual(JSON.parse(JSON.stringify(STARTERS.map(({ id, name, group, note, choices, defaults }) => ({ id, name, group, note, choices, defaults })))));
    expect(json.notice).toBe(IKEA_NOTICE);
  });

  it("ends the text with the notice", async () => {
    const result = await cli(["design", "starters"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("cube-shelf");
    expect(result.stdout).toContain("--size");
    expect(result.stdout.trimEnd().endsWith(IKEA_NOTICE)).toBe(true);
  });
});

describe("design add --starter", () => {
  it("adds the design of the starter with the same file as the core function", async () => {
    const io = await fresh();
    const before = io.files.get(F)!;
    const result = await cli(["design", "add", F, "--starter", "cube-shelf", "--cols", "3", "--rows", "2", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().design).toMatchObject({ id: "cube-shelf-3-2", name: "Cube shelf 3 × 2", system: "kallax", back: { material: "plywood-6-mm" } });
    expect(result.json().addedStock).toHaveLength(2);
    const { parseProject } = await import("@opencutplan/core");
    const parsed = parseProject(before);
    if (!parsed.ok) throw new Error("bad file");
    const expected = addStarterDesign(parsed.project, starterById("cube-shelf")!, { columns: 3, rows: 2, options: {} });
    if (!expected.ok) throw new Error("not added");
    expect(result.file(F)).toEqual(regenerateDesigns(expected.project));
  });

  it("names the added stock in the text", async () => {
    const result = await cli(["design", "add", F, "--starter", "cube-shelf"], await fresh());
    expect(result.stdout).toContain("Added design cube-shelf-2-4");
    expect(result.stdout).toContain("Added stock");
  });

  it("uses the defaults of the starter without choice flags", async () => {
    const result = await cli(["design", "add", F, "--starter", "bookcase", "--json"], await fresh());
    expect(result.json().design).toMatchObject({ id: "bookcase-80-202", system: "custom", width: { outside: 800 } });
  });

  it("sets the mount of the TV bench", async () => {
    const result = await cli(["design", "add", F, "--starter", "tv-bench", "--mount", "floor", "--json"], await fresh());
    expect(result.code).toBe(0);
    expect(result.json().design.mount).toBeUndefined();
    const legs = await cli(["design", "add", F, "--starter", "tv-bench", "--json"], await fresh());
    expect(legs.json().design.mount).toBe("legs");
  });

  it("sets the width and the height of the bookcase from --size", async () => {
    const result = await cli(["design", "add", F, "--starter", "bookcase", "--size", "40x106", "--json"], await fresh());
    expect(result.code).toBe(0);
    expect(result.json().design).toMatchObject({ width: { outside: 400, cells: 1 }, height: { outside: 1060, cells: 3 } });
  });

  it("changes the design after the starter makes it", async () => {
    const result = await cli(["design", "add", F, "--starter", "cube-shelf", "--quantity", "2", "--depth", "300", "--color", "2=#ff8800", "--json"], await fresh());
    expect(result.code).toBe(0);
    expect(result.json().design).toMatchObject({ quantity: 2, depth: 300 });
    expect(result.json().design.colors).toEqual(["", "#ff8800"]);
  });

  it("takes the name, the materials, and no back", async () => {
    const io = await fresh();
    await cli(["materials", "add", F, "--name", "Ply 18", "--id", "ply18", "--thickness", "18"], io);
    const result = await cli(["design", "add", F, "--starter", "nightstand", "--name", "Bed side", "--material", "ply18", "--back", "none", "--json"], io);
    expect(result.code).toBe(0);
    const design = result.json().design;
    expect(design).toMatchObject({ id: "bed-side", name: "Bed side", material: "ply18" });
    expect(design.back).toBeUndefined();
    expect(result.json().addedStock).toHaveLength(1);
  });

  it("uses --id as given, and refuses an id in use", async () => {
    const io = await fresh();
    const made = await cli(["design", "add", F, "--starter", "cube-shelf", "--id", "mine", "--json"], io);
    expect(made.json().design.id).toBe("mine");
    const again = await cli(["design", "add", F, "--starter", "cube-shelf", "--id", "mine", "--json"], io);
    expect(again.code).toBe(2);
    expect(errorOf(again).code).toBe("duplicate-id");
  });

  it("gives the next id when a design has the id", async () => {
    const io = await fresh();
    await cli(["design", "add", F, "--starter", "cube-shelf", "--json"], io);
    const second = await cli(["design", "add", F, "--starter", "cube-shelf", "--json"], io);
    expect(second.json().design.id).toBe("cube-shelf-2-4-2");
  });

  it("refuses a flag that the starter has no choice for", async () => {
    const cols = await cli(["design", "add", F, "--starter", "bookcase", "--cols", "3", "--json"], await fresh());
    expect(cols.code).toBe(2);
    expect(errorOf(cols).code).toBe("invalid-value");
    const mount = await cli(["design", "add", F, "--starter", "cube-shelf", "--mount", "legs", "--json"], await fresh());
    expect(mount.code).toBe(2);
    expect(errorOf(mount).code).toBe("invalid-value");
    const size = await cli(["design", "add", F, "--starter", "cube-shelf", "--size", "40x106", "--json"], await fresh());
    expect(size.code).toBe(2);
    expect(errorOf(size).code).toBe("invalid-value");
  });

  it("names the starter as written in a refusal", async () => {
    const result = await cli(["design", "add", F, "--starter", "tv-bench", "--size", "40x106", "--json"], await fresh());
    expect(errorOf(result).message).toContain("The TV bench has no --size choice.");
  });

  it("refuses a value that the starter does not allow, and lists the allowed values", async () => {
    const cols = await cli(["design", "add", F, "--starter", "cube-shelf", "--cols", "7", "--json"], await fresh());
    expect(cols.code).toBe(2);
    expect(errorOf(cols)).toMatchObject({ code: "invalid-value" });
    expect(errorOf(cols).message).toContain("1 to 6");
    const mount = await cli(["design", "add", F, "--starter", "tv-bench", "--mount", "feet", "--json"], await fresh());
    expect(errorOf(mount).message).toContain("Legs or Floor");
    const size = await cli(["design", "add", F, "--starter", "bookcase", "--size", "50x106", "--json"], await fresh());
    expect(errorOf(size)).toMatchObject({ code: "invalid-value" });
    expect(errorOf(size).message).toContain("40 cm or 80 cm");
    const text = await cli(["design", "add", F, "--starter", "bookcase", "--size", "big", "--json"], await fresh());
    expect(errorOf(text).code).toBe("invalid-value");
  });

  it.each([["--system", "kallax"], ["--width", "900"], ["--height", "900"], ["--column-openings", "335"], ["--row-openings", "335"]])("refuses %s with --starter", async (flag, value) => {
    const result = await cli(["design", "add", F, "--starter", "cube-shelf", flag, value, "--json"], await fresh());
    expect(result.code).toBe(2);
    expect(errorOf(result).code).toBe("conflict");
  });

  it("adds a crate from the starter, with its parts and finish steps", async () => {
    const io = await fresh("in");
    const result = await cli(["design", "add", F, "--starter", "crate", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().design).toMatchObject({ id: "crate", kind: "open-box", system: "kallax" });
    expect(result.json().parts.map((part: { id: string }) => part.id)).toEqual(["crate-front", "crate-back", "crate-side", "crate-bottom"]);
    const report = await cli(["report", "assembly", F, "--json"], io);
    const steps = report.json().designs[0].steps;
    expect(steps.at(-1)).toMatchObject({ action: "finish", title: "Finish" });
    expect(steps.at(-1).body).toContain("Sand lightly.");
  });

  it("lists the crate starter with no choices", async () => {
    const result = await cli(["design", "starters", "--json"]);
    const crate = result.json().starters.find((starter: { id: string }) => starter.id === "crate");
    expect(crate).toMatchObject({ group: "Accessories", choices: [] });
  });

  it.each(["birch", "none"])("refuses --back %s for the crate", async (back) => {
    const io = await fresh("in");
    await cli(["materials", "add", F, "--name", "Birch", "--id", "birch", "--thickness", "0.75"], io);
    const before = io.files.get(F);
    const result = await cli(["design", "add", F, "--starter", "crate", "--back", back, "--json"], io);
    expect(result.code).toBe(2);
    expect(errorOf(result)).toMatchObject({ code: "invalid-value", option: "back", starter: "crate" });
    expect(errorOf(result).message).toContain("The Crate has no --back choice.");
    expect(io.files.get(F)).toBe(before);
  });

  it("replaces the finish steps of the crate with --finish", async () => {
    const result = await cli(["design", "add", F, "--starter", "crate", "--finish", "Paint it.", "--json"], await fresh("in"));
    expect(result.code).toBe(0);
    expect(result.json().design.finish).toEqual(["Paint it."]);
  });

  it("refuses an unknown starter and lists the ids", async () => {
    const result = await cli(["design", "add", F, "--starter", "kallax", "--json"], await fresh());
    expect(result.code).toBe(2);
    expect(errorOf(result).code).toBe("invalid-value");
    expect(errorOf(result).message).toContain("cube-shelf");
  });

  it("refuses --size without --starter", async () => {
    const result = await cli(["design", "add", F, "--size", "40x106", "--json"], await fresh());
    expect(result.code).toBe(2);
    expect(errorOf(result).code).toBe("missing-option");
  });

  it("writes nothing with --dry-run", async () => {
    const io = await fresh();
    const before = io.files.get(F);
    const result = await cli(["design", "add", F, "--starter", "cube-shelf", "--dry-run", "--json"], io);
    expect(result.code).toBe(0);
    expect(io.files.get(F)).toBe(before);
  });
});
