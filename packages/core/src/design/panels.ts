import { roundLength, type DesignGeometry } from "./geometry.ts";
import { designLayout, spanLength } from "./layout.ts";
import { dividerName, shelfName } from "./parts.ts";

export type PanelKind = "top" | "bottom" | "side" | "divider" | "shelf";

/** A panel in the front view of one unit, from the top-left corner. */
export interface Panel {
  kind: PanelKind;
  /** The name of its part, as in the parts list. */
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A cell opening in the front view, from the top-left corner. A combined cell has its size in cells. */
export interface Cell {
  column: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
  columns?: number;
  rows?: number;
}

/** The panels and the cells of the box: the top and the bottom across the full width, the sides and the divider boards between them, and the shelf boards between those. */
export function designPanels(geometry: DesignGeometry): { panels: Panel[]; cells: Cell[] } {
  const { thickness: t, columns, rows, outsideWidth: width, outsideHeight: height } = geometry;
  const inner = roundLength(height - 2 * t);
  const { dividers, shelves } = designLayout(geometry);

  const lineX = [0];
  for (const opening of columns) lineX.push(roundLength(lineX.at(-1)! + t + opening));
  const cellX = columns.map((_, column) => roundLength(lineX[column]! + t));
  const lineY = [0];
  const cellY = [t];
  rows.slice(1).forEach((_, index) => {
    lineY.push(roundLength(cellY[index]! + rows[index]!));
    cellY.push(roundLength(lineY.at(-1)! + t));
  });

  const spans = (geometry.combined ?? []).map((span) => ({ column: span.column - 1, row: span.row - 1, columns: span.columns, rows: span.rows }));
  const spanAt = (column: number, row: number) =>
    spans.find((span) => column >= span.column && column < span.column + span.columns && row >= span.row && row < span.row + span.rows);

  const panels: Panel[] = [
    { kind: "top", name: "Top", x: 0, y: 0, width, height: t },
    { kind: "bottom", name: "Bottom", x: 0, y: roundLength(height - t), width, height: t },
  ];
  const cells: Cell[] = [];
  for (let column = 0; column <= columns.length; column++) {
    const x = lineX[column]!;
    if (column === 0 || column === columns.length) panels.push({ kind: "side", name: "Side", x, y: t, width: t, height: inner });
    for (const board of dividers.filter((divider) => divider.line === column)) {
      const full = board.from === 0 && board.to === rows.length - 1;
      panels.push({ kind: "divider", name: dividerName(board, rows.length), x, y: cellY[board.from]!, width: t, height: full ? inner : spanLength(rows, board.from, board.to, t) });
    }
    if (column === columns.length) break;
    rows.forEach((opening, row) => {
      for (const board of shelves.filter((shelf) => shelf.line === row && shelf.from === column)) {
        const length = board.from === board.to ? columns[column]! : spanLength(columns, board.from, board.to, t);
        panels.push({ kind: "shelf", name: shelfName(board, columns), x: cellX[column]!, y: lineY[row]!, width: length, height: t });
      }
      const span = spanAt(column, row);
      if (!span) cells.push({ column, row, x: cellX[column]!, y: cellY[row]!, width: columns[column]!, height: opening });
      else if (span.column === column && span.row === row) {
        cells.push({
          column,
          row,
          x: cellX[column]!,
          y: cellY[row]!,
          width: spanLength(columns, column, column + span.columns - 1, t),
          height: spanLength(rows, row, row + span.rows - 1, t),
          columns: span.columns,
          rows: span.rows,
        });
      }
    });
  }
  return { panels, cells };
}
