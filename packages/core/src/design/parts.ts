import type { Design, Part } from "../format/schema.ts";
import { roundLength, type DesignGeometry } from "./geometry.ts";
import { DEFAULT_DESIGN_QUANTITY } from "./systems.ts";

export function buildDesignParts(design: Design, geometry: DesignGeometry): Part[] {
  const quantity = design.quantity ?? DEFAULT_DESIGN_QUANTITY;
  const part = (id: string, name: string, material: string, length: number, width: number, count: number): Part => ({
    id: `${design.id}-${id}`,
    name,
    material,
    length,
    width,
    quantity: count * quantity,
    grain: "length",
    group: design.name,
    design: design.id,
  });

  const { thickness, columns, rows, outsideWidth, outsideHeight, panelDepth } = geometry;
  const upright = roundLength(outsideHeight - 2 * thickness);
  const parts = [
    part("top", "Top", design.material, outsideWidth, panelDepth, 1),
    part("bottom", "Bottom", design.material, outsideWidth, panelDepth, 1),
    part("side", "Side", design.material, upright, panelDepth, 2),
  ];
  if (columns.length > 1) parts.push(part("divider", "Divider", design.material, upright, panelDepth, columns.length - 1));

  const shelves = rows.length - 1;
  if (shelves > 0) {
    const sizes = new Map<number, number>();
    for (const opening of columns) sizes.set(opening, (sizes.get(opening) ?? 0) + 1);
    let k = 0;
    for (const [opening, count] of sizes) {
      k++;
      const single = sizes.size === 1;
      parts.push(part(single ? "shelf" : `shelf-${k}`, single ? "Shelf" : `Shelf ${k}`, design.material, opening, panelDepth, shelves * count));
    }
  }

  if (design.back) parts.push(part("back", "Back", design.back.material, outsideHeight, outsideWidth, 1));
  return parts;
}
