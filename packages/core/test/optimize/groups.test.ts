import { describe, expect, it } from "vitest";
import { regenerateDesigns } from "../../src/design/generate.ts";
import type { PlanSheet, Project } from "../../src/format/schema.ts";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import { parseProject } from "../../src/format/parse.ts";
import { describeGroupSpread, orderByGroup, spreadGroups } from "../../src/optimize/groups.ts";
import { optimize } from "../../src/optimize/search.ts";
import { partColors } from "../../src/reports/colors.ts";
import { designProject, eketDesign, kallaxDesign, sampleProject } from "../helpers.ts";

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

describe("the groups on more than one sheet", () => {
  function twoMaterials(): Project {
    const project = regenerateDesigns(designProject([eketDesign({ quantity: 2 })]));
    const sheet = (id: string, stock: string, placements: [string, number][]): PlanSheet => ({ id, stock, placements: placements.map(([part, copy]) => ({ part, copy, x: 0, y: 0, rotated: false })) });
    project.plan = {
      sheets: [
        sheet("s1", "ply18-sheet", [["ek-top", 0], ["ek-top", 1]]),
        sheet("s2", "ply18-sheet", [["ek-side", 0], ["ek-side", 2]]),
        sheet("s3", "ply6-sheet", [["ek-back", 0], ["ek-back", 1]]),
      ],
    };
    return project;
  }

  it("lists each unit or group on more than one sheet of a material, with the number of sheets", () => {
    const spread = spreadGroups(twoMaterials());
    expect(spread.map((s) => [s.key.label, s.material, s.sheets])).toEqual([
      ["Wall EKET 1 of 2", "ply18", 2],
      ["Wall EKET 2 of 2", "ply18", 2],
    ]);
  });

  it("describes the groups in a short sentence", () => {
    const project = twoMaterials();
    expect(describeGroupSpread(project)).toBe("Wall EKET 1 of 2 is on 2 sheets of Birch ply 18; Wall EKET 2 of 2 is on 2 sheets of Birch ply 18.");
    project.plan!.sheets[1]!.placements = [];
    expect(describeGroupSpread(project)).toBe("Each unit is on one sheet of each material.");
    project.plan!.sheets = project.plan!.sheets.slice(0, 1);
    expect(describeGroupSpread(project)).toBe("Each unit is on one sheet.");
    project.plan!.sheets = [];
    expect(describeGroupSpread(project)).toBeNull();
  });

  it("names groups, and gives the count of the rest after three", () => {
    const project = sampleProject();
    project.parts = ["A", "B", "C", "D", "E"].map((group) => ({ id: group, name: group, material: "ply", length: 10, width: 10, quantity: 2, grain: "length", group }));
    const at = (part: string, copy: number) => ({ part, copy, x: 0, y: 0, rotated: false });
    project.plan = { sheets: [{ id: "s1", stock: "ply-4x8", placements: ["A", "B", "C", "D", "E"].map((part) => at(part, 0)) }] };
    expect(describeGroupSpread(project)).toBe("Each group is on one sheet.");
    project.plan.sheets.push({ id: "s2", stock: "ply-4x8", placements: ["A", "B", "C", "D", "E"].map((part) => at(part, 1)) });
    expect(describeGroupSpread(project)).toBe("A is on 2 sheets; B is on 2 sheets; C is on 2 sheets; 2 more are on more than one sheet.");
    project.parts.push({ id: "k", name: "K", material: "ply", length: 10, width: 10, quantity: 1, grain: "length", design: "kx" });
    project.designs = [kallaxDesign({ material: "ply" })];
    project.plan.sheets = [{ id: "s1", stock: "ply-4x8", placements: [at("A", 0), at("A", 1), at("k", 0)] }];
    expect(describeGroupSpread(project)).toBe("Each unit and group is on one sheet.");
  });
});
