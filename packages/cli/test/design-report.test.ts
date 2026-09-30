import { describe, expect, it } from "vitest";
import { cli, EKET, editFile, KALLAX, withDesignExamples, withExamples } from "./helpers.ts";

describe("report assembly", () => {
  it("gives the steps of every design", async () => {
    const result = await cli(["report", "assembly", EKET, "--json"], withDesignExamples());
    expect(result.code).toBe(0);
    const [design] = result.json().designs;
    expect(design).toMatchObject({ design: "eket", name: "Wall EKET", quantity: 2 });
    expect(design.steps.map((step: { title: string }) => step.title)).toEqual([
      "Drill the pocket holes",
      "Mark the shelf positions",
      "Cut spacers",
      "Assemble column 1 of 2",
      "Assemble column 2 of 2",
      "Check that it is square",
      "Fit the back",
      "Hang the unit",
    ]);
    expect(result.json().skipped).toEqual([]);
    const text = await cli(["report", "assembly", KALLAX], withDesignExamples());
    expect(text.stdout).toContain("Hall KALLAX (kallax)\n  1. Drill the pocket holes\n     Drill 3 pocket holes in each end of all 10 shelves");
  });

  it("skips a design that makes no parts, and exits 1 when --design names it", async () => {
    const io = withDesignExamples();
    editFile(io, KALLAX, (file) => {
      file.designs[0].material = "gone";
    });
    const all = await cli(["report", "assembly", KALLAX, "--json"], io);
    expect(all.json()).toMatchObject({ ok: true, designs: [], skipped: ["kallax"] });
    const one = await cli(["report", "assembly", KALLAX, "--design", "kallax", "--json"], io);
    expect(one.code).toBe(1);
    expect(one.json().error.code).toBe("design-invalid");
    expect((await cli(["report", "assembly", KALLAX, "--design", "nope", "--json"], io)).code).toBe(2);
  });

  it("says when the project has no designs", async () => {
    const result = await cli(["report", "assembly", "shelf.cutplan.json"], withExamples());
    expect(result.stdout).toBe("The project has no designs.\n");
  });
});

describe("report shopping hardware", () => {
  it("lists the hardware for the designs", async () => {
    const result = await cli(["report", "shopping", EKET, "--json"], withDesignExamples());
    expect(result.json().hardware.map((line: { item: string; quantity: number | null }) => [line.item, line.quantity])).toEqual([
      ["pocket-screws", 53],
      ["back-screws", 42],
      ["eket-rail-70", 2],
      ["wall-fixings", null],
      ["glue", null],
    ]);
    const text = await cli(["report", "shopping", EKET], withDesignExamples());
    expect(text.stdout).toContain('Hardware:\n  53 Pocket screws, coarse thread, 1 1/4" (32 mm) [eket]');
    expect(text.stdout).toContain("  2 EKET suspension rail, 70 cm (IKEA 80340048) [eket]");
    expect(text.stdout).toContain("  as needed Wood glue (PVA)");
  });

  it("has an empty hardware list without designs", async () => {
    const result = await cli(["report", "shopping", "shelf.cutplan.json", "--json"], withExamples());
    expect(result.json().hardware).toEqual([]);
    expect((await cli(["report", "shopping", "shelf.cutplan.json"], withExamples())).stdout).not.toContain("Hardware:");
  });
});
