import type { Project } from "./format/schema.ts";
import { planContext, type PlanContext } from "./plan/context.ts";
import type { PlanIssue } from "./plan/issues.ts";
import { checkLayout } from "./plan/layout.ts";
import { analyzeSheets, type SheetAnalysis } from "./plan/sheets.ts";
import { checkCuts } from "./plan/validate.ts";
import { listOffcuts, type Offcut } from "./reports/offcuts.ts";
import { partLabels, type PartLabel } from "./reports/labels.ts";
import { shoppingList, type ShoppingList } from "./reports/shopping.ts";
import { sequenceCuts, type Step } from "./sequence/sequence.ts";

export interface ProjectAnalysis {
  context: PlanContext;
  issues: PlanIssue[];
  sheets: SheetAnalysis[];
  steps: Step[];
  offcuts: Offcut[];
  shopping: ShoppingList;
  /** Empty when the labels feature is off. */
  labels: PartLabel[];
}

/** Everything derived from a project, computed once. */
export function analyzeProject(project: Project): ProjectAnalysis {
  const context = planContext(project);
  const sheets = analyzeSheets(context);
  const steps = sequenceCuts(context, sheets);
  const layout = checkLayout(context);
  return {
    context,
    issues: [...layout, ...checkCuts(context, layout, sheets, steps)],
    sheets,
    steps,
    offcuts: listOffcuts(context, sheets),
    shopping: shoppingList(context, sheets),
    labels: context.features.labels ? partLabels(context, sheets, steps) : [],
  };
}
