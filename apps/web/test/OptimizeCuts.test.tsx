import { analyzeProject, type Project } from "@opencutplan/core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo, useState } from "react";
import { describe, expect, it } from "vitest";
import { LayoutTab } from "../src/layout/LayoutTab.tsx";
import { useOptimizeRuns } from "../src/optimizer/useOptimizeRuns.ts";
import { DEFAULT_PREFS } from "../src/state/prefs.ts";
import { useProject, type ProjectStore } from "../src/state/useProject.ts";
import { inProcessWorkers, joinRowProject, sampleProject } from "./helpers.ts";

function renderLayout(initial: Project = joinRowProject()) {
  const factory = inProcessWorkers().factory;
  let latest: ProjectStore | null = null;
  function Harness() {
    const store = useProject(initial);
    latest = store;
    const [prefs, setPrefs] = useState(DEFAULT_PREFS);
    const analysis = useMemo(() => analyzeProject(store.project), [store.project]);
    const runs = useOptimizeRuns(store, factory);
    return <LayoutTab store={store} analysis={analysis} prefs={prefs} onPrefs={setPrefs} runs={runs} onShowSettings={() => {}} onOpenStep={() => {}} />;
  }
  render(<Harness />);
  return () => latest!;
}

const sheet = () => screen.getByRole("region", { name: /^Sheet 1:/ });
const status = () => screen.getAllByRole("status").map((element) => element.textContent).join(" ");
const part = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name},`) });

async function optimizeCuts() {
  await userEvent.click(screen.getByRole("button", { name: "Optimize cuts" }));
  await waitFor(() => expect(status()).toContain("Optimize cuts saved fewer cuts on 1 sheet."), { timeout: 10000 });
}

describe("Optimize cuts", () => {
  it("saves a tree with fewer cuts and labels the sheet", async () => {
    const current = renderLayout();
    expect(within(sheet()).getByText("automatic cuts")).toBeTruthy();
    await optimizeCuts();
    expect(status()).toContain(`Sheet 1: 8 → 6 cuts, 272" → 258 1/2" of cuts.`);
    expect(within(sheet()).getByText("saved cuts")).toBeTruthy();
    expect(current().project.plan!.sheets[0]!.savedCuts).toBeDefined();
    expect(analyzeProject(current().project).sheets[0]!.savedCuts).toBe("used");
  }, 15000);

  it("searches one sheet from its header", async () => {
    renderLayout();
    await userEvent.click(screen.getByRole("button", { name: "Optimize the cuts of sheet 1" }));
    await waitFor(() => expect(within(sheet()).getByText("saved cuts")).toBeTruthy(), { timeout: 10000 });
  }, 15000);

  it("says so when the cuts are already the best found", async () => {
    const current = renderLayout(sampleProject());
    await userEvent.click(screen.getByRole("button", { name: "Optimize cuts" }));
    await waitFor(() => expect(status()).toContain("These cuts are already the best found."), { timeout: 10000 });
    expect(current().project.plan!.sheets[0]!.savedCuts).toBeUndefined();
  }, 15000);

  it("removes the saved cuts when a part moves, and Undo puts them back", async () => {
    const current = renderLayout();
    await optimizeCuts();
    part("Rail 1").focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(current().project.plan!.sheets[0]!.savedCuts).toBeUndefined();
    expect(within(sheet()).getByText("automatic cuts")).toBeTruthy();
    expect(status()).toContain("The saved cuts of sheet 1 were removed, because a part moved.");
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(current().project.plan!.sheets[0]!.savedCuts).toBeDefined();
    expect(within(sheet()).getByText("saved cuts")).toBeTruthy();
    expect(screen.queryByText(/were removed, because a part moved/)).toBeNull();
  }, 15000);

  it("goes back to the automatic cuts", async () => {
    const current = renderLayout();
    await optimizeCuts();
    await userEvent.click(within(sheet()).getByRole("button", { name: "Use automatic cuts" }));
    expect(current().project.plan!.sheets[0]!.savedCuts).toBeUndefined();
    expect(within(sheet()).getByText("automatic cuts")).toBeTruthy();
    expect(within(sheet()).queryByRole("button", { name: "Use automatic cuts" })).toBeNull();
  }, 15000);

  it("lets the parts slide when the box is on, and Undo puts the parts and the cuts back", async () => {
    const loose = joinRowProject();
    const sheet0 = loose.plan!.sheets[0]!;
    loose.plan = { sheets: [{ ...sheet0, placements: sheet0.placements.map((placement, i) => (i === 2 ? { ...placement, y: 3 } : placement)) }] };
    const current = renderLayout(loose);
    await userEvent.click(screen.getByRole("checkbox", { name: "Let parts slide" }));
    await userEvent.click(screen.getByRole("button", { name: "Optimize cuts" }));
    await waitFor(() => expect(status()).toContain("Optimize cuts saved fewer cuts on 1 sheet and slid 1 part."), { timeout: 10000 });
    expect(status()).toContain("Slid 1 part inside its piece.");
    expect(current().project.plan!.sheets[0]!.placements[2]).toMatchObject({ x: 40.25, y: 0 });
    expect(analyzeProject(current().project).sheets[0]!.savedCuts).toBe("used");
    expect(status()).not.toContain("were removed");
    await userEvent.click(screen.getByRole("button", { name: "Undo optimize" }));
    expect(current().project.plan!.sheets[0]!.placements[2]).toMatchObject({ y: 3 });
    expect(current().project.plan!.sheets[0]!.savedCuts).toBeUndefined();
  }, 15000);

  it("moves no part when the box is off", async () => {
    const loose = joinRowProject();
    const sheet0 = loose.plan!.sheets[0]!;
    loose.plan = { sheets: [{ ...sheet0, placements: sheet0.placements.map((placement, i) => (i === 2 ? { ...placement, y: 3 } : placement)) }] };
    const current = renderLayout(loose);
    await optimizeCuts();
    expect(current().project.plan!.sheets[0]!.placements).toEqual(loose.plan.sheets[0]!.placements);
  }, 15000);

  it("offers no Optimize cuts when the cut order is off", () => {
    const project = joinRowProject();
    project.settings.features = { ...project.settings.features, cutOrder: false };
    renderLayout(project);
    expect(screen.queryByRole("button", { name: "Optimize cuts" })).toBeNull();
    expect(screen.queryByText("automatic cuts")).toBeNull();
  });
});
