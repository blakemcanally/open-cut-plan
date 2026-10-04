import type { CombinedCell, Design } from "../format/schema.ts";
import { axisCells } from "./edit.ts";

const right = (span: CombinedCell) => span.column + span.columns - 1;
const bottom = (span: CombinedCell) => span.row + span.rows - 1;

function intersects(a: CombinedCell, b: CombinedCell): boolean {
  return a.column <= right(b) && b.column <= right(a) && a.row <= bottom(b) && b.row <= bottom(a);
}

function contains(outer: CombinedCell, inner: CombinedCell): boolean {
  return inner.column >= outer.column && right(inner) <= right(outer) && inner.row >= outer.row && bottom(inner) <= bottom(outer);
}

function at(span: CombinedCell): string {
  return `column ${span.column}, row ${span.row}`;
}

function withCombined(design: Design, combined: CombinedCell[]): Design {
  const { combined: _combined, ...rest } = design;
  return combined.length > 0 ? { ...rest, combined } : rest;
}

/** One message for each span that is not in the grid, has 1 cell, or overlaps an earlier span. */
export function combinedErrors(design: Design): string[] {
  const columns = axisCells(design.width);
  const rows = axisCells(design.height);
  const spans = design.combined ?? [];
  const messages: string[] = [];
  spans.forEach((span, index) => {
    if (right(span) > columns || bottom(span) > rows) {
      messages.push(`The combined cell at ${at(span)} (${span.columns} × ${span.rows} cells) is not in the grid of ${columns} columns and ${rows} rows.`);
    } else if (span.columns * span.rows < 2) {
      messages.push(`The combined cell at ${at(span)} has only 1 cell. Combine 2 cells or more.`);
    }
    const other = spans.slice(0, index).find((earlier) => intersects(earlier, span));
    if (other) messages.push(`The combined cells at ${at(other)} and ${at(span)} overlap.`);
  });
  return messages;
}

/** Cuts each span at the right and the bottom edge of the grid, and removes the spans with fewer than 2 cells left. */
export function fitCombined(design: Design): Design {
  if (!design.combined) return design;
  const columns = axisCells(design.width);
  const rows = axisCells(design.height);
  const fitted = design.combined.flatMap((span) => {
    const next = { ...span, columns: Math.min(span.columns, columns - span.column + 1), rows: Math.min(span.rows, rows - span.row + 1) };
    return next.columns >= 1 && next.rows >= 1 && next.columns * next.rows >= 2 ? [next.columns === span.columns && next.rows === span.rows ? span : next] : [];
  });
  if (fitted.length === design.combined.length && fitted.every((span, index) => span === design.combined![index])) return design;
  return withCombined(design, fitted);
}

export function combinedAt(design: Design, column: number, row: number): CombinedCell | undefined {
  return design.combined?.find((span) => contains(span, { column, row, columns: 1, rows: 1 }));
}

/** Makes the selection larger until it holds each span that it touches. */
export function expandSelection(design: Design, selection: CombinedCell): CombinedCell {
  let current = selection;
  for (;;) {
    const crossing = (design.combined ?? []).find((span) => intersects(span, current) && !contains(current, span));
    if (!crossing) return current;
    const column = Math.min(current.column, crossing.column);
    const row = Math.min(current.row, crossing.row);
    current = { column, row, columns: Math.max(right(current), right(crossing)) - column + 1, rows: Math.max(bottom(current), bottom(crossing)) - row + 1 };
  }
}

/** Combines the selection into one cell, in place of the spans in it, or null for a selection of 1 cell. */
export function combineCells(design: Design, selection: CombinedCell): Design | null {
  const span = expandSelection(design, selection);
  if (span.columns * span.rows < 2) return null;
  return withCombined(design, [...(design.combined ?? []).filter((other) => !contains(span, other)), { column: span.column, row: span.row, columns: span.columns, rows: span.rows }]);
}

/** Removes the spans in the selection. */
export function splitCells(design: Design, selection: CombinedCell): Design {
  const span = expandSelection(design, selection);
  const kept = (design.combined ?? []).filter((other) => !contains(span, other));
  return kept.length === (design.combined ?? []).length ? design : withCombined(design, kept);
}
