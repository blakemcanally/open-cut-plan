import { analyzeProject, defaultTools, parseProject, sequencePlan, setToolChoice, type Project, type Step } from "@opencutplan/core";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo } from "react";
import { describe, expect, it, vi } from "vitest";
import { EXAMPLES } from "../src/examples.ts";
import type { PrintJob } from "../src/print/PrintView.tsx";
import { assemblyGroups, readProgress, setAssemblyStepDone, setStepDone } from "../src/shop/progress.ts";
import { ShopTab } from "../src/shop/ShopTab.tsx";
import { useProject, type ProjectStore } from "../src/state/useProject.ts";
import { designProject, sampleProject, stripProject } from "./helpers.ts";

function renderShop(initial: Project = sampleProject(), onPrint: (job: PrintJob) => void = () => undefined) {
  let latest: ProjectStore | null = null;
  function Harness() {
    const store = useProject(initial);
    latest = store;
    const analysis = useMemo(() => analyzeProject(store.project), [store.project]);
    return <ShopTab store={store} analysis={analysis} onPrint={onPrint} />;
  }
  const result = render(<Harness />);
  return { ...result, current: () => latest! };
}

const stepCount = () => analyzeProject(sampleProject()).steps.length;
const heading = () => screen.getByRole("heading", { level: 2 }).textContent;
const currentItem = () => document.querySelector('li[aria-current="step"]');

describe("ShopTab", () => {
  it("ticks the current step, moves to the next one, and stores the tick in the project", async () => {
    const { current } = renderShop();
    const total = stepCount();
    expect(heading()).toMatch(/^Step 1 · Trim 1\/4" off the top edge$/);
    expect(screen.getByText(`0 of ${total} steps done.`)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Mark done" }));
    expect(readProgress(current().project)?.done).toEqual([1]);
    expect(heading()).toMatch(/^Step 2 · /);
    expect(screen.getByText(`1 of ${total} steps done.`)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Step 1 done" })).toHaveProperty("checked", true);
    act(() => current().undo());
    expect(readProgress(current().project)).toBeNull();
  });

  it("makes a step current from the list and from Previous and Next", async () => {
    renderShop();
    const list = screen.getByRole("region", { name: "Cut sequence" });
    expect(within(list).getByRole("heading", { name: "Sheet 1 · Table saw", level: 4 })).toBeTruthy();
    await userEvent.click(within(list).getByRole("button", { name: /^3\. Trim 1\/4" off the left edge$/ }));
    expect(heading()).toMatch(/^Step 3 · /);
    expect(within(currentItem() as HTMLElement).getByRole("checkbox").getAttribute("aria-label")).toBe("Step 3 done");
    await userEvent.click(screen.getByRole("button", { name: "← Previous" }));
    expect(heading()).toMatch(/^Step 2 · /);
    await userEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(heading()).toMatch(/^Step 3 · /);
  });

  it("starts at the first step that is not done, and a tick in the list does not move the current step", async () => {
    const project = sampleProject();
    const { current } = renderShop(setStepDone(setStepDone(project, analyzeProject(project).steps, 1, true), analyzeProject(project).steps, 2, true));
    expect(heading()).toMatch(/^Step 3 · /);
    await userEvent.click(screen.getByRole("checkbox", { name: "Step 1 done" }));
    expect(readProgress(current().project)?.done).toEqual([2]);
    expect(heading()).toMatch(/^Step 3 · /);
  });

  it("draws the current step strongly and the done steps in grey", async () => {
    renderShop();
    await userEvent.click(screen.getByRole("button", { name: "Mark done" }));
    const diagram = screen.getByRole("img", { name: /^Sheet 1: .*step 2 marked$/ });
    expect(diagram.querySelector('[data-highlight="true"]')?.getAttribute("data-step")).toBe("2");
    expect(diagram.querySelector('[data-done="true"]')?.getAttribute("data-step")).toBe("1");
    expect(diagram.querySelector("pattern")?.id).toBe("shop-s1-h");
  });

  it("asks before it clears every tick", async () => {
    const project = sampleProject();
    const { current } = renderShop(setStepDone(project, analyzeProject(project).steps, 1, true));
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await userEvent.click(screen.getByRole("button", { name: "Reset progress" }));
    expect(readProgress(current().project)?.done).toEqual([1]);
    await userEvent.click(screen.getByRole("button", { name: "Reset progress" }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(readProgress(current().project)).toBeNull();
  });

  it("offers to start over or keep the ticks when the steps changed", async () => {
    const project = sampleProject();
    const ticked = setStepDone(project, analyzeProject(project).steps, 1, true);
    ticked.plan!.sheets[0]!.placements[1]!.y = 20;
    const { current } = renderShop(ticked);
    expect(screen.getByText(/The cut steps changed after you ticked some of them/)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Step 1 done" })).toHaveProperty("checked", false);
    await userEvent.click(screen.getByRole("button", { name: "Keep my ticks" }));
    expect(screen.queryByText(/The cut steps changed/)).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Step 1 done" })).toHaveProperty("checked", true);
    act(() => current().undo());
    await userEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(readProgress(current().project)).toBeNull();
    expect(screen.queryByText(/The cut steps changed/)).toBeNull();
  });

  it("blocks the ticks, but not the moves, until the user picks an option for the old ticks", async () => {
    const project = sampleProject();
    const ticked = setStepDone(project, analyzeProject(project).steps, 1, true);
    ticked.plan!.sheets[0]!.placements[1]!.y = 20;
    renderShop(ticked);
    const list = screen.getByRole("region", { name: "Cut sequence" });
    expect(screen.getByRole("checkbox", { name: "Step 1 done" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Mark done" })).toHaveProperty("disabled", true);
    await userEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(heading()).toMatch(/^Step 2 · /);
    await userEvent.click(screen.getByRole("button", { name: "← Previous" }));
    expect(heading()).toMatch(/^Step 1 · /);
    await userEvent.click(within(list).getByRole("button", { name: /^3\. / }));
    expect(heading()).toMatch(/^Step 3 · /);
    await userEvent.click(screen.getByRole("button", { name: "Keep my ticks" }));
    expect(screen.getByRole("checkbox", { name: "Step 1 done" })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Mark done" })).toHaveProperty("disabled", false);
  });

  it("goes back to the first step after Reset progress or Start over", async () => {
    const project = sampleProject();
    const first = renderShop(project);
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    await userEvent.click(screen.getByRole("button", { name: "Mark done" }));
    await userEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(heading()).toMatch(/^Step 3 · /);
    await userEvent.click(screen.getByRole("button", { name: "Reset progress" }));
    expect(heading()).toMatch(/^Step 1 · /);
    first.unmount();

    const ticked = setStepDone(project, analyzeProject(project).steps, 1, true);
    ticked.plan!.sheets[0]!.placements[1]!.y = 20;
    renderShop(ticked);
    await userEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(heading()).toMatch(/^Step 2 · /);
    await userEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(heading()).toMatch(/^Step 1 · /);
  });

  it("prints the cut sequence", async () => {
    const onPrint = vi.fn();
    renderShop(sampleProject(), onPrint);
    await userEvent.click(screen.getByRole("button", { name: "Print cut sequence" }));
    expect(onPrint).toHaveBeenCalledWith({ kind: "booklet", sections: ["sequence"] });
  });

  it("scrolls only the step list, and only when the list scrolls", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    try {
      renderShop();
      const list = screen.getByRole("region", { name: "Cut sequence" });
      await userEvent.click(screen.getByRole("button", { name: "Mark done" }));
      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(list.scrollTop).toBe(0);

      Object.defineProperties(list, { scrollHeight: { value: 300 }, clientHeight: { value: 60 } });
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
        const step = Number(this.querySelector("input")?.getAttribute("aria-label")?.match(/\d+/)?.[0] ?? 0);
        const top = this === list ? 0 : step * 30 - list.scrollTop;
        return { top, bottom: top + 30, height: 30, left: 0, right: 0, width: 0, x: 0, y: top, toJSON: () => ({}) };
      });
      await userEvent.click(screen.getByRole("button", { name: "Next →" }));
      expect(list.scrollTop).toBe(60);
      await userEvent.click(screen.getByRole("button", { name: "← Previous" }));
      expect(list.scrollTop).toBe(60);
      await userEvent.click(within(list).getByRole("button", { name: /^1\. / }));
      expect(list.scrollTop).toBe(30);
      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(scrollTo).not.toHaveBeenCalled();
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
      vi.restoreAllMocks();
    }
  });

  it("lists the assembly steps after the cut steps, and stores their ticks apart", async () => {
    const { current } = renderShop(designProject());
    const assembly = within(screen.getByRole("region", { name: "Assembly" }));
    expect(assembly.getByRole("heading", { name: "Hall", level: 4 })).toBeTruthy();
    expect(assembly.getAllByRole("listitem")).toHaveLength(9);
    expect(assembly.getAllByRole("listitem")[0]!.textContent).toMatch(/^Drill the pocket holesDrill 3 pocket holes in each end of the 2 sides and the 1 divider/);
    await userEvent.click(assembly.getByRole("checkbox", { name: "Assembly step 2 done" }));
    expect(readProgress(current().project, "assemblyProgress")?.done).toEqual([2]);
    expect(readProgress(current().project)).toBeNull();
    expect(assembly.getByText("1 of 9 assembly steps done.")).toBeTruthy();
    act(() => current().undo());
    expect(readProgress(current().project, "assemblyProgress")).toBeNull();
  });

  it("offers to start over or keep the assembly ticks when a design changes", async () => {
    const project = designProject();
    const ticked = setAssemblyStepDone(project, assemblyGroups(project), 1, true);
    const { current } = renderShop({ ...ticked, designs: [{ ...ticked.designs![0]!, height: { openings: [335, 400] } }] });
    const assembly = within(screen.getByRole("region", { name: "Assembly" }));
    expect(assembly.getByText(/The assembly steps changed after you ticked some of them/)).toBeTruthy();
    expect(assembly.getByRole("checkbox", { name: "Assembly step 1 done" })).toHaveProperty("disabled", true);
    await userEvent.click(assembly.getByRole("button", { name: "Keep my ticks" }));
    expect(assembly.getByRole("checkbox", { name: "Assembly step 1 done" })).toHaveProperty("checked", true);
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    await userEvent.click(assembly.getByRole("button", { name: "Reset assembly" }));
    expect(readProgress(current().project, "assemblyProgress")).toBeNull();
    vi.restoreAllMocks();
  });

  it("shows the assembly steps when there are no cut steps", () => {
    renderShop({ ...designProject(), plan: { sheets: [] } });
    expect(screen.getByText("There are no cut steps. Optimize on the Layout tab, or place parts on a sheet.")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Assembly" })).toBeTruthy();
  });

  it("shows the method, the piece to pick up, the numbered actions, and a label for each result", async () => {
    const project = stripProject();
    project.settings.minOffcut = { length: 5, width: 5 };
    renderShop(project);
    await userEvent.click(within(screen.getByRole("region", { name: "Cut sequence" })).getByRole("button", { name: /^5\. / }));
    const step = within(document.querySelector<HTMLElement>(".shop-current")!);
    expect(heading()).toBe('Step 5 · Cut 12" off the panel');
    expect(document.querySelector(".shop-method")?.textContent).toBe("Table saw · rip: a cut along the length of the sheet");
    expect(document.querySelector(".shop-pickup")?.textContent).toBe('Pick up the panel 95 1/2" × 47 1/2" from step 4.');
    expect([...document.querySelectorAll(".shop-actions li")].map((li) => li.textContent)).toEqual([
      'Set the fence 12" from the blade.',
      'Put a 95 1/2" edge of the panel against the fence.',
      "Make the cut.",
    ]);
    expect([...document.querySelectorAll(".shop-results .result-label")].map((label) => label.textContent)).toEqual(["Next", "Next"]);
    expect(document.querySelector(".shop-results li")?.textContent).toContain("between the fence and the blade");
    await userEvent.click(step.getByRole("button", { name: "Go to step 7" }));
    expect(heading()).toBe('Step 7 · Cut 90" off the panel');
    expect([...document.querySelectorAll(".shop-results .result-label")].map((label) => label.textContent)).toEqual(["Part", "Offcut"]);
  });

  it("outlines the piece of the current step on the diagram", () => {
    renderShop();
    const diagram = screen.getByRole("img", { name: /^Sheet 1: .*step 1 marked$/ });
    expect(diagram.querySelector('[data-piece="true"]')?.getAttribute("width")).toBe("96");
  });

  it("names the tool on each list item when a sheet uses two tools", () => {
    const project = sampleProject();
    project.tools = [
      { id: "ts", name: "Table saw", type: "table-saw", kerf: 0.125, enabled: true, maxRip: 10 },
      { id: "track", name: "Track saw", type: "track-saw", kerf: 0.125, enabled: true },
    ];
    renderShop(project);
    const list = screen.getByRole("region", { name: "Cut sequence" });
    expect(within(list).getByRole("heading", { name: "Sheet 1", level: 4 })).toBeTruthy();
    const names = within(list).getAllByRole("button").map((button) => button.textContent);
    expect(names.some((name) => name.endsWith(" · Track saw"))).toBe(true);
    expect(names.some((name) => name.endsWith(" · Table saw"))).toBe(true);
  });

  it("changes the tool of the current step, keeps the ticks, and marks the recommended tool and the limits", async () => {
    const project = sampleProject();
    project.tools = defaultTools("in");
    const { current } = renderShop(setStepDone(project, analyzeProject(project).steps, 1, true));
    const select = screen.getByLabelText<HTMLSelectElement>("Tool");
    expect(heading()).toMatch(/^Step 2 · /);
    expect([...select.options].map((option) => option.textContent)).toEqual(["Table saw (over its largest piece)", "Track saw (recommended)"]);
    expect(select.value).toBe("track-saw");
    await userEvent.selectOptions(select, "table-saw");
    expect(document.querySelector(".shop-method")?.textContent).toMatch(/^Table saw · trim: /);
    expect(document.querySelector(".shop-actions li")?.textContent).toBe('This cut is over a limit of the Table saw: largest piece 96" × 24".');
    expect(screen.getByRole("checkbox", { name: "Step 1 done" })).toHaveProperty("checked", true);
    expect(readProgress(current().project)?.done).toEqual([1]);
    expect(current().project.plan!.sheets[0]!.toolChoices).toMatchObject([{ axis: "y", tool: "table-saw" }]);
    await userEvent.selectOptions(screen.getByLabelText("Tool"), "track-saw");
    expect(current().project.plan!.sheets[0]).not.toHaveProperty("toolChoices");
    act(() => current().undo());
    expect(current().project.plan!.sheets[0]!.toolChoices).toHaveLength(1);
  });

  it("stays on the same cut when a change of tool moves it in the setup order", async () => {
    const parsed = parseProject(EXAMPLES[0]!.text);
    if (!parsed.ok) throw new Error("example did not load");
    const project: Project = { ...parsed.project, tools: defaultTools("in"), settings: { ...parsed.project.settings, orderMode: "setup" } };
    const key = (s: Step) => [s.sheet, s.axis, s.at, s.from, s.to].join(",");
    const other = (s: Step) => (s.tool?.id === "track-saw" ? "table-saw" : "track-saw");
    const newNumber = (s: Step) => sequencePlan(setToolChoice(project, s, other(s))).find((a) => key(a) === key(s))!.step;
    const moving = sequencePlan(project).find((s) => newNumber(s) !== s.step)!;
    renderShop(project);
    await userEvent.click(within(screen.getByRole("region", { name: "Cut sequence" })).getByRole("button", { name: new RegExp(`^${moving.step}\\. `) }));
    await userEvent.selectOptions(screen.getByLabelText("Tool"), other(moving));
    expect(heading()).toMatch(new RegExp(`^Step ${newNumber(moving)} · `));
    expect(within(currentItem() as HTMLElement).getByRole("checkbox").getAttribute("aria-label")).toBe(`Step ${newNumber(moving)} done`);
    expect(screen.getByLabelText<HTMLSelectElement>("Tool").value).toBe(other(moving));
  });

  it("shows No tool in the Tool list when no tool can make the cut", () => {
    const project = sampleProject();
    project.tools[0] = { id: "ts", name: "Table saw", type: "table-saw", kerf: 0.125, enabled: true, maxPiece: { length: 10, width: 10 } };
    renderShop(project);
    const select = screen.getByLabelText<HTMLSelectElement>("Tool");
    expect(select.value).toBe("");
    expect([...select.options].map((option) => option.textContent)).toEqual(["No tool", "Table saw (over its largest piece)"]);
    expect(document.querySelector(".shop-actions li")?.textContent).toBe("No enabled tool can make this cut. Check the Tools tab.");
  });

  it("says when there are no steps", () => {
    renderShop({ ...sampleProject(), plan: { sheets: [] } });
    expect(screen.getByText("There are no cut steps. Optimize on the Layout tab, or place parts on a sheet.")).toBeTruthy();
  });

  it("says when the cut order is off", () => {
    const project = sampleProject();
    project.settings.features.cutOrder = false;
    renderShop(project);
    expect(screen.getByText("The cut order is off. Turn on Cut order in Settings to see the cut steps.")).toBeTruthy();
  });
});
