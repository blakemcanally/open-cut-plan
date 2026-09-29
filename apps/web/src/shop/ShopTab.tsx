import { describeStep, groupColors, sheetSvg, stockLabel, type ProjectAnalysis, type Step } from "@opencutplan/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PrintJob } from "../print/PrintView.tsx";
import type { ProjectStore } from "../state/useProject.ts";
import { keepProgress, setStepDone, shopState, writeProgress } from "./progress.ts";

interface ShopTabProps {
  store: ProjectStore;
  analysis: ProjectAnalysis;
  onPrint(job: PrintJob): void;
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

export function ShopTab({ store, analysis, onPrint }: ShopTabProps) {
  const { project, edit } = store;
  const { steps, context: ctx } = analysis;
  const state = useMemo(() => shopState(project, steps), [project, steps]);
  const colors = useMemo(() => groupColors(project), [project]);
  const [chosen, setChosen] = useState<number | null>(null);
  const list = useRef<HTMLElement>(null);
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

  if (steps.length === 0) {
    return (
      <p className="muted">
        {ctx.features.cutOrder
          ? "There are no cut steps. Optimize on the Layout tab, or place parts on a sheet."
          : "The cut order is off. Turn on Cut order in Settings to see the cut steps."}
      </p>
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
        <button type="button" onClick={() => onPrint({ kind: "sequence" })}>
          Print cut sequence
        </button>
      </div>
      <div className="shop-body">
        <section className="shop-current" aria-labelledby="shop-current-title">
          <h2 id="shop-current-title">{text.title}</h2>
          <p className="shop-text">{text.body}</p>
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
                dangerouslySetInnerHTML={{ __html: sheetSvg(ctx, sheet, steps, { colors, highlight: current, done: state.done, idPrefix: "shop" }) }}
              />
              <figcaption className="muted">
                Sheet {step.sheetNumber} of {analysis.sheets.length}: {stockLabel(ctx, sheet.stock)}
              </figcaption>
            </figure>
          )}
        </section>
        <section className="shop-steps" aria-labelledby="shop-steps-title" ref={list}>
          <h3 id="shop-steps-title">Cut sequence</h3>
          {runs.map((run) => (
            <div key={run[0]!.step}>
              <h4>Sheet {run[0]!.sheetNumber}</h4>
              <ol start={run[0]!.step}>
                {run.map((s) => {
                  const done = state.done.has(s.step);
                  return (
                    <li key={s.step} className={done ? "done" : undefined} aria-current={s.step === current ? "step" : undefined}>
                      <input type="checkbox" checked={done} onChange={(event) => tick(s.step, event.target.checked)} disabled={state.stale} aria-label={`Step ${s.step} done`} />
                      <button type="button" className="link" onClick={() => setChosen(s.step)}>
                        {describeStep(ctx, s).title}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
