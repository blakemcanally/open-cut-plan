import { analyzeProject, buildJsonSchema, defaultTools, formatLength, FORMAT_VERSION, parseProject, totalCutLength, type Project } from "@opencutplan/core";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLI_VERSION } from "../src/run.ts";
import { cli, example, memoryIo, SHELF, withExamples } from "./helpers.ts";

describe("new", () => {
  it("creates a project with a table saw, a track saw, and the factory edges", async () => {
    const result = await cli(["new", "a.cutplan.json", "--name", "Shelf", "--units", "in", "--json"]);
    expect(result.code).toBe(0);
    expect(result.json()).toMatchObject({ ok: true, command: "new", file: "a.cutplan.json", written: "a.cutplan.json", dryRun: false });
    const project = result.file("a.cutplan.json");
    expect(project.project).toEqual({ name: "Shelf", units: "in" });
    expect(project.settings.trim).toBe(0);
    expect(project.tools).toEqual(defaultTools("in"));
    expect(project.materials).toEqual([]);
  });

  it("uses the millimetre kerf in a mm project", async () => {
    const result = await cli(["new", "a.cutplan.json", "--name", "Box", "--units", "mm"]);
    expect(result.stdout).toBe('Created a.cutplan.json: "Box" (mm).\n');
    expect(result.file("a.cutplan.json").tools[0]!.kerf).toBe(3);
  });

  it("refuses to replace a file unless --force is given", async () => {
    const io = memoryIo({ "a.cutplan.json": "old" });
    const refused = await cli(["new", "a.cutplan.json", "--name", "X", "--units", "in", "--json"], io);
    expect(refused.code).toBe(2);
    expect(refused.json()).toMatchObject({ ok: false, error: { code: "file-exists" } });
    expect(io.files.get("a.cutplan.json")).toBe("old");
    const forced = await cli(["new", "a.cutplan.json", "--name", "X", "--units", "in", "--force"], io);
    expect(forced.code).toBe(0);
    expect(forced.file("a.cutplan.json").project.name).toBe("X");
  });

  it("prints the project to stdout with -", async () => {
    const result = await cli(["new", "-", "--name", "X", "--units", "mm"]);
    expect(JSON.parse(result.stdout)).toMatchObject({ format: "opencutplan", project: { name: "X", units: "mm" } });
    expect(result.stderr).toContain("Created a project");
  });

  it("writes nothing with --dry-run", async () => {
    const result = await cli(["new", "a.cutplan.json", "--name", "X", "--units", "in", "--dry-run", "--json"]);
    expect(result.json()).toMatchObject({ ok: true, written: null, dryRun: true, project: { project: { name: "X" } } });
    expect(result.io.writes).toEqual([]);
  });

  it("rejects bad units and missing options as usage errors", async () => {
    const units = await cli(["new", "a.cutplan.json", "--name", "X", "--units", "cm", "--json"]);
    expect(units.code).toBe(2);
    expect(units.json().error).toMatchObject({ code: "invalid-value", option: "units" });
    const missing = await cli(["new", "a.cutplan.json", "--units", "in", "--json"]);
    expect(missing.code).toBe(2);
    expect(missing.json().error).toMatchObject({ code: "missing-option", option: "name" });
  });
});

function shelfProject(): Project {
  const parsed = parseProject(example(SHELF));
  if (!parsed.ok) throw new Error("shelf");
  return parsed.project;
}

describe("show", () => {
  it("summarizes the example project", async () => {
    const result = await cli(["show", "shelf.cutplan.json", "--json"], withExamples());
    expect(result.code).toBe(0);
    const data = result.json();
    expect(data).toMatchObject({ ok: true, command: "show", name: "Living room shelf", units: "in", version: "1.10" });
    expect(data.counts).toMatchObject({ materials: 2, stock: 2, parts: 20, tools: 1, enabledTools: 1, sheets: 7, pinnedSheets: 0 });
    expect(data.copies.total).toBe(data.counts.copies);
    expect(data.copies.placed + data.copies.unplaced).toBe(data.copies.total);
    expect(data.issues).toEqual({ errors: 0, warnings: 0 });
    expect(data.totals).toMatchObject({ currency: "USD", sheetsToBuy: 7, cost: null, missingPrices: ["bb18-5x5", "bb6-5x5"] });
    expect(data.totals.cutLength).toBeCloseTo(totalCutLength(analyzeProject(shelfProject()).steps), 9);
  });

  it("prints a short readable summary", async () => {
    const result = await cli(["show", "shelf.cutplan.json"], withExamples());
    expect(result.stdout).toMatch(/^Living room shelf \(in\)\n/);
    expect(result.stdout).toContain("Issues: 0 errors, 0 warnings.");
    const project = shelfProject();
    const { steps } = analyzeProject(project);
    expect(result.stdout).toContain(`${steps.length} cut steps. The total cut length is ${formatLength(totalCutLength(steps), "in", project.settings.display)}.`);
    expect(result.stderr).toBe("");
  });

  it("reads the project from stdin", async () => {
    const result = await cli(["show", "-", "--json"], memoryIo({}, example(SHELF)));
    expect(result.json()).toMatchObject({ ok: true, name: "Living room shelf" });
  });

  it("exits 3 for a missing or unreadable file", async () => {
    const missing = await cli(["show", "nope.cutplan.json", "--json"]);
    expect(missing.code).toBe(3);
    expect(missing.json()).toEqual({ ok: false, command: "show", error: { code: "file-not-found", message: "The file nope.cutplan.json does not exist.", path: "nope.cutplan.json" } });
    const broken = await cli(["show", "x.json"], memoryIo({ "x.json": "{ not json" }));
    expect(broken.code).toBe(3);
    expect(broken.stdout).toBe("");
    expect(broken.stderr).toMatch(/^error: x\.json is not a readable OpenCutPlan project: The file is not valid JSON/);
  });

  it("sends file warnings to stderr and into the envelope", async () => {
    const newer = example(SHELF).replace('"version": "1.10"', '"version": "1.11"');
    const result = await cli(["show", "x.json", "--json"], memoryIo({ "x.json": newer }));
    expect(result.code).toBe(0);
    expect(result.json().warnings).toEqual([expect.stringContaining("newer than this app")]);
    expect(result.stderr).toContain("warning: version: This file uses format version 1.11");
  });
});

describe("validate", () => {
  it("passes a valid project", async () => {
    const result = await cli(["validate", "shelf.cutplan.json", "--json"], withExamples());
    expect(result.code).toBe(0);
    expect(result.json()).toMatchObject({ ok: true, valid: true, errors: 0, warnings: 0, fileIssues: [], planIssues: [] });
  });

  it("exits 1 for plan errors and lists them", async () => {
    const project = JSON.parse(example(SHELF));
    project.plan.sheets[0].placements[0].x = 50;
    const result = await cli(["validate", "x.json", "--json"], memoryIo({ "x.json": JSON.stringify(project) }));
    expect(result.code).toBe(1);
    const data = result.json();
    expect(data).toMatchObject({ ok: false, valid: false, error: { code: "invalid" } });
    expect(data.planIssues.map((issue: { code: string }) => issue.code)).toContain("off-sheet");
    expect(data.errors).toBeGreaterThan(0);
  });

  it("reports format errors with exit 1", async () => {
    const project = JSON.parse(example(SHELF));
    project.parts[1].id = project.parts[0].id;
    const result = await cli(["validate", "x.json"], memoryIo({ "x.json": JSON.stringify(project) }));
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("error duplicate-id: parts[1].id:");
    expect(result.stdout).toContain("not a readable project");
    expect(result.stderr).toMatch(/^error: x\.json has 1 error/);
  });

  it("treats warnings as errors with --strict", async () => {
    const project = JSON.parse(example(SHELF));
    project.plan.sheets[0].placements.pop();
    const io = memoryIo({ "x.json": JSON.stringify(project) });
    expect((await cli(["validate", "x.json"], io)).code).toBe(0);
    const strict = await cli(["validate", "x.json", "--strict", "--json"], io);
    expect(strict.code).toBe(1);
    expect(strict.json().planIssues[0]).toMatchObject({ severity: "warning", code: "unplaced" });
  });
});

describe("schema", () => {
  it("prints the JSON schema, the same as the repository file", async () => {
    const result = await cli(["schema"]);
    const file = readFileSync(new URL("../../../schema/cutplan.schema.json", import.meta.url), "utf8");
    expect(result.stdout).toBe(file);
    const json = await cli(["schema", "--json"]);
    expect(json.json()).toEqual({ ok: true, command: "schema", schema: buildJsonSchema() });
  });
});

describe("version", () => {
  it("prints the CLI and format versions", async () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
    expect(CLI_VERSION).toBe(pkg.version);
    expect((await cli(["version", "--json"])).json()).toEqual({ ok: true, command: "version", version: CLI_VERSION, format: FORMAT_VERSION });
    expect((await cli(["--version"])).stdout).toBe(`opencutplan ${CLI_VERSION} (file format ${FORMAT_VERSION})\n`);
  });
});

describe("command line", () => {
  it("exits 2 for an unknown command or option", async () => {
    const command = await cli(["frobnicate", "--json"]);
    expect(command.code).toBe(2);
    expect(command.json()).toMatchObject({ ok: false, command: null, error: { code: "unknown-command" } });
    const option = await cli(["show", "shelf.cutplan.json", "--colour", "red", "--json"], withExamples());
    expect(option.code).toBe(2);
    expect(option.json()).toMatchObject({ ok: false, command: "show", error: { code: "bad-option" } });
    const extra = await cli(["show", "a", "b"]);
    expect(extra.code).toBe(2);
    expect(extra.stderr).toMatch(/^error: Too many arguments: b\./);
  });

  it("prints the main help to stderr with exit 2 when no command is given", async () => {
    const result = await cli([]);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Usage: opencutplan <command>");
  });
});
