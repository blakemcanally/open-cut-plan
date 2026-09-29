import { describe, expect, it } from "vitest";
import { slugify, uniqueId } from "../../src/index.ts";

describe("slugify", () => {
  it.each([
    ["A Top", "a-top"],
    ["Baltic birch 18mm 60x60", "baltic-birch-18mm-60x60"],
    ["  Étagère — côté  ", "etagere-cote"],
    ["***", "item"],
  ])("%j is %j", (text, expected) => {
    expect(slugify(text)).toBe(expected);
  });
});

describe("uniqueId", () => {
  it("adds the first free suffix", () => {
    expect(uniqueId("side", new Set())).toBe("side");
    expect(uniqueId("side", new Set(["side"]))).toBe("side-2");
    expect(uniqueId("side", new Set(["side", "side-2"]))).toBe("side-3");
  });
});
