import { idsOf } from "../edit/patch.ts";
import { uniqueId } from "../format/ids.ts";
import type { Material, Project, Stock } from "../format/schema.ts";
import type { Units } from "../geometry/units.ts";
import { CATALOG } from "./data.ts";
import type { CatalogListing, CatalogMaterial, CatalogSize } from "./types.ts";

export const CATALOG_FAMILIES: readonly string[] = [...new Set(CATALOG.map((material) => material.family))];

export interface CatalogPrice {
  usd: number;
  store: string;
  source: string;
  checked: string;
}

export interface CatalogSizeEntry {
  id: string;
  label: string;
  length: number;
  width: number;
  price: CatalogPrice | null;
  listings: readonly CatalogListing[];
}

export interface CatalogEntry {
  id: string;
  family: string;
  name: string;
  nominal: string;
  thickness: number;
  grained: boolean;
  notes: string;
  sizes: CatalogSizeEntry[];
}

export interface CatalogAdd {
  project: Project;
  /** The project material id. */
  material: string;
  /** The project stock id, or null when no stock was asked for or added. */
  stock: string | null;
  addedMaterial: boolean;
  addedStock: boolean;
}

const THICKNESS_TOLERANCE: Readonly<Record<Units, number>> = { in: 0.005, mm: 0.1 };
const SIZE_TOLERANCE: Readonly<Record<Units, number>> = { in: 0.02, mm: 0.5 };

/** The lowest price of the size, or null when no store has a price. */
export function typicalPrice(size: CatalogSize): CatalogPrice | null {
  let best: CatalogPrice | null = null;
  for (const { priceUsd, store, source, checked } of size.listings) {
    if (priceUsd !== null && (best === null || priceUsd < best.usd)) best = { usd: priceUsd, store, source, checked };
  }
  return best;
}

function sizeIn(size: CatalogSize, units: Units): { length: number; width: number } {
  return units === "in" ? { length: size.lengthIn, width: size.widthIn } : { length: size.lengthMm, width: size.widthMm };
}

function thicknessIn(material: CatalogMaterial, units: Units): number {
  return units === "in" ? material.thicknessIn : material.thicknessMm;
}

/** The catalogue in the given units; `family` matches without case. */
export function catalogFor(units: Units, family?: string): CatalogEntry[] {
  const wanted = family?.trim().toLowerCase();
  return CATALOG.filter((material) => wanted === undefined || material.family.toLowerCase() === wanted).map((material) => ({
    id: material.id,
    family: material.family,
    name: material.name,
    nominal: material.nominal,
    thickness: thicknessIn(material, units),
    grained: material.grained,
    notes: material.notes,
    sizes: material.sizes.map((size) => ({ id: size.id, label: size.label, ...sizeIn(size, units), price: typicalPrice(size), listings: size.listings })),
  }));
}

export function catalogMaterial(id: string): CatalogMaterial | undefined {
  return CATALOG.find((material) => material.id === id);
}

export function catalogSize(id: string): { material: CatalogMaterial; size: CatalogSize } | undefined {
  for (const material of CATALOG) {
    const size = material.sizes.find((candidate) => candidate.id === id);
    if (size) return { material, size };
  }
  return undefined;
}

function knownMaterial(id: string): CatalogMaterial {
  const material = catalogMaterial(id);
  if (!material) throw new Error(`There is no catalogue material with the id "${id}".`);
  return material;
}

/** The project material with the catalogue id or the catalogue name, and the catalogue thickness. */
export function projectMaterialFor(project: Project, catalogId: string): Material | undefined {
  const entry = knownMaterial(catalogId);
  const units = project.project.units;
  const thickness = thicknessIn(entry, units);
  const name = entry.name.toLowerCase();
  return project.materials.find(
    (material) =>
      (material.id === entry.id || material.name.trim().toLowerCase() === name) && Math.abs(material.thickness - thickness) <= THICKNESS_TOLERANCE[units],
  );
}

/** The sheet stock of the size, in the project material for the catalogue material. */
export function projectStockFor(project: Project, sizeId: string): Stock | undefined {
  const found = catalogSize(sizeId);
  if (!found) throw new Error(`There is no catalogue size with the id "${sizeId}".`);
  const material = projectMaterialFor(project, found.material.id);
  if (!material) return undefined;
  const units = project.project.units;
  const { length, width } = sizeIn(found.size, units);
  const close = (a: number, b: number) => Math.abs(a - b) <= SIZE_TOLERANCE[units];
  return project.stock.find((stock) => stock.material === material.id && stock.kind === "sheet" && close(stock.length, length) && close(stock.width, width));
}

function withMaterial(project: Project, entry: CatalogMaterial): { project: Project; material: string; added: boolean } {
  const existing = projectMaterialFor(project, entry.id);
  if (existing) return { project, material: existing.id, added: false };
  const material: Material = {
    id: uniqueId(entry.id, idsOf(project.materials)),
    name: entry.name,
    thickness: thicknessIn(entry, project.project.units),
    grained: entry.grained,
  };
  return { project: { ...project, materials: [...project.materials, material] }, material: material.id, added: true };
}

/**
 * Adds a sheet size as stock, and its material when the project does not have it. A sheet of the same size in that
 * material is used, not added again. The cost is the typical price when the project currency is USD.
 */
export function addCatalogStock(project: Project, sizeId: string, options: { quantity?: number | null } = {}): CatalogAdd {
  const found = catalogSize(sizeId);
  if (!found) throw new Error(`There is no catalogue size with the id "${sizeId}".`);
  const { project: withIt, material, added } = withMaterial(project, found.material);
  const existing = projectStockFor(withIt, sizeId);
  if (existing) return { project: withIt, material, stock: existing.id, addedMaterial: added, addedStock: false };
  const stock: Stock = {
    id: uniqueId(found.size.id, idsOf(withIt.stock)),
    material,
    ...sizeIn(found.size, project.project.units),
    quantity: options.quantity ?? null,
    kind: "sheet",
  };
  const price = typicalPrice(found.size);
  if (price && project.settings.currency === "USD") stock.cost = price.usd;
  return { project: { ...withIt, stock: [...withIt.stock, stock] }, material, stock: stock.id, addedMaterial: added, addedStock: true };
}

/** Adds the material when the project does not have it. With `sheet`, also adds its largest size when the project has no sheet of the material. */
export function addCatalogMaterial(project: Project, id: string, options: { sheet?: boolean } = {}): CatalogAdd {
  const entry = knownMaterial(id);
  const { project: withIt, material, added } = withMaterial(project, entry);
  const hasSheet = withIt.stock.some((stock) => stock.material === material && stock.kind === "sheet");
  if (!options.sheet || hasSheet) return { project: withIt, material, stock: null, addedMaterial: added, addedStock: false };
  const result = addCatalogStock(withIt, entry.sizes[0]!.id);
  return { ...result, addedMaterial: added };
}
