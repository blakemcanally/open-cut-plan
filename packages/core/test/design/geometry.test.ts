import { describe, expect, it } from "vitest";
import { axisOpenings, designGeometry, isDesignMount, isDesignSystem, materialsById, presetDesign } from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";

describe("presetDesign", () => {
  it("makes a KALLAX 2×4 with 335 mm cells and a 390 mm depth", () => {
    expect(presetDesign({ system: "kallax", id: "kx", name: "Hall KALLAX", material: "ply18", cols: 2, rows: 4, units: "mm" })).toEqual(kallaxDesign());
  });

  it("makes an EKET 1×2 from 350 mm modules", () => {
    expect(presetDesign({ system: "eket", id: "ek", name: "Tall EKET", material: "ply18", cols: 1, rows: 2, units: "mm" })).toEqual({
      id: "ek",
      name: "Tall EKET",
      system: "eket",
      material: "ply18",
      width: { outside: 350, cells: 1 },
      height: { outside: 700, cells: 2 },
      depth: 350,
    });
  });

  it("converts the preset numbers to inches", () => {
    const kallax = presetDesign({ system: "kallax", id: "kx", name: "K", material: "ply", cols: 1, rows: 1, units: "in" });
    expect(kallax.width).toEqual({ openings: [13.188976378] });
    expect(kallax.depth).toBe(15.354330709);
    const eket = presetDesign({ system: "eket", id: "ek", name: "E", material: "ply", cols: 2, rows: 1, units: "in" });
    expect(eket.width).toEqual({ outside: 27.559055118, cells: 2 });
    expect(eket.depth).toBe(13.779527559);
  });
});

describe("known values", () => {
  it("knows the systems and mounts of the spec", () => {
    expect(["kallax", "eket", "custom"].every(isDesignSystem)).toBe(true);
    expect(isDesignSystem("pax")).toBe(false);
    expect(["floor", "legs", "feet", "wall-rail"].every(isDesignMount)).toBe(true);
    expect(isDesignMount("ceiling")).toBe(false);
  });
});

describe("designGeometry", () => {
  it("adds the openings and the panels for a KALLAX 2×4", () => {
    const project = designProject();
    expect(designGeometry(kallaxDesign(), materialsById(project))).toEqual({
      thickness: 18,
      backThickness: 0,
      columns: [335, 335],
      rows: [335, 335, 335, 335],
      outsideWidth: 724,
      outsideHeight: 1430,
      depth: 390,
      panelDepth: 390,
    });
  });

  it("divides an outside size equally, and takes the back off the panel depth", () => {
    const project = designProject();
    expect(designGeometry(eketDesign(), materialsById(project))).toEqual({
      thickness: 18,
      backThickness: 6,
      columns: [323, 323],
      rows: [314],
      outsideWidth: 700,
      outsideHeight: 350,
      depth: 350,
      panelDepth: 344,
    });
  });

  it("divides an outside size equally with a fractional thickness", () => {
    const outside = 27.559055118;
    const openings = axisOpenings({ outside, cells: 2 }, 0.71875);
    expect(openings[0]).toBe(openings[1]);
    expect(openings[0]! * 2 + 3 * 0.71875).toBeCloseTo(outside, 8);
  });

  it("returns null when the material or the back material does not exist", () => {
    const materials = materialsById(designProject());
    expect(designGeometry(kallaxDesign({ material: "gone" }), materials)).toBeNull();
    expect(designGeometry(eketDesign({ back: { material: "gone" } }), materials)).toBeNull();
  });

  it("gives an opening of 0 or less when the outside size is too small", () => {
    expect(axisOpenings({ outside: 30, cells: 1 }, 18)).toEqual([-6]);
  });
});
