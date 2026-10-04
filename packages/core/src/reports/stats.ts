import { analyzeProject, type ProjectAnalysis } from "../analysis.ts";
import { unplacedCopies } from "../edit/layout.ts";
import type { Project } from "../format/schema.ts";
import { totalCutLength } from "../sequence/sequence.ts";

export interface PlanStats {
  sheets: number;
  pinnedSheets: number;
  copies: number;
  placedCopies: number;
  unplacedCopies: number;
  steps: number;
  /** The total length of the cut lines of the steps, trims included. */
  cutLength: number;
  errors: number;
  warnings: number;
  currency: string;
  /** Null when the cost feature is off or a stock to buy has no price. */
  cost: number | null;
  sheetsToBuy: number;
  missingPrices: string[];
  /** The area of the stock of all the sheets in the plan. */
  stockArea: number;
  utilization: number;
}

/** `analysis` must be the analysis of `project`; give it when you have it already. */
export function planStats(project: Project, analysis: ProjectAnalysis = analyzeProject(project)): PlanStats {
  const sheets = project.plan?.sheets ?? [];
  const copies = project.parts.reduce((sum, part) => sum + part.quantity, 0);
  const unplaced = unplacedCopies(project).length;
  const { shopping } = analysis;
  const stockArea = shopping.sheets.reduce((sum, sheet) => sum + sheet.stockArea, 0);
  const partArea = shopping.sheets.reduce((sum, sheet) => sum + sheet.partArea, 0);
  return {
    sheets: sheets.length,
    pinnedSheets: sheets.filter((sheet) => sheet.pinned === true).length,
    copies,
    placedCopies: copies - unplaced,
    unplacedCopies: unplaced,
    steps: analysis.steps.length,
    cutLength: totalCutLength(analysis.steps),
    errors: analysis.issues.filter((issue) => issue.severity === "error").length,
    warnings: analysis.issues.filter((issue) => issue.severity === "warning").length,
    currency: shopping.currency,
    cost: shopping.total,
    sheetsToBuy: shopping.materials.flatMap((material) => material.lines).reduce((sum, line) => sum + line.buy, 0),
    missingPrices: shopping.missingPrices,
    stockArea,
    utilization: stockArea > 0 ? partArea / stockArea : 0,
  };
}

/** True when both projects have the same sheets, in the same order, with the same placements. */
export function samePlan(a: Project, b: Project): boolean {
  return JSON.stringify(a.plan?.sheets ?? []) === JSON.stringify(b.plan?.sheets ?? []);
}
