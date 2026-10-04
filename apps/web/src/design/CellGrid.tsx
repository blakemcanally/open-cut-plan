import { axisCells, combinedAt, combineCells, expandSelection, splitCells, type CombinedCell, type Design } from "@opencutplan/core";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

interface Point {
  column: number;
  row: number;
}

interface CellGridProps {
  design: Design;
  /** The column and the row openings, to draw the cells to scale. */
  columns: readonly number[] | null;
  rows: readonly number[] | null;
  disabled: boolean;
  onEdit: (change: (design: Design) => Design) => boolean;
  onSelect?: (selection: CombinedCell | null) => void;
}

const STEPS: Readonly<Record<string, Point>> = {
  ArrowLeft: { column: -1, row: 0 },
  ArrowRight: { column: 1, row: 0 },
  ArrowUp: { column: 0, row: -1 },
  ArrowDown: { column: 0, row: 1 },
};

function cellName(span: CombinedCell): string {
  const columns = span.columns > 1 ? `Columns ${span.column}–${span.column + span.columns - 1}` : `Column ${span.column}`;
  const rows = span.rows > 1 ? `rows ${span.row}–${span.row + span.rows - 1}` : `row ${span.row}`;
  return `${columns}, ${rows}`;
}

function rectangle(a: Point, b: Point): CombinedCell {
  const column = Math.min(a.column, b.column);
  const row = Math.min(a.row, b.row);
  return { column, row, columns: Math.abs(a.column - b.column) + 1, rows: Math.abs(a.row - b.row) + 1 };
}

function overlaps(a: CombinedCell, b: CombinedCell): boolean {
  return a.column < b.column + b.columns && b.column < a.column + a.columns && a.row < b.row + b.rows && b.row < a.row + a.rows;
}

export function CellGrid({ design, columns: columnSizes, rows: rowSizes, disabled, onEdit, onSelect }: CellGridProps) {
  const columns = axisCells(design.width);
  const rows = axisCells(design.height);
  const [anchor, setAnchor] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point>({ column: 1, row: 1 });
  const grid = useRef<HTMLDivElement>(null);
  const inGrid = (point: Point) => point.column >= 1 && point.column <= columns && point.row >= 1 && point.row <= rows;
  const at = inGrid(cursor) ? cursor : { column: 1, row: 1 };
  const selection = anchor && inGrid(anchor) ? expandSelection(design, rectangle(anchor, at)) : null;
  const spanOf = (point: Point): CombinedCell => combinedAt(design, point.column, point.row) ?? { ...point, columns: 1, rows: 1 };
  const current = spanOf(at);
  const chosen = selection ? `${selection.column},${selection.row},${selection.columns},${selection.rows}` : "";
  useEffect(() => {
    if (!onSelect) return;
    const [column, row, wide, tall] = chosen.split(",").map(Number);
    onSelect(chosen ? { column: column!, row: row!, columns: wide!, rows: tall! } : null);
  }, [chosen, onSelect]);

  const tiles: CombinedCell[] = [];
  for (let row = 1; row <= rows; row++) {
    for (let column = 1; column <= columns; column++) {
      const span = spanOf({ column, row });
      if (span.column === column && span.row === row) {
        tiles.push({ column, row, columns: Math.min(span.columns, columns - column + 1), rows: Math.min(span.rows, rows - row + 1) });
      }
    }
  }

  const select = (point: Point, extend: boolean) => {
    if (!extend || !anchor || !inGrid(anchor)) setAnchor(point);
    setCursor(point);
  };
  const focusCell = (point: Point) => {
    const span = spanOf(point);
    grid.current?.querySelector<HTMLElement>(`[data-cell="${span.column}-${span.row}"]`)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = STEPS[event.key];
    if (!step) return;
    event.preventDefault();
    const next = {
      column: step.column > 0 ? current.column + current.columns : step.column < 0 ? current.column - 1 : at.column,
      row: step.row > 0 ? current.row + current.rows : step.row < 0 ? current.row - 1 : at.row,
    };
    if (!inGrid(next)) return;
    select(next, event.shiftKey);
    focusCell(next);
  };
  const onPointerDown = (point: Point) => (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    select(point, event.shiftKey);
  };
  const onPointerEnter = (point: Point) => (event: PointerEvent<HTMLDivElement>) => {
    if ((event.buttons & 1) === 1 && anchor) setCursor(point);
  };

  const size = selection ? selection.columns * selection.rows : 0;
  const whole = selection !== null && (design.combined ?? []).some((span) => span.column === selection.column && span.row === selection.row && span.columns === selection.columns && span.rows === selection.rows);
  const canCombine = !disabled && size >= 2 && !whole;
  const canSplit = !disabled && selection !== null && (design.combined ?? []).some((span) => overlaps(span, selection));
  const scale = (sizes: readonly number[] | null, count: number) => (sizes && sizes.length === count ? sizes.map((value) => `${value}fr`).join(" ") : `repeat(${count}, 1fr)`);
  const total = (sizes: readonly number[] | null, count: number) => (sizes && sizes.length === count ? sizes.reduce((sum, value) => sum + value, 0) : count);

  return (
    <fieldset className="cells">
      <legend>Cells</legend>
      <p className="muted">Click a cell. Then shift-click or drag to select more cells.</p>
      <div
        ref={grid}
        className="cell-grid"
        role="grid"
        aria-label="Cells"
        aria-multiselectable="true"
        tabIndex={-1}
        style={{ gridTemplateColumns: scale(columnSizes, columns), gridTemplateRows: scale(rowSizes, rows), aspectRatio: `${total(columnSizes, columns)} / ${total(rowSizes, rows)}` }}
        onKeyDown={onKeyDown}
      >
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} role="row" className="cell-row">
            {tiles
              .filter((tile) => tile.row === index + 1)
              .map((tile) => (
                <div
                  key={`${tile.column}-${tile.row}`}
                  role="gridcell"
                  data-cell={`${tile.column}-${tile.row}`}
                  aria-label={cellName(tile)}
                  aria-selected={selection !== null && overlaps(tile, selection)}
                  tabIndex={tile.column === current.column && tile.row === current.row ? 0 : -1}
                  className={tile.columns * tile.rows > 1 ? "cell combined" : "cell"}
                  style={{ gridColumn: `${tile.column} / span ${tile.columns}`, gridRow: `${tile.row} / span ${tile.rows}` }}
                  onPointerDown={onPointerDown(tile)}
                  onPointerEnter={onPointerEnter(tile)}
                />
              ))}
          </div>
        ))}
      </div>
      <div className="buttons">
        <button type="button" disabled={!canCombine} onClick={() => selection && onEdit((d) => combineCells(d, selection) ?? d)}>
          Combine
        </button>
        <button type="button" disabled={!canSplit} onClick={() => selection && onEdit((d) => splitCells(d, selection))}>
          Split
        </button>
      </div>
    </fieldset>
  );
}
