import { withStockFor } from "../catalog/suggest.ts";
import { slugify } from "../format/ids.ts";
import type { CombinedCell, Design, Project } from "../format/schema.ts";
import { convertLength, type Units } from "../geometry/units.ts";
import { planError } from "../plan/issues.ts";
import { addDesignWithId, pickBackMaterial, pickBoxMaterial, type DesignAdd } from "./add.ts";
import { checkDesigns } from "./checks.ts";
import { isOpenBox } from "./openBox.ts";
import { roundLength } from "./geometry.ts";
import { EKET, KALLAX, presetAxis, presetDepth, type DesignMount, type SystemValue } from "./systems.ts";

export type StarterId = "cube-shelf" | "tv-bench" | "media-unit" | "bookcase" | "wall-cubes" | "nightstand" | "crate" | "stacking-shelf" | "custom-grid";
export type StarterGroup = "Cube shelves" | "Low units" | "Bookcases" | "Wall units" | "Small units" | "Accessories" | "Shop storage" | null;

export interface GridChoice {
  kind: "grid";
  columns: { min: number; max: number };
  rows: { min: number; max: number };
}

export interface OptionChoice {
  kind: "option";
  key: "mount" | "width" | "height";
  label: string;
  values: readonly { value: string; label: string }[];
}

export type StarterChoice = GridChoice | OptionChoice;

export interface StarterValues {
  columns: number;
  rows: number;
  options: Readonly<Partial<Record<OptionChoice["key"], string>>>;
}

export interface Starter {
  id: StarterId;
  name: string;
  group: StarterGroup;
  note: string;
  choices: readonly StarterChoice[];
  defaults: StarterValues;
  sources: Readonly<Record<string, SystemValue>>;
}

export interface StarterTarget {
  id: string;
  units: Units;
  material: string;
  back: string | null;
}

const gb = (path: string) => `https://www.ikea.com/gb/en/p/${path}/`;

const KALLAX_DERIVED = "Derived from the KALLAX outside sizes on ikea.com/gb: 350 mm for each column";

const BILLY_DEPTH_MM = 280;
const BILLY_SIZES_MM = { width: { "40": 400, "80": 800 }, height: { "106": 1060, "202": 2020 } } as const;
const BILLY_ROWS = { "106": 3, "202": 6 } as const;

const CRATE_SIZE: Readonly<Record<Units, { width: number; height: number; depth: number }>> = {
  in: { width: 12.5, height: 12.5, depth: 13.5 },
  mm: { width: 318, height: 318, depth: 343 },
};

const STACKING_SHELF_SIZE: Readonly<Record<Units, { width: number; height: number; depth: number }>> = {
  in: { width: 52.5, height: 40, depth: 15.875 },
  mm: { width: 1334, height: 1016, depth: 403 },
};

const crateFinish = (units: Units): string[] => {
  const [hole, top] = units === "in" ? ['2 1/8"', '1 1/2"'] : ["54 mm", "38 mm"];
  return [
    `Drill a ${hole} hole through the front and the back, centered left to right, with its top ${top} below the top edge. The two holes are the handles.`,
    "Round over all the edges with a router, including the edges of the holes.",
    "Sand lightly.",
  ];
};

const MOUNT_LEGS_FLOOR: OptionChoice = {
  kind: "option",
  key: "mount",
  label: "Mount",
  values: [
    { value: "legs", label: "Legs" },
    { value: "floor", label: "Floor" },
  ],
};

const MOUNT_LEGS_FEET: OptionChoice = {
  kind: "option",
  key: "mount",
  label: "Mount",
  values: [
    { value: "legs", label: "Legs" },
    { value: "feet", label: "Feet" },
  ],
};

export const STARTERS: readonly Starter[] = [
  {
    id: "cube-shelf",
    name: "Cube shelf",
    group: "Cube shelves",
    note: "KALLAX-style cells. Pick the columns and rows.",
    choices: [{ kind: "grid", columns: { min: 1, max: 6 }, rows: { min: 1, max: 6 } }],
    defaults: { columns: 2, rows: 4, options: {} },
    sources: {
      opening: KALLAX.opening,
      depth: KALLAX.depth,
      "1x4": { mm: 1470, derived: false, source: gb("kallax-shelving-unit-white-00275848") },
      "2x2": { mm: 770, derived: false, source: gb("kallax-shelving-unit-white-20275814") },
      "2x4": { mm: 1470, derived: false, source: gb("kallax-shelving-unit-white-80275887") },
      "4x4": { mm: 1470, derived: false, source: gb("kallax-shelving-unit-white-30275861") },
      "5x5": { mm: 1820, derived: false, source: gb("kallax-shelving-unit-white-70301537") },
      "6x6": { mm: 2170, derived: true, source: `${KALLAX_DERIVED}, from the 5x5 at 1820 mm` },
    },
  },
  {
    id: "tv-bench",
    name: "TV bench",
    group: "Low units",
    note: "KALLAX-style cells in one row, on EKET legs or on the floor.",
    choices: [{ kind: "grid", columns: { min: 2, max: 6 }, rows: { min: 1, max: 1 } }, MOUNT_LEGS_FLOOR],
    defaults: { columns: 4, rows: 1, options: { mount: "legs" } },
    sources: {
      opening: KALLAX.opening,
      depth: KALLAX.depth,
      "4x1": { mm: 1470, derived: false, source: gb("kallax-shelving-unit-white-00275848") },
      "6x1": { mm: 2170, derived: true, source: `${KALLAX_DERIVED}, from the 4x1 at 1470 mm` },
    },
  },
  {
    id: "media-unit",
    name: "Media unit",
    group: "Low units",
    note: "KALLAX-style cells, with a wide center cell for a TV box or a speaker.",
    choices: [],
    defaults: { columns: 4, rows: 2, options: {} },
    sources: {
      opening: KALLAX.opening,
      depth: KALLAX.depth,
      "4x2": { mm: 1470, derived: false, source: gb("kallax-shelving-unit-with-4-inserts-black-brown-s29278304") },
    },
  },
  {
    id: "bookcase",
    name: "Bookcase",
    group: "Bookcases",
    note: "BILLY-style sizes, with fixed shelves.",
    choices: [
      {
        kind: "option",
        key: "width",
        label: "Width",
        values: [
          { value: "40", label: "40 cm" },
          { value: "80", label: "80 cm" },
        ],
      },
      {
        kind: "option",
        key: "height",
        label: "Height",
        values: [
          { value: "106", label: "106 cm" },
          { value: "202", label: "202 cm" },
        ],
      },
    ],
    defaults: { columns: 1, rows: 6, options: { width: "80", height: "202" } },
    sources: {
      width40: { mm: 400, derived: false, source: gb("billy-bookcase-white-80263832") },
      width80: { mm: 800, derived: false, source: gb("billy-bookcase-white-00263850") },
      height106: { mm: 1060, derived: false, source: gb("billy-bookcase-white-30263844") },
      height202: { mm: 2020, derived: false, source: gb("billy-bookcase-white-00263850") },
      depth: { mm: BILLY_DEPTH_MM, derived: false, source: gb("billy-bookcase-white-00263850") },
    },
  },
  {
    id: "wall-cubes",
    name: "Wall cubes",
    group: "Wall units",
    note: "EKET-style cubes on the wall rail. Pick the columns and rows.",
    choices: [{ kind: "grid", columns: { min: 1, max: 5 }, rows: { min: 1, max: 2 } }],
    defaults: { columns: 3, rows: 1, options: {} },
    sources: {
      module: EKET.module,
      depth: EKET.depth,
      "5x2": { mm: 1750, derived: false, source: gb("eket-wall-mounted-cabinet-combination-white-s59329397") },
    },
  },
  {
    id: "nightstand",
    name: "Nightstand",
    group: "Small units",
    note: "An EKET-style cube, 1 or 2 cells high, on legs or on feet.",
    choices: [{ kind: "grid", columns: { min: 1, max: 1 }, rows: { min: 1, max: 2 } }, MOUNT_LEGS_FEET],
    defaults: { columns: 1, rows: 2, options: { mount: "legs" } },
    sources: {
      module: EKET.module,
      depth: EKET.depth,
      height: { mm: 700, derived: false, source: gb("eket-cabinet-w-door-and-1-shelf-white-90333938") },
    },
  },
  {
    id: "crate",
    name: "Crate",
    group: "Accessories",
    note: "A crate that slides into a KALLAX-style cube. The holes in the front and the back are the handles.",
    choices: [],
    defaults: { columns: 1, rows: 1, options: {} },
    sources: {
      size: { mm: 317.5, derived: false, source: 'The crate that the product owner built on 2026-10-27: 12 1/2" × 12 1/2" × 13 1/2" outside' },
    },
  },
  {
    id: "stacking-shelf",
    name: "Stacking shelf",
    group: "Shop storage",
    note: 'A shelf module that stacks on cleats, after the shelf system of Evan Monsma. The four openings fit storage boxes 8" high.',
    choices: [],
    defaults: { columns: 1, rows: 4, options: {} },
    sources: {
      size: {
        mm: 1333.5,
        derived: false,
        source: 'Evan Monsma, "Starting the shelf system I\'ve always wanted", https://www.youtube.com/watch?v=cRj2tih1IaI: 3/4" plywood, 16" deep, sides 40", panels 51", cleats from 3/4" stock 3 1/2" wide',
      },
    },
  },
  {
    id: "custom-grid",
    name: "Custom grid",
    group: null,
    note: "A plain grid of 2 × 2. Set every size in the editor.",
    choices: [],
    defaults: { columns: 2, rows: 2, options: {} },
    sources: { opening: KALLAX.opening, depth: KALLAX.depth },
  },
];

export function starterById(id: string): Starter | undefined {
  return STARTERS.find((starter) => starter.id === id);
}

function option(starter: Starter, values: StarterValues, key: OptionChoice["key"]): string {
  return values.options[key] ?? starter.defaults.options[key]!;
}

function gridOf(starter: Starter): GridChoice | undefined {
  return starter.choices.find((choice): choice is GridChoice => choice.kind === "grid");
}

function range(label: string, { min, max }: { min: number; max: number }): string {
  return min === max ? `The ${label} must be ${min}.` : `The ${label} must be a whole number from ${min} to ${max}.`;
}

/** The messages for values the starter does not allow; empty when all are allowed. */
export function starterValueErrors(starter: Starter, values: StarterValues): string[] {
  const messages: string[] = [];
  const grid = gridOf(starter);
  if (grid) {
    if (!Number.isInteger(values.columns) || values.columns < grid.columns.min || values.columns > grid.columns.max) messages.push(range("number of columns", grid.columns));
    if (!Number.isInteger(values.rows) || values.rows < grid.rows.min || values.rows > grid.rows.max) messages.push(range("number of rows", grid.rows));
  }
  const options = starter.choices.filter((choice): choice is OptionChoice => choice.kind === "option");
  for (const [key, value] of Object.entries(values.options)) {
    const choice = options.find((candidate) => candidate.key === key);
    if (!choice) {
      messages.push(`The ${starter.name} has no choice "${key}".`);
    } else if (!choice.values.some((allowed) => allowed.value === value)) {
      messages.push(`The ${choice.label.toLowerCase()} must be ${choice.values.map((allowed) => allowed.label).join(" or ")}, not "${value}".`);
    }
  }
  return messages;
}

const size = (starter: Starter, values: StarterValues): { columns: number; rows: number } =>
  gridOf(starter) ? { columns: values.columns, rows: values.rows } : { columns: starter.defaults.columns, rows: starter.defaults.rows };

export function starterName(starter: Starter, values: StarterValues): string {
  if (starter.id === "media-unit" || starter.id === "crate" || starter.id === "stacking-shelf") return starter.name;
  if (starter.id === "bookcase") return `${starter.name} ${option(starter, values, "width")} × ${option(starter, values, "height")}`;
  const { columns, rows } = size(starter, values);
  return `${starter.name} ${columns} × ${rows}`;
}

const mediaCombined = (): CombinedCell => ({ column: 2, row: 1, columns: 2, rows: 1 });

export function starterDesign(starter: Starter, values: StarterValues, target: StarterTarget): Design {
  const { units } = target;
  const mm = (value: number) => roundLength(convertLength(value, "mm", units));
  const { columns, rows } = size(starter, values);
  const base = { id: target.id, name: starterName(starter, values), material: target.material };
  const finish = (design: Design, mount: DesignMount): Design => ({
    ...design,
    ...(target.back === null ? {} : { back: { material: target.back } }),
    ...(mount === "floor" ? {} : { mount }),
  });
  switch (starter.id) {
    case "crate": {
      const { width, height, depth } = CRATE_SIZE[units];
      return {
        kind: "open-box",
        system: "kallax",
        ...base,
        width: { outside: width, cells: 1 },
        height: { outside: height, cells: 1 },
        depth,
        finish: crateFinish(units),
      };
    }
    case "stacking-shelf": {
      const { width, height, depth } = STACKING_SHELF_SIZE[units];
      return {
        ...base,
        system: "custom",
        width: { outside: width, cells: 1 },
        height: { outside: height, cells: 4 },
        depth,
        corners: "sides-over-top",
        fastener: "face-screws",
        mount: "cleats",
        hiddenWarnings: ["shelf-span"],
      };
    }
    case "cube-shelf":
    case "tv-bench":
    case "media-unit":
    case "custom-grid": {
      const system = starter.id === "custom-grid" ? "custom" : "kallax";
      const design: Design = { ...base, system, width: presetAxis("kallax", columns, units), height: presetAxis("kallax", rows, units), depth: presetDepth("kallax", units) };
      if (starter.id === "media-unit") design.combined = [mediaCombined()];
      const mount = starter.id === "tv-bench" ? (option(starter, values, "mount") as DesignMount) : starter.id === "media-unit" ? "legs" : "floor";
      return finish(design, mount);
    }
    case "wall-cubes":
    case "nightstand": {
      const design: Design = { ...base, system: "eket", width: presetAxis("eket", columns, units), height: presetAxis("eket", rows, units), depth: presetDepth("eket", units) };
      return finish(design, starter.id === "wall-cubes" ? "wall-rail" : (option(starter, values, "mount") as DesignMount));
    }
    case "bookcase": {
      const width = option(starter, values, "width") as keyof typeof BILLY_SIZES_MM.width;
      const height = option(starter, values, "height") as keyof typeof BILLY_SIZES_MM.height;
      const design: Design = {
        ...base,
        system: "custom",
        width: { outside: mm(BILLY_SIZES_MM.width[width]), cells: 1 },
        height: { outside: mm(BILLY_SIZES_MM.height[height]), cells: BILLY_ROWS[height] },
        depth: mm(BILLY_DEPTH_MM),
      };
      return finish(design, "floor");
    }
  }
}

/** Adds the design of the starter with the picked materials (or the given ones), its id from its name. No parts. */
export function addStarterDesign(
  project: Project,
  starter: Starter,
  values: StarterValues,
  options: { material?: string; back?: string | null; name?: string; id?: string } = {},
): DesignAdd {
  const errors = starterValueErrors(starter, values);
  if (errors.length > 0) return { ok: false, issues: errors.map((message) => planError("starter-values", message)) };
  const box = options.material === undefined ? pickBoxMaterial(project) : { project: withStockFor(project, [options.material]), material: options.material };
  const back =
    starter.id === "crate" || starter.id === "stacking-shelf"
      ? { project: box.project, material: null }
      : options.back === undefined
      ? pickBackMaterial(box.project, box.material)
      : { project: options.back === null ? box.project : withStockFor(box.project, [options.back]), material: options.back };
  const name = options.name ?? starterName(starter, values);
  return addDesignWithId(back.project, options.id ?? slugify(name), (id) => ({
    ...starterDesign(starter, values, { id, units: project.project.units, material: box.material, back: back.material }),
    name,
  }));
}

/** The Fits items of spec §4.2 for a design in a project with its parts, minus each item that a warning of that design rules out. */
export function starterFits(project: Project, designId: string): string[] {
  const design = project.designs?.find((candidate) => candidate.id === designId);
  if (!design) return [];
  const codes = new Set(checkDesigns(project, { keepHidden: true }).filter((issue) => issue.refs.some((ref) => ref.kind === "design" && ref.design === designId)).map((issue) => issue.code));
  const items: string[] = [];
  if (isOpenBox(design)) return design.system === "kallax" && !codes.has("kallax-fit") ? ["KALLAX cells"] : [];
  if (design.system === "kallax" && !codes.has("kallax-opening") && !codes.has("kallax-depth")) items.push("KALLAX inserts and boxes");
  if (design.system === "eket" && design.mount === "wall-rail" && !codes.has("eket-grid")) items.push("EKET wall rail");
  if (design.mount === "legs") items.push("EKET legs");
  if (design.mount === "feet") items.push("EKET feet");
  return items;
}
