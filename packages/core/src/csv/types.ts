import type { ColumnMapping } from "./mapping.ts";
import type { Table } from "./table.ts";

export interface CsvRowIssue {
  severity: "error" | "warning";
  row: number;
  column?: string;
  message: string;
}

export type CsvImport<R, F extends string> =
  | { status: "ok"; rows: R[]; issues: CsvRowIssue[]; mapping: ColumnMapping<F>; table: Table }
  | { status: "needs-mapping"; missing: F[]; mapping: ColumnMapping<F>; table: Table };
