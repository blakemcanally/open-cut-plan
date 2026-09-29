import { slugify, uniqueId } from "../format/ids.ts";
import type { Material, Part, Project } from "../format/schema.ts";
import type { Size } from "../geometry/rect.ts";
import type { Units } from "../geometry/units.ts";
import { applyPatch, idsOf, type Patch } from "./patch.ts";

export const NEW_PART_SIZE: Readonly<Record<Units, Size>> = { in: { length: 24, width: 12 }, mm: { length: 600, width: 300 } };
export const DEFAULT_THICKNESS: Readonly<Record<Units, number>> = { in: 0.75, mm: 18 };

/** The project's first material, adding a "Plywood" material when it has none. */
export function ensureMaterial(project: Project): { project: Project; material: string } {
  const first = project.materials[0];
  if (first) return { project, material: first.id };
  const material: Material = { id: "plywood", name: "Plywood", thickness: DEFAULT_THICKNESS[project.project.units], grained: true };
  return { project: { ...project, materials: [material] }, material: material.id };
}

export function addPart(project: Project): { project: Project; id: string } {
  const { project: withMaterial, material } = ensureMaterial(project);
  const name = `Part ${project.parts.length + 1}`;
  const id = uniqueId(slugify(name), idsOf(project.parts));
  const part: Part = { id, name, material, ...NEW_PART_SIZE[project.project.units], quantity: 1, grain: "length" };
  return { project: { ...withMaterial, parts: [...withMaterial.parts, part] }, id };
}

/** Lowering the quantity sends the removed copies' placements away. */
export function updatePart(project: Project, id: string, patch: Patch<Part>): Project {
  let quantity = Number.POSITIVE_INFINITY;
  const parts = project.parts.map((part) => {
    if (part.id !== id) return part;
    const next = applyPatch(part, patch);
    quantity = next.quantity;
    return next;
  });
  return withoutPlacements({ ...project, parts }, (placement) => placement.part === id && placement.copy >= quantity);
}

export function removePart(project: Project, id: string): Project {
  return withoutPlacements({ ...project, parts: project.parts.filter((part) => part.id !== id) }, (placement) => placement.part === id);
}

export function withoutPlacements(project: Project, drop: (placement: { part: string; copy: number }) => boolean): Project {
  if (!project.plan) return project;
  let changed = false;
  const sheets = project.plan.sheets.map((sheet) => {
    const placements = sheet.placements.filter((placement) => !drop(placement));
    if (placements.length === sheet.placements.length) return sheet;
    changed = true;
    return { ...sheet, placements };
  });
  return changed ? { ...project, plan: { ...project.plan, sheets } } : project;
}
