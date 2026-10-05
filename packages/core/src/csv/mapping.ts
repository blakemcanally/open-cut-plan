import { parseLength, parsePlainNumber, type NumberOptions } from "../geometry/parse.ts";
import { snapLength } from "../geometry/precision.ts";
import { convertLength, type Units } from "../geometry/units.ts";
import type { Table } from "./table.ts";
import type { CsvRowIssue } from "./types.ts";

export type ColumnMapping<F extends string> = Partial<Record<F, number>>;

export function numberOptions(table: Table): NumberOptions {
  return { decimalComma: table.delimiter === ";" };
}

export function normalizeHeader(header: string): string {
  return header
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .toLowerCase()
    .replaceAll("#", "number")
    .replace(/[^a-z0-9]/g, "");
}

export type HeaderLengthUnit = "mm" | "cm" | "m" | "in" | "ft";

const HEADER_UNITS: Readonly<Record<HeaderLengthUnit, { base: Units; factor: number }>> = {
  mm: { base: "mm", factor: 1 },
  cm: { base: "mm", factor: 10 },
  m: { base: "mm", factor: 1000 },
  in: { base: "in", factor: 1 },
  ft: { base: "in", factor: 12 },
};

const HEADER_UNIT_WORDS: Readonly<Record<string, HeaderLengthUnit>> = {
  mm: "mm",
  cm: "cm",
  m: "m",
  in: "in",
  inch: "in",
  inches: "in",
  '"': "in",
  ft: "ft",
  feet: "ft",
  "'": "ft",
};

export function headerLengthUnit(header: string | undefined): HeaderLengthUnit | undefined {
  const match = /[([]\s*(mm|cm|m|inches|inch|in|"|feet|ft|')\s*[)\]]/i.exec(header ?? "");
  return match ? HEADER_UNIT_WORDS[match[1]!.toLowerCase()] : undefined;
}

export function headerDetector(units: Units): (firstRow: readonly string[], delimiter: string) => boolean {
  return (firstRow, delimiter) =>
    firstRow.every((text) => text === "" || parseLength(text, units, { decimalComma: delimiter === ";" }) === null);
}

export function longRowIssue(table: Table, row: readonly string[], rowNumber: number): CsvRowIssue | undefined {
  if (!row.slice(table.headers.length).some((text) => text !== "")) return undefined;
  return { severity: "warning", row: rowNumber, message: `Row ${rowNumber}: this row has more cells than the header. Check for an unquoted comma.` };
}

export function guessMapping<F extends string>(
  headers: readonly string[],
  aliases: Readonly<Record<F, readonly string[]>>,
): ColumnMapping<F> {
  const mapping: ColumnMapping<F> = {};
  const used = new Set<number>();
  const normalized = headers.map(normalizeHeader);
  for (const field of Object.keys(aliases) as F[]) {
    for (const alias of aliases[field]) {
      const wanted = normalizeHeader(alias);
      const index = normalized.findIndex((header, i) => !used.has(i) && header === wanted);
      if (index >= 0) {
        mapping[field] = index;
        used.add(index);
        break;
      }
    }
  }
  return mapping;
}

export function missingFields<F extends string>(mapping: ColumnMapping<F>, required: readonly F[]): F[] {
  return required.filter((field) => mapping[field] === undefined);
}

export function hasUnmappedColumns<F extends string>(table: Table, mapping: ColumnMapping<F>): boolean {
  const used = new Set(Object.values<number | undefined>(mapping));
  return table.headers.some((_, index) => !used.has(index));
}

export function cell<F extends string>(row: readonly string[], mapping: ColumnMapping<F>, field: F): string {
  const index = mapping[field];
  return index === undefined ? "" : (row[index] ?? "");
}

export function lengthCell<F extends string>(
  row: readonly string[],
  table: Table,
  mapping: ColumnMapping<F>,
  field: F,
  units: Units,
): { text: string; value: number | null } {
  const text = cell(row, mapping, field);
  const index = mapping[field];
  const declared = headerLengthUnit(index === undefined ? undefined : table.headers[index]);
  if (declared === undefined) return { text, value: parseLength(text, units, numberOptions(table)) };
  const { base, factor } = HEADER_UNITS[declared];
  const plain = parsePlainNumber(text, numberOptions(table));
  const value = plain === null ? parseLength(text, base, numberOptions(table)) : plain * factor;
  return { text, value: value === null ? null : snapLength(convertLength(value, base, units), units) };
}

export function requiredLength<F extends string>(
  row: readonly string[],
  table: Table,
  mapping: ColumnMapping<F>,
  field: F,
  units: Units,
  rowNumber: number,
): { value: number } | { issue: CsvRowIssue } {
  const { text, value } = lengthCell(row, table, mapping, field, units);
  if (value !== null && value > 0) return { value };
  return { issue: { severity: "error", row: rowNumber, column: field, message: `Row ${rowNumber}: ${field} "${text}" is not a valid length.` } };
}

export function optionalLength<F extends string>(
  row: readonly string[],
  table: Table,
  mapping: ColumnMapping<F>,
  field: F,
  units: Units,
  rowNumber: number,
): { value?: number; issue?: CsvRowIssue } {
  const text = cell(row, mapping, field);
  if (text === "") return {};
  const { value } = lengthCell(row, table, mapping, field, units);
  if (value !== null && value > 0) return { value };
  return {
    issue: {
      severity: "warning",
      row: rowNumber,
      column: field,
      message: `Row ${rowNumber}: ${field} "${text}" is not a valid length, so it is ignored.`,
    },
  };
}
