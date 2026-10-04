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
