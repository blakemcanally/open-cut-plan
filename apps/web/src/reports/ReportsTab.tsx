import {
  designElevationSvg,
  exportPartsCsv,
  exportStockCsv,
  fileBase,
  formatSize,
  groupColors,
  hardwareList,
  LABEL_LAYOUTS,
  labelLayout,
  labelPages,
  labelsPerPage,
  materialName,
  saveOffcutsToStock,
  sheetSvg,
  unsavedOffcuts,
  type LabelLayoutId,
  type ProjectAnalysis,
} from "@opencutplan/core";
import { useMemo, useState } from "react";
import type { PrintJob } from "../print/PrintView.tsx";
import type { ProjectStore } from "../state/useProject.ts";
import { assemblyGroups } from "../shop/progress.ts";
import { downloadText } from "../storage/files.ts";
import { HardwareTable } from "./HardwareTable.tsx";
import { ShoppingTables } from "./ShoppingTables.tsx";

interface ReportsTabProps {
  store: ProjectStore;
  analysis: ProjectAnalysis;
  onPrint(job: PrintJob): void;
}

export function ReportsTab({ store, analysis, onPrint }: ReportsTabProps) {
  const { project, edit } = store;
  const ctx = analysis.context;
  const planned = analysis.sheets.length > 0;
  const base = fileBase(project.project.name);
  const colors = useMemo(() => groupColors(project), [project]);
  const unsaved = useMemo(() => unsavedOffcuts(project, analysis.offcuts), [project, analysis.offcuts]);
  const [offcutStatus, setOffcutStatus] = useState<string | null>(null);
  const [layoutId, setLayoutId] = useState<LabelLayoutId>(ctx.units === "in" ? "avery-5160" : "avery-l7160");
  const [start, setStart] = useState(1);
  const layout = labelLayout(layoutId);
  const perPage = labelsPerPage(layout);
  const firstLabel = Math.min(start, perPage);
  const pageCount = labelPages(analysis.labels, layout, firstLabel).length;
  const hardware = useMemo(() => hardwareList(project), [project]);
  const assembly = useMemo(() => assemblyGroups(project), [project]);
  const drawings = useMemo(
    () => (project.designs ?? []).flatMap((design) => {
      const svg = designElevationSvg(project, design.id);
      return svg ? [{ design, svg }] : [];
    }),
    [project],
  );

  const saveOffcuts = () => {
    edit((p) => saveOffcutsToStock(p, unsavedOffcuts(p, analysis.offcuts)));
    setOffcutStatus(`${unsaved.length === 1 ? "1 offcut was" : `${unsaved.length} offcuts were`} added to the Stock tab.`);
  };

  return (
    <div className="reports">
      <section aria-labelledby="reports-output">
        <h2 id="reports-output">Print and export</h2>
        {!planned && <p className="muted">There is no plan yet. Optimize on the Layout tab.</p>}
        <div className="buttons">
          <button type="button" onClick={() => onPrint({ kind: "sheets" })} disabled={!planned}>
            Print sheet diagrams
          </button>
          <button type="button" onClick={() => onPrint({ kind: "sequence" })} disabled={analysis.steps.length === 0}>
            Print cut sequence
          </button>
          <button type="button" onClick={() => onPrint({ kind: "shopping" })} disabled={!planned && hardware.length === 0}>
            Print shopping list
          </button>
          {assembly.length > 0 && (
            <button type="button" onClick={() => onPrint({ kind: "assembly" })}>
              Print assembly steps
            </button>
          )}
          <button type="button" onClick={() => downloadText(exportPartsCsv(project), `${base}-parts.csv`, "text/csv")}>
            Export parts CSV
          </button>
          <button type="button" onClick={() => downloadText(exportStockCsv(project), `${base}-stock.csv`, "text/csv")}>
            Export stock CSV
          </button>
        </div>
        {planned && (
          <div className="buttons" role="group" aria-label="SVG drawings">
            {analysis.sheets.map((sheet) => (
              <button
                key={sheet.sheet.id}
                type="button"
                onClick={() => downloadText(sheetSvg(ctx, sheet, analysis.steps, { colors }), `${base}-sheet-${sheet.index + 1}.svg`, "image/svg+xml")}
              >
                Sheet {sheet.index + 1} as SVG
              </button>
            ))}
          </div>
        )}
      </section>

      {(planned || hardware.length > 0) && (
        <section aria-labelledby="reports-shopping">
          <h2 id="reports-shopping">Shopping list</h2>
          {planned && <ShoppingTables analysis={analysis} level={3} />}
          {hardware.length > 0 && <HardwareTable project={project} lines={hardware} level={3} />}
        </section>
      )}

      {drawings.length > 0 && (
        <section aria-labelledby="reports-drawings">
          <h2 id="reports-drawings">Front views</h2>
          <div className="drawings">
            {drawings.map(({ design, svg }) => (
              <figure key={design.id}>
                <div className="design-preview" role="img" aria-label={`Front view of ${design.name}`} dangerouslySetInnerHTML={{ __html: svg }} />
                <figcaption>
                  {design.name}{" "}
                  <button type="button" onClick={() => downloadText(svg, `${base}-${design.id}.svg`, "image/svg+xml")}>
                    {design.name} as SVG
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {planned && ctx.features.offcuts && (
        <section aria-labelledby="reports-offcuts">
          <h2 id="reports-offcuts">Offcuts</h2>
          {analysis.offcuts.length === 0 ? (
            <p className="muted">This plan leaves no offcuts.</p>
          ) : (
            <>
              <ul>
                {analysis.offcuts.map((offcut, index) => (
                  <li key={index}>
                    Sheet {offcut.sheetNumber}: {formatSize(ctx, offcut.rect)} {materialName(ctx, offcut.material)}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={saveOffcuts} disabled={unsaved.length === 0}>
                {unsaved.length === 0 ? "Every offcut is in stock" : unsaved.length === analysis.offcuts.length ? "Save offcuts to stock" : `Save ${unsaved.length} new ${unsaved.length === 1 ? "offcut" : "offcuts"} to stock`}
              </button>
            </>
          )}
          {offcutStatus && (
            <p role="status" className="ok">
              {offcutStatus}
            </p>
          )}
        </section>
      )}

      {ctx.features.labels && (
        <section aria-labelledby="reports-labels">
          <h2 id="reports-labels">Labels</h2>
          <div className="toolbar">
            <label className="inline">
              Label sheet
              <select value={layoutId} onChange={(event) => setLayoutId(event.target.value as LabelLayoutId)}>
                {LABEL_LAYOUTS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            {perPage > 1 && (
              <label className="inline">
                Start at label
                <select value={firstLabel} onChange={(event) => setStart(Number(event.target.value))}>
                  {Array.from({ length: perPage }, (_, index) => (
                    <option key={index} value={index + 1}>
                      {index + 1}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <p>
            {analysis.labels.length} labels on {pageCount} {pageCount === 1 ? "page" : "pages"}.
          </p>
          <button type="button" onClick={() => onPrint({ kind: "labels", layout: layoutId, start: firstLabel })} disabled={analysis.labels.length === 0}>
            Print labels
          </button>
        </section>
      )}
    </div>
  );
}
