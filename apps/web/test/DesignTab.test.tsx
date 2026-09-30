import { analyzeProject, createProject, regenerateDesigns, type Project } from "@opencutplan/core";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo } from "react";
import { describe, expect, it } from "vitest";
import { DesignTab } from "../src/screens/DesignTab.tsx";
import { useProject, type ProjectStore } from "../src/state/useProject.ts";
import { designProject } from "./helpers.ts";

function renderDesign(initial: Project = designProject(), focus: string | null = null) {
  let latest: ProjectStore | null = null;
  function Harness() {
    const store = useProject(initial);
    latest = store;
    const analysis = useMemo(() => analyzeProject(store.project), [store.project]);
    return <DesignTab store={store} analysis={analysis} focus={focus} />;
  }
  render(<Harness />);
  return () => latest!;
}

const preview = () => screen.getByRole("img", { name: /^Front view of / }).getAttribute("aria-label");
const design = (current: () => ProjectStore) => current().project.designs![0]!;

describe("DesignTab", () => {
  it("adds a KALLAX 2x2 and its parts, and a material when the project has none", async () => {
    const current = renderDesign(createProject("New", "mm"));
    expect(screen.getByText(/^No designs yet\./)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Add design" }));
    expect(current().project.materials.map((m) => [m.id, m.thickness])).toEqual([["plywood", 18]]);
    expect(design(current)).toMatchObject({ id: "kallax-2x2", name: "KALLAX 2x2", system: "kallax", material: "plywood" });
    expect(current().project.parts.map((part) => [part.id, part.quantity])).toEqual([
      ["kallax-2x2-top", 1],
      ["kallax-2x2-bottom", 1],
      ["kallax-2x2-side", 2],
      ["kallax-2x2-divider", 1],
      ["kallax-2x2-shelf", 2],
    ]);
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "KALLAX 2x2");
    expect(preview()).toBe("Front view of KALLAX 2x2: 724 mm × 724 mm × 390 mm");
    await userEvent.click(screen.getByRole("button", { name: "Add design" }));
    expect(current().project.designs!.map((d) => d.id)).toEqual(["kallax-2x2", "kallax-2x2-2"]);
    expect(screen.getByRole("button", { name: /^KALLAX 2x2/, pressed: true })).toBe(screen.getAllByRole("button", { name: /^KALLAX 2x2/ })[1]);
  });

  it("changes the rows and makes the parts again in one undo step", async () => {
    const current = renderDesign();
    const rows = screen.getByLabelText("Rows");
    await userEvent.clear(rows);
    await userEvent.type(rows, "4{Enter}");
    expect(design(current).height).toEqual({ openings: [335, 335, 335, 335] });
    expect(current().project.parts.map((part) => [part.id, part.length, part.quantity])).toEqual([
      ["hall-top", 724, 1],
      ["hall-bottom", 724, 1],
      ["hall-side", 1394, 2],
      ["hall-divider", 1394, 1],
      ["hall-shelf", 335, 6],
    ]);
    act(() => current().undo());
    expect(design(current).height).toEqual({ openings: [335, 335] });
    expect(current().project.parts.find((part) => part.id === "hall-shelf")!.quantity).toBe(2);
  });

  it("draws the new size while the user types, and Escape draws the stored size again", async () => {
    const current = renderDesign();
    const rows = screen.getByLabelText("Rows");
    await userEvent.clear(rows);
    await userEvent.type(rows, "3");
    expect(preview()).toBe("Front view of Hall: 724 mm × 1077 mm × 390 mm");
    expect(design(current).height).toEqual({ openings: [335, 335] });
    await userEvent.keyboard("{Escape}");
    expect(preview()).toBe("Front view of Hall: 724 mm × 724 mm × 390 mm");
  });

  it("refuses a value that gives a design error: it marks the field, says why, and changes nothing", async () => {
    const current = renderDesign();
    const before = current().project;
    const material = screen.getByLabelText("Material");
    await userEvent.selectOptions(material, "ply6");
    expect(current().project).toBe(before);
    expect(material).toHaveProperty("value", "ply18");
    expect(material.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toBe('✖ Design "Hall" uses stock that is too thin for pocket screws. Use stock that is 15/32" (11.9 mm) thick or more.');

    await userEvent.selectOptions(screen.getAllByLabelText("Size by")[0]!, "outside");
    expect(design(current).width).toEqual({ outside: 724, cells: 2 });
    expect(screen.queryByRole("alert")).toBeNull();
    const changed = current().project;
    const width = screen.getByLabelText("Outside width");
    await userEvent.clear(width);
    await userEvent.type(width, "40{Enter}");
    expect(current().project).toBe(changed);
    expect(width.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toBe('✖ Design "Hall" is too small: the panels leave no room for the cells.');
  });

  it("uses the EKET sizes when the system changes to EKET", async () => {
    const current = renderDesign();
    await userEvent.selectOptions(screen.getByLabelText("System"), "eket");
    expect(design(current)).toMatchObject({ system: "eket", width: { outside: 700, cells: 2 }, height: { outside: 700, cells: 2 }, depth: 350 });
    expect(current().project.parts.map((part) => [part.id, part.length, part.width])).toEqual([
      ["hall-top", 700, 350],
      ["hall-bottom", 700, 350],
      ["hall-side", 664, 350],
      ["hall-divider", 664, 350],
      ["hall-shelf", 323, 350],
    ]);
  });

  it("lists the checks of the design", () => {
    const project = designProject();
    renderDesign(regenerateDesigns({ ...project, designs: [{ ...project.designs![0]!, height: { openings: [300, 335] } }] }));
    const checks = within(screen.getByRole("region", { name: "Checks" }));
    expect(checks.getByRole("listitem").textContent).toBe('⚠ Warning: Design "Hall" has a cell of 300 mm. KALLAX inserts need at least 332 mm.');
  });

  it("locks the form of a design with an unknown system, and can still detach it", async () => {
    const project = designProject();
    const current = renderDesign({ ...project, designs: [{ ...project.designs![0]!, system: "pax" }] });
    expect(screen.getByRole("status").textContent).toBe('⚠ This design uses the system "pax", which this app does not know. Its parts stay as they are.');
    expect(screen.getByLabelText("Rows").matches(":disabled")).toBe(true);
    expect(screen.getByText("The design has an error, so there is no drawing.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Detach" }));
    expect(current().project.designs).toBeUndefined();
    expect(current().project.parts.map((part) => [part.id, part.design])).toEqual([
      ["hall-top", undefined],
      ["hall-bottom", undefined],
      ["hall-side", undefined],
      ["hall-divider", undefined],
      ["hall-shelf", undefined],
    ]);
    expect(current().project.plan!.sheets[0]!.placements).toHaveLength(2);
  });

  it("does not add a design to a file from a newer version", async () => {
    const current = renderDesign({ ...designProject(), version: "1.9" });
    const before = current().project;
    const add = screen.getByRole("button", { name: "Add design" });
    expect(add.matches(":disabled")).toBe(true);
    expect(add.getAttribute("title")).toBe("This file is from a newer OpenCutPlan. Update the app to add designs.");
    await userEvent.click(add);
    expect(current().project).toBe(before);
  });

  it("deletes a design with its parts and their copies, and shows the design that the Parts tab chose", async () => {
    const project = designProject();
    const current = renderDesign(regenerateDesigns({ ...project, designs: [...project.designs!, { ...project.designs![0]!, id: "two", name: "Two" }] }), "two");
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "Two");
    await userEvent.click(screen.getByRole("button", { name: "Delete design" }));
    expect(current().project.designs!.map((d) => d.id)).toEqual(["hall"]);
    expect(current().project.parts.map((part) => part.id)).toEqual(["hall-top", "hall-bottom", "hall-side", "hall-divider", "hall-shelf"]);
    await userEvent.click(screen.getByRole("button", { name: "Delete design" }));
    expect(current().project.parts).toEqual([]);
    expect(current().project.plan!.sheets[0]!.placements).toEqual([]);
  });
});
