import { copyLabel, formatSize, grainOk, stockLabel, usableRect, type PlanContext } from "../plan/context.ts";
import type { SheetAnalysis } from "../plan/sheets.ts";
import type { Step } from "../sequence/sequence.ts";
import { NO_GROUP_COLOR, stageColor } from "./colors.ts";

export interface SheetSvgOptions {
  /** Fill colour for each part group; see `groupColors`. */
  colors?: ReadonlyMap<string, string>;
  /** The `width` and `height` attributes. They default to the real size of `sheetSvgExtent`, such as `99.2in` and `51.2in` for a 96 × 48 sheet. */
  width?: string;
  height?: string;
  /** Defaults to true. */
  showCuts?: boolean;
  /** A step number to draw stronger than the others. */
  highlight?: number | null;
  /** Pales the sheet outside the piece of the `highlight` step and outlines that piece. */
  focus?: boolean;
  /** Step numbers to draw as done. */
  done?: ReadonlySet<number>;
  /** Starts every element id. Give each drawing in one page its own prefix, or the drawings share their patterns. Defaults to `ocp`. */
  idPrefix?: string;
}

const DONE_COLOR = "#9a9a9a";

export function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function num(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

export interface SvgExtent {
  /** Space past each sheet edge, so that the numbers on edge cuts are not clipped. */
  margin: number;
  length: number;
  width: number;
}

/** The area `sheetSvg` draws, in project units: the sheet and a margin on every side. */
export function sheetSvgExtent(sheet: SheetAnalysis): SvgExtent {
  const margin = Math.min(sheet.stock.length, sheet.stock.width) / 30;
  return { margin, length: sheet.stock.length + 2 * margin, width: sheet.stock.width + 2 * margin };
}

/** A standalone SVG drawing of one sheet in project units: parts, grain, trim, and numbered cut lines. */
export function sheetSvg(ctx: PlanContext, sheet: SheetAnalysis, steps: readonly Step[], options: SheetSvgOptions = {}): string {
  const { stock } = sheet;
  const number = sheet.index + 1;
  const extent = sheetSvgExtent(sheet);
  const base = extent.margin;
  const material = ctx.materials.get(stock.material);
  const grained = ctx.features.grain && material?.grained === true;
  const prefix = escapeXml(`${options.idPrefix ?? "ocp"}-s${number}`);
  const width = escapeXml(options.width ?? `${num(extent.length)}${ctx.units}`);
  const height = escapeXml(options.height ?? `${num(extent.width)}${ctx.units}`);
  const out: string[] = [];

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(-base)} ${num(-base)} ${num(extent.length)} ${num(extent.width)}" width="${width}" height="${height}" font-family="Helvetica, Arial, sans-serif">`,
    `<title>${escapeXml(`Sheet ${number}: ${stockLabel(ctx, stock)}`)}</title>`,
  );
  if (grained) {
    const size = num(base * 0.4);
    out.push(
      "<defs>",
      `<pattern id="${prefix}-h" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><line x1="0" y1="${size}" x2="${size}" y2="${size}" stroke="#00000022" stroke-width="${num(base * 0.04)}"/></pattern>`,
      `<pattern id="${prefix}-v" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><line x1="${size}" y1="0" x2="${size}" y2="${size}" stroke="#00000022" stroke-width="${num(base * 0.04)}"/></pattern>`,
      "</defs>",
    );
  }
  out.push(`<rect x="0" y="0" width="${num(stock.length)}" height="${num(stock.width)}" fill="#efe3c8" stroke="#333" stroke-width="${num(base * 0.08)}"/>`);
  if (grained) out.push(`<rect x="0" y="0" width="${num(stock.length)}" height="${num(stock.width)}" fill="url(#${prefix}-h)"/>`);
  if (sheet.trim > 0) {
    const usable = usableRect(ctx, stock);
    out.push(
      `<rect x="${num(usable.x)}" y="${num(usable.y)}" width="${num(usable.length)}" height="${num(usable.width)}" fill="none" stroke="#00000066" stroke-width="${num(base * 0.04)}" stroke-dasharray="${num(base * 0.3)} ${num(base * 0.2)}"/>`,
    );
  }

  for (const item of sheet.items) {
    const placement = sheet.sheet.placements[item.index]!;
    const part = ctx.parts.get(placement.part)!;
    const { rect } = item;
    const fill = (part.group !== undefined && options.colors?.get(part.group)) || NO_GROUP_COLOR;
    const striped = grained && part.grain !== "none";
    const horizontal = (part.grain === "length") !== placement.rotated;
    const cross = striped && !grainOk(ctx, part, placement.rotated);
    const name = `${copyLabel(part, placement.copy)}${striped ? (horizontal ? " ↔" : " ↕") : ""}${cross ? " ⟂" : ""}`;
    const size = formatSize(ctx, rect);
    out.push(
      `<g data-part="${escapeXml(`${placement.part}#${placement.copy}`)}" transform="translate(${num(rect.x)} ${num(rect.y)})">`,
      `<rect width="${num(rect.length)}" height="${num(rect.width)}" fill="${escapeXml(fill)}"/>`,
    );
    if (striped) out.push(`<rect width="${num(rect.length)}" height="${num(rect.width)}" fill="url(#${prefix}-${horizontal ? "h" : "v"})"/>`);
    out.push(`<rect width="${num(rect.length)}" height="${num(rect.width)}" fill="none" stroke="#333" stroke-width="${num(base * 0.05)}"/>`);
    const font = Math.min(base, rect.width / 3, rect.length / (0.62 * Math.max(name.length, size.length) + 1));
    if (font >= base * 0.3) {
      const cx = num(rect.length / 2);
      const twoLines = rect.width > 3 * font;
      const y = rect.width / 2 - (twoLines ? font * 0.55 : 0);
      out.push(`<text x="${cx}" y="${num(y)}" font-size="${num(font)}" font-weight="600" text-anchor="middle" dominant-baseline="middle" fill="#222">${escapeXml(name)}</text>`);
      if (twoLines) {
        out.push(`<text x="${cx}" y="${num(y + font * 1.15)}" font-size="${num(font * 0.85)}" text-anchor="middle" dominant-baseline="middle" fill="#222">${escapeXml(size)}</text>`);
      }
    }
    out.push("</g>");
  }

  const focused = options.focus ? steps.find((step) => step.step === options.highlight && step.sheetNumber === number) : undefined;
  if (focused) {
    const p = focused.piece;
    const box = (x: number, y: number, across: number, down: number) => `M${num(x)} ${num(y)}h${num(across)}v${num(down)}h${num(-across)}z`;
    out.push(
      `<path data-focus="true" d="${box(0, 0, stock.length, stock.width)} ${box(p.x, p.y, p.length, p.width)}" fill="#fff" fill-opacity="0.55" fill-rule="evenodd"/>`,
      `<rect data-piece="true" x="${num(p.x)}" y="${num(p.y)}" width="${num(p.length)}" height="${num(p.width)}" fill="none" stroke="#111" stroke-width="${num(base * 0.15)}"/>`,
    );
  }

  if (options.showCuts ?? true) {
    for (const step of steps) {
      if (step.sheetNumber !== number) continue;
      const [x1, y1, x2, y2] = step.axis === "x" ? [step.at, step.from, step.at, step.to] : [step.from, step.at, step.to, step.at];
      const current = options.highlight === step.step;
      const done = options.done?.has(step.step) === true && !current;
      const color = done ? DONE_COLOR : stageColor(step.stage);
      const attributes = `data-step="${step.step}"${current ? ' data-highlight="true"' : ""}${done ? ' data-done="true"' : ""}`;
      const dash = step.kind === "trim" ? ` stroke-dasharray="${num(base * 0.3)} ${num(base * 0.2)}"` : "";
      const r = base * (current ? 0.75 : 0.55);
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      out.push(
        `<g ${attributes}>`,
        `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="${color}" stroke-width="${num(base * (current ? 0.22 : 0.07))}"${dash}/>`,
        `<circle cx="${num(mx)}" cy="${num(my)}" r="${num(r)}" fill="${current ? color : "#fff"}" stroke="${color}" stroke-width="${num(base * 0.06)}"/>`,
        `<text x="${num(mx)}" y="${num(my)}" font-size="${num(r * 1.1)}" text-anchor="middle" dominant-baseline="central" fill="${current ? "#fff" : color}">${step.step}</text>`,
        "</g>",
      );
    }
  }
  out.push("</svg>");
  return out.join("\n");
}
