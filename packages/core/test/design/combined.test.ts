import { describe, expect, it } from "vitest";
import {
  checkDesigns,
  combineCells,
  combinedAt,
  combinedErrors,
  designErrors,
  designParts,
  expandSelection,
  fitCombined,
  splitCells,
  type CombinedCell,
  type Design,
} from "../../src/index.ts";
import { designProject, kallaxDesign } from "../helpers.ts";

const span = (column: number, row: number, columns: number, rows: number): CombinedCell => ({ column, row, columns, rows });
const kallax4x2 = (combined?: CombinedCell[]): Design =>
  kallaxDesign({ width: { openings: [335, 335, 335, 335] }, height: { openings: [335, 335] }, ...(combined ? { combined } : {}) });

describe("combinedErrors", () => {
  it("accepts spans in the grid that do not overlap, and a span over the full grid", () => {
    expect(combinedErrors(kallax4x2([span(1, 1, 2, 1), span(3, 1, 1, 2), span(4, 1, 1, 2)]))).toEqual([]);
    expect(combinedErrors(kallax4x2([span(1, 1, 4, 2)]))).toEqual([]);
    expect(combinedErrors(kallax4x2())).toEqual([]);
  });

  it("refuses a span that is not in the grid", () => {
    expect(combinedErrors(kallax4x2([span(4, 1, 2, 1)]))).toEqual(["The combined cell at column 4, row 1 (2 × 1 cells) is not in the grid of 4 columns and 2 rows."]);
    expect(combinedErrors(kallax4x2([span(1, 2, 1, 2)]))).toHaveLength(1);
    expect(combinedErrors(kallax4x2([span(5, 3, 1, 1)]))).toHaveLength(1);
  });

  it("refuses a span of 1 cell", () => {
    expect(combinedErrors(kallax4x2([span(2, 2, 1, 1)]))).toEqual(["The combined cell at column 2, row 2 has only 1 cell. Combine 2 cells or more."]);
  });

  it("refuses spans that overlap", () => {
    expect(combinedErrors(kallax4x2([span(1, 1, 2, 2), span(2, 2, 2, 1)]))).toEqual(["The combined cells at column 1, row 1 and column 2, row 2 overlap."]);
  });

  it("stops the design from making parts", () => {
    const design = kallax4x2([span(1, 1, 2, 2), span(2, 2, 2, 1)]);
    const project = designProject([design]);
    expect(designErrors(project, design).map((issue) => [issue.severity, issue.code, issue.message])).toEqual([
      ["error", "design-combined", 'Design "Hall KALLAX" has a bad combined cell. The combined cells at column 1, row 1 and column 2, row 2 overlap.'],
    ]);
    expect(designParts(project, design)).toBeNull();
    expect(checkDesigns(project).map((issue) => issue.code)).toContain("design-combined");
  });
});

describe("fitCombined", () => {
  it("returns the same design when every span fits, or when there are none", () => {
    const design = kallax4x2([span(1, 1, 2, 1)]);
    expect(fitCombined(design)).toBe(design);
    const plain = kallax4x2();
    expect(fitCombined(plain)).toBe(plain);
  });

  it("makes a span that crosses the new edge shorter, and removes a span that is left with 1 cell or starts outside", () => {
    const design = kallax4x2([span(1, 1, 2, 2), span(3, 1, 2, 1), span(4, 2, 1, 1)]);
    const fitted = fitCombined({ ...design, width: { openings: [335, 335, 335] }, height: { openings: [335] } });
    expect(fitted.combined).toEqual([span(1, 1, 2, 1)]);
    const none = fitCombined({ ...design, width: { openings: [335] }, height: { openings: [335] } });
    expect("combined" in none).toBe(false);
  });

  it("does not make a span larger when the grid gets larger", () => {
    const design = kallax4x2([span(1, 1, 2, 1)]);
    expect(fitCombined({ ...design, width: { outside: 3000, cells: 8 } }).combined).toEqual([span(1, 1, 2, 1)]);
  });
});

describe("combine and split", () => {
  it("finds the span that holds a cell", () => {
    const design = kallax4x2([span(2, 1, 2, 2)]);
    expect(combinedAt(design, 3, 2)).toEqual(span(2, 1, 2, 2));
    expect(combinedAt(design, 1, 1)).toBeUndefined();
  });

  it("makes a selection larger until it holds each span that it touches", () => {
    const design = kallaxDesign({ width: { openings: [335, 335, 335, 335] }, height: { openings: [335, 335, 335] }, combined: [span(2, 1, 2, 1), span(3, 2, 2, 2)] });
    expect(expandSelection(design, span(1, 1, 2, 1))).toEqual(span(1, 1, 3, 1));
    expect(expandSelection(design, span(3, 1, 1, 2))).toEqual(span(2, 1, 3, 3));
    expect(expandSelection(design, span(1, 3, 1, 1))).toEqual(span(1, 3, 1, 1));
  });

  it("combines a selection and absorbs the spans in it", () => {
    const design = kallax4x2([span(1, 1, 2, 1), span(4, 1, 1, 2)]);
    expect(combineCells(design, span(1, 1, 1, 2))!.combined).toEqual([span(4, 1, 1, 2), span(1, 1, 2, 2)]);
    expect(combineCells(design, span(3, 2, 1, 1))).toBeNull();
    expect(combineCells(kallax4x2(), span(3, 2, 2, 1))!.combined).toEqual([span(3, 2, 2, 1)]);
  });

  it("splits the spans in a selection, and removes the field when none is left", () => {
    const design = kallax4x2([span(1, 1, 2, 1), span(4, 1, 1, 2)]);
    expect(splitCells(design, span(2, 1, 1, 1)).combined).toEqual([span(4, 1, 1, 2)]);
    expect("combined" in splitCells(design, span(1, 1, 4, 2))).toBe(false);
    expect(splitCells(design, span(3, 2, 1, 1))).toBe(design);
  });
});
