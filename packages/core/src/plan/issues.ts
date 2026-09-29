import type { IssueSeverity } from "../format/issues.ts";

export type PlanIssueCode =
  | "off-sheet"
  | "overlap"
  | "wrong-material"
  | "grain"
  | "not-guillotine"
  | "no-tool"
  | "unplaced"
  | "stock-exceeded"
  | "bad-ref"
  | "bad-copy"
  | "duplicate-placement"
  | "design-too-small"
  | "design-too-large"
  | "design-conflict"
  | "pocket-thickness"
  | "pocket-chart"
  | "kallax-opening"
  | "kallax-depth"
  | "eket-grid"
  | "shelf-span"
  | "mount-system"
  | "design-stale"
  | "design-unknown-system"
  | "design-unknown-mount";

/** `placement.index` is the placement's index in `plan.sheets[].placements`; `cut.step` is a sequence step number. */
export type PlanRef =
  | { kind: "sheet"; sheet: string }
  | { kind: "placement"; sheet: string; index: number }
  | { kind: "part"; part: string; copy: number }
  | { kind: "stock"; stock: string }
  | { kind: "cut"; sheet: string; step: number }
  | { kind: "design"; design: string };

export interface PlanIssue {
  severity: IssueSeverity;
  code: PlanIssueCode;
  message: string;
  refs: PlanRef[];
}

export function planError(code: PlanIssueCode, message: string, refs: PlanRef[] = []): PlanIssue {
  return { severity: "error", code, message, refs };
}

export function planWarning(code: PlanIssueCode, message: string, refs: PlanRef[] = []): PlanIssue {
  return { severity: "warning", code, message, refs };
}
