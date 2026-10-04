import { assemblyDrawings, type AssemblyDrawing } from "@opencutplan/core";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Dialog } from "../components/Dialog.tsx";
import { TabLink } from "../components/TabLink.tsx";
import type { PrintJob } from "../print/PrintView.tsx";
import type { ProjectStore } from "../state/useProject.ts";
import { assemblyCount, assemblyGroups, assemblyState, keepAssemblyProgress, setAssemblyStepDone, writeProgress, type AssemblyGroup } from "./progress.ts";

interface AssemblyTabProps {
  store: ProjectStore;
  onPrint(job: PrintJob): void;
}

interface NumberedStep {
  number: number;
  title: string;
  body: string;
  drawing: AssemblyDrawing;
}

function numberedSteps(groups: readonly AssemblyGroup[], drawings: ReadonlyMap<string, AssemblyDrawing[]>): NumberedStep[] {
  return groups.flatMap((group) => group.steps.map((step, index) => ({ number: group.start + index, title: step.title, body: step.body, drawing: drawings.get(group.design)![index]! })));
}

function StepDrawing({ step, total, onClose, onMove }: { step: NumberedStep; total: number; onClose(): void; onMove(number: number): void }) {
  const previous = useRef<HTMLButtonElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const focused = document.activeElement;
    if (focused === document.body || (focused instanceof HTMLButtonElement && focused.disabled)) (step.number <= 1 ? next : previous).current?.focus();
  }, [step.number]);
  return (
    <Dialog title={`Step ${step.number} of ${total}: ${step.title}`} onClose={onClose}>
      <div className="assembly-large" role="img" aria-label={step.drawing.description} dangerouslySetInnerHTML={{ __html: step.drawing.svg }} />
      <p>{step.body}</p>
      <div className="buttons">
        <button ref={previous} type="button" onClick={() => onMove(step.number - 1)} disabled={step.number <= 1}>
          ← Previous
        </button>
        <button ref={next} type="button" onClick={() => onMove(step.number + 1)} disabled={step.number >= total}>
          Next →
        </button>
      </div>
    </Dialog>
  );
}

export function AssemblyTab({ store, onPrint }: AssemblyTabProps) {
  const { project, edit } = store;
  const groups = useMemo(() => assemblyGroups(project), [project]);
  const drawings = useMemo(() => new Map(groups.map((group) => [group.design, assemblyDrawings(project, group.design)!])), [project, groups]);
  const state = useMemo(() => assemblyState(project, groups), [project, groups]);
  const [enlarged, setEnlarged] = useState<number | null>(null);
  const idPrefix = useId();
  const designs = project.designs ?? [];

  if (designs.length === 0) {
    return (
      <div className="assembly">
        <p className="muted">
          There are no designs. Add a design on the <TabLink tab="design">Design tab</TabLink> to get its assembly steps.
        </p>
      </div>
    );
  }

  const all = numberedSteps(groups, drawings);
  const total = assemblyCount(groups);
  const current = all.find((step) => !state.done.has(step.number))?.number ?? null;
  const skipped = designs.filter((design) => !groups.some((group) => group.design === design.id)).map((design) => design.name);
  const startOver = () => edit((p) => writeProgress(p, null, "assemblyProgress"));
  const reset = () => {
    if (window.confirm("Clear the ticks on every assembly step?")) startOver();
  };
  const shown = all.find((step) => step.number === enlarged);

  return (
    <div className="assembly">
      {total > 0 && (
        <div className="toolbar">
          <span aria-live="polite">
            {state.done.size} of {total} assembly steps done.
          </span>
          <span className="spacer" />
          <button type="button" onClick={reset} disabled={state.done.size === 0}>
            Reset assembly
          </button>
          <button type="button" onClick={() => onPrint({ kind: "booklet", sections: ["assembly"] })}>
            Print assembly steps
          </button>
        </div>
      )}
      {skipped.length > 0 && (
        <p className="muted">
          {skipped.length === 1 ? `${skipped[0]} has no steps, because the design makes no parts.` : `${skipped.join(", ")} have no steps, because the designs make no parts.`} Fix{" "}
          {skipped.length === 1 ? "it" : "them"} on the <TabLink tab="design">Design tab</TabLink>.
        </p>
      )}
      {state.stale && (
        <div role="status" className="banner">
          <p>⚠ The assembly steps changed after you ticked some of them. The old ticks may not match the new steps.</p>
          <div className="buttons">
            <button type="button" onClick={startOver}>
              Start over
            </button>
            <button type="button" onClick={() => edit((p) => keepAssemblyProgress(p, groups))}>
              Keep my ticks
            </button>
          </div>
        </div>
      )}
      {total > 0 && (
        <p className="muted assembly-key">
          In each drawing, the boards of the step are blue, the boards from earlier steps have the colour of the design, and the boards of later steps are grey outlines. Click a drawing to make it larger.
        </p>
      )}
      {groups.map((group) => (
        <section key={group.design} aria-labelledby={`${idPrefix}-${group.design}`}>
          <h2 id={`${idPrefix}-${group.design}`}>{group.name}</h2>
          <ol className="assembly-steps" start={group.start}>
            {all
              .filter((step) => step.number >= group.start && step.number < group.start + group.steps.length)
              .map((step) => {
                const done = state.done.has(step.number);
                const describedBy = `${idPrefix}-step-${step.number}`;
                return (
                  <li key={step.number} className={done ? "done" : undefined} aria-current={step.number === current ? "step" : undefined}>
                    <input
                      type="checkbox"
                      checked={done}
                      disabled={state.stale}
                      aria-label={`Assembly step ${step.number} done`}
                      onChange={(event) => edit((p) => setAssemblyStepDone(p, groups, step.number, event.target.checked))}
                    />
                    <div className="assembly-text">
                      <b>
                        {step.number}. {step.title}
                      </b>
                      <p>{step.body}</p>
                    </div>
                    <button
                      type="button"
                      className="assembly-drawing"
                      aria-label={`Enlarge the drawing of step ${step.number}`}
                      aria-describedby={describedBy}
                      onClick={() => setEnlarged(step.number)}
                    >
                      <span className="assembly-thumb" aria-hidden="true" dangerouslySetInnerHTML={{ __html: step.drawing.svg }} />
                      <span id={describedBy} className="visually-hidden">
                        {step.drawing.description}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ol>
        </section>
      ))}
      {shown && <StepDrawing step={shown} total={total} onClose={() => setEnlarged(null)} onMove={setEnlarged} />}
    </div>
  );
}
