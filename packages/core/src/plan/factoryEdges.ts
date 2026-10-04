import type { Part, Placement, PlanSheet, Project, Stock } from "../format/schema.ts";
import { EPSILON, span, type Rect, type Size } from "../geometry/rect.ts";
import { placedRect, stockRect, trimFor, type PlanContext } from "./context.ts";
import { buildCutTree, type CutNode, type TreeItem } from "./cutTree.ts";

/** The values of `parts[].factoryEdge` that this app knows. Later minor versions can add values. */
export const FACTORY_EDGE_CHOICES = ["long", "none"] as const;
export type FactoryEdgeChoice = (typeof FACTORY_EDGE_CHOICES)[number];

export function isFactoryEdgeChoice(value: unknown): value is FactoryEdgeChoice {
  return FACTORY_EDGE_CHOICES.includes(value as FactoryEdgeChoice);
}

/** An edge of a rectangle; `top` is the edge at the smallest y. */
export type Side = "top" | "right" | "bottom" | "left";

const SIDES: readonly Side[] = ["top", "right", "bottom", "left"];
const BIT: Readonly<Record<Side, number>> = { top: 1, right: 2, bottom: 4, left: 8 };
const ALL = 15;

/** "long" when the part asks for a factory edge on a long edge: its own known choice, else the rule of the settings. */
export function factoryEdgeRequest(project: Project, part: Part): "long" | null {
  if (part.factoryEdge === "long") return "long";
  if (part.factoryEdge === "none") return null;
  const rule = project.settings.factoryEdge;
  return rule !== undefined && Math.max(part.length, part.width) >= rule.minLength - EPSILON ? "long" : null;
}

/** New sheet stock with no trim: all four edges are factory edges. Owned offcuts have cut edges only. */
export function hasFactoryEdges(ctx: PlanContext, stock: Stock): boolean {
  return stock.kind === "sheet" && trimFor(ctx, stock) <= EPSILON;
}

function touching(inner: Rect, outer: Rect): number {
  let bits = 0;
  if (Math.abs(inner.y - outer.y) <= EPSILON) bits |= BIT.top;
  if (Math.abs(inner.x + inner.length - (outer.x + outer.length)) <= EPSILON) bits |= BIT.right;
  if (Math.abs(inner.y + inner.width - (outer.y + outer.width)) <= EPSILON) bits |= BIT.bottom;
  if (Math.abs(inner.x - outer.x) <= EPSILON) bits |= BIT.left;
  return bits;
}

function sidesOf(bits: number): Side[] {
  return SIDES.filter((side) => (bits & BIT[side]) !== 0);
}

/** The edges along the long side of a placed rectangle; all four for a square. */
function longBits(size: Size): number {
  if (Math.abs(size.length - size.width) <= EPSILON) return ALL;
  return size.length > size.width ? BIT.top | BIT.bottom : BIT.left | BIT.right;
}

export function longSides(size: Size): Side[] {
  return sidesOf(longBits(size));
}

/** The edges of a placed copy that lie on a factory edge of its stock. */
export function factoryEdgeSides(ctx: PlanContext, stock: Stock, part: Part, placement: Placement): Side[] {
  if (!hasFactoryEdges(ctx, stock)) return [];
  return sidesOf(touching(placedRect(part, placement), stockRect(stock)));
}

/** True when a long edge of the placed copy lies on a factory edge of its stock. */
export function getsFactoryEdge(ctx: PlanContext, stock: Stock, part: Part, placement: Placement): boolean {
  if (!hasFactoryEdges(ctx, stock)) return false;
  const rect = placedRect(part, placement);
  return (touching(rect, stockRect(stock)) & longBits(rect)) !== 0;
}

type Requested = (part: Part) => boolean;

function requestedIn(ctx: PlanContext): Requested {
  return (part) => factoryEdgeRequest(ctx.project, part) !== null;
}

/** The placed copies on the sheet that ask for a factory edge and do not get one. */
export function sheetFactoryEdgeMisses(ctx: PlanContext, sheet: PlanSheet, requested: Requested = requestedIn(ctx)): number {
  const stock = ctx.stock.get(sheet.stock);
  if (!stock) return 0;
  let misses = 0;
  for (const placement of sheet.placements) {
    const part = ctx.parts.get(placement.part);
    if (part && placement.copy < part.quantity && requested(part) && !getsFactoryEdge(ctx, stock, part, placement)) misses++;
  }
  return misses;
}

export interface PushedSheet {
  placements: Placement[];
  misses: number;
}

interface Arranged {
  hits: number;
  place(dx: number, dy: number, out: Map<number, { x: number; y: number }>): void;
}

/**
 * Moves the pieces of the sheet's cut tree, so that more copies that ask for a factory edge get one. At each split, the
 * pieces with parts can change order: one goes against each end of the split, and the others follow the first one,
 * one kerf apart. Parts do not turn, and every piece stays a piece of the same cuts. Null when no copy gains.
 */
export function pushToFactoryEdges(ctx: PlanContext, sheet: PlanSheet, requested: Requested = requestedIn(ctx)): PushedSheet | null {
  const stock = ctx.stock.get(sheet.stock);
  if (!stock || !hasFactoryEdges(ctx, stock)) return null;
  const items: TreeItem[] = [];
  const wanted = new Set<number>();
  const seen = new Set<string>();
  for (const [index, placement] of sheet.placements.entries()) {
    const part = ctx.parts.get(placement.part);
    const key = `${placement.part}#${placement.copy}`;
    if (!part || placement.copy >= part.quantity || seen.has(key)) return null;
    seen.add(key);
    items.push({ index, rect: placedRect(part, placement) });
    if (requested(part)) wanted.add(index);
  }
  const before = sheetFactoryEdgeMisses(ctx, sheet, requested);
  if (before === 0) return null;
  const tree = buildCutTree(stockRect(stock), items, ctx.kerf, 0);
  if (tree.stuck.length > 0) return null;

  const rects = new Map(items.map((item) => [item.index, item.rect]));
  const memo = new Map<CutNode, Map<number, Arranged>>();
  const solve = (node: CutNode, bits: number): Arranged => {
    const known = memo.get(node)?.get(bits);
    if (known) return known;
    const arranged = arrange(node, bits);
    const forNode = memo.get(node) ?? new Map<number, Arranged>();
    memo.set(node, forNode.set(bits, arranged));
    return arranged;
  };
  const arrange = (node: CutNode, bits: number): Arranged => {
    if (node.kind === "part") {
      const rect = rects.get(node.item)!;
      return {
        hits: wanted.has(node.item) && (longBits(rect) & bits) !== 0 ? 1 : 0,
        place: (dx, dy, out) => out.set(node.item, { x: rect.x + dx, y: rect.y + dy }),
      };
    }
    if (node.kind !== "split") return { hits: 0, place: () => {} };
    const blocks = node.children.filter((child) => child.kind !== "waste");
    const kept = blocks.map((child) => solve(child, bits & touching(child.rect, node.rect)));
    const keep: Arranged = {
      hits: kept.reduce((sum, a) => sum + a.hits, 0),
      place: (dx, dy, out) => kept.forEach((a) => a.place(dx, dy, out)),
    };
    const moved = rearrange(node, blocks, bits);
    return moved && moved.hits > keep.hits ? moved : keep;
  };
  const rearrange = (node: Extract<CutNode, { kind: "split" }>, blocks: CutNode[], bits: number): Arranged | null => {
    const along = node.axis;
    const [low, high] = along === "x" ? [BIT.left, BIT.right] : [BIT.top, BIT.bottom];
    const across = bits & ~(low | high);
    const [lo, hi] = span(node.rect, along);
    const start = (child: CutNode) => span(child.rect, along)[0];
    const size = (child: CutNode) => span(child.rect, along)[1] - start(child);
    const used = blocks.reduce((sum, child) => sum + size(child), 0) + (blocks.length - 1) * ctx.kerf;
    if (blocks.length === 0 || used > hi - lo + EPSILON) return null;
    const shifted = (a: Arranged, by: number): Arranged["place"] => (dx, dy, out) => a.place(along === "x" ? dx + by : dx, along === "y" ? dy + by : dy, out);

    if (blocks.length === 1) {
      const only = blocks[0]!;
      const full = size(only) >= hi - lo - EPSILON ? bits & (low | high) : 0;
      const first = solve(only, across | (bits & low) | full);
      const last = solve(only, across | (bits & high) | full);
      const atEnd = last.hits > first.hits;
      const chosen = atEnd ? last : first;
      return { hits: chosen.hits, place: shifted(chosen, (atEnd ? hi - size(only) : lo) - start(only)) };
    }

    const middle = blocks.map((child) => solve(child, across));
    let best: { first: number; last: number; hits: number } | null = null;
    const order = [...blocks.keys()];
    for (const f of order) {
      for (const l of order.toReversed()) {
        if (f === l) continue;
        const rest = middle.reduce((sum, a, i) => (i === f || i === l ? sum : sum + a.hits), 0);
        const hits = rest + solve(blocks[f]!, across | (bits & low)).hits + solve(blocks[l]!, across | (bits & high)).hits;
        if (!best || hits > best.hits) best = { first: f, last: l, hits };
      }
    }
    const { first, last, hits } = best!;
    return {
      hits,
      place: (dx, dy, out) => {
        let at = lo;
        const put = (a: Arranged, child: CutNode, to: number) => shifted(a, to - start(child))(dx, dy, out);
        put(solve(blocks[first]!, across | (bits & low)), blocks[first]!, at);
        at += size(blocks[first]!) + ctx.kerf;
        blocks.forEach((child, i) => {
          if (i === first || i === last) return;
          put(middle[i]!, child, at);
          at += size(child) + ctx.kerf;
        });
        put(solve(blocks[last]!, across | (bits & high)), blocks[last]!, hi - size(blocks[last]!));
      },
    };
  };

  const out = new Map<number, { x: number; y: number }>();
  solve(tree.root, ALL).place(0, 0, out);
  const placements = sheet.placements.map((placement, index) => {
    const at = out.get(index);
    return at ? { ...placement, x: at.x, y: at.y } : placement;
  });
  const misses = sheetFactoryEdgeMisses(ctx, { ...sheet, placements }, requested);
  return misses < before ? { placements, misses } : null;
}
