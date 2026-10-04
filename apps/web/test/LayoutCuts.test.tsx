import { analyzeProject, defaultTools, sequencePlan, setToolChoice, stageColor, stockLabel, TOOL_COLORS, TOOL_WARNING_COLOR, TOOL_WARNING_FILL, type Project } from "@opencutplan/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo, useState } from "react";
import { describe, expect, it } from "vitest";
import { LayoutTab } from "../src/layout/LayoutTab.tsx";
import { useOptimizeRuns } from "../src/optimizer/useOptimizeRuns.ts";
import { formatMoney } from "../src/reports/money.ts";
import { DEFAULT_PREFS } from "../src/state/prefs.ts";
import { useProject, type ProjectStore } from "../src/state/useProject.ts";
import { inProcessWorkers, sampleProject } from "./helpers.ts";

function renderLayout(initial: Project = sampleProject()) {
  const factory = inProcessWorkers().factory;
  const opened: number[] = [];
  let latest: ProjectStore | null = null;
  function Harness() {
    const store = useProject(initial);
    latest = store;
    const [prefs, setPrefs] = useState(DEFAULT_PREFS);
    const analysis = useMemo(() => analyzeProject(store.project), [store.project]);
    const runs = useOptimizeRuns(store, factory);
    return <LayoutTab store={store} analysis={analysis} prefs={prefs} onPrefs={setPrefs} runs={runs} onShowSettings={() => {}} onOpenStep={(step) => opened.push(step)} />;
  }
  render(<Harness />);
  return { opened, current: () => latest! };
}

/** The sample project with the default table saw and track saw, and the table saw chosen for the first cut, which is over its largest piece. */
function overLimitProject(): Project {
  const project = sampleProject();
  project.tools = defaultTools("in");
  return setToolChoice(project, sequencePlan(project)[0]!, "table-saw");
}

const cutLine = (step: number) => document.querySelector(`.cut[data-step="${step}"] line`)!;
const cutNumber = (step: number) => document.querySelector(`.cut[data-step="${step}"] circle`)!;
const legend = () => within(screen.getByRole("list", { name: "Cut colours" }));
const legendItems = () => legend().getAllByRole("listitem").map((item) => item.textContent);

describe("LayoutTab cuts", () => {
  it("shows the full stock name and a summary of the cuts, the use, and the cost under each sheet title", () => {
    renderLayout();
    const analysis = analyzeProject(sampleProject());
    const ctx = analysis.context;
    const region = screen.getByRole("region", { name: /^Sheet 1:/ });
    const stock = within(region).getByText(stockLabel(ctx, ctx.stock.get("ply-4x8")!));
    expect(stock.getAttribute("title")).toBe(stock.textContent);
    expect(region.querySelector(".sheet-summary")!.textContent).toBe(`Table saw ${analysis.steps.length} cuts · 16% used · ${formatMoney(60, "USD")}`);
  });

  it("colours the cuts by stage, and by tool after the switch, with a legend for each", async () => {
    renderLayout();
    const { steps } = analyzeProject(sampleProject());
    const stages = [...new Set(steps.map((step) => step.stage))].sort((a, b) => a - b);
    const group = screen.getByRole("group", { name: "Colour cuts by" });
    expect(within(group).getByRole("radio", { name: "Stage" })).toHaveProperty("checked", true);
    expect(legendItems()).toEqual(stages.map((stage) => `Stage ${stage}`));
    expect(cutLine(5).getAttribute("stroke")).toBe(stageColor(steps[4]!.stage));
    expect(document.querySelector(".sheet-summary .swatch")).toBeNull();

    await userEvent.click(within(group).getByRole("radio", { name: "Tool" }));
    expect(within(group).getByRole("radio", { name: "Tool" })).toHaveProperty("checked", true);
    expect(legendItems()).toEqual(["Table saw"]);
    for (const step of steps) expect(cutLine(step.step).getAttribute("stroke")).toBe(TOOL_COLORS[0]);
    expect((document.querySelector(".sheet-summary .swatch") as HTMLElement).style.background).toBe("rgb(26, 95, 208)");
  });

  it("marks a cut over a limit of its tool, and names the warning in the legend", async () => {
    renderLayout(overLimitProject());
    await userEvent.click(screen.getByRole("radio", { name: "Tool" }));
    expect(legendItems()).toEqual(["Table saw", "Track saw", "No tool, or over a tool limit"]);
    expect(cutLine(1).getAttribute("stroke")).toBe(TOOL_WARNING_COLOR);
    expect(cutNumber(1).getAttribute("fill")).toBe(TOOL_WARNING_FILL);
    expect(cutLine(2).getAttribute("stroke")).toBe(TOOL_COLORS[1]);
    expect(cutNumber(2).getAttribute("fill")).toBe("#fff");
    expect(screen.getByRole("button", { name: "Step 1, Table saw trim, over its largest piece" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Step 2, Track saw trim" })).toBeTruthy();
  });

  it("names a cut with no tool", () => {
    const project = sampleProject();
    project.tools[0]!.enabled = false;
    renderLayout(project);
    expect(screen.getByRole("button", { name: "Step 1, no tool, trim" })).toBeTruthy();
  });

  it("opens the step of a cut number with a click, Enter, or Space", async () => {
    const { opened } = renderLayout();
    const { steps } = analyzeProject(sampleProject());
    await userEvent.click(screen.getByRole("button", { name: `Step 5, Table saw ${steps[4]!.kind}` }));
    expect(opened).toEqual([5]);
    screen.getByRole("button", { name: /^Step 3, / }).focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(opened).toEqual([5, 3, 3]);
  });

  it("reaches the cut numbers with Tab after the parts, and keeps the layout keys off the selected part there", async () => {
    const { current } = renderLayout();
    screen.getByRole("button", { name: /^Side 2,/ }).focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Step 1, / }));
    const before = current().project;
    await userEvent.keyboard("r{ArrowDown}{Delete}");
    expect(current().project).toBe(before);
  });
});
