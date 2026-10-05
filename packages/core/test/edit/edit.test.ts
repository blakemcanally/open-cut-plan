import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addPart,
  addSheet,
  addStock,
  addPresetTool,
  addTool,
  analyzeProject,
  convertProjectUnits,
  createProject,
  defaultTools,
  newTool,
  presetTool,
  TOOL_PRESETS,
  ToolSchema,
  findCopy,
  findFreeSpot,
  materialInUse,
  moveTool,
  moveToTray,
  nudgeCopy,
  placeCopy,
  planContext,
  pushSheetToFactoryEdges,
  removeEmptySheets,
  removeMaterial,
  removePart,
  removeSheet,
  removeStock,
  rotateCopy,
  setPinned,
  unplacedCopies,
  updatePart,
  updateMaterial,
  updateStock,
  validatePlan,
  type Project,
} from "../../src/index.ts";
import { editSampleProject as sampleProject } from "../helpers.ts";

describe("part edits", () => {
  it("adds a part, and a material when the project has none", () => {
    const { project, id } = addPart(createProject("New", "mm"));
    expect(project.materials).toEqual([{ id: "plywood", name: "Plywood", thickness: 18, grained: true }]);
    expect(project.parts).toEqual([{ id, name: "Part 1", material: "plywood", length: 600, width: 300, quantity: 1, grain: "length" }]);
  });

  it("gives each new part a new id", () => {
    const first = addPart(sampleProject());
    const second = addPart(first.project);
    expect(first.id).not.toBe(second.id);
  });

  it("removes placements of copies past a lower quantity", () => {
    const project = updatePart(sampleProject(), "side", { quantity: 1 });
    expect(project.plan!.sheets[0]!.placements.map((p) => p.copy)).toEqual([0]);
    expect(validatePlan(project).filter((i) => i.code === "bad-copy")).toEqual([]);
  });

  it("clears an optional field with undefined", () => {
    const project = updatePart(sampleProject(), "shelf", { group: undefined });
    expect(project.parts[1]).not.toHaveProperty("group");
  });

  it("removes a part with its placements", () => {
    const project = removePart(sampleProject(), "side");
    expect(project.parts.map((p) => p.id)).toEqual(["shelf"]);
    expect(project.plan!.sheets[0]!.placements).toEqual([]);
  });
});

describe("stock and material edits", () => {
  it("keeps a material that parts or stock use", () => {
    const project = sampleProject();
    expect(materialInUse(project, "ply")).toBe(true);
    expect(removeMaterial(project, "ply")).toBe(project);
  });

  it("adds an unlimited sheet of the first material", () => {
    const project = addStock(sampleProject());
    expect(project.stock[1]).toMatchObject({ material: "ply", length: 96, width: 48, quantity: null, kind: "sheet" });
  });

  it("removes stock and the sheets cut from it", () => {
    const project = removeStock(sampleProject(), "ply-4x8");
    expect(project.stock).toEqual([]);
    expect(project.plan!.sheets).toEqual([]);
  });

  it("sets a quantity to unlimited and back", () => {
    const limited = updateStock(sampleProject(), "ply-4x8", { quantity: 3 });
    expect(limited.stock[0]!.quantity).toBe(3);
    expect(updateStock(limited, "ply-4x8", { quantity: null }).stock[0]!.quantity).toBeNull();
  });
});

describe("updateMaterial and measured", () => {
  const withMeasured = (): Project => {
    const project = sampleProject();
    return { ...project, materials: project.materials.map((m) => ({ ...m, measured: true })) };
  };

  it("clears measured when the thickness changes, and keeps it for the same thickness or another field", () => {
    const id = withMeasured().materials[0]!.id;
    expect(updateMaterial(withMeasured(), id, { thickness: 0.5 }).materials[0]).not.toHaveProperty("measured");
    expect(updateMaterial(withMeasured(), id, { thickness: withMeasured().materials[0]!.thickness }).materials[0]!.measured).toBe(true);
    expect(updateMaterial(withMeasured(), id, { name: "Shop ply" }).materials[0]!.measured).toBe(true);
  });

  it("keeps measured when the patch sets it with the thickness", () => {
    const id = withMeasured().materials[0]!.id;
    expect(updateMaterial(withMeasured(), id, { thickness: 45 / 64, measured: true }).materials[0]).toMatchObject({ thickness: 45 / 64, measured: true });
  });

  it("keeps measured through a change of units and back", () => {
    const there = convertProjectUnits(withMeasured(), "mm");
    expect(there.materials[0]!.measured).toBe(true);
    expect(convertProjectUnits(there, "in").materials[0]!.measured).toBe(true);
  });
});

describe("tool edits", () => {
  it("gives a new project a table saw and a track saw with the default limits", () => {
    expect(defaultTools("in")).toEqual([
      { id: "table-saw", name: "Table saw", type: "table-saw", kerf: 0.125, enabled: true, maxPiece: { length: 96, width: 24 }, maxCrosscutPiece: { length: 48, width: 24 }, maxRip: 24, maxCrosscut: 24 },
      { id: "track-saw", name: "Track saw", type: "track-saw", kerf: 0.125, enabled: true, maxCut: 110 },
    ]);
    expect(defaultTools("mm")).toEqual([
      { id: "table-saw", name: "Table saw", type: "table-saw", kerf: 3, enabled: true, maxPiece: { length: 2440, width: 610 }, maxCrosscutPiece: { length: 1220, width: 610 }, maxRip: 610, maxCrosscut: 610 },
      { id: "track-saw", name: "Track saw", type: "track-saw", kerf: 3, enabled: true, maxCut: 2800 },
    ]);
    expect(newTool("circular-saw", "in", new Set())).toEqual({ id: "circular-saw", name: "Circular saw", type: "circular-saw", kerf: 0.125, enabled: true });
    expect(newTool("miter-saw", "mm", new Set())).toEqual({ id: "mitre-saw", name: "Mitre saw", type: "miter-saw", kerf: 3, enabled: true, maxCut: 350 });
  });

  it("makes a tool from a preset of typical values, in the units of the project", () => {
    expect(TOOL_PRESETS.map((preset) => preset.id)).toEqual(["jobsite-table-saw", "cabinet-saw-sled", "track-saw-55", "track-saw-118", "sliding-miter-saw"]);
    const taken = new Set(["mitre-saw"]);
    expect(presetTool("sliding-miter-saw", "in", taken)).toEqual({ id: "mitre-saw-2", name: '12" sliding mitre saw', type: "miter-saw", kerf: 0.125, enabled: true, maxCut: 14 });
    expect(presetTool("track-saw-55", "mm", new Set())).toMatchObject({ name: "Track saw, 1400 mm rail", type: "track-saw", maxCut: 1250 });
    expect(presetTool("jobsite-table-saw", "in", new Set())).toMatchObject({ type: "table-saw", maxRip: 24, maxCrosscut: 12, maxPiece: { length: 96, width: 24 }, maxCrosscutPiece: { length: 36, width: 12 } });
    expect(addPresetTool(sampleProject(), "track-saw-118").tools.map((tool) => [tool.id, tool.name])).toEqual([
      ["ts", "Table saw"],
      ["track-saw", 'Track saw, 118" rail'],
    ]);
    for (const preset of TOOL_PRESETS) {
      for (const units of ["in", "mm"] as const) expect(ToolSchema.safeParse(presetTool(preset.id, units, new Set())).success).toBe(true);
    }
  });

  it("adds tools with the unit's default kerf and reorders them", () => {
    let project = addTool(sampleProject(), "track-saw");
    expect(project.tools[1]).toEqual({ id: "track-saw", name: "Track saw", type: "track-saw", kerf: 0.125, enabled: true, maxCut: 110 });
    project = moveTool(project, "track-saw", -1);
    expect(project.tools.map((t) => t.id)).toEqual(["track-saw", "ts"]);
    expect(moveTool(project, "track-saw", -1)).toBe(project);
  });
});

describe("layout edits", () => {
  const side0 = { part: "side", copy: 0 };
  const shelf = { part: "shelf", copy: 0 };

  it("lists unplaced copies in part order", () => {
    expect(unplacedCopies(sampleProject())).toEqual([shelf]);
    expect(unplacedCopies(moveToTray(sampleProject(), side0))).toEqual([side0, shelf]);
  });

  it("places a tray copy on a sheet and moves it between sheets", () => {
    const { project: withSheet, id } = addSheet(sampleProject(), "ply-4x8");
    expect(id).toBe("s2");
    let project = placeCopy(withSheet, shelf, "s1", 30.5, 0.25, false);
    expect(findCopy(project, shelf)).toMatchObject({ sheetIndex: 0, placement: { x: 30.5, y: 0.25, rotated: false } });
    project = placeCopy(project, shelf, "s2", 0.25, 0.25, true);
    expect(findCopy(project, shelf)).toMatchObject({ sheetIndex: 1, placement: { rotated: true } });
    expect(project.plan!.sheets[0]!.placements).toHaveLength(2);
  });

  it("rotates and nudges a placed copy", () => {
    let project = rotateCopy(sampleProject(), side0);
    expect(findCopy(project, side0)!.placement.rotated).toBe(true);
    project = nudgeCopy(project, side0, 1, -0.25);
    expect(findCopy(project, side0)!.placement).toMatchObject({ x: 1.25, y: 0 });
  });

  it("leaves the project alone when the copy is not placed", () => {
    const project = sampleProject();
    expect(rotateCopy(project, shelf)).toBe(project);
    expect(moveToTray(project, shelf)).toBe(project);
  });

  it("removes sheets, empty sheets, and pins", () => {
    const { project: withSheet } = addSheet(sampleProject(), "ply-4x8");
    expect(removeEmptySheets(withSheet).plan!.sheets.map((s) => s.id)).toEqual(["s1"]);
    expect(unplacedCopies(removeSheet(withSheet, "s1"))).toHaveLength(3);
    const pinned = setPinned(withSheet, "s1", true);
    expect(pinned.plan!.sheets[0]!.pinned).toBe(true);
    expect(setPinned(pinned, "s1", false).plan!.sheets[0]).not.toHaveProperty("pinned");
  });

  it("pushes the pieces of a sheet against the factory edges, and keeps the project when no copy gains", () => {
    const project = sampleProject();
    project.settings.trim = 0;
    project.parts[0] = { ...project.parts[0]!, factoryEdge: "long" };
    project.plan!.sheets[0]!.placements = [
      { part: "side", copy: 0, x: 0, y: 5, rotated: false },
      { part: "side", copy: 1, x: 0, y: 17.125, rotated: false },
    ];
    const pushed = pushSheetToFactoryEdges(project, "s1");
    expect(pushed.plan!.sheets[0]!.placements.map(({ x, y }) => [x, y])).toEqual([
      [0, 0],
      [0, 36],
    ]);
    expect(validatePlan(pushed).filter((issue) => issue.severity === "error" || issue.code === "factory-edge")).toEqual([]);
    expect(pushSheetToFactoryEdges(pushed, "s1")).toBe(pushed);
    expect(pushSheetToFactoryEdges(project, "none")).toBe(project);
  });

  it("finds a free spot one kerf from the other parts", () => {
    const project = sampleProject();
    const ctx = planContext(project);
    const sheet = project.plan!.sheets[0]!;
    const spot = findFreeSpot(ctx, sheet, { length: 20, width: 10 });
    expect(spot).toEqual({ x: 0.25, y: 24.5 });
    const placed = placeCopy(project, shelf, "s1", spot!.x, spot!.y, false);
    expect(analyzeProject(placed).issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(findFreeSpot(ctx, sheet, { length: 100, width: 10 })).toBeNull();
  });
});

describe("convertProjectUnits", () => {
  it("converts every length and keeps costs", () => {
    const mm = convertProjectUnits(sampleProject(), "mm");
    expect(mm.project.units).toBe("mm");
    expect(mm.parts[0]).toMatchObject({ length: 762, width: 304.8 });
    expect(mm.stock[0]).toMatchObject({ length: 2438.4, width: 1219.2, cost: 60 });
    expect(mm.materials[0]!.thickness).toBeCloseTo(19.05);
    expect(mm.tools[0]!.kerf).toBeCloseTo(3.175);
    expect(mm.settings.trim).toBeCloseTo(6.35);
    expect(mm.plan!.sheets[0]!.placements[1]).toMatchObject({ x: 6.35 });
    const back = convertProjectUnits(mm, "in");
    expect(back.parts[0]).toMatchObject({ length: 30, width: 12 });
    expect(back.tools[0]!.kerf).toBe(0.125);
  });

  it("converts the length of the factory edge rule", () => {
    const project = sampleProject();
    project.settings.factoryEdge = { minLength: 36 };
    expect(convertProjectUnits(project, "mm").settings.factoryEdge).toEqual({ minLength: 914.4 });
    expect(convertProjectUnits(sampleProject(), "mm").settings.factoryEdge).toBeUndefined();
  });

  it("converts tool limits", () => {
    const project = {
      ...sampleProject(),
      tools: [{ id: "ts", name: "TS", type: "table-saw" as const, kerf: 0.125, enabled: true, maxRip: 30, maxPiece: { length: 48, width: 24 }, maxCrosscutPiece: { length: 36, width: 12 } }],
    };
    const tool = convertProjectUnits(project, "mm").tools[0]!;
    expect(tool).toMatchObject({ maxRip: 762, maxPiece: { length: 1219.2, width: 609.6 }, maxCrosscutPiece: { length: 914.4, width: 304.8 } });
  });

  it("keeps a part that touches the far trim line on the sheet, there and back", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 30 }), fc.integer({ min: 100, max: 2380 }), fc.integer({ min: 50, max: 1160 }), (trim, length, width) => {
        const base = createProject("Flush", "mm");
        const project: Project = {
          ...base,
          settings: { ...base.settings, trim },
          materials: [{ id: "ply", name: "Plywood", thickness: 18, grained: false }],
          stock: [{ id: "sheet", material: "ply", length: 2440, width: 1220, quantity: null, kind: "sheet" }],
          parts: [{ id: "p", name: "Part", material: "ply", length, width, quantity: 1, grain: "none" }],
          plan: { sheets: [{ id: "s1", stock: "sheet", placements: [{ part: "p", copy: 0, x: 2440 - trim - length, y: 1220 - trim - width, rotated: false }] }] },
        };
        const offSheet = (p: Project) => validatePlan(p).filter((issue) => issue.code === "off-sheet");
        expect(offSheet(project)).toEqual([]);
        const inches = convertProjectUnits(project, "in");
        expect(offSheet(inches)).toEqual([]);
        expect(offSheet(convertProjectUnits(inches, "mm"))).toEqual([]);
      }),
      { numRuns: 2000, seed: 1 },
    );
  });
});
