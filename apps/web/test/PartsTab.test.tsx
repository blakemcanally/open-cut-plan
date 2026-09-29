import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { isTableText, PartsTab } from "../src/screens/PartsTab.tsx";
import { sampleProject } from "./helpers.ts";
import { renderWithStore } from "./render.tsx";

vi.mock("../src/storage/files.ts", () => ({
  chooseFile: () => Promise.resolve({ text: () => Promise.reject(new Error("the file was moved")) }),
}));

describe("PartsTab", () => {
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

  it("treats text with a tab or a line break as table text", () => {
    expect(isTableText("Top\t30")).toBe(true);
    expect(isTableText("a\nb")).toBe(true);
    expect(isTableText("  12 1/2  \n")).toBe(false);
  });
});
