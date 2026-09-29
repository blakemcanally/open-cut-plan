import { uniqueId } from "../format/ids.ts";
import type { Placement, PlanSheet, Project } from "../format/schema.ts";
import { contains, EPSILON, gapAlong, type Rect, type Size } from "../geometry/rect.ts";
import { placedRect, usableRect, type PlanContext } from "../plan/context.ts";
import { idsOf } from "./patch.ts";

export { orientedSize } from "../optimize/problem.ts";

export interface CopyRef {
  part: string;
  copy: number;
}

export interface Located {
  sheet: PlanSheet;
  sheetIndex: number;
  index: number;
  placement: Placement;
}

export function sameCopy(a: CopyRef | null, b: CopyRef | null): boolean {
  return a !== null && b !== null && a.part === b.part && a.copy === b.copy;
}

export function findCopy(project: Project, ref: CopyRef): Located | null {
  const sheets = project.plan?.sheets ?? [];
  for (const [sheetIndex, sheet] of sheets.entries()) {
    const index = sheet.placements.findIndex((placement) => sameCopy(placement, ref));
    if (index >= 0) return { sheet, sheetIndex, index, placement: sheet.placements[index]! };
  }
  return null;
}

/** Part copies with no placement on any sheet, in part order. */
export function unplacedCopies(project: Project): CopyRef[] {
  const placed = new Set((project.plan?.sheets ?? []).flatMap((sheet) => sheet.placements.map((p) => `${p.part}#${p.copy}`)));
  return project.parts.flatMap((part) =>
    Array.from({ length: part.quantity }, (_, copy) => ({ part: part.id, copy })).filter((ref) => !placed.has(`${ref.part}#${ref.copy}`)),
  );
}

function mapSheets(project: Project, change: (sheet: PlanSheet) => PlanSheet): Project {
  if (!project.plan) return project;
  return { ...project, plan: { ...project.plan, sheets: project.plan.sheets.map(change) } };
}

export function moveToTray(project: Project, ref: CopyRef): Project {
  if (!findCopy(project, ref)) return project;
  return mapSheets(project, (sheet) =>
    sheet.placements.some((p) => sameCopy(p, ref)) ? { ...sheet, placements: sheet.placements.filter((p) => !sameCopy(p, ref)) } : sheet,
  );
}

/** Moves the copy (from a sheet or the tray) to `sheetId`, keeping any other fields of its placement. */
export function placeCopy(project: Project, ref: CopyRef, sheetId: string, x: number, y: number, rotated: boolean): Project {
  const old = findCopy(project, ref)?.placement;
  const placement: Placement = { ...old, part: ref.part, copy: ref.copy, x, y, rotated };
  return mapSheets(moveToTray(project, ref), (sheet) => (sheet.id === sheetId ? { ...sheet, placements: [...sheet.placements, placement] } : sheet));
}

function changePlacement(project: Project, ref: CopyRef, change: (placement: Placement) => Placement): Project {
  const found = findCopy(project, ref);
  if (!found) return project;
  return mapSheets(project, (sheet) =>
    sheet === found.sheet ? { ...sheet, placements: sheet.placements.map((p, i) => (i === found.index ? change(p) : p)) } : sheet,
  );
}

/** Turns the copy a quarter turn about its top-left corner. */
export function rotateCopy(project: Project, ref: CopyRef): Project {
  return changePlacement(project, ref, (placement) => ({ ...placement, rotated: !placement.rotated }));
}

export function nudgeCopy(project: Project, ref: CopyRef, dx: number, dy: number): Project {
  return changePlacement(project, ref, (placement) => ({ ...placement, x: placement.x + dx, y: placement.y + dy }));
}

export function moveCopyTo(project: Project, ref: CopyRef, x: number, y: number): Project {
  return changePlacement(project, ref, (placement) => ({ ...placement, x, y }));
}

export function addSheet(project: Project, stock: string): { project: Project; id: string } {
  const sheets = project.plan?.sheets ?? [];
  const id = uniqueId(`s${sheets.length + 1}`, idsOf(sheets));
  return { project: { ...project, plan: { ...project.plan, sheets: [...sheets, { id, stock, placements: [] }] } }, id };
}

/** The sheet's parts return to the tray. */
export function removeSheet(project: Project, sheetId: string): Project {
  if (!project.plan) return project;
  return { ...project, plan: { ...project.plan, sheets: project.plan.sheets.filter((sheet) => sheet.id !== sheetId) } };
}

export function removeEmptySheets(project: Project): Project {
  if (!project.plan?.sheets.some((sheet) => sheet.placements.length === 0)) return project;
  return { ...project, plan: { ...project.plan, sheets: project.plan.sheets.filter((sheet) => sheet.placements.length > 0) } };
}

export function setPinned(project: Project, sheetId: string, pinned: boolean): Project {
  return mapSheets(project, (sheet) => {
    if (sheet.id !== sheetId) return sheet;
    const { pinned: _old, ...rest } = sheet;
    return pinned ? { ...rest, pinned: true } : rest;
  });
}

export function clearsKerf(a: Rect, b: Rect, kerf: number): boolean {
  return gapAlong(a, b, "x") >= kerf - EPSILON || gapAlong(a, b, "y") >= kerf - EPSILON;
}

export function sheetRects(ctx: PlanContext, sheet: PlanSheet, except?: CopyRef): Rect[] {
  return sheet.placements.flatMap((placement) => {
    const part = ctx.parts.get(placement.part);
    return part && !sameCopy(placement, except ?? null) ? [placedRect(part, placement)] : [];
  });
}

/** The first spot (smallest x, then y) where `size` fits in the usable area at least one kerf from every other part. */
export function findFreeSpot(ctx: PlanContext, sheet: PlanSheet, size: Size, except?: CopyRef): { x: number; y: number } | null {
  const stock = ctx.stock.get(sheet.stock);
  if (!stock) return null;
  const usable = usableRect(ctx, stock);
  const others = sheetRects(ctx, sheet, except);
  const xs = [usable.x, ...others.map((r) => r.x + r.length + ctx.kerf)].sort((a, b) => a - b);
  const ys = [usable.y, ...others.map((r) => r.y + r.width + ctx.kerf)].sort((a, b) => a - b);
  for (const x of xs) {
    for (const y of ys) {
      const rect = { x, y, ...size };
      if (contains(usable, rect) && others.every((other) => clearsKerf(other, rect, ctx.kerf))) return { x, y };
    }
  }
  return null;
}
