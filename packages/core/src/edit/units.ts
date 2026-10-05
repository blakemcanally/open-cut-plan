import type { Design, DesignAxis, PlanSheet, Project, Tool } from "../format/schema.ts";
import { snapLength } from "../geometry/precision.ts";
import { convertLength, type Units } from "../geometry/units.ts";

const TOOL_LENGTHS = ["maxRip", "maxCrosscut", "maxCut"] as const;

/**
 * Snaps to the nanometre grid so 48 in becomes 1219.2 mm, not 1219.1999999999998. A value that the grid would move by
 * more than 1e-8 is off the grid, such as 35/3 in; it keeps the finer rounding, because a layout check adds up to four
 * converted values and the grid step in mm equals EPSILON.
 */
function converter(from: Units, to: Units): (value: number) => number {
  return (value) => {
    const converted = convertLength(value, from, to);
    const snapped = snapLength(converted, to);
    return Math.abs(snapped - converted) <= 1e-8 ? snapped : Math.round(converted * 1e9) / 1e9;
  };
}

export function convertTool(tool: Tool, from: Units, to: Units): Tool {
  const c = converter(from, to);
  const next: Record<string, unknown> = { ...tool, kerf: c(tool.kerf) };
  for (const key of TOOL_LENGTHS) {
    const value = next[key];
    if (typeof value === "number") next[key] = c(value);
  }
  if (tool.type === "table-saw") {
    for (const key of ["maxPiece", "maxCrosscutPiece"] as const) {
      const piece = tool[key];
      if (piece) next[key] = { ...piece, length: c(piece.length), width: c(piece.width) };
    }
  }
  return next as Tool;
}

function convertAxis(axis: DesignAxis, c: (value: number) => number): DesignAxis {
  return "openings" in axis ? { ...axis, openings: axis.openings.map(c) } : { ...axis, outside: c(axis.outside) };
}

function convertDesign(design: Design, c: (value: number) => number): Design {
  return { ...design, width: convertAxis(design.width, c), height: convertAxis(design.height, c), depth: c(design.depth) };
}

/** Converts every length to `units`. Stored cut lists are dropped; the app computes them again. */
export function convertProjectUnits(project: Project, units: Units): Project {
  const from = project.project.units;
  if (from === units) return project;
  const c = converter(from, units);
  const settings = { ...project.settings, trim: c(project.settings.trim) };
  const { minOffcut } = project.settings;
  if (minOffcut) settings.minOffcut = { ...minOffcut, length: c(minOffcut.length), width: c(minOffcut.width) };
  const { factoryEdge } = project.settings;
  if (factoryEdge) settings.factoryEdge = { ...factoryEdge, minLength: c(factoryEdge.minLength) };
  const next: Project = {
    ...project,
    project: { ...project.project, units },
    materials: project.materials.map((material) => ({ ...material, thickness: c(material.thickness) })),
    stock: project.stock.map((stock) => {
      const item = { ...stock, length: c(stock.length), width: c(stock.width) };
      if (stock.trim !== undefined) item.trim = c(stock.trim);
      return item;
    }),
    parts: project.parts.map((part) => ({ ...part, length: c(part.length), width: c(part.width) })),
    tools: project.tools.map((tool) => convertTool(tool, from, units)),
    settings,
  };
  if (project.designs) next.designs = project.designs.map((design) => convertDesign(design, c));
  if (project.plan) {
    const sheets = project.plan.sheets.map((sheet) => {
      const { cuts: _cuts, toolChoices, ...rest } = sheet;
      const converted: PlanSheet = { ...rest, placements: sheet.placements.map((placement) => ({ ...placement, x: c(placement.x), y: c(placement.y) })) };
      if (toolChoices) converted.toolChoices = toolChoices.map((choice) => ({ ...choice, at: c(choice.at), from: c(choice.from), to: c(choice.to) }));
      return converted;
    });
    next.plan = { ...project.plan, sheets };
  }
  return next;
}
