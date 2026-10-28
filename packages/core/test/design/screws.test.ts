import { describe, expect, it } from "vitest";
import { cleatScrew, faceScrew, woodScrew } from "../../src/design/screws.ts";

describe("face screws and cleat screws", () => {
  it('picks #8 × 2" face screws and #8 × 1 1/4" cleat screws for 3/4" stock', () => {
    expect(faceScrew(19.05, "in")).toBe('#8 × 2"');
    expect(cleatScrew(19.05, "in")).toBe('#8 × 1 1/4"');
  });

  it("picks 4 × 50 mm face screws and 4 × 30 mm cleat screws for 18 mm stock", () => {
    expect(faceScrew(18, "mm")).toBe("4 × 50 mm");
    expect(cleatScrew(18, "mm")).toBe("4 × 30 mm");
  });

  it("picks a length for stock outside the pocket chart", () => {
    expect(faceScrew(6.35, "in")).toBe('#8 × 1 1/2"');
    expect(faceScrew(44.45, "in")).toBe('#8 × 3"');
  });

  it("picks the nearest length and gives a tie to the longer screw", () => {
    expect(woodScrew(10, "in")).toBe('#8 × 1"');
    expect(woodScrew(500, "in")).toBe('#8 × 3"');
    expect(woodScrew(1.125 * 25.4, "in")).toBe('#8 × 1 1/4"');
    expect(woodScrew(32.5, "mm")).toBe("4 × 35 mm");
    expect(woodScrew(55, "mm")).toBe("4 × 60 mm");
  });
});
