import { describe, expect, it } from "vitest";
import { analyzeProject, checkDesigns, convertProjectUnits, regenerateDesigns, validatePlan, type Design, type Project } from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";

const codes = (project: Project) => checkDesigns(project).map((issue) => `${issue.severity}:${issue.code}`);
const current = (...designs: Design[]) => regenerateDesigns(designProject(designs));

describe("checkDesigns", () => {
  it("finds nothing wrong with current KALLAX and EKET designs", () => {
    expect(codes(current(kallaxDesign(), eketDesign()))).toEqual([]);
  });

  it("includes the errors that stop a design, and skips its warnings", () => {
    expect(codes(current(kallaxDesign({ material: "gone", width: { openings: [100] } })))).toEqual(["error:bad-ref"]);
  });

  it("warns about an unknown system and skips the other checks", () => {
    const issues = checkDesigns(designProject([kallaxDesign({ system: "pax", depth: 100 })]));
    expect(issues.map((issue) => issue.code)).toEqual(["design-unknown-system"]);
    expect(issues[0]!.refs).toEqual([{ kind: "design", design: "kx" }]);
  });

  it("warns about an unknown mount", () => {
    expect(codes(current(kallaxDesign({ mount: "ceiling" })))).toEqual(["warning:design-unknown-mount"]);
  });

  it("warns when stock is thicker than the screw chart", () => {
    const project = designProject([eketDesign()]);
    project.materials = project.materials.map((m) => (m.id === "ply18" ? { ...m, thickness: 40 } : m));
    expect(codes(regenerateDesigns(project))).toEqual(["warning:pocket-chart"]);
  });

  it("has a screw for stock of exactly 1 1/2 inches", () => {
    const project = designProject([eketDesign({ system: "custom" })]);
    project.materials = project.materials.map((m) => (m.id === "ply18" ? { ...m, thickness: 38.1 } : m));
    expect(codes(regenerateDesigns(project))).not.toContain("warning:pocket-chart");
    const inches = convertProjectUnits(regenerateDesigns(project), "in");
    expect(inches.materials.find((m) => m.id === "ply18")!.thickness).toBe(1.5);
    expect(codes(inches)).not.toContain("warning:pocket-chart");
  });

  it("gives no stale warning for a file from a newer minor version", () => {
    const once = current(kallaxDesign());
    const newer = { ...once, version: "1.9", designs: [kallaxDesign({ width: { openings: [335, 335, 335] } })] };
    expect(codes(newer)).toEqual([]);
  });

  it("warns when a KALLAX cell is too small for the inserts, or the panels are too shallow for the boxes", () => {
    expect(codes(current(kallaxDesign({ width: { openings: [331, 335] } })))).toEqual(["warning:kallax-opening"]);
    expect(codes(current(kallaxDesign({ width: { openings: [332, 335] } })))).toEqual([]);
    expect(codes(current(kallaxDesign({ depth: 379 })))).toEqual(["warning:kallax-depth"]);
    const message = checkDesigns(current(kallaxDesign({ height: { openings: [320, 335, 335, 335] } })))[0]!.message;
    expect(message).toBe('Design "Hall KALLAX" has a cell of 320 mm. KALLAX inserts need at least 332 mm.');
  });

  it("warns when an EKET design is off the 350 mm grid or has another depth", () => {
    expect(codes(current(eketDesign({ width: { outside: 600, cells: 2 } })))).toEqual(["warning:eket-grid"]);
    expect(codes(current(eketDesign({ depth: 300 })))).toEqual(["warning:eket-grid"]);
    expect(codes(current(eketDesign({ depth: 250 })))).toEqual([]);
    expect(codes(current(eketDesign({ width: { outside: 700.5, cells: 2 } })))).toEqual([]);
  });

  it("warns about a shelf that can sag", () => {
    expect(codes(current(kallaxDesign({ system: "custom", width: { openings: [811] } })))).toEqual(["warning:shelf-span"]);
    expect(codes(current(kallaxDesign({ system: "custom", width: { openings: [810] } })))).toEqual([]);
    expect(checkDesigns(current(kallaxDesign({ system: "custom", width: { openings: [335, 811] } })))[0]!.message).toBe(
      'Design "Hall KALLAX" has a shelf of 811 mm. A shelf longer than 810 mm in this stock can sag.',
    );
  });

  it("checks the free span of a long shelf and of the top, with the dividers under them as the only supports", () => {
    const kallax4x2 = (combined: Design["combined"]) => kallaxDesign({ width: { openings: [335, 335, 335, 335] }, height: { openings: [335, 335] }, combined });
    expect(codes(current(kallax4x2([{ column: 1, row: 1, columns: 2, rows: 1 }])))).toEqual([]);
    expect(codes(current(kallax4x2([{ column: 1, row: 2, columns: 2, rows: 1 }])))).toEqual([]);
    expect(codes(current(kallax4x2([{ column: 1, row: 1, columns: 3, rows: 1 }])))).toEqual(["warning:shelf-span"]);
    expect(checkDesigns(current(kallax4x2([{ column: 1, row: 2, columns: 3, rows: 1 }])))[0]!.message).toBe(
      'Design "Hall KALLAX" has a shelf (Shelf, columns 1–3) that spans 1041 mm with no divider under it. A shelf longer than 810 mm in this stock can sag.',
    );
    expect(checkDesigns(current(kallax4x2([{ column: 2, row: 1, columns: 3, rows: 2 }])))[0]!.message).toBe(
      'Design "Hall KALLAX" has a top that spans 1041 mm with no divider under it. A shelf longer than 810 mm in this stock can sag.',
    );
  });

  it("warns when a design other than EKET uses the EKET wall rail", () => {
    expect(codes(current(kallaxDesign({ mount: "wall-rail" })))).toEqual(["warning:mount-system"]);
  });

  it("warns when the stored parts do not match the design", () => {
    const once = current(kallaxDesign());
    const edited = { ...once, parts: once.parts.map((p) => (p.id === "kx-side" ? { ...p, length: 1400 } : p)) };
    expect(codes(edited)).toEqual(["warning:design-stale"]);
    expect(codes(designProject())).toEqual(["warning:design-stale"]);
  });

  it("joins the project analysis and the plan validator", () => {
    const project = current(eketDesign({ width: { outside: 30, cells: 1 } }));
    expect(analyzeProject(project).issues.map((issue) => issue.code)).toContain("design-too-small");
    expect(validatePlan(project).map((issue) => issue.code)).toContain("design-too-small");
  });
});
