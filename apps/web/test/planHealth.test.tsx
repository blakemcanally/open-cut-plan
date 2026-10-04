import { analyzeProject, type Project } from "@opencutplan/core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo } from "react";
import { describe, expect, it } from "vitest";
import { LayoutTab } from "../src/layout/LayoutTab.tsx";
import { useOptimizeRuns } from "../src/optimizer/useOptimizeRuns.ts";
import { DEFAULT_PREFS } from "../src/state/prefs.ts";
import { useProject, type ProjectStore } from "../src/state/useProject.ts";
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
