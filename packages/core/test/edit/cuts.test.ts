import { describe, expect, it } from "vitest";
import {
  analyzeSheets,
  clearSavedCuts,
  convertProjectUnits,
  createTreeSearch,
  lostSavedCuts,
  moveCopyTo,
  moveToTray,
  nudgeCopy,
  optimize,
  placeCopy,
  planContext,
  pushSheetToFactoryEdges,
  removePart,
  rotateCopy,
  setPinned,
  setSavedCuts,
  stockRect,
  treeLines,
  updatePart,
  applyOptimizeResult,
  type Project,
} from "../../src/index.ts";
import { joinRowProject } from "../helpers.ts";

function savedRow(): Project {
  const project = joinRowProject();
  const ctx = planContext(project);
  const [analysis] = analyzeSheets(ctx);
  return setSavedCuts(project, "s1", treeLines(createTreeSearch(stockRect(analysis!.stock), analysis!.items, ctx.kerf, 0).run(4)!.tree));
}

const rail = { part: "rail", copy: 1 };

describe("saved cuts and layout edits", () => {
  const edits: [string, (project: Project) => Project][] = [
    ["a move", (p) => moveCopyTo(p, rail, 40.25, 20)],
    ["a nudge", (p) => nudgeCopy(p, rail, 0, 1)],
    ["a turn", (p) => rotateCopy(p, rail)],
    ["a move to the tray", (p) => moveToTray(p, rail)],
    ["an add", (p) => placeCopy(moveToTray(p, rail), rail, "s1", 40.25, 20, false)],
    ["a lower quantity", (p) => updatePart(p, "rail", { quantity: 1 })],
    ["a removed part", (p) => removePart(p, "rail")],
  ];
  it.each(edits)("removes the saved cuts after %s, and tells which sheet lost them", (_, edit) => {
    const before = savedRow();
    const after = edit(before);
    expect(after.plan!.sheets[0]!.savedCuts).toBeUndefined();
    expect(lostSavedCuts(before, after)).toEqual(["s1"]);
  });

  it("removes the saved cuts after Push to factory edges", () => {
    const moved = moveCopyTo(joinRowProject(), { part: "post", copy: 1 }, 60.375, 8);
    moved.settings.features.factoryEdges = true;
    moved.parts[0]!.factoryEdge = "long";
    const ctx = planContext(moved);
    const [analysis] = analyzeSheets(ctx);
    const before = setSavedCuts(moved, "s1", treeLines(createTreeSearch(stockRect(analysis!.stock), analysis!.items, ctx.kerf, 0).run(4)!.tree));
    const after = pushSheetToFactoryEdges(before, "s1");
    expect(after).not.toBe(before);
    expect(after.plan!.sheets[0]!.savedCuts).toBeUndefined();
  });

  it("keeps the saved cuts after a pin, and a removal of the saved cuts is no loss", () => {
    const before = savedRow();
    expect(setPinned(before, "s1", true).plan!.sheets[0]!.savedCuts).toHaveLength(6);
    const cleared = clearSavedCuts(before);
    expect(cleared.plan!.sheets[0]!.savedCuts).toBeUndefined();
    expect(lostSavedCuts(before, cleared)).toEqual([]);
    expect(clearSavedCuts(joinRowProject())).toEqual(joinRowProject());
  });

  it("keeps the saved cuts of a pinned sheet through Optimize layout", () => {
    const project = setPinned(savedRow(), "s1", true);
    const applied = applyOptimizeResult(project, optimize(project, { iterations: 5 }));
    expect(applied.plan!.sheets.find((sheet) => sheet.id === "s1")!.savedCuts).toHaveLength(6);
  });

  it("converts the lines with the units, and the check still passes", () => {
    for (const units of ["mm", "in"] as const) {
      const project = convertProjectUnits(units === "mm" ? savedRow() : convertProjectUnits(savedRow(), "mm"), units);
      expect(project.plan!.sheets[0]!.savedCuts).toHaveLength(6);
      expect(analyzeSheets(planContext(project))[0]!.savedCuts).toBe("used");
    }
  });
});
