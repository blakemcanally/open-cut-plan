import type { CombinedCell, Design, DesignAxis, Material, Project } from "../format/schema.ts";

export interface DesignGeometry {
  thickness: number;
  /** 0 when the design has no back. */
  backThickness: number;
  /** Cell openings, left to right. */
  columns: number[];
  /** Cell openings, top to bottom. */
  rows: number[];
  outsideWidth: number;
  outsideHeight: number;
  depth: number;
  panelDepth: number;
  /** Only present when the design has combined cells. */
  combined?: readonly CombinedCell[];
}

export function roundLength(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}

export function axisOpenings(axis: DesignAxis, thickness: number): number[] {
  if ("openings" in axis) return [...axis.openings];
  const opening = roundLength((axis.outside - (axis.cells + 1) * thickness) / axis.cells);
  return Array.from({ length: axis.cells }, () => opening);
}

function outsideSize(axis: DesignAxis, openings: readonly number[], thickness: number): number {
  if ("outside" in axis) return axis.outside;
  return roundLength(openings.reduce((sum, opening) => sum + opening, 0) + (openings.length + 1) * thickness);
}

export function materialsById(project: Project): ReadonlyMap<string, Material> {
  const map = new Map<string, Material>();
  for (const material of project.materials) if (!map.has(material.id)) map.set(material.id, material);
  return map;
}

export function designGeometry(design: Design, materials: ReadonlyMap<string, Material>): DesignGeometry | null {
  const material = materials.get(design.material);
  if (!material) return null;
  let backThickness = 0;
  if (design.back) {
    const back = materials.get(design.back.material);
    if (!back) return null;
    backThickness = back.thickness;
  }
  const thickness = material.thickness;
  const columns = axisOpenings(design.width, thickness);
  const rows = axisOpenings(design.height, thickness);
  return {
    thickness,
    backThickness,
    columns,
    rows,
    outsideWidth: outsideSize(design.width, columns, thickness),
    outsideHeight: outsideSize(design.height, rows, thickness),
    depth: design.depth,
    panelDepth: roundLength(design.depth - backThickness),
    ...(design.combined && design.combined.length > 0 ? { combined: design.combined } : {}),
  };
}
