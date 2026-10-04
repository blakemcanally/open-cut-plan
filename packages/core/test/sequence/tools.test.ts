import { describe, expect, it } from "vitest";
import { assignTool, cutKind, toolCanCut, toolLimit, type CutGeometry, type Rect, type Tool } from "../../src/index.ts";

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

  it("limits the piece for a crosscut apart from the piece for a rip", () => {
    const sled = tableSaw({ maxCrosscut: 24, maxPiece: { length: 96, width: 48 }, maxCrosscutPiece: { length: 48, width: 30 } });
    expect(toolCanCut(sled, rip, true)).toBe("released");
    expect(toolLimit(sled, crosscut, true)).toBe("maxCrosscutPiece");
    const short = { ...crosscut, piece: r(0, 0, 40, 15), remainder: r(30.125, 0, 9.875, 15) };
    expect(toolCanCut(sled, short, true)).toBe("released");
    expect(toolLimit(tableSaw({ maxCrosscutPiece: { length: 30, width: 96 } }), crosscut, true)).toBeNull();
  });

  it("uses the rip piece for a crosscut when the crosscut piece has no limit, as files before 1.8 do", () => {
    const old = tableSaw({ maxCrosscut: 24, maxPiece: { length: 60, width: 30 } });
    expect(toolLimit(old, crosscut, true)).toBe("maxPiece");
    expect(toolLimit(old, { ...crosscut, piece: r(0, 0, 40, 15) }, true)).toBeNull();
  });

  it("crosscuts on a mitre saw up to its widest cut, on a piece of any length, and never rips", () => {
    const miter: Tool = { id: "m", name: "Mitre saw", type: "miter-saw", kerf: 0.125, enabled: true, maxCut: 14 };
    expect(toolLimit(miter, rip, true)).toBe("crosscutOnly");
    expect(toolLimit(miter, { ...rip, length: 10, piece: r(0, 0, 10, 48) }, true)).toBe("crosscutOnly");
    expect(toolLimit(miter, crosscut, true)).toBe("maxCut");
    const narrow = { ...crosscut, length: 11.5, piece: r(0, 0, 96, 11.5), released: r(0, 0, 30, 11.5), remainder: r(30.125, 0, 65.875, 11.5) };
    expect(toolCanCut(miter, narrow, true)).toBe("released");
    expect(toolCanCut(miter, rip, false)).toBe("released");
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

  it("sends a long strip crosscut to the track saw or the mitre saw when it is over the crosscut piece of the table saw", () => {
    const strip: CutGeometry = { axis: "x", stage: 2, length: 15.75, piece: r(0, 0, 96, 15.75), released: r(0, 0, 30, 15.75), remainder: r(30.125, 0, 65.875, 15.75) };
    const table = tableSaw({ maxRip: 24, maxCrosscut: 24, maxPiece: { length: 96, width: 24 }, maxCrosscutPiece: { length: 48, width: 24 } });
    const track: Tool = { id: "track", name: "Track saw", type: "track-saw", kerf: 0.0625, enabled: true, maxCut: 110 };
    const miter: Tool = { id: "m", name: "Mitre saw", type: "miter-saw", kerf: 0.125, enabled: true, maxCut: 16 };
    expect(assignTool([table, miter, track], strip, true)?.tool.id).toBe("m");
    expect(assignTool([table, track], strip, true)?.tool.id).toBe("track");
    expect(assignTool([table, track], { ...strip, piece: r(0, 0, 40, 15.75) }, true)?.tool.id).toBe("ts");
  });
});
