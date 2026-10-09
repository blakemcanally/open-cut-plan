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
  const group = rootGroup(items);
  const root = treeBuilder(kerf, undefined, minOffcut, fastControl())(region, group, 1, "y", stuck);
  if (!canCut || countNoTool(root, kerf, canCut, 1) === 0) return { trims, root, stuck };
  const again: number[][] = [];
  return { trims, root: treeBuilder(kerf, canCut, minOffcut, fastControl())(region, group, 1, "y", again), stuck: again };
}

/** A cut line that Optimize cuts must keep: the same axis, position, and extent. */
export interface LockedLine {
  axis: Axis;
  at: number;
  from: number;
  to: number;
}

export interface TreeSearch {
  /** The best tree when a split can join up to `join` next runs, or null when `deadline` comes first. */
  run(join: number, deadline?: number): { tree: CutTree; limited: boolean } | null;
}

/**
 * The thorough search of Optimize cuts. It compares trees by stuck parts, then cuts that `canCut` rejects, then the cut
 * count, then the cut length. A split can join a range of up to `join` next runs into one piece. `limited` is true
 * when some piece had more runs than the split could join, so that a larger `join` can find a better tree. A run that
 * stops at its deadline keeps its memo, so that the next run with the same `join` continues from it.
 *
 * A split never goes through a line of `locked`, never cuts on its line where the line does not go fully across the
 * piece, and always cuts on it where it does. A locked line in a waste piece is not kept, so the caller must check the
 * result.
 */
export function createTreeSearch(sheet: Rect, items: readonly TreeItem[], kerf: number, trim: number, canCut?: (cut: TreeCut) => boolean, now: () => number = Date.now, locked: readonly LockedLine[] = []): TreeSearch {
  const trims = trim > 0 ? trimCuts(sheet, trim, kerf) : [];
  const region = trim > 0 ? inset(sheet, trim) : sheet;
  const group = rootGroup(items);
  let current: { join: number; control: Control; plain: Build; tooled: Build | undefined } | null = null;
  return {
    run(join, deadline) {
      if (current?.join !== join) {
        const control: Control = { join, cutsFirst: true, deadline: undefined, now, limited: false, ticks: 0 };
        current = { join, control, plain: treeBuilder(kerf, undefined, undefined, control, locked), tooled: canCut ? treeBuilder(kerf, canCut, undefined, control, locked) : undefined };
      }
      const { control, plain, tooled } = current;
      control.deadline = deadline;
      try {
        let stuck: number[][] = [];
        let root = plain(region, group, 1, "y", stuck);
        if (tooled && countNoTool(root, kerf, canCut!, 1) > 0) {
          stuck = [];
          root = tooled(region, group, 1, "y", stuck);
        }
        return { tree: { trims, root, stuck }, limited: control.limited };
      } catch (error) {
        if (error === ABORTED) return null;
        throw error;
      }
    },
  };
}

export interface TreeMeasure {
  /** Parts in stuck groups. */
  stuck: number;
  noTool: number;
  /** Cuts, trims included. */
  cuts: number;
  /** Total cut length, trims included. */
  length: number;
}

export function measureTree(tree: CutTree, kerf: number, canCut?: (cut: TreeCut) => boolean): TreeMeasure {
  let cuts = tree.trims.length;
  let length = 0;
  for (const trim of tree.trims) {
    const [from, to] = span(trim.piece, otherAxis(trim.axis));
    length += to - from;
  }
  const walk = (node: CutNode): void => {
    if (node.kind !== "split") return;
    const [from, to] = span(node.rect, otherAxis(node.axis));
    cuts += node.cuts.length;
    length += node.cuts.length * (to - from);
    node.children.forEach(walk);
  };
  walk(tree.root);
  return { stuck: tree.stuck.reduce((sum, group) => sum + group.length, 0), noTool: canCut ? countNoTool(tree.root, kerf, canCut) : 0, cuts, length };
}

/** Stuck parts, then cuts with no tool, then the cut count, then the cut length. */
export function compareMeasures(a: TreeMeasure, b: TreeMeasure): number {
  if (a.stuck !== b.stuck) return a.stuck - b.stuck;
  if (a.noTool !== b.noTool) return a.noTool - b.noTool;
  if (a.cuts !== b.cuts) return a.cuts - b.cuts;
  if (Math.abs(a.length - b.length) > EPSILON) return a.length - b.length;
  return 0;
}

/** The cuts of the subtree that `canCut` rejects, counted up to `limit`. */
export function countNoTool(node: CutNode, kerf: number, canCut: (cut: TreeCut) => boolean, limit = Number.POSITIVE_INFINITY): number {
  if (node.kind !== "split") return 0;
  const [lo, hi] = span(node.rect, node.axis);
  const [from, to] = span(node.rect, otherAxis(node.axis));
  let count = 0;
  let start = lo;
  for (const [i, at] of node.cuts.entries()) {
    const remainder = Math.min(hi, Math.max(start, at + kerf / 2));
    const cut = { axis: node.axis, stage: node.stage, length: to - from, piece: withSpan(node.rect, node.axis, start, hi), released: node.children[i]!.rect, remainder: withSpan(node.rect, node.axis, remainder, hi) };
    if (!canCut(cut) && ++count >= limit) return count;
    start = remainder;
  }
  for (const child of node.children) {
    count += countNoTool(child, kerf, canCut, limit - count);
    if (count >= limit) return count;
  }
  return count;
}

function rootGroup(items: readonly TreeItem[]): Group {
  const inner = items.map((item): Item => {
    const it: Item = { ...item, x: span(item.rect, "x"), y: span(item.rect, "y"), run: 0, alone: NO_ITEMS };
    it.alone = { items: [it], x: [it], y: [it], runs: {} };
    return it;
  });
  return { items: inner, x: inner.toSorted((a, b) => a.x[0] - b.x[0]), y: inner.toSorted((a, b) => a.y[0] - b.y[0]), runs: {} };
}

interface Control {
  /** The most next runs that one piece of a split can hold. */
  join: number;
  cutsFirst: boolean;
  deadline: number | undefined;
  now: () => number;
  limited: boolean;
  ticks: number;
}

function fastControl(): Control {
  return { join: 1, cutsFirst: false, deadline: undefined, now: Date.now, limited: false, ticks: 0 };
}

const ABORTED = new Error("The cut search reached its deadline.");

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
  /** The last run in the piece that the step starts. */
  to: number;
}

type Build = (rect: Rect, group: Group, stage: number, prefer: Axis, stuck: number[][]) => CutNode;

function treeBuilder(kerf: number, canCut: ((cut: TreeCut) => boolean) | undefined, minOffcut: Size | undefined, control: Control, locked: readonly LockedLine[] = []): Build {
  const half = kerf / 2;
  const linesIn = (rect: Rect) => (locked.length === 0 ? locked : locked.filter((line) => lineWithin(rect, line)));
  const memo = new Map<number, Known[]>();
  const compareCost = control.cutsFirst ? compareMeasures : minOffcut ? compareOffcutFirst : compareLength;
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
    if (control.deadline !== undefined && control.ticks++ % 64 === 0 && control.now() >= control.deadline) throw ABORTED;
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
      if (!canCut && length > EPSILON && width > EPSILON && contains({ x, y, length, width }, part) && linesIn({ x, y, length, width }).length === 0) {
        return singleCost(x, y, length, width, part, kerf, minOffcut);
      }
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
    if (runs.length > control.join) control.limited = true;

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

    const forced = boundaries.map(() => false);
    const blocked = boundaries.map(() => false);
    const lines = linesIn(rect);
    if (lines.length > 0 && !lockBoundaries(lines, rect, axis, runs, boundaries, forced, blocked, kerf)) return null;

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

    const unions = new Map<number, Group>();
    const groupOf = (b: number, e: number): Group => {
      if (b === e) return runs[b]!.group;
      if (b === 0 && e === last) return group;
      const key = b * runs.length + e;
      let union = unions.get(key);
      if (!union) {
        const members = new Set(runs.slice(b, e + 1).flatMap((run) => run.group.items));
        const keep = (item: Item) => members.has(item);
        union = { items: group.items.filter(keep), x: group.x.filter(keep), y: group.y.filter(keep), runs: {} };
        unions.set(key, union);
      }
      return union;
    };

    // tail[b][o]: the best cost of run b and everything after it, when option o of boundary b starts run b.
    const tail: (Step | undefined)[][] = boundaries.map(() => []);
    for (let b = last; b >= 0; b--) {
      const options = boundaries[b]!;
      for (let o = 0; o < options.length; o++) {
        const option = options[o]!;
        let best: Step | undefined;
        for (let e = b, joined = 1; e <= last; e++) {
          if (e > b) {
            if (forced[e]) break;
            if (!blocked[e]) joined++;
          }
          if (joined > control.join) break;
          const nexts = boundaries[e + 1]!;
          for (let n = 0; n < nexts.length; n++) {
            const next = nexts[n]!;
            if (b === 0 && e === last && option.cuts.length === 0 && next.cuts.length === 0) continue;
            const after = e < last ? tail[e + 1]![n] : undefined;
            if (e < last && !after) continue;
            let cost = plus(pieceCost(rect, axis, option.start, next.end, groupOf(b, e), stage + 1), cutCost(next, option.start, () => between(option.start, next.end)));
            if (after) cost = plus(cost, after.cost);
            if (!best || compareCost(cost, best.cost) < 0) best = { cost, next: n, to: e };
          }
        }
        tail[b]![o] = best;
      }
    }

    let chosen: Step | undefined;
    boundaries[0]!.forEach((option, o) => {
      const rest = tail[0]![o];
      if (!rest) return;
      const cost = option.waste ? plus(rest.cost, cutCost(option, lo, () => option.waste!)) : rest.cost;
      if (!chosen || compareCost(cost, chosen.cost) < 0) chosen = { cost, next: o, to: -1 };
    });
    if (!chosen) return null;

    const head = boundaries[0]![0]!;
    const foot = boundaries[last + 1]![0]!;
    if (last > 0 && (head.cuts.length > 0 || foot.cuts.length > 0) && !forced.slice(1, last + 1).some(Boolean)) {
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
    for (let b = 0; b <= last; ) {
      const option = boundaries[b]![index]!;
      cuts.push(...option.cuts);
      if (option.waste) pieces.push({ rect: option.waste, group: NO_ITEMS });
      const step = tail[b]![index]!;
      index = step.next;
      pieces.push({ rect: between(option.start, boundaries[step.to + 1]![index]!.end), group: groupOf(b, step.to) });
      b = step.to + 1;
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

/** True when the line is inside the rect, and not on its edge. */
function lineWithin(rect: Rect, line: LockedLine): boolean {
  const [lo, hi] = span(rect, line.axis);
  const [from, to] = span(rect, otherAxis(line.axis));
  return line.at > lo + EPSILON && line.at < hi - EPSILON && line.from >= from - EPSILON && line.to <= to + EPSILON;
}

/**
 * Limits the cut options of a split along `axis` to those that keep the locked lines of the piece. A boundary whose
 * every option goes through a line is blocked, so that the runs at its sides stay in one piece. A boundary with a line
 * that goes fully across the piece is forced, and each of its options cuts on that line. False when no split along the
 * axis keeps the lines.
 */
function lockBoundaries(lines: readonly LockedLine[], rect: Rect, axis: Axis, runs: readonly Run[], boundaries: Boundary[][], forced: boolean[], blocked: boolean[], kerf: number): boolean {
  const half = kerf / 2;
  const [lo, hi] = span(rect, axis);
  const [from, to] = span(rect, otherAxis(axis));
  const clamp = (value: number) => Math.min(hi, Math.max(lo, value));
  const near = (a: number, b: number) => Math.abs(a - b) <= EPSILON;
  const across = lines.filter((line) => line.axis !== axis);
  const along = lines.filter((line) => line.axis === axis);
  const full = along.filter((line) => near(line.from, from) && near(line.to, to)).map((line) => line.at);
  const banned = along.filter((line) => !near(line.from, from) || !near(line.to, to)).map((line) => line.at);
  const allowed = (at: number) =>
    !across.some((line) => at + half > line.from + EPSILON && at - half < line.to - EPSILON) && !banned.some((b) => Math.abs(at - b) <= Math.max(EPSILON, kerf - EPSILON));
  const last = runs.length - 1;
  const gap = (k: number): [number, number] => [k === 0 ? lo : runs[k - 1]!.end, k === last + 1 ? hi : runs[k]!.start];
  const required: number[][] = boundaries.map(() => []);
  for (const at of full) {
    const k = boundaries.findIndex((_, i) => {
      const [start, end] = gap(i);
      return at >= start - EPSILON && at <= end + EPSILON;
    });
    if (k < 0) return false;
    required[k]!.push(at);
  }
  for (const [k, options] of boundaries.entries()) {
    const need = required[k]!;
    let kept = options.filter((option) => option.cuts.every(allowed) && need.every((at) => option.cuts.some((cut) => near(cut, at))));
    if (kept.length === 0 && need.length === 1) {
      const at = need[0]!;
      const end = k === 0 ? lo : clamp(at - half);
      const start = k === last + 1 ? hi : clamp(at + half);
      const waste = k === 0 ? withSpan(rect, axis, lo, clamp(at - half)) : k === last + 1 ? withSpan(rect, axis, clamp(at + half), hi) : null;
      kept = [{ cuts: [at], end, start, waste }];
    }
    if (need.length > 0 && kept.length === 0) return false;
    forced[k] = need.length > 0;
    blocked[k] = kept.length === 0;
    boundaries[k] = kept;
  }
  return !blocked[0] && !blocked[last + 1];
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
