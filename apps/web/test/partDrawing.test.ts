import { describe, expect, it } from "vitest";
import { fitPartLabel, LABEL_MIN_FONT, overlaps, textWidth } from "../src/layout/partDrawing.ts";

describe("overlaps", () => {
  it("gives the area that each pair of parts shares, and the parts that share an area", () => {
    const rects = [
      { x: 0, y: 0, length: 10, width: 10 },
      { x: 5, y: 5, length: 10, width: 10 },
      { x: 10, y: 0, length: 5, width: 5 },
      { x: 30, y: 30, length: 5, width: 5 },
      { x: 12, y: 12, length: 2, width: 2 },
    ];
    expect(overlaps(rects)).toEqual({
      areas: [
        { x: 5, y: 5, length: 5, width: 5 },
        { x: 12, y: 12, length: 2, width: 2 },
      ],
      parts: new Set([0, 1, 4]),
    });
  });

  it("skips missing parts, and parts that only touch", () => {
    expect(overlaps([null, { x: 0, y: 0, length: 5, width: 5 }, { x: 5, y: 0, length: 5, width: 5 }])).toEqual({ areas: [], parts: new Set() });
  });
});

describe("fitPartLabel", () => {
  it("gives the name and the size on a part with room for both", () => {
    expect(fitPartLabel(200, 100, "Side 1", '30" × 12"')).toEqual({ name: "Side 1", size: '30" × 12"', font: 12, vertical: false });
  });

  it("gives the name only, then a smaller font, when the part is too low or too narrow for more", () => {
    expect(fitPartLabel(200, 20, "Side 1", '30" × 12"')).toMatchObject({ name: "Side 1", size: null, vertical: false });
    const narrow = fitPartLabel(48, 30, "Long shelf name", '30" × 12"');
    expect(narrow).toMatchObject({ vertical: false });
    expect(narrow!.font).toBeGreaterThanOrEqual(LABEL_MIN_FONT);
    const widest = Math.max(textWidth(narrow!.name ?? "", narrow!.font), textWidth(narrow!.size ?? "", narrow!.font));
    expect(widest).toBeLessThanOrEqual(48);
  });

  it("gives the size only when the name does not fit and the size does", () => {
    expect(fitPartLabel(40, 14, "A very long part name", "2 × 3")).toMatchObject({ name: null, size: "2 × 3" });
  });

  it("turns the label on a tall narrow part", () => {
    expect(fitPartLabel(14, 160, "Stile 1", '30" × 2"')).toMatchObject({ name: "Stile 1", vertical: true });
  });

  it("gives no label when nothing fits", () => {
    expect(fitPartLabel(10, 8, "Side 1", '30" × 12"')).toBeNull();
  });
});
