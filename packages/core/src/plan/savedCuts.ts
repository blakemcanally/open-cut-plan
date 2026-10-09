import type { SavedCut } from "../format/schema.ts";
import { contains, EPSILON, otherAxis, sameRect, span, withSpan, type Axis, type Rect } from "../geometry/rect.ts";
import type { CutNode, CutTree, TreeItem } from "./cutTree.ts";

/** The cut lines of the tree in the sheet order of the sequence, without the trims. */
export function treeLines(tree: CutTree): SavedCut[] {
  const lines: SavedCut[] = [];
  const walk = (node: CutNode): void => {
    if (node.kind !== "split") return;
    const [from, to] = span(node.rect, otherAxis(node.axis));
    for (const at of node.cuts) lines.push({ axis: node.axis, at, from, to });
    node.children.forEach(walk);
  };
  walk(tree.root);
  return lines;
}

const near = (a: number, b: number) => Math.abs(a - b) <= EPSILON;

function lineInside(rect: Rect, line: SavedCut): boolean {
  const [lo, hi] = span(rect, line.axis);
  const [from, to] = span(rect, otherAxis(line.axis));
  return line.at >= lo - EPSILON && line.at <= hi + EPSILON && line.from >= from - EPSILON && line.to <= to + EPSILON;
}

/**
 * The tree that the lines make in `region`, or null when they do not pass the check. In each piece, the lines that go
 * fully across it on one axis split it; a piece with such lines on both axes fails. Each line must be in the region and
 * be used, no line with its kerf may go through an item, and each piece with an item must hold that item only and be
 * its size.
 */
export function rebuildTree(region: Rect, lines: readonly SavedCut[], items: readonly TreeItem[], kerf: number): CutNode | null {
  const half = kerf / 2;
  const build = (rect: Rect, inside: readonly SavedCut[], members: readonly TreeItem[], stage: number): CutNode | null => {
    const across = (axis: Axis) => {
      const [from, to] = span(rect, otherAxis(axis));
      return inside.filter((line) => line.axis === axis && near(line.from, from) && near(line.to, to));
    };
    const x = across("x");
    const y = across("y");
    if (x.length > 0 && y.length > 0) return null;
    const splits = x.length > 0 ? x : y;
    if (splits.length === 0) {
      if (inside.length > 0) return null;
      if (members.length === 0) return { kind: "waste", rect, stage };
      if (members.length === 1 && sameRect(members[0]!.rect, rect)) return { kind: "part", rect, stage, item: members[0]!.index };
      return null;
    }
    const axis = splits[0]!.axis;
    const [lo, hi] = span(rect, axis);
    const clamp = (value: number) => Math.min(hi, Math.max(lo, value));
    const cuts = splits.map((line) => line.at).sort((a, b) => a - b);
    if (cuts.some((at, i) => i > 0 && at - cuts[i - 1]! <= EPSILON)) return null;
    const rest = inside.filter((line) => !splits.includes(line));
    const children: CutNode[] = [];
    let lineCount = 0;
    let memberCount = 0;
    let start = lo;
    for (let i = 0; i <= cuts.length; i++) {
      const end = i < cuts.length ? clamp(cuts[i]! - half) : hi;
      const piece = withSpan(rect, axis, start, Math.max(start, end));
      const childLines = rest.filter((line) => lineInside(piece, line));
      const childMembers = members.filter((member) => contains(piece, member.rect));
      lineCount += childLines.length;
      memberCount += childMembers.length;
      const child = build(piece, childLines, childMembers, stage + 1);
      if (!child) return null;
      children.push(child);
      if (i < cuts.length) start = clamp(cuts[i]! + half);
    }
    if (lineCount !== rest.length || memberCount !== members.length) return null;
    return { kind: "split", rect, stage, axis, cuts, children, items: members.map((member) => member.index) };
  };
  const inside = lines.filter((line) => lineInside(region, line));
  const members = items.filter((item) => contains(region, item.rect));
  if (inside.length !== lines.length || members.length !== items.length) return null;
  return build(region, inside, members, 1);
}

export interface TreeLine {
  line: SavedCut;
  /** The index in the list of the cut that makes the piece of this cut, or null when the trims make it. */
  requires: number | null;
}

/** The cut lines of the tree in the sheet order of the sequence, each with the cut that it needs first. */
export function treeCutLines(root: CutNode): TreeLine[] {
  const out: TreeLine[] = [];
  const walk = (node: CutNode, parent: number | null): void => {
    if (node.kind !== "split") return;
    const [from, to] = span(node.rect, otherAxis(node.axis));
    const made: number[] = [];
    let previous = parent;
    for (const at of node.cuts) {
      out.push({ line: { axis: node.axis, at, from, to }, requires: previous });
      previous = out.length - 1;
      made.push(previous);
    }
    node.children.forEach((child, i) => walk(child, i < made.length ? made[i]! : previous));
  };
  walk(root, null);
  return out;
}

const sameCut = (a: SavedCut, b: SavedCut) => a.axis === b.axis && near(a.at, b.at) && near(a.from, b.from) && near(a.to, b.to);

/**
 * The lines of the tree in an order that the shop can follow: each cut after the cut that makes its piece. It keeps
 * the order of `preferred` where it can; a line that is not in `preferred` goes at its place in the sheet order.
 * Each line keeps the fields of its match in `preferred`, such as `locked`.
 */
export function orderLines(root: CutNode, preferred: readonly SavedCut[]): SavedCut[] {
  const cuts = treeCutLines(root);
  const ranks = cuts.map((cut, i) => {
    const index = preferred.findIndex((line) => sameCut(line, cut.line));
    return index < 0 ? { rank: i, line: cut.line } : { rank: index, line: preferred[index]! };
  });
  const done = new Set<number>();
  const order: SavedCut[] = [];
  while (order.length < cuts.length) {
    let best = -1;
    for (const [i, cut] of cuts.entries()) {
      if (done.has(i) || (cut.requires !== null && !done.has(cut.requires))) continue;
      if (best < 0 || ranks[i]!.rank < ranks[best]!.rank) best = i;
    }
    done.add(best);
    order.push(ranks[best]!.line);
  }
  return order;
}

/** True when each line comes after the line that makes its piece. */
export function linesInOrder(root: CutNode, lines: readonly SavedCut[]): boolean {
  const cuts = treeCutLines(root);
  const position = cuts.map((cut) => lines.findIndex((line) => sameCut(line, cut.line)));
  return cuts.every((cut, i) => position[i]! >= 0 && (cut.requires === null || position[cut.requires]! < position[i]!));
}
