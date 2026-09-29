import { exportPartsCsv, parseProject } from "@opencutplan/core";
import { describe, expect, it } from "vitest";
import { cli, example, memoryIo, SHELF as SHELF_FILE, withExamples } from "./helpers.ts";

const SHELF = "shelf.cutplan.json";

async function newProject(units: "in" | "mm" = "in") {
  const io = memoryIo();
  await cli(["new", "p.json", "--name", "Test", "--units", units], io);
  return io;
}

describe("parts", () => {
  it("lists parts with their placed copies", async () => {
    const result = await cli(["parts", "list", SHELF, "--json"], withExamples());
    const side = result.json().parts.find((part: { id: string }) => part.id === "a-side");
    expect(side).toMatchObject({ id: "a-side", name: "A Side", quantity: 2, placedCopies: 2, grain: "length", group: "3x2 A" });
  });

  it("adds a part with lengths in any accepted form", async () => {
    const io = await newProject();
    await cli(["materials", "add", "p.json", "--name", "Ply", "--thickness", "3/4"], io);
    const first = await cli(["parts", "add", "p.json", "--name", "Side", "--length", "30 1/2", "--width", '12"', "--quantity", "2", "--json"], io);
    expect(first.code).toBe(0);
    expect(first.json().part).toEqual({ id: "side", name: "Side", material: "ply", length: 30.5, width: 12, quantity: 2, grain: "length" });
    const second = await cli(["parts", "add", "p.json", "--name", "Side", "--length", "762mm", "--width", "1' 2 1/4", "--grain", "none", "--group", "Case", "--notes", "Back edge", "--json"], io);
    expect(second.json().part).toMatchObject({ id: "side-2", length: 30, width: 14.25, grain: "none", group: "Case", notes: "Back edge" });
    expect(second.json().changes.parts.added).toEqual(["side-2"]);
    expect(second.json().validation).toMatchObject({ errors: 0, warnings: 2 });
  });

  it("rejects bad lengths and quantities as usage errors", async () => {
    const io = await newProject();
    await cli(["materials", "add", "p.json", "--name", "Ply", "--thickness", "3/4"], io);
    const length = await cli(["parts", "add", "p.json", "--name", "X", "--length", "thirty", "--width", "2", "--json"], io);
    expect(length.code).toBe(2);
    expect(length.json().error).toMatchObject({ code: "invalid-value", option: "length", value: "thirty" });
    const zero = await cli(["parts", "add", "p.json", "--name", "X", "--length", "0", "--width", "2"], io);
    expect(zero.code).toBe(2);
    const quantity = await cli(["parts", "add", "p.json", "--name", "X", "--length", "1", "--width", "2", "--quantity", "1.5"], io);
    expect(quantity.code).toBe(2);
    const huge = await cli(["parts", "add", "p.json", "--name", "X", "--length", "1", "--width", "2", "--quantity", "10001", "--json"], io);
    expect(huge.code).toBe(2);
    expect(huge.json().error).toMatchObject({ code: "invalid-value", option: "quantity", value: "10001" });
    expect(io.files.get("p.json")).not.toContain('"X"');
  });

  it("needs --material when the project has more than one material", async () => {
    const io = withExamples();
    const missing = await cli(["parts", "add", SHELF, "--name", "Shelf", "--length", "20", "--width", "10", "--json"], io);
    expect(missing.code).toBe(2);
    expect(missing.json().error).toMatchObject({ code: "missing-option", option: "material" });
    const byName = await cli(["parts", "add", SHELF, "--name", "Shelf", "--length", "20", "--width", "10", "--material", "baltic birch 6mm", "--json"], io);
    expect(byName.json().part.material).toBe("bb6");
  });

  it("changes a part, and a lower quantity takes the extra copies off the sheets", async () => {
    const io = withExamples();
    const result = await cli(["parts", "set", SHELF, "a-side", "--quantity", "1", "--name", "A End", "--unset", "group", "--json"], io);
    expect(result.code).toBe(0);
    const data = result.json();
    expect(data.part).toEqual({ id: "a-side", name: "A End", material: "bb18", length: 27.208661417322833, width: 15.375, quantity: 1, grain: "length" });
    expect(data.changes.plan.placementsAfter).toBe(data.changes.plan.placementsBefore - 1);
    expect(data.removedPlacements).toEqual([{ part: "a-side", copy: 1 }]);
    expect(result.file(SHELF).plan!.sheets.flatMap((s) => s.placements).filter((p) => p.part === "a-side")).toHaveLength(1);
  });

  it("refuses an edit that leaves errors with --strict, and writes nothing", async () => {
    const io = withExamples();
    const before = io.files.get(SHELF);
    const result = await cli(["parts", "set", SHELF, "a-top", "--length", "59", "--strict", "--json"], io);
    expect(result.code).toBe(1);
    expect(result.json()).toMatchObject({ ok: false, error: { code: "strict" }, written: null });
    expect(result.json().validation.errors).toBeGreaterThan(0);
    expect(io.files.get(SHELF)).toBe(before);
    const loose = await cli(["parts", "set", SHELF, "a-top", "--length", "59", "--json"], io);
    expect(loose.code).toBe(0);
    expect(loose.json().written).toBe(SHELF);
  });

  it("removes parts with their placements", async () => {
    const io = withExamples();
    const result = await cli(["parts", "remove", SHELF, "a-top", "a-bottom", "--json"], io);
    expect(result.json()).toMatchObject({ ok: true, removed: ["a-top", "a-bottom"] });
    const project = result.file(SHELF);
    expect(project.parts.map((p) => p.id)).not.toContain("a-top");
    expect(project.plan!.sheets.flatMap((s) => s.placements).some((p) => p.part === "a-top")).toBe(false);
    const unknown = await cli(["parts", "remove", SHELF, "nope"], io);
    expect(unknown.code).toBe(2);
  });

  it("reports the change with --dry-run and writes nothing", async () => {
    const io = withExamples();
    const result = await cli(["parts", "remove", SHELF, "a-top", "--dry-run", "--json"], io);
    expect(result.json()).toMatchObject({ ok: true, dryRun: true, written: null, changes: { parts: { removed: ["a-top"] } } });
    expect(io.writes).toEqual([]);
    const text = await cli(["parts", "remove", SHELF, "a-top", "--dry-run"], io);
    expect(text.stdout).toMatch(/^Dry run: Removed part a-top/);
    expect(text.stdout).toContain("Nothing was written (--dry-run).");
  });

  it("reads stdin and writes the project to stdout", async () => {
    const io = memoryIo({}, example(SHELF_FILE));
    const result = await cli(["parts", "remove", "-", "a-top"], io);
    expect(result.code).toBe(0);
    const out = parseProject(result.stdout);
    expect(out.ok && out.project.parts.some((p) => p.id === "a-top")).toBe(false);
    expect(result.stderr).toContain("Removed part a-top");
    const json = await cli(["parts", "remove", "-", "a-top", "--json"], io);
    expect(json.json()).toMatchObject({ ok: true, written: "-", project: { format: "opencutplan" } });
  });

  it("writes to another file with --out", async () => {
    const io = withExamples();
    const before = io.files.get(SHELF);
    const result = await cli(["parts", "remove", SHELF, "a-top", "--out", "copy.json", "--json"], io);
    expect(result.json().written).toBe("copy.json");
    expect(io.files.get(SHELF)).toBe(before);
    expect(result.file("copy.json").parts.some((p) => p.id === "a-top")).toBe(false);
  });

  it("imports a parts CSV and creates the materials it names", async () => {
    const io = await newProject();
    io.files.set("parts.csv", example("csv/living-room-shelf-parts.csv"));
    const result = await cli(["parts", "import", "p.json", "parts.csv", "--json"], io);
    expect(result.code).toBe(0);
    const data = result.json();
    expect(data.imported).toBe(20);
    expect(data.ids.slice(0, 2)).toEqual(["a-top", "a-bottom"]);
    expect(data.createdMaterials.map((m: { name: string }) => m.name)).toEqual(["Baltic birch 18mm", "Baltic birch 6mm"]);
    expect(data.csvIssues).toEqual([]);
    expect(result.file("p.json").parts).toHaveLength(20);
  });

  it("asks for a column map when it cannot find the lengths, and uses --map", async () => {
    const io = await newProject("mm");
    io.files.set("cut.csv", "Teil,Lang (cm),Breit (cm),Stk\nBoden,80,40,2\nSeite,72,40,x\n");
    const unmapped = await cli(["parts", "import", "p.json", "cut.csv", "--json"], io);
    expect(unmapped.code).toBe(1);
    expect(unmapped.json()).toMatchObject({ ok: false, error: { code: "needs-mapping" }, missing: ["length", "width"], headers: ["Teil", "Lang (cm)", "Breit (cm)", "Stk"] });
    const mapped = await cli(["parts", "import", "p.json", "cut.csv", "--map", "name=Teil", "--map", "length=2", "--map", "width=Breit (cm)", "--material", "Birke", "--json"], io);
    expect(mapped.code).toBe(0);
    expect(mapped.json().imported).toBe(1);
    expect(mapped.json().csvIssues).toEqual([expect.objectContaining({ severity: "error", row: 3, column: "quantity" })]);
    expect(mapped.file("p.json").parts[0]).toMatchObject({ name: "Boden", length: 800, width: 400, quantity: 2, material: "birke" });
    const bad = await cli(["parts", "import", "p.json", "cut.csv", "--map", "size=2"], io);
    expect(bad.code).toBe(2);
  });

  it("fails an import with row errors under --strict", async () => {
    const io = await newProject("mm");
    io.files.set("cut.csv", "name,length,width,quantity\nA,100,50,1\nB,oops,50,1\n");
    const result = await cli(["parts", "import", "p.json", "cut.csv", "--strict", "--json"], io);
    expect(result.code).toBe(1);
    expect(result.json().error.code).toBe("strict");
    expect(result.file("p.json").parts).toEqual([]);
  });

  it("exports the parts CSV to stdout or a file", async () => {
    const io = withExamples();
    const out = await cli(["parts", "export", SHELF], io);
    const project = parseProject(example(SHELF_FILE));
    expect(project.ok && out.stdout === exportPartsCsv(project.project)).toBe(true);
    const file = await cli(["parts", "export", SHELF, "--out", "parts.csv", "--json"], io);
    expect(file.json()).toMatchObject({ ok: true, path: "parts.csv" });
    expect(io.files.get("parts.csv")).toBe(out.stdout);
  });
});
