import { analyzeProject, parseProject } from "@opencutplan/core";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../src/examples.ts";

describe("EXAMPLES", () => {
  it("lists the design examples, and each example opens with no warnings or errors", () => {
    expect(EXAMPLES.map((example) => example.slug)).toEqual(["living-room-shelf", "simple-bookcase-mm", "kallax-2x4-mm", "kallax-4x2-combined-mm", "eket-wall-in"]);
    for (const example of EXAMPLES) {
      const result = parseProject(example.text);
      if (!result.ok) throw new Error(`${example.slug}: ${result.errors.map((issue) => issue.message).join(" ")}`);
      expect(result.warnings).toEqual([]);
      expect(analyzeProject(result.project).issues.filter((issue) => issue.severity === "error")).toEqual([]);
    }
  });
});
