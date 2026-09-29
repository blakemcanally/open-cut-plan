import { createProject, type CsvImport, type Design, type Project } from "../src/index.ts";

export function sampleProject(): Project {
  const base = createProject("Test", "in");
  return {
    ...base,
    settings: { ...base.settings, trim: 0.25 },
    materials: [{ id: "ply", name: "Plywood 3/4", thickness: 0.75, grained: true }],
    stock: [{ id: "ply-4x8", material: "ply", length: 96, width: 48, quantity: null, cost: 60, kind: "sheet" }],
    parts: [{ id: "side", name: "Side", material: "ply", length: 30, width: 12, quantity: 2, grain: "length" }],
    tools: [{ id: "ts", name: "Table saw", type: "table-saw", kerf: 0.125, enabled: true, maxRip: 30 }],
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

/** An inch project: plywood (grained), an unlimited 96 × 48 sheet, two 30 × 12 sides and a 20 × 10 shelf, a table saw, and one sheet that holds both sides. */
export function editSampleProject(): Project {
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

export function expectOk<R, F extends string>(result: CsvImport<R, F>) {
  if (result.status !== "ok") throw new Error(`expected status ok, got needs-mapping (missing: ${result.missing.join(", ")})`);
  return result;
}

/** KALLAX 2×4 in 18 mm plywood, no back: 3 vertical panels 1430 × 390 and 10 shelves 335 × 390. */
export function kallaxDesign(patch: Partial<Design> = {}): Design {
  return {
    id: "kx",
    name: "Hall KALLAX",
    system: "kallax",
    material: "ply18",
    width: { openings: [335, 335] },
    height: { openings: [335, 335, 335, 335] },
    depth: 390,
    ...patch,
  };
}

/** EKET 2×1, 700 × 350 × 350 outside, 6 mm back, 2 units on the wall rail. */
export function eketDesign(patch: Partial<Design> = {}): Design {
  return {
    id: "ek",
    name: "Wall EKET",
    system: "eket",
    material: "ply18",
    quantity: 2,
    width: { outside: 700, cells: 2 },
    height: { outside: 350, cells: 1 },
    depth: 350,
    back: { material: "ply6" },
    mount: "wall-rail",
    ...patch,
  };
}

/** A mm project with 18 mm and 6 mm plywood, unlimited 2440 × 1220 sheets, a 2.8 m track saw, and no parts. */
export function designProject(designs: Design[] = [kallaxDesign()]): Project {
  const base = createProject("Designs", "mm");
  return {
    ...base,
    materials: [
      { id: "ply18", name: "Birch ply 18", thickness: 18, grained: true },
      { id: "ply6", name: "Birch ply 6", thickness: 6, grained: true },
    ],
    stock: [
      { id: "ply18-sheet", material: "ply18", length: 2440, width: 1220, quantity: null, cost: 80, kind: "sheet" },
      { id: "ply6-sheet", material: "ply6", length: 2440, width: 1220, quantity: null, cost: 40, kind: "sheet" },
    ],
    parts: [],
    tools: [{ id: "track", name: "Track saw", type: "track-saw", kerf: 2.2, enabled: true, maxCut: 2800 }],
    designs,
  };
}
