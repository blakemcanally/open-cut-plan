import { FORMAT_VERSION, presetDesign, type ProjectInput } from "../../packages/core/src/index.ts";
import { withDesignParts } from "./designs.ts";

export function kallax4x2CombinedMm(): ProjectInput {
  return withDesignParts({
    format: "opencutplan",
    version: FORMAT_VERSION,
    project: { name: "KALLAX-style 4x2 with combined cells (metric)", units: "mm" },
    materials: [{ id: "ply18", name: "Birch plywood 18mm", thickness: 18, grained: true }],
    stock: [{ id: "ply18-2440x1220", material: "ply18", length: 2440, width: 1220, quantity: null, cost: 80, kind: "sheet" }],
    parts: [],
    designs: [
      {
        ...presetDesign({ system: "kallax", id: "kx", name: "Media KALLAX", material: "ply18", cols: 4, rows: 2, units: "mm" }),
        combined: [{ column: 1, row: 1, columns: 2, rows: 1 }],
      },
    ],
    tools: [{ id: "track-saw", name: "Track saw (2.8 m rail)", type: "track-saw", kerf: 2.2, enabled: true, maxCut: 2800 }],
    settings: { trim: 0, display: { mm: 1 } },
  });
}
