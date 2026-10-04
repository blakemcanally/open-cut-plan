import {
  designElevationSvg,
  exportPartsCsv,
  exportStockCsv,
  fileBase,
  formatIn,
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
  totalCutLength,
  unsavedOffcuts,
  type LabelLayoutId,
  type ProjectAnalysis,
} from "@opencutplan/core";
import { useMemo, useState } from "react";
import { BOOKLET_LABELS, BOOKLET_SECTIONS, type BookletSection } from "../print/booklet.ts";
import type { PrintJob } from "../print/PrintView.tsx";
import type { ViewPrefs } from "../state/prefs.ts";
import type { ProjectStore } from "../state/useProject.ts";
import { assemblyGroups } from "../shop/progress.ts";
import { downloadText } from "../storage/files.ts";
import { HardwareTable } from "./HardwareTable.tsx";
import { ShoppingTables } from "./ShoppingTables.tsx";

interface ReportsTabProps {
  store: ProjectStore;
  analysis: ProjectAnalysis;
  prefs: ViewPrefs;
  onPrefs(prefs: ViewPrefs): void;
  onPrint(job: PrintJob): void;
}

export function ReportsTab({ store, analysis, prefs, onPrefs, onPrint }: ReportsTabProps) {
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

  const available: Record<BookletSection, boolean> = {
    title: true,
    shopping: planned || hardware.length > 0,
    sheets: planned,
    sequence: analysis.steps.length > 0,
    assembly: assembly.length > 0,
  };
  const notes: Partial<Record<BookletSection, string>> = {
    shopping: "Needs a plan or a design.",
    sheets: "Needs a plan.",
    sequence: planned ? "The plan has no cuts." : "Needs a plan.",
  };
  const sections = BOOKLET_SECTIONS.filter((section) => available[section] && prefs.booklet[section]);

  const saveOffcuts = () => {
    edit((p) => saveOffcutsToStock(p, unsavedOffcuts(p, analysis.offcuts)));
    setOffcutStatus(`${unsaved.length === 1 ? "1 offcut was" : `${unsaved.length} offcuts were`} added to the Stock tab.`);
  };

  return (
    <div className="reports">
      <section aria-labelledby="reports-output">
        <h2 id="reports-output">Print and export</h2>
        {!planned && <p className="muted">There is no plan yet. Optimize on the Layout tab.</p>}
        <fieldset className="booklet">
          <legend>Print booklet</legend>
          {BOOKLET_SECTIONS.filter((section) => section !== "assembly" || available.assembly).map((section) => {
            const note = available[section] ? undefined : notes[section];
            return (
              <div key={section} className="booklet-section">
                <label className="inline">
                  <input
                    type="checkbox"
                    checked={available[section] && prefs.booklet[section]}
                    disabled={!available[section]}
                    aria-describedby={note && `booklet-${section}-note`}
                    onChange={(event) => onPrefs({ ...prefs, booklet: { ...prefs.booklet, [section]: event.target.checked } })}
                  />
                  {BOOKLET_LABELS[section]}
                </label>
                {note && (
                  <small id={`booklet-${section}-note`} className="muted">
                    {note}
                  </small>
                )}
              </div>
            );
          })}
          <button type="button" onClick={() => onPrint({ kind: "booklet", sections })} disabled={!sections.some((section) => section !== "title")}>
            Print booklet
          </button>
        </fieldset>
        <div className="buttons">
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
          {analysis.steps.length > 0 && (
            <p>
              {analysis.steps.length} {analysis.steps.length === 1 ? "cut step" : "cut steps"}. The total cut length is {formatIn(ctx, totalCutLength(analysis.steps))}.
            </p>
          )}
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
