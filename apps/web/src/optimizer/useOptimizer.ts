import type { OptimizeRequest, OptimizeResult, OptimizerRequest, OptimizerResponse } from "@opencutplan/core";
import { useCallback, useEffect, useRef, useState } from "react";

export interface WorkerLike {
  postMessage(message: OptimizerRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<OptimizerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

export type WorkerFactory = () => WorkerLike;

export const createOptimizerWorker: WorkerFactory = () =>
  new Worker(new URL("./optimizer.worker.ts", import.meta.url), { type: "module" });

export interface RunningState {
  startedAt: number;
  timeLimitMs: number;
  best: OptimizeResult | null;
}

export interface Optimizer {
  running: RunningState | null;
  error: string | null;
  start(request: OptimizeRequest, onDone: (result: OptimizeResult, cancelled: boolean) => void): void;
  /** Stops the search; `onDone` still runs with the best result so far. */
  cancel(): void;
  clearError(): void;
}

export function useOptimizer(factory: WorkerFactory): Optimizer {
  const [running, setRunning] = useState<RunningState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const worker = useRef<WorkerLike | null>(null);
  const job = useRef(0);
  const onDone = useRef<((result: OptimizeResult, cancelled: boolean) => void) | null>(null);

  useEffect(
    () => () => {
      worker.current?.terminate();
      worker.current = null;
    },
    [],
  );

  const ensureWorker = useCallback((): WorkerLike => {
    if (worker.current) return worker.current;
    const created = factory();
    created.onmessage = (event) => {
      const message = event.data;
      if (message.id !== job.current) return;
      if (message.type === "progress") {
        setRunning((state) => state && { ...state, best: message.result });
      } else if (message.type === "done") {
        setRunning(null);
        onDone.current?.(message.result, message.cancelled);
      } else {
        setRunning(null);
        setError(message.message);
      }
    };
    created.onerror = (event) => {
      event.preventDefault();
      created.terminate();
      worker.current = null;
      setRunning(null);
      setError(event.message || "The optimizer stopped because of an error.");
    };
    worker.current = created;
    return created;
  }, [factory]);

  const start = useCallback(
    (request: OptimizeRequest, done: (result: OptimizeResult, cancelled: boolean) => void) => {
      const id = ++job.current;
      onDone.current = done;
      setError(null);
      setRunning({ startedAt: Date.now(), timeLimitMs: request.input.settings.optimizer.timeLimitMs, best: null });
      const options = request.start ? { start: request.start } : {};
      try {
        ensureWorker().postMessage({ type: "start", id, project: request.input, options });
      } catch (e) {
        setRunning(null);
        setError((e as Error).message);
      }
    },
    [ensureWorker],
  );

  const cancel = useCallback(() => worker.current?.postMessage({ type: "cancel", id: job.current }), []);
  const clearError = useCallback(() => setError(null), []);
  return { running, error, start, cancel, clearError };
}
