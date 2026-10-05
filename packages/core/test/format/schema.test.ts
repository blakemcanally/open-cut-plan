import { describe, expect, it } from "vitest";
import { createProject, DEFAULT_TRIM, FEATURE_KEYS, parseProject, ProjectSchema, serializeProject, type Design } from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign, sampleProject } from "../helpers.ts";

describe("createProject", () => {
  it("fills every default", () => {
    const project = createProject("Shelf", "in");
    expect(project.format).toBe("opencutplan");
    expect(project.version).toBe("1.9");
    expect(project.project).toEqual({ name: "Shelf", units: "in" });
    expect(project.settings).toEqual({
      features: Object.fromEntries(FEATURE_KEYS.map((key) => [key, true])),
      orderMode: "sheet",
      trim: 0,
      display: { inch: 32, mm: 0.5 },
      optimizer: { timeLimitMs: 2000, goal: "cost", extraCostPercent: 10, keepGroupsTogether: true },
      currency: "USD",
    });
  });

  it("uses the factory edges in new projects", () => {
    expect(createProject("Case", "mm").settings.trim).toBe(0);
    expect(DEFAULT_TRIM).toEqual({ in: 0.25, mm: 6 });
  });

  it("lists the nine feature switches", () => {
    expect(FEATURE_KEYS).toEqual(["grain", "kerf", "trim", "cutOrder", "toolLimits", "offcuts", "cost", "labels", "snapping"]);
  });
});

describe("ProjectSchema", () => {
  it("accepts the sample project unchanged", () => {
    const project = sampleProject();
    expect(ProjectSchema.parse(project)).toEqual(project);
  });

  it("applies defaults for a file without settings", () => {
    const { settings: _settings, ...withoutSettings } = sampleProject();
    const parsed = ProjectSchema.parse(withoutSettings);
    expect(parsed.settings.features.grain).toBe(true);
    expect(parsed.settings.trim).toBe(0);
  });

  it("keeps unknown fields", () => {
    const project = sampleProject();
    const input = { ...project, parts: [{ ...project.parts[0]!, edgeBanding: { top: "birch" } }] };
    expect(ProjectSchema.parse(input).parts[0]).toHaveProperty("edgeBanding", { top: "birch" });
  });

  it("allows unlimited stock", () => {
    expect(ProjectSchema.parse(sampleProject()).stock[0]!.quantity).toBeNull();
  });

  it("reports the path of an invalid length", () => {
    const project = sampleProject();
    const result = ProjectSchema.safeParse({ ...project, parts: [{ ...project.parts[0]!, length: 0 }] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["parts", 0, "length"]);
  });

  it("rejects an unknown tool type", () => {
    const project = sampleProject();
    const result = ProjectSchema.safeParse({ ...project, tools: [{ id: "x", name: "Laser", type: "laser", kerf: 0, enabled: true }] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path.slice(0, 2)).toEqual(["tools", 0]);
  });

  it("rejects an inch precision that is not a supported denominator", () => {
    const project = sampleProject();
    const result = ProjectSchema.safeParse({ ...project, settings: { ...project.settings, display: { inch: 10, mm: 1 } } });
    expect(result.success).toBe(false);
  });
});

describe("designs", () => {
  it("loads a design and a generated part, and round-trips them", () => {
    const project = designProject([kallaxDesign(), eketDesign()]);
    project.parts = [
      { id: "kx-vertical", name: "Vertical panel", material: "ply18", length: 1430, width: 390, quantity: 3, grain: "length", group: "Hall KALLAX", design: "kx" },
    ];
    const result = parseProject(serializeProject(project));
    expect(result.ok && result.warnings).toEqual([]);
    expect(result.ok && result.project).toEqual(project);
  });

  it("round-trips the combined cells of a design", () => {
    const project = designProject([kallaxDesign({ combined: [{ column: 1, row: 1, columns: 2, rows: 1 }] })]);
    const result = parseProject(serializeProject(project));
    expect(result.ok && result.warnings).toEqual([]);
    expect(result.ok && result.project.designs![0]!.combined).toEqual([{ column: 1, row: 1, columns: 2, rows: 1 }]);
  });

  it.each([
    ["an empty openings list", { width: { openings: [] } }],
    ["a zero opening", { width: { openings: [335, 0] } }],
    ["51 cells", { width: { outside: 5000, cells: 51 } }],
    ["0 cells", { width: { outside: 700, cells: 0 } }],
    ["a quantity of 101", { quantity: 101 }],
    ["a quantity of 0", { quantity: 0 }],
    ["an axis with neither form", { height: { size: 700 } }],
    ["a zero depth", { depth: 0 }],
    ["a combined cell with 0 columns", { combined: [{ column: 1, row: 1, columns: 0, rows: 1 }] }],
    ["a combined cell at column 1.5", { combined: [{ column: 1.5, row: 1, columns: 2, rows: 1 }] }],
    ["a combined cell with no rows", { combined: [{ column: 1, row: 1, columns: 2 }] }],
  ])("refuses %s", (_name, patch) => {
    const project = designProject([{ ...kallaxDesign(), ...patch } as Design]);
    expect(parseProject(JSON.parse(serializeProject(project))).ok).toBe(false);
  });
});

describe("chosen colours", () => {
  it("loads the colours of the build copies and of the groups, and round-trips them", () => {
    const project = designProject([kallaxDesign({ quantity: 3, colors: ["#ff8800", "", "#00AA11"] })]);
    project.groups = { Doors: { color: "#123abc" }, Drawers: {} };
    const result = parseProject(serializeProject(project));
    expect(result.ok && result.warnings).toEqual([]);
    expect(result.ok && result.project).toEqual(project);
  });

  it("loads a file without the colour fields unchanged", () => {
    const project = sampleProject();
    const result = parseProject(serializeProject(project));
    expect(result.ok && result.project).toEqual(project);
    expect(result.ok && "groups" in result.project).toBe(false);
  });

  it.each([["red"], ["#fff"], ["#12345g"], ["#1234567"]])("refuses the colour %j", (color) => {
    expect(parseProject(JSON.parse(serializeProject(designProject([kallaxDesign({ colors: [color] })])))).ok).toBe(false);
    const project = sampleProject();
    expect(parseProject(JSON.parse(serializeProject({ ...project, groups: { A: { color } } }))).ok).toBe(false);
  });
});
