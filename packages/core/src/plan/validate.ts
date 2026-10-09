import { checkDesigns } from "../design/checks.ts";
import type { Project } from "../format/schema.ts";
import { checkGoal } from "../optimize/goal-setting.ts";
import { sequenceCuts, type Step } from "../sequence/sequence.ts";
import { copyLabel, formatIn, planContext, type PlanContext } from "./context.ts";
import { checkFactoryEdges } from "./factoryEdges.ts";
import { countNoTool } from "./cutTree.ts";
import { planError, planWarning, type PlanIssue } from "./issues.ts";
import { checkLayout } from "./layout.ts";
import { analyzeSheets, treeToolCheck, type SheetAnalysis } from "./sheets.ts";

const KIND_NOUN = { rip: "rip", crosscut: "crosscut", trim: "trim cut" } as const;

export function validatePlan(project: Project): PlanIssue[] {
  const ctx = planContext(project);
  const sheets = analyzeSheets(ctx);
  const layout = checkLayout(ctx);
  return [...layout, ...checkCuts(ctx, layout, sheets, sequenceCuts(ctx, sheets)), ...checkFactoryEdges(ctx), ...checkDesigns(project), ...checkGoal(project)];
}

/**
 * The cut-order checks. Placements that already have an `off-sheet` or `overlap` issue are not reported again as
 * `not-guillotine`. Returns nothing when the cutOrder feature is off. A no-tool issue on a sheet with saved cuts tells
 * when the automatic cuts have fewer cuts that no tool can make.
 */
export function checkCuts(ctx: PlanContext, layout: readonly PlanIssue[], sheets: readonly SheetAnalysis[], steps: readonly Step[]): PlanIssue[] {
  if (!ctx.features.cutOrder) return [];
  const issues: PlanIssue[] = [];
  const reported = new Set<string>();
  for (const issue of layout) {
    if (issue.code !== "off-sheet" && issue.code !== "overlap") continue;
    for (const ref of issue.refs) if (ref.kind === "placement") reported.add(`${ref.sheet}#${ref.index}`);
  }

  for (const { sheet, index, tree, savedCuts } of sheets) {
    if (savedCuts === "stale") {
      issues.push(
        planWarning("saved-cuts-stale", `The saved cuts of sheet ${index + 1} no longer fit the layout. Run Optimize cuts again, or use the automatic cuts.`, [
          { kind: "sheet", sheet: sheet.id },
        ]),
      );
    }
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
    const canCut = treeToolCheck(ctx)!;
    const better = new Set(
      sheets
        .filter((s) => s.savedCuts === "used" && countNoTool(s.tree.root, ctx.kerf, canCut) > countNoTool(s.automatic.root, ctx.kerf, canCut))
        .map((s) => s.sheet.id),
    );
    for (const step of steps) {
      if (step.tool) continue;
      const hint = better.has(step.sheet) ? ` The automatic cuts of sheet ${step.sheetNumber} have fewer cuts that no tool can make. Use automatic cuts on the sheet to go back to them.` : "";
      issues.push(
        planError("no-tool", `No tool in your profile can make cut ${step.step} (a ${formatIn(ctx, step.to - step.from)} ${KIND_NOUN[step.kind]}).${hint}`, [
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
