import {
  axisCells,
  convertLength,
  defaultDesignName,
  designErrors,
  EPSILON,
  ensureMaterial,
  formatLength,
  isPresetSystem,
  MAX_DESIGN_CELLS,
  MIN_POCKET_THICKNESS_MM,
  parseLength,
  presetAxis,
  presetDepth,
  presetDesign,
  slugify,
  uniqueId,
  type Design,
  type DesignAxis,
  type DesignSystem,
  type DisplayPrecision,
  type PlanIssue,
  type Project,
  type Units,
} from "@opencutplan/core";

export type DesignEdit = { ok: true; project: Project } | { ok: false; issues: PlanIssue[] };

export type AxisMode = "outside" | "openings";

function withDesign(project: Project, design: Design): Project {
  const designs = project.designs ?? [];
  const known = designs.some((item) => item.id === design.id);
  return { ...project, designs: known ? designs.map((item) => (item.id === design.id ? design : item)) : [...designs, design] };
}

/** The project with the design, or the errors that refuse it (spec §10). The project store makes its parts. */
export function tryDesign(project: Project, design: Design): DesignEdit {
  const next = withDesign(project, design);
  const issues = designErrors(next, design);
  return issues.length > 0 ? { ok: false, issues } : { ok: true, project: next };
}

/** The first material that is thick enough for pocket screws, or the first material. */
function pocketMaterial(project: Project): string {
  const min = convertLength(MIN_POCKET_THICKNESS_MM, "mm", project.project.units) - EPSILON;
  return (project.materials.find((material) => material.thickness >= min) ?? project.materials[0]!).id;
}

/** Adds a KALLAX 2x2 of the first material that is thick enough. Its id is not the id of a design, and no part names it or uses its part ids. */
export function addDesign(project: Project): { ok: true; project: Project; id: string } | { ok: false; issues: PlanIssue[] } {
  const { project: base } = ensureMaterial(project);
  const name = defaultDesignName("kallax", 2, 2);
  const taken = new Set([...(base.designs ?? []).map((design) => design.id), ...base.parts.flatMap((part) => (part.design === undefined ? [] : [part.design]))]);
  for (;;) {
    const id = uniqueId(slugify(name), taken);
    const result = tryDesign(base, presetDesign({ system: "kallax", id, name, material: pocketMaterial(base), cols: 2, rows: 2, units: base.project.units }));
    if (result.ok) return { ...result, id };
    if (!result.issues.every((issue) => issue.code === "design-conflict")) return result;
    taken.add(id);
  }
}

export function axisMode(axis: DesignAxis): AxisMode {
  return "openings" in axis ? "openings" : "outside";
}

/** A new cell count: IKEA cells for kallax and eket; otherwise the same outside size, or the last opening repeated. */
export function withCells(system: string, axis: DesignAxis, cells: number, units: Units): DesignAxis {
  if (isPresetSystem(system)) return presetAxis(system, cells, units);
  if (!("openings" in axis)) return { ...axis, cells };
  const last = axis.openings.at(-1)!;
  return { ...axis, openings: Array.from({ length: cells }, (_, index) => axis.openings[index] ?? last) };
}

/** The same cells, given the other way: as the outside size, or as the size of each opening. */
export function withMode(axis: DesignAxis, mode: AxisMode, openings: readonly number[], outside: number): DesignAxis {
  if (mode === axisMode(axis)) return axis;
  return mode === "openings" ? { openings: [...openings] } : { outside, cells: axisCells(axis) };
}

/** kallax and eket set IKEA cells and the IKEA depth; custom keeps the sizes. */
export function withSystem(design: Design, system: DesignSystem, units: Units): Design {
  if (!isPresetSystem(system)) return { ...design, system };
  return {
    ...design,
    system,
    width: presetAxis(system, axisCells(design.width), units),
    height: presetAxis(system, axisCells(design.height), units),
    depth: presetDepth(system, units),
  };
}

export function openingsText(openings: readonly number[], units: Units, display: DisplayPrecision): string {
  return openings.map((opening) => formatLength(opening, units, display)).join(", ");
}

export function parseOpenings(text: string, units: Units): number[] | null {
  const openings = text.split(",").map((item) => parseLength(item.trim(), units));
  if (openings.length > MAX_DESIGN_CELLS || openings.some((opening) => opening === null || opening <= 0)) return null;
  return openings as number[];
}
