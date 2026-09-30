import { describe, expect, it } from "vitest";
import { fitScale, SHEET_CHROME, SHEET_GAP } from "../src/layout/fit.ts";

const square = { length: 60, width: 60 };

describe("fitScale", () => {
  it("puts many sheets in rows so that all of them fit on the screen", () => {
    const scale = fitScale(square, 7, { width: 1092, height: 780 });
    expect(scale).toBeCloseTo((1092 - 3 * SHEET_GAP) / 4 / 60 - SHEET_CHROME.x / 60);
    const card = 60 * scale + SHEET_CHROME.x;
    expect(4 * card + 3 * SHEET_GAP).toBeLessThanOrEqual(1092);
    expect(2 * (60 * scale + SHEET_CHROME.y) + SHEET_GAP).toBeLessThanOrEqual(780);
  });

  it("puts two long sheets one above the other when that gives the larger drawing", () => {
    expect(fitScale({ length: 2440, width: 1220 }, 2, { width: 1092, height: 780 })).toBeCloseTo(((780 - SHEET_GAP) / 2 - SHEET_CHROME.y) / 1220);
  });

  it("fills the width with one sheet, unless the window is too low", () => {
    const sheet = { length: 96, width: 48 };
    expect(fitScale(sheet, 1, { width: 800, height: 1000 })).toBeCloseTo((800 - SHEET_CHROME.x) / 96);
    expect(fitScale(sheet, 1, { width: 800, height: 360 })).toBeCloseTo((360 - SHEET_CHROME.y) / 48);
    expect(fitScale(sheet, 0, { width: 800, height: 1000 })).toBeCloseTo((800 - SHEET_CHROME.x) / 96);
  });

  it("keeps each sheet at least 200 px long when all the sheets cannot fit, and fills the rows so the page scrolls", () => {
    const scale = fitScale(square, 30, { width: 1092, height: 780 });
    expect(scale).toBeCloseTo((1092 - 3 * SHEET_GAP) / 4 / 60 - SHEET_CHROME.x / 60);
    expect(60 * scale).toBeGreaterThanOrEqual(200);
  });

  it("gives one sheet the full width of a phone when the sheets cannot all fit", () => {
    expect(fitScale(square, 7, { width: 370, height: 704 })).toBeCloseTo((370 - SHEET_CHROME.x) / 60);
  });

  it("gives narrow boards the full width, because they cannot be 120 px high in two columns", () => {
    expect(fitScale({ length: 96, width: 6 }, 20, { width: 1092, height: 780 })).toBeCloseTo((1092 - SHEET_CHROME.x) / 96);
    expect(fitScale({ length: 96, width: 6 }, 20, { width: 2400, height: 780 })).toBeCloseTo((2400 - SHEET_CHROME.x) / 96);
  });

  it("is never wider than the column", () => {
    expect(fitScale(square, 1, { width: 150, height: 1000 })).toBeCloseTo((150 - SHEET_CHROME.x) / 60);
  });
});
