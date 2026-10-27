import { withStockFor } from "../catalog/suggest.ts";
import { ensureMaterial } from "../edit/parts.ts";
import { NEW_SHEET_SIZE } from "../edit/stock.ts";
import { slugify, uniqueId } from "../format/ids.ts";
import type { Design, Material, Project, Stock } from "../format/schema.ts";
import { EPSILON } from "../geometry/rect.ts";
import { convertLength, type Units } from "../geometry/units.ts";
import type { PlanIssue } from "../plan/issues.ts";
import { fitCombined } from "./combined.ts";
import { designErrors } from "./errors.ts";
import { MIN_POCKET_THICKNESS_MM } from "./systems.ts";

export interface DesignMaterials {
  project: Project;
  material: string;
  back: string;
}

export type DesignAdd = { ok: true; project: Project; id: string } | { ok: false; issues: PlanIssue[] };

const BACK_MATERIAL: Readonly<Record<Units, Omit<Material, "id">>> = {
  in: { name: 'Plywood 1/4"', thickness: 0.25, grained: true },
  mm: { name: "Plywood 6 mm", thickness: 6, grained: true },
};

/** The first material that is thick enough for pocket screws, or the first material. */
function pocketMaterial(project: Project): string {
  const min = convertLength(MIN_POCKET_THICKNESS_MM, "mm", project.project.units) - EPSILON;
  return (project.materials.find((material) => material.thickness >= min) ?? project.materials[0]!).id;
}

/** The first material too thin for pocket screws, or a new 1/4" (6 mm) plywood with one sheet stock the size of the first sheet of the carcass material. */
function backMaterial(project: Project, carcass: string): { project: Project; material: string } {
  const min = convertLength(MIN_POCKET_THICKNESS_MM, "mm", project.project.units) - EPSILON;
  const thin = project.materials.find((material) => material.thickness < min);
  if (thin) return { project, material: thin.id };
  const units = project.project.units;
  const material: Material = { id: uniqueId(slugify(BACK_MATERIAL[units].name), new Set(project.materials.map((m) => m.id))), ...BACK_MATERIAL[units] };
  const sheet = project.stock.find((stock) => stock.material === carcass && stock.kind === "sheet");
  const size = sheet ? { length: sheet.length, width: sheet.width } : NEW_SHEET_SIZE[units];
  const stock: Stock = { id: uniqueId(slugify(`${material.id} ${size.length}x${size.width}`), new Set(project.stock.map((s) => s.id))), material: material.id, ...size, quantity: null, kind: "sheet" };
  return { project: { ...project, materials: [...project.materials, material], stock: [...project.stock, stock] }, material: material.id };
}

/** The box material and the back material that a new design gets, with the suggested sheet for each that has no enabled stock. */
export function pickDesignMaterials(project: Project): DesignMaterials {
  const { project: withMaterial } = ensureMaterial(project);
  const material = pocketMaterial(withMaterial);
  const withCarcass = withStockFor(withMaterial, [material]);
  const { project: withBack, material: back } = backMaterial(withCarcass, material);
  return { project: withStockFor(withBack, [back]), material, back };
}

/** Adds the design that `make(id)` gives, with the first free id from `base`, and tries the next id while the only errors are design-conflict. No parts. */
export function addDesignWithId(project: Project, base: string, make: (id: string) => Design): DesignAdd {
  const taken = new Set([...(project.designs ?? []).map((design) => design.id), ...project.parts.flatMap((part) => (part.design === undefined ? [] : [part.design]))]);
  for (;;) {
    const id = uniqueId(base, taken);
    const design = fitCombined(make(id));
    const next = { ...project, designs: [...(project.designs ?? []), design] };
    const issues = designErrors(next, design);
    if (issues.length === 0) return { ok: true, project: next, id };
    if (!issues.every((issue) => issue.code === "design-conflict")) return { ok: false, issues };
    taken.add(id);
  }
}
