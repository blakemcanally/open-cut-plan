import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import {
  analyzeSheets,
  buildCutTree,
  nodeItems,
  parseProject,
  planContext,
  span,
  otherAxis,
  type CutNode,
  type Rect,
  type TreeItem,
} from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

const r = (x: number, y: number, length: number, width: number): Rect => ({ x, y, length, width });
const items = (...rects: Rect[]): TreeItem[] => rects.map((rect, index) => ({ index, rect }));

function parts(node: CutNode): number[] {
  if (node.kind === "part") return [node.item];
  if (node.kind === "split") return node.children.flatMap(parts);
  return [];
}

function wastes(node: CutNode): Rect[] {
  if (node.kind === "waste") return [node.rect];
  if (node.kind === "split") return node.children.flatMap(wastes);
  return [];
}

describe("buildCutTree", () => {
  it("returns a part leaf when the part fills the region", () => {
    const tree = buildCutTree(r(0, 0, 10, 5), items(r(0, 0, 10, 5)), 0.125, 0);
    expect(tree).toEqual({ trims: [], root: { kind: "part", rect: r(0, 0, 10, 5), stage: 1, item: 0 }, stuck: [] });
  });

  it("trims each factory edge first, with the kerf inside the trim", () => {
    const tree = buildCutTree(r(0, 0, 96, 48), items(r(0.25, 0.25, 95.5, 47.5)), 0.125, 0.25);
    expect(tree.trims.map((cut) => [cut.axis, cut.at])).toEqual([
      ["y", 0.1875],
      ["y", 47.8125],
      ["x", 0.1875],
      ["x", 95.8125],
    ]);
    expect(tree.trims[0]!.released).toEqual(r(0, 0, 96, 0.125));
    expect(tree.trims[1]!.piece).toEqual(r(0, 0.25, 96, 47.75));
    expect(tree.trims[3]!.remainder).toEqual(r(0.25, 0.25, 95.5, 47.5));
    expect(tree.root).toMatchObject({ kind: "part", item: 0 });
  });

  it("gives zero-size trim strips when the trim is narrower than the kerf", () => {
    const tree = buildCutTree(r(0, 0, 100, 50), items(r(1, 1, 98, 48)), 3, 1);
    expect(tree.trims.map((cut) => cut.released.width * cut.released.length)).toEqual([0, 0, 0, 0]);
    expect(tree.root).toMatchObject({ kind: "part" });
  });

  it("rips strips first and crosscuts inside them", () => {
    const k = 0.125;
    const tree = buildCutTree(r(0, 0, 20 + k, 10 + k + 5), items(r(0, 0, 10, 10), r(10 + k, 0, 10, 10), r(0, 10 + k, 20 + k, 5)), k, 0);
    expect(tree.stuck).toEqual([]);
    expect(tree.root).toMatchObject({ kind: "split", axis: "y", stage: 1, cuts: [10 + k / 2] });
    const root = tree.root as Extract<CutNode, { kind: "split" }>;
    expect(root.children[0]).toMatchObject({ kind: "split", axis: "x", stage: 2, cuts: [10 + k / 2] });
    expect(root.children[1]).toMatchObject({ kind: "part", item: 2, stage: 2 });
  });

  it("crosscuts first when no rip runs across the sheet", () => {
    const tree = buildCutTree(r(0, 0, 21, 10), items(r(0, 0, 10, 4), r(0, 5, 10, 5), r(11, 0, 10, 10)), 1, 0);
    expect(tree.root).toMatchObject({ kind: "split", axis: "x", stage: 1, cuts: [10.5] });
  });

  it("cuts waste away from a part with one cut per side", () => {
    const tree = buildCutTree(r(0, 0, 50, 40), items(r(0, 0, 30, 12)), 0.125, 0);
    expect(tree.root).toMatchObject({ kind: "split", axis: "y", cuts: [12.0625] });
    const root = tree.root as Extract<CutNode, { kind: "split" }>;
    expect(root.children[0]).toMatchObject({ kind: "split", axis: "x", cuts: [30.0625] });
    expect(wastes(tree.root)).toEqual([r(30.125, 0, 19.875, 12), r(0, 12.125, 50, 27.875)]);
  });

  it("separates touching parts when the kerf is 0", () => {
    const tree = buildCutTree(r(0, 0, 20, 10), items(r(0, 0, 10, 10), r(10, 0, 10, 10)), 0, 0);
    expect(tree.root).toMatchObject({ kind: "split", axis: "x", cuts: [10] });
    expect(parts(tree.root)).toEqual([0, 1]);
  });

  it("uses two cuts, with a zero-size waste piece, when a gap is between one and two kerfs", () => {
    const tree = buildCutTree(r(0, 0, 10, 21.5), items(r(0, 0, 10, 10), r(0, 11.5, 10, 10)), 1, 0);
    const root = tree.root as Extract<CutNode, { kind: "split" }>;
    expect(root.cuts).toEqual([10.5, 11]);
    expect(root.children[1]).toEqual({ kind: "waste", rect: r(0, 11, 10, 0), stage: 2 });
  });

  it("reports parts closer than the kerf as stuck", () => {
    const tree = buildCutTree(r(0, 0, 10, 20.5), items(r(0, 0, 10, 10), r(0, 10.5, 10, 10)), 1, 0);
    expect(tree.stuck).toEqual([[0, 1]]);
  });

  it("reports a pinwheel as stuck", () => {
    const pinwheel = items(r(0, 0, 2, 1), r(2, 0, 1, 2), r(1, 2, 2, 1), r(0, 1, 1, 2), r(1, 1, 1, 1));
    const tree = buildCutTree(r(0, 0, 3, 3), pinwheel, 0, 0);
    expect(tree.root.kind).toBe("stuck");
    expect(tree.stuck).toEqual([[0, 1, 2, 3, 4]]);
  });

  it("frees a crosscut that is valid only after a rip", () => {
    const tree = buildCutTree(r(0, 0, 20, 10), items(r(0, 0, 8, 5), r(12, 5, 8, 5)), 0, 0);
    expect(tree.stuck).toEqual([]);
    expect(tree.root).toMatchObject({ kind: "split", axis: "y", cuts: [5] });
  });

  it("accepts random guillotine layouts and never cuts through a part", () => {
    fc.assert(
      fc.property(fc.integer(), fc.constantFrom(0, 0.125, 0.25), (seed, kerf) => {
        const random = mulberry32(seed);
        const region = r(0, 0, 96, 48);
        const rects: Rect[] = [];
        guillotine(random, region, kerf, 5, rects);
        const tree = buildCutTree(region, items(...rects), kerf, 0);
        expect(tree.stuck).toEqual([]);
        expect(parts(tree.root).sort((a, b) => a - b)).toEqual(rects.map((_, i) => i));
        assertCutsMissParts(tree.root, rects, kerf);
      }),
      { numRuns: 300 },
    );
  });

  it("puts parts outside the usable area in stuck groups instead of splitting forever", () => {
    for (const rect of [r(200, 1, 30, 12), r(-50, 1, 30, 12), r(1, 0.05, 5, 0.1), r(50, 47.95, 5, 0.04)]) {
      const tree = buildCutTree(r(0, 0, 96, 48), items(r(1, 20, 10, 10), rect), 0.125, 0.25);
      expect(tree.stuck).toEqual([[1]]);
      expect(parts(tree.root)).toEqual([0]);
    }
  });

  it("terminates for random rectangles anywhere, and places every item exactly once", () => {
    const rect = fc.record({
      x: fc.double({ min: -120, max: 200, noNaN: true }),
      y: fc.double({ min: -60, max: 100, noNaN: true }),
      length: fc.double({ min: 0.01, max: 120, noNaN: true }),
      width: fc.double({ min: 0.01, max: 60, noNaN: true }),
    });
    fc.assert(
      fc.property(fc.array(rect, { maxLength: 8 }), fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 2, noNaN: true }), (rects, kerf, trim) => {
        const tree = buildCutTree(r(0, 0, 96, 48), items(...rects), kerf, trim);
        expect([...parts(tree.root), ...tree.stuck.flat()].sort((a, b) => a - b)).toEqual(rects.map((_, i) => i));
      }),
      { numRuns: 500 },
    );
  });
});

describe("analyzeSheets", () => {
  it("builds a tree for every sheet of the living-room shelf with no stuck parts", () => {
    const result = parseProject(EXAMPLES["living-room-shelf"]!());
    if (!result.ok) throw new Error("example did not load");
    const sheets = analyzeSheets(planContext(result.project));
    expect(sheets).toHaveLength(7);
    for (const sheet of sheets) {
      expect(sheet.tree.stuck).toEqual([]);
      expect(sheet.tree.trims).toHaveLength(4);
      expect(parts(sheet.tree.root)).toHaveLength(sheet.sheet.placements.length);
    }
  });

  it("skips bad placements and sheets with missing stock, and gives empty sheets no cuts", () => {
    const project = sampleProject();
    project.plan!.sheets[0]!.placements.push({ part: "gone", copy: 0, x: 50, y: 1, rotated: false });
    project.plan!.sheets[0]!.placements.push({ part: "side", copy: 7, x: 50, y: 20, rotated: false });
    project.plan!.sheets.push({ id: "s2", stock: "missing", placements: [] });
    project.plan!.sheets.push({ id: "s3", stock: "ply-4x8", placements: [{ part: "side", copy: 0, x: 1, y: 1, rotated: false }] });
    const sheets = analyzeSheets(planContext(project));
    expect(sheets.map((sheet) => [sheet.sheet.id, sheet.index, sheet.items.map((item) => item.index)])).toEqual([
      ["s1", 0, [0, 1]],
      ["s3", 2, []],
    ]);
    expect(sheets[1]!.tree).toEqual({ trims: [], root: { kind: "waste", rect: r(0, 0, 96, 48), stage: 1 }, stuck: [] });
    expect(nodeItems(sheets[0]!.tree.root)).toEqual([0, 1]);
  });

  it("keeps a copy for a later sheet when its first placement is on a sheet with missing stock", () => {
    const project = sampleProject();
    project.plan!.sheets.unshift({ id: "s0", stock: "missing", placements: [{ part: "side", copy: 0, x: 1, y: 1, rotated: false }] });
    const sheets = analyzeSheets(planContext(project));
    expect(sheets.map((sheet) => [sheet.sheet.id, sheet.items.map((item) => item.index)])).toEqual([["s1", [0, 1]]]);
  });
});

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function guillotine(random: () => number, rect: Rect, kerf: number, depth: number, out: Rect[]): void {
  const axis = random() < 0.5 ? "x" : "y";
  const size = axis === "x" ? rect.length : rect.width;
  const steps = Math.floor((size - kerf - 2) / 0.125);
  if (depth === 0 || steps < 1 || random() < 0.15) {
    if (random() < 0.8) out.push(rect);
    return;
  }
  const first = 1 + Math.floor(random() * steps) * 0.125;
  const [lo] = span(rect, axis);
  const a = axis === "x" ? { ...rect, length: first } : { ...rect, width: first };
  const b = axis === "x" ? { ...rect, x: lo + first + kerf, length: size - first - kerf } : { ...rect, y: lo + first + kerf, width: size - first - kerf };
  guillotine(random, a, kerf, depth - 1, out);
  guillotine(random, b, kerf, depth - 1, out);
}

function assertCutsMissParts(node: CutNode, rects: readonly Rect[], kerf: number): void {
  if (node.kind !== "split") return;
  const [lo, hi] = span(node.rect, otherAxis(node.axis));
  for (const at of node.cuts) {
    for (const index of node.items) {
      const [s, e] = span(rects[index]!, node.axis);
      const [os, oe] = span(rects[index]!, otherAxis(node.axis));
      const crossesLine = s < at + kerf / 2 - 1e-6 && e > at - kerf / 2 + 1e-6;
      const withinPiece = oe > lo + 1e-6 && os < hi - 1e-6;
      expect(crossesLine && withinPiece).toBe(false);
    }
  }
  node.children.forEach((child) => assertCutsMissParts(child, rects, kerf));
}
