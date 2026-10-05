import type { Units } from "./units.ts";

/** Whole nanometres hold 1/64 in, 0.001 in, and 0.1 mm with no error. KiCad and Gerber files use the same grid. */
export const NM_PER_UNIT: Readonly<Record<Units, number>> = { in: 25_400_000, mm: 1_000_000 };

export function toNm(value: number, units: Units): number {
  return Math.round(value * NM_PER_UNIT[units]);
}

export function fromNm(nm: number, units: Units): number {
  return nm / NM_PER_UNIT[units];
}

export function snapLength(value: number, units: Units): number {
  return fromNm(toNm(value, units), units);
}
