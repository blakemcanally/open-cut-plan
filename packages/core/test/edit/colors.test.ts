import { describe, expect, it } from "vitest";
import { detachDesign, partColors, regenerateDesigns, renameDesign, setDesignColor, setGroupColor } from "../../src/index.ts";
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
