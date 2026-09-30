import { describe, expect, it } from "vitest";
import { assemblySteps, convertProjectUnits, regenerateDesigns } from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";

const project = regenerateDesigns(designProject([kallaxDesign(), eketDesign(), kallaxDesign({ id: "c", name: "Mixed", system: "custom", width: { openings: [335, 400, 335] }, height: { openings: [400, 300, 335] } })]));

describe("assemblySteps", () => {
  it("gives the KALLAX 2x4 steps in order", () => {
    const steps = assemblySteps(project, "kx")!;
    expect(steps.map((step) => step.title)).toEqual([
      "Drill the pocket holes",
      "Mark the shelf positions",
      "Mark the divider positions",
      "Cut spacers",
      "Assemble column 1 of 2",
      "Assemble column 2 of 2",
      "Fit the bottom and the top",
      "Check that it is square",
      "Anchor the unit",
    ]);
    expect(steps[0]!.body).toBe(
      'Drill 3 pocket holes in each end of the 2 sides and the 1 divider, on the inside face of each side and on one face of the divider, and in each end of the 6 shelves, on the underside, for 18 mm stock. Set the jig and the drill collar to the 3/4" mark.',
    );
    expect(steps[1]!.body).toBe("Mark the underside of each shelf on the sides and the dividers at 335 mm, 688 mm and 1041 mm from the bottom end.");
    expect(steps[2]!.body).toBe("Mark the left face of each divider on the top and the bottom at 353 mm from the left end.");
    expect(steps[3]!.body).toBe("Cut 2 spacers to 335 mm from an offcut. They hold each shelf on its mark while you drive the screws.");
    expect(steps[4]!.body).toBe(
      'Lay the left side on its outside face, with the marks up. Put the 3 shelves of this column (335 mm long) on their marks, with the pocket holes down, and screw them to the panel with 1 1/4" (32 mm) coarse-thread pocket screws. Then put the next divider on the other ends of the shelves, and screw it on.',
    );
    expect(steps[5]!.body).toMatch(/^Use the divider on the right of column 1 as the left panel\./);
    expect(steps[5]!.body).toMatch(/Then put the right side on the other ends of the shelves, and screw it on\.$/);
    expect(steps[6]!.body).toBe(
      "Lay the frame on its back. Put the bottom on the lower ends of the sides and the dividers, with each divider on its mark, and screw it on through the pocket holes in their ends. Then fit the top the same way.",
    );
    expect(steps[7]!.body).toContain("Both must be 1603 mm.");
  });

  it("says how many to build, fits the back, and hangs an EKET on the rail", () => {
    const steps = assemblySteps(project, "ek")!;
    expect(steps.map((step) => step.title)).toEqual(["Drill the pocket holes", "Mark the divider positions", "Fit the bottom and the top", "Check that it is square", "Fit the back", "Hang the unit"]);
    expect(steps[0]!.body).toMatch(
      /^Build 2 of these\. The numbers in these steps are for one unit\. Drill 3 pocket holes in each end of the 2 sides and the 1 divider, on the inside face of each side and on one face of the divider, for 18 mm stock\./,
    );
    expect(steps[1]!.body).toBe("Mark the left face of each divider on the top and the bottom at 341 mm from the left end.");
    expect(steps[2]!.body).toBe("Stand the sides and the dividers on the bottom, with each divider on its mark, and screw them to it through the pocket holes in their ends. Then fit the top the same way.");
    expect(steps[3]!.body).toContain("Both must be 782.5 mm.");
    expect(steps[4]!.body).toBe('Glue the back to the rear edges, then screw it on with 21 #6 × 3/4" (4 × 20 mm) flat head wood screws: 25 mm from the ends of each edge, and at most 150 mm apart.');
    expect(steps[5]!.body).toContain("(1 × EKET suspension rail, 70 cm)");
    expect(steps[5]!.body).toContain("AA-1912543-9");
    expect(steps[5]!.body).toContain("Leave at least 50 mm free above the unit.");
  });

  it("gives one spacer pair for each opening under a shelf, a mark for each divider, and one step for each column", () => {
    const steps = assemblySteps(project, "c")!;
    const body = (title: string) => steps.find((step) => step.title === title)!.body;
    expect(body("Mark the shelf positions")).toContain("at 335 mm and 653 mm from the bottom end");
    expect(body("Mark the divider positions")).toContain("at 353 mm and 771 mm from the left end");
    expect(body("Cut spacers")).toBe("Cut 2 spacers to 300 mm and 2 spacers to 335 mm from an offcut. They hold each shelf on its mark while you drive the screws.");
    expect(steps.filter((step) => step.title.startsWith("Assemble")).map((step) => step.body.match(/\((.+) long\)/)![1])).toEqual(["335 mm", "400 mm", "335 mm"]);
  });

  it("leaves out the dividers for 1 column and the shelves for 1 row", () => {
    const single = regenerateDesigns(
      designProject([
        kallaxDesign({ id: "one", width: { openings: [335] }, height: { openings: [335] } }),
        kallaxDesign({ id: "tall", width: { openings: [335] }, height: { openings: [335, 335] } }),
      ]),
    );
    const one = assemblySteps(single, "one")!;
    expect(one.map((step) => step.title)).toEqual(["Drill the pocket holes", "Fit the bottom and the top", "Check that it is square", "Anchor the unit"]);
    expect(one[0]!.body).toMatch(/^Drill 3 pocket holes in each end of the 2 sides, on the inside face of each side, for 18 mm stock\./);
    expect(one[1]!.body).toBe("Stand the sides on the bottom, and screw them to it through the pocket holes in their ends. Then fit the top the same way.");

    const tall = assemblySteps(single, "tall")!;
    expect(tall.map((step) => step.title)).toEqual([
      "Drill the pocket holes",
      "Mark the shelf positions",
      "Cut spacers",
      "Assemble column 1 of 1",
      "Fit the bottom and the top",
      "Check that it is square",
      "Anchor the unit",
    ]);
    expect(tall[0]!.body).toMatch(/^Drill 3 pocket holes in each end of the 2 sides, on the inside face of each side, and in each end of the shelf, on the underside, for 18 mm stock\./);
    expect(tall[1]!.body).toBe("Mark the underside of each shelf on the sides at 335 mm from the bottom end.");
    expect(tall[3]!.body).toBe(
      'Lay the left side on its outside face, with the marks up. Put the shelf of this column (335 mm long) on its mark, with the pocket holes down, and screw it to the panel with 1 1/4" (32 mm) coarse-thread pocket screws. Then put the right side on the other ends of the shelf, and screw it on.',
    );
    expect(tall[4]!.body).toMatch(/^Lay the frame on its back\. Put the bottom on the lower ends of the sides, and screw it on/);
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
    expect(steps[1]!.body).toBe('Mark the left face of each divider on the top and the bottom at 13 7/16" from the left end.');
    expect(steps[3]!.body).toContain('Both must be 30 13/16".');
  });

  it("gives null for a missing design or a design with an error", () => {
    expect(assemblySteps(project, "nope")).toBeNull();
    expect(assemblySteps(designProject([kallaxDesign({ material: "missing" })]), "kx")).toBeNull();
  });
});
