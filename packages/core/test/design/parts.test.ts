import { describe, expect, it } from "vitest";
import { buildDesignParts, designGeometry, materialsById, type Design, type Part } from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";

function build(design: Design): Part[] {
  return buildDesignParts(design, designGeometry(design, materialsById(designProject()))!);
}

const summary = (parts: Part[]) => parts.map((part) => [part.id, part.name, part.material, part.length, part.width, part.quantity]);

describe("buildDesignParts", () => {
  it("makes 3 vertical panels and 10 shelves for a KALLAX 2×4", () => {
    const parts = build(kallaxDesign());
    expect(summary(parts)).toEqual([
      ["kx-vertical", "Vertical panel", "ply18", 1430, 390, 3],
      ["kx-horizontal", "Shelf", "ply18", 335, 390, 10],
    ]);
    expect(parts[0]).toEqual({
      id: "kx-vertical",
      name: "Vertical panel",
      material: "ply18",
      length: 1430,
      width: 390,
      quantity: 3,
      grain: "length",
      group: "Hall KALLAX",
      design: "kx",
    });
  });

  it("multiplies by the quantity and adds the back for an EKET 2×1", () => {
    expect(summary(build(eketDesign()))).toEqual([
      ["ek-vertical", "Vertical panel", "ply18", 350, 344, 6],
      ["ek-horizontal", "Shelf", "ply18", 323, 344, 8],
      ["ek-back", "Back", "ply6", 350, 700, 2],
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
      ["cu-vertical", "Vertical panel", "ply18", 718, 390, 4],
      ["cu-horizontal-1", "Shelf 1", "ply18", 335, 390, 6],
      ["cu-horizontal-2", "Shelf 2", "ply18", 400, 390, 3],
    ]);
  });
});
