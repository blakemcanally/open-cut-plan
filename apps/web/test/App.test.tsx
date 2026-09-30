import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import { newProject } from "../src/screens/Home.tsx";
import { openStorage } from "../src/storage/db.ts";
import { inProcessWorkers, sampleProject } from "./helpers.ts";

beforeEach(() => {
  window.location.hash = "";
});

async function renderApp() {
  const storage = await openStorage(indexedDB);
  let next = 0;
  render(<App storage={storage} workerFactory={inProcessWorkers().factory} newId={() => `p${++next}`} />);
  return storage;
}

describe("App", () => {
  it("creates a millimetre project with a table saw and a track saw and opens it on the Parts tab", async () => {
    await renderApp();
    await userEvent.type(screen.getByLabelText("Name"), "Shelf");
    await userEvent.selectOptions(screen.getByLabelText("Units"), "mm");
    await userEvent.click(screen.getByRole("button", { name: "Create project" }));
    expect(window.location.hash).toBe("#/project/p1");
    expect(screen.getByLabelText<HTMLInputElement>("Project name").value).toBe("Shelf");
    expect(screen.getByRole("tab", { name: "Parts" }).getAttribute("aria-selected")).toBe("true");
    const created = newProject("Shelf", "mm");
    expect(created.tools.map((t) => [t.type, t.kerf])).toEqual([["table-saw", 3], ["track-saw", 3]]);
  });

  it("opens an example and returns to the list, which shows the saved project", async () => {
    await renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Open example" }));
    const name = (await screen.findByLabelText("Project name")) as HTMLInputElement;
    const title = name.value;
    await userEvent.click(screen.getByRole("button", { name: "← Projects" }));
    expect(await screen.findByRole("button", { name: title })).toBeTruthy();
  });

  it("deletes a saved project after the person confirms", async () => {
    const storage = await openStorage(indexedDB);
    await storage.saveProject("old", sampleProject());
    let next = 0;
    render(<App storage={storage} workerFactory={inProcessWorkers().factory} newId={() => `q${++next}`} />);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    await userEvent.click(await screen.findByRole("button", { name: "Delete Test" }));
    expect(confirm).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("No saved projects yet.")).toBeTruthy());
    expect(await storage.loadProject("old")).toBeNull();
  });

  it("shows an error and keeps the project when the delete fails", async () => {
    const storage = await openStorage(indexedDB);
    await storage.saveProject("old", sampleProject());
    vi.spyOn(storage, "deleteProject").mockRejectedValue(new Error("The disk is full."));
    render(<App storage={storage} workerFactory={inProcessWorkers().factory} />);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await userEvent.click(await screen.findByRole("button", { name: "Delete Test" }));
    expect((await screen.findByRole("alert")).textContent).toContain("The project could not be deleted: The disk is full.");
    expect(screen.getByRole("button", { name: "Delete Test" })).toBeTruthy();
  });

  it("keeps the saved edits when the person goes Back and opens the project again", async () => {
    const storage = await openStorage(indexedDB);
    await storage.saveProject("old", sampleProject());
    render(<App storage={storage} workerFactory={inProcessWorkers().factory} />);
    await userEvent.click(await screen.findByRole("button", { name: "Test" }));
    const name = await screen.findByLabelText("Project name");
    await userEvent.clear(name);
    await userEvent.type(name, "Renamed{Enter}");
    await waitFor(async () => expect((await storage.loadProject("old"))?.project.name).toBe("Renamed"));
    act(() => {
      window.location.hash = "#/";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await userEvent.click(await screen.findByRole("button", { name: "Renamed" }));
    expect((await screen.findByLabelText<HTMLInputElement>("Project name")).value).toBe("Renamed");
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect((await storage.loadProject("old"))?.project.name).toBe("Renamed");
  });

  it("does not change the saved time of a project that is opened and left without an edit", async () => {
    let second = 0;
    const storage = await openStorage(indexedDB, () => new Date(Date.UTC(2026, 0, 1, 0, 0, second++)));
    await storage.saveProject("old", sampleProject());
    const [before] = await storage.listProjects();
    render(<App storage={storage} workerFactory={inProcessWorkers().factory} />);
    await userEvent.click(await screen.findByRole("button", { name: "Test" }));
    await screen.findByLabelText("Project name");
    await new Promise((resolve) => setTimeout(resolve, 700));
    await userEvent.click(screen.getByRole("button", { name: "← Projects" }));
    await screen.findByRole("button", { name: "Test" });
    expect((await storage.listProjects())[0]!.modified).toBe(before!.modified);
  });

  it("shows an error for a project id that is not saved", async () => {
    window.location.hash = "#/project/missing";
    await renderApp();
    expect((await screen.findByRole("alert")).textContent).toContain("not saved in this browser");
  });

  it("shows the same error for a project id that is not valid percent-encoding", async () => {
    window.location.hash = "#/project/%E0";
    await renderApp();
    expect((await screen.findByRole("alert")).textContent).toContain("not saved in this browser");
  });
});
