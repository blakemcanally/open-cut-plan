import type { CombinedCell } from "../format/schema.ts";
import { roundLength, type DesignGeometry } from "./geometry.ts";

/** One divider or shelf board. A divider is on a column line, a shelf on a row line; `from` and `to` are the first and the last cell along the line, 0-based. */
export interface Board {
  kind: "divider" | "shelf";
  /** 1 to the cell count − 1: line j is between the 0-based cells j − 1 and j. */
  line: number;
  from: number;
  to: number;
}

export interface BoardLayout {
  /** By column line, then from the top. */
  dividers: Board[];
  /** By row line, then from the left. */
  shelves: Board[];
}

export interface Segments {
  /** The segment of column line `line` in row `row` exists. */
  divider(line: number, row: number): boolean;
  /** The segment of row line `line` in column `column` exists. */
  shelf(line: number, column: number): boolean;
}

export function segments(columns: number, rows: number, combined: readonly CombinedCell[]): Segments {
  const owner = Array.from({ length: rows }, () => Array.from({ length: columns }, () => -1));
  combined.forEach((span, index) => {
    for (let row = span.row - 1; row < Math.min(rows, span.row - 1 + span.rows); row++) {
      for (let column = span.column - 1; column < Math.min(columns, span.column - 1 + span.columns); column++) owner[row]![column] = index;
    }
  });
  const same = (row1: number, column1: number, row2: number, column2: number) => owner[row1]![column1] !== -1 && owner[row1]![column1] === owner[row2]![column2];
  return {
    divider: (line, row) => !same(row, line - 1, row, line),
    shelf: (line, column) => !same(line - 1, column, line, column),
  };
}

/**
 * The boards inside the box. At a junction, the divider runs through when its segments above and below both exist;
 * otherwise the shelf runs through. With no combined cells, this gives full-height dividers and one shelf per cell.
 */
export function boardLayout(columns: number, rows: number, combined: readonly CombinedCell[]): BoardLayout {
  const has = segments(columns, rows, combined);
  const dividers: Board[] = [];
  for (let line = 1; line < columns; line++) {
    let start = -1;
    for (let row = 0; row <= rows; row++) {
      const on = row < rows && has.divider(line, row);
      if (on && start < 0) start = row;
      if (!on && start >= 0) {
        dividers.push({ kind: "divider", line, from: start, to: row - 1 });
        start = -1;
      }
    }
  }
  const shelves: Board[] = [];
  for (let line = 1; line < rows; line++) {
    let start = -1;
    for (let column = 0; column <= columns; column++) {
      const on = column < columns && has.shelf(line, column);
      const cut = start >= 0 && (!on || (has.divider(column, line - 1) && has.divider(column, line)));
      if (cut) {
        shelves.push({ kind: "shelf", line, from: start, to: column - 1 });
        start = -1;
      }
      if (on && start < 0) start = column;
    }
  }
  return { dividers, shelves };
}

export function designLayout(geometry: DesignGeometry): BoardLayout {
  return boardLayout(geometry.columns.length, geometry.rows.length, geometry.combined ?? []);
}

/** The openings from `from` to `to`, and the thicknesses between them. */
export function spanLength(openings: readonly number[], from: number, to: number, thickness: number): number {
  let length = (to - from) * thickness;
  for (let index = from; index <= to; index++) length += openings[index]!;
  return roundLength(length);
}

export function boardLength(board: Board, geometry: DesignGeometry): number {
  return spanLength(board.kind === "divider" ? geometry.rows : geometry.columns, board.from, board.to, geometry.thickness);
}

/** The position of the near edge of each cell, from the outside edge of the box. */
export function cellStarts(openings: readonly number[], thickness: number): number[] {
  const starts: number[] = [];
  let at = 0;
  for (const opening of openings) {
    starts.push(roundLength(at + thickness));
    at = roundLength(at + thickness + opening);
  }
  return starts;
}

export interface FreeSpan {
  board: Board | "top";
  /** The longest length of the board between two supports: its ends and the dividers under it. */
  span: number;
}

/** The longest free span of the top and of each shelf board. A divider that stands on a board is not a support. */
export function freeSpans(geometry: DesignGeometry): FreeSpan[] {
  const { columns, rows, thickness } = geometry;
  const has = segments(columns.length, rows.length, geometry.combined ?? []);
  const { dividers, shelves } = designLayout(geometry);
  const longest = (from: number, to: number, supported: (line: number) => boolean) => {
    let start = from;
    let span = 0;
    for (let line = from + 1; line <= to + 1; line++) {
      if (line <= to && !supported(line)) continue;
      span = Math.max(span, spanLength(columns, start, line - 1, thickness));
      start = line;
    }
    return span;
  };
  const top = new Set(dividers.filter((board) => board.from === 0).map((board) => board.line));
  return [
    { board: "top", span: longest(0, columns.length - 1, (line) => top.has(line)) },
    ...shelves.map((board) => ({ board, span: longest(board.from, board.to, (line) => has.divider(line, board.line)) })),
  ];
}
