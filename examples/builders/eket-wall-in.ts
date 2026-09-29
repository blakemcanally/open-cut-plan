import { FORMAT_VERSION, presetDesign, type ProjectInput } from "../../packages/core/src/index.ts";
import { withDesignParts } from "./designs.ts";

export function eketWallIn(): ProjectInput {
  return withDesignParts({
    format: "opencutplan",
    version: FORMAT_VERSION,
    project: { name: "EKET-style wall cabinets (inches)", units: "in" },
    materials: [
      { id: "ply-23-32", name: 'Plywood 3/4" (23/32 actual)', thickness: 0.71875, grained: true },
      { id: "ply-7-32", name: 'Plywood 1/4" (7/32 actual)', thickness: 0.21875, grained: true },
    ],
    stock: [
      { id: "ply-23-32-4x8", material: "ply-23-32", length: 96, width: 48, quantity: null, cost: 65, kind: "sheet" },
      { id: "ply-7-32-4x8", material: "ply-7-32", length: 96, width: 48, quantity: null, cost: 35, kind: "sheet" },
    ],
    parts: [],
    designs: [
      {
        ...presetDesign({ system: "eket", id: "eket", name: "Wall EKET", material: "ply-23-32", cols: 2, rows: 1, units: "in" }),
        quantity: 2,
        back: { material: "ply-7-32" },
        mount: "wall-rail",
      },
    ],
    tools: [{ id: "track-saw", name: 'Track saw (110" of rail)', type: "track-saw", kerf: 0.09375, enabled: true, maxCut: 110 }],
    settings: { trim: 0 },
  });
}
