import { EPSILON, type Rect } from "@opencutplan/core";

export const LABEL_MAX_FONT = 12;
export const LABEL_MIN_FONT = 7;
const FONT_STEP = 0.5;
const SIZE_FONT = 0.85;
const PAD = 6;

/** An estimate of the width of bold sans-serif text, in pixels. */
export function textWidth(text: string, font: number): number {
  return text.length * font * 0.6;
}

export interface PartLabel {
  name: string | null;
  /** Under the name, at `SIZE_FONT` of the font, when both are set. */
  size: string | null;
  font: number;
  /** Turned a quarter turn, for a tall narrow part. */
  vertical: boolean;
}

function fit(along: number, across: number, name: string, size: string, vertical: boolean): PartLabel | null {
  const fits = (text: string, font: number) => textWidth(text, font) + PAD <= along;
  for (let font = LABEL_MAX_FONT; font >= LABEL_MIN_FONT; font -= FONT_STEP) {
    if (across >= (1 + SIZE_FONT) * 1.2 * font + 4 && fits(name, font) && fits(size, font * SIZE_FONT)) return { name, size, font, vertical };
    if (across < 1.25 * font + 2) continue;
    if (fits(name, font)) return { name, size: null, font, vertical };
    if (fits(size, font)) return { name: null, size, font, vertical };
  }
  return null;
}

/** The largest label that fits in a part of `width` × `height` pixels: the name and the size, the name, or the size. Null when none fits. */
export function fitPartLabel(width: number, height: number, name: string, size: string): PartLabel | null {
  return fit(width, height, name, size, false) ?? (height > width ? fit(height, width, name, size, true) : null);
}

export interface Overlaps {
  /** The area that each pair of overlapping parts shares. */
  areas: Rect[];
  /** The indices of the parts that overlap another part. */
  parts: Set<number>;
}

/** Null entries are skipped. Parts that only touch do not overlap. */
export function overlaps(rects: readonly (Rect | null)[]): Overlaps {
  const areas: Rect[] = [];
  const parts = new Set<number>();
  rects.forEach((a, i) => {
    if (!a) return;
    for (let j = i + 1; j < rects.length; j++) {
      const b = rects[j];
      if (!b) continue;
      const x = Math.max(a.x, b.x);
      const y = Math.max(a.y, b.y);
      const length = Math.min(a.x + a.length, b.x + b.length) - x;
      const width = Math.min(a.y + a.width, b.y + b.width) - y;
      if (length <= EPSILON || width <= EPSILON) continue;
      areas.push({ x, y, length, width });
      parts.add(i).add(j);
    }
  });
  return { areas, parts };
}
