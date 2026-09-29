import type { ProjectInput } from "../../packages/core/src/index.ts";

export function simpleBookcaseMm(): ProjectInput {
  return {
    format: "opencutplan",
    version: "1.0",
    project: { name: "Simple bookcase (metric)", units: "mm" },
    materials: [
      { id: "mdf18", name: "MDF 18mm", thickness: 18, grained: false },
      { id: "hdf3", name: "Hardboard 3mm", thickness: 3, grained: false },
    ],
    stock: [
      { id: "mdf18-2440x1220", material: "mdf18", length: 2440, width: 1220, quantity: null, cost: 42, kind: "sheet" },
      { id: "mdf18-offcut", material: "mdf18", length: 900, width: 400, quantity: 1, cost: 0, kind: "offcut", name: "Offcut from the desk project" },
      { id: "hdf3-2440x1220", material: "hdf3", length: 2440, width: 1220, quantity: null, cost: 15, kind: "sheet" },
    ],
    parts: [
      { id: "side", name: "Side", material: "mdf18", length: 1800, width: 300, quantity: 2, grain: "none", group: "Carcass" },
      { id: "top-bottom", name: "Top / bottom", material: "mdf18", length: 764, width: 300, quantity: 2, grain: "none", group: "Carcass" },
      { id: "shelf", name: "Shelf", material: "mdf18", length: 762, width: 280, quantity: 4, grain: "none", group: "Shelves" },
      { id: "back", name: "Back", material: "hdf3", length: 1800, width: 800, quantity: 1, grain: "none", group: "Carcass" },
    ],
    tools: [
      { id: "track-saw", name: "Track saw (2.8 m rail)", type: "track-saw", kerf: 2.2, enabled: true, maxCut: 2800 },
      { id: "table-saw", name: "Jobsite table saw", type: "table-saw", kerf: 3.2, enabled: true, maxRip: 610, maxPiece: { length: 1800, width: 800 } },
    ],
    settings: { trim: 6, currency: "EUR", display: { mm: 1 } },
  };
}
