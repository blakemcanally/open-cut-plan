import type { Rect, Size } from "@opencutplan/core";

export interface SnapInput {
  x: number;
  y: number;
  size: Size;
  /** The whole sheet and the area inside the trim. */
  sheet: Rect;
  usable: Rect;
  others: readonly Rect[];
  kerf: number;
  /** The largest distance that snaps to a line, in project units. */
  threshold: number;
  /** The grid step from the corner of the usable area, in project units. 0 turns the grid off. */
  grid: number;
  /** Whether the part may drop at a position. A snap that does not fit gives way to the position as it is, when that fits. */
  fits?(x: number, y: number): boolean;
}

export interface Snapped {
  x: number;
  y: number;
  /** The line that each axis snapped to, for a guide. Null for a grid snap or no snap. */
  guides: { x: number | null; y: number | null };
}

function snapAxis(
  start: number,
  length: number,
  leading: number[],
  trailing: number[],
  threshold: number,
  origin: number,
  grid: number,
): { position: number; guide: number | null } {
  const candidates = [...leading.map((line) => ({ position: line, guide: line })), ...trailing.map((line) => ({ position: line - length, guide: line }))];
  let best: { position: number; guide: number } | null = null;
  let bestDistance = threshold;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate.position - start);
    if (distance <= bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  if (best) return best;
  if (grid > 0) return { position: origin + Math.round((start - origin) / grid) * grid, guide: null };
  return { position: start, guide: null };
}

/**
 * Snaps each axis on its own. The part's near edge snaps to the sheet edge, the trim line, a neighbour's far edge plus
 * one kerf, or a neighbour's near edge; its far edge snaps to the same lines from the other side. When no line is
 * close, the near edge snaps to the grid.
 */
export function snapPosition(input: SnapInput): Snapped {
  const { sheet, usable, others, kerf, size, threshold, grid, fits } = input;
  const x = snapAxis(
    input.x,
    size.length,
    [sheet.x, usable.x, ...others.flatMap((r) => [r.x + r.length + kerf, r.x])],
    [sheet.x + sheet.length, usable.x + usable.length, ...others.flatMap((r) => [r.x - kerf, r.x + r.length])],
    threshold,
    usable.x,
    grid,
  );
  const y = snapAxis(
    input.y,
    size.width,
    [sheet.y, usable.y, ...others.flatMap((r) => [r.y + r.width + kerf, r.y])],
    [sheet.y + sheet.width, usable.y + usable.width, ...others.flatMap((r) => [r.y - kerf, r.y + r.width])],
    threshold,
    usable.y,
    grid,
  );
  if (fits && !fits(x.position, y.position) && fits(input.x, input.y)) {
    return { x: input.x, y: input.y, guides: { x: null, y: null } };
  }
  return { x: x.position, y: y.position, guides: { x: x.guide, y: y.guide } };
}
