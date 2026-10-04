import { describe, expect, it } from "vitest";
import { analyzeProject, planAlert, type Project } from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

function alertOf(project: Project) {
  const { context, issues } = analyzeProject(project);
  return planAlert(context, issues);
}

describe("planAlert", () => {
  it("is null for a plan with no errors and every part placed", () => {
    expect(alertOf(sampleProject())).toBeNull();
  });

  it("names the parts with a layout error, and does not count their errors again", () => {
    const project = sampleProject();
    project.plan!.sheets[0]!.placements[1]!.y = 5;
    expect(alertOf(project)).toEqual({
      severity: "error",
      errors: 1,
      blocked: ["Side 1", "Side 2"],
      unplaced: [],
      text: "The plan is not ready to cut. 2 parts have a layout error: Side 1 and Side 2.",
    });
  });

  it("is a warning that names the parts that are not on a sheet", () => {
    const project = sampleProject();
    project.parts.push({ id: "door", name: "Door", material: "ply", length: 20, width: 10, quantity: 1, grain: "none" });
    expect(alertOf(project)).toEqual({
      severity: "warning",
      errors: 0,
      blocked: [],
      unplaced: ["Door"],
      text: "The plan is not ready to cut. 1 part is not on a sheet: Door.",
    });
  });

  it("counts the errors that name no part, and shortens a long list of parts", () => {
    const project = sampleProject();
    project.tools = [];
    project.parts.push({ id: "shelf", name: "Shelf", material: "ply", length: 10, width: 5, quantity: 7, grain: "none" });
    const alert = alertOf(project)!;
    expect(alert.severity).toBe("error");
    expect(alert.text).toBe("The plan is not ready to cut. 7 parts are not on a sheet: Shelf 1, Shelf 2, Shelf 3, Shelf 4, Shelf 5, and 2 more. The plan has 1 other error.");
    project.parts.pop();
    expect(alertOf(project)!.text).toBe("The plan is not ready to cut. The plan has 1 error.");
  });
});
