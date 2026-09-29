import type { Project, Tool } from "../format/schema.ts";
import { convertLength, type Units } from "../geometry/units.ts";

const TOOL_LENGTHS = ["maxRip", "maxCrosscut", "maxCut"] as const;

/**
 * Rounds to 1e-9 so 48 in becomes 1219.2 mm, not 1219.1999999999998. A layout check adds up to four converted values
 * (x + length against stock length − trim), so the rounding step must stay well below EPSILON / 4.
 */
function converter(from: Units, to: Units): (value: number) => number {
  return (value) => Math.round(convertLength(value, from, to) * 1e9) / 1e9;
}

export function convertTool(tool: Tool, from: Units, to: Units): Tool {
  const c = converter(from, to);
  const next: Record<string, unknown> = { ...tool, kerf: c(tool.kerf) };
  for (const key of TOOL_LENGTHS) {
    const value = next[key];
    if (typeof value === "number") next[key] = c(value);
  }
  if (tool.type === "table-saw" && tool.maxPiece) {
    next.maxPiece = { ...tool.maxPiece, length: c(tool.maxPiece.length), width: c(tool.maxPiece.width) };
  }
  return next as Tool;
}

/** Converts every length to `units`. Stored cut lists are dropped; the app computes them again. */
export function convertProjectUnits(project: Project, units: Units): Project {
  const from = project.project.units;
  if (from === units) return project;
  const c = converter(from, units);
  const settings = { ...project.settings, trim: c(project.settings.trim) };
  const { minOffcut } = project.settings;
  if (minOffcut) settings.minOffcut = { ...minOffcut, length: c(minOffcut.length), width: c(minOffcut.width) };
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
  if (project.plan) {
    const sheets = project.plan.sheets.map((sheet) => {
      const { cuts: _cuts, ...rest } = sheet;
      return { ...rest, placements: sheet.placements.map((placement) => ({ ...placement, x: c(placement.x), y: c(placement.y) })) };
    });
    next.plan = { ...project.plan, sheets };
  }
  return next;
}
