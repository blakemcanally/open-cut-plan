import type { Project } from "../format/schema.ts";
import { createSearch, type OptimizeOptions, type OptimizeResult } from "./search.ts";

export type OptimizerRequest =
  | { type: "start"; id: number; project: Project; options?: Omit<OptimizeOptions, "now">; progressMs?: number }
  | { type: "cancel"; id: number };

export type OptimizerResponse =
  | { type: "progress"; id: number; result: OptimizeResult }
  | { type: "done"; id: number; result: OptimizeResult; cancelled: boolean }
  | { type: "error"; id: number; message: string };

export type Schedule = (run: () => void) => void;

const DEFAULT_PROGRESS_MS = 100;

/**
 * The message handler for an optimizer worker. The search runs in slices of `progressMs` with a `progress` message
 * after each slice, and yields between slices so a `cancel` can arrive. A new `start` cancels the running job.
 * In a Web Worker: `self.onmessage = (e) => handle(e.data)` with `handle = createOptimizerHost((m) => self.postMessage(m))`.
 */
export function createOptimizerHost(
  post: (response: OptimizerResponse) => void,
  schedule: Schedule = (run) => void setTimeout(run, 0),
): (request: OptimizerRequest) => void {
  let job: { id: number; cancelled: boolean; search: ReturnType<typeof createSearch> } | null = null;

  const stop = () => {
    if (!job) return;
    job.cancelled = true;
    post({ type: "done", id: job.id, result: job.search.result(), cancelled: true });
    job = null;
  };

  return (request) => {
    if (request.type === "cancel") {
      if (job?.id === request.id) stop();
      return;
    }
    stop();
    let search: ReturnType<typeof createSearch>;
    try {
      search = createSearch(request.project, request.options ?? {});
    } catch (e) {
      post({ type: "error", id: request.id, message: (e as Error).message });
      return;
    }
    const current = { id: request.id, cancelled: false, search };
    job = current;
    const slice = request.progressMs ?? DEFAULT_PROGRESS_MS;
    const tick = () => {
      if (current.cancelled) return;
      try {
        const finished = current.search.step(slice);
        if (finished) {
          job = null;
          post({ type: "done", id: current.id, result: current.search.result(), cancelled: false });
        } else {
          post({ type: "progress", id: current.id, result: current.search.result() });
          schedule(tick);
        }
      } catch (e) {
        job = null;
        post({ type: "error", id: current.id, message: (e as Error).message });
      }
    };
    schedule(tick);
  };
}
