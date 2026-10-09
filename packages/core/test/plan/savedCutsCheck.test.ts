import { describe, expect, it } from "vitest";
import {
  analyzeSheets,
  createTreeSearch,
  parseProject,
  planContext,
  sequencePlan,
  serializeProject,
  stockRect,
  treeLines,
  validatePlan,
  withCuts,
  withoutStaleSavedCuts,
  type Project,
  type SavedCut,
} from "../../src/index.ts";
import { joinRowProject } from "../helpers.ts";

/** The row project with the 6 cuts of the thorough search saved on its sheet. */
function savedRow(): Project {
  const project = joinRowProject();
  const ctx = planContext(project);
  const [analysis] = analyzeSheets(ctx);
  const lines = treeLines(createTreeSearch(stockRect(analysis!.stock), analysis!.items, ctx.kerf, 0).run(4)!.tree);
  project.plan!.sheets[0]!.savedCuts = lines;
  return project;
}

const stale = (project: Project) => validatePlan(project).filter((issue) => issue.code === "saved-cuts-stale");

describe("saved cuts in the analysis", () => {
  it("uses the saved tree when it passes the check", () => {
    const project = savedRow();
    const [analysis] = analyzeSheets(planContext(project));
    expect(analysis!.savedCuts).toBe("used");
    expect(analysis!.tree).not.toEqual(analysis!.automatic);
    expect(sequencePlan(project)).toHaveLength(6);
    expect(sequencePlan(joinRowProject())).toHaveLength(8);
    expect(stale(project)).toEqual([]);
  });

  it("has no saved cuts for an empty list", () => {
    const project = joinRowProject();
    project.plan!.sheets[0]!.savedCuts = [];
    expect(analyzeSheets(planContext(project))[0]!.savedCuts).toBe("none");
  });

  const cases: [string, (project: Project) => void][] = [
    ["a new kerf", (p) => void (p.tools[0]!.kerf = 0.25)],
    ["a new trim", (p) => void (p.settings.trim = 0.5)],
    ["a new part size", (p) => void (p.parts[1]!.width = 12)],
    ["a part that an older app moved", (p) => void (p.plan!.sheets[0]!.placements[1]!.y = 5)],
    ["a line through a part", (p) => p.plan!.sheets[0]!.savedCuts!.push({ axis: "x", at: 10, from: 0, to: 48 })],
    ["lines that cross", (p) => p.plan!.sheets[0]!.savedCuts!.push({ axis: "y", at: 45, from: 0, to: 96 })],
    ["a line outside the sheet", (p) => p.plan!.sheets[0]!.savedCuts!.push({ axis: "x", at: 100, from: 0, to: 48 })],
  ];
  it.each(cases)("uses the automatic tree and warns after %s", (_, change) => {
    const project = savedRow();
    change(project);
    const [analysis] = analyzeSheets(planContext(project));
    expect(analysis!.savedCuts).toBe("stale");
    expect(analysis!.tree).toBe(analysis!.automatic);
    expect(stale(project)).toEqual([
      {
        severity: "warning",
        code: "saved-cuts-stale",
        message: "The saved cuts of sheet 1 no longer fit the layout. Run Optimize cuts again, or use the automatic cuts.",
        refs: [{ kind: "sheet", sheet: "s1" }],
      },
    ]);
  });

  it("keeps the saved cuts when the tools change, and the no-tool issue names the automatic cuts", () => {
    const project = savedRow();
    const lines: SavedCut[] = [
      { axis: "y", at: 40.0625, from: 0, to: 96 },
      { axis: "x", at: 20.0625, from: 0, to: 40 },
      { axis: "x", at: 40.1875, from: 0, to: 40 },
      { axis: "x", at: 60.3125, from: 0, to: 40 },
      { axis: "x", at: 80.4375, from: 0, to: 40 },
      { axis: "y", at: 10.0625, from: 20.125, to: 40.125 },
      { axis: "y", at: 10.0625, from: 40.25, to: 60.25 },
    ];
    project.plan!.sheets[0]!.savedCuts = lines;
    project.settings.features.toolLimits = true;
    project.tools = [{ id: "track", name: "Track saw", type: "track-saw", kerf: 0.125, enabled: true, maxCut: 50 }];
    const [analysis] = analyzeSheets(planContext(project));
    expect(analysis!.savedCuts).toBe("used");
    const noTool = validatePlan(project).filter((issue) => issue.code === "no-tool");
    expect(noTool).toHaveLength(1);
    expect(noTool[0]!.message).toMatch(/^No tool in your profile can make cut 1 \(a 96" rip\)\. The automatic cuts of sheet 1 have fewer cuts that no tool can make\./);
  });
});

describe("saving saved cuts", () => {
  it("keeps saved cuts that pass the check, and writes the cuts from them", () => {
    const project = savedRow();
    const saved = withCuts(project).plan!.sheets[0]!;
    expect(saved.savedCuts).toEqual(project.plan!.sheets[0]!.savedCuts);
    expect(saved.cuts).toHaveLength(6);
    const reloaded = parseProject(serializeProject(withCuts(project)));
    expect(reloaded.ok && analyzeSheets(planContext(reloaded.project))[0]!.savedCuts).toBe("used");
  });

  it("removes saved cuts that fail the check", () => {
    const project = savedRow();
    project.plan!.sheets[0]!.placements[1]!.y = 5;
    expect(withCuts(project).plan!.sheets[0]!.savedCuts).toBeUndefined();
    expect(withoutStaleSavedCuts(project).plan!.sheets[0]!.savedCuts).toBeUndefined();
    expect(withoutStaleSavedCuts(savedRow()).plan!.sheets[0]!.savedCuts).toHaveLength(6);
  });

  it("keeps the saved cuts of a sheet whose stock is missing", () => {
    const project = savedRow();
    project.plan!.sheets[0]!.stock = "gone";
    expect(() => validatePlan(project)).not.toThrow();
    expect(withCuts(project).plan!.sheets[0]!.savedCuts).toHaveLength(6);
  });
});
