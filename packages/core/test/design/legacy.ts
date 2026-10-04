import { DEFAULT_DESIGN_QUANTITY, roundLength, type Cell, type Design, type DesignGeometry, type Panel, type Part } from "../../src/index.ts";

/** The parts of a design as main made them before combined cells: the oracle for the parts of a design with no combined cells. */
export function legacyDesignParts(design: Design, geometry: DesignGeometry): Part[] {
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

/** The front view of a design as main drew it before combined cells. */
export function legacyDesignPanels(geometry: DesignGeometry): { panels: Panel[]; cells: Cell[] } {
  const { thickness: t, columns, rows, outsideWidth: width, outsideHeight: height } = geometry;
  const inner = roundLength(height - 2 * t);
  const panels: Panel[] = [
    { kind: "top", x: 0, y: 0, width, height: t },
    { kind: "bottom", x: 0, y: roundLength(height - t), width, height: t },
  ];
  const cells: Cell[] = [];
  let x = 0;
  for (let column = 0; column <= columns.length; column++) {
    panels.push({ kind: column === 0 || column === columns.length ? "side" : "divider", x, y: t, width: t, height: inner });
    if (column === columns.length) break;
    const opening = columns[column]!;
    let y = t;
    rows.forEach((cell, row) => {
      if (row > 0) {
        panels.push({ kind: "shelf", x: roundLength(x + t), y, width: opening, height: t });
        y = roundLength(y + t);
      }
      cells.push({ column, row, x: roundLength(x + t), y, width: opening, height: cell });
      y = roundLength(y + cell);
    });
    x = roundLength(x + t + opening);
  }
  return { panels, cells };
}
