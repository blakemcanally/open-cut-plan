import type { Design, Part } from "../format/schema.ts";
import { roundLength, type DesignGeometry } from "./geometry.ts";
import { boardLength, designLayout, type Board } from "./layout.ts";
import { DEFAULT_DESIGN_QUANTITY } from "./systems.ts";

function bySpan(boards: readonly Board[]): Board[][] {
  const groups = new Map<string, Board[]>();
  for (const board of [...boards].sort((a, b) => a.from - b.from || a.to - b.to)) {
    const key = `${board.from}-${board.to}`;
    groups.set(key, [...(groups.get(key) ?? []), board]);
  }
  return [...groups.values()];
}

/** The part name of a shelf board: "Shelf, columns a–b" for a long shelf, or the name of the one-cell shelves of its column opening. */
export function shelfName(board: Board, columns: readonly number[]): string {
  if (board.from !== board.to) return `Shelf, columns ${board.from + 1}–${board.to + 1}`;
  const sizes = [...new Set(columns)];
  return sizes.length === 1 ? "Shelf" : `Shelf ${sizes.indexOf(columns[board.from]!) + 1}`;
}

/** The part name of a divider board: "Divider" for a divider that runs the full inside height, else "Divider, row a" or "Divider, rows a–b". */
export function dividerName(board: Board, rows: number): string {
  if (board.from === 0 && board.to === rows - 1) return "Divider";
  return board.from === board.to ? `Divider, row ${board.from + 1}` : `Divider, rows ${board.from + 1}–${board.to + 1}`;
}

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
  const { dividers, shelves } = designLayout(geometry);

  const full = dividers.filter((board) => board.from === 0 && board.to === rows.length - 1);
  if (full.length > 0) parts.push(part("divider", "Divider", design.material, upright, panelDepth, full.length));
  for (const group of bySpan(dividers.filter((board) => !full.includes(board)))) {
    const { from, to } = group[0]!;
    const id = from === to ? `divider-rows-${from + 1}` : `divider-rows-${from + 1}-${to + 1}`;
    parts.push(part(id, dividerName(group[0]!, rows.length), design.material, boardLength(group[0]!, geometry), panelDepth, group.length));
  }

  const sizes = new Map<number, number>();
  for (const opening of columns) sizes.set(opening, 0);
  for (const board of shelves) if (board.from === board.to) sizes.set(columns[board.from]!, sizes.get(columns[board.from]!)! + 1);
  let k = 0;
  for (const [opening, count] of sizes) {
    k++;
    if (count === 0) continue;
    const single = sizes.size === 1;
    parts.push(part(single ? "shelf" : `shelf-${k}`, single ? "Shelf" : `Shelf ${k}`, design.material, opening, panelDepth, count));
  }
  for (const group of bySpan(shelves.filter((board) => board.from !== board.to))) {
    const { from, to } = group[0]!;
    parts.push(part(`shelf-cols-${from + 1}-${to + 1}`, shelfName(group[0]!, columns), design.material, boardLength(group[0]!, geometry), panelDepth, group.length));
  }

  if (design.back) parts.push(part("back", "Back", design.back.material, outsideHeight, outsideWidth, 1));
  return parts;
}
