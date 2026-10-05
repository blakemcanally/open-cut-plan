import { describe, expect, it } from "vitest";
import { CATALOG, CATALOG_FAMILIES } from "../../src/index.ts";

const sizes = CATALOG.flatMap((material) => material.sizes.map((size) => ({ material, size })));

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
});
