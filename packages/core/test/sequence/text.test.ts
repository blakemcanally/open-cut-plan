import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import { convertProjectUnits, describeStep, formatSize, parseProject, planContext, sequencePlan, setupLabel, type Project, type Tool } from "../../src/index.ts";
import { sampleProject, stripProject } from "../helpers.ts";

function texts(project: Project) {
  const ctx = planContext(project);
  return sequencePlan(project).map((step) => describeStep(ctx, step));
}

function withTool(tool: Tool): Project {
  const project = stripProject();
  project.tools = [tool];
  return project;
}

function example(name: string): Project {
  const result = parseProject(EXAMPLES[name]!());
  if (!result.ok) throw new Error("example did not load");
  return result.project;
}

describe("describeStep", () => {
  it("names the trimmed edge and picks up the full sheet first", () => {
    const all = texts(sampleProject());
    expect(all[0]).toEqual({
      title: 'Step 1 · Trim 1/4" off the top edge',
      headline: 'Trim 1/4" off the top edge',
      method: "Table saw · trim: a cut that removes the rough factory edge",
      pickUp: 'the full sheet 96" × 48" (sheet 1)',
      actions: ['Cut 1/4" off the top edge.'],
      results: [
        { kind: "waste", where: null, size: '96" × 1/8"', parts: [], next: null },
        { kind: "next", where: null, size: '96" × 47 3/4"', parts: ["Side 1", "Side 2"], next: 2 },
      ],
      body: 'Pick up the full sheet 96" × 48" (sheet 1). 1. Cut 1/4" off the top edge. Waste: 96" × 1/8". Next: 96" × 47 3/4" with Side 1, Side 2, for step 2.',
    });
    expect(all.slice(0, 4).map((text) => text.headline)).toEqual([
      'Trim 1/4" off the top edge',
      'Trim 1/4" off the bottom edge',
      'Trim 1/4" off the left edge',
      'Trim 1/4" off the right edge',
    ]);
    expect(all[1]!.pickUp).toBe('the panel 96" × 47 3/4" from step 1');
  });

  it("sets the fence for a table saw rip and says where each side goes", () => {
    const rip = texts(stripProject())[4]!;
    expect(rip.title).toBe('Step 5 · Cut 12" off the panel');
    expect(rip.method).toBe("Table saw · rip: a cut along the length of the sheet");
    expect(rip.pickUp).toBe('the panel 95 1/2" × 47 1/2" from step 4');
    expect(rip.actions).toEqual(['Set the fence 12" from the blade.', 'Put a 95 1/2" edge of the panel against the fence.', "Make the cut."]);
    expect(rip.results).toEqual([
      { kind: "next", where: "between the fence and the blade", size: '95 1/2" × 12"', parts: ["Side 1"], next: 7 },
      { kind: "next", where: null, size: '95 1/2" × 35 3/8"', parts: ["Side 2"], next: 6 },
    ]);
    expect(rip.body).toBe(
      'Pick up the panel 95 1/2" × 47 1/2" from step 4. 1. Set the fence 12" from the blade. 2. Put a 95 1/2" edge of the panel against the fence. 3. Make the cut. Next (between the fence and the blade): 95 1/2" × 12" with Side 1, for step 7. Next: 95 1/2" × 35 3/8" with Side 2, for step 6.',
    );
  });

  it("labels an offcut, or waste when offcuts are off", () => {
    expect(texts(stripProject())[5]!.results[1]).toEqual({ kind: "offcut", where: null, size: '95 1/2" × 23 1/4"', parts: [], next: null });
    expect(texts(stripProject())[5]!.body).toMatch(/ Offcut: 95 1\/2" × 23 1\/4"\. Set it aside\.$/);
    const project = stripProject();
    project.settings.features.offcuts = false;
    expect(texts(project)[5]!.results[1]!.kind).toBe("waste");
    expect(texts(project)[5]!.body).toMatch(/ Waste: 95 1\/2" × 23 1\/4"\.$/);
  });

  it("uses the stop for a table saw crosscut and labels a finished part", () => {
    const cut = texts(stripProject())[6]!;
    expect(cut.headline).toBe('Cut 90" off the panel');
    expect(cut.method).toBe("Table saw · crosscut: a cut across the length of the sheet");
    expect(cut.actions).toEqual(['Set the stop 90" from the blade.', 'Put a 12" edge of the panel against the stop.', "Make the cut."]);
    expect(cut.results[0]).toEqual({ kind: "part", where: "at the stop", size: '90" × 12"', parts: ["Side 1"], next: null });
    expect(cut.body).toContain('Part (at the stop): Side 1, 90" × 12".');
  });

  it("uses the stop on a panel saw, for a rip too", () => {
    const rip = texts(withTool({ id: "ps", name: "Panel saw", type: "panel-saw", kerf: 0.125, enabled: true }))[4]!;
    expect(rip.actions).toEqual(['Set the stop 12" from the blade.', 'Put a 95 1/2" edge of the panel against the stop.', "Make the cut."]);
    expect(rip.results[0]!.where).toBe("at the stop");
  });

  it("marks the cut for a track saw and a circular saw", () => {
    const track = texts(withTool({ id: "track", name: "Track saw", type: "track-saw", kerf: 0.125, enabled: true }))[6]!;
    expect(track.method).toBe("Track saw · crosscut: a cut across the length of the sheet");
    expect(track.actions).toEqual(['Mark 90" from the left edge, at the two ends of the cut.', "Put the edge of the track on the marks.", "Cut with the blade to the right of the marks."]);
    expect(track.results[0]!.where).toBe("the left piece");
    const circular = texts(withTool({ id: "circ", name: "Circular saw", type: "circular-saw", kerf: 0.125, enabled: true }))[4]!;
    expect(circular.actions).toEqual(['Mark 12" from the top edge, at the two ends of the cut.', "Clamp a straightedge so that the blade cuts next to the marks.", "Cut with the blade below the marks."]);
    expect(circular.results[0]!.where).toBe("the top piece");
  });

  it("uses the stop on a mitre saw", () => {
    const cut = texts(withTool({ id: "m", name: "Mitre saw", type: "miter-saw", kerf: 0.125, enabled: true }))[6]!;
    expect(cut.method).toBe("Mitre saw · crosscut: a cut across the length of the sheet");
    expect(cut.actions).toEqual(['Set the stop 90" from the blade.', 'Put a 12" edge of the panel against the stop.', "Make the cut."]);
    expect(cut.results[0]!.where).toBe("at the stop");
  });

  it("names the limit of a chosen tool: a mitre saw on a rip, or the crosscut piece of a table saw", () => {
    const project = stripProject();
    const ctx = planContext(project);
    const [, , , , rip, , crosscut] = sequencePlan(project);
    const miter: Tool = { id: "m", name: "Mitre saw", type: "miter-saw", kerf: 0.125, enabled: true };
    expect(describeStep(ctx, { ...rip!, tool: miter, overLimit: "crosscutOnly" }).actions[0]).toBe("This cut is over a limit of the Mitre saw: it makes crosscuts only.");
    const table: Tool = { id: "ts", name: "Table saw", type: "table-saw", kerf: 0.125, enabled: true, maxCrosscutPiece: { length: 48, width: 24 } };
    expect(describeStep(ctx, { ...crosscut!, tool: table, overLimit: "maxCrosscutPiece" }).actions[0]).toBe('This cut is over a limit of the Table saw: largest piece for a crosscut 48" × 24".');
  });

  it("warns when no tool can make the cut", () => {
    const project = sampleProject();
    project.tools[0]!.enabled = false;
    const cut = texts(project).find((text) => !text.headline.startsWith("Trim"))!;
    expect(cut.method).toMatch(/^No tool · /);
    expect(cut.actions).toEqual([
      "No enabled tool can make this cut. Check the Tools tab.",
      'Mark 30" from the left edge, at the two ends of the cut.',
      "Clamp a straightedge so that the blade cuts next to the marks.",
      "Cut with the blade to the right of the marks.",
    ]);
    expect(cut.results[0]!.where).toBe("the left piece");
    expect(texts(project)[0]!.actions).toEqual(["No enabled tool can make this cut. Check the Tools tab.", 'Cut 1/4" off the top edge.']);
  });

  it("shortens a long part list", () => {
    const project = sampleProject();
    project.parts[0]!.quantity = 5;
    project.plan!.sheets[0]!.placements = [0, 1, 2, 3, 4].map((copy) => ({ part: "side", copy, x: 0.25 + copy * 12.125, y: 0.25, rotated: true }));
    const first = texts(project)[0]!;
    expect(first.results[1]!.parts).toEqual(["Side 1", "Side 2", "Side 3", "and 2 more"]);
    expect(first.body).toContain("with Side 1, Side 2, Side 3, and 2 more, for step 2.");
  });

  it("cuts the panel to size when the measured side is the remainder", () => {
    const gap = sampleProject();
    gap.plan!.sheets[0]!.placements[1]!.y = 12.4375;
    gap.tools[0] = { id: "ts", name: "Table saw", type: "table-saw", kerf: 0.125, enabled: true, maxRip: 40 };
    const ctx = planContext(gap);
    const sliver = sequencePlan(gap).find((step) => step.at === 12.375)!;
    const text = describeStep(ctx, sliver);
    expect(text.headline).toBe('Cut the panel to 35 5/16"');
    expect(text.actions[0]).toBe('Set the fence 35 5/16" from the blade.');
    expect(text.results[0]).toMatchObject({ where: "between the fence and the blade", size: formatSize(ctx, sliver.remainder) });
    expect(text.results[1]!.where).toBeNull();
  });

  it("describes every living-room-shelf step, and mm steps in mm", () => {
    const all = texts(example("living-room-shelf"));
    expect(all).toHaveLength(76);
    expect(all.every((text) => !text.body.includes("?"))).toBe(true);
    expect(all[4]!.title).toBe('Step 5 · Cut 15 3/8" off the panel');
    expect(all[4]!.body).toBe(
      'Pick up the panel 59 1/2" × 59 1/2" from step 4. 1. Set the fence 15 3/8" from the blade. 2. Put a 59 1/2" edge of the panel against the fence. 3. Make the cut. Next (between the fence and the blade): 59 1/2" × 15 3/8" with B Top, for step 8. Next: 59 1/2" × 44" with B Bottom, A Top, A Shelf 1, for step 6.',
    );
    const mm = texts(convertProjectUnits(example("living-room-shelf"), "mm"));
    expect(mm.length).toBeGreaterThan(0);
    expect(mm.every((text) => !text.body.includes("?") && !text.body.includes('"'))).toBe(true);
    expect(mm.find((text) => !text.headline.startsWith("Trim"))!.headline).toMatch(/^Cut (the (sheet|panel) to )?\d+(\.\d+)? mm( off the (sheet|panel))?$/);
  });
});

describe("setupLabel", () => {
  const labels = (project: Project) => {
    const ctx = planContext(project);
    return sequencePlan(project).map((step) => setupLabel(ctx, step));
  };

  it("names the tool and what the user sets: the trim, the fence, the stop, or the marks", () => {
    expect(labels(sampleProject())).toEqual([
      'Table saw · trim 1/4"',
      'Table saw · trim 1/4"',
      'Table saw · trim 1/4"',
      'Table saw · trim 1/4"',
      'Table saw · stop at 30"',
      'Table saw · fence at 12"',
      'Table saw · fence at 12"',
    ]);
    expect(labels(withTool({ id: "ps", name: "Panel saw", type: "panel-saw", kerf: 0.125, enabled: true }))[4]).toBe('Panel saw · stop at 12"');
    expect(labels(withTool({ id: "m", name: "Mitre saw", type: "miter-saw", kerf: 0.125, enabled: true }))[6]).toBe('Mitre saw · stop at 90"');
    expect(labels(withTool({ id: "track", name: "Track saw", type: "track-saw", kerf: 0.125, enabled: true }))[6]).toBe('Track saw · marks at 90"');
    const none = sampleProject();
    none.tools[0]!.enabled = false;
    expect(labels(none)[4]).toBe('No tool · marks at 30"');
  });
});
