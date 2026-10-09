import { describe, expect, it } from "vitest";
import { cli, editFile, memoryIo, ROW, rowFile, withExamples } from "./helpers.ts";

const SHELF = "shelf.cutplan.json";

const rowIo = () => memoryIo({ [ROW]: rowFile() });

describe("optimize-cuts", () => {
  it("saves fewer cuts and keeps every placement", async () => {
    const io = rowIo();
    const result = await cli(["optimize-cuts", ROW, "--passes", "8"], io);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Saved fewer cuts on 1 sheet.");
    expect(result.stdout).toContain('Sheet 1 (s1): 8 → 6 cuts, 272" → 258 1/2" of cuts.');
    const file = result.file(ROW);
    expect(file.plan!.sheets[0]!.savedCuts).toHaveLength(6);
    expect(file.plan!.sheets[0]!.placements).toEqual(JSON.parse(rowFile()).plan.sheets[0].placements);
  });

  it("gives the result as JSON", async () => {
    const result = await cli(["optimize-cuts", ROW, "--passes", "8", "--json"], rowIo());
    expect(result.json()).toMatchObject({
      cleared: false,
      timeLimitMs: null,
      passes: 8,
      deterministic: true,
      sheets: [{ number: 1, id: "s1", before: { cuts: 8, length: 272 }, after: { cuts: 6, length: 258.5 }, saved: true, passes: 2, complete: true }],
    });
  });

  it("says when the cuts are already the best found", async () => {
    const io = rowIo();
    await cli(["optimize-cuts", ROW, "--passes", "8"], io);
    const again = await cli(["optimize-cuts", ROW, "--passes", "8"], io);
    expect(again.stdout).toContain("The cuts are already the best found.");
    expect(again.stdout).toContain("Sheet 1 (s1): 6 cuts, 258 1/2\" of cuts. No tree with fewer cuts was found.");
  });

  it("searches one sheet with --sheet, and fails for a sheet that does not exist", async () => {
    const result = await cli(["optimize-cuts", SHELF, "--sheet", "2", "--passes", "2", "--json", "--dry-run"], withExamples());
    expect(result.json().sheets.map((sheet: { number: number }) => sheet.number)).toEqual([2]);
    const missing = await cli(["optimize-cuts", SHELF, "--sheet", "99"], withExamples());
    expect(missing.code).toBe(2);
  });

  it("uses the time limit with --time", async () => {
    const result = await cli(["optimize-cuts", ROW, "--time", "0.5", "--json"], rowIo());
    expect(result.json()).toMatchObject({ timeLimitMs: 500, passes: null, deterministic: false });
    const bad = await cli(["optimize-cuts", ROW, "--time", "0"], rowIo());
    expect(bad.code).toBe(2);
  });

  it("removes the saved cuts with --clear, and refuses --clear with --passes", async () => {
    const io = rowIo();
    await cli(["optimize-cuts", ROW, "--passes", "8"], io);
    const cleared = await cli(["optimize-cuts", ROW, "--clear", "--json"], io);
    expect(cleared.json()).toMatchObject({ cleared: true, sheets: [] });
    expect(cleared.file(ROW).plan!.sheets[0]!.savedCuts).toBeUndefined();
    const conflict = await cli(["optimize-cuts", ROW, "--clear", "--passes", "2"], io);
    expect(conflict.code).toBe(2);
  });

  it("is removed by a layout move, and layout show tells which cuts a sheet uses", async () => {
    const io = rowIo();
    await cli(["optimize-cuts", ROW, "--passes", "8"], io);
    expect((await cli(["layout", "show", ROW, "--json"], io)).json().sheets[0].cuts).toBe("saved");
    expect((await cli(["layout", "show", ROW], io)).stdout).toContain("used, saved cuts");
    await cli(["layout", "move", ROW, "rail", "--copy", "1", "--sheet", "1", "--x", "40.25", "--y", "20"], io);
    expect((await cli(["layout", "show", ROW, "--json"], io)).json().sheets[0].cuts).toBe("automatic");
    expect(io.files.get(ROW)).not.toContain("savedCuts");
  });

  it("removes saved cuts that an older app made stale, on the next change", async () => {
    const io = rowIo();
    await cli(["optimize-cuts", ROW, "--passes", "8"], io);
    editFile(io, ROW, (file) => {
      file.plan.sheets[0].placements[1].y = 5;
    });
    const shown = await cli(["validate", ROW, "--json"], io);
    expect(JSON.stringify(shown.json())).toContain("saved-cuts-stale");
    await cli(["layout", "pin", ROW, "1"], io);
    expect(io.files.get(ROW)).not.toContain("savedCuts");
  });

  describe("--slide", () => {
    const looseIo = () => {
      const io = rowIo();
      editFile(io, ROW, (file) => {
        file.plan.sheets[0].placements[2].y = 3;
      });
      return io;
    };

    it("slides a part inside its piece when that gives fewer cuts, and saves the new placement", async () => {
      const io = looseIo();
      const plain = (await cli(["optimize-cuts", ROW, "--passes", "8", "--json", "--dry-run"], io)).json().sheets[0];
      const result = await cli(["optimize-cuts", ROW, "--passes", "8", "--slide"], io);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Slid 1 part inside its piece.");
      const file = result.file(ROW);
      expect(file.plan!.sheets[0]!.placements[2]).toMatchObject({ x: 40.25, y: 0 });
      expect(file.plan!.sheets[0]!.savedCuts!.length).toBeLessThan(plain.after.cuts);
      expect((await cli(["layout", "show", ROW, "--json"], io)).json().sheets[0].cuts).toBe("saved");
    });

    it("gives the parts that slid in the JSON, and no part slides without --slide", async () => {
      expect((await cli(["optimize-cuts", ROW, "--passes", "8", "--slide", "--json"], looseIo())).json().sheets[0]).toMatchObject({ saved: true, slid: 1 });
      const io = looseIo();
      expect((await cli(["optimize-cuts", ROW, "--passes", "8", "--json"], io)).json().sheets[0]).toMatchObject({ slid: 0 });
      expect(io.files.get(ROW)).toContain('"y": 3');
    });

    it("does not slide a pinned sheet, and refuses --slide with --clear", async () => {
      const io = looseIo();
      await cli(["layout", "pin", ROW, "1"], io);
      expect((await cli(["optimize-cuts", ROW, "--passes", "8", "--slide", "--json"], io)).json().sheets[0]).toMatchObject({ slid: 0 });
      const conflict = await cli(["optimize-cuts", ROW, "--clear", "--slide"], io);
      expect(conflict.code).toBe(2);
      expect(conflict.stderr).toContain("--slide");
    });
  });
});
