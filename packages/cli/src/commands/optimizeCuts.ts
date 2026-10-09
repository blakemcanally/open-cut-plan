import { clearSavedCuts, optimizeCuts, regenerateDesigns, type OptimizeCutsOptions, type Project, type SheetCutsResult } from "@opencutplan/core";
import { PROGRAM } from "../help.ts";
import { FILE_ARG, finishMutation, loadProject, OUTPUT_OPTIONS } from "../project.ts";
import { usageError, type CommandSpec } from "../spec.ts";
import { len, plural } from "../text.ts";
import { flag, integerValue, numberValue, str } from "../values.ts";
import { findSheet, SHEET_REF } from "./layout.ts";

function sheetLine(project: Project, sheet: SheetCutsResult): string {
  const { before, after } = sheet;
  const name = `Sheet ${sheet.number} (${sheet.sheet})`;
  if (!sheet.lines) return `${name}: ${plural(before.cuts, "cut")}, ${len(project, before.length)} of cuts. No tree with fewer cuts was found.`;
  return `${name}: ${before.cuts} → ${after.cuts} cuts, ${len(project, before.length)} → ${len(project, after.length)} of cuts.`;
}

export const optimizeCutsCommand: CommandSpec = {
  name: "optimize-cuts",
  summary: "Find a cut tree with fewer cuts for each sheet, keep every part where it is, and save the new cuts.",
  description:
    "Search the cut tree of each sheet again and keep every placement. The search puts the fewest cuts first, then the shortest total cut length. It runs in passes: each pass lets one piece hold more runs of parts, and the search stops when a pass can join every run, at --passes, or at the time limit of the sheet. A sheet gets the new tree, as savedCuts in the file, only when it has fewer cuts than the tree it uses now. A sheet with no parts, with parts that no cut order frees, or with a locked saved cut is not searched. A layout change to a sheet (layout move, a part removal, optimize) removes its saved cuts. --clear removes the saved cuts, so that the sheets use the automatic tree again. A run with --passes gives the same result on every computer.",
  args: [FILE_ARG],
  options: [
    { name: "sheet", type: "string", value: "<ref>", description: `Search only this sheet: ${SHEET_REF}.` },
    { name: "time", type: "string", value: "<seconds>", description: "The search time for each sheet. Default: the optimizer.timeLimitMs setting (2 s). Ignored with --passes." },
    { name: "passes", type: "string", value: "<n>", description: "Stop each sheet after pass n and ignore the time. The result then depends only on the project." },
    { name: "clear", type: "boolean", description: "Remove the saved cuts, of one sheet with --sheet, and use the automatic cuts again." },
    ...OUTPUT_OPTIONS,
  ],
  examples: [
    { command: `${PROGRAM} optimize-cuts shelf.cutplan.json --passes 4`, description: "Find fewer cuts on each sheet, the same result every time." },
    { command: `${PROGRAM} optimize-cuts shelf.cutplan.json --sheet 2 --time 10`, description: "Search sheet 2 for 10 seconds." },
    { command: `${PROGRAM} optimize-cuts shelf.cutplan.json --clear`, description: "Go back to the automatic cuts on every sheet." },
  ],
  output:
    "cleared (true with --clear), timeLimitMs (null with --passes or --clear), passes (the --passes limit, or null), deterministic, sheets [{ number, id, before { cuts, length }, after { cuts, length }, saved (true when the sheet got new cuts), passes, complete (true when no longer search can find a better tree) }] (empty with --clear), changes, validation, written, dryRun. The cut counts and lengths include the trim cuts.",
  async run(invocation) {
    const { args, options, io } = invocation;
    const clear = flag(options, "clear");
    if (clear && (str(options, "time") !== undefined || str(options, "passes") !== undefined)) throw usageError("Give --clear without --time or --passes.", "conflict");
    const loaded = await loadProject(io, args[0]!);
    const project = regenerateDesigns(loaded.project);
    const ref = str(options, "sheet");
    const target = ref === undefined ? undefined : findSheet(project, ref);
    if (clear) {
      const next = clearSavedCuts(project, target?.sheet.id);
      return finishMutation(invocation, loaded, next, {
        summary: target ? `Removed the saved cuts of sheet ${target.number}.` : "Removed the saved cuts of every sheet.",
        details: [next === project ? "No sheet had saved cuts." : "The sheets use the automatic cuts."],
        data: { cleared: true, timeLimitMs: null, passes: null, deterministic: true, sheets: [] },
      });
    }
    const opts: OptimizeCutsOptions = {};
    if (target) opts.sheet = target.sheet.id;
    const time = str(options, "time");
    if (time !== undefined) {
      const seconds = numberValue(time, "time");
      if (seconds <= 0) throw usageError("--time must be greater than 0.", "invalid-value", { option: "time" });
      opts.timeLimitMs = Math.max(1, Math.round(seconds * 1000));
    }
    const passesText = str(options, "passes");
    if (passesText !== undefined) opts.passes = integerValue(passesText, "passes", 1);
    const { project: next, result } = optimizeCuts(project, opts);
    const deterministic = opts.passes !== undefined;
    const saved = result.sheets.filter((sheet) => sheet.lines).length;
    const details = [
      ...(result.sheets.length === 0 ? ["No sheet has parts to search."] : result.sheets.map((sheet) => sheetLine(project, sheet))),
      ...(deterministic || result.sheets.length === 0 ? [] : ["A timed run; use --passes for the same result every time."]),
    ];
    return finishMutation(invocation, loaded, next, {
      summary: saved === 0 ? "The cuts are already the best found." : `Saved fewer cuts on ${plural(saved, "sheet")}.`,
      details,
      data: {
        cleared: false,
        timeLimitMs: deterministic ? null : (opts.timeLimitMs ?? project.settings.optimizer.timeLimitMs),
        passes: opts.passes ?? null,
        deterministic,
        sheets: result.sheets.map((sheet) => ({ number: sheet.number, id: sheet.sheet, before: sheet.before, after: sheet.after, saved: sheet.lines !== null, passes: sheet.passes, complete: sheet.complete })),
      },
    });
  },
};
