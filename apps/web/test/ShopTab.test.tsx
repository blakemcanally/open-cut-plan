import { analyzeProject, type Project } from "@opencutplan/core";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PrintJob } from "../src/print/PrintView.tsx";
import { assemblyGroups, readProgress, setAssemblyStepDone, setStepDone } from "../src/shop/progress.ts";
import { ShopTab } from "../src/shop/ShopTab.tsx";
import { useProject, type ProjectStore } from "../src/state/useProject.ts";
import { designProject, sampleProject } from "./helpers.ts";

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
    expect(heading()).toMatch(/^Step 1\. Table saw, /);
    expect(screen.getByText(`0 of ${total} steps done.`)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Mark done" }));
    expect(readProgress(current().project)?.done).toEqual([1]);
    expect(heading()).toMatch(/^Step 2\. /);
    expect(screen.getByText(`1 of ${total} steps done.`)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Step 1 done" })).toHaveProperty("checked", true);
    act(() => current().undo());
    expect(readProgress(current().project)).toBeNull();
  });

  it("makes a step current from the list and from Previous and Next", async () => {
    renderShop();
    const list = screen.getByRole("region", { name: "Cut sequence" });
    expect(within(list).getByRole("heading", { name: "Sheet 1", level: 4 })).toBeTruthy();
    await userEvent.click(within(list).getByRole("button", { name: /^Step 3\. / }));
    expect(heading()).toMatch(/^Step 3\. /);
    expect(within(currentItem() as HTMLElement).getByRole("checkbox").getAttribute("aria-label")).toBe("Step 3 done");
    await userEvent.click(screen.getByRole("button", { name: "← Previous" }));
    expect(heading()).toMatch(/^Step 2\. /);
    await userEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(heading()).toMatch(/^Step 3\. /);
  });

  it("starts at the first step that is not done, and a tick in the list does not move the current step", async () => {
    const project = sampleProject();
    const { current } = renderShop(setStepDone(setStepDone(project, analyzeProject(project).steps, 1, true), analyzeProject(project).steps, 2, true));
    expect(heading()).toMatch(/^Step 3\. /);
    await userEvent.click(screen.getByRole("checkbox", { name: "Step 1 done" }));
    expect(readProgress(current().project)?.done).toEqual([2]);
    expect(heading()).toMatch(/^Step 3\. /);
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
    expect(heading()).toMatch(/^Step 2\. /);
    await userEvent.click(screen.getByRole("button", { name: "← Previous" }));
    expect(heading()).toMatch(/^Step 1\. /);
    await userEvent.click(within(list).getByRole("button", { name: /^Step 3\. / }));
    expect(heading()).toMatch(/^Step 3\. /);
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
    expect(heading()).toMatch(/^Step 3\. /);
    await userEvent.click(screen.getByRole("button", { name: "Reset progress" }));
    expect(heading()).toMatch(/^Step 1\. /);
    first.unmount();

    const ticked = setStepDone(project, analyzeProject(project).steps, 1, true);
    ticked.plan!.sheets[0]!.placements[1]!.y = 20;
    renderShop(ticked);
    await userEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(heading()).toMatch(/^Step 2\. /);
    await userEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(heading()).toMatch(/^Step 1\. /);
  });

  it("prints the cut sequence", async () => {
    const onPrint = vi.fn();
    renderShop(sampleProject(), onPrint);
    await userEvent.click(screen.getByRole("button", { name: "Print cut sequence" }));
    expect(onPrint).toHaveBeenCalledWith({ kind: "sequence" });
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
      await userEvent.click(within(list).getByRole("button", { name: /^Step 1\. / }));
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
    expect(assembly.getAllByRole("listitem")).toHaveLength(7);
    expect(assembly.getAllByRole("listitem")[0]!.textContent).toMatch(/^Drill the pocket holesDrill 3 pocket holes in each end of all 6 shelves/);
    await userEvent.click(assembly.getByRole("checkbox", { name: "Assembly step 2 done" }));
    expect(readProgress(current().project, "assemblyProgress")?.done).toEqual([2]);
    expect(readProgress(current().project)).toBeNull();
    expect(assembly.getByText("1 of 7 assembly steps done.")).toBeTruthy();
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
