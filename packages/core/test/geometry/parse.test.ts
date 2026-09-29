import { describe, expect, it } from "vitest";
import { parseLength, parsePlainNumber, type Units } from "../../src/index.ts";

describe("parseLength", () => {
  it.each<[string, Units, number]>([
    ["15.5", "in", 15.5],
    [".75", "in", 0.75],
    ["3/8", "in", 0.375],
    ["15 3/8", "in", 15.375],
    ["15-3/8", "in", 15.375],
    ['15 3/8"', "in", 15.375],
    ["15⅜", "in", 15.375],
    ["15 ⅜″", "in", 15.375],
    ["42 19/32 in", "in", 42.59375],
    ["0.75 inch", "in", 0.75],
    ["3 inches", "in", 3],
    ["5'", "in", 60],
    ["5 ft", "in", 60],
    ['4\' 6"', "in", 54],
    ['4\'-6 1/2"', "in", 54.5],
    ["4ft 6in", "in", 54],
    ["18", "mm", 18],
    ["1081,5", "mm", 1081.5],
    ["1081,5 mm", "mm", 1081.5],
    ["2,440", "mm", 2440],
    ["1,299.00", "mm", 1299],
    ["45.7cm", "mm", 457],
    ["1.2 m", "mm", 1200],
    ["15 3/8\u201D", "in", 15.375],
    ["5\u2019", "in", 60],
  ])("%s (%s) is %d", (text, units, expected) => {
    expect(parseLength(text, units)).toBeCloseTo(expected, 9);
  });

  it("converts between unit systems", () => {
    expect(parseLength("15 3/8", "mm")).toBeCloseTo(390.525, 9);
    expect(parseLength("457mm", "in")).toBeCloseTo(457 / 25.4, 9);
    expect(parseLength("5'", "mm")).toBeCloseTo(1524, 9);
  });

  it.each(["", "   ", "abc", "-5", "1/0", "12 apples", "3/8/2"])("rejects %j", (text) => {
    expect(parseLength(text, "in")).toBeNull();
  });

  it("rejects a number too large to be finite", () => {
    const huge = "9".repeat(400);
    for (const text of [huge, `${huge} mm`, `${huge}'`, `${huge}"`, `${huge} 1/2"`]) expect(parseLength(text, "in")).toBeNull();
  });
});

describe("parsePlainNumber", () => {
  it.each<[string, number | null]>([
    ["42", 42],
    ["0,5", 0.5],
    ["1,082", 1082],
    ["12,5", 12.5],
    ["1,299.00", 1299],
    ["2.0", 2],
    ["x", null],
    ["", null],
  ])("%j is %s", (text, expected) => {
    expect(parsePlainNumber(text)).toBe(expected);
  });

  it("rejects a number too large to be finite", () => {
    expect(parsePlainNumber("9".repeat(400))).toBeNull();
    expect(parsePlainNumber("9".repeat(400), { decimalComma: true })).toBeNull();
  });
});

describe("decimal commas", () => {
  it.each<[string, number | null]>([
    ["2.440", 2440],
    ["1.234,5", 1234.5],
    ["1.234.567", 1234567],
    ["2,440", 2.44],
    ["764,5", 764.5],
    ["12.5", 12.5],
    ["12.50", 12.5],
    ["42", 42],
    ["1,299.00", null],
    ["0.750", 0.75],
    ["0.125", 0.125],
    ["x", null],
  ])("%j is %s", (text, expected) => {
    expect(parsePlainNumber(text, { decimalComma: true })).toBe(expected);
  });

  it("passes the option through parseLength", () => {
    expect(parseLength("2.440", "mm", { decimalComma: true })).toBe(2440);
    expect(parseLength("2.440 mm", "mm", { decimalComma: true })).toBe(2440);
    expect(parseLength("1,22 m", "mm", { decimalComma: true })).toBeCloseTo(1220, 9);
    expect(parseLength("15 3/8", "in", { decimalComma: true })).toBe(15.375);
    expect(parseLength("2.440", "mm")).toBe(2.44);
    expect(parseLength("2,440 mm", "mm")).toBe(2.44);
  });
});
