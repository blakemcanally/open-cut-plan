import { describe, expect, it } from "vitest";
import { CATALOG, createProject, nominalInches, nominalThickness, nominalThicknessText, type Material, type Project } from "../../src/index.ts";

function project(materials: Material[], units: "in" | "mm" = "in"): Project {
  return { ...createProject("Test", units), materials };
}

const ply = (patch: Partial<Material> = {}): Material => ({ id: "ply", name: "Plywood", thickness: 0.75, grained: true, ...patch });

describe("nominalInches", () => {
  it("reads inch fractions, trade sizes, and nothing from millimetres", () => {
    expect(nominalInches('3/4"')).toBe(0.75);
    expect(nominalInches('1/2" (15/32")')).toBe(0.5);
    expect(nominalInches('1/4" (5.2 mm)')).toBe(0.25);
    expect(nominalInches("1x")).toBe(1);
    expect(nominalInches("2x")).toBe(2);
    expect(nominalInches("18 mm")).toBeNull();
  });
});

describe("nominalThickness", () => {
  it("gives the likely actual thicknesses of 3/4 inch, the most common first, then in catalogue order", () => {
    expect(nominalThickness(project([ply()]), "ply")).toEqual({ nominal: '3/4"', value: 0.75, likely: [45 / 64, 11 / 16, 23 / 32, 47 / 64] });
  });

  it("gives the likely thicknesses of 1/2 inch, 1x, and 2x", () => {
    expect(nominalThickness(project([ply({ thickness: 0.5 })]), "ply")!.likely).toEqual([15 / 32, 7 / 16]);
    expect(nominalThickness(project([ply({ thickness: 1 })]), "ply")).toEqual({ nominal: "1x", value: 1, likely: [0.75] });
    expect(nominalThickness(project([ply({ thickness: 2 })]), "ply")).toEqual({ nominal: "2x", value: 2, likely: [1.5] });
  });

  it("uses a tolerance of 0.005 inch", () => {
    expect(nominalThickness(project([ply({ thickness: 0.754 })]), "ply")).not.toBeNull();
    expect(nominalThickness(project([ply({ thickness: 0.756 })]), "ply")).toBeNull();
  });

  it("gives nothing in a millimetre project, for a thickness that is not nominal, or for a measured material", () => {
    expect(nominalThickness(project([ply({ thickness: 19.05 })], "mm"), "ply")).toBeNull();
    expect(nominalThickness(project([ply({ thickness: 45 / 64 })]), "ply")).toBeNull();
    expect(nominalThickness(project([ply({ measured: true })]), "ply")).toBeNull();
    expect(nominalThickness(project([ply()]), "gone")).toBeNull();
  });

  it("gives nothing for a catalogue material at its catalogue thickness, found by id or by name, for each material", () => {
    expect(nominalThickness(project([ply({ id: "mdf-3-4", name: "Board" })]), "mdf-3-4")).toBeNull();
    const two = project([ply({ id: "a", name: 'MDF 3/4"' }), ply({ id: "b", name: 'mdf 3/4"' })]);
    expect(nominalThickness(two, "a")).toBeNull();
    expect(nominalThickness(two, "b")).toBeNull();
  });

  it("warns for a catalogue name at a thickness that is not the catalogue thickness", () => {
    expect(nominalThickness(project([ply({ name: 'Birch plywood 3/4"' })]), "ply")).not.toBeNull();
  });

  it("warns for a measured value that is equal to another nominal value, until the material is measured", () => {
    expect(nominalThickness(project([ply({ thickness: 3 / 16 })]), "ply")).toMatchObject({ nominal: '3/16"' });
    expect(nominalThickness(project([ply({ thickness: 3 / 16, measured: true })]), "ply")).toBeNull();
  });

  it("gives no likely thickness that is equal to the nominal value", () => {
    for (const thickness of [0.125, 0.25, 0.5, 0.75, 1, 2]) {
      const result = nominalThickness(project([ply({ thickness })]), "ply");
      if (result) expect(result.likely.every((value) => Math.abs(value - thickness) > 0.005), String(thickness)).toBe(true);
    }
  });
});

describe("nominalThicknessText", () => {
  it("names the nominal thickness and at most two likely thicknesses", () => {
    expect(nominalThicknessText(project([ply()]), "ply")).toBe('3/4" is a nominal thickness. Stock sold as 3/4" is often 45/64" or 11/16" thick.');
    expect(nominalThicknessText(project([ply({ thickness: 1 })]), "ply")).toBe('1" is a nominal thickness. Stock sold as 1x is often 3/4" thick.');
    expect(nominalThicknessText(project([ply({ measured: true })]), "ply")).toBeNull();
  });
});

describe("catalogue nominal values", () => {
  it("reads the nominal value of each material that has no metric nominal", () => {
    for (const material of CATALOG.filter((entry) => !entry.nominal.endsWith("mm"))) expect(nominalInches(material.nominal), material.id).not.toBeNull();
  });
});
