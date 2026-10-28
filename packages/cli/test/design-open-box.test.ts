import { describe, expect, it } from "vitest";
import { cli, memoryIo, type MemoryIo } from "./helpers.ts";

const F = "hall.cutplan.json";

async function fresh(units: "mm" | "in" = "mm"): Promise<MemoryIo> {
  const io = memoryIo();
  await cli(["new", F, "--name", "Hall", "--units", units], io);
  await cli(["materials", "add", F, "--name", "Birch", "--id", "birch", "--thickness", units === "in" ? "0.75" : "18"], io);
  return io;
}

const errorOf = (result: { json(): Record<string, any> }) => result.json().error;

const BOX = ["design", "add", F, "--kind", "open-box", "--width", "12.5", "--height", "6", "--depth", "13.5"];

async function withBox(extra: string[] = []): Promise<MemoryIo> {
  const io = await fresh("in");
  const added = await cli([...BOX, "--system", "kallax", ...extra], io);
  expect(added.code).toBe(0);
  return io;
}

describe("design add --kind open-box", () => {
  it("adds an open-top box from flags", async () => {
    const io = await fresh("in");
    const result = await cli([...BOX, "--system", "kallax", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().design).toMatchObject({
      id: "open-top-box",
      name: "Open-top box",
      system: "kallax",
      kind: "open-box",
      width: { outside: 12.5, cells: 1 },
      height: { outside: 6, cells: 1 },
      depth: 13.5,
    });
    expect(result.json().parts.map((part: { id: string }) => part.id)).toEqual(["open-top-box-front", "open-top-box-back", "open-top-box-side", "open-top-box-bottom"]);
  });

  it("makes a custom open-top box by default", async () => {
    const result = await cli([...BOX, "--json"], await fresh("in"));
    expect(result.code).toBe(0);
    expect(result.json().design.system).toBe("custom");
  });

  it("keeps a shelf design with --kind box", async () => {
    const result = await cli(["design", "add", F, "--kind", "box", "--cols", "2", "--rows", "2", "--system", "kallax", "--json"], await fresh());
    expect(result.code).toBe(0);
    expect(result.json().design).not.toHaveProperty("kind");
  });

  it("adds the finish steps in order", async () => {
    const result = await cli([...BOX, "--finish", "Sand.", "--finish", "  Oil it.  ", "--json"], await fresh("in"));
    expect(result.code).toBe(0);
    expect(result.json().design.finish).toEqual(["Sand.", "Oil it."]);
  });

  it.each([["--cols", "2"], ["--rows", "2"], ["--column-openings", "300"], ["--row-openings", "300"], ["--back", "ply6"], ["--mount", "legs"]])("refuses %s with --kind open-box", async (flag, value) => {
    const io = await fresh("in");
    const before = io.files.get(F);
    const result = await cli([...BOX, flag, value, "--json"], io);
    expect(result.code).toBe(2);
    expect(errorOf(result)).toMatchObject({ code: "conflict", option: flag.slice(2) });
    expect(io.files.get(F)).toBe(before);
  });

  it.each(["width", "height", "depth"])("needs --%s of an open-top box", async (name) => {
    const argv = BOX.flatMap((item, index) => (item === `--${name}` || BOX[index - 1] === `--${name}` ? [] : [item]));
    const result = await cli([...argv, "--json"], await fresh("in"));
    expect(result.code).toBe(2);
    expect(errorOf(result)).toMatchObject({ code: "missing-option", option: name });
  });

  it("refuses the system eket for an open-top box", async () => {
    const result = await cli([...BOX, "--system", "eket", "--json"], await fresh("in"));
    expect(result.code).toBe(2);
    expect(errorOf(result)).toMatchObject({ code: "invalid-value", option: "system" });
  });

  it("refuses a kind that is not known", async () => {
    const result = await cli(["design", "add", F, "--kind", "drawer", "--json"], await fresh());
    expect(result.code).toBe(2);
    expect(errorOf(result).code).toBe("invalid-value");
  });

  it("refuses --kind with --starter", async () => {
    const result = await cli(["design", "add", F, "--starter", "crate", "--kind", "open-box", "--json"], await fresh());
    expect(result.code).toBe(2);
    expect(errorOf(result).code).toBe("conflict");
  });

  it("refuses a box that is too small", async () => {
    const result = await cli(["design", "add", F, "--kind", "open-box", "--width", "20", "--height", "100", "--depth", "300", "--json"], await fresh());
    expect(result.code).toBe(1);
    expect(errorOf(result).issues.map((issue: { code: string }) => issue.code)).toContain("design-too-small");
  });
});

describe("design set on an open-top box", () => {
  it("sets the outside sizes", async () => {
    const io = await withBox();
    const result = await cli(["design", "set", F, "open-top-box", "--width", "14", "--height", "7", "--depth", "15", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().design).toMatchObject({ kind: "open-box", width: { outside: 14, cells: 1 }, height: { outside: 7, cells: 1 }, depth: 15 });
    expect(result.json().partChanges.resized).toEqual(["open-top-box-front", "open-top-box-back", "open-top-box-side", "open-top-box-bottom"]);
  });

  it("keeps the other sizes", async () => {
    const result = await cli(["design", "set", F, "open-top-box", "--depth", "15", "--json"], await withBox());
    expect(result.code).toBe(0);
    expect(result.json().design).toMatchObject({ width: { outside: 12.5, cells: 1 }, height: { outside: 6, cells: 1 }, depth: 15 });
  });

  it.each([["--cols", "2"], ["--rows", "2"], ["--column-openings", "300"], ["--row-openings", "300"], ["--back", "none"], ["--mount", "floor"]])("refuses %s", async (flag, value) => {
    const io = await withBox();
    const before = io.files.get(F);
    const result = await cli(["design", "set", F, "open-top-box", flag, value, "--json"], io);
    expect(result.code).toBe(2);
    expect(errorOf(result)).toMatchObject({ code: "conflict", option: flag.slice(2) });
    expect(io.files.get(F)).toBe(before);
  });

  it("refuses --kind on design set", async () => {
    const result = await cli(["design", "set", F, "open-top-box", "--kind", "box", "--json"], await withBox());
    expect(result.code).toBe(2);
    expect(errorOf(result).code).toBe("bad-option");
  });
});

describe("finish steps", () => {
  it("sets, replaces, and clears the finish steps", async () => {
    const io = await withBox();
    const set = await cli(["design", "set", F, "open-top-box", "--finish", "a", "--finish", "b", "--json"], io);
    expect(set.code).toBe(0);
    expect(set.file(F).designs![0]!.finish).toEqual(["a", "b"]);
    const replaced = await cli(["design", "set", F, "open-top-box", "--finish", "c", "--json"], io);
    expect(replaced.file(F).designs![0]!.finish).toEqual(["c"]);
    const cleared = await cli(["design", "set", F, "open-top-box", "--clear-finish", "--json"], io);
    expect(cleared.code).toBe(0);
    expect(cleared.file(F).designs![0]).not.toHaveProperty("finish");
    expect(io.files.get(F)).not.toContain('"finish"');
  });

  it("keeps the finish steps when design set changes something else", async () => {
    const io = await withBox(["--finish", "Sand."]);
    const result = await cli(["design", "set", F, "open-top-box", "--depth", "15"], io);
    expect(result.code).toBe(0);
    expect(result.file(F).designs![0]!.finish).toEqual(["Sand."]);
  });

  it("sets the finish steps of a shelf design", async () => {
    const io = await fresh();
    await cli(["design", "add", F, "--system", "kallax", "--cols", "2", "--rows", "2"], io);
    const result = await cli(["design", "set", F, "kallax-2x2", "--finish", "Wax it.", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().design.finish).toEqual(["Wax it."]);
  });

  it("refuses --clear-finish with --finish", async () => {
    const io = await withBox(["--finish", "Sand."]);
    const before = io.files.get(F);
    const result = await cli(["design", "set", F, "open-top-box", "--finish", "x", "--clear-finish", "--json"], io);
    expect(result.code).toBe(2);
    expect(errorOf(result).code).toBe("conflict");
    expect(io.files.get(F)).toBe(before);
  });

  it.each([["add", BOX], ["set", ["design", "set", F, "open-top-box"]]])("refuses an empty finish step on design %s", async (verb, argv) => {
    const io = await withBox();
    const result = await cli([...argv, "--finish", "  ", "--json"], verb === "add" ? await fresh("in") : io);
    expect(result.code).toBe(2);
    expect(errorOf(result)).toMatchObject({ code: "invalid-value", option: "finish" });
  });

  it("refuses more finish steps than the format allows", async () => {
    const steps = Array.from({ length: 51 }, (_, index) => ["--finish", `Step ${index + 1}.`]).flat();
    const result = await cli([...BOX, ...steps, "--json"], await fresh("in"));
    expect(result.code).toBe(2);
    expect(errorOf(result)).toMatchObject({ code: "invalid-value", option: "finish" });
  });
});

describe("design list and get", () => {
  it("lists an open-top box as an open-top box", async () => {
    const io = await withBox();
    const text = await cli(["design", "list", F], io);
    expect(text.stdout).toContain("open-top box");
    const json = await cli(["design", "list", F, "--json"], io);
    expect(json.json().designs[0]).toMatchObject({ id: "open-top-box", kind: "open-box" });
  });

  it("shows the kind and the finish steps in design get", async () => {
    const io = await fresh("in");
    await cli(["design", "add", F, "--starter", "crate"], io);
    const text = await cli(["design", "get", F, "crate"], io);
    expect(text.code).toBe(0);
    expect(text.stdout).toContain("open-top box");
    expect(text.stdout).toContain('1. Drill a 2 1/8"');
    expect(text.stdout).toContain("3. Sand lightly.");
    const json = await cli(["design", "get", F, "crate", "--json"], io);
    expect(json.json().design).toMatchObject({ kind: "open-box" });
    expect(json.json().design.finish).toHaveLength(3);
  });

  it("shows the finish steps at the end of the assembly report", async () => {
    const io = await withBox(["--finish", "Sand lightly."]);
    const result = await cli(["report", "assembly", F, "--json"], io);
    const steps = result.json().designs[0].steps;
    expect(steps.at(-1)).toMatchObject({ action: "finish", title: "Finish" });
  });
});
