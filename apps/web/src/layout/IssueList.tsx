import type { CopyRef, PlanIssue, Project } from "@opencutplan/core";

/** The first part copy an issue points at, if any. */
export function issueCopy(project: Project, issue: PlanIssue): CopyRef | null {
  for (const ref of issue.refs) {
    if (ref.kind === "part") return { part: ref.part, copy: ref.copy };
    if (ref.kind === "placement") {
      const placement = project.plan?.sheets.find((sheet) => sheet.id === ref.sheet)?.placements[ref.index];
      if (placement) return { part: placement.part, copy: placement.copy };
    }
  }
  return null;
}

interface IssueListProps {
  project: Project;
  issues: readonly PlanIssue[];
  onShow(ref: CopyRef): void;
}

export function IssueList({ project, issues, onShow }: IssueListProps) {
  const sorted = [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
  const errors = issues.filter((issue) => issue.severity === "error").length;
  return (
    <section aria-labelledby="issues-title">
      <h3 id="issues-title" tabIndex={-1}>
        Problems <span className="muted">({errors} {errors === 1 ? "error" : "errors"}, {issues.length - errors} {issues.length - errors === 1 ? "warning" : "warnings"})</span>
      </h3>
      {issues.length === 0 && <p className="ok">✔ The layout has no problems.</p>}
      <ul className="issues">
        {sorted.map((issue, index) => {
          const ref = issueCopy(project, issue);
          return (
            <li key={index} className={issue.severity}>
              <span aria-hidden="true">{issue.severity === "error" ? "✖ " : "⚠ "}</span>
              <span className="visually-hidden">{issue.severity === "error" ? "Error: " : "Warning: "}</span>
              {issue.message}
              {ref && (
                <button type="button" className="link" onClick={() => onShow(ref)}>
                  Show
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
