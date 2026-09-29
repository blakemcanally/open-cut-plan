import { describe, expect, it } from "vitest";
import { area, contains, fitsWithin, gapAlong, inset, otherAxis, sameRect, sizeAlong, span, withSpan, type Rect } from "../../src/index.ts";

const r = (x: number, y: number, length: number, width: number): Rect => ({ x, y, length, width });

describe("rect helpers", () => {
  it("measures spans and sizes along each axis", () => {
    const rect = r(1, 2, 10, 5);
    expect(span(rect, "x")).toEqual([1, 11]);
    expect(span(rect, "y")).toEqual([2, 7]);
    expect(sizeAlong(rect, "x")).toBe(10);
    expect(sizeAlong(rect, "y")).toBe(5);
    expect(otherAxis("x")).toBe("y");
    expect(area(rect)).toBe(50);
  });

  it("replaces the span along one axis", () => {
    expect(withSpan(r(0, 0, 10, 5), "x", 2, 4)).toEqual(r(2, 0, 2, 5));
    expect(withSpan(r(0, 0, 10, 5), "y", 1, 3)).toEqual(r(0, 1, 10, 2));
  });

  it("gives the gap between rectangles, negative when they overlap", () => {
    expect(gapAlong(r(0, 0, 10, 5), r(12, 0, 3, 5), "x")).toBe(2);
    expect(gapAlong(r(12, 0, 3, 5), r(0, 0, 10, 5), "x")).toBe(2);
    expect(gapAlong(r(0, 0, 10, 5), r(8, 0, 3, 5), "x")).toBe(-2);
  });

  it("insets, compares, and checks containment with a tolerance", () => {
    expect(inset(r(0, 0, 96, 48), 0.25)).toEqual(r(0.25, 0.25, 95.5, 47.5));
    expect(contains(r(0, 0, 10, 10), r(0, 0, 10 + 1e-9, 10))).toBe(true);
    expect(contains(r(0, 0, 10, 10), r(0, 0, 10.001, 10))).toBe(false);
    expect(sameRect(r(0.1 + 0.2, 0, 1, 1), r(0.3, 0, 1, 1))).toBe(true);
  });

  it("fits a size in either orientation", () => {
    expect(fitsWithin({ length: 20, width: 40 }, { length: 48, width: 24 })).toBe(true);
    expect(fitsWithin({ length: 30, width: 30 }, { length: 48, width: 24 })).toBe(false);
  });
});
