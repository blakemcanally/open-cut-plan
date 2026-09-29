import { describe, expect, it } from "vitest";
import { errorMessage } from "../src/index.ts";

describe("errorMessage", () => {
  it("gives the message of an Error and the text of any other thrown value", () => {
    expect(errorMessage(new TypeError("bad"))).toBe("bad");
    expect(errorMessage("plain text")).toBe("plain text");
    expect(errorMessage(null)).toBe("null");
    expect(errorMessage(undefined)).toBe("undefined");
  });
});
