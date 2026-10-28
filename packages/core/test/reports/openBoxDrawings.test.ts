import { describe, expect, it } from "vitest";
import { assemblyDrawings, assemblySteps, createProject, designElevationSvg, regenerateDesigns, type Design, type Project } from "../../src/index.ts";

function crateProject(patch: Partial<Design> = {}, thickness = 23 / 32): Project {
  const base = createProject("Crate", "in");
  const design: Design = {
    id: "crate",
    name: "Crate",
    kind: "open-box",
    system: "kallax",
    material: "ply",
    width: { outside: 12.5, cells: 1 },
    height: { outside: 12.5, cells: 1 },
    depth: 13.5,
    ...patch,
  };
  return regenerateDesigns({
    ...base,
    materials: [{ id: "ply", name: "Plywood", thickness, grained: true, measured: true }],
    stock: [{ id: "ply-sheet", material: "ply", length: 96, width: 48, quantity: null, cost: 80, kind: "sheet" }],
    parts: [],
    designs: [design],
  });
}

const count = (svg: string, pattern: RegExp) => svg.match(pattern)?.length ?? 0;
const states = (svg: string) => [...svg.matchAll(/data-panel="(\w+)" data-state="(\w+)"/g)].map((match) => `${match[1]}:${match[2]}`);

describe("the front view of an open-top box", () => {
  const svg = designElevationSvg(crateProject(), "crate")!;

  it("draws the front panel with its part name and the hidden faces dashed", () => {
    expect(svg).toContain("<title>Front</title>");
    expect(svg).toContain("<title>Crate: 12 1/2&quot; × 12 1/2&quot; × 13 1/2&quot;</title>");
    expect(svg).toContain('<rect data-panel="front" x="0" y="0" width="12.5" height="12.5"');
    expect(count(svg, /stroke-dasharray/g)).toBe(3);
    expect(svg).toContain('<line data-hidden="side" x1="0.719"');
    expect(svg).toContain('<line data-hidden="side" x1="11.781"');
    expect(svg).toContain('<line data-hidden="bottom" x1="0.719" y1="11.781" x2="11.781" y2="11.781"');
  });

  it("shows the width, the height, and the depth", () => {
    expect(svg).toContain(">12 1/2&quot;</text>");
    expect(svg).toContain(">Depth 13 1/2&quot;</text>");
    expect(count(svg, /rotate\(-90/g)).toBe(1);
  });
});

describe("the assembly drawings of an open-top box", () => {
  const project = crateProject({ finish: ["Sand lightly."] });
  const drawings = assemblyDrawings(project, "crate")!;

  it("gives one top view for each step", () => {
    expect(drawings).toHaveLength(assemblySteps(project, "crate")!.length);
    for (const drawing of drawings) {
      expect(drawing.description).toMatch(/^Top view/);
      expect(drawing.svg).toContain(`<title>${drawing.description}</title>`);
    }
    expect(drawings[0]!.svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="-0.506 -0.506 13.513 14.513" width="13.513in" height="14.513in"/);
  });

  it("puts the back at the top edge, the front at the lower edge, and the bottom inside", () => {
    const svg = drawings[0]!.svg;
    expect(svg).toContain('<rect data-panel="back" data-state="later" x="0" y="0" width="12.5" height="0.719"');
    expect(svg).toContain('<rect data-panel="front" data-state="later" x="0" y="12.781" width="12.5" height="0.719"');
    expect(svg).toContain('<rect data-panel="bottom" data-state="current" x="0.719" y="0.719" width="11.063" height="12.063"');
  });

  it("marks the boards of the step, keeps earlier boards in place, and outlines the rest", () => {
    expect(states(drawings[0]!.svg)).toEqual(["back:later", "side:current", "side:current", "front:later", "bottom:current"]);
    expect(drawings[0]!.description).toBe("Top view with the boards to drill marked: the 2 sides and the bottom.");
    expect(states(drawings[1]!.svg)).toEqual(["back:current", "side:current", "side:current", "front:current", "bottom:later"]);
    expect(drawings[1]!.description).toBe("Top view with the boards that this step adds marked: the front, the back and the 2 sides. The boards of later steps are outlines.");
    expect(states(drawings[2]!.svg)).toEqual(["back:placed", "side:placed", "side:placed", "front:placed", "bottom:later"]);
    expect(states(drawings[3]!.svg)).toEqual(["back:placed", "side:placed", "side:placed", "front:placed", "bottom:current"]);
    expect(drawings[3]!.description).toBe("Top view with the boards that this step adds marked: the bottom. The boards of earlier steps are in place.");
  });

  it("draws the two diagonals of the top opening in the square step", () => {
    expect(drawings.map((drawing) => count(drawing.svg, /data-diagonal/g))).toEqual([0, 0, 2, 0, 0]);
    expect(drawings[2]!.description).toBe("Top view with the two diagonals to measure.");
    expect(drawings[2]!.svg).toContain('<line data-diagonal x1="0" y1="0" x2="12.5" y2="13.5"');
    expect(drawings[2]!.svg).toContain('<line data-diagonal x1="12.5" y1="0" x2="0" y2="13.5"');
  });

  it("shows the finished unit for a finish step, with no accent", () => {
    const finish = drawings.at(-1)!;
    expect(finish.description).toBe("Top view of the finished unit.");
    expect(states(finish.svg)).toEqual(["back:placed", "side:placed", "side:placed", "front:placed", "bottom:placed"]);
    expect(finish.svg).not.toContain("#1a5fd0");
  });

  it("gives no drawings or front view for an open-top box with an error", () => {
    const small = crateProject({ width: { outside: 1.4, cells: 1 } });
    expect(assemblyDrawings(small, "crate")).toBeNull();
    expect(designElevationSvg(small, "crate")).toBeNull();
  });
});
