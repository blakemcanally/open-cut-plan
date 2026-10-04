import type { Features, Material, Part, Placement, Project, Stock, Tool } from "../format/schema.ts";
import { formatLength, type DisplayPrecision } from "../geometry/format.ts";
import { fitsWithin, inset, type Rect, type Size } from "../geometry/rect.ts";
import type { Units } from "../geometry/units.ts";
import { projectGoal } from "../optimize/goal-setting.ts";

export const DEFAULT_MIN_OFFCUT: Readonly<Record<Units, Size>> = {
  in: { length: 12, width: 6 },
  mm: { length: 300, width: 150 },
};

export interface PlanContext {
  project: Project;
  units: Units;
  display: DisplayPrecision;
  features: Features;
  /** Enabled tools in profile order. */
  tools: Tool[];
  /** The largest kerf among enabled tools, or 0 when the kerf feature is off. */
  kerf: number;
  minOffcut: Size;
  /** "offcuts" when the cut trees compare the largest offcut before the cut length: the optimizer goal is offcuts and the offcuts feature is on. */
  treeGoal: "offcuts" | "length";
  materials: ReadonlyMap<string, Material>;
  stock: ReadonlyMap<string, Stock>;
  parts: ReadonlyMap<string, Part>;
}

export function planContext(project: Project): PlanContext {
  const { settings } = project;
  const tools = project.tools.filter((tool) => tool.enabled);
  return {
    project,
    units: project.project.units,
    display: settings.display,
    features: settings.features,
    tools,
    kerf: settings.features.kerf ? Math.max(0, ...tools.map((tool) => tool.kerf)) : 0,
    minOffcut: settings.minOffcut ?? DEFAULT_MIN_OFFCUT[project.project.units],
    treeGoal: settings.features.offcuts && projectGoal(project) === "offcuts" ? "offcuts" : "length",
    materials: byId(project.materials),
    stock: byId(project.stock),
    parts: byId(project.parts),
  };
}

function byId<T extends { id: string }>(items: readonly T[]): ReadonlyMap<string, T> {
  const map = new Map<string, T>();
  for (const item of items) if (!map.has(item.id)) map.set(item.id, item);
  return map;
}

export function formatIn(ctx: PlanContext, value: number): string {
  return formatLength(value, ctx.units, ctx.display);
}

export function formatSize(ctx: PlanContext, size: Size): string {
  return `${formatIn(ctx, size.length)} × ${formatIn(ctx, size.width)}`;
}

export function trimFor(ctx: PlanContext, stock: Stock): number {
  return ctx.features.trim ? (stock.trim ?? ctx.project.settings.trim) : 0;
}

export function stockRect(stock: Stock): Rect {
  return { x: 0, y: 0, length: stock.length, width: stock.width };
}

export function usableRect(ctx: PlanContext, stock: Stock): Rect {
  return inset(stockRect(stock), trimFor(ctx, stock));
}

export function placedRect(part: Part, placement: Placement): Rect {
  return placement.rotated
    ? { x: placement.x, y: placement.y, length: part.width, width: part.length }
    : { x: placement.x, y: placement.y, length: part.length, width: part.width };
}

/** A part may rotate when its grain is "none", its material is not grained, or the grain feature is off. */
export function canRotate(ctx: PlanContext, part: Part): boolean {
  if (!ctx.features.grain || part.grain === "none") return true;
  return ctx.materials.get(part.material)?.grained !== true;
}

export function grainOk(ctx: PlanContext, part: Part, rotated: boolean): boolean {
  return canRotate(ctx, part) || rotated === (part.grain === "width");
}

export function copyLabel(part: Part, copy: number): string {
  return part.quantity > 1 ? `${part.name} ${copy + 1}` : part.name;
}

export function materialName(ctx: PlanContext, id: string): string {
  return ctx.materials.get(id)?.name ?? id;
}

export function stockLabel(ctx: PlanContext, stock: Stock): string {
  return stock.name ?? `${materialName(ctx, stock.material)} ${formatSize(ctx, stock)}`;
}

/** Waste at least `minOffcut` in both dimensions (either orientation) is an offcut; never when the offcuts feature is off. */
export function isOffcutSize(ctx: PlanContext, size: Size): boolean {
  return ctx.features.offcuts && fitsWithin(ctx.minOffcut, size);
}

/** The minimum offcut for `buildCutTree` when the trees compare the largest offcut first. */
export function treeMinOffcut(ctx: PlanContext): Size | undefined {
  return ctx.treeGoal === "offcuts" ? ctx.minOffcut : undefined;
}
