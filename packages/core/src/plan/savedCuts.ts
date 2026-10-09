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
