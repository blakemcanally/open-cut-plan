import {
  analyzeProject,
  cutOrderLimits,
  cutStops,
  extendCut,
  isCutLocked,
  joinCut,
  moveCut,
  removeCut,
  sameLine,
  sequencePlan,
  setCutLocked,
  sheetCuts,
  shortenCut,
  shortenStops,
  type CutEnd,
  type CutLine,
  type CutStop,
  type Project,
  type Step,
} from "@opencutplan/core";
import { PROGRAM } from "../help.ts";
import { FILE_ARG, finishMutation, loadProject, OUTPUT_OPTIONS, warningLines } from "../project.ts";
import { CliError, EXIT, usageError, type CommandSpec, type GroupSpec, type OptionSpec, type OptionValues } from "../spec.ts";
import { len, plural, table } from "../text.ts";
import { choiceValue, integerValue, lengthValue, str } from "../values.ts";
import { findSheet, SHEET_REF } from "./layout.ts";

const SHEET: OptionSpec = { name: "sheet", type: "string", value: "<ref>", required: true, description: `The sheet: ${SHEET_REF}.` };
const STEP: OptionSpec = { name: "step", type: "string", value: "<n>", required: true, description: "The step number of the cut, as in cuts show and report sequence." };
const END: OptionSpec = {
  name: "end",
  type: "string",
  value: "<from|to>",
  required: true,
  description: "The end of the cut: from (the left end of a rip, the top end of a crosscut) or to (the right end, the bottom end).",
};

const line = ({ axis, at, from, to }: Pick<Step, "axis" | "at" | "from" | "to">) => ({ axis, at, from, to });

function sheetSteps(project: Project, sheetId: string): Step[] {
  return sequencePlan(project).filter((step) => step.sheet === sheetId);
}

/** The sheet and the cut of `--sheet` and `--step`; a trim or a sheet whose cuts cannot change fails. */
function findCut(project: Project, options: OptionValues): { sheetId: string; number: number; step: Step } {
  const { sheet, number } = findSheet(project, str(options, "sheet")!);
  if (!project.settings.features.cutOrder) throw usageError("The cutOrder feature is off, so the plan has no cuts. Turn it on with settings features.", "feature-off", { feature: "cutOrder" });
  if (!sheetCuts(project, sheet.id)) throw usageError(`Sheet ${number} has no cuts to change: it has no parts, or parts that no cut order frees.`, "no-cuts", { sheet: sheet.id });
  const steps = sheetSteps(project, sheet.id);
  const stepNumber = integerValue(str(options, "step")!, "step", 1);
  const step = steps.find((s) => s.step === stepNumber);
  if (!step) throw usageError(`Sheet ${number} has no step ${stepNumber}. Its steps are ${steps.map((s) => s.step).join(", ")}.`, "not-found", { step: stepNumber });
  if (step.kind === "trim") throw usageError(`Step ${stepNumber} is a trim cut. The trim setting gives the trim cuts.`, "trim", { step: stepNumber });
  return { sheetId: sheet.id, number, step };
}

function notLocked(project: Project, sheetId: string, step: Step): void {
  if (isCutLocked(project, sheetId, step)) throw new CliError(EXIT.usage, "locked", `Step ${step.step} is locked, so it cannot change. Unlock it with cuts unlock.`, { step: step.step });
}

function stopText(project: Project, stop: CutStop): string {
  const extras = [stop.across !== undefined ? `across ${len(project, stop.across)}` : null, stop.joins > 0 ? `joins ${stop.joins}` : null, `${stop.cuts} cuts`, stop.noTool ? "no tool" : null];
  return `${len(project, stop.end)} (${extras.filter(Boolean).join(", ")})`;
}

function stopsData(project: Project, sheetId: string, step: Step) {
  const ends = (end: CutEnd) => ({ extend: cutStops(project, sheetId, step, end), shorten: shortenStops(project, sheetId, step, end) });
  return { from: ends("from"), to: ends("to") };
}

function noStop(project: Project, what: string, stops: readonly CutStop[], value: string): CliError {
  const known = stops.length === 0 ? "This end has no stops." : `The stops are ${stops.map((stop) => len(project, stop.across ?? stop.end)).join(", ")}.`;
  return new CliError(EXIT.usage, "no-stop", `${what} has no stop at ${value}. ${known}`, { stops });
}

function changed(project: Project, sheetId: string, sheetNumber: number) {
  const steps = sheetSteps(project, sheetId);
  return { details: [`Sheet ${sheetNumber} has ${plural(steps.length, "cut")} and saved cuts.`], cuts: steps.length };
}

const show: CommandSpec = {
  name: "cuts show",
  summary: "List the cuts of a sheet and the stops of each cut.",
  description:
    "List the cuts of one sheet in the shop order, with the stops of each end. A stop is a place where the end of a cut can go and the cuts still free every part: extend stops move the end out, and shorten stops move it in to a cut that then goes across. Each stop tells the cut count of the sheet after the edit, the cuts on the same line that it joins, and whether it gives a cut that no tool can make. Trim cuts have no stops.",
  args: [FILE_ARG],
  options: [SHEET],
  examples: [{ command: `${PROGRAM} cuts show shelf.cutplan.json --sheet 1`, description: "List the cuts and stops of sheet 1." }],
  output:
    "sheet, number, cuts (\"saved\" or \"automatic\"), steps [{ step, kind, stage, axis, at, from, to, length, tool, locked, stops (null for a trim) { from { extend [stop], shorten [stop] }, to { … } } }]; a stop is { end, length, cuts, joins, noTool, across (shorten only) }.",
  async run({ args, options, io }) {
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const { sheet, number } = findSheet(project, str(options, "sheet")!);
    const analysis = analyzeProject(project).sheets.find((s) => s.sheet.id === sheet.id);
    const editable = sheetCuts(project, sheet.id) !== null;
    const steps = sheetSteps(project, sheet.id).map((step) => ({
      step: step.step,
      kind: step.kind,
      stage: step.stage,
      ...line(step),
      length: step.to - step.from,
      tool: step.tool?.id ?? null,
      locked: step.kind !== "trim" && editable && isCutLocked(project, sheet.id, step),
      stops: step.kind === "trim" || !editable ? null : stopsData(project, sheet.id, step),
    }));
    const state = analysis?.savedCuts === "used" ? "saved" : "automatic";
    const lines = [`Sheet ${number} (${sheet.id}): ${plural(steps.length, "cut")}, ${state} cuts.`];
    if (steps.length > 0) {
      const rows = steps.map((step) => [
        String(step.step),
        step.locked ? `${step.kind}, locked` : step.kind,
        String(step.stage),
        len(project, step.at),
        `${len(project, step.from)} to ${len(project, step.to)}`,
        len(project, step.length),
        ...(["from", "to"] as const).map((end) => {
          if (!step.stops) return "";
          const { extend, shorten } = step.stops[end];
          return [...extend.map((stop) => `+${stopText(project, stop)}`), ...shorten.map((stop) => `-${stopText(project, stop)}`)].join("; ");
        }),
      ]);
      lines.push(table(["step", "kind", "stage", "at", "extent", "length", "from stops", "to stops"], rows));
      lines.push("A + stop extends the end, and a - stop shortens it.");
    }
    return { data: { sheet: sheet.id, number, cuts: state, steps }, text: lines.join("\n"), warnings: warningLines(loaded) };
  },
};

function lengthOrWord(project: Project, text: string, name: string): number | "next" | "max" {
  if (text === "next" || text === "max") return text;
  return lengthValue(text, project.project.units, name);
}

const extend: CommandSpec = {
  name: "cuts extend",
  summary: "Make a cut longer, up to a stop.",
  description:
    "Move one end of a cut out to a stop (see cuts show). The cuts on the same line inside the new extent join the cut, and each cross cut that it goes through splits in two; a split piece that cuts only waste goes. The first change to the cuts of a sheet saves its cuts in the file, so that a layout change to the sheet removes them. The cut keeps its tool choice while that tool can make it.",
  args: [FILE_ARG],
  options: [SHEET, STEP, END, { name: "to", type: "string", value: "<length|next|max>", required: true, description: "The new end: a stop, next (the nearest stop), or max (the farthest stop)." }, ...OUTPUT_OPTIONS],
  examples: [
    { command: `${PROGRAM} cuts extend shelf.cutplan.json --sheet 1 --step 6 --end to --to max`, description: "Extend the end of step 6 to the farthest stop." },
    { command: `${PROGRAM} cuts extend shelf.cutplan.json --sheet 1 --step 6 --end to --to 60.25`, description: "Extend the end of step 6 to 60 1/4\"." },
  ],
  output: "sheet, step, end, cut { axis, at, from, to } (after the edit), cuts (the cut count of the sheet after the edit), changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, options, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const { sheetId, number, step } = findCut(project, options);
    notLocked(project, sheetId, step);
    const end = choiceValue(str(options, "end")!, "end", ["from", "to"] as const);
    const stops = cutStops(project, sheetId, step, end);
    const wanted = lengthOrWord(project, str(options, "to")!, "to");
    const stop = wanted === "next" ? stops[0] : wanted === "max" ? stops.at(-1) : stops.find((s) => Math.abs(s.end - wanted) <= 1e-6);
    if (!stop) throw noStop(project, `The ${end} end of step ${step.step}`, stops, str(options, "to")!);
    const next = extendCut(project, sheetId, step, end, stop.end)!;
    const cut = { ...line(step), [end]: stop.end };
    const { details, cuts } = changed(next, sheetId, number);
    return finishMutation(invocation, loaded, next, {
      summary: `Extended step ${step.step} to ${len(project, stop.end)}${stop.joins > 0 ? `, joining ${plural(stop.joins, "cut")}` : ""}.`,
      details,
      data: { sheet: sheetId, step: step.step, end, cut, cuts },
    });
  },
};

const shorten: CommandSpec = {
  name: "cuts shorten",
  summary: "Make a cut shorter: a cross cut goes through it first.",
  description:
    "Move one end of a cut in to a cross cut that ends at it. The edit extends that cross cut through the cut, so that the cut splits in two there. --to is the position of the cross cut (see the shorten stops of cuts show), or next for the one nearest to the end.",
  args: [FILE_ARG],
  options: [SHEET, STEP, END, { name: "to", type: "string", value: "<position|next>", required: true, description: "The position of the cross cut that goes through, or next." }, ...OUTPUT_OPTIONS],
  examples: [{ command: `${PROGRAM} cuts shorten shelf.cutplan.json --sheet 1 --step 1 --end to --to next`, description: "Shorten the end of step 1 at the nearest cross cut." }],
  output: "sheet, step, end, cut { axis, at, from, to } (the part of the cut at the other end), across, cuts, changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, options, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const { sheetId, number, step } = findCut(project, options);
    notLocked(project, sheetId, step);
    const end = choiceValue(str(options, "end")!, "end", ["from", "to"] as const);
    const stops = shortenStops(project, sheetId, step, end);
    const wanted = lengthOrWord(project, str(options, "to")!, "to");
    const stop = wanted === "next" ? stops[0] : wanted === "max" ? stops.at(-1) : stops.find((s) => Math.abs(s.across! - wanted) <= 1e-6);
    if (!stop) throw noStop(project, `The ${end} end of step ${step.step}`, stops, str(options, "to")!);
    const next = shortenCut(project, sheetId, step, end, stop.across!)!;
    const { details, cuts } = changed(next, sheetId, number);
    return finishMutation(invocation, loaded, next, {
      summary: `Shortened step ${step.step} to ${len(project, stop.end)}, at the cut at ${len(project, stop.across!)}.`,
      details,
      data: { sheet: sheetId, step: step.step, end, cut: { ...line(step), [end]: stop.end }, across: stop.across, cuts },
    });
  },
};

const join: CommandSpec = {
  name: "cuts join",
  summary: "Join a cut with the cuts on the same line.",
  description:
    "Extend each end of the cut to the stop that joins the most cuts on the same line, then gives the fewest cuts, as Join in the web app does. It fails with no-join when no stop joins a cut.",
  args: [FILE_ARG],
  options: [SHEET, STEP, ...OUTPUT_OPTIONS],
  examples: [{ command: `${PROGRAM} cuts join shelf.cutplan.json --sheet 1 --step 5`, description: "Join step 5 with the cuts on its line." }],
  output: "sheet, step, joins, cut { axis, at, from, to } (after the edit), cuts, changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, options, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const { sheetId, number, step } = findCut(project, options);
    notLocked(project, sheetId, step);
    const result = joinCut(project, sheetId, step);
    if (!result) throw new CliError(EXIT.usage, "no-join", `Step ${step.step} has no cuts on the same line that it can join.`);
    const { details, cuts } = changed(result.project, sheetId, number);
    return finishMutation(invocation, loaded, result.project, {
      summary: `Joined ${plural(result.joins, "cut")} into step ${step.step}.`,
      details,
      data: { sheet: sheetId, step: step.step, joins: result.joins, cut: line(result.line), cuts },
    });
  },
};

const remove: CommandSpec = {
  name: "cuts remove",
  summary: "Remove a cut that the parts do not need, such as a cut through waste.",
  description: "Remove one cut. It fails with not-removable when the cuts then do not free every part.",
  args: [FILE_ARG],
  options: [SHEET, STEP, ...OUTPUT_OPTIONS],
  examples: [{ command: `${PROGRAM} cuts remove shelf.cutplan.json --sheet 1 --step 9`, description: "Remove step 9." }],
  output: "sheet, step, cut { axis, at, from, to } (the removed cut), cuts, changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, options, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const { sheetId, number, step } = findCut(project, options);
    notLocked(project, sheetId, step);
    const next = removeCut(project, sheetId, step);
    if (!next) throw new CliError(EXIT.usage, "not-removable", `Step ${step.step} is needed: without it, the cuts do not free every part.`);
    const { details, cuts } = changed(next, sheetId, number);
    return finishMutation(invocation, loaded, next, { summary: `Removed step ${step.step}.`, details, data: { sheet: sheetId, step: step.step, cut: line(step), cuts } });
  },
};

const move: CommandSpec = {
  name: "cuts move",
  summary: "Move a cut to another place in the cut order of its sheet.",
  description:
    "Move one cut just before or just after another cut of the same sheet. A cut can move only after the cut that makes its piece and before the first cut inside that piece; a move past these limits fails with order-limit, and the error tells the limits. The trims always come first. The first move on a sheet with automatic cuts saves its cuts in the file. The shop order follows the new order when orderMode is sheet. With orderMode setup, the shop order groups the setups and does not use the saved order.",
  args: [FILE_ARG],
  options: [
    SHEET,
    STEP,
    { name: "before", type: "string", value: "<m>", description: "Put the cut just before step m." },
    { name: "after", type: "string", value: "<m>", description: "Put the cut just after step m." },
    ...OUTPUT_OPTIONS,
  ],
  examples: [{ command: `${PROGRAM} cuts move shelf.cutplan.json --sheet 1 --step 5 --after 1`, description: "Make step 5 the cut just after step 1." }],
  output: "sheet, step (the step number before the move), to (the step number after the move), cut { axis, at, from, to }, changes, validation, written, dryRun. An order-limit error has after and before: the step numbers of the limits, or null.",
  async run(invocation) {
    const { args, options, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const { sheetId, number, step } = findCut(project, options);
    const before = str(options, "before");
    const after = str(options, "after");
    if ((before === undefined) === (after === undefined)) throw usageError("Give --before or --after, not both.", before === undefined ? "missing-option" : "conflict", { option: "before" });
    const targetNumber = integerValue((before ?? after)!, before !== undefined ? "before" : "after", 1);
    const steps = sheetSteps(project, sheetId);
    const target = steps.find((s) => s.step === targetNumber);
    if (!target || target.kind === "trim") throw usageError(`Sheet ${number} has no cut at step ${targetNumber} to move next to. The trims always come first.`, "not-found", { step: targetNumber });
    if (target.step === step.step) throw usageError(`Give a step other than step ${step.step}.`, "usage");
    const others = sheetCuts(project, sheetId)!.lines.filter((other) => !sameLine(other, step));
    const place = others.findIndex((other) => sameLine(other, target)) + (after !== undefined ? 1 : 0);
    const next = moveCut(project, sheetId, step, place);
    if (!next) {
      const limits = cutOrderLimits(project, sheetId, step)!;
      const stepOf = (cut: CutLine | null) => (cut ? (steps.find((s) => s.kind !== "trim" && sameLine(s, cut))?.step ?? null) : null);
      const low = stepOf(limits.requires);
      const high = stepOf(limits.first);
      const parts = [low !== null ? `after step ${low}, the cut that makes its piece` : null, high !== null ? `before step ${high}, the first cut inside its piece` : null].filter(Boolean);
      throw new CliError(EXIT.usage, "order-limit", `Step ${step.step} must stay ${parts.join(", and ")}.`, { after: low, before: high });
    }
    const moved = sheetSteps(next, sheetId).find((s) => s.kind !== "trim" && sameLine(s, step))!;
    const details = project.settings.orderMode === "setup" ? ["The shop order groups the setups, because orderMode is setup. The new order applies when orderMode is sheet."] : [];
    return finishMutation(invocation, loaded, next, {
      summary: `Moved step ${step.step} ${before !== undefined ? "before" : "after"} step ${targetNumber}.`,
      details,
      data: { sheet: sheetId, step: step.step, to: moved.step, cut: line(step) },
    });
  },
};

function lockCommand(locked: boolean): CommandSpec {
  const verb = locked ? "lock" : "unlock";
  return {
    name: `cuts ${verb}`,
    summary: locked ? "Lock a cut, so that optimize-cuts keeps it." : "Unlock a cut, so that optimize-cuts can change it.",
    description: locked
      ? "Lock one cut. optimize-cuts then keeps the cut with the same position and ends, and searches the other cuts. A locked cut cannot be extended, shortened, joined, or removed, and no edit can split it. A lock on a sheet with automatic cuts saves them in the file first. A layout change to the sheet removes the saved cuts with their locks."
      : "Unlock one cut, so that optimize-cuts and the cut edits can change it again. The sheet keeps its saved cuts.",
    args: [FILE_ARG],
    options: [SHEET, STEP, ...OUTPUT_OPTIONS],
    examples: [{ command: `${PROGRAM} cuts ${verb} shelf.cutplan.json --sheet 1 --step 3`, description: `${locked ? "Lock" : "Unlock"} step 3.` }],
    output: "sheet, step, cut { axis, at, from, to }, locked, changes, validation, written, dryRun.",
    async run(invocation) {
      const { args, options, io } = invocation;
      const loaded = await loadProject(io, args[0]!);
      const { project } = loaded;
      const { sheetId, number, step } = findCut(project, options);
      const was = isCutLocked(project, sheetId, step);
      const next = was === locked ? project : setCutLocked(project, sheetId, step, locked)!;
      const { details } = changed(next, sheetId, number);
      return finishMutation(invocation, loaded, next, {
        summary: was === locked ? `Step ${step.step} is already ${verb}ed.` : `${locked ? "Locked" : "Unlocked"} step ${step.step}.`,
        details,
        data: { sheet: sheetId, step: step.step, cut: line(step), locked },
      });
    },
  };
}

export const cutsGroup: GroupSpec = {
  name: "cuts",
  summary: "The cuts of a sheet: show, extend, shorten, join, remove, lock, unlock, and move",
  commands: [show, extend, shorten, join, remove, lockCommand(true), lockCommand(false), move],
};
