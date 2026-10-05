import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../examples/builders/index.ts";
import {
  applyOptimizeResult,
  checkDesigns,
  convertLength,
  designGeometry,
  exportPartsCsv,
  exportStockCsv,
  formatLength,
  materialsById,
  optimize,
  parseProject,
  regenerateDesigns,
  serializeProject,
  validatePlan,
  type Project,
} from "../src/index.ts";

const dir = new URL("../../../examples/", import.meta.url);

function parse(slug: string) {
  const result = parseProject(EXAMPLES[slug]!());
  if (!result.ok) throw new Error(result.errors.map((issue) => issue.message).join("\n"));
  return result;
}

function build(slug: string): Project {
  return parse(slug).project;
}

describe.each(Object.keys(EXAMPLES))("example %s", (slug) => {
  it("parses without errors or warnings", () => {
    expect(parse(slug).warnings).toEqual([]);
  });

  it("matches the checked-in files (run `npm run examples` to update)", () => {
    const project = build(slug);
    expect(readFileSync(new URL(`${slug}.cutplan.json`, dir), "utf8")).toBe(serializeProject(project));
    expect(readFileSync(new URL(`csv/${slug}-parts.csv`, dir), "utf8")).toBe(exportPartsCsv(project));
    expect(readFileSync(new URL(`csv/${slug}-stock.csv`, dir), "utf8")).toBe(exportStockCsv(project));
  });

  it("has current design parts and no design issues", () => {
    const project = build(slug);
    expect(regenerateDesigns(project)).toBe(project);
    expect(checkDesigns(project)).toEqual([]);
  });
});

describe("examples folder", () => {
  it("has a builder for every .cutplan.json file", () => {
    const files = readdirSync(dir)
      .filter((file) => file.endsWith(".cutplan.json"))
      .map((file) => file.slice(0, -".cutplan.json".length));
    expect(files.sort()).toEqual(Object.keys(EXAMPLES).sort());
  });
});

describe("living-room-shelf", () => {
  const project = build("living-room-shelf");

  it("uses the hand-made plan: 5 sheets of 18mm and 2 sheets of 6mm", () => {
    const sheets = project.plan!.sheets;
    expect(sheets.filter((sheet) => sheet.stock === "bb18-5x5")).toHaveLength(5);
    expect(sheets.filter((sheet) => sheet.stock === "bb6-5x5")).toHaveLength(2);
  });

  it("places every copy of every part exactly once", () => {
    const copies = project.parts.reduce((total, part) => total + part.quantity, 0);
    expect(copies).toBe(31);
    expect(project.plan!.sheets.flatMap((sheet) => sheet.placements)).toHaveLength(31);
  });

  it("has the sizes from the original cut list", () => {
    const size = (id: string) => {
      const part = project.parts.find((p) => p.id === id)!;
      return `${formatLength(part.length, "in")} x ${formatLength(part.width, "in")}`;
    };
    expect(size("a-top")).toBe('~42 19/32" x 15 3/8"');
    expect(size("b-top")).toBe('~56 17/32" x 15 3/8"');
    expect(size("a-side")).toBe('~27 7/32" x 15 3/8"');
    expect(size("b-back")).toBe('~56 17/32" x ~28 5/8"');
  });

  it("keeps every placement inside its 60 x 60 sheet", () => {
    const parts = new Map(project.parts.map((part) => [part.id, part]));
    for (const placement of project.plan!.sheets.flatMap((sheet) => sheet.placements)) {
      const part = parts.get(placement.part)!;
      expect(placement.x + part.length).toBeLessThanOrEqual(60);
      expect(placement.y + part.width).toBeLessThanOrEqual(60);
    }
  });
});

describe("kallax-2x4-mm", () => {
  const project = build("kallax-2x4-mm");

  it("makes a box with a full-width top and bottom, 2 sides, 1 divider, and 6 shelves with 335 mm cells", () => {
    expect(project.parts.map((p) => [p.id, p.length, p.width, p.quantity])).toEqual([
      ["kallax-top", 724, 390, 1],
      ["kallax-bottom", 724, 390, 1],
      ["kallax-side", 1394, 390, 2],
      ["kallax-divider", 1394, 390, 1],
      ["kallax-shelf", 335, 390, 6],
    ]);
  });

  it("optimizes on the track saw with every copy placed and no errors", () => {
    const result = optimize(project, { iterations: 10 });
    expect(result.unplaced).toEqual([]);
    expect(validatePlan(applyOptimizeResult(project, result)).filter((issue) => issue.severity === "error")).toEqual([]);
  });
});

describe("kallax-4x2-combined-mm", () => {
  const project = build("kallax-4x2-combined-mm");

  it("runs one shelf under the two combined cells, on a short divider (spec 14.1)", () => {
    expect(project.parts.map((p) => [p.id, p.name, p.length, p.width, p.quantity])).toEqual([
      ["kx-top", "Top", 1430, 390, 1],
      ["kx-bottom", "Bottom", 1430, 390, 1],
      ["kx-side", "Side", 688, 390, 2],
      ["kx-divider", "Divider", 688, 390, 2],
      ["kx-divider-rows-2", "Divider, row 2", 335, 390, 1],
      ["kx-shelf", "Shelf", 335, 390, 2],
      ["kx-shelf-cols-1-2", "Shelf, columns 1–2", 688, 390, 1],
    ]);
  });

  it("optimizes on the track saw with every copy placed and no errors", () => {
    const result = optimize(project, { iterations: 10 });
    expect(result.unplaced).toEqual([]);
    expect(validatePlan(applyOptimizeResult(project, result)).filter((issue) => issue.severity === "error")).toEqual([]);
  });
});

describe("eket-wall-in", () => {
  const project = build("eket-wall-in");

  it("is 700 × 350 × 350 mm outside in an inch project with 23/32 plywood", () => {
    const geometry = designGeometry(project.designs![0]!, materialsById(project))!;
    expect(geometry.thickness).toBe(0.71875);
    expect(convertLength(geometry.outsideWidth, "in", "mm")).toBeCloseTo(700, 6);
    expect(convertLength(geometry.outsideHeight, "in", "mm")).toBeCloseTo(350, 6);
    expect(convertLength(geometry.depth, "in", "mm")).toBeCloseTo(350, 6);
    expect(geometry.columns[0]).toBe(geometry.columns[1]);
  });

  it("makes the parts of 2 units, with a back", () => {
    expect(project.parts.map((p) => [p.id, p.quantity])).toEqual([
      ["eket-top", 2],
      ["eket-bottom", 2],
      ["eket-side", 4],
      ["eket-divider", 2],
      ["eket-back", 2],
    ]);
  });

  it("optimizes with every copy placed and no errors", () => {
    const result = optimize(project, { iterations: 10 });
    expect(result.unplaced).toEqual([]);
    expect(validatePlan(applyOptimizeResult(project, result)).filter((issue) => issue.severity === "error")).toEqual([]);
  });
});
