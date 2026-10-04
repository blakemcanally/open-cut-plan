import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { isTableText, PartsTab } from "../src/screens/PartsTab.tsx";
import { designProject, sampleProject } from "./helpers.ts";
import { renderWithStore } from "./render.tsx";

vi.mock("../src/storage/files.ts", () => ({
  chooseFile: () => Promise.resolve({ text: () => Promise.reject(new Error("the file was moved")) }),
}));

describe("PartsTab", () => {
  it("chooses the colour of each group of parts without a design, and makes it automatic again", async () => {
    const project = designProject();
    project.parts.push({ id: "door", name: "Door", material: "ply18", length: 300, width: 200, quantity: 2, grain: "length", group: "Doors" });
    const { current } = renderWithStore(project, (store) => <PartsTab store={store} />);
    expect(screen.queryByLabelText("Colour of Hall")).toBeNull();
    const doors = screen.getByLabelText("Colour of Doors") as HTMLInputElement;
    expect(doors.value).toBe("#f2c27b");
    fireEvent.change(doors, { target: { value: "#00aa00" } });
    expect(current().project.groups).toEqual({ Doors: { color: "#00aa00" } });
    await userEvent.click(screen.getByRole("button", { name: "Automatic colour for Doors" }));
    expect(current().project).not.toHaveProperty("groups");
  });

  it("renames a group on all its parts, and the colour moves with it", async () => {
    const project = designProject();
    const door = { material: "ply18", length: 300, width: 200, quantity: 1, grain: "length" as const, group: "Doors" };
    project.parts.push({ id: "door", name: "Door", ...door }, { id: "glass", name: "Glass door", ...door });
    project.groups = { Doors: { color: "#00aa00" } };
    const { current } = renderWithStore(project, (store) => <PartsTab store={store} />);
    await userEvent.click(screen.getByRole("button", { name: "Rename group Doors" }));
    const name = screen.getByRole("textbox", { name: "New name of group Doors" });
    expect(document.activeElement).toBe(name);
    await userEvent.clear(name);
    await userEvent.type(name, "Fronts{Escape}");
    expect(screen.queryByRole("textbox", { name: "New name of group Doors" })).toBeNull();
    expect(current().project.parts.filter((part) => part.group === "Doors")).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "Rename group Doors" }));
    await userEvent.clear(screen.getByRole("textbox", { name: "New name of group Doors" }));
    await userEvent.type(screen.getByRole("textbox", { name: "New name of group Doors" }), "Fronts{Enter}");
    expect(current().project.parts.filter((part) => part.group === "Fronts").map((part) => part.id)).toEqual(["door", "glass"]);
    expect(current().project.groups).toEqual({ Fronts: { color: "#00aa00" } });
    expect(screen.getByLabelText("Colour of Fronts")).toHaveProperty("value", "#00aa00");
    expect(screen.getByLabelText("Group of Glass door")).toHaveProperty("value", "Fronts");
    expect(screen.queryByRole("textbox", { name: /^New name of group/ })).toBeNull();
  });

  it("commits an edited length and lowers the quantity, which takes the extra copy off the sheet", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <PartsTab store={store} />);
    const length = screen.getByLabelText("Length of Side");
    await userEvent.clear(length);
    await userEvent.type(length, "32{Enter}");
    expect(current().project.parts[0]!.length).toBe(32);
    const quantity = screen.getByLabelText("Quantity of Side");
    await userEvent.clear(quantity);
    await userEvent.type(quantity, "1{Enter}");
    expect(current().project.parts[0]!.quantity).toBe(1);
    expect(current().project.plan!.sheets[0]!.placements).toHaveLength(1);
    expect(screen.getByLabelText("Totals").textContent).toContain("Plywood: 2 pieces");
  });

  it("adds a part and focuses its name", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <PartsTab store={store} />);
    await userEvent.click(screen.getByRole("button", { name: "Add part" }));
    expect(current().project.parts).toHaveLength(3);
    const added = current().project.parts[2]!;
    expect(document.activeElement).toBe(screen.getByLabelText(`Name of ${added.name}`));
  });

  it("selects the name of the new part, so that typing replaces it", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <PartsTab store={store} />);
    await userEvent.click(screen.getByRole("button", { name: "Add part" }));
    await userEvent.keyboard("Door{Enter}");
    expect(current().project.parts[2]!.name).toBe("Door");
  });

  it("deletes a part and removes its copies from the plan", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <PartsTab store={store} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete Side" }));
    expect(current().project.parts.map((p) => p.id)).toEqual(["shelf"]);
    expect(current().project.plan!.sheets[0]!.placements).toEqual([]);
  });

  it("shows an error when the chosen CSV file cannot be read", async () => {
    renderWithStore(sampleProject(), (store) => <PartsTab store={store} />);
    await userEvent.click(screen.getByRole("button", { name: "Import CSV…" }));
    expect((await screen.findByRole("alert")).textContent).toBe("✖ The file could not be read: the file was moved");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the import dialog when rows from a spreadsheet are pasted", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <PartsTab store={store} />);
    fireEvent.paste(screen.getByLabelText("Notes for Shelf"), { clipboardData: { getData: () => "Name\tLength\tWidth\nTop\t30\t12\n" } });
    await userEvent.click(await screen.findByRole("button", { name: "Import 1 row" }));
    expect(current().project.parts.map((p) => p.name)).toEqual(["Side", "Shelf", "Top"]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the parts of a design as rows that cannot change, with a link to the design", async () => {
    const onShowDesign = vi.fn();
    const project = designProject();
    const orphan = { id: "plinth", name: "Plinth", material: "ply18", length: 700, width: 80, quantity: 1, grain: "length" as const, design: "gone" };
    renderWithStore({ ...project, parts: [...project.parts, orphan] }, (store) => <PartsTab store={store} onShowDesign={onShowDesign} />);
    const row = screen.getByRole("row", { name: /^Side/ });
    expect(within(row).queryByRole("textbox")).toBeNull();
    expect(within(row).queryByRole("button", { name: /^Delete/ })).toBeNull();
    expect(within(row).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["Side", "688 mm", "390 mm", "2", "Plywood 18", "Along length", "By the rule: none", "Hall", "From design: Hall"]);
    await userEvent.click(within(row).getByRole("button", { name: "Hall" }));
    expect(onShowDesign).toHaveBeenCalledWith("hall");
    expect(screen.getByLabelText("Name of Plinth")).toBeTruthy();
  });

  it("asks for a factory edge on a part, follows the rule of the settings, and shows the rule for a design part", async () => {
    const project = sampleProject();
    project.settings.factoryEdge = { minLength: 25 };
    const { current } = renderWithStore(project, (store) => <PartsTab store={store} />);
    const side = screen.getByLabelText("Factory edge of Side") as HTMLSelectElement;
    expect(side.value).toBe("");
    expect(side.selectedOptions[0]!.textContent).toBe("By the rule: long edge");
    expect(screen.getByLabelText<HTMLSelectElement>("Factory edge of Shelf").selectedOptions[0]!.textContent).toBe("By the rule: none");
    await userEvent.selectOptions(side, "none");
    expect(current().project.parts[0]!.factoryEdge).toBe("none");
    await userEvent.selectOptions(side, "");
    expect(current().project.parts[0]).not.toHaveProperty("factoryEdge");
    await userEvent.selectOptions(screen.getByLabelText("Factory edge of Shelf"), "long");
    expect(current().project.parts[1]!.factoryEdge).toBe("long");
  });

  it("keeps a factory edge request that this app does not know", () => {
    const project = sampleProject();
    project.parts[0] = { ...project.parts[0]!, factoryEdge: "both" };
    renderWithStore(project, (store) => <PartsTab store={store} />);
    const side = screen.getByLabelText("Factory edge of Side") as HTMLSelectElement;
    expect(side.value).toBe("both");
    expect(side.selectedOptions[0]!.textContent).toBe("both (not known)");
  });

  it("treats text with a tab or a line break as table text", () => {
    expect(isTableText("Top\t30")).toBe(true);
    expect(isTableText("a\nb")).toBe(true);
    expect(isTableText("  12 1/2  \n")).toBe(false);
  });
});
