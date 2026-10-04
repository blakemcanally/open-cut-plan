import type { ProjectAnalysis } from "@opencutplan/core";
import { formatMoney, formatPercent } from "../reports/money.ts";

export interface ToolCuts {
  /** Null for the cuts with no tool. */
  tool: string | null;
  name: string;
  cuts: number;
}

export interface SheetSummary {
  /** In profile order, then the cuts with no tool. */
  tools: ToolCuts[];
  utilization: number;
  /** Null when the cost feature is off, or for an owned offcut or a stock with no price. */
  cost: number | null;
}

export function sheetSummary(analysis: ProjectAnalysis, sheetId: string): SheetSummary {
  const ctx = analysis.context;
  const steps = analysis.steps.filter((step) => step.sheet === sheetId);
  const tools: ToolCuts[] = ctx.tools.map((tool) => ({ tool: tool.id, name: tool.name, cuts: steps.filter((step) => step.tool?.id === tool.id).length }));
  tools.push({ tool: null, name: "No tool", cuts: steps.filter((step) => step.tool === null).length });
  const sheet = analysis.sheets.find((s) => s.sheet.id === sheetId);
  const stock = sheet?.stock;
  return {
    tools: tools.filter((entry) => entry.cuts > 0),
    utilization: analysis.shopping.sheets.find((s) => s.sheet === sheetId)?.utilization ?? 0,
    cost: ctx.features.cost && stock?.kind === "sheet" ? (stock.cost ?? null) : null,
  };
}

export interface SummaryItem {
  text: string;
  /** Set on the cut count of a tool; null for the cuts with no tool. */
  tool?: string | null;
}

/** The parts of the summary line, in the order to show them with " · " between them. */
export function summaryItems(summary: SheetSummary, currency: string): SummaryItem[] {
  return [
    ...summary.tools.map((entry) => ({ text: `${entry.name} ${entry.cuts} ${entry.cuts === 1 ? "cut" : "cuts"}`, tool: entry.tool })),
    { text: `${formatPercent(summary.utilization)} used` },
    ...(summary.cost === null ? [] : [{ text: formatMoney(summary.cost, currency) }]),
  ];
}
