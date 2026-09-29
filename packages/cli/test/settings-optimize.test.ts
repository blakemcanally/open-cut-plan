import { describe, expect, it } from "vitest";
import { cli, withExamples } from "./helpers.ts";

const SHELF = "shelf.cutplan.json";
const BOOKCASE = "bookcase.cutplan.json";

describe("settings", () => {
  it("gets every setting and one setting", async () => {
    const all = await cli(["settings", "get", SHELF, "--json"], withExamples());
    expect(all.json().settings).toMatchObject({
      name: "Living room shelf",
      units: "in",
      trim: 0.25,
      orderMode: "sheet",
      "minOffcut.length": 12,
      "minOffcut.width": 6,
      minOffcut: "default",
      "display.inch": 32,
      "optimizer.timeLimitMs": 2000,
      "optimizer.seed": null,
      currency: "USD",
      "features.grain": true,
    });
    const one = await cli(["settings", "get", SHELF, "trim", "--json"], withExamples());
    expect(one.json()).toEqual({ ok: true, command: "settings get", key: "trim", value: 0.25 });
    expect((await cli(["settings", "get", SHELF, "trim"], withExamples())).stdout).toBe('0.25 (1/4")\n');
    expect((await cli(["settings", "get", SHELF, "colour"], withExamples())).code).toBe(2);
  });

  it("sets several keys in order", async () => {
    const io = withExamples();
    const result = await cli(["settings", "set", SHELF, "trim", "3/8", "orderMode", "setup", "optimizer.seed", "7", "currency", "eur", "features.cost", "false", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().changes.settings).toEqual(["currency", "features.cost", "optimizer.seed", "orderMode", "trim"]);
    const project = result.file(SHELF);
    expect(project.settings).toMatchObject({ trim: 0.375, orderMode: "setup", currency: "EUR", optimizer: { seed: 7 }, features: { cost: false } });
    await cli(["settings", "set", SHELF, "optimizer.seed", "none", "minOffcut.width", "8", "notes", ""], io);
    const after = (await cli(["settings", "get", SHELF, "--json"], io)).json().settings;
    expect(after).toMatchObject({ "optimizer.seed": null, "minOffcut.length": 12, "minOffcut.width": 8, minOffcut: "custom", notes: null });
  });

  it("uses the factory edges", async () => {
    const io = withExamples();
    const result = await cli(["settings", "set", SHELF, "--factory-edges", "--json"], io);
    expect(result.json().settings.trim).toBe(0);
  });

  it("converts the project when the units change", async () => {
    const io = withExamples();
    const result = await cli(["settings", "set", SHELF, "units", "mm", "trim", "6", "--json"], io);
    expect(result.code).toBe(0);
    const project = result.file(SHELF);
    expect(project.project.units).toBe("mm");
    expect(project.stock[0]).toMatchObject({ length: 1524, width: 1524 });
    expect(project.settings.trim).toBe(6);
    expect(result.json().validation.errors).toBe(0);
  });

  it("rejects bad values and odd pairs", async () => {
    const io = withExamples();
    expect((await cli(["settings", "set", SHELF, "display.inch", "12"], io)).code).toBe(2);
    expect((await cli(["settings", "set", SHELF, "trim"], io)).code).toBe(2);
    expect((await cli(["settings", "set", SHELF, "features.grain", "yes"], io)).code).toBe(2);
    expect(io.writes).toEqual([]);
  });
});

describe("optimize", () => {
  it("plans a project with no plan and reports the change", async () => {
    const io = withExamples();
    const result = await cli(["optimize", BOOKCASE, "--iterations", "20", "--json"], io);
    expect(result.code).toBe(0);
    const data = result.json();
    expect(data).toMatchObject({ mode: "all", continued: false, seed: 1, timeLimitMs: null, deterministic: true, unplaced: [] });
    expect(data.before).toMatchObject({ sheets: 0, placedCopies: 0 });
    expect(data.after.unplacedCopies).toBe(0);
    expect(data.after.sheets).toBeGreaterThan(0);
    expect(data.after.cost).toEqual(expect.any(Number));
    expect(result.file(BOOKCASE).plan!.sheets.length).toBe(data.after.sheets);
  });

  it("gives the same plan for the same seed and iterations", async () => {
    const a = await cli(["optimize", BOOKCASE, "--iterations", "30", "--seed", "5", "--out", "-"], withExamples());
    const b = await cli(["optimize", BOOKCASE, "--iterations", "30", "--seed", "5", "--out", "-"], withExamples());
    expect(a.stdout).toBe(b.stdout);
    expect(a.stdout).toContain('"plan"');
  });

  it("keeps pinned sheets, and --rest-only keeps every sheet", async () => {
    const io = withExamples();
    const project = JSON.parse(io.files.get(SHELF)!);
    project.plan.sheets[0].pinned = true;
    const firstSheet = structuredClone(project.plan.sheets[0]);
    project.plan.sheets[1].placements.pop();
    io.files.set(SHELF, JSON.stringify(project));
    const all = await cli(["optimize", SHELF, "--iterations", "5", "--out", "-", "--json"], io);
    expect(all.json().project.plan.sheets[0]).toEqual(firstSheet);
    const rest = await cli(["optimize", SHELF, "--iterations", "5", "--rest-only", "--json"], io);
    expect(rest.json()).toMatchObject({ mode: "rest", after: { unplacedCopies: 0 } });
    const sheets = rest.file(SHELF).plan!.sheets;
    expect(sheets.slice(0, 7).map((s) => s.id)).toEqual(project.plan.sheets.map((s: { id: string }) => s.id));
    expect(sheets[0]!.pinned).toBe(true);
    expect(sheets[1]!.pinned).toBeUndefined();
  });

  it("never does worse than the current plan with --continue", async () => {
    const io = withExamples();
    const result = await cli(["optimize", SHELF, "--iterations", "3", "--continue", "--json"], io);
    expect(result.json().continued).toBe(true);
    expect(result.json().after.sheetsToBuy).toBeLessThanOrEqual(result.json().before.sheetsToBuy);
  });

  it("fails with --strict when copies cannot be placed", async () => {
    const io = withExamples();
    await cli(["parts", "add", BOOKCASE, "--name", "Huge", "--length", "3000", "--width", "1000", "--material", "mdf18"], io);
    const before = io.files.get(BOOKCASE);
    const result = await cli(["optimize", BOOKCASE, "--iterations", "5", "--strict", "--json"], io);
    expect(result.code).toBe(1);
    expect(result.json()).toMatchObject({ ok: false, error: { code: "strict" }, written: null, unplaced: [{ part: "huge", copy: 0, name: "Huge", reason: "too-large" }] });
    expect(io.files.get(BOOKCASE)).toBe(before);
  });

  it("rejects conflicting modes and bad numbers", async () => {
    expect((await cli(["optimize", SHELF, "--rest-only", "--keep-pinned"], withExamples())).code).toBe(2);
    expect((await cli(["optimize", SHELF, "--time", "0"], withExamples())).code).toBe(2);
    expect((await cli(["optimize", SHELF, "--iterations", "many"], withExamples())).code).toBe(2);
  });
});
