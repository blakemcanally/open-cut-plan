import { z } from "zod";
import { INCH_PRECISIONS, MM_PRECISIONS } from "../geometry/format.ts";

export const FORMAT_ID = "opencutplan";
export const FORMAT_VERSION = "1.2";
/** Analysis and the editor work per copy, so a larger quantity would freeze them. */
export const MAX_PART_QUANTITY = 10_000;
export const MAX_DESIGN_CELLS = 50;
export const MAX_DESIGN_QUANTITY = 100;

const id = z.string().min(1);
const positive = z.number().positive();
const nonNegative = z.number().nonnegative();

export const UnitsSchema = z.enum(["in", "mm"]);
export const GrainSchema = z.enum(["length", "width", "none"]);
export const StockKindSchema = z.enum(["sheet", "offcut"]);
export const OrderModeSchema = z.enum(["sheet", "setup"]);

export const MaterialSchema = z
  .object({
    id,
    name: z.string().min(1),
    thickness: positive,
    grained: z.boolean(),
    color: z.string().optional(),
  })
  .loose();

export const StockSchema = z
  .object({
    id,
    material: id,
    length: positive,
    width: positive,
    quantity: z.number().int().positive().nullable(),
    cost: nonNegative.optional(),
    kind: StockKindSchema,
    trim: nonNegative.optional(),
    enabled: z.boolean().optional(),
    name: z.string().optional(),
  })
  .loose();

export const PartSchema = z
  .object({
    id,
    name: z.string().min(1),
    material: id,
    length: positive,
    width: positive,
    quantity: z.number().int().positive().max(MAX_PART_QUANTITY),
    grain: GrainSchema,
    group: z.string().optional(),
    notes: z.string().optional(),
    design: id.optional(),
  })
  .loose();

const cells = z.number().int().min(1).max(MAX_DESIGN_CELLS);

export const DesignAxisSchema = z.union([
  z.object({ openings: z.array(positive).min(1).max(MAX_DESIGN_CELLS) }).loose(),
  z.object({ outside: positive, cells }).loose(),
]);

export const DesignSchema = z
  .object({
    id,
    name: z.string().min(1),
    system: z.string().min(1),
    material: id,
    quantity: z.number().int().min(1).max(MAX_DESIGN_QUANTITY).optional(),
    width: DesignAxisSchema,
    height: DesignAxisSchema,
    depth: positive,
    back: z.object({ material: id }).loose().optional(),
    mount: z.string().min(1).optional(),
  })
  .loose();

const toolBase = {
  id,
  name: z.string().min(1),
  kerf: nonNegative,
  enabled: z.boolean(),
};

export const ToolSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...toolBase,
      type: z.literal("table-saw"),
      maxRip: positive.optional(),
      maxCrosscut: positive.optional(),
      maxPiece: z.object({ length: positive, width: positive }).loose().optional(),
    })
    .loose(),
  z.object({ ...toolBase, type: z.literal("track-saw"), maxCut: positive.optional() }).loose(),
  z.object({ ...toolBase, type: z.literal("circular-saw"), maxCut: positive.optional() }).loose(),
  z
    .object({
      ...toolBase,
      type: z.literal("panel-saw"),
      maxCut: positive.optional(),
      maxStages: z.number().int().positive().optional(),
    })
    .loose(),
]);

export const FeaturesSchema = z
  .object({
    grain: z.boolean().default(true),
    kerf: z.boolean().default(true),
    trim: z.boolean().default(true),
    cutOrder: z.boolean().default(true),
    toolLimits: z.boolean().default(true),
    offcuts: z.boolean().default(true),
    cost: z.boolean().default(true),
    labels: z.boolean().default(true),
    snapping: z.boolean().default(true),
  })
  .loose();

export const DisplaySchema = z
  .object({
    inch: z.literal(INCH_PRECISIONS).default(32),
    mm: z.literal(MM_PRECISIONS).default(0.5),
  })
  .loose();

export const SettingsSchema = z
  .object({
    features: FeaturesSchema.prefault({}),
    orderMode: OrderModeSchema.default("sheet"),
    trim: nonNegative.default(0),
    minOffcut: z.object({ length: positive, width: positive }).loose().optional(),
    display: DisplaySchema.prefault({}),
    optimizer: z
      .object({
        timeLimitMs: z.number().int().positive().default(2000),
        seed: z.number().int().optional(),
        goal: z.string().default("cost"),
        extraCostPercent: z.number().min(0).max(100).default(10),
      })
      .loose()
      .prefault({}),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default("USD"),
  })
  .loose();

export const PlacementSchema = z
  .object({
    part: id,
    copy: z.number().int().nonnegative(),
    x: z.number(),
    y: z.number(),
    rotated: z.boolean(),
  })
  .loose();

export const CutSchema = z
  .object({
    step: z.number().int().positive(),
    stage: z.number().int().positive(),
    axis: z.enum(["x", "y"]),
    at: z.number(),
    from: z.number(),
    to: z.number(),
    tool: id.optional(),
    trim: z.boolean().optional(),
  })
  .loose();

export const PlanSheetSchema = z
  .object({
    id,
    stock: id,
    pinned: z.boolean().optional(),
    placements: z.array(PlacementSchema),
    cuts: z.array(CutSchema).optional(),
  })
  .loose();

export const PlanSchema = z.object({ sheets: z.array(PlanSheetSchema) }).loose();

export const ProjectInfoSchema = z
  .object({
    name: z.string().min(1),
    units: UnitsSchema,
    notes: z.string().optional(),
    created: z.string().optional(),
    modified: z.string().optional(),
  })
  .loose();

export const ProjectSchema = z
  .object({
    format: z.literal(FORMAT_ID),
    version: z.string().regex(/^\d+\.\d+$/),
    project: ProjectInfoSchema,
    materials: z.array(MaterialSchema),
    stock: z.array(StockSchema),
    parts: z.array(PartSchema),
    designs: z.array(DesignSchema).optional(),
    tools: z.array(ToolSchema),
    settings: SettingsSchema.prefault({}),
    plan: PlanSchema.optional(),
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .loose();

type KnownKey<K> = string extends K ? never : number extends K ? never : symbol extends K ? never : K;
type KnownFields<T> = { [K in keyof T as KnownKey<K>]: StripIndex<T[K]> };

/**
 * The schemas accept unknown keys so files round-trip, which gives their inferred types index signatures.
 * The public types drop those signatures so a misspelled field is a type error; pure records such as `extensions` keep theirs.
 */
export type StripIndex<T> = T extends readonly (infer E)[]
  ? StripIndex<E>[]
  : T extends object
    ? [keyof KnownFields<T>] extends [never]
      ? T
      : KnownFields<T>
    : T;

export type Grain = z.output<typeof GrainSchema>;
export type Material = StripIndex<z.output<typeof MaterialSchema>>;
export type Stock = StripIndex<z.output<typeof StockSchema>>;
export type StockKind = Stock["kind"];
export type Part = StripIndex<z.output<typeof PartSchema>>;
export type DesignAxis = StripIndex<z.output<typeof DesignAxisSchema>>;
export type Design = StripIndex<z.output<typeof DesignSchema>>;
export type Tool = StripIndex<z.output<typeof ToolSchema>>;
export type ToolType = Tool["type"];
export type Features = StripIndex<z.output<typeof FeaturesSchema>>;
export type Settings = StripIndex<z.output<typeof SettingsSchema>>;
export type Placement = StripIndex<z.output<typeof PlacementSchema>>;
export type Cut = StripIndex<z.output<typeof CutSchema>>;
export type PlanSheet = StripIndex<z.output<typeof PlanSheetSchema>>;
export type Plan = StripIndex<z.output<typeof PlanSchema>>;
export type Project = StripIndex<z.output<typeof ProjectSchema>>;
export type ProjectInput = StripIndex<z.input<typeof ProjectSchema>>;

export const FEATURE_KEYS = [
  "grain",
  "kerf",
  "trim",
  "cutOrder",
  "toolLimits",
  "offcuts",
  "cost",
  "labels",
  "snapping",
] as const satisfies readonly (keyof Features)[];
