import { describe, expect, it } from "vitest";
import { fileBase, projectFileName } from "../../src/index.ts";

describe("file names", () => {
  it("replaces characters that file systems refuse", () => {
    expect(fileBase(" Shelf: v2/final ")).toBe("Shelf- v2-final");
    expect(fileBase("")).toBe("project");
    expect(projectFileName("Shelf")).toBe("Shelf.cutplan.json");
  });
});
