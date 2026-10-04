import { describe, expect, it } from "vitest";
import { boardLayout, boardLength, designGeometry, designLayout, materialsById, type Board, type CombinedCell } from "../../src/index.ts";
import { designProject, kallaxDesign } from "../helpers.ts";

const span = (column: number, row: number, columns: number, rows: number): CombinedCell => ({ column, row, columns, rows });
const divider = (line: number, from: number, to: number): Board => ({ kind: "divider", line, from, to });
const shelf = (line: number, from: number, to: number): Board => ({ kind: "shelf", line, from, to });

describe("boardLayout", () => {
  it("gives full dividers and one-cell shelves with no combined cells", () => {
    expect(boardLayout(3, 2, [])).toEqual({
      dividers: [divider(1, 0, 1), divider(2, 0, 1)],
      shelves: [shelf(1, 0, 0), shelf(1, 1, 1), shelf(1, 2, 2)],
    });
    expect(boardLayout(1, 1, [])).toEqual({ dividers: [], shelves: [] });
  });

  it("runs the shelf under two cells combined in the top row of a KALLAX 4x2 (spec 14.1)", () => {
    expect(boardLayout(4, 2, [span(1, 1, 2, 1)])).toEqual({
      dividers: [divider(1, 1, 1), divider(2, 0, 1), divider(3, 0, 1)],
      shelves: [shelf(1, 0, 1), shelf(1, 2, 2), shelf(1, 3, 3)],
    });
  });

  it("runs the shelves over and under a 2x2 block in a 4x4 (spec 14.2)", () => {
    expect(boardLayout(4, 4, [span(2, 2, 2, 2)])).toEqual({
      dividers: [divider(1, 0, 3), divider(2, 0, 0), divider(2, 3, 3), divider(3, 0, 3)],
      shelves: [shelf(1, 0, 0), shelf(1, 1, 2), shelf(1, 3, 3), shelf(2, 0, 0), shelf(2, 3, 3), shelf(3, 0, 0), shelf(3, 1, 2), shelf(3, 3, 3)],
    });
  });

  it("keeps the dividers along three cells combined in a column, and removes their shelves (spec 14.3)", () => {
    expect(boardLayout(3, 4, [span(2, 2, 1, 3)])).toEqual({
      dividers: [divider(1, 0, 3), divider(2, 0, 3)],
      shelves: [shelf(1, 0, 0), shelf(1, 1, 1), shelf(1, 2, 2), shelf(2, 0, 0), shelf(2, 2, 2), shelf(3, 0, 0), shelf(3, 2, 2)],
    });
  });

  it("makes a pinwheel of four boards around the center cell (spec 14.4)", () => {
    expect(boardLayout(3, 3, [span(1, 1, 2, 1), span(3, 1, 1, 2), span(2, 3, 2, 1), span(1, 2, 1, 2)])).toEqual({
      dividers: [divider(1, 1, 2), divider(2, 0, 1)],
      shelves: [shelf(1, 0, 1), shelf(2, 1, 2)],
    });
  });

  it("runs one shelf over three cells combined in the bottom row (spec 14.5)", () => {
    expect(boardLayout(4, 2, [span(1, 2, 3, 1)])).toEqual({
      dividers: [divider(1, 0, 0), divider(2, 0, 0), divider(3, 0, 1)],
      shelves: [shelf(1, 0, 2), shelf(1, 3, 3)],
    });
  });

  it("has no board inside a span over the full grid", () => {
    expect(boardLayout(4, 2, [span(1, 1, 4, 2)])).toEqual({ dividers: [], shelves: [] });
  });
});

describe("boardLength", () => {
  it("adds the openings and the thicknesses between them", () => {
    const design = kallaxDesign({ width: { openings: [335, 400, 335, 335] }, height: { openings: [335, 300] }, combined: [span(1, 1, 2, 1)] });
    const geometry = designGeometry(design, materialsById(designProject()))!;
    expect(geometry.combined).toEqual([span(1, 1, 2, 1)]);
    const layout = designLayout(geometry);
    expect(layout.shelves.map((board) => boardLength(board, geometry))).toEqual([753, 335, 335]);
    expect(layout.dividers.map((board) => boardLength(board, geometry))).toEqual([300, 653, 653]);
  });
});
