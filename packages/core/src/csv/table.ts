import Papa from "papaparse";
import type { CsvRowIssue } from "./types.ts";

export interface Table {
  headers: string[];
  rows: string[][];
  delimiter: string;
  hasHeader: boolean;
  /** The 1-based spreadsheet row of each entry in `rows`, counting blank lines and the header. */
  rowNumbers: number[];
  issues: CsvRowIssue[];
}

export interface ReadTableOptions {
  delimiter?: string;
  hasHeader?: boolean | ((firstRow: readonly string[], delimiter: string) => boolean);
}

const DELIMITERS = [",", ";", "\t"] as const;

const SEP_LINE = /^sep=(.)\r?(?:\n|$)/i;

const NO_QUOTE = "\u0000";

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim() !== "") ?? "";
  let best: string = ",";
  let bestCount = 0;
  for (const delimiter of DELIMITERS) {
    const count = firstLine.split(delimiter).length - 1;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

/**
 * An inch mark at the start of a cell opens a quoted field that never closes, and Papa then reads the rest of the file
 * as one cell. From the record with the open quote on, read quotes as plain text instead, and warn.
 */
function parseRecords(text: string, delimiter: string): { data: string[][]; issues: CsvRowIssue[] } {
  const result = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: false });
  const error = result.errors.find((e) => e.type === "Quotes");
  if (!error) return { data: result.data, issues: [] };
  const row = error.row ?? 0;
  const start = row === 0 ? 0 : text.lastIndexOf("\n", text.lastIndexOf('"', error.index ?? 0)) + 1;
  const before = row === 0 ? [] : Papa.parse<string[]>(text.slice(0, start), { delimiter, skipEmptyLines: false }).data.slice(0, row);
  const after = Papa.parse<string[]>(text.slice(start), { delimiter, skipEmptyLines: false, quoteChar: NO_QUOTE }).data;
  const message = `Row ${row + 1}: a quote (") is not closed, so quotes from this row on are read as plain text.`;
  return { data: [...before, ...after], issues: [{ severity: "warning", row: row + 1, message }] };
}

export function readTable(text: string, options: ReadTableOptions = {}): Table {
  let clean = text.replace(/^\uFEFF/, "");
  const sep = SEP_LINE.exec(clean);
  if (sep) clean = clean.slice(sep[0].length);
  const delimiter = options.delimiter ?? sep?.[1] ?? detectDelimiter(clean);
  const { data: parsed, issues } = parseRecords(clean, delimiter);
  const records = parsed
    .map((cells, index) => ({ cells: cells.map((value) => value.trim()), rowNumber: index + 1 }))
    .filter((record) => record.cells.some((value) => value !== ""));

  const first = records[0];
  const hasHeader =
    first === undefined || options.hasHeader === undefined
      ? true
      : typeof options.hasHeader === "function"
        ? options.hasHeader(first.cells, delimiter)
        : options.hasHeader;
  const data = hasHeader ? records.slice(1) : records;
  const width = hasHeader ? (first?.cells.length ?? 0) : Math.max(0, ...data.map((record) => record.cells.length));
  const headers = hasHeader ? (first?.cells ?? []) : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
  return {
    headers,
    rows: data.map((record) => Array.from({ length: Math.max(width, record.cells.length) }, (_, i) => record.cells[i] ?? "")),
    delimiter,
    hasHeader,
    rowNumbers: data.map((record) => record.rowNumber),
    issues,
  };
}
