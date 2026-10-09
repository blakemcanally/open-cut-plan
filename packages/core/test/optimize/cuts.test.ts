import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import { analyzeSheets, createCutSearch, optimizeCuts, parseProject, planContext, sequencePlan, setSavedCuts, totalCutLength, type Project } from "../../src/index.ts";
import { joinRowProject } from "../helpers.ts";

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

  it("searches only the sheet that it is given, and skips a sheet with a locked line", () => {
    const project = example("living-room-shelf");
    const id = project.plan!.sheets[1]!.id;
    expect(optimizeCuts(project, { sheet: id, passes: 1 }).result.sheets.map((sheet) => sheet.sheet)).toEqual([id]);
    const locked = setSavedCuts(joinRowProject(), "s1", [{ axis: "x", at: 20.0625, from: 0, to: 48, locked: true }]);
    expect(optimizeCuts(locked, { passes: 1 }).result.sheets).toEqual([]);
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
});
