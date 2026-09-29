import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import { checkLayout, createProject, parseProject, planContext, type Placement, type Project, type ProjectInput } from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

function check(project: Project) {
  return checkLayout(planContext(project));
}

function withPlacements(placements: Placement[], patch: (p: Project) => void = () => {}): Project {
  const project = sampleProject();
  project.plan!.sheets[0]!.placements = placements;
  patch(project);
  return project;
}

function load(input: ProjectInput): Project {
  const result = parseProject(input);
  if (!result.ok) throw new Error(result.errors.map((issue) => issue.message).join("\n"));
  return result.project;
}

const at = (x: number, y: number, copy = 0, rotated = false): Placement => ({ part: "side", copy, x, y, rotated });

describe("checkLayout", () => {
  it("accepts the sample project", () => {
    expect(check(sampleProject())).toEqual([]);
  });

  it("accepts both examples' layouts", () => {
    expect(check(load(EXAMPLES["living-room-shelf"]!()))).toEqual([]);
    const bookcase = check(load(EXAMPLES["simple-bookcase-mm"]!()));
    expect(bookcase.map((issue) => issue.code)).toEqual(["unplaced", "unplaced", "unplaced", "unplaced"]);
  });

  it("reports a part in the trim zone, and allows it when trim is off", () => {
    const project = withPlacements([at(0.1, 0.25), at(0.25, 12.375, 1)]);
    expect(check(project)).toEqual([
      {
        severity: "error",
        code: "off-sheet",
        message: 'Side 1 extends past the sheet or into the 1/4" edge trim.',
        refs: [{ kind: "placement", sheet: "s1", index: 0 }],
      },
    ]);
    project.settings.features.trim = false;
    expect(check(project)).toEqual([]);
  });

  it("reports a part past the sheet edge", () => {
    const project = withPlacements([at(70, 0.25), at(0.25, 12.375, 1)], (p) => (p.settings.trim = 0));
    expect(check(project)[0]).toMatchObject({ code: "off-sheet", message: "Side 1 extends past the sheet." });
  });

  it("reports overlapping parts and parts closer than the kerf", () => {
    expect(check(withPlacements([at(0.25, 0.25), at(10, 5, 1)]))).toEqual([
      {
        severity: "error",
        code: "overlap",
        message: "Side 1 and Side 2 overlap.",
        refs: [
          { kind: "placement", sheet: "s1", index: 0 },
          { kind: "placement", sheet: "s1", index: 1 },
        ],
      },
    ]);
    expect(check(withPlacements([at(0.25, 0.25), at(0.25, 12.3, 1)]))[0]).toMatchObject({
      code: "overlap",
      message: 'Side 1 and Side 2 are closer than the 1/8" kerf.',
    });
  });

  it("lets parts touch when the kerf feature is off", () => {
    const project = withPlacements([at(0.25, 0.25), at(0.25, 12.25, 1)]);
    expect(check(project).map((issue) => issue.code)).toEqual(["overlap"]);
    project.settings.features.kerf = false;
    expect(check(project)).toEqual([]);
  });

  it("accepts metric parts exactly one kerf apart when positions are sums", () => {
    const project = createProject("Metric", "mm");
    project.materials = [{ id: "mdf", name: "MDF", thickness: 18, grained: false }];
    project.stock = [{ id: "sheet", material: "mdf", length: 2440, width: 1220, quantity: null, kind: "sheet" }];
    project.parts = [{ id: "shelf", name: "Shelf", material: "mdf", length: 762.3, width: 280.1, quantity: 3, grain: "none" }];
    project.tools = [{ id: "ts", name: "Table saw", type: "table-saw", kerf: 2.2, enabled: true }];
    let y = 6;
    const placements: Placement[] = [];
    for (let copy = 0; copy < 3; copy++) {
      placements.push({ part: "shelf", copy, x: 6, y, rotated: false });
      y += 280.1 + 2.2;
    }
    project.plan = { sheets: [{ id: "s1", stock: "sheet", placements }] };
    expect(check(project)).toEqual([]);
  });

  it("reports the wrong material", () => {
    const project = withPlacements([at(0.25, 0.25), at(0.25, 12.375, 1)], (p) => {
      p.materials.push({ id: "mdf", name: "MDF 1/2", thickness: 0.5, grained: false });
      p.stock[0]!.material = "mdf";
    });
    expect(check(project).map((issue) => issue.message)).toEqual([
      "Side 1 is Plywood 3/4, but Sheet 1 is MDF 1/2.",
      "Side 2 is Plywood 3/4, but Sheet 1 is MDF 1/2.",
    ]);
  });

  it("reports grain across the sheet only when grain matters", () => {
    const project = withPlacements([at(0.25, 0.25, 0, true), at(12.5, 0.25, 1, true)]);
    expect(check(project).map((issue) => issue.message)).toEqual([
      "Side 1 is turned so its grain runs across the sheet's grain.",
      "Side 2 is turned so its grain runs across the sheet's grain.",
    ]);
    project.settings.features.grain = false;
    expect(check(project)).toEqual([]);
  });

  it("reports bad references, bad copies, and duplicate placements", () => {
    const project = withPlacements([at(0.25, 0.25), { ...at(0.25, 12.375, 1), part: "gone" }, at(40, 0.25, 5), at(40, 12.375, 0)]);
    project.plan!.sheets.push({ id: "s2", stock: "missing", placements: [] });
    expect(check(project).map((issue) => [issue.code, issue.message])).toEqual([
      ["bad-ref", 'Sheet 1 places part "gone", which does not exist.'],
      ["bad-copy", "Sheet 1 places copy 6 of Side, but its quantity is 2."],
      ["duplicate-placement", "Side 1 is placed more than once."],
      ["bad-ref", 'Sheet 2 uses stock "missing", which does not exist.'],
      ["unplaced", "1 of 2 copies of Side are not placed on any sheet."],
    ]);
  });

  it("reports more sheets than the stock quantity", () => {
    const project = sampleProject();
    project.stock[0]!.quantity = 1;
    project.plan!.sheets.push({ id: "s2", stock: "ply-4x8", placements: [] });
    expect(check(project)).toEqual([
      {
        severity: "error",
        code: "stock-exceeded",
        message: 'The plan uses 2 sheets of Plywood 3/4 96" × 48", but only 1 is available.',
        refs: [{ kind: "stock", stock: "ply-4x8" }],
      },
    ]);
  });

  it("reports unplaced copies once per part", () => {
    const project = withPlacements([at(0.25, 0.25, 1)]);
    project.parts.push({ id: "top", name: "Top", material: "ply", length: 20, width: 12, quantity: 1, grain: "length" });
    expect(check(project)).toEqual([
      { severity: "warning", code: "unplaced", message: "1 of 2 copies of Side are not placed on any sheet.", refs: [{ kind: "part", part: "side", copy: 0 }] },
      { severity: "warning", code: "unplaced", message: "Top is not placed on any sheet.", refs: [{ kind: "part", part: "top", copy: 0 }] },
    ]);
  });
});
