import { describe, expect, it } from "vitest";
import { convertLength, fromNm, NM_PER_UNIT, snapLength, toNm } from "../../src/index.ts";

describe("the nanometre grid", () => {
  it("holds 1/64 inch, 0.001 inch, and 0.1 mm as whole numbers", () => {
    expect(NM_PER_UNIT).toEqual({ in: 25_400_000, mm: 1_000_000 });
    expect(toNm(1 / 64, "in")).toBe(396_875);
    expect(toNm(0.001, "in")).toBe(25_400);
    expect(toNm(0.1, "mm")).toBe(100_000);
    expect(fromNm(396_875, "in")).toBe(1 / 64);
  });

  it("removes the error of arithmetic", () => {
    expect(snapLength(5 * (0.75 - 0.703), "in")).toBe(0.235);
    expect(snapLength(0.1 + 0.2, "mm")).toBe(0.3);
    expect(snapLength(5 * (0.75 - 45 / 64), "in")).toBe(15 / 64);
  });

  it("gives the same value again for a value on the grid", () => {
    for (const value of [0.75, 45 / 64, 13.188976378, 1219.2, 0.1]) {
      const snapped = snapLength(value, "in");
      expect(snapLength(snapped, "in")).toBe(snapped);
    }
  });

  it("converts millimetres to inches and back with no change", () => {
    for (const mm of [18, 1219.2, 335, 0.1, 2438, 17.9]) {
      const inches = snapLength(convertLength(mm, "mm", "in"), "in");
      expect(snapLength(convertLength(inches, "in", "mm"), "mm")).toBe(mm);
    }
  });

  it("writes and reads a value on the grid through JSON with no change", () => {
    const values = [snapLength(18 / 25.4, "in"), snapLength(13.188976378, "in"), 45 / 64, 1219.2];
    expect(JSON.parse(JSON.stringify(values))).toEqual(values);
  });
});
