import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  applyOptimizeResult,
  checkDesigns,
  designParts,
  designGeometry,
  materialsById,
  optimize,
  regenerateDesigns,
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
    expect(ids(regenerateDesigns(designProject([kallaxDesign(), eketDesign()])))).toEqual(["kx-vertical", "kx-horizontal", "ek-vertical", "ek-horizontal", "ek-back"]);
  });

  it("keeps the other parts, and puts the design's parts where they were", () => {
    const side: Part = { id: "side", name: "Side", material: "ply18", length: 900, width: 300, quantity: 2, grain: "length" };
    const top: Part = { id: "top", name: "Top", material: "ply18", length: 800, width: 300, quantity: 1, grain: "length" };
    const once = regenerateDesigns({ ...designProject(), parts: [side] });
    expect(ids(once)).toEqual(["side", "kx-vertical", "kx-horizontal"]);
    const moved = { ...once, parts: [once.parts[1]!, once.parts[2]!, side, top] };
    expect(ids(regenerateDesigns(withDesign(moved, { width: { openings: [335, 335, 335] } })))).toEqual(["kx-vertical", "kx-horizontal", "side", "top"]);
  });

  it("returns the same object when the parts are current", () => {
    const once = regenerateDesigns(designProject([kallaxDesign(), eketDesign()]));
    expect(regenerateDesigns(once)).toBe(once);
    const plain = designProject([]);
    expect(regenerateDesigns(plain)).toBe(plain);
  });

  it("keeps a copy on its sheet when its part keeps the same id and size", () => {
    const once = placed(regenerateDesigns(designProject()), [
      { part: "kx-vertical", copy: 2 },
      { part: "kx-horizontal", copy: 9 },
    ]);
    const wider = regenerateDesigns(withDesign(once, { width: { openings: [335, 335, 335] } }));
    expect(wider.parts.map((p) => [p.id, p.quantity])).toEqual([
      ["kx-vertical", 4],
      ["kx-horizontal", 15],
    ]);
    expect(onSheet(wider)).toEqual(["kx-vertical#2", "kx-horizontal#9"]);
  });

  it("drops the copies of a part whose size changes, and the copies above the new quantity", () => {
    const once = placed(regenerateDesigns(designProject()), [
      { part: "kx-vertical", copy: 0 },
      { part: "kx-horizontal", copy: 1 },
      { part: "kx-horizontal", copy: 9 },
    ]);
    const shorter = regenerateDesigns(withDesign(once, { height: { openings: [335, 335, 335] } }));
    expect(shorter.parts[0]!.length).toBe(1077);
    expect(onSheet(shorter)).toEqual(["kx-horizontal#1"]);

    const edited = { ...once, parts: once.parts.map((p) => (p.id === "kx-vertical" ? { ...p, length: 1400 } : p)) };
    const restored = regenerateDesigns(edited);
    expect(restored.parts[0]!.length).toBe(1430);
    expect(onSheet(restored)).toEqual(["kx-horizontal#1", "kx-horizontal#9"]);
  });

  it("drops the copies of a part that the design no longer makes", () => {
    const once = placed(regenerateDesigns(designProject([eketDesign()])), [
      { part: "ek-back", copy: 0 },
      { part: "ek-vertical", copy: 0 },
    ]);
    const open = regenerateDesigns({ ...once, designs: [{ ...eketDesign(), back: undefined }] });
    expect(ids(open)).toEqual(["ek-vertical", "ek-horizontal"]);
    expect(onSheet(open)).toEqual([]);
  });

  it("leaves the stored parts of a file from a newer minor version alone", () => {
    const once = regenerateDesigns(designProject());
    const nested = { ...once.parts[1]!, id: "kx-cell-1-1-horizontal", name: "Nested shelf" };
    const newer = { ...once, version: "1.3", parts: [...once.parts, nested] };
    expect(regenerateDesigns(newer)).toBe(newer);
    expect(designParts(newer, newer.designs![0]!)).toBeNull();
  });

  it("leaves the stored parts alone when the design has an error or an unknown system", () => {
    const once = regenerateDesigns(designProject());
    const missing = withDesign(once, { material: "gone", width: { openings: [500] } });
    expect(regenerateDesigns(missing)).toBe(missing);
    const unknown = withDesign(once, { system: "pax", width: { openings: [500] } });
    expect(regenerateDesigns(unknown)).toBe(unknown);
    const manual: Part = { id: "kx-vertical", name: "Side", material: "ply18", length: 900, width: 300, quantity: 2, grain: "length" };
    const conflict = designProject();
    conflict.parts = [manual];
    expect(regenerateDesigns(conflict).parts).toEqual([manual]);
  });

  it("replaces a stored generated part that has an extra field", () => {
    const once = regenerateDesigns(designProject());
    const noted = { ...once, parts: once.parts.map((p, i) => (i === 0 ? { ...p, notes: "Sand the edges" } : p)) };
    expect(regenerateDesigns(noted).parts[0]).toEqual(once.parts[0]);
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
        const vertical = once.parts.find((p) => p.id === "d-vertical")!;
        expect(vertical.length).toBeCloseTo(geometry.rows.reduce((a, b) => a + b, 0) + (geometry.rows.length + 1) * geometry.thickness, 6);
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
