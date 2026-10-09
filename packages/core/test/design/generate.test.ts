import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  applyOptimizeResult,
  checkDesigns,
  convertProjectUnits,
  designParts,
  designGeometry,
  materialsById,
  optimize,
  regenerateDesigns,
  snapLength,
  validatePlan,
  type Design,
  type Part,
  type Project,
} from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";

const ids = (project: Project) => project.parts.map((part) => part.id);

function placed(project: Project, placements: { part: string; copy: number }[]): Project {
  return { ...project, plan: { sheets: [{ id: "s1", stock: "ply18-sheet", placements: placements.map((p) => ({ ...p, x: 0, y: 0, rotated: false })) }] } };
}

const onSheet = (project: Project) => project.plan!.sheets[0]!.placements.map((p) => `${p.part}#${p.copy}`);

function withDesign(project: Project, patch: Partial<Design>): Project {
  return { ...project, designs: project.designs!.map((design) => ({ ...design, ...patch })) };
}

describe("regenerateDesigns", () => {
  it("adds the parts of a design that has none", () => {
    expect(ids(regenerateDesigns(designProject([kallaxDesign(), eketDesign()])))).toEqual(["kx-top", "kx-bottom", "kx-side", "kx-divider", "kx-shelf", "ek-top", "ek-bottom", "ek-side", "ek-divider", "ek-back"]);
  });

  it("keeps the other parts, and puts the design's parts where they were", () => {
    const side: Part = { id: "side", name: "Side", material: "ply18", length: 900, width: 300, quantity: 2, grain: "length" };
    const top: Part = { id: "top", name: "Top", material: "ply18", length: 800, width: 300, quantity: 1, grain: "length" };
    const once = regenerateDesigns({ ...designProject(), parts: [side] });
    expect(ids(once)).toEqual(["side", "kx-top", "kx-bottom", "kx-side", "kx-divider", "kx-shelf"]);
    const moved = { ...once, parts: [...once.parts.slice(1), side, top] };
    expect(ids(regenerateDesigns(withDesign(moved, { width: { openings: [335, 335, 335] } })))).toEqual(["kx-top", "kx-bottom", "kx-side", "kx-divider", "kx-shelf", "side", "top"]);
  });

  it("returns the same object when the parts are current", () => {
    const once = regenerateDesigns(designProject([kallaxDesign(), eketDesign()]));
    expect(regenerateDesigns(once)).toBe(once);
    const plain = designProject([]);
    expect(regenerateDesigns(plain)).toBe(plain);
  });

  it("keeps a copy on its sheet when its part keeps the same id and size", () => {
    const once = placed(regenerateDesigns(designProject()), [
      { part: "kx-top", copy: 0 },
      { part: "kx-side", copy: 1 },
      { part: "kx-divider", copy: 0 },
      { part: "kx-shelf", copy: 5 },
    ]);
    const wider = regenerateDesigns(withDesign(once, { width: { openings: [335, 335, 335] } }));
    expect(wider.parts.map((p) => [p.id, p.length, p.quantity])).toEqual([
      ["kx-top", 1077, 1],
      ["kx-bottom", 1077, 1],
      ["kx-side", 1394, 2],
      ["kx-divider", 1394, 2],
      ["kx-shelf", 335, 9],
    ]);
    expect(onSheet(wider)).toEqual(["kx-side#1", "kx-divider#0", "kx-shelf#5"]);
  });

  it("drops the copies of a part whose size changes, and the copies above the new quantity", () => {
    const once = placed(regenerateDesigns(designProject()), [
      { part: "kx-side", copy: 0 },
      { part: "kx-shelf", copy: 1 },
      { part: "kx-shelf", copy: 5 },
    ]);
    const shorter = regenerateDesigns(withDesign(once, { height: { openings: [335, 335, 335] } }));
    expect(shorter.parts.find((p) => p.id === "kx-side")!.length).toBe(1041);
    expect(onSheet(shorter)).toEqual(["kx-shelf#1"]);

    const edited = { ...once, parts: once.parts.map((p) => (p.id === "kx-side" ? { ...p, length: 1400 } : p)) };
    const restored = regenerateDesigns(edited);
    expect(restored.parts.find((p) => p.id === "kx-side")!.length).toBe(1394);
    expect(onSheet(restored)).toEqual(["kx-shelf#1", "kx-shelf#5"]);
  });

  it("drops the copies of a part that the design no longer makes", () => {
    const once = placed(regenerateDesigns(designProject([eketDesign()])), [
      { part: "ek-back", copy: 0 },
      { part: "ek-side", copy: 0 },
    ]);
    const open = regenerateDesigns({ ...once, designs: [{ ...eketDesign(), back: undefined }] });
    expect(ids(open)).toEqual(["ek-top", "ek-bottom", "ek-side", "ek-divider"]);
    expect(onSheet(open)).toEqual([]);
  });

  it("replaces the parts of a file from the ladder construction, and takes their copies off the sheets", () => {
    const ladder: Part[] = [
      { id: "kx-vertical", name: "Vertical panel", material: "ply18", length: 1430, width: 390, quantity: 3, grain: "length", group: "Hall KALLAX", design: "kx" },
      { id: "kx-horizontal", name: "Shelf", material: "ply18", length: 335, width: 390, quantity: 10, grain: "length", group: "Hall KALLAX", design: "kx" },
    ];
    const old = placed({ ...designProject(), parts: ladder }, [
      { part: "kx-vertical", copy: 0 },
      { part: "kx-horizontal", copy: 9 },
    ]);
    expect(checkDesigns(old).map((issue) => issue.code)).toEqual(["design-stale"]);
    const next = regenerateDesigns(old);
    expect(ids(next)).toEqual(["kx-top", "kx-bottom", "kx-side", "kx-divider", "kx-shelf"]);
    expect(onSheet(next)).toEqual([]);
    expect(checkDesigns(next)).toEqual([]);
  });

  it("leaves the stored parts of a file from a newer minor version alone", () => {
    const once = regenerateDesigns(designProject());
    const nested = { ...once.parts[1]!, id: "kx-cell-1-1-horizontal", name: "Nested shelf" };
    const newer = { ...once, version: "1.11", parts: [...once.parts, nested] };
    expect(regenerateDesigns(newer)).toBe(newer);
    expect(designParts(newer, newer.designs![0]!)).toBeNull();
  });

  it("leaves the stored parts alone when the design has an error or an unknown system", () => {
    const once = regenerateDesigns(designProject());
    const missing = withDesign(once, { material: "gone", width: { openings: [500] } });
    expect(regenerateDesigns(missing)).toBe(missing);
    const unknown = withDesign(once, { system: "pax", width: { openings: [500] } });
    expect(regenerateDesigns(unknown)).toBe(unknown);
    const manual: Part = { id: "kx-side", name: "Side", material: "ply18", length: 900, width: 300, quantity: 2, grain: "length" };
    const conflict = designProject();
    conflict.parts = [manual];
    expect(regenerateDesigns(conflict).parts).toEqual([manual]);
  });

  it("replaces a stored generated part that has an extra field", () => {
    const once = regenerateDesigns(designProject());
    const noted = { ...once, parts: once.parts.map((p, i) => (i === 0 ? { ...p, notes: "Sand the edges" } : p)) };
    expect(regenerateDesigns(noted).parts[0]).toEqual(once.parts[0]);
  });

  it("gives generated parts a length and a width on the grid", () => {
    const project = regenerateDesigns(convertProjectUnits(regenerateDesigns(designProject([kallaxDesign()])), "in"));
    for (const part of project.parts) {
      expect(snapLength(part.length, "in"), part.id).toBe(part.length);
      expect(snapLength(part.width, "in"), part.id).toBe(part.width);
    }
  });
});

const axis = fc.oneof(
  fc.array(fc.integer({ min: 100, max: 800 }), { minLength: 1, maxLength: 4 }).map((openings) => ({ openings })),
  fc.integer({ min: 1, max: 4 }).chain((cells) => fc.integer({ min: cells * 100 + (cells + 1) * 25, max: 2000 }).map((outside) => ({ outside, cells }))),
);

const randomDesign = fc.record({
  system: fc.constantFrom("kallax", "eket", "custom"),
  width: axis,
  height: axis,
  depth: fc.integer({ min: 200, max: 600 }),
  back: fc.boolean(),
  quantity: fc.integer({ min: 1, max: 3 }),
  thickness: fc.constantFrom(12.7, 15, 18, 19.05, 25),
});

type RandomInput = typeof randomDesign extends fc.Arbitrary<infer T> ? T : never;

function randomProject(input: RandomInput): Project {
  const { thickness, back, ...rest } = input;
  const design: Design = { id: "d", name: "Random", material: "ply18", ...rest, ...(back ? { back: { material: "ply6" } } : {}) };
  const project = designProject([design]);
  project.materials = project.materials.map((m) => (m.id === "ply18" ? { ...m, thickness } : m));
  return project;
}

describe("regenerateDesigns on random grids", () => {
  it("leaves no design stale and no design error", () => {
    fc.assert(
      fc.property(randomDesign, (input) => {
        const issues = checkDesigns(regenerateDesigns(randomProject(input)));
        expect(issues.filter((issue) => issue.code === "design-stale" || issue.severity === "error")).toEqual([]);
      }),
    );
  });

  it("gives the same result when it runs twice, and the panels add up to the outside size", () => {
    fc.assert(
      fc.property(randomDesign, (input) => {
        const once = regenerateDesigns(randomProject(input));
        expect(regenerateDesigns(once)).toBe(once);
        const geometry = designGeometry(once.designs![0]!, materialsById(once))!;
        const side = once.parts.find((p) => p.id === "d-side")!;
        const top = once.parts.find((p) => p.id === "d-top")!;
        expect(side.length + 2 * geometry.thickness).toBeCloseTo(geometry.rows.reduce((a, b) => a + b, 0) + (geometry.rows.length + 1) * geometry.thickness, 6);
        expect(top.length).toBeCloseTo(geometry.outsideWidth, 6);
        expect(geometry.columns.reduce((a, b) => a + b, 0) + (geometry.columns.length + 1) * geometry.thickness).toBeCloseTo(geometry.outsideWidth, 6);
      }),
    );
  });

  it("gives a plan with no errors after optimize", () => {
    fc.assert(
      fc.property(randomDesign, (input) => {
        const project = regenerateDesigns(randomProject(input));
        const planned = applyOptimizeResult(project, optimize(project, { iterations: 3 }));
        expect(validatePlan(planned).filter((issue) => issue.severity === "error")).toEqual([]);
      }),
      { numRuns: 15 },
    );
  });
});
