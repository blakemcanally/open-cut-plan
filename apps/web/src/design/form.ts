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
  NEW_SHEET_SIZE,
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
  type Material,
  type PlanIssue,
  type Project,
  type Stock,
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

/** Adds a KALLAX 2x2 of the first material that is thick enough, with a back of the first thin material. Its id is not the id of a design, and no part names it or uses its part ids. */
export function addDesign(project: Project): { ok: true; project: Project; id: string } | { ok: false; issues: PlanIssue[] } {
  const { project: withCarcass } = ensureMaterial(project);
  const carcass = pocketMaterial(withCarcass);
  const { project: base, material: back } = backMaterial(withCarcass, carcass);
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
