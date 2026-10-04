import { checkDesigns } from "../design/checks.ts";
import type { Project } from "../format/schema.ts";
import { checkGoal } from "../optimize/goal-setting.ts";
import { sequenceCuts, type Step } from "../sequence/sequence.ts";
import { copyLabel, formatIn, planContext, type PlanContext } from "./context.ts";
import { checkFactoryEdges } from "./factoryEdges.ts";
import { planError, type PlanIssue } from "./issues.ts";
import { checkLayout } from "./layout.ts";
import { analyzeSheets, type SheetAnalysis } from "./sheets.ts";

const KIND_NOUN = { rip: "rip", crosscut: "crosscut", trim: "trim cut" } as const;

export function validatePlan(project: Project): PlanIssue[] {
  const ctx = planContext(project);
  const sheets = analyzeSheets(ctx);
  const layout = checkLayout(ctx);
  return [...layout, ...checkCuts(ctx, layout, sheets, sequenceCuts(ctx, sheets)), ...checkFactoryEdges(ctx), ...checkDesigns(project), ...checkGoal(project)];
}

/**
 * The cut-order checks. Placements that already have an `off-sheet` or `overlap` issue are not reported again as
 * `not-guillotine`. Returns nothing when the cutOrder feature is off.
 */
export function checkCuts(ctx: PlanContext, layout: readonly PlanIssue[], sheets: readonly SheetAnalysis[], steps: readonly Step[]): PlanIssue[] {
  if (!ctx.features.cutOrder) return [];
  const issues: PlanIssue[] = [];
  const reported = new Set<string>();
  for (const issue of layout) {
    if (issue.code !== "off-sheet" && issue.code !== "overlap") continue;
    for (const ref of issue.refs) if (ref.kind === "placement") reported.add(`${ref.sheet}#${ref.index}`);
  }

  for (const { sheet, index, tree } of sheets) {
    for (const group of tree.stuck) {
      const free = group.filter((i) => !reported.has(`${sheet.id}#${i}`));
      if (free.length === 0) continue;
      const labels = free.map((i) => {
        const placement = sheet.placements[i]!;
        return copyLabel(ctx.parts.get(placement.part)!, placement.copy);
      });
      issues.push(
        planError(
          "not-guillotine",
          `Sheet ${index + 1}: ${joinAnd(labels)} cannot be cut free with straight cuts that run across the whole piece.`,
          free.map((i) => ({ kind: "placement", sheet: sheet.id, index: i })),
        ),
      );
    }
  }

  if (steps.length === 0) return issues;
  if (ctx.tools.length === 0) {
    issues.push(planError("no-tool", "No tool is enabled. Add a tool or enable one on the Tools tab."));
  } else if (ctx.features.toolLimits) {
    for (const step of steps) {
      if (step.tool) continue;
      issues.push(
        planError("no-tool", `No tool in your profile can make cut ${step.step} (a ${formatIn(ctx, step.to - step.from)} ${KIND_NOUN[step.kind]}).`, [
          { kind: "cut", sheet: step.sheet, step: step.step },
        ]),
      );
    }
  }
  return issues;
}

function joinAnd(items: readonly string[]): string {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}
