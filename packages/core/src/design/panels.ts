import { roundLength, type DesignGeometry } from "./geometry.ts";

export type PanelKind = "top" | "bottom" | "side" | "divider" | "shelf";

/** A panel in the front view of one unit, from the top-left corner. */
export interface Panel {
  kind: PanelKind;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A cell opening in the front view, from the top-left corner. */
export interface Cell {
  column: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The panels and the cells of the box: the top and the bottom across the full width, the sides and the dividers between them, and the shelves between those. */
export function designPanels(geometry: DesignGeometry): { panels: Panel[]; cells: Cell[] } {
  const { thickness: t, columns, rows, outsideWidth: width, outsideHeight: height } = geometry;
  const inner = roundLength(height - 2 * t);
  const panels: Panel[] = [
    { kind: "top", x: 0, y: 0, width, height: t },
    { kind: "bottom", x: 0, y: roundLength(height - t), width, height: t },
  ];
  const cells: Cell[] = [];
  let x = 0;
  for (let column = 0; column <= columns.length; column++) {
    panels.push({ kind: column === 0 || column === columns.length ? "side" : "divider", x, y: t, width: t, height: inner });
    if (column === columns.length) break;
    const opening = columns[column]!;
    let y = t;
    rows.forEach((cell, row) => {
      if (row > 0) {
        panels.push({ kind: "shelf", x: roundLength(x + t), y, width: opening, height: t });
        y = roundLength(y + t);
      }
      cells.push({ column, row, x: roundLength(x + t), y, width: opening, height: cell });
      y = roundLength(y + cell);
    });
    x = roundLength(x + t + opening);
  }
  return { panels, cells };
}
