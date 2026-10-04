import {
  axisCells,
  checkDesigns,
  combineCells,
  defaultDesignName,
  DESIGN_MOUNTS,
  DESIGN_SYSTEM_NAMES,
  DESIGN_SYSTEMS,
  assemblyDrawings,
  assemblySteps,
  designElevationSvg,
  designErrors,
  designGeometry,
  designSheetEstimate,
  detachDesign,
  EKET,
  fitCombined,
  generatedParts,
  isDesignSystem,
  isHexColor,
  isNewerMinor,
  isPresetSystem,
  KALLAX,
  materialsById,
  MAX_DESIGN_CELLS,
  MAX_DESIGN_QUANTITY,
  presetAxis,
  presetDepth,
  regenerateDesigns,
  expandSelection,
  removeDesign,
  renameDesign,
  setDesignColor,
  splitCells,
  type CombinedCell,
  withStockFor,
  type Design,
  type DesignAxis,
  type DesignSystem,
  type Part,
  type PlanIssue,
  type Project,
  type Units,
} from "@opencutplan/core";
import { PROGRAM } from "../help.ts";
import { FILE_ARG, finishMutation, loadProject, OUTPUT_OPTIONS, warningLines, writeOutput, type Loaded } from "../project.ts";
import { CliError, EXIT, usageError, type CommandSpec, type GroupSpec, type Invocation, type OptionSpec, type OptionValues, type Outcome } from "../spec.ts";
import { len, plural, table } from "../text.ts";
import { choiceValue, integerValue, lengthValue, list as listValues, optionalChoice, optionalLength, str } from "../values.ts";
import { findAll, findById, ID_OPTION, materialFor, newId, nonEmpty, resolveMaterial } from "./common.ts";

const DESIGN_ARG = { name: "id", description: "The design id." };

/** Adds the suggested sheet for each material that has no enabled stock, and the line that names the new stock. */
function stockFor(project: Project, materials: (string | undefined)[]): { project: Project; addedStock: string[]; details: string[] } {
  const next = withStockFor(project, materials);
  const addedStock = next.stock.slice(project.stock.length).map((stock) => stock.id);
  if (addedStock.length === 0) return { project: next, addedStock, details: [] };
  const noun = addedStock.length === 1 ? "material" : "materials";
  return { project: next, addedStock, details: [`Added stock ${addedStock.join(" and ")}, because the design ${noun} had no stock.`] };
}

const OPTIONS = {
  system: { name: "system", type: "string", value: "<kallax|eket|custom>", description: "The system. kallax and eket set the cell sizes and the depth from the IKEA sizes. Default for add: custom." },
  cols: { name: "cols", type: "string", value: "<n>", description: `The number of columns, 1 to ${MAX_DESIGN_CELLS}. A custom design also needs --width.` },
  rows: { name: "rows", type: "string", value: "<n>", description: `The number of rows, 1 to ${MAX_DESIGN_CELLS}. A custom design also needs --height.` },
  width: { name: "width", type: "string", value: "<length>", description: "The outside width. The columns divide it equally." },
  height: { name: "height", type: "string", value: "<length>", description: "The outside height. The rows divide it equally." },
  columnOpenings: { name: "column-openings", type: "string", value: "<list>", description: "The opening of each column, left to right, for example 335,400. It replaces --cols and --width." },
  rowOpenings: { name: "row-openings", type: "string", value: "<list>", description: "The opening of each row, top to bottom. It replaces --rows and --height." },
  depth: { name: "depth", type: "string", value: "<length>", description: "The outside depth, with the back. Default for kallax and eket: the IKEA depth." },
  material: { name: "material", type: "string", value: "<id|name>", description: "The material of the panels. Required when the project has more than one material." },
  back: { name: "back", type: "string", value: "<id|name|none>", description: "The material of the back, or none. Default for add: none." },
  mount: { name: "mount", type: "string", value: "<floor|legs|feet|wall-rail>", description: "How the unit stands or hangs. legs, feet, and wall-rail add the EKET items to the hardware list. Default: floor." },
  quantity: { name: "quantity", type: "string", value: "<n>", description: `The number of units to build, 1 to ${MAX_DESIGN_QUANTITY}. Default for add: 1.` },
  name: { name: "name", type: "string", value: "<text>", description: "The design name. It is also the group of its parts. Default for add: the system and the grid, such as KALLAX 2x4." },
  color: {
    name: "color",
    type: "string",
    value: "<unit>=<#rrggbb|auto>",
    multiple: true,
    description: "The colour of one unit in the layout, for example 2=#ff8800. The units count from 1. auto gives the unit its automatic colour again.",
  },
} as const satisfies Record<string, OptionSpec>;

const FIELD_OPTIONS: OptionSpec[] = Object.values(OPTIONS);

interface AxisFlags {
  count: "cols" | "rows";
  outside: "width" | "height";
  openings: "column-openings" | "row-openings";
}

const WIDTH: AxisFlags = { count: "cols", outside: "width", openings: "column-openings" };
const HEIGHT: AxisFlags = { count: "rows", outside: "height", openings: "row-openings" };

function openingsValue(text: string, name: string, units: Units): number[] {
  const openings = text.split(",").map((item) => lengthValue(item.trim(), units, name));
  if (openings.length > MAX_DESIGN_CELLS) throw usageError(`--${name} has ${openings.length} openings. The most is ${MAX_DESIGN_CELLS}.`, "invalid-value", { option: name, value: text });
  return openings;
}

/** The axis from the flags, or the current axis when no flag for it is given. */
function axisValue(options: OptionValues, flags: AxisFlags, system: DesignSystem, units: Units, current: DesignAxis | undefined): DesignAxis | undefined {
  const openings = str(options, flags.openings);
  const countText = str(options, flags.count);
  const outside = optionalLength(options, flags.outside, units);
  if (openings !== undefined) {
    if (countText !== undefined || outside !== undefined) {
      throw usageError(`Give --${flags.openings}, or --${flags.count} and --${flags.outside}, not both.`, "conflict", { option: flags.openings });
    }
    return { openings: openingsValue(openings, flags.openings, units) };
  }
  const count = countText === undefined ? undefined : integerValue(countText, flags.count, 1, MAX_DESIGN_CELLS);
  if (outside !== undefined) return { outside, cells: count ?? (current ? axisCells(current) : 1) };
  if (count === undefined) return current;
  if (isPresetSystem(system)) return presetAxis(system, count, units);
  if (current && "outside" in current) return { outside: current.outside, cells: count };
  throw usageError(`--${flags.count} needs --${flags.outside} for a custom design.`, "missing-option", { option: flags.outside });
}

function withColors(project: Project, options: OptionValues, id: string): Project {
  const design = findById(project.designs ?? [], id, "design");
  const units = design.quantity ?? 1;
  return listValues(options, "color").reduce((next, text) => {
    const match = /^(\d+)=(.+)$/.exec(text.trim());
    const unit = match ? Number(match[1]) : Number.NaN;
    const color = match ? match[2]!.trim() : "";
    if (!(unit >= 1 && unit <= units) || (color !== "auto" && !isHexColor(color))) {
      throw usageError(`--color "${text}" is not <unit>=<#rrggbb|auto> with a unit from 1 to ${units}.`, "invalid-value", { option: "color", value: text });
    }
    return setDesignColor(next, id, unit, color === "auto" ? null : color);
  }, project);
}

/** Refuses a file from a newer minor version: its designs can have fields that this CLI does not know. */
function assertCanGenerate(loaded: Loaded): void {
  if (!isNewerMinor(loaded.project.version)) return;
  throw new CliError(EXIT.failed, "newer-version", `The file has the format version ${loaded.project.version}. Update opencutplan to change its designs.`, { version: loaded.project.version });
}

/** Refuses a design with an error (spec §10): exit 1 with the checks in error.issues. */
function assertValid(project: Project, design: Design): void {
  if (!isDesignSystem(design.system)) {
    throw new CliError(EXIT.failed, "invalid-value", `The design ${design.id} uses the system "${design.system}". Give --system ${DESIGN_SYSTEMS.join("|")}.`, {
      option: "system",
      issues: [],
    });
  }
  const issues = designErrors(project, design);
  if (issues.length === 0) return;
  throw new CliError(EXIT.failed, "invalid-value", issues.map((issue) => issue.message).join(" "), { issues });
}

function designIssues(project: Project, id: string): PlanIssue[] {
  return checkDesigns(project).filter((issue) => issue.refs.some((ref) => ref.kind === "design" && ref.design === id));
}

function outsideSize(project: Project, design: Design) {
  const geometry = designGeometry(design, materialsById(project));
  return geometry ? { width: geometry.outsideWidth, height: geometry.outsideHeight, depth: geometry.depth } : null;
}

function sizeText(project: Project, design: Design): string {
  const outside = outsideSize(project, design);
  return outside ? `${len(project, outside.width)} × ${len(project, outside.height)} × ${len(project, outside.depth)}` : "no size";
}

function line(project: Project, design: Design): string {
  return `${design.id} (${design.name}, ${design.system} ${axisCells(design.width)}x${axisCells(design.height)}, ${sizeText(project, design)}, ×${design.quantity ?? 1})`;
}

function partChanges(before: readonly Part[], after: readonly Part[]) {
  const old = new Map(before.map((part) => [part.id, part]));
  const now = new Set(after.map((part) => part.id));
  return {
    added: after.filter((part) => !old.has(part.id)).map((part) => part.id),
    removed: before.filter((part) => !now.has(part.id)).map((part) => part.id),
    resized: after.filter((part) => old.has(part.id) && (old.get(part.id)!.length !== part.length || old.get(part.id)!.width !== part.width)).map((part) => part.id),
  };
}

function droppedCopies(before: Project, after: Project): { part: string; copy: number }[] {
  const kept = new Set((after.plan?.sheets ?? []).flatMap((s) => s.placements.map((p) => `${p.part}#${p.copy}`)));
  return (before.plan?.sheets ?? []).flatMap((s) => s.placements.filter((p) => !kept.has(`${p.part}#${p.copy}`)).map((p) => ({ part: p.part, copy: p.copy })));
}

const systems: CommandSpec = {
  name: "design systems",
  summary: "List the design systems and their IKEA numbers.",
  description:
    "List the systems that design add and design set accept: kallax, eket, and custom. Each IKEA number has its value in millimetres, its source, and derived (true when the number comes from arithmetic on IKEA's listed sizes, not from a listing). The command needs no file.",
  args: [],
  options: [],
  examples: [{ command: `${PROGRAM} design systems --json`, description: "Get the systems and their numbers as JSON." }],
  output: "systems [{ system, name, values { <name>: { mm, derived, source } } }].",
  async run() {
    const values: Record<DesignSystem, object> = { kallax: KALLAX, eket: EKET, custom: {} };
    const list = DESIGN_SYSTEMS.map((system) => ({ system, name: DESIGN_SYSTEM_NAMES[system], values: values[system] }));
    const text = list
      .map((entry) => {
        const lines = Object.entries(entry.values as Record<string, { mm: number; derived: boolean; source: string }>).map(
          ([name, value]) => `  ${name}: ${value.mm} mm${value.derived ? " (derived)" : ""} — ${value.source}`,
        );
        return [`${entry.system} (${entry.name})`, ...(lines.length > 0 ? lines : ["  Any size you give."])].join("\n");
      })
      .join("\n");
    return { data: { systems: list }, text };
  },
};

const list: CommandSpec = {
  name: "design list",
  summary: "List the designs.",
  description: "List the designs with their outside size and the number of parts and copies that each one makes.",
  args: [FILE_ARG],
  options: [],
  examples: [{ command: `${PROGRAM} design list hall.cutplan.json`, description: "List the designs as a table." }],
  output: "units, designs [{ id, name, system, quantity, mount, outside { width, height, depth } (null when the design has an error), parts, copies }]. outside, parts, and copies are derived; they are not file fields.",
  async run({ args, io }) {
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const designs = (project.designs ?? []).map((design) => {
      const parts = generatedParts(project, design.id);
      return {
        id: design.id,
        name: design.name,
        system: design.system,
        quantity: design.quantity ?? 1,
        mount: design.mount ?? "floor",
        outside: outsideSize(project, design),
        parts: parts.length,
        copies: parts.reduce((sum, part) => sum + part.quantity, 0),
      };
    });
    const text =
      designs.length === 0
        ? "The project has no designs."
        : table(
            ["id", "name", "system", "size", "qty", "mount", "parts", "copies"],
            designs.map((d, i) => [d.id, d.name, d.system, sizeText(project, project.designs![i]!), String(d.quantity), d.mount, String(d.parts), String(d.copies)]),
          );
    return { data: { units: project.project.units, designs }, text, warnings: warningLines(loaded) };
  },
};

const get: CommandSpec = {
  name: "design get",
  summary: "Show one design, its parts, and its checks.",
  description:
    "Show one design by id, the parts it makes, its outside size, an estimate of the sheets it needs, and the design checks (errors and warnings) for it. The estimate is a short optimizer run on the parts of this design alone, with no limit on the sheet quantities and no offcuts; run optimize for the plan.",
  args: [FILE_ARG, DESIGN_ARG],
  options: [],
  examples: [{ command: `${PROGRAM} design get hall.cutplan.json kallax-2x4 --json`, description: "Show the design kallax-2x4." }],
  output:
    "units, design (the file object), outside { width, height, depth } or null, parts [the generated parts], estimate [{ material, sheets, sizes [{ stock, length, width, count }], unplaced, noStock }] or null, issues [{ severity, code, message, refs }].",
  async run({ args, io }) {
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const design = findById(project.designs ?? [], args[1]!, "design");
    const parts = generatedParts(project, design.id);
    const estimate = designSheetEstimate(project, design);
    const issues = designIssues(project, design.id);
    const text = [
      line(project, design),
      ...parts.map((part) => `  ${part.id}: ${part.name}, ${len(project, part.length)} × ${len(project, part.width)}, ×${part.quantity}`),
      ...(estimate ?? []).map((entry) =>
        entry.noStock
          ? `estimate: the project has no sheet stock of ${entry.material}`
          : `estimate: about ${plural(entry.sheets, "sheet")} of ${entry.material}${entry.unplaced > 0 ? `, and ${entry.unplaced} unplaced` : ""}`,
      ),
      ...issues.map((issue) => `${issue.severity} ${issue.code}: ${issue.message}`),
    ].join("\n");
    return { data: { units: project.project.units, design, outside: outsideSize(project, design), parts, estimate, issues }, text, warnings: warningLines(loaded) };
  },
};

const add: CommandSpec = {
  name: "design add",
  summary: "Add a design and make its parts.",
  description:
    "Add a cabinet design and make its parts: the top, the bottom, the sides, the dividers, the shelves, and the back. Give each axis as --cols with --width (or --rows with --height), or as a list of openings. For kallax and eket, --cols and --rows alone give IKEA-size cells, and the depth is the IKEA depth; the numbers are converted to the project units. A design with an error (such as stock too thin for pocket screws) is refused with exit 1, invalid-value, and the checks in error.issues. When the material or the back material has no enabled stock, the suggested sheet of it is added (as with stock add --suggested); addedStock lists it. The new parts are not placed; run optimize.",
  args: [FILE_ARG],
  options: [...FIELD_OPTIONS, ID_OPTION, ...OUTPUT_OPTIONS],
  examples: [
    { command: `${PROGRAM} design add hall.cutplan.json --system kallax --cols 2 --rows 4`, description: "Add a KALLAX 2x4; the id is kallax-2x4." },
    { command: `${PROGRAM} design add hall.cutplan.json --system eket --cols 2 --rows 1 --back ply6 --mount wall-rail --quantity 2`, description: "Add two EKET 2x1 units for the wall rail." },
    { command: `${PROGRAM} design add hall.cutplan.json --width 1200 --height 800 --cols 3 --rows 2 --depth 300 --name Sideboard`, description: "Add a custom 3x2 grid in a 1200 × 800 outside size." },
  ],
  output: "design (the new design), parts (the generated parts), addedStock (the ids of the stock added for the design materials), changes, validation, written, dryRun. For a design with an error: error { code: \"invalid-value\", issues }.",
  async run(invocation) {
    const { args, options, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    assertCanGenerate(loaded);
    const { project } = loaded;
    const units = project.project.units;
    const system = choiceValue(str(options, "system") ?? "custom", "system", DESIGN_SYSTEMS);
    const width = axisValue(options, WIDTH, system, units, undefined);
    const height = axisValue(options, HEIGHT, system, units, undefined);
    if (!width) throw usageError("Give --cols, --width, or --column-openings.", "missing-option", { option: "cols" });
    if (!height) throw usageError("Give --rows, --height, or --row-openings.", "missing-option", { option: "rows" });
    const depth = optionalLength(options, "depth", units) ?? (isPresetSystem(system) ? presetDepth(system, units) : undefined);
    if (depth === undefined) throw usageError("Give --depth for a custom design.", "missing-option", { option: "depth" });
    const name = nonEmpty(str(options, "name"), "name") ?? defaultDesignName(system, axisCells(width), axisCells(height));
    const design: Design = {
      id: newId(project.designs ?? [], str(options, "id"), name, "design"),
      name,
      system,
      material: materialFor(project, str(options, "material")).id,
      width,
      height,
      depth,
    };
    const quantity = str(options, "quantity");
    if (quantity !== undefined) design.quantity = integerValue(quantity, "quantity", 1, MAX_DESIGN_QUANTITY);
    const back = str(options, "back");
    if (back !== undefined && back !== "none") design.back = { material: resolveMaterial(project, back).id };
    const mount = optionalChoice(options, "mount", DESIGN_MOUNTS);
    if (mount !== undefined) design.mount = mount;
    const added = withColors({ ...project, designs: [...(project.designs ?? []), design] }, options, design.id);
    assertValid(added, design);
    const stocked = stockFor(added, [design.material, design.back?.material]);
    const next = regenerateDesigns(stocked.project);
    const result = findById(next.designs ?? [], design.id, "design");
    return finishMutation(invocation, loaded, next, {
      summary: `Added design ${line(next, result)}.`,
      details: stocked.details,
      data: { design: result, parts: generatedParts(next, design.id), addedStock: stocked.addedStock },
    });
  },
};

const set: CommandSpec = {
  name: "design set",
  summary: "Change a design and make its parts again.",
  description:
    "Change the fields of a design, then make its parts again. Only the fields you give change. --id gives the design a new id; its parts get new ids, and their copies stay on the sheets. A copy stays on its sheet when its part keeps the same id, size, and material; the other copies go to the tray, and removedPlacements lists them. A change that gives a design error is refused with exit 1, invalid-value, and the checks in error.issues. A --material or --back with no enabled stock gets the suggested sheet (as with stock add --suggested); addedStock lists it.",
  args: [FILE_ARG, DESIGN_ARG],
  options: [...FIELD_OPTIONS, { ...ID_OPTION, description: "A new id for the design. Its parts get new ids with it." }, ...OUTPUT_OPTIONS],
  examples: [
    { command: `${PROGRAM} design set hall.cutplan.json kallax-2x4 --rows 5`, description: "Add a row of cells." },
    { command: `${PROGRAM} design set hall.cutplan.json sideboard --column-openings 400,300,400 --back none --dry-run`, description: "See what new column sizes and no back change." },
    { command: `${PROGRAM} design set hall.cutplan.json eket --color 2=#ff8800`, description: "Show the second unit in orange in the layout." },
  ],
  output:
    "design (after the change), parts (the generated parts), partChanges { added, removed, resized } (part ids), removedPlacements [{ part, copy }], addedStock (the ids of the stock added for the given materials), changes, validation, written, dryRun. For a design with an error: error { code: \"invalid-value\", issues }.",
  async run(invocation) {
    const { args, options, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    assertCanGenerate(loaded);
    const { project } = loaded;
    const units = project.project.units;
    const old = findById(project.designs ?? [], args[1]!, "design");
    const requested = str(options, "id");
    const id = requested === undefined || requested === old.id ? old.id : newId(project.designs ?? [], requested, old.name, "design");
    const renamed = id === old.id ? project : renameDesign(project, old.id, id);
    const systemText = str(options, "system");
    const system = systemText === undefined ? old.system : choiceValue(systemText, "system", DESIGN_SYSTEMS);
    const known = isDesignSystem(system) ? system : "custom";
    const fields: Design = { ...old, id, system };
    fields.width = axisValue(options, WIDTH, known, units, old.width)!;
    fields.height = axisValue(options, HEIGHT, known, units, old.height)!;
    const design = fitCombined(fields);
    const depth = optionalLength(options, "depth", units);
    if (depth !== undefined) design.depth = depth;
    const name = nonEmpty(str(options, "name"), "name");
    if (name !== undefined) design.name = name;
    const material = str(options, "material");
    if (material !== undefined) design.material = resolveMaterial(project, material).id;
    const back = str(options, "back");
    if (back === "none") delete design.back;
    else if (back !== undefined) design.back = { material: resolveMaterial(project, back).id };
    const quantity = str(options, "quantity");
    if (quantity !== undefined) design.quantity = integerValue(quantity, "quantity", 1, MAX_DESIGN_QUANTITY);
    const mount = optionalChoice(options, "mount", DESIGN_MOUNTS);
    if (mount !== undefined) design.mount = mount;
    const changed = withColors({ ...renamed, designs: (renamed.designs ?? []).map((item) => (item.id === id ? design : item)) }, options, id);
    assertValid(changed, design);
    const stocked = stockFor(changed, [material === undefined ? undefined : design.material, back === undefined ? undefined : design.back?.material]);
    const next = regenerateDesigns(stocked.project);
    const result = findById(next.designs ?? [], id, "design");
    const parts = generatedParts(next, id);
    const removedPlacements = droppedCopies(renamed, next);
    const details = [...stocked.details, ...(removedPlacements.length > 0 ? [`Took ${plural(removedPlacements.length, "copy", "copies")} off the sheets.`] : [])];
    return finishMutation(invocation, loaded, next, {
      summary: `Changed design ${line(next, result)}.`,
      details,
      data: { design: result, parts, partChanges: partChanges(generatedParts(renamed, id), parts), removedPlacements, addedStock: stocked.addedStock },
    });
  },
};

const CELL_OPTIONS: OptionSpec[] = [
  { name: "cell", type: "string", value: "<column>,<row>", required: true, description: "A cell, for example 1,2 for column 1, row 2. The columns count from the left and the rows from the top, from 1." },
  { name: "to", type: "string", value: "<column>,<row>", description: "The cell at the other corner of the rectangle. Default: the cell of --cell." },
];

function cellValue(options: OptionValues, name: "cell" | "to", columns: number, rows: number): { column: number; row: number } | undefined {
  const text = str(options, name);
  if (text === undefined) return undefined;
  const match = /^\s*(\d+)\s*,\s*(\d+)\s*$/.exec(text);
  if (!match) throw usageError(`--${name} "${text}" is not <column>,<row>, for example 1,2.`, "invalid-value", { option: name, value: text });
  const column = Number(match[1]);
  const row = Number(match[2]);
  if (column < 1 || column > columns || row < 1 || row > rows) {
    throw usageError(`--${name} ${column},${row} is not in the grid of ${columns} columns and ${rows} rows.`, "invalid-value", { option: name, value: text });
  }
  return { column, row };
}

function cellText(span: CombinedCell): string {
  const columns = span.columns > 1 ? `columns ${span.column}–${span.column + span.columns - 1}` : `column ${span.column}`;
  const rows = span.rows > 1 ? `rows ${span.row}–${span.row + span.rows - 1}` : `row ${span.row}`;
  return `${columns}, ${rows}`;
}

/** The rectangle between --cell and --to, made larger to hold each combined cell that it touches. */
function selection(options: OptionValues, design: Design): CombinedCell {
  const columns = axisCells(design.width);
  const rows = axisCells(design.height);
  const a = cellValue(options, "cell", columns, rows)!;
  const b = cellValue(options, "to", columns, rows) ?? a;
  const column = Math.min(a.column, b.column);
  const row = Math.min(a.row, b.row);
  return expandSelection(design, { column, row, columns: Math.abs(a.column - b.column) + 1, rows: Math.abs(a.row - b.row) + 1 });
}

async function changeCells(invocation: Invocation, verb: "combine" | "split"): Promise<Outcome> {
  const { args, options, io } = invocation;
  const loaded = await loadProject(io, args[0]!);
  assertCanGenerate(loaded);
  const { project } = loaded;
  const old = findById(project.designs ?? [], args[1]!, "design");
  assertValid(project, old);
  const cell = selection(options, old);
  const where = `${cellText(cell)[0]!.toUpperCase()}${cellText(cell).slice(1)}`;
  const design = verb === "combine" ? combineCells(old, cell) : splitCells(old, cell);
  if (!design) throw usageError(`${where} is 1 cell. Give --to to combine 2 cells or more.`, "invalid-value", { option: "to" });
  if (design === old && verb === "split") throw usageError(`${where} of design ${old.id} is not in a combined cell.`, "invalid-value", { option: "cell" });
  const changed = { ...project, designs: (project.designs ?? []).map((item) => (item.id === old.id ? design : item)) };
  assertValid(changed, design);
  const next = regenerateDesigns(changed);
  const parts = generatedParts(next, old.id);
  const removedPlacements = droppedCopies(project, next);
  return finishMutation(invocation, loaded, next, {
    summary: verb === "combine" ? `Combined ${cellText(cell)} of design ${old.id} into one cell.` : `Split the combined cells in ${cellText(cell)} of design ${old.id}.`,
    data: { design: findById(next.designs ?? [], old.id, "design"), cell, parts, partChanges: partChanges(generatedParts(project, old.id), parts), removedPlacements },
    ...(removedPlacements.length > 0 ? { details: [`Took ${plural(removedPlacements.length, "copy", "copies")} off the sheets.`] } : {}),
  });
}

const CELL_OUTPUT =
  "design (after the change), cell { column, row, columns, rows } (the rectangle after it grew), parts (the generated parts), partChanges { added, removed, resized } (part ids), removedPlacements [{ part, copy }], changes, validation, written, dryRun.";

const combine: CommandSpec = {
  name: "design combine",
  summary: "Combine a rectangle of cells into one cell.",
  description:
    "Combine the cells in the rectangle from --cell to --to into one larger cell, and make the parts again. The boards inside the rectangle go, and the shelf over and under it becomes one long board. When the rectangle touches a combined cell, it becomes larger to hold all of it, and the combined cells inside it become part of the new cell. A rectangle of 1 cell is refused (exit 2, invalid-value). The copies of parts that go or change size leave the sheets.",
  args: [FILE_ARG, DESIGN_ARG],
  options: [...CELL_OPTIONS, ...OUTPUT_OPTIONS],
  examples: [
    { command: `${PROGRAM} design combine hall.cutplan.json kallax-4x2 --cell 1,1 --to 2,1`, description: "Combine the first two cells of the top row." },
    { command: `${PROGRAM} design combine hall.cutplan.json kallax-4x4 --cell 2,2 --to 3,3 --dry-run --json`, description: "See what a 2x2 cell in the middle changes." },
  ],
  output: CELL_OUTPUT,
  run: (invocation) => changeCells(invocation, "combine"),
};

const split: CommandSpec = {
  name: "design split",
  summary: "Split combined cells into single cells again.",
  description:
    "Split the combined cell that holds --cell into single cells, and make the parts again. With --to, split each combined cell in the rectangle from --cell to --to. A rectangle with no combined cell is refused (exit 2, invalid-value).",
  args: [FILE_ARG, DESIGN_ARG],
  options: [...CELL_OPTIONS, ...OUTPUT_OPTIONS],
  examples: [{ command: `${PROGRAM} design split hall.cutplan.json kallax-4x2 --cell 1,1`, description: "Split the combined cell at column 1, row 1." }],
  output: CELL_OUTPUT,
  run: (invocation) => changeCells(invocation, "split"),
};

const remove: CommandSpec = {
  name: "design remove",
  summary: "Remove designs and their parts.",
  description: "Remove one or more designs, the parts they make, and the copies of those parts on the sheets. Nothing is removed when any id is unknown. To keep the parts, use design detach.",
  args: [FILE_ARG, { name: "id", description: "A design id.", variadic: true }],
  options: [...OUTPUT_OPTIONS],
  examples: [{ command: `${PROGRAM} design remove hall.cutplan.json kallax-2x4`, description: "Remove a design and its parts." }],
  output: "removed (the design ids), removedParts (the part ids), removedPlacements [{ part, copy }], changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const designs = findAll(project.designs ?? [], args.slice(1), "design");
    const next = designs.reduce((p, design) => removeDesign(p, design.id), project);
    const removed = designs.map((design) => design.id);
    const removedParts = designs.flatMap((design) => generatedParts(project, design.id).map((part) => part.id));
    return finishMutation(invocation, loaded, next, {
      summary: `Removed design ${removed.join(", ")} and ${plural(removedParts.length, "part")}.`,
      data: { removed, removedParts, removedPlacements: droppedCopies(project, next) },
    });
  },
};

const detach: CommandSpec = {
  name: "design detach",
  summary: "Keep the parts of a design as normal parts, and remove the design.",
  description: "Remove a design, and keep its parts and their copies on the sheets as normal parts. After this, parts set and parts remove can change them, and no design makes them again.",
  args: [FILE_ARG, DESIGN_ARG],
  options: [...OUTPUT_OPTIONS],
  examples: [{ command: `${PROGRAM} design detach hall.cutplan.json kallax-2x4`, description: "Make the KALLAX parts normal parts." }],
  output: "detached (the design id), parts (the ids of the parts that are now normal parts), changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const design = findById(project.designs ?? [], args[1]!, "design");
    const parts = generatedParts(project, design.id).map((part) => part.id);
    return finishMutation(invocation, loaded, detachDesign(project, design.id), {
      summary: `Detached design ${design.id}: ${plural(parts.length, "part")} are now normal parts.`,
      data: { detached: design.id, parts },
    });
  },
};

const drawing: CommandSpec = {
  name: "design drawing",
  summary: "Draw the front view of a design as SVG.",
  description:
    "Draw one unit of a design from the front, to scale: the panels at their true thickness, each opening size, the outside width and height, the depth, and the legs, feet, or wall rail. Each board has the name of its part as its title, and the boards that a combined cell makes also have a label. With --step, draw one assembly step in place of the front view: the boards of the step are blue, the boards from earlier steps have the colour of the design, and the boards of later steps are grey outlines. The step numbers are those of 'report assembly --design <id>'. The default target is standard output. A design with an error has no drawing (exit 1, design-invalid).",
  args: [FILE_ARG, DESIGN_ARG],
  options: [
    { name: "out", type: "string", value: "<path|->", description: "The SVG file to write, or - for standard output. Default: standard output." },
    { name: "step", type: "string", value: "<n>", description: "Draw assembly step n of the design, from 1." },
  ],
  examples: [
    { command: `${PROGRAM} design drawing hall.cutplan.json kallax-2x4 --out hall.svg`, description: "Write the drawing to hall.svg." },
    { command: `${PROGRAM} design drawing hall.cutplan.json kallax-2x4 > hall.svg`, description: "Print the drawing." },
    { command: `${PROGRAM} design drawing hall.cutplan.json kallax-2x4 --step 5 --out step-5.svg`, description: "Write the drawing of assembly step 5." },
  ],
  output:
    "design (the id), path when --out is a file; svg on standard output. With --step, also step, title, and description (a text alternative for the drawing). For a design with an error: error { code: \"design-invalid\", issues }.",
  async run({ args, options, io }) {
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const design = findById(project.designs ?? [], args[1]!, "design");
    const stepText = str(options, "step");
    let svg: string | null;
    let data: Record<string, unknown> = { design: design.id };
    if (stepText === undefined) svg = designElevationSvg(project, design.id);
    else {
      const drawings = assemblyDrawings(project, design.id);
      if (drawings === null) throw invalidDesign(project, design);
      const step = integerValue(stepText, "step", 1, drawings.length);
      svg = drawings[step - 1]!.svg;
      data = { ...data, step, title: assemblySteps(project, design.id)![step - 1]!.title, description: drawings[step - 1]!.description };
    }
    if (svg === null) throw invalidDesign(project, design);
    const warnings = warningLines(loaded);
    const out = str(options, "out") ?? "-";
    if (out === "-") return { data: { ...data, svg }, text: "", payload: `${svg}\n`, warnings };
    await writeOutput(io, out, `${svg}\n`);
    return { data: { ...data, path: out }, text: `Wrote ${out}.`, warnings };
  },
};

/** The error for a read command on a design that makes no parts. */
export function invalidDesign(project: Project, design: Design): CliError {
  const issues = designIssues(project, design.id).filter((issue) => issue.severity === "error");
  const reason = isNewerMinor(project.version)
    ? `the file has the newer format version ${project.version}`
    : !isDesignSystem(design.system)
      ? `the system "${design.system}" is not known`
      : issues.map((issue) => issue.message).join(" ");
  return new CliError(EXIT.failed, "design-invalid", `The design ${design.id} makes no parts: ${reason}`, { id: design.id, issues });
}

export const designGroup: GroupSpec = { name: "design", summary: "Cabinet designs (KALLAX, EKET, custom)", commands: [systems, list, get, add, set, combine, split, remove, detach, drawing] };
