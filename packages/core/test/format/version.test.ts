import { describe, expect, it } from "vitest";
import { FORMAT_VERSION, migrate, parseVersion, SUPPORTED_MAJOR, SUPPORTED_MINOR } from "../../src/index.ts";

describe("parseVersion", () => {
  it("reads MAJOR.MINOR", () => {
    expect(parseVersion("1.0")).toEqual({ major: 1, minor: 0 });
    expect(parseVersion("2.13")).toEqual({ major: 2, minor: 13 });
  });

  it.each([1, "1", "1.0.0", "v1.0", null, undefined])("rejects %j", (value) => {
    expect(parseVersion(value)).toBeNull();
  });

  it("agrees with FORMAT_VERSION", () => {
    expect(FORMAT_VERSION).toBe(`${SUPPORTED_MAJOR}.${SUPPORTED_MINOR}`);
  });
});

describe("migrate", () => {
  it("leaves a current document unchanged", () => {
    const doc = { version: "1.6", a: 1 };
    expect(migrate(doc)).toEqual(doc);
  });

  it("applies each migration in order and updates the version", () => {
    const migrations = {
      0: (doc: Record<string, unknown>) => ({ ...doc, b: 2 }),
      1: (doc: Record<string, unknown>) => ({ ...doc, c: (doc.b as number) + 1 }),
    };
    expect(migrate({ version: "1.0", a: 1 }, migrations, 2)).toEqual({ version: "1.2", a: 1, b: 2, c: 3 });
  });

  it("leaves a newer minor version alone", () => {
    expect(migrate({ version: "1.7", a: 1 })).toEqual({ version: "1.7", a: 1 });
  });
});
