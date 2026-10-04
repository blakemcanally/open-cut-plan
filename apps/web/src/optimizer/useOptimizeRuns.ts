import {
  applyRun,
  keepSearchingRequest,
  optimizeRequest,
  planStats,
  samePlan,
  type LastRun,
  type OptimizeMode,
  type OptimizeRequest,
  type OptimizeResult,
  type PlanStats,
  type Project,
} from "@opencutplan/core";
import { useCallback, useState } from "react";
import type { ProjectStore } from "../state/useProject.ts";
import { useOptimizer, type RunningState, type WorkerFactory } from "./useOptimizer.ts";

export type RunKind = OptimizeMode | "keep";

export const RUN_NAMES: Record<RunKind, string> = { all: "Optimize", rest: "Optimize the rest", keep: "Keep searching" };

export interface RunOutcome {
  kind: RunKind;
  /** The project before the run. */
  from: Project;
  /** The project after the run; `from` when the run did not change the plan. */
  applied: Project;
  before: PlanStats;
  after: PlanStats;
  /** False when the run found no better plan than the one it started from, and so did not change the project. */
  changed: boolean;
}

export interface OptimizeRuns {
  running: RunningState | null;
  error: string | null;
  /** The outcome of the last run, for a status line. */
  notice: string | null;
  /** The last run while the project is still the one it produced. */
  current: LastRun | null;
  /** The outcome of the last run while the project is still the one it produced. */
  outcome: RunOutcome | null;
  /** True while an undo has put back the project from before the last run. */
  undone: boolean;
  optimize(mode: OptimizeMode): void;
  keepSearching(): void;
  stop(): void;
  /** Undoes the last run, as one undo step, while `outcome` is set and the run changed the project. */
  undo(): void;
}

function summary(result: OptimizeResult, cancelled: boolean, kind: RunKind, changed: boolean): string {
  const tried = `${cancelled ? "Stopped after" : "Tried"} ${result.iterations.toLocaleString()} plans.`;
  if (!changed) return `${tried} ${kind === "keep" ? "Keep searching found no better plan, so the plan did not change." : "The plan did not change."}`;
  const unplaced = result.unplaced.length;
  const sheets = result.sheets.length;
  return `${tried} The best uses ${sheets} ${sheets === 1 ? "sheet" : "sheets"}${
    unplaced > 0 ? ` and leaves ${unplaced} ${unplaced === 1 ? "part" : "parts"} unplaced` : ""
  }.`;
}

interface Landed {
  run: LastRun;
  kind: RunKind;
  from: Project;
  cancelled: boolean;
}

export function useOptimizeRuns(store: ProjectStore, factory: WorkerFactory): OptimizeRuns {
  const optimizer = useOptimizer(factory);
  const [last, setLast] = useState<LastRun | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastOutcome, setOutcome] = useState<RunOutcome | null>(null);
  const [landed, setLanded] = useState<Landed | null>(null);

  if (landed) {
    setLanded(null);
    const { run: done, kind, from, cancelled } = landed;
    if (store.project === done.applied) {
      const changed = done.applied !== from;
      const before = planStats(from);
      setLast(done);
      setOutcome({ kind, from, applied: done.applied, before, after: changed ? planStats(done.applied) : before, changed });
      setNotice(summary(done.result, cancelled, kind, changed));
    } else {
      setOutcome(null);
      setNotice("The project changed while the optimizer ran, so its plan was not used.");
    }
  }

  const run = useCallback(
    (request: OptimizeRequest, kind: RunKind) => {
      const from = store.project;
      setNotice(null);
      setOutcome(null);
      optimizer.start(request, (result, cancelled) => {
        const next = applyRun(request, result);
        const applied = samePlan(from, next) ? from : next;
        if (applied !== from) store.edit((present: Project) => (present === from ? applied : present));
        setLanded({ run: { request, result, applied }, kind, from, cancelled });
      });
    },
    [optimizer, store],
  );

  const current = last && last.applied === store.project ? last : null;
  const outcome = lastOutcome && lastOutcome.applied === store.project ? lastOutcome : null;
  return {
    running: optimizer.running,
    error: optimizer.error,
    notice,
    current,
    outcome,
    undone: lastOutcome !== null && lastOutcome.changed && lastOutcome.from === store.project,
    optimize: (mode) => run(optimizeRequest(store.project, mode), mode),
    keepSearching: () => current && run(keepSearchingRequest(current), "keep"),
    stop: optimizer.cancel,
    undo: () => {
      if (outcome?.changed && store.canUndo) store.undo();
    },
  };
}
