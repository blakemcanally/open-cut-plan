import type { Placement, PlanSheet, Project, SavedCut } from "../format/schema.ts";

/** The sheet with new placements and no saved cuts, because the saved cuts belong to the old placements. */
export function withPlacements(sheet: PlanSheet, placements: Placement[]): PlanSheet {
  const { savedCuts: _old, ...rest } = sheet;
  return { ...rest, placements };
}

/** Saves the lines on the sheet; no lines, or an empty list, removes the field. */
export function setSavedCuts(project: Project, sheetId: string, lines: readonly SavedCut[] | null): Project {
  if (!project.plan?.sheets.some((sheet) => sheet.id === sheetId)) return project;
  const sheets = project.plan.sheets.map((sheet) => {
    if (sheet.id !== sheetId) return sheet;
    const { savedCuts: _old, ...rest } = sheet;
    return lines && lines.length > 0 ? { ...rest, savedCuts: [...lines] } : rest;
  });
  return { ...project, plan: { ...project.plan, sheets } };
}

/** Removes the saved cuts of one sheet, or of every sheet; the same project when there are none. */
export function clearSavedCuts(project: Project, sheetId?: string): Project {
  let next = project;
  for (const sheet of project.plan?.sheets ?? []) {
    if (sheet.savedCuts && (sheetId === undefined || sheet.id === sheetId)) next = setSavedCuts(next, sheet.id, null);
  }
  return next;
}

/** The ids of the sheets that lost their saved cuts because an edit changed their placements. */
export function lostSavedCuts(before: Project, after: Project): string[] {
  const now = new Map((after.plan?.sheets ?? []).map((sheet) => [sheet.id, sheet]));
  return (before.plan?.sheets ?? [])
    .filter((sheet) => {
      const next = now.get(sheet.id);
      return sheet.savedCuts !== undefined && next !== undefined && next.savedCuts === undefined && next.placements !== sheet.placements;
    })
    .map((sheet) => sheet.id);
}
