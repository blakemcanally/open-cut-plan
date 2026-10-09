import { analyzeProject, sequencePlan, type Project } from "@opencutplan/core";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo, useState } from "react";
import { describe, expect, it } from "vitest";
import { LayoutTab } from "../src/layout/LayoutTab.tsx";
import { useOptimizeRuns } from "../src/optimizer/useOptimizeRuns.ts";
import { DEFAULT_PREFS } from "../src/state/prefs.ts";
import { useProject, type ProjectStore } from "../src/state/useProject.ts";
import { writeProgress, sequenceKey } from "../src/shop/progress.ts";
import { inProcessWorkers, joinRowProject } from "./helpers.ts";

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
const inspector = () => screen.getByRole("region", { name: "Selected cut" });
const cutsOf = (project: Project) => sequencePlan(project).length;

async function cutsMode() {
  await userEvent.click(screen.getByRole("button", { name: "Cuts" }));
}

async function selectStep(step: number) {
  await userEvent.click(within(sheet()).getByRole("button", { name: new RegExp(`^Step ${step},`) }));
}

describe("the Cuts mode", () => {
  it("locks the parts and selects a cut", async () => {
    renderLayout();
    await cutsMode();
    expect(screen.getByRole("button", { name: "Cuts" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(sheet()).queryByRole("button", { name: /^Post 1,/ })).toBeNull();
    expect(within(inspector()).getByText(/Select a cut on a sheet/)).toBeTruthy();
    await selectStep(6);
    expect(within(inspector()).getByText("Cut 6 · Rip · stage 2")).toBeTruthy();
    expect(within(inspector()).getByText(/Length 20"/)).toBeTruthy();
    expect(document.querySelector('[data-selected-step="6"] .cut-handle[data-end="to"]')).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(within(inspector()).getByText(/Select a cut on a sheet/)).toBeTruthy();
  });

  it("extends a cut to the next stop, saves the cuts, and Undo puts them back", async () => {
    const current = renderLayout();
    await cutsMode();
    await selectStep(6);
    await userEvent.click(within(inspector()).getByRole("button", { name: "Extend the right end" }));
    expect(cutsOf(current().project)).toBe(7);
    expect(within(sheet()).getByText("saved cuts")).toBeTruthy();
    expect(within(inspector()).getByText("Sheet 1: 7 cuts (was 8).")).toBeTruthy();
    expect(within(inspector()).getByText(/Length 40 1\/8"/)).toBeTruthy();
    act(() => current().undo());
    expect(cutsOf(current().project)).toBe(8);
    expect(within(sheet()).getByText("automatic cuts")).toBeTruthy();
  });

  it("joins the cuts on a line with the chip, and the two joins give 6 cuts", async () => {
    const current = renderLayout();
    await cutsMode();
    await selectStep(5);
    await userEvent.click(within(sheet()).getByRole("button", { name: "Join 2 cuts" }));
    expect(cutsOf(current().project)).toBe(7);
    const rail = sequencePlan(current().project).find((step) => step.axis === "y" && step.at === 10.0625)!;
    await selectStep(rail.step);
    await userEvent.click(within(inspector()).getByRole("button", { name: "Join 2 cuts" }));
    expect(cutsOf(current().project)).toBe(6);
  });

  it("shortens a cut at a cross cut", async () => {
    const current = renderLayout();
    await cutsMode();
    await selectStep(1);
    expect(within(inspector()).getByRole("button", { name: "Extend the bottom end" }).hasAttribute("disabled")).toBe(true);
    await userEvent.click(within(inspector()).getByRole("button", { name: "Shorten the bottom end" }));
    const steps = sequencePlan(current().project);
    expect(steps.some((step) => step.axis === "x" && step.at === 20.0625 && step.from === 0 && step.to === 40)).toBe(true);
    expect(within(inspector()).getByText(/Length 40"/)).toBeTruthy();
  });

  it("removes only a cut that the parts do not need", async () => {
    const project = joinRowProject();
    const lines = sequencePlan(project).map(({ axis, at, from, to }) => ({ axis, at, from, to }));
    project.plan!.sheets[0]!.savedCuts = [...lines, { axis: "y", at: 20, from: 80.5, to: 96 }];
    const current = renderLayout(project);
    await cutsMode();
    await selectStep(1);
    expect(within(inspector()).getByRole("button", { name: "Remove" }).hasAttribute("disabled")).toBe(true);
    const waste = sequencePlan(current().project).find((step) => step.at === 20 && step.axis === "y")!;
    await selectStep(waste.step);
    await userEvent.click(within(inspector()).getByRole("button", { name: "Remove" }));
    expect(cutsOf(current().project)).toBe(8);
    expect(within(inspector()).getByText(/Select a cut on a sheet/)).toBeTruthy();
  });

  it("chooses the tool of the selected cut", async () => {
    const project = joinRowProject();
    project.tools = [...project.tools, { id: "track", name: "Track saw", type: "track-saw", kerf: 0.125, enabled: true }];
    const current = renderLayout(project);
    await cutsMode();
    await selectStep(6);
    await userEvent.selectOptions(within(inspector()).getByRole("combobox", { name: "Tool" }), "track");
    expect(sequencePlan(current().project).find((step) => step.step === 6)!.tool?.id).toBe("track");
  });

  it("keeps the done ticks of the cuts that do not change", async () => {
    const project = joinRowProject();
    const steps = sequencePlan(project);
    const ticked = writeProgress(project, { sequence: sequenceKey(steps), done: [1, 6] });
    const current = renderLayout(ticked);
    await cutsMode();
    await selectStep(6);
    await userEvent.click(within(inspector()).getByRole("button", { name: "Extend the right end" }));
    const after = sequencePlan(current().project);
    const progress = (current().project.extensions!["opencutplan.app"] as { progress: { sequence: string; done: number[] } }).progress;
    expect(progress.sequence).toBe(sequenceKey(after));
    expect(progress.done.map((n) => after[n - 1]!.at)).toEqual([20.0625]);
  });
});
