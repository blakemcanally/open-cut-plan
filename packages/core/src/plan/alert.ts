import type { IssueSeverity } from "../format/issues.ts";
import { copyLabel, type PlanContext } from "./context.ts";
import type { PlanIssue } from "./issues.ts";

const LISTED = 5;

export interface PlanAlert {
  /** "error" when the plan has an error; "warning" when parts are only not placed. */
  severity: IssueSeverity;
  errors: number;
  /** The placed copies that an error points at, in issue order. */
  blocked: string[];
  /** The copies that are not on a sheet. */
  unplaced: string[];
  text: string;
}

/** The plan problems that make the cut steps incomplete: the errors and the copies that are not placed. Null when there are none. */
export function planAlert(ctx: PlanContext, issues: readonly PlanIssue[]): PlanAlert | null {
  const sheets = ctx.project.plan?.sheets ?? [];
  const blocked = new Set<string>();
  const unplaced = new Set<string>();
  let errors = 0;
  let other = 0;
  for (const issue of issues) {
    if (issue.code === "unplaced") {
      for (const ref of issue.refs) {
        if (ref.kind !== "part") continue;
        const part = ctx.parts.get(ref.part);
        if (part) unplaced.add(copyLabel(part, ref.copy));
      }
    }
    if (issue.severity !== "error") continue;
    errors++;
    let named = false;
    for (const ref of issue.refs) {
      if (ref.kind !== "placement") continue;
      const placement = sheets.find((sheet) => sheet.id === ref.sheet)?.placements[ref.index];
      const part = placement && ctx.parts.get(placement.part);
      if (!part) continue;
      blocked.add(copyLabel(part, placement.copy));
      named = true;
    }
    if (!named) other++;
  }
  if (errors === 0 && unplaced.size === 0) return null;

  const sentences = ["The plan is not ready to cut."];
  if (blocked.size > 0) sentences.push(`${count(blocked.size)} ${blocked.size === 1 ? "has" : "have"} a layout error: ${list([...blocked])}.`);
  if (unplaced.size > 0) sentences.push(`${count(unplaced.size)} ${unplaced.size === 1 ? "is" : "are"} not on a sheet: ${list([...unplaced])}.`);
  if (other > 0) {
    const noun = blocked.size + unplaced.size > 0 ? "other error" : "error";
    sentences.push(`The plan has ${other} ${other === 1 ? noun : `${noun}s`}.`);
  }
  return { severity: errors > 0 ? "error" : "warning", errors, blocked: [...blocked], unplaced: [...unplaced], text: sentences.join(" ") };
}

function count(n: number): string {
  return n === 1 ? "1 part" : `${n} parts`;
}

function list(names: readonly string[]): string {
  if (names.length > LISTED) return `${names.slice(0, LISTED).join(", ")}, and ${names.length - LISTED} more`;
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}
