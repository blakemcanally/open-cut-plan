import type { Design, Project } from "../format/schema.ts";
import { designColorKey, NO_GROUP_COLOR, partColors } from "./colors.ts";
import { escapeXml } from "./svg.ts";

export const ASSEMBLY_ACCENT = "#1a5fd0";
export const ACCENT_STROKE = "#0d3c8c";
export const LATER_COLOR = "#b5b5b5";

export interface AssemblyDrawing {
  svg: string;
  /** A text alternative for the drawing. */
  description: string;
}

export type DrawState = "later" | "placed" | "current";

export function num(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

export function designFill(project: Project, design: Design): string {
  return partColors(project).get(designColorKey(design.id, 1))?.color ?? NO_GROUP_COLOR;
}

export function boardPaint(state: DrawState, fill: string): string {
  return state === "current"
    ? `fill="${ASSEMBLY_ACCENT}" stroke="${ACCENT_STROKE}" stroke-width="1.5"`
    : state === "placed"
      ? `fill="${escapeXml(fill)}" stroke="#333" stroke-width="1"`
      : `fill="none" stroke="${LATER_COLOR}" stroke-width="1"`;
}

export function drawLine(data: string, x1: number, y1: number, x2: number, y2: number, color: string, px: number): string {
  return `<line ${data} x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="${color}" stroke-width="${px}" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
}

/** The width and the height with their dimension lines, and the depth below the unit. */
export function dimensionsSvg(unit: number, width: number, height: number, below: number, show: (value: number) => string, depth: number): string[] {
  const font = `font-size="${num(unit)}"`;
  const dim = (x1: number, y1: number, x2: number, y2: number, label: string, tx: number, ty: number, rotate: boolean) => [
    `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="#1a5fd0" stroke-width="${num(unit * 0.06)}"/>`,
    `<text x="${num(tx)}" y="${num(ty)}" ${font} text-anchor="middle" dominant-baseline="middle" fill="#1a5fd0"${rotate ? ` transform="rotate(-90 ${num(tx)} ${num(ty)})"` : ""}>${escapeXml(label)}</text>`,
  ];
  return [
    ...dim(0, -unit * 1.5, width, -unit * 1.5, show(width), width / 2, -unit * 2.6, false),
    ...dim(width + unit * 1.5, 0, width + unit * 1.5, height, show(height), width + unit * 2.6, height / 2, true),
    `<text x="${num(width / 2)}" y="${num(height + below + unit * 2)}" ${font} text-anchor="middle" dominant-baseline="middle" fill="#1a5fd0">${escapeXml(`Depth ${show(depth)}`)}</text>`,
  ];
}
