import {
  analyzeProject,
  removeStock,
  saveOffcutsToStock,
  StockKindSchema,
  stockLabel,
  unsavedOffcuts,
  updateStock,
  type Patch,
  type Project,
  type Stock,
} from "@opencutplan/core";
import { PROGRAM } from "../help.ts";
import { FILE_ARG, finishMutation, loadProject, OUTPUT_OPTIONS, warningLines } from "../project.ts";
import { usageError, type CommandSpec, type GroupSpec, type OptionValues } from "../spec.ts";
import { len, money, size, table } from "../text.ts";
import { flag, integerValue, lengthValue, numberValue, optionalBoolean, optionalChoice, optionalLength, str } from "../values.ts";
import { assertNoConflict, findAll, findById, ID_OPTION, materialFor, newId, resolveMaterial, unsetFields, unsetOption } from "./common.ts";
import { CSV_ARGS, EXPORT_OUT, exportCsv, importCsv, importOptions } from "./csv.ts";
import { planContextOf } from "./context.ts";

const KINDS = StockKindSchema.options;

const OPTIONS = {
  material: { name: "material", type: "string", value: "<id|name>", description: "The material id or name. For add, required when the project has more than one material." },
  length: { name: "length", type: "string", value: "<length>", description: "The length of the full piece. The grain runs along the length." },
  width: { name: "width", type: "string", value: "<length>", description: "The width of the full piece." },
  quantity: { name: "quantity", type: "string", value: "<n|unlimited>", description: "The pieces available, or unlimited when more can be bought. Default for add: unlimited." },
  cost: { name: "cost", type: "string", value: "<amount>", description: "The price of one piece in the project currency." },
  kind: { name: "kind", type: "string", value: "<sheet|offcut>", description: "sheet (new stock, bought) or offcut (owned, not bought). Default for add: sheet." },
  trim: {
    name: "trim",
    type: "string",
    value: "<length|factory|project>",
    description: "The edge trim of this stock: a width, factory (use the factory edges, trim 0), or project (use the project setting). Default for add: project.",
  },
  factoryEdges: { name: "factory-edges", type: "boolean", description: "The same as --trim factory." },
  enabled: { name: "enabled", type: "string", value: "<true|false>", description: "false leaves this stock out of planning. Default for add: true." },
  name: { name: "name", type: "string", value: "<text>", description: "A display name." },
} as const;

function sheetsUsed(project: Project, id: string): number {
  return (project.plan?.sheets ?? []).filter((sheet) => sheet.stock === id).length;
}

function line(project: Project, stock: Stock): string {
  return `${stock.id} (${stockLabel(planContextOf(project), stock)}, ${stock.quantity === null ? "unlimited" : `×${stock.quantity}`})`;
}

function fields(project: Project, options: OptionValues): Patch<Stock> {
  const units = project.project.units;
  const patch: Patch<Stock> = {};
  const material = str(options, "material");
  if (material !== undefined) patch.material = resolveMaterial(project, material).id;
  const length = optionalLength(options, "length", units);
  if (length !== undefined) patch.length = length;
  const width = optionalLength(options, "width", units);
  if (width !== undefined) patch.width = width;
  const quantity = str(options, "quantity");
  if (quantity !== undefined) patch.quantity = quantity === "unlimited" ? null : integerValue(quantity, "quantity", 1);
  const cost = str(options, "cost");
  if (cost !== undefined) patch.cost = numberValue(cost, "cost");
  const kind = optionalChoice(options, "kind", KINDS);
  if (kind !== undefined) patch.kind = kind;
  const trim = str(options, "trim");
  if (trim !== undefined && flag(options, "factory-edges")) throw usageError("Give --trim or --factory-edges, not both.", "conflict", { option: "trim" });
  if (flag(options, "factory-edges") || trim === "factory") patch.trim = 0;
  else if (trim === "project") patch.trim = undefined;
  else if (trim !== undefined) patch.trim = lengthValue(trim, units, "trim", { allowZero: true });
  const enabled = optionalBoolean(options, "enabled");
  if (enabled !== undefined) patch.enabled = enabled;
  const name = str(options, "name");
  if (name !== undefined) patch.name = name;
  return patch;
}

function edges(project: Project, stock: Stock): string {
  return stock.trim === undefined ? "project" : stock.trim === 0 ? "factory" : len(project, stock.trim);
}

const list: CommandSpec = {
  name: "stock list",
  summary: "List the stock.",
  description: "List the stock items, with the number of plan sheets cut from each one.",
  args: [FILE_ARG],
  options: [],
  examples: [{ command: `${PROGRAM} stock list shelf.cutplan.json`, description: "List the stock as a table." }],
  output: "units, currency, stock [{ id, material, length, width, quantity (null = unlimited), kind, cost?, trim?, enabled?, name?, sheetsUsed }]. sheetsUsed is derived; it is not a file field.",
  async run({ args, io }) {
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const stock = project.stock.map((item) => ({ ...item, sheetsUsed: sheetsUsed(project, item.id) }));
    const text = table(
      ["id", "material", "size", "qty", "kind", "cost", "edges", "enabled", "used"],
      stock.map((s) => [
        s.id,
        s.material,
        size(project, s),
        s.quantity === null ? "unlimited" : String(s.quantity),
        s.kind,
        s.cost === undefined ? "" : money(s.cost, project.settings.currency),
        edges(project, s),
        String(s.enabled !== false),
        String(s.sheetsUsed),
      ]),
    );
    return { data: { units: project.project.units, currency: project.settings.currency, stock }, text, warnings: warningLines(loaded) };
  },
};

const get: CommandSpec = {
  name: "stock get",
  summary: "Show one stock item.",
  description: "Show one stock item by id.",
  args: [FILE_ARG, { name: "id", description: "The stock id." }],
  options: [],
  examples: [{ command: `${PROGRAM} stock get shelf.cutplan.json bb18-5x5 --json`, description: "Show one stock item." }],
  output: "units, currency, stock { id, material, length, width, quantity, kind, cost?, trim?, enabled?, name? }, sheetsUsed.",
  async run({ args, io }) {
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const stock = findById(project.stock, args[1]!, "stock");
    const used = sheetsUsed(project, stock.id);
    return {
      data: { units: project.project.units, currency: project.settings.currency, stock, sheetsUsed: used },
      text: `${line(project, stock)}, ${stock.kind}, edges ${edges(project, stock)}, ${used} sheets in the plan.`,
      warnings: warningLines(loaded),
    };
  },
};

const add: CommandSpec = {
  name: "stock add",
  summary: "Add a stock item.",
  description: "Add a stock item: a sheet size of a material that can be cut, or an owned offcut.",
  args: [FILE_ARG],
  options: [
    OPTIONS.material,
    { ...OPTIONS.length, required: true },
    { ...OPTIONS.width, required: true },
    OPTIONS.quantity,
    OPTIONS.cost,
    OPTIONS.kind,
    OPTIONS.trim,
    OPTIONS.factoryEdges,
    OPTIONS.enabled,
    OPTIONS.name,
    ID_OPTION,
    ...OUTPUT_OPTIONS,
  ],
  examples: [
    { command: `${PROGRAM} stock add shelf.cutplan.json --material ply --length 96 --width 48 --cost 65`, description: "Add unlimited 4 × 8 ft sheets at 65 each." },
    { command: `${PROGRAM} stock add shelf.cutplan.json --material ply --length 30 --width 20 --quantity 1 --kind offcut --factory-edges`, description: "Add an owned offcut with cut edges." },
  ],
  output: "stock (the new item), changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, options, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const patch = fields(project, options);
    const material = patch.material ?? materialFor(project, undefined).id;
    const materialName = project.materials.find((m) => m.id === material)!.name;
    const round = (value: number) => Math.round(value * 100) / 100;
    const stock: Stock = {
      id: newId(project.stock, str(options, "id"), `${materialName} ${round(patch.length!)}x${round(patch.width!)}`, "stock"),
      material,
      length: patch.length!,
      width: patch.width!,
      quantity: patch.quantity === undefined ? null : patch.quantity,
      kind: patch.kind ?? "sheet",
    };
    if (patch.cost !== undefined) stock.cost = patch.cost;
    if (patch.trim !== undefined) stock.trim = patch.trim;
    if (patch.enabled !== undefined) stock.enabled = patch.enabled;
    if (patch.name !== undefined) stock.name = patch.name;
    const next = { ...project, stock: [...project.stock, stock] };
    return finishMutation(invocation, loaded, next, { summary: `Added stock ${line(project, stock)}.`, data: { stock } });
  },
};

const set: CommandSpec = {
  name: "stock set",
  summary: "Change a stock item.",
  description: "Change the fields of a stock item. Only the fields you give change. The id does not change.",
  args: [FILE_ARG, { name: "id", description: "The stock id." }],
  options: [
    OPTIONS.material,
    OPTIONS.length,
    OPTIONS.width,
    OPTIONS.quantity,
    OPTIONS.cost,
    OPTIONS.kind,
    OPTIONS.trim,
    OPTIONS.factoryEdges,
    OPTIONS.enabled,
    OPTIONS.name,
    unsetOption(["cost", "name", "trim", "enabled"]),
    ...OUTPUT_OPTIONS,
  ],
  examples: [
    { command: `${PROGRAM} stock set shelf.cutplan.json bb18-5x5 --cost 89.5 --quantity 4`, description: "Set a price and a limit of 4 sheets." },
    { command: `${PROGRAM} stock set shelf.cutplan.json bb18-5x5 --trim 1/4`, description: "Trim 1/4\" off each edge of this stock." },
  ],
  output: "stock (after the change), changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, options, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const old = findById(project.stock, args[1]!, "stock");
    const unset = unsetFields(options, ["cost", "name", "trim", "enabled"] as const);
    assertNoConflict(options, ["cost", "name", "trim", "enabled"], unset);
    const patch = fields(project, options);
    for (const field of unset) patch[field] = undefined;
    const next = updateStock(project, old.id, patch);
    const stock = findById(next.stock, old.id, "stock");
    return finishMutation(invocation, loaded, next, { summary: `Changed stock ${line(next, stock)}.`, data: { stock } });
  },
};

const remove: CommandSpec = {
  name: "stock remove",
  summary: "Remove stock items and the sheets cut from them.",
  description: "Remove one or more stock items. The plan sheets cut from them go too, so their parts return to the tray. Nothing is removed when any id is unknown.",
  args: [FILE_ARG, { name: "id", description: "A stock id.", variadic: true }],
  options: [...OUTPUT_OPTIONS],
  examples: [{ command: `${PROGRAM} stock remove shelf.cutplan.json bb6-5x5`, description: "Remove a stock item." }],
  output: "removed (the ids), removedSheets (plan sheet ids), changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const items = findAll(project.stock, args.slice(1), "stock");
    const next = items.reduce((p, item) => removeStock(p, item.id), project);
    const removed = items.map((item) => item.id);
    const removedSheets = (project.plan?.sheets ?? []).filter((sheet) => removed.includes(sheet.stock)).map((sheet) => sheet.id);
    return finishMutation(invocation, loaded, next, { summary: `Removed stock ${removed.join(", ")}.`, data: { removed, removedSheets } });
  },
};

const saveOffcuts: CommandSpec = {
  name: "stock save-offcuts",
  summary: "Add the plan's usable offcuts to the stock.",
  description:
    "Add the plan's usable offcuts (see report offcuts) to the stock as owned offcuts: quantity 1, cost 0, trim 0, named \"Offcut from <project>, sheet N\". As in the app, an offcut that is already in the stock with the same name, material, and size is not added again.",
  args: [FILE_ARG],
  options: [...OUTPUT_OPTIONS],
  examples: [{ command: `${PROGRAM} stock save-offcuts shelf.cutplan.json`, description: "Keep the offcuts for the next project." }],
  output: "added (the new stock items), changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const offcuts = unsavedOffcuts(project, analyzeProject(project).offcuts);
    const next = saveOffcutsToStock(project, offcuts);
    const added = next.stock.slice(project.stock.length);
    return finishMutation(invocation, loaded, next, {
      summary: added.length === 0 ? "No new offcuts to save." : `Added ${added.length} offcuts to the stock: ${added.map((s) => s.id).join(", ")}.`,
      data: { added },
    });
  },
};

const importStock: CommandSpec = {
  name: "stock import",
  summary: "Add the stock in a CSV file.",
  description:
    "Add the stock in a CSV file, as the app's import does. The columns are guessed from the header (material, length, width, thickness, quantity, cost, kind, name, and common names from other tools); use --map for other names. An empty or \"unlimited\" quantity means unlimited. Rows with errors are skipped and listed. Materials are matched by name; new ones are created.",
  args: CSV_ARGS,
  options: importOptions("stock"),
  examples: [{ command: `${PROGRAM} stock import shelf.cutplan.json stock.csv --json`, description: "Import a stock list." }],
  output:
    "imported (count), ids (new stock ids), createdMaterials, csvIssues [{ severity, row, column?, message }], mapping { field: header }, changes, validation, written, dryRun. When columns are missing (exit 1): error { code: \"needs-mapping\" }, missing, headers, mapping.",
  run: (invocation) => importCsv(invocation, "stock"),
};

const exportStock: CommandSpec = {
  name: "stock export",
  summary: "Write the stock as CSV.",
  description: "Write the stock list as CSV (material,length,width,thickness,quantity,cost,kind,name), the same file as the app's Export stock CSV. The same as export stock-csv.",
  args: [FILE_ARG],
  options: [EXPORT_OUT],
  examples: [{ command: `${PROGRAM} stock export shelf.cutplan.json > stock.csv`, description: "Print the stock CSV." }],
  output: "path and rows when --out is a file; csv and rows when the CSV goes to stdout.",
  run: (invocation) => exportCsv(invocation, "stock"),
};

export const stockGroup: GroupSpec = { name: "stock", summary: "Stock (sheets and offcuts)", commands: [list, get, add, set, remove, importStock, exportStock, saveOffcuts] };
