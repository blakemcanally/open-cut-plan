import type { CombinedCell } from "../format/schema.ts";
import { EPSILON } from "../geometry/rect.ts";
import { roundLength, type DesignGeometry } from "./geometry.ts";
import { SHELF_SPAN_RATIO } from "./systems.ts";

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
  board: Board | "top" | "bottom";
  /** The longest length of the board between two supports. */
  span: number;
}

export interface SpanOptions {
  /** How the unit stands or hangs. A mount that this app does not know counts as the floor. */
  mount?: string | undefined;
  /** Defaults to whether the geometry has a back. */
  back?: boolean | undefined;
}

interface Beam {
  board: Board | "top" | "bottom";
  line: number;
  from: number;
  to: number;
  /** Held along its full length: the bottom on the floor, or the top on the wall rail. */
  held: boolean;
}

/**
 * The longest free span of each board that can sag: the shelf boards from the lowest row line up, then the bottom
 * when the floor does not hold it, then the top when the wall rail does not hold it. A board is held at its ends and at
 * each divider that meets it and that carries its load to a firm point: a divider that stands on a board at a point
 * where that board does not sag, or that hangs from such a point. A back holds every divider.
 */
export function freeSpans(geometry: DesignGeometry, options: SpanOptions = {}): FreeSpan[] {
  const { columns, rows, thickness } = geometry;
  const mount = options.mount ?? "floor";
  const lifted = mount === "legs" || mount === "feet" || mount === "wall-rail";
  const back = options.back ?? geometry.backThickness > 0;
  const limit = SHELF_SPAN_RATIO * thickness;
  const { dividers, shelves } = designLayout(geometry);
  const top: Beam = { board: "top", line: 0, from: 0, to: columns.length - 1, held: mount === "wall-rail" };
  const bottom: Beam = { board: "bottom", line: rows.length, from: 0, to: columns.length - 1, held: !lifted };
  const beams = [top, ...shelves.map((board): Beam => ({ board, line: board.line, from: board.from, to: board.to, held: false })), bottom];
  const beamAt = (line: number, column: number) => beams.find((beam) => beam.line === line && beam.from < column && beam.to >= column)!;
  const ends = new Map(dividers.map((board) => [board, { upper: beamAt(board.from, board.line), lower: beamAt(board.to + 1, board.line) }]));
  const holdsUpper = new Set<Board>(back ? dividers : []);
  const holdsLower = new Set<Board>(back ? dividers : []);

  const supports = (beam: Beam, except?: Board) => {
    const lines = [beam.from, beam.to + 1];
    for (const board of dividers) {
      if (board === except) continue;
      const { upper, lower } = ends.get(board)!;
      if ((upper === beam && holdsUpper.has(board)) || (lower === beam && holdsLower.has(board))) lines.push(board.line);
    }
    return lines.sort((a, b) => a - b);
  };
  const firmAt = (beam: Beam, line: number, except: Board) => {
    if (beam.held) return true;
    const lines = supports(beam, except);
    const right = lines.findIndex((at) => at > line);
    return spanLength(columns, lines[right - 1]!, lines[right]! - 1, thickness) <= limit + EPSILON;
  };
  for (let changed = true; changed; ) {
    changed = false;
    for (const board of dividers) {
      const { upper, lower } = ends.get(board)!;
      if (!holdsUpper.has(board) && firmAt(lower, board.line, board)) {
        holdsUpper.add(board);
        changed = true;
      }
      if (!holdsLower.has(board) && firmAt(upper, board.line, board)) {
        holdsLower.add(board);
        changed = true;
      }
    }
  }

  const longest = (beam: Beam) => {
    const lines = supports(beam);
    let span = 0;
    for (let index = 1; index < lines.length; index++) span = Math.max(span, spanLength(columns, lines[index - 1]!, lines[index]! - 1, thickness));
    return span;
  };
  const checked = [...beams.slice(1, -1).sort((a, b) => b.line - a.line || a.from - b.from), bottom, top].filter((beam) => !beam.held);
  return checked.map((beam) => ({ board: beam.board, span: longest(beam) }));
}
