import { join } from "node:path";
import { analyzeProject, fileBase, partColors, serializeProject, sheetSvg, withCuts, type CutColoring } from "@opencutplan/core";
import { PROGRAM } from "../help.ts";
import { FILE_ARG, loadProject, warningLines, writeOutput } from "../project.ts";
import { CliError, EXIT, usageError, type CommandSpec, type GroupSpec } from "../spec.ts";
import { flag, optionalChoice, str } from "../values.ts";
import { EXPORT_OUT, exportCsv } from "./csv.ts";
import { findSheet } from "./layout.ts";

const CUT_COLORINGS: readonly CutColoring[] = ["stage", "tool"];

const svg: CommandSpec = {
  name: "export svg",
  summary: "Draw sheets as SVG files.",
  description:
    "Draw each plan sheet as an SVG file, the same drawing as the app's Download SVG: the parts in their group colours, the trim, and the cut lines with their step numbers. When --out is a directory (an existing directory, or a new path that does not end in .svg), each sheet goes to <name>-sheet-N.svg in it, where <name> comes from the project name. With --sheet, --out can be a file, and the default is standard output.",
  args: [FILE_ARG],
  options: [
    { name: "sheet", type: "string", value: "<ref>", description: "Draw only this sheet: a sheet id, or its 1-based number in the plan." },
    { name: "out", type: "string", value: "<path|dir|->", description: "The target: a directory for one file per sheet, a file (with --sheet), or - for standard output (with --sheet). Required without --sheet." },
    { name: "no-cuts", type: "boolean", description: "Leave out the cut lines." },
    { name: "cut-colors", type: "string", value: "<stage|tool>", description: "Colour each cut line and its number by its stage or by its tool, as the Colour cuts by choice on the app's Layout tab. Default: stage." },
  ],
  examples: [
    { command: `${PROGRAM} export svg shelf.cutplan.json --out svg/`, description: "Write one SVG file per sheet into svg/." },
    { command: `${PROGRAM} export svg shelf.cutplan.json --sheet 2 > sheet-2.svg`, description: "Print sheet 2." },
    { command: `${PROGRAM} export svg shelf.cutplan.json --out svg/ --cut-colors tool`, description: "Colour the cuts by tool." },
  ],
  output: "files [{ sheet, sheetNumber, path }] when written to files; svg, sheet, sheetNumber on standard output.",
  async run({ args, options, io }) {
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const warnings = warningLines(loaded);
    const analysis = analyzeProject(project);
    const ref = str(options, "sheet");
    const chosen = ref === undefined ? null : findSheet(project, ref);
    const out = str(options, "out") ?? (chosen ? "-" : undefined);
    if (out === undefined) throw usageError("Give --out <dir>, or --sheet to choose one sheet.", "missing-option", { option: "out" });
    const sheets = analysis.sheets.filter((sheet) => chosen === null || sheet.sheet.id === chosen.sheet.id);
    if (chosen && sheets.length === 0) throw new CliError(EXIT.failed, "missing-stock", `Sheet ${chosen.number} uses the unknown stock ${chosen.sheet.stock}, so it cannot be drawn.`, { sheet: chosen.sheet.id });
    if (sheets.length === 0) throw new CliError(EXIT.failed, "no-sheets", "The plan has no sheets to draw. Run optimize first.");
    const colors = partColors(project);
    const cutColors = optionalChoice(options, "cut-colors", CUT_COLORINGS) ?? "stage";
    const draw = (sheet: (typeof sheets)[number]) => sheetSvg(analysis.context, sheet, analysis.steps, { colors, cutColors, showCuts: !flag(options, "no-cuts") });
    if (out === "-") {
      if (sheets.length > 1) throw usageError("--out - needs --sheet: standard output takes one sheet.", "invalid-option", { option: "out" });
      const text = draw(sheets[0]!);
      return { data: { svg: text, sheet: sheets[0]!.sheet.id, sheetNumber: sheets[0]!.index + 1 }, text: "", payload: text, warnings };
    }
    const kind = await io.pathKind(out);
    const directory = kind === "directory" || (kind === null && !out.toLowerCase().endsWith(".svg"));
    if (!directory && sheets.length > 1) throw usageError(`--out ${out} is not a directory. Give a directory for more than one sheet, or choose one with --sheet.`, "invalid-option", { option: "out" });
    if (directory && kind === null) await io.mkdir(out);
    const base = fileBase(project.project.name);
    const files = [];
    for (const sheet of sheets) {
      const path = directory ? join(out, `${base}-sheet-${sheet.index + 1}.svg`) : out;
      await writeOutput(io, path, draw(sheet));
      files.push({ sheet: sheet.sheet.id, sheetNumber: sheet.index + 1, path });
    }
    return { data: { files }, text: files.map((f) => `Wrote ${f.path}`).join("\n"), warnings };
  },
};

const partsCsv: CommandSpec = {
  name: "export parts-csv",
  summary: "Write the parts as CSV.",
  description: "Write the parts as CSV, the same file as the app's Export parts CSV. The same as parts export.",
  args: [FILE_ARG],
  options: [EXPORT_OUT],
  examples: [{ command: `${PROGRAM} export parts-csv shelf.cutplan.json --out parts.csv`, description: "Write parts.csv." }],
  output: "path and rows when --out is a file; csv and rows when the CSV goes to standard output.",
  run: (invocation) => exportCsv(invocation, "parts"),
};

const stockCsv: CommandSpec = {
  name: "export stock-csv",
  summary: "Write the stock as CSV.",
  description: "Write the stock as CSV, the same file as the app's Export stock CSV. The same as stock export.",
  args: [FILE_ARG],
  options: [EXPORT_OUT],
  examples: [{ command: `${PROGRAM} export stock-csv shelf.cutplan.json --out stock.csv`, description: "Write stock.csv." }],
  output: "path and rows when --out is a file; csv and rows when the CSV goes to standard output.",
  run: (invocation) => exportCsv(invocation, "stock"),
};

const plan: CommandSpec = {
  name: "export plan",
  summary: "Write the project with the stored cut list (the cuts of each plan sheet).",
  description:
    "Write the project file with the cut list stored in it: plan.sheets[].cuts, the cut steps of each sheet in the file format, for tools that read the cuts and do not compute them. The rest of the project does not change. With --plan-only, write only the plan object. The default target is standard output. The source file does not change unless --out names it.",
  args: [FILE_ARG],
  options: [EXPORT_OUT, { name: "plan-only", type: "boolean", description: "Write only the plan object { sheets [{ id, stock, placements, cuts }] } as JSON." }],
  examples: [
    { command: `${PROGRAM} export plan shelf.cutplan.json --out shelf-with-cuts.cutplan.json`, description: "Write a copy of the project with the cuts." },
    { command: `${PROGRAM} export plan shelf.cutplan.json --plan-only --json`, description: "Print the plan and its cuts in the JSON result." },
  ],
  output: "cuts (the count of all sheets), sheets (the count), path when --out is a file; project (or plan with --plan-only) on standard output.",
  async run({ args, options, io }) {
    const loaded = await loadProject(io, args[0]!);
    const warnings = warningLines(loaded);
    const project = withCuts(loaded.project);
    const planOnly = flag(options, "plan-only");
    const cuts = (project.plan?.sheets ?? []).reduce((sum, sheet) => sum + (sheet.cuts?.length ?? 0), 0);
    const sheets = project.plan?.sheets.length ?? 0;
    const text = planOnly ? `${JSON.stringify(project.plan ?? { sheets: [] }, null, 2)}\n` : serializeProject(project);
    const out = str(options, "out") ?? "-";
    if (out === "-") return { data: { cuts, sheets, ...(planOnly ? { plan: project.plan ?? { sheets: [] } } : { project }) }, text: "", payload: text, warnings };
    await writeOutput(io, out, text);
    return { data: { cuts, sheets, path: out }, text: `Wrote ${out} (${sheets} sheets, ${cuts} cuts).`, warnings };
  },
};

export const exportGroup: GroupSpec = { name: "export", summary: "Files for other tools", commands: [svg, partsCsv, stockCsv, plan] };
