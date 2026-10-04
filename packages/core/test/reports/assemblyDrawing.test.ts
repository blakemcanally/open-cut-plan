import { describe, expect, it } from "vitest";
import { assemblyDrawings, assemblySteps, regenerateDesigns, type CombinedCell } from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";

const project = regenerateDesigns(designProject([kallaxDesign(), eketDesign(), eketDesign({ id: "l", name: "Legs", mount: "legs", back: undefined, quantity: 1 })]));
const count = (svg: string, pattern: RegExp) => svg.match(pattern)?.length ?? 0;
const state = (svg: string, panel: string) => [...svg.matchAll(new RegExp(`data-panel="${panel}" data-state="(\\w+)"`, "g"))].map((match) => match[1]);
const span = (column: number, row: number, columns: number, rows: number): CombinedCell => ({ column, row, columns, rows });

describe("assemblyDrawings", () => {
  it("gives one drawing for each assembly step, with its description as the title", () => {
    const drawings = assemblyDrawings(project, "kx")!;
    expect(drawings).toHaveLength(assemblySteps(project, "kx")!.length);
    expect(drawings[0]!.svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="-53.625 -53.625 831.25 1537.25" width="831.25mm" height="1537.25mm"/);
    expect(drawings[0]!.svg).toContain(`<title>${drawings[0]!.description}</title>`);
    expect(drawings[0]!.svg).not.toContain("<text");
  });

  it("marks the boards of the step, keeps the boards of earlier join steps in place, and outlines the rest", () => {
    const drawings = assemblyDrawings(project, "kx")!;
    expect(state(drawings[0]!.svg, "side")).toEqual(["current", "current"]);
    expect(state(drawings[0]!.svg, "shelf")).toEqual(Array(6).fill("current"));
    expect(state(drawings[0]!.svg, "top")).toEqual(["later"]);
    const second = drawings[5]!.svg;
    expect(state(second, "side")).toEqual(["placed", "current"]);
    expect(state(second, "divider")).toEqual(["placed"]);
    expect(state(second, "shelf")).toEqual(["placed", "placed", "placed", "current", "current", "current"]);
    expect(state(second, "bottom")).toEqual(["later"]);
    expect(second).toContain('<rect data-panel="side" data-state="current" x="706" y="18" width="18" height="1394" fill="#1a5fd0"');
    expect(second).toContain('<rect data-panel="side" data-state="placed" x="0" y="18" width="18" height="1394" fill="#9cc3e6"');
    expect(second).toContain('<rect data-panel="top" data-state="later" x="0" y="0" width="724" height="18" fill="none"');
    expect(state(drawings[7]!.svg, "shelf")).toEqual(Array(6).fill("placed"));
  });

  it("draws the marks, the spacers, the diagonals, and the anti-tip fitting", () => {
    const drawings = assemblyDrawings(project, "kx")!;
    expect(count(drawings[1]!.svg, /data-mark/g)).toBe(9);
    expect(drawings[1]!.svg).toContain('<line data-mark x1="317.25" y1="371" x2="406.75" y2="371"');
    expect(drawings[1]!.svg).toContain('<line data-mark x1="0" y1="371" x2="53.75" y2="371"');
    expect(count(drawings[2]!.svg, /data-mark/g)).toBe(2);
    expect(drawings[2]!.svg).toContain('<line data-mark x1="353" y1="0" x2="353" y2="53.75"');
    expect(drawings[2]!.svg).toContain('<line data-mark x1="353" y1="1376.25" x2="353" y2="1430"');
    expect(count(drawings[0]!.svg, /data-mark/g)).toBe(0);
    expect(count(drawings[3]!.svg, /data-spacer/g)).toBe(12);
    expect(drawings[3]!.svg).toContain('<rect data-spacer x="27" y="371" width="27" height="335"');
    expect(count(drawings[7]!.svg, /data-diagonal/g)).toBe(2);
    expect(count(drawings[8]!.svg, /data-anchor/g)).toBe(1);
    expect(count(drawings[7]!.svg, /data-anchor/g)).toBe(0);
  });

  it("draws the back from its step on, and the rail and the legs as later, current, then in place", () => {
    const eket = assemblyDrawings(project, "ek")!;
    expect(eket[3]!.svg).not.toContain('data-board="back"');
    expect(eket[4]!.svg).toContain('<rect data-board="back" data-state="current"');
    expect(eket[5]!.svg).toContain('<rect data-board="back" data-state="placed"');
    expect(eket[4]!.svg).toContain('data-mount="wall-rail" data-state="later"');
    expect(eket[5]!.svg).toContain('data-mount="wall-rail" data-state="current"');
    const legs = assemblyDrawings(project, "l")!;
    expect(legs.map((drawing) => drawing.svg.match(/data-mount="legs" data-state="(\w+)"/)![1])).toEqual(["later", "later", "later", "later", "current", "placed"]);
  });

  it("labels only the marked boards that a combined cell makes", () => {
    const combined = regenerateDesigns(designProject([kallaxDesign({ width: { openings: [335, 335, 335, 335] }, height: { openings: [335, 335] }, combined: [span(1, 1, 2, 1)] })]));
    const steps = assemblySteps(combined, "kx")!;
    const drawings = assemblyDrawings(combined, "kx")!;
    const of = (title: string) => drawings[steps.findIndex((step) => step.title === title)]!.svg;
    expect(count(of("Assemble column 1 of 4"), /data-label=/g)).toBe(2);
    expect(of("Assemble column 1 of 4")).toContain(">Shelf, columns 1–2</text>");
    expect(count(of("Assemble column 3 of 4"), /data-label=/g)).toBe(0);
    expect(state(of("Assemble column 3 of 4"), "divider")).toEqual(["placed", "placed", "current"]);
    expect(count(of("Mark the divider positions"), /data-mark/g)).toBe(6);
  });

  it("describes what each drawing shows", () => {
    const drawings = assemblyDrawings(project, "kx")!;
    expect(drawings.map((drawing) => drawing.description)).toEqual([
      "Front view with the boards to drill marked: the 2 sides, the divider on the right of column 1 and 6 shelves.",
      "Front view with the marks on the 2 sides and the divider on the right of column 1.",
      "Front view with the marks on the top and the bottom.",
      "Front view with a spacer under each end of each shelf.",
      "Front view with the boards that this step adds marked: the left side, the divider on the right of column 1 and 3 shelves. The boards of later steps are outlines.",
      "Front view with the boards that this step adds marked: the right side and 3 shelves. The boards of earlier steps are in place. The boards of later steps are outlines.",
      "Front view with the boards that this step adds marked: the top and the bottom. The boards of earlier steps are in place.",
      "Front view with the two diagonals to measure.",
      "Front view with the anti-tip fitting marked at the top.",
    ]);
    const eket = assemblyDrawings(project, "ek")!;
    expect(eket[4]!.description).toBe("Front view with the boards that this step adds marked: the back. The boards of earlier steps are in place.");
    expect(eket[5]!.description).toBe("Front view with the wall rail marked.");
    expect(assemblyDrawings(project, "l")![4]!.description).toBe("Front view with the legs marked.");
  });

  it("gives null for a missing design or a design with an error", () => {
    expect(assemblyDrawings(project, "nope")).toBeNull();
    expect(assemblyDrawings(designProject([kallaxDesign({ material: "missing" })]), "kx")).toBeNull();
  });
});
