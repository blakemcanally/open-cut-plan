import { moveTool, newTool, presetTool, removeTool, TOOL_PRESETS, TOOL_TYPE_NAMES, TOOL_TYPES, updateTool, type Project, type Tool, type ToolType } from "@opencutplan/core";
import { PROGRAM } from "../help.ts";
import { FILE_ARG, finishMutation, loadProject, OUTPUT_OPTIONS, warningLines } from "../project.ts";
import { usageError, type CommandSpec, type GroupSpec, type OptionValues } from "../spec.ts";
import { len, table } from "../text.ts";
import { integerValue, optionalBoolean, optionalChoice, optionalLength, str } from "../values.ts";
import { assertNoConflict, findAll, findById, ID_OPTION, newId, nonEmpty, unsetFields, unsetOption } from "./common.ts";

const LIMITS = ["max-rip", "max-crosscut", "max-piece-length", "max-piece-width", "max-crosscut-piece-length", "max-crosscut-piece-width", "max-cut", "max-stages"] as const;
type Limit = (typeof LIMITS)[number];

const APPLIES: Readonly<Record<ToolType, readonly Limit[]>> = {
  "table-saw": ["max-rip", "max-crosscut", "max-piece-length", "max-piece-width", "max-crosscut-piece-length", "max-crosscut-piece-width"],
  "track-saw": ["max-cut"],
  "circular-saw": ["max-cut"],
  "panel-saw": ["max-cut", "max-stages"],
  "miter-saw": ["max-cut"],
};

const PIECES = [
  { field: "maxPiece", length: "max-piece-length", width: "max-piece-width" },
  { field: "maxCrosscutPiece", length: "max-crosscut-piece-length", width: "max-crosscut-piece-width" },
] as const;

const OPTIONS = {
  name: { name: "name", type: "string", value: "<text>", description: "The tool name. Default for add: the type name, such as \"Table saw\"." },
  kerf: { name: "kerf", type: "string", value: "<length>", description: "The blade width. Default for add: 1/8\" or 3 mm." },
  enabled: { name: "enabled", type: "string", value: "<true|false>", description: "false leaves the tool out of cut assignment. Default for add: true." },
  "max-rip": { name: "max-rip", type: "string", value: "<length>", description: "Table saw: the fence-to-blade capacity." },
  "max-crosscut": { name: "max-crosscut", type: "string", value: "<length>", description: "Table saw: the sled or mitre gauge capacity." },
  "max-piece-length": {
    name: "max-piece-length",
    type: "string",
    value: "<length>",
    description: "Table saw: the length of the largest piece you can control for a rip, and for a crosscut when the crosscut piece has no limit. Give it with --max-piece-width.",
  },
  "max-piece-width": { name: "max-piece-width", type: "string", value: "<length>", description: "Table saw: the width of the largest piece you can control for a rip." },
  "max-crosscut-piece-length": {
    name: "max-crosscut-piece-length",
    type: "string",
    value: "<length>",
    description: "Table saw: the length of the largest piece you can control for a crosscut, on the sled or the mitre gauge. Give it with --max-crosscut-piece-width.",
  },
  "max-crosscut-piece-width": { name: "max-crosscut-piece-width", type: "string", value: "<length>", description: "Table saw: the width of the largest piece you can control for a crosscut." },
  "max-cut": {
    name: "max-cut",
    type: "string",
    value: "<length>",
    description: "Track, circular, or panel saw: the longest cut. Mitre saw: the widest piece that it can cut across; the piece can have any length.",
  },
  "max-stages": { name: "max-stages", type: "string", value: "<n>", description: "Panel saw: the deepest cut stage." },
} as const;

const LIMIT_OPTIONS = LIMITS.map((name) => OPTIONS[name]);

function line(project: Project, tool: Tool): string {
  return `${tool.id} (${tool.name}, ${tool.type}, kerf ${len(project, tool.kerf)}${tool.enabled ? "" : ", disabled"})`;
}

function limitsText(project: Project, tool: Tool): string {
  const out: string[] = [];
  if (tool.type === "table-saw") {
    if (tool.maxRip !== undefined) out.push(`rip ${len(project, tool.maxRip)}`);
    if (tool.maxCrosscut !== undefined) out.push(`crosscut ${len(project, tool.maxCrosscut)}`);
    if (tool.maxPiece) out.push(`piece ${len(project, tool.maxPiece.length)} × ${len(project, tool.maxPiece.width)}`);
    if (tool.maxCrosscutPiece) out.push(`crosscut piece ${len(project, tool.maxCrosscutPiece.length)} × ${len(project, tool.maxCrosscutPiece.width)}`);
  } else {
    if (tool.maxCut !== undefined) out.push(`cut ${len(project, tool.maxCut)}`);
    if (tool.type === "panel-saw" && tool.maxStages !== undefined) out.push(`stages ${tool.maxStages}`);
  }
  return out.join(", ");
}

function applyLimits(project: Project, tool: Tool, options: OptionValues, unset: readonly Limit[]): Tool {
  const units = project.project.units;
  for (const limit of LIMITS) {
    if ((options[limit] !== undefined || unset.includes(limit)) && !APPLIES[tool.type].includes(limit)) {
      throw usageError(`--${limit} does not apply to a ${tool.type}. Limits for a ${tool.type}: ${APPLIES[tool.type].join(", ") || "none"}.`, "invalid-option", { option: limit });
    }
  }
  const next: Record<string, unknown> = { ...tool };
  const setLength = (option: Limit, field: string) => {
    const value = optionalLength(options, option, units);
    if (value !== undefined) next[field] = value;
    if (unset.includes(option)) delete next[field];
  };
  setLength("max-rip", "maxRip");
  setLength("max-crosscut", "maxCrosscut");
  setLength("max-cut", "maxCut");
  const stages = str(options, "max-stages");
  if (stages !== undefined) next.maxStages = integerValue(stages, "max-stages", 1);
  if (unset.includes("max-stages")) delete next.maxStages;
  if (tool.type === "table-saw") {
    for (const piece of PIECES) {
      const length = optionalLength(options, piece.length, units);
      const width = optionalLength(options, piece.width, units);
      if (length !== undefined || width !== undefined) {
        const old = tool[piece.field];
        if (!old && (length === undefined || width === undefined)) {
          throw usageError(`Give both --${piece.length} and --${piece.width}.`, "missing-option", { option: length === undefined ? piece.length : piece.width });
        }
        next[piece.field] = { ...old, length: length ?? old!.length, width: width ?? old!.width };
      }
      if (unset.includes(piece.length) || unset.includes(piece.width)) delete next[piece.field];
    }
  }
  return next as Tool;
}

function applyBase(project: Project, tool: Tool, options: OptionValues): Tool {
  const next = { ...tool };
  const name = nonEmpty(str(options, "name"), "name");
  if (name !== undefined) next.name = name;
  const kerf = optionalLength(options, "kerf", project.project.units, { allowZero: true });
  if (kerf !== undefined) next.kerf = kerf;
  const enabled = optionalBoolean(options, "enabled");
  if (enabled !== undefined) next.enabled = enabled;
  return next;
}

function toPosition(project: Project, id: string, text: string): Project {
  const target = integerValue(text, "position", 1);
  if (target > project.tools.length) throw usageError(`--position must be from 1 to ${project.tools.length}.`, "invalid-value", { option: "position", value: text });
  let next = project;
  let index = next.tools.findIndex((tool) => tool.id === id);
  while (index + 1 !== target) {
    next = moveTool(next, id, index + 1 < target ? 1 : -1);
    index = next.tools.findIndex((tool) => tool.id === id);
  }
  return next;
}

const POSITION = { name: "position", type: "string", value: "<n>", description: "The 1-based place in the tool order. The cut analysis gives each cut the first enabled tool, in this order, that can make it." } as const;

const list: CommandSpec = {
  name: "tools list",
  summary: "List the tools in preference order.",
  description: "List the tools in the order that the cut analysis tries them.",
  args: [FILE_ARG],
  options: [],
  examples: [{ command: `${PROGRAM} tools list shelf.cutplan.json`, description: "List the tools." }],
  output: "units, tools [{ id, name, type, kerf, enabled, maxRip?, maxCrosscut?, maxPiece? { length, width }, maxCrosscutPiece? { length, width }, maxCut?, maxStages?, position }]. position (1-based) is derived; it is not a file field.",
  async run({ args, io }) {
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const tools = project.tools.map((tool, index) => ({ ...tool, position: index + 1 }));
    const text = table(
      ["#", "id", "name", "type", "kerf", "enabled", "limits"],
      tools.map((t) => [String(t.position), t.id, t.name, t.type, len(project, t.kerf), String(t.enabled), limitsText(project, t)]),
    );
    return { data: { units: project.project.units, tools }, text, warnings: warningLines(loaded) };
  },
};

const get: CommandSpec = {
  name: "tools get",
  summary: "Show one tool.",
  description: "Show one tool by id.",
  args: [FILE_ARG, { name: "id", description: "The tool id." }],
  options: [],
  examples: [{ command: `${PROGRAM} tools get shelf.cutplan.json table-saw --json`, description: "Show the table saw." }],
  output: "units, tool, position (1-based).",
  async run({ args, io }) {
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const tool = findById(project.tools, args[1]!, "tool");
    const position = project.tools.indexOf(tool) + 1;
    const limits = limitsText(project, tool);
    return { data: { units: project.project.units, tool, position }, text: `${position}. ${line(project, tool)}${limits ? `, limits: ${limits}` : ""}.`, warnings: warningLines(loaded) };
  },
};

const add: CommandSpec = {
  name: "tools add",
  summary: "Add a saw.",
  description:
    "Add a saw with its kerf and limits. Give --type or --preset. A missing limit gets the default of its type, or the typical value of the preset (see docs/cut-analysis.md); tools set --unset removes a limit. The tool goes last in the order unless you give --position.",
  args: [FILE_ARG],
  options: [
    { name: "type", type: "string", value: `<${TOOL_TYPES.join("|")}>`, description: "The kind of saw." },
    {
      name: "preset",
      type: "string",
      value: `<${TOOL_PRESETS.map((preset) => preset.id).join("|")}>`,
      description: "A common saw with typical values for its name, kerf, and limits. Check the values against your saw. Other options change them.",
    },
    OPTIONS.name,
    OPTIONS.kerf,
    OPTIONS.enabled,
    ...LIMIT_OPTIONS,
    POSITION,
    ID_OPTION,
    ...OUTPUT_OPTIONS,
  ],
  examples: [
    { command: `${PROGRAM} tools add shelf.cutplan.json --type track-saw --max-cut 110 --position 1`, description: "Add a track saw with a 110\" track, and try it first." },
    { command: `${PROGRAM} tools add shelf.cutplan.json --type table-saw --name "Jobsite saw" --kerf 3/32 --max-rip 24 --max-piece-length 48 --max-piece-width 30`, description: "Add a small table saw." },
    { command: `${PROGRAM} tools add shelf.cutplan.json --preset sliding-miter-saw --max-cut 16`, description: "Add a 12\" sliding mitre saw that cuts across pieces up to 16\" wide." },
  ],
  output: "tool (the new tool), position, changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, options, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const preset = optionalChoice(options, "preset", TOOL_PRESETS.map((p) => p.id));
    const type = optionalChoice(options, "type", TOOL_TYPES);
    if (preset !== undefined && type !== undefined) throw usageError("Give --type or --preset, not both.", "invalid-option", { option: "type" });
    if (preset === undefined && type === undefined) throw usageError("Give --type or --preset.", "missing-option", { option: "type" });
    const start = preset === undefined ? newTool(type!, project.project.units, new Set()) : presetTool(preset, project.project.units, new Set());
    const given = nonEmpty(str(options, "name"), "name");
    const name = given ?? start.name;
    const base: Tool = { ...start, id: newId(project.tools, str(options, "id"), given ?? TOOL_TYPE_NAMES[start.type], "tool"), name };
    const tool = applyLimits(project, applyBase(project, base, options), options, []);
    let next: Project = { ...project, tools: [...project.tools, tool] };
    const position = str(options, "position");
    if (position !== undefined) next = toPosition(next, tool.id, position);
    return finishMutation(invocation, loaded, next, {
      summary: `Added tool ${line(project, tool)}.`,
      data: { tool, position: next.tools.findIndex((t) => t.id === tool.id) + 1 },
    });
  },
};

const set: CommandSpec = {
  name: "tools set",
  summary: "Change a tool.",
  description: "Change the name, kerf, enabled switch, or limits of a tool. Only the fields you give change. The id and the type do not change.",
  args: [FILE_ARG, { name: "id", description: "The tool id." }],
  options: [OPTIONS.name, OPTIONS.kerf, OPTIONS.enabled, ...LIMIT_OPTIONS, unsetOption([...LIMITS]), ...OUTPUT_OPTIONS],
  examples: [
    { command: `${PROGRAM} tools set shelf.cutplan.json table-saw --max-rip 30 --kerf 1/8`, description: "Set the rip capacity and the kerf." },
    { command: `${PROGRAM} tools set shelf.cutplan.json table-saw --unset max-rip`, description: "Remove the rip limit." },
  ],
  output: "tool (after the change), changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, options, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const old = findById(project.tools, args[1]!, "tool");
    const unset = unsetFields(options, LIMITS);
    assertNoConflict(options, [...LIMITS], unset);
    const tool = applyLimits(project, applyBase(project, old, options), options, unset);
    const next = updateTool(project, old.id, () => tool);
    return finishMutation(invocation, loaded, next, { summary: `Changed tool ${line(next, tool)}.`, data: { tool } });
  },
};

const remove: CommandSpec = {
  name: "tools remove",
  summary: "Remove tools.",
  description: "Remove one or more tools. Nothing is removed when any id is unknown. A plan with no enabled tool has a no-tool error.",
  args: [FILE_ARG, { name: "id", description: "A tool id.", variadic: true }],
  options: [...OUTPUT_OPTIONS],
  examples: [{ command: `${PROGRAM} tools remove shelf.cutplan.json circular-saw`, description: "Remove a tool." }],
  output: "removed (the ids), changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const tools = findAll(project.tools, args.slice(1), "tool");
    const next = tools.reduce((p, tool) => removeTool(p, tool.id), project);
    const removed = tools.map((tool) => tool.id);
    return finishMutation(invocation, loaded, next, { summary: `Removed tool ${removed.join(", ")}.`, data: { removed } });
  },
};

const move: CommandSpec = {
  name: "tools move",
  summary: "Change the place of a tool in the preference order.",
  description: "Move a tool to a new place in the tool order. The cut analysis gives each cut the first enabled tool, in this order, that can make it.",
  args: [FILE_ARG, { name: "id", description: "The tool id." }],
  options: [{ ...POSITION, required: true }, ...OUTPUT_OPTIONS],
  examples: [{ command: `${PROGRAM} tools move shelf.cutplan.json track-saw --position 1`, description: "Try the track saw first." }],
  output: "order (the tool ids in the new order), changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, options, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const tool = findById(project.tools, args[1]!, "tool");
    const next = toPosition(project, tool.id, str(options, "position")!);
    const order = next.tools.map((t) => t.id);
    return finishMutation(invocation, loaded, next, { summary: `Moved tool ${tool.id} to place ${order.indexOf(tool.id) + 1}: ${order.join(", ")}.`, data: { order } });
  },
};

export const toolsGroup: GroupSpec = { name: "tools", summary: "Tools (saws)", commands: [list, get, add, set, remove, move] };
