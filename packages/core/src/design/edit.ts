import { setGroupColor } from "../edit/colors.ts";
import { withoutPlacements } from "../edit/parts.ts";
import type { Design, DesignAxis, Project } from "../format/schema.ts";
import type { DesignSystem } from "./systems.ts";

export const DESIGN_SYSTEM_NAMES: Readonly<Record<DesignSystem, string>> = { kallax: "KALLAX", eket: "EKET", custom: "Custom" };

export function defaultDesignName(system: DesignSystem, cols: number, rows: number): string {
  return `${DESIGN_SYSTEM_NAMES[system]} ${cols}x${rows}`;
}

export function axisCells(axis: DesignAxis): number {
  return "openings" in axis ? axis.openings.length : axis.cells;
}

function withDesigns(project: Project, designs: Design[]): Project {
  const { designs: _designs, ...rest } = project;
  return designs.length > 0 ? { ...rest, designs } : rest;
}

/** Removes the design, its parts, and their copies on the sheets. */
export function removeDesign(project: Project, id: string): Project {
  const gone = new Set(project.parts.filter((part) => part.design === id).map((part) => part.id));
  const next = withDesigns({ ...project, parts: project.parts.filter((part) => !gone.has(part.id)) }, (project.designs ?? []).filter((design) => design.id !== id));
  return withoutPlacements(next, (placement) => gone.has(placement.part));
}

/** Removes the design and keeps its parts, and their copies on the sheets, as normal parts. The colour of its first unit becomes the colour of its group. */
export function detachDesign(project: Project, id: string): Project {
  const parts = project.parts.map((part) => {
    if (part.design !== id) return part;
    const { design: _design, ...rest } = part;
    return rest;
  });
  const next = withDesigns({ ...project, parts }, (project.designs ?? []).filter((design) => design.id !== id));
  const design = project.designs?.find((candidate) => candidate.id === id);
  const color = design?.colors?.[0];
  return design && color && !project.groups?.[design.name]?.color ? setGroupColor(next, design.name, color) : next;
}

/** Changes the design id, and the ids of its parts and their copies, so the copies stay on their sheets. */
export function renameDesign(project: Project, from: string, to: string): Project {
  const prefix = `${from}-`;
  const ids = new Map<string, string>();
  const parts = project.parts.map((part) => {
    if (part.design !== from) return part;
    const id = part.id.startsWith(prefix) ? `${to}-${part.id.slice(prefix.length)}` : part.id;
    ids.set(part.id, id);
    return { ...part, id, design: to };
  });
  const designs = (project.designs ?? []).map((design) => (design.id === from ? { ...design, id: to } : design));
  const next: Project = { ...project, designs, parts };
  if (project.plan) {
    next.plan = {
      ...project.plan,
      sheets: project.plan.sheets.map((sheet) => ({
        ...sheet,
        placements: sheet.placements.map((placement) => (ids.has(placement.part) ? { ...placement, part: ids.get(placement.part)! } : placement)),
      })),
    };
  }
  return next;
}
