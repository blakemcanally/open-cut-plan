import { DEFAULT_DESIGN_QUANTITY } from "../design/systems.ts";
import { HexColorSchema, type Design, type Part, type Project, type Tool } from "../format/schema.ts";
import type { Step } from "../sequence/sequence.ts";

/** Light fills with a contrast of 7 or more against `#222` text. The first eight are the colours of earlier versions, so old files keep their colours. */
export const PART_PALETTE: readonly string[] = [
  "#9cc3e6",
  "#f2c27b",
  "#a8d5a2",
  "#e6a6c7",
  "#c7b8ea",
  "#f4a582",
  "#b8e0d2",
  "#e8d27a",
  "#cfe39a",
  "#8fd8e8",
  "#f09a9a",
  "#a9b4f2",
];
export const NO_GROUP_COLOR = "#d9d4c7";
/** Wood and board tones for the materials, apart from the part colours. */
export const MATERIAL_PALETTE: readonly string[] = ["#d9c9a3", "#8b5e3c", "#7d8b99", "#c4703f", "#8a9a5b", "#9c4a3a", "#5f8a8b", "#555b61"];
export const STAGE_COLORS = ["#c0392b", "#1a5fd0", "#7a4bb5", "#1e8449", "#b9770e"];
/** Cut line and number colours with a contrast of 4.5 or more against white. Red is only for `TOOL_WARNING_COLOR`. */
export const TOOL_COLORS: readonly string[] = ["#1a5fd0", "#1e8449", "#a35c00", "#7a4bb5", "#0b7285", "#a61e6a"];
/** A cut with no tool, or over a limit of its tool. */
export const TOOL_WARNING_COLOR = "#c62828";
/** The fill of the number of a cut with `TOOL_WARNING_COLOR`. */
export const TOOL_WARNING_FILL = "#fde2de";
/** Drawn wider under each cut line, so that a cut shows on any part colour. */
export const CUT_HALO_COLOR = "#ffffff";

export function isHexColor(value: string): boolean {
  return HexColorSchema.safeParse(value).success;
}

export interface DesignUnit {
  design: Design;
  /** From 1. */
  unit: number;
  units: number;
}

/** The unit of a design that a part copy belongs to, or null for a part without a known design. */
export function designUnit(project: Project, part: Part, copy: number): DesignUnit | null {
  if (part.design === undefined) return null;
  const design = project.designs?.find((candidate) => candidate.id === part.design);
  return design ? unitOf(design, part, copy) : null;
}

function unitOf(design: Design, part: Part, copy: number): DesignUnit {
  const units = design.quantity ?? DEFAULT_DESIGN_QUANTITY;
  const perUnit = Math.max(1, Math.floor(part.quantity / units));
  return { design, unit: Math.min(units, Math.floor(copy / perUnit) + 1), units };
}

/** The design name, with "2 of 3" when the design has more than one unit. */
export function designUnitLabel(design: Design, unit: number): string {
  const units = design.quantity ?? DEFAULT_DESIGN_QUANTITY;
  return units > 1 ? `${design.name} ${unit} of ${units}` : design.name;
}

export function designColorKey(design: string, unit: number): string {
  return `design:${design}#${unit}`;
}

export function groupColorKey(group: string): string {
  return `group:${group}`;
}

export interface ColorKey {
  key: string;
  /** `designUnitLabel`, or the group name. */
  label: string;
  color: string;
  chosen: boolean;
  design?: string;
  unit?: number;
  group?: string;
}

export interface PartColors {
  /** In the order that the keys first occur in the parts. */
  legend: readonly ColorKey[];
  get(key: string): ColorKey | undefined;
  /** Null for a part without a design or a group. */
  keyOf(part: Part, copy: number): ColorKey | null;
  colorOf(part: Part, copy: number): string;
}

/** The colour of each part copy: one key for each unit of a design, and one for each group of parts without a design. */
export function partColors(project: Project): PartColors {
  const designs = new Map((project.designs ?? []).map((design) => [design.id, design]));
  const keys = new Map<string, ColorKey>();
  const add = (key: string, make: (auto: string) => ColorKey) => {
    if (!keys.has(key)) keys.set(key, make(PART_PALETTE[keys.size % PART_PALETTE.length]!));
  };
  const chosen = (value: string | undefined, auto: string) => (value ? { color: value.toLowerCase(), chosen: true } : { color: auto, chosen: false });

  const keyName = (part: Part, copy: number): string | null => {
    const design = part.design === undefined ? undefined : designs.get(part.design);
    if (design) {
      const { unit } = unitOf(design, part, copy);
      const key = designColorKey(design.id, unit);
      add(key, (auto) => ({ key, label: designUnitLabel(design, unit), ...chosen(design.colors?.[unit - 1], auto), design: design.id, unit }));
      return key;
    }
    if (part.group === undefined) return null;
    const group = part.group;
    const key = groupColorKey(group);
    add(key, (auto) => ({ key, label: group, ...chosen(project.groups?.[group]?.color, auto), group }));
    return key;
  };

  for (const part of project.parts) {
    if (part.design !== undefined && designs.has(part.design)) {
      for (let copy = 0; copy < part.quantity; copy++) keyName(part, copy);
    } else {
      keyName(part, 0);
    }
  }

  const keyOf = (part: Part, copy: number) => {
    const name = keyName(part, copy);
    return name === null ? null : keys.get(name)!;
  };
  return {
    legend: [...keys.values()],
    get: (key) => keys.get(key),
    keyOf,
    colorOf: (part, copy) => keyOf(part, copy)?.color ?? NO_GROUP_COLOR,
  };
}

export function stageColor(stage: number): string {
  return STAGE_COLORS[(stage - 1) % STAGE_COLORS.length]!;
}

export type CutColoring = "stage" | "tool";

export interface ToolColor {
  tool: string;
  name: string;
  color: string;
}

export interface ToolColors {
  /** The enabled tools in profile order. */
  legend: readonly ToolColor[];
  /** Null for a tool that is not enabled. */
  colorOf(tool: string): string | null;
  /** `TOOL_WARNING_COLOR` for a cut with no tool, or over a limit of its tool. */
  cutColor(step: Pick<Step, "tool" | "overLimit">): string;
}

export function toolWarning(step: Pick<Step, "tool" | "overLimit">): boolean {
  return step.tool === null || step.overLimit !== null;
}

/** One colour for each enabled tool, in profile order, so a tool keeps its colour while the plan changes. */
export function toolColors(tools: readonly Tool[]): ToolColors {
  const legend = tools.filter((tool) => tool.enabled).map((tool, index): ToolColor => ({ tool: tool.id, name: tool.name, color: TOOL_COLORS[index % TOOL_COLORS.length]! }));
  const byId = new Map(legend.map((entry) => [entry.tool, entry.color]));
  const colorOf = (tool: string) => byId.get(tool) ?? null;
  return {
    legend,
    colorOf,
    cutColor: (step) => (toolWarning(step) ? TOOL_WARNING_COLOR : (colorOf(step.tool!.id) ?? TOOL_WARNING_COLOR)),
  };
}

/** The chosen colour of the material, or the palette colour of its place in the materials list. */
export function materialColor(project: Project, material: string): string {
  const index = project.materials.findIndex((item) => item.id === material);
  const chosen = project.materials[index]?.color;
  return chosen ?? MATERIAL_PALETTE[Math.max(index, 0) % MATERIAL_PALETTE.length]!;
}
