import { DEFAULT_THICKNESS } from "../edit/parts.ts";
import { slugify, uniqueId } from "../format/ids.ts";
import type { Material, Part, Project, Stock } from "../format/schema.ts";
import { formatLength } from "../geometry/format.ts";
import type { Units } from "../geometry/units.ts";
import type { PartRow } from "./parts.ts";
import type { StockRow } from "./stock.ts";

const THICKNESS_TOLERANCE: Readonly<Record<Units, number>> = { in: 0.001, mm: 0.025 };

export interface ApplyResult {
  project: Project;
  createdMaterials: Material[];
}

interface MaterialRow {
  material: string;
  thickness?: number | undefined;
}

function resolveMaterials(project: Project, rows: readonly MaterialRow[]) {
  const units = project.project.units;
  const materials = [...project.materials];
  const created: Material[] = [];
  const taken = new Set(materials.map((material) => material.id));
  const key = (text: string) => text.trim().toLowerCase();
  const named = (name: string) => materials.filter((material) => key(material.id) === key(name) || key(material.name) === key(name));
  const sameThickness = (material: Material, thickness: number) => Math.abs(material.thickness - thickness) <= THICKNESS_TOLERANCE[units];

  const create = (name: string, thickness: number): string => {
    const id = uniqueId(slugify(name), taken);
    taken.add(id);
    const material: Material = { id, name, thickness, grained: true };
    materials.push(material);
    created.push(material);
    return id;
  };

  const ids = rows.map((row) => {
    const name = row.material.trim();
    const matches = named(name);
    if (row.thickness === undefined) return matches[0]?.id ?? create(name, DEFAULT_THICKNESS[units]);
    const thickness = row.thickness;
    const exact = matches.find((material) => sameThickness(material, thickness));
    if (exact) return exact.id;
    if (matches.length === 0) return create(name, thickness);
    const variant = `${name} (${formatLength(thickness, units, project.settings.display)})`;
    return named(variant).find((material) => sameThickness(material, thickness))?.id ?? create(variant, thickness);
  });
  return { materials, created, ids };
}

function roundForId(value: number): number {
  return Math.round(value * 100) / 100;
}

export function addPartRows(project: Project, rows: readonly PartRow[]): ApplyResult {
  const { materials, created, ids } = resolveMaterials(project, rows);
  const taken = new Set(project.parts.map((part) => part.id));
  const parts = [...project.parts];
  for (const [index, row] of rows.entries()) {
    const id = uniqueId(slugify(row.name), taken);
    taken.add(id);
    const part: Part = {
      id,
      name: row.name,
      material: ids[index]!,
      length: row.length,
      width: row.width,
      quantity: row.quantity,
      grain: row.grain,
    };
    if (row.group !== undefined) part.group = row.group;
    if (row.notes !== undefined) part.notes = row.notes;
    parts.push(part);
  }
  return { project: { ...project, materials, parts }, createdMaterials: created };
}

export function addStockRows(project: Project, rows: readonly StockRow[]): ApplyResult {
  const { materials, created, ids } = resolveMaterials(project, rows);
  const names = new Map(materials.map((material) => [material.id, material.name]));
  const taken = new Set(project.stock.map((stock) => stock.id));
  const stock = [...project.stock];
  for (const [index, row] of rows.entries()) {
    const material = ids[index]!;
    const id = uniqueId(slugify(`${names.get(material) ?? material} ${roundForId(row.length)}x${roundForId(row.width)}`), taken);
    taken.add(id);
    const item: Stock = { id, material, length: row.length, width: row.width, quantity: row.quantity, kind: row.kind };
    if (row.cost !== undefined) item.cost = row.cost;
    if (row.name !== undefined) item.name = row.name;
    stock.push(item);
  }
  return { project: { ...project, materials, stock }, createdMaterials: created };
}
