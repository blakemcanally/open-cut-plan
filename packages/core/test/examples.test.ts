import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../examples/builders/index.ts";
import { exportPartsCsv, exportStockCsv, formatLength, parseProject, serializeProject, type Project } from "../src/index.ts";

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
    expect(size("a-top")).toBe('42 19/32" x 15 3/8"');
    expect(size("b-top")).toBe('56 17/32" x 15 3/8"');
    expect(size("a-side")).toBe('27 7/32" x 15 3/8"');
    expect(size("b-back")).toBe('56 17/32" x 28 5/8"');
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
