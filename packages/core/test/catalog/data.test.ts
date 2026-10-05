import { describe, expect, it } from "vitest";
import { CATALOG, CATALOG_FAMILIES } from "../../src/index.ts";

const sizes = CATALOG.flatMap((material) => material.sizes.map((size) => ({ material, size })));

const TRADE_WIDTHS: Readonly<Record<number, number>> = { 2: 1.5, 3: 2.5, 4: 3.5, 6: 5.5, 8: 7.25, 10: 9.25, 12: 11.25 };

describe("catalogue data", () => {
  it("has unique material ids, size ids, and material names", () => {
    const ids = [...CATALOG.map((material) => material.id), ...sizes.map(({ size }) => size.id)];
    expect(new Set(ids).size).toBe(ids.length);
    const names = CATALOG.map((material) => material.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("starts each size id with its material id and gives each material at least one size", () => {
    for (const material of CATALOG) {
      expect(material.sizes.length, material.id).toBeGreaterThan(0);
      for (const size of material.sizes) expect(size.id.startsWith(`${material.id}-`), size.id).toBe(true);
    }
  });

  it("uses only the listed families, and keeps the materials of a family together", () => {
    const order = CATALOG.map((material) => CATALOG_FAMILIES.indexOf(material.family));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(CATALOG.map((material) => material.family)).size).toBe(CATALOG_FAMILIES.length);
  });

  it("has a positive thickness that agrees in inches and millimetres", () => {
    for (const material of CATALOG) {
      expect(material.thicknessIn, material.id).toBeGreaterThan(0);
      expect(Math.abs(material.thicknessIn * 25.4 - material.thicknessMm), material.id).toBeLessThanOrEqual(0.06);
    }
  });

  it("has positive sizes with the length not less than the width, in inches and millimetres that agree", () => {
    for (const { size } of sizes) {
      expect(size.widthIn, size.id).toBeGreaterThan(0);
      expect(size.lengthIn, size.id).toBeGreaterThanOrEqual(size.widthIn);
      expect(size.lengthMm, size.id).toBeGreaterThanOrEqual(size.widthMm);
      expect(Math.abs(size.lengthIn * 25.4 - size.lengthMm), size.id).toBeLessThanOrEqual(1);
      expect(Math.abs(size.widthIn * 25.4 - size.widthMm), size.id).toBeLessThanOrEqual(1);
    }
  });

  it("gives each material its sizes from the largest to the smallest, with no two of the same size", () => {
    for (const material of CATALOG) {
      const areas = material.sizes.map((size) => size.lengthIn * size.widthIn);
      expect(areas, material.id).toEqual([...areas].sort((a, b) => b - a));
      const keys = material.sizes.map((size) => `${size.lengthIn}x${size.widthIn}`);
      expect(new Set(keys).size, material.id).toBe(keys.length);
    }
  });

  it("gives every listing a store, a source address, and the date it was checked", () => {
    for (const { size } of sizes) {
      expect(size.listings.length, size.id).toBeGreaterThan(0);
      for (const listing of size.listings) {
        expect(listing.store.trim(), size.id).not.toBe("");
        expect(listing.source, size.id).toMatch(/^https:\/\/[^\s]+$/);
        expect(listing.checked, size.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(Number.isNaN(Date.parse(listing.checked)), size.id).toBe(false);
      }
    }
  });

  it("has only positive prices", () => {
    const prices = sizes.flatMap(({ size }) => size.listings.flatMap((listing) => (listing.priceUsd === null ? [] : [listing.priceUsd])));
    expect(prices.length).toBeGreaterThan(0);
    expect(prices.filter((price) => !(price > 0))).toEqual([]);
  });

  it("has common sheet goods", () => {
    const names = CATALOG.map((material) => material.name);
    expect(names).toEqual(expect.arrayContaining(['Birch plywood 3/4"', 'Baltic birch 3/4" (18 mm)', 'MDF 3/4"', 'White melamine 3/4"', 'Tempered hardboard 1/8"']));
    expect(CATALOG.find((material) => material.id === "baltic-birch-18mm")!.sizes[0]).toMatchObject({ label: "5 × 5 ft", lengthMm: 1525, widthMm: 1525 });
  });

  it("gives a thickness that is a rounded 64th of an inch as the exact 64th", () => {
    for (const material of CATALOG) {
      const t = material.thicknessIn;
      const near = Math.round(t * 64) / 64;
      if (Math.abs(t - near) <= 0.0005) expect(t, material.id).toBe(near);
    }
  });

  it("has the common thicknesses from 1/8 to 3/4 inch", () => {
    const ids = CATALOG.map((material) => material.id);
    expect(ids).toEqual(
      expect.arrayContaining(["birch-ply-1-8", "cdx-ply-11-32", "cdx-ply-19-32", "pine-ply-11-32", "pine-ply-19-32", "mdf-5-8", "particleboard-5-8", "hardboard-white-1-8"]),
    );
  });

  it("gives edges only as factory", () => {
    for (const material of CATALOG) expect([undefined, "factory"], material.id).toContain(material.edges);
  });

  it("gives each board the actual width of its trade size, and a label and id from the trade size", () => {
    for (const material of CATALOG.filter((entry) => entry.edges === "factory")) {
      for (const size of material.sizes) {
        const match = /^([12])x(\d+) × /.exec(size.label);
        expect(match, size.id).not.toBeNull();
        expect(`${match![1]}x`, size.id).toBe(material.nominal);
        expect(TRADE_WIDTHS[Number(match![2])], size.id).toBe(Math.min(size.widthIn, size.lengthIn));
        expect(size.id.startsWith(`${material.id}-${match![1]}x${match![2]}-`), size.id).toBe(true);
      }
    }
  });

  it("has common and select pine 1x boards from 1x2 to 1x12", () => {
    for (const id of ["common-pine-1x", "select-pine-1x"]) {
      const material = CATALOG.find((entry) => entry.id === id)!;
      expect(material).toMatchObject({ family: "Pine boards", nominal: "1x", thicknessIn: 0.75, thicknessMm: 19.1, grained: true, edges: "factory" });
      const trades = new Set(material.sizes.map((size) => size.label.split(" × ")[0]));
      const expected = id === "select-pine-1x" ? ["1x2", "1x3", "1x4", "1x6", "1x8", "1x10", "1x12"] : ["1x2", "1x4", "1x6", "1x8", "1x10", "1x12"];
      expect(trades, id).toEqual(new Set(expected));
    }
    expect(CATALOG.find((entry) => entry.id === "common-pine-1x")!.sizes.find((size) => size.id === "common-pine-1x-1x4-8ft")).toMatchObject({
      label: "1x4 × 8 ft",
      lengthIn: 96,
      widthIn: 3.5,
      lengthMm: 2438,
      widthMm: 89,
    });
  });

  it("has 2x framing lumber from 2x2 to 2x12, with the precut stud lengths", () => {
    const material = CATALOG.find((entry) => entry.id === "whitewood-2x")!;
    expect(material).toMatchObject({ family: "Framing lumber", name: "Whitewood 2x (SPF)", nominal: "2x", thicknessIn: 1.5, thicknessMm: 38.1, grained: true, edges: "factory" });
    expect(new Set(material.sizes.map((size) => size.label.split(" × ")[0]))).toEqual(new Set(["2x2", "2x3", "2x4", "2x6", "2x8", "2x10", "2x12"]));
    expect(material.sizes.find((size) => size.id === "whitewood-2x-2x4-92-5-8in")).toMatchObject({ label: "2x4 × 92 5/8 in", lengthIn: 92.625, widthIn: 3.5 });
  });
});
