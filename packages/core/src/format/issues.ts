export type IssueSeverity = "error" | "warning";

export type IssueCode =
  | "json"
  | "format"
  | "version"
  | "newer-minor"
  | "schema"
  | "duplicate-id"
  | "bad-ref"
  | "bad-copy"
  | "duplicate-placement"
  | "design-missing";

export type IssuePath = readonly (string | number)[];

export interface Issue {
  severity: IssueSeverity;
  code: IssueCode;
  message: string;
  path: IssuePath;
}

export function errorIssue(code: IssueCode, message: string, path: IssuePath = []): Issue {
  return { severity: "error", code, message, path };
}

export function warningIssue(code: IssueCode, message: string, path: IssuePath = []): Issue {
  return { severity: "warning", code, message, path };
}
