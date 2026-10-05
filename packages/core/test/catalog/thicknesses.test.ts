import { describe, expect, it } from "vitest";
import { CATALOG, CATALOG_FAMILIES, catalogMaterial, catalogShortName, catalogThicknesses, sameThickness } from "../../src/index.ts";

describe("catalogShortName", () => {
  it("drops the thickness, and the last word of the family", () => {
    const short = (id: string) => catalogShortName(catalogMaterial(id)!);
    expect(short("birch-ply-3-4")).toBe("Birch");
    expect(short("cdx-ply-23-32")).toBe("CDX");
    expect(short("baltic-birch-18mm")).toBe("Baltic birch");
    expect(short("mdf-3-4")).toBe("MDF");
    expect(short("common-pine-1x")).toBe("Common pine");
    expect(short("whitewood-2x")).toBe("Whitewood");
  });
});

describe("catalogThicknesses", () => {
  it("has one group for each family, in catalogue order", () => {
    expect(catalogThicknesses("in").map((group) => group.family)).toEqual(CATALOG_FAMILIES);
  });

  it("gives one option for each nominal value and thickness, thin to thick, with the short names", () => {
    const hardwood = catalogThicknesses("in").find((group) => group.family === "Hardwood plywood")!;
    expect(hardwood.options).toContainEqual({ nominal: '3/4"', thickness: 45 / 64, materials: ["Birch", "Red oak", "Maple", "Sanded"] });
    expect(hardwood.options).toContainEqual({ nominal: '1/4"', thickness: 3 / 16, materials: ["Birch", "Red oak"] });
    expect(hardwood.options).toContainEqual({ nominal: '1/4"', thickness: 0.22, materials: ["Maple"] });
    const thicknesses = hardwood.options.map((option) => option.thickness);
    expect(thicknesses).toEqual(thicknesses.toSorted((a, b) => a - b));
  });

  it("drops the part of the nominal value in brackets", () => {
    const construction = catalogThicknesses("in").find((group) => group.family === "Construction plywood")!;
    expect(construction.options.map((option) => option.nominal)).not.toContainEqual(expect.stringContaining("("));
  });

  it("gives the thicknesses in millimetres", () => {
    const baltic = catalogThicknesses("mm").find((group) => group.family === "Baltic birch plywood")!;
    expect(baltic.options.map((option) => option.thickness)).toEqual(["baltic-birch-6mm", "baltic-birch-12mm", "baltic-birch-18mm"].map((id) => catalogMaterial(id)!.thicknessMm));
    expect(baltic.options[2]).toMatchObject({ nominal: "18 mm", materials: ["Baltic birch"] });
  });

  it("names every catalogue material once", () => {
    expect(catalogThicknesses("in").flatMap((group) => group.options.flatMap((option) => option.materials)).length).toBe(CATALOG.length);
  });
});

describe("sameThickness", () => {
  it("uses the catalogue tolerance", () => {
    expect(sameThickness(45 / 64, 0.707, "in")).toBe(true);
    expect(sameThickness(45 / 64, 0.709, "in")).toBe(false);
    expect(sameThickness(18, 18.1, "mm")).toBe(true);
    expect(sameThickness(18, 18.2, "mm")).toBe(false);
  });
});
