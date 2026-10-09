import { describe, expect, it } from "vitest";
import { buildCutTree, createTreeSearch, measureTree, type CutNode, type Rect, type TreeCut, type TreeItem } from "../../src/index.ts";
import { assertCutsMissParts, guillotine, mulberry32 } from "./treeHelpers.ts";

const r = (x: number, y: number, length: number, width: number): Rect => ({ x, y, length, width });
const items = (...rects: Rect[]): TreeItem[] => rects.map((rect, index) => ({ index, rect }));
const SHEET = r(0, 0, 96, 48);
const ROW = items(r(0, 0, 20, 40), r(20.125, 0, 20, 10), r(40.25, 0, 20, 10), r(60.375, 0, 20, 40));

function parts(node: CutNode): number[] {
  if (node.kind === "part") return [node.item];
  if (node.kind === "split") return node.children.flatMap(parts);
  return [];
}

describe("createTreeSearch", () => {
  it("joins the runs of a row so that one cut does the work of many short cuts", () => {
    expect(measureTree(buildCutTree(SHEET, ROW, 0.125, 0), 0.125)).toEqual({ stuck: 0, noTool: 0, cuts: 8, length: 272 });
    const search = createTreeSearch(SHEET, ROW, 0.125, 0);
    const first = search.run(2)!;
    expect(measureTree(first.tree, 0.125)).toEqual({ stuck: 0, noTool: 0, cuts: 6, length: 258.5 });
    expect(first.limited).toBe(true);
    const second = search.run(4)!;
    expect(second.limited).toBe(false);
    expect(measureTree(second.tree, 0.125)).toEqual({ stuck: 0, noTool: 0, cuts: 6, length: 258.5 });
  });

  it("counts the trims in the cuts and the length", () => {
    const tree = createTreeSearch(SHEET, items(r(0.25, 0.25, 20, 40)), 0.125, 0.25).run(2)!.tree;
    expect(tree.trims).toHaveLength(4);
    expect(measureTree(tree, 0.125).cuts).toBe(6);
  });

  it("never gives more cuts than the fast tree on random sheets, and keeps every part whole", () => {
    for (const kerf of [0.125, 0]) {
      for (let seed = 1; seed <= 30; seed++) {
        const rects: Rect[] = [];
        guillotine(mulberry32(seed), SHEET, kerf, 6, rects);
        const list = items(...rects);
        const fast = measureTree(buildCutTree(SHEET, list, kerf, 0), kerf);
        const search = createTreeSearch(SHEET, list, kerf, 0);
        for (let join = 2; ; join *= 2) {
          const out = search.run(join)!;
          expect(out.tree.stuck).toEqual([]);
          expect(parts(out.tree.root).toSorted((a, b) => a - b)).toEqual(list.map((item) => item.index));
          assertCutsMissParts(out.tree.root, rects, kerf);
          expect(measureTree(out.tree, kerf).cuts).toBeLessThanOrEqual(fast.cuts);
          if (!out.limited) break;
        }
      }
    }
  });

  it("has no more cuts that no tool can make than the automatic tree", () => {
    const canCut = (cut: TreeCut) => cut.length <= 40;
    for (let seed = 1; seed <= 10; seed++) {
      const rects: Rect[] = [];
      guillotine(mulberry32(seed), SHEET, 0.125, 5, rects);
      const list = items(...rects);
      const automatic = measureTree(buildCutTree(SHEET, list, 0.125, 0, canCut), 0.125, canCut);
      const thorough = measureTree(createTreeSearch(SHEET, list, 0.125, 0, canCut).run(64)!.tree, 0.125, canCut);
      expect(thorough.noTool).toBeLessThanOrEqual(automatic.noTool);
    }
  });

  it("stops at its deadline, and the next run continues to the same tree", () => {
    const search = createTreeSearch(SHEET, ROW, 0.125, 0, undefined, () => 0);
    expect(search.run(2, -1)).toBeNull();
    expect(search.run(2)).toEqual(createTreeSearch(SHEET, ROW, 0.125, 0).run(2));
  });
});
