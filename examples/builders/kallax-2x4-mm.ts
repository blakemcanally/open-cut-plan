import { FORMAT_VERSION, presetDesign, type ProjectInput } from "../../packages/core/src/index.ts";
import { withDesignParts } from "./designs.ts";

export function kallax2x4Mm(): ProjectInput {
  return withDesignParts({
    format: "opencutplan",
    version: FORMAT_VERSION,
    project: { name: "KALLAX-style 2x4 (metric)", units: "mm" },
    materials: [{ id: "ply18", name: "Birch plywood 18mm", thickness: 18, grained: true }],
    stock: [{ id: "ply18-2440x1220", material: "ply18", length: 2440, width: 1220, quantity: null, cost: 80, kind: "sheet" }],
    parts: [],
    designs: [presetDesign({ system: "kallax", id: "kallax", name: "Hall KALLAX", material: "ply18", cols: 2, rows: 4, units: "mm" })],
    tools: [{ id: "track-saw", name: "Track saw (2.8 m rail)", type: "track-saw", kerf: 2.2, enabled: true, maxCut: 2800 }],
    settings: { trim: 0, display: { mm: 1 } },
  });
}
