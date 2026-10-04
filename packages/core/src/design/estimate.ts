import type { Design, Project } from "../format/schema.ts";
import { optimize } from "../optimize/search.ts";
import { designParts } from "./generate.ts";

export const ESTIMATE_ITERATIONS = 8;

export interface SheetSizeCount {
  stock: string;
  length: number;
  width: number;
  count: number;
}

export interface SheetEstimate {
  material: string;
  /** Sheets that hold the copies; 0 when the material has no sheet stock. */
  sheets: number;
  /** The sheets by stock, in the order of the project stock. */
  sizes: SheetSizeCount[];
  /** Copies that go on no sheet: too large for each sheet, or cut by no tool. */
  unplaced: number;
  /** True when the project has no enabled sheet stock of the material. */
  noStock: boolean;
}

/**
 * The sheets that the parts of the design need, for each of its materials (the case material first): a short
 * optimizer run on the parts of this design alone, with no limit on the sheet quantities and no offcuts. Null when the
 * design makes no parts (an error, an unknown system, or a newer file).
 */
export function designSheetEstimate(project: Project, design: Design): SheetEstimate[] | null {
  const parts = designParts(project, design);
  if (!parts) return null;
  return [...new Set(parts.map((part) => part.material))].map((material) => {
    const own = parts.filter((part) => part.material === material);
    const copies = own.reduce((sum, part) => sum + part.quantity, 0);
    const stock = project.stock.filter((s) => s.material === material && s.kind === "sheet" && s.enabled !== false).map((s) => ({ ...s, quantity: null }));
    if (stock.length === 0) return { material, sheets: 0, sizes: [], unplaced: copies, noStock: true };
    const result = optimize(
      { ...project, parts: own, stock, plan: { ...project.plan, sheets: [] } },
      { iterations: ESTIMATE_ITERATIONS, seed: 1, goal: "cost", extraCostPercent: 0, keepGroupsTogether: false },
    );
    const sizes = stock
      .map((s) => ({ stock: s.id, length: s.length, width: s.width, count: result.sheets.filter((sheet) => sheet.stock === s.id).length }))
      .filter((size) => size.count > 0);
    return { material, sheets: result.sheets.length, sizes, unplaced: result.unplaced.length, noStock: false };
  });
}
