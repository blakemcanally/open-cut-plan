import { MM_PER_INCH, type Units } from "../geometry/units.ts";

const TIE_EPSILON_MM = 1e-9;
const FACE_SCREW_REACH_MM = 31.75;
const CLEAT_SCREW_REACH_MM = 12.7;

/** The #8 wood screw lengths that stores sell in inches. */
export const WOOD_SCREWS_IN: readonly { inches: number; name: string }[] = [
  { inches: 1, name: '#8 × 1"' },
  { inches: 1.25, name: '#8 × 1 1/4"' },
  { inches: 1.5, name: '#8 × 1 1/2"' },
  { inches: 1.625, name: '#8 × 1 5/8"' },
  { inches: 2, name: '#8 × 2"' },
  { inches: 2.5, name: '#8 × 2 1/2"' },
  { inches: 3, name: '#8 × 3"' },
];

/** The 4 mm wood screw lengths that stores sell in millimetres. */
export const WOOD_SCREWS_MM: readonly { mm: number; name: string }[] = [30, 35, 40, 45, 50, 60, 70, 80].map((mm) => ({ mm, name: `4 × ${mm} mm` }));

export function woodScrew(lengthMm: number, units: Units): string {
  const table = units === "in" ? WOOD_SCREWS_IN.map(({ inches, name }) => ({ mm: inches * MM_PER_INCH, name })) : WOOD_SCREWS_MM;
  let best = table[0]!;
  for (const screw of table) {
    if (Math.abs(screw.mm - lengthMm) <= Math.abs(best.mm - lengthMm) + TIE_EPSILON_MM) best = screw;
  }
  return best.name;
}

export function faceScrew(thicknessMm: number, units: Units): string {
  return woodScrew(thicknessMm + FACE_SCREW_REACH_MM, units);
}

export function cleatScrew(thicknessMm: number, units: Units): string {
  return woodScrew(thicknessMm + CLEAT_SCREW_REACH_MM, units);
}
