import {
  addSheet,
  analyzeProject,
  copyLabel,
  findCopy,
  findFreeSpot,
  moveToTray,
  orientedSize,
  placeCopy,
  removeEmptySheets,
  removeSheet,
  rotateCopy,
  setPinned,
  stockLabel,
  unplacedCopies,
  usableRect,
  type CopyRef,
  type Part,
  type PlanSheet,
  type Project,
} from "@opencutplan/core";
import { PROGRAM } from "../help.ts";
import { FILE_ARG, finishMutation, loadProject, OUTPUT_OPTIONS, warningLines } from "../project.ts";
import { CliError, EXIT, usageError, type CommandSpec, type GroupSpec, type OptionSpec, type OptionValues } from "../spec.ts";
import { len, percent, plural, table } from "../text.ts";
import { integerValue, optionalBoolean, optionalLength, str } from "../values.ts";
import { findById } from "./common.ts";
import { planContextOf } from "./context.ts";

const SHEET_REF = "a sheet id, or its 1-based number in the plan";

export function sheetsOf(project: Project): readonly PlanSheet[] {
  return project.plan?.sheets ?? [];
}

export function findSheet(project: Project, ref: string): { sheet: PlanSheet; number: number } {
  const sheets = sheetsOf(project);
  let index = sheets.findIndex((sheet) => sheet.id === ref);
  if (index < 0 && /^\d+$/.test(ref)) index = Number(ref) - 1;
  const sheet = sheets[index];
  if (!sheet) {
    throw usageError(`No sheet "${ref}". Give ${SHEET_REF} (1 to ${sheets.length}).`, "not-found", { sheet: ref, known: sheets.map((s) => s.id) });
  }
  return { sheet, number: index + 1 };
}

const COPY: OptionSpec = { name: "copy", type: "string", value: "<n>", description: "The 0-based copy of the part, as in the file. Required when the part quantity is more than 1." };
const PART_ARG = { name: "part", description: "The part id." };

function copyRef(project: Project, partId: string, options: OptionValues): { ref: CopyRef; part: Part } {
  const part = findById(project.parts, partId, "part");
  const text = str(options, "copy");
  if (text === undefined) {
    if (part.quantity > 1) throw usageError(`The part ${part.id} has ${part.quantity} copies; give --copy 0 to ${part.quantity - 1}.`, "missing-option", { option: "copy" });
    return { ref: { part: part.id, copy: 0 }, part };
  }
  const copy = integerValue(text, "copy", 0);
  if (copy >= part.quantity) throw usageError(`--copy must be from 0 to ${part.quantity - 1} for ${part.id}.`, "invalid-value", { option: "copy", value: text });
  return { ref: { part: part.id, copy }, part };
}

function copyName(part: Part, ref: CopyRef): string {
  return `${copyLabel(part, ref.copy)} (${part.id} copy ${ref.copy})`;
}

function sheetView(project: Project) {
  const analysis = analyzeProject(project);
  const ctx = planContextOf(project);
  const usage = new Map(analysis.shopping.sheets.map((s) => [s.sheet, s.utilization]));
  const sheets = sheetsOf(project).map((sheet, index) => {
    const stock = ctx.stock.get(sheet.stock);
    return {
      number: index + 1,
      id: sheet.id,
      stock: sheet.stock,
      stockLabel: stock ? stockLabel(ctx, stock) : null,
      pinned: sheet.pinned === true,
      length: stock?.length ?? null,
      width: stock?.width ?? null,
      usable: stock ? usableRect(ctx, stock) : null,
      utilization: usage.get(sheet.id) ?? 0,
      placements: sheet.placements.map((placement) => {
        const part = ctx.parts.get(placement.part);
        return {
          ...placement,
          name: part ? copyLabel(part, placement.copy) : placement.part,
          ...(part ? orientedSize(part, placement.rotated) : { length: null, width: null }),
        };
      }),
    };
  });
  const tray = unplacedCopies(project).map((ref) => ({ ...ref, name: copyLabel(ctx.parts.get(ref.part)!, ref.copy) }));
  return { sheets, tray, issues: analysis.issues };
}

const show: CommandSpec = {
  name: "layout show",
  summary: "Show the sheets, the part placements, and the tray.",
  description:
    "Show the plan: each sheet with its stock, pin state, use, and placements, then the tray (the part copies on no sheet), then the plan issues. x and y are from the top-left corner of the full stock piece; length runs along x. The length and width of a placement are after rotation.",
  args: [FILE_ARG],
  options: [{ name: "sheet", type: "string", value: "<ref>", description: `Show only this sheet: ${SHEET_REF}.` }],
  examples: [
    { command: `${PROGRAM} layout show shelf.cutplan.json`, description: "Show the whole plan." },
    { command: `${PROGRAM} layout show shelf.cutplan.json --sheet 2 --json`, description: "Show sheet 2 as JSON." },
  ],
  output:
    "units, sheets [{ number, id, stock, stockLabel, pinned, length, width, usable { x, y, length, width }, utilization, placements [{ part, copy, x, y, rotated, name, length, width }] }], tray [{ part, copy, name }], issues [{ severity, code, message, refs }].",
  async run({ args, options, io }) {
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const view = sheetView(project);
    const ref = str(options, "sheet");
    const sheets = ref === undefined ? view.sheets : [view.sheets[findSheet(project, ref).number - 1]!];
    const lines: string[] = [];
    if (view.sheets.length === 0) lines.push("No plan. Run optimize, or add a sheet with layout add-sheet.");
    for (const sheet of sheets) {
      lines.push(`Sheet ${sheet.number} (${sheet.id}): ${sheet.stock}, ${sheet.stockLabel ?? "missing stock"}${sheet.pinned ? ", pinned" : ""}, ${percent(sheet.utilization)} used`);
      if (sheet.placements.length === 0) lines.push("  (empty)");
      else {
        const rows = sheet.placements.map((p) => [
          `  ${p.part}`,
          String(p.copy),
          p.name,
          `${len(project, p.x)}, ${len(project, p.y)}`,
          p.length === null ? "?" : `${len(project, p.length)} × ${len(project, p.width)}`,
          p.rotated ? "rotated" : "",
        ]);
        lines.push(table(["  part", "copy", "name", "x, y", "size", ""], rows));
      }
    }
    if (ref === undefined) {
      lines.push(view.tray.length === 0 ? "Tray: empty." : `Tray: ${view.tray.map((t) => `${t.name} (${t.part} copy ${t.copy})`).join(", ")}.`);
      for (const issue of view.issues) lines.push(`${issue.severity}: ${issue.message}`);
    }
    return { data: { units: project.project.units, sheets, tray: view.tray, issues: view.issues }, text: lines.join("\n"), warnings: warningLines(loaded) };
  },
};

function pinCommand(pinned: boolean): CommandSpec {
  const verb = pinned ? "pin" : "unpin";
  return {
    name: `layout ${verb}`,
    summary: pinned ? "Pin sheets, so optimize keeps them." : "Unpin sheets, so optimize can change them.",
    description: pinned
      ? "Pin one or more sheets. optimize keeps a pinned sheet and its placements as they are."
      : "Unpin one or more sheets. The next optimize can change them.",
    args: [FILE_ARG, { name: "sheet", description: `A sheet: ${SHEET_REF}.`, variadic: true }],
    options: [...OUTPUT_OPTIONS],
    examples: [{ command: `${PROGRAM} layout ${verb} shelf.cutplan.json 1 s3`, description: `${pinned ? "Pin" : "Unpin"} sheet 1 and sheet s3.` }],
    output: "sheets (the sheet ids), changes, validation, written, dryRun.",
    async run(invocation) {
      const { args, io } = invocation;
      const loaded = await loadProject(io, args[0]!);
      const found = args.slice(1).map((ref) => findSheet(loaded.project, ref).sheet.id);
      const next = found.reduce((p, id) => setPinned(p, id, pinned), loaded.project);
      return finishMutation(invocation, loaded, next, { summary: `${pinned ? "Pinned" : "Unpinned"} ${found.join(", ")}.`, data: { sheets: found } });
    },
  };
}

const move: CommandSpec = {
  name: "layout move",
  summary: "Put a part copy on a sheet.",
  description:
    "Put a part copy on a sheet, from the tray or from another sheet. Without --x and --y, the copy goes to the first free spot (the smallest x, then y) that keeps one kerf from every other part. With --x and --y, the copy goes there even when it overlaps; the validation then lists the problem. x and y are from the top-left corner of the full stock piece.",
  args: [FILE_ARG, PART_ARG],
  options: [
    COPY,
    { name: "sheet", type: "string", value: "<ref>", required: true, description: `The target sheet: ${SHEET_REF}.` },
    { name: "x", type: "string", value: "<length>", description: "The left edge of the copy. Give it with --y." },
    { name: "y", type: "string", value: "<length>", description: "The top edge of the copy. Give it with --x." },
    { name: "rotated", type: "string", value: "<true|false>", description: "true turns the part so its length runs along y. Default: the current rotation, else false." },
    ...OUTPUT_OPTIONS,
  ],
  examples: [
    { command: `${PROGRAM} layout move shelf.cutplan.json top --sheet 2`, description: "Move the top to the first free spot on sheet 2." },
    { command: `${PROGRAM} layout move shelf.cutplan.json side --copy 1 --sheet s1 --x 0.25 --y 12 --rotated false`, description: "Put the second side at an exact spot." },
  ],
  output: "placement { part, copy, x, y, rotated }, sheet (id), from (sheet id or null for the tray), changes, validation, written, dryRun. No free spot: exit 1, error code no-space.",
  async run(invocation) {
    const { args, options, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const { ref, part } = copyRef(project, args[1]!, options);
    const { sheet, number } = findSheet(project, str(options, "sheet")!);
    const units = project.project.units;
    const x = optionalLength(options, "x", units, { allowZero: true });
    const y = optionalLength(options, "y", units, { allowZero: true });
    if ((x === undefined) !== (y === undefined)) throw usageError("Give both --x and --y, or neither.", "missing-option", { option: x === undefined ? "x" : "y" });
    const current = findCopy(project, ref);
    const rotated = optionalBoolean(options, "rotated") ?? current?.placement.rotated ?? false;
    let spot = x !== undefined && y !== undefined ? { x, y } : null;
    if (!spot) {
      spot = findFreeSpot(planContextOf(project), sheet, orientedSize(part, rotated), ref);
      if (!spot) {
        throw new CliError(EXIT.failed, "no-space", `No free spot for ${copyName(part, ref)} on sheet ${number}${rotated ? " (rotated)" : ""}. Give --x and --y, or try --rotated ${!rotated}.`, {
          part: ref.part,
          copy: ref.copy,
          sheet: sheet.id,
        });
      }
    }
    const next = placeCopy(project, ref, sheet.id, spot.x, spot.y, rotated);
    const placement = findCopy(next, ref)!.placement;
    return finishMutation(invocation, loaded, next, {
      summary: `Moved ${copyName(part, ref)} to sheet ${number} (${sheet.id}) at ${len(project, spot.x)}, ${len(project, spot.y)}${rotated ? ", rotated" : ""}.`,
      data: { placement, sheet: sheet.id, from: current?.sheet.id ?? null },
      showIssues: true,
    });
  },
};

const tray: CommandSpec = {
  name: "layout tray",
  summary: "Take a part copy off its sheet.",
  description: "Take a part copy off its sheet and put it in the tray. optimize --rest-only plans the copies in the tray.",
  args: [FILE_ARG, PART_ARG],
  options: [COPY, ...OUTPUT_OPTIONS],
  examples: [{ command: `${PROGRAM} layout tray shelf.cutplan.json side --copy 0`, description: "Put the first side in the tray." }],
  output: "part, copy, from (the sheet id, or null when the copy was in the tray), changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, options, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { ref, part } = copyRef(loaded.project, args[1]!, options);
    const from = findCopy(loaded.project, ref)?.sheet.id ?? null;
    const next = moveToTray(loaded.project, ref);
    return finishMutation(invocation, loaded, next, {
      summary: from === null ? `${copyName(part, ref)} is already in the tray.` : `Moved ${copyName(part, ref)} from ${from} to the tray.`,
      data: { ...ref, from },
    });
  },
};

const rotate: CommandSpec = {
  name: "layout rotate",
  summary: "Turn a placed part copy a quarter turn.",
  description:
    "Turn a placed part copy a quarter turn about its top-left corner, as the app's Rotate does. The copy can then overlap or leave the sheet; the validation lists the problem. Use layout move --rotated to rotate and find a free spot.",
  args: [FILE_ARG, PART_ARG],
  options: [COPY, ...OUTPUT_OPTIONS],
  examples: [{ command: `${PROGRAM} layout rotate shelf.cutplan.json shelf --copy 2`, description: "Rotate the third shelf." }],
  output: "placement { part, copy, x, y, rotated }, changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, options, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { ref, part } = copyRef(loaded.project, args[1]!, options);
    if (!findCopy(loaded.project, ref)) throw usageError(`${copyName(part, ref)} is in the tray. Use layout move to place it.`, "not-placed", { ...ref });
    const next = rotateCopy(loaded.project, ref);
    const placement = findCopy(next, ref)!.placement;
    return finishMutation(invocation, loaded, next, {
      summary: `Rotated ${copyName(part, ref)}${placement.rotated ? "" : " back"}.`,
      data: { placement },
      showIssues: true,
    });
  },
};

const addSheetCommand: CommandSpec = {
  name: "layout add-sheet",
  summary: "Add an empty sheet to the plan.",
  description: "Add an empty sheet of a stock item at the end of the plan. Put parts on it with layout move.",
  args: [FILE_ARG],
  options: [{ name: "stock", type: "string", value: "<id>", required: true, description: "The stock id." }, ...OUTPUT_OPTIONS],
  examples: [{ command: `${PROGRAM} layout add-sheet shelf.cutplan.json --stock bb18-5x5`, description: "Add a sheet of bb18-5x5." }],
  output: "sheet (the new id), number, changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, options, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const stock = findById(loaded.project.stock, str(options, "stock")!, "stock");
    const { project: next, id } = addSheet(loaded.project, stock.id);
    const number = sheetsOf(next).length;
    return finishMutation(invocation, loaded, next, { summary: `Added sheet ${number} (${id}) of ${stock.id}.`, data: { sheet: id, number } });
  },
};

const removeSheetCommand: CommandSpec = {
  name: "layout remove-sheet",
  summary: "Remove sheets from the plan.",
  description: "Remove one or more sheets. Their part copies go to the tray.",
  args: [FILE_ARG, { name: "sheet", description: `A sheet: ${SHEET_REF}. Numbers refer to the plan before the command.`, variadic: true }],
  options: [...OUTPUT_OPTIONS],
  examples: [{ command: `${PROGRAM} layout remove-sheet shelf.cutplan.json 7`, description: "Remove the last of 7 sheets." }],
  output: "removed (sheet ids), tray (copies moved to the tray [{ part, copy }]), changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const sheets = args.slice(1).map((ref) => findSheet(loaded.project, ref).sheet);
    const next = sheets.reduce((p, sheet) => removeSheet(p, sheet.id), loaded.project);
    const moved = sheets.flatMap((sheet) => sheet.placements.map((p) => ({ part: p.part, copy: p.copy })));
    return finishMutation(invocation, loaded, next, {
      summary: `Removed ${sheets.map((s) => s.id).join(", ")}; ${plural(moved.length, "copy", "copies")} went to the tray.`,
      data: { removed: sheets.map((s) => s.id), tray: moved },
    });
  },
};

const removeEmpty: CommandSpec = {
  name: "layout remove-empty",
  summary: "Remove the sheets with no parts.",
  description: "Remove every sheet that has no placements.",
  args: [FILE_ARG],
  options: [...OUTPUT_OPTIONS],
  examples: [{ command: `${PROGRAM} layout remove-empty shelf.cutplan.json`, description: "Remove the empty sheets." }],
  output: "removed (sheet ids), changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const removed = sheetsOf(loaded.project).filter((s) => s.placements.length === 0).map((s) => s.id);
    const next = removeEmptySheets(loaded.project);
    return finishMutation(invocation, loaded, next, {
      summary: removed.length === 0 ? "No empty sheets." : `Removed ${removed.join(", ")}.`,
      data: { removed },
    });
  },
};

export const layoutGroup: GroupSpec = {
  name: "layout",
  summary: "The plan: sheets and part placements",
  commands: [show, pinCommand(true), pinCommand(false), move, tray, rotate, addSheetCommand, removeSheetCommand, removeEmpty],
};
