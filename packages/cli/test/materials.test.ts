import { describe, expect, it } from "vitest";
import { cli, withExamples } from "./helpers.ts";

const SHELF = "shelf.cutplan.json";

describe("materials", () => {
  it("lists the materials with their use", async () => {
    const result = await cli(["materials", "list", SHELF, "--json"], withExamples());
    expect(result.code).toBe(0);
    expect(result.json().units).toBe("in");
    expect(result.json().materials[0]).toMatchObject({ id: "bb18", name: "Baltic birch 18mm", grained: true, usedBy: { parts: 17, stock: 1 } });
    expect(result.json().materials.map((m: { status: string }) => m.status)).toEqual(["Used by 17 parts · 1 size · no price", "Used by 3 parts · 1 size · no price"]);
    const text = await cli(["materials", "list", SHELF], withExamples());
    expect(text.stdout.split("\n")[0]).toMatch(/^id\s+name\s+thickness\s+grained.*\sstatus$/);
  });

  it("gets one material and exits 2 for an unknown id", async () => {
    const io = withExamples();
    expect((await cli(["materials", "get", SHELF, "bb6", "--json"], io)).json().material).toMatchObject({ id: "bb6" });
    const missing = await cli(["materials", "get", SHELF, "oak", "--json"], io);
    expect(missing.code).toBe(2);
    expect(missing.json().error).toMatchObject({ code: "not-found", id: "oak", known: ["bb18", "bb6"] });
  });

  it("adds a material, converting the thickness to the project units", async () => {
    const result = await cli(["materials", "add", SHELF, "--name", "Oak ply", "--thickness", "19mm", "--grained", "false", "--color", "#c96", "--json"], withExamples());
    expect(result.code).toBe(0);
    const data = result.json();
    expect(data.material).toEqual({ id: "oak-ply", name: "Oak ply", thickness: 19 / 25.4, grained: false, color: "#c96" });
    expect(data.changes.materials).toEqual({ added: ["oak-ply"], removed: [], changed: [], reordered: false });
    expect(data.written).toBe(SHELF);
    expect(result.file(SHELF).materials.at(-1)!.id).toBe("oak-ply");
  });

  it("refuses a duplicate id and a missing thickness", async () => {
    const duplicate = await cli(["materials", "add", SHELF, "--name", "X", "--thickness", "1/2", "--id", "bb6", "--json"], withExamples());
    expect(duplicate.code).toBe(2);
    expect(duplicate.json().error.code).toBe("duplicate-id");
    const missing = await cli(["materials", "add", SHELF, "--name", "X"], withExamples());
    expect(missing.code).toBe(2);
  });

  it("changes and removes fields", async () => {
    const io = withExamples();
    await cli(["materials", "set", SHELF, "bb6", "--name", "Birch 6", "--color", "#abc"], io);
    const set = await cli(["materials", "set", SHELF, "bb6", "--unset", "color", "--grained", "false", "--json"], io);
    expect(set.json().material).toEqual({ id: "bb6", name: "Birch 6", thickness: 0.2362204724409449, grained: false });
    expect(set.json().changes.materials.changed).toEqual(["bb6"]);
  });

  it("removes an unused material and refuses one that is in use", async () => {
    const io = withExamples();
    await cli(["materials", "add", SHELF, "--name", "Spare", "--thickness", "0.5"], io);
    const removed = await cli(["materials", "remove", SHELF, "spare", "--json"], io);
    expect(removed.json()).toMatchObject({ ok: true, removed: ["spare"] });
    const before = io.files.get(SHELF);
    const refused = await cli(["materials", "remove", SHELF, "bb6", "--json"], io);
    expect(refused.code).toBe(1);
    expect(refused.json()).toMatchObject({ ok: false, error: { code: "in-use", id: "bb6", parts: expect.any(Array), stock: ["bb6-5x5"] } });
    expect(io.files.get(SHELF)).toBe(before);
  });
});

describe("materials and nominal thickness", () => {
  it("warns when a material is added at a nominal thickness, and not when it is measured", async () => {
    const io = withExamples();
    const added = await cli(["materials", "add", SHELF, "--name", "Plywood 3/4", "--thickness", "3/4", "--json"], io);
    expect(added.code).toBe(0);
    expect(added.json().warnings).toContainEqual(expect.stringContaining('nominal-thickness: 3/4" is a nominal thickness. Stock sold as 3/4" is often 45/64" or 11/16" thick.'));
    const measured = await cli(["materials", "add", SHELF, "--name", "Shop MDF", "--thickness", "3/4", "--measured", "true", "--json"], io);
    expect(measured.json().material).toMatchObject({ name: "Shop MDF", measured: true });
    expect(measured.json().warnings ?? []).not.toContainEqual(expect.stringContaining("nominal-thickness"));
  });

  it("lists and gets the nominal result", async () => {
    const io = withExamples();
    await cli(["materials", "add", SHELF, "--name", "Plywood 3/4", "--thickness", "3/4", "--id", "p34"], io);
    const list = (await cli(["materials", "list", SHELF, "--json"], io)).json();
    expect(list.materials.find((m: { id: string }) => m.id === "p34")).toMatchObject({ nominal: { nominal: '3/4"', value: 0.75 } });
    expect(list.materials.find((m: { id: string }) => m.id === "bb18").nominal).toBeNull();
    const text = await cli(["materials", "get", SHELF, "p34"], io);
    expect(text.stdout).toContain('Warning: 3/4" is a nominal thickness.');
  });

  it("sets measured, and clears it with a new thickness", async () => {
    const io = withExamples();
    expect((await cli(["materials", "set", SHELF, "bb6", "--thickness", "1/4", "--json"], io)).json().warnings).toContainEqual(expect.stringContaining("nominal-thickness: 1/4\""));
    const measured = await cli(["materials", "set", SHELF, "bb6", "--measured", "true", "--json"], io);
    expect(measured.json().material.measured).toBe(true);
    expect(measured.json().warnings ?? []).not.toContainEqual(expect.stringContaining("nominal-thickness"));
    const retyped = await cli(["materials", "set", SHELF, "bb6", "--thickness", "0.24", "--json"], io);
    expect(retyped.json().material).not.toHaveProperty("measured");
  });

  it("stores measured false, and refuses a value that is not true or false", async () => {
    const io = withExamples();
    const off = await cli(["materials", "set", SHELF, "bb6", "--measured", "false", "--json"], io);
    expect(off.code).toBe(0);
    expect(off.json().material.measured).toBe(false);
    const bad = await cli(["materials", "set", SHELF, "bb6", "--measured", "yes", "--json"], io);
    expect(bad.code).toBe(2);
    expect(bad.json().error.message).toContain("true or false");
  });

  it("refuses --measured with --catalog", async () => {
    const result = await cli(["materials", "add", SHELF, "--catalog", "mdf-3-4", "--measured", "true", "--json"], withExamples());
    expect(result.code).toBe(2);
    expect(result.json().error.code).toBe("conflict");
  });
});
