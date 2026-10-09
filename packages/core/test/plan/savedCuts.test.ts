import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import {
  analyzeSheets,
  buildCutTree,
  createTreeSearch,
  inset,
  parseProject,
  planContext,
  rebuildTree,
  stockRect,
  treeLines,
  type Rect,
  type SavedCut,
  type TreeItem,
} from "../../src/index.ts";
import { guillotine, mulberry32 } from "./treeHelpers.ts";

const r = (x: number, y: number, length: number, width: number): Rect => ({ x, y, length, width });
const items = (...rects: Rect[]): TreeItem[] => rects.map((rect, index) => ({ index, rect }));
const SHEET = r(0, 0, 96, 48);
const ROW = items(r(0, 0, 20, 40), r(20.125, 0, 20, 10), r(40.25, 0, 20, 10), r(60.375, 0, 20, 40));

describe("rebuildTree", () => {
  it("gives back the tree of each sheet of the examples from its lines", () => {
    let sheets = 0;
    for (const build of Object.values(EXAMPLES)) {
      const parsed = parseProject(JSON.stringify(build()));
      if (!parsed.ok) throw new Error("example did not load");
      for (const { stock, trim, items: list, tree } of analyzeSheets(planContext(parsed.project))) {
        if (tree.stuck.length > 0) continue;
        const region = list.length > 0 && trim > 0 ? inset(stockRect(stock), trim) : stockRect(stock);
        expect(rebuildTree(region, treeLines(tree), list, planContext(parsed.project).kerf)).toEqual(tree.root);
        sheets++;
      }
    }
    expect(sheets).toBeGreaterThan(5);
  });

  it("gives back the fast and the thorough trees of random sheets, also with no kerf", () => {
    for (const kerf of [0.125, 0]) {
      for (let seed = 1; seed <= 40; seed++) {
        const rects: Rect[] = [];
        guillotine(mulberry32(seed), SHEET, kerf, 6, rects);
        const list = items(...rects);
        const fast = buildCutTree(SHEET, list, kerf, 0);
        expect(rebuildTree(SHEET, treeLines(fast), list, kerf)).toEqual(fast.root);
        const thorough = createTreeSearch(SHEET, list, kerf, 0).run(8)!.tree;
        expect(rebuildTree(SHEET, treeLines(thorough), list, kerf)).toEqual(thorough.root);
      }
    }
  });

  describe("fails the check", () => {
    const lines = treeLines(createTreeSearch(SHEET, ROW, 0.125, 0).run(4)!.tree);
    const rebuild = (changed: readonly SavedCut[], list: readonly TreeItem[] = ROW, kerf = 0.125) => rebuildTree(SHEET, changed, list, kerf);

    it("passes with the lines as they are", () => expect(rebuildTree(SHEET, lines, ROW, 0.125)).not.toBeNull());
    it("with a new kerf", () => expect(rebuild(lines, ROW, 0.25)).toBeNull());
    it("with a new trim", () => expect(rebuildTree(inset(SHEET, 0.5), lines, ROW, 0.125)).toBeNull());
    it("with a new part size", () => expect(rebuild(lines, ROW.map((item, i) => (i === 1 ? { ...item, rect: { ...item.rect, width: 12 } } : item)))).toBeNull());
    it("with a moved part", () => expect(rebuild(lines, ROW.map((item, i) => (i === 1 ? { ...item, rect: { ...item.rect, y: 5 } } : item)))).toBeNull());
    it("with a line through a part", () => expect(rebuild([...lines, { axis: "x", at: 10, from: 0, to: 48 }])).toBeNull());
    it("with lines that cross", () => expect(rebuild([...lines, { axis: "y", at: 45, from: 0, to: 96 }])).toBeNull());
    it("with a line outside the sheet", () => expect(rebuild([...lines, { axis: "x", at: 100, from: 0, to: 48 }])).toBeNull());
    it("with a line that no piece uses", () => expect(rebuild([...lines, { axis: "x", at: 90, from: 10, to: 20 }])).toBeNull());
    it("with a line missing", () => expect(rebuild(lines.slice(1))).toBeNull());
  });
});
