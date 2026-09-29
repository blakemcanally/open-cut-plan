import { describe, expect, it } from "vitest";
import { applyRun, keepSearchingRequest, optimize, optimizeRequest, setPinned } from "../../src/index.ts";
import { editSampleProject as sampleProject } from "../helpers.ts";

describe("optimizer runs", () => {
  it("'all' plans every copy again", () => {
    const project = sampleProject();
    const request = optimizeRequest(project, "all");
    expect(request.input).toBe(project);
    const result = optimize(request.input, { iterations: 5 });
    const applied = applyRun(request, result);
    expect(applied.plan!.sheets.flatMap((s) => s.placements)).toHaveLength(3);
  });

  it("'rest' keeps every sheet as it was and places only the unplaced copies", () => {
    const project = sampleProject();
    const request = optimizeRequest(project, "rest");
    expect(request.input.plan!.sheets.every((s) => s.pinned)).toBe(true);
    const applied = applyRun(request, optimize(request.input, { iterations: 5 }));
    expect(applied.plan!.sheets[0]).toBe(project.plan!.sheets[0]);
    expect(applied.plan!.sheets[0]).not.toHaveProperty("pinned");
    expect(applied.plan!.sheets).toHaveLength(2);
    expect(applied.plan!.sheets[1]!.placements.map((p) => p.part)).toEqual(["shelf"]);
  });

  it("keeps searching from the same request", () => {
    const request = optimizeRequest(setPinned(sampleProject(), "s1", true), "all");
    const result = optimize(request.input, { iterations: 3 });
    const more = keepSearchingRequest({ request, result, applied: applyRun(request, result) });
    expect(more.input).toBe(request.input);
    expect(more.start).toBe(result);
  });
});
