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
  "miter-saw": "Mitre saw",
};

export const TOOL_TYPES = Object.keys(TOOL_TYPE_NAMES) as ToolType[];

export const DEFAULT_KERF: Readonly<Record<Units, number>> = { in: 0.125, mm: 3 };

const DEFAULT_LIMITS: Readonly<Record<Units, Partial<Record<ToolType, object>>>> = {
  in: {
    "table-saw": { maxPiece: { length: 96, width: 24 }, maxCrosscutPiece: { length: 48, width: 24 }, maxRip: 24, maxCrosscut: 24 },
    "track-saw": { maxCut: 110 },
    "miter-saw": { maxCut: 14 },
  },
  mm: {
    "table-saw": { maxPiece: { length: 2440, width: 610 }, maxCrosscutPiece: { length: 1220, width: 610 }, maxRip: 610, maxCrosscut: 610 },
    "track-saw": { maxCut: 2800 },
    "miter-saw": { maxCut: 350 },
  },
};

export function newTool(type: ToolType, units: Units, taken: ReadonlySet<string>): Tool {
  const name = TOOL_TYPE_NAMES[type];
  return { id: uniqueId(slugify(name), taken), name, type, kerf: DEFAULT_KERF[units], enabled: true, ...DEFAULT_LIMITS[units][type] };
}

export interface ToolPreset {
  id: string;
  type: ToolType;
  /** Typical values for a common saw, in each unit. A user checks them against the saw. */
  values: Readonly<Record<Units, { name: string; kerf: number; limits: object }>>;
}

export const TOOL_PRESETS: readonly ToolPreset[] = [
  {
    id: "jobsite-table-saw",
    type: "table-saw",
    values: {
      in: { name: '10" jobsite table saw', kerf: 0.125, limits: { maxRip: 24, maxCrosscut: 12, maxPiece: { length: 96, width: 24 }, maxCrosscutPiece: { length: 36, width: 12 } } },
      mm: { name: "254 mm jobsite table saw", kerf: 3, limits: { maxRip: 610, maxCrosscut: 300, maxPiece: { length: 2440, width: 610 }, maxCrosscutPiece: { length: 900, width: 300 } } },
    },
  },
  {
    id: "cabinet-saw-sled",
    type: "table-saw",
    values: {
      in: { name: "Cabinet saw with a crosscut sled", kerf: 0.125, limits: { maxRip: 30, maxCrosscut: 24, maxPiece: { length: 96, width: 48 }, maxCrosscutPiece: { length: 48, width: 30 } } },
      mm: { name: "Cabinet saw with a crosscut sled", kerf: 3, limits: { maxRip: 760, maxCrosscut: 610, maxPiece: { length: 2440, width: 1220 }, maxCrosscutPiece: { length: 1220, width: 760 } } },
    },
  },
  {
    id: "track-saw-55",
    type: "track-saw",
    values: {
      in: { name: 'Track saw, 55" rail', kerf: 0.09375, limits: { maxCut: 50 } },
      mm: { name: "Track saw, 1400 mm rail", kerf: 2.2, limits: { maxCut: 1250 } },
    },
  },
  {
    id: "track-saw-118",
    type: "track-saw",
    values: {
      in: { name: 'Track saw, 118" rail', kerf: 0.09375, limits: { maxCut: 110 } },
      mm: { name: "Track saw, 3000 mm rail", kerf: 2.2, limits: { maxCut: 2800 } },
    },
  },
  {
    id: "sliding-miter-saw",
    type: "miter-saw",
    values: {
      in: { name: '12" sliding mitre saw', kerf: 0.125, limits: { maxCut: 14 } },
      mm: { name: "305 mm sliding mitre saw", kerf: 3, limits: { maxCut: 350 } },
    },
  },
];

export function presetTool(id: string, units: Units, taken: ReadonlySet<string>): Tool {
  const preset = TOOL_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown tool preset "${id}".`);
  const { name, kerf, limits } = preset.values[units];
  return { id: uniqueId(slugify(TOOL_TYPE_NAMES[preset.type]), taken), name, type: preset.type, kerf, enabled: true, ...limits };
}

/** The tools of a new project: the table saw takes the cuts within its limits, the track saw breaks down the full sheets. */
export function defaultTools(units: Units): Tool[] {
  const table = newTool("table-saw", units, new Set());
  return [table, newTool("track-saw", units, new Set([table.id]))];
}

export function addTool(project: Project, type: ToolType): Project {
  return { ...project, tools: [...project.tools, newTool(type, project.project.units, idsOf(project.tools))] };
}

export function addPresetTool(project: Project, preset: string): Project {
  return { ...project, tools: [...project.tools, presetTool(preset, project.project.units, idsOf(project.tools))] };
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
