import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import {
  analyzeProject,
  analyzeSheets,
  buildCutTree,
  fitsWithin,
  nodeItems,
  parseProject,
  planContext,
  totalCutLength,
  span,
  otherAxis,
  type CutNode,
  type Rect,
  type Size,
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

function cutLength(node: CutNode): number {
  if (node.kind !== "split") return 0;
  const [lo, hi] = span(node.rect, otherAxis(node.axis));
  return node.cuts.length * (hi - lo) + node.children.reduce((sum, child) => sum + cutLength(child), 0);
}

function cutCount(node: CutNode): number {
  return node.kind === "split" ? node.cuts.length + node.children.reduce((sum, child) => sum + cutCount(child), 0) : 0;
}

function maxStage(node: CutNode): number {
  return node.kind === "split" ? Math.max(node.stage, ...node.children.map(maxStage)) : 0;
}

const sortedGroups = (groups: number[][]) => groups.map((group) => [...group].sort((a, b) => a - b)).sort((a, b) => a[0]! - b[0]!);

function wastes(node: CutNode): Rect[] {
  if (node.kind === "waste") return [node.rect];
  if (node.kind === "split") return node.children.flatMap(wastes);
  return [];
}

function largestOffcut(node: CutNode, min: Size): number {
  return Math.max(0, ...wastes(node).filter((rect) => fitsWithin(min, rect)).map((rect) => rect.length * rect.width));
}

const MIN_OFFCUT: Size = { length: 12, width: 6 };

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

  it("crosscuts first when a part is in a corner, so the cuts across the waste are short", () => {
    const k = 0.125;
    const tree = buildCutTree(r(0, 0, 96, 48), items(r(0, 0, 20, 10)), k, 0);
    expect(tree.root).toMatchObject({ kind: "split", axis: "x", stage: 1, cuts: [20 + k / 2] });
    const root = tree.root as Extract<CutNode, { kind: "split" }>;
    expect(root.children[0]).toMatchObject({ kind: "split", axis: "y", stage: 2, cuts: [10 + k / 2] });
    expect(cutLength(tree.root)).toBe(48 + 20);
    expect(cutCount(tree.root)).toBe(2);
  });

  it("leaves the waste between two runs on the piece where a shorter cut removes it", () => {
    const tree = buildCutTree(r(0, 0, 100, 50), items(r(0, 0, 100, 20), r(0, 25, 10, 25)), 0, 0);
    expect(tree.root).toMatchObject({ kind: "split", axis: "y", stage: 1, cuts: [20] });
    const root = tree.root as Extract<CutNode, { kind: "split" }>;
    expect(root.children[0]).toMatchObject({ kind: "part", item: 0 });
    expect(root.children[1]).toMatchObject({ kind: "split", axis: "x", stage: 2, cuts: [10], rect: r(0, 20, 100, 30) });
    expect(cutLength(tree.root)).toBe(100 + 30 + 10);
  });

  it("leaves gaps between runs uncut, so that one rip removes a waste strip over a row of parts", () => {
    const k = 0.125;
    const h = 15.125;
    const top = h + k + 2.375;
    const bottom = top + h + k;
    const layout = items(
      r(0, 0, 27, h),
      r(27 + k, 0, 27, h),
      r(2 * (27 + k), 0, 27, h),
      r(0, top, 27, h),
      r(27 + k, top, 13.25, h),
      r(27 + 13.25 + 2 * k, top, 13.25, h),
      r(27 + 2 * 13.25 + 3 * k, top, 13.25, h),
      r(0, bottom, 42.5, h),
      r(42.5 + k, bottom, 42.5, h),
    );
    const tree = buildCutTree(r(0, 0, 96, 48), layout, k, 0);
    const row = 27 + 3 * 13.25 + 3 * k;
    expect(tree.root).toMatchObject({ kind: "split", axis: "y", cuts: [h + k / 2, bottom - k / 2] });
    const middle = (tree.root as Extract<CutNode, { kind: "split" }>).children[1]!;
    expect(middle).toMatchObject({ kind: "split", axis: "x", cuts: [row + k / 2] });
    const strip = (middle as Extract<CutNode, { kind: "split" }>).children[0]!;
    expect(strip).toMatchObject({ kind: "split", axis: "y", cuts: [top - k / 2], rect: { length: row } });
    expect(cutCount(tree.root)).toBe(12);
  });

  it("keeps the old tree when no tree has shorter cuts", () => {
    const k = 0.125;
    const tree = buildCutTree(r(0, 0, 20 + k, 10 + k + 5), items(r(0, 0, 10, 10), r(10 + k, 0, 10, 10), r(0, 10 + k, 20 + k, 5)), k, 0);
    expect(tree.root).toMatchObject({ kind: "split", axis: "y", stage: 1, cuts: [10 + k / 2] });
  });

  it("prefers a longer tree when the shorter one has a cut that no tool can make", () => {
    const k = 0.125;
    const tree = buildCutTree(r(0, 0, 96, 48), items(r(0, 0, 20, 10)), k, 0, (cut) => cut.axis === "y" || cut.length <= 30);
    expect(tree.root).toMatchObject({ kind: "split", axis: "y", cuts: [10 + k / 2] });
    expect(cutLength(tree.root)).toBe(96 + 10);
  });

  it("gives the tool check the cut as the sequence makes it", () => {
    const seen: string[] = [];
    buildCutTree(r(0, 0, 100, 50), items(r(0, 0, 100, 20), r(0, 25, 10, 25)), 0, 0, (cut) => {
      seen.push(`${cut.axis}${cut.stage} ${cut.length} ${JSON.stringify([cut.piece, cut.released, cut.remainder])}`);
      return true;
    });
    expect(seen).toContain(`y1 100 ${JSON.stringify([r(0, 0, 100, 50), r(0, 0, 100, 20), r(0, 20, 100, 30)])}`);
    expect(seen).toContain(`x2 30 ${JSON.stringify([r(0, 20, 100, 30), r(0, 20, 10, 30), r(10, 20, 90, 30)])}`);
  });

  it("uses no more stages than the tool check allows", () => {
    const layout = items(r(0, 0, 100, 20), r(0, 25, 10, 25));
    expect(maxStage(buildCutTree(r(0, 0, 100, 50), layout, 0, 0).root)).toBe(3);
    const tree = buildCutTree(r(0, 0, 100, 50), layout, 0, 0, (cut) => cut.stage <= 2);
    expect(maxStage(tree.root)).toBe(2);
    expect(tree.root).toMatchObject({ kind: "split", axis: "y", cuts: [20, 25] });
  });

  it("never has longer cuts than the old tree, cuts every part free, and finds the same stuck parts", () => {
    fc.assert(
      fc.property(fc.integer(), fc.constantFrom(0, 0.125, 0.25), (seed, kerf) => {
        const random = mulberry32(seed);
        const region = r(0, 0, 96, 48);
        const rects: Rect[] = [];
        guillotine(random, region, kerf, 6, rects);
        const tree = buildCutTree(region, items(...rects), kerf, 0);
        const old = oldTree(region, items(...rects), kerf);
        expect(cutLength(tree.root)).toBeLessThanOrEqual(cutLength(old.root) + 1e-6);
        expect(parts(tree.root).sort((a, b) => a - b)).toEqual(rects.map((_, i) => i));
        expect(sortedGroups(tree.stuck)).toEqual(sortedGroups(old.stuck));
      }),
      { numRuns: 300 },
    );
  });

  it("compares the largest offcut before the cut length when it has the minimum offcut", () => {
    const layout = items(r(0, 0, 50, 20));
    const shortest = buildCutTree(r(0, 0, 96, 48), layout, 0, 0);
    expect(shortest.root).toMatchObject({ kind: "split", axis: "x", cuts: [50] });
    expect([cutLength(shortest.root), largestOffcut(shortest.root, MIN_OFFCUT)]).toEqual([48 + 50, 46 * 48]);
    const offcut = buildCutTree(r(0, 0, 96, 48), layout, 0, 0, undefined, MIN_OFFCUT);
    expect(offcut.root).toMatchObject({ kind: "split", axis: "y", cuts: [20] });
    expect([cutLength(offcut.root), largestOffcut(offcut.root, MIN_OFFCUT)]).toEqual([96 + 20, 96 * 28]);
    expect(buildCutTree(r(0, 0, 96, 48), layout, 0, 0, undefined, { length: 97, width: 30 })).toEqual(shortest);
  });

  it("counts an offcut without the kerf, and only when it is at least the minimum offcut", () => {
    const k = 0.125;
    const layout = items(r(0, 0, 50, 20));
    const offcut = buildCutTree(r(0, 0, 96, 48), layout, k, 0, undefined, MIN_OFFCUT);
    expect(largestOffcut(offcut.root, MIN_OFFCUT)).toBeCloseTo(96 * (28 - k));
    expect(buildCutTree(r(0, 0, 96, 48), layout, k, 0, undefined, { length: 96, width: 28 })).toEqual(buildCutTree(r(0, 0, 96, 48), layout, k, 0));
  });

  it("never has a smaller largest offcut than the shortest tree or the old tree when it has the minimum offcut, and cuts every part free", () => {
    fc.assert(
      fc.property(fc.integer(), fc.constantFrom(0, 0.125, 0.25), fc.constantFrom(MIN_OFFCUT, { length: 30, width: 10 }), (seed, kerf, min) => {
        const random = mulberry32(seed);
        const region = r(0, 0, 96, 48);
        const rects: Rect[] = [];
        guillotine(random, region, kerf, 6, rects);
        const tree = buildCutTree(region, items(...rects), kerf, 0, undefined, min);
        const shortest = buildCutTree(region, items(...rects), kerf, 0);
        const old = oldTree(region, items(...rects), kerf);
        const largest = largestOffcut(tree.root, min);
        expect(largest).toBeGreaterThanOrEqual(largestOffcut(shortest.root, min) - 1e-6);
        expect(largest).toBeGreaterThanOrEqual(largestOffcut(old.root, min) - 1e-6);
        expect(sortedGroups(tree.stuck)).toEqual(sortedGroups(shortest.stuck));
        expect(parts(tree.root).sort((a, b) => a - b)).toEqual(rects.map((_, i) => i));
        assertCutsMissParts(tree.root, rects, kerf);
      }),
      { numRuns: 300 },
    );
  });

  it("finds the same stuck groups as the old tree for random rectangles on the sheet, and the same stuck parts anywhere", () => {
    const eighths = (min: number, max: number) => fc.integer({ min: min * 8, max: max * 8 }).map((n) => n / 8);
    const anywhere = fc.record({ x: eighths(-20, 100), y: eighths(-10, 50), length: eighths(0.125, 60), width: eighths(0.125, 30) });
    const onSheet = fc
      .record({ x: eighths(0, 95.875), y: eighths(0, 47.875) })
      .chain(({ x, y }) => fc.record({ x: fc.constant(x), y: fc.constant(y), length: eighths(0.125, 96 - x), width: eighths(0.125, 48 - y) }));
    const kerfs = fc.constantFrom(0, 0.125, 1);
    fc.assert(
      fc.property(fc.array(onSheet, { maxLength: 8 }), kerfs, (rects, kerf) => {
        const tree = buildCutTree(r(0, 0, 96, 48), items(...rects), kerf, 0);
        const old = oldTree(r(0, 0, 96, 48), items(...rects), kerf);
        expect(sortedGroups(tree.stuck)).toEqual(sortedGroups(old.stuck));
        expect(cutLength(tree.root)).toBeLessThanOrEqual(cutLength(old.root) + 1e-6);
      }),
      { numRuns: 500 },
    );
    fc.assert(
      fc.property(fc.array(anywhere, { maxLength: 8 }), kerfs, (rects, kerf) => {
        const tree = buildCutTree(r(0, 0, 96, 48), items(...rects), kerf, 0);
        const old = oldTree(r(0, 0, 96, 48), items(...rects), kerf);
        expect(tree.stuck.flat().sort((a, b) => a - b)).toEqual(old.stuck.flat().sort((a, b) => a - b));
        expect(cutLength(tree.root)).toBeLessThanOrEqual(cutLength(old.root) + 1e-6);
      }),
      { numRuns: 500 },
    );
  });

  it("terminates when a part edge is within the tolerance of a cut", () => {
    const tree = buildCutTree(r(0, 0, 96, 48), items(r(59.99999899999998, 0, 0.01, 0.01), r(0, 0, 59.99999999999998, 0.01)), 0, 0);
    expect(parts(tree.root).sort((a, b) => a - b)).toEqual([0, 1]);
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

  it("compares the largest offcut before the cut length when the optimizer goal is offcuts, the same in the offcuts, the steps, and the checks", () => {
    const project = sampleProject();
    project.settings.trim = 0;
    project.tools = [{ id: "ts", name: "Table saw", type: "table-saw", kerf: 0.125, enabled: true }];
    project.parts[0] = { ...project.parts[0]!, length: 50, width: 20, quantity: 1 };
    project.plan!.sheets[0]!.placements = [{ part: "side", copy: 0, x: 0, y: 0, rotated: false }];
    const withGoal = (goal: string, offcuts = true) => ({ ...project, settings: { ...project.settings, optimizer: { ...project.settings.optimizer, goal }, features: { ...project.settings.features, offcuts } } });
    expect(planContext(withGoal("offcuts")).treeGoal).toBe("offcuts");
    expect(planContext(withGoal("cost")).treeGoal).toBe("length");
    expect(planContext(withGoal("offcuts", false)).treeGoal).toBe("length");
    expect(planContext(withGoal("other")).treeGoal).toBe("length");
    const summary = (goal: string) => {
      const analysis = analyzeProject(withGoal(goal));
      return {
        axis: (analysis.sheets[0]!.tree.root as Extract<CutNode, { kind: "split" }>).axis,
        offcuts: analysis.offcuts.map((offcut) => [offcut.rect.length, offcut.rect.width]),
        steps: totalCutLength(analysis.steps),
        errors: analysis.issues.filter((issue) => issue.severity === "error").length,
      };
    };
    expect(summary("cost")).toMatchObject({ axis: "x", offcuts: [[50, 28 - 0.125], [46 - 0.125, 48]], errors: 0 });
    expect(summary("offcuts")).toMatchObject({ axis: "y", offcuts: [[46 - 0.125, 20], [96, 28 - 0.125]], steps: 96 + 20, errors: 0 });
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

function oldTree(rect: Rect, list: readonly TreeItem[], kerf: number): { root: CutNode; stuck: number[][] } {
  const stuck: number[][] = [];
  const split = (piece: Rect, inside: readonly TreeItem[], stage: number, prefer: "x" | "y"): CutNode => {
    if (inside.length === 0) return { kind: "waste", rect: piece, stage };
    const only = inside.length === 1 ? inside[0]! : undefined;
    if (only && Math.abs(only.rect.x - piece.x) <= 1e-6 && Math.abs(only.rect.y - piece.y) <= 1e-6 && Math.abs(only.rect.length - piece.length) <= 1e-6 && Math.abs(only.rect.width - piece.width) <= 1e-6) {
      return { kind: "part", rect: piece, stage, item: only.index };
    }
    if (piece.length > 1e-6 && piece.width > 1e-6) {
      for (const axis of [prefer, otherAxis(prefer)]) {
        const [lo, hi] = span(piece, axis);
        const intervals = inside.map((item) => span(item.rect, axis)).sort((a, b) => a[0] - b[0]);
        const merged: [number, number][] = [];
        for (const [start, end] of intervals) {
          const last = merged.at(-1);
          if (last && start - last[1] < kerf - 1e-6) last[1] = Math.max(last[1], end);
          else merged.push([start, end]);
        }
        const cuts: number[] = [];
        if (merged[0]![0] - lo > 1e-6) cuts.push(merged[0]![0] - kerf / 2);
        merged.forEach(([, end], i) => {
          const next = merged[i + 1];
          if (!next) {
            if (hi - end > 1e-6) cuts.push(end + kerf / 2);
            return;
          }
          cuts.push(end + kerf / 2);
          if (next[0] - end - kerf > 1e-6) cuts.push(next[0] - kerf / 2);
        });
        if (cuts.length === 0) continue;
        const clamp = (value: number) => Math.min(hi, Math.max(lo, value));
        const pieces = cuts.concat(Number.NaN).map((_, i) => {
          const start = clamp(i === 0 ? lo : cuts[i - 1]! + kerf / 2);
          const end = Math.max(start, clamp(i === cuts.length ? hi : cuts[i]! - kerf / 2));
          return axis === "x" ? { ...piece, x: start, length: end - start } : { ...piece, y: start, width: end - start };
        });
        const groups = pieces.map((): TreeItem[] => []);
        for (const item of inside) groups[cuts.filter((cut) => cut < span(item.rect, axis)[0] + 1e-6).length]!.push(item);
        const children = pieces.map((p, i) => split(p, groups[i]!, stage + 1, otherAxis(axis)));
        return { kind: "split", rect: piece, stage, axis, cuts, children, items: inside.map((item) => item.index) };
      }
    }
    const indices = inside.map((item) => item.index);
    stuck.push(indices);
    return { kind: "stuck", rect: piece, stage, items: indices };
  };
  return { root: split(rect, list, 1, "y"), stuck };
}
