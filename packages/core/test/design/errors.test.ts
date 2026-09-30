import { describe, expect, it } from "vitest";
import { convertProjectUnits, designErrors, type Design, type Project } from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";

const codes = (project: Project, design: Design) => designErrors(project, design).map((issue) => issue.code);

describe("designErrors", () => {
  it("finds nothing wrong with the KALLAX and EKET samples", () => {
    const project = designProject([kallaxDesign(), eketDesign()]);
    expect(codes(project, kallaxDesign())).toEqual([]);
    expect(codes(project, eketDesign())).toEqual([]);
  });

  it("reports a missing material or back material", () => {
    const project = designProject();
    const issues = designErrors(project, eketDesign({ material: "gone", back: { material: "lost" } }));
    expect(issues.map((issue) => [issue.severity, issue.code])).toEqual([
      ["error", "bad-ref"],
      ["error", "bad-ref"],
    ]);
    expect(issues[0]!.refs).toEqual([{ kind: "design", design: "ek" }]);
    expect(issues[1]!.message).toBe('Design "Wall EKET" uses material "lost", which does not exist.');
  });

  it("reports stock that is too thin for pocket screws, in either unit system", () => {
    const project = designProject();
    project.materials = [{ id: "ply18", name: "Thin ply", thickness: 11.8, grained: true }];
    expect(codes(project, kallaxDesign())).toEqual(["pocket-thickness"]);
    project.materials = [{ id: "ply18", name: "Metric 12", thickness: 12, grained: true }];
    expect(codes(project, kallaxDesign())).toEqual([]);
    const inches = convertProjectUnits(designProject(), "in");
    inches.materials = [{ id: "ply18", name: 'Plywood 1/2" (15/32 actual)', thickness: 0.46875, grained: true }];
    expect(codes(inches, inches.designs![0]!)).toEqual([]);
    inches.materials = [{ id: "ply18", name: "Plywood 7/16", thickness: 0.4375, grained: true }];
    expect(codes(inches, inches.designs![0]!)).toEqual(["pocket-thickness"]);
  });

  it("reports an outside size that leaves no room for the cells", () => {
    expect(codes(designProject(), eketDesign({ width: { outside: 30, cells: 1 } }))).toEqual(["design-too-small"]);
    expect(codes(designProject(), eketDesign({ depth: 6 }))).toEqual(["design-too-small"]);
  });

  it("reports a design that needs more than 10000 copies of one part", () => {
    const hundreds = { openings: Array.from({ length: 50 }, () => 100) };
    expect(codes(designProject(), kallaxDesign({ width: hundreds, height: hundreds, quantity: 5 }))).toEqual(["design-too-large"]);
  });

  it("reports a part that already uses a generated id", () => {
    const project = designProject();
    project.parts = [{ id: "kx-side", name: "Side", material: "ply18", length: 900, width: 300, quantity: 2, grain: "length" }];
    const issues = designErrors(project, kallaxDesign());
    expect(issues.map((issue) => issue.code)).toEqual(["design-conflict"]);
    expect(issues[0]!.refs).toEqual([
      { kind: "design", design: "kx" },
      { kind: "part", part: "kx-side", copy: 0 },
    ]);
  });

  it("does not report the design's own stored parts as a conflict", () => {
    const project = designProject();
    project.parts = [{ id: "kx-side", name: "Side", material: "ply18", length: 1394, width: 390, quantity: 2, grain: "length", design: "kx" }];
    expect(codes(project, kallaxDesign())).toEqual([]);
  });
});
