import type { Placement } from "../format/schema.ts";
import { EPSILON, span, withSpan, type Axis, type Rect, type Size } from "../geometry/rect.ts";
import { snapLength } from "../geometry/precision.ts";
import type { Units } from "../geometry/units.ts";
import type { CutNode } from "../plan/cutTree.ts";
import { treeRegion, type SheetAnalysis } from "../plan/sheets.ts";

/** The end of each split that the pieces go to: "start" is the top or the left. */
export type SlideDirection = Readonly<Record<Axis, "start" | "end">>;

export const SLIDE_DIRECTIONS: readonly SlideDirection[] = [
  { x: "start", y: "start" },
  { x: "end", y: "start" },
  { x: "start", y: "end" },
  { x: "end", y: "end" },
];

/**
 * The placements of the sheet after each split of its tree packs its pieces against one end, in the same order and one
 * kerf apart, with the waste at the other end. So the parts move only inside their pieces, along the axis of each
 * split, and the tree stays a tree of the same pieces. Null when the sheet has stuck parts, a placement that the tree
 * leaves out, or no part that moves.
 */
export function slidePlacements(analysis: SheetAnalysis, kerf: number, units: Units, direction: SlideDirection): Placement[] | null {
  const { tree, items, sheet } = analysis;
  if (tree.stuck.length > 0 || items.length === 0 || items.length !== sheet.placements.length) return null;
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
  const moved = new Map<number, { x: number; y: number }>();
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
  place(tree.root, treeRegion(analysis));
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
