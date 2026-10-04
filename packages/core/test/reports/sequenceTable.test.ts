import { describe, expect, it } from "vitest";
import { analyzeProject, sequenceRows, type Project } from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

function rows(project: Project) {
  const analysis = analyzeProject(project);
  return sequenceRows(analysis.context, analysis.steps);
}

describe("sequenceRows", () => {
  it("gives the tool, the fence or stop setting, and the parts that each cut makes free", () => {
    expect(rows(sampleProject())).toEqual([
      { step: 1, sheetNumber: 1, tool: "ts", toolName: "Table saw", setting: 'Trim 1/4" off the top', parts: [], warning: false },
      { step: 2, sheetNumber: 1, tool: "ts", toolName: "Table saw", setting: 'Trim 1/4" off the bottom', parts: [], warning: false },
      { step: 3, sheetNumber: 1, tool: "ts", toolName: "Table saw", setting: 'Trim 1/4" off the left', parts: [], warning: false },
      { step: 4, sheetNumber: 1, tool: "ts", toolName: "Table saw", setting: 'Trim 1/4" off the right', parts: [], warning: false },
      { step: 5, sheetNumber: 1, tool: "ts", toolName: "Table saw", setting: 'Stop 30"', parts: [], warning: false },
      { step: 6, sheetNumber: 1, tool: "ts", toolName: "Table saw", setting: 'Fence 12"', parts: ["Side 1"], warning: false },
      { step: 7, sheetNumber: 1, tool: "ts", toolName: "Table saw", setting: 'Fence 12"', parts: ["Side 2"], warning: false },
    ]);
  });

  it("gives a mark from an edge for a track saw", () => {
    const project = sampleProject();
    project.tools = [{ id: "tr", name: "Track saw", type: "track-saw", kerf: 0.125, enabled: true }];
    expect(rows(project).slice(4).map((row) => [row.toolName, row.setting])).toEqual([
      ["Track saw", 'Mark 30" from the left'],
      ["Track saw", 'Mark 12" from the top'],
      ["Track saw", 'Mark 12" from the top'],
    ]);
  });

  it("gives a stop for a mitre saw", () => {
    const analysis = analyzeProject(sampleProject());
    const miter = { id: "ms", name: "Mitre saw", type: "miter-saw" as const, kerf: 0.125, enabled: true };
    const steps = analysis.steps.map((step) => ({ ...step, tool: miter }));
    expect(sequenceRows(analysis.context, steps).slice(4).map((row) => row.setting)).toEqual(['Stop 30"', 'Stop 12"', 'Stop 12"']);
  });

  it("says No tool and warns for a cut that no enabled tool can make", () => {
    const project = sampleProject();
    project.tools[0]!.enabled = false;
    expect(rows(project)[5]).toMatchObject({ tool: null, toolName: "No tool", warning: true, parts: ["Side 1"] });
  });
});
