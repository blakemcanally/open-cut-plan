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
    ["mount", { mount: "legs" }, "has no mount other than the floor"],
    ["corners", { corners: "sides-over-top" }, "has no corners setting"],
    ["fastener", { fastener: "face-screws" }, "has no fastener setting"],
    ["cleats", { mount: "cleats" }, "has no mount other than the floor"],
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

  it.each<Partial<Design>>([{ corners: "top-over-sides" }, { fastener: "pocket-screws" }, { corners: "top-over-sides", fastener: "pocket-screws", mount: "floor" }])(
    "accepts the default corners and the default fastener, which mean the same as no value: %j",
    (patch) => {
      const project = crate(patch);
      expect(codes(project)).toEqual([]);
      expect(designParts(project, design(project))).toEqual(designParts(crate(), design(crate())));
      expect(assemblySteps(project, "crate")).not.toBeNull();
    },
  );

  it("accepts the mount floor, which is the default", () => {
    const project = crate({ mount: "floor" });
    expect(codes(project)).toEqual([]);
    expect(designParts(project, design(project))).not.toBeNull();
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
    expect(issues[0]!.message).toBe('Design "Crate" is 1/32" too wide for a KALLAX-style cube: it is 13 1/8" wide, and the most that fits is 13 3/32".');
  });

  it("shows a limit that is below a size that is over it", () => {
    const project = openBoxProject("in", 23 / 32, { width: 13.1105, height: 12.5, depth: 13.5 });
    const issues = checkDesigns(project);
    expect(issues[0]!.message).toBe('Design "Crate" is 1/32" too wide for a KALLAX-style cube: it is ~13 1/8" wide, and the most that fits is 13 3/32".');
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

describe("the assembly steps of an open-top box", () => {
  const steps = (project: Project) => assemblySteps(project, "crate")!;

  it("gives the crate four steps, then its finish steps", () => {
    const finished = crate({ finish: ["Sand lightly.", "Oil it."] });
    expect(steps(finished).map((s) => s.action)).toEqual(["drill", "join", "square", "join", "finish", "finish"]);
    expect(steps(crate()).map((s) => s.action)).toEqual(["drill", "join", "square", "join"]);
  });

  it("names the holes of the crate in the drill step", () => {
    const body = steps(crate())[0]!.body;
    expect(body).toMatch(/3 pocket holes in each end of the 2 sides, on the inside face/);
    expect(body).toMatch(/3 pocket holes along the front edge and the back edge of the bottom, and 3 along each side edge, on the underside/);
    expect(body).toContain('23/32" stock.');
    expect(body).toContain('Set the jig and the drill collar to the 3/4" mark.');
    expect(body).not.toMatch(/Build/);
  });

  it("starts with the build sentence for a quantity of 2", () => {
    expect(steps(crate({ quantity: 2 }))[0]!.body).toMatch(/^Build 2 of these\. The numbers in these steps are for one unit\. Drill 3 pocket holes/);
  });

  it("joins the walls with the chart screws, squares the top opening, and fits the bottom", () => {
    const [, walls, square, bottom] = steps(crate());
    expect(walls!.body).toContain("flush with the top edge and the bottom edge");
    expect(walls!.body).toContain('1 1/4" (32 mm) coarse-thread pocket screws');
    expect(square!.body).toBe("Measure the two diagonals of the top opening. Both must be ~18 13/32\". If they are not the same, push the long diagonal in until they are.");
    expect(bottom!.body).toContain("flush with their lower edges, with the pocket holes down");
    expect(steps(metric())[2]!.body).toContain("Both must be ~467.5 mm.");
  });

  it("names the boards of each step", () => {
    expect(steps(crate()).map((s) => s.boards!.map((board) => board.kind === "side" ? `side-${board.side}` : board.kind))).toEqual([
      ["side-left", "side-right", "bottom"],
      ["front", "back", "side-left", "side-right"],
      [],
      ["bottom"],
    ]);
  });

  it("has no anchor, mount, or back step", () => {
    const all = steps(crate({ finish: ["Sand lightly."] }));
    expect(all.map((s) => s.action)).not.toContain("anchor");
    expect(all.map((s) => s.action)).not.toContain("mount");
    expect(all.map((s) => s.title)).not.toContain("Fit the back");
  });

  it.each<Partial<Design>>([{ corners: "sides-over-top" }, { fastener: "face-screws" }, { mount: "cleats" }])(
    "gives no parts, steps, drawings, or front view for an open-top box with %j",
    (patch) => {
      const project = crate(patch);
      expect(codes(project)).toEqual(["design-open-box"]);
      expect(designParts(project, design(project))).toBeNull();
      expect(assemblySteps(project, "crate")).toBeNull();
      expect(assemblyDrawings(project, "crate")).toBeNull();
      expect(designElevationSvg(project, "crate")).toBeNull();
    },
  );

  it("gives no steps, no drawings, and no front view for an open-top box with an error", () => {
    const small = openBoxProject("in", 23 / 32, { width: 1.4, height: 12.5, depth: 13.5 });
    expect(assemblySteps(small, "crate")).toBeNull();
    expect(assemblyDrawings(small, "crate")).toBeNull();
    expect(designElevationSvg(small, "crate")).toBeNull();
  });
});
