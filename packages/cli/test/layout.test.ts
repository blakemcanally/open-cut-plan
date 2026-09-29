import { describe, expect, it } from "vitest";
import { cli, withExamples } from "./helpers.ts";

const SHELF = "shelf.cutplan.json";
const BOOKCASE = "bookcase.cutplan.json";

describe("layout", () => {
  it("shows the sheets, placements, and tray", async () => {
    const result = await cli(["layout", "show", SHELF, "--json"], withExamples());
    const data = result.json();
    expect(data.sheets).toHaveLength(7);
    expect(data.sheets[0]).toMatchObject({ number: 1, id: "s1", stock: "bb18-5x5", pinned: false, length: 60, usable: { x: 0.25, y: 0.25, length: 59.5 } });
    expect(data.sheets[0].placements[0]).toMatchObject({ part: "b-top", copy: 0, name: "B Top", width: 15.375 });
    expect(data.tray).toEqual([]);
    const one = await cli(["layout", "show", SHELF, "--sheet", "s2", "--json"], withExamples());
    expect(one.json().sheets.map((s: { id: string }) => s.id)).toEqual(["s2"]);
    const text = await cli(["layout", "show", SHELF], withExamples());
    expect(text.stdout).toContain("Sheet 1 (s1): bb18-5x5");
    expect(text.stdout).toContain("Tray: empty.");
    expect((await cli(["layout", "show", BOOKCASE], withExamples())).stdout).toContain("No plan.");
    expect((await cli(["layout", "show", SHELF, "--sheet", "9"], withExamples())).code).toBe(2);
  });

  it("pins and unpins sheets by number and id", async () => {
    const io = withExamples();
    const pinned = await cli(["layout", "pin", SHELF, "1", "s3", "--json"], io);
    expect(pinned.json().sheets).toEqual(["s1", "s3"]);
    expect(pinned.file(SHELF).plan!.sheets.filter((s) => s.pinned).map((s) => s.id)).toEqual(["s1", "s3"]);
    await cli(["layout", "unpin", SHELF, "s1"], io);
    expect((await cli(["layout", "show", SHELF, "--json"], io)).json().sheets.filter((s: { pinned: boolean }) => s.pinned).map((s: { id: string }) => s.id)).toEqual(["s3"]);
  });

  it("moves a copy to the tray and back to a free spot", async () => {
    const io = withExamples();
    const trayed = await cli(["layout", "tray", SHELF, "a-shelf", "--copy", "1", "--json"], io);
    expect(trayed.json()).toMatchObject({ part: "a-shelf", copy: 1, from: "s2" });
    expect((await cli(["layout", "show", SHELF, "--json"], io)).json().tray).toEqual([{ part: "a-shelf", copy: 1, name: "A Shelf 2" }]);
    const moved = await cli(["layout", "move", SHELF, "a-shelf", "--copy", "1", "--sheet", "2", "--json"], io);
    expect(moved.code).toBe(0);
    expect(moved.json()).toMatchObject({ sheet: "s2", from: null, validation: { errors: 0 } });
    expect(moved.json().placement).toMatchObject({ part: "a-shelf", copy: 1, rotated: false });
  });

  it("needs --copy for a part with more than one copy", async () => {
    const result = await cli(["layout", "tray", SHELF, "a-shelf", "--json"], withExamples());
    expect(result.code).toBe(2);
    expect(result.json().error.code).toBe("missing-option");
    expect((await cli(["layout", "tray", SHELF, "a-shelf", "--copy", "9"], withExamples())).code).toBe(2);
  });

  it("places a copy at an exact spot and reports the overlap", async () => {
    const io = withExamples();
    const result = await cli(["layout", "move", SHELF, "a-top", "--sheet", "s1", "--x", "0.25", "--y", "0.25", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().validation.errors).toBeGreaterThan(0);
    expect(result.stdout).toContain("overlap");
    const strict = await cli(["layout", "move", SHELF, "b-top", "--sheet", "s1", "--x", "0.25", "--y", "31.25", "--strict"], withExamples());
    expect(strict.code).toBe(1);
    expect((await cli(["layout", "move", SHELF, "a-top", "--sheet", "s1", "--x", "1"], io)).code).toBe(2);
  });

  it("fails when no free spot is left", async () => {
    const result = await cli(["layout", "move", SHELF, "b-top", "--sheet", "s2", "--json"], withExamples());
    expect(result.code).toBe(1);
    expect(result.json().error).toMatchObject({ code: "no-space", part: "b-top", sheet: "s2" });
  });

  it("rotates a placed copy", async () => {
    const io = withExamples();
    const result = await cli(["layout", "rotate", SHELF, "a-shelf", "--copy", "0", "--json"], io);
    expect(result.json().placement).toMatchObject({ rotated: true });
    await cli(["layout", "tray", SHELF, "a-top"], io);
    expect((await cli(["layout", "rotate", SHELF, "a-top", "--json"], io)).json().error.code).toBe("not-placed");
  });

  it("adds, removes, and cleans up sheets", async () => {
    const io = withExamples();
    const added = await cli(["layout", "add-sheet", SHELF, "--stock", "bb18-5x5", "--json"], io);
    expect(added.json()).toMatchObject({ sheet: "s8", number: 8 });
    const removed = await cli(["layout", "remove-sheet", SHELF, "1", "--json"], io);
    expect(removed.json().removed).toEqual(["s1"]);
    expect(removed.json().tray).toHaveLength(4);
    const empty = await cli(["layout", "remove-empty", SHELF, "--json"], io);
    expect(empty.json().removed).toEqual(["s8"]);
    expect(empty.file(SHELF).plan!.sheets).toHaveLength(6);
    expect((await cli(["layout", "add-sheet", SHELF, "--stock", "nope"], io)).code).toBe(2);
  });
});
