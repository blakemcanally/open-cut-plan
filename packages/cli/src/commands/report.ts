import {
  analyzeProject,
  assemblySteps,
  cutList,
  describeStep,
  resultSentence,
  setupLabel,
  setupRuns,
  formatArea,
  hardwareList,
  LABEL_LAYOUTS,
  labelPages,
  planAlert,
  totalCutLength,
  unsavedOffcuts,
  type HardwareLine,
  type ProjectAnalysis,
} from "@opencutplan/core";
import { PROGRAM } from "../help.ts";
import { FILE_ARG, loadProject, warningLines, type Loaded } from "../project.ts";
import type { CommandSpec, GroupSpec } from "../spec.ts";
import { len, money, percent, plural, size, table } from "../text.ts";
import { integerValue, optionalChoice, str } from "../values.ts";
import { findById } from "./common.ts";
import { invalidDesign } from "./design.ts";
import { findSheet } from "./layout.ts";

const SHEET_OPTION = { name: "sheet", type: "string", value: "<ref>", description: "Only this sheet: a sheet id, or its 1-based number in the plan." } as const;

function planWarnings(loaded: Loaded, analysis: ProjectAnalysis, file: string): string[] {
  const alert = planAlert(analysis.context, analysis.issues);
  const lines = warningLines(loaded);
  return alert ? [...lines, `warning: ${alert.text} Run '${PROGRAM} validate ${file}' to list the problems.`] : lines;
}

function hardwareText(line: HardwareLine): string {
  const count = line.quantity === null ? "as needed" : line.unit === "pack" ? `${line.quantity} ×` : String(line.quantity);
  const article = line.article === undefined ? "" : ` (IKEA ${line.article})`;
  const choices = line.choices === undefined ? "" : `: ${line.choices.map((choice) => `${choice.name} ${choice.article}`).join(", ")}`;
  return `  ${count} ${line.name}${article}${choices}${line.design === null ? "" : ` [${line.design}]`}`;
}

const shopping: CommandSpec = {
  name: "report shopping",
  summary: "What to buy, the cost, and the use of each sheet.",
  description:
    "The shopping list, as in the app's Reports tab: for each material, the stock the plan uses, the pieces to buy (owned offcuts are not bought), and the cost. The total is null when the cost feature is off or a stock item to buy has no price; missingPrices lists those items. hardware lists the screws, glue, and IKEA items that the designs need; it has no prices.",
  args: [FILE_ARG],
  options: [],
  examples: [{ command: `${PROGRAM} report shopping shelf.cutplan.json`, description: "Show what to buy." }],
  output:
    "currency, total (null when unknown), missingPrices, sheetsToBuy, materials [{ material, name, lines [{ stock, label, kind, length, width, used, buy, unitCost, lineCost }], cost, stockArea, partArea, utilization }], sheets [{ sheet, sheetNumber, stock, stockArea, partArea, utilization }], hardware [{ item, name, article?, choices? [{ name, article, source }], quantity (null when you choose it), unit (each|pack), design (id, or null for all designs), source? }].",
  async run({ args, io }) {
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const analysis = analyzeProject(project);
    const list = analysis.shopping;
    const hardware = hardwareList(project);
    const sheetsToBuy = list.materials.flatMap((m) => m.lines).reduce((sum, line) => sum + line.buy, 0);
    const lines: string[] = [];
    for (const material of list.materials) {
      lines.push(`${material.name}: ${percent(material.utilization)} used, cost ${money(material.cost, list.currency)}`);
      lines.push(
        table(
          ["  stock", "size", "kind", "used", "buy", "each", "cost"],
          material.lines.map((line) => [
            `  ${line.label}`,
            size(project, line),
            line.kind,
            String(line.used),
            String(line.buy),
            money(line.unitCost, list.currency),
            money(line.lineCost, list.currency),
          ]),
        ),
      );
    }
    if (list.materials.length === 0) lines.push("Nothing to buy: the plan has no sheets.");
    lines.push(`Buy ${plural(sheetsToBuy, "piece")}. Total: ${money(list.total, list.currency)}.`);
    if (list.missingPrices.length > 0) lines.push(`No price: ${list.missingPrices.join(", ")}.`);
    if (hardware.length > 0) lines.push("Hardware:", ...hardware.map(hardwareText));
    return { data: { ...list, sheetsToBuy, hardware }, text: lines.join("\n"), warnings: planWarnings(loaded, analysis, args[0]!) };
  },
};

const sequence: CommandSpec = {
  name: "report sequence",
  summary: "The cut steps in shop order.",
  description:
    "The cut sequence, in the order of the orderMode setting, with the tool, the fence or stop setting, and what each cut releases. The text of each step is the same as in the app's Shop mode.",
  args: [FILE_ARG],
  options: [SHEET_OPTION],
  examples: [
    { command: `${PROGRAM} report sequence shelf.cutplan.json`, description: "Print every step." },
    { command: `${PROGRAM} report sequence shelf.cutplan.json --sheet 1 --json`, description: "The steps of sheet 1 as JSON." },
  ],
  output:
    "orderMode, cutLength (the total length of the cut lines of the steps, trims included), steps [{ step, sheet, sheetNumber, kind (rip|crosscut|trim), axis, stage, at, from, to, tool (id or null), toolName, recommendedTool (id or null), setup (the tool and what the user sets, such as Table saw · fence at 15 3/8\"), chosen, overLimit (maxPiece|maxCrosscutPiece|maxRip|maxCrosscut|maxCut|maxStages|crosscutOnly or null), side, setting, requires, releasedNext, remainderNext, piece, released, remainder { x, y, length, width }, title, headline, method, pickUp, actions [string], results [{ kind (part|next|offcut|waste), where, size, parts [string], next }], body }].",
  async run({ args, options, io }) {
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const analysis = analyzeProject(project);
    const ref = str(options, "sheet");
    const only = ref === undefined ? null : findSheet(project, ref).sheet.id;
    const shown = analysis.steps.filter((step) => only === null || step.sheet === only);
    const steps = shown.map((step) => {
      const { tool, recommended, releasedPlacements: _released, remainderPlacements: _remainder, ...rest } = step;
      return { ...rest, tool: tool?.id ?? null, toolName: tool?.name ?? null, recommendedTool: recommended?.id ?? null, setup: setupLabel(analysis.context, step), ...describeStep(analysis.context, step) };
    });
    const lines = (step: (typeof steps)[number]) =>
      [
        step.title,
        `  ${step.method}`,
        `  Pick up ${step.pickUp}.`,
        ...step.actions.map((action, index) => `  ${index + 1}. ${action}`),
        ...step.results.map((result) => `  ${resultSentence(result)}`),
      ].join("\n");
    const cutLength = totalCutLength(steps);
    let start = 0;
    const blocks =
      project.settings.orderMode === "setup"
        ? setupRuns(analysis.context, shown).flatMap((run) => {
            const block = steps.slice(start, (start += run.length));
            return [`Setup: ${block[0]!.setup} · ${plural(run.length, "cut")}`, ...block.map(lines)];
          })
        : steps.map(lines);
    const text = steps.length === 0 ? "No cuts." : [...blocks, `${plural(steps.length, "cut step")}. The total cut length is ${len(project, cutLength)}.`].join("\n");
    return { data: { orderMode: project.settings.orderMode, cutLength, steps }, text, warnings: planWarnings(loaded, analysis, args[0]!) };
  },
};

const offcuts: CommandSpec = {
  name: "report offcuts",
  summary: "The usable offcuts the plan leaves.",
  description:
    "The waste pieces that are at least the minimum offcut size (the minOffcut settings). saved is true when the stock already has the offcut (see stock save-offcuts). The list is empty when the offcuts feature is off.",
  args: [FILE_ARG],
  options: [],
  examples: [{ command: `${PROGRAM} report offcuts shelf.cutplan.json --json`, description: "List the offcuts." }],
  output: "minOffcut { length, width }, offcuts [{ sheet, sheetNumber, stock, material, x, y, length, width, saved }].",
  async run({ args, io }) {
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const analysis = analyzeProject(project);
    const unsaved = new Set(unsavedOffcuts(project, analysis.offcuts));
    const list = analysis.offcuts.map((offcut) => ({
      sheet: offcut.sheet,
      sheetNumber: offcut.sheetNumber,
      stock: offcut.stock,
      material: offcut.material,
      ...offcut.rect,
      saved: !unsaved.has(offcut),
    }));
    const text =
      list.length === 0
        ? "No usable offcuts."
        : table(
            ["sheet", "material", "size", "at", "saved"],
            list.map((o) => [String(o.sheetNumber), analysis.context.materials.get(o.material)?.name ?? o.material, size(project, o), `${len(project, o.x)}, ${len(project, o.y)}`, o.saved ? "yes" : "no"]),
          );
    return { data: { minOffcut: analysis.context.minOffcut, offcuts: list }, text, warnings: planWarnings(loaded, analysis, args[0]!) };
  },
};

const LAYOUT_IDS = LABEL_LAYOUTS.map((layout) => layout.id);

const labels: CommandSpec = {
  name: "report labels",
  summary: "One label per part copy, and the label pages.",
  description: `The part labels: name, size, material, grain, factory edge (true when the part asks for a long edge on a factory edge of the sheet), sheet, and the step that cuts the part free. With --layout, the labels are also split into pages of that label sheet. The list is empty when the labels feature is off (settings set <file> features.labels true). Layouts: ${LABEL_LAYOUTS.map((l) => `${l.id} (${l.name})`).join(", ")}.`,
  args: [FILE_ARG],
  options: [
    { name: "layout", type: "string", value: `<${LAYOUT_IDS.join("|")}>`, description: "Split the labels into pages of this label sheet." },
    { name: "start", type: "string", value: "<n>", description: "With --layout: the 1-based position of the first label on the first page, to use a part-used sheet. Default: 1." },
  ],
  examples: [
    { command: `${PROGRAM} report labels shelf.cutplan.json`, description: "List the labels." },
    { command: `${PROGRAM} report labels shelf.cutplan.json --layout avery-5160 --start 7 --json`, description: "Pages of Avery 5160 labels, from the 7th label." },
  ],
  output:
    "enabled (the labels feature), labels [{ part, copy, name, group, length, width, material, grain, factoryEdge, sheetNumber, step }]. With --layout: layout (the label sheet), pages [[{ part, copy } or null]] (null is an empty slot).",
  async run({ args, options, io }) {
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const analysis = analyzeProject(project);
    const layoutId = optionalChoice(options, "layout", LAYOUT_IDS);
    const startText = str(options, "start");
    const start = startText === undefined ? 1 : integerValue(startText, "start", 1);
    const enabled = project.settings.features.labels;
    const data: Record<string, unknown> = { enabled, labels: analysis.labels };
    const lines = enabled
      ? analysis.labels.map((l) => `${l.name}: ${len(project, l.length)} × ${len(project, l.width)}, ${analysis.context.materials.get(l.material)?.name ?? l.material}${l.factoryEdge ? ", factory edge" : ""}${l.sheetNumber === null ? ", not placed" : `, sheet ${l.sheetNumber}`}${l.step === null ? "" : `, step ${l.step}`}`)
      : ["The labels feature is off. Turn it on with: settings set <file> features.labels true"];
    if (layoutId !== undefined) {
      const layout = LABEL_LAYOUTS.find((l) => l.id === layoutId)!;
      const pages = labelPages(analysis.labels, layout, start).map((page) => page.map((label) => (label ? { part: label.part, copy: label.copy } : null)));
      data.layout = layout;
      data.pages = pages;
      lines.push(`${plural(pages.length, "page")} of ${layout.name}.`);
    }
    return { data, text: lines.join("\n"), warnings: planWarnings(loaded, analysis, args[0]!) };
  },
};

const cutlist: CommandSpec = {
  name: "report cutlist",
  summary: "Every part with its size, count, and sheets.",
  description:
    "The cut list: every part with its size, material, quantity, the factory edge that it asks for (by its own choice or by the settings rule), the copies placed, and the sheet numbers they are on; then the part count and area of each material.",
  args: [FILE_ARG],
  options: [],
  examples: [{ command: `${PROGRAM} report cutlist shelf.cutplan.json`, description: "Print the cut list." }],
  output: "units, parts [{ id, name, material, length, width, thickness, quantity, grain, factoryEdge (long, or null), group, placed, sheets (numbers) }], materials [{ material, name, parts, copies, partArea (square units) }].",
  async run({ args, io }) {
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const analysis = analyzeProject(project);
    const { parts, materials } = cutList(project, analysis);
    const units = project.project.units;
    const text = [
      table(
        ["part", "name", "size", "qty", "placed", "material", "factory edge", "sheets"],
        parts.map((p) => [p.id, p.name, size(project, p), String(p.quantity), String(p.placed), p.material, p.factoryEdge ?? "", p.sheets.join(", ")]),
      ),
      ...materials.map((m) => `${m.name}: ${plural(m.parts, "part")}, ${plural(m.copies, "copy", "copies")}, ${formatArea(m.partArea, units)}.`),
    ].join("\n");
    return { data: { units, parts, materials }, text, warnings: planWarnings(loaded, analysis, args[0]!) };
  },
};

const assembly: CommandSpec = {
  name: "report assembly",
  summary: "The steps to build each design.",
  description:
    "The assembly steps of each design, in order: drill the pocket holes, mark the shelf positions, cut spacers, assemble each column, check that it is square, fit the back, and mount or anchor the unit. The steps are for one unit; the first step says how many to build. A design that makes no parts has no steps; skipped lists it. With --design, a design that makes no parts is exit 1, design-invalid.",
  args: [FILE_ARG],
  options: [{ name: "design", type: "string", value: "<id>", description: "Only this design." }],
  examples: [
    { command: `${PROGRAM} report assembly hall.cutplan.json`, description: "Print the steps of every design." },
    { command: `${PROGRAM} report assembly hall.cutplan.json --design kallax-2x4 --json`, description: "The steps of one design as JSON." },
  ],
  output: "designs [{ design, name, quantity, steps [{ title, body }] }], skipped (the ids of designs that make no parts).",
  async run({ args, options, io }) {
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const only = str(options, "design");
    const chosen = only === undefined ? (project.designs ?? []) : [findById(project.designs ?? [], only, "design")];
    const designs = [];
    const skipped: string[] = [];
    for (const design of chosen) {
      const steps = assemblySteps(project, design.id);
      if (steps === null && only !== undefined) throw invalidDesign(project, design);
      if (steps === null) skipped.push(design.id);
      else designs.push({ design: design.id, name: design.name, quantity: design.quantity ?? 1, steps });
    }
    const lines = designs.flatMap((design) => [`${design.name} (${design.design})`, ...design.steps.map((step, i) => `  ${i + 1}. ${step.title}\n     ${step.body}`)]);
    if (skipped.length > 0) lines.push(`No steps for ${skipped.join(", ")}: the design makes no parts. Run 'opencutplan validate' for the reason.`);
    if (chosen.length === 0) lines.push("The project has no designs.");
    return { data: { designs, skipped }, text: lines.join("\n"), warnings: warningLines(loaded) };
  },
};

export const reportGroup: GroupSpec = { name: "report", summary: "Reports (read only)", commands: [shopping, sequence, offcuts, labels, cutlist, assembly] };
