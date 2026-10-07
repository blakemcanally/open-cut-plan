import { analyzeProject, defaultTools, parseProject, sequencePlan, setToolChoice, TOOL_COLORS, TOOL_WARNING_COLOR, type CutColoring, type Project, type Step } from "@opencutplan/core";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo } from "react";
import { describe, expect, it, vi } from "vitest";
import { EXAMPLES } from "../src/examples.ts";
import type { PrintJob } from "../src/print/PrintView.tsx";
import { readProgress, setStepDone } from "../src/shop/progress.ts";
import { ShopTab } from "../src/shop/ShopTab.tsx";
import { useProject, type ProjectStore } from "../src/state/useProject.ts";
import { designProject, sampleProject, offsetStripProject } from "./helpers.ts";

function renderShop(initial: Project = sampleProject(), onPrint: (job: PrintJob) => void = () => undefined, props: { openStep?: number; cutColors?: CutColoring } = {}) {
  let latest: ProjectStore | null = null;
  function Harness() {
    const store = useProject(initial);
    latest = store;
    const analysis = useMemo(() => analyzeProject(store.project), [store.project]);
    return <ShopTab store={store} analysis={analysis} onPrint={onPrint} {...props} />;
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

  it("colours the cuts on the diagram by tool when the Layout tab does", () => {
    renderShop(sampleProject(), undefined, { cutColors: "tool" });
    const diagram = screen.getByRole("img", { name: /^Sheet 1: / });
    expect(diagram.querySelector('[data-step="2"] line')?.getAttribute("stroke")).toBe(TOOL_COLORS[0]);
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

  it("does not list the assembly steps, also when there are no cut steps", () => {
    const { unmount } = renderShop(designProject());
    expect(screen.queryByText(/assembly steps done/)).toBeNull();
    expect(screen.queryByText("Drill the pocket holes")).toBeNull();
    unmount();
    renderShop({ ...designProject(), plan: { sheets: [] } });
    expect(screen.getByText("There are no cut steps. Optimize on the Layout tab, or place parts on a sheet.")).toBeTruthy();
    expect(screen.queryByText(/assembly steps done/)).toBeNull();
  });

  it("shows the method, the piece to pick up, the numbered actions, and a label for each result", async () => {
    const project = offsetStripProject();
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

  it("orders the steps by saw setting from the list, under a heading for each setup, and stays on the same cut", async () => {
    const { current } = renderShop();
    const list = screen.getByRole("region", { name: "Cut sequence" });
    const order = within(list).getByRole("group", { name: "Order" });
    expect(within(order).getByRole("radio", { name: "By sheet" })).toHaveProperty("checked", true);
    await userEvent.click(within(list).getByRole("button", { name: /^6\. / }));
    await userEvent.click(within(order).getByRole("radio", { name: "By saw setting" }));
    expect(current().project.settings.orderMode).toBe("setup");
    expect(within(list).getAllByRole("heading", { level: 4 }).map((h) => h.textContent)).toEqual([
      'Table saw · trim 1/4" · 4 cuts',
      'Table saw · stop at 30" · 1 cut',
      'Table saw · fence at 12" · 2 cuts',
    ]);
    expect(within(list).getByRole("button", { name: /^6\. / }).textContent).toMatch(/ · Sheet 1$/);
    expect(heading()).toMatch(/^Step 6 · /);
    await userEvent.click(within(order).getByRole("radio", { name: "By sheet" }));
    expect(current().project.settings.orderMode).toBe("sheet");
    expect(within(list).getAllByRole("heading", { level: 4 }).map((h) => h.textContent)).toEqual(["Sheet 1 · Table saw"]);
  });

  it("keeps the current cut when the order changes its step number", async () => {
    const parsed = parseProject(EXAMPLES[0]!.text);
    if (!parsed.ok) throw new Error("example did not load");
    renderShop(parsed.project);
    const list = screen.getByRole("region", { name: "Cut sequence" });
    await userEvent.click(within(list).getByRole("button", { name: /^5\. / }));
    const title = heading().replace(/^Step 5/, "");
    await userEvent.click(within(list).getByRole("radio", { name: "By saw setting" }));
    expect(heading()).not.toMatch(/^Step 5 · /);
    expect(heading().replace(/^Step \d+/, "")).toBe(title);
  });

  it("says when the setup changes from the step before, in the order by saw setting", async () => {
    const project = sampleProject();
    project.settings.orderMode = "setup";
    renderShop(project, undefined, { openStep: 5 });
    expect(screen.getByText(/^New setup: /).textContent).toBe('New setup: Table saw · stop at 30".');
    await userEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(screen.getByText(/^New setup: /).textContent).toBe('New setup: Table saw · fence at 12".');
    await userEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(screen.queryByText(/^New setup: /)).toBeNull();
  });

  it("shows no setup note in the order by sheet", () => {
    renderShop(sampleProject(), undefined, { openStep: 5 });
    expect(screen.queryByText(/^New setup: /)).toBeNull();
  });

  it("opens the step that it is given and puts the focus on its title", () => {
    renderShop(sampleProject(), undefined, { openStep: 4 });
    expect(heading()).toMatch(/^Step 4 · /);
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2 }));
    expect(within(currentItem() as HTMLElement).getByRole("checkbox").getAttribute("aria-label")).toBe("Step 4 done");
  });

  it("shows the colour of each tool, as on the Layout tab, beside the Tool list and the tool names in the list", async () => {
    const project = sampleProject();
    project.tools = defaultTools("in");
    renderShop(setToolChoice(project, sequencePlan(project)[0]!, "table-saw"));
    const hex = (color: string) => `rgb(${[1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16)).join(", ")})`;
    const toolSwatch = () => (document.querySelector(".shop-tool .swatch") as HTMLElement).style.background;
    expect(toolSwatch()).toBe(hex(TOOL_WARNING_COLOR));
    await userEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(toolSwatch()).toBe(hex(TOOL_COLORS[1]!));
    const list = screen.getByRole("region", { name: "Cut sequence" });
    const item = (step: number) => within(list).getByRole("button", { name: new RegExp(`^${step}\\. `) });
    expect(item(1).textContent).toMatch(/ · Table saw$/);
    expect((item(1).querySelector(".swatch") as HTMLElement).style.background).toBe(hex(TOOL_WARNING_COLOR));
    expect((item(2).querySelector(".swatch") as HTMLElement).style.background).toBe(hex(TOOL_COLORS[1]!));
  });

  it("shows the tool colour in the sheet heading when all the steps of the sheet use one tool", () => {
    renderShop();
    const heading4 = within(screen.getByRole("region", { name: "Cut sequence" })).getByRole("heading", { name: "Sheet 1 · Table saw", level: 4 });
    expect((heading4.querySelector(".swatch") as HTMLElement).style.background).toBe("rgb(26, 95, 208)");
  });

  it("says in the Tool list that a mitre saw makes crosscuts only", () => {
    const project = sampleProject();
    project.tools.push({ id: "miter", name: "Mitre saw", type: "miter-saw", kerf: 0.125, enabled: true });
    renderShop(project, undefined, { openStep: 6 });
    const select = screen.getByLabelText<HTMLSelectElement>("Tool");
    expect([...select.options].map((option) => option.textContent)).toEqual(["Table saw (recommended)", "Mitre saw (crosscuts only)"]);
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
