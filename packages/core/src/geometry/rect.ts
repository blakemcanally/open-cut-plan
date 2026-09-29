export type Axis = "x" | "y";

export interface Size {
  length: number;
  width: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

/** Tolerance for comparing lengths, in project units. */
export const EPSILON = 1e-6;

export function otherAxis(axis: Axis): Axis {
  return axis === "x" ? "y" : "x";
}

export function span(rect: Rect, axis: Axis): [number, number] {
  return axis === "x" ? [rect.x, rect.x + rect.length] : [rect.y, rect.y + rect.width];
}

export function sizeAlong(rect: Size, axis: Axis): number {
  return axis === "x" ? rect.length : rect.width;
}

export function withSpan(rect: Rect, axis: Axis, start: number, end: number): Rect {
  return axis === "x" ? { ...rect, x: start, length: end - start } : { ...rect, y: start, width: end - start };
}

/** Distance between two rectangles along an axis; negative when their extents overlap. */
export function gapAlong(a: Rect, b: Rect, axis: Axis): number {
  const [a0, a1] = span(a, axis);
  const [b0, b1] = span(b, axis);
  return Math.max(b0 - a1, a0 - b1);
}

export function area(rect: Size): number {
  return rect.length * rect.width;
}

export function inset(rect: Rect, by: number): Rect {
  return { x: rect.x + by, y: rect.y + by, length: rect.length - 2 * by, width: rect.width - 2 * by };
}

export function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x - EPSILON &&
    inner.y >= outer.y - EPSILON &&
    inner.x + inner.length <= outer.x + outer.length + EPSILON &&
    inner.y + inner.width <= outer.y + outer.width + EPSILON
  );
}

export function sameRect(a: Rect, b: Rect): boolean {
  return (
    Math.abs(a.x - b.x) <= EPSILON &&
    Math.abs(a.y - b.y) <= EPSILON &&
    Math.abs(a.length - b.length) <= EPSILON &&
    Math.abs(a.width - b.width) <= EPSILON
  );
}

/** True when `size` fits inside `limit` in either orientation. */
export function fitsWithin(size: Size, limit: Size): boolean {
  const [s1, s2] = [Math.max(size.length, size.width), Math.min(size.length, size.width)];
  const [l1, l2] = [Math.max(limit.length, limit.width), Math.min(limit.length, limit.width)];
  return s1 <= l1 + EPSILON && s2 <= l2 + EPSILON;
}
