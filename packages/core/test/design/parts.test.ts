import { describe, expect, it } from "vitest";
import { buildDesignParts, designGeometry, materialsById, type Design, type Part } from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";

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
