import {
  addCatalogMaterial,
  axisCells,
  axisOpenings,
  convertLength,
  defaultDesignName,
  designErrors,
  EPSILON,
  ensureMaterial,
  fitCombined,
  formatExactLength,
  isPresetSystem,
  MAX_DESIGN_CELLS,
  MIN_POCKET_THICKNESS_MM,
  NEW_SHEET_SIZE,
  parseLength,
  presetAxis,
  presetDepth,
  presetDesign,
  roundLength,
  slugify,
  uniqueId,
  withStockFor,
  type Design,
  type DesignAxis,
  type DesignSystem,
  type Material,
  type PlanIssue,
  type Project,
  type Stock,
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

/** The first material that is thick enough for pocket screws, or the first material. */
function pocketMaterial(project: Project): string {
  const min = convertLength(MIN_POCKET_THICKNESS_MM, "mm", project.project.units) - EPSILON;
  return (project.materials.find((material) => material.thickness >= min) ?? project.materials[0]!).id;
}

const BACK_MATERIAL: Readonly<Record<Units, Omit<Material, "id">>> = {
  in: { name: 'Plywood 1/4"', thickness: 0.25, grained: true },
  mm: { name: "Plywood 6 mm", thickness: 6, grained: true },
};

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

/**
 * Adds a KALLAX 2x2 of the first material that is thick enough, with a back of the first thin material. Each of the two
 * materials gets the suggested sheet when it has no enabled stock. Its id is not the id of a design, and no part names
 * it or uses its part ids.
 */
export function addDesign(project: Project): { ok: true; project: Project; id: string } | { ok: false; issues: PlanIssue[] } {
  const { project: withMaterial } = ensureMaterial(project);
  const carcass = pocketMaterial(withMaterial);
  const withCarcass = withStockFor(withMaterial, [carcass]);
  const { project: withBack, material: back } = backMaterial(withCarcass, carcass);
  const base = withStockFor(withBack, [back]);
  const name = defaultDesignName("kallax", 2, 2);
  const taken = new Set([...(base.designs ?? []).map((design) => design.id), ...base.parts.flatMap((part) => (part.design === undefined ? [] : [part.design]))]);
  for (;;) {
    const id = uniqueId(slugify(name), taken);
    const result = tryDesign(base, { ...presetDesign({ system: "kallax", id, name, material: carcass, cols: 2, rows: 2, units: base.project.units }), back: { material: back } });
    if (result.ok) return { ...result, id };
    if (!result.issues.every((issue) => issue.code === "design-conflict")) return result;
    taken.add(id);
  }
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
