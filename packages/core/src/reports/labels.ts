import type { Grain } from "../format/schema.ts";
import { canRotate, copyLabel, materialName, type PlanContext } from "../plan/context.ts";
import type { SheetAnalysis } from "../plan/sheets.ts";
import type { Step } from "../sequence/sequence.ts";

export interface PartLabel {
  part: string;
  copy: number;
  name: string;
  group: string | null;
  length: number;
  width: number;
  material: string;
  /** "none" when grain does not constrain the part. */
  grain: Grain;
  sheetNumber: number | null;
  /** The step that cuts the part free, or null when it is not placed or needs no cut. */
  step: number | null;
}

export function partLabels(ctx: PlanContext, sheets: readonly SheetAnalysis[], steps: readonly Step[]): PartLabel[] {
  const where = new Map<string, { sheetNumber: number; index: number }>();
  (ctx.project.plan?.sheets ?? []).forEach((sheet, sheetIndex) => {
    sheet.placements.forEach((placement, index) => {
      const key = `${placement.part}#${placement.copy}`;
      if (!where.has(key)) where.set(key, { sheetNumber: sheetIndex + 1, index });
    });
  });

  const stuck = new Set(sheets.flatMap((sheet) => sheet.tree.stuck.flat().map((i) => `${sheet.index + 1}#${i}`)));
  const freedBy = new Map<string, number>();
  const free = (step: Step, placements: readonly number[], next: number | null) => {
    const key = `${step.sheetNumber}#${placements[0]}`;
    if (placements.length === 1 && next === null && !stuck.has(key)) freedBy.set(key, step.step);
  };
  for (const step of steps) {
    free(step, step.releasedPlacements, step.releasedNext);
    free(step, step.remainderPlacements, step.remainderNext);
  }

  const labels: PartLabel[] = [];
  for (const part of ctx.project.parts) {
    for (let copy = 0; copy < part.quantity; copy++) {
      const placed = where.get(`${part.id}#${copy}`);
      labels.push({
        part: part.id,
        copy,
        name: copyLabel(part, copy),
        group: part.group ?? null,
        length: part.length,
        width: part.width,
        material: materialName(ctx, part.material),
        grain: canRotate(ctx, part) ? "none" : part.grain,
        sheetNumber: placed?.sheetNumber ?? null,
        step: placed ? (freedBy.get(`${placed.sheetNumber}#${placed.index}`) ?? null) : null,
      });
    }
  }
  return labels;
}
