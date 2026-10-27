import { useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";

interface Range {
  min: number;
  max: number;
}

interface GridSize {
  columns: number;
  rows: number;
}

interface GridPickerProps {
  columns: Range;
  rows: Range;
  value: GridSize;
  onHover(size: GridSize | null): void;
  onChange(size: GridSize): void;
}

const STEPS: Readonly<Record<string, GridSize>> = {
  ArrowLeft: { columns: -1, rows: 0 },
  ArrowRight: { columns: 1, rows: 0 },
  ArrowUp: { columns: 0, rows: -1 },
  ArrowDown: { columns: 0, rows: 1 },
};

const clamp = (value: number, range: Range) => Math.min(range.max, Math.max(range.min, value));

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

export function GridPicker({ columns, rows, value, onHover, onChange }: GridPickerProps) {
  const [hover, setHover] = useState<GridSize | null>(null);
  const shown = hover ?? value;
  const sizeAt = (column: number, row: number): GridSize => ({ columns: clamp(column, columns), rows: clamp(row, rows) });

  const cellAt = (target: EventTarget): GridSize | null => {
    const [column, row] = (target as HTMLElement).dataset?.cell?.split("-").map(Number) ?? [];
    return column && row ? sizeAt(column, row) : null;
  };
  const onPointerOver = (event: PointerEvent<HTMLDivElement>) => {
    const size = cellAt(event.target);
    if (!size || (hover?.columns === size.columns && hover.rows === size.rows)) return;
    setHover(size);
    onHover(size);
  };
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const size = cellAt(event.target);
    if (size) onChange(size);
  };
  const leave = () => {
    setHover(null);
    onHover(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = STEPS[event.key];
    if (!step) return;
    event.preventDefault();
    const next = sizeAt(value.columns + step.columns, value.rows + step.rows);
    if (next.columns !== value.columns || next.rows !== value.rows) onChange(next);
  };

  const cells = [];
  for (let row = 1; row <= rows.max; row++) {
    for (let column = 1; column <= columns.max; column++) {
      const on = column <= shown.columns && row <= shown.rows;
      cells.push(
        <div
          key={`${column}-${row}`}
          data-cell={`${column}-${row}`}
          className={on ? "grid-picker-cell on" : "grid-picker-cell"}
        />,
      );
    }
  }

  return (
    <div className="grid-picker">
      <div
        className="grid-picker-grid"
        role="grid"
        tabIndex={0}
        aria-label={`Grid: ${plural(value.columns, "column")}, ${plural(value.rows, "row")}`}
        style={{ gridTemplateColumns: `repeat(${columns.max}, 14px)` }}
        onKeyDown={onKeyDown}
        onClick={onClick}
        onPointerOver={onPointerOver}
        onPointerLeave={leave}
      >
        {cells}
      </div>
      <p className="grid-picker-label" aria-hidden="true">
        {shown.columns} × {shown.rows}
      </p>
    </div>
  );
}
