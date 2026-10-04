import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import { parseProject } from "../../src/format/parse.ts";
import { orderByGroup } from "../../src/optimize/groups.ts";
import { optimize } from "../../src/optimize/search.ts";
import { partColors } from "../../src/reports/colors.ts";

describe("orderByGroup", () => {
  it("puts a sheet next to the last sheet that shares a group with it, and keeps the order otherwise", () => {
    const sheets = [["A"], ["B"], ["A"], [], ["B", "C"], ["C"]].map((groups, i) => ({ id: i, groups: new Set(groups) }));
    expect(orderByGroup(sheets, (sheet) => sheet.groups).map((sheet) => sheet.id)).toEqual([0, 2, 1, 4, 5, 3]);
  });

  it("keeps the order when no two sheets share a group", () => {
    const sheets = [["A"], ["B"], []].map((groups, i) => ({ id: i, groups: new Set(groups) }));
    expect(orderByGroup(sheets, (sheet) => sheet.groups).map((sheet) => sheet.id)).toEqual([0, 1, 2]);
  });
});

describe("the sheet order of the result", () => {
  it("puts the sheets of each group of the living-room shelf next to each other", () => {
    const parsed = parseProject(EXAMPLES["living-room-shelf"]!());
    if (!parsed.ok) throw new Error("example");
    const project = parsed.project;
    const colors = partColors(project);
    const parts = new Map(project.parts.map((part) => [part.id, part]));
    const material = new Map(project.stock.map((stock) => [stock.id, stock.material]));
    for (const seed of [1, 2, 3]) {
      const result = optimize(project, { iterations: 200, seed });
      const where = new Map<string, number[]>();
      result.sheets.forEach((sheet, index) => {
        const keys = new Set(sheet.placements.map((p) => `${material.get(sheet.stock)} ${colors.keyOf(parts.get(p.part)!, p.copy)!.key}`));
        for (const key of keys) where.set(key, [...(where.get(key) ?? []), index]);
      });
      const gaps = [...where.values()].filter((indexes) => indexes.at(-1)! - indexes[0]! !== indexes.length - 1);
      expect(gaps).toEqual([]);
    }
  });
});
