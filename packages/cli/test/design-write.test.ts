import { describe, expect, it } from "vitest";
import { cli, EKET, editFile, KALLAX, withDesignExamples } from "./helpers.ts";

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
    expect(added.json().changes.parts).toEqual({ added: ["plinth"], removed: [], changed: ["kallax-vertical", "kallax-horizontal"], reordered: false });
    const parts = added.file(KALLAX).parts.map((part) => [part.id, part.length, part.quantity]);
    expect(parts).toEqual([
      ["kallax-vertical", 1783, 3],
      ["kallax-horizontal", 335, 12],
      ["plinth", 724, 1],
    ]);
    const fixed = await cli(["validate", KALLAX, "--json"], io);
    expect(fixed.json().planIssues.map((issue: { code: string }) => issue.code)).not.toContain("design-stale");
  });

  it("lists the designs in changes, and converts them with the units", async () => {
    const result = await cli(["settings", "set", KALLAX, "units", "in", "--json"], withDesignExamples());
    expect(result.code).toBe(0);
    expect(result.json().changes.designs).toEqual({ added: [], removed: [], changed: ["kallax"], reordered: false });
    expect(result.stdout).not.toContain("design-stale");
    const text = await cli(["settings", "set", KALLAX, "units", "in"], withDesignExamples());
    expect(text.stdout).toContain("Changed design: kallax.");
    expect(result.file(KALLAX).parts.map((part) => part.quantity)).toEqual([3, 10]);
  });

  it("keeps every placed copy when the units change", async () => {
    const io = withDesignExamples();
    await cli(["optimize", KALLAX, "--iterations", "50", "--seed", "1"], io);
    const result = await cli(["settings", "set", KALLAX, "units", "in", "--json"], io);
    expect(result.json().changes.plan).toMatchObject({ placementsBefore: 13, placementsAfter: 13 });
    const back = await cli(["settings", "set", KALLAX, "units", "mm", "--json"], io);
    expect(back.json().changes.plan).toMatchObject({ placementsBefore: 13, placementsAfter: 13 });
  });
});

describe("generated parts", () => {
  it("refuses parts set and parts remove with exit 1, and writes nothing", async () => {
    const io = withDesignExamples();
    const before = io.files.get(KALLAX);
    const set = await cli(["parts", "set", KALLAX, "kallax-vertical", "--quantity", "1", "--json"], io);
    expect(set.code).toBe(1);
    expect(set.json().error).toMatchObject({ code: "generated-part", id: "kallax-vertical", design: "kallax" });
    expect(set.json().error.message).toContain("design detach");
    const remove = await cli(["parts", "remove", KALLAX, "kallax-horizontal", "--json"], io);
    expect(remove.code).toBe(1);
    expect(remove.json().error).toMatchObject({ code: "generated-part", id: "kallax-horizontal", design: "kallax" });
    expect(io.files.get(KALLAX)).toBe(before);
    expect(io.writes).toEqual([]);
  });

  it("lets you change a part whose design is missing", async () => {
    const io = withDesignExamples();
    editFile(io, KALLAX, (file) => {
      delete file.designs;
    });
    const set = await cli(["parts", "set", KALLAX, "kallax-vertical", "--quantity", "2", "--json"], io);
    expect(set.code).toBe(0);
    expect(set.json().part).toMatchObject({ id: "kallax-vertical", quantity: 2, design: "kallax" });
  });
});

describe("materials that designs use", () => {
  it("counts the designs, and refuses to remove the back material of a design", async () => {
    const io = withDesignExamples();
    const list = await cli(["materials", "list", EKET, "--json"], io);
    expect(list.json().materials.map((m: { id: string; usedBy: unknown }) => [m.id, m.usedBy])).toEqual([
      ["ply-23-32", { parts: 2, stock: 1, designs: 1 }],
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
