import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildJsonSchema } from "../../src/index.ts";

describe("buildJsonSchema", () => {
  const schema = buildJsonSchema();

  it("targets draft 2020-12", () => {
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.title).toBe("OpenCutPlan project");
  });

  it("requires only the fields without defaults", () => {
    expect(schema.required).toEqual(["format", "version", "project", "materials", "stock", "parts", "tools"]);
  });

  it("matches the checked-in schema/cutplan.schema.json (run `npm run schema` to update)", () => {
    const file = JSON.parse(readFileSync(new URL("../../../../schema/cutplan.schema.json", import.meta.url), "utf8"));
    expect(file).toEqual(schema);
  });
});
