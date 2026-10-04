import { describe, expect, it } from "vitest";
import { analyzeProject, cutList } from "../../src/index.ts";
import { editSampleProject, sampleProject } from "../helpers.ts";

describe("cutList", () => {
  it("lists every part with its size, count, copies placed, and sheet numbers", () => {
    const project = sampleProject();
    expect(cutList(project, analyzeProject(project))).toEqual({
      parts: [
        {
          id: "side",
          name: "Side",
          material: "ply",
          length: 30,
          width: 12,
          thickness: 0.75,
          quantity: 2,
          grain: "length",
          factoryEdge: null,
          group: null,
          placed: 2,
          sheets: [1],
        },
      ],
      materials: [{ material: "ply", name: "Plywood 3/4", parts: 1, copies: 2, partArea: 720 }],
    });
  });

  it("counts a part in the tray as not placed, and leaves out a material with no parts", () => {
    const project = editSampleProject();
    project.materials.push({ id: "mdf", name: "MDF", thickness: 0.5, grained: false });
    const list = cutList(project, analyzeProject(project));
    expect(list.parts.map((part) => [part.id, part.placed, part.sheets])).toEqual([
      ["side", 2, [1]],
      ["shelf", 0, []],
    ]);
    expect(list.materials.map((material) => material.material)).toEqual(["ply"]);
  });
});
