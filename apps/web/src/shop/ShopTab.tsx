import {
  describeStep,
  partColors,
  LIMIT_WORDS,
  resultLabel,
  sequencePlan,
  sheetSvg,
  stockLabel,
  TOOL_WARNING_COLOR,
  toolColors,
  toolLimit,
  type CutColoring,
  type ProjectAnalysis,
  type Step,
  type Tool,
} from "@opencutplan/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PrintJob } from "../print/PrintView.tsx";
import type { ProjectStore } from "../state/useProject.ts";
import { AssemblyChecklist } from "./AssemblyChecklist.tsx";
import { chooseTool, cutKey, keepProgress, setStepDone, shopState, writeProgress } from "./progress.ts";

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

function ToolName({ color, name }: { color: string; name: string }) {
  return (
    <span className="tool-name">
      <span className="swatch" style={{ background: color }} />
      {name}
    </span>
  );
}

function toolOption(step: Step, tool: Tool, limits: boolean): string {
  if (tool.id === step.recommended?.id) return `${tool.name} (recommended)`;
  const limit = toolLimit(tool, { ...step, length: step.to - step.from }, limits);
  return limit ? `${tool.name} (over its ${LIMIT_WORDS[limit]})` : tool.name;
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
  const runs = useMemo(() => sheetRuns(steps), [steps]);

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
          {ctx.features.cutOrder
            ? "There are no cut steps. Optimize on the Layout tab, or place parts on a sheet."
            : "The cut order is off. Turn on Cut order in Settings to see the cut steps."}
        </p>
        <AssemblyChecklist store={store} />
      </div>
    );
  }

  const step = steps[current - 1]!;
  const text = describeStep(ctx, step);
  const sheet = analysis.sheets.find((s) => s.index === step.sheetNumber - 1);
  const isDone = state.done.has(current);

  const tick = (number: number, done: boolean) => {
    edit((p) => setStepDone(p, steps, number, done));
    setChosen(done && number === current ? (nextUndone(number) ?? number) : current);
  };
  const changeTool = (tool: string) => {
    const next = chooseTool(project, steps, step, tool);
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
          {runs.map((run) => {
            const oneTool = new Set(run.map((s) => s.tool?.id ?? null)).size === 1;
            const runTool = run[0]!.tool;
            return (
              <div key={run[0]!.step}>
                <h4>
                  {`Sheet ${run[0]!.sheetNumber}`}
                  {oneTool && (
                    <>
                      {" · "}
                      <ToolName color={(runTool && tools.colorOf(runTool.id)) ?? TOOL_WARNING_COLOR} name={runTool?.name ?? "No tool"} />
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
      <AssemblyChecklist store={store} />
    </div>
  );
}
