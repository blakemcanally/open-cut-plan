import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { regenerateDesigns } from "@opencutplan/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TABS, Workspace } from "../src/screens/Workspace.tsx";
import { openStorage, unavailableStorage, type Storage } from "../src/storage/db.ts";
import { designProject, inProcessWorkers, sampleProject } from "./helpers.ts";

async function renderWorkspace(project = sampleProject(), given?: Storage) {
  const storage = given ?? (await openStorage(indexedDB));
  render(<Workspace id="p1" initial={project} notices={[]} storage={storage} workerFactory={inProcessWorkers().factory} onHome={() => undefined} />);
  return storage;
}

const part = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name},`) });

afterEach(() => {
  delete (URL as { createObjectURL?: unknown }).createObjectURL;
  delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
});

describe("Workspace", () => {
  it("opens on the Layout tab and moves between tabs with the arrow keys", async () => {
    await renderWorkspace();
    expect(screen.getByRole("tab", { name: "Layout" }).getAttribute("aria-selected")).toBe("true");
    screen.getByRole("tab", { name: "Layout" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Shop" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toMatch(/^Step 1\. /);
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Parts" }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Parts" }));
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Design" }).getAttribute("aria-selected")).toBe("true");
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: TABS.at(-1)!.label }).getAttribute("aria-selected")).toBe("true");
  });

  it("undoes and redoes layout edits with the keyboard and the buttons", async () => {
    await renderWorkspace();
    part("Side 2").focus();
    await userEvent.keyboard("r");
    expect(part("Side 2").getAttribute("aria-label")).toContain("turned");
    await userEvent.keyboard("{Delete}");
    const tray = screen.getByRole("region", { name: /Unplaced parts/ });
    expect(within(tray).getByRole("button", { name: /Side 2/ })).toBeTruthy();
    await userEvent.keyboard("{Meta>}z{/Meta}");
    expect(part("Side 2").getAttribute("aria-label")).toContain("turned");
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(part("Side 2").getAttribute("aria-label")).not.toContain("turned");
    await userEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(part("Side 2").getAttribute("aria-label")).toContain("turned");
  });

  it("counts quick arrow-key moves of one part as one edit", async () => {
    await renderWorkspace();
    part("Side 1").focus();
    const before = part("Side 1").getAttribute("transform");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(part("Side 1").getAttribute("transform")).not.toBe(before);
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(part("Side 1").getAttribute("transform")).toBe(before);
    expect(screen.getByRole("button", { name: "Undo" }).hasAttribute("disabled")).toBe(true);
  });

  it("autosaves the project to the browser after an edit", async () => {
    const storage = await renderWorkspace();
    await userEvent.click(screen.getByRole("tab", { name: "Parts" }));
    const name = screen.getByLabelText("Name of Shelf");
    await userEvent.clear(name);
    await userEvent.type(name, "Top{Enter}");
    await waitFor(async () => expect((await storage.loadProject("p1"))?.parts[1]?.name).toBe("Top"), { timeout: 3000 });
  });

  it("keeps a banner open when the browser cannot save the project", async () => {
    await renderWorkspace(sampleProject(), unavailableStorage("private mode"));
    const alert = await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(alert.textContent).toContain("could not save the project");
    expect(alert.textContent).toContain("Save file");
  });

  it("returns focus to the opener when a dialog closes", async () => {
    await renderWorkspace();
    await userEvent.click(screen.getByRole("tab", { name: "Parts" }));
    await userEvent.click(screen.getByRole("button", { name: "Paste rows…" }));
    expect(screen.getByRole("dialog", { name: "Import parts" })).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Paste rows…" }));
  });

  it("keeps Tab inside an open dialog", async () => {
    await renderWorkspace();
    await userEvent.click(screen.getByRole("tab", { name: "Parts" }));
    await userEvent.click(screen.getByRole("button", { name: "Paste rows…" }));
    const dialog = screen.getByRole("dialog", { name: "Import parts" });
    const close = within(dialog).getByRole("button", { name: "Close" });
    close.focus();
    await userEvent.tab({ shift: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(close);
    for (let i = 0; i < 30; i++) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("does not undo behind an open dialog", async () => {
    await renderWorkspace();
    part("Side 2").focus();
    await userEvent.keyboard("r");
    await userEvent.click(screen.getByRole("tab", { name: "Parts" }));
    await userEvent.click(screen.getByRole("button", { name: "Paste rows…" }));
    await userEvent.keyboard("{Meta>}z{/Meta}");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("tab", { name: "Layout" }));
    expect(part("Side 2").getAttribute("aria-label")).toContain("turned");
  });

  it("closes the file status with Dismiss", async () => {
    URL.createObjectURL = () => "blob:project";
    URL.revokeObjectURL = () => undefined;
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Save file" }));
    expect(await screen.findByText("The file was downloaded.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("The file was downloaded.")).toBeNull();
  });

  it("opens the Settings tab from the goal on the Layout tab", async () => {
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByRole("tab", { name: "Settings" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("combobox", { name: "Goal" })).toBeTruthy();
  });

  it("stops drawing grain on the layout when the grain feature is turned off", async () => {
    await renderWorkspace();
    part("Side 2").focus();
    await userEvent.keyboard("r");
    const sheet = screen.getByRole("group", { name: /^Sheet 1 layout/ });
    const stripes = () => sheet.querySelectorAll('rect:not(.grid)[fill^="url("]').length;
    expect(part("Side 2").getAttribute("aria-label")).toContain("across the grain");
    expect(stripes()).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("tab", { name: "Settings" }));
    await userEvent.click(screen.getByRole("checkbox", { name: /^Grain/ }));
    await userEvent.click(screen.getByRole("tab", { name: "Layout" }));
    expect(screen.getByRole("group", { name: /^Sheet 1 layout/ }).querySelectorAll('rect:not(.grid)[fill^="url("]').length).toBe(0);
    expect(part("Side 2").getAttribute("aria-label")).not.toContain("across the grain");
  });

  it("prints the cut sequence from the Shop tab and removes the print pages after the dialog", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    await renderWorkspace();
    await userEvent.click(screen.getByRole("tab", { name: "Shop" }));
    await userEvent.click(screen.getByRole("button", { name: "Print cut sequence" }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    const root = document.body.querySelector(":scope > .print-root");
    expect(root?.getAttribute("data-job")).toBe("sequence");
    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    expect(document.body.querySelector(".print-root")).toBeNull();
    print.mockRestore();
  });

  it("prints the sheet diagrams from the Reports tab", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    await renderWorkspace();
    await userEvent.click(screen.getByRole("tab", { name: "Reports" }));
    await userEvent.click(screen.getByRole("button", { name: "Print sheet diagrams" }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    expect(document.body.querySelector(":scope > .print-root")?.getAttribute("data-job")).toBe("sheets");
    print.mockRestore();
  });

  it("opens the design of a part from the Parts tab", async () => {
    const project = designProject();
    await renderWorkspace(regenerateDesigns({ ...project, designs: [...project.designs!, { ...project.designs![0]!, id: "desk", name: "Desk" }] }));
    await userEvent.click(screen.getByRole("tab", { name: "Parts" }));
    await userEvent.click(within(screen.getAllByRole("row", { name: /^Side/ }).at(-1)!).getByRole("button", { name: "Desk" }));
    expect(screen.getByRole("tab", { name: "Design" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: /^Desk /, pressed: true })).toBeTruthy();
  });

  it("prints the assembly steps from the Reports tab", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    await renderWorkspace(designProject());
    await userEvent.click(screen.getByRole("tab", { name: "Reports" }));
    await userEvent.click(screen.getByRole("button", { name: "Print assembly steps" }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    const root = document.body.querySelector(":scope > .print-root")!;
    expect(root.getAttribute("data-job")).toBe("assembly");
    expect(root.querySelectorAll(".print-steps li")).toHaveLength(9);
    print.mockRestore();
  });
});
