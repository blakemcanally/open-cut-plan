import { FORMAT_VERSION, type ProjectInput } from "../../packages/core/src/index.ts";

type PartInput = ProjectInput["parts"][number];
type PlacementInput = NonNullable<ProjectInput["plan"]>["sheets"][number]["placements"][number];

const FRAME = 18 / 25.4;
const MODULE = 13.25;
const DEPTH = 15.375;
const KERF = 0.125;
const TRIM = 0.25;

const SIZE = {
  top3: 3 * MODULE + 4 * FRAME,
  top4: 4 * MODULE + 5 * FRAME,
  tall: 2 * MODULE + FRAME,
  short: MODULE,
  backHeight: 2 * MODULE + 3 * FRAME,
};

function part(id: string, name: string, material: string, length: number, width: number, quantity: number, group: string): PartInput {
  return { id, name, material, length, width, quantity, grain: "length", group };
}

function threeByTwo(unit: "a" | "c"): PartInput[] {
  const label = unit.toUpperCase();
  const group = `3x2 ${label}`;
  return [
    part(`${unit}-top`, `${label} Top`, "bb18", SIZE.top3, DEPTH, 1, group),
    part(`${unit}-bottom`, `${label} Bottom`, "bb18", SIZE.top3, DEPTH, 1, group),
    part(`${unit}-side`, `${label} Side`, "bb18", SIZE.tall, DEPTH, 2, group),
    part(`${unit}-vdiv`, `${label} Divider`, "bb18", SIZE.tall, DEPTH, 2, group),
    part(`${unit}-shelf`, `${label} Shelf`, "bb18", SIZE.short, DEPTH, 3, group),
    part(`${unit}-back`, `${label} Back`, "bb6", SIZE.top3, SIZE.backHeight, 1, group),
  ];
}

const PARTS: PartInput[] = [
  ...threeByTwo("a"),
  ...threeByTwo("c"),
  part("b-top", "B Top", "bb18", SIZE.top4, DEPTH, 1, "4x2 B"),
  part("b-bottom", "B Bottom", "bb18", SIZE.top4, DEPTH, 1, "4x2 B"),
  part("b-side", "B Side", "bb18", SIZE.tall, DEPTH, 2, "4x2 B"),
  part("b-vdiv", "B Divider", "bb18", SIZE.tall, DEPTH, 2, "4x2 B"),
  part("b-long-shelf", "B Long shelf", "bb18", SIZE.tall, DEPTH, 1, "4x2 B"),
  part("b-short-vdiv", "B Short divider", "bb18", SIZE.short, DEPTH, 1, "4x2 B"),
  part("b-shelf", "B Shelf", "bb18", SIZE.short, DEPTH, 2, "4x2 B"),
  part("b-back", "B Back", "bb6", SIZE.top4, SIZE.backHeight, 1, "4x2 B"),
];

type Strip = [partId: string, copy: number][];

const SHEETS: { stock: string; strips: Strip[] }[] = [
  { stock: "bb18-5x5", strips: [[["b-top", 0]], [["b-bottom", 0]], [["a-top", 0], ["a-shelf", 0]]] },
  { stock: "bb18-5x5", strips: [[["a-bottom", 0], ["a-shelf", 1]], [["c-top", 0], ["c-shelf", 0]], [["c-bottom", 0], ["c-shelf", 1]]] },
  { stock: "bb18-5x5", strips: [[["a-side", 0], ["a-side", 1]], [["a-vdiv", 0], ["a-vdiv", 1]], [["c-side", 0], ["c-side", 1]]] },
  { stock: "bb18-5x5", strips: [[["c-vdiv", 0], ["c-vdiv", 1]], [["b-side", 0], ["b-side", 1]], [["b-vdiv", 0], ["b-vdiv", 1]]] },
  {
    stock: "bb18-5x5",
    strips: [
      [["b-long-shelf", 0], ["b-shelf", 0], ["b-shelf", 1]],
      [["a-shelf", 2], ["c-shelf", 2], ["b-short-vdiv", 0]],
    ],
  },
  { stock: "bb6-5x5", strips: [[["b-back", 0]], [["a-back", 0]]] },
  { stock: "bb6-5x5", strips: [[["c-back", 0]]] },
];

function layout(strips: Strip[]): PlacementInput[] {
  const byId = new Map(PARTS.map((p) => [p.id, p]));
  const placements: PlacementInput[] = [];
  let y = TRIM;
  for (const strip of strips) {
    let x = TRIM;
    let height = 0;
    for (const [partId, copy] of strip) {
      const p = byId.get(partId)!;
      placements.push({ part: partId, copy, x, y, rotated: false });
      x += p.length + KERF;
      height = Math.max(height, p.width);
    }
    y += height + KERF;
  }
  return placements;
}

export function livingRoomShelf(): ProjectInput {
  return {
    format: "opencutplan",
    version: FORMAT_VERSION,
    project: {
      name: "Living room shelf",
      units: "in",
      notes: "Two 3x2 cubby cabinets and one 4x2 cabinet with a wide top opening, in 5' x 5' baltic birch.",
    },
    materials: [
      { id: "bb18", name: "Baltic birch 18mm", thickness: FRAME, grained: true },
      { id: "bb6", name: "Baltic birch 6mm", thickness: 6 / 25.4, grained: true },
    ],
    stock: [
      { id: "bb18-5x5", material: "bb18", length: 60, width: 60, quantity: null, kind: "sheet" },
      { id: "bb6-5x5", material: "bb6", length: 60, width: 60, quantity: null, kind: "sheet" },
    ],
    parts: PARTS,
    tools: [{ id: "table-saw", name: "Table saw", type: "table-saw", kerf: KERF, enabled: true }],
    settings: { trim: TRIM },
    plan: { sheets: SHEETS.map((sheet, i) => ({ id: `s${i + 1}`, stock: sheet.stock, placements: layout(sheet.strips) })) },
  };
}
