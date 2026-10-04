import { describe, expect, it } from "vitest";
import { analyzeProject, escapeXml, PART_PALETTE, partColors, regenerateDesigns, sheetSvg, sheetSvgExtent, stageColor, type Project } from "../../src/index.ts";
import { designProject, kallaxDesign, sampleProject } from "../helpers.ts";

function drawn(project: Project, options?: Parameters<typeof sheetSvg>[3]) {
  const analysis = analyzeProject(project);
  return { analysis, svg: sheetSvg(analysis.context, analysis.sheets[0]!, analysis.steps, options) };
}

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

describe("sheetSvg", () => {
  it("pales the sheet outside the piece of the highlighted step and outlines the piece, only with focus", () => {
    const { analysis, svg } = drawn(sampleProject(), { highlight: 5, focus: true });
    const piece = analysis.steps.find((step) => step.step === 5)!.piece;
    expect(svg).toContain(`<rect data-piece="true" x="${piece.x}" y="${piece.y}" width="${piece.length}" height="${piece.width}"`);
    expect(count(svg, /data-focus="true"/g)).toBe(1);
    expect(svg.indexOf('data-piece="true"')).toBeLessThan(svg.indexOf('data-step="1"'));
    expect(drawn(sampleProject(), { highlight: 5 }).svg).not.toMatch(/data-piece|data-focus/);
    expect(drawn(sampleProject(), { highlight: 99, focus: true }).svg).not.toMatch(/data-piece|data-focus/);
  });

  it("draws the sheet at its real size with one group per part and one numbered cut per step", () => {
    const { analysis, svg } = drawn(sampleProject());
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1.6 -1.6 99.2 51.2" width="99.2in" height="51.2in"')).toBe(true);
    expect(svg).toContain('<title>Sheet 1: Plywood 3/4 96&quot; × 48&quot;</title>');
    expect(count(svg, /data-part="/g)).toBe(2);
    expect(svg).toContain('data-part="side#0"');
    expect(count(svg, /data-step="/g)).toBe(analysis.steps.length);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("names each part with its size and a grain arrow, and marks a part across the grain", () => {
    const project = sampleProject();
    project.plan!.sheets[0]!.placements[1]!.rotated = true;
    const { svg } = drawn(project);
    expect(svg).toContain(">Side 1 ↔</text>");
    expect(svg).toContain('>30&quot; × 12&quot;</text>');
    expect(svg).toContain(">Side 2 ↕ ⟂</text>");
  });

  it("uses millimetres for a millimetre project", () => {
    const project = sampleProject();
    project.project.units = "mm";
    expect(drawn(project).svg).toContain('width="99.2mm" height="51.2mm"');
  });

  it("draws a margin around the sheet so that edge cuts show in full", () => {
    const { analysis } = drawn(sampleProject());
    expect(sheetSvgExtent(analysis.sheets[0]!)).toEqual({ margin: 1.6, length: 99.2, width: 51.2 });
  });

  it("starts the pattern ids with the prefix it is given", () => {
    const { svg } = drawn(sampleProject(), { idPrefix: "shop" });
    expect(svg).toContain('<pattern id="shop-s1-h"');
    expect(svg).toContain('fill="url(#shop-s1-h)"');
    expect(svg).not.toContain("ocp-s1");
  });

  it("takes the width and height it is given", () => {
    expect(drawn(sampleProject(), { width: "200mm", height: "100mm" }).svg).toContain('width="200mm" height="100mm"');
  });

  it("escapes names so that they cannot add markup", () => {
    const project = sampleProject();
    project.parts[0]!.name = `<img src=x onerror="alert(1)"> & 'b'`;
    const { svg } = drawn(project);
    expect(svg).not.toContain("<img");
    expect(svg).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &apos;b&apos; 1");
  });

  it("escapes the size and id options", () => {
    const { svg } = drawn(sampleProject(), { width: '1in" onload="x', height: "2in", idPrefix: '"><script' });
    expect(svg).toContain('width="1in&quot; onload=&quot;x" height="2in"');
    expect(svg).not.toContain("<script");
    expect(svg).toContain('<pattern id="&quot;&gt;&lt;script-s1-h"');
  });

  it("colours parts by group and leaves out the grain when the feature is off", () => {
    const project = sampleProject();
    project.parts[0]!.group = "Case";
    project.settings.features.grain = false;
    const { svg } = drawn(project, { colors: partColors(project) });
    expect(svg).toContain(`fill="${PART_PALETTE[0]}"`);
    expect(svg).not.toContain("<pattern");
    expect(svg).toContain(">Side 1</text>");
  });

  it("colours each unit of a design in its own colour", () => {
    const project = regenerateDesigns(designProject([kallaxDesign({ quantity: 2, colors: ["", "#123456"] })]));
    project.plan = {
      sheets: [
        {
          id: "s1",
          stock: "ply18-sheet",
          placements: [
            { part: "kx-top", copy: 0, x: 0, y: 0, rotated: false },
            { part: "kx-top", copy: 1, x: 0, y: 400, rotated: false },
          ],
        },
      ],
    };
    const { svg } = drawn(project, { colors: partColors(project) });
    expect(svg).toMatch(new RegExp(`data-part="kx-top#0"[^>]*>\\n<rect [^>]*fill="${PART_PALETTE[0]}"`));
    expect(svg).toMatch(/data-part="kx-top#1"[^>]*>\n<rect [^>]*fill="#123456"/);
  });

  it("highlights one step, greys the steps that are done, and can leave out the cuts", () => {
    const { analysis, svg } = drawn(sampleProject(), { highlight: 2, done: new Set([1, 2]) });
    expect(svg).toMatch(/data-step="2" data-highlight="true"/);
    expect(svg).toMatch(/data-step="1" data-done="true"/);
    expect(svg).not.toMatch(/data-step="2"[^>]*data-done/);
    expect(svg).toContain(`stroke="${stageColor(analysis.steps[2]!.stage)}"`);
    expect(drawn(sampleProject(), { showCuts: false }).svg).not.toContain("data-step");
  });
});

describe("escapeXml", () => {
  it("escapes the five XML characters", () => {
    expect(escapeXml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;");
  });
});
