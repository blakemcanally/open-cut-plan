import {
  addCatalogMaterial,
  addStarterDesign,
  axisCells,
  axisOpenings,
  designErrors,
  designGeometry,
  fitCombined,
  formatExactLength,
  formatLength,
  isPresetSystem,
  materialsById,
  MAX_DESIGN_CELLS,
  parseLength,
  presetAxis,
  presetDepth,
  roundLength,
  withStockFor,
  type Design,
  type DesignAdd,
  type DesignAxis,
  type DesignSystem,
  type PlanIssue,
  type Project,
  type Starter,
  type StarterValues,
  type Units,
} from "@opencutplan/core";

export type DesignEdit = { ok: true; project: Project } | { ok: false; issues: PlanIssue[] };

export type AxisMode = "outside" | "openings";

export const CATALOG_VALUE = "catalog:";

/**
 * A material from a design select: a project material id, which gets the suggested sheet when it has no enabled stock, or
 * a catalogue material, which is added with its largest sheet when the project has no sheet of it.
 */
export function pickMaterial(project: Project, value: string): { project: Project; material: string } {
  if (project.materials.some((material) => material.id === value)) return { project: withStockFor(project, [value]), material: value };
  if (!value.startsWith(CATALOG_VALUE)) return { project, material: value };
  const result = addCatalogMaterial(project, value.slice(CATALOG_VALUE.length), { sheet: true });
  return { project: result.project, material: result.material };
}

function withDesign(project: Project, design: Design): Project {
  const designs = project.designs ?? [];
  const known = designs.some((item) => item.id === design.id);
  return { ...project, designs: known ? designs.map((item) => (item.id === design.id ? design : item)) : [...designs, design] };
}

/** The project with the design, its combined cells fitted to its grid, or the errors that refuse it (spec §10). The project store makes its parts. */
export function tryDesign(project: Project, design: Design): DesignEdit {
  const fitted = fitCombined(design);
  const next = withDesign(project, fitted);
  const issues = designErrors(next, fitted);
  return issues.length > 0 ? { ok: false, issues } : { ok: true, project: next };
}

/** The starter as a design in the project, with the first material that is thick enough and a thin back. No parts: the project store makes them. */
export function addStarter(project: Project, starter: Starter, values: StarterValues): DesignAdd {
  return addStarterDesign(project, starter, values);
}

export function outsideText(project: Project, design: Design): string {
  const geometry = designGeometry(design, materialsById(project));
  if (!geometry) return "no size";
  const show = (value: number) => formatLength(value, project.project.units, project.settings.display);
  return `${show(geometry.outsideWidth)} × ${show(geometry.outsideHeight)} × ${show(geometry.depth)}`;
}

export function axisMode(axis: DesignAxis): AxisMode {
  return "openings" in axis ? "openings" : "outside";
}

/**
 * A new cell count: IKEA cells for kallax and eket, given the same way as before when the panel thickness is known;
 * otherwise the same outside size, or the last opening repeated.
 */
export function withCells(system: string, axis: DesignAxis, cells: number, units: Units, thickness?: number): DesignAxis {
  if (isPresetSystem(system)) {
    const preset = presetAxis(system, cells, units);
    if (thickness === undefined) return preset;
    const openings = axisOpenings(preset, thickness);
    return withMode(preset, axisMode(axis), openings, roundLength(openings.reduce((sum, opening) => sum + opening, 0) + (cells + 1) * thickness));
  }
  if (!("openings" in axis)) return { ...axis, cells };
  const last = axis.openings.at(-1)!;
  return { ...axis, openings: Array.from({ length: cells }, (_, index) => axis.openings[index] ?? last) };
}

/** The same cells, given the other way: as the outside size, or as the size of each opening. */
export function withMode(axis: DesignAxis, mode: AxisMode, openings: readonly number[], outside: number): DesignAxis {
  if (mode === axisMode(axis)) return axis;
  return mode === "openings" ? { openings: [...openings] } : { outside, cells: axisCells(axis) };
}

/** The outside width or height of an open-top box is one cell of that size, and the depth is the outside depth. */
export function withOpenBoxSize(design: Design, which: "width" | "height" | "depth", value: number): Design {
  return which === "depth" ? { ...design, depth: value } : { ...design, [which]: { outside: value, cells: 1 } };
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

export function openingsText(openings: readonly number[], units: Units): string {
  return openings.map((opening) => formatExactLength(opening, units)).join(", ");
}

/** An item whose text is the text of the same opening in `previous` keeps the exact value of that opening. */
export function parseOpenings(text: string, units: Units, previous: readonly number[] = []): number[] | null {
  const openings = text.split(",").map((item, index) => {
    const old = previous[index];
    return old !== undefined && item.trim() === formatExactLength(old, units) ? old : parseLength(item.trim(), units);
  });
  if (openings.length > MAX_DESIGN_CELLS || openings.some((opening) => opening === null || opening <= 0)) return null;
  return openings as number[];
}
