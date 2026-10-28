import { describe, expect, it } from "vitest";
import {
  addStarterDesign,
  checkDesigns,
  convertProjectUnits,
  createProject,
  designGeometry,
  EKET_TOLERANCE_MM,
  hardwareList,
  materialsById,
  presetAxis,
  regenerateDesigns,
  starterById,
  starterDesign,
  starterFits,
  starterName,
  starterValueErrors,
  STARTERS,
  type Project,
  type Starter,
  type StarterValues,
  type Units,
} from "../../src/index.ts";

function shop(units: Units): Project {
  const base = createProject("Shop", units);
  const [thick, thin] = units === "mm" ? [18, 6] : [0.75, 0.25];
  return {
    ...base,
    materials: [
      { id: "ply18", name: "Plywood thick", thickness: thick, grained: true, measured: true },
      { id: "ply6", name: "Plywood thin", thickness: thin, grained: true, measured: true },
    ],
    stock: [
      { id: "ply18-sheet", material: "ply18", length: units === "mm" ? 2440 : 96, width: units === "mm" ? 1220 : 48, quantity: null, kind: "sheet" },
      { id: "ply6-sheet", material: "ply6", length: units === "mm" ? 2440 : 96, width: units === "mm" ? 1220 : 48, quantity: null, kind: "sheet" },
    ],
    parts: [],
  };
}

function allValues(starter: Starter): StarterValues[] {
  const grid = starter.choices.find((choice) => choice.kind === "grid");
  const sizes: { columns: number; rows: number }[] = [];
  if (grid) {
    for (let columns = grid.columns.min; columns <= grid.columns.max; columns++) {
      for (let rows = grid.rows.min; rows <= grid.rows.max; rows++) sizes.push({ columns, rows });
    }
  } else {
    sizes.push({ columns: starter.defaults.columns, rows: starter.defaults.rows });
  }
  let options: StarterValues["options"][] = [{}];
  for (const choice of starter.choices) {
    if (choice.kind !== "option") continue;
    options = options.flatMap((so) => choice.values.map((value) => ({ ...so, [choice.key]: value.value })));
  }
  return sizes.flatMap((size) => options.map((option) => ({ ...size, options: option })));
}

const cases = STARTERS.flatMap((starter) => allValues(starter).map((values) => ({ starter, values, label: `${starter.id} ${JSON.stringify(values)}` })));
const cube = starterById("cube-shelf")!;
const bookcase = starterById("bookcase")!;
const tvBench = starterById("tv-bench")!;
const media = starterById("media-unit")!;

describe.each(["mm", "in"] as const)("every allowed value in %s", (units) => {
  it.each(cases)("$label adds a design with no issue", ({ starter, values }) => {
    const result = addStarterDesign(shop(units), starter, values);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const issues = checkDesigns(regenerateDesigns(result.project)).filter((issue) => issue.refs.some((ref) => ref.kind === "design" && ref.design === result.id));
    expect(issues).toEqual([]);
  });
});

describe("the data", () => {
  it("lists the nine starters in order, with the custom grid last and in no group", () => {
    expect(STARTERS.map((starter) => starter.id)).toEqual(["cube-shelf", "tv-bench", "media-unit", "bookcase", "wall-cubes", "nightstand", "crate", "stacking-shelf", "custom-grid"]);
    expect(STARTERS.at(-1)!.group).toBeNull();
    expect(starterById("nothing")).toBeUndefined();
  });

  it("gives every starter a source for each size", () => {
    for (const starter of STARTERS) {
      expect(Object.keys(starter.sources).length).toBeGreaterThan(0);
      for (const value of Object.values(starter.sources)) {
        expect(value.mm).toBeGreaterThan(0);
        expect(value.source.length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the defaults inside the choices", () => {
    for (const starter of STARTERS) expect(starterValueErrors(starter, starter.defaults)).toEqual([]);
  });
});

describe("KALLAX starters", () => {
  const kallax = STARTERS.filter((starter) => ["cube-shelf", "tv-bench", "media-unit"].includes(starter.id));

  it.each(kallax.flatMap((starter) => allValues(starter).map((values) => ({ starter, values, label: `${starter.id} ${JSON.stringify(values)}` }))))(
    "$label keeps the 335 mm opening and a deep enough panel",
    ({ starter, values }) => {
      const project = shop("mm");
      const design = starterDesign(starter, values, { id: "x", units: "mm", material: "ply18", back: "ply6" });
      const geometry = designGeometry(design, materialsById(project))!;
      expect(design.width).toEqual(presetAxis("kallax", geometry.columns.length, "mm"));
      expect(design.height).toEqual(presetAxis("kallax", geometry.rows.length, "mm"));
      expect(geometry.columns.every((opening) => opening === 335)).toBe(true);
      expect(geometry.panelDepth).toBeGreaterThanOrEqual(380);
    },
  );
});

describe("EKET starters", () => {
  const eket = STARTERS.filter((starter) => ["wall-cubes", "nightstand"].includes(starter.id));

  it.each(eket.flatMap((starter) => allValues(starter).map((values) => ({ starter, values, label: `${starter.id} ${JSON.stringify(values)}` }))))(
    "$label is a multiple of 350 mm in both directions",
    ({ starter, values }) => {
      const design = starterDesign(starter, values, { id: "x", units: "mm", material: "ply18", back: "ply6" });
      const geometry = designGeometry(design, materialsById(shop("mm")))!;
      for (const size of [geometry.outsideWidth, geometry.outsideHeight]) {
        expect(Math.abs(size - Math.round(size / 350) * 350)).toBeLessThanOrEqual(EKET_TOLERANCE_MM);
      }
    },
  );

  it("sets the wall cubes mount and the nightstand mount from the option", () => {
    expect(starterDesign(starterById("wall-cubes")!, starterById("wall-cubes")!.defaults, { id: "x", units: "mm", material: "ply18", back: "ply6" }).mount).toBe("wall-rail");
    const night = starterById("nightstand")!;
    expect(starterDesign(night, { ...night.defaults, options: { mount: "feet" } }, { id: "x", units: "mm", material: "ply18", back: "ply6" }).mount).toBe("feet");
  });
});

describe("the bookcase", () => {
  it("is 800 × 2020 × 280 mm outside at 80 × 202", () => {
    const result = addStarterDesign(shop("mm"), bookcase, bookcase.defaults);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const design = result.project.designs!.find((candidate) => candidate.id === result.id)!;
    const geometry = designGeometry(design, materialsById(result.project))!;
    expect([geometry.outsideWidth, geometry.outsideHeight, geometry.depth]).toEqual([800, 2020, 280]);
    expect(design.system).toBe("custom");
  });

  it("has 3 rows at 106 cm and 6 rows at 202 cm", () => {
    const make = (height: string) => starterDesign(bookcase, { ...bookcase.defaults, options: { width: "40", height } }, { id: "x", units: "mm", material: "ply18", back: null });
    expect(make("106").height).toEqual({ outside: 1060, cells: 3 });
    expect(make("202").height).toEqual({ outside: 2020, cells: 6 });
    expect(make("106").width).toEqual({ outside: 400, cells: 1 });
  });
});

describe("defaults and names", () => {
  it("names the defaults", () => {
    expect(starterName(cube, cube.defaults)).toBe("Cube shelf 2 × 4");
    expect(starterName(tvBench, tvBench.defaults)).toBe("TV bench 4 × 1");
    expect(starterName(media, media.defaults)).toBe("Media unit");
    expect(starterName(bookcase, bookcase.defaults)).toBe("Bookcase 80 × 202");
    expect(starterName(starterById("wall-cubes")!, starterById("wall-cubes")!.defaults)).toBe("Wall cubes 3 × 1");
    expect(starterName(starterById("nightstand")!, starterById("nightstand")!.defaults)).toBe("Nightstand 1 × 2");
    expect(starterName(starterById("custom-grid")!, starterById("custom-grid")!.defaults)).toBe("Custom grid 2 × 2");
    expect(starterName(starterById("crate")!, starterById("crate")!.defaults)).toBe("Crate");
  });

  it("makes no name that is, or starts with, an IKEA name", () => {
    for (const { starter, values } of cases) {
      const name = starterName(starter, values);
      expect(name).not.toMatch(/^(KALLAX|EKET|BILLY)\b/i);
      expect(["KALLAX", "EKET", "BILLY"]).not.toContain(name);
    }
  });

  it("combines the two top center cells of the media unit", () => {
    const design = starterDesign(media, media.defaults, { id: "x", units: "mm", material: "ply18", back: "ply6" });
    expect(design.combined).toEqual([{ column: 2, row: 1, columns: 2, rows: 1 }]);
    expect(design.mount).toBe("legs");
  });

  it("makes the custom grid from the KALLAX openings", () => {
    const custom = starterById("custom-grid")!;
    const design = starterDesign(custom, custom.defaults, { id: "x", units: "mm", material: "ply18", back: "ply6" });
    expect(design.system).toBe("custom");
    expect(design.width).toEqual({ openings: [335, 335] });
    expect(design.height).toEqual({ openings: [335, 335] });
  });

  it("leaves out the back for a null back", () => {
    expect(starterDesign(cube, cube.defaults, { id: "x", units: "mm", material: "ply18", back: null }).back).toBeUndefined();
    expect(starterDesign(cube, cube.defaults, { id: "x", units: "mm", material: "ply18", back: "ply6" }).back).toEqual({ material: "ply6" });
  });
});

describe("starterValueErrors", () => {
  it("rejects a grid outside the range", () => {
    expect(starterValueErrors(cube, { columns: 7, rows: 1, options: {} })).not.toEqual([]);
    expect(starterValueErrors(cube, { columns: 1, rows: 0, options: {} })).not.toEqual([]);
    expect(starterValueErrors(cube, { columns: 1.5, rows: 1, options: {} })).not.toEqual([]);
    expect(starterValueErrors(cube, { columns: 6, rows: 6, options: {} })).toEqual([]);
  });

  it("rejects an option that is not allowed", () => {
    expect(starterValueErrors(bookcase, { ...bookcase.defaults, options: { width: "60" } })).not.toEqual([]);
    expect(starterValueErrors(bookcase, { ...bookcase.defaults, options: { height: "106" } })).toEqual([]);
    expect(starterValueErrors(cube, { columns: 2, rows: 2, options: { mount: "legs" } })).toEqual([expect.stringContaining('no choice "mount"')]);
  });

  it("ignores the columns and rows of a starter with no grid", () => {
    expect(starterValueErrors(bookcase, { columns: 9, rows: 0, options: {} })).toEqual([]);
    expect(starterValueErrors(media, { columns: 9, rows: 0, options: {} })).toEqual([]);
    const design = starterDesign(media, { columns: 9, rows: 0, options: {} }, { id: "x", units: "mm", material: "ply18", back: null });
    expect(design.width).toEqual(presetAxis("kallax", 4, "mm"));
    expect(design.height).toEqual(presetAxis("kallax", 2, "mm"));
    expect(starterName(starterById("custom-grid")!, { columns: 9, rows: 0, options: {} })).toBe("Custom grid 2 × 2");
  });
});

describe("addStarterDesign", () => {
  it("refuses a value that the starter does not allow, and adds no design", () => {
    const wide = addStarterDesign(shop("mm"), bookcase, { ...bookcase.defaults, options: { width: "60" } });
    expect(wide.ok).toBe(false);
    expect(!wide.ok && wide.issues.map((issue) => [issue.severity, issue.message])).toEqual([["error", expect.stringContaining("must be 40 cm or 80 cm")]]);
    const grid = addStarterDesign(shop("mm"), cube, { columns: 9, rows: 0, options: {} });
    expect(grid.ok).toBe(false);
    expect(!grid.ok && grid.issues).toHaveLength(2);
  });

  it("names the starter as written in a message", () => {
    expect(starterValueErrors(tvBench, { ...tvBench.defaults, options: { width: "80" } })).toEqual(['The TV bench has no choice "width".']);
  });

  it("gives each media unit its own combined cell", () => {
    const [one, two] = [media, media].map((starter) => starterDesign(starter, starter.defaults, { id: "x", units: "mm", material: "ply18", back: null }));
    expect(one!.combined).toEqual(two!.combined);
    expect(one!.combined![0]).not.toBe(two!.combined![0]);
  });

  it("takes the id from the name", () => {
    const result = addStarterDesign(shop("mm"), cube, cube.defaults);
    expect(result).toMatchObject({ ok: true, id: "cube-shelf-2-4" });
  });

  it("gives the next id when a design has the id", () => {
    const first = addStarterDesign(shop("mm"), cube, cube.defaults);
    if (!first.ok) throw new Error("first add failed");
    expect(addStarterDesign(first.project, cube, cube.defaults)).toMatchObject({ ok: true, id: "cube-shelf-2-4-2" });
  });

  it("gives the next id when a manual part has an id that the design would make", () => {
    const project = { ...shop("mm"), parts: [{ id: "cube-shelf-2-4-top", name: "Top", material: "ply18", length: 724, width: 390, quantity: 1, grain: "length" as const }] };
    expect(addStarterDesign(project, cube, cube.defaults)).toMatchObject({ ok: true, id: "cube-shelf-2-4-2" });
  });

  it("uses the given name, id, material, and back", () => {
    const result = addStarterDesign(shop("mm"), cube, cube.defaults, { name: "Hall cubes", id: "hall", material: "ply18", back: null });
    expect(result).toMatchObject({ ok: true, id: "hall" });
    if (!result.ok) return;
    expect(result.project.designs).toEqual([expect.objectContaining({ id: "hall", name: "Hall cubes", material: "ply18" })]);
    expect(result.project.designs![0]!.back).toBeUndefined();
  });

  it("picks the back when only the material is given", () => {
    const result = addStarterDesign(shop("mm"), cube, cube.defaults, { material: "ply18" });
    expect(result.ok && result.project.designs![0]!.back).toEqual({ material: "ply6" });
  });

  it("adds only the box material and its sheet for a null back in a new project", () => {
    const result = addStarterDesign(createProject("New", "mm"), cube, cube.defaults, { back: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.materials.map((material) => material.id)).toEqual(["plywood"]);
    expect(result.project.stock.map((stock) => stock.id)).toEqual(["plywood-2440x1220"]);
    expect(result.project.designs![0]!.back).toBeUndefined();
  });

  it("adds the sheet of a given material and the picked back, and no other material", () => {
    const project = shop("mm");
    const result = addStarterDesign({ ...project, stock: [] }, cube, cube.defaults, { material: "ply18" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.materials).toEqual(project.materials);
    expect(result.project.stock.map((stock) => [stock.id, stock.material])).toEqual([
      ["ply18-2440x1220", "ply18"],
      ["ply6-2440x1220", "ply6"],
    ]);
  });

  it("adds the suggested sheet for a given back that has none", () => {
    const project = shop("mm");
    const result = addStarterDesign({ ...project, stock: project.stock.filter((stock) => stock.material !== "ply6") }, cube, cube.defaults, { material: "ply18", back: "ply6" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.materials).toEqual(project.materials);
    expect(result.project.stock.map((stock) => stock.id)).toEqual(["ply18-sheet", "ply6-2440x1220"]);
  });

  it("picks the materials of a project that has none, and adds no parts", () => {
    const result = addStarterDesign(createProject("New", "mm"), cube, cube.defaults);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.designs![0]).toMatchObject({ material: "plywood", back: { material: "plywood-6-mm" } });
    expect(result.project.parts).toEqual([]);
  });
});

describe("starterFits", () => {
  const added = (starter: Starter, values: StarterValues, options?: Parameters<typeof addStarterDesign>[3], project = shop("mm")) => {
    const result = addStarterDesign(project, starter, values, options);
    if (!result.ok) throw new Error("add failed");
    return { project: regenerateDesigns(result.project), id: result.id };
  };

  it("gives the inserts and the legs for the TV bench on legs", () => {
    const { project, id } = added(tvBench, tvBench.defaults);
    expect(starterFits(project, id)).toEqual(["KALLAX inserts and boxes", "EKET legs"]);
  });

  it("gives only the inserts for a cube shelf on the floor", () => {
    const { project, id } = added(cube, cube.defaults);
    expect(starterFits(project, id)).toEqual(["KALLAX inserts and boxes"]);
  });

  it("leaves out the inserts when a thick back makes the panels too shallow", () => {
    const project = shop("mm");
    const thick = { ...project, materials: [...project.materials, { id: "ply25", name: "Thick back", thickness: 25, grained: true, measured: true }], stock: [...project.stock, { id: "ply25-sheet", material: "ply25", length: 2440, width: 1220, quantity: null, kind: "sheet" as const }] };
    const result = added(cube, cube.defaults, { back: "ply25" }, thick);
    expect(starterFits(result.project, result.id)).toEqual([]);
  });

  it("gives the wall rail for the wall cubes, and the legs or feet for the nightstand", () => {
    const wall = starterById("wall-cubes")!;
    const night = starterById("nightstand")!;
    const w = added(wall, wall.defaults);
    expect(starterFits(w.project, w.id)).toEqual(["EKET wall rail"]);
    const legs = added(night, night.defaults);
    expect(starterFits(legs.project, legs.id)).toEqual(["EKET legs"]);
    const feet = added(night, { ...night.defaults, options: { mount: "feet" } });
    expect(starterFits(feet.project, feet.id)).toEqual(["EKET feet"]);
  });

  it("gives only the leg items for the bookcase and the custom grid, and nothing for an unknown design", () => {
    const custom = starterById("custom-grid")!;
    const b = added(bookcase, bookcase.defaults);
    const c = added(custom, custom.defaults);
    expect(starterFits(b.project, b.id)).toEqual([]);
    expect(starterFits(c.project, c.id)).toEqual([]);
    expect(starterFits(b.project, "nothing")).toEqual([]);
  });
});

describe("the crate", () => {
  const crate = starterById("crate")!;
  const sheet = (units: Units, thickness: number, measured: boolean): Project => {
    const base = createProject("Crate", units);
    const size = units === "mm" ? { length: 2440, width: 1220 } : { length: 96, width: 48 };
    return {
      ...base,
      materials: [{ id: "ply", name: "Plywood", thickness, grained: true, measured }],
      stock: [{ id: "ply-sheet", material: "ply", ...size, quantity: null, kind: "sheet" }],
    };
  };
  const made = (project: Project) => {
    const result = addStarterDesign(project, crate, crate.defaults);
    if (!result.ok) throw new Error("add failed");
    return { project: regenerateDesigns(result.project), id: result.id };
  };

  it("makes the built crate in a new in project", () => {
    const { project, id } = made(sheet("in", 23 / 32, true));
    expect(project.parts.map((part) => [part.name, part.length, part.width, part.quantity])).toEqual([
      ["Front", 12.5, 12.5, 1],
      ["Back", 12.5, 12.5, 1],
      ["Side", 12.0625, 12.5, 2],
      ["Bottom", 11.0625, 12.0625, 1],
    ]);
    expect(checkDesigns(project)).toEqual([]);
    expect(project.materials.map((material) => material.id)).toEqual(["ply"]);
    expect(project.designs![0]).toMatchObject({ id, kind: "open-box", system: "kallax", name: "Crate", width: { outside: 12.5, cells: 1 }, height: { outside: 12.5, cells: 1 }, depth: 13.5 });
    expect(project.designs![0]!.back).toBeUndefined();
    expect(project.designs![0]!.mount).toBeUndefined();
  });

  it("makes a crate with no warnings in a new mm project", () => {
    const { project, id } = made(sheet("mm", 18, true));
    const design = project.designs![0]!;
    expect([design.width, design.height, design.depth]).toEqual([{ outside: 318, cells: 1 }, { outside: 318, cells: 1 }, 343]);
    expect(checkDesigns(project)).toEqual([]);
    expect(starterFits(project, id)).toEqual(["KALLAX cells"]);
  });

  it("adds no back material and no thin stock, whatever the back option is", () => {
    for (const back of [undefined, "ply6", null]) {
      const result = addStarterDesign(createProject("New", "in"), crate, crate.defaults, back === undefined ? {} : { back });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.project.materials).toHaveLength(1);
      expect(result.project.stock).toHaveLength(1);
      expect(result.project.designs![0]!.back).toBeUndefined();
    }
  });

  it("gives the crate its three finish steps in the project units", () => {
    const steps = (units: Units) => made(sheet(units, units === "mm" ? 18 : 23 / 32, true)).project.designs![0]!.finish;
    expect(steps("in")).toEqual([
      'Drill a 2 1/8" hole through the front and the back, centered left to right, with its top 1 1/2" below the top edge. The two holes are the handles.',
      "Round over all the edges with a router, including the edges of the holes.",
      "Sand lightly.",
    ]);
    expect(steps("mm")![0]).toBe("Drill a 54 mm hole through the front and the back, centered left to right, with its top 38 mm below the top edge. The two holes are the handles.");
    expect(steps("mm")!.slice(1)).toEqual(steps("in")!.slice(1));
  });

  it("lists the crate in the Accessories group, before the custom grid", () => {
    expect(crate.group).toBe("Accessories");
    expect(crate.name).toBe("Crate");
    expect(crate.choices).toEqual([]);
    expect(crate.defaults).toEqual({ columns: 1, rows: 1, options: {} });
    const ids = STARTERS.map((starter) => starter.id);
    expect(ids.indexOf("crate")).toBe(ids.indexOf("nightstand") + 1);
    expect(ids.indexOf("crate")).toBe(ids.indexOf("custom-grid") - 2);
  });

  it("refuses a value for the crate", () => {
    expect(starterValueErrors(crate, { columns: 1, rows: 1, options: { width: "40" } })).toEqual(['The Crate has no choice "width".']);
  });

  it("drops KALLAX cells from Fits when the crate is made too wide", () => {
    const { project, id } = made(sheet("mm", 18, true));
    const wide = regenerateDesigns({ ...project, designs: project.designs!.map((design) => ({ ...design, width: { outside: 340, cells: 1 } })) });
    expect(checkDesigns(wide).map((issue) => issue.code)).toEqual(["kallax-fit"]);
    expect(starterFits(wide, id)).toEqual([]);
  });

  it("still adds the crate with a nominal 3/4\" material", () => {
    const result = addStarterDesign(sheet("in", 0.75, false), crate, crate.defaults);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const project = regenerateDesigns(result.project);
    expect(checkDesigns(project).map((issue) => issue.code)).toEqual(["nominal-thickness"]);
    expect(starterFits(project, result.id)).toEqual(["KALLAX cells"]);
  });
});

describe("the stacking shelf", () => {
  const stacking = starterById("stacking-shelf")!;
  const sheet = (units: Units, thickness: number): Project => {
    const base = createProject("Shelf", units);
    const size = units === "mm" ? { length: 2440, width: 1220 } : { length: 96, width: 48 };
    return {
      ...base,
      materials: [{ id: "ply", name: "Plywood", thickness, grained: true, measured: true }],
      stock: [{ id: "ply-sheet", material: "ply", ...size, quantity: null, kind: "sheet" }],
    };
  };
  const made = (project: Project, options?: Parameters<typeof addStarterDesign>[3]) => {
    const result = addStarterDesign(project, stacking, stacking.defaults, options);
    if (!result.ok) throw new Error("add failed");
    return { project: regenerateDesigns(result.project), id: result.id };
  };

  it.each([
    ["in", 48, 0.125],
    ["mm", 1220, 3],
  ] as const)("cuts three panels across a %s sheet with a kerf", (units, sheetWidth, kerf) => {
    const { project } = made(sheet(units, units === "in" ? 0.75 : 18));
    const depth = project.designs![0]!.depth;
    expect(3 * depth + 2 * kerf).toBeLessThanOrEqual(sheetWidth);
  });

  it("makes his module in a new in project", () => {
    const { project } = made(sheet("in", 0.75));
    expect(project.parts.map((part) => [part.name, part.length, part.width, part.quantity])).toEqual([
      ["Top", 51, 15.875, 1],
      ["Bottom", 51, 15.875, 1],
      ["Side", 40, 15.875, 2],
      ["Shelf", 51, 15.875, 3],
      ["Foot", 15.875, 3.5, 2],
      ["Top cleat", 15.875, 3.5, 2],
    ]);
    expect(checkDesigns(project)).toEqual([]);
    expect(checkDesigns(project, { keepHidden: true }).map((issue) => issue.code)).toEqual(["shelf-span"]);
    const design = project.designs![0]!;
    expect(design).toEqual({
      id: "stacking-shelf",
      system: "custom",
      name: "Stacking shelf",
      material: "ply",
      width: { outside: 52.5, cells: 1 },
      height: { outside: 40, cells: 4 },
      depth: 15.875,
      corners: "sides-over-top",
      fastener: "face-screws",
      mount: "cleats",
      hiddenWarnings: ["shelf-span"],
    });
    const geometry = designGeometry(design, materialsById(project))!;
    expect([geometry.outsideWidth, geometry.outsideHeight, geometry.depth]).toEqual([52.5, 40, 15.875]);
    expect(hardwareList(project).map((line) => [line.item, line.name, line.quantity])).toEqual([
      ["face-screws", 'Wood screws for the joints, #8 × 2"', 44],
      ["cleat-screws", 'Wood screws for the cleats, #8 × 1 1/4"', 18],
      ["glue", "Wood glue (PVA)", null],
    ]);
    expect(project.materials.map((material) => material.id)).toEqual(["ply"]);
  });

  it("makes his module with no warnings in a new mm project", () => {
    const { project, id } = made(sheet("mm", 18));
    const design = project.designs![0]!;
    expect([design.width, design.height, design.depth]).toEqual([{ outside: 1334, cells: 1 }, { outside: 1016, cells: 4 }, 403]);
    expect(checkDesigns(project)).toEqual([]);
    expect(starterFits(project, id)).toEqual([]);
    expect(project.parts.map((part) => [part.name, part.length, part.width, part.quantity])).toEqual([
      ["Top", 1298, 403, 1],
      ["Bottom", 1298, 403, 1],
      ["Side", 1016, 403, 2],
      ["Shelf", 1298, 403, 3],
      ["Foot", 403, 89, 2],
      ["Top cleat", 403, 89, 2],
    ]);
    expect(hardwareList(project).map((line) => [line.item, line.name, line.quantity])).toEqual([
      ["face-screws", "Wood screws for the joints, 4 × 50 mm", 44],
      ["cleat-screws", "Wood screws for the cleats, 4 × 30 mm", 18],
      ["glue", "Wood glue (PVA)", null],
    ]);
  });

  it("hides the shelf span, but starterFits reads it", () => {
    const { project, id } = made(sheet("in", 0.75));
    expect(checkDesigns(project, { keepHidden: true }).map((issue) => issue.code)).toContain("shelf-span");
    expect(checkDesigns(project).map((issue) => issue.code)).not.toContain("shelf-span");
    expect(starterFits(project, id)).toEqual([]);
  });

  it("adds no back, even when a back is given", () => {
    for (const back of ["ply6", null]) {
      const result = addStarterDesign(createProject("New", "in"), stacking, stacking.defaults, { back });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.project.materials).toHaveLength(1);
      expect(result.project.designs![0]!.back).toBeUndefined();
    }
    const { project } = made(sheet("in", 0.75), { back: "ply" });
    expect(project.designs![0]!.back).toBeUndefined();
  });

  describe("after a unit switch", () => {
    const placeAll = (project: Project): Project => {
      const placements = project.parts.flatMap((part) => Array.from({ length: part.quantity }, (_, copy) => ({ part: part.id, copy, x: 0, y: 0, rotated: false })));
      return { ...project, plan: { sheets: [{ id: "s1", stock: "ply-sheet", placements }] } };
    };
    const cleatPlacements = (project: Project) => project.plan!.sheets[0]!.placements.filter((placement) => /-(foot|top-cleat)$/.test(placement.part)).length;

    it.each([
      ["in", "mm", 0.75],
      ["mm", "in", 19],
    ] as const)("keeps the feet, the top cleats, and their placements from %s to %s", (from, to, thickness) => {
      const project = placeAll(made(sheet(from, thickness)).project);
      expect(cleatPlacements(project)).toBe(4);
      const converted = convertProjectUnits(project, to);
      expect(checkDesigns(converted).map((issue) => issue.code)).not.toContain("design-stale");
      const regenerated = regenerateDesigns(converted);
      expect(regenerated).toBe(converted);
      expect(cleatPlacements(regenerated)).toBe(4);
      expect(regenerated.plan!.sheets[0]!.placements).toHaveLength(project.plan!.sheets[0]!.placements.length);
    });

    it("still marks a cleat width that is far from the made width as stale", () => {
      const project = made(sheet("in", 0.75)).project;
      const wide = { ...project, parts: project.parts.map((part) => (part.name === "Foot" ? { ...part, width: 4 } : part)) };
      expect(checkDesigns(wide).map((issue) => issue.code)).toContain("design-stale");
    });
  });

  it("lists the starter in the Shop storage group, after the crate", () => {
    expect(stacking.group).toBe("Shop storage");
    expect(stacking.name).toBe("Stacking shelf");
    expect(stacking.choices).toEqual([]);
    expect(stacking.defaults).toEqual({ columns: 1, rows: 4, options: {} });
    expect(stacking.note).toBe("A shelf module that stacks on cleats, after the shelf system of Evan Monsma. The four openings fit storage boxes 8\" high.");
    expect(stacking.sources.size).toEqual({
      mm: 1333.5,
      derived: false,
      source: 'Evan Monsma, "Starting the shelf system I\'ve always wanted", https://www.youtube.com/watch?v=cRj2tih1IaI: 3/4" plywood, 16" deep, sides 40", panels 51", cleats from 3/4" stock 3 1/2" wide',
    });
    const ids = STARTERS.map((starter) => starter.id);
    expect(ids.indexOf("stacking-shelf")).toBe(ids.indexOf("crate") + 1);
    expect(ids.indexOf("stacking-shelf")).toBe(ids.indexOf("custom-grid") - 1);
    expect(starterName(stacking, stacking.defaults)).toBe("Stacking shelf");
  });
});
