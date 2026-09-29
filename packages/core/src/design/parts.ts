import type { Design, Part } from "../format/schema.ts";
import type { DesignGeometry } from "./geometry.ts";
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

  const columns = geometry.columns.length;
  const lines = geometry.rows.length + 1;
  const parts = [part("vertical", "Vertical panel", design.material, geometry.outsideHeight, geometry.panelDepth, columns + 1)];

  const sizes = new Map<number, number>();
  for (const opening of geometry.columns) sizes.set(opening, (sizes.get(opening) ?? 0) + 1);
  let k = 0;
  for (const [opening, count] of sizes) {
    k++;
    const single = sizes.size === 1;
    parts.push(part(single ? "horizontal" : `horizontal-${k}`, single ? "Shelf" : `Shelf ${k}`, design.material, opening, geometry.panelDepth, lines * count));
  }

  if (design.back) parts.push(part("back", "Back", design.back.material, geometry.outsideHeight, geometry.outsideWidth, 1));
  return parts;
}
