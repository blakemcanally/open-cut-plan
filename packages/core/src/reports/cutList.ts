import type { ProjectAnalysis } from "../analysis.ts";
import type { Grain, Project } from "../format/schema.ts";
import { factoryEdgeRequest } from "../plan/factoryEdges.ts";

export interface CutListPart {
  id: string;
  name: string;
  material: string;
  length: number;
  width: number;
  /** Null when the material is not known. */
  thickness: number | null;
  quantity: number;
  grain: Grain;
  factoryEdge: "long" | null;
  group: string | null;
  /** The copies on a sheet, up to `quantity`. */
  placed: number;
  /** The 1-based numbers of the sheets that have a copy. */
  sheets: number[];
}

export interface CutListMaterial {
  material: string;
  name: string;
  parts: number;
  copies: number;
  /** In square project units. */
  partArea: number;
}

export interface CutList {
  parts: CutListPart[];
  /** Only the materials that parts use, in project order. */
  materials: CutListMaterial[];
}

/** Every part with its size, count, factory edge request, copies placed, and sheets; then the part count and area of each material. */
export function cutList(project: Project, analysis: ProjectAnalysis): CutList {
  const where = new Map<string, number[]>();
  const placed = new Map<string, number>();
  (project.plan?.sheets ?? []).forEach((sheet, index) => {
    for (const placement of sheet.placements) {
      const numbers = where.get(placement.part) ?? [];
      if (!numbers.includes(index + 1)) numbers.push(index + 1);
      where.set(placement.part, numbers);
      placed.set(placement.part, (placed.get(placement.part) ?? 0) + 1);
    }
  });
  const parts = project.parts.map((part) => ({
    id: part.id,
    name: part.name,
    material: part.material,
    length: part.length,
    width: part.width,
    thickness: analysis.context.materials.get(part.material)?.thickness ?? null,
    quantity: part.quantity,
    grain: part.grain,
    factoryEdge: factoryEdgeRequest(project, part),
    group: part.group ?? null,
    placed: Math.min(placed.get(part.id) ?? 0, part.quantity),
    sheets: where.get(part.id) ?? [],
  }));
  const materials = project.materials
    .map((material) => {
      const mine = parts.filter((part) => part.material === material.id);
      return {
        material: material.id,
        name: material.name,
        parts: mine.length,
        copies: mine.reduce((sum, part) => sum + part.quantity, 0),
        partArea: mine.reduce((sum, part) => sum + part.length * part.width * part.quantity, 0),
      };
    })
    .filter((material) => material.parts > 0);
  return { parts, materials };
}
