import {
  applyRun,
  keepSearchingRequest,
  optimizeRequest,
  type LastRun,
  type OptimizeMode,
  type OptimizeRequest,
  type OptimizeResult,
  type Project,
} from "@opencutplan/core";
import { useCallback, useState } from "react";
import type { ProjectStore } from "../state/useProject.ts";
import { useOptimizer, type RunningState, type WorkerFactory } from "./useOptimizer.ts";

export interface OptimizeRuns {
  running: RunningState | null;
  error: string | null;
  /** The outcome of the last run, for a status line. */
  notice: string | null;
  /** The last run while the project is still the one it produced. */
  current: LastRun | null;
  optimize(mode: OptimizeMode): void;
  keepSearching(): void;
  stop(): void;
}

function summary(result: OptimizeResult, cancelled: boolean): string {
  const unplaced = result.unplaced.length;
  const sheets = result.sheets.length;
  return `${cancelled ? "Stopped after" : "Tried"} ${result.iterations.toLocaleString()} plans. The best uses ${sheets} ${sheets === 1 ? "sheet" : "sheets"}${
    unplaced > 0 ? ` and leaves ${unplaced} ${unplaced === 1 ? "part" : "parts"} unplaced` : ""
  }.`;
}

export function useOptimizeRuns(store: ProjectStore, factory: WorkerFactory): OptimizeRuns {
  const optimizer = useOptimizer(factory);
  const [last, setLast] = useState<LastRun | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [landed, setLanded] = useState<{ run: LastRun; cancelled: boolean } | null>(null);

  if (landed) {
    setLanded(null);
    if (store.project === landed.run.applied) {
      setLast(landed.run);
      setNotice(summary(landed.run.result, landed.cancelled));
    } else {
      setNotice("The project changed while the optimizer ran, so its plan was not used.");
    }
  }

  const run = useCallback(
    (request: OptimizeRequest) => {
      const from = store.project;
      setNotice(null);
      optimizer.start(request, (result, cancelled) => {
        const applied = applyRun(request, result);
        store.edit((present: Project) => (present === from ? applied : present));
        setLanded({ run: { request, result, applied }, cancelled });
      });
    },
    [optimizer, store],
  );

  const current = last && last.applied === store.project ? last : null;
  return {
    running: optimizer.running,
    error: optimizer.error,
    notice,
    current,
    optimize: (mode) => run(optimizeRequest(store.project, mode)),
    keepSearching: () => current && run(keepSearchingRequest(current)),
    stop: optimizer.cancel,
  };
}
