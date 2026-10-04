import { convertLength } from "../geometry/units.ts";
import { formatLength } from "../geometry/format.ts";
import type { CombinedCell, Project } from "../format/schema.ts";
import { designParts } from "../design/generate.ts";
import { designGeometry, materialsById } from "../design/geometry.ts";
import { railsFor } from "../design/hardware.ts";
import { designPanels } from "../design/panels.ts";
import { DEFAULT_DESIGN_MOUNT } from "../design/systems.ts";
import { designColorKey, NO_GROUP_COLOR, partColors } from "./colors.ts";
import { escapeXml } from "./svg.ts";

const LEG_HEIGHT_MM = 100;
const LEG_DIAMETER_MM = 30;
const FOOT_HEIGHT_MM = 24;
const RAIL_HEIGHT_MM = 40;
const RAIL_LENGTH_MM = { long: 630, short: 295 };

function num(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

export interface ElevationOptions {
  /** Cells to mark, with columns and rows from 1 as in `combined`. */
  highlight?: CombinedCell | null;
}

/**
 * A front view of one unit of a design, to scale in project units, or null when the design does not exist or cannot
 * make parts. Each board has its part name as a title; the boards whose name differs from the plain grid name (the
 * boards that a combined cell makes) also get a label.
 */
export function designElevationSvg(project: Project, designId: string, options: ElevationOptions = {}): string | null {
  const design = project.designs?.find((candidate) => candidate.id === designId);
  if (!design || designParts(project, design) === null) return null;
  const geometry = designGeometry(design, materialsById(project))!;
  const units = project.project.units;
  const show = (value: number) => formatLength(value, units, project.settings.display);
  const fromMm = (value: number) => convertLength(value, "mm", units);
  const mount = design.mount ?? DEFAULT_DESIGN_MOUNT;
  const { thickness: t, outsideWidth: width, outsideHeight: height } = geometry;
  const unit = Math.max(width, height) / 40;
  const below = mount === "legs" ? fromMm(LEG_HEIGHT_MM) : mount === "feet" ? fromMm(FOOT_HEIGHT_MM) : 0;
  const margin = unit * 4;
  const fill = partColors(project).get(designColorKey(design.id, 1))?.color ?? NO_GROUP_COLOR;
  const stroke = `stroke="#333" stroke-width="${num(unit * 0.08)}"`;
  const font = (scale: number) => `font-size="${num(unit * scale)}"`;
  const viewWidth = width + 2 * margin;
  const viewHeight = height + below + 2 * margin;
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(-margin)} ${num(-margin)} ${num(viewWidth)} ${num(viewHeight)}" width="${num(viewWidth)}${units}" height="${num(viewHeight)}${units}" font-family="Helvetica, Arial, sans-serif">`,
    `<title>${escapeXml(`${design.name}: ${show(width)} × ${show(height)} × ${show(geometry.depth)}`)}</title>`,
    `<g data-design="${escapeXml(design.id)}">`,
  ];
  const { panels, cells } = designPanels(geometry);
  for (const p of panels) {
    out.push(
      `<rect data-panel="${p.kind}" x="${num(p.x)}" y="${num(p.y)}" width="${num(p.width)}" height="${num(p.height)}" fill="${escapeXml(fill)}" ${stroke}><title>${escapeXml(p.name)}</title></rect>`,
    );
  }
  const highlight = options.highlight;
  const marked = highlight
    ? cells.filter((cell) => cell.column + 1 >= highlight.column && cell.column < highlight.column - 1 + highlight.columns && cell.row + 1 >= highlight.row && cell.row < highlight.row - 1 + highlight.rows)
    : [];
  if (marked.length > 0) {
    const left = Math.min(...marked.map((cell) => cell.x));
    const top = Math.min(...marked.map((cell) => cell.y));
    const right = Math.max(...marked.map((cell) => cell.x + cell.width));
    const bottom = Math.max(...marked.map((cell) => cell.y + cell.height));
    out.push(
      `<rect data-highlight x="${num(left)}" y="${num(top)}" width="${num(right - left)}" height="${num(bottom - top)}" fill="#1a5fd0" fill-opacity="0.15" stroke="#1a5fd0" stroke-width="${num(unit * 0.15)}"/>`,
    );
  }
  for (const cell of cells) {
    const size = `${show(cell.width)} × ${show(cell.height)}`;
    const scale = Math.min(0.9, cell.width / (0.62 * size.length + 1) / unit);
    out.push(`<text x="${num(cell.x + cell.width / 2)}" y="${num(cell.y + cell.height / 2)}" ${font(scale)} text-anchor="middle" dominant-baseline="middle" fill="#555">${escapeXml(size)}</text>`);
  }
  for (const p of panels.filter((candidate) => candidate.name.includes(","))) {
    const upright = p.kind === "divider";
    const length = upright ? p.height : p.width;
    const scale = Math.min(0.7, length / (0.6 * p.name.length + 1) / unit);
    const x = num(p.x + p.width / 2);
    const y = num(p.y + p.height / 2);
    out.push(
      `<text data-label="${p.kind}" x="${x}" y="${y}" ${font(scale)} text-anchor="middle" dominant-baseline="middle" fill="#222" stroke="#fff" stroke-width="${num(unit * scale * 0.25)}" paint-order="stroke"${upright ? ` transform="rotate(-90 ${x} ${y})"` : ""}>${escapeXml(p.name)}</text>`,
    );
  }

  if (mount === "legs" || mount === "feet") {
    const foot = mount === "legs" ? fromMm(LEG_DIAMETER_MM) : fromMm(40);
    for (const left of [t, width - t - foot]) {
      out.push(`<rect data-mount="${mount}" x="${num(left)}" y="${num(height)}" width="${num(foot)}" height="${num(below)}" fill="#444"/>`);
    }
  }
  if (mount === "wall-rail") {
    const rails = railsFor(convertLength(width, units, "mm"));
    const lengths = [...Array.from({ length: rails.long }, () => fromMm(RAIL_LENGTH_MM.long)), ...Array.from({ length: rails.short }, () => fromMm(RAIL_LENGTH_MM.short))];
    const pitch = width / lengths.length;
    lengths.forEach((length, index) => {
      out.push(
        `<rect data-mount="wall-rail" x="${num(index * pitch + (pitch - length) / 2)}" y="${num(t)}" width="${num(length)}" height="${num(fromMm(RAIL_HEIGHT_MM))}" fill="none" stroke="#333" stroke-width="${num(unit * 0.06)}" stroke-dasharray="${num(unit * 0.4)} ${num(unit * 0.25)}"/>`,
      );
    });
  }
  out.push("</g>");

  const dim = (x1: number, y1: number, x2: number, y2: number, label: string, tx: number, ty: number, rotate: boolean) =>
    out.push(
      `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="#1a5fd0" stroke-width="${num(unit * 0.06)}"/>`,
      `<text x="${num(tx)}" y="${num(ty)}" ${font(1)} text-anchor="middle" dominant-baseline="middle" fill="#1a5fd0"${rotate ? ` transform="rotate(-90 ${num(tx)} ${num(ty)})"` : ""}>${escapeXml(label)}</text>`,
    );
  dim(0, -unit * 1.5, width, -unit * 1.5, show(width), width / 2, -unit * 2.6, false);
  dim(width + unit * 1.5, 0, width + unit * 1.5, height, show(height), width + unit * 2.6, height / 2, true);
  out.push(`<text x="${num(width / 2)}" y="${num(height + below + unit * 2)}" ${font(1)} text-anchor="middle" dominant-baseline="middle" fill="#1a5fd0">${escapeXml(`Depth ${show(geometry.depth)}`)}</text>`);
  out.push("</svg>");
  return out.join("\n");
}
