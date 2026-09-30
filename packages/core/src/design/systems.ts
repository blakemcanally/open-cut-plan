import type { Design, DesignAxis } from "../format/schema.ts";
import { convertLength, type Units } from "../geometry/units.ts";
import { roundLength } from "./geometry.ts";

export const DESIGN_SYSTEMS = ["kallax", "eket", "custom"] as const;
export type DesignSystem = (typeof DESIGN_SYSTEMS)[number];
export const DESIGN_MOUNTS = ["floor", "legs", "feet", "wall-rail"] as const;
export type DesignMount = (typeof DESIGN_MOUNTS)[number];

export function isDesignSystem(value: string): value is DesignSystem {
  return (DESIGN_SYSTEMS as readonly string[]).includes(value);
}

export function isDesignMount(value: string): value is DesignMount {
  return (DESIGN_MOUNTS as readonly string[]).includes(value);
}

export interface SystemValue {
  mm: number;
  /** True when the number comes from arithmetic on IKEA's listed sizes. A caliper measurement can replace it. */
  derived: boolean;
  source: string;
}

export const KALLAX = {
  opening: {
    mm: 335,
    derived: true,
    source: "Derived from the KALLAX outside sizes on ikea.com/gb: a 350 mm step per column and a 415 mm 1x1 (spec appendix A.1)",
  },
  depth: { mm: 390, derived: false, source: "https://www.ikea.com/gb/en/p/kallax-shelving-unit-white-20275814/" },
  insert: { mm: 330, derived: false, source: "https://www.ikea.com/gb/en/p/kallax-insert-with-door-white-80653317/" },
  boxDepth: { mm: 380, derived: false, source: "https://www.ikea.com/gb/en/p/droena-box-black-off-white-10625714/" },
} as const satisfies Record<string, SystemValue>;

export const EKET = {
  module: { mm: 350, derived: false, source: "https://www.ikea.com/gb/en/p/eket-cabinet-white-80334603/" },
  depth: { mm: 350, derived: false, source: "https://www.ikea.com/gb/en/p/eket-cabinet-white-80334603/" },
  shallowDepth: { mm: 250, derived: false, source: "IKEA GB listing: EKET cabinet 35x25x35, article 70332124" },
} as const satisfies Record<string, SystemValue>;

export const KALLAX_CLEARANCE_MM = 2;
export const EKET_TOLERANCE_MM = 1;
export const MIN_POCKET_THICKNESS_MM = 11.90625;
export const MAX_POCKET_CHART_MM = 38.1;
/** A rule of thumb for plywood shelves under books, not a load calculation. */
export const SHELF_SPAN_RATIO = 45;
export const DEFAULT_DESIGN_QUANTITY = 1;
export const DEFAULT_DESIGN_MOUNT: DesignMount = "floor";

export type PresetSystem = "kallax" | "eket";

export function isPresetSystem(system: string): system is PresetSystem {
  return system === "kallax" || system === "eket";
}

export function presetAxis(system: PresetSystem, cells: number, units: Units): DesignAxis {
  const mm = (value: number) => roundLength(convertLength(value, "mm", units));
  if (system === "kallax") return { openings: Array.from({ length: cells }, () => mm(KALLAX.opening.mm)) };
  return { outside: mm(EKET.module.mm * cells), cells };
}

export function presetDepth(system: PresetSystem, units: Units): number {
  return roundLength(convertLength(system === "kallax" ? KALLAX.depth.mm : EKET.depth.mm, "mm", units));
}

export interface PresetOptions {
  system: PresetSystem;
  id: string;
  name: string;
  material: string;
  cols: number;
  rows: number;
  units: Units;
}

export function presetDesign({ system, id, name, material, cols, rows, units }: PresetOptions): Design {
  return { id, name, system, material, width: presetAxis(system, cols, units), height: presetAxis(system, rows, units), depth: presetDepth(system, units) };
}
