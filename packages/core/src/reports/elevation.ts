import { convertLength } from "../geometry/units.ts";
import { formatLength } from "../geometry/format.ts";
import type { CombinedCell, Project } from "../format/schema.ts";
import { designParts } from "../design/generate.ts";
import { assemblyBoardKey, assemblySteps, type AssemblyBoard, type AssemblyStep } from "../design/assembly.ts";
import { designGeometry, materialsById, roundLength, type DesignGeometry } from "../design/geometry.ts";
import { railsFor } from "../design/hardware.ts";
import { cellStarts, designLayout, type Board } from "../design/layout.ts";
import { designPanels, type Panel } from "../design/panels.ts";
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

function mountHeight(mount: string, units: Project["project"]["units"]): number {
  return convertLength(mount === "legs" ? LEG_HEIGHT_MM : mount === "feet" ? FOOT_HEIGHT_MM : 0, "mm", units);
}

interface MountShape {
  kind: "legs" | "feet" | "wall-rail";
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The legs or the feet under the unit (the front two), or the wall rails behind its top. */
function mountShapes(geometry: DesignGeometry, mount: string, units: Project["project"]["units"]): MountShape[] {
  const fromMm = (value: number) => convertLength(value, "mm", units);
  const { thickness: t, outsideWidth: width, outsideHeight: height } = geometry;
  if (mount === "legs" || mount === "feet") {
    const foot = mount === "legs" ? fromMm(LEG_DIAMETER_MM) : fromMm(40);
    return [t, width - t - foot].map((x) => ({ kind: mount, x, y: height, width: foot, height: mountHeight(mount, units) }));
  }
  if (mount !== "wall-rail") return [];
  const rails = railsFor(convertLength(width, units, "mm"));
  const lengths = [...Array.from({ length: rails.long }, () => fromMm(RAIL_LENGTH_MM.long)), ...Array.from({ length: rails.short }, () => fromMm(RAIL_LENGTH_MM.short))];
  const pitch = width / lengths.length;
  return lengths.map((length, index) => ({ kind: "wall-rail", x: index * pitch + (pitch - length) / 2, y: t, width: length, height: fromMm(RAIL_HEIGHT_MM) }));
}

/** The name of a board in a white box at its middle, along the board. */
function labelSvg(p: Panel, unit: number): string[] {
  const upright = p.kind === "divider";
  const length = upright ? p.height : p.width;
  const size = unit * Math.min(0.8, length / (0.6 * p.name.length + 2) / unit);
  const boxWidth = size * (0.58 * p.name.length + 0.8);
  const boxHeight = size * 1.4;
  const cx = p.x + p.width / 2;
  const cy = p.y + p.height / 2;
  return [
    `<g data-label="${p.kind}"${upright ? ` transform="rotate(-90 ${num(cx)} ${num(cy)})"` : ""}>`,
    `<rect x="${num(cx - boxWidth / 2)}" y="${num(cy - boxHeight / 2)}" width="${num(boxWidth)}" height="${num(boxHeight)}" rx="${num(size * 0.3)}" fill="#fff" stroke="#333" stroke-width="${num(unit * 0.04)}"/>`,
    `<text x="${num(cx)}" y="${num(cy)}" font-size="${num(size)}" text-anchor="middle" dominant-baseline="central" fill="#222">${escapeXml(p.name)}</text>`,
    "</g>",
  ];
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
  const mount = design.mount ?? DEFAULT_DESIGN_MOUNT;
  const { outsideWidth: width, outsideHeight: height } = geometry;
  const unit = Math.max(width, height) / 40;
  const below = mountHeight(mount, units);
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
  for (const p of panels.filter((candidate) => candidate.name.includes(","))) out.push(...labelSvg(p, unit));

  for (const shape of mountShapes(geometry, mount, units)) {
    const box = `x="${num(shape.x)}" y="${num(shape.y)}" width="${num(shape.width)}" height="${num(shape.height)}"`;
    out.push(
      shape.kind === "wall-rail"
        ? `<rect data-mount="wall-rail" ${box} fill="none" stroke="#333" stroke-width="${num(unit * 0.06)}" stroke-dasharray="${num(unit * 0.4)} ${num(unit * 0.25)}"/>`
        : `<rect data-mount="${shape.kind}" ${box} fill="#444"/>`,
    );
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

export const ASSEMBLY_ACCENT = "#1a5fd0";
const ACCENT_STROKE = "#0d3c8c";
const MARK_COLOR = "#d9480f";
const LATER_COLOR = "#b5b5b5";

export interface AssemblyDrawing {
  svg: string;
  /** A text alternative for the drawing. */
  description: string;
}

type DrawState = "later" | "placed" | "current";

function boardsText(boards: readonly AssemblyBoard[], rows: number): string {
  const has = (kind: AssemblyBoard["kind"]) => boards.some((board) => board.kind === kind);
  const sides = boards.flatMap((board) => (board.kind === "side" ? [board.side] : []));
  const dividers = boards.filter((board): board is Board => board.kind === "divider");
  const shelves = boards.filter((board): board is Board => board.kind === "shelf");
  const span = (board: Board, single: string, many: string) => (board.from === board.to ? `${single} ${board.from + 1}` : `${many} ${board.from + 1}–${board.to + 1}`);
  const items = [
    ...(has("top") ? ["the top"] : []),
    ...(has("bottom") ? ["the bottom"] : []),
    ...(sides.length === 2 ? ["the 2 sides"] : sides.map((side) => `the ${side} side`)),
    ...(dividers.length === 1
      ? [`the divider on the right of column ${dividers[0]!.line}${dividers[0]!.from === 0 && dividers[0]!.to === rows - 1 ? "" : ` (${span(dividers[0]!, "row", "rows")})`}`]
      : dividers.length > 1
        ? [`${dividers.length} dividers`]
        : []),
    ...(shelves.length === 1 ? [`the shelf under row ${shelves[0]!.line} (${span(shelves[0]!, "column", "columns")})`] : shelves.length > 1 ? [`${shelves.length} shelves`] : []),
    ...(has("back") ? ["the back"] : []),
  ];
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function drawingText(step: AssemblyStep, rows: number, mount: string, placed: boolean, later: boolean): string {
  const boards = boardsText(step.boards ?? [], rows);
  if (step.action === "join" || step.action === undefined) {
    const added = boards === "" ? "Front view of the unit so far." : `Front view with the boards that this step adds marked: ${boards}.`;
    return [added, ...(placed && boards !== "" ? ["The boards of earlier steps are in place."] : []), ...(later ? ["The boards of later steps are outlines."] : [])].join(" ");
  }
  switch (step.action) {
    case "drill":
      return `Front view with the boards to drill marked: ${boards}.`;
    case "mark":
      return `Front view with the marks on ${boards}.`;
    case "spacers":
      return "Front view with a spacer under each end of each shelf.";
    case "subassembly":
      return `Front view with the boards of the long shelves marked: ${boards}.`;
    case "square":
      return "Front view with the two diagonals to measure.";
    case "mount":
      return `Front view with the ${mount === "wall-rail" ? "wall rail" : mount} marked.`;
    case "anchor":
      return "Front view with the anti-tip fitting marked at the top.";
  }
}

/**
 * A front view for each assembly step of one unit, in the order of `assemblySteps`, or null when the design does not
 * exist or cannot make parts. The boards of the step are in the accent colour, the boards that earlier join steps added
 * have the colour of the design, and the other boards are grey outlines. A step that marks positions shows the marks.
 */
export function assemblyDrawings(project: Project, designId: string): AssemblyDrawing[] | null {
  const design = project.designs?.find((candidate) => candidate.id === designId);
  const steps = assemblySteps(project, designId);
  if (!design || !steps) return null;
  const geometry = designGeometry(design, materialsById(project))!;
  const units = project.project.units;
  const mount = design.mount ?? DEFAULT_DESIGN_MOUNT;
  const { thickness: t, columns, rows, outsideWidth: width, outsideHeight: height } = geometry;
  const unit = Math.max(width, height) / 40;
  const margin = unit * 1.5;
  const below = mountHeight(mount, units);
  const fill = partColors(project).get(designColorKey(design.id, 1))?.color ?? NO_GROUP_COLOR;
  const viewWidth = width + 2 * margin;
  const viewHeight = height + below + 2 * margin;
  const { panels } = designPanels(geometry);
  const shapes = mountShapes(geometry, mount, units);

  const cellX = cellStarts(columns, t);
  const cellY = cellStarts(rows, t);
  const at = (kind: string, x: number, y: number) => `${kind}:${num(x)}:${num(y)}`;
  const layout = designLayout(geometry);
  const byPosition = new Map(
    [...layout.dividers, ...layout.shelves].map((board) => [
      board.kind === "divider" ? at("divider", roundLength(cellX[board.line - 1]! + columns[board.line - 1]!), cellY[board.from]!) : at("shelf", cellX[board.from]!, roundLength(cellY[board.line - 1]! + rows[board.line - 1]!)),
      assemblyBoardKey(board),
    ]),
  );
  const keyOf = (p: Panel) => (p.kind === "side" ? (p.x === 0 ? "side-left" : "side-right") : p.kind === "top" || p.kind === "bottom" ? p.kind : byPosition.get(at(p.kind, p.x, p.y))!);
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const horizontal = (p: Panel) => p.kind === "top" || p.kind === "bottom" || p.kind === "shelf";
  const line = (data: string, x1: number, y1: number, x2: number, y2: number, color: string, px: number) =>
    `<line ${data} x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="${color}" stroke-width="${px}" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;

  const marks = (p: Panel): string[] => {
    const out: string[] = [];
    if (horizontal(p)) {
      for (const d of panels.filter((candidate) => candidate.kind === "divider" && candidate.x > p.x + 1e-6 && candidate.x < p.x + p.width - 1e-6)) {
        const under = near(d.y, p.y + t);
        const over = near(d.y + d.height, p.y);
        if (under || over) out.push(line("data-mark", d.x, p.y - (over ? unit : 0), d.x, p.y + t + (under ? unit : 0), MARK_COLOR, 2.5));
      }
      return out;
    }
    const ends = new Map<number, { left: boolean; right: boolean }>();
    for (const s of panels.filter((candidate) => candidate.kind === "shelf" && candidate.y >= p.y - 1e-6 && candidate.y < p.y + p.height)) {
      const left = near(s.x + s.width, p.x);
      const right = near(s.x, p.x + t);
      if (!left && !right) continue;
      const end = ends.get(s.y) ?? { left: false, right: false };
      ends.set(s.y, { left: end.left || left, right: end.right || right });
    }
    for (const [y, end] of ends) out.push(line("data-mark", p.x - (end.left ? unit : 0), y + t, p.x + t + (end.right ? unit : 0), y + t, MARK_COLOR, 2.5));
    return out;
  };

  const spacers = (): string[] => {
    const size = t * 1.5;
    return panels
      .filter((p) => p.kind === "shelf")
      .flatMap((s) =>
        [s.x + t / 2, s.x + s.width - t / 2 - size].map((x) => {
          const floor = Math.min(...panels.filter((p) => (p.kind === "shelf" || p.kind === "bottom") && p.y > s.y && p.x <= x + 1e-6 && p.x + p.width >= x + size - 1e-6).map((p) => p.y));
          return `<rect data-spacer x="${num(x)}" y="${num(s.y + t)}" width="${num(size)}" height="${num(floor - s.y - t)}" fill="${ASSEMBLY_ACCENT}" fill-opacity="0.45" stroke="${ACCENT_STROKE}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
        }),
      );
  };

  const mountAt = steps.findIndex((step) => step.action === "mount");
  const boardFill = (state: DrawState) =>
    state === "current"
      ? `fill="${ASSEMBLY_ACCENT}" stroke="${ACCENT_STROKE}" stroke-width="1.5"`
      : state === "placed"
        ? `fill="${escapeXml(fill)}" stroke="#333" stroke-width="1"`
        : `fill="none" stroke="${LATER_COLOR}" stroke-width="1"`;

  const joined = new Set<string>();
  return steps.map((step, index) => {
    const current = new Set((step.boards ?? []).map(assemblyBoardKey));
    const stateOf = (key: string): DrawState => (current.has(key) ? "current" : joined.has(key) ? "placed" : "later");
    const mountState: DrawState = mountAt < 0 || index < mountAt ? "later" : index === mountAt ? "current" : "placed";
    const states = panels.map((p) => stateOf(keyOf(p)));
    const description = drawingText(step, rows.length, mount, states.includes("placed"), states.includes("later"));
    const out: string[] = [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(-margin)} ${num(-margin)} ${num(viewWidth)} ${num(viewHeight)}" width="${num(viewWidth)}${units}" height="${num(viewHeight)}${units}" font-family="Helvetica, Arial, sans-serif">`,
      `<title>${escapeXml(description)}</title>`,
      `<g data-design="${escapeXml(design.id)}" data-step="${index + 1}">`,
    ];
    const back = stateOf("back");
    if (design.back && back !== "later") {
      out.push(`<rect data-board="back" data-state="${back}" x="0" y="0" width="${num(width)}" height="${num(height)}" fill="${back === "current" ? ASSEMBLY_ACCENT : escapeXml(fill)}" fill-opacity="${back === "current" ? 0.35 : 0.45}"/>`);
    }
    panels.forEach((p, i) => {
      out.push(
        `<rect data-panel="${p.kind}" data-state="${states[i]}" x="${num(p.x)}" y="${num(p.y)}" width="${num(p.width)}" height="${num(p.height)}" ${boardFill(states[i]!)} vector-effect="non-scaling-stroke"><title>${escapeXml(p.name)}</title></rect>`,
      );
    });
    if (step.action === "mark") panels.forEach((p, i) => states[i] === "current" && out.push(...marks(p)));
    if (step.action === "spacers") out.push(...spacers());
    if (step.action === "square") out.push(line("data-diagonal", 0, 0, width, height, ASSEMBLY_ACCENT, 2.5), line("data-diagonal", width, 0, 0, height, ASSEMBLY_ACCENT, 2.5));
    if (step.action === "anchor") {
      out.push(`<rect data-anchor x="${num(width / 2 - unit)}" y="${num(-unit * 0.9)}" width="${num(unit * 2)}" height="${num(unit * 0.9)}" ${boardFill("current")} vector-effect="non-scaling-stroke"><title>Anti-tip fitting</title></rect>`);
    }
    for (const shape of shapes) {
      const box = `data-mount="${shape.kind}" data-state="${mountState}" x="${num(shape.x)}" y="${num(shape.y)}" width="${num(shape.width)}" height="${num(shape.height)}"`;
      if (shape.kind !== "wall-rail") out.push(`<rect ${box} ${mountState === "placed" ? 'fill="#444"' : boardFill(mountState)} vector-effect="non-scaling-stroke"/>`);
      else {
        const color = mountState === "current" ? ACCENT_STROKE : mountState === "placed" ? "#333" : LATER_COLOR;
        out.push(
          `<rect ${box} fill="${mountState === "current" ? ASSEMBLY_ACCENT : "none"}" fill-opacity="0.35" stroke="${color}" stroke-width="1.5" stroke-dasharray="${num(unit * 0.4)} ${num(unit * 0.25)}" vector-effect="non-scaling-stroke"/>`,
        );
      }
    }
    panels.forEach((p, i) => states[i] === "current" && p.name.includes(",") && out.push(...labelSvg(p, unit)));
    out.push("</g>", "</svg>");
    if (step.action === "join") for (const key of current) joined.add(key);
    return { svg: out.join("\n"), description };
  });
}
