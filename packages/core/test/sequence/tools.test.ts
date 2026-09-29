import { describe, expect, it } from "vitest";
import { assignTool, cutKind, toolCanCut, type CutGeometry, type Rect, type Tool } from "../../src/index.ts";

const r = (x: number, y: number, length: number, width: number): Rect => ({ x, y, length, width });

const rip: CutGeometry = { axis: "y", stage: 1, length: 96, piece: r(0, 0, 96, 48), released: r(0, 0, 96, 15), remainder: r(0, 15.125, 96, 32.875) };
const crosscut: CutGeometry = { axis: "x", stage: 2, length: 15, piece: r(0, 0, 96, 15), released: r(0, 0, 30, 15), remainder: r(30.125, 0, 65.875, 15) };

const tableSaw = (limits: Partial<Extract<Tool, { type: "table-saw" }>> = {}): Tool => ({
  id: "ts",
  name: "Table saw",
  type: "table-saw",
  kerf: 0.125,
  enabled: true,
  ...limits,
});

describe("cutKind", () => {
  it("names rips, crosscuts, and trims", () => {
    expect(cutKind("y", false)).toBe("rip");
    expect(cutKind("x", false)).toBe("crosscut");
    expect(cutKind("x", true)).toBe("trim");
  });
});

describe("toolCanCut", () => {
  it("rips on a table saw with the released side at the fence when it fits", () => {
    expect(toolCanCut(tableSaw({ maxRip: 24 }), rip, true)).toBe("released");
  });

  it("puts the remainder at the fence when only it fits the rip capacity", () => {
    const wide = { ...rip, released: r(0, 0, 96, 40), remainder: r(0, 40.125, 96, 7.875) };
    expect(toolCanCut(tableSaw({ maxRip: 24 }), wide, true)).toBe("remainder");
    expect(toolCanCut(tableSaw({ maxRip: 6 }), wide, true)).toBeNull();
  });

  it("limits table saw crosscuts by cut length", () => {
    expect(toolCanCut(tableSaw({ maxCrosscut: 24 }), crosscut, true)).toBe("released");
    expect(toolCanCut(tableSaw({ maxCrosscut: 12 }), crosscut, true)).toBeNull();
  });

  it("limits the piece a table saw can handle, in either orientation", () => {
    expect(toolCanCut(tableSaw({ maxPiece: { length: 48, width: 96 } }), rip, true)).toBe("released");
    expect(toolCanCut(tableSaw({ maxPiece: { length: 60, width: 30 } }), rip, true)).toBeNull();
  });

  it("limits track and circular saws by cut length", () => {
    const track: Tool = { id: "t", name: "Track saw", type: "track-saw", kerf: 0.0625, enabled: true, maxCut: 55 };
    const circular: Tool = { id: "c", name: "Circular saw", type: "circular-saw", kerf: 0.0625, enabled: true, maxCut: 100 };
    expect(toolCanCut(track, rip, true)).toBeNull();
    expect(toolCanCut(track, crosscut, true)).toBe("released");
    expect(toolCanCut(circular, rip, true)).toBe("released");
  });

  it("limits panel saws by cut length and stage", () => {
    const panel: Tool = { id: "p", name: "Panel saw", type: "panel-saw", kerf: 0.125, enabled: true, maxCut: 100, maxStages: 1 };
    expect(toolCanCut(panel, rip, true)).toBe("released");
    expect(toolCanCut(panel, crosscut, true)).toBeNull();
  });

  it("measures the remainder when the released side has zero size", () => {
    const sliver = { ...rip, released: r(0, 15, 96, 0), remainder: r(0, 15.0625, 96, 32.9375) };
    expect(toolCanCut(tableSaw({ maxRip: 40 }), sliver, true)).toBe("remainder");
    expect(toolCanCut(tableSaw({ maxRip: 24 }), sliver, true)).toBeNull();
    const track: Tool = { id: "t", name: "Track saw", type: "track-saw", kerf: 0.0625, enabled: true };
    expect(toolCanCut(track, sliver, true)).toBe("remainder");
    expect(toolCanCut(tableSaw({ maxRip: 24 }), sliver, false)).toBe("remainder");
    expect(toolCanCut(tableSaw({ maxRip: 24 }), { ...sliver, kind: "trim" }, true)).toBe("released");
  });

  it("ignores every limit when tool limits are off", () => {
    expect(toolCanCut(tableSaw({ maxRip: 1, maxCrosscut: 1 }), rip, false)).toBe("released");
  });
});

describe("assignTool", () => {
  it("picks the first capable tool in profile order", () => {
    const track: Tool = { id: "track", name: "Track saw", type: "track-saw", kerf: 0.0625, enabled: true };
    const small = tableSaw({ maxCrosscut: 12 });
    expect(assignTool([small, track], crosscut, true)).toEqual({ tool: track, side: "released" });
    expect(assignTool([small, track], rip, true)).toEqual({ tool: small, side: "released" });
    expect(assignTool([small], crosscut, true)).toBeNull();
    expect(assignTool([], rip, false)).toBeNull();
  });
});
