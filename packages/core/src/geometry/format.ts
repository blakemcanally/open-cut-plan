import { toNm } from "./precision.ts";
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
  const text = units === "in" ? formatInches(value, display.inch) : formatMillimetres(value, display.mm);
  return toNm(Math.abs(value), units) % gridStep(units, display) === 0 ? text : `~${text}`;
}

function gridStep(units: Units, display: DisplayPrecision): number {
  if (units === "mm") return Math.round(display.mm * 1_000_000);
  return display.inch === "decimal" ? 25_400 : 25_400_000 / display.inch;
}

/** A fraction to 1/64" or a decimal to 0.0001" in inches, and to 0.001 mm in millimetres, with ~ only past those digits. */
export function formatExactLength(value: number, units: Units): string {
  const nm = toNm(Math.abs(value), units);
  if (units === "in" && nm % 396_875 === 0) return formatInches(value, 64);
  const digits = units === "in" ? 4 : 3;
  const step = units === "in" ? 2_540 : 1_000;
  const text = trimZeros(Math.abs(value).toFixed(digits));
  const sign = value < 0 && text !== "0" ? "-" : "";
  const body = units === "in" ? `${sign}${text}"` : `${sign}${text} mm`;
  return nm % step === 0 ? body : `~${body}`;
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
