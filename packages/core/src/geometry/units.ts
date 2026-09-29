export type Units = "in" | "mm";

export const MM_PER_INCH = 25.4;

export function convertLength(value: number, from: Units, to: Units): number {
  if (from === to) return value;
  return from === "in" ? value * MM_PER_INCH : value / MM_PER_INCH;
}
