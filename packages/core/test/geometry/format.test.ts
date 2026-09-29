import { describe, expect, it } from "vitest";
import { convertLength, DEFAULT_DISPLAY, formatArea, formatLength, type InchPrecision, type MmPrecision } from "../../src/index.ts";

describe("convertLength", () => {
  it("converts between inches and millimetres", () => {
    expect(convertLength(60, "in", "mm")).toBeCloseTo(1524, 9);
    expect(convertLength(18, "mm", "in")).toBeCloseTo(0.708661, 6);
    expect(convertLength(12.5, "in", "in")).toBe(12.5);
  });
});

describe("formatLength in inches", () => {
  it.each<[number, InchPrecision, string]>([
    [42.59370078740158, 32, '42 19/32"'],
    [15.375, 32, '15 3/8"'],
    [0.25, 16, '1/4"'],
    [60, 32, '60"'],
    [27.21, 8, '27 1/4"'],
    [0.99, 8, '1"'],
    [15.375, "decimal", '15.375"'],
    [-1.5, 32, '-1 1/2"'],
    [-0.001, 32, '0"'],
    [-0.0001, "decimal", '0"'],
    [42.5, "decimal", '42.5"'],
  ])("%d at %s is %s", (value, inch, expected) => {
    expect(formatLength(value, "in", { inch, mm: 1 })).toBe(expected);
  });

  it("uses 1/32 by default", () => {
    expect(DEFAULT_DISPLAY).toEqual({ inch: 32, mm: 0.5 });
    expect(formatLength(28.625, "in")).toBe('28 5/8"');
  });
});

describe("formatLength in millimetres", () => {
  it.each<[number, MmPrecision, string]>([
    [1081.5, 0.5, "1081.5 mm"],
    [1081.7, 0.5, "1081.5 mm"],
    [1081.76, 0.1, "1081.8 mm"],
    [18, 1, "18 mm"],
    [1082, 0.5, "1082 mm"],
    [0.35, 0.1, "0.4 mm"],
  ])("%d at step %d is %s", (value, mm, expected) => {
    expect(formatLength(value, "mm", { inch: 32, mm })).toBe(expected);
  });
});

describe("formatArea", () => {
  it("gives square feet for inch projects and square metres for mm projects", () => {
    expect(formatArea(96 * 48, "in")).toBe("32.0 sq ft");
    expect(formatArea(2440 * 1220, "mm")).toBe("2.98 m²");
  });
});
