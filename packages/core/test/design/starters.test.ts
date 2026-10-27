import { describe, expect, it } from "vitest";
import {
  addStarterDesign,
  checkDesigns,
  createProject,
  designGeometry,
  EKET_TOLERANCE_MM,
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
  it("lists the seven starters in order, with the custom grid last and in no group", () => {
    expect(STARTERS.map((starter) => starter.id)).toEqual(["cube-shelf", "tv-bench", "media-unit", "bookcase", "wall-cubes", "nightstand", "custom-grid"]);
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
    expect(starterValueErrors(cube, { columns: 2, rows: 2, options: { mount: "legs" } })).not.toEqual([]);
  });
});

describe("addStarterDesign", () => {
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
