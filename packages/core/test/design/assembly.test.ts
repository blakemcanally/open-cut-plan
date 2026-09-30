import { describe, expect, it } from "vitest";
import { assemblySteps, convertProjectUnits, regenerateDesigns } from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";

const project = regenerateDesigns(designProject([kallaxDesign(), eketDesign(), kallaxDesign({ id: "c", name: "Mixed", system: "custom", width: { openings: [335, 400, 335] }, height: { openings: [300, 335] } })]));

describe("assemblySteps", () => {
  it("gives the KALLAX 2x4 steps in order", () => {
    const steps = assemblySteps(project, "kx")!;
    expect(steps.map((step) => step.title)).toEqual([
      "Drill the pocket holes",
      "Mark the shelf positions",
      "Cut spacers",
      "Assemble column 1 of 2",
      "Assemble column 2 of 2",
      "Check that it is square",
      "Anchor the unit",
    ]);
    expect(steps[0]!.body).toBe('Drill 3 pocket holes in each end of all 10 shelves, on the underside, for 18 mm stock. Set the jig and the drill collar to the 3/4" mark.');
    expect(steps[1]!.body).toBe("Mark the underside of each shelf on the vertical panels at 0 mm, 353 mm, 706 mm, 1059 mm and 1412 mm from the bottom end.");
    expect(steps[2]!.body).toBe("Cut 2 spacers to 335 mm from an offcut. They hold each shelf on its mark while you drive the screws.");
    expect(steps[3]!.body).toContain("Put the 5 shelves of this column (335 mm long)");
    expect(steps[3]!.body).toContain('1 1/4" (32 mm) coarse-thread pocket screws');
    expect(steps[4]!.body).toMatch(/^Use the right panel of column 1 as the left panel\./);
    expect(steps[5]!.body).toContain("Both must be 1603 mm.");
  });

  it("says how many to build, fits the back, and hangs an EKET on the rail", () => {
    const steps = assemblySteps(project, "ek")!;
    expect(steps[0]!.body).toMatch(/^Build 2 of these\. The numbers in these steps are for one unit\. Drill 3 pocket holes in each end of all 4 shelves/);
    expect(steps.map((step) => step.title).slice(-3)).toEqual(["Check that it is square", "Fit the back", "Hang the unit"]);
    expect(steps.at(-3)!.body).toContain("Both must be 782.5 mm.");
    expect(steps.at(-2)!.body).toBe('Glue the back to the rear edges, then screw it on with 21 #6 × 3/4" (4 × 20 mm) flat head wood screws: 25 mm from the ends of each edge, and at most 150 mm apart.');
    expect(steps.at(-1)!.body).toContain("(1 × EKET suspension rail, 70 cm)");
    expect(steps.at(-1)!.body).toContain("AA-1912543-9");
    expect(steps.at(-1)!.body).toContain("Leave at least 50 mm free above the unit.");
  });

  it("gives one spacer pair for each row opening, and one step for each column", () => {
    const steps = assemblySteps(project, "c")!;
    expect(steps[1]!.body).toContain("at 0 mm, 353 mm and 671 mm from the bottom end");
    expect(steps[2]!.body).toBe("Cut 2 spacers to 300 mm and 2 spacers to 335 mm from an offcut. They hold each shelf on its mark while you drive the screws.");
    expect(steps.filter((step) => step.title.startsWith("Assemble")).map((step) => step.body.match(/\((.+) long\)/)![1])).toEqual(["335 mm", "400 mm", "335 mm"]);
  });

  it("fits the legs with their guides, then anchors the unit", () => {
    const legs = regenerateDesigns(designProject([eketDesign({ mount: "legs", quantity: 1, back: undefined })]));
    const steps = assemblySteps(legs, "ek")!;
    expect(steps.map((step) => step.title).slice(-2)).toEqual(["Fit the legs", "Anchor the unit"]);
    expect(steps.at(-2)!.body).toContain("AA-2425733-1 (EKET legs, black, 4-pack) and AA-2196566-3 (EKET legs, wood, 4-pack)");
    expect(steps[0]!.body).not.toContain("Build");
  });

  it("gives the lengths in the project units", () => {
    const steps = assemblySteps(convertProjectUnits(project, "in"), "ek")!;
    expect(steps[0]!.body).toContain('for 23/32" stock');
    expect(steps[1]!.body).toBe('Mark the underside of each shelf on the vertical panels at 0" and 13 1/16" from the bottom end.');
    expect(steps[5]!.body).toContain('Both must be 30 13/16".');
  });

  it("gives null for a missing design or a design with an error", () => {
    expect(assemblySteps(project, "nope")).toBeNull();
    expect(assemblySteps(designProject([kallaxDesign({ material: "missing" })]), "kx")).toBeNull();
  });
});
