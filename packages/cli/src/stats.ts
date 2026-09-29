import { analyzeProject, unplacedCopies, type Project } from "@opencutplan/core";

export interface PlanStats {
  sheets: number;
  pinnedSheets: number;
  copies: number;
  placedCopies: number;
  unplacedCopies: number;
  steps: number;
  errors: number;
  warnings: number;
  currency: string;
  /** Null when the cost feature is off or a stock to buy has no price. */
  cost: number | null;
  sheetsToBuy: number;
  missingPrices: string[];
  utilization: number;
}

export function planStats(project: Project): PlanStats {
  const analysis = analyzeProject(project);
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
    errors: analysis.issues.filter((issue) => issue.severity === "error").length,
    warnings: analysis.issues.filter((issue) => issue.severity === "warning").length,
    currency: shopping.currency,
    cost: shopping.total,
    sheetsToBuy: shopping.materials.flatMap((material) => material.lines).reduce((sum, line) => sum + line.buy, 0),
    missingPrices: shopping.missingPrices,
    utilization: stockArea > 0 ? partArea / stockArea : 0,
  };
}
