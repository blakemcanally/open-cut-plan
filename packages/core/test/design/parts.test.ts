import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildDesignParts, designGeometry, materialsById, type CombinedCell, type Design, type Part } from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";
import { legacyDesignParts } from "./legacy.ts";

function build(design: Design): Part[] {
  return buildDesignParts(design, designGeometry(design, materialsById(designProject()))!);
}

const summary = (parts: Part[]) => parts.map((part) => [part.id, part.name, part.material, part.length, part.width, part.quantity]);

describe("buildDesignParts", () => {
  it("makes a box for a KALLAX 2×4: a full-width top and bottom, the sides and the divider between them, and the shelves", () => {
    const parts = build(kallaxDesign());
    expect(summary(parts)).toEqual([
      ["kx-top", "Top", "ply18", 724, 390, 1],
      ["kx-bottom", "Bottom", "ply18", 724, 390, 1],
      ["kx-side", "Side", "ply18", 1394, 390, 2],
      ["kx-divider", "Divider", "ply18", 1394, 390, 1],
      ["kx-shelf", "Shelf", "ply18", 335, 390, 6],
    ]);
    expect(parts[0]).toEqual({
      id: "kx-top",
      name: "Top",
      material: "ply18",
      length: 724,
      width: 390,
      quantity: 1,
      grain: "length",
      group: "Hall KALLAX",
      design: "kx",
    });
  });

  it("multiplies by the quantity, adds the back, and has no shelf for one row", () => {
    expect(summary(build(eketDesign()))).toEqual([
      ["ek-top", "Top", "ply18", 700, 344, 2],
      ["ek-bottom", "Bottom", "ply18", 700, 344, 2],
      ["ek-side", "Side", "ply18", 314, 344, 4],
      ["ek-divider", "Divider", "ply18", 314, 344, 2],
      ["ek-back", "Back", "ply6", 350, 700, 2],
    ]);
  });

  it("has no divider for one column, and neither a divider nor a shelf for 1×1", () => {
    expect(summary(build(kallaxDesign({ width: { openings: [335] }, height: { openings: [335, 335, 335] } })))).toEqual([
      ["kx-top", "Top", "ply18", 371, 390, 1],
      ["kx-bottom", "Bottom", "ply18", 371, 390, 1],
      ["kx-side", "Side", "ply18", 1041, 390, 2],
      ["kx-shelf", "Shelf", "ply18", 335, 390, 2],
    ]);
    expect(summary(build(kallaxDesign({ width: { openings: [335, 335, 335] }, height: { openings: [335] } })))).toEqual([
      ["kx-top", "Top", "ply18", 1077, 390, 1],
      ["kx-bottom", "Bottom", "ply18", 1077, 390, 1],
      ["kx-side", "Side", "ply18", 335, 390, 2],
      ["kx-divider", "Divider", "ply18", 335, 390, 2],
    ]);
    expect(summary(build(kallaxDesign({ width: { openings: [335] }, height: { openings: [335] } })))).toEqual([
      ["kx-top", "Top", "ply18", 371, 390, 1],
      ["kx-bottom", "Bottom", "ply18", 371, 390, 1],
      ["kx-side", "Side", "ply18", 335, 390, 2],
    ]);
  });

  it("makes one shelf part for each opening size, in column order", () => {
    const design: Design = {
      id: "cu",
      name: "Desk hutch",
      system: "custom",
      material: "ply18",
      width: { openings: [335, 400, 335] },
      height: { outside: 718, cells: 2 },
      depth: 390,
    };
    expect(summary(build(design))).toEqual([
      ["cu-top", "Top", "ply18", 1142, 390, 1],
      ["cu-bottom", "Bottom", "ply18", 1142, 390, 1],
      ["cu-side", "Side", "ply18", 682, 390, 2],
      ["cu-divider", "Divider", "ply18", 682, 390, 2],
      ["cu-shelf-1", "Shelf 1", "ply18", 335, 390, 2],
      ["cu-shelf-2", "Shelf 2", "ply18", 400, 390, 1],
    ]);
  });
});

const span = (column: number, row: number, columns: number, rows: number): CombinedCell => ({ column, row, columns, rows });
const grid = (columns: number, rows: number, combined: CombinedCell[]) =>
  kallaxDesign({ width: { openings: Array.from({ length: columns }, () => 335) }, height: { openings: Array.from({ length: rows }, () => 335) }, combined });

describe("buildDesignParts with combined cells", () => {
  it("makes a long shelf and a short divider for two cells combined in the top row of a KALLAX 4x2 (spec 14.1)", () => {
    expect(summary(build(grid(4, 2, [span(1, 1, 2, 1)])))).toEqual([
      ["kx-top", "Top", "ply18", 1430, 390, 1],
      ["kx-bottom", "Bottom", "ply18", 1430, 390, 1],
      ["kx-side", "Side", "ply18", 688, 390, 2],
      ["kx-divider", "Divider", "ply18", 688, 390, 2],
      ["kx-divider-rows-2", "Divider, row 2", "ply18", 335, 390, 1],
      ["kx-shelf", "Shelf", "ply18", 335, 390, 2],
      ["kx-shelf-cols-1-2", "Shelf, columns 1–2", "ply18", 688, 390, 1],
    ]);
  });

  it("makes the parts of a 2x2 block in a 4x4 (spec 14.2), with the quantity", () => {
    expect(summary(build({ ...grid(4, 4, [span(2, 2, 2, 2)]), quantity: 2 }))).toEqual([
      ["kx-top", "Top", "ply18", 1430, 390, 2],
      ["kx-bottom", "Bottom", "ply18", 1430, 390, 2],
      ["kx-side", "Side", "ply18", 1394, 390, 4],
      ["kx-divider", "Divider", "ply18", 1394, 390, 4],
      ["kx-divider-rows-1", "Divider, row 1", "ply18", 335, 390, 2],
      ["kx-divider-rows-4", "Divider, row 4", "ply18", 335, 390, 2],
      ["kx-shelf", "Shelf", "ply18", 335, 390, 12],
      ["kx-shelf-cols-2-3", "Shelf, columns 2–3", "ply18", 688, 390, 4],
    ]);
  });

  it("makes the pinwheel of spec 14.4 from four boards of one length", () => {
    expect(summary(build(grid(3, 3, [span(1, 1, 2, 1), span(3, 1, 1, 2), span(2, 3, 2, 1), span(1, 2, 1, 2)]))).slice(3)).toEqual([
      ["kx-divider-rows-1-2", "Divider, rows 1–2", "ply18", 688, 390, 1],
      ["kx-divider-rows-2-3", "Divider, rows 2–3", "ply18", 688, 390, 1],
      ["kx-shelf-cols-1-2", "Shelf, columns 1–2", "ply18", 688, 390, 1],
      ["kx-shelf-cols-2-3", "Shelf, columns 2–3", "ply18", 688, 390, 1],
    ]);
  });

  it("keeps the shelf ids of the other columns, and leaves out a group with no shelves", () => {
    const design = kallaxDesign({ width: { openings: [335, 400, 335] }, height: { openings: [335, 335] } });
    expect(summary(build({ ...design, combined: [span(2, 1, 1, 2)] })).slice(4)).toEqual([["kx-shelf-1", "Shelf 1", "ply18", 335, 390, 2]]);
    expect(summary(build({ ...design, combined: [span(1, 1, 1, 2)] })).slice(4)).toEqual([
      ["kx-shelf-1", "Shelf 1", "ply18", 335, 390, 1],
      ["kx-shelf-2", "Shelf 2", "ply18", 400, 390, 1],
    ]);
  });

  it("keeps the top, the bottom, the sides, and the back of the box", () => {
    const plain = build(grid(4, 4, []));
    const combined = build({ ...grid(4, 4, [span(1, 1, 3, 2), span(2, 3, 2, 2)]) });
    const box = (parts: Part[]) => parts.filter((part) => ["kx-top", "kx-bottom", "kx-side", "kx-back"].includes(part.id));
    expect(box(combined)).toEqual(box(plain));
  });

  it("gives the parts of main for any grid with no combined cells", () => {
    const opening = fc.constantFrom(250, 335, 400, 512.5);
    const axis = fc.oneof(
      fc.array(opening, { minLength: 1, maxLength: 6 }).map((openings) => ({ openings })),
      fc.record({ outside: fc.integer({ min: 600, max: 2400 }), cells: fc.integer({ min: 1, max: 6 }) }),
    );
    const arb = fc.record({
      width: axis,
      height: axis,
      thickness: fc.constantFrom(12, 15, 18, 19.05, 25),
      back: fc.boolean(),
      quantity: fc.integer({ min: 1, max: 3 }),
      empty: fc.boolean(),
    });
    fc.assert(
      fc.property(arb, ({ width, height, thickness, back, quantity, empty }) => {
        const project = designProject();
        project.materials = project.materials.map((material) => (material.id === "ply18" ? { ...material, thickness } : material));
        const design: Design = { ...kallaxDesign({ system: "custom", width, height, quantity }), ...(back ? { back: { material: "ply6" } } : {}), ...(empty ? { combined: [] } : {}) };
        const geometry = designGeometry(design, materialsById(project))!;
        expect(buildDesignParts(design, geometry)).toEqual(legacyDesignParts(design, geometry));
      }),
      { numRuns: 300 },
    );
  });
});
