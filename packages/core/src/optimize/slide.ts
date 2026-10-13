import type { Placement } from "../format/schema.ts";
import { EPSILON, otherAxis, span, withSpan, type Axis, type Rect, type Size } from "../geometry/rect.ts";
import { snapLength } from "../geometry/precision.ts";
import type { Units } from "../geometry/units.ts";
import type { CutNode } from "../plan/cutTree.ts";
import { treeRegion, type SheetAnalysis } from "../plan/sheets.ts";

/** The end of each split that the pieces go to: "start" is the top or the left. */
export type SlideDirection = Readonly<Record<Axis, "start" | "end">>;

/**
 * How the parts slide. `pack` packs the pieces of each split against one end. `align` keeps the pieces where they are
 * along each split, and moves the parts of each piece across it only to put an edge on the line of the same edge of the
 * piece before it ("forward") or after it ("backward").
 */
export type Slide = { readonly pack: SlideDirection } | { readonly align: "forward" | "backward" };

export const SLIDE_DIRECTIONS: readonly SlideDirection[] = [
  { x: "start", y: "start" },
  { x: "end", y: "start" },
  { x: "start", y: "end" },
  { x: "end", y: "end" },
];

export const SLIDES: readonly Slide[] = [...SLIDE_DIRECTIONS.map((pack) => ({ pack })), { align: "forward" }, { align: "backward" }];

type Point = { x: number; y: number };

/**
 * The placements of the sheet after its parts slide inside the pieces of its tree. The parts move only inside their
 * pieces, along the axis of each split, and keep their order, so the tree stays a tree of the same pieces. Null when
 * the sheet has stuck parts, a placement that the tree leaves out, or no part that moves.
 */
export function slidePlacements(analysis: SheetAnalysis, kerf: number, units: Units, slide: Slide): Placement[] | null {
  const { tree, items, sheet } = analysis;
  if (tree.stuck.length > 0 || items.length === 0 || items.length !== sheet.placements.length) return null;
  const moved = "pack" in slide ? packed(tree.root, treeRegion(analysis), kerf, slide.pack) : aligned(tree.root, treeRegion(analysis), slide.align);
  let changed = false;
  const placements = sheet.placements.map((placement, index) => {
    const to = moved.get(index);
    if (!to) return placement;
    const x = snapLength(to.x, units);
    const y = snapLength(to.y, units);
    if (Math.abs(x - placement.x) <= EPSILON && Math.abs(y - placement.y) <= EPSILON) return placement;
    changed = true;
    return { ...placement, x, y };
  });
  return changed && moved.size === items.length ? placements : null;
}

function packed(root: CutNode, region: Rect, kerf: number, direction: SlideDirection): Map<number, Point> {
  const sizes = new Map<CutNode, Size | null>();
  const needed = (node: CutNode): Size | null => {
    if (sizes.has(node)) return sizes.get(node)!;
    let size: Size | null = null;
    if (node.kind === "part") size = { length: node.rect.length, width: node.rect.width };
    else if (node.kind === "split") {
      const kids = node.children.map(needed).filter((kid): kid is Size => kid !== null);
      if (kids.length === 0) return null;
      const along = kids.reduce((sum, kid) => sum + (node.axis === "x" ? kid.length : kid.width), 0) + kerf * (kids.length - 1);
      const across = Math.max(...kids.map((kid) => (node.axis === "x" ? kid.width : kid.length)));
      size = node.axis === "x" ? { length: along, width: across } : { length: across, width: along };
    }
    sizes.set(node, size);
    return size;
  };
  const moved = new Map<number, Point>();
  const place = (node: CutNode, slot: Rect): void => {
    const size = needed(node);
    if (!size) return;
    const rect: Rect = {
      x: direction.x === "start" ? slot.x : slot.x + slot.length - size.length,
      y: direction.y === "start" ? slot.y : slot.y + slot.width - size.width,
      ...size,
    };
    if (node.kind === "part") {
      moved.set(node.item, { x: rect.x, y: rect.y });
      return;
    }
    if (node.kind !== "split") return;
    const axis = node.axis;
    const kids = node.children.filter((kid) => needed(kid) !== null);
    const [lo, hi] = span(rect, axis);
    const along = (kid: CutNode) => (axis === "x" ? needed(kid)!.length : needed(kid)!.width);
    if (direction[axis] === "start") {
      let at = lo;
      for (const kid of kids) {
        place(kid, withSpan(rect, axis, at, at + along(kid)));
        at += along(kid) + kerf;
      }
    } else {
      let at = hi;
      for (const kid of kids.toReversed()) {
        place(kid, withSpan(rect, axis, at - along(kid), at));
        at -= along(kid) + kerf;
      }
    }
  };
  place(root, region);
  return moved;
}

function aligned(root: CutNode, region: Rect, order: "forward" | "backward"): Map<number, Point> {
  const boxes = new Map<CutNode, Rect | null>();
  const box = (node: CutNode): Rect | null => {
    if (boxes.has(node)) return boxes.get(node)!;
    let rect: Rect | null = null;
    if (node.kind === "part") rect = node.rect;
    else if (node.kind === "split") {
      const kids = node.children.map(box).filter((kid): kid is Rect => kid !== null);
      if (kids.length > 0) {
        const x = Math.min(...kids.map((kid) => kid.x));
        const y = Math.min(...kids.map((kid) => kid.y));
        rect = { x, y, length: Math.max(...kids.map((kid) => kid.x + kid.length)) - x, width: Math.max(...kids.map((kid) => kid.y + kid.width)) - y };
      }
    }
    boxes.set(node, rect);
    return rect;
  };
  const shifted = (rect: Rect, by: Point): Rect => ({ ...rect, x: rect.x + by.x, y: rect.y + by.y });
  const moved = new Map<number, Point>();
  const visit = (node: CutNode, slot: Rect, by: Point): void => {
    if (node.kind === "part") {
      moved.set(node.item, { x: node.rect.x + by.x, y: node.rect.y + by.y });
      return;
    }
    if (node.kind !== "split") return;
    const axis = node.axis;
    const across = otherAxis(axis);
    const [slotLo, slotHi] = span(slot, axis);
    const [fitLo, fitHi] = span(slot, across);
    const kids = node.children.filter((kid) => box(kid) !== null);
    let previous: Rect | null = null;
    for (const kid of order === "forward" ? kids : kids.toReversed()) {
      const [lo, hi] = span(kid.rect, axis);
      const kidSlot = withSpan(slot, axis, Math.max(slotLo, lo + by[axis]), Math.min(slotHi, hi + by[axis]));
      const rect = shifted(box(kid)!, by);
      const [from, to] = span(rect, across);
      let shift = 0;
      if (previous) {
        const [prevFrom, prevTo] = span(previous, across);
        const fits = [prevFrom - from, prevTo - to].filter((d) => from + d >= fitLo - EPSILON && to + d <= fitHi + EPSILON);
        if (fits.length > 0) shift = fits.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a));
      }
      const next = { ...by, [across]: by[across] + shift };
      visit(kid, kidSlot, next);
      previous = shifted(rect, { x: next.x - by.x, y: next.y - by.y });
    }
  };
  visit(root, region, { x: 0, y: 0 });
  return moved;
}
