import { describe, expect, it } from "vitest";
import { addPartRows, addStockRows, createProject, importPartsCsv, parseProject, serializeProject } from "../../src/index.ts";
import { expectOk, sampleProject } from "../helpers.ts";

describe("addPartRows", () => {
  it("matches materials by name, creates new ones, and makes unique ids", () => {
    const original = sampleProject();
    const { project, createdMaterials } = addPartRows(original, [
      { name: "Side", length: 30, width: 12, quantity: 1, material: "plywood 3/4", grain: "length" },
      { name: "Door", length: 20, width: 10, quantity: 2, material: "MDF", grain: "none", thickness: 0.5, group: "Doors" },
      { name: "Drawer front", length: 18, width: 6, quantity: 3, material: "mdf", grain: "none" },
    ]);
    expect(createdMaterials).toEqual([{ id: "mdf", name: "MDF", thickness: 0.5, grained: true }]);
    expect(project.parts.map((part) => [part.id, part.material])).toEqual([
      ["side", "ply"],
      ["side-2", "ply"],
      ["door", "mdf"],
      ["drawer-front", "mdf"],
    ]);
    expect(project.parts[2]).toEqual({ id: "door", name: "Door", material: "mdf", length: 20, width: 10, quantity: 2, grain: "none", group: "Doors" });
    expect(original.parts).toHaveLength(1);
    expect(parseProject(serializeProject(project)).ok).toBe(true);
  });

  it("uses the default thickness for the project units", () => {
    const { createdMaterials } = addPartRows(sampleProject(), [{ name: "Top", length: 10, width: 5, quantity: 1, material: "Oak ply", grain: "length" }]);
    expect(createdMaterials[0]!.thickness).toBe(0.75);
  });

  it("keeps materials with the same name but a different thickness apart", () => {
    const { project, createdMaterials } = addPartRows(createProject("T", "mm"), [
      { name: "Side", length: 700, width: 300, quantity: 2, material: "Plywood", grain: "length", thickness: 18 },
      { name: "Back", length: 700, width: 600, quantity: 1, material: "Plywood", grain: "none", thickness: 6 },
      { name: "Shelf", length: 600, width: 300, quantity: 1, material: "plywood", grain: "length" },
      { name: "Drawer bottom", length: 400, width: 300, quantity: 1, material: "PLYWOOD", grain: "none", thickness: 6.01 },
      { name: "Top", length: 700, width: 300, quantity: 1, material: "Plywood", grain: "length", thickness: 18.02 },
    ]);
    expect(createdMaterials).toEqual([
      { id: "plywood", name: "Plywood", thickness: 18, grained: true },
      { id: "plywood-6-mm", name: "Plywood (6 mm)", thickness: 6, grained: true },
    ]);
    expect(project.parts.map((part) => part.material)).toEqual(["plywood", "plywood-6-mm", "plywood", "plywood-6-mm", "plywood"]);
    expect(parseProject(project).ok).toBe(true);
  });

  it("names a new thickness of an existing material in inches", () => {
    const { project, createdMaterials } = addPartRows(sampleProject(), [
      { name: "Back", length: 30, width: 20, quantity: 1, material: "Plywood 3/4", grain: "none", thickness: 0.25 },
      { name: "Top", length: 30, width: 12, quantity: 1, material: "Plywood 3/4", grain: "length", thickness: 0.7505 },
    ]);
    expect(createdMaterials).toEqual([{ id: "plywood-3-4-1-4", name: 'Plywood 3/4 (1/4")', thickness: 0.25, grained: true }]);
    expect(project.parts.slice(1).map((part) => part.material)).toEqual(["plywood-3-4-1-4", "ply"]);
  });

  it("turns a pasted CSV into a valid project", () => {
    const rows = expectOk(importPartsCsv("name,length,width,quantity,material\nShelf,30,11 1/4,4,Pine\n", { units: "in" })).rows;
    const { project } = addPartRows(sampleProject(), rows);
    expect(parseProject(project).ok).toBe(true);
  });
});

describe("addStockRows", () => {
  it("adds stock with ids from the material and size", () => {
    const { project, createdMaterials } = addStockRows(sampleProject(), [
      { material: "Plywood 3/4", length: 60, width: 60, quantity: null, kind: "sheet", cost: 95 },
      { material: "Hardboard", length: 96, width: 48, quantity: 2, kind: "sheet", thickness: 0.125 },
    ]);
    expect(createdMaterials).toEqual([{ id: "hardboard", name: "Hardboard", thickness: 0.125, grained: true }]);
    expect(project.stock.slice(1)).toEqual([
      { id: "plywood-3-4-60x60", material: "ply", length: 60, width: 60, quantity: null, kind: "sheet", cost: 95 },
      { id: "hardboard-96x48", material: "hardboard", length: 96, width: 48, quantity: 2, kind: "sheet" },
    ]);
    expect(parseProject(project).ok).toBe(true);
  });

  it("rounds sizes in stock ids to two decimals", () => {
    const { project } = addStockRows(sampleProject(), [{ material: "ply", length: 96.0625, width: 48.03125, quantity: 1, kind: "sheet" }]);
    expect(project.stock[1]!.id).toBe("plywood-3-4-96-06x48-03");
  });
});
