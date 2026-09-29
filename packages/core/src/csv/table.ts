import Papa from "papaparse";

export interface Table {
  headers: string[];
  rows: string[][];
  delimiter: string;
  hasHeader: boolean;
  /** The 1-based spreadsheet row of each entry in `rows`, counting blank lines and the header. */
  rowNumbers: number[];
}

export interface ReadTableOptions {
  delimiter?: string;
  hasHeader?: boolean | ((firstRow: readonly string[], delimiter: string) => boolean);
}

const DELIMITERS = [",", ";", "\t"] as const;

const SEP_LINE = /^sep=(.)\r?(?:\n|$)/i;

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

export function readTable(text: string, options: ReadTableOptions = {}): Table {
  let clean = text.replace(/^\uFEFF/, "");
  const sep = SEP_LINE.exec(clean);
  if (sep) clean = clean.slice(sep[0].length);
  const delimiter = options.delimiter ?? sep?.[1] ?? detectDelimiter(clean);
  const result = Papa.parse<string[]>(clean, { delimiter, skipEmptyLines: false });
  const records = result.data
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
  };
}
