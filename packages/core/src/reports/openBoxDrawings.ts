import { assemblyBoardKey, type AssemblyBoard, type AssemblyStep } from "../design/assembly.ts";
import { designGeometry, materialsById } from "../design/geometry.ts";
import type { Design, Project } from "../format/schema.ts";
import { formatLength } from "../geometry/format.ts";
import { ASSEMBLY_ACCENT, boardPaint, designFill, dimensionsSvg, drawLine, num, type AssemblyDrawing, type DrawState } from "./drawing.ts";
import { escapeXml } from "./svg.ts";

/**
 * The front view of one unit of a valid open-top box, to scale in project units: the front wall in the colour of the
 * design, and dashed lines for the inner faces of the sides and the top face of the bottom behind it.
 */
export function openBoxElevationSvg(project: Project, design: Design): string {
  const geometry = designGeometry(design, materialsById(project))!;
  const units = project.project.units;
  const show = (value: number) => formatLength(value, units, project.settings.display);
  const { thickness: t, outsideWidth: width, outsideHeight: height, depth } = geometry;
  const unit = Math.max(width, height) / 40;
  const margin = unit * 4;
  const viewWidth = width + 2 * margin;
  const viewHeight = height + 2 * margin;
  const hidden = (face: string, x1: number, y1: number, x2: number, y2: number) =>
    `<line data-hidden="${face}" x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="#333" stroke-width="${num(unit * 0.06)}" stroke-dasharray="${num(unit * 0.4)} ${num(unit * 0.25)}"/>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(-margin)} ${num(-margin)} ${num(viewWidth)} ${num(viewHeight)}" width="${num(viewWidth)}${units}" height="${num(viewHeight)}${units}" font-family="Helvetica, Arial, sans-serif">`,
    `<title>${escapeXml(`${design.name}: ${show(width)} × ${show(height)} × ${show(depth)}`)}</title>`,
    `<g data-design="${escapeXml(design.id)}">`,
    `<rect data-panel="front" x="0" y="0" width="${num(width)}" height="${num(height)}" fill="${escapeXml(designFill(project, design))}" stroke="#333" stroke-width="${num(unit * 0.08)}"><title>Front</title></rect>`,
    hidden("side", t, 0, t, height),
    hidden("side", width - t, 0, width - t, height),
    hidden("bottom", t, height - t, width - t, height - t),
    "</g>",
    ...dimensionsSvg(unit, width, height, 0, show, depth),
    "</svg>",
  ].join("\n");
}

interface TopPanel {
  kind: "front" | "back" | "side" | "bottom";
  key: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function boardsText(boards: readonly AssemblyBoard[]): string {
  const sides = boards.flatMap((board) => (board.kind === "side" ? [board.side] : []));
  const has = (kind: AssemblyBoard["kind"]) => boards.some((board) => board.kind === kind);
  const items = [
    ...(has("front") ? ["the front"] : []),
    ...(has("back") ? ["the back"] : []),
    ...(sides.length === 2 ? ["the 2 sides"] : sides.map((side) => `the ${side} side`)),
    ...(has("bottom") ? ["the bottom"] : []),
  ];
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function drawingText(step: AssemblyStep, placed: boolean, later: boolean): string {
  const boards = boardsText(step.boards ?? []);
  if (step.action === "drill") return `Top view with the boards to drill marked: ${boards}.`;
  if (step.action === "square") return "Top view with the two diagonals to measure.";
  if (step.action === "finish") return "Top view of the finished unit.";
  return [
    boards === "" ? "Top view of the unit so far." : `Top view with the boards that this step adds marked: ${boards}.`,
    ...(placed && boards !== "" ? ["The boards of earlier steps are in place."] : []),
    ...(later ? ["The boards of later steps are outlines."] : []),
  ].join(" ");
}

/**
 * A top view for each assembly step of one unit of a valid open-top box, in the order of `steps`. The back is along
 * the top edge and the front along the lower edge. The boards of the step are in the accent colour, the boards that
 * earlier join steps added have the colour of the design, and the other boards are grey outlines.
 */
export function openBoxAssemblyDrawings(project: Project, design: Design, steps: readonly AssemblyStep[]): AssemblyDrawing[] {
  const geometry = designGeometry(design, materialsById(project))!;
  const units = project.project.units;
  const { thickness: t, outsideWidth: width, depth } = geometry;
  const unit = Math.max(width, depth) / 40;
  const margin = unit * 1.5;
  const viewWidth = width + 2 * margin;
  const viewHeight = depth + 2 * margin;
  const fill = designFill(project, design);
  const inside = depth - 2 * t;
  const panels: TopPanel[] = [
    { kind: "back", key: "back", name: "Back", x: 0, y: 0, width, height: t },
    { kind: "side", key: "side-left", name: "Side", x: 0, y: t, width: t, height: inside },
    { kind: "side", key: "side-right", name: "Side", x: width - t, y: t, width: t, height: inside },
    { kind: "front", key: "front", name: "Front", x: 0, y: depth - t, width, height: t },
    { kind: "bottom", key: "bottom", name: "Bottom", x: t, y: t, width: width - 2 * t, height: inside },
  ];

  const joined = new Set<string>();
  return steps.map((step, index) => {
    const current = new Set((step.boards ?? []).map(assemblyBoardKey));
    const stateOf = (key: string): DrawState => (step.action === "finish" ? "placed" : current.has(key) ? "current" : joined.has(key) ? "placed" : "later");
    const states = panels.map((p) => stateOf(p.key));
    const description = drawingText(step, states.includes("placed"), states.includes("later"));
    const out: string[] = [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(-margin)} ${num(-margin)} ${num(viewWidth)} ${num(viewHeight)}" width="${num(viewWidth)}${units}" height="${num(viewHeight)}${units}" font-family="Helvetica, Arial, sans-serif">`,
      `<title>${escapeXml(description)}</title>`,
      `<g data-design="${escapeXml(design.id)}" data-step="${index + 1}">`,
    ];
    panels.forEach((p, i) => {
      out.push(
        `<rect data-panel="${p.kind}" data-state="${states[i]}" x="${num(p.x)}" y="${num(p.y)}" width="${num(p.width)}" height="${num(p.height)}" ${boardPaint(states[i]!, fill)} vector-effect="non-scaling-stroke"><title>${p.name}</title></rect>`,
      );
    });
    if (step.action === "square") out.push(drawLine("data-diagonal", 0, 0, width, depth, ASSEMBLY_ACCENT, 2.5), drawLine("data-diagonal", width, 0, 0, depth, ASSEMBLY_ACCENT, 2.5));
    out.push("</g>", "</svg>");
    if (step.action === "join") for (const key of current) joined.add(key);
    return { svg: out.join("\n"), description };
  });
}
