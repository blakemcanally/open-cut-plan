import type { Project } from "../format/schema.ts";
import { convertLength, type Units } from "../geometry/units.ts";
import { designParts } from "./generate.ts";
import { designGeometry, materialsById, type DesignGeometry } from "./geometry.ts";
import { IKEA_FEET, IKEA_LEGS, IKEA_RAIL_35, IKEA_RAIL_70 } from "./ikea.ts";
import { DEFAULT_DESIGN_MOUNT, DEFAULT_DESIGN_QUANTITY, EKET, EKET_TOLERANCE_MM, isDesignMount, MAX_POCKET_CHART_MM, MIN_POCKET_THICKNESS_MM } from "./systems.ts";

export interface PocketScrew {
  /** The jig mark and the collar setting, in inches. */
  setting: number;
  screw: string;
}

export const POCKET_SCREW_SOURCE = "https://www.kregtool.com/on/demandware.static/-/Library-Sites-RefArchSharedLibrary/default/dwbda477b7/manuals/K5_NA.pdf";

/** Kreg's chart for the K4 and K5 jigs. The jig marks are the actual board thickness. */
export const POCKET_SCREWS: readonly PocketScrew[] = [
  { setting: 0.5, screw: '1" (25 mm)' },
  { setting: 0.625, screw: '1" (25 mm)' },
  { setting: 0.75, screw: '1 1/4" (32 mm)' },
  { setting: 0.875, screw: '1 1/2" (38 mm)' },
  { setting: 1, screw: '1 1/2" (38 mm)' },
  { setting: 1.125, screw: '1 1/2" (38 mm)' },
  { setting: 1.25, screw: '2" (50 mm)' },
  { setting: 1.375, screw: '2" (50 mm)' },
  { setting: 1.5, screw: '2 1/2" (64 mm)' },
];

const CHART_TOLERANCE_MM = 0.01;
const COUNT_EPSILON = 1e-9;

/** The row for the nearest jig mark, or null for stock outside the chart. */
export function pocketScrew(thicknessMm: number): PocketScrew | null {
  if (thicknessMm < MIN_POCKET_THICKNESS_MM - CHART_TOLERANCE_MM || thicknessMm > MAX_POCKET_CHART_MM + CHART_TOLERANCE_MM) return null;
  const setting = Math.min(1.5, Math.max(0.5, Math.round((thicknessMm / 25.4) * 8) / 8));
  return POCKET_SCREWS.find((row) => row.setting === setting) ?? null;
}

/** 50 mm from each edge, and at most 150 mm between holes. */
export function pocketHolesPerEnd(panelDepthMm: number): number {
  return Math.max(2, Math.ceil((panelDepthMm - 100) / 150 - COUNT_EPSILON) + 1);
}

const THIN_BACK_MM = 7;

export function backScrewName(backThicknessMm: number): string {
  return backThicknessMm <= THIN_BACK_MM + CHART_TOLERANCE_MM ? '#6 × 3/4" (4 × 20 mm) flat head wood screws' : '#8 × 1 1/4" (4 × 30 mm) flat head wood screws';
}

function edgeScrews(lengthMm: number): number {
  return Math.max(2, Math.ceil((lengthMm - 50) / 150 - COUNT_EPSILON) + 1);
}

/** The screws for one back: along the perimeter and each interior panel edge, 25 mm from the ends and at most 150 mm apart. */
export function backScrewCount(geometry: DesignGeometry, units: Units): number {
  const edges = [geometry.outsideHeight, geometry.outsideHeight, geometry.outsideWidth, geometry.outsideWidth];
  const upright = geometry.outsideHeight - 2 * geometry.thickness;
  for (let column = 1; column < geometry.columns.length; column++) edges.push(upright);
  for (let line = 1; line < geometry.rows.length; line++) edges.push(...geometry.columns);
  return edges.reduce((sum, edge) => sum + edgeScrews(convertLength(edge, units, "mm")), 0);
}

/** The panel ends with pocket holes in one unit: both ends of each side, divider, and shelf. */
export function pocketHoleEnds(geometry: DesignGeometry): number {
  const columns = geometry.columns.length;
  return 2 * (columns + 1) + 2 * columns * (geometry.rows.length - 1);
}

export interface Rails {
  long: number;
  short: number;
}

/** As many 70 cm rails as fit the width, then a 35 cm rail for a remaining 350 mm module. */
export function railsFor(outsideWidthMm: number): Rails {
  const long = Math.floor((outsideWidthMm + EKET_TOLERANCE_MM) / (2 * EKET.module.mm));
  const rest = outsideWidthMm - long * 2 * EKET.module.mm;
  const short = rest >= EKET.module.mm - EKET_TOLERANCE_MM || long === 0 ? 1 : 0;
  return { long, short };
}

export type HardwareItem = "pocket-screws" | "back-screws" | "eket-legs" | "eket-feet" | "eket-rail-70" | "eket-rail-35" | "anti-tip" | "wall-fixings" | "glue";

export interface HardwareChoice {
  name: string;
  article: string;
  source: string;
}

export interface HardwareLine {
  item: HardwareItem;
  name: string;
  article?: string;
  /** The items to choose from, such as the finishes of the legs. */
  choices?: HardwareChoice[];
  /** Null when the amount depends on the work or the wall. */
  quantity: number | null;
  unit: "each" | "pack";
  /** Null for a line for the whole project. */
  design: string | null;
  source?: string;
}

/** The hardware for the designs that can make parts. A design with an error or an unknown system gets no lines. */
export function hardwareList(project: Project): HardwareLine[] {
  const units = project.project.units;
  const mm = (value: number) => convertLength(value, units, "mm");
  const materials = materialsById(project);
  const lines: HardwareLine[] = [];
  for (const design of project.designs ?? []) {
    if (designParts(project, design) === null) continue;
    const geometry = designGeometry(design, materials)!;
    const quantity = design.quantity ?? DEFAULT_DESIGN_QUANTITY;
    const add = (line: Omit<HardwareLine, "design">) => lines.push({ ...line, design: design.id });

    const holes = pocketHoleEnds(geometry) * pocketHolesPerEnd(mm(geometry.panelDepth)) * quantity;
    const screw = pocketScrew(mm(geometry.thickness));
    add({
      item: "pocket-screws",
      name: screw ? `Pocket screws, coarse thread, ${screw.screw}` : "Pocket screws, coarse thread (the chart has no length for this stock)",
      quantity: Math.ceil((holes * 11) / 10),
      unit: "each",
      source: POCKET_SCREW_SOURCE,
    });
    if (design.back) add({ item: "back-screws", name: backScrewName(mm(geometry.backThickness)), quantity: backScrewCount(geometry, units) * quantity, unit: "each" });

    const mount = design.mount ?? DEFAULT_DESIGN_MOUNT;
    if (!isDesignMount(mount)) continue;
    if (mount === "legs") add({ item: "eket-legs", name: "EKET legs, 4-pack", choices: IKEA_LEGS.map(({ name, article, source }) => ({ name, article, source })), quantity, unit: "pack" });
    if (mount === "feet") add({ item: "eket-feet", name: IKEA_FEET.name, article: IKEA_FEET.article, quantity, unit: "pack", source: IKEA_FEET.source });
    if (mount === "wall-rail") {
      const rails = railsFor(mm(geometry.outsideWidth));
      if (rails.long > 0) add({ item: "eket-rail-70", name: IKEA_RAIL_70.name, article: IKEA_RAIL_70.article, quantity: rails.long * quantity, unit: "each", source: IKEA_RAIL_70.source });
      if (rails.short > 0) add({ item: "eket-rail-35", name: IKEA_RAIL_35.name, article: IKEA_RAIL_35.article, quantity: rails.short * quantity, unit: "each", source: IKEA_RAIL_35.source });
    } else {
      add({ item: "anti-tip", name: "Anti-tip wall fitting (a strap or a bracket)", quantity, unit: "each" });
    }
    add({ item: "wall-fixings", name: "Wall screws and plugs for your wall type", quantity: null, unit: "each" });
  }
  if (lines.length > 0) lines.push({ item: "glue", name: "Wood glue (PVA)", quantity: null, unit: "each", design: null });
  return lines;
}
