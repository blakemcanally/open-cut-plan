import { analyzeProject, createProject, type Project } from "@opencutplan/core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo } from "react";
import { describe, expect, it } from "vitest";
import { LayoutTab } from "../src/layout/LayoutTab.tsx";
import { useOptimizeRuns } from "../src/optimizer/useOptimizeRuns.ts";
import { PrintView } from "../src/print/PrintView.tsx";
import { Workspace } from "../src/screens/Workspace.tsx";
import { DEFAULT_PREFS } from "../src/state/prefs.ts";
import { useProject, type ProjectStore } from "../src/state/useProject.ts";
import { openStorage } from "../src/storage/db.ts";
import { inProcessWorkers, sampleProject } from "./helpers.ts";

function renderLayout(initial: Project) {
  let latest: ProjectStore | null = null;
  function Harness() {
    const store = useProject(initial);
    latest = store;
    const analysis = useMemo(() => analyzeProject(store.project), [store.project]);
    const runs = useOptimizeRuns(store, inProcessWorkers().factory);
    return <LayoutTab store={store} analysis={analysis} prefs={DEFAULT_PREFS} onPrefs={() => {}} runs={runs} onShowSettings={() => {}} onOpenStep={() => {}} />;
  }
  render(<Harness />);
  return () => latest!;
}

/** The sample project with MDF doors, and no stock of MDF. */
function stocklessProject(): Project {
  const project = sampleProject();
  return {
    ...project,
    settings: { ...project.settings, optimizer: { ...project.settings.optimizer, timeLimitMs: 300 } },
    materials: [...project.materials, { id: "mdf", name: "MDF", thickness: 0.75, grained: false }],
    parts: [...project.parts, { id: "door", name: "Door", material: "mdf", length: 20, width: 10, quantity: 2, grain: "none" }],
  };
}

const tray = () => screen.getByRole("region", { name: /Unplaced parts/ });

describe("a material with no stock in the tray", () => {
  it("says that the material has no stock, before and after a run, and not that the parts are too large", async () => {
    renderLayout(stocklessProject());
    const door = () => within(tray()).getByRole("button", { name: /Door 1/ });
    expect(door().textContent).toContain("⚠ its material has no stock");
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
    await waitFor(() => expect(within(tray()).queryByRole("button", { name: /Shelf/ })).toBeNull(), { timeout: 4000 });
    expect(door().textContent).toContain("⚠ its material has no stock");
    expect(tray().textContent).not.toContain("larger than every enabled stock");
  });

  it("adds a sheet for the material with Add stock", async () => {
    const current = renderLayout(stocklessProject());
    expect(within(tray()).getByText(/MDF has no stock\./)).toBeTruthy();
    expect(within(tray()).getByText('Adds unlimited 96" × 48" sheets with no price.')).toBeTruthy();
    await userEvent.click(within(tray()).getByRole("button", { name: "Add stock for MDF" }));
    expect(current().project.stock.at(-1)).toEqual({ id: "mdf-96x48", material: "mdf", length: 96, width: 48, quantity: null, kind: "sheet" });
    expect(within(tray()).queryByRole("button", { name: "Add stock for MDF" })).toBeNull();
    expect(within(tray()).getByRole("button", { name: /Door 1/ }).textContent).not.toContain("⚠");
  });
});

async function renderWorkspace(project: Project) {
  const storage = await openStorage(indexedDB);
  render(<Workspace id="p1" initial={project} notices={[]} storage={storage} workerFactory={inProcessWorkers().factory} onHome={() => undefined} />);
}

const tab = (name: string) => screen.getByRole("tab", { name });
const selectedTab = () => document.querySelector('[role="tab"][aria-selected="true"]')!.id;

/** The sample project with the two sides on top of each other. */
function overlapProject(): Project {
  const project = sampleProject();
  project.plan!.sheets[0]!.placements[1]!.y = 5;
  return project;
}

describe("the plan problems on the Shop tab and the Reports tab", () => {
  it("shows a banner that names the parts, keeps the Shop tab usable, and opens the Problems list", async () => {
    await renderWorkspace(overlapProject());
    await userEvent.click(tab("Shop"));
    const banner = screen.getByRole("status");
    expect(banner.textContent).toContain("✖ The plan is not ready to cut. 2 parts have a layout error: Side 1 and Side 2. 1 part is not on a sheet: Shelf.");
    expect(screen.getByRole("button", { name: "Mark done" })).toBeTruthy();
    await userEvent.click(within(banner).getByRole("button", { name: "Show the problems on the Layout tab" }));
    expect(selectedTab()).toBe("tab-layout");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: /^Problems/ }));
  });

  it("shows the banner on the Reports tab, and none when every part is placed with no error", async () => {
    await renderWorkspace(sampleProject());
    await userEvent.click(tab("Reports"));
    expect(screen.getByRole("status").textContent).toContain("⚠ The plan is not ready to cut. 1 part is not on a sheet: Shelf.");
    await userEvent.click(tab("Parts"));
    await userEvent.click(screen.getByRole("button", { name: "Delete Shelf" }));
    await userEvent.click(tab("Reports"));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("puts the count of errors on the Layout tab, and keeps the name of the tab", async () => {
    await renderWorkspace(overlapProject());
    const layout = tab("Layout");
    expect(layout.textContent).toBe("Layout1");
    expect(layout.getAttribute("aria-describedby")).toBe("layout-errors");
    expect(document.getElementById("layout-errors")!.textContent).toBe("The plan has 1 error.");
  });

  it("puts the banner on the first page of the booklet", () => {
    render(<PrintView job={{ kind: "booklet", sections: ["shopping", "sheets"] }} analysis={analyzeProject(overlapProject())} onDone={() => {}} />);
    const first = document.querySelector(".print-root .print-page")!;
    expect(first.querySelector(".print-alert")!.textContent).toBe(
      "✖ The plan is not ready to cut. 2 parts have a layout error: Side 1 and Side 2. 1 part is not on a sheet: Shelf. See the Problems list on the Layout tab.",
    );
    expect(document.querySelectorAll(".print-alert")).toHaveLength(1);
  });
});

describe("a new project", () => {
  it("opens on the Design tab, and each empty state links to the tab that fixes it", async () => {
    await renderWorkspace(createProject("New", "in"));
    expect(selectedTab()).toBe("tab-design");
    await userEvent.click(tab("Layout"));
    await userEvent.click(screen.getByRole("button", { name: "Parts tab" }));
    expect(selectedTab()).toBe("tab-parts");
    await userEvent.click(tab("Layout"));
    await userEvent.click(screen.getByRole("button", { name: "Design tab" }));
    expect(selectedTab()).toBe("tab-design");
    await userEvent.click(tab("Shop"));
    await userEvent.click(screen.getByRole("button", { name: "Layout tab" }));
    expect(selectedTab()).toBe("tab-layout");
    await userEvent.click(tab("Reports"));
    await userEvent.click(screen.getByRole("button", { name: "Layout tab" }));
    expect(selectedTab()).toBe("tab-layout");
  });

  it("links the Layout tab to the Stock tab when there is no stock", async () => {
    const project = sampleProject();
    await renderWorkspace({ ...project, stock: [], plan: undefined });
    await userEvent.click(screen.getByRole("button", { name: "Stock tab" }));
    expect(selectedTab()).toBe("tab-stock");
  });
});

describe("the materials with no stock on the Parts tab and the Stock tab", () => {
  it("names each material that parts use and that has no enabled stock, and adds its suggested sheet", async () => {
    await renderWorkspace(stocklessProject());
    await userEvent.click(tab("Parts"));
    expect(screen.getByText(/MDF has no stock\./)).toBeTruthy();
    await userEvent.click(tab("Stock"));
    await userEvent.click(screen.getByRole("button", { name: "Add stock for MDF" }));
    expect(screen.queryByText(/MDF has no stock\./)).toBeNull();
    expect(screen.getByLabelText("Length of stock mdf-96x48")).toBeTruthy();
  });
});
