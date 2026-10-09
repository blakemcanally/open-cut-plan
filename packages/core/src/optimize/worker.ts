import { errorMessage } from "../errors.ts";
import type { Project } from "../format/schema.ts";
import { createCutSearch, type OptimizeCutsOptions, type OptimizeCutsResult } from "./cuts.ts";
import { createSearch, type OptimizeOptions, type OptimizeResult } from "./search.ts";

export type OptimizerRequest =
  | { type: "start"; id: number; project: Project; options?: Omit<OptimizeOptions, "now">; progressMs?: number }
  | { type: "start-cuts"; id: number; project: Project; options?: Omit<OptimizeCutsOptions, "now">; progressMs?: number }
  | { type: "cancel"; id: number };

export type OptimizerResponse =
  | { type: "progress"; id: number; result: OptimizeResult }
  | { type: "done"; id: number; result: OptimizeResult; cancelled: boolean }
  | { type: "cuts-progress"; id: number; result: OptimizeCutsResult }
  | { type: "cuts-done"; id: number; result: OptimizeCutsResult; cancelled: boolean }
  | { type: "error"; id: number; message: string };

export type Schedule = (run: () => void) => void;

const DEFAULT_PROGRESS_MS = 100;

interface Job {
  id: number;
  cancelled: boolean;
  step(budgetMs: number): boolean;
  progress(): OptimizerResponse;
  done(cancelled: boolean): OptimizerResponse;
}

function createJob(request: Exclude<OptimizerRequest, { type: "cancel" }>): Job {
  const { id } = request;
  if (request.type === "start") {
    const search = createSearch(request.project, request.options ?? {});
    return {
      id,
      cancelled: false,
      step: (budgetMs) => search.step(budgetMs),
      progress: () => ({ type: "progress", id, result: search.result() }),
      done: (cancelled) => ({ type: "done", id, result: search.result(), cancelled }),
    };
  }
  const search = createCutSearch(request.project, request.options ?? {});
  return {
    id,
    cancelled: false,
    step: (budgetMs) => search.step(budgetMs),
    progress: () => ({ type: "cuts-progress", id, result: search.result() }),
    done: (cancelled) => ({ type: "cuts-done", id, result: search.result(), cancelled }),
  };
}

/**
 * The message handler for an optimizer worker. The search runs in slices of `progressMs` with a progress message
 * after each slice, and yields between slices so a `cancel` can arrive. A new start cancels the running job. `start`
 * runs Optimize layout and `start-cuts` runs Optimize cuts.
 * In a Web Worker: `self.onmessage = (e) => handle(e.data)` with `handle = createOptimizerHost((m) => self.postMessage(m))`.
 */
export function createOptimizerHost(
  post: (response: OptimizerResponse) => void,
  schedule: Schedule = (run) => void setTimeout(run, 0),
): (request: OptimizerRequest) => void {
  let job: Job | null = null;

  const stop = () => {
    if (!job) return;
    job.cancelled = true;
    post(job.done(true));
    job = null;
  };

  return (request) => {
    if (request.type === "cancel") {
      if (job?.id === request.id) stop();
      return;
    }
    stop();
    let current: Job;
    try {
      current = createJob(request);
    } catch (e) {
      post({ type: "error", id: request.id, message: errorMessage(e) });
      return;
    }
    job = current;
    const slice = request.progressMs ?? DEFAULT_PROGRESS_MS;
    const tick = () => {
      if (current.cancelled) return;
      try {
        const finished = current.step(slice);
        if (finished) {
          job = null;
          post(current.done(false));
        } else {
          post(current.progress());
          schedule(tick);
        }
      } catch (e) {
        job = null;
        post({ type: "error", id: current.id, message: errorMessage(e) });
      }
    };
    schedule(tick);
  };
}
