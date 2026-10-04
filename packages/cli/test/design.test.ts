import { describe, expect, it } from "vitest";
import { cli, EKET, editFile, KALLAX, memoryIo, withDesignExamples, type MemoryIo } from "./helpers.ts";

const F = "hall.cutplan.json";

/** A mm project with 18 mm and 6 mm birch plywood and one sheet size, and no designs. */
async function hall(): Promise<MemoryIo> {
  const io = memoryIo();
  await cli(["new", F, "--name", "Hall", "--units", "mm"], io);
  await cli(["materials", "add", F, "--name", "Birch 18", "--id", "b18", "--thickness", "18"], io);
  await cli(["materials", "add", F, "--name", "Birch 6", "--id", "b6", "--thickness", "6"], io);
  await cli(["stock", "add", F, "--material", "b18", "--length", "2440", "--width", "1220", "--cost", "80"], io);
  return io;
}

const sizes = (parts: { id: string; length: number; width: number; quantity: number }[]) => parts.map((p) => [p.id, p.length, p.width, p.quantity]);

describe("design systems", () => {
  it("lists the systems with their IKEA numbers, and needs no file", async () => {
    const result = await cli(["design", "systems", "--json"]);
    expect(result.code).toBe(0);
    const systems = result.json().systems;
    expect(systems.map((s: { system: string }) => s.system)).toEqual(["kallax", "eket", "custom"]);
    expect(systems[0].values.opening).toMatchObject({ mm: 335, derived: true });
    expect(systems[1].values.module).toMatchObject({ mm: 350, derived: false });
    expect(systems[2].values).toEqual({});
    expect((await cli(["design", "systems"])).stdout).toContain("opening: 335 mm (derived)");
  });
});

describe("design add", () => {
  it("adds a KALLAX with IKEA-size cells, names it from the grid, and makes its parts", async () => {
    const io = await hall();
    const result = await cli(["design", "add", F, "--system", "kallax", "--cols", "2", "--rows", "4", "--material", "b18", "--json"], io);
    expect(result.code).toBe(0);
    const data = result.json();
    expect(data.design).toEqual({
      id: "kallax-2x4",
      name: "KALLAX 2x4",
      system: "kallax",
      material: "b18",
      width: { openings: [335, 335] },
      height: { openings: [335, 335, 335, 335] },
      depth: 390,
    });
    expect(sizes(data.parts)).toEqual([
      ["kallax-2x4-top", 724, 390, 1],
      ["kallax-2x4-bottom", 724, 390, 1],
      ["kallax-2x4-side", 1394, 390, 2],
      ["kallax-2x4-divider", 1394, 390, 1],
      ["kallax-2x4-shelf", 335, 390, 6],
    ]);
    expect(data.changes.designs.added).toEqual(["kallax-2x4"]);
    expect(data.changes.parts.added).toEqual(["kallax-2x4-top", "kallax-2x4-bottom", "kallax-2x4-side", "kallax-2x4-divider", "kallax-2x4-shelf"]);
    expect(result.file(F).parts.every((part) => part.design === "kallax-2x4" && part.group === "KALLAX 2x4")).toBe(true);
  });

  it("adds EKET modules in the project units, with a back and a mount", async () => {
    const io = memoryIo();
    await cli(["new", F, "--name", "Wall", "--units", "in"], io);
    await cli(["materials", "add", F, "--name", "Ply 3/4", "--id", "p34", "--thickness", "23/32"], io);
    await cli(["materials", "add", F, "--name", "Ply 1/4", "--id", "p14", "--thickness", "7/32"], io);
    const result = await cli(["design", "add", F, "--system", "eket", "--cols", "2", "--rows", "1", "--material", "p34", "--back", "p14", "--mount", "wall-rail", "--quantity", "2", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().design).toMatchObject({
      id: "eket-2x1",
      width: { outside: 27.559055118, cells: 2 },
      height: { outside: 13.779527559, cells: 1 },
      depth: 13.779527559,
      back: { material: "p14" },
      mount: "wall-rail",
      quantity: 2,
    });
    expect(result.json().parts.map((part: { id: string; quantity: number }) => [part.id, part.quantity])).toEqual([
      ["eket-2x1-top", 2],
      ["eket-2x1-bottom", 2],
      ["eket-2x1-side", 4],
      ["eket-2x1-divider", 2],
      ["eket-2x1-back", 2],
    ]);
  });

  it("adds a custom grid from an outside size or from a list of openings", async () => {
    const io = await hall();
    const grid = await cli(["design", "add", F, "--width", "900", "--height", "600", "--cols", "2", "--rows", "2", "--depth", "300", "--material", "b18", "--json"], io);
    expect(grid.json().design).toMatchObject({ id: "custom-2x2", name: "Custom 2x2", system: "custom", width: { outside: 900, cells: 2 }, height: { outside: 600, cells: 2 } });
    expect(sizes(grid.json().parts)).toEqual([
      ["custom-2x2-top", 900, 300, 1],
      ["custom-2x2-bottom", 900, 300, 1],
      ["custom-2x2-side", 564, 300, 2],
      ["custom-2x2-divider", 564, 300, 1],
      ["custom-2x2-shelf", 423, 300, 2],
    ]);
    const mixed = await cli(["design", "add", F, "--column-openings", "335, 400,335", "--row-openings", "300,335", "--depth", "390", "--material", "b18", "--name", "Mixed", "--id", "mx", "--json"], io);
    expect(mixed.json().design).toMatchObject({ id: "mx", name: "Mixed", width: { openings: [335, 400, 335] }, height: { openings: [300, 335] } });
    expect(sizes(mixed.json().parts)).toEqual([
      ["mx-top", 1142, 390, 1],
      ["mx-bottom", 1142, 390, 1],
      ["mx-side", 653, 390, 2],
      ["mx-divider", 653, 390, 2],
      ["mx-shelf-1", 335, 390, 2],
      ["mx-shelf-2", 400, 390, 1],
    ]);
  });

  it("gives usage errors for missing and conflicting axis flags", async () => {
    const io = await hall();
    const noWidth = await cli(["design", "add", F, "--cols", "2", "--rows", "2", "--depth", "300", "--material", "b18", "--json"], io);
    expect(noWidth.code).toBe(2);
    expect(noWidth.json().error).toMatchObject({ code: "missing-option", option: "width" });
    const noAxis = await cli(["design", "add", F, "--system", "kallax", "--rows", "2", "--material", "b18", "--json"], io);
    expect(noAxis.json().error).toMatchObject({ code: "missing-option", option: "cols" });
    const noDepth = await cli(["design", "add", F, "--width", "900", "--height", "600", "--material", "b18", "--json"], io);
    expect(noDepth.json().error).toMatchObject({ code: "missing-option", option: "depth" });
    const both = await cli(["design", "add", F, "--system", "kallax", "--cols", "2", "--column-openings", "335,335", "--rows", "1", "--material", "b18", "--json"], io);
    expect(both.json().error).toMatchObject({ code: "conflict", option: "column-openings" });
    const bad = await cli(["design", "add", F, "--system", "billy", "--cols", "1", "--rows", "1", "--json"], io);
    expect(bad.json().error).toMatchObject({ code: "invalid-value", option: "system" });
    expect((await cli(["design", "add", F, "--system", "kallax", "--cols", "51", "--rows", "1", "--material", "b18", "--json"], io)).json().error).toMatchObject({ code: "invalid-value", option: "cols" });
    expect(io.files.get(F)).not.toContain('"designs"');
  });

  it("refuses a design with an error with exit 1, invalid-value, and the checks", async () => {
    const io = await hall();
    await cli(["materials", "add", F, "--name", "Ply 9", "--id", "p9", "--thickness", "9"], io);
    const before = io.files.get(F);
    const thin = await cli(["design", "add", F, "--system", "kallax", "--cols", "1", "--rows", "1", "--material", "p9", "--json"], io);
    expect(thin.code).toBe(1);
    expect(thin.json().error.code).toBe("invalid-value");
    expect(thin.json().error.issues.map((issue: { code: string }) => issue.code)).toEqual(["pocket-thickness"]);
    const small = await cli(["design", "add", F, "--width", "30", "--height", "600", "--cols", "1", "--rows", "1", "--depth", "300", "--material", "b18", "--json"], io);
    expect(small.json().error.issues.map((issue: { code: string }) => issue.code)).toEqual(["design-too-small"]);
    expect(io.files.get(F)).toBe(before);
  });

  it("gives a second design with the same grid its own id and parts", async () => {
    const io = await hall();
    await cli(["design", "add", F, "--system", "kallax", "--cols", "2", "--rows", "4", "--material", "b18"], io);
    const second = await cli(["design", "add", F, "--system", "kallax", "--cols", "2", "--rows", "4", "--material", "b18", "--json"], io);
    expect(second.code).toBe(0);
    expect(second.json().design).toMatchObject({ id: "kallax-2x4-2", name: "KALLAX 2x4" });
    expect(second.file(F).parts.map((part) => part.id)).toEqual(["kallax-2x4-top", "kallax-2x4-bottom", "kallax-2x4-side", "kallax-2x4-divider", "kallax-2x4-shelf", "kallax-2x4-2-top", "kallax-2x4-2-bottom", "kallax-2x4-2-side", "kallax-2x4-2-divider", "kallax-2x4-2-shelf"]);
  });

  it("reads stdin and prints the project with its parts, or writes nothing with --dry-run", async () => {
    const io = await hall();
    const text = io.files.get(F)!;
    const piped = await cli(["design", "add", "-", "--system", "eket", "--cols", "1", "--rows", "2", "--material", "b18"], memoryIo({}, text));
    expect(piped.code).toBe(0);
    const project = JSON.parse(piped.stdout) as { designs: { id: string }[]; parts: { id: string }[] };
    expect(project.designs.map((design) => design.id)).toEqual(["eket-1x2"]);
    expect(project.parts.map((part) => part.id)).toEqual(["eket-1x2-top", "eket-1x2-bottom", "eket-1x2-side", "eket-1x2-shelf"]);
    const dry = await cli(["design", "add", F, "--system", "eket", "--cols", "1", "--rows", "2", "--material", "b18", "--dry-run", "--json"], io);
    expect(dry.json()).toMatchObject({ ok: true, dryRun: true, written: null });
    expect(dry.json().parts).toHaveLength(4);
    expect(io.files.get(F)).toBe(text);
  });

  it("refuses a file from a newer minor version", async () => {
    const io = await hall();
    editFile(io, F, (file) => {
      file.version = "1.9";
    });
    const result = await cli(["design", "add", F, "--system", "kallax", "--cols", "1", "--rows", "1", "--material", "b18", "--json"], io);
    expect(result.code).toBe(1);
    expect(result.json().error).toMatchObject({ code: "newer-version", version: "1.9" });
  });
});

describe("design list and get", () => {
  it("lists the designs with the outside size and the part counts", async () => {
    const result = await cli(["design", "list", EKET, "--json"], withDesignExamples());
    expect(result.json().designs).toEqual([
      { id: "eket", name: "Wall EKET", system: "eket", quantity: 2, mount: "wall-rail", outside: { width: 27.559055118, height: 13.779527559, depth: 13.779527559 }, parts: 5, copies: 12 },
    ]);
    const text = await cli(["design", "list", KALLAX], withDesignExamples());
    expect(text.stdout).toMatch(/kallax\s+Hall KALLAX\s+kallax\s+724 mm × 1430 mm × 390 mm\s+1\s+floor\s+5\s+11/);
  });

  it("shows one design with its parts and its checks, and exits 2 for an unknown id", async () => {
    const io = withDesignExamples();
    editFile(io, KALLAX, (file) => {
      file.designs[0].depth = 340;
    });
    const result = await cli(["design", "get", KALLAX, "kallax", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().outside).toEqual({ width: 724, height: 1430, depth: 340 });
    expect(result.json().parts.map((part: { id: string }) => part.id)).toEqual(["kallax-top", "kallax-bottom", "kallax-side", "kallax-divider", "kallax-shelf"]);
    expect(result.json().issues.map((issue: { code: string }) => issue.code)).toEqual(expect.arrayContaining(["design-stale"]));
    expect(result.json().estimate).toEqual([{ material: expect.any(String), sheets: 2, sizes: [expect.objectContaining({ count: 2 })], unplaced: 0, noStock: false }]);
    const missing = await cli(["design", "get", KALLAX, "nope", "--json"], io);
    expect(missing.code).toBe(2);
    expect(missing.json().error).toMatchObject({ code: "not-found", id: "nope", known: ["kallax"] });
  });
});

describe("design get estimate", () => {
  it("says when the material of a design has no sheet stock", async () => {
    const io = withDesignExamples();
    editFile(io, KALLAX, (file) => {
      file.stock = [];
    });
    const result = await cli(["design", "get", KALLAX, "kallax", "--json"], io);
    expect(result.json().estimate).toEqual([{ material: expect.any(String), sheets: 0, sizes: [], unplaced: 11, noStock: true }]);
    const text = await cli(["design", "get", KALLAX, "kallax"], io);
    expect(text.stdout).toMatch(/^estimate: the project has no sheet stock of \S+$/m);
  });
});

describe("design set", () => {
  it("makes the parts again, keeps the copies that still fit, and lists what changed", async () => {
    const io = withDesignExamples();
    await cli(["optimize", KALLAX, "--iterations", "50", "--seed", "1"], io);
    const result = await cli(["design", "set", KALLAX, "kallax", "--rows", "5", "--json"], io);
    expect(result.code).toBe(0);
    const data = result.json();
    expect(data.design.height).toEqual({ openings: [335, 335, 335, 335, 335] });
    expect(data.partChanges).toEqual({ added: [], removed: [], resized: ["kallax-side", "kallax-divider"] });
    expect(data.removedPlacements).toEqual([
      { part: "kallax-side", copy: 0 },
      { part: "kallax-side", copy: 1 },
      { part: "kallax-divider", copy: 0 },
    ]);
    expect(data.changes.plan).toMatchObject({ placementsBefore: 11, placementsAfter: 8 });
    expect(result.file(KALLAX).parts.map((part) => part.quantity)).toEqual([1, 1, 2, 1, 8]);
  });

  it("gives the design a new id, and the copies stay on their sheets", async () => {
    const io = withDesignExamples();
    await cli(["optimize", KALLAX, "--iterations", "50", "--seed", "1"], io);
    const result = await cli(["design", "set", KALLAX, "kallax", "--id", "hall", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().design.id).toBe("hall");
    expect(result.json().partChanges).toEqual({ added: [], removed: [], resized: [] });
    expect(result.json().removedPlacements).toEqual([]);
    expect(result.json().changes.parts).toMatchObject({ added: ["hall-top", "hall-bottom", "hall-side", "hall-divider", "hall-shelf"], removed: ["kallax-top", "kallax-bottom", "kallax-side", "kallax-divider", "kallax-shelf"] });
    expect(result.json().changes.plan).toMatchObject({ placementsBefore: 11, placementsAfter: 11 });
    const duplicate = await cli(["design", "set", KALLAX, "hall", "--id", "hall", "--json"], io);
    expect(duplicate.code).toBe(0);
    await cli(["design", "add", KALLAX, "--system", "kallax", "--cols", "1", "--rows", "1", "--json"], io);
    const taken = await cli(["design", "set", KALLAX, "hall", "--id", "kallax-1x1", "--json"], io);
    expect(taken.code).toBe(2);
    expect(taken.json().error).toMatchObject({ code: "duplicate-id", id: "kallax-1x1" });
  });

  it("changes the back, the mount, the name, and the material", async () => {
    const io = withDesignExamples();
    const result = await cli(["design", "set", EKET, "eket", "--back", "none", "--mount", "legs", "--name", "Hall EKET", "--quantity", "1", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().design).not.toHaveProperty("back");
    expect(result.json().design).toMatchObject({ name: "Hall EKET", mount: "legs", quantity: 1 });
    expect(result.json().partChanges).toEqual({ added: [], removed: ["eket-back"], resized: ["eket-top", "eket-bottom", "eket-side", "eket-divider"] });
    expect(result.file(EKET).parts.every((part) => part.group === "Hall EKET")).toBe(true);
  });

  it("refuses a change that gives a design error, and writes nothing", async () => {
    const io = withDesignExamples();
    const before = io.files.get(EKET);
    const result = await cli(["design", "set", EKET, "eket", "--material", "ply-7-32", "--json"], io);
    expect(result.code).toBe(1);
    expect(result.json().error.code).toBe("invalid-value");
    expect(result.json().error.issues.map((issue: { code: string }) => issue.code)).toEqual(["pocket-thickness"]);
    expect(io.files.get(EKET)).toBe(before);
  });

  it("changes one axis and keeps the other", async () => {
    const io = withDesignExamples();
    const cols = await cli(["design", "set", KALLAX, "kallax", "--cols", "3", "--json"], io);
    expect(cols.json().design).toMatchObject({ width: { openings: [335, 335, 335] }, height: { openings: [335, 335, 335, 335] } });
    const custom = await cli(["design", "set", KALLAX, "kallax", "--system", "custom", "--cols", "2", "--json"], io);
    expect(custom.code).toBe(2);
    expect(custom.json().error).toMatchObject({ code: "missing-option", option: "width" });
    const eket = await cli(["design", "set", EKET, "eket", "--cols", "3", "--json"], io);
    expect(eket.json().design.width).toEqual({ outside: 41.338582677, cells: 3 });
  });

  it("fits the combined cells to the new grid, and removes a span of one cell", async () => {
    const io = withDesignExamples();
    editFile(io, KALLAX, (file) => {
      file.designs[0].combined = [
        { column: 1, row: 1, columns: 2, rows: 1 },
        { column: 2, row: 2, columns: 1, rows: 3 },
      ];
    });
    const fewer = await cli(["design", "set", KALLAX, "kallax", "--rows", "3", "--json"], io);
    expect(fewer.code).toBe(0);
    expect(fewer.json().design.combined).toEqual([
      { column: 1, row: 1, columns: 2, rows: 1 },
      { column: 2, row: 2, columns: 1, rows: 2 },
    ]);
    const narrow = await cli(["design", "set", KALLAX, "kallax", "--cols", "1", "--json"], io);
    expect(narrow.code).toBe(0);
    expect(narrow.json().design).not.toHaveProperty("combined");
    expect(narrow.file(KALLAX).designs?.[0]).not.toHaveProperty("combined");
  });

  it("refuses a new id whose parts would take the id of another part", async () => {
    const io = withDesignExamples();
    await cli(["parts", "add", KALLAX, "--name", "Hall side", "--length", "500", "--width", "300"], io);
    const before = io.files.get(KALLAX);
    const result = await cli(["design", "set", KALLAX, "kallax", "--id", "hall", "--json"], io);
    expect(result.code).toBe(1);
    expect(result.json().error.code).toBe("invalid-value");
    expect(result.json().error.issues.map((issue: { code: string }) => issue.code)).toEqual(["design-conflict"]);
    expect(io.files.get(KALLAX)).toBe(before);
  });

  it("needs --system to change a design with an unknown system", async () => {
    const io = withDesignExamples();
    editFile(io, KALLAX, (file) => {
      file.designs[0].system = "billy";
    });
    const refused = await cli(["design", "set", KALLAX, "kallax", "--quantity", "2", "--json"], io);
    expect(refused.code).toBe(1);
    expect(refused.json().error).toMatchObject({ code: "invalid-value", option: "system" });
    const fixed = await cli(["design", "set", KALLAX, "kallax", "--system", "custom", "--quantity", "2", "--json"], io);
    expect(fixed.code).toBe(0);
    expect(fixed.file(KALLAX).parts.map((part) => part.quantity)).toEqual([2, 2, 4, 2, 12]);
  });
});

describe("design remove and detach", () => {
  it("removes a design with its parts and their copies", async () => {
    const io = withDesignExamples();
    await cli(["optimize", KALLAX, "--iterations", "50", "--seed", "1"], io);
    const result = await cli(["design", "remove", KALLAX, "kallax", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json()).toMatchObject({ removed: ["kallax"], removedParts: ["kallax-top", "kallax-bottom", "kallax-side", "kallax-divider", "kallax-shelf"] });
    expect(result.json().removedPlacements).toHaveLength(11);
    const file = result.file(KALLAX);
    expect(file.designs).toBeUndefined();
    expect(file.parts).toEqual([]);
    expect(io.files.get(KALLAX)).not.toContain('"designs"');
  });

  it("keeps the parts as normal parts, which parts set can then change", async () => {
    const io = withDesignExamples();
    const result = await cli(["design", "detach", KALLAX, "kallax", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json()).toMatchObject({ detached: "kallax", parts: ["kallax-top", "kallax-bottom", "kallax-side", "kallax-divider", "kallax-shelf"] });
    expect(result.file(KALLAX).parts.map((part) => [part.id, part.design, part.group])).toEqual([
      ["kallax-top", undefined, "Hall KALLAX"],
      ["kallax-bottom", undefined, "Hall KALLAX"],
      ["kallax-side", undefined, "Hall KALLAX"],
      ["kallax-divider", undefined, "Hall KALLAX"],
      ["kallax-shelf", undefined, "Hall KALLAX"],
    ]);
    expect((await cli(["parts", "set", KALLAX, "kallax-side", "--quantity", "2", "--json"], io)).code).toBe(0);
  });
});

describe("design drawing", () => {
  it("prints the SVG, or writes it to a file", async () => {
    const io = withDesignExamples();
    const printed = await cli(["design", "drawing", KALLAX, "kallax"], io);
    expect(printed.code).toBe(0);
    expect(printed.stdout).toMatch(/^<svg [^>]+>\n<title>Hall KALLAX: 724 mm × 1430 mm × 390 mm<\/title>/);
    const written = await cli(["design", "drawing", KALLAX, "kallax", "--out", "hall.svg", "--json"], io);
    expect(written.json()).toMatchObject({ ok: true, design: "kallax", path: "hall.svg" });
    expect(io.files.get("hall.svg")).toBe(printed.stdout);
  });

  it("draws one assembly step with --step", async () => {
    const io = withDesignExamples();
    const result = await cli(["design", "drawing", KALLAX, "kallax", "--step", "5", "--out", "step.svg", "--json"], io);
    expect(result.json()).toMatchObject({ ok: true, design: "kallax", step: 5, title: "Assemble column 1 of 2", path: "step.svg" });
    expect(result.json().description).toMatch(/^Front view with the boards that this step adds marked: the left side/);
    expect(io.files.get("step.svg")).toMatch(/^<svg [^>]+>\n<title>Front view with the boards that this step adds marked: /);
    expect(io.files.get("step.svg")).toContain('data-state="current"');
    const last = await cli(["design", "drawing", KALLAX, "kallax", "--step", "10", "--json"], io);
    expect(last.code).toBe(2);
    expect(last.json().error.message).toContain("1 to 9");
  });

  it("exits 1 for a design that makes no parts", async () => {
    const io = withDesignExamples();
    editFile(io, KALLAX, (file) => {
      file.designs[0].material = "gone";
    });
    const result = await cli(["design", "drawing", KALLAX, "kallax", "--json"], io);
    expect(result.code).toBe(1);
    expect(result.json().error).toMatchObject({ code: "design-invalid", id: "kallax" });
    expect(result.json().error.issues.map((issue: { code: string }) => issue.code)).toEqual(["bad-ref"]);
  });
});

describe("design combine and design split", () => {
  it("combines the rectangle between two cells, and makes the parts again", async () => {
    const io = withDesignExamples();
    const result = await cli(["design", "combine", KALLAX, "kallax", "--cell", "1,1", "--to", "2,1", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().design.combined).toEqual([{ column: 1, row: 1, columns: 2, rows: 1 }]);
    expect(result.json().partChanges).toEqual({ added: ["kallax-divider-rows-2-4", "kallax-shelf-cols-1-2"], removed: ["kallax-divider"], resized: [] });
    expect(result.json().cell).toEqual({ column: 1, row: 1, columns: 2, rows: 1 });
    expect(sizes(result.file(KALLAX).parts)).toContainEqual(["kallax-shelf-cols-1-2", 688, 390, 1]);
    const text = await cli(["design", "combine", KALLAX, "kallax", "--cell", "1,3", "--to", "1,4"], io);
    expect(text.stdout).toContain("Combined column 1, rows 3–4 of design kallax into one cell.");
  });

  it("makes the selection larger to hold each combined cell that it touches", async () => {
    const io = withDesignExamples();
    await cli(["design", "combine", KALLAX, "kallax", "--cell", "1,1", "--to", "1,2"], io);
    const result = await cli(["design", "combine", KALLAX, "kallax", "--cell", "2,2", "--to", "1,2", "--json"], io);
    expect(result.json().design.combined).toEqual([{ column: 1, row: 1, columns: 2, rows: 2 }]);
  });

  it("refuses one cell, a cell outside the grid, and a bad cell", async () => {
    const io = withDesignExamples();
    const before = io.files.get(KALLAX);
    const one = await cli(["design", "combine", KALLAX, "kallax", "--cell", "1,1", "--json"], io);
    expect(one.code).toBe(2);
    expect(one.json().error).toMatchObject({ code: "invalid-value", option: "to" });
    const outside = await cli(["design", "combine", KALLAX, "kallax", "--cell", "1,1", "--to", "3,1", "--json"], io);
    expect(outside.code).toBe(2);
    expect(outside.json().error).toMatchObject({ code: "invalid-value", option: "to" });
    expect(outside.json().error.message).toContain("2 columns and 4 rows");
    const bad = await cli(["design", "combine", KALLAX, "kallax", "--cell", "a", "--to", "1,2", "--json"], io);
    expect(bad.json().error).toMatchObject({ code: "invalid-value", option: "cell" });
    const missing = await cli(["design", "combine", KALLAX, "kallax", "--json"], io);
    expect(missing.json().error).toMatchObject({ code: "missing-option", option: "cell" });
    expect(io.files.get(KALLAX)).toBe(before);
  });

  it("splits the combined cell that holds a cell, and takes the copies of the long shelf off the sheets", async () => {
    const io = withDesignExamples();
    await cli(["design", "combine", KALLAX, "kallax", "--cell", "1,1", "--to", "2,1"], io);
    await cli(["optimize", KALLAX, "--iterations", "20", "--seed", "1"], io);
    const result = await cli(["design", "split", KALLAX, "kallax", "--cell", "2,1", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().design).not.toHaveProperty("combined");
    expect(result.json().partChanges).toEqual({ added: ["kallax-divider"], removed: ["kallax-divider-rows-2-4", "kallax-shelf-cols-1-2"], resized: [] });
    expect(result.json().removedPlacements).toContainEqual({ part: "kallax-shelf-cols-1-2", copy: 0 });
    expect(result.file(KALLAX).designs?.[0]).not.toHaveProperty("combined");
  });

  it("splits each combined cell in a rectangle, and refuses a cell that is not combined", async () => {
    const io = withDesignExamples();
    await cli(["design", "combine", KALLAX, "kallax", "--cell", "1,1", "--to", "2,1"], io);
    await cli(["design", "combine", KALLAX, "kallax", "--cell", "1,3", "--to", "2,3"], io);
    const result = await cli(["design", "split", KALLAX, "kallax", "--cell", "1,1", "--to", "1,4", "--json"], io);
    expect(result.json().design).not.toHaveProperty("combined");
    const none = await cli(["design", "split", KALLAX, "kallax", "--cell", "1,1", "--json"], io);
    expect(none.code).toBe(2);
    expect(none.json().error).toMatchObject({ code: "invalid-value", option: "cell" });
    expect(none.json().error.message).toBe("Column 1, row 1 of design kallax is not in a combined cell.");
  });

  it("refuses a file from a newer minor version", async () => {
    const io = withDesignExamples();
    editFile(io, KALLAX, (file) => {
      file.version = "1.99";
    });
    const result = await cli(["design", "combine", KALLAX, "kallax", "--cell", "1,1", "--to", "2,1", "--json"], io);
    expect(result.code).toBe(1);
    expect(result.json().error.code).toBe("newer-version");
  });
});
