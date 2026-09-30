import type { Project } from "../format/schema.ts";
import { planWarning, type PlanIssue } from "../plan/issues.ts";

export type OptimizerGoal = "cost" | "offcuts" | "cuts";

export const OPTIMIZER_GOALS: readonly OptimizerGoal[] = ["cost", "offcuts", "cuts"];

export const MAX_EXTRA_COST_PERCENT = 100;

export function isOptimizerGoal(value: unknown): value is OptimizerGoal {
  return OPTIMIZER_GOALS.includes(value as OptimizerGoal);
}

/** The goal of the project, with `cost` for a value that this app does not know. */
export function projectGoal(project: Project): OptimizerGoal {
  const goal = project.settings.optimizer.goal;
  return isOptimizerGoal(goal) ? goal : "cost";
}

export function checkGoal(project: Project): PlanIssue[] {
  const goal = project.settings.optimizer.goal;
  if (isOptimizerGoal(goal)) return [];
  return [planWarning("unknown-goal", `The optimizer goal "${goal}" is not known to this app. The optimizer uses the lowest cost.`, [])];
}
