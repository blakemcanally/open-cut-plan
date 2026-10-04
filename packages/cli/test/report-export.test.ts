import { describe, expect, it } from "vitest";
import { cli, withExamples } from "./helpers.ts";

const SHELF = "shelf.cutplan.json";
const BOOKCASE = "bookcase.cutplan.json";

describe("report", () => {
  it("gives the shopping list", async () => {
    const result = await cli(["report", "shopping", SHELF, "--json"], withExamples());
    const data = result.json();
    expect(data).toMatchObject({ currency: "USD", total: null, missingPrices: ["bb18-5x5", "bb6-5x5"], sheetsToBuy: 7 });
    expect(data.materials[0].lines[0]).toMatchObject({ stock: "bb18-5x5", used: 5, buy: 5, unitCost: null });
    expect(data.sheets).toHaveLength(7);
    const io = withExamples();
    await cli(["stock", "set", SHELF, "bb18-5x5", "--cost", "80"], io);
    await cli(["stock", "set", SHELF, "bb6-5x5", "--cost", "40"], io);
    const priced = await cli(["report", "shopping", SHELF], io);
    expect(priced.stdout).toContain("Total: 480.00 USD.");
  });

  it("gives the cut steps with their text, for all sheets or one", async () => {
    const all = (await cli(["report", "sequence", SHELF, "--json"], withExamples())).json();
    expect(all.orderMode).toBe("sheet");
    expect(all.steps[0]).toMatchObject({ step: 1, sheet: "s1", sheetNumber: 1, kind: "trim", tool: "table-saw", toolName: "Table saw", title: 'Step 1 · Trim 1/4" off the top edge' });
    expect(all.steps[0]).not.toHaveProperty("releasedPlacements");
    expect(all.steps[0]).toMatchObject({
      headline: 'Trim 1/4" off the top edge',
      method: "Table saw · trim: a cut that removes the rough factory edge",
      pickUp: 'the full sheet 60" × 60" (sheet 1)',
      actions: ['Cut 1/4" off the top edge.'],
      recommendedTool: "table-saw",
      chosen: false,
      overLimit: null,
    });
    expect(all.steps[0]).not.toHaveProperty("recommended");
    expect(all.steps[0].results[1]).toMatchObject({ kind: "next", next: 2 });
    const text = (await cli(["report", "sequence", SHELF, "--sheet", "s1"], withExamples())).stdout;
    expect(text.split("\n").slice(0, 5)).toEqual([
      'Step 1 · Trim 1/4" off the top edge',
      "  Table saw · trim: a cut that removes the rough factory edge",
      '  Pick up the full sheet 60" × 60" (sheet 1).',
      '  1. Cut 1/4" off the top edge.',
      expect.stringMatching(/^ {2}Waste: /),
    ]);
    const one = (await cli(["report", "sequence", SHELF, "--sheet", "s2", "--json"], withExamples())).json();
    expect(one.steps.length).toBeGreaterThan(0);
    expect(one.steps.every((s: { sheet: string }) => s.sheet === "s2")).toBe(true);
    expect(one.cutLength).toBeCloseTo(one.steps.reduce((sum: number, s: { from: number; to: number }) => sum + s.to - s.from, 0), 9);
    expect(all.cutLength).toBeGreaterThan(one.cutLength);
    expect(text.split("\n").at(-2)).toMatch(/^\d+ cut steps\. The total cut length is \d[^.]*"\.$/);
    expect((await cli(["report", "sequence", BOOKCASE], withExamples())).stdout).toBe("No cuts.\n");
  });

  it("lists the offcuts and marks the saved ones", async () => {
    const io = withExamples();
    const before = (await cli(["report", "offcuts", SHELF, "--json"], io)).json();
    expect(before.minOffcut).toEqual({ length: 12, width: 6 });
    expect(before.offcuts.length).toBe(9);
    expect(before.offcuts[0]).toMatchObject({ sheet: "s1", sheetNumber: 1, material: "bb18", length: 59.5, saved: false });
    await cli(["stock", "save-offcuts", SHELF], io);
    const after = (await cli(["report", "offcuts", SHELF, "--json"], io)).json();
    expect(after.offcuts.every((o: { saved: boolean }) => o.saved)).toBe(true);
  });

  it("gives the labels and the label pages", async () => {
    const io = withExamples();
    await cli(["settings", "set", BOOKCASE, "features.labels", "false"], io);
    const off = await cli(["report", "labels", BOOKCASE, "--json"], io);
    expect(off.json()).toMatchObject({ enabled: false, labels: [] });
    const result = await cli(["report", "labels", SHELF, "--layout", "avery-5160", "--start", "29", "--json"], io);
    const data = result.json();
    expect(data.enabled).toBe(true);
    expect(data.labels[0]).toMatchObject({ part: "a-top", copy: 0, name: "A Top", sheetNumber: 1 });
    expect(data.layout.id).toBe("avery-5160");
    expect(data.pages[0]).toHaveLength(30);
    expect(data.pages[0][27]).toBeNull();
    expect(data.pages[0][28]).toEqual({ part: "a-top", copy: 0 });
    expect((await cli(["report", "labels", SHELF, "--layout", "avery-9999"], io)).code).toBe(2);
  });

  it("gives the cut list with sheet numbers and material totals", async () => {
    const result = await cli(["report", "cutlist", SHELF, "--json"], withExamples());
    const shelf = result.json().parts.find((p: { id: string }) => p.id === "a-shelf");
    expect(shelf).toMatchObject({ quantity: 3, placed: 3, sheets: [1, 2, 5], material: "bb18" });
    expect(result.json().materials.map((m: { material: string }) => m.material)).toEqual(["bb18", "bb6"]);
    expect((await cli(["report", "cutlist", SHELF], withExamples())).stdout).toMatch(/Baltic birch 18mm: \d+ parts, \d+ copies, [\d.]+ sq ft\./);
  });
});

describe("export", () => {
  it("writes one SVG per sheet into a directory", async () => {
    const io = withExamples();
    const result = await cli(["export", "svg", SHELF, "--out", "svg/", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().files).toHaveLength(7);
    expect(result.json().files[0]).toEqual({ sheet: "s1", sheetNumber: 1, path: "svg/Living room shelf-sheet-1.svg" });
    expect(io.files.get("svg/Living room shelf-sheet-7.svg")).toMatch(/^<svg /);
  });

  it("prints one sheet, or writes it to a file", async () => {
    const io = withExamples();
    const printed = await cli(["export", "svg", SHELF, "--sheet", "2"], io);
    expect(printed.stdout).toMatch(/^<svg [\s\S]*<\/svg>\n?$/);
    expect(printed.stdout).toContain("Sheet 2");
    const json = await cli(["export", "svg", SHELF, "--sheet", "2", "--json"], io);
    expect(json.json()).toMatchObject({ sheet: "s2", sheetNumber: 2, svg: expect.stringContaining("<svg") });
    const file = await cli(["export", "svg", SHELF, "--sheet", "s3", "--out", "three.svg", "--no-cuts"], io);
    expect(file.code).toBe(0);
    expect(io.files.get("three.svg")).not.toContain("Step");
  });

  it("refuses an unclear SVG target", async () => {
    expect((await cli(["export", "svg", SHELF], withExamples())).code).toBe(2);
    expect((await cli(["export", "svg", SHELF, "--out", "-"], withExamples())).code).toBe(2);
    expect((await cli(["export", "svg", SHELF, "--out", "one.svg"], withExamples())).code).toBe(2);
    const empty = await cli(["export", "svg", BOOKCASE, "--out", "svg/", "--json"], withExamples());
    expect(empty.code).toBe(1);
    expect(empty.json().error.code).toBe("no-sheets");
  });

  it("exports parts and stock CSV", async () => {
    const io = withExamples();
    const parts = await cli(["export", "parts-csv", SHELF], io);
    expect(parts.stdout.split("\n")[0]).toMatch(/^\uFEFF?name,/);
    const same = await cli(["parts", "export", SHELF], io);
    expect(parts.stdout).toBe(same.stdout);
    const stock = await cli(["export", "stock-csv", SHELF, "--out", "stock.csv", "--json"], io);
    expect(stock.json()).toEqual({ ok: true, command: "export stock-csv", path: "stock.csv", rows: 2 });
    expect(io.files.get("stock.csv")).toMatch(/^\uFEFF?material,/);
  });

  it("exports the project with the cuts, and leaves the source alone", async () => {
    const io = withExamples();
    const before = io.files.get(SHELF);
    const result = await cli(["export", "plan", SHELF, "--out", "cut.json", "--json"], io);
    expect(result.json()).toMatchObject({ sheets: 7, path: "cut.json" });
    expect(result.json().cuts).toBeGreaterThan(0);
    expect(io.files.get(SHELF)).toBe(before);
    const written = result.file("cut.json");
    expect(written.plan!.sheets[0]!.cuts!.length).toBeGreaterThan(0);
    const planOnly = await cli(["export", "plan", SHELF, "--plan-only"], io);
    expect(Object.keys(JSON.parse(planOnly.stdout))).toEqual(["sheets"]);
    expect((await cli(["validate", "cut.json"], io)).code).toBe(0);
  });
});
