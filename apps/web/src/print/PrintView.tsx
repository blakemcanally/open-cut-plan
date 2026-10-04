import {
  copyLabel,
  describeStep,
  designElevationSvg,
  formatSize,
  grainOk,
  partColors,
  hardwareList,
  labelLayout,
  labelPages,
  planAlert,
  resultSentence,
  sequenceRows,
  sheetSvg,
  sheetSvgExtent,
  stageColor,
  stockLabel,
  TOOL_WARNING_COLOR,
  toolColors,
  toolWarning,
  type CutColoring,
  type LabelLayoutId,
  type Part,
  type PartLabel,
  type ProjectAnalysis,
  type SheetAnalysis,
  type Step,
  type TreeItem,
} from "@opencutplan/core";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HardwareTable } from "../reports/HardwareTable.tsx";
import { ShoppingTables } from "../reports/ShoppingTables.tsx";
import { assemblyGroups } from "../shop/progress.ts";
import { BOOKLET_LABELS, BOOKLET_SECTIONS, type BookletSection } from "./booklet.ts";
import { sequencePrintLayout, sheetPrintLayout } from "./scale.ts";

export type PrintJob = { kind: "booklet"; sections: readonly BookletSection[] } | { kind: "labels"; layout: LabelLayoutId; start: number };

export interface PrintOptions {
  /** The "Colour cuts by" choice of the Layout tab. */
  cutColors: CutColoring;
  detailedSteps: boolean;
}

interface PrintViewProps {
  job: PrintJob;
  analysis: ProjectAnalysis;
  options?: PrintOptions;
  onDone(): void;
}

const DEFAULT_OPTIONS: PrintOptions = { cutColors: "stage", detailedSteps: false };

export const BOOKLET_PAGE_RULE = "@page { size: portrait; margin: 15mm; } @page sheet { size: landscape; margin: 10mm; }";

function pageRule(job: PrintJob): string {
  if (job.kind === "booklet") return BOOKLET_PAGE_RULE;
  const layout = labelLayout(job.layout);
  return `@page { size: ${layout.page.width}${layout.unit} ${layout.page.height}${layout.unit}; margin: 0; }`;
}

/** Renders the job outside `#root` and opens the print dialog; `onDone` runs when the dialog closes. */
export function PrintView({ job, analysis, options = DEFAULT_OPTIONS, onDone }: PrintViewProps) {
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
      {job.kind === "booklet" && <BookletPages analysis={analysis} sections={job.sections} options={options} />}
      {job.kind === "labels" && <LabelPages analysis={analysis} layout={job.layout} start={job.start} />}
    </div>,
    document.body,
  );
}

function BookletPages({ analysis, sections, options }: { analysis: ProjectAnalysis; sections: readonly BookletSection[]; options: PrintOptions }) {
  const included = BOOKLET_SECTIONS.filter((section) => sections.includes(section));
  const problems = planAlert(analysis.context, analysis.issues);
  const notice = problems && (
    <p className="print-alert">
      {problems.severity === "error" ? "✖" : "⚠"} {problems.text} See the Problems list on the Layout tab.
    </p>
  );
  return (
    <>
      {included.map((section, index) => {
        const alert = index === 0 ? notice : null;
        switch (section) {
          case "title":
            return <TitlePage key={section} analysis={analysis} contents={included.filter((other) => other !== "title")} alert={alert} />;
          case "shopping":
            return <ShoppingPage key={section} analysis={analysis} alert={alert} />;
          case "sheets":
            return <SheetPages key={section} analysis={analysis} alert={alert} coloring={options.cutColors} />;
          case "sequence":
            return <SequencePages key={section} analysis={analysis} alert={alert} coloring={options.cutColors} detailed={options.detailedSteps} />;
          case "assembly":
            return <AssemblyPages key={section} analysis={analysis} alert={alert} />;
        }
      })}
    </>
  );
}

function TitlePage({ analysis, contents, alert }: { analysis: ProjectAnalysis; contents: readonly BookletSection[]; alert: ReactNode }) {
  return (
    <section className="print-page print-title">
      <h1>{analysis.context.project.project.name}</h1>
      <p className="print-meta">{new Date().toLocaleDateString(undefined, { dateStyle: "long" })}</p>
      {alert}
      <h2>Contents</h2>
      <ol>
        {contents.map((section) => (
          <li key={section}>{BOOKLET_LABELS[section]}</li>
        ))}
      </ol>
    </section>
  );
}

function ShoppingPage({ analysis, alert }: { analysis: ProjectAnalysis; alert: ReactNode }) {
  const project = analysis.context.project;
  const hardware = hardwareList(project);
  return (
    <section className="print-page">
      <h1>{project.project.name}: shopping list</h1>
      {alert}
      {analysis.sheets.length > 0 && <ShoppingTables analysis={analysis} level={2} />}
      {hardware.length > 0 && <HardwareTable project={project} lines={hardware} level={2} />}
    </section>
  );
}

function AssemblyPages({ analysis, alert }: { analysis: ProjectAnalysis; alert: ReactNode }) {
  const project = analysis.context.project;
  return (
    <>
      {assemblyGroups(project).map((group, groupIndex) => (
        <section key={group.design} className="print-page print-assembly">
          <h1>
            {project.project.name}: {group.name}
          </h1>
          {groupIndex === 0 && alert}
          <div className="print-elevation" dangerouslySetInnerHTML={{ __html: designElevationSvg(project, group.design)! }} />
          <ol className="print-steps">
            {group.steps.map((step, index) => (
              <li key={index}>
                <span className="print-box" aria-hidden="true">
                  ☐
                </span>
                <div>
                  <strong>{step.title}</strong> {step.body}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </>
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

function CutKey({ analysis, steps, coloring }: { analysis: ProjectAnalysis; steps: readonly Step[]; coloring: CutColoring }) {
  if (steps.length === 0) return null;
  const items =
    coloring === "tool"
      ? [
          ...toolColors(analysis.context.tools)
            .legend.filter((entry) => steps.some((step) => step.tool?.id === entry.tool && !toolWarning(step)))
            .map((entry) => ({ key: entry.tool, label: entry.name, color: entry.color })),
          ...(steps.some(toolWarning) ? [{ key: "warning", label: "no tool, or over a tool limit", color: TOOL_WARNING_COLOR }] : []),
        ]
      : [...new Set(steps.map((step) => step.stage))]
          .sort((a, b) => a - b)
          .map((stage) => ({ key: `stage-${stage}`, label: `stage ${stage}`, color: stageColor(stage) }));
  return (
    <p className="print-note">
      The number on a cut line is its step in the cut sequence. The colour shows the {coloring}:{" "}
      {items.map((item) => (
        <span key={item.key} className="print-stage" style={{ color: item.color }}>
          ■ {item.label}
        </span>
      ))}
      . A dashed line is a trim cut.
    </p>
  );
}

function SheetPages({ analysis, alert, coloring }: { analysis: ProjectAnalysis; alert: ReactNode; coloring: CutColoring }) {
  const ctx = analysis.context;
  const colors = useMemo(() => partColors(ctx.project), [ctx.project]);
  return (
    <>
      {analysis.sheets.map((sheet) => {
        const rows = keyRows(analysis, sheet);
        const notice = sheet.index === 0 ? alert : null;
        const { scale, keyBeside } = sheetPrintLayout(sheetSvgExtent(sheet), ctx.units, rows.length, { alert: Boolean(notice) });
        const steps = analysis.steps.filter((step) => step.sheetNumber === sheet.index + 1);
        return (
          <section key={sheet.sheet.id} className="print-page print-landscape print-sheet">
            <h2>{sheetTitle(analysis, sheet)}</h2>
            <p className="print-meta">
              {scaleText(scale.ratio)} · {ctx.project.project.name}
            </p>
            {notice}
            <div className={keyBeside ? "print-sheet-body key-beside" : "print-sheet-body"}>
              <div
                className="print-diagram"
                dangerouslySetInnerHTML={{ __html: sheetSvg(ctx, sheet, analysis.steps, { colors, cutColors: coloring, width: scale.width, height: scale.height, idPrefix: "print" }) }}
              />
              <ul className="print-key">
                {rows.map((row) => (
                  <li key={row.item.index}>
                    <strong>{row.count > 1 ? `${row.part.name} ×${row.count}` : copyLabel(row.part, row.copy)}</strong> {formatSize(ctx, row.item.rect)}
                    {grainText(analysis, sheet, row.item.index)}
                  </li>
                ))}
              </ul>
            </div>
            <CutKey analysis={analysis} steps={steps} coloring={coloring} />
          </section>
        );
      })}
    </>
  );
}

function SequenceTable({ analysis, steps }: { analysis: ProjectAnalysis; steps: readonly Step[] }) {
  const ctx = analysis.context;
  const tools = toolColors(ctx.tools);
  const rows = sequenceRows(ctx, steps);
  return (
    <table className="print-cuts">
      <thead>
        <tr>
          <th scope="col">Done</th>
          <th scope="col">Step</th>
          <th scope="col">Tool</th>
          <th scope="col">Setting</th>
          <th scope="col">Finished parts</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={row.step}>
            <td className="print-box">☐</td>
            <td>{row.step}</td>
            <td>
              <span className="print-swatch" style={{ color: tools.cutColor(steps[index]!) }} aria-hidden="true">
                ■
              </span>{" "}
              {row.toolName}
              {row.warning && " ⚠"}
            </td>
            <td>{row.setting}</td>
            <td>{row.parts.join(", ")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DetailedSteps({ analysis, steps }: { analysis: ProjectAnalysis; steps: readonly Step[] }) {
  return (
    <ol className="print-steps">
      {steps.map((step) => {
        const text = describeStep(analysis.context, step);
        return (
          <li key={step.step}>
            <span className="print-box" aria-hidden="true">
              ☐
            </span>
            <div>
              <div>
                <strong>{text.title}</strong> · {text.method}
              </div>
              <div>
                Pick up {text.pickUp}. {text.actions.map((action, index) => `${index + 1}. ${action}`).join(" ")}
              </div>
              <div>{text.results.map(resultSentence).join(" ")}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function stepRange(steps: readonly Step[]): string {
  const first = steps[0]!.step;
  const last = steps[steps.length - 1]!.step;
  return first === last ? `Step ${first}` : `Steps ${first}–${last}`;
}

function SequencePages({ analysis, alert, coloring, detailed }: { analysis: ProjectAnalysis; alert: ReactNode; coloring: CutColoring; detailed: boolean }) {
  const ctx = analysis.context;
  const colors = useMemo(() => partColors(ctx.project), [ctx.project]);
  const title = `${ctx.project.project.name}: cut sequence`;
  const sheets = analysis.sheets.flatMap((sheet) => {
    const steps = analysis.steps.filter((step) => step.sheetNumber === sheet.index + 1);
    return steps.length === 0 ? [] : [{ sheet, steps }];
  });
  if (sheets.length === 0) {
    return (
      <section className="print-page">
        <h1>{title}</h1>
        {alert}
        <p>There are no cut steps.</p>
      </section>
    );
  }
  return (
    <>
      {sheets.map(({ sheet, steps }, index) => {
        const first = index === 0;
        const { scale, table } = sequencePrintLayout(sheetSvgExtent(sheet), ctx.units, steps.length, { title: first, alert: first && Boolean(alert), detailed });
        const list = detailed ? <DetailedSteps analysis={analysis} steps={steps} /> : <SequenceTable analysis={analysis} steps={steps} />;
        return (
          <section key={sheet.sheet.id} className="print-page print-landscape print-sequence">
            {first && <h1>{title}</h1>}
            <h2>{sheetTitle(analysis, sheet)}</h2>
            <p className="print-meta">
              {scaleText(scale.ratio)} · {stepRange(steps)}
            </p>
            {first && alert}
            <div className={`print-sequence-body table-${table}`}>
              <div>
                <div
                  className="print-diagram"
                  dangerouslySetInnerHTML={{ __html: sheetSvg(ctx, sheet, analysis.steps, { colors, cutColors: coloring, width: scale.width, height: scale.height, idPrefix: "print-seq" }) }}
                />
                <CutKey analysis={analysis} steps={steps} coloring={coloring} />
              </div>
              {table === "next-page" ? (
                <div>
                  <h3 className="print-continued">
                    {sheetTitle(analysis, sheet)} · {stepRange(steps)}
                  </h3>
                  {list}
                </div>
              ) : (
                list
              )}
            </div>
          </section>
        );
      })}
    </>
  );
}

function labelLines(analysis: ProjectAnalysis, label: PartLabel): string[] {
  const ctx = analysis.context;
  const grain = label.grain === "length" ? "Grain ↔" : label.grain === "width" ? "Grain ↕" : "";
  const where = label.sheetNumber === null ? "Not placed" : `Sheet ${label.sheetNumber}${label.step === null ? "" : ` · step ${label.step}`}`;
  return [`${formatSize(ctx, label)} · ${label.material}`, [label.group, grain, label.factoryEdge ? "Factory edge" : ""].filter(Boolean).join(" · "), where].filter(Boolean);
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
