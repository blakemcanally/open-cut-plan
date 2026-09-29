import { slugify, uniqueId } from "../format/ids.ts";
import type { Project, Tool, ToolType } from "../format/schema.ts";
import type { Units } from "../geometry/units.ts";
import { idsOf } from "./patch.ts";

export const TOOL_TYPES: readonly ToolType[] = ["table-saw", "track-saw", "circular-saw", "panel-saw"];

export const TOOL_TYPE_NAMES: Readonly<Record<ToolType, string>> = {
  "table-saw": "Table saw",
  "track-saw": "Track saw",
  "circular-saw": "Circular saw",
  "panel-saw": "Panel saw",
};

export const DEFAULT_KERF: Readonly<Record<Units, number>> = { in: 0.125, mm: 3 };

export function newTool(type: ToolType, units: Units, taken: ReadonlySet<string>): Tool {
  const name = TOOL_TYPE_NAMES[type];
  return { id: uniqueId(slugify(name), taken), name, type, kerf: DEFAULT_KERF[units], enabled: true };
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
