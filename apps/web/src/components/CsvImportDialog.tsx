import {
  addPartRows,
  addStockRows,
  importPartsCsv,
  importStockCsv,
  PART_ALIASES,
  PART_REQUIRED,
  STOCK_ALIASES,
  STOCK_REQUIRED,
  type ColumnMapping,
  type CsvRowIssue,
  type Project,
  type Table,
} from "@opencutplan/core";
import { useMemo, useState } from "react";
import { Dialog } from "./Dialog.tsx";

export type CsvKind = "parts" | "stock";

const FIELD_LABELS: Readonly<Record<string, string>> = {
  name: "Name",
  length: "Length",
  width: "Width",
  quantity: "Quantity",
  material: "Material",
  grain: "Grain",
  group: "Group",
  notes: "Notes",
  thickness: "Thickness",
  cost: "Cost",
  kind: "Kind",
};

interface Preview {
  table: Table;
  mapping: ColumnMapping<string>;
  missing: string[];
  rows: number;
  issues: CsvRowIssue[];
  created: string[];
  apply(project: Project): Project;
}

function preview(kind: CsvKind, text: string, project: Project, hasHeader: boolean | undefined, mapping: ColumnMapping<string> | undefined): Preview {
  const options = {
    units: project.project.units,
    ...(project.materials[0] ? { defaultMaterial: project.materials[0].name } : {}),
    ...(hasHeader === undefined ? {} : { hasHeader }),
  };
  if (kind === "parts") {
    const result = importPartsCsv(text, mapping ? { ...options, mapping } : options);
    if (result.status === "needs-mapping") return { ...result, rows: 0, issues: [], created: [], apply: (p) => p };
    const created = addPartRows(project, result.rows).createdMaterials.map((material) => material.name);
    return { ...result, missing: [], rows: result.rows.length, created, apply: (p) => addPartRows(p, result.rows).project };
  }
  const result = importStockCsv(text, mapping ? { ...options, mapping } : options);
  if (result.status === "needs-mapping") return { ...result, rows: 0, issues: [], created: [], apply: (p) => p };
  const created = addStockRows(project, result.rows).createdMaterials.map((material) => material.name);
  return { ...result, missing: [], rows: result.rows.length, created, apply: (p) => addStockRows(p, result.rows).project };
}

interface CsvImportDialogProps {
  kind: CsvKind;
  text: string;
  project: Project;
  onImport(project: Project): void;
  onClose(): void;
}

export function CsvImportDialog({ kind, text: initialText, project, onImport, onClose }: CsvImportDialogProps) {
  const [text, setText] = useState(initialText);
  const [hasHeader, setHasHeader] = useState<boolean | undefined>(undefined);
  const [mapping, setMapping] = useState<ColumnMapping<string> | undefined>(undefined);
  const fields = Object.keys(kind === "parts" ? PART_ALIASES : STOCK_ALIASES);
  const required: readonly string[] = kind === "parts" ? PART_REQUIRED : STOCK_REQUIRED;
  const result = useMemo(() => preview(kind, text, project, hasHeader, mapping), [kind, text, project, hasHeader, mapping]);
  const errors = result.issues.filter((issue) => issue.severity === "error");
  const warnings = result.issues.filter((issue) => issue.severity === "warning");

  const setField = (field: string, value: string) => {
    const next: ColumnMapping<string> = { ...result.mapping };
    delete next[field];
    if (value !== "") {
      for (const [other, column] of Object.entries(next)) if (column === Number(value)) delete next[other];
      next[field] = Number(value);
    }
    setMapping(next);
  };

  return (
    <Dialog title={kind === "parts" ? "Import parts" : "Import stock"} onClose={onClose}>
      <label className="stack">
        Rows (paste from a spreadsheet, or edit)
        <textarea
          rows={6}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setMapping(undefined);
          }}
        />
      </label>
      <label className="inline">
        <input
          type="checkbox"
          checked={result.table.hasHeader}
          onChange={(event) => {
            setHasHeader(event.target.checked);
            setMapping(undefined);
          }}
        />
        The first row is a header
      </label>
      <fieldset>
        <legend>Columns</legend>
        <div className="mapping">
          {fields.map((field) => (
            <label key={field}>
              {FIELD_LABELS[field] ?? field}
              {required.includes(field) ? " (required)" : ""}
              <select value={result.mapping[field] ?? ""} onChange={(event) => setField(field, event.target.value)}>
                <option value="">Not used</option>
                {result.table.headers.map((header, index) => (
                  <option key={index} value={index}>
                    {header || `Column ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </fieldset>
      {result.missing.length > 0 && (
        <p role="alert" className="error">
          Choose a column for: {result.missing.map((field) => FIELD_LABELS[field] ?? field).join(", ")}.
        </p>
      )}
      {result.missing.length === 0 && (
        <p>
          {result.rows} {result.rows === 1 ? "row is" : "rows are"} ready.
          {errors.length > 0 && ` ${errors.length} ${errors.length === 1 ? "row has an error and is" : "rows have errors and are"} left out.`}
        </p>
      )}
      {result.issues.length > 0 && (
        <ul className="issues">
          {[...errors, ...warnings].map((issue, index) => (
            <li key={index} className={issue.severity}>
              {issue.severity === "error" ? "✖ " : "⚠ "}
              {issue.message}
            </li>
          ))}
        </ul>
      )}
      {result.created.length > 0 && <p>{`These materials are new and will be added: ${result.created.join(", ")}.`}</p>}
      <footer className="dialog-foot">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="primary" disabled={result.rows === 0} onClick={() => onImport(result.apply(project))}>
          Import {result.rows} {result.rows === 1 ? "row" : "rows"}
        </button>
      </footer>
    </Dialog>
  );
}
