import { createOptimizerHost, createProject, type OptimizerResponse, type Project } from "@opencutplan/core";
import type { WorkerFactory, WorkerLike } from "../src/optimizer/useOptimizer.ts";

/** An inch project: plywood (grained), an unlimited 96 × 48 sheet, two 30 × 12 sides and a 20 × 10 shelf, a table saw, and one sheet that holds both sides. */
export function sampleProject(): Project {
  const base = createProject("Test", "in");
  return {
    ...base,
    settings: { ...base.settings, trim: 0.25 },
    materials: [{ id: "ply", name: "Plywood", thickness: 0.75, grained: true }],
    stock: [{ id: "ply-4x8", material: "ply", length: 96, width: 48, quantity: null, cost: 60, kind: "sheet" }],
    parts: [
      { id: "side", name: "Side", material: "ply", length: 30, width: 12, quantity: 2, grain: "length" },
      { id: "shelf", name: "Shelf", material: "ply", length: 20, width: 10, quantity: 1, grain: "none", group: "A" },
    ],
    tools: [{ id: "ts", name: "Table saw", type: "table-saw", kerf: 0.125, enabled: true }],
    plan: {
      sheets: [
        {
          id: "s1",
          stock: "ply-4x8",
          placements: [
            { part: "side", copy: 0, x: 0.25, y: 0.25, rotated: false },
            { part: "side", copy: 1, x: 0.25, y: 12.375, rotated: false },
          ],
        },
      ],
    },
  };
}

/** Runs the real optimizer host in this thread, so tests see the same messages a Web Worker sends. */
export function inProcessWorkers(): { factory: WorkerFactory; created: WorkerLike[] } {
  const created: WorkerLike[] = [];
  const factory: WorkerFactory = () => {
    const worker: WorkerLike = {
      onmessage: null,
      onerror: null,
      postMessage: (message) => handle(message),
      terminate: () => undefined,
    };
    const handle = createOptimizerHost(
      (response: OptimizerResponse) => setTimeout(() => worker.onmessage?.({ data: response } as MessageEvent<OptimizerResponse>), 0),
      (run) => void setTimeout(run, 0),
    );
    created.push(worker);
    return worker;
  };
  return { factory, created };
}
