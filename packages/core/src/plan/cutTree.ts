import { area, contains, EPSILON, fitsWithin, inset, otherAxis, sameRect, span, withSpan, type Axis, type Rect, type Size } from "../geometry/rect.ts";

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

/** A cut as the sequence makes it: the piece on the saw, the side that the cut separates off, and the side that continues. */
export interface TreeCut {
  axis: Axis;
  stage: number;
  /** Length of the cut line. */
  length: number;
  piece: Rect;
  released: Rect;
  remainder: Rect;
}

/**
 * Cut positions are kerf centre lines. Each split node's `cuts` are ascending along `axis`, and `children[i]` is the
 * piece before `cuts[i]` (the last child is the piece after the last cut). Children can have zero size where a kerf
 * removes a sliver narrower than itself.
 *
 * Each piece gets the split whose subtree has the fewest stuck parts, then the fewest cuts that `canCut` rejects, then
 * (with `minOffcut`) the largest waste piece that is at least `minOffcut`, then the least total cut length, then the
 * fewest cuts. A split cuts at every gap between runs, or only at the waste at the ends, so that the runs stay in one
 * piece. Equal subtrees keep rips first at the first stage and the other direction first at each deeper stage, with a
 * split at every gap before a split at the ends only.
 */
export function buildCutTree(sheet: Rect, items: readonly TreeItem[], kerf: number, trim: number, canCut?: (cut: TreeCut) => boolean, minOffcut?: Size): CutTree {
  const stuck: number[][] = [];
  const trims = trim > 0 ? trimCuts(sheet, trim, kerf) : [];
  const region = trim > 0 ? inset(sheet, trim) : sheet;
  const inner = items.map((item): Item => {
    const it: Item = { ...item, x: span(item.rect, "x"), y: span(item.rect, "y"), run: 0, alone: NO_ITEMS };
    it.alone = { items: [it], x: [it], y: [it], runs: {} };
    return it;
  });
  const group = { items: inner, x: inner.toSorted((a, b) => a.x[0] - b.x[0]), y: inner.toSorted((a, b) => a.y[0] - b.y[0]), runs: {} };
  const root = treeBuilder(kerf, undefined, minOffcut)(region, group, 1, "y", stuck);
  if (!canCut || everyCut(root, kerf, canCut)) return { trims, root, stuck };
  const again: number[][] = [];
  return { trims, root: treeBuilder(kerf, canCut, minOffcut)(region, group, 1, "y", again), stuck: again };
}

function everyCut(node: CutNode, kerf: number, canCut: (cut: TreeCut) => boolean): boolean {
  if (node.kind !== "split") return true;
  const [lo, hi] = span(node.rect, node.axis);
  const [from, to] = span(node.rect, otherAxis(node.axis));
  let start = lo;
  for (const [i, at] of node.cuts.entries()) {
    const remainder = Math.min(hi, Math.max(start, at + kerf / 2));
    const cut = { axis: node.axis, stage: node.stage, length: to - from, piece: withSpan(node.rect, node.axis, start, hi), released: node.children[i]!.rect, remainder: withSpan(node.rect, node.axis, remainder, hi) };
    if (!canCut(cut)) return false;
    start = remainder;
  }
  return node.children.every((child) => everyCut(child, kerf, canCut));
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

interface Cost {
  stuck: number;
  noTool: number;
  /** The area of the largest waste piece that is an offcut; always 0 when the tree does not compare offcuts. */
  offcut: number;
  length: number;
  cuts: number;
}

const FREE: Cost = { stuck: 0, noTool: 0, offcut: 0, length: 0, cuts: 0 };

function plus(a: Cost, b: Cost): Cost {
  return { stuck: a.stuck + b.stuck, noTool: a.noTool + b.noTool, offcut: Math.max(a.offcut, b.offcut), length: a.length + b.length, cuts: a.cuts + b.cuts };
}

function compareLength(a: Cost, b: Cost): number {
  if (a.stuck !== b.stuck) return a.stuck - b.stuck;
  if (a.noTool !== b.noTool) return a.noTool - b.noTool;
  if (Math.abs(a.length - b.length) > EPSILON) return a.length - b.length;
  return a.cuts - b.cuts;
}

function compareOffcutFirst(a: Cost, b: Cost): number {
  if (a.stuck !== b.stuck) return a.stuck - b.stuck;
  if (a.noTool !== b.noTool) return a.noTool - b.noTool;
  if (Math.abs(a.offcut - b.offcut) > EPSILON) return b.offcut - a.offcut;
  if (Math.abs(a.length - b.length) > EPSILON) return a.length - b.length;
  return a.cuts - b.cuts;
}

interface Item extends TreeItem {
  x: [number, number];
  y: [number, number];
  run: number;
  alone: Group;
}

/** A set of items in item order, and in order of their start along each axis, with its runs along each axis once known. */
interface Group {
  items: readonly Item[];
  x: readonly Item[];
  y: readonly Item[];
  runs: Partial<Record<Axis, Run[]>>;
}

const NO_ITEMS: Group = { items: [], x: [], y: [], runs: {} };

interface Piece {
  rect: Rect;
  group: Group;
}

interface Plan {
  cost: Cost;
  cuts: number[];
  pieces: Piece[];
}

interface Solved {
  cost: Cost;
  plans: Record<Axis, Plan | null>;
}

interface Known {
  rect: Rect;
  items: readonly Item[];
  stage: number;
  solved: Solved;
}

interface Run {
  start: number;
  end: number;
  group: Group;
}

/**
 * The cuts at one end of a run of parts. `end` is where the piece before the cuts ends and `start` where the piece after
 * them starts; `waste` is the piece that the cuts separate off, when there is one.
 */
interface Boundary {
  cuts: number[];
  end: number;
  start: number;
  waste: Rect | null;
}

interface Step {
  cost: Cost;
  next: number;
}

type Build = (rect: Rect, group: Group, stage: number, prefer: Axis, stuck: number[][]) => CutNode;

function treeBuilder(kerf: number, canCut: ((cut: TreeCut) => boolean) | undefined, minOffcut: Size | undefined): Build {
  const half = kerf / 2;
  const memo = new Map<number, Known[]>();
  const compareCost = minOffcut ? compareOffcutFirst : compareLength;
  const offcutOf = (waste: Rect | null) => (minOffcut && waste && fitsWithin(minOffcut, waste) ? area(waste) : 0);

  const lookup = (x: number, y: number, length: number, width: number, items: readonly Item[], stage: number): Known | undefined => {
    for (const known of memo.get(items[0]!.index) ?? []) {
      const r = known.rect;
      if (r.x !== x || r.y !== y || r.length !== length || r.width !== width || (canCut && known.stage !== stage)) continue;
      if (known.items.length === items.length && known.items.every((item, i) => item === items[i])) return known;
    }
    return undefined;
  };

  const solve = (rect: Rect, group: Group, stage: number): Solved => {
    const { items } = group;
    const known = lookup(rect.x, rect.y, rect.length, rect.width, items, stage);
    if (known) return known.solved;
    const open = rect.length > EPSILON && rect.width > EPSILON;
    const x = open ? plan(rect, group, "x", stage) : null;
    const y = open ? plan(rect, group, "y", stage) : null;
    const best = x && (!y || compareCost(x.cost, y.cost) <= 0) ? x : y;
    const solved = { cost: best?.cost ?? { ...FREE, stuck: items.length }, plans: { x, y } };
    const list = memo.get(items[0]!.index);
    if (list) list.push({ rect, items, stage, solved });
    else memo.set(items[0]!.index, [{ rect, items, stage, solved }]);
    return solved;
  };

  /** The cost of the piece of `rect` from `start` to `end` along `axis`. */
  const pieceCost = (rect: Rect, axis: Axis, start: number, end: number, group: Group, stage: number): Cost => {
    const { items } = group;
    const size = Math.max(start, end) - start;
    const x = axis === "x" ? start : rect.x;
    const y = axis === "y" ? start : rect.y;
    const length = axis === "x" ? size : rect.length;
    const width = axis === "y" ? size : rect.width;
    if (items.length === 1) {
      const part = items[0]!.rect;
      const fits =
        Math.abs(part.x - x) <= EPSILON && Math.abs(part.y - y) <= EPSILON && Math.abs(part.length - length) <= EPSILON && Math.abs(part.width - width) <= EPSILON;
      if (fits) return FREE;
      if (!canCut && length > EPSILON && width > EPSILON && contains({ x, y, length, width }, part)) return singleCost(x, y, length, width, part, kerf, minOffcut);
    }
    return (lookup(x, y, length, width, items, stage)?.solved ?? solve({ x, y, length, width }, group, stage)).cost;
  };

  const plan = (rect: Rect, group: Group, axis: Axis, stage: number): Plan | null => {
    const [lo, hi] = span(rect, axis);
    const clamp = (value: number) => Math.min(hi, Math.max(lo, value));
    const between = (start: number, end: number) => withSpan(rect, axis, start, Math.max(start, end));
    const length = axis === "x" ? rect.width : rect.length;
    const runs = (group.runs[axis] ??= runsAlong(group, axis, kerf));
    const last = runs.length - 1;

    const boundaries: Boundary[][] = [];
    const first = runs[0]!.start;
    if (first - lo > EPSILON) {
      const at = first - half;
      boundaries.push([
        { cuts: [at], end: lo, start: clamp(at + half), waste: between(lo, clamp(at - half)) },
        { cuts: [], end: lo, start: lo, waste: null },
      ]);
    } else boundaries.push([{ cuts: [], end: lo, start: lo, waste: null }]);
    for (let i = 0; i < last; i++) {
      const after = runs[i]!.end + half;
      const before = runs[i + 1]!.start - half;
      const tight: Boundary = { cuts: [after], end: clamp(after - half), start: clamp(after + half), waste: null };
      if (runs[i + 1]!.start - runs[i]!.end - kerf > EPSILON) {
        boundaries.push([
          { cuts: [after, before], end: clamp(after - half), start: clamp(before + half), waste: between(clamp(after + half), clamp(before - half)) },
          { cuts: [before], end: clamp(before - half), start: clamp(before + half), waste: null },
          tight,
        ]);
      } else boundaries.push([tight]);
    }
    const end = runs[last]!.end;
    if (hi - end > EPSILON) {
      const at = end + half;
      boundaries.push([
        { cuts: [at], end: clamp(at - half), start: hi, waste: between(clamp(at + half), hi) },
        { cuts: [], end: hi, start: hi, waste: null },
      ]);
    } else boundaries.push([{ cuts: [], end: hi, start: hi, waste: null }]);

    const cutCost = (boundary: Boundary, start: number, released: () => Rect): Cost => {
      const count = boundary.cuts.length;
      let noTool = 0;
      if (canCut) {
        let piece = start;
        boundary.cuts.forEach((at, i) => {
          const remainder = Math.min(hi, Math.max(piece, at + half));
          const cut = { axis, stage, length, piece: withSpan(rect, axis, piece, hi), released: i === 0 ? released() : boundary.waste!, remainder: withSpan(rect, axis, remainder, hi) };
          if (!canCut(cut)) noTool++;
          piece = remainder;
        });
      }
      return { stuck: 0, noTool, offcut: offcutOf(boundary.waste), length: count * length, cuts: count };
    };

    // tail[b][o]: the best cost of run b and everything after it, when option o of boundary b starts run b.
    const tail: (Step | undefined)[][] = boundaries.map(() => []);
    for (let b = last; b >= 0; b--) {
      const options = boundaries[b]!;
      const nexts = boundaries[b + 1]!;
      for (let o = 0; o < options.length; o++) {
        const option = options[o]!;
        let best: Step | undefined;
        for (let n = 0; n < nexts.length; n++) {
          const next = nexts[n]!;
          if (last === 0 && option.cuts.length === 0 && next.cuts.length === 0) continue;
          const after = b < last ? tail[b + 1]![n] : undefined;
          if (b < last && !after) continue;
          let cost = plus(pieceCost(rect, axis, option.start, next.end, runs[b]!.group, stage + 1), cutCost(next, option.start, () => between(option.start, next.end)));
          if (after) cost = plus(cost, after.cost);
          if (!best || compareCost(cost, best.cost) < 0) best = { cost, next: n };
        }
        tail[b]![o] = best;
      }
    }

    let chosen: Step | undefined;
    boundaries[0]!.forEach((option, o) => {
      const rest = tail[0]![o];
      if (!rest) return;
      const cost = option.waste ? plus(rest.cost, cutCost(option, lo, () => option.waste!)) : rest.cost;
      if (!chosen || compareCost(cost, chosen.cost) < 0) chosen = { cost, next: o };
    });
    if (!chosen) return null;

    const head = boundaries[0]![0]!;
    const foot = boundaries[last + 1]![0]!;
    if (last > 0 && (head.cuts.length > 0 || foot.cuts.length > 0)) {
      const inner = between(head.start, foot.end);
      let cost = plus(pieceCost(rect, axis, head.start, foot.end, group, stage + 1), cutCost(foot, head.start, () => inner));
      if (head.waste) cost = plus(cost, cutCost(head, lo, () => head.waste!));
      if (compareCost(cost, chosen.cost) < 0) {
        const pieces: Piece[] = [];
        if (head.waste) pieces.push({ rect: head.waste, group: NO_ITEMS });
        pieces.push({ rect: inner, group });
        if (foot.waste) pieces.push({ rect: foot.waste, group: NO_ITEMS });
        return { cost, cuts: [...head.cuts, ...foot.cuts], pieces };
      }
    }

    const cuts: number[] = [];
    const pieces: Piece[] = [];
    let index = chosen.next;
    for (let b = 0; b <= last; b++) {
      const option = boundaries[b]![index]!;
      cuts.push(...option.cuts);
      if (option.waste) pieces.push({ rect: option.waste, group: NO_ITEMS });
      index = tail[b]![index]!.next;
      pieces.push({ rect: between(option.start, boundaries[b + 1]![index]!.end), group: runs[b]!.group });
    }
    const option = boundaries[last + 1]![index]!;
    cuts.push(...option.cuts);
    if (option.waste) pieces.push({ rect: option.waste, group: NO_ITEMS });
    return { cost: chosen.cost, cuts, pieces };
  };

  const build: Build = (rect, group, stage, prefer, stuck) => {
    const { items } = group;
    if (items.length === 0) return { kind: "waste", rect, stage };
    const only = items.length === 1 ? items[0]! : undefined;
    if (only && sameRect(only.rect, rect)) return { kind: "part", rect, stage, item: only.index };
    const { plans } = solve(rect, group, stage);
    let axis: Axis | null = null;
    for (const candidate of [prefer, otherAxis(prefer)]) {
      const p = plans[candidate];
      if (p && (axis === null || compareCost(p.cost, plans[axis]!.cost) < 0)) axis = candidate;
    }
    const indices = items.map((item) => item.index);
    if (axis === null) {
      stuck.push(indices);
      return { kind: "stuck", rect, stage, items: indices };
    }
    const { cuts, pieces } = plans[axis]!;
    const children = pieces.map((piece) => build(piece.rect, piece.group, stage + 1, otherAxis(axis), stuck));
    return { kind: "split", rect, stage, axis, cuts, children, items: indices };
  };
  return build;
}

const lengths = new Float64Array(16);
const counts = new Int32Array(16);
const offcuts = new Float64Array(16);

/** The cost of cutting one part free from a piece that contains it: each edge with waste takes one cut. */
function singleCost(x: number, y: number, length: number, width: number, part: Rect, kerf: number, minOffcut: Size | undefined): Cost {
  const waste = [part.x - x, x + length - part.x - part.length, part.y - y, y + width - part.y - part.width];
  let full = 0;
  for (let side = 0; side < 4; side++) if (waste[side]! > EPSILON) full |= 1 << side;
  lengths[0] = 0;
  counts[0] = 0;
  offcuts[0] = 0;
  for (let mask = 1; mask <= full; mask++) {
    if ((mask & full) !== mask) continue;
    const across = [part.width + (mask & 4 ? waste[2]! : 0) + (mask & 8 ? waste[3]! : 0), part.length + (mask & 1 ? waste[0]! : 0) + (mask & 2 ? waste[1]! : 0)];
    let best = Number.POSITIVE_INFINITY;
    let fewest = 0;
    let largest = 0;
    for (let a = 0; a < 2; a++) {
      const sides = a === 0 ? 3 : 12;
      const open = mask & sides;
      for (let cut = open; cut > 0; cut = (cut - 1) & open) {
        const n = cut === sides ? 2 : 1;
        const total = n * across[a]! + lengths[mask & ~cut]!;
        const cuts = n + counts[mask & ~cut]!;
        const shorter = total < best - EPSILON || (Math.abs(total - best) <= EPSILON && cuts < fewest);
        let offcut = 0;
        if (minOffcut) {
          offcut = offcuts[mask & ~cut]!;
          for (let side = 2 * a; side < 2 * a + 2; side++) {
            if (!(cut & (1 << side))) continue;
            const piece = { length: Math.max(0, waste[side]! - kerf), width: across[a]! };
            if (fitsWithin(minOffcut, piece)) offcut = Math.max(offcut, piece.length * piece.width);
          }
        }
        if (minOffcut ? offcut - largest > EPSILON || (Math.abs(offcut - largest) <= EPSILON && shorter) : shorter) {
          best = total;
          fewest = cuts;
          largest = offcut;
        }
      }
    }
    lengths[mask] = best;
    counts[mask] = fewest;
    offcuts[mask] = largest;
  }
  return { stuck: 0, noTool: 0, offcut: offcuts[full]!, length: lengths[full]!, cuts: counts[full]! };
}

/** Groups the parts into runs along the axis: parts closer than the kerf share a run. */
function runsAlong(group: Group, axis: Axis, kerf: number): Run[] {
  const sorted = group[axis];
  const runs: Run[] = [];
  const sizes: number[] = [];
  for (const item of sorted) {
    const [start, end] = item[axis];
    const last = runs.at(-1);
    if (last && start - last.end < kerf - EPSILON) {
      last.end = Math.max(last.end, end);
      sizes[runs.length - 1]!++;
    } else {
      runs.push({ start, end, group: item.alone });
      sizes.push(1);
    }
    item.run = runs.length - 1;
  }
  if (runs.length === 1) {
    runs[0]!.group = group;
    return runs;
  }
  const many = runs.map((_, i) => (sizes[i]! > 1 ? { items: [] as Item[], x: [] as Item[], y: [] as Item[], runs: {} } : null));
  for (const key of ["items", "x", "y"] as const) {
    for (const item of group[key]) many[item.run]?.[key].push(item);
  }
  runs.forEach((run, i) => {
    if (many[i]) run.group = many[i];
  });
  return runs;
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
