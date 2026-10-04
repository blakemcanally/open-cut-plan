import { createOptimizerHost, createProject, presetDesign, regenerateDesigns, type OptimizerResponse, type Project } from "@opencutplan/core";
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

/** The sample project with 90 × 12 sides, so the shortest cuts rip two strips along the sheet, then crosscut each strip. */
export function stripProject(): Project {
  const project = sampleProject();
  project.parts[0] = { ...project.parts[0]!, length: 90 };
  return project;
}

/**
 * A millimetre project: 18 mm and 6 mm plywood, an unlimited 2440 × 1220 sheet of the 18 mm, a table saw, and the design
 * "hall", a KALLAX 2x2 in the 18 mm with its parts. One sheet holds a side and a shelf.
 */
export function designProject(): Project {
  const base = createProject("Hall", "mm");
  return regenerateDesigns({
    ...base,
    materials: [
      { id: "ply18", name: "Plywood 18", thickness: 18, grained: true },
      { id: "ply6", name: "Plywood 6", thickness: 6, grained: true },
    ],
    stock: [{ id: "ply18-sheet", material: "ply18", length: 2440, width: 1220, quantity: null, cost: 50, kind: "sheet" }],
    tools: [{ id: "ts", name: "Table saw", type: "table-saw", kerf: 3, enabled: true }],
    designs: [presetDesign({ system: "kallax", id: "hall", name: "Hall", material: "ply18", cols: 2, rows: 2, units: "mm" })],
    plan: {
      sheets: [
        {
          id: "s1",
          stock: "ply18-sheet",
          placements: [
            { part: "hall-side", copy: 0, x: 0, y: 0, rotated: false },
            { part: "hall-shelf", copy: 0, x: 0, y: 400, rotated: false },
          ],
        },
      ],
    },
  });
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
