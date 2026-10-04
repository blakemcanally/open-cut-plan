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
    expect(count(svg, /data-panel="top"/g)).toBe(1);
    expect(count(svg, /data-panel="bottom"/g)).toBe(1);
    expect(count(svg, /data-panel="side"/g)).toBe(2);
    expect(count(svg, /data-panel="divider"/g)).toBe(1);
    expect(count(svg, /data-panel="shelf"/g)).toBe(6);
    expect(svg).toContain('<rect data-panel="top" x="0" y="0" width="724" height="18"');
    expect(svg).toContain('<rect data-panel="divider" x="353" y="18" width="18" height="1394"');
    expect(svg).toContain('<rect data-panel="shelf" x="18" y="353" width="335" height="18"');
    expect(count(svg, />335 mm × 335 mm</g)).toBe(8);
    expect(svg).toContain(">724 mm</text>");
    expect(svg).toContain(">1430 mm</text>");
    expect(svg).toContain(">Depth 390 mm</text>");
  });

  it("draws a combined cell as one opening with its size, and the boards around it", () => {
    const combined = regenerateDesigns(
      designProject([kallaxDesign({ width: { openings: [335, 335, 335, 335] }, height: { openings: [335, 335] }, combined: [{ column: 1, row: 1, columns: 2, rows: 1 }] })]),
    );
    const svg = designElevationSvg(combined, "kx")!;
    expect(count(svg, />688 mm × 335 mm</g)).toBe(1);
    expect(count(svg, />335 mm × 335 mm</g)).toBe(6);
    expect(count(svg, /data-panel="divider"/g)).toBe(3);
    expect(count(svg, /data-panel="shelf"/g)).toBe(3);
    expect(svg).toContain('<rect data-panel="shelf" x="18" y="353" width="688" height="18"');
    expect(svg).toContain('<rect data-panel="divider" x="353" y="371" width="18" height="335"');
  });

  it("names the part of each board, and labels the boards that a combined cell makes", () => {
    const plain = designElevationSvg(project, "kx")!;
    expect(plain).toContain('<rect data-panel="shelf" x="18" y="353" width="335" height="18"');
    expect(count(plain, /<title>Shelf<\/title>/g)).toBe(6);
    expect(count(plain, /<title>Side<\/title>/g)).toBe(2);
    expect(plain).not.toContain("data-label");
    const combined = regenerateDesigns(
      designProject([kallaxDesign({ width: { openings: [335, 335, 335, 335] }, height: { openings: [335, 335] }, combined: [{ column: 1, row: 1, columns: 2, rows: 1 }] })]),
    );
    const svg = designElevationSvg(combined, "kx")!;
    expect(svg).toMatch(/<rect data-panel="shelf" x="18" y="353" width="688" height="18"[^>]*><title>Shelf, columns 1–2<\/title><\/rect>/);
    expect(svg).toMatch(/<text data-label="shelf" x="362" y="362" [^>]*>Shelf, columns 1–2<\/text>/);
    expect(svg).toMatch(/<text data-label="divider" x="362" y="538.5" [^>]*transform="rotate\(-90 362 538.5\)"[^>]*>Divider, row 2<\/text>/);
    expect(count(svg, /data-label=/g)).toBe(2);
  });

  it("marks the selected cells, and ignores a selection outside the grid", () => {
    const combined = regenerateDesigns(
      designProject([kallaxDesign({ width: { openings: [335, 335, 335, 335] }, height: { openings: [335, 335] }, combined: [{ column: 1, row: 1, columns: 2, rows: 1 }] })]),
    );
    expect(designElevationSvg(combined, "kx")).not.toContain("data-highlight");
    expect(designElevationSvg(combined, "kx", { highlight: { column: 2, row: 2, columns: 1, rows: 1 } })).toContain('<rect data-highlight x="371" y="371" width="335" height="335"');
    expect(designElevationSvg(combined, "kx", { highlight: { column: 1, row: 1, columns: 3, rows: 2 } })).toContain('<rect data-highlight x="18" y="18" width="1041" height="688"');
    expect(designElevationSvg(combined, "kx", { highlight: { column: 5, row: 1, columns: 1, rows: 1 } })).not.toContain("data-highlight");
  });

  it("fills the panels with the colour of the first unit of the design", () => {
    expect(designElevationSvg(project, "kx")).toContain('fill="#9cc3e6"');
    expect(designElevationSvg(project, "ek")).toContain('fill="#f2c27b"');
    const chosen = { ...project, designs: project.designs!.map((design) => (design.id === "ek" ? { ...design, colors: ["#abcdef"] } : design)) };
    expect(designElevationSvg(chosen, "ek")).toContain('fill="#abcdef"');
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
