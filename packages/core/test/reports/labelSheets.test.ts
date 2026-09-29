import { describe, expect, it } from "vitest";
import { LABEL_LAYOUTS, labelLayout, labelPages, labelsPerPage } from "../../src/index.ts";

describe("label layouts", () => {
  it("fit every label inside the page", () => {
    for (const layout of LABEL_LAYOUTS) {
      const right = layout.margin.left + (layout.columns - 1) * layout.pitch.x + layout.label.width;
      const bottom = layout.margin.top + (layout.rows - 1) * layout.pitch.y + layout.label.height;
      expect(right, layout.id).toBeLessThanOrEqual(layout.page.width + 1e-9);
      expect(bottom, layout.id).toBeLessThanOrEqual(layout.page.height + 1e-9);
    }
  });

  it("count the labels on a page", () => {
    expect(labelsPerPage(labelLayout("avery-5160"))).toBe(30);
    expect(labelsPerPage(labelLayout("avery-l7160"))).toBe(21);
    expect(labelsPerPage(labelLayout("thermal-4x2"))).toBe(1);
  });
});

describe("labelPages", () => {
  const letters = "abcdefghijklmnopqrstuvwxyz".split("");
  const avery = labelLayout("avery-l7160");

  it("fills pages row by row and pads the last page", () => {
    const pages = labelPages(letters, avery);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toEqual(letters.slice(0, 21));
    expect(pages[1]).toEqual([...letters.slice(21), ...Array(16).fill(null)]);
  });

  it("starts at the given position on the first page", () => {
    const pages = labelPages(letters.slice(0, 3), avery, 20);
    expect(pages).toHaveLength(2);
    expect(pages[0]!.slice(18)).toEqual([null, "a", "b"]);
    expect(pages[1]![0]).toBe("c");
  });

  it("keeps the start position on the page", () => {
    expect(labelPages(["a"], avery, 0)[0]![0]).toBe("a");
    expect(labelPages(["a"], avery, 99)[0]![20]).toBe("a");
    expect(labelPages(["a"], avery, 2.7)[0]![1]).toBe("a");
  });

  it("gives no pages for no labels", () => {
    expect(labelPages([], avery, 5)).toEqual([]);
  });

  it("puts one label on each thermal page", () => {
    expect(labelPages(["a", "b"], labelLayout("thermal-4x2"), 3)).toEqual([["a"], ["b"]]);
  });
});
