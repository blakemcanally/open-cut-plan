import { FACTORY_EDGE_CHOICES, factoryEdgeRequest, GrainSchema, isHexColor, MAX_PART_QUANTITY, partColors, removePart, setGroupColor, updatePart, type Part, type Patch, type Project } from "@opencutplan/core";
import { PROGRAM } from "../help.ts";
import { FILE_ARG, finishMutation, loadProject, OUTPUT_OPTIONS, warningLines } from "../project.ts";
import { usageError, type CommandSpec, type GroupSpec, type OptionValues } from "../spec.ts";
import { len, size, table } from "../text.ts";
import { integerValue, optionalChoice, optionalLength, str } from "../values.ts";
import { assertNoConflict, assertNotGenerated, findAll, findById, ID_OPTION, materialFor, newId, nonEmpty, resolveMaterial, unsetFields, unsetOption } from "./common.ts";
import { CSV_ARGS, EXPORT_OUT, exportCsv, importCsv, importOptions } from "./csv.ts";

const GRAINS = GrainSchema.options;

const OPTIONS = {
  name: { name: "name", type: "string", value: "<text>", description: "The part name." },
  length: { name: "length", type: "string", value: "<length>", description: "The finished length (the first dimension)." },
  width: { name: "width", type: "string", value: "<length>", description: "The finished width." },
  quantity: { name: "quantity", type: "string", value: "<n>", description: `The number of copies, 1 to ${MAX_PART_QUANTITY}. Default for add: 1.` },
  material: { name: "material", type: "string", value: "<id|name>", description: "The material id or name. For add, required when the project has more than one material." },
  grain: { name: "grain", type: "string", value: "<length|width|none>", description: "The part dimension that must run along the stock grain, or none. Default for add: length." },
  factoryEdge: {
    name: "factory-edge",
    type: "string",
    value: `<${FACTORY_EDGE_CHOICES.join("|")}>`,
    description: "long asks for a long edge of the part on a factory edge of the sheet; none does not. Without it, the rule factoryEdge.minLength of the settings decides.",
  },
  group: { name: "group", type: "string", value: "<text>", description: "An assembly or cabinet name, for colours and labels." },
  notes: { name: "notes", type: "string", value: "<text>", description: "Notes." },
} as const;

function placedCopies(project: Project, id: string): number {
  return (project.plan?.sheets ?? []).reduce((sum, sheet) => sum + sheet.placements.filter((p) => p.part === id).length, 0);
}

function line(project: Project, part: Part): string {
  return `${part.id} (${part.name}, ${size(project, part)}, ×${part.quantity})`;
}

function fields(project: Project, options: OptionValues): Patch<Part> {
  const units = project.project.units;
  const patch: Patch<Part> = {};
  const name = nonEmpty(str(options, "name"), "name");
  if (name !== undefined) patch.name = name;
  const length = optionalLength(options, "length", units);
  if (length !== undefined) patch.length = length;
  const width = optionalLength(options, "width", units);
  if (width !== undefined) patch.width = width;
  const quantity = str(options, "quantity");
  if (quantity !== undefined) patch.quantity = integerValue(quantity, "quantity", 1, MAX_PART_QUANTITY);
  const material = str(options, "material");
  if (material !== undefined) patch.material = resolveMaterial(project, material).id;
  const grain = optionalChoice(options, "grain", GRAINS);
  if (grain !== undefined) patch.grain = grain;
  const factoryEdge = optionalChoice(options, "factory-edge", FACTORY_EDGE_CHOICES);
  if (factoryEdge !== undefined) patch.factoryEdge = factoryEdge;
  const group = str(options, "group");
  if (group !== undefined) patch.group = group;
  const notes = str(options, "notes");
  if (notes !== undefined) patch.notes = notes;
  return patch;
}

function factoryEdgeText(project: Project, part: Part): string {
  if (part.factoryEdge !== undefined) return part.factoryEdge;
  return factoryEdgeRequest(project, part) === null ? "" : "long (rule)";
}

function droppedCopies(before: Project, after: Project): { part: string; copy: number }[] {
  const kept = new Set((after.plan?.sheets ?? []).flatMap((s) => s.placements.map((p) => `${p.part}#${p.copy}`)));
  return (before.plan?.sheets ?? []).flatMap((s) => s.placements.filter((p) => !kept.has(`${p.part}#${p.copy}`)).map((p) => ({ part: p.part, copy: p.copy })));
}

const list: CommandSpec = {
  name: "parts list",
  summary: "List the parts.",
  description: "List the parts, with the number of copies of each part that the plan places.",
  args: [FILE_ARG],
  options: [],
  examples: [{ command: `${PROGRAM} parts list shelf.cutplan.json`, description: "List the parts as a table." }],
  output: "units, parts [{ id, name, material, length, width, quantity, grain, factoryEdge?, group?, notes?, placedCopies }]. placedCopies is derived; it is not a file field. The text column factory edge shows long (rule) for a part that the settings rule asks for.",
  async run({ args, io }) {
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const parts = project.parts.map((part) => ({ ...part, placedCopies: placedCopies(project, part.id) }));
    const text = table(
      ["id", "name", "length", "width", "qty", "placed", "material", "grain", "factory edge", "group"],
      parts.map((p) => [p.id, p.name, len(project, p.length), len(project, p.width), String(p.quantity), String(p.placedCopies), p.material, p.grain, factoryEdgeText(project, p), p.group ?? ""]),
    );
    return { data: { units: project.project.units, parts }, text, warnings: warningLines(loaded) };
  },
};

const get: CommandSpec = {
  name: "parts get",
  summary: "Show one part.",
  description: "Show one part by id.",
  args: [FILE_ARG, { name: "id", description: "The part id." }],
  options: [],
  examples: [{ command: `${PROGRAM} parts get shelf.cutplan.json a-side --json`, description: "Show the part a-side." }],
  output: "units, part { id, name, material, length, width, quantity, grain, factoryEdge?, group?, notes? }, placedCopies.",
  async run({ args, io }) {
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const part = findById(project.parts, args[1]!, "part");
    const placed = placedCopies(project, part.id);
    return { data: { units: project.project.units, part, placedCopies: placed }, text: `${line(project, part)}, ${placed} placed.`, warnings: warningLines(loaded) };
  },
};

const add: CommandSpec = {
  name: "parts add",
  summary: "Add a part.",
  description: "Add a part. The new part is not placed; run optimize or layout move to place it.",
  args: [FILE_ARG],
  options: [
    { ...OPTIONS.name, required: true },
    { ...OPTIONS.length, required: true },
    { ...OPTIONS.width, required: true },
    OPTIONS.quantity,
    OPTIONS.material,
    OPTIONS.grain,
    OPTIONS.factoryEdge,
    OPTIONS.group,
    OPTIONS.notes,
    ID_OPTION,
    ...OUTPUT_OPTIONS,
  ],
  examples: [
    { command: `${PROGRAM} parts add shelf.cutplan.json --name Side --length "30 1/2" --width 12 --quantity 2 --material ply`, description: "Add two sides; the id is side." },
    { command: `${PROGRAM} parts add shelf.cutplan.json --name Back --length 762mm --width 600mm --grain none --group Cabinet`, description: "Add a part in millimetres to an inch project." },
  ],
  output: "part (the new part), changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, options, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const patch = fields(project, options);
    const material = patch.material ?? materialFor(project, undefined).id;
    const part: Part = {
      id: newId(project.parts, str(options, "id"), patch.name!, "part"),
      name: patch.name!,
      material,
      length: patch.length!,
      width: patch.width!,
      quantity: patch.quantity ?? 1,
      grain: patch.grain ?? "length",
    };
    if (patch.factoryEdge !== undefined) part.factoryEdge = patch.factoryEdge;
    if (patch.group !== undefined) part.group = patch.group;
    if (patch.notes !== undefined) part.notes = patch.notes;
    const next = { ...project, parts: [...project.parts, part] };
    return finishMutation(invocation, loaded, next, { summary: `Added part ${line(project, part)}.`, data: { part } });
  },
};

const set: CommandSpec = {
  name: "parts set",
  summary: "Change a part.",
  description:
    "Change the fields of a part. Only the fields you give change. The id does not change. A lower quantity takes the extra copies off the sheets, as the app does; removedPlacements lists them. A part that a design makes cannot change (exit 1, generated-part); change the design instead.",
  args: [FILE_ARG, { name: "id", description: "The part id." }],
  options: [OPTIONS.name, OPTIONS.length, OPTIONS.width, OPTIONS.quantity, OPTIONS.material, OPTIONS.grain, OPTIONS.factoryEdge, OPTIONS.group, OPTIONS.notes, unsetOption(["factory-edge", "group", "notes"]), ...OUTPUT_OPTIONS],
  examples: [
    { command: `${PROGRAM} parts set shelf.cutplan.json side --quantity 4 --width "11 7/8"`, description: "Change the quantity and the width." },
    { command: `${PROGRAM} parts set shelf.cutplan.json side --unset group --dry-run`, description: "See what removing the group changes." },
    { command: `${PROGRAM} parts set shelf.cutplan.json side --factory-edge long`, description: "Put a long edge of the side on a factory edge of the sheet." },
  ],
  output: "part (after the change), removedPlacements [{ part, copy }], changes, validation, written, dryRun. For a generated part: error { code: \"generated-part\", id, design }.",
  async run(invocation) {
    const { args, options, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const old = findById(project.parts, args[1]!, "part");
    assertNotGenerated(project, old);
    const unset = unsetFields(options, ["factory-edge", "group", "notes"] as const);
    assertNoConflict(options, ["factory-edge", "group", "notes"], unset);
    const patch = fields(project, options);
    for (const field of unset) patch[field === "factory-edge" ? "factoryEdge" : field] = undefined;
    const next = updatePart(project, old.id, patch);
    const part = findById(next.parts, old.id, "part");
    const removedPlacements = droppedCopies(project, next);
    return finishMutation(invocation, loaded, next, {
      summary: `Changed part ${line(next, part)}.`,
      data: { part, removedPlacements },
      ...(removedPlacements.length > 0 ? { details: [`Took ${removedPlacements.length} copies off the sheets.`] } : {}),
    });
  },
};

const remove: CommandSpec = {
  name: "parts remove",
  summary: "Remove parts and their placements.",
  description: "Remove one or more parts. Their copies leave the plan. Nothing is removed when any id is unknown, or when a design makes any of the parts (exit 1, generated-part).",
  args: [FILE_ARG, { name: "id", description: "A part id.", variadic: true }],
  options: [...OUTPUT_OPTIONS],
  examples: [{ command: `${PROGRAM} parts remove shelf.cutplan.json side shelf-2`, description: "Remove two parts." }],
  output: "removed (the ids), removedPlacements [{ part, copy }], changes, validation, written, dryRun. For a generated part: error { code: \"generated-part\", id, design }.",
  async run(invocation) {
    const { args, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const parts = findAll(project.parts, args.slice(1), "part");
    for (const part of parts) assertNotGenerated(project, part);
    const next = parts.reduce((p, part) => removePart(p, part.id), project);
    const removed = parts.map((part) => part.id);
    return finishMutation(invocation, loaded, next, { summary: `Removed part ${removed.join(", ")}.`, data: { removed, removedPlacements: droppedCopies(project, next) } });
  },
};

const colors: CommandSpec = {
  name: "parts colors",
  summary: "List the colours of the layout.",
  description:
    "List the colour of each unit of a design and of each group of parts without a design, as the layout shows them. A design with a quantity of more than 1 has one colour for each unit, such as \"Hall KALLAX 2 of 3\". Parts without a design or a group are grey. chosen is true for a colour that design set --color or parts group-color gave.",
  args: [FILE_ARG],
  options: [],
  examples: [{ command: `${PROGRAM} parts colors hall.cutplan.json`, description: "List the colours as a table." }],
  output: "colors [{ key, label, color, chosen, design? and unit? (for a design), group? (for a group) }], in the order that they first occur in the parts.",
  async run({ args, io }) {
    const loaded = await loadProject(io, args[0]!);
    const legend = partColors(loaded.project).legend;
    const text = legend.length === 0 ? "No part has a design or a group." : table(["colour", "for"], legend.map((key) => [`${key.color}${key.chosen ? " (chosen)" : ""}`, key.label]));
    return { data: { colors: legend }, text, warnings: warningLines(loaded) };
  },
};

const groupColor: CommandSpec = {
  name: "parts group-color",
  summary: "Choose the colour of a group of parts.",
  description:
    "Choose the colour in the layout of the parts without a design that have this group. auto gives the group its automatic colour again. For the parts of a design, use design set --color.",
  args: [FILE_ARG, { name: "group", description: "The group name." }, { name: "color", description: "#rrggbb, or auto." }],
  options: [...OUTPUT_OPTIONS],
  examples: [
    { command: `${PROGRAM} parts group-color shelf.cutplan.json "3x2 A" "#ff8800"`, description: "Show the group 3x2 A in orange." },
    { command: `${PROGRAM} parts group-color shelf.cutplan.json "3x2 A" auto`, description: "Use the automatic colour again." },
  ],
  output: "group, color (null for auto), changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const [, group, text] = args as [string, string, string];
    const designs = new Set((project.designs ?? []).map((design) => design.id));
    const known = [...new Set(project.parts.flatMap((part) => (part.group !== undefined && !(part.design !== undefined && designs.has(part.design)) ? [part.group] : [])))];
    if (!known.includes(group)) {
      const design = (project.designs ?? []).find((candidate) => candidate.name === group);
      const hint = design ? ` The parts of the design ${design.id} have this group. Use 'opencutplan design set --color' for them.` : "";
      throw usageError(`No part without a design has the group "${group}".${hint} Known groups: ${known.length > 0 ? known.join(", ") : "none"}.`, "not-found", { group, known });
    }
    const color = text.trim().toLowerCase();
    if (color !== "auto" && !isHexColor(color)) throw usageError(`"${text}" is not #rrggbb or auto.`, "invalid-value", { value: text });
    const chosen = color === "auto" ? null : color;
    return finishMutation(invocation, loaded, setGroupColor(project, group, chosen), {
      summary: chosen === null ? `The group ${group} uses its automatic colour.` : `The group ${group} is ${chosen}.`,
      data: { group, color: chosen },
    });
  },
};

const importParts: CommandSpec = {
  name: "parts import",
  summary: "Add the parts in a CSV file.",
  description:
    "Add the parts in a CSV file, as the app's import does. The columns are guessed from the header (name, length, width, quantity, material, grain, group, notes, thickness, and common names from other tools); use --map for other names. Rows with errors are skipped and listed. Materials are matched by name; new ones are created. When the length or width column is missing, the command exits 1 with the headers, and writes nothing.",
  args: CSV_ARGS,
  options: importOptions("parts"),
  examples: [
    { command: `${PROGRAM} parts import shelf.cutplan.json parts.csv`, description: "Import a parts list with a header." },
    { command: `${PROGRAM} parts import shelf.cutplan.json cut.csv --map length="Cut L" --map width=3 --strict`, description: "Map two columns, and refuse the import when a row has an error." },
  ],
  output:
    "imported (count), ids (new part ids), createdMaterials, csvIssues [{ severity, row, column?, message }], mapping { field: header }, changes, validation, written, dryRun. When columns are missing (exit 1): error { code: \"needs-mapping\" }, missing, headers, mapping.",
  run: (invocation) => importCsv(invocation, "parts"),
};

const exportParts: CommandSpec = {
  name: "parts export",
  summary: "Write the parts as CSV.",
  description: "Write the parts list as CSV (name,length,width,quantity,material,grain,group,notes), the same file as the app's Export parts CSV. The same as export parts-csv.",
  args: [FILE_ARG],
  options: [EXPORT_OUT],
  examples: [{ command: `${PROGRAM} parts export shelf.cutplan.json --out shelf-parts.csv`, description: "Write the parts CSV to a file." }],
  output: "path and rows when --out is a file; csv and rows when the CSV goes to stdout.",
  run: (invocation) => exportCsv(invocation, "parts"),
};

export const partsGroup: GroupSpec = { name: "parts", summary: "Parts to cut", commands: [list, get, add, set, remove, colors, groupColor, importParts, exportParts] };
