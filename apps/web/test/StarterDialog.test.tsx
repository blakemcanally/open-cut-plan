import { addStarterDesign, createProject, designGeometry, formatLength, IKEA_NOTICE, materialsById, starterById, STARTERS, type Project } from "@opencutplan/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StarterDialog } from "../src/design/StarterDialog.tsx";

function renderDialog(project: Project = createProject("New", "mm")) {
  const onUse = vi.fn();
  const onClose = vi.fn();
  render(<StarterDialog project={project} onUse={onUse} onClose={onClose} />);
  return { onUse, onClose };
}

const dialog = () => screen.getByRole("dialog");
const heading = () => within(dialog()).getByRole("heading", { level: 3 }).textContent;
const fact = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling!.textContent;
const cell = (column: number, row: number) => dialog().querySelector<HTMLElement>(`[data-cell="${column}-${row}"]`)!;
const row = (name: RegExp) => within(dialog()).getByRole("button", { name });

describe("StarterDialog", () => {
  it("opens on the cube shelf, with the notice", () => {
    renderDialog();
    expect(within(dialog()).getByRole("heading", { level: 2 }).textContent).toBe("Add a design");
    expect(row(/^Cube shelf/).getAttribute("aria-pressed")).toBe("true");
    expect(heading()).toBe("Cube shelf 2 × 4");
    expect(within(dialog()).getByText(IKEA_NOTICE)).toBeTruthy();
  });

  it("lists the starters in groups, with the custom grid last", () => {
    renderDialog();
    expect(within(dialog()).getAllByRole("heading", { level: 4 }).map((node) => node.textContent)).toEqual(["Cube shelves", "Low units", "Bookcases", "Wall units", "Small units", "Accessories"]);
    const order = [...dialog().querySelectorAll(".starter-row")].map((node) => node.querySelector("b")!.textContent);
    expect(order).toEqual(STARTERS.map((starter) => starter.name));
    expect(order.at(-1)).toBe("Custom grid");
  });

  it("shows the range of a grid starter, and the outside size of the others", () => {
    renderDialog();
    expect(row(/^Cube shelf/).textContent).toContain("1 × 1 to 6 × 6");
    expect(row(/^Bookcase/).textContent).toContain("800 mm × 2020 mm × 280 mm");
    expect(row(/^Custom grid/).textContent).toContain("724 mm × 724 mm × 390 mm");
  });

  it("follows a click in the grid, and the pointer over it", async () => {
    renderDialog();
    await userEvent.hover(cell(3, 2));
    expect(heading()).toBe("Cube shelf 3 × 2");
    expect(fact("Outside")).toBe("1077 mm × 724 mm × 390 mm");
    await userEvent.unhover(cell(3, 2));
    expect(heading()).toBe("Cube shelf 2 × 4");
    await userEvent.click(cell(3, 2));
    expect(heading()).toBe("Cube shelf 3 × 2");
    const project = createProject("New", "mm");
    const added = addStarterDesign(project, starterById("cube-shelf")!, { columns: 3, rows: 2, options: {} });
    if (!added.ok) throw new Error("the cube shelf is refused");
    const design = added.project.designs!.find((item) => item.id === added.id)!;
    const geometry = designGeometry(design, materialsById(added.project))!;
    const show = (value: number) => formatLength(value, "mm", added.project.settings.display);
    expect(fact("Outside")).toBe(`${show(geometry.outsideWidth)} × ${show(geometry.outsideHeight)} × ${show(geometry.depth)}`);
    expect(fact("Mount")).toBe("Floor");
    expect(fact("Sheets")).toMatch(/^About \d+ sheets? of Plywood \(18 mm\)/);
  });

  it("names the items that fit the TV bench, and the legs go when the bench stands on the floor", async () => {
    renderDialog();
    await userEvent.click(row(/^TV bench/));
    expect(heading()).toBe("TV bench 4 × 1");
    expect(fact("Fits")).toBe("KALLAX inserts and boxes, EKET legs");
    await userEvent.click(within(screen.getByRole("group", { name: "Mount" })).getByRole("button", { name: "Floor" }));
    expect(fact("Fits")).toBe("KALLAX inserts and boxes");
  });

  it("has no Fits fact for a starter that fits nothing", async () => {
    renderDialog();
    await userEvent.click(row(/^Bookcase/));
    expect(heading()).toBe("Bookcase 80 × 202");
    expect(screen.queryByText("Fits", { selector: "dt" })).toBeNull();
    await userEvent.click(within(screen.getByRole("group", { name: "Width" })).getByRole("button", { name: "40 cm" }));
    expect(heading()).toBe("Bookcase 40 × 202");
  });

  it("shows the crate with the KALLAX cells that it fits, and no Mount fact", async () => {
    renderDialog();
    await userEvent.click(row(/^Crate/));
    expect(heading()).toBe("Crate");
    expect(within(dialog()).getByRole("heading", { level: 4, name: "Accessories" })).toBeTruthy();
    expect(fact("Fits")).toBe("KALLAX cells");
    expect(screen.queryByText("Mount", { selector: "dt" })).toBeNull();
    expect(screen.getByText("Outside", { selector: "dt" })).toBeTruthy();
  });

  it("adds the starter with the project of addStarterDesign", async () => {
    const project = createProject("New", "mm");
    const { onUse, onClose } = renderDialog(project);
    await userEvent.click(cell(3, 2));
    await userEvent.click(within(dialog()).getByRole("button", { name: "Use this design" }));
    const added = addStarterDesign(project, starterById("cube-shelf")!, { columns: 3, rows: 2, options: {} });
    if (!added.ok) throw new Error("the cube shelf is refused");
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(onUse).toHaveBeenCalledWith({ project: added.project, id: added.id });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes with Cancel and adds nothing", async () => {
    const { onUse, onClose } = renderDialog();
    await userEvent.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onUse).not.toHaveBeenCalled();
  });

  it("shows the error of a design that the materials refuse, and does not let the user add it", () => {
    const base = createProject("Thin", "mm");
    renderDialog({ ...base, materials: [{ id: "thin", name: "Thin", thickness: 6, grained: true }] });
    expect(within(dialog()).getByRole("alert").textContent).toMatch(/pocket/i);
    expect(within(dialog()).getByRole("button", { name: "Use this design" })).toHaveProperty("disabled", true);
  });

  it("warns about a nominal thickness, and still lets the user add the design", () => {
    const base = createProject("Shop", "in");
    renderDialog({ ...base, materials: [{ id: "ply", name: 'Plywood 3/4"', thickness: 0.75, grained: true }] });
    const items = within(dialog()).getAllByRole("listitem").filter((item) => item.closest(".starter-warnings"));
    expect(items).toHaveLength(1);
    expect(items[0]!.textContent).toContain("The stock thickness is nominal. Measure it on the Stock tab.");
    expect(within(dialog()).queryByRole("alert")).toBeNull();
    expect(within(dialog()).getByRole("button", { name: "Use this design" })).toHaveProperty("disabled", false);
  });

  it("shows the full text of a warning that is not about a nominal thickness", async () => {
    const base = createProject("Thin", "mm");
    renderDialog({ ...base, materials: [{ id: "ply", name: "Plywood 12 mm", thickness: 12, grained: true }] });
    await userEvent.click(row(/^Bookcase/));
    const items = [...dialog().querySelectorAll(".starter-warnings li")].map((item) => item.textContent);
    expect(items.some((text) => /can sag/.test(text ?? ""))).toBe(true);
  });
});
