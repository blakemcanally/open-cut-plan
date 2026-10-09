import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import {
  analyzeSheets,
  cutStops,
  extendCut,
  inset,
  joinCut,
  parseProject,
  planContext,
  removeCut,
  sequencePlan,
  setSavedCuts,
  setToolChoice,
  sheetCuts,
  shortenCut,
  shortenStops,
  type CutLine,
  type Project,
  type Rect,
} from "../../src/index.ts";
import { joinRowProject } from "../helpers.ts";
import { guillotine, mulberry32 } from "../plan/treeHelpers.ts";

const SHEET: Rect = { x: 0, y: 0, length: 96, width: 48 };
const POST_RIP: CutLine = { axis: "y", at: 40.0625, from: 0, to: 20 };
const RAIL_RIP: CutLine = { axis: "y", at: 10.0625, from: 20.125, to: 40.125 };
const POST_CROSSCUT: CutLine = { axis: "x", at: 20.0625, from: 0, to: 48 };

/** A sheet of random guillotine parts, each part once, with the trim of `trim`. */
function randomProject(seed: number, trim: number): Project {
  const rects: Rect[] = [];
  guillotine(mulberry32(seed), trim > 0 ? inset(SHEET, trim) : SHEET, 0.125, 6, rects);
  const base = joinRowProject();
  return {
    ...base,
    settings: { ...base.settings, trim },
    parts: rects.map((rect, i) => ({ id: `p${i}`, name: `P${i}`, material: "ply", length: rect.length, width: rect.width, quantity: 1, grain: "none" })),
    plan: { sheets: [{ id: "s1", stock: "ply-4x8", placements: rects.map((rect, i) => ({ part: `p${i}`, copy: 0, x: rect.x, y: rect.y, rotated: false })) }] },
  };
}

function shelf(): Project {
  const parsed = parseProject(JSON.stringify(EXAMPLES["living-room-shelf"]!()));
  if (!parsed.ok) throw new Error("The example does not load.");
  return parsed.project;
}

const used = (project: Project, sheet = "s1") => analyzeSheets(planContext(project)).find((analysis) => analysis.sheet.id === sheet)!.savedCuts;
const sheetSteps = (project: Project, sheet = "s1") => sequencePlan(project).filter((step) => step.sheet === sheet);
const lines = (project: Project, sheet = "s1") => sheetCuts(project, sheet)!.lines.map(({ axis, at, from, to }) => ({ axis, at, from, to }));

function expectStopsPass(project: Project, sheet: string): number {
  let count = 0;
  for (const line of sheetCuts(project, sheet)?.lines ?? []) {
    for (const end of ["from", "to"] as const) {
      for (const stop of cutStops(project, sheet, line, end)) {
        const next = extendCut(project, sheet, line, end, stop.end);
        expect(next && used(next, sheet)).toBe("used");
        expect(sheetSteps(next!, sheet)).toHaveLength(stop.cuts);
        count++;
      }
      for (const stop of shortenStops(project, sheet, line, end)) {
        const next = shortenCut(project, sheet, line, end, stop.across!);
        expect(next && used(next, sheet)).toBe("used");
        expect(sheetSteps(next!, sheet)).toHaveLength(stop.cuts);
        count++;
      }
    }
  }
  return count;
}

describe("cut edits", () => {
  it("gives only stops whose result passes the check, on random sheets and on the example", () => {
    let stops = 0;
    for (let seed = 1; seed <= 12; seed++) {
      stops += expectStopsPass(randomProject(seed, 0), "s1");
      stops += expectStopsPass(randomProject(seed, 0.5), "s1");
    }
    const example = shelf();
    for (const sheet of example.plan!.sheets.slice(0, 2)) stops += expectStopsPass(example, sheet.id);
    expect(stops).toBeGreaterThan(50);
  });

  it("joins the cuts on the same line, and splits the cross cuts that it goes through", () => {
    const project = joinRowProject();
    const [far] = cutStops(project, "s1", RAIL_RIP, "to");
    expect(far).toMatchObject({ end: 60.25, joins: 1, cuts: 7 });
    const next = extendCut(project, "s1", RAIL_RIP, "to", 60.25)!;
    expect(lines(next)).toContainEqual({ axis: "y", at: 10.0625, from: 20.125, to: 60.25 });
    expect(lines(next)).toContainEqual({ axis: "x", at: 40.1875, from: 0, to: 10 });
    expect(lines(next)).not.toContainEqual({ axis: "x", at: 40.1875, from: 0, to: 48 });
    expect(sheetSteps(next)).toHaveLength(7);
  });

  it("joins as far as the stops allow, and two joins give the cuts of Optimize cuts", () => {
    const first = joinCut(joinRowProject(), "s1", POST_RIP)!;
    expect(first.joins).toBe(1);
    expect(first.line).toMatchObject({ from: 0, to: 80.375 });
    const second = joinCut(first.project, "s1", RAIL_RIP)!;
    expect(sheetSteps(second.project)).toHaveLength(6);
    expect(joinCut(second.project, "s1", second.line)).toBeNull();
  });

  it("refuses an end that is not a stop", () => {
    expect(extendCut(joinRowProject(), "s1", RAIL_RIP, "to", 50)).toBeNull();
    expect(extendCut(joinRowProject(), "s1", RAIL_RIP, "from", 0)).toBeNull();
    expect(shortenCut(joinRowProject(), "s1", POST_CROSSCUT, "to", 30)).toBeNull();
  });

  it("shortens a cut by extending the cut that goes across it", () => {
    const project = joinRowProject();
    const [stop] = shortenStops(project, "s1", POST_CROSSCUT, "to");
    expect(stop).toMatchObject({ across: 40.0625, end: 40 });
    const shortened = shortenCut(project, "s1", POST_CROSSCUT, "to", 40.0625)!;
    const [across] = cutStops(project, "s1", POST_RIP, "to");
    expect(lines(shortened)).toEqual(lines(extendCut(project, "s1", POST_RIP, "to", across!.end)!));
    expect(lines(shortened)).toContainEqual({ axis: "x", at: 20.0625, from: 0, to: 40 });
  });

  it("removes only a cut whose removal passes the check", () => {
    const project = joinRowProject();
    for (const line of sheetCuts(project, "s1")!.lines) expect(removeCut(project, "s1", line)).toBeNull();
    const waste: CutLine = { axis: "y", at: 20, from: 80.5, to: 96 };
    const extra = setSavedCuts(project, "s1", [...sheetCuts(project, "s1")!.lines, waste]);
    expect(used(extra)).toBe("used");
    const removed = removeCut(extra, "s1", waste)!;
    expect(sheetSteps(removed)).toHaveLength(8);
    expect(used(removed)).toBe("used");
  });

  it("copies the automatic tree at the first edit, in the sheet order of the sequence", () => {
    const project = joinRowProject();
    expect(project.plan!.sheets[0]!.savedCuts).toBeUndefined();
    const next = extendCut(project, "s1", RAIL_RIP, "to", 60.25)!;
    expect(used(next)).toBe("used");
    const steps = sheetSteps(next).map(({ axis, at, from, to }) => ({ axis, at, from, to }));
    expect(next.plan!.sheets[0]!.savedCuts).toEqual(steps);
  });

  describe("tool choices", () => {
    const withTools = (maxCut: number) => {
      const project = joinRowProject();
      const tooled: Project = {
        ...project,
        settings: { ...project.settings, features: { ...project.settings.features, toolLimits: true } },
        tools: [
          { id: "track", name: "Track saw", type: "track-saw", kerf: 0.125, enabled: true, maxCut: 110 },
          { id: "circ", name: "Circular saw", type: "circular-saw", kerf: 0.125, enabled: true, maxCut },
        ],
      };
      const step = sheetSteps(tooled).find((s) => s.axis === POST_RIP.axis && s.at === POST_RIP.at && s.from === POST_RIP.from)!;
      return setToolChoice(tooled, step, "circ");
    };
    const toolOf = (project: Project, line: CutLine) => sheetSteps(project).find((s) => s.axis === line.axis && s.at === line.at && s.from === line.from && s.to === line.to)!.tool?.id;

    it("stay with an extended cut while the tool can make it", () => {
      const join = joinCut(withTools(100), "s1", POST_RIP)!;
      expect(toolOf(join.project, join.line)).toBe("circ");
    });

    it("go when the tool cannot make the new cut, so that it gets the recommended tool", () => {
      const join = joinCut(withTools(50), "s1", POST_RIP)!;
      expect(toolOf(join.project, join.line)).toBe("track");
      expect(join.project.plan!.sheets[0]!.toolChoices).toBeUndefined();
    });
  });
});
