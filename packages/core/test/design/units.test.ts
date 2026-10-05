import { describe, expect, it } from "vitest";
import { checkDesigns, convertProjectUnits, regenerateDesigns, snapLength, type DesignAxis, type Project } from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";

function openings(axis: DesignAxis): number[] {
  if (!("openings" in axis)) throw new Error("expected an openings axis");
  return axis.openings;
}

function placed(project: Project): Project {
  const placements = project.parts.map((part) => ({ part: part.id, copy: 0, x: 0, y: 0, rotated: false }));
  return { ...project, plan: { sheets: [{ id: "s1", stock: "ply18-sheet", placements }] } };
}

describe("convertProjectUnits with designs", () => {
  it("converts design lengths, and the parts stay current and placed", () => {
    const mm = placed(regenerateDesigns(designProject([kallaxDesign(), eketDesign()])));
    const inches = convertProjectUnits(mm, "in");
    const [kallax, eket] = inches.designs!;
    expect(kallax!.width).toEqual({ openings: [13.188976377952756, 13.188976377952756] });
    expect(kallax!.depth).toBe(15.354330708661417);
    expect(eket!.width).toEqual({ outside: 27.559055118110237, cells: 2 });
    expect(eket!.quantity).toBe(2);
    expect(eket!.back).toEqual({ material: "ply6" });
    expect(regenerateDesigns(inches)).toBe(inches);
    expect(checkDesigns(inches)).toEqual([]);
    expect(inches.plan!.sheets[0]!.placements).toHaveLength(mm.parts.length);
  });

  it("comes back to the same millimetres", () => {
    const back = convertProjectUnits(convertProjectUnits(regenerateDesigns(designProject()), "in"), "mm");
    for (const value of openings(back.designs![0]!.width)) expect(value).toBeCloseTo(335, 6);
    expect(regenerateDesigns(back)).toBe(back);
  });

  it("puts each converted length on the grid, so that a conversion to inches and back gives the same project", () => {
    const project = regenerateDesigns(designProject([kallaxDesign()]));
    const inches = convertProjectUnits(project, "in");
    expect(inches.parts.length).toBeGreaterThan(0);
    for (const part of inches.parts) {
      expect(snapLength(part.length, "in")).toBe(part.length);
      expect(snapLength(part.width, "in")).toBe(part.width);
    }
    expect(convertProjectUnits(inches, "mm")).toEqual(project);
  });
});
