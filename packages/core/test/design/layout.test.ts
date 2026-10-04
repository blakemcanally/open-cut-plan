import { describe, expect, it } from "vitest";
import { boardLayout, boardLength, designGeometry, designLayout, freeSpans, materialsById, type Board, type CombinedCell, type Design } from "../../src/index.ts";
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

describe("freeSpans", () => {
  const geometry = (columns: number, rows: number, combined: CombinedCell[], patch: Partial<Design> = {}) =>
    designGeometry(
      kallaxDesign({ width: { openings: Array.from({ length: columns }, () => 335) }, height: { openings: Array.from({ length: rows }, () => 335) }, combined, ...patch }),
      materialsById(designProject()),
    )!;
  const spans = (...args: Parameters<typeof freeSpans>) => freeSpans(...args).map((free) => [typeof free.board === "string" ? free.board : `${free.board.line}:${free.board.from}-${free.board.to}`, free.span]);

  it("gives the column openings with no combined cells, and leaves out the bottom of a unit on the floor", () => {
    expect(spans(geometry(3, 2, []))).toEqual([["1:0-0", 335], ["1:1-1", 335], ["1:2-2", 335], ["top", 335]]);
  });

  it("counts a divider that stands on a shelf as a support for the board above when that shelf holds it (spec 14.2)", () => {
    const block = spans(geometry(4, 4, [span(2, 2, 2, 2)]));
    expect(block).toContainEqual(["top", 335]);
    expect(block).toContainEqual(["1:1-2", 335]);
    expect(block).toContainEqual(["3:1-2", 335]);
  });

  it("does not count a divider that stands on a shelf that can sag (spec 14.5)", () => {
    expect(spans(geometry(4, 2, [span(1, 2, 3, 1)]))).toEqual([["1:0-2", 1041], ["1:3-3", 335], ["top", 1041]]);
  });

  it("counts every divider as a support when the design has a back", () => {
    expect(spans(geometry(4, 2, [span(1, 2, 3, 1)]), { back: true })).toEqual([["1:0-2", 335], ["1:3-3", 335], ["top", 335]]);
  });

  it("hangs the dividers from the top on the wall rail, and checks the bottom", () => {
    expect(spans(geometry(4, 2, [span(1, 2, 3, 1)]), { mount: "wall-rail" })).toEqual([["1:0-2", 335], ["1:3-3", 335], ["bottom", 1041]]);
    expect(spans(geometry(4, 2, []), { mount: "wall-rail" })).toEqual([["1:0-0", 335], ["1:1-1", 335], ["1:2-2", 335], ["1:3-3", 335], ["bottom", 335]]);
  });

  it("checks the bottom between the legs or the feet, and lets a short span hold the dividers", () => {
    for (const mount of ["legs", "feet"]) {
      expect(spans(geometry(3, 1, []), { mount })).toEqual([["bottom", 1041], ["top", 1041]]);
      expect(spans(geometry(3, 1, []), { mount, back: true })).toEqual([["bottom", 335], ["top", 335]]);
      expect(spans(geometry(2, 1, []), { mount })).toEqual([["bottom", 335], ["top", 335]]);
    }
  });

  it("treats a mount that this app does not know as the floor", () => {
    expect(spans(geometry(3, 1, []), { mount: "ceiling" })).toEqual([["top", 335]]);
  });

  it("lists the shelves from the lowest row line up", () => {
    expect(spans(geometry(1, 3, [])).map(([board]) => board)).toEqual(["2:0-0", "1:0-0", "top"]);
  });
});
