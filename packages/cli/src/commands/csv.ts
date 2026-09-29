import {
  addPartRows,
  addStockRows,
  exportPartsCsv,
  exportStockCsv,
  importPartsCsv,
  importStockCsv,
  normalizeHeader,
  PART_ALIASES,
  STOCK_ALIASES,
  type ApplyResult,
  type ColumnMapping,
  type CsvImport,
  type CsvRowIssue,
  type Project,
  type Table,
  type Units,
} from "@opencutplan/core";
import { FILE_ARG, finishMutation, loadProject, OUTPUT_OPTIONS, readSource, warningLines, writeOutput } from "../project.ts";
import { usageError, type Invocation, type OptionSpec, type Outcome } from "../spec.ts";
import { list, optionalBoolean, str } from "../values.ts";

export type CsvKind = "parts" | "stock";

interface Importer<F extends string> {
  aliases: Readonly<Record<F, readonly string[]>>;
  read(text: string, options: { units: Units; mapping?: ColumnMapping<F>; defaultMaterial?: string; hasHeader?: boolean }): CsvImport<unknown, F>;
  apply(project: Project, rows: readonly unknown[]): ApplyResult;
  ids(project: Project): string[];
}

const IMPORTERS: { parts: Importer<string>; stock: Importer<string> } = {
  parts: {
    aliases: PART_ALIASES,
    read: (text, options) => importPartsCsv(text, options),
    apply: (project, rows) => addPartRows(project, rows as Parameters<typeof addPartRows>[1]),
    ids: (project) => project.parts.map((part) => part.id),
  },
  stock: {
    aliases: STOCK_ALIASES,
    read: (text, options) => importStockCsv(text, options),
    apply: (project, rows) => addStockRows(project, rows as Parameters<typeof addStockRows>[1]),
    ids: (project) => project.stock.map((stock) => stock.id),
  },
};

export function importOptions(kind: CsvKind): OptionSpec[] {
  const fields = Object.keys(IMPORTERS[kind].aliases).join(", ");
  return [
    {
      name: "map",
      type: "string",
      value: "<field=column>",
      multiple: true,
      description: `Use a column for a field. The column is a header name or a 1-based column number. Fields: ${fields}. Columns that you do not map are guessed from the headers.`,
    },
    { name: "header", type: "string", value: "<true|false>", description: "Whether the first row is a header. Default: a header when none of its cells is a length." },
    { name: "material", type: "string", value: "<name>", description: 'The material name for rows with no material. Default: "Material".' },
    ...OUTPUT_OPTIONS,
  ];
}

function resolveColumn(table: Table, column: string, field: string): number {
  if (/^\d+$/.test(column)) {
    const index = Number(column) - 1;
    if (index >= 0 && index < table.headers.length) return index;
  }
  const exact = table.headers.indexOf(column);
  if (exact >= 0) return exact;
  const loose = table.headers.findIndex((header) => header.toLowerCase() === column.toLowerCase());
  if (loose >= 0) return loose;
  const normalized = table.headers.findIndex((header) => normalizeHeader(header) === normalizeHeader(column) && normalizeHeader(column) !== "");
  if (normalized >= 0) return normalized;
  throw usageError(`--map ${field}=${column}: the CSV has no such column. Columns: ${table.headers.map((h, i) => `${i + 1} "${h}"`).join(", ")}.`, "invalid-value", {
    option: "map",
    value: `${field}=${column}`,
    headers: table.headers,
  });
}

function applyMaps(table: Table, guessed: ColumnMapping<string>, maps: readonly string[], fields: readonly string[]): ColumnMapping<string> {
  const mapping: ColumnMapping<string> = { ...guessed };
  for (const map of maps) {
    const at = map.indexOf("=");
    const field = at < 0 ? map : map.slice(0, at);
    if (at < 0 || !fields.includes(field)) {
      throw usageError(`--map "${map}" must be <field>=<column>, with a field of ${fields.join(", ")}.`, "invalid-value", { option: "map", value: map });
    }
    const index = resolveColumn(table, map.slice(at + 1), field);
    for (const [other, used] of Object.entries(mapping)) if (used === index) delete mapping[other];
    mapping[field] = index;
  }
  return mapping;
}

function namedMapping(table: Table, mapping: ColumnMapping<string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, index] of Object.entries(mapping)) if (index !== undefined) out[field] = table.headers[index] ?? `Column ${index + 1}`;
  return out;
}

export async function importCsv(invocation: Invocation, kind: CsvKind): Promise<Outcome> {
  const { args, options, io } = invocation;
  const [file, csvPath] = [args[0]!, args[1]!];
  if (file === "-" && csvPath === "-") throw usageError("Only one of <file> and <csv> can be - (standard input).", "usage");
  const loaded = await loadProject(io, file);
  const { project } = loaded;
  const text = await readSource(io, csvPath, "CSV file");
  const importer = IMPORTERS[kind];
  const header = optionalBoolean(options, "header");
  const material = str(options, "material");
  const base = { units: project.project.units, ...(header !== undefined ? { hasHeader: header } : {}), ...(material !== undefined ? { defaultMaterial: material } : {}) };
  const first = importer.read(text, base);
  const maps = list(options, "map");
  const result = maps.length === 0 ? first : importer.read(text, { ...base, mapping: applyMaps(first.table, first.mapping, maps, Object.keys(importer.aliases)) });

  if (result.status === "needs-mapping") {
    const message = `The CSV has no column for ${result.missing.join(" and ")}. Map the columns with --map, for example --map ${result.missing[0]}=2.`;
    return {
      data: { missing: result.missing, headers: result.table.headers, mapping: namedMapping(result.table, result.mapping), written: null },
      text: `Columns: ${result.table.headers.map((h, i) => `${i + 1} "${h}"`).join(", ")}.`,
      error: { code: "needs-mapping", message },
      warnings: warningLines(loaded),
    };
  }

  const before = new Set(importer.ids(project));
  const applied = importer.apply(project, result.rows);
  const ids = importer.ids(applied.project).filter((id) => !before.has(id));
  const csvIssues: CsvRowIssue[] = result.issues;
  const rowErrors = csvIssues.filter((issue) => issue.severity === "error").length;
  const created = applied.createdMaterials;
  const noun = kind === "parts" ? "parts" : "stock items";
  const details = [
    ...(created.length > 0 ? [`New materials: ${created.map((m) => `${m.name} (${m.id})`).join(", ")}.`] : []),
    ...csvIssues.map((issue) => `  ${issue.severity}: ${issue.message}`),
  ];
  const outcome = await finishMutation(invocation, loaded, applied.project, {
    summary: `Imported ${ids.length} ${noun} from ${csvPath === "-" ? "standard input" : csvPath}${rowErrors > 0 ? `; skipped ${rowErrors} rows with errors` : ""}.`,
    details,
    data: { imported: ids.length, ids, createdMaterials: created, csvIssues, mapping: namedMapping(result.table, result.mapping) },
    ...(rowErrors > 0 ? { strictFailure: `${rowErrors} CSV rows have errors.` } : {}),
  });
  return outcome;
}

export const EXPORT_OUT: OptionSpec = { name: "out", type: "string", value: "<path|->", description: "Write the CSV to this file, or to stdout with -. Default: stdout." };

export async function exportCsv(invocation: Invocation, kind: CsvKind): Promise<Outcome> {
  const { args, options, io } = invocation;
  const loaded = await loadProject(io, args[0]!);
  const { project } = loaded;
  const csv = kind === "parts" ? exportPartsCsv(project) : exportStockCsv(project);
  const count = kind === "parts" ? project.parts.length : project.stock.length;
  const out = str(options, "out") ?? "-";
  const warnings = warningLines(loaded);
  if (out === "-") return { data: { csv, rows: count }, text: "", payload: csv, warnings };
  await writeOutput(io, out, csv);
  return { data: { path: out, rows: count }, text: `Wrote ${out} (${count} ${kind === "parts" ? "parts" : "stock items"}).`, warnings };
}

export const CSV_ARGS = [FILE_ARG, { name: "csv", description: "The CSV file, or - to read it from standard input." }];
