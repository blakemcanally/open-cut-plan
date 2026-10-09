import {
  describeStep,
  partColors,
  resultLabel,
  sequencePlan,
  setupKey,
  setupLabel,
  setupRuns,
  sheetSvg,
  stockLabel,
  TOOL_WARNING_COLOR,
  toolColors,
  type CutColoring,
  type ProjectAnalysis,
  type Settings,
  type Step,
} from "@opencutplan/core";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { TabLink } from "../components/TabLink.tsx";
import type { PrintJob } from "../print/PrintView.tsx";
import type { ProjectStore } from "../state/useProject.ts";
import { chooseOrder, chooseTool, cutKey, keepProgress, setStepDone, shopState, writeProgress } from "./progress.ts";
import { toolOption } from "./toolOption.ts";

interface ShopTabProps {
  store: ProjectStore;
  analysis: ProjectAnalysis;
  onPrint(job: PrintJob): void;
  /** The step to show first, in place of the first step that is not done. */
  openStep?: number | null;
  /** The colours of the cuts on the diagram, as on the Layout tab. */
  cutColors?: CutColoring;
}

/** Consecutive steps on the same sheet; in setup order the sequence can go back to an earlier sheet. */
function sheetRuns(steps: readonly Step[]): Step[][] {
  const runs: Step[][] = [];
  for (const step of steps) {
    const last = runs.at(-1);
    if (last && last[0]!.sheetNumber === step.sheetNumber) last.push(step);
    else runs.push([step]);
  }
  return runs;
}

const ORDERS: readonly { value: Settings["orderMode"]; label: string }[] = [
  { value: "sheet", label: "By sheet" },
  { value: "setup", label: "By saw setting" },
];

function ToolName({ color, name }: { color: string; name: string }) {
  return (
    <span className="tool-name">
      <span className="swatch" style={{ background: color }} />
      {name}
    </span>
  );
}

export function ShopTab({ store, analysis, onPrint, openStep = null, cutColors = "stage" }: ShopTabProps) {
  const { project, edit } = store;
  const { steps, context: ctx } = analysis;
  const state = useMemo(() => shopState(project, steps), [project, steps]);
  const colors = useMemo(() => partColors(project), [project]);
  const tools = useMemo(() => toolColors(ctx.tools), [ctx.tools]);
  const [chosen, setChosen] = useState<number | null>(openStep);
  const list = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const orderName = useId();
  const bySetup = project.settings.orderMode === "setup";
  const runs = useMemo(() => (bySetup ? setupRuns(ctx, steps) : sheetRuns(steps)), [bySetup, ctx, steps]);

  const nextUndone = (after: number) => steps.find((s) => s.step > after && !state.done.has(s.step))?.step ?? null;
  const firstUndone = nextUndone(0);
  const current = chosen !== null && chosen <= steps.length ? chosen : (firstUndone ?? steps.length);

  useEffect(() => {
    const box = list.current;
    const row = box?.querySelector('[aria-current="step"]');
    if (!box || !row || box.scrollHeight <= box.clientHeight) return;
    const rect = row.getBoundingClientRect();
    const top = rect.top - box.getBoundingClientRect().top - box.clientTop + box.scrollTop;
    const bottom = top + rect.height;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
  }, [current]);

  useEffect(() => {
    if (openStep !== null) title.current?.focus();
  }, [openStep]);

  if (steps.length === 0) {
    return (
      <div className="shop">
        <p className="muted">
          {ctx.features.cutOrder ? (
            <>
              There are no cut steps. Optimize on the <TabLink tab="layout">Layout tab</TabLink>, or place parts on a sheet.
            </>
          ) : (
            <>
              The cut order is off. Turn on Cut order in <TabLink tab="settings" section="features">Settings</TabLink> to see the cut steps.
            </>
          )}
        </p>
      </div>
    );
  }

  const step = steps[current - 1]!;
  const text = describeStep(ctx, step);
  const sheet = analysis.sheets.find((s) => s.index === step.sheetNumber - 1);
  const isDone = state.done.has(current);
  const previous = steps[current - 2];
  const newSetup = bySetup && previous !== undefined && setupKey(ctx, previous) !== setupKey(ctx, step);

  const tick = (number: number, done: boolean) => {
    edit((p) => setStepDone(p, steps, number, done));
    setChosen(done && number === current ? (nextUndone(number) ?? number) : current);
  };
  const changeTool = (tool: string) => {
    const next = chooseTool(project, steps, step, tool);
    edit(next);
    setChosen(sequencePlan(next).find((s) => cutKey(s) === cutKey(step))?.step ?? current);
  };
  const changeOrder = (orderMode: Settings["orderMode"]) => {
    const next = chooseOrder(project, orderMode);
    edit(next);
    setChosen(sequencePlan(next).find((s) => cutKey(s) === cutKey(step))?.step ?? current);
  };
  const startOver = () => {
    edit((p) => writeProgress(p, null));
    setChosen(null);
  };
  const reset = () => {
    if (window.confirm("Clear the ticks on every step?")) startOver();
  };

  return (
    <div className="shop">
      {state.stale && (
        <div role="status" className="banner">
          <p>⚠ The cut steps changed after you ticked some of them. The old ticks may not match the new steps.</p>
          <div className="buttons">
            <button type="button" onClick={startOver}>
              Start over
            </button>
            <button type="button" onClick={() => edit((p) => keepProgress(p, steps))}>
              Keep my ticks
            </button>
          </div>
        </div>
      )}
      <div className="toolbar">
        <span aria-live="polite">
          {state.done.size} of {steps.length} steps done.
        </span>
        <span className="spacer" />
        <button type="button" onClick={reset} disabled={state.done.size === 0}>
          Reset progress
        </button>
        <button type="button" onClick={() => onPrint({ kind: "booklet", sections: ["sequence"] })}>
          Print cut sequence
        </button>
      </div>
      <div className="shop-body">
        <section className="shop-current" aria-labelledby="shop-current-title">
          <h2 id="shop-current-title" ref={title} tabIndex={-1}>
            {text.title}
          </h2>
          {newSetup && <p className="shop-setup">{`New setup: ${setupLabel(ctx, step)}.`}</p>}
          {ctx.tools.length > 0 && (
            <label className="shop-tool">
              Tool
              <span className="swatch" style={{ background: tools.cutColor(step) }} />
              <select value={step.tool?.id ?? ""} onChange={(event) => changeTool(event.target.value)}>
                {step.tool === null && <option value="">No tool</option>}
                {ctx.tools.map((tool) => (
                  <option key={tool.id} value={tool.id}>
                    {toolOption(step, tool, ctx.features.toolLimits)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="shop-method muted">{text.method}</p>
          <p className="shop-pickup">Pick up {text.pickUp}.</p>
          <ol className="shop-actions">
            {text.actions.map((action, index) => (
              <li key={index}>{action}</li>
            ))}
          </ol>
          <h3 className="shop-result-title">Result</h3>
          <ul className="shop-results">
            {text.results.map((result, index) => (
              <li key={index}>
                <span className={`result-label ${result.kind}`}>{resultLabel(result)}</span>
                <span className="result-text">
                  <strong>{result.parts.length > 0 ? result.parts.join(", ") : result.size}</strong>
                  {result.parts.length > 0 && <small> {result.size}</small>}
                  {result.where && <small className="muted"> ({result.where})</small>}
                  {result.kind === "offcut" && <small> Set it aside.</small>}
                </span>
                {result.next !== null && (
                  <button type="button" className="link" onClick={() => setChosen(result.next)}>
                    Go to step {result.next}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="buttons">
            <button type="button" onClick={() => setChosen(current - 1)} disabled={current <= 1}>
              ← Previous
            </button>
            <button type="button" className={isDone ? undefined : "primary"} onClick={() => tick(current, !isDone)} disabled={state.stale}>
              {isDone ? "Mark not done" : "Mark done"}
            </button>
            <button type="button" onClick={() => setChosen(current + 1)} disabled={current >= steps.length}>
              Next →
            </button>
          </div>
          {sheet && (
            <figure className="shop-diagram">
              <div
                role="img"
                aria-label={`Sheet ${step.sheetNumber}: ${stockLabel(ctx, sheet.stock)}, step ${current} marked`}
                dangerouslySetInnerHTML={{ __html: sheetSvg(ctx, sheet, steps, { colors, cutColors, highlight: current, focus: true, done: state.done, idPrefix: "shop" }) }}
              />
              <figcaption className="muted">
                Sheet {step.sheetNumber} of {analysis.sheets.length}: {stockLabel(ctx, sheet.stock)}
              </figcaption>
            </figure>
          )}
        </section>
        <section className="shop-steps" aria-labelledby="shop-steps-title" ref={list}>
          <h3 id="shop-steps-title">Cut sequence</h3>
          <fieldset className="choice">
            <legend>Order</legend>
            {ORDERS.map((order) => (
              <label key={order.value}>
                <input type="radio" name={orderName} checked={project.settings.orderMode === order.value} onChange={() => changeOrder(order.value)} />
                {order.label}
              </label>
            ))}
          </fieldset>
          {runs.map((run) => {
            const oneTool = bySetup || new Set(run.map((s) => s.tool?.id ?? null)).size === 1;
            const runTool = run[0]!.tool;
            const runColor = (runTool && tools.colorOf(runTool.id)) ?? TOOL_WARNING_COLOR;
            return (
              <div key={run[0]!.step}>
                <h4>
                  {bySetup ? (
                    <>
                      <ToolName color={runColor} name={setupLabel(ctx, run[0]!)} />
                      {` · ${run.length} ${run.length === 1 ? "cut" : "cuts"}`}
                    </>
                  ) : (
                    <>
                      {`Sheet ${run[0]!.sheetNumber}`}
                      {oneTool && (
                        <>
                          {" · "}
                          <ToolName color={runColor} name={runTool?.name ?? "No tool"} />
                        </>
                      )}
                    </>
                  )}
                </h4>
                <ol start={run[0]!.step}>
                  {run.map((s) => {
                    const done = state.done.has(s.step);
                    return (
                      <li key={s.step} className={done ? "done" : undefined} aria-current={s.step === current ? "step" : undefined}>
                        <input type="checkbox" checked={done} onChange={(event) => tick(s.step, event.target.checked)} disabled={state.stale} aria-label={`Step ${s.step} done`} />
                        <button type="button" className="link" onClick={() => setChosen(s.step)}>
                          {s.step}. {describeStep(ctx, s).headline}
                          {bySetup && ` · Sheet ${s.sheetNumber}`}
                          {!oneTool && (
                            <>
                              {" · "}
                              <ToolName color={tools.cutColor(s)} name={s.tool?.name ?? "No tool"} />
                            </>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
