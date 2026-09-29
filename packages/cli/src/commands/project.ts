import { buildJsonSchema, createProject, errorMessage, newTool, parseProject, serializeProject, validatePlan, type Issue, type PlanIssue, type Units } from "@opencutplan/core";
import { PROGRAM } from "../help.ts";
import { FILE_ARG, issueText, loadProject, readSource, warningLines } from "../project.ts";
import { CliError, EXIT, usageError, type CommandSpec } from "../spec.ts";
import { planStats } from "../stats.ts";
import { money, percent, plural } from "../text.ts";
import { choiceValue, flag, str } from "../values.ts";

const UNITS: readonly Units[] = ["in", "mm"];

export const newCommand: CommandSpec = {
  name: "new",
  summary: "Create a project file.",
  description:
    "Create a project file with no parts, stock, or materials, and one table saw with the default kerf (1/8\" or 3 mm), as the app does. The new project uses the factory edges of each sheet (trim 0). The command refuses to replace a file that exists, unless you give --force.",
  args: [{ name: "file", description: "The file to create, or - to print the project to stdout." }],
  options: [
    { name: "name", type: "string", value: "<text>", required: true, description: "The project name." },
    { name: "units", type: "string", value: "<in|mm>", required: true, description: "The units of every length in the file: in (inches) or mm (millimetres)." },
    { name: "force", type: "boolean", description: "Replace the file when it exists." },
    { name: "dry-run", type: "boolean", description: "Report the project, but write nothing." },
  ],
  examples: [
    { command: `${PROGRAM} new shelf.cutplan.json --name "Living room shelf" --units in`, description: "Create an inch project." },
    { command: `${PROGRAM} new - --name Bookcase --units mm > bookcase.cutplan.json`, description: "Print a new millimetre project to stdout." },
  ],
  output: 'file (the path, or "-"), project (the new project document), written (the path written, "-" for stdout, or null), dryRun.',
  async run({ args, options, io }) {
    const file = args[0]!;
    const name = str(options, "name")!;
    if (name.trim() === "") throw usageError("--name must not be empty.", "invalid-value", { option: "name" });
    const units = choiceValue(str(options, "units")!, "units", UNITS);
    const project = { ...createProject(name, units), tools: [newTool("table-saw", units, new Set())] };
    const text = serializeProject(project);
    const dryRun = flag(options, "dry-run");
    if (file !== "-" && !flag(options, "force") && (await io.pathKind(file)) !== null) {
      throw usageError(`${file} exists. Give --force to replace it, or choose another path.`, "file-exists", { path: file });
    }
    let written: string | null = null;
    if (!dryRun && file !== "-") {
      try {
        await io.writeFile(file, text);
      } catch (error) {
        throw new CliError(EXIT.failed, "write-failed", `Cannot write ${file}: ${errorMessage(error)}`, { path: file });
      }
      written = file;
    }
    if (!dryRun && file === "-") written = "-";
    const summary = `${dryRun ? "Dry run: would create" : "Created"} ${file === "-" ? "a project" : file}: "${name}" (${units}).`;
    return {
      data: { file, project, written, dryRun },
      text: summary,
      ...(file === "-" && !dryRun ? { payload: text } : {}),
    };
  },
};

export const showCommand: CommandSpec = {
  name: "show",
  summary: "Summarize a project: counts, placed copies, issues, and totals.",
  description:
    "Print a summary of the project: its name and units, the counts of materials, stock, parts, tools, and plan sheets, how many part copies the plan places, the issue counts, and the totals from the shopping list.",
  args: [FILE_ARG],
  options: [],
  examples: [
    { command: `${PROGRAM} show shelf.cutplan.json`, description: "Summarize a project." },
    { command: `${PROGRAM} show shelf.cutplan.json --json`, description: "Get the summary as JSON." },
  ],
  output:
    "name, units, notes (or null), version, counts { materials, stock, parts, copies, tools, enabledTools, sheets, pinnedSheets, steps }, copies { total, placed, unplaced }, issues { errors, warnings }, totals { currency, cost (null when unknown), sheetsToBuy, missingPrices (stock ids), utilization (0-1) }.",
  async run({ args, io }) {
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const stats = planStats(project);
    const data = {
      name: project.project.name,
      units: project.project.units,
      notes: project.project.notes ?? null,
      version: project.version,
      counts: {
        materials: project.materials.length,
        stock: project.stock.length,
        parts: project.parts.length,
        copies: stats.copies,
        tools: project.tools.length,
        enabledTools: project.tools.filter((tool) => tool.enabled).length,
        sheets: stats.sheets,
        pinnedSheets: stats.pinnedSheets,
        steps: stats.steps,
      },
      copies: { total: stats.copies, placed: stats.placedCopies, unplaced: stats.unplacedCopies },
      issues: { errors: stats.errors, warnings: stats.warnings },
      totals: { currency: stats.currency, cost: stats.cost, sheetsToBuy: stats.sheetsToBuy, missingPrices: stats.missingPrices, utilization: stats.utilization },
    };
    const text = [
      `${project.project.name} (${project.project.units})`,
      `Parts: ${plural(project.parts.length, "part")} (${plural(stats.copies, "copy", "copies")}). Materials: ${project.materials.length}. Stock: ${project.stock.length}. Tools: ${project.tools.length} (${data.counts.enabledTools} enabled).`,
      `Plan: ${plural(stats.sheets, "sheet")} (${stats.pinnedSheets} pinned). ${stats.placedCopies} of ${stats.copies} copies placed. ${plural(stats.steps, "cut step")}.`,
      `Issues: ${plural(stats.errors, "error")}, ${plural(stats.warnings, "warning")}.`,
      `Totals: buy ${plural(stats.sheetsToBuy, "sheet")}, cost ${money(stats.cost, stats.currency)}${stats.missingPrices.length > 0 ? ` (no price: ${stats.missingPrices.join(", ")})` : ""}, parts use ${percent(stats.utilization)} of the stock.`,
    ].join("\n");
    return { data, text, warnings: warningLines(loaded) };
  },
};

function issueLine(issue: Issue | PlanIssue): string {
  const message = "path" in issue ? issueText(issue) : issue.message;
  return `${issue.severity} ${issue.code}: ${message}`;
}

export const validateCommand: CommandSpec = {
  name: "validate",
  summary: "Check the file format and the plan; exit 1 when there is an error.",
  description:
    "Check the project file. File issues come from the format checks (the JSON, the version, the schema, ids, and references). Plan issues come from the layout validator (off-sheet, overlap, grain, cut order, tools, unplaced copies). The command exits 1 when there is any error, and also for a warning with --strict. A file that the format checks refuse is reported here with exit 1, not 3; exit 3 is only for a file that cannot be read.",
  args: [FILE_ARG],
  options: [{ name: "strict", type: "boolean", description: "Treat warnings (such as unplaced copies) as errors." }],
  examples: [
    { command: `${PROGRAM} validate shelf.cutplan.json`, description: "Check a project." },
    { command: `${PROGRAM} validate shelf.cutplan.json --strict --json`, description: "Fail also on warnings, and get the issues as JSON." },
  ],
  output:
    "valid, errors, warnings (counts over both lists), fileIssues [{ severity, code, message, path }], planIssues [{ severity, code, message, refs }]. refs point at sheets, placements (sheet id and index), part copies, stock, or cut steps.",
  async run({ args, options, io }) {
    const source = args[0]!;
    const text = await readSource(io, source);
    const parsed = parseProject(text);
    const fileIssues: Issue[] = parsed.ok ? parsed.warnings : [...parsed.errors, ...parsed.warnings];
    const planIssues: PlanIssue[] = parsed.ok ? validatePlan(parsed.project) : [];
    const all = [...fileIssues, ...planIssues];
    const errors = all.filter((issue) => issue.severity === "error").length;
    const warnings = all.length - errors;
    const strict = flag(options, "strict");
    const valid = errors === 0 && (!strict || warnings === 0);
    const lines = all.map(issueLine);
    lines.push(
      valid
        ? `${source}: valid (${plural(warnings, "warning")}).`
        : `${source}: ${parsed.ok ? "" : "not a readable project, "}${plural(errors, "error")}, ${plural(warnings, "warning")}.`,
    );
    return {
      data: { valid, errors, warnings, fileIssues, planIssues },
      text: lines.join("\n"),
      ...(valid ? {} : { error: { code: "invalid", message: `${source} has ${plural(errors, "error")} and ${plural(warnings, "warning")}.` } }),
    };
  },
};

export const schemaCommand: CommandSpec = {
  name: "schema",
  summary: "Print the JSON Schema of the project file.",
  description: "Print the JSON Schema (draft 2020-12) of the .cutplan.json format. It is the same as schema/cutplan.schema.json in the repository.",
  args: [],
  options: [],
  examples: [{ command: `${PROGRAM} schema > cutplan.schema.json`, description: "Save the schema." }],
  output: "schema (the JSON Schema document). Without --json, stdout is the schema itself.",
  async run() {
    const schema = buildJsonSchema();
    return { data: { schema }, text: "", payload: `${JSON.stringify(schema, null, 2)}\n` };
  },
};
