import { describe, expect, it } from "vitest";
import { convertProjectUnits, defaultTools, describeStep, parseProject, planContext, sequencePlan, serializeProject, setToolChoice, withCuts, type Project } from "../../src/index.ts";
import { sampleProject, stripProject } from "../helpers.ts";

function twoTools(): Project {
  const project = stripProject();
  project.tools.push({ id: "track", name: "Track saw", type: "track-saw", kerf: 0.125, enabled: true });
  return project;
}

const rip = (project: Project) => sequencePlan(project)[4]!;

describe("tool choices", () => {
  it("uses the chosen tool, and the recommended tool again when the choice is removed", () => {
    const project = twoTools();
    expect(rip(project)).toMatchObject({ tool: { id: "ts" }, recommended: { id: "ts" }, chosen: false, overLimit: null });
    const chosen = setToolChoice(project, rip(project), "track");
    expect(chosen.plan!.sheets[0]!.toolChoices).toEqual([{ axis: "y", at: rip(project).at, from: 0.25, to: 95.75, tool: "track" }]);
    expect(rip(chosen)).toMatchObject({ tool: { id: "track" }, recommended: { id: "ts" }, chosen: true, side: "released", setting: 12 });
    expect(describeStep(planContext(chosen), rip(chosen)).actions[0]).toBe('Mark 12" from the top edge, at the two ends of the cut.');
    expect(sequencePlan(chosen).filter((step) => step.chosen)).toHaveLength(1);
    expect(setToolChoice(chosen, rip(chosen), "ts").plan!.sheets[0]).not.toHaveProperty("toolChoices");
    expect(setToolChoice(chosen, rip(chosen), null).plan!.sheets[0]).not.toHaveProperty("toolChoices");
  });

  it("names the limit that a chosen tool is over and warns first", () => {
    const project = sampleProject();
    project.tools = defaultTools("in");
    expect(sequencePlan(project)[0]).toMatchObject({ tool: { id: "track-saw" }, overLimit: null });
    const chosen = setToolChoice(project, sequencePlan(project)[0]!, "table-saw");
    const step = sequencePlan(chosen)[0]!;
    expect(step).toMatchObject({ tool: { id: "table-saw" }, chosen: true, overLimit: "maxPiece" });
    expect(describeStep(planContext(chosen), step).actions).toEqual(['This cut is over a limit of the Table saw: largest piece 96" × 24".', 'Cut 1/4" off the top edge.']);

    const narrow = twoTools();
    narrow.tools[0] = { id: "ts", name: "Table saw", type: "table-saw", kerf: 0.125, enabled: true, maxRip: 10 };
    expect(rip(narrow)).toMatchObject({ tool: { id: "track" }, recommended: { id: "track" } });
    const forced = setToolChoice(narrow, rip(narrow), "ts");
    expect(rip(forced)).toMatchObject({ tool: { id: "ts" }, overLimit: "maxRip", side: "released" });
    expect(describeStep(planContext(forced), rip(forced)).actions[0]).toBe('This cut is over a limit of the Table saw: widest rip 10".');
  });

  it("ignores a choice of a tool that is turned off, and keeps it in the file", () => {
    const chosen = setToolChoice(twoTools(), rip(twoTools()), "track");
    chosen.tools[1]!.enabled = false;
    expect(rip(chosen)).toMatchObject({ tool: { id: "ts" }, chosen: false });
    expect(withCuts(chosen).plan!.sheets[0]!.toolChoices).toHaveLength(1);
  });

  it("drops a choice that matches no cut when it saves, and warns about an unknown tool", () => {
    const moved = setToolChoice(twoTools(), rip(twoTools()), "track");
    moved.plan!.sheets[0]!.placements[1]!.y = 20;
    moved.plan!.sheets[0]!.placements[0]!.y = 3;
    expect(withCuts(moved).plan!.sheets[0]).not.toHaveProperty("toolChoices");
    const off = setToolChoice(twoTools(), rip(twoTools()), "track");
    off.settings.features.cutOrder = false;
    expect(withCuts(off).plan!.sheets[0]!.toolChoices).toHaveLength(1);
    const unknown = setToolChoice(twoTools(), rip(twoTools()), "track");
    unknown.tools.pop();
    const result = parseProject(serializeProject(unknown));
    expect(result.ok && result.warnings.some((issue) => issue.code === "bad-ref" && issue.path.join(".") === "plan.sheets.0.toolChoices.0.tool")).toBe(true);
  });

  it("converts the choices with the units, and reads a 1.2 file", () => {
    const chosen = setToolChoice(twoTools(), rip(twoTools()), "track");
    const mm = convertProjectUnits(chosen, "mm");
    expect(mm.plan!.sheets[0]!.toolChoices![0]).toMatchObject({ from: 6.35, to: 2432.05, tool: "track" });
    expect(rip(mm)).toMatchObject({ tool: { id: "track" }, chosen: true });
    const old = JSON.parse(serializeProject(sampleProject()));
    old.version = "1.2";
    const result = parseProject(JSON.stringify(old));
    expect(result.ok && result.project.version).toBe("1.3");
  });
});
