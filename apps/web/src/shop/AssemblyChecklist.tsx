import { useMemo } from "react";
import type { ProjectStore } from "../state/useProject.ts";
import { assemblyCount, assemblyGroups, assemblyState, keepAssemblyProgress, setAssemblyStepDone, writeProgress } from "./progress.ts";

export function AssemblyChecklist({ store }: { store: ProjectStore }) {
  const { project, edit } = store;
  const groups = useMemo(() => assemblyGroups(project), [project]);
  const state = useMemo(() => assemblyState(project, groups), [project, groups]);
  if (groups.length === 0) return null;
  const total = assemblyCount(groups);
  const startOver = () => edit((p) => writeProgress(p, null, "assemblyProgress"));
  const reset = () => {
    if (window.confirm("Clear the ticks on every assembly step?")) startOver();
  };

  return (
    <section className="assembly" aria-labelledby="assembly-title">
      <div className="toolbar">
        <h3 id="assembly-title">Assembly</h3>
        <span aria-live="polite">
          {state.done.size} of {total} assembly steps done.
        </span>
        <span className="spacer" />
        <button type="button" onClick={reset} disabled={state.done.size === 0}>
          Reset assembly
        </button>
      </div>
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
      {groups.map((group) => (
        <div key={group.design}>
          <h4>{group.name}</h4>
          <ol className="assembly-steps" start={group.start}>
            {group.steps.map((step, index) => {
              const number = group.start + index;
              const done = state.done.has(number);
              return (
                <li key={number} className={done ? "done" : undefined}>
                  <input
                    type="checkbox"
                    checked={done}
                    disabled={state.stale}
                    aria-label={`Assembly step ${number} done`}
                    onChange={(event) => edit((p) => setAssemblyStepDone(p, groups, number, event.target.checked))}
                  />
                  <div>
                    <b>{step.title}</b>
                    <p>{step.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </section>
  );
}
