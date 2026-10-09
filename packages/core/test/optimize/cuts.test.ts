import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import {
  analyzeSheets,
  createCutSearch,
  inset,
  optimizeCuts,
  parseProject,
  planContext,
  sameLine,
  sequencePlan,
  setCutLocked,
  setSavedCuts,
  sheetCuts,
  totalCutLength,
  type CutLine,
  type Project,
  type Rect,
} from "../../src/index.ts";
import { joinRowProject } from "../helpers.ts";
import { guillotine, mulberry32 } from "../plan/treeHelpers.ts";

function example(name: string): Project {
  const parsed = parseProject(JSON.stringify(EXAMPLES[name]!()));
  if (!parsed.ok) throw new Error("example did not load");
  return parsed.project;
}

describe("optimizeCuts", () => {
  it("joins the short cuts along the row into fewer cuts, and keeps every placement", () => {
    const project = joinRowProject();
    const { project: next, result } = optimizeCuts(project, { passes: 8 });
    expect(result.sheets).toEqual([
      { sheet: "s1", number: 1, before: { cuts: 8, length: 272 }, after: { cuts: 6, length: 258.5 }, lines: expect.any(Array), passes: 2, done: true, complete: true },
    ]);
    expect(result.done).toBe(true);
    expect(next.plan!.sheets[0]!.placements).toBe(project.plan!.sheets[0]!.placements);
    expect(analyzeSheets(planContext(next))[0]!.savedCuts).toBe("used");
    const steps = sequencePlan(next);
    expect(steps).toHaveLength(6);
    expect(totalCutLength(steps)).toBe(258.5);
  });

  it("saves the lines in the sheet order of the sequence", () => {
    const { project: next, result } = optimizeCuts(joinRowProject(), { passes: 8 });
    expect(sequencePlan(next).map(({ axis, at, from, to }) => ({ axis, at, from, to }))).toEqual(result.sheets[0]!.lines);
  });

  it("never gives more cuts than the sheets had, and each saved tree passes the check", () => {
    for (const name of Object.keys(EXAMPLES)) {
      const project = example(name);
      const { project: next, result } = optimizeCuts(project, { passes: 4 });
      for (const sheet of result.sheets) {
        expect(sheet.after.cuts, `${name} sheet ${sheet.number}`).toBeLessThanOrEqual(sheet.before.cuts);
        expect(sheet.lines === null || sheet.after.cuts < sheet.before.cuts, `${name} sheet ${sheet.number}`).toBe(true);
      }
      for (const analysis of analyzeSheets(planContext(next))) expect(analysis.savedCuts).not.toBe("stale");
    }
  });

  it("does not change a sheet whose cuts are already the best found", () => {
    const first = optimizeCuts(joinRowProject(), { passes: 8 }).project;
    const again = optimizeCuts(first, { passes: 8 });
    expect(again.result.sheets[0]).toMatchObject({ before: { cuts: 6 }, after: { cuts: 6 }, lines: null });
    expect(again.project).toBe(first);
  });

  it("gives the same result on every run with passes", () => {
    const project = example("living-room-shelf");
    expect(optimizeCuts(project, { passes: 3 }).result).toEqual(optimizeCuts(project, { passes: 3 }).result);
  });

  it("searches only the sheet that it is given", () => {
    const project = example("living-room-shelf");
    const id = project.plan!.sheets[1]!.id;
    expect(optimizeCuts(project, { sheet: id, passes: 1 }).result.sheets.map((sheet) => sheet.sheet)).toEqual([id]);
  });

  it("stops each step at its budget, and a stop keeps the best tree so far", () => {
    let clock = 0;
    const search = createCutSearch(joinRowProject(), { now: () => clock++ });
    expect(search.step(0)).toBe(false);
    expect(search.result()).toMatchObject({ done: false, sheets: [{ passes: 1, done: false, after: { cuts: 6 }, lines: expect.any(Array) }] });
    expect(search.step(Number.POSITIVE_INFINITY)).toBe(true);
    expect(search.result()).toMatchObject({ done: true, sheets: [{ passes: 2, done: true, complete: true }] });
  });

  it("stops a sheet at its time limit", () => {
    let clock = 0;
    const search = createCutSearch(example("simple-bookcase-mm"), { timeLimitMs: 0, now: () => clock++ });
    while (!search.step(1000));
    for (const sheet of search.result().sheets) expect(sheet.passes).toBeLessThanOrEqual(1);
  });

  describe("locked cuts", () => {
    const RAIL_RIP: CutLine = { axis: "y", at: 10.0625, from: 20.125, to: 40.125 };
    const LAST_CROSSCUT: CutLine = { axis: "x", at: 80.4375, from: 0, to: 48 };
    const MIDDLE_CROSSCUT: CutLine = { axis: "x", at: 40.1875, from: 0, to: 48 };
    const savedLines = (project: Project) => project.plan!.sheets[0]!.savedCuts ?? [];

    it("keeps each locked line exactly, and still joins the cuts that the locks allow", () => {
      const { project, result } = optimizeCuts(setCutLocked(joinRowProject(), "s1", RAIL_RIP, true)!, { passes: 8 });
      expect(result.sheets[0]!.after.cuts).toBe(7);
      expect(savedLines(project).filter((line) => line.locked)).toEqual([{ ...RAIL_RIP, locked: true }]);
      expect(sequencePlan(project)).toHaveLength(7);
      expect(analyzeSheets(planContext(project))[0]!.savedCuts).toBe("used");
    });

    it("gives the best tree when the lock is on a line of that tree", () => {
      expect(optimizeCuts(setCutLocked(joinRowProject(), "s1", LAST_CROSSCUT, true)!, { passes: 8 }).result.sheets[0]!.after.cuts).toBe(6);
    });

    it("keeps the saved cuts when every join goes through a locked line", () => {
      const locked = setCutLocked(joinRowProject(), "s1", MIDDLE_CROSSCUT, true)!;
      const { project, result } = optimizeCuts(locked, { passes: 8 });
      expect(result.sheets[0]).toMatchObject({ before: { cuts: 8 }, after: { cuts: 8 }, lines: null });
      expect(project).toBe(locked);
    });

    it("keeps every locked line on random sheets, and never gives more cuts", () => {
      const sheet: Rect = { x: 0, y: 0, length: 96, width: 48 };
      const base = joinRowProject();
      let searched = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const rects: Rect[] = [];
        guillotine(mulberry32(seed), inset(sheet, 0.5), 0.125, 6, rects);
        let project: Project = {
          ...base,
          settings: { ...base.settings, trim: 0.5 },
          parts: rects.map((rect, i) => ({ id: `p${i}`, name: `P${i}`, material: "ply", length: rect.length, width: rect.width, quantity: 1, grain: "none" })),
          plan: { sheets: [{ id: "s1", stock: "ply-4x8", placements: rects.map((rect, i) => ({ part: `p${i}`, copy: 0, x: rect.x, y: rect.y, rotated: false })) }] },
        };
        const random = mulberry32(seed + 100);
        for (const line of sheetCuts(project, "s1")?.lines ?? []) if (random() < 0.3) project = setCutLocked(project, "s1", line, true)!;
        const locked = savedLines(project).filter((line) => line.locked);
        if (locked.length === 0) continue;
        searched++;
        const { project: next, result } = optimizeCuts(project, { passes: 4 });
        expect(result.sheets[0]!.after.cuts, `seed ${seed}`).toBeLessThanOrEqual(result.sheets[0]!.before.cuts);
        expect(analyzeSheets(planContext(next))[0]!.savedCuts, `seed ${seed}`).toBe("used");
        for (const line of locked) expect(savedLines(next).some((other) => other.locked && sameLine(other, line)), `seed ${seed}`).toBe(true);
      }
      expect(searched).toBeGreaterThan(10);
    });

    it("ignores the locks of saved cuts that fail the check", () => {
      const stale = setSavedCuts(joinRowProject(), "s1", [{ ...LAST_CROSSCUT, locked: true }]);
      expect(optimizeCuts(stale, { passes: 8 }).result.sheets[0]!.after.cuts).toBe(6);
    });
  });
});
