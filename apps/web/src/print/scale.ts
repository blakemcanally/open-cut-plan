import type { PlanContext, Size } from "@opencutplan/core";

export const STANDARD_SCALES = [1, 2, 4, 5, 8, 10, 12, 16, 20, 25, 50] as const;

export interface PrintScale {
  /** The N of "1:N", or null when the drawing fills the box at no standard scale. */
  ratio: number | null;
  width: string;
  height: string;
}

export interface Box {
  width: number;
  height: number;
}

const MM_PER_UNIT = { in: 25.4, mm: 1 } as const;

/** A standard scale is used only when its drawing is at least this share of the largest drawing that fits. */
const FILL_SHARE = 0.9;

function mm(value: number): string {
  return `${Math.round(value * 10) / 10}mm`;
}

interface Fit {
  ratio: number | null;
  width: number;
  height: number;
}

function fit(size: Size, units: PlanContext["units"], box: Box): Fit {
  const realLength = size.length * MM_PER_UNIT[units];
  const realWidth = size.width * MM_PER_UNIT[units];
  const factor = Math.min(1, box.width / realLength, box.height / realWidth);
  const ratio = STANDARD_SCALES.find((candidate) => 1 / candidate <= factor + 1e-9);
  if (ratio !== undefined && 1 / ratio >= FILL_SHARE * factor) return { ratio, width: realLength / ratio, height: realWidth / ratio };
  return { ratio: null, width: realLength * factor, height: realWidth * factor };
}

function scaleOf(drawing: Fit): PrintScale {
  return { ratio: drawing.ratio, width: mm(drawing.width), height: mm(drawing.height) };
}

/** The largest drawing of `size` (in mm) that fits the box, at no more than 1:1. It uses a standard scale when that scale nearly fills the box. */
export function printScale(size: Size, units: PlanContext["units"], box: Box): PrintScale {
  return scaleOf(fit(size, units, box));
}

/** The content box of a landscape Letter or A4 page with the 10 mm margins of `@page sheet`, less a little. */
export const LANDSCAPE_PAGE: Box = { width: 256, height: 186 };

/** Heights in mm of the text around a drawing on a landscape page. The print rules in styles.css give the same heights. */
export const PRINT_LINES = { title: 10, heading: 14, alert: 15, note: 9, keyLine: 4, tableHead: 9, tableRow: 5.8 } as const;

const KEY_COLUMNS = 3;
const KEY_BESIDE_WIDTH = 64;
export const TABLE_BESIDE_WIDTH = 100;
/** Rows beside the drawing are narrow, so more of them take two lines. */
const BESIDE_ROW_GROWTH = 1.4;
/** The table goes beside the drawing only when the drawing then fills most of the page height, as a squarish sheet does. */
const BESIDE_HEIGHT_SHARE = 0.85;
/** The table goes to the next page when it leaves a drawing smaller than this share of the full-page drawing. */
const MIN_DRAWING_SHARE = 0.75;

export interface PageExtras {
  /** The page starts with the title of its booklet section. */
  title?: boolean;
  /** The page has the plan problem notice. */
  alert?: boolean;
}

function freeHeight(extras: PageExtras): number {
  return LANDSCAPE_PAGE.height - PRINT_LINES.heading - PRINT_LINES.note - (extras.title ? PRINT_LINES.title : 0) - (extras.alert ? PRINT_LINES.alert : 0);
}

export interface SheetPrintLayout {
  scale: PrintScale;
  keyBeside: boolean;
}

/** The drawing of a sheet diagram page fills the page above its key, or beside it when that gives a larger drawing. */
export function sheetPrintLayout(size: Size, units: PlanContext["units"], keyRows: number, extras: PageExtras = {}): SheetPrintLayout {
  const height = freeHeight(extras);
  const below = fit(size, units, { width: LANDSCAPE_PAGE.width, height: height - PRINT_LINES.keyLine * (Math.ceil(keyRows / KEY_COLUMNS) + 0.5) });
  const beside = keyRows * PRINT_LINES.keyLine <= height ? fit(size, units, { width: LANDSCAPE_PAGE.width - KEY_BESIDE_WIDTH, height }) : null;
  const keyBeside = beside !== null && beside.width > below.width;
  return { scale: scaleOf(keyBeside ? beside : below), keyBeside };
}

export type TablePlace = "below" | "beside" | "next-page";

export interface SequencePrintLayout {
  scale: PrintScale;
  table: TablePlace;
}

/**
 * The drawing of a cut sequence page is as large as the page allows with the step table below it or beside it. When
 * the table leaves too small a drawing, or the steps are `detailed`, the drawing fills the page and the steps start on
 * the next page.
 */
export function sequencePrintLayout(size: Size, units: PlanContext["units"], rows: number, extras: PageExtras & { detailed?: boolean } = {}): SequencePrintLayout {
  const height = freeHeight(extras);
  const full = fit(size, units, { width: LANDSCAPE_PAGE.width, height });
  if (extras.detailed) return { scale: scaleOf(full), table: "next-page" };
  const table = PRINT_LINES.tableHead + rows * PRINT_LINES.tableRow;
  const options: { table: TablePlace; drawing: Fit }[] = [];
  if (table < height) options.push({ table: "below", drawing: fit(size, units, { width: LANDSCAPE_PAGE.width, height: height - table }) });
  if (table * BESIDE_ROW_GROWTH <= height) {
    const drawing = fit(size, units, { width: LANDSCAPE_PAGE.width - TABLE_BESIDE_WIDTH, height });
    if (drawing.height >= BESIDE_HEIGHT_SHARE * height) options.push({ table: "beside", drawing });
  }
  const best = options.reduce<(typeof options)[number] | null>((most, option) => (most === null || option.drawing.width > most.drawing.width ? option : most), null);
  if (best && best.drawing.width >= MIN_DRAWING_SHARE * full.width) return { scale: scaleOf(best.drawing), table: best.table };
  return { scale: scaleOf(full), table: "next-page" };
}
