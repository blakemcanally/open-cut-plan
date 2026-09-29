import { slugify, uniqueId } from "../format/ids.ts";
import type { Material, Project, Stock } from "../format/schema.ts";
import type { Size } from "../geometry/rect.ts";
import type { Units } from "../geometry/units.ts";
import { DEFAULT_THICKNESS, ensureMaterial } from "./parts.ts";
import { applyPatch, idsOf, type Patch } from "./patch.ts";

export const NEW_SHEET_SIZE: Readonly<Record<Units, Size>> = { in: { length: 96, width: 48 }, mm: { length: 2440, width: 1220 } };

export function addMaterial(project: Project): Project {
  const name = `Material ${project.materials.length + 1}`;
  const material: Material = {
    id: uniqueId(slugify(name), idsOf(project.materials)),
    name,
    thickness: DEFAULT_THICKNESS[project.project.units],
    grained: true,
  };
  return { ...project, materials: [...project.materials, material] };
}

export function updateMaterial(project: Project, id: string, patch: Patch<Material>): Project {
  return { ...project, materials: project.materials.map((material) => (material.id === id ? applyPatch(material, patch) : material)) };
}

export function materialInUse(project: Project, id: string): boolean {
  return project.parts.some((part) => part.material === id) || project.stock.some((stock) => stock.material === id);
}

/** Only an unused material can go; the project is returned unchanged otherwise. */
export function removeMaterial(project: Project, id: string): Project {
  if (materialInUse(project, id)) return project;
  return { ...project, materials: project.materials.filter((material) => material.id !== id) };
}

export function addStock(project: Project): Project {
  const { project: withMaterial, material } = ensureMaterial(project);
  const size = NEW_SHEET_SIZE[project.project.units];
  const id = uniqueId(slugify(`${material} ${size.length}x${size.width}`), idsOf(project.stock));
  const stock: Stock = { id, material, ...size, quantity: null, kind: "sheet" };
  return { ...withMaterial, stock: [...withMaterial.stock, stock] };
}

export function updateStock(project: Project, id: string, patch: Patch<Stock>): Project {
  return { ...project, stock: project.stock.map((stock) => (stock.id === id ? applyPatch(stock, patch) : stock)) };
}

/** Plan sheets cut from the stock go too, so their parts return to the unplaced tray. */
export function removeStock(project: Project, id: string): Project {
  const next = { ...project, stock: project.stock.filter((stock) => stock.id !== id) };
  if (!project.plan) return next;
  return { ...next, plan: { ...project.plan, sheets: project.plan.sheets.filter((sheet) => sheet.stock !== id) } };
}
