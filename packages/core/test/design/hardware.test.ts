import { describe, expect, it } from "vitest";
import { backScrewCount, designGeometry, hardwareList, materialsById, pocketHoleEnds, pocketHolesPerEnd, pocketScrew, railsFor, regenerateDesigns, type Design, type HardwareLine } from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";

const counts = (lines: HardwareLine[]) => lines.map((line) => [line.item, line.quantity, line.design]);
const geometryOf = (design: Design) => designGeometry(design, materialsById(designProject()))!;

describe("pocketScrew", () => {
  it("follows the Kreg chart at the nearest 1/8 inch setting", () => {
    const rows = [17.4, 17.5, 20.6, 20.7, 25.4, 30, 30.2, 36.4, 36.6, 38.1].map((mm) => {
      const screw = pocketScrew(mm)!;
      return [mm, screw.setting, screw.screw];
    });
    expect(rows).toEqual([
      [17.4, 0.625, '1" (25 mm)'],
      [17.5, 0.75, '1 1/4" (32 mm)'],
      [20.6, 0.75, '1 1/4" (32 mm)'],
      [20.7, 0.875, '1 1/2" (38 mm)'],
      [25.4, 1, '1 1/2" (38 mm)'],
      [30, 1.125, '1 1/2" (38 mm)'],
      [30.2, 1.25, '2" (50 mm)'],
      [36.4, 1.375, '2" (50 mm)'],
      [36.6, 1.5, '2 1/2" (64 mm)'],
      [38.1, 1.5, '2 1/2" (64 mm)'],
    ]);
  });

  it("has no screw outside 15/32 to 1 1/2 inch", () => {
    expect(pocketScrew(11.8)).toBeNull();
    expect(pocketScrew(11.90625)).toMatchObject({ setting: 0.5, screw: '1" (25 mm)' });
    expect(pocketScrew(38.2)).toBeNull();
  });
});

describe("pocketHolesPerEnd and railsFor", () => {
  it("puts a hole 50 mm from each edge and at most 150 mm between holes", () => {
    expect([100, 250, 344, 390, 400, 401].map(pocketHolesPerEnd)).toEqual([2, 2, 3, 3, 3, 4]);
  });

  it("uses 70 cm rails, then one 35 cm rail", () => {
    expect([300, 350, 700, 1050, 1400, 1750].map(railsFor)).toEqual([
      { long: 0, short: 1 },
      { long: 0, short: 1 },
      { long: 1, short: 0 },
      { long: 1, short: 1 },
      { long: 2, short: 0 },
      { long: 2, short: 1 },
    ]);
  });
});

describe("hardwareList", () => {
  it("lists the pocket screws, the anti-tip fitting, and the glue for a KALLAX on the floor", () => {
    const lines = hardwareList(regenerateDesigns(designProject([kallaxDesign()])));
    expect(counts(lines)).toEqual([
      ["pocket-screws", 60, "kx"],
      ["anti-tip", 1, "kx"],
      ["wall-fixings", null, "kx"],
      ["glue", null, null],
    ]);
    expect(lines[0]!.name).toBe('Pocket screws, coarse thread, 1 1/4" (32 mm)');
  });

  it("lists the back screws and the rails for two EKET units on the wall", () => {
    const lines = hardwareList(regenerateDesigns(designProject([eketDesign()])));
    expect(counts(lines)).toEqual([
      ["pocket-screws", 40, "ek"],
      ["back-screws", 42, "ek"],
      ["eket-rail-70", 2, "ek"],
      ["wall-fixings", null, "ek"],
      ["glue", null, null],
    ]);
    expect(lines[1]!.name).toBe('#6 × 3/4" (4 × 20 mm) flat head wood screws');
    expect(lines[2]).toMatchObject({ name: "EKET suspension rail, 70 cm", article: "80340048" });
  });

  it("offers the three leg finishes, and anchors a unit on legs", () => {
    const lines = hardwareList(regenerateDesigns(designProject([eketDesign({ mount: "legs" })])));
    expect(counts(lines)).toEqual([
      ["pocket-screws", 40, "ek"],
      ["back-screws", 42, "ek"],
      ["eket-legs", 2, "ek"],
      ["anti-tip", 2, "ek"],
      ["wall-fixings", null, "ek"],
      ["glue", null, null],
    ]);
    expect(lines[2]!.choices!.map((choice) => choice.article)).toEqual(["70574660", "80474151", "70428904"]);
  });

  it("counts the ends of the sides, the dividers, and the shelves of the box", () => {
    const pocket = (design: Design) => hardwareList(regenerateDesigns(designProject([design])))[0]!.quantity;
    expect(pocket(kallaxDesign({ height: { openings: [335, 335, 335] } }))).toBe(47);
    expect(pocket(kallaxDesign({ width: { openings: [335] }, height: { openings: [335] } }))).toBe(14);
    expect(pocketHoleEnds(geometryOf(kallaxDesign({ height: { openings: [335, 335, 335] } })))).toBe(14);
    expect(pocketHoleEnds(geometryOf(kallaxDesign({ width: { openings: [335] }, height: { openings: [335] } })))).toBe(4);
  });

  it("puts the back screws along the perimeter, the dividers between the top and the bottom, and the shelves", () => {
    expect(backScrewCount(geometryOf(kallaxDesign({ back: { material: "ply6" } })), "mm")).toBe(62);
    expect(backScrewCount(geometryOf(kallaxDesign({ back: { material: "ply6" }, width: { openings: [335] }, height: { openings: [335] } })), "mm")).toBe(16);
  });

  it("leaves out a design with an error and gives no glue line without designs", () => {
    expect(hardwareList(designProject([kallaxDesign({ material: "missing" })]))).toEqual([]);
    expect(hardwareList(designProject([]))).toEqual([]);
  });
});
