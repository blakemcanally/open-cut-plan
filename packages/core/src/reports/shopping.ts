import type { StockKind } from "../format/schema.ts";
import { area } from "../geometry/rect.ts";
import { materialName, stockLabel, type PlanContext } from "../plan/context.ts";
import type { SheetAnalysis } from "../plan/sheets.ts";

export interface SheetUsage {
  sheet: string;
  sheetNumber: number;
  stock: string;
  stockArea: number;
  partArea: number;
  /** partArea / stockArea; waste is 1 - utilization. */
  utilization: number;
}

export interface ShoppingLine {
  stock: string;
  label: string;
  kind: StockKind;
  length: number;
  width: number;
  /** Sheets of this stock in the plan. */
  used: number;
  /** Pieces to buy: `used` for sheets, 0 for owned offcuts. */
  buy: number;
  /** Null when the cost feature is off or the stock has no price. */
  unitCost: number | null;
  lineCost: number | null;
}

export interface MaterialShopping {
  material: string;
  name: string;
  lines: ShoppingLine[];
  cost: number | null;
  stockArea: number;
  partArea: number;
  utilization: number;
}

export interface ShoppingList {
  currency: string;
  materials: MaterialShopping[];
  sheets: SheetUsage[];
  /** Null when the cost feature is off or any stock to buy has no price. */
  total: number | null;
  /** Stock ids that must be bought but have no price. */
  missingPrices: string[];
}

export function shoppingList(ctx: PlanContext, sheets: readonly SheetAnalysis[]): ShoppingList {
  const costOn = ctx.features.cost;
  const usage: SheetUsage[] = sheets.map(({ sheet, index, stock, items }) => {
    const stockArea = area(stock);
    const partArea = items.reduce((sum, item) => sum + area(item.rect), 0);
    return { sheet: sheet.id, sheetNumber: index + 1, stock: stock.id, stockArea, partArea, utilization: ratio(partArea, stockArea) };
  });

  const missingPrices: string[] = [];
  const materials: MaterialShopping[] = [];
  for (const material of ctx.project.materials) {
    const lines: ShoppingLine[] = [];
    let stockArea = 0;
    let partArea = 0;
    for (const stock of ctx.project.stock) {
      if (stock.material !== material.id) continue;
      const sheetsOfStock = usage.filter((sheet) => sheet.stock === stock.id);
      if (sheetsOfStock.length === 0) continue;
      stockArea += sheetsOfStock.reduce((sum, sheet) => sum + sheet.stockArea, 0);
      partArea += sheetsOfStock.reduce((sum, sheet) => sum + sheet.partArea, 0);
      const buy = stock.kind === "sheet" ? sheetsOfStock.length : 0;
      const unitCost = costOn ? (stock.cost ?? null) : null;
      const lineCost = !costOn ? null : unitCost !== null ? buy * unitCost : buy === 0 ? 0 : null;
      if (costOn && lineCost === null) missingPrices.push(stock.id);
      lines.push({ stock: stock.id, label: stockLabel(ctx, stock), kind: stock.kind, length: stock.length, width: stock.width, used: sheetsOfStock.length, buy, unitCost, lineCost });
    }
    if (lines.length === 0) continue;
    materials.push({
      material: material.id,
      name: materialName(ctx, material.id),
      lines,
      cost: sumOrNull(lines.map((line) => line.lineCost)),
      stockArea,
      partArea,
      utilization: ratio(partArea, stockArea),
    });
  }

  const total = costOn ? sumOrNull(materials.map((material) => material.cost)) : null;
  return { currency: ctx.project.settings.currency, materials, sheets: usage, total, missingPrices };
}

function ratio(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

function sumOrNull(values: readonly (number | null)[]): number | null {
  let sum = 0;
  for (const value of values) {
    if (value === null) return null;
    sum += value;
  }
  return sum;
}
