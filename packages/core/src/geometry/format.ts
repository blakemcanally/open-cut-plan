import type { Units } from "./units.ts";

export const INCH_PRECISIONS = [8, 16, 32, 64, "decimal"] as const;
export const MM_PRECISIONS = [1, 0.5, 0.1] as const;

export type InchPrecision = (typeof INCH_PRECISIONS)[number];
export type MmPrecision = (typeof MM_PRECISIONS)[number];

export interface DisplayPrecision {
  inch: InchPrecision;
  mm: MmPrecision;
}

export const DEFAULT_DISPLAY: DisplayPrecision = { inch: 32, mm: 0.5 };

export function formatLength(value: number, units: Units, display: DisplayPrecision = DEFAULT_DISPLAY): string {
  return units === "in" ? formatInches(value, display.inch) : formatMillimetres(value, display.mm);
}

function formatInches(value: number, precision: InchPrecision): string {
  const abs = Math.abs(value);
  if (precision === "decimal") {
    const text = trimZeros(abs.toFixed(3));
    return `${value < 0 && text !== "0" ? "-" : ""}${text}"`;
  }
  const steps = Math.round(abs * precision);
  const sign = value < 0 && steps > 0 ? "-" : "";
  const whole = Math.floor(steps / precision);
  let numerator = steps % precision;
  let denominator: number = precision;
  while (numerator > 0 && numerator % 2 === 0) {
    numerator /= 2;
    denominator /= 2;
  }
  if (numerator === 0) return `${sign}${whole}"`;
  if (whole === 0) return `${sign}${numerator}/${denominator}"`;
  return `${sign}${whole} ${numerator}/${denominator}"`;
}

function formatMillimetres(value: number, step: MmPrecision): string {
  const perMm = 1 / step;
  const rounded = Math.round(Math.abs(value) * perMm) / perMm;
  const sign = value < 0 && rounded > 0 ? "-" : "";
  return `${sign}${trimZeros(rounded.toFixed(step === 1 ? 0 : 1))} mm`;
}

function trimZeros(text: string): string {
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

export function formatArea(area: number, units: Units): string {
  return units === "in" ? `${(area / 144).toFixed(1)} sq ft` : `${(area / 1_000_000).toFixed(2)} m²`;
}
