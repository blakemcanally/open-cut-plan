import { describe, expect, it } from "vitest";
import { cli, EKET, editFile, KALLAX, memoryIo, withDesignExamples, type MemoryIo } from "./helpers.ts";

describe("every write makes the design parts again", () => {
  it("fixes a design that was changed by hand on the next write", async () => {
    const io = withDesignExamples();
    editFile(io, KALLAX, (file) => {
      file.designs[0].height = { openings: [335, 335, 335, 335, 335] };
    });
    const stale = await cli(["validate", KALLAX, "--json"], io);
    expect(stale.json().planIssues.map((issue: { code: string }) => issue.code)).toContain("design-stale");
    const added = await cli(["parts", "add", KALLAX, "--name", "Plinth", "--length", "724", "--width", "80", "--json"], io);
    expect(added.code).toBe(0);
    expect(added.json().changes.parts).toEqual({ added: ["plinth"], removed: [], changed: ["kallax-side", "kallax-divider", "kallax-shelf"], reordered: false });
    const parts = added.file(KALLAX).parts.map((part) => [part.id, part.length, part.quantity]);
    expect(parts).toEqual([
      ["kallax-top", 724, 1],
      ["kallax-bottom", 724, 1],
      ["kallax-side", 1747, 2],
      ["kallax-divider", 1747, 1],
      ["kallax-shelf", 335, 8],
      ["plinth", 724, 1],
    ]);
    const fixed = await cli(["validate", KALLAX, "--json"], io);
    expect(fixed.json().planIssues.map((issue: { code: string }) => issue.code)).not.toContain("design-stale");
  });

  it("makes stale design parts again before it optimizes, so --strict sees the parts that it writes", async () => {
    const io = withDesignExamples();
    editFile(io, KALLAX, (file) => {
      file.parts = [];
      delete file.plan;
    });
    const result = await cli(["optimize", KALLAX, "--iterations", "50", "--seed", "1", "--strict", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().after).toMatchObject({ placedCopies: 11, unplacedCopies: 0 });
    const valid = await cli(["validate", KALLAX, "--strict", "--json"], io);
    expect(valid.json()).toMatchObject({ valid: true, errors: 0, warnings: 0 });
  });

  it("lists the designs in changes, and converts them with the units", async () => {
    const result = await cli(["settings", "set", KALLAX, "units", "in", "--json"], withDesignExamples());
    expect(result.code).toBe(0);
    expect(result.json().changes.designs).toEqual({ added: [], removed: [], changed: ["kallax"], reordered: false });
    expect(result.stdout).not.toContain("design-stale");
    const text = await cli(["settings", "set", KALLAX, "units", "in"], withDesignExamples());
    expect(text.stdout).toContain("Changed design: kallax.");
    expect(result.file(KALLAX).parts.map((part) => part.quantity)).toEqual([1, 1, 2, 1, 6]);
  });

  it("keeps every placed copy when the units change", async () => {
    const io = withDesignExamples();
    await cli(["optimize", KALLAX, "--iterations", "50", "--seed", "1"], io);
    const result = await cli(["settings", "set", KALLAX, "units", "in", "--json"], io);
    expect(result.json().changes.plan).toMatchObject({ placementsBefore: 11, placementsAfter: 11 });
    const back = await cli(["settings", "set", KALLAX, "units", "mm", "--json"], io);
    expect(back.json().changes.plan).toMatchObject({ placementsBefore: 11, placementsAfter: 11 });
  });
});

describe("generated parts", () => {
  it("refuses parts set and parts remove with exit 1, and writes nothing", async () => {
    const io = withDesignExamples();
    const before = io.files.get(KALLAX);
    const set = await cli(["parts", "set", KALLAX, "kallax-side", "--quantity", "1", "--json"], io);
    expect(set.code).toBe(1);
    expect(set.json().error).toMatchObject({ code: "generated-part", id: "kallax-side", design: "kallax" });
    expect(set.json().error.message).toContain("design detach");
    const remove = await cli(["parts", "remove", KALLAX, "kallax-shelf", "--json"], io);
    expect(remove.code).toBe(1);
    expect(remove.json().error).toMatchObject({ code: "generated-part", id: "kallax-shelf", design: "kallax" });
    expect(io.files.get(KALLAX)).toBe(before);
    expect(io.writes).toEqual([]);
  });

  it("lets you change a part whose design is missing", async () => {
    const io = withDesignExamples();
    editFile(io, KALLAX, (file) => {
      delete file.designs;
    });
    const set = await cli(["parts", "set", KALLAX, "kallax-side", "--quantity", "2", "--json"], io);
    expect(set.code).toBe(0);
    expect(set.json().part).toMatchObject({ id: "kallax-side", quantity: 2, design: "kallax" });
  });
});

describe("materials that designs use", () => {
  it("counts the designs, and refuses to remove the back material of a design", async () => {
    const io = withDesignExamples();
    const list = await cli(["materials", "list", EKET, "--json"], io);
    expect(list.json().materials.map((m: { id: string; usedBy: unknown }) => [m.id, m.usedBy])).toEqual([
      ["ply-23-32", { parts: 4, stock: 1, designs: 1 }],
      ["ply-7-32", { parts: 1, stock: 1, designs: 1 }],
    ]);
    expect((await cli(["materials", "get", EKET, "ply-7-32", "--json"], io)).json().usedBy).toEqual({ parts: ["eket-back"], stock: ["ply-7-32-4x8"], designs: ["eket"] });
    editFile(io, EKET, (file) => {
      file.parts = [];
      file.stock = file.stock.filter((stock: { material: string }) => stock.material !== "ply-7-32");
    });
    const refused = await cli(["materials", "remove", EKET, "ply-7-32", "--json"], io);
    expect(refused.code).toBe(1);
    expect(refused.json().error).toMatchObject({ code: "in-use", id: "ply-7-32", parts: [], stock: [], designs: ["eket"] });
  });
});

const HALL = "hall.cutplan.json";

async function oneColumn(): Promise<MemoryIo> {
  const io = memoryIo();
  await cli(["new", HALL, "--name", "Hall", "--units", "in"], io);
  await cli(["materials", "add", HALL, "--name", "Ply", "--id", "ply", "--thickness", "0.75"], io);
  await cli(["stock", "add", HALL, "--material", "ply", "--length", "96", "--width", "48", "--cost", "60"], io);
  const added = await cli(["design", "add", HALL, "--system", "custom", "--cols", "1", "--width", "30", "--rows", "2", "--height", "40", "--depth", "16", "--json"], io);
  expect(added.code).toBe(0);
  return io;
}

describe("the corners, the fastener, and the cleats", () => {
  it("sets the corners, the fastener, and the cleats with design set", async () => {
    const io = await oneColumn();
    const result = await cli(["design", "set", HALL, "custom-1x2", "--corners", "sides-over-top", "--fastener", "face-screws", "--mount", "cleats", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().design).toMatchObject({ corners: "sides-over-top", fastener: "face-screws", mount: "cleats" });
    expect(result.file(HALL).designs![0]).toMatchObject({ corners: "sides-over-top", fastener: "face-screws", mount: "cleats" });
    const names = result.file(HALL).parts.map((part) => part.name);
    expect(names).toContain("Foot");
    expect(names).toContain("Top cleat");
    expect(result.json().partChanges.added).toHaveLength(2);
  });

  it("adds a box with the corners, the fastener, and the cleats", async () => {
    const io = await oneColumn();
    const result = await cli(["design", "add", HALL, "--system", "custom", "--cols", "1", "--width", "30", "--rows", "2", "--height", "40", "--depth", "16", "--name", "Second", "--corners", "sides-over-top", "--fastener", "face-screws", "--mount", "cleats", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().design).toMatchObject({ corners: "sides-over-top", fastener: "face-screws", mount: "cleats" });
  });

  it("adds a box with the default corners and no corners field", async () => {
    const io = await oneColumn();
    const result = await cli(["design", "add", HALL, "--system", "custom", "--cols", "1", "--width", "30", "--rows", "2", "--height", "40", "--depth", "16", "--name", "Second", "--corners", "top-over-sides", "--fastener", "pocket-screws", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().design).not.toHaveProperty("corners");
    expect(result.json().design).not.toHaveProperty("fastener");
  });

  it("removes the corners field with --corners top-over-sides, and the fastener field with --fastener pocket-screws", async () => {
    const io = await oneColumn();
    await cli(["design", "set", HALL, "custom-1x2", "--corners", "sides-over-top", "--fastener", "face-screws"], io);
    const result = await cli(["design", "set", HALL, "custom-1x2", "--corners", "top-over-sides", "--fastener", "pocket-screws", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().design).not.toHaveProperty("corners");
    expect(result.json().design).not.toHaveProperty("fastener");
    expect(result.file(HALL).designs![0]).not.toHaveProperty("corners");
    expect(result.file(HALL).designs![0]).not.toHaveProperty("fastener");
  });

  it("refuses face screws on a 2-column box, and writes nothing", async () => {
    const io = withDesignExamples();
    const before = io.files.get(KALLAX);
    const result = await cli(["design", "set", KALLAX, "kallax", "--fastener", "face-screws", "--json"], io);
    expect(result.code).toBe(1);
    expect(result.json().error.code).toBe("invalid-value");
    expect(result.json().error.issues.map((issue: { code: string }) => issue.code)).toContain("design-one-column");
    expect(io.files.get(KALLAX)).toBe(before);
  });

  it("refuses a corners value that the CLI does not give", async () => {
    const result = await cli(["design", "set", HALL, "custom-1x2", "--corners", "mitred", "--json"], await oneColumn());
    expect(result.code).toBe(2);
    expect(result.json().error).toMatchObject({ code: "invalid-value", option: "corners" });
  });

  it("clears the hidden warnings with --show-warnings", async () => {
    const io = memoryIo();
    await cli(["new", HALL, "--name", "Hall", "--units", "in"], io);
    await cli(["design", "add", HALL, "--starter", "stacking-shelf"], io);
    const hidden = await cli(["design", "get", HALL, "stacking-shelf", "--json"], io);
    expect(hidden.json().design.hiddenWarnings).toEqual(["shelf-span"]);
    expect(hidden.json().issues.map((issue: { code: string }) => issue.code)).not.toContain("shelf-span");
    const result = await cli(["design", "set", HALL, "stacking-shelf", "--show-warnings", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().design).not.toHaveProperty("hiddenWarnings");
    expect(result.file(HALL).designs![0]).not.toHaveProperty("hiddenWarnings");
    const shown = await cli(["design", "get", HALL, "stacking-shelf", "--json"], io);
    expect(shown.json().issues.map((issue: { code: string }) => issue.code)).toContain("shelf-span");
  });

  it("accepts --show-warnings on a design with no hidden warnings", async () => {
    const io = await oneColumn();
    const result = await cli(["design", "set", HALL, "custom-1x2", "--show-warnings", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().design).not.toHaveProperty("hiddenWarnings");
  });

  it("refuses a design with an unknown corners or fastener value", async () => {
    for (const [field, text] of [["corners", 'the corners "mitred"'], ["fastener", 'the fastener "nails"']] as const) {
      const io = await oneColumn();
      editFile(io, HALL, (file) => {
        file.designs[0][field] = field === "corners" ? "mitred" : "nails";
      });
      const before = io.files.get(HALL);
      const refused = await cli(["design", "set", HALL, "custom-1x2", "--quantity", "2", "--json"], io);
      expect(refused.code).toBe(1);
      expect(refused.json().error).toMatchObject({ code: "invalid-value", issues: [] });
      expect(refused.json().error.message).toBe(`The design custom-1x2 has ${text}, which this CLI does not know. Use design detach or design remove.`);
      expect(io.files.get(HALL)).toBe(before);
      const drawing = await cli(["design", "drawing", HALL, "custom-1x2", "--json"], io);
      expect(drawing.code).toBe(1);
      expect(drawing.json().error).toMatchObject({ code: "design-invalid" });
      expect(drawing.json().error.message).toContain(`${text} is not known`);
    }
  });
});
