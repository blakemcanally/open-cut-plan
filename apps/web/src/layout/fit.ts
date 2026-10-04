export interface Size {
  length: number;
  width: number;
}

/** The space between two sheet cards, and the padding, header, stock line, and a two-line summary of a card, in px. These match `.sheets` and `.sheet` in styles.css. */
export const SHEET_GAP = 24;
export const SHEET_CHROME = { x: 22, y: 108 };
/** The part of the window height that the app bar, the tabs, and a margin take. */
export const WINDOW_ALLOWANCE = 140;
const MIN_LONG_PX = 200;
const MIN_SHORT_PX = 120;

/**
 * The largest scale, in px per unit, at which `count` sheets of up to `size` fit in `box`, in rows. When they cannot
 * all fit, each sheet stays readable, the rows fill the width, and the page scrolls.
 */
export function fitScale(size: Size, count: number, box: { width: number; height: number }): number {
  const sheets = Math.max(1, count);
  const across = (columns: number) => ((box.width - (columns - 1) * SHEET_GAP) / columns - SHEET_CHROME.x) / size.length;
  let best = 0;
  for (let columns = 1; columns <= sheets; columns++) {
    const rows = Math.ceil(sheets / columns);
    const down = ((box.height - (rows - 1) * SHEET_GAP) / rows - SHEET_CHROME.y) / size.width;
    if (down > 0) best = Math.max(best, Math.min(across(columns), down));
  }
  const readable = Math.max(MIN_LONG_PX / Math.max(size.length, size.width), MIN_SHORT_PX / Math.min(size.length, size.width));
  if (best >= readable) return best;
  let columns = 1;
  while (columns < sheets && across(columns + 1) >= readable) columns++;
  return across(columns);
}
