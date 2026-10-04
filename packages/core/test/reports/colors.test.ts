import { describe, expect, it } from "vitest";
import {
  designColorKey,
  designUnit,
  groupColorKey,
  isHexColor,
  NO_GROUP_COLOR,
  PART_PALETTE,
  partColors,
  regenerateDesigns,
  STAGE_COLORS,
  TOOL_COLORS,
  TOOL_WARNING_COLOR,
  toolColors,
  type Part,
  type Tool,
  type Project,
} from "../../src/index.ts";
import { designProject, kallaxDesign, sampleProject } from "../helpers.ts";

const part = (project: Project, id: string): Part => project.parts.find((p) => p.id === id)!;

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};

function withGroups(...groups: (string | undefined)[]): Project {
  const project = sampleProject();
  project.parts = groups.map((group, index) => ({ ...project.parts[0]!, id: `p${index}`, ...(group === undefined ? {} : { group }) }));
  return project;
}

describe("PART_PALETTE", () => {
  it("has twelve different light colours, and none of them is the colour of a part without a group", () => {
    expect(PART_PALETTE).toHaveLength(12);
    expect(new Set(PART_PALETTE).size).toBe(12);
    expect(PART_PALETTE).not.toContain(NO_GROUP_COLOR);
    expect(PART_PALETTE.slice(0, 8)).toEqual(["#9cc3e6", "#f2c27b", "#a8d5a2", "#e6a6c7", "#c7b8ea", "#f4a582", "#b8e0d2", "#e8d27a"]);
  });

  it("keeps black text readable on every colour (contrast of 7 or more)", () => {
    const text = luminance("#222222");
    for (const color of PART_PALETTE) expect((luminance(color) + 0.05) / (text + 0.05)).toBeGreaterThanOrEqual(7);
  });
});

describe("TOOL_COLORS", () => {
  it("has six different dark colours that are readable on white, and keeps red for the warning", () => {
    expect(TOOL_COLORS).toHaveLength(6);
    expect(new Set(TOOL_COLORS).size).toBe(6);
    expect(TOOL_COLORS).not.toContain(TOOL_WARNING_COLOR);
    expect(TOOL_COLORS).not.toContain(STAGE_COLORS[0]);
    for (const color of [...TOOL_COLORS, TOOL_WARNING_COLOR]) expect(1.05 / (luminance(color) + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("toolColors", () => {
  const tool = (id: string, enabled = true): Tool => ({ id, name: id.toUpperCase(), type: "track-saw", kerf: 0.125, enabled });

  it("gives each enabled tool one colour in profile order, and leaves out the tools that are turned off", () => {
    const colors = toolColors([tool("a"), tool("off", false), tool("b"), tool("c")]);
    expect(colors.legend).toEqual([
      { tool: "a", name: "A", color: TOOL_COLORS[0] },
      { tool: "b", name: "B", color: TOOL_COLORS[1] },
      { tool: "c", name: "C", color: TOOL_COLORS[2] },
    ]);
    expect(colors.colorOf("b")).toBe(TOOL_COLORS[1]);
    expect(colors.colorOf("off")).toBeNull();
  });

  it("starts the colours again after the last one", () => {
    const tools = Array.from({ length: TOOL_COLORS.length + 1 }, (_, index) => tool(`t${index}`));
    expect(toolColors(tools).colorOf(`t${TOOL_COLORS.length}`)).toBe(TOOL_COLORS[0]);
  });

  it("gives the warning colour to a cut with no tool or over a limit of its tool", () => {
    const colors = toolColors([tool("a"), tool("b")]);
    expect(colors.cutColor({ tool: tool("b"), overLimit: null })).toBe(TOOL_COLORS[1]);
    expect(colors.cutColor({ tool: null, overLimit: null })).toBe(TOOL_WARNING_COLOR);
    expect(colors.cutColor({ tool: tool("a"), overLimit: "maxCut" })).toBe(TOOL_WARNING_COLOR);
    expect(colors.cutColor({ tool: tool("gone"), overLimit: null })).toBe(TOOL_WARNING_COLOR);
  });
});

describe("partColors", () => {
  it("gives each group a colour in the order the groups first appear, as before", () => {
    const project = withGroups("B", "A", undefined, "B");
    const colors = partColors(project);
    expect(colors.legend.map((key) => [key.label, key.color])).toEqual([
      ["B", PART_PALETTE[0]],
      ["A", PART_PALETTE[1]],
    ]);
    expect(colors.colorOf(part(project, "p3"), 1)).toBe(PART_PALETTE[0]);
    expect(colors.colorOf(part(project, "p2"), 0)).toBe(NO_GROUP_COLOR);
    expect(colors.keyOf(part(project, "p2"), 0)).toBeNull();
  });

  it("gives a design with a quantity of 1 one colour named after the design", () => {
    const project = regenerateDesigns(designProject([kallaxDesign()]));
    const colors = partColors(project);
    expect(colors.legend).toEqual([{ key: designColorKey("kx", 1), label: "Hall KALLAX", color: PART_PALETTE[0], chosen: false, design: "kx", unit: 1 }]);
    expect(new Set(project.parts.flatMap((p) => Array.from({ length: p.quantity }, (_, copy) => colors.colorOf(p, copy))))).toEqual(new Set([PART_PALETTE[0]]));
  });

  it("gives each unit of a design with a quantity of 2 its own colour", () => {
    const project = regenerateDesigns(designProject([kallaxDesign({ quantity: 2 })]));
    const colors = partColors(project);
    expect(colors.legend.map((key) => [key.label, key.color])).toEqual([
      ["Hall KALLAX 1 of 2", PART_PALETTE[0]],
      ["Hall KALLAX 2 of 2", PART_PALETTE[1]],
    ]);
    const side = part(project, "kx-side");
    expect(side.quantity).toBe(4);
    expect([0, 1, 2, 3].map((copy) => colors.colorOf(side, copy))).toEqual([PART_PALETTE[0], PART_PALETTE[0], PART_PALETTE[1], PART_PALETTE[1]]);
    expect(colors.keyOf(side, 3)?.label).toBe("Hall KALLAX 2 of 2");
    const shelf = part(project, "kx-shelf");
    expect(colors.colorOf(shelf, 5)).toBe(PART_PALETTE[0]);
    expect(colors.colorOf(shelf, 6)).toBe(PART_PALETTE[1]);
  });

  it("gives the long shelves and short dividers of combined cells the colour of their unit", () => {
    const design = kallaxDesign({
      quantity: 2,
      width: { openings: [335, 335, 335, 335] },
      height: { openings: [335, 335] },
      combined: [{ column: 1, row: 1, columns: 2, rows: 1 }],
      colors: ["", "#123456"],
    });
    const project = regenerateDesigns(designProject([design]));
    const colors = partColors(project);
    expect(colors.legend.map((key) => [key.label, key.color])).toEqual([
      ["Hall KALLAX 1 of 2", PART_PALETTE[0]],
      ["Hall KALLAX 2 of 2", "#123456"],
    ]);
    for (const [id, name] of [
      ["kx-shelf-cols-1-2", "Shelf, columns 1–2"],
      ["kx-divider-rows-2", "Divider, row 2"],
    ]) {
      const combined = part(project, id!);
      expect(combined).toMatchObject({ name, quantity: 2, design: "kx" });
      expect([0, 1].map((copy) => colors.colorOf(combined, copy))).toEqual([PART_PALETTE[0], "#123456"]);
      expect([0, 1].map((copy) => colors.keyOf(combined, copy)?.key)).toEqual([designColorKey("kx", 1), designColorKey("kx", 2)]);
    }
  });

  it("uses a chosen colour in place of the automatic colour, and keeps the automatic colours of the other keys", () => {
    const project = regenerateDesigns(designProject([kallaxDesign({ quantity: 3, colors: ["", "#FF0000"] })]));
    const { design: _design, ...manual } = project.parts[0]!;
    project.parts.push({ ...manual, id: "door", group: "Doors" }, { ...manual, id: "rail", group: "Rails" });
    project.groups = { Rails: { color: "#00ff00" } };
    const colors = partColors(project);
    expect(colors.legend.map((key) => [key.label, key.color, key.chosen])).toEqual([
      ["Hall KALLAX 1 of 3", PART_PALETTE[0], false],
      ["Hall KALLAX 2 of 3", "#ff0000", true],
      ["Hall KALLAX 3 of 3", PART_PALETTE[2], false],
      ["Doors", PART_PALETTE[3], false],
      ["Rails", "#00ff00", true],
    ]);
    expect(colors.get(groupColorKey("Rails"))?.color).toBe("#00ff00");
  });

  it("ignores a design id that no design has, and uses the group", () => {
    const project = withGroups("A");
    project.parts[0]!.design = "gone";
    expect(partColors(project).legend.map((key) => key.label)).toEqual(["A"]);
  });
});

describe("designUnit", () => {
  it("gives the unit of a copy, counted from 1", () => {
    const project = regenerateDesigns(designProject([kallaxDesign({ quantity: 2 })]));
    const top = part(project, "kx-top");
    expect(designUnit(project, top, 0)).toMatchObject({ unit: 1, units: 2 });
    expect(designUnit(project, top, 1)).toMatchObject({ unit: 2, units: 2 });
    expect(designUnit(project, withGroups("A").parts[0]!, 0)).toBeNull();
  });
});

describe("isHexColor", () => {
  it.each([["#a1B2c3", true], ["#fff", false], ["red", false], ["", false]])("%j is %j", (value, ok) => {
    expect(isHexColor(value)).toBe(ok);
  });
});
