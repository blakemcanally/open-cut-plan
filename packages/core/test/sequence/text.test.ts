import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import { describeStep, parseProject, planContext, sequencePlan, type Project } from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

function texts(project: Project) {
  const ctx = planContext(project);
  return sequencePlan(project).map((step) => describeStep(ctx, step));
}

describe("describeStep", () => {
  it("describes trims by the amount they remove", () => {
    expect(texts(sampleProject())[0]).toEqual({
      title: "Step 1. Table saw, trim.",
      body: 'Piece: sheet 1, full sheet 96" × 48". Trim 1/4" off the edge.',
    });
  });

  it("describes a table saw rip with the fence setting and both sides", () => {
    expect(texts(sampleProject())[4]).toEqual({
      title: "Step 5. Table saw, rip.",
      body: 'Piece: sheet 1, panel 95 1/2" × 47 1/2". Fence at 12". Fence side: Side 1, next at step 7. Other side: Side 2, next at step 6.',
    });
  });

  it("names an offcut or waste when a side has no parts", () => {
    const [, , , , , second] = texts(sampleProject());
    expect(second!.body).toBe(
      'Piece: sheet 1, panel 95 1/2" × 35 3/8". Fence at 12". Fence side: Side 2, next at step 8. Other side: offcut 95 1/2" × 23 1/4".',
    );
    const project = sampleProject();
    project.settings.features.offcuts = false;
    expect(texts(project)[5]!.body).toMatch(/Other side: waste\.$/);
  });

  it("uses the stop for table saw crosscuts and a mark for hand-held saws", () => {
    expect(texts(sampleProject())[6]!.body).toBe('Piece: sheet 1, panel 95 1/2" × 12". Set the stop at 30". Measured side: Side 1. Other side: offcut 65 3/8" × 12".');
    const project = sampleProject();
    project.tools = [{ id: "track", name: "Track saw", type: "track-saw", kerf: 0.125, enabled: true }];
    expect(texts(project)[6]).toEqual({
      title: "Step 7. Track saw, crosscut.",
      body: 'Piece: sheet 1, panel 95 1/2" × 12". Mark 30" from the edge. Measured side: Side 1. Other side: offcut 65 3/8" × 12".',
    });
  });

  it("lists long part lists briefly and says when no tool can make the cut", () => {
    const project = sampleProject();
    project.parts[0]!.quantity = 5;
    project.plan!.sheets[0]!.placements = [0, 1, 2, 3, 4].map((copy) => ({ part: "side", copy, x: 0.25 + copy * 12.125, y: 0.25, rotated: true }));
    project.tools[0]!.enabled = false;
    const [first] = texts(project).filter((text) => text.title.includes("rip"));
    expect(first!.title).toBe("Step 5. No tool, rip.");
    expect(first!.body).toContain("Measured side: Side 1, Side 2, Side 3, and 2 more, next at step");
  });

  it("describes every living-room-shelf step", () => {
    const result = parseProject(EXAMPLES["living-room-shelf"]!());
    if (!result.ok) throw new Error("example did not load");
    const all = texts(result.project);
    expect(all).toHaveLength(76);
    expect(all.every((text) => !text.body.includes("?"))).toBe(true);
    expect(all[4]!.body).toBe(
      'Piece: sheet 1, panel 59 1/2" × 59 1/2". Fence at 15 3/8". Fence side: B Top, next at step 8. Other side: B Bottom, A Top, A Shelf 1, next at step 6.',
    );
  });
});
