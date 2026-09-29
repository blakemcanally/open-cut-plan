import type { PlanContext, Size } from "@opencutplan/core";

export const STANDARD_SCALES = [1, 2, 4, 5, 8, 10, 12, 16, 20, 25, 50] as const;

export interface PrintScale {
  /** The N of "1:N", or null when no standard scale fits and the drawing is not to scale. */
  ratio: number | null;
  width: string;
  height: string;
}

export interface Box {
  width: number;
  height: number;
}

const MM_PER_UNIT = { in: 25.4, mm: 1 } as const;

function mm(value: number): string {
  return `${Math.round(value * 10) / 10}mm`;
}

/** The largest standard scale at which a drawing of `size` fits the box (in mm). */
export function printScale(size: Size, units: PlanContext["units"], box: Box): PrintScale {
  const realLength = size.length * MM_PER_UNIT[units];
  const realWidth = size.width * MM_PER_UNIT[units];
  for (const ratio of STANDARD_SCALES) {
    if (realLength / ratio <= box.width && realWidth / ratio <= box.height) {
      return { ratio, width: mm(realLength / ratio), height: mm(realWidth / ratio) };
    }
  }
  const factor = Math.min(box.width / realLength, box.height / realWidth);
  return { ratio: null, width: mm(realLength * factor), height: mm(realWidth * factor) };
}

/** Key below the drawing: a wide box. Key beside it: a tall box. Both fit a landscape Letter or A4 page with 12 mm margins. */
export const KEY_BELOW_BOX: Box = { width: 250, height: 130 };
export const KEY_BESIDE_BOX: Box = { width: 190, height: 160 };

export interface SheetPrintLayout {
  scale: PrintScale;
  keyBeside: boolean;
}

/** Puts the key beside the drawing only when that gives a larger scale. */
export function sheetPrintLayout(size: Size, units: PlanContext["units"]): SheetPrintLayout {
  const below = printScale(size, units, KEY_BELOW_BOX);
  const beside = printScale(size, units, KEY_BESIDE_BOX);
  const keyBeside = (beside.ratio ?? Infinity) < (below.ratio ?? Infinity);
  return { scale: keyBeside ? beside : below, keyBeside };
}
