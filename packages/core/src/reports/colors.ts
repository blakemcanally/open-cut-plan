import { DEFAULT_DESIGN_QUANTITY } from "../design/systems.ts";
import { HexColorSchema, type Design, type Part, type Project } from "../format/schema.ts";

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
export const STAGE_COLORS = ["#c0392b", "#1a5fd0", "#7a4bb5", "#1e8449", "#b9770e"];

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
