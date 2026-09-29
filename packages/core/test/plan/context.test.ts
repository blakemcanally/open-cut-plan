import { describe, expect, it } from "vitest";
import {
  canRotate,
  copyLabel,
  DEFAULT_MIN_OFFCUT,
  formatSize,
  grainOk,
  isOffcutSize,
  placedRect,
  planContext,
  stockLabel,
  trimFor,
  usableRect,
  type Project,
} from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

function project(patch: (p: Project) => void = () => {}): Project {
  const p = sampleProject();
  patch(p);
  return p;
}

describe("planContext", () => {
  it("uses the largest kerf among enabled tools", () => {
    const ctx = planContext(
      project((p) => {
        p.tools.push({ id: "track", name: "Track saw", type: "track-saw", kerf: 0.0625, enabled: true });
        p.tools.push({ id: "old", name: "Old saw", type: "circular-saw", kerf: 0.25, enabled: false });
      }),
    );
    expect(ctx.kerf).toBe(0.125);
    expect(ctx.tools.map((tool) => tool.id)).toEqual(["ts", "track"]);
  });

  it("uses kerf 0 when the kerf feature is off or no tool is enabled", () => {
    expect(planContext(project((p) => (p.settings.features.kerf = false))).kerf).toBe(0);
    expect(planContext(project((p) => (p.tools[0]!.enabled = false))).kerf).toBe(0);
  });

  it("defaults the minimum offcut by units", () => {
    expect(planContext(project()).minOffcut).toEqual(DEFAULT_MIN_OFFCUT.in);
    expect(planContext(project((p) => (p.settings.minOffcut = { length: 20, width: 10 }))).minOffcut).toEqual({ length: 20, width: 10 });
  });

  it("resolves trim from the stock, then settings, and 0 when the trim feature is off", () => {
    const p = project();
    const stock = p.stock[0]!;
    expect(trimFor(planContext(p), stock)).toBe(0.25);
    expect(trimFor(planContext(p), { ...stock, trim: 0.5 })).toBe(0.5);
    p.settings.features.trim = false;
    expect(trimFor(planContext(p), { ...stock, trim: 0.5 })).toBe(0);
    expect(usableRect(planContext(p), stock)).toEqual({ x: 0, y: 0, length: 96, width: 48 });
  });

  it("swaps length and width for rotated placements", () => {
    const part = project().parts[0]!;
    expect(placedRect(part, { part: "side", copy: 0, x: 1, y: 2, rotated: false })).toEqual({ x: 1, y: 2, length: 30, width: 12 });
    expect(placedRect(part, { part: "side", copy: 0, x: 1, y: 2, rotated: true })).toEqual({ x: 1, y: 2, length: 12, width: 30 });
  });

  it("allows rotation only when grain does not constrain the part", () => {
    const p = project();
    const part = p.parts[0]!;
    expect(canRotate(planContext(p), part)).toBe(false);
    expect(canRotate(planContext(p), { ...part, grain: "none" })).toBe(true);
    expect(grainOk(planContext(p), part, false)).toBe(true);
    expect(grainOk(planContext(p), part, true)).toBe(false);
    expect(grainOk(planContext(p), { ...part, grain: "width" }, true)).toBe(true);
    p.materials[0]!.grained = false;
    expect(canRotate(planContext(p), part)).toBe(true);
    p.materials[0]!.grained = true;
    p.settings.features.grain = false;
    expect(grainOk(planContext(p), part, true)).toBe(true);
  });

  it("labels copies, sizes, and stock", () => {
    const p = project();
    const ctx = planContext(p);
    expect(copyLabel(p.parts[0]!, 1)).toBe("Side 2");
    expect(copyLabel({ ...p.parts[0]!, quantity: 1 }, 0)).toBe("Side");
    expect(formatSize(ctx, { length: 15.375, width: 12 })).toBe('15 3/8" × 12"');
    expect(stockLabel(ctx, p.stock[0]!)).toBe('Plywood 3/4 96" × 48"');
    expect(stockLabel(ctx, { ...p.stock[0]!, name: "Shop plywood" })).toBe("Shop plywood");
  });

  it("sizes offcuts against the minimum in either orientation", () => {
    const p = project();
    expect(isOffcutSize(planContext(p), { length: 6, width: 12 })).toBe(true);
    expect(isOffcutSize(planContext(p), { length: 11.9, width: 20 })).toBe(true);
    expect(isOffcutSize(planContext(p), { length: 5.9, width: 30 })).toBe(false);
    p.settings.features.offcuts = false;
    expect(isOffcutSize(planContext(p), { length: 40, width: 40 })).toBe(false);
  });
});
