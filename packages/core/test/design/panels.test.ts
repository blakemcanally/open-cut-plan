import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildDesignParts, designGeometry, designPanels, materialsById, roundLength, type Design, type Panel } from "../../src/index.ts";
import { designProject, kallaxDesign } from "../helpers.ts";

const geometryOf = (design: Design) => designGeometry(design, materialsById(designProject()))!;
const area = (r: { width: number; height: number }) => r.width * r.height;
const overlap = (a: Panel, b: Panel) =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1e-6 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1e-6;

describe("designPanels", () => {
  it("puts the top and the bottom across the full width, and the sides, the divider, and the shelves between them", () => {
    const { panels, cells } = designPanels(geometryOf(kallaxDesign()));
    const of = (kind: Panel["kind"]) => panels.filter((panel) => panel.kind === kind);
    expect(of("top")).toEqual([{ kind: "top", x: 0, y: 0, width: 724, height: 18 }]);
    expect(of("bottom")).toEqual([{ kind: "bottom", x: 0, y: 1412, width: 724, height: 18 }]);
    expect(of("side")).toEqual([
      { kind: "side", x: 0, y: 18, width: 18, height: 1394 },
      { kind: "side", x: 706, y: 18, width: 18, height: 1394 },
    ]);
    expect(of("divider")).toEqual([{ kind: "divider", x: 353, y: 18, width: 18, height: 1394 }]);
    expect(of("shelf")).toHaveLength(6);
    expect(of("shelf")[0]).toEqual({ kind: "shelf", x: 18, y: 353, width: 335, height: 18 });
    expect(cells).toHaveLength(8);
    expect(cells[0]).toEqual({ column: 0, row: 0, x: 18, y: 18, width: 335, height: 335 });
  });

  it("fills the outside with panels and cells that do not overlap, and matches the parts", () => {
    const opening = fc.integer({ min: 50, max: 600 });
    const arb = fc.record({
      columns: fc.array(opening, { minLength: 1, maxLength: 5 }),
      rows: fc.array(opening, { minLength: 1, maxLength: 5 }),
      thickness: fc.constantFrom(12, 15, 18, 25),
    });
    fc.assert(
      fc.property(arb, ({ columns, rows, thickness }) => {
        const design = kallaxDesign({ system: "custom", width: { openings: columns }, height: { openings: rows } });
        const geometry = { ...geometryOf(design), thickness };
        geometry.outsideWidth = roundLength(columns.reduce((a, b) => a + b, 0) + (columns.length + 1) * thickness);
        geometry.outsideHeight = roundLength(rows.reduce((a, b) => a + b, 0) + (rows.length + 1) * thickness);
        const { panels, cells } = designPanels(geometry);
        const rects = [...panels, ...cells.map((cell) => ({ ...cell, kind: "cell" as never }))];
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i]!;
          expect(r.x).toBeGreaterThanOrEqual(-1e-9);
          expect(r.y).toBeGreaterThanOrEqual(-1e-9);
          expect(r.x + r.width).toBeLessThanOrEqual(geometry.outsideWidth + 1e-9);
          expect(r.y + r.height).toBeLessThanOrEqual(geometry.outsideHeight + 1e-9);
          for (let j = i + 1; j < rects.length; j++) expect(overlap(r, rects[j]!)).toBe(false);
        }
        const covered = rects.reduce((sum, r) => sum + area(r), 0);
        expect(covered).toBeCloseTo(geometry.outsideWidth * geometry.outsideHeight, 6);

        const drawn = new Map<string, number>();
        for (const panel of panels) {
          const kind = panel.kind === "shelf" ? "shelf" : panel.kind;
          const length = panel.kind === "side" || panel.kind === "divider" ? panel.height : panel.width;
          const key = `${kind}:${roundLength(length)}`;
          drawn.set(key, (drawn.get(key) ?? 0) + 1);
        }
        const expected = new Map<string, number>();
        for (const part of buildDesignParts(design, geometry)) {
          const kind = part.id.replace(/^kx-/, "").replace(/-\d+$/, "");
          const key = `${kind}:${roundLength(part.length)}`;
          expected.set(key, (expected.get(key) ?? 0) + part.quantity);
        }
        expect(drawn).toEqual(expected);
      }),
      { numRuns: 200 },
    );
  });
});
