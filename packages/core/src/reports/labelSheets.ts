export type LabelLayoutId = "avery-5160" | "avery-l7160" | "thermal-4x2";

/** A sheet of labels. Every length is in `unit`; `margin` is the distance from the page edge to the first label. */
export interface LabelLayout {
  id: LabelLayoutId;
  name: string;
  unit: "in" | "mm";
  page: { width: number; height: number };
  columns: number;
  rows: number;
  label: { width: number; height: number };
  margin: { top: number; left: number };
  /** The distance from one label to the next, across and down. */
  pitch: { x: number; y: number };
}

export const LABEL_LAYOUTS: readonly LabelLayout[] = [
  {
    id: "avery-5160",
    name: "Avery 5160 (US Letter, 30 labels)",
    unit: "in",
    page: { width: 8.5, height: 11 },
    columns: 3,
    rows: 10,
    label: { width: 2.625, height: 1 },
    margin: { top: 0.5, left: 0.1875 },
    pitch: { x: 2.75, y: 1 },
  },
  {
    id: "avery-l7160",
    name: "Avery L7160 (A4, 21 labels)",
    unit: "mm",
    page: { width: 210, height: 297 },
    columns: 3,
    rows: 7,
    label: { width: 63.5, height: 38.1 },
    margin: { top: 15.15, left: 7.21 },
    pitch: { x: 66.04, y: 38.1 },
  },
  {
    id: "thermal-4x2",
    name: "Thermal label, 4 × 2 in",
    unit: "in",
    page: { width: 4, height: 2 },
    columns: 1,
    rows: 1,
    label: { width: 4, height: 2 },
    margin: { top: 0, left: 0 },
    pitch: { x: 4, y: 2 },
  },
];

export function labelLayout(id: LabelLayoutId): LabelLayout {
  return LABEL_LAYOUTS.find((layout) => layout.id === id)!;
}

export function labelsPerPage(layout: LabelLayout): number {
  return layout.columns * layout.rows;
}

/**
 * Splits labels into pages of `labelsPerPage` slots, row by row. `start` is the 1-based position of the first label
 * on the first page, so a part-used sheet can be used again; the slots before it are null.
 */
export function labelPages<T>(labels: readonly T[], layout: LabelLayout, start = 1): (T | null)[][] {
  if (labels.length === 0) return [];
  const perPage = labelsPerPage(layout);
  const skip = Math.min(Math.max(Math.trunc(start), 1), perPage) - 1;
  const slots: (T | null)[] = [...Array<null>(skip).fill(null), ...labels];
  const pages: (T | null)[][] = [];
  for (let i = 0; i < slots.length; i += perPage) pages.push(slots.slice(i, i + perPage));
  const last = pages[pages.length - 1]!;
  while (last.length < perPage) last.push(null);
  return pages;
}
