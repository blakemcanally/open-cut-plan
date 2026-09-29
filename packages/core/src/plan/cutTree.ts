import { EPSILON, inset, otherAxis, sameRect, span, withSpan, type Axis, type Rect } from "../geometry/rect.ts";

export interface TreeItem {
  /** Index of the placement in its sheet's `placements`. */
  index: number;
  rect: Rect;
}

export type CutNode =
  | { kind: "part"; rect: Rect; stage: number; item: number }
  | { kind: "waste"; rect: Rect; stage: number }
  | { kind: "stuck"; rect: Rect; stage: number; items: number[] }
  | { kind: "split"; rect: Rect; stage: number; axis: Axis; cuts: number[]; children: CutNode[]; items: number[] };

export interface TrimCut {
  axis: Axis;
  at: number;
  piece: Rect;
  released: Rect;
  remainder: Rect;
}

export interface CutTree {
  trims: TrimCut[];
  root: CutNode;
  /** Groups of placement indices that no through-cut order separates. */
  stuck: number[][];
}

/**
 * Cut positions are kerf centre lines. Each split node's `cuts` are ascending along `axis`, and `children[i]` is the
 * piece before `cuts[i]` (the last child is the piece after the last cut). Children can have zero size where a kerf
 * removes a sliver narrower than itself.
 */
export function buildCutTree(sheet: Rect, items: readonly TreeItem[], kerf: number, trim: number): CutTree {
  const stuck: number[][] = [];
  const trims = trim > 0 ? trimCuts(sheet, trim, kerf) : [];
  const region = trim > 0 ? inset(sheet, trim) : sheet;
  return { trims, root: split(region, items, 1, "y", kerf, stuck), stuck };
}

function trimCuts(sheet: Rect, trim: number, kerf: number): TrimCut[] {
  const cuts: TrimCut[] = [];
  let piece = sheet;
  const cut = (axis: Axis, atStart: boolean) => {
    const [lo, hi] = span(piece, axis);
    const at = atStart ? lo + trim - kerf / 2 : hi - trim + kerf / 2;
    const before = Math.min(hi, Math.max(lo, at - kerf / 2));
    const after = Math.max(before, Math.min(hi, at + kerf / 2));
    const released = atStart ? withSpan(piece, axis, lo, before) : withSpan(piece, axis, after, hi);
    const remainder = atStart ? withSpan(piece, axis, lo + trim, hi) : withSpan(piece, axis, lo, hi - trim);
    cuts.push({ axis, at, piece, released, remainder });
    piece = remainder;
  };
  cut("y", true);
  cut("y", false);
  cut("x", true);
  cut("x", false);
  return cuts;
}

function split(rect: Rect, items: readonly TreeItem[], stage: number, prefer: Axis, kerf: number, stuck: number[][]): CutNode {
  if (items.length === 0) return { kind: "waste", rect, stage };
  const only = items.length === 1 ? items[0]! : undefined;
  if (only && sameRect(only.rect, rect)) return { kind: "part", rect, stage, item: only.index };
  if (rect.length > EPSILON && rect.width > EPSILON) {
    for (const axis of [prefer, otherAxis(prefer)]) {
      const cuts = cutPositions(rect, items, axis, kerf);
      if (cuts.length === 0) continue;
      const pieces = piecesBetween(rect, axis, cuts, kerf);
      const groups = pieces.map((): TreeItem[] => []);
      for (const item of items) {
        const start = span(item.rect, axis)[0];
        groups[cuts.filter((cut) => cut < start + EPSILON).length]!.push(item);
      }
      const children = pieces.map((piece, i) => split(piece, groups[i]!, stage + 1, otherAxis(axis), kerf, stuck));
      return { kind: "split", rect, stage, axis, cuts, children, items: items.map((item) => item.index) };
    }
  }
  const indices = items.map((item) => item.index);
  stuck.push(indices);
  return { kind: "stuck", rect, stage, items: indices };
}

function cutPositions(rect: Rect, items: readonly TreeItem[], axis: Axis, kerf: number): number[] {
  const [lo, hi] = span(rect, axis);
  const intervals = items.map((item) => span(item.rect, axis)).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of intervals) {
    const last = merged.at(-1);
    if (last && start - last[1] < kerf - EPSILON) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  const cuts: number[] = [];
  if (merged[0]![0] - lo > EPSILON) cuts.push(merged[0]![0] - kerf / 2);
  merged.forEach(([, end], i) => {
    const next = merged[i + 1];
    if (!next) {
      if (hi - end > EPSILON) cuts.push(end + kerf / 2);
      return;
    }
    cuts.push(end + kerf / 2);
    if (next[0] - end - kerf > EPSILON) cuts.push(next[0] - kerf / 2);
  });
  return cuts;
}

function piecesBetween(rect: Rect, axis: Axis, cuts: readonly number[], kerf: number): Rect[] {
  const [lo, hi] = span(rect, axis);
  const clamp = (value: number) => Math.min(hi, Math.max(lo, value));
  const pieces: Rect[] = [];
  for (let i = 0; i <= cuts.length; i++) {
    const start = clamp(i === 0 ? lo : cuts[i - 1]! + kerf / 2);
    const end = Math.max(start, clamp(i === cuts.length ? hi : cuts[i]! - kerf / 2));
    pieces.push(withSpan(rect, axis, start, end));
  }
  return pieces;
}

export function nodeItems(node: CutNode): number[] {
  switch (node.kind) {
    case "part":
      return [node.item];
    case "waste":
      return [];
    case "split":
    case "stuck":
      return node.items;
  }
}
