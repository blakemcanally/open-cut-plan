import { idsOf } from "../edit/patch.ts";
import { NEW_SHEET_SIZE } from "../edit/stock.ts";
import { slugify, uniqueId } from "../format/ids.ts";
import type { Material, Project, Stock } from "../format/schema.ts";
import { typicalPrice } from "./catalog.ts";
import { CATALOG } from "./data.ts";

export function hasEnabledStock(project: Project, material: string): boolean {
  return project.stock.some((stock) => stock.material === material && stock.enabled !== false);
}

/** The materials that parts use and that have no enabled stock, in project order. */
export function stocklessMaterials(project: Project): Material[] {
  const used = new Set(project.parts.map((part) => part.material));
  return project.materials.filter((material) => used.has(material.id) && !hasEnabledStock(project, material.id));
}

export interface MaterialStatus {
  /** The parts in the material. */
  parts: number;
  /** The designs that use the material for the box or the back. */
  designs: number;
  /** All the stock in the material, also stock that is not in use. */
  stock: number;
  /** The enabled stock in the material. */
  sizes: number;
  /** The enabled sheets to buy in the material. */
  sheets: number;
  /** The enabled sheets to buy that have no cost. */
  unpriced: number;
}

export function materialStatus(project: Project, material: string): MaterialStatus {
  const stock = project.stock.filter((item) => item.material === material);
  const enabled = stock.filter((item) => item.enabled !== false);
  const sheets = enabled.filter((item) => item.kind === "sheet");
  return {
    parts: project.parts.filter((part) => part.material === material).length,
    designs: (project.designs ?? []).filter((design) => design.material === material || design.back?.material === material).length,
    stock: stock.length,
    sizes: enabled.length,
    sheets: sheets.length,
    unpriced: sheets.filter((item) => item.cost === undefined).length,
  };
}

/** For example "Used by 13 parts · 1 size · no price". */
export function materialStatusText(status: MaterialStatus): string {
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  const items = [status.parts === 0 ? "Used by no parts" : `Used by ${plural(status.parts, "part")}`, status.sizes === 0 ? "no stock" : plural(status.sizes, "size")];
  if (status.unpriced > 0) items.push(status.unpriced === status.sheets ? "no price" : `${status.unpriced} with no price`);
  return items.join(" · ");
}

/**
 * A new sheet for the material: the largest size of the catalogue material with the same id or name (without case),
 * with the typical price when the project currency is USD; otherwise a 96 × 48 in (2440 × 1220 mm) sheet with no cost.
 */
export function suggestedStock(project: Project, material: string): Stock {
  const units = project.project.units;
  const found = project.materials.find((m) => m.id === material);
  const name = found?.name.trim().toLowerCase();
  const entry = CATALOG.find((c) => c.id === material || c.name.toLowerCase() === name);
  const taken = idsOf(project.stock);
  if (!entry) {
    const size = NEW_SHEET_SIZE[units];
    return { id: uniqueId(slugify(`${material} ${size.length}x${size.width}`), taken), material, ...size, quantity: null, kind: "sheet" };
  }
  const size = entry.sizes[0]!;
  const stock: Stock = {
    id: uniqueId(size.id, taken),
    material,
    length: units === "in" ? size.lengthIn : size.lengthMm,
    width: units === "in" ? size.widthIn : size.widthMm,
    quantity: null,
    kind: "sheet",
  };
  if (entry.edges === "factory") stock.trim = 0;
  const price = typicalPrice(size);
  if (price && project.settings.currency === "USD") stock.cost = price.usd;
  return stock;
}

export function addSuggestedStock(project: Project, material: string): { project: Project; stock: string } {
  const stock = suggestedStock(project, material);
  return { project: { ...project, stock: [...project.stock, stock] }, stock: stock.id };
}

/** Adds the suggested sheet for each material that has no enabled stock; the project is returned unchanged when none needs one. */
export function withStockFor(project: Project, materials: Iterable<string | undefined>): Project {
  let next = project;
  for (const material of materials) {
    if (material === undefined || hasEnabledStock(next, material)) continue;
    next = addSuggestedStock(next, material).project;
  }
  return next;
}
