import { describe, expect, it } from "vitest";
import { checkDesigns, convertProjectUnits, regenerateDesigns, type DesignAxis, type Project } from "../../src/index.ts";
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
    expect(kallax!.width).toEqual({ openings: [13.188976378, 13.188976378] });
    expect(kallax!.depth).toBe(15.354330709);
    expect(eket!.width).toEqual({ outside: 27.559055118, cells: 2 });
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
});
