import {
  copyLabel,
  describeStep,
  formatSize,
  grainOk,
  groupColors,
  labelLayout,
  labelPages,
  sheetSvg,
  sheetSvgExtent,
  stageColor,
  stockLabel,
  type LabelLayoutId,
  type Part,
  type PartLabel,
  type ProjectAnalysis,
  type SheetAnalysis,
  type TreeItem,
} from "@opencutplan/core";
import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { ShoppingTables } from "../reports/ShoppingTables.tsx";
import { printScale, sheetPrintLayout } from "./scale.ts";

export type PrintJob = { kind: "sheets" } | { kind: "sequence" } | { kind: "shopping" } | { kind: "labels"; layout: LabelLayoutId; start: number };

interface PrintViewProps {
  job: PrintJob;
  analysis: ProjectAnalysis;
  onDone(): void;
}

const SEQUENCE_BOX = { width: 170, height: 90 };

function pageRule(job: PrintJob): string {
  if (job.kind === "sheets") return "@page { size: landscape; margin: 12mm; }";
  if (job.kind === "labels") {
    const layout = labelLayout(job.layout);
    return `@page { size: ${layout.page.width}${layout.unit} ${layout.page.height}${layout.unit}; margin: 0; }`;
  }
  return "@page { size: portrait; margin: 15mm; }";
}

/** Renders the job outside `#root` and opens the print dialog; `onDone` runs when the dialog closes. */
export function PrintView({ job, analysis, onDone }: PrintViewProps) {
  useEffect(() => {
    window.addEventListener("afterprint", onDone);
    return () => window.removeEventListener("afterprint", onDone);
  }, [onDone]);

  const printed = useRef<PrintJob | null>(null);
  useEffect(() => {
    if (printed.current === job) return;
    printed.current = job;
    window.print();
  }, [job]);

  return createPortal(
    <div className="print-root" data-job={job.kind}>
      <style>{pageRule(job)}</style>
      {job.kind === "sheets" && <SheetPages analysis={analysis} />}
      {job.kind === "sequence" && <SequencePages analysis={analysis} />}
      {job.kind === "shopping" && (
        <section className="print-page">
          <h1>{analysis.context.project.project.name}: shopping list</h1>
          <ShoppingTables analysis={analysis} level={2} />
        </section>
      )}
      {job.kind === "labels" && <LabelPages analysis={analysis} layout={job.layout} start={job.start} />}
    </div>,
    document.body,
  );
}

function sheetTitle(analysis: ProjectAnalysis, sheet: SheetAnalysis): string {
  return `Sheet ${sheet.index + 1} of ${analysis.sheets.length}: ${stockLabel(analysis.context, sheet.stock)}`;
}

function scaleText(ratio: number | null): string {
  return ratio === null ? "Not to scale" : `Scale 1:${ratio}`;
}

function grainText(analysis: ProjectAnalysis, sheet: SheetAnalysis, index: number): string {
  const ctx = analysis.context;
  const placement = sheet.sheet.placements[index]!;
  const part = ctx.parts.get(placement.part)!;
  if (!ctx.features.grain || ctx.materials.get(sheet.stock.material)?.grained !== true || part.grain === "none") return "";
  const horizontal = (part.grain === "length") !== placement.rotated;
  return `${horizontal ? " ↔" : " ↕"}${grainOk(ctx, part, placement.rotated) ? "" : " ⟂ across the grain"}`;
}

interface KeyRow {
  part: Part;
  rotated: boolean;
  copy: number;
  item: TreeItem;
  count: number;
}

function keyRows(analysis: ProjectAnalysis, sheet: SheetAnalysis): KeyRow[] {
  const ctx = analysis.context;
  const rows = new Map<string, KeyRow>();
  for (const item of sheet.items) {
    const placement = sheet.sheet.placements[item.index]!;
    const id = `${placement.part}#${placement.rotated}`;
    const row = rows.get(id);
    if (row) row.count += 1;
    else rows.set(id, { part: ctx.parts.get(placement.part)!, rotated: placement.rotated, copy: placement.copy, item, count: 1 });
  }
  const order = new Map(ctx.project.parts.map((part, index) => [part.id, index]));
  return [...rows.values()].sort((a, b) => order.get(a.part.id)! - order.get(b.part.id)! || Number(a.rotated) - Number(b.rotated));
}

function SheetPages({ analysis }: { analysis: ProjectAnalysis }) {
  const ctx = analysis.context;
  const colors = useMemo(() => groupColors(ctx.project), [ctx.project]);
  return (
    <>
      {analysis.sheets.map((sheet) => {
        const { scale, keyBeside } = sheetPrintLayout(sheetSvgExtent(sheet), ctx.units);
        const steps = analysis.steps.filter((step) => step.sheetNumber === sheet.index + 1);
        const stages = [...new Set(steps.map((step) => step.stage))].sort((a, b) => a - b);
        return (
          <section key={sheet.sheet.id} className="print-page print-sheet">
            <h2>{sheetTitle(analysis, sheet)}</h2>
            <p className="print-meta">
              {scaleText(scale.ratio)} · {ctx.project.project.name}
            </p>
            <div className={keyBeside ? "print-sheet-body key-beside" : "print-sheet-body"}>
              <div className="print-diagram" dangerouslySetInnerHTML={{ __html: sheetSvg(ctx, sheet, analysis.steps, { colors, width: scale.width, height: scale.height, idPrefix: "print" }) }} />
              <ul className="print-key">
                {keyRows(analysis, sheet).map((row) => (
                  <li key={row.item.index}>
                    <strong>{row.count > 1 ? `${row.part.name} ×${row.count}` : copyLabel(row.part, row.copy)}</strong> {formatSize(ctx, row.item.rect)}
                    {grainText(analysis, sheet, row.item.index)}
                  </li>
                ))}
              </ul>
            </div>
            {stages.length > 0 && (
              <p className="print-note">
                The number on a cut line is its step in the cut sequence. The colour shows the stage:{" "}
                {stages.map((stage) => (
                  <span key={stage} className="print-stage" style={{ color: stageColor(stage) }}>
                    ■ stage {stage}
                  </span>
                ))}
                . A dashed line is a trim cut.
              </p>
            )}
          </section>
        );
      })}
    </>
  );
}

function SequencePages({ analysis }: { analysis: ProjectAnalysis }) {
  const ctx = analysis.context;
  const colors = useMemo(() => groupColors(ctx.project), [ctx.project]);
  return (
    <section className="print-page">
      <h1>{ctx.project.project.name}: cut sequence</h1>
      {analysis.steps.length === 0 && <p>There are no cut steps.</p>}
      {analysis.sheets.map((sheet) => {
        const steps = analysis.steps.filter((step) => step.sheetNumber === sheet.index + 1);
        if (steps.length === 0) return null;
        const scale = printScale(sheetSvgExtent(sheet), ctx.units, SEQUENCE_BOX);
        return (
          <section key={sheet.sheet.id} className="print-sequence-sheet">
            <h2>{sheetTitle(analysis, sheet)}</h2>
            <div className="print-diagram" dangerouslySetInnerHTML={{ __html: sheetSvg(ctx, sheet, analysis.steps, { colors, width: scale.width, height: scale.height, idPrefix: "print" }) }} />
            <p className="print-meta">{scaleText(scale.ratio)}</p>
            <ol className="print-steps">
              {steps.map((step) => {
                const text = describeStep(ctx, step);
                return (
                  <li key={step.step}>
                    <span className="print-box" aria-hidden="true">
                      ☐
                    </span>
                    <div>
                      <strong>{text.title}</strong> {text.body}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </section>
  );
}

function labelLines(analysis: ProjectAnalysis, label: PartLabel): string[] {
  const ctx = analysis.context;
  const grain = label.grain === "length" ? "Grain ↔" : label.grain === "width" ? "Grain ↕" : "";
  const where = label.sheetNumber === null ? "Not placed" : `Sheet ${label.sheetNumber}${label.step === null ? "" : ` · step ${label.step}`}`;
  return [`${formatSize(ctx, label)} · ${label.material}`, [label.group, grain].filter(Boolean).join(" · "), where].filter(Boolean);
}

function LabelPages({ analysis, layout: id, start }: { analysis: ProjectAnalysis; layout: LabelLayoutId; start: number }) {
  const layout = labelLayout(id);
  const pages = labelPages(analysis.labels, layout, start);
  const u = (value: number) => `${value}${layout.unit}`;
  return (
    <>
      {pages.map((page, pageIndex) => (
        <div key={pageIndex} className="print-page label-page" data-layout={layout.id} style={{ width: u(layout.page.width), height: u(layout.page.height) }}>
          {page.map((label, index) => {
            if (!label) return null;
            const column = index % layout.columns;
            const row = Math.floor(index / layout.columns);
            return (
              <div
                key={index}
                className="label"
                style={{
                  left: u(layout.margin.left + column * layout.pitch.x),
                  top: u(layout.margin.top + row * layout.pitch.y),
                  width: u(layout.label.width),
                  height: u(layout.label.height),
                }}
              >
                <strong>{label.name}</strong>
                {labelLines(analysis, label).map((line, lineIndex) => (
                  <span key={lineIndex}>{line}</span>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
