import { describe, expect, it } from "vitest";
import { snapPosition } from "../src/layout/snap.ts";

const base = {
  size: { length: 10, width: 5 },
  sheet: { x: 0, y: 0, length: 96, width: 48 },
  usable: { x: 0.25, y: 0.25, length: 95.5, width: 47.5 },
  others: [{ x: 0.25, y: 0.25, length: 30, width: 12 }],
  kerf: 0.125,
  threshold: 1,
  grid: 0,
};

describe("snapPosition", () => {
  it("snaps to the trim line and names it as the guide", () => {
    expect(snapPosition({ ...base, others: [], x: 0.6, y: 0.9 })).toEqual({ x: 0.25, y: 0.25, guides: { x: 0.25, y: 0.25 } });
  });

  it("snaps to one kerf past a neighbour", () => {
    expect(snapPosition({ ...base, x: 30.9, y: 3 })).toMatchObject({ x: 30.375, y: 3 });
    expect(snapPosition({ ...base, x: 5, y: 12.8 })).toMatchObject({ x: 5, y: 12.375 });
  });

  it("snaps the far edge to the far trim line, with the guide on that line", () => {
    expect(snapPosition({ ...base, others: [], x: 85.2, y: 42.5 })).toEqual({ x: 85.75, y: 42.75, guides: { x: 95.75, y: 47.75 } });
  });

  it("leaves a position alone when nothing is close and the grid is off", () => {
    expect(snapPosition({ ...base, x: 50, y: 20 })).toEqual({ x: 50, y: 20, guides: { x: null, y: null } });
  });

  it("picks the nearest line", () => {
    expect(snapPosition({ ...base, others: [{ x: 40, y: 30, length: 10, width: 10 }], x: 50.4, y: 20 }).x).toBe(50.125);
  });

  it("snaps to the grid from the trim corner when no line is close", () => {
    expect(snapPosition({ ...base, grid: 1, x: 50.4, y: 20.9 })).toEqual({ x: 50.25, y: 21.25, guides: { x: null, y: null } });
  });

  it("prefers a line to the grid", () => {
    expect(snapPosition({ ...base, grid: 1, x: 30.9, y: 20.9 })).toEqual({ x: 30.375, y: 21.25, guides: { x: 30.375, y: null } });
  });

  const fits = (x: number, y: number) => x >= 0 && x + 10 <= 100 && y >= 0 && y + 5 <= 50;
  const fitsBase = {
    size: { length: 10, width: 5 },
    sheet: { x: 0, y: 0, length: 200, width: 100 },
    usable: { x: 0, y: 0, length: 100, width: 50 },
    others: [],
    kerf: 0.125,
    threshold: 1,
    grid: 7,
    fits,
  };

  it("keeps the position as it is when the grid would push the part off the sheet", () => {
    expect(snapPosition({ ...fitsBase, x: 88.9, y: 20 })).toEqual({ x: 88.9, y: 20, guides: { x: null, y: null } });
  });

  it("keeps the snap when the position as it is does not fit either", () => {
    expect(snapPosition({ ...fitsBase, x: 99, y: 20 })).toEqual({ x: 98, y: 21, guides: { x: null, y: null } });
  });
});
