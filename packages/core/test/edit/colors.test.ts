import { describe, expect, it } from "vitest";
import { detachDesign, partColors, regenerateDesigns, renameDesign, renameGroup, setDesignColor, setGroupColor, type Part, type Project } from "../../src/index.ts";
import { designProject, kallaxDesign, sampleProject } from "../helpers.ts";

describe("setDesignColor", () => {
  it("sets the colour of one unit and leaves the other units automatic", () => {
    const project = setDesignColor(designProject([kallaxDesign({ quantity: 3 })]), "kx", 2, "#AABBCC");
    expect(project.designs![0]!.colors).toEqual(["", "#aabbcc"]);
  });

  it("clears a colour, removes the empty values at the end, and removes the list when it is empty", () => {
    let project = setDesignColor(setDesignColor(designProject([kallaxDesign({ quantity: 3 })]), "kx", 1, "#111111"), "kx", 3, "#333333");
    project = setDesignColor(project, "kx", 3, null);
    expect(project.designs![0]!.colors).toEqual(["#111111"]);
    project = setDesignColor(project, "kx", 1, null);
    expect(project.designs![0]).not.toHaveProperty("colors");
  });

  it("does not change other designs, and keeps the colours when the design id changes", () => {
    const project = setDesignColor(designProject([kallaxDesign(), kallaxDesign({ id: "other", name: "Other" })]), "kx", 1, "#123456");
    expect(project.designs![1]).not.toHaveProperty("colors");
    expect(renameDesign(project, "kx", "hall").designs![0]!.colors).toEqual(["#123456"]);
  });
});

describe("setGroupColor", () => {
  it("sets and clears the colour of a group, and removes the groups field when it is empty", () => {
    const project = setGroupColor(sampleProject(), "Doors", "#ABCDEF");
    expect(project.groups).toEqual({ Doors: { color: "#abcdef" } });
    expect(setGroupColor(project, "Doors", null)).not.toHaveProperty("groups");
  });

  it("keeps the other fields of a group", () => {
    const project = { ...sampleProject(), groups: { Doors: { color: "#abcdef", note: "x" } as { color: string } } };
    expect(setGroupColor(project, "Doors", null).groups).toEqual({ Doors: { note: "x" } });
  });
});

describe("detachDesign", () => {
  it("keeps the colour of the first unit as the colour of the group", () => {
    const project = regenerateDesigns(designProject([kallaxDesign({ colors: ["#123456"] })]));
    const detached = detachDesign(project, "kx");
    expect(detached.groups).toEqual({ "Hall KALLAX": { color: "#123456" } });
    expect(partColors(detached).legend.map((key) => [key.label, key.color])).toEqual([["Hall KALLAX", "#123456"]]);
    expect(detachDesign(regenerateDesigns(designProject([kallaxDesign()])), "kx")).not.toHaveProperty("groups");
  });
});

describe("renameGroup", () => {
  const part = (id: string, group?: string, design?: string): Part => ({ id, name: id, material: "ply", length: 20, width: 10, quantity: 1, grain: "length", ...(group === undefined ? {} : { group }), ...(design === undefined ? {} : { design }) });
  const withParts = (parts: Part[], groups?: Project["groups"]): Project => ({ ...sampleProject(), parts: [...sampleProject().parts, ...parts], ...(groups ? { groups } : {}) });

  it("renames the group of every part without a design, and moves its colour and its other fields", () => {
    const project = withParts([part("door", "Doors"), part("shelf", "Shelves"), part("door2", "Doors")], { Doors: { color: "#abcdef", note: "x" } });
    const renamed = renameGroup(project, "Doors", "Fronts");
    expect(renamed.parts.map((p) => p.group)).toEqual([undefined, "Fronts", "Shelves", "Fronts"]);
    expect(renamed.groups).toEqual({ Fronts: { color: "#abcdef", note: "x" } });
    expect(renamed.plan).toBe(project.plan);
    expect(partColors(renamed).legend.map((key) => [key.label, key.color, key.chosen])).toEqual([
      ["Fronts", "#abcdef", true],
      ["Shelves", partColors(project).legend[1]!.color, false],
    ]);
  });

  it("drops a stale entry of the new name, so that its colour does not come back", () => {
    const stale = { Fronts: { color: "#111111" } };
    expect(renameGroup(withParts([part("door", "Doors")], stale), "Doors", "Fronts")).not.toHaveProperty("groups");
    expect(renameGroup(withParts([part("door", "Doors")], { ...stale, Doors: { color: "#222222" } }), "Doors", "Fronts").groups).toEqual({ Fronts: { color: "#222222" } });
  });

  it("keeps the colour of a group that parts already have when it joins that group, and takes the old colour when that group has none", () => {
    const parts = [part("door", "Doors"), part("front", "Fronts")];
    expect(renameGroup(withParts(parts, { Doors: { color: "#222222" }, Fronts: { color: "#111111" } }), "Doors", "Fronts").groups).toEqual({ Fronts: { color: "#111111" } });
    expect(renameGroup(withParts(parts, { Doors: { color: "#222222", note: "d" }, Fronts: { note: "f" } }), "Doors", "Fronts").groups).toEqual({
      Fronts: { color: "#222222", note: "f" },
    });
  });

  it("leaves the parts of a design alone, and renames a part whose design is missing", () => {
    const project = regenerateDesigns(designProject([kallaxDesign()]));
    project.parts.push(part("loose", "Hall KALLAX", "gone"));
    const renamed = renameGroup(project, "Hall KALLAX", "Hall");
    expect(renamed.parts.filter((p) => p.design === "kx").every((p) => p.group === "Hall KALLAX")).toBe(true);
    expect(renamed.parts.at(-1)!.group).toBe("Hall");
  });

  it("removes the group and its entry for an empty name, and changes nothing for the same name or an unknown group", () => {
    const project = withParts([part("door", "Doors")], { Doors: { color: "#222222" } });
    const removed = renameGroup(project, "Doors", "");
    expect(removed.parts.at(-1)).not.toHaveProperty("group");
    expect(removed).not.toHaveProperty("groups");
    expect(renameGroup(project, "Doors", "Doors")).toBe(project);
    expect(renameGroup(project, "Nothing", "Other")).toBe(project);
  });
});
