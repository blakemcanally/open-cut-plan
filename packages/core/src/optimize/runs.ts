import type { PlanSheet, Project } from "../format/schema.ts";
import { applyOptimizeResult, type OptimizeResult } from "./search.ts";

export type OptimizeMode = "all" | "rest";

export interface OptimizeRequest {
  input: Project;
  start?: OptimizeResult;
  /** Sheets to put back as they were: "Optimize the rest" pins every sheet only for the run. */
  restore: ReadonlyMap<string, PlanSheet>;
}

export interface LastRun {
  request: OptimizeRequest;
  result: OptimizeResult;
  /** The project the result produced; "Keep searching" is offered while the project is still this one. */
  applied: Project;
}

/** "all" keeps pinned sheets and plans everything else again; "rest" keeps every sheet and plans only unplaced copies. */
export function optimizeRequest(project: Project, mode: OptimizeMode): OptimizeRequest {
  if (mode === "all" || !project.plan) return { input: project, restore: new Map() };
  const sheets = project.plan.sheets;
  return {
    input: { ...project, plan: { ...project.plan, sheets: sheets.map((sheet) => ({ ...sheet, pinned: true })) } },
    restore: new Map(sheets.map((sheet) => [sheet.id, sheet])),
  };
}

export function keepSearchingRequest(last: LastRun): OptimizeRequest {
  return { ...last.request, start: last.result };
}

export function applyRun(request: OptimizeRequest, result: OptimizeResult): Project {
  const applied = applyOptimizeResult(request.input, result);
  if (request.restore.size === 0 || !applied.plan) return applied;
  return { ...applied, plan: { ...applied.plan, sheets: applied.plan.sheets.map((sheet) => request.restore.get(sheet.id) ?? sheet) } };
}
