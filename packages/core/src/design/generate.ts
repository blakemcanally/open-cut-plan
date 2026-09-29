import { withoutPlacements } from "../edit/parts.ts";
import type { Design, Part, Project } from "../format/schema.ts";
import { EPSILON } from "../geometry/rect.ts";
import { designErrors } from "./errors.ts";
import { designGeometry, materialsById } from "./geometry.ts";
import { buildDesignParts } from "./parts.ts";
import { isDesignSystem } from "./systems.ts";

export function generatedParts(project: Project, designId: string): Part[] {
  return project.parts.filter((part) => part.design === designId);
}

/**
 * The parts a design makes, or null for an unknown system or a design with an error. A part within EPSILON of its stored
 * size keeps the stored numbers, so the rounding after a unit change does not count as a change.
 */
export function designParts(project: Project, design: Design): Part[] | null {
  if (!isDesignSystem(design.system) || designErrors(project, design).length > 0) return null;
  const geometry = designGeometry(design, materialsById(project));
  if (!geometry) return null;
  const stored = new Map(generatedParts(project, design.id).map((part) => [part.id, part]));
  return buildDesignParts(design, geometry).map((part) => keepStoredSize(part, stored.get(part.id)));
}

function keepStoredSize(part: Part, stored: Part | undefined): Part {
  if (!stored || Math.abs(part.length - stored.length) > EPSILON || Math.abs(part.width - stored.width) > EPSILON) return part;
  return { ...part, length: stored.length, width: stored.width };
}

export function sameParts(a: readonly Part[], b: readonly Part[]): boolean {
  return a.length === b.length && a.every((part, index) => partKey(part) === partKey(b[index]!));
}

function partKey(part: Part): string {
  return JSON.stringify(Object.entries(part).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

export function regenerateDesigns(project: Project): Project {
  let next = project;
  for (const design of project.designs ?? []) next = regenerateDesign(next, design);
  return next;
}

function regenerateDesign(project: Project, design: Design): Project {
  const parts = designParts(project, design);
  if (!parts) return project;
  const old = generatedParts(project, design.id);
  if (sameParts(old, parts)) return project;

  const first = project.parts.findIndex((part) => part.design === design.id);
  const others = project.parts.filter((part) => part.design !== design.id);
  const at = first === -1 ? others.length : first;
  const before = new Map(old.map((part) => [part.id, part]));
  const after = new Map(parts.map((part) => [part.id, part]));
  return withoutPlacements({ ...project, parts: [...others.slice(0, at), ...parts, ...others.slice(at)] }, (placement) => {
    const was = before.get(placement.part);
    if (!was) return false;
    const now = after.get(placement.part);
    return !now || now.length !== was.length || now.width !== was.width || placement.copy >= now.quantity;
  });
}
