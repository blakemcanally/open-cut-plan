import { analyzeProject, errorMessage, formatPath, parseProject, serializeProject, withCuts, type Issue, type PlanIssue, type Project } from "@opencutplan/core";
import { describeChanges, diffProjects, type Changes } from "./diff.ts";
import type { Io } from "./io.ts";
import { CliError, EXIT, type Invocation, type OptionSpec, type Outcome } from "./spec.ts";
import { plural } from "./text.ts";
import { flag, str } from "./values.ts";

export interface Loaded {
  source: string;
  text: string;
  project: Project;
  warnings: Issue[];
  hadCuts: boolean;
}

export const FILE_ARG = { name: "file", description: "The project file (.cutplan.json), or - to read it from standard input." };

export const OUTPUT_OPTIONS: OptionSpec[] = [
  { name: "out", type: "string", value: "<path|->", description: "Write the changed project to this path, or to stdout with -. Default: the input file (stdout when the input is -)." },
  { name: "dry-run", type: "boolean", description: "Do all the checks and report the changes, but write nothing." },
  { name: "strict", type: "boolean", description: "Write nothing and exit 1 when the changed project has errors." },
];

export async function readSource(io: Io, source: string, what = "file"): Promise<string> {
  if (source === "-") return io.readStdin();
  try {
    return await io.readFile(source);
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code === "ENOENT") throw new CliError(EXIT.input, "file-not-found", `The ${what} ${source} does not exist.`, { path: source });
    throw new CliError(EXIT.input, "read-failed", `Cannot read the ${what} ${source}: ${errorMessage(error)}`, { path: source });
  }
}

export function issueText(issue: Issue): string {
  return issue.path.length > 0 && !issue.message.startsWith(formatPath(issue.path)) ? `${formatPath(issue.path)}: ${issue.message}` : issue.message;
}

export async function loadProject(io: Io, source: string): Promise<Loaded> {
  const text = await readSource(io, source);
  const parsed = parseProject(text);
  const label = source === "-" ? "standard input" : source;
  if (!parsed.ok) {
    throw new CliError(EXIT.input, "unreadable-project", `${label} is not a readable OpenCutPlan project: ${parsed.errors.map(issueText).join("; ")}`, {
      issues: [...parsed.errors, ...parsed.warnings],
    });
  }
  const hadCuts = (parsed.project.plan?.sheets ?? []).some((sheet) => sheet.cuts !== undefined);
  return { source, text, project: parsed.project, warnings: parsed.warnings, hadCuts };
}

export function warningLines(loaded: Loaded): string[] {
  return loaded.warnings.map((issue) => `warning: ${issueText(issue)}`);
}

export interface Validation {
  errors: number;
  warnings: number;
  issues: PlanIssue[];
}

export function validation(project: Project): Validation {
  const issues = analyzeProject(project).issues;
  return {
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    issues,
  };
}

export interface MutationResult {
  changes: Changes;
  validation: Validation;
  written: string | null;
  dryRun: boolean;
}

export interface Mutation {
  /** One line that says what the command did, for example "Added part side (Side).". */
  summary: string;
  data: Record<string, unknown>;
  /** Extra lines for the readable output. */
  details?: string[];
  /** Makes `--strict` fail for a reason other than plan errors, for example unplaced copies after optimize. */
  strictFailure?: string;
  /** Print every plan error in the readable output. */
  showIssues?: boolean;
}

function target(invocation: Invocation, loaded: Loaded): string {
  return str(invocation.options, "out") ?? loaded.source;
}

/**
 * Checks the changed project, then writes it (or not, with --dry-run or a failed --strict). The file is refused when
 * core cannot read the result back, so the CLI never writes a file that the app would not open.
 */
export async function finishMutation(invocation: Invocation, loaded: Loaded, next: Project, mutation: Mutation): Promise<Outcome> {
  const { io, options } = invocation;
  const output = loaded.hadCuts ? withCuts(next) : next;
  const text = serializeProject(output);
  const reparsed = parseProject(text);
  if (!reparsed.ok) {
    throw new CliError(EXIT.failed, "invalid-result", `The change would make the file unreadable: ${reparsed.errors.map(issueText).join("; ")}`, {
      issues: reparsed.errors,
    });
  }
  const changes = diffProjects(loaded.project, next);
  const checked = validation(next);
  const dryRun = flag(options, "dry-run");
  const strict = flag(options, "strict");
  const strictFailure =
    !strict ? undefined : checked.errors > 0 ? `The changed project has ${checked.errors} ${checked.errors === 1 ? "error" : "errors"}.` : mutation.strictFailure;
  const destination = target(invocation, loaded);
  const toStdout = destination === "-";

  let written: string | null = null;
  if (!dryRun && strictFailure === undefined && !toStdout) {
    const unchanged = destination === loaded.source && text === loaded.text;
    if (!unchanged) {
      try {
        await io.writeFile(destination, text);
      } catch (error) {
        throw new CliError(EXIT.failed, "write-failed", `Cannot write ${destination}: ${errorMessage(error)}`, { path: destination });
      }
      written = destination;
    }
  }
  const sendsProject = !dryRun && strictFailure === undefined && toStdout;
  if (sendsProject) written = "-";

  const result: MutationResult = { changes, validation: checked, written, dryRun };
  const lines = [dryRun ? `Dry run: ${mutation.summary}` : mutation.summary, ...(mutation.details ?? []), ...(changes.changed ? describeChanges(changes) : [])];
  if (checked.errors > 0 || checked.warnings > 0) lines.push(`The project has ${plural(checked.errors, "error")} and ${plural(checked.warnings, "warning")}.`);
  if (mutation.showIssues) for (const issue of checked.issues.filter((i) => i.severity === "error")) lines.push(`  error ${issue.code}: ${issue.message}`);
  if (strictFailure !== undefined) lines.push(`Nothing was written (--strict).`);
  else if (dryRun) lines.push("Nothing was written (--dry-run).");
  else if (written !== null && written !== "-") lines.push(`Wrote ${written}.`);
  else if (written === null) lines.push("The file did not change.");

  const outcome: Outcome = {
    data: { ...mutation.data, ...result, ...(sendsProject ? { project: output } : {}) },
    text: lines.join("\n"),
    warnings: warningLines(loaded),
  };
  if (sendsProject) outcome.payload = text;
  if (strictFailure !== undefined) outcome.error = { code: "strict", message: strictFailure };
  return outcome;
}

export async function writeOutput(io: Io, path: string, text: string): Promise<void> {
  try {
    await io.writeFile(path, text);
  } catch (error) {
    throw new CliError(EXIT.failed, "write-failed", `Cannot write ${path}: ${errorMessage(error)}`, { path });
  }
}
