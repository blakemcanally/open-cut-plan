import { describe, expect, it } from "vitest";
import { analyzeProject, checkDesigns, convertProjectUnits, designParts, regenerateDesigns, validatePlan, type Design, type Project } from "../../src/index.ts";
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

  it("warns about an unknown kind and keeps the parts", () => {
    const project = designProject([kallaxDesign({ kind: "drawer", depth: 100 })]);
    const issues = checkDesigns(project);
    expect(issues.map((issue) => `${issue.severity}:${issue.code}`)).toEqual(["warning:design-unknown-kind"]);
    expect(issues[0]!.message).toBe('Design "Hall KALLAX" has the kind "drawer", which this app does not know. Its parts stay as they are.');
    expect(issues[0]!.refs).toEqual([{ kind: "design", design: "kx" }]);
    expect(designParts(project, project.designs![0]!)).toBeNull();
  });

  it("warns about an unknown mount", () => {
    expect(codes(current(kallaxDesign({ mount: "ceiling" })))).toEqual(["warning:design-unknown-mount"]);
  });

  it("warns when stock is thicker than the screw chart", () => {
    const project = designProject([eketDesign()]);
    project.materials = project.materials.map((m) => (m.id === "ply18" ? { ...m, thickness: 40 } : m));
    expect(codes(regenerateDesigns(project))).toEqual(["warning:pocket-chart"]);
  });

  it("gives no pocket-chart warning for face screws", () => {
    const project = designProject([
      { id: "sh", name: "Module", system: "custom", material: "ply18", width: { outside: 52.5, cells: 1 }, height: { outside: 40, cells: 4 }, depth: 16, corners: "sides-over-top", fastener: "face-screws" },
    ]);
    project.project.units = "in";
    project.materials = [{ id: "ply18", name: "Plywood 1 3/4", thickness: 1.75, grained: true }];
    expect(codes(regenerateDesigns(project))).not.toContain("warning:pocket-chart");
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
    const newer = { ...once, version: "1.13", designs: [kallaxDesign({ width: { openings: [335, 335, 335] } })] };
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
      'Design "Hall KALLAX" has a shelf (Shelf, columns 1–3) that spans 1041 mm with no support under it. A shelf longer than 810 mm in this stock can sag.',
    );
    expect(checkDesigns(current(kallax4x2([{ column: 2, row: 1, columns: 3, rows: 2 }])))[0]!.message).toBe(
      'Design "Hall KALLAX" has a top that spans 1041 mm with no support under it. A shelf longer than 810 mm in this stock can sag.',
    );
  });

  it("lets a back or the wall rail hold the dividers that stand on a long shelf", () => {
    const bottomRow = (patch: Partial<Design>) => kallaxDesign({ width: { openings: [335, 335, 335, 335] }, height: { openings: [335, 335] }, combined: [{ column: 1, row: 2, columns: 3, rows: 1 }], ...patch });
    expect(codes(current(bottomRow({ back: { material: "ply6" } })))).toEqual([]);
    expect(checkDesigns(current(bottomRow({ system: "eket", width: { outside: 1400, cells: 4 }, height: { outside: 700, cells: 2 }, depth: 350, mount: "wall-rail" })))[0]!.message).toBe(
      'Design "Hall KALLAX" hangs on the wall rail, so the floor does not hold the bottom. The bottom spans 1018.5 mm between two supports. A board longer than 810 mm in this stock can sag.',
    );
  });

  it("checks the bottom of a unit on legs or feet", () => {
    const wide = (patch: Partial<Design>) => kallaxDesign({ width: { openings: [335, 335, 335] }, height: { openings: [335] }, ...patch });
    expect(checkDesigns(current(wide({ mount: "legs" })))[0]!.message).toBe(
      'Design "Hall KALLAX" stands on legs, so the floor does not hold the bottom. The bottom spans 1041 mm between two supports. A board longer than 810 mm in this stock can sag. A back holds each divider in place, so that the dividers can hold up the bottom.',
    );
    expect(checkDesigns(current(wide({ mount: "feet" })))[0]!.message).toMatch(/^Design "Hall KALLAX" stands on feet, so the floor does not hold the bottom\./);
    expect(codes(current(wide({ mount: "legs", back: { material: "ply6" } })))).toEqual([]);
    expect(codes(current(wide({ mount: "floor" })))).toEqual([]);
    expect(codes(current(wide({ mount: "legs", width: { openings: [335, 335] } })))).toEqual([]);
  });

  it("treats the bottom on cleats as lifted", () => {
    const wide = kallaxDesign({ id: "x", name: "X", system: "custom", width: { outside: 1500, cells: 1 }, height: { outside: 400, cells: 1 }, mount: "cleats" });
    expect(checkDesigns(current(wide))[0]!.message).toMatch(/^Design "X" stands on cleats, so the floor/);
  });

  it("gives no mount-system warning for cleats on kallax", () => {
    expect(codes(current(kallaxDesign({ mount: "cleats" })))).toEqual([]);
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

describe("the nominal-thickness check", () => {
  function inches(design: Design, materials: Record<string, { name: string; thickness: number; measured?: boolean }>): Project {
    const project = convertProjectUnits(regenerateDesigns(designProject([design])), "in");
    return regenerateDesigns({ ...project, materials: project.materials.map((m) => (materials[m.id] ? { ...m, ...materials[m.id] } : m)) });
  }
  const nominal = (project: Project) => checkDesigns(project).filter((issue) => issue.code === "nominal-thickness");

  it("warns about the box material and gives the error across the axis with more panels", () => {
    const issues = nominal(inches(kallaxDesign(), { ply18: { name: "Plywood 3/4", thickness: 0.75 } }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: "warning", refs: [{ kind: "design", design: "kx" }] });
    expect(issues[0]!.message).toBe(
      'Design "Hall KALLAX" uses Plywood 3/4 at 3/4", a nominal thickness. If the stock is 45/64", the error across the height adds up to 15/64". Measure the stock, or pick its thickness on the Stock tab.',
    );
  });

  it("gives the error across the width for a design with outside sizes", () => {
    const issues = nominal(inches(eketDesign(), { ply18: { name: "Plywood 3/4", thickness: 0.75 } }));
    expect(issues[0]!.message).toContain("the error across the width adds up to 9/64\".");
  });

  it("warns about the back, with the error in the depth", () => {
    const issues = nominal(inches(eketDesign(), { ply6: { name: "Back 1/4", thickness: 0.25 } }));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toBe(
      'Design "Wall EKET" has a back of Back 1/4 at 1/4", a nominal thickness. If the stock is 3/16", the depth of the box is off by 1/16". Measure the stock, or pick its thickness on the Stock tab.',
    );
  });

  it("gives nothing for measured stock, actual stock, or a millimetre project", () => {
    expect(nominal(inches(kallaxDesign(), { ply18: { name: "Plywood 3/4", thickness: 0.75, measured: true } }))).toEqual([]);
    expect(nominal(inches(kallaxDesign(), { ply18: { name: "Plywood 3/4", thickness: 45 / 64 } }))).toEqual([]);
    expect(nominal(current(kallaxDesign()))).toEqual([]);
  });
});

describe("the corners, the fastener, and the hidden warnings of a design", () => {
  const wide = (patch: Partial<Design> = {}) => kallaxDesign({ system: "custom", width: { openings: [1500] }, height: { openings: [335] }, ...patch });
  const codesOf = (project: Project, options?: { keepHidden?: boolean }) => checkDesigns(project, options).map((issue) => issue.code);

  it("gives design-unknown-corners and no parts for an unknown corners value", () => {
    const project = designProject([kallaxDesign({ corners: "mitred", depth: 100 })]);
    const issues = checkDesigns(project);
    expect(issues.map((issue) => `${issue.severity}:${issue.code}`)).toEqual(["warning:design-unknown-corners"]);
    expect(issues[0]!.message).toBe('Design "Hall KALLAX" has the corners "mitred", which this app does not know. Its parts stay as they are.');
    expect(issues[0]!.refs).toEqual([{ kind: "design", design: "kx" }]);
    expect(designParts(project, project.designs![0]!)).toBeNull();
  });

  it("gives design-unknown-fastener and no parts for an unknown fastener value", () => {
    const project = designProject([kallaxDesign({ fastener: "nails", depth: 100 })]);
    const issues = checkDesigns(project);
    expect(issues.map((issue) => `${issue.severity}:${issue.code}`)).toEqual(["warning:design-unknown-fastener"]);
    expect(issues[0]!.message).toBe('Design "Hall KALLAX" uses the fastener "nails", which this app does not know. Its parts stay as they are.');
    expect(issues[0]!.refs).toEqual([{ kind: "design", design: "kx" }]);
    expect(designParts(project, project.designs![0]!)).toBeNull();
  });

  it("reports the unknown corners before the unknown fastener", () => {
    expect(codesOf(designProject([kallaxDesign({ corners: "mitred", fastener: "nails" })]))).toEqual(["design-unknown-corners"]);
  });

  it("drops a hidden warning and keeps it with keepHidden", () => {
    const project = current(wide({ hiddenWarnings: ["shelf-span"] }));
    expect(codesOf(project)).toEqual([]);
    expect(codesOf(project, { keepHidden: true })).toEqual(["shelf-span"]);
    expect(codesOf(current(wide()))).toEqual(["shelf-span"]);
  });

  it("never drops an error", () => {
    const project = designProject([kallaxDesign({ material: "ply6", hiddenWarnings: ["pocket-thickness"] })]);
    expect(codes(project)).toEqual(["error:pocket-thickness"]);
  });

  it("drops only the warnings of the design that hides them", () => {
    const project = current(wide({ id: "a", name: "A", hiddenWarnings: ["shelf-span"] }), wide({ id: "b", name: "B" }));
    expect(checkDesigns(project).map((issue) => issue.refs)).toEqual([[{ kind: "design", design: "b" }]]);
    expect(checkDesigns(project, { keepHidden: true })).toHaveLength(2);
  });
});
