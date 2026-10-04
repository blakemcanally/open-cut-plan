import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildDesignParts, designGeometry, designPanels, materialsById, roundLength, type CombinedCell, type Design, type Panel } from "../../src/index.ts";
import { designProject, kallaxDesign } from "../helpers.ts";
import { legacyDesignPanels } from "./legacy.ts";

const geometryOf = (design: Design) => designGeometry(design, materialsById(designProject()))!;
const area = (r: { width: number; height: number }) => r.width * r.height;
const overlap = (a: Pick<Panel, "x" | "y" | "width" | "height">, b: Pick<Panel, "x" | "y" | "width" | "height">) =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1e-6 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1e-6;

describe("designPanels", () => {
  it("puts the top and the bottom across the full width, and the sides, the divider, and the shelves between them", () => {
    const { panels, cells } = designPanels(geometryOf(kallaxDesign()));
    const of = (kind: Panel["kind"]) => panels.filter((panel) => panel.kind === kind);
    expect(of("top")).toEqual([{ kind: "top", name: "Top", x: 0, y: 0, width: 724, height: 18 }]);
    expect(of("bottom")).toEqual([{ kind: "bottom", name: "Bottom", x: 0, y: 1412, width: 724, height: 18 }]);
    expect(of("side")).toEqual([
      { kind: "side", name: "Side", x: 0, y: 18, width: 18, height: 1394 },
      { kind: "side", name: "Side", x: 706, y: 18, width: 18, height: 1394 },
    ]);
    expect(of("divider")).toEqual([{ kind: "divider", name: "Divider", x: 353, y: 18, width: 18, height: 1394 }]);
    expect(of("shelf")).toHaveLength(6);
    expect(of("shelf")[0]).toEqual({ kind: "shelf", name: "Shelf", x: 18, y: 353, width: 335, height: 18 });
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

  it("draws the panels and the cells of main for any grid with no combined cells", () => {
    const opening = fc.constantFrom(250, 335, 400, 512.5);
    const axis = fc.oneof(
      fc.array(opening, { minLength: 1, maxLength: 6 }).map((openings) => ({ openings })),
      fc.record({ outside: fc.integer({ min: 600, max: 2400 }), cells: fc.integer({ min: 1, max: 6 }) }),
    );
    fc.assert(
      fc.property(axis, axis, fc.constantFrom(12, 18, 19.05), (width, height, thickness) => {
        const geometry = { ...geometryOf(kallaxDesign({ system: "custom", width, height })), thickness };
        const { panels, cells } = designPanels(geometry);
        expect({ panels: panels.map(({ name: _name, ...panel }) => panel), cells }).toEqual(legacyDesignPanels(geometry));
      }),
      { numRuns: 200 },
    );
  });

  it("draws one cell for two cells combined in the top row of a KALLAX 4x2, and the boards around it (spec 14.1)", () => {
    const design = kallaxDesign({ width: { openings: [335, 335, 335, 335] }, height: { openings: [335, 335] }, combined: [{ column: 1, row: 1, columns: 2, rows: 1 }] });
    const { panels, cells } = designPanels(geometryOf(design));
    expect(panels).toEqual([
      { kind: "top", name: "Top", x: 0, y: 0, width: 1430, height: 18 },
      { kind: "bottom", name: "Bottom", x: 0, y: 706, width: 1430, height: 18 },
      { kind: "side", name: "Side", x: 0, y: 18, width: 18, height: 688 },
      { kind: "shelf", name: "Shelf, columns 1–2", x: 18, y: 353, width: 688, height: 18 },
      { kind: "divider", name: "Divider, row 2", x: 353, y: 371, width: 18, height: 335 },
      { kind: "divider", name: "Divider", x: 706, y: 18, width: 18, height: 688 },
      { kind: "shelf", name: "Shelf", x: 724, y: 353, width: 335, height: 18 },
      { kind: "divider", name: "Divider", x: 1059, y: 18, width: 18, height: 688 },
      { kind: "shelf", name: "Shelf", x: 1077, y: 353, width: 335, height: 18 },
      { kind: "side", name: "Side", x: 1412, y: 18, width: 18, height: 688 },
    ]);
    expect(cells).toHaveLength(7);
    expect(cells[0]).toEqual({ column: 0, row: 0, x: 18, y: 18, width: 688, height: 335, columns: 2, rows: 1 });
    expect(cells[1]).toEqual({ column: 0, row: 1, x: 18, y: 371, width: 335, height: 335 });
  });

  it("closes each cell with boards, ends each board on a board that runs through, and matches the parts, for random combined cells", () => {
    const opening = fc.integer({ min: 50, max: 600 });
    const arb = fc
      .record({
        columns: fc.array(opening, { minLength: 1, maxLength: 6 }),
        rows: fc.array(opening, { minLength: 1, maxLength: 6 }),
        thickness: fc.constantFrom(12, 15, 18, 25),
        spans: fc.array(fc.record({ column: fc.nat(5), row: fc.nat(5), columns: fc.integer({ min: 1, max: 4 }), rows: fc.integer({ min: 1, max: 4 }) }), { maxLength: 8 }),
      })
      .map(({ columns, rows, thickness, spans }) => ({ columns, rows, thickness, combined: fitSpans(spans, columns.length, rows.length) }));
    fc.assert(
      fc.property(arb, ({ columns, rows, thickness, combined }) => {
        const design = kallaxDesign({ system: "custom", width: { openings: columns }, height: { openings: rows }, combined });
        const geometry = { ...geometryOf(design), thickness };
        geometry.outsideWidth = roundLength(columns.reduce((a, b) => a + b, 0) + (columns.length + 1) * thickness);
        geometry.outsideHeight = roundLength(rows.reduce((a, b) => a + b, 0) + (rows.length + 1) * thickness);
        const { panels, cells } = designPanels(geometry);
        const rects = [...panels, ...cells.map((cell) => ({ ...cell, kind: "cell" as never }))];
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i]!;
          expect(r.width).toBeGreaterThan(0);
          expect(r.height).toBeGreaterThan(0);
          for (let j = i + 1; j < rects.length; j++) expect(overlap(r, rects[j]!)).toBe(false);
        }
        expect(rects.reduce((sum, r) => sum + area(r), 0)).toBeCloseTo(geometry.outsideWidth * geometry.outsideHeight, 6);
        expect(cells).toHaveLength(columns.length * rows.length - combined.reduce((sum, span) => sum + span.columns * span.rows - 1, 0));

        const t = thickness;
        const covered = (strip: Strip) => panels.reduce((sum, panel) => sum + overlapArea(panel, strip), 0);
        for (const cell of cells) {
          for (const strip of [
            { x: cell.x, y: cell.y - t, width: cell.width, height: t },
            { x: cell.x, y: cell.y + cell.height, width: cell.width, height: t },
            { x: cell.x - t, y: cell.y, width: t, height: cell.height },
            { x: cell.x + cell.width, y: cell.y, width: t, height: cell.height },
          ]) {
            expect(covered(strip)).toBeCloseTo(area(strip), 6);
          }
        }
        for (const panel of panels.filter((p) => p.kind === "divider" || p.kind === "shelf")) {
          const ends =
            panel.kind === "divider"
              ? [{ x: panel.x, y: panel.y - t, width: t, height: t }, { x: panel.x, y: panel.y + panel.height, width: t, height: t }]
              : [{ x: panel.x - t, y: panel.y, width: t, height: t }, { x: panel.x + panel.width, y: panel.y, width: t, height: t }];
          for (const end of ends) {
            const holders = panels.filter((other) => overlapArea(other, end) > 1e-6);
            expect(holders).toHaveLength(1);
            expect(overlapArea(holders[0]!, end)).toBeCloseTo(area(end), 6);
            expect(holders[0]!.kind === "divider" || holders[0]!.kind === "side").toBe(panel.kind === "shelf");
          }
        }

        const drawn = new Map<string, number>();
        for (const panel of panels) {
          const length = panel.kind === "side" || panel.kind === "divider" ? panel.height : panel.width;
          const key = `${panel.kind}:${roundLength(length)}`;
          drawn.set(key, (drawn.get(key) ?? 0) + 1);
        }
        const expected = new Map<string, number>();
        for (const part of buildDesignParts(design, geometry)) {
          const kind = part.id.replace(/^kx-/, "").replace(/-(rows|cols)-.*$/, "").replace(/-\d+$/, "");
          const key = `${kind}:${roundLength(part.length)}`;
          expected.set(key, (expected.get(key) ?? 0) + part.quantity);
        }
        expect(drawn).toEqual(expected);

        const named = new Map<string, number>();
        for (const panel of panels) named.set(panel.name, (named.get(panel.name) ?? 0) + 1);
        const parts = new Map(buildDesignParts(design, geometry).map((part) => [part.name, part.quantity]));
        expect(named).toEqual(parts);
      }),
      { numRuns: 300 },
    );
  });
});

interface Strip {
  x: number;
  y: number;
  width: number;
  height: number;
}

function overlapArea(a: Strip, b: Strip): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** The spans that fit the grid and have 2 cells or more, with each span that overlaps an earlier one left out. */
function fitSpans(spans: readonly CombinedCell[], columns: number, rows: number): CombinedCell[] {
  const kept: CombinedCell[] = [];
  for (const raw of spans) {
    const column = (raw.column % columns) + 1;
    const row = (raw.row % rows) + 1;
    const span = { column, row, columns: Math.min(raw.columns, columns - column + 1), rows: Math.min(raw.rows, rows - row + 1) };
    if (span.columns * span.rows < 2) continue;
    const hits = (other: CombinedCell) =>
      span.column < other.column + other.columns && other.column < span.column + span.columns && span.row < other.row + other.rows && other.row < span.row + span.rows;
    if (!kept.some(hits)) kept.push(span);
  }
  return kept;
}
