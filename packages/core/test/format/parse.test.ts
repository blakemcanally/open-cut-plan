import { describe, expect, it } from "vitest";
import { formatPath, MAX_PART_QUANTITY, parseProject, serializeProject, type ParseResult } from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

function errors(result: ParseResult) {
  if (result.ok) throw new Error("expected the parse to fail");
  return result.errors;
}

describe("parseProject", () => {
  it("reads a serialized project back unchanged", () => {
    const project = sampleProject();
    expect(parseProject(serializeProject(project))).toEqual({ ok: true, project, warnings: [] });
  });

  it("reads a file that starts with a byte order mark", () => {
    const result = parseProject(`\uFEFF${serializeProject(sampleProject())}`);
    expect(result.ok).toBe(true);
  });

  it("reports invalid JSON", () => {
    const [issue] = errors(parseProject("{ not json"));
    expect(issue).toMatchObject({ code: "json", severity: "error" });
    expect(issue!.message).toMatch(/^The file is not valid JSON: /);
  });

  it("gives a sheet with a duplicate id a new id, so edits change one sheet", () => {
    const project = sampleProject();
    const sheets = [...project.plan!.sheets, { id: "s1", stock: "ply-4x8", placements: [] }, { id: "s1-2", stock: "ply-4x8", placements: [] }];
    const result = parseProject(serializeProject({ ...project, plan: { sheets } }));
    if (!result.ok) throw new Error("expected the file to load");
    expect(result.project.plan!.sheets.map((sheet) => sheet.id)).toEqual(["s1", "s1-3", "s1-2"]);
    expect(result.warnings).toEqual([
      {
        severity: "warning",
        code: "duplicate-id",
        message: 'The id "s1" is used more than once in plan.sheets, so sheet 2 is now "s1-3".',
        path: ["plan", "sheets", 1, "id"],
      },
    ]);
  });

  it("reports a part quantity above the limit", () => {
    const project = sampleProject();
    const text = serializeProject({ ...project, parts: project.parts.map((part) => ({ ...part, quantity: MAX_PART_QUANTITY + 1 })) });
    expect(errors(parseProject(text))[0]).toMatchObject({ severity: "error", path: ["parts", 0, "quantity"] });
  });

  it("reports a value that is not an object", () => {
    expect(errors(parseProject("[1, 2]"))[0]).toMatchObject({ code: "format", message: "The file does not contain a JSON object." });
  });

  it("reports a different format", () => {
    expect(errors(parseProject({ format: "cutlist", version: "1.0" }))[0]).toMatchObject({
      code: "format",
      message: 'This is not an OpenCutPlan file (format is "cutlist").',
      path: ["format"],
    });
  });

  it("refuses an unknown major version", () => {
    const doc = { ...sampleProject(), version: "2.0" };
    expect(errors(parseProject(doc))[0]).toMatchObject({
      code: "version",
      message: "This file uses format version 2.0. This app reads version 1.x files.",
    });
  });

  it("refuses a malformed version", () => {
    expect(errors(parseProject({ ...sampleProject(), version: "1" }))[0]).toMatchObject({ code: "version", path: ["version"] });
  });

  it("reports schema errors with their path", () => {
    const project = sampleProject();
    const doc = { ...project, parts: [{ ...project.parts[0]!, length: -3 }] };
    expect(errors(parseProject(doc))[0]).toMatchObject({
      code: "schema",
      path: ["parts", 0, "length"],
      message: "parts[0].length: Too small: expected number to be >0",
    });
  });

  it("loads a file with plan reference problems, reports them as warnings, and keeps the plan", () => {
    const project = sampleProject();
    project.plan!.sheets[0]!.placements[1]!.copy = 5;
    project.plan!.sheets[0]!.stock = "gone";
    const result = parseProject(serializeProject(project));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.map((issue) => [issue.severity, issue.code])).toEqual([
      ["warning", "bad-ref"],
      ["warning", "bad-copy"],
    ]);
    expect(result.project).toEqual(project);
  });

  it("refuses a part with a missing material", () => {
    const project = sampleProject();
    project.parts[0]!.material = "oak";
    project.plan!.sheets[0]!.stock = "gone";
    const result = parseProject(project);
    expect(errors(result)).toEqual([
      { severity: "error", code: "bad-ref", message: 'Part "Side" uses material "oak", which does not exist.', path: ["parts", 0, "material"] },
    ]);
    expect(result.warnings.map((issue) => issue.code)).toEqual(["bad-ref"]);
  });

  it.each(["2026-09-27", "2026-09-27T10:00:00", "2026-09-27T10:00:00Z", "yesterday"])("loads the timestamp %j", (timestamp) => {
    const project = sampleProject();
    project.project.created = timestamp;
    project.project.modified = timestamp;
    expect(parseProject(project).ok).toBe(true);
  });

  it("applies defaults to a minimal file", () => {
    const result = parseProject({
      format: "opencutplan",
      version: "1.0",
      project: { name: "Minimal", units: "mm" },
      materials: [],
      stock: [],
      parts: [],
      tools: [],
    });
    expect(result.ok && result.project.settings.features.cutOrder).toBe(true);
  });

  it.each(["1.0", "1.1"])("loads a %s file as version 1.5 with the default goal and no warnings", (version) => {
    const doc = JSON.parse(serializeProject(sampleProject()));
    doc.version = version;
    delete doc.settings.optimizer.goal;
    delete doc.settings.optimizer.extraCostPercent;
    delete doc.settings.optimizer.keepGroupsTogether;
    const result = parseProject(doc);
    expect(result.ok && result.project.version).toBe("1.5");
    expect(result.ok && result.project.settings.optimizer).toMatchObject({ goal: "cost", extraCostPercent: 10, keepGroupsTogether: true });
    expect(result.warnings).toEqual([]);
  });

  it("loads a 1.4 file as version 1.5 and keeps the groups together by default", () => {
    const doc = JSON.parse(serializeProject(sampleProject()));
    doc.version = "1.4";
    delete doc.settings.optimizer.keepGroupsTogether;
    const result = parseProject(doc);
    expect(result.ok && result.project.version).toBe("1.5");
    expect(result.ok && result.project.settings.optimizer.keepGroupsTogether).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("keeps the setting to keep groups together off, and refuses a value that is not true or false", () => {
    const doc = JSON.parse(serializeProject(sampleProject()));
    doc.settings.optimizer.keepGroupsTogether = false;
    const result = parseProject(doc);
    expect(result.ok && result.project.settings.optimizer.keepGroupsTogether).toBe(false);
    doc.settings.optimizer.keepGroupsTogether = "yes";
    expect(parseProject(doc).ok).toBe(false);
  });

  it("keeps an optimizer goal that it does not know, and writes it back", () => {
    const doc = JSON.parse(serializeProject(sampleProject()));
    doc.settings.optimizer.goal = "time";
    const result = parseProject(doc);
    expect(result.ok && result.warnings).toEqual([]);
    if (!result.ok) return;
    expect(JSON.parse(serializeProject(result.project)).settings.optimizer.goal).toBe("time");
  });

  it.each([-1, 101, "10"])("refuses the extra cost percent %j", (value) => {
    const doc = JSON.parse(serializeProject(sampleProject()));
    doc.settings.optimizer.extraCostPercent = value;
    expect(parseProject(doc).ok).toBe(false);
  });

  it("loads a newer minor version with a warning and keeps every unknown field on re-save", () => {
    const project = sampleProject();
    const doc = JSON.parse(serializeProject(project));
    doc.version = "1.6";
    doc.future = { x: 1 };
    doc.parts[0].edgeBanding = { top: "birch", bottom: null };
    doc.stock[0].supplier = "Local yard";
    doc.settings.features.newThing = true;
    doc.plan.sheets[0].placements[0].label = "S1-A";
    doc.extensions = { "com.example.tool": { ids: [1, 2, 3] } };

    const result = parseProject(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([
      {
        severity: "warning",
        code: "newer-minor",
        message: "This file uses format version 1.6, which is newer than this app (1.5). Unknown fields are kept but ignored.",
        path: ["version"],
      },
    ]);
    expect(JSON.parse(serializeProject(result.project))).toEqual(doc);
  });
});

describe("formatPath", () => {
  it.each([
    [["parts", 0, "length"], "parts[0].length"],
    [["version"], "version"],
    [[], "(root)"],
  ] as const)("%j is %s", (path, expected) => {
    expect(formatPath(path)).toBe(expected);
  });
});
