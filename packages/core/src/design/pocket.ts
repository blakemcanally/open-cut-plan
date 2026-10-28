import { MAX_POCKET_CHART_MM, MIN_POCKET_THICKNESS_MM } from "./systems.ts";

export const COUNT_EPSILON = 1e-9;

/** 50 mm from each edge, and at most 150 mm between holes. */
export function pocketHolesPerEnd(panelDepthMm: number): number {
  return Math.max(2, Math.ceil((panelDepthMm - 100) / 150 - COUNT_EPSILON) + 1);
}

export interface PocketScrew {
  /** The jig mark and the collar setting, in inches. */
  setting: number;
  screw: string;
}

/** Kreg's chart for the K4 and K5 jigs. The jig marks are the actual board thickness. */
export const POCKET_SCREWS: readonly PocketScrew[] = [
  { setting: 0.5, screw: '1" (25 mm)' },
  { setting: 0.625, screw: '1" (25 mm)' },
  { setting: 0.75, screw: '1 1/4" (32 mm)' },
  { setting: 0.875, screw: '1 1/2" (38 mm)' },
  { setting: 1, screw: '1 1/2" (38 mm)' },
  { setting: 1.125, screw: '1 1/2" (38 mm)' },
  { setting: 1.25, screw: '2" (50 mm)' },
  { setting: 1.375, screw: '2" (50 mm)' },
  { setting: 1.5, screw: '2 1/2" (64 mm)' },
];

export const CHART_TOLERANCE_MM = 0.01;

/** The row for the nearest jig mark, or null for stock outside the chart. */
export function pocketScrew(thicknessMm: number): PocketScrew | null {
  if (thicknessMm < MIN_POCKET_THICKNESS_MM - CHART_TOLERANCE_MM || thicknessMm > MAX_POCKET_CHART_MM + CHART_TOLERANCE_MM) return null;
  const setting = Math.min(1.5, Math.max(0.5, Math.round((thicknessMm / 25.4) * 8) / 8));
  return POCKET_SCREWS.find((row) => row.setting === setting) ?? null;
}
