import type { Units } from "../geometry/units.ts";
import { CATALOG_FAMILIES } from "./catalog.ts";
import { CATALOG } from "./data.ts";
import type { CatalogMaterial } from "./types.ts";

export interface ThicknessOption {
  /** For example `3/4"` or `1x`. */
  nominal: string;
  /** In the project units. */
  thickness: number;
  /** The short names of the catalogue materials, in catalogue order. */
  materials: string[];
}

export interface ThicknessGroup {
  family: string;
  options: ThicknessOption[];
}

/** `Birch plywood 3/4"` in the family "Hardwood plywood" gives "Birch". */
export function catalogShortName(entry: CatalogMaterial): string {
  const base = entry.name.replace(/\s+(\d[\d/]*"?|\dx)(\s.*)?$/, "");
  const suffix = ` ${entry.family.split(" ").at(-1)!.replace(/s$/i, "")}`.toLowerCase();
  return base.toLowerCase().endsWith(suffix) ? base.slice(0, -suffix.length) : base;
}

export function catalogThicknesses(units: Units): ThicknessGroup[] {
  return CATALOG_FAMILIES.map((family) => {
    const options: ThicknessOption[] = [];
    for (const entry of CATALOG.filter((material) => material.family === family)) {
      const nominal = entry.nominal.replace(/\s*\(.*\)$/, "");
      const thickness = units === "in" ? entry.thicknessIn : entry.thicknessMm;
      const same = options.find((option) => option.nominal === nominal && option.thickness === thickness);
      if (same) same.materials.push(catalogShortName(entry));
      else options.push({ nominal, thickness, materials: [catalogShortName(entry)] });
    }
    return { family, options: options.toSorted((a, b) => a.thickness - b.thickness) };
  });
}
