import type { Part, PlanSheet, Project, Stock } from "../format/schema.ts";
import { EPSILON, type Size } from "../geometry/rect.ts";
import { grainOk, planContext, usableRect, type PlanContext } from "../plan/context.ts";
import { partColors } from "../reports/colors.ts";

export interface Copy {
  part: Part;
  copy: number;
  /** Allowed values of `rotated`, never empty. */
  orientations: boolean[];
  /** The colour key of the copy (its design unit or its group), or null when it has none. */
  group: string | null;
}

/**
 * `too-large`: fits no enabled stock. `no-stock`: the stock quantities ran out. `no-tool`: no enabled tool can make a cut
 * its sheet needs. `not-guillotine`: its sheet failed the validator for another reason; constructors never cause it.
 */
export type UnplacedReason = "too-large" | "no-stock" | "no-tool" | "not-guillotine";

export interface UnplacedCopy {
  part: string;
  copy: number;
  reason: UnplacedReason;
}

export interface MaterialProblem {
  material: string;
  /** Copies to plan, in project order. */
  copies: Copy[];
  /** Enabled stock of this material: offcuts first, then sheets, each in project order. */
  stock: Stock[];
  /** Pieces of each stock still available after pinned sheets, or null for unlimited. */
  available: ReadonlyMap<string, number | null>;
  /** Copies that fit no enabled stock in any allowed orientation. */
  tooLarge: UnplacedCopy[];
  /** The group of each copy of this material, keyed by `copyKey`; copies with no group are left out. */
  groups: ReadonlyMap<string, string>;
  /** The number of pinned sheets of this material that hold each group. */
  pinnedGroups: ReadonlyMap<string, number>;
}

export function copyKey(part: string, copy: number): string {
  return `${part}#${copy}`;
}

export interface Problem {
  /** The project with `cutOrder` forced on, because optimized layouts must always be guillotine. */
  ctx: PlanContext;
  pinned: PlanSheet[];
  materials: MaterialProblem[];
}

export function orientedSize(part: Part, rotated: boolean): Size {
  return rotated ? { length: part.width, width: part.length } : { length: part.length, width: part.width };
}

export function fitsStock(ctx: PlanContext, stock: Stock, size: Size): boolean {
  const usable = usableRect(ctx, stock);
  return size.length <= usable.length + EPSILON && size.width <= usable.width + EPSILON;
}

export function buildProblem(project: Project): Problem {
  const ctx = planContext({
    ...project,
    settings: { ...project.settings, features: { ...project.settings.features, cutOrder: true } },
  });
  const pinned = (project.plan?.sheets ?? []).filter((sheet) => sheet.pinned === true);
  const colors = partColors(project);
  const partsById = new Map(project.parts.map((part) => [part.id, part]));
  const stockMaterial = new Map(project.stock.map((s) => [s.id, s.material]));
  const placed = new Set<string>();
  const used = new Map<string, number>();
  const pinnedGroups = new Map<string, Map<string, number>>();
  for (const sheet of pinned) {
    used.set(sheet.stock, (used.get(sheet.stock) ?? 0) + 1);
    const held = new Set<string>();
    for (const p of sheet.placements) {
      placed.add(copyKey(p.part, p.copy));
      const part = partsById.get(p.part);
      const group = part ? colors.keyOf(part, p.copy)?.key : undefined;
      if (group !== undefined) held.add(group);
    }
    const material = stockMaterial.get(sheet.stock);
    if (material === undefined) continue;
    const counts = pinnedGroups.get(material) ?? new Map<string, number>();
    pinnedGroups.set(material, counts);
    for (const group of held) counts.set(group, (counts.get(group) ?? 0) + 1);
  }

  const materials: MaterialProblem[] = [];
  for (const material of project.materials) {
    const enabled = project.stock.filter((s) => s.material === material.id && s.enabled !== false);
    const stock = [...enabled.filter((s) => s.kind === "offcut"), ...enabled.filter((s) => s.kind === "sheet")];
    const available = new Map<string, number | null>(
      stock.map((s) => [s.id, s.quantity === null ? null : Math.max(0, s.quantity - (used.get(s.id) ?? 0))]),
    );
    const copies: Copy[] = [];
    const tooLarge: UnplacedCopy[] = [];
    const groups = new Map<string, string>();
    for (const part of project.parts) {
      if (part.material !== material.id) continue;
      const orientations = [false, true].filter((r) => grainOk(ctx, part, r));
      for (let copy = 0; copy < part.quantity; copy++) {
        if (placed.has(copyKey(part.id, copy))) continue;
        const group = colors.keyOf(part, copy)?.key ?? null;
        if (group !== null) groups.set(copyKey(part.id, copy), group);
        const fits = orientations.some((r) => stock.some((s) => fitsStock(ctx, s, orientedSize(part, r))));
        if (fits) copies.push({ part, copy, orientations, group });
        else tooLarge.push({ part: part.id, copy, reason: "too-large" });
      }
    }
    if (copies.length > 0 || tooLarge.length > 0) {
      materials.push({ material: material.id, copies, stock, available, tooLarge, groups, pinnedGroups: pinnedGroups.get(material.id) ?? new Map() });
    }
  }
  return { ctx, pinned, materials };
}
