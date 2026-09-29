import type { Grain } from "../format/schema.ts";
import { parsePlainNumber, type NumberOptions } from "../geometry/parse.ts";
import type { Units } from "../geometry/units.ts";
import { cell, guessMapping, hasUnmappedColumns, headerDetector, longRowIssue, missingFields, numberOptions, optionalLength, requiredLength, type ColumnMapping } from "./mapping.ts";
import { readTable } from "./table.ts";
import type { CsvImport, CsvRowIssue } from "./types.ts";

export const PART_ALIASES = {
  name: ["name", "part", "part name", "label", "designation", "description", "item"],
  length: ["cutting length", "length", "l", "len", "final length"],
  width: ["cutting width", "width", "w", "final width"],
  quantity: ["quantity", "qty", "q", "count", "pcs", "pieces", "copies", "anzahl", "menge", "stück", "stuck", "stk", "number of", "no of"],
  material: ["material", "material name", "mat"],
  grain: ["grain", "grain direction", "grain lock", "grain locked"],
  group: ["group", "cabinet", "assembly", "unit"],
  notes: ["notes", "note", "comment", "comments", "info"],
  thickness: ["thickness", "t", "thick", "cutting thickness"],
} as const satisfies Record<string, readonly string[]>;

export type PartField = keyof typeof PART_ALIASES;

export const PART_REQUIRED: readonly PartField[] = ["length", "width"];

export interface PartRow {
  name: string;
  length: number;
  width: number;
  quantity: number;
  material: string;
  grain: Grain;
  group?: string;
  notes?: string;
  thickness?: number;
}

export interface PartImportOptions {
  units: Units;
  mapping?: ColumnMapping<PartField>;
  defaultMaterial?: string;
  hasHeader?: boolean;
}

const GRAIN_WORDS: Readonly<Record<string, Grain>> = {
  length: "length",
  l: "length",
  long: "length",
  lengthwise: "length",
  yes: "length",
  y: "length",
  true: "length",
  "1": "length",
  x: "length",
  width: "width",
  w: "width",
  widthwise: "width",
  cross: "width",
  none: "none",
  no: "none",
  n: "none",
  false: "none",
  "0": "none",
  "-": "none",
  any: "none",
  free: "none",
};

function parseGrain(text: string): Grain | null {
  if (text === "") return "length";
  return GRAIN_WORDS[text.toLowerCase()] ?? null;
}

function parseQuantity(text: string, options: NumberOptions): number | null {
  if (text === "") return 1;
  const value = parsePlainNumber(text, options);
  return value !== null && Number.isInteger(value) && value >= 1 ? value : null;
}

export function importPartsCsv(text: string, options: PartImportOptions): CsvImport<PartRow, PartField> {
  const table = readTable(text, { hasHeader: options.hasHeader ?? headerDetector(options.units) });
  const mapping = options.mapping ?? guessMapping(table.headers, PART_ALIASES);
  const missing = missingFields(mapping, PART_REQUIRED);
  if (missing.length > 0) return { status: "needs-mapping", missing, mapping, table };

  const rows: PartRow[] = [];
  const issues: CsvRowIssue[] = [];
  if (mapping.quantity === undefined && hasUnmappedColumns(table, mapping)) {
    issues.push({ severity: "warning", row: 1, column: "quantity", message: "No quantity column was found, so each part has quantity 1." });
  }
  table.rows.forEach((raw, index) => {
    const row = table.rowNumbers[index]!;
    const long = longRowIssue(table, raw, row);
    if (long !== undefined) issues.push(long);
    const get = (field: PartField) => cell(raw, mapping, field);
    const errors: CsvRowIssue[] = [];

    const requireLength = (field: "length" | "width"): number => {
      const result = requiredLength(raw, table, mapping, field, options.units, row);
      if ("value" in result) return result.value;
      errors.push(result.issue);
      return 0;
    };
    const length = requireLength("length");
    const width = requireLength("width");
    const quantity = parseQuantity(get("quantity"), numberOptions(table));
    if (quantity === null) {
      errors.push({ severity: "error", row, column: "quantity", message: `Row ${row}: quantity "${get("quantity")}" is not a whole number of 1 or more.` });
    }
    if (errors.length > 0 || quantity === null) {
      issues.push(...errors);
      return;
    }

    let grain = parseGrain(get("grain"));
    if (grain === null) {
      issues.push({ severity: "warning", row, column: "grain", message: `Row ${row}: grain "${get("grain")}" is not recognized, so "length" is used.` });
      grain = "length";
    }

    const part: PartRow = {
      name: get("name") || `Part ${index + 1}`,
      length,
      width,
      quantity,
      material: get("material") || (options.defaultMaterial ?? "Material"),
      grain,
    };
    const thickness = optionalLength(raw, table, mapping, "thickness", options.units, row);
    if (thickness.value !== undefined) part.thickness = thickness.value;
    else if (thickness.issue !== undefined) issues.push(thickness.issue);
    if (get("group") !== "") part.group = get("group");
    if (get("notes") !== "") part.notes = get("notes");
    rows.push(part);
  });

  return { status: "ok", rows, issues, mapping, table };
}
