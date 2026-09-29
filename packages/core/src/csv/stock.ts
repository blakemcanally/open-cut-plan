import type { StockKind } from "../format/schema.ts";
import { parsePlainNumber, type NumberOptions } from "../geometry/parse.ts";
import type { Units } from "../geometry/units.ts";
import { cell, guessMapping, headerDetector, longRowIssue, missingFields, numberOptions, optionalLength, requiredLength, type ColumnMapping } from "./mapping.ts";
import { readTable } from "./table.ts";
import type { CsvImport, CsvRowIssue } from "./types.ts";

export const STOCK_ALIASES = {
  material: ["material", "material name", "mat"],
  length: ["length", "l", "len", "sheet length"],
  width: ["width", "w", "sheet width"],
  thickness: ["thickness", "t", "thick"],
  quantity: ["quantity", "qty", "q", "count", "on hand", "copies", "anzahl", "menge", "stück", "stuck", "stk", "number of", "no of"],
  cost: ["cost", "price", "unit cost", "unit price", "cost each"],
  kind: ["kind", "type"],
  name: ["name", "label", "description"],
} as const satisfies Record<string, readonly string[]>;

export type StockField = keyof typeof STOCK_ALIASES;

export const STOCK_REQUIRED: readonly StockField[] = ["length", "width"];

export interface StockRow {
  material: string;
  length: number;
  width: number;
  quantity: number | null;
  kind: StockKind;
  thickness?: number;
  cost?: number;
  name?: string;
}

export interface StockImportOptions {
  units: Units;
  mapping?: ColumnMapping<StockField>;
  defaultMaterial?: string;
  hasHeader?: boolean;
}

const UNLIMITED = new Set(["", "unlimited", "∞", "inf", "infinite", "any", "-"]);

const KIND_WORDS: Readonly<Record<string, StockKind>> = {
  "": "sheet",
  sheet: "sheet",
  new: "sheet",
  panel: "sheet",
  board: "sheet",
  offcut: "offcut",
  "off-cut": "offcut",
  remnant: "offcut",
  scrap: "offcut",
  leftover: "offcut",
};

type Parsed<T> = { ok: true; value: T } | { ok: false };

function parseStockQuantity(text: string, options: NumberOptions): Parsed<number | null> {
  if (UNLIMITED.has(text.toLowerCase())) return { ok: true, value: null };
  const value = parsePlainNumber(text, options);
  return value !== null && Number.isInteger(value) && value >= 1 ? { ok: true, value } : { ok: false };
}

function parseCost(text: string, options: NumberOptions): Parsed<number> {
  const cleaned = text.replace(/\p{Sc}/gu, "").trim();
  const tokens = cleaned.split(/\s+/).filter((token) => token !== "");
  if (tokens.length > 1 && /^[A-Z]{3}$/.test(tokens[0]!)) tokens.shift();
  else if (tokens.length > 1 && /^[A-Z]{3}$/.test(tokens[tokens.length - 1]!)) tokens.pop();
  const value = parsePlainNumber(tokens.join(""), options);
  return value === null ? { ok: false } : { ok: true, value };
}

export function importStockCsv(text: string, options: StockImportOptions): CsvImport<StockRow, StockField> {
  const table = readTable(text, { hasHeader: options.hasHeader ?? headerDetector(options.units) });
  const mapping = options.mapping ?? guessMapping(table.headers, STOCK_ALIASES);
  const missing = missingFields(mapping, STOCK_REQUIRED);
  if (missing.length > 0) return { status: "needs-mapping", missing, mapping, table };

  const rows: StockRow[] = [];
  const issues: CsvRowIssue[] = [];
  table.rows.forEach((raw, index) => {
    const row = table.rowNumbers[index]!;
    const long = longRowIssue(table, raw, row);
    if (long !== undefined) issues.push(long);
    const get = (field: StockField) => cell(raw, mapping, field);
    const errors: CsvRowIssue[] = [];

    const requireLength = (field: "length" | "width"): number => {
      const result = requiredLength(raw, table, mapping, field, options.units, row);
      if ("value" in result) return result.value;
      errors.push(result.issue);
      return 0;
    };
    const length = requireLength("length");
    const width = requireLength("width");
    const quantity = parseStockQuantity(get("quantity"), numberOptions(table));
    if (!quantity.ok) {
      errors.push({
        severity: "error",
        row,
        column: "quantity",
        message: `Row ${row}: quantity "${get("quantity")}" is not a whole number of 1 or more, or "unlimited".`,
      });
    }
    if (errors.length > 0 || !quantity.ok) {
      issues.push(...errors);
      return;
    }

    const stock: StockRow = {
      material: get("material") || (options.defaultMaterial ?? "Material"),
      length,
      width,
      quantity: quantity.value,
      kind: "sheet",
    };
    const thickness = optionalLength(raw, table, mapping, "thickness", options.units, row);
    if (thickness.value !== undefined) stock.thickness = thickness.value;
    else if (thickness.issue !== undefined) issues.push(thickness.issue);
    if (get("cost") !== "") {
      const cost = parseCost(get("cost"), numberOptions(table));
      if (cost.ok) stock.cost = cost.value;
      else issues.push({ severity: "warning", row, column: "cost", message: `Row ${row}: cost "${get("cost")}" is not a number, so it is ignored.` });
    }
    const kind = KIND_WORDS[get("kind").toLowerCase()];
    if (kind === undefined) {
      issues.push({ severity: "warning", row, column: "kind", message: `Row ${row}: kind "${get("kind")}" is not recognized, so "sheet" is used.` });
    } else {
      stock.kind = kind;
    }
    if (get("name") !== "") stock.name = get("name");
    rows.push(stock);
  });

  return { status: "ok", rows, issues, mapping, table };
}
