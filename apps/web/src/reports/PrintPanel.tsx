import {
  exportPartsCsv,
  exportStockCsv,
  fileBase,
  LABEL_LAYOUTS,
  labelLayout,
  labelPages,
  labelsPerPage,
  partColors,
  sheetSvg,
  type Design,
  type LabelLayoutId,
  type ProjectAnalysis,
} from "@opencutplan/core";
import { useMemo, useState } from "react";
import { TabLink } from "../components/TabLink.tsx";
import { BOOKLET_LABELS, BOOKLET_SECTIONS, type BookletSection } from "../print/booklet.ts";
import type { PrintJob } from "../print/PrintView.tsx";
import type { ViewPrefs } from "../state/prefs.ts";
import { downloadText } from "../storage/files.ts";

interface PrintPanelProps {
  analysis: ProjectAnalysis;
  available: Readonly<Record<BookletSection, boolean>>;
  drawings: readonly { design: Design; svg: string }[];
  prefs: ViewPrefs;
  onPrefs(prefs: ViewPrefs): void;
  onPrint(job: PrintJob): void;
}

const NOTES: Partial<Record<BookletSection, string>> = {
  shopping: "Needs a plan or a design.",
  sheets: "Needs a plan.",
};

export function PrintPanel({ analysis, available, drawings, prefs, onPrefs, onPrint }: PrintPanelProps) {
  const ctx = analysis.context;
  const project = ctx.project;
  const planned = analysis.sheets.length > 0;
  const base = fileBase(project.project.name);
  const colors = useMemo(() => partColors(project), [project]);
  const [layoutId, setLayoutId] = useState<LabelLayoutId>(ctx.units === "in" ? "avery-5160" : "avery-l7160");
  const [start, setStart] = useState(1);
  const layout = labelLayout(layoutId);
  const perPage = labelsPerPage(layout);
  const firstLabel = Math.min(start, perPage);
  const pageCount = labelPages(analysis.labels, layout, firstLabel).length;

  const notes = { ...NOTES, sequence: planned ? "The plan has no cuts." : "Needs a plan." };
  const sections = BOOKLET_SECTIONS.filter((section) => available[section] && prefs.booklet[section]);
  const sequenceOn = available.sequence && prefs.booklet.sequence;

  return (
    <section className="report-output" aria-labelledby="reports-output">
      <h2 id="reports-output">Print and export</h2>
      {!planned && (
        <p className="muted">
          There is no plan yet. Optimize on the <TabLink tab="layout">Layout tab</TabLink>.
        </p>
      )}
      <fieldset className="report-group">
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
              {section === "sequence" && (
                <div className="booklet-option">
                  <label className="inline">
                    <input
                      type="checkbox"
                      checked={prefs.detailedSteps}
                      disabled={!sequenceOn}
                      aria-describedby="booklet-detailed-note"
                      onChange={(event) => onPrefs({ ...prefs, detailedSteps: event.target.checked })}
                    />
                    Detailed steps
                  </label>
                  <small id="booklet-detailed-note" className="muted">
                    The full text of each step, in place of the short table.
                  </small>
                </div>
              )}
            </div>
          );
        })}
        <button type="button" onClick={() => onPrint({ kind: "booklet", sections })} disabled={!sections.some((section) => section !== "title")}>
          Print booklet
        </button>
      </fieldset>

      {ctx.features.labels && (
        <fieldset className="report-group">
          <legend>Labels</legend>
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
          <p>
            {analysis.labels.length} labels on {pageCount} {pageCount === 1 ? "page" : "pages"}.
          </p>
          <button type="button" onClick={() => onPrint({ kind: "labels", layout: layoutId, start: firstLabel })} disabled={analysis.labels.length === 0}>
            Print labels
          </button>
        </fieldset>
      )}

      <fieldset className="report-group">
        <legend>Export</legend>
        <div className="buttons">
          <button type="button" onClick={() => downloadText(exportPartsCsv(project), `${base}-parts.csv`, "text/csv")}>
            Export parts CSV
          </button>
          <button type="button" onClick={() => downloadText(exportStockCsv(project), `${base}-stock.csv`, "text/csv")}>
            Export stock CSV
          </button>
        </div>
        {(planned || drawings.length > 0) && (
          <div className="buttons" role="group" aria-label="SVG drawings">
            {analysis.sheets.map((sheet) => (
              <button
                key={sheet.sheet.id}
                type="button"
                onClick={() => downloadText(sheetSvg(ctx, sheet, analysis.steps, { colors, cutColors: prefs.cutColors }), `${base}-sheet-${sheet.index + 1}.svg`, "image/svg+xml")}
              >
                Sheet {sheet.index + 1} as SVG
              </button>
            ))}
            {drawings.map(({ design, svg }) => (
              <button key={design.id} type="button" onClick={() => downloadText(svg, `${base}-${design.id}.svg`, "image/svg+xml")}>
                {design.name} front view as SVG
              </button>
            ))}
          </div>
        )}
        {analysis.steps.length > 0 && (
          <p className="muted">
            The cuts in print and in the SVG files have the colour of their {prefs.cutColors}, as on the <TabLink tab="layout">Layout tab</TabLink>.
          </p>
        )}
      </fieldset>
    </section>
  );
}
