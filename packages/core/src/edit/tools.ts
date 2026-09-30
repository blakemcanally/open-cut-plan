import { slugify, uniqueId } from "../format/ids.ts";
import type { PlanSheet, Project, Tool, ToolType } from "../format/schema.ts";
import type { Units } from "../geometry/units.ts";
import { matchesChoice, type Step } from "../sequence/sequence.ts";
import { idsOf } from "./patch.ts";

export const TOOL_TYPE_NAMES: Readonly<Record<ToolType, string>> = {
  "table-saw": "Table saw",
  "track-saw": "Track saw",
  "circular-saw": "Circular saw",
  "panel-saw": "Panel saw",
};

export const TOOL_TYPES = Object.keys(TOOL_TYPE_NAMES) as ToolType[];

export const DEFAULT_KERF: Readonly<Record<Units, number>> = { in: 0.125, mm: 3 };

const DEFAULT_LIMITS: Readonly<Record<Units, Partial<Record<ToolType, object>>>> = {
  in: { "table-saw": { maxPiece: { length: 96, width: 24 }, maxRip: 24, maxCrosscut: 24 }, "track-saw": { maxCut: 110 } },
  mm: { "table-saw": { maxPiece: { length: 2440, width: 610 }, maxRip: 610, maxCrosscut: 610 }, "track-saw": { maxCut: 2800 } },
};

export function newTool(type: ToolType, units: Units, taken: ReadonlySet<string>): Tool {
  const name = TOOL_TYPE_NAMES[type];
  return { id: uniqueId(slugify(name), taken), name, type, kerf: DEFAULT_KERF[units], enabled: true, ...DEFAULT_LIMITS[units][type] };
}

/** The tools of a new project: the table saw takes the cuts within its limits, the track saw breaks down the full sheets. */
export function defaultTools(units: Units): Tool[] {
  const table = newTool("table-saw", units, new Set());
  return [table, newTool("track-saw", units, new Set([table.id]))];
}

export function addTool(project: Project, type: ToolType): Project {
  return { ...project, tools: [...project.tools, newTool(type, project.project.units, idsOf(project.tools))] };
}

export function updateTool(project: Project, id: string, change: (tool: Tool) => Tool): Project {
  return { ...project, tools: project.tools.map((tool) => (tool.id === id ? change(tool) : tool)) };
}

export function removeTool(project: Project, id: string): Project {
  return { ...project, tools: project.tools.filter((tool) => tool.id !== id) };
}

/** Tool order is the preference order for cut assignment. */
export function moveTool(project: Project, id: string, delta: -1 | 1): Project {
  const from = project.tools.findIndex((tool) => tool.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= project.tools.length) return project;
  const tools = [...project.tools];
  [tools[from], tools[to]] = [tools[to]!, tools[from]!];
  return { ...project, tools };
}

export function setToolChoice(project: Project, step: Pick<Step, "sheet" | "axis" | "at" | "from" | "to" | "recommended">, tool: string | null): Project {
  if (!project.plan) return project;
  const sheets = project.plan.sheets.map((sheet): PlanSheet => {
    if (sheet.id !== step.sheet) return sheet;
    const { toolChoices, ...rest } = sheet;
    const kept = (toolChoices ?? []).filter((choice) => !matchesChoice(step, choice));
    const choices = tool === null || tool === step.recommended?.id ? kept : [...kept, { axis: step.axis, at: step.at, from: step.from, to: step.to, tool }];
    return choices.length > 0 ? { ...rest, toolChoices: choices } : rest;
  });
  return { ...project, plan: { ...project.plan, sheets } };
}
