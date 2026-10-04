import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { assemblySteps, boardLayout, columnSteps, combineCells, convertProjectUnits, regenerateDesigns, type Board, type BoardLayout, type CombinedCell, type Design } from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";

const project = regenerateDesigns(designProject([kallaxDesign(), eketDesign(), kallaxDesign({ id: "c", name: "Mixed", system: "custom", width: { openings: [335, 400, 335] }, height: { openings: [400, 300, 335] } })]));

describe("assemblySteps", () => {
  it("gives the KALLAX 2x4 steps in order", () => {
    const steps = assemblySteps(project, "kx")!;
    expect(steps.map((step) => step.title)).toEqual([
      "Drill the pocket holes",
      "Mark the shelf positions",
      "Mark the divider positions",
      "Cut spacers",
      "Assemble column 1 of 2",
      "Assemble column 2 of 2",
      "Fit the bottom and the top",
      "Check that it is square",
      "Anchor the unit",
    ]);
    expect(steps[0]!.body).toBe(
      'Drill 3 pocket holes in each end of the 2 sides and the 1 divider, on the inside face of each side and on one face of the divider, and in each end of the 6 shelves, on the underside, for 18 mm stock. Set the jig and the drill collar to the 3/4" mark.',
    );
    expect(steps[1]!.body).toBe("Mark the underside of each shelf on the sides and the dividers at 335 mm, 688 mm and 1041 mm from the bottom end.");
    expect(steps[2]!.body).toBe("Mark the left face of each divider on the top and the bottom at 353 mm from the left end.");
    expect(steps[3]!.body).toBe("Cut 2 spacers to 335 mm from an offcut. They hold each shelf on its mark while you drive the screws.");
    expect(steps[4]!.body).toBe(
      'Lay the left side on its outside face, with the marks up. Put the 3 shelves of this column (335 mm long) on their marks, with the pocket holes down, and screw them to the panel with 1 1/4" (32 mm) coarse-thread pocket screws. Then put the next divider on the other ends of the shelves, and screw it on.',
    );
    expect(steps[5]!.body).toMatch(/^Use the divider on the right of column 1 as the left panel\./);
    expect(steps[5]!.body).toMatch(/Then put the right side on the other ends of the shelves, and screw it on\.$/);
    expect(steps[6]!.body).toBe(
      "Lay the frame on its back. Put the bottom on the lower ends of the sides and the dividers, with each divider on its mark, and screw it on through the pocket holes in their ends. Then fit the top the same way.",
    );
    expect(steps[7]!.body).toContain("Both must be 1603 mm.");
  });

  it("says how many to build, fits the back, and hangs an EKET on the rail", () => {
    const steps = assemblySteps(project, "ek")!;
    expect(steps.map((step) => step.title)).toEqual(["Drill the pocket holes", "Mark the divider positions", "Fit the bottom and the top", "Check that it is square", "Fit the back", "Hang the unit"]);
    expect(steps[0]!.body).toMatch(
      /^Build 2 of these\. The numbers in these steps are for one unit\. Drill 3 pocket holes in each end of the 2 sides and the 1 divider, on the inside face of each side and on one face of the divider, for 18 mm stock\./,
    );
    expect(steps[1]!.body).toBe("Mark the left face of each divider on the top and the bottom at 341 mm from the left end.");
    expect(steps[2]!.body).toBe("Stand the sides and the dividers on the bottom, with each divider on its mark, and screw them to it through the pocket holes in their ends. Then fit the top the same way.");
    expect(steps[3]!.body).toContain("Both must be 782.5 mm.");
    expect(steps[4]!.body).toBe('Glue the back to the rear edges, then screw it on with 21 #6 × 3/4" (4 × 20 mm) flat head wood screws: 25 mm from the ends of each edge, and at most 150 mm apart.');
    expect(steps[5]!.body).toContain("(1 × EKET suspension rail, 70 cm)");
    expect(steps[5]!.body).toContain("AA-1912543-9");
    expect(steps[5]!.body).toContain("Leave at least 50 mm free above the unit.");
  });

  it("gives one spacer pair for each opening under a shelf, a mark for each divider, and one step for each column", () => {
    const steps = assemblySteps(project, "c")!;
    const body = (title: string) => steps.find((step) => step.title === title)!.body;
    expect(body("Mark the shelf positions")).toContain("at 335 mm and 653 mm from the bottom end");
    expect(body("Mark the divider positions")).toContain("at 353 mm and 771 mm from the left end");
    expect(body("Cut spacers")).toBe("Cut 2 spacers to 300 mm and 2 spacers to 335 mm from an offcut. They hold each shelf on its mark while you drive the screws.");
    expect(steps.filter((step) => step.title.startsWith("Assemble")).map((step) => step.body.match(/\((.+) long\)/)![1])).toEqual(["335 mm", "400 mm", "335 mm"]);
  });

  it("leaves out the dividers for 1 column and the shelves for 1 row", () => {
    const single = regenerateDesigns(
      designProject([
        kallaxDesign({ id: "one", width: { openings: [335] }, height: { openings: [335] } }),
        kallaxDesign({ id: "tall", width: { openings: [335] }, height: { openings: [335, 335] } }),
      ]),
    );
    const one = assemblySteps(single, "one")!;
    expect(one.map((step) => step.title)).toEqual(["Drill the pocket holes", "Fit the bottom and the top", "Check that it is square", "Anchor the unit"]);
    expect(one[0]!.body).toMatch(/^Drill 3 pocket holes in each end of the 2 sides, on the inside face of each side, for 18 mm stock\./);
    expect(one[1]!.body).toBe("Stand the sides on the bottom, and screw them to it through the pocket holes in their ends. Then fit the top the same way.");

    const tall = assemblySteps(single, "tall")!;
    expect(tall.map((step) => step.title)).toEqual([
      "Drill the pocket holes",
      "Mark the shelf positions",
      "Cut spacers",
      "Assemble column 1 of 1",
      "Fit the bottom and the top",
      "Check that it is square",
      "Anchor the unit",
    ]);
    expect(tall[0]!.body).toMatch(/^Drill 3 pocket holes in each end of the 2 sides, on the inside face of each side, and in each end of the shelf, on the underside, for 18 mm stock\./);
    expect(tall[1]!.body).toBe("Mark the underside of each shelf on the sides at 335 mm from the bottom end.");
    expect(tall[3]!.body).toBe(
      'Lay the left side on its outside face, with the marks up. Put the shelf of this column (335 mm long) on its mark, with the pocket holes down, and screw it to the panel with 1 1/4" (32 mm) coarse-thread pocket screws. Then put the right side on the other ends of the shelf, and screw it on.',
    );
    expect(tall[4]!.body).toMatch(/^Lay the frame on its back\. Put the bottom on the lower ends of the sides, and screw it on/);
  });

  it("fits the legs with their guides, then anchors the unit", () => {
    const legs = regenerateDesigns(designProject([eketDesign({ mount: "legs", quantity: 1, back: undefined })]));
    const steps = assemblySteps(legs, "ek")!;
    expect(steps.map((step) => step.title).slice(-2)).toEqual(["Fit the legs", "Anchor the unit"]);
    expect(steps.at(-2)!.body).toContain("AA-2425733-1 (EKET legs, black, 4-pack) and AA-2196566-3 (EKET legs, wood, 4-pack)");
    expect(steps[0]!.body).not.toContain("Build");
  });

  it("gives the lengths in the project units", () => {
    const steps = assemblySteps(convertProjectUnits(project, "in"), "ek")!;
    expect(steps[0]!.body).toContain('for 23/32" stock');
    expect(steps[1]!.body).toBe('Mark the left face of each divider on the top and the bottom at 13 7/16" from the left end.');
    expect(steps[3]!.body).toContain('Both must be 30 13/16".');
  });

  it("gives null for a missing design or a design with an error", () => {
    expect(assemblySteps(project, "nope")).toBeNull();
    expect(assemblySteps(designProject([kallaxDesign({ material: "missing" })]), "kx")).toBeNull();
  });
});

const span = (column: number, row: number, columns: number, rows: number): CombinedCell => ({ column, row, columns, rows });
const grid = (id: string, columns: number, rows: number, combined: CombinedCell[]): Design =>
  kallaxDesign({ id, width: { openings: Array.from({ length: columns }, () => 335) }, height: { openings: Array.from({ length: rows }, () => 335) }, combined });

describe("assemblySteps with combined cells", () => {
  const grids = regenerateDesigns(
    designProject([grid("a", 4, 2, [span(1, 1, 2, 1)]), grid("p", 3, 3, [span(1, 1, 2, 1), span(3, 1, 1, 2), span(2, 3, 2, 1), span(1, 2, 1, 2)])]),
  );

  it("counts the boards, marks each panel, and puts the long shelf and the divider under it in column 1 (spec 14.1)", () => {
    const steps = assemblySteps(grids, "a")!;
    const body = (title: string) => steps.find((step) => step.title === title)!.body;
    expect(steps.map((step) => step.title).slice(4, 8)).toEqual(["Assemble column 1 of 4", "Assemble column 2 of 4", "Assemble column 3 of 4", "Assemble column 4 of 4"]);
    expect(body("Drill the pocket holes")).toContain("each end of the 2 sides and the 3 dividers, on the inside face of each side and on one face of each divider, and in each end of the 3 shelves");
    expect(body("Mark the shelf positions")).toBe(
      "Mark the underside of each shelf, from the bottom end of the panel: on the sides, the divider on the right of column 2 and the divider on the right of column 3 at 335 mm.",
    );
    expect(body("Mark the divider positions")).toBe(
      "Mark the left face of each divider, from the left end: on the top at 706 mm and 1059 mm; on the bottom at 353 mm, 706 mm and 1059 mm; on the underside of the shelf under row 1 (Shelf, columns 1–2) at 335 mm.",
    );
    expect(body("Assemble column 1 of 4")).toBe(
      'Lay the left side on its outside face, with the marks up. Put the shelf under row 1 (Shelf, columns 1–2, 688 mm long) on its mark, with the pocket holes down, and screw it to the panel with 1 1/4" (32 mm) coarse-thread pocket screws. Then put the divider in row 2 on its mark. Screw the top end of the divider in row 2 to the shelf above it.',
    );
    expect(body("Assemble column 2 of 4")).toBe("Put the next divider on its mark, and screw the other end of the shelf that stops there to it.");
    expect(body("Fit the bottom and the top")).toContain("the sides and the dividers that reach it");
  });

  it("assembles the pinwheel of spec 14.4 in three column steps", () => {
    const steps = assemblySteps(grids, "p")!.filter((step) => step.title.startsWith("Assemble"));
    expect(steps.map((step) => step.title)).toEqual(["Assemble column 1 of 3", "Assemble column 2 of 3", "Assemble column 3 of 3"]);
    expect(steps[1]!.body).toMatch(/^Use the divider on the right of column 1, rows 2–3, as the left panel\. Put the shelf under row 2 \(Shelf, columns 2–3, 688 mm long\)/);
  });

  it("only screws a board to a board that the same step or an earlier step put in place, for random layouts", () => {
    const arb = fc
      .record({
        columns: fc.integer({ min: 1, max: 6 }),
        rows: fc.integer({ min: 1, max: 6 }),
        picks: fc.array(fc.record({ column: fc.nat(5), row: fc.nat(5), columns: fc.integer({ min: 1, max: 4 }), rows: fc.integer({ min: 1, max: 4 }) }), { maxLength: 8 }),
      })
      .map(({ columns, rows, picks }) => {
        let design = grid("r", columns, rows, []);
        for (const pick of picks) design = combineCells(design, { ...pick, column: (pick.column % columns) + 1, row: (pick.row % rows) + 1 }) ?? design;
        return { columns, rows, combined: design.combined ?? [] };
      });
    fc.assert(
      fc.property(arb, ({ columns, rows, combined }) => {
        const layout = boardLayout(columns, rows, combined);
        const placed = new Map<Board | string, number>([["left", -1], ["top", Infinity], ["bottom", Infinity]]);
        const steps = columnSteps(layout, columns);
        steps.forEach((step) => {
          for (const board of step.shelves) placed.set(board, step.column);
          for (const board of step.dividers) placed.set(board, step.column);
        });
        placed.set("right", columns - 1);
        for (const step of steps) {
          for (const board of step.shelves) {
            expect(placed.get(member(layout, board, "start", columns, rows))).toBeLessThan(step.column);
            expect(placed.get(member(layout, board, "end", columns, rows))).toBe(board.to);
          }
          for (const board of step.dividers) {
            for (const end of ["start", "end"] as const) {
              const at = placed.get(member(layout, board, end, columns, rows));
              expect(at === Infinity || at! <= step.column).toBe(true);
            }
          }
        }
      }),
      { numRuns: 300 },
    );
  });
});

/** The board or the box panel that the start (left or top) or the end (right or bottom) of a board butts into. */
function member(layout: BoardLayout, board: Board, end: "start" | "end", columns: number, rows: number): Board | string {
  if (board.kind === "shelf") {
    const line = end === "start" ? board.from : board.to + 1;
    if (line === 0) return "left";
    if (line === columns) return "right";
    const found = layout.dividers.find((other) => other.line === line && other.from <= board.line - 1 && other.to >= board.line);
    if (!found) throw new Error(`No divider holds the ${end} of the shelf ${JSON.stringify(board)}.`);
    return found;
  }
  const line = end === "start" ? board.from : board.to + 1;
  if (line === 0) return "top";
  if (line === rows) return "bottom";
  const found = layout.shelves.find((other) => other.line === line && other.from <= board.line - 1 && other.to >= board.line);
  if (!found) throw new Error(`No shelf holds the ${end} of the divider ${JSON.stringify(board)}.`);
  return found;
}
