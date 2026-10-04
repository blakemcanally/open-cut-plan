import { analyzeProject, createProject, PART_PALETTE, regenerateDesigns, type CombinedCell, type Project } from "@opencutplan/core";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo } from "react";
import { describe, expect, it, vi } from "vitest";
import { DesignTab } from "../src/screens/DesignTab.tsx";
import { useProject, type ProjectStore } from "../src/state/useProject.ts";
import { designProject } from "./helpers.ts";

function renderDesign(initial: Project = designProject(), focus: string | null = null, onOptimize?: () => void) {
  let latest: ProjectStore | null = null;
  function Harness() {
    const store = useProject(initial);
    latest = store;
    const analysis = useMemo(() => analyzeProject(store.project), [store.project]);
    return <DesignTab store={store} analysis={analysis} focus={focus} onOptimize={onOptimize} />;
  }
  render(<Harness />);
  return () => latest!;
}

const preview = () => screen.getByRole("img", { name: /^Front view of / }).getAttribute("aria-label");
const drawing = () => screen.getByRole("img", { name: /^Front view of / });
const design = (current: () => ProjectStore) => current().project.designs![0]!;

describe("DesignTab", () => {
  it("chooses the colour of each unit, and makes it automatic again", async () => {
    const base = designProject();
    const current = renderDesign(regenerateDesigns({ ...base, designs: [{ ...base.designs![0]!, quantity: 2 }] }));
    const first = screen.getByLabelText("Colour of Hall 1 of 2");
    const second = screen.getByLabelText("Colour of Hall 2 of 2");
    expect([first, second].map((input) => (input as HTMLInputElement).value)).toEqual([PART_PALETTE[0], PART_PALETTE[1]]);
    expect(screen.getByRole("button", { name: "Automatic colour for Hall 2 of 2" })).toHaveProperty("disabled", true);
    fireEvent.change(second, { target: { value: "#123456" } });
    expect(design(current).colors).toEqual(["", "#123456"]);
    expect(screen.getByLabelText("Colour of Hall 2 of 2")).toHaveProperty("value", "#123456");
    await userEvent.click(screen.getByRole("button", { name: "Automatic colour for Hall 2 of 2" }));
    expect(design(current)).not.toHaveProperty("colors");
  });

  it("shows the front view in the colour of the first unit", () => {
    const base = designProject();
    renderDesign({ ...base, designs: [{ ...base.designs![0]!, colors: ["#abcdef"] }] });
    expect(screen.getByRole("img", { name: /^Front view of / }).innerHTML).toContain('fill="#abcdef"');
  });

  it("adds a KALLAX 2x2 and its parts, and a material when the project has none", async () => {
    const current = renderDesign(createProject("New", "mm"));
    expect(screen.getByText(/^No designs yet\./)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Add design" }));
    expect(current().project.materials.map((m) => [m.id, m.name, m.thickness])).toEqual([
      ["plywood", "Plywood", 18],
      ["plywood-6-mm", "Plywood 6 mm", 6],
    ]);
    expect(current().project.stock).toEqual([
      { id: "plywood-2440x1220", material: "plywood", length: 2440, width: 1220, quantity: null, kind: "sheet" },
      { id: "plywood-6-mm-2440x1220", material: "plywood-6-mm", length: 2440, width: 1220, quantity: null, kind: "sheet" },
    ]);
    expect(design(current)).toMatchObject({ id: "kallax-2x2", name: "KALLAX 2x2", system: "kallax", material: "plywood", back: { material: "plywood-6-mm" } });
    expect(current().project.parts.map((part) => [part.id, part.quantity])).toEqual([
      ["kallax-2x2-top", 1],
      ["kallax-2x2-bottom", 1],
      ["kallax-2x2-side", 2],
      ["kallax-2x2-divider", 1],
      ["kallax-2x2-shelf", 2],
      ["kallax-2x2-back", 1],
    ]);
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "KALLAX 2x2");
    expect(preview()).toBe("Front view of KALLAX 2x2: 724 mm × 724 mm × 390 mm");
    await userEvent.click(screen.getByRole("button", { name: "Add design" }));
    expect(current().project.designs!.map((d) => d.id)).toEqual(["kallax-2x2", "kallax-2x2-2"]);
    expect(current().project.designs![1]!.back).toEqual({ material: "plywood-6-mm" });
    expect(current().project.materials).toHaveLength(2);
    expect(current().project.stock).toHaveLength(2);
    expect(screen.getByRole("button", { name: /^KALLAX 2x2/, pressed: true })).toBe(screen.getAllByRole("button", { name: /^KALLAX 2x2/ })[1]);
  });

  it("uses a thin material that the project has for the back, and adds a sheet only for the material that has no enabled stock", async () => {
    const project = designProject();
    const current = renderDesign({ ...project, designs: undefined, parts: [], plan: undefined });
    await userEvent.click(screen.getByRole("button", { name: "Add design" }));
    expect(design(current)).toMatchObject({ material: "ply18", back: { material: "ply6" } });
    expect(current().project.materials).toEqual(project.materials);
    expect(current().project.stock).toEqual([...project.stock, { id: "ply6-2440x1220", material: "ply6", length: 2440, width: 1220, quantity: null, kind: "sheet" }]);
  });

  it("adds the catalogue sheet for a design material with the catalogue name, and nothing for a material with stock", async () => {
    const base = createProject("Shop", "in");
    const current = renderDesign({
      ...base,
      materials: [
        { id: "birch", name: 'Birch plywood 3/4"', thickness: 0.703, grained: true },
        { id: "thin", name: "Thin", thickness: 0.25, grained: true },
      ],
      stock: [{ id: "thin-sheet", material: "thin", length: 48, width: 24, quantity: 1, kind: "sheet" }],
    });
    await userEvent.click(screen.getByRole("button", { name: "Add design" }));
    expect(design(current)).toMatchObject({ material: "birch", back: { material: "thin" } });
    expect(current().project.stock.map((stock) => [stock.id, stock.material, stock.length, stock.width])).toEqual([
      ["thin-sheet", "thin", 48, 24],
      ["birch-ply-3-4-4x8", "birch", 96, 48],
    ]);
  });

  it("adds a sheet when the user picks a project material that has no enabled stock", async () => {
    const project = designProject();
    const current = renderDesign({ ...project, materials: [...project.materials, { id: "oak", name: "Oak", thickness: 19, grained: true }] });
    await userEvent.selectOptions(screen.getByLabelText("Material"), "oak");
    expect(design(current).material).toBe("oak");
    expect(current().project.stock.at(-1)).toEqual({ id: "oak-2440x1220", material: "oak", length: 2440, width: 1220, quantity: null, kind: "sheet" });
  });

  it("gives the new back stock the size of the first sheet of the carcass material, with no cost", async () => {
    const base = createProject("Shop", "in");
    const current = renderDesign({
      ...base,
      materials: [{ id: "birch", name: "Birch 3/4", thickness: 0.75, grained: true }],
      stock: [{ id: "birch-sheet", material: "birch", length: 97, width: 49, quantity: null, cost: 60, kind: "sheet" }],
    });
    await userEvent.click(screen.getByRole("button", { name: "Add design" }));
    expect(current().project.materials.at(-1)).toEqual({ id: "plywood-1-4", name: 'Plywood 1/4"', thickness: 0.25, grained: true });
    expect(current().project.stock.at(-1)).toEqual({ id: "plywood-1-4-97x49", material: "plywood-1-4", length: 97, width: 49, quantity: null, kind: "sheet" });
    expect(design(current).back).toEqual({ material: "plywood-1-4" });
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

  it("uses a catalogue material for the box, and adds it with its largest sheet", async () => {
    const current = renderDesign();
    const material = screen.getByLabelText("Material");
    expect(within(material).getByRole("group", { name: "Catalogue: Baltic birch plywood" })).toBeTruthy();
    await userEvent.selectOptions(material, 'Baltic birch 3/4" (18 mm)');
    expect(design(current).material).toBe("baltic-birch-18mm");
    expect(current().project.materials.at(-1)).toEqual({ id: "baltic-birch-18mm", name: 'Baltic birch 3/4" (18 mm)', thickness: 18, grained: true });
    expect(current().project.stock.at(-1)).toEqual({ id: "baltic-birch-18mm-5x5", material: "baltic-birch-18mm", length: 1525, width: 1525, quantity: null, kind: "sheet" });
    expect(material).toHaveProperty("value", "baltic-birch-18mm");
    expect(within(material).queryByRole("option", { name: 'Baltic birch 3/4" (18 mm)' })).toBeNull();
  });

  it("uses a catalogue material for the back", async () => {
    const current = renderDesign();
    await userEvent.selectOptions(screen.getByLabelText("Back"), 'Birch plywood 1/4"');
    expect(design(current).back).toEqual({ material: "birch-ply-1-4" });
    expect(current().project.stock.at(-1)).toMatchObject({ id: "birch-ply-1-4-4x8", material: "birch-ply-1-4", length: 2438, width: 1219, cost: 46.74 });
  });

  it("adds no catalogue material that the design refuses", async () => {
    const current = renderDesign();
    const before = current().project;
    await userEvent.selectOptions(screen.getByLabelText("Material"), 'Tempered hardboard 1/8"');
    expect(current().project).toBe(before);
    expect(screen.getByRole("alert").textContent).toContain("too thin for pocket screws");
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

function kallax4x2(combined?: CombinedCell[]): Project {
  const project = designProject();
  const hall = { ...project.designs![0]!, width: { openings: [335, 335, 335, 335] }, ...(combined ? { combined } : {}) };
  return regenerateDesigns({ ...project, designs: [hall] });
}

const cell = (name: string) => screen.getByRole("gridcell", { name });
const button = (name: string) => screen.getByRole("button", { name });
const partRows = () =>
  within(screen.getByRole("region", { name: "Parts" }))
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell").map((td) => td.textContent));

describe("DesignTab cells", () => {
  it("combines two cells with a click and a shift-click, lists the new parts, and undoes it in one step", async () => {
    const user = userEvent.setup();
    const current = renderDesign(kallax4x2());
    expect(screen.getAllByRole("gridcell")).toHaveLength(8);
    expect(button("Combine").matches(":disabled")).toBe(true);
    await user.click(cell("Column 1, row 1"));
    expect(cell("Column 1, row 1").getAttribute("aria-selected")).toBe("true");
    expect(button("Combine").matches(":disabled")).toBe(true);
    await user.keyboard("{Shift>}");
    await user.click(cell("Column 2, row 1"));
    await user.keyboard("{/Shift}");
    expect(cell("Column 2, row 1").getAttribute("aria-selected")).toBe("true");
    expect(drawing().querySelector("[data-highlight]")?.getAttribute("width")).toBe("688");
    await user.click(button("Combine"));
    expect(design(current).combined).toEqual([{ column: 1, row: 1, columns: 2, rows: 1 }]);
    expect([...drawing().querySelectorAll("[data-label]")].map((label) => label.textContent?.trim())).toEqual(["Shelf, columns 1–2", "Divider, row 2"]);
    expect(screen.getAllByRole("gridcell")).toHaveLength(7);
    expect(cell("Columns 1–2, row 1").getAttribute("aria-selected")).toBe("true");
    expect(current().project.parts.map((part) => [part.id, part.length, part.quantity])).toEqual([
      ["hall-top", 1430, 1],
      ["hall-bottom", 1430, 1],
      ["hall-side", 688, 2],
      ["hall-divider", 688, 2],
      ["hall-divider-rows-2", 335, 1],
      ["hall-shelf", 335, 2],
      ["hall-shelf-cols-1-2", 688, 1],
    ]);
    expect(partRows()).toEqual([
      ["Top", "1430 mm × 390 mm", "1"],
      ["Bottom", "1430 mm × 390 mm", "1"],
      ["Side", "688 mm × 390 mm", "2"],
      ["Divider", "688 mm × 390 mm", "2"],
      ["Divider, row 2", "335 mm × 390 mm", "1"],
      ["Shelf", "335 mm × 390 mm", "2"],
      ["Shelf, columns 1–2", "688 mm × 390 mm", "1"],
    ]);
    expect(button("Combine").matches(":disabled")).toBe(true);
    act(() => current().undo());
    expect(design(current)).not.toHaveProperty("combined");
    expect(current().project.parts.map((part) => part.id)).toEqual(["hall-top", "hall-bottom", "hall-side", "hall-divider", "hall-shelf"]);
  });

  it("splits a combined cell", async () => {
    const user = userEvent.setup();
    const current = renderDesign(kallax4x2([{ column: 2, row: 1, columns: 2, rows: 2 }]));
    expect(button("Split").matches(":disabled")).toBe(true);
    await user.click(cell("Columns 2–3, rows 1–2"));
    expect(button("Combine").matches(":disabled")).toBe(true);
    await user.click(button("Split"));
    expect(design(current)).not.toHaveProperty("combined");
    expect(screen.getAllByRole("gridcell")).toHaveLength(8);
  });

  it("selects a rectangle with a drag, and with Shift and the arrow keys, and grows it to hold a combined cell", async () => {
    const user = userEvent.setup();
    const current = renderDesign(kallax4x2([{ column: 3, row: 2, columns: 2, rows: 1 }]));
    await user.pointer([{ keys: "[MouseLeft>]", target: cell("Column 1, row 1") }, { target: cell("Column 2, row 2") }, { keys: "[/MouseLeft]" }]);
    expect(screen.getAllByRole("gridcell").filter((item) => item.getAttribute("aria-selected") === "true")).toHaveLength(4);
    await user.click(button("Combine"));
    expect(design(current).combined).toEqual([
      { column: 3, row: 2, columns: 2, rows: 1 },
      { column: 1, row: 1, columns: 2, rows: 2 },
    ]);
    await user.click(cell("Column 3, row 1"));
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");
    expect(cell("Columns 3–4, row 2").getAttribute("aria-selected")).toBe("true");
    expect(cell("Column 4, row 1").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(cell("Columns 3–4, row 2"));
    await user.click(button("Combine"));
    expect(design(current).combined).toEqual([
      { column: 1, row: 1, columns: 2, rows: 2 },
      { column: 3, row: 1, columns: 2, rows: 2 },
    ]);
    await user.click(cell("Columns 1–2, rows 1–2"));
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(cell("Columns 3–4, rows 1–2"));
  });

  it("removes a combined cell that a smaller grid cuts to one cell", async () => {
    const user = userEvent.setup();
    const current = renderDesign(kallax4x2([{ column: 3, row: 1, columns: 2, rows: 1 }]));
    const columns = screen.getByLabelText("Columns");
    await user.clear(columns);
    await user.type(columns, "3{Enter}");
    expect(design(current).width).toEqual({ openings: [335, 335, 335] });
    expect(design(current)).not.toHaveProperty("combined");
    expect(screen.getAllByRole("gridcell")).toHaveLength(6);
  });

  it("shows the cells of a locked design, and disables the buttons", async () => {
    const user = userEvent.setup();
    const project = kallax4x2([{ column: 1, row: 1, columns: 2, rows: 1 }]);
    renderDesign({ ...project, designs: [{ ...project.designs![0]!, system: "pax" }] });
    await user.click(cell("Columns 1–2, row 1"));
    expect(button("Combine").matches(":disabled")).toBe(true);
    expect(button("Split").matches(":disabled")).toBe(true);
  });

  describe("sheet estimate", () => {
    const sheets = () => within(screen.getByRole("region", { name: "Sheets" }));
    const lines = () => sheets().getAllByRole("listitem").map((item) => item.textContent);

    it("estimates the sheets of each material, and updates while the user types", async () => {
      renderDesign();
      expect(lines()).toEqual(["About 1 sheet of Plywood 18 (18 mm), 2440 mm × 1220 mm."]);
      expect(sheets().getByText(/^An estimate from a short optimizer run/)).toBeTruthy();
      const columns = screen.getByLabelText("Columns");
      await userEvent.clear(columns);
      await userEvent.type(columns, "5");
      await waitFor(() => expect(lines()).toEqual(["About 2 sheets of Plywood 18 (18 mm), 2440 mm × 1220 mm."]));
    });

    it("runs the optimizer from the Optimize now button", async () => {
      const onOptimize = vi.fn();
      renderDesign(designProject(), null, onOptimize);
      await userEvent.click(sheets().getByRole("button", { name: "Optimize now" }));
      expect(onOptimize).toHaveBeenCalledTimes(1);
    });

    it("has no Optimize now button when the app gives no way to optimize", () => {
      renderDesign();
      expect(sheets().queryByRole("button", { name: "Optimize now" })).toBeNull();
    });

    it("offers the catalogue sheet when a catalogue material has no stock", async () => {
      const base = designProject();
      const birch = { id: "birch", name: 'Birch plywood 3/4"', thickness: 17.9, grained: true };
      const current = renderDesign(
        regenerateDesigns({ ...base, materials: [...base.materials, birch], stock: [], designs: [{ ...base.designs![0]!, material: "birch" }] }),
      );
      expect(lines()).toEqual(['⚠ The project has no sheet stock of Birch plywood 3/4" (18 mm). Add 4 × 8 ft sheets from the catalogue']);
      await userEvent.click(sheets().getByRole("button", { name: "Add 4 × 8 ft sheets from the catalogue" }));
      expect(current().project.stock).toMatchObject([{ material: "birch", length: 2438, width: 1219, kind: "sheet" }]);
      expect(lines()).toEqual(['About 1 sheet of Birch plywood 3/4" (18 mm), 2438 mm × 1219 mm.']);
    });

    it("adds a sheet of a material of its own, and points to the catalogue materials", async () => {
      const current = renderDesign({ ...designProject(), stock: [] });
      expect(lines()).toEqual([
        "⚠ The project has no sheet stock of Plywood 18 (18 mm). Add 2440 mm × 1220 mm sheets Or choose a catalogue material in the Material list.",
      ]);
      await userEvent.click(sheets().getByRole("button", { name: "Add 2440 mm × 1220 mm sheets" }));
      expect(current().project.stock).toEqual([{ id: "ply18-2440x1220", material: "ply18", length: 2440, width: 1220, quantity: null, kind: "sheet" }]);
      expect(lines()).toEqual(["About 1 sheet of Plywood 18 (18 mm), 2440 mm × 1220 mm."]);
    });
  });
});
