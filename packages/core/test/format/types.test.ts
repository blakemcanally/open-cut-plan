import { describe, expect, it } from "vitest";
import type { Part, Project, ProjectInput, Stock, Tool } from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

describe("public types", () => {
  it("reject misspelled field names", () => {
    const project: Project = sampleProject();
    const part: Part = project.parts[0]!;
    // @ts-expect-error -- `gorup` is not a Part field
    const typo: Part = { ...part, gorup: "x" };
    // @ts-expect-error -- `lenght` is not a Part field
    const misspelled = part.lenght;
    // @ts-expect-error -- `stok` is not a Project field
    const stock = project.stok;
    // @ts-expect-error -- a track saw has no `maxRip`
    const saw: Tool = { id: "t", name: "Track saw", type: "track-saw", kerf: 0.0625, enabled: true, maxRip: 30 };
    expect([typo.name, misspelled, stock, saw.type]).toEqual(["Side", undefined, undefined, "track-saw"]);
  });

  it("keep optional fields, nullable fields, and extensions", () => {
    const part: Part = { id: "p", name: "P", material: "ply", length: 1, width: 1, quantity: 1, grain: "none" };
    const stock: Stock = { id: "s", material: "ply", length: 96, width: 48, quantity: null, kind: "sheet" };
    const input: ProjectInput = {
      format: "opencutplan",
      version: "1.0",
      project: { name: "Minimal", units: "mm" },
      materials: [],
      stock: [stock],
      parts: [part],
      tools: [],
      extensions: { "com.example.tool": { ids: [1] } },
    };
    expect(input.parts[0]!.group).toBeUndefined();
  });
});
