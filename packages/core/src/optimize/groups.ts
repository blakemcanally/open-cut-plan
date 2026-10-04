import type { PlanSheet, Project } from "../format/schema.ts";
import { partColors, type ColorKey } from "../reports/colors.ts";

/** Each next sheet is the first one left that shares a group with the sheet before it, else the first one left. */
export function orderByGroup<T>(sheets: readonly T[], groupsOf: (sheet: T) => ReadonlySet<string>): T[] {
  const left = [...sheets];
  const out: T[] = [];
  while (left.length > 0) {
    const last = out.at(-1);
    const held = last === undefined ? new Set<string>() : groupsOf(last);
    const index = Math.max(0, left.findIndex((sheet) => [...groupsOf(sheet)].some((group) => held.has(group))));
    out.push(...left.splice(index, 1));
  }
  return out;
}

export interface SpreadGroup {
  key: ColorKey;
  material: string;
  /** More than 1. */
  sheets: number;
}

interface Held {
  key: ColorKey;
  material: string;
  sheets: Set<string>;
}

function heldGroups(project: Project, sheets: readonly PlanSheet[]): Held[] {
  const colors = partColors(project);
  const parts = new Map(project.parts.map((part) => [part.id, part]));
  const stock = new Map(project.stock.map((s) => [s.id, s]));
  const held = new Map<string, Held>();
  for (const sheet of sheets) {
    const material = stock.get(sheet.stock)?.material;
    if (material === undefined) continue;
    for (const p of sheet.placements) {
      const part = parts.get(p.part);
      const key = part ? colors.keyOf(part, p.copy) : null;
      if (!key) continue;
      const id = `${material}\n${key.key}`;
      const entry = held.get(id) ?? { key, material, sheets: new Set<string>() };
      held.set(id, entry);
      entry.sheets.add(sheet.id);
    }
  }
  const legend = new Map(colors.legend.map((key, i) => [key.key, i]));
  const materials = new Map(project.materials.map((material, i) => [material.id, i]));
  return [...held.values()].sort((a, b) => legend.get(a.key.key)! - legend.get(b.key.key)! || (materials.get(a.material) ?? 0) - (materials.get(b.material) ?? 0));
}

/** The design units and part groups on more than one sheet of a material, in legend order. */
export function spreadGroups(project: Project, sheets: readonly PlanSheet[] = project.plan?.sheets ?? []): SpreadGroup[] {
  return heldGroups(project, sheets)
    .filter((entry) => entry.sheets.size > 1)
    .map((entry) => ({ key: entry.key, material: entry.material, sheets: entry.sheets.size }));
}

const LISTED = 3;

/** "Each unit is on one sheet.", or "Hall KALLAX is on 2 sheets.", or null when no copy on the sheets has a unit or a group. */
export function describeGroupSpread(project: Project, sheets: readonly PlanSheet[] = project.plan?.sheets ?? []): string | null {
  const held = heldGroups(project, sheets);
  if (held.length === 0) return null;
  const several = new Set(held.map((entry) => entry.material)).size > 1;
  const spread = held.filter((entry) => entry.sheets.size > 1);
  if (spread.length === 0) {
    const units = held.some((entry) => entry.key.design !== undefined);
    const groups = held.some((entry) => entry.key.group !== undefined);
    const what = units && groups ? "unit and group" : units ? "unit" : "group";
    return `Each ${what} is on one sheet${several ? " of each material" : ""}.`;
  }
  const names = new Map(project.materials.map((material) => [material.id, material.name]));
  const listed = spread.slice(0, LISTED).map((entry) => `${entry.key.label} is on ${entry.sheets.size} sheets${several ? ` of ${names.get(entry.material) ?? entry.material}` : ""}`);
  const rest = spread.length - LISTED;
  return `${[...listed, ...(rest > 0 ? [`${rest} more ${rest === 1 ? "is" : "are"} on more than one sheet`] : [])].join("; ")}.`;
}
