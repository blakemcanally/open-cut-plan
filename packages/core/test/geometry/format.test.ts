import { describe, expect, it } from "vitest";
import { convertLength, DEFAULT_DISPLAY, formatArea, formatExactLength, formatLength, type InchPrecision, type MmPrecision } from "../../src/index.ts";

describe("convertLength", () => {
  it("converts between inches and millimetres", () => {
    expect(convertLength(60, "in", "mm")).toBeCloseTo(1524, 9);
    expect(convertLength(18, "mm", "in")).toBeCloseTo(0.708661, 6);
    expect(convertLength(12.5, "in", "in")).toBe(12.5);
  });
});

describe("formatLength in inches", () => {
  it.each<[number, InchPrecision, string]>([
    [42.59370078740158, 32, '~42 19/32"'],
    [15.375, 32, '15 3/8"'],
    [0.25, 16, '1/4"'],
    [60, 32, '60"'],
    [27.21, 8, '~27 1/4"'],
    [0.99, 8, '~1"'],
    [15.375, "decimal", '15.375"'],
    [-1.5, 32, '-1 1/2"'],
    [-0.001, 32, '~0"'],
    [-0.0001, "decimal", '~0"'],
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
    [1081.7, 0.5, "~1081.5 mm"],
    [1081.76, 0.1, "~1081.8 mm"],
    [18, 1, "18 mm"],
    [1082, 0.5, "1082 mm"],
    [0.35, 0.1, "~0.4 mm"],
  ])("%d at step %d is %s", (value, mm, expected) => {
    expect(formatLength(value, "mm", { inch: 32, mm })).toBe(expected);
  });
});

describe("the ~ before a rounded length", () => {
  it("shows ~ only when the display rounds the value", () => {
    expect(formatLength(45 / 64, "in", { inch: 32, mm: 1 })).toBe('~23/32"');
    expect(formatLength(45 / 64, "in", { inch: 64, mm: 1 })).toBe('45/64"');
    expect(formatLength(13.188976378, "in")).toBe('~13 3/16"');
    expect(formatLength(0.703, "in", { inch: "decimal", mm: 1 })).toBe('0.703"');
    expect(formatLength(1219.2, "mm")).toBe("~1219 mm");
    expect(formatLength(1219.2, "mm", { inch: 32, mm: 0.1 })).toBe("1219.2 mm");
    expect(formatLength(-0.3, "in", { inch: 8, mm: 1 })).toBe('~-1/4"');
  });
});

describe("formatExactLength", () => {
  it.each<[number, "in" | "mm", string]>([
    [45 / 64, "in", '45/64"'],
    [0.75, "in", '3/4"'],
    [28.625, "in", '28 5/8"'],
    [0.22, "in", '0.22"'],
    [18 / 25.4, "in", '~0.7087"'],
    [15 / 64, "in", '15/64"'],
    [18, "mm", "18 mm"],
    [17.9, "mm", "17.9 mm"],
    [1 / 3, "mm", "~0.333 mm"],
    [0, "in", '0"'],
  ])("%d %s is %s", (value, units, expected) => {
    expect(formatExactLength(value, units)).toBe(expected);
  });
});

describe("formatArea", () => {
  it("gives square feet for inch projects and square metres for mm projects", () => {
    expect(formatArea(96 * 48, "in")).toBe("32.0 sq ft");
    expect(formatArea(2440 * 1220, "mm")).toBe("2.98 m²");
  });
});
