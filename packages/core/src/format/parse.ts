import { errorIssue, warningIssue, type Issue, type IssuePath } from "./issues.ts";
import { checkReferences } from "./references.ts";
import { FORMAT_ID, ProjectSchema, type Project } from "./schema.ts";
import { migrate, parseVersion, SUPPORTED_MAJOR, SUPPORTED_MINOR } from "./version.ts";

export type ParseResult =
  | { ok: true; project: Project; warnings: Issue[] }
  | { ok: false; errors: Issue[]; warnings: Issue[] };

export function parseProject(input: unknown): ParseResult {
  const warnings: Issue[] = [];
  const fail = (...errors: Issue[]): ParseResult => ({ ok: false, errors, warnings });

  let doc = input;
  if (typeof input === "string") {
    try {
      doc = JSON.parse(input.replace(/^\uFEFF/, ""));
    } catch (e) {
      return fail(errorIssue("json", `The file is not valid JSON: ${(e as Error).message}`));
    }
  }
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    return fail(errorIssue("format", "The file does not contain a JSON object."));
  }
  const record = doc as Record<string, unknown>;

  if (record.format !== FORMAT_ID) {
    return fail(errorIssue("format", `This is not an OpenCutPlan file (format is ${JSON.stringify(record.format ?? null)}).`, ["format"]));
  }
  const version = parseVersion(record.version);
  if (!version) {
    return fail(errorIssue("version", `The version ${JSON.stringify(record.version ?? null)} is not in MAJOR.MINOR form.`, ["version"]));
  }
  const versionText = `${version.major}.${version.minor}`;
  if (version.major !== SUPPORTED_MAJOR) {
    return fail(
      errorIssue("version", `This file uses format version ${versionText}. This app reads version ${SUPPORTED_MAJOR}.x files.`, ["version"]),
    );
  }
  if (version.minor > SUPPORTED_MINOR) {
    warnings.push(
      warningIssue(
        "newer-minor",
        `This file uses format version ${versionText}, which is newer than this app (${SUPPORTED_MAJOR}.${SUPPORTED_MINOR}). Unknown fields are kept but ignored.`,
        ["version"],
      ),
    );
  }

  const parsed = ProjectSchema.safeParse(migrate(record));
  if (!parsed.success) {
    return fail(
      ...parsed.error.issues.map((issue) => {
        const path = issue.path.map((key) => (typeof key === "symbol" ? key.toString() : key));
        return errorIssue("schema", `${formatPath(path)}: ${issue.message}`, path);
      }),
    );
  }

  const references = checkReferences(parsed.data);
  warnings.push(...references.filter((issue) => issue.severity === "warning"));
  const referenceErrors = references.filter((issue) => issue.severity === "error");
  if (referenceErrors.length > 0) return fail(...referenceErrors);

  return { ok: true, project: parsed.data, warnings };
}

export function formatPath(path: IssuePath): string {
  const text = path.reduce<string>(
    (out, key) => (typeof key === "number" ? `${out}[${key}]` : `${out}${out === "" ? "" : "."}${key}`),
    "",
  );
  return text === "" ? "(root)" : text;
}
