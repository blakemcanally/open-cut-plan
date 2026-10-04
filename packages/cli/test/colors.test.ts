import { describe, expect, it } from "vitest";
import { cli, EKET, withDesignExamples, withExamples } from "./helpers.ts";

const SHELF = "shelf.cutplan.json";

describe("design add and design set --color", () => {
  it("sets the colour of one unit, and makes it automatic again with auto", async () => {
    const io = withDesignExamples();
    const result = await cli(["design", "set", EKET, "eket", "--color", "2=#FF8800", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().design.colors).toEqual(["", "#ff8800"]);
    expect(result.file(EKET).designs![0]!.colors).toEqual(["", "#ff8800"]);
    const both = await cli(["design", "set", EKET, "eket", "--color", "1=#112233", "--color", "2=auto", "--json"], io);
    expect(both.file(EKET).designs![0]!.colors).toEqual(["#112233"]);
    await cli(["design", "set", EKET, "eket", "--color", "1=auto"], io);
    expect(JSON.parse(io.files.get(EKET)!).designs[0]).not.toHaveProperty("colors");
  });

  it("sets a colour when it adds a design", async () => {
    const io = withDesignExamples();
    const result = await cli(["design", "add", EKET, "--system", "eket", "--cols", "1", "--rows", "1", "--quantity", "2", "--material", "ply-23-32", "--color", "1=#abcdef", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().design.colors).toEqual(["#abcdef"]);
  });

  it.each([
    ["3=#ff0000", "a unit past the quantity"],
    ["0=#ff0000", "unit 0"],
    ["1=red", "a colour that is not #rrggbb"],
    ["#ff0000", "no unit"],
  ])("refuses %s (%s) as a usage error", async (value) => {
    const io = withDesignExamples();
    const result = await cli(["design", "set", EKET, "eket", "--color", value, "--json"], io);
    expect(result.code).toBe(2);
    expect(result.json().error).toMatchObject({ code: "invalid-value", option: "color", value });
  });
});

describe("parts group-color", () => {
  it("sets the colour of a group, and makes it automatic again with auto", async () => {
    const io = withExamples();
    const result = await cli(["parts", "group-color", SHELF, "3x2 A", "#00AA00", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json()).toMatchObject({ group: "3x2 A", color: "#00aa00", changes: { changed: true, groups: ["3x2 A"] } });
    expect(result.file(SHELF).groups).toEqual({ "3x2 A": { color: "#00aa00" } });
    const auto = await cli(["parts", "group-color", SHELF, "3x2 A", "auto", "--json"], io);
    expect(auto.json()).toMatchObject({ group: "3x2 A", color: null });
    expect(auto.file(SHELF)).not.toHaveProperty("groups");
    expect((await cli(["parts", "group-color", SHELF, "3x2 C", "#00aa00"], io)).stdout).toContain("Changed group: 3x2 C.");
  });

  it("refuses a group that no part without a design has, and a bad colour", async () => {
    const unknown = await cli(["parts", "group-color", SHELF, "Nope", "#00aa00", "--json"], withExamples());
    expect(unknown.code).toBe(2);
    expect(unknown.json().error).toMatchObject({ code: "not-found", group: "Nope", known: ["3x2 A", "3x2 C", "4x2 B"] });
    const design = await cli(["parts", "group-color", EKET, "Wall EKET", "#00aa00", "--json"], withDesignExamples());
    expect(design.code).toBe(2);
    expect(design.json().error.message).toContain("design set");
    const bad = await cli(["parts", "group-color", SHELF, "3x2 A", "green", "--json"], withExamples());
    expect(bad.code).toBe(2);
    expect(bad.json().error).toMatchObject({ code: "invalid-value", value: "green" });
  });
});

describe("parts colors", () => {
  it("lists the colour of each group and of each unit of a design", async () => {
    const io = withDesignExamples();
    await cli(["design", "set", EKET, "eket", "--color", "2=#123456"], io);
    const result = await cli(["parts", "colors", EKET, "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().colors).toEqual([
      { key: "design:eket#1", label: "Wall EKET 1 of 2", color: "#9cc3e6", chosen: false, design: "eket", unit: 1 },
      { key: "design:eket#2", label: "Wall EKET 2 of 2", color: "#123456", chosen: true, design: "eket", unit: 2 },
    ]);
    const text = await cli(["parts", "colors", EKET], io);
    expect(text.stdout).toContain("Wall EKET 2 of 2");
    expect(text.stdout).toContain("#123456 (chosen)");
  });
});
