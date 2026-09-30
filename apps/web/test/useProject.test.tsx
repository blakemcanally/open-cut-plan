import { checkDesigns, convertProjectUnits, updateMaterial } from "@opencutplan/core";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useProject } from "../src/state/useProject.ts";
import { designProject } from "./helpers.ts";

const placed = (project: ReturnType<typeof designProject>) => project.plan!.sheets[0]!.placements.map((p) => p.part);

describe("useProject", () => {
  it("makes the design parts again in the same undo step as a material change", () => {
    const { result } = renderHook(() => useProject(designProject()));
    act(() => result.current.edit((p) => updateMaterial(p, "ply18", { thickness: 19 })));
    const parts = result.current.project.parts.map((part) => [part.id, part.length, part.width]);
    expect(parts).toEqual([
      ["hall-top", 727, 390],
      ["hall-bottom", 727, 390],
      ["hall-side", 689, 390],
      ["hall-divider", 689, 390],
      ["hall-shelf", 335, 390],
    ]);
    expect(placed(result.current.project)).toEqual(["hall-shelf"]);
    act(() => result.current.undo());
    expect(result.current.project.materials[0]!.thickness).toBe(18);
    expect(result.current.project.parts[0]!.length).toBe(724);
    expect(placed(result.current.project)).toEqual(["hall-side", "hall-shelf"]);
    expect(result.current.canUndo).toBe(false);
  });

  it("keeps every placed copy through a unit change and back, with no stale design", () => {
    const { result } = renderHook(() => useProject(designProject()));
    act(() => result.current.edit((p) => convertProjectUnits(p, "in")));
    expect(placed(result.current.project)).toEqual(["hall-side", "hall-shelf"]);
    expect(checkDesigns(result.current.project).map((issue) => issue.code)).not.toContain("design-stale");
    act(() => result.current.edit((p) => convertProjectUnits(p, "mm")));
    expect(placed(result.current.project)).toEqual(["hall-side", "hall-shelf"]);
    expect(checkDesigns(result.current.project).map((issue) => issue.code)).not.toContain("design-stale");
  });
});
