import { describe, expect, it } from "vitest";
import {
  assemblyDrawings,
  assemblySteps,
  checkDesigns,
  createProject,
  designElevationSvg,
  designErrors,
  designGeometry,
  designParts,
  designSheetEstimate,
  hardwareList,
  materialsById,
  openBoxPocketHoles,
  regenerateDesigns,
  type Design,
  type Project,
  type Units,
} from "../../src/index.ts";

function openBoxProject(units: Units, thickness: number, size: { width: number; height: number; depth: number }, patch: Partial<Design> = {}): Project {
  const base = createProject("Crate", units);
  const design: Design = {
    id: "crate",
    name: "Crate",
    kind: "open-box",
    system: "kallax",
    material: "ply",
    width: { outside: size.width, cells: 1 },
    height: { outside: size.height, cells: 1 },
    depth: size.depth,
    ...patch,
  };
  const sheet = units === "in" ? { length: 96, width: 48 } : { length: 2440, width: 1220 };
  return regenerateDesigns({
    ...base,
    materials: [{ id: "ply", name: "Plywood", thickness, grained: true, measured: true }],
    stock: [{ id: "ply-sheet", material: "ply", ...sheet, quantity: null, cost: 80, kind: "sheet" }],
    parts: [],
    designs: [design],
  });
}

const crate = (patch: Partial<Design> = {}) => openBoxProject("in", 23 / 32, { width: 12.5, height: 12.5, depth: 13.5 }, patch);
const metric = (size = { width: 318, height: 318, depth: 343 }, patch: Partial<Design> = {}) => openBoxProject("mm", 18, size, patch);
const design = (project: Project) => project.designs![0]!;
const parts = (project: Project) => designParts(project, design(project))!;
const geometry = (project: Project) => designGeometry(design(project), materialsById(project))!;
const codes = (project: Project) => designErrors(project, design(project)).map((issue) => issue.code);

describe("the parts of an open-top box", () => {
  it("makes the parts of the built crate", () => {
    expect(parts(crate()).map((p) => [p.name, p.length, p.width, p.quantity])).toEqual([
      ["Front", 12.5, 12.5, 1],
      ["Back", 12.5, 12.5, 1],
      ["Side", 12.0625, 12.5, 2],
      ["Bottom", 11.0625, 12.0625, 1],
    ]);
    expect(parts(crate()).map((p) => [p.id, p.group, p.design, p.grain])).toEqual(
      ["front", "back", "side", "bottom"].map((id) => [`crate-${id}`, "Crate", "crate", "length"]),
    );
  });

  it("keeps the outside size when the thickness changes", () => {
    const thin = openBoxProject("in", 0.5, { width: 12.5, height: 12.5, depth: 13.5 });
    expect(parts(thin).map((p) => [p.name, p.length, p.width, p.quantity])).toEqual([
      ["Front", 12.5, 12.5, 1],
      ["Back", 12.5, 12.5, 1],
      ["Side", 12.5, 12.5, 2],
      ["Bottom", 11.5, 12.5, 1],
    ]);
  });

  it("doubles the parts and the screws for a quantity of 2", () => {
    const project = crate({ quantity: 2 });
    expect(parts(project).map((p) => p.quantity)).toEqual([2, 2, 4, 2]);
    expect(hardwareList(project)[0]!.quantity).toBe(53);
  });

  it("makes the same parts in millimetres", () => {
    expect(parts(metric()).map((p) => [p.name, p.length, p.width])).toEqual([
      ["Front", 318, 318],
      ["Back", 318, 318],
      ["Side", 307, 318],
      ["Bottom", 282, 307],
    ]);
  });

  it("estimates the sheets for the parts", () => {
    expect(designSheetEstimate(crate(), design(crate()))).toEqual([expect.objectContaining({ material: "ply", sheets: 1, unplaced: 0 })]);
  });
});

describe("the hardware of an open-top box", () => {
  it("counts 24 pocket holes and 27 screws of 1 1/4\" for the crate", () => {
    const project = crate();
    expect(openBoxPocketHoles(geometry(project), "in")).toEqual({ sideEnd: 3, bottomFrontBack: 3, bottomSide: 3, total: 24 });
    const lines = hardwareList(project);
    expect(lines.map((line) => [line.item, line.quantity])).toEqual([
      ["pocket-screws", 27],
      ["glue", null],
    ]);
    expect(lines[0]!.name).toBe('Pocket screws, coarse thread, 1 1/4" (32 mm)');
  });

  it("gives no hardware for an open-top box that a field refuses", () => {
    expect(hardwareList(crate({ back: { material: "ply" }, mount: "legs" }))).toEqual([]);
  });
});

describe("the errors of an open-top box", () => {
  it.each<[string, Partial<Design>, string]>([
    ["back", { back: { material: "ply" } }, "has no back"],
    ["mount", { mount: "floor" }, "has no mount"],
    ["combined", { combined: [{ column: 1, row: 1, columns: 1, rows: 1 }] }, "has no combined cells"],
    ["eket", { system: "eket" }, "Use the system kallax or custom"],
    ["openings", { width: { openings: [300] } }, "Give its width and height as outside sizes with 1 cell"],
    ["cells", { height: { outside: 318, cells: 2 } }, "Give its width and height as outside sizes with 1 cell"],
  ])("refuses an open-top box with %s", (_what, patch, text) => {
    const project = metric(undefined, patch);
    const issues = designErrors(project, design(project));
    expect(issues.map((issue) => issue.code)).toEqual(["design-open-box"]);
    expect(issues[0]!.message).toContain(`Design "Crate" is an open-top box`);
    expect(issues[0]!.message).toContain(text);
    expect(issues[0]!.refs).toEqual([{ kind: "design", design: "crate" }]);
    expect(designParts(project, design(project))).toBeNull();
  });

  it.each([
    [1.4, 12.5, 13.5],
    [12.5, 0.7, 13.5],
    [12.5, 12.5, 1.4],
  ])("is too small at %s × %s × %s", (width, height, depth) => {
    const project = openBoxProject("in", 23 / 32, { width, height, depth });
    const issues = designErrors(project, design(project));
    expect(issues.map((issue) => issue.code)).toEqual(["design-too-small"]);
    expect(issues[0]!.message).toBe('Design "Crate" is too small: the walls leave no room inside.');
    expect(designSheetEstimate(project, design(project))).toBeNull();
  });

  it("keeps the thickness, size, and conflict errors of today", () => {
    const thin = openBoxProject("mm", 11, { width: 318, height: 318, depth: 343 });
    expect(codes(thin)).toEqual(["pocket-thickness"]);
    const taken = metric();
    taken.parts = [{ ...taken.parts[0]!, design: undefined }, ...taken.parts.slice(1)];
    expect(codes(taken)).toEqual(["design-conflict"]);
    expect(codes(metric(undefined, { quantity: 5001 }))).toEqual(["design-too-large"]);
  });
});

describe("the checks of an open-top box", () => {
  it("gives no warning for the crate in in and in mm", () => {
    expect(checkDesigns(crate())).toEqual([]);
    expect(checkDesigns(metric())).toEqual([]);
  });

  it.each([
    ["width", { width: 334, height: 318, depth: 343 }, /1 mm too wide.*334 mm wide.*333 mm/],
    ["height", { width: 318, height: 334, depth: 343 }, /1 mm too tall.*334 mm tall.*333 mm/],
    ["depth", { width: 318, height: 318, depth: 391 }, /1 mm too deep.*391 mm deep.*390 mm/],
  ])("warns when the %s is over the KALLAX limit", (_which, size, text) => {
    const issues = checkDesigns(metric(size));
    expect(issues.map((issue) => [issue.severity, issue.code])).toEqual([["warning", "kallax-fit"]]);
    expect(issues[0]!.message).toMatch(text);
    expect(issues[0]!.message).toContain('Design "Crate" is ');
    expect(issues[0]!.message).toContain("for a KALLAX-style cube");
    expect(issues[0]!.refs).toEqual([{ kind: "design", design: "crate" }]);
  });

  it("never says a zero excess in inches", () => {
    const issues = checkDesigns(openBoxProject("in", 23 / 32, { width: 13.125, height: 12.5, depth: 13.5 }));
    expect(issues.map((issue) => issue.code)).toEqual(["kallax-fit"]);
    expect(issues[0]!.message).toBe('Design "Crate" is 1/32" too wide for a KALLAX-style cube: it is 13 1/8" wide, and the most that fits is ~13 1/8".');
  });

  it("warns once for each size over its limit", () => {
    const issues = checkDesigns(metric({ width: 400, height: 400, depth: 400 }));
    expect(issues.map((issue) => issue.code)).toEqual(["kallax-fit", "kallax-fit", "kallax-fit"]);
  });

  it("gives no fit warning at the limit, or for the system custom", () => {
    expect(checkDesigns(metric({ width: 333, height: 333, depth: 390 }))).toEqual([]);
    expect(checkDesigns(metric({ width: 400, height: 400, depth: 500 }, { system: "custom" }))).toEqual([]);
  });

  it("runs none of the shelf checks", () => {
    const issues = checkDesigns(metric({ width: 900, height: 318, depth: 343 }));
    expect(issues.map((issue) => issue.code)).toEqual(["kallax-fit"]);
  });

  it("warns about a nominal thickness and about stock that the pocket chart lacks", () => {
    const project = crate();
    project.materials = [{ id: "ply", name: "Plywood", thickness: 0.75, grained: true }];
    expect(checkDesigns(regenerateDesigns(project)).map((issue) => issue.code)).toEqual(["nominal-thickness"]);
    project.materials = [{ id: "ply", name: "Plywood", thickness: 1.75, grained: true, measured: true }];
    expect(checkDesigns(regenerateDesigns(project)).map((issue) => issue.code)).toEqual(["pocket-chart"]);
  });

  it("warns when the stored parts are stale", () => {
    const project = crate();
    project.parts = project.parts.slice(1);
    expect(checkDesigns(project).map((issue) => issue.code)).toEqual(["design-stale"]);
  });
});

describe("the assembly of an open-top box before its steps exist", () => {
  it("gives no steps, no drawings, and no elevation, and does not throw", () => {
    const project = crate();
    expect(assemblySteps(project, "crate")).toBeNull();
    expect(assemblyDrawings(project, "crate")).toBeNull();
    expect(designElevationSvg(project, "crate")).toBeNull();
  });
});
