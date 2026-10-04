import { designElevationSvg, formatSize, hardwareList, materialName, saveOffcutsToStock, unsavedOffcuts, type ProjectAnalysis } from "@opencutplan/core";
import { useMemo, useState } from "react";
import { TabLink } from "../components/TabLink.tsx";
import type { BookletSection } from "../print/booklet.ts";
import type { PrintJob } from "../print/PrintView.tsx";
import type { ViewPrefs } from "../state/prefs.ts";
import type { ProjectStore } from "../state/useProject.ts";
import { assemblyGroups } from "../shop/progress.ts";
import { CutListTable } from "./CutListTable.tsx";
import { HardwareTable } from "./HardwareTable.tsx";
import { PrintPanel } from "./PrintPanel.tsx";
import { ReportSummary } from "./ReportSummary.tsx";
import { SheetUseTable, ShoppingTables } from "./ShoppingTables.tsx";

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
  const unsaved = useMemo(() => unsavedOffcuts(project, analysis.offcuts), [project, analysis.offcuts]);
  const [offcutStatus, setOffcutStatus] = useState<string | null>(null);
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

  const saveOffcuts = () => {
    edit((p) => saveOffcutsToStock(p, unsavedOffcuts(p, analysis.offcuts)));
    setOffcutStatus(`${unsaved.length === 1 ? "1 offcut was" : `${unsaved.length} offcuts were`} added to the Stock tab.`);
  };

  return (
    <div className="reports">
      {planned && <ReportSummary analysis={analysis} />}

      <PrintPanel analysis={analysis} available={available} drawings={drawings} prefs={prefs} onPrefs={onPrefs} onPrint={onPrint} />

      <div className="report-sections">
        {planned && (
          <section aria-labelledby="reports-buy">
            <h2 id="reports-buy">Buy</h2>
            <ShoppingTables analysis={analysis} level={3} />
          </section>
        )}

        {project.parts.length > 0 && (
          <section aria-labelledby="reports-cut">
            <h2 id="reports-cut">Cut</h2>
            {planned && (
              <section aria-labelledby="reports-sheets">
                <h3 id="reports-sheets">Sheet use</h3>
                <SheetUseTable analysis={analysis} />
              </section>
            )}
            <section aria-labelledby="reports-cutlist">
              <h3 id="reports-cutlist">Cut list</h3>
              <CutListTable analysis={analysis} />
            </section>
            {planned && ctx.features.offcuts && (
              <section aria-labelledby="reports-offcuts">
                <h3 id="reports-offcuts">Offcuts</h3>
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
          </section>
        )}

        {(hardware.length > 0 || drawings.length > 0) && (
          <section aria-labelledby="reports-build">
            <h2 id="reports-build">Build</h2>
            {hardware.length > 0 && <HardwareTable project={project} lines={hardware} level={3} />}
            {drawings.map(({ design, svg }) => {
              const group = assembly.find((candidate) => candidate.design === design.id);
              return (
                <section key={design.id} className="report-design" aria-labelledby={`reports-design-${design.id}`}>
                  <h3 id={`reports-design-${design.id}`}>{design.name}</h3>
                  <div className="design-preview" role="img" aria-label={`Front view of ${design.name}`} dangerouslySetInnerHTML={{ __html: svg }} />
                  {group && (
                    <div>
                      <ol start={group.start}>
                        {group.steps.map((step, index) => (
                          <li key={index}>{step.title}</li>
                        ))}
                      </ol>
                      <p className="muted">
                        The <TabLink tab="assembly">Assembly tab</TabLink> has these steps as a checklist, with a drawing for each step.
                      </p>
                    </div>
                  )}
                </section>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
