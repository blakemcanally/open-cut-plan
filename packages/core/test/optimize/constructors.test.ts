import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import type { Project } from "../../src/format/schema.ts";
import { parseProject } from "../../src/format/parse.ts";
import { guillotinePack, SPLIT_RULES } from "../../src/optimize/guillotine.ts";
import type { PackInput, Packing } from "../../src/optimize/pack.ts";
import { buildProblem } from "../../src/optimize/problem.ts";
import { stripPack } from "../../src/optimize/strip.ts";
import { validatePlan } from "../../src/plan/validate.ts";
import { sampleProject } from "../helpers.ts";

function load(name: string): Project {
  const result = parseProject(EXAMPLES[name]!());
  if (!result.ok) throw new Error(name);
  return result.project;
}

function inputs(project: Project, material = 0): PackInput {
  const problem = buildProblem({ ...project, plan: { sheets: [] } });
  const m = problem.materials[material]!;
  const order = [...m.copies].sort((a, b) => b.part.length * b.part.width - a.part.length * a.part.width);
  return { ctx: problem.ctx, problem: m, order, stockOrder: m.stock, rotation: "keep" };
}

function errors(project: Project, packing: Packing): string[] {
  const sheets = packing.sheets.map((s, i) => ({ id: `s${i + 1}`, stock: s.stock.id, placements: s.placements }));
  return validatePlan({ ...project, plan: { sheets } })
    .filter((i) => i.severity === "error")
    .map((i) => i.code);
}

const packers: [string, (input: PackInput) => Packing][] = [
  ["strip", stripPack],
  ...SPLIT_RULES.map((rule): [string, (input: PackInput) => Packing] => [rule, (input) => guillotinePack(input, rule)]),
];

describe.each(packers)("%s packing", (_name, packer) => {
  it("packs the living-room shelf into valid guillotine sheets", () => {
    const project = load("living-room-shelf");
    for (const material of [0, 1]) {
      const packing = packer(inputs(project, material));
      expect(packing.unplaced).toEqual([]);
      expect(errors(project, packing)).toEqual([]);
    }
  });

  it("fills a sheet exactly: one kerf between parts and none at the usable edge", () => {
    const project = sampleProject();
    project.parts = [{ id: "p", name: "P", material: "ply", length: 47.6875, width: 23.6875, quantity: 4, grain: "length" }];
    const packing = packer(inputs(project));
    expect(packing.sheets).toHaveLength(1);
    expect(errors(project, packing)).toEqual([]);
  });

  it("reports copies past the stock quantity as no-stock", () => {
    const project = sampleProject();
    project.stock[0]!.quantity = 1;
    project.parts = [{ id: "p", name: "P", material: "ply", length: 90, width: 40, quantity: 3, grain: "length" }];
    const packing = packer(inputs(project));
    expect(packing.sheets).toHaveLength(1);
    expect(packing.unplaced.map((u) => [u.copy, u.reason])).toEqual([
      [1, "no-stock"],
      [2, "no-stock"],
    ]);
  });
});

describe("stripPack", () => {
  it("uses 5 sheets of 18mm and 2 of 6mm for the living-room shelf", () => {
    const project = load("living-room-shelf");
    expect([0, 1].map((m) => stripPack(inputs(project, m)).sheets.length)).toEqual([5, 2]);
  });

  it("re-rips a narrower part out of the rest of a segment", () => {
    const project = sampleProject();
    project.parts = [
      { id: "a", name: "A", material: "ply", length: 40, width: 20, quantity: 1, grain: "length" },
      { id: "b", name: "B", material: "ply", length: 30, width: 12, quantity: 1, grain: "length" },
      { id: "c", name: "C", material: "ply", length: 30, width: 7, quantity: 1, grain: "length" },
    ];
    const packing = stripPack(inputs(project));
    expect(packing.sheets[0]!.placements.map((p) => [p.part, p.x, p.y])).toEqual([
      ["a", 0.25, 0.25],
      ["b", 40.375, 0.25],
      ["c", 40.375, 12.375],
    ]);
    expect(errors(project, packing)).toEqual([]);
  });
});

describe("affinity for groups", () => {
  function grouped(parts: [id: string, length: number, width: number, group: string][]): Project {
    const project = sampleProject();
    project.parts = parts.map(([id, length, width, group]) => ({ id, name: id, material: "ply", length, width, quantity: 1, grain: "length", group }));
    return project;
  }
  const inOrder = (project: Project, affinity: boolean): PackInput => {
    const input = inputs(project);
    return { ...input, order: [...input.problem.copies], affinity };
  };
  const sheetsOf = (packing: Packing) => packing.sheets.map((s) => s.placements.map((p) => p.part).join(","));

  it("puts a guillotine part on an open sheet that holds its group before a sheet that it fills better", () => {
    const project = grouped([
      ["a1", 95.5, 30, "A"],
      ["b1", 95.5, 40, "B"],
      ["a2", 20, 7, "A"],
    ]);
    expect(sheetsOf(guillotinePack(inOrder(project, false), "short-axis"))).toEqual(["a1", "b1,a2"]);
    const packing = guillotinePack(inOrder(project, true), "short-axis");
    expect(sheetsOf(packing)).toEqual(["a1,a2", "b1"]);
    expect(errors(project, packing)).toEqual([]);
  });

  it("takes a strip part of a group that the sheet holds before the next part in the order", () => {
    const project = grouped([
      ["a1", 95.5, 30, "A"],
      ["b1", 95.5, 30, "B"],
      ["b2", 60, 15, "B"],
      ["a2", 60, 15, "A"],
    ]);
    expect(sheetsOf(stripPack(inOrder(project, false)))).toEqual(["a1,b2", "b1,a2"]);
    const packing = stripPack(inOrder(project, true));
    expect(sheetsOf(packing)).toEqual(["a1,a2", "b1,b2"]);
    expect(errors(project, packing)).toEqual([]);
  });
});
