import type { Material, Project } from "../format/schema.ts";
import { formatExactLength } from "../geometry/format.ts";
import { CATALOG } from "./data.ts";

export const NOMINAL_TOLERANCE_IN = 0.005;

export interface NominalThickness {
  /** For example `3/4"` or `1x`. */
  nominal: string;
  value: number;
  /** The catalogue thicknesses for the nominal value, most common first, then in catalogue order. */
  likely: number[];
}

/** `3/4"` and `3/4" (23/32")` give 0.75, `1x` gives 1, and a metric nominal such as `18 mm` gives null. */
export function nominalInches(nominal: string): number | null {
  const trade = /^(\d+)x$/.exec(nominal);
  if (trade) return Number(trade[1]);
  const inches = /^(\d+)(?:\/(\d+))?"/.exec(nominal);
  if (!inches) return null;
  return inches[2] === undefined ? Number(inches[1]) : Number(inches[1]) / Number(inches[2]);
}

const close = (a: number, b: number) => Math.abs(a - b) <= NOMINAL_TOLERANCE_IN;

function isCatalogMaterial(material: Material): boolean {
  const name = material.name.trim().toLowerCase();
  return CATALOG.some((entry) => (entry.id === material.id || entry.name.toLowerCase() === name) && close(entry.thicknessIn, material.thickness));
}

export function nominalThickness(project: Project, materialId: string): NominalThickness | null {
  if (project.project.units !== "in") return null;
  const material = project.materials.find((item) => item.id === materialId);
  if (!material || material.measured === true || isCatalogMaterial(material)) return null;
  const matches = CATALOG.filter((entry) => {
    const value = nominalInches(entry.nominal);
    return value !== null && close(value, material.thickness);
  });
  if (matches.length === 0) return null;
  const value = nominalInches(matches[0]!.nominal)!;
  const counts = new Map<number, number>();
  for (const entry of matches) if (!close(entry.thicknessIn, value)) counts.set(entry.thicknessIn, (counts.get(entry.thicknessIn) ?? 0) + 1);
  if (counts.size === 0) return null;
  const likely = [...counts.keys()].toSorted((a, b) => counts.get(b)! - counts.get(a)!);
  return { nominal: matches[0]!.nominal.replace(/\s*\(.*\)$/, ""), value, likely };
}

/** For example `3/4" is a nominal thickness. Stock sold as 3/4" is often 45/64" or 11/16" thick.` */
export function nominalThicknessText(project: Project, materialId: string): string | null {
  const result = nominalThickness(project, materialId);
  if (!result) return null;
  const material = project.materials.find((item) => item.id === materialId)!;
  const likely = result.likely.slice(0, 2).map((value) => formatExactLength(value, "in"));
  return `${formatExactLength(material.thickness, "in")} is a nominal thickness. Stock sold as ${result.nominal} is often ${likely.join(" or ")} thick.`;
}
