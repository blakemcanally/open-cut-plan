import { describe, expect, it } from "vitest";
import { convertProjectUnits, designElevationSvg, regenerateDesigns } from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";

const project = regenerateDesigns(designProject([kallaxDesign(), eketDesign(), eketDesign({ id: "l", name: "Legs", mount: "legs", back: undefined })]));
const count = (svg: string, pattern: RegExp) => svg.match(pattern)?.length ?? 0;

describe("designElevationSvg", () => {
  it("draws every panel to scale, with the opening sizes and the outside size", () => {
    const svg = designElevationSvg(project, "kx")!;
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="-143 -143 1010 1716" width="1010mm" height="1716mm"/);
    expect(svg).toContain("<title>Hall KALLAX: 724 mm × 1430 mm × 390 mm</title>");
    expect(count(svg, /data-panel="vertical"/g)).toBe(3);
    expect(count(svg, /data-panel="horizontal"/g)).toBe(10);
    expect(svg).toContain('<rect data-panel="vertical" x="353" y="0" width="18" height="1430"');
    expect(svg).toContain('<rect data-panel="horizontal" x="18" y="353" width="335" height="18"');
    expect(count(svg, />335 mm × 335 mm</g)).toBe(8);
    expect(svg).toContain(">724 mm</text>");
    expect(svg).toContain(">1430 mm</text>");
    expect(svg).toContain(">Depth 390 mm</text>");
  });

  it("fills the panels with the colour of the design group", () => {
    expect(designElevationSvg(project, "kx")).toContain('fill="#9cc3e6"');
    expect(designElevationSvg(project, "ek")).toContain('fill="#f2c27b"');
  });

  it("draws the rail behind an EKET on the wall, and the legs under a unit on legs", () => {
    expect(designElevationSvg(project, "ek")).toContain('<rect data-mount="wall-rail" x="35" y="18" width="630" height="40"');
    const legs = designElevationSvg(project, "l")!;
    expect(count(legs, /data-mount="legs"/g)).toBe(2);
    expect(legs).toContain('<rect data-mount="legs" x="18" y="350" width="30" height="100"');
    expect(designElevationSvg(project, "kx")).not.toContain("data-mount");
  });

  it("uses the project units and the display precision", () => {
    const svg = designElevationSvg(convertProjectUnits(project, "in"), "kx")!;
    expect(svg).toContain('width="39.764in"');
    expect(svg).toContain(">13 3/16&quot; × 13 3/16&quot;</text>");
  });

  it("gives null for a missing design or a design with an error", () => {
    expect(designElevationSvg(project, "nope")).toBeNull();
    expect(designElevationSvg(designProject([kallaxDesign({ material: "missing" })]), "kx")).toBeNull();
  });
});
