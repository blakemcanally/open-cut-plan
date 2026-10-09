import { expect } from "vitest";
import { otherAxis, span, type CutNode, type Rect } from "../../src/index.ts";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function guillotine(random: () => number, rect: Rect, kerf: number, depth: number, out: Rect[]): void {
  const axis = random() < 0.5 ? "x" : "y";
  const size = axis === "x" ? rect.length : rect.width;
  const steps = Math.floor((size - kerf - 2) / 0.125);
  if (depth === 0 || steps < 1 || random() < 0.15) {
    if (random() < 0.8) out.push(rect);
    return;
  }
  const first = 1 + Math.floor(random() * steps) * 0.125;
  const [lo] = span(rect, axis);
  const a = axis === "x" ? { ...rect, length: first } : { ...rect, width: first };
  const b = axis === "x" ? { ...rect, x: lo + first + kerf, length: size - first - kerf } : { ...rect, y: lo + first + kerf, width: size - first - kerf };
  guillotine(random, a, kerf, depth - 1, out);
  guillotine(random, b, kerf, depth - 1, out);
}

export function assertCutsMissParts(node: CutNode, rects: readonly Rect[], kerf: number): void {
  if (node.kind !== "split") return;
  const [lo, hi] = span(node.rect, otherAxis(node.axis));
  for (const at of node.cuts) {
    for (const index of node.items) {
      const [s, e] = span(rects[index]!, node.axis);
      const [os, oe] = span(rects[index]!, otherAxis(node.axis));
      const crossesLine = s < at + kerf / 2 - 1e-6 && e > at - kerf / 2 + 1e-6;
      const withinPiece = oe > lo + 1e-6 && os < hi - 1e-6;
      expect(crossesLine && withinPiece).toBe(false);
    }
  }
  node.children.forEach((child) => assertCutsMissParts(child, rects, kerf));
}
