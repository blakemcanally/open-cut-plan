import { assemblyDrawings, createProject, type Project } from "@opencutplan/core";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PrintJob } from "../src/print/PrintView.tsx";
import { AssemblyTab } from "../src/shop/AssemblyTab.tsx";
import { assemblyGroups, readProgress, setAssemblyStepDone } from "../src/shop/progress.ts";
import { useProject, type ProjectStore } from "../src/state/useProject.ts";
import { designProject } from "./helpers.ts";

function renderAssembly(initial: Project = designProject(), onPrint: (job: PrintJob) => void = () => undefined) {
  let latest: ProjectStore | null = null;
  function Harness() {
    const store = useProject(initial);
    latest = store;
    return <AssemblyTab store={store} onPrint={onPrint} />;
  }
  const result = render(<Harness />);
  return { ...result, current: () => latest! };
}

const steps = () => screen.getAllByRole("listitem");
const currentStep = () => document.querySelector('li[aria-current="step"]');

describe("AssemblyTab", () => {
  it("lists the assembly steps of each design with a drawing, and stores their ticks apart from the cut ticks", async () => {
    const { current } = renderAssembly();
    expect(screen.getByRole("heading", { name: "Hall", level: 2 })).toBeTruthy();
    expect(steps()).toHaveLength(9);
    expect(within(steps()[0]!).getByText("1. Drill the pocket holes")).toBeTruthy();
    expect(within(steps()[0]!).getByText(/^Drill 3 pocket holes in each end of the 2 sides and the 1 divider/)).toBeTruthy();
    const drawings = assemblyDrawings(current().project, "hall")!;
    expect(steps()[3]!.querySelector(".assembly-drawing svg title")!.textContent).toBe(drawings[3]!.description);
    const enlarge = within(steps()[3]!).getByRole("button", { name: "Enlarge the drawing of step 4" });
    expect(document.getElementById(enlarge.getAttribute("aria-describedby")!)!.textContent).toBe(drawings[3]!.description);
    await userEvent.click(screen.getByRole("checkbox", { name: "Assembly step 2 done" }));
    expect(readProgress(current().project, "assemblyProgress")?.done).toEqual([2]);
    expect(readProgress(current().project)).toBeNull();
    expect(screen.getByText("1 of 9 assembly steps done.")).toBeTruthy();
    act(() => current().undo());
    expect(readProgress(current().project, "assemblyProgress")).toBeNull();
  });

  it("makes the first step that is not done the current step, with a large drawing", async () => {
    renderAssembly();
    expect(currentStep()).toBe(steps()[0]);
    await userEvent.click(screen.getByRole("checkbox", { name: "Assembly step 1 done" }));
    expect(currentStep()).toBe(steps()[1]);
    await userEvent.click(screen.getByRole("checkbox", { name: "Assembly step 3 done" }));
    expect(currentStep()).toBe(steps()[1]);
  });

  it("opens a large drawing of a step, moves to the next and the previous step, and closes", async () => {
    const project = designProject();
    renderAssembly(project);
    const drawings = assemblyDrawings(project, "hall")!;
    await userEvent.click(screen.getByRole("button", { name: "Enlarge the drawing of step 5" }));
    const dialog = within(screen.getByRole("dialog", { name: "Step 5 of 9: Assemble column 1 of 2" }));
    expect(dialog.getByRole("img", { name: drawings[4]!.description })).toBeTruthy();
    expect(dialog.getByText(/^Lay the left side on its outside face/)).toBeTruthy();
    await userEvent.click(dialog.getByRole("button", { name: "Next →" }));
    expect(screen.getByRole("dialog", { name: "Step 6 of 9: Assemble column 2 of 2" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "← Previous" }));
    await userEvent.click(screen.getByRole("button", { name: "← Previous" }));
    await userEvent.click(screen.getByRole("button", { name: "← Previous" }));
    await userEvent.click(screen.getByRole("button", { name: "← Previous" }));
    await userEvent.click(screen.getByRole("button", { name: "← Previous" }));
    expect(screen.getByRole("dialog", { name: "Step 1 of 9: Drill the pocket holes" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "← Previous" })).toHaveProperty("disabled", true);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers to start over or keep the assembly ticks when a design changes", async () => {
    const project = designProject();
    const ticked = setAssemblyStepDone(project, assemblyGroups(project), 1, true);
    const { current } = renderAssembly({ ...ticked, designs: [{ ...ticked.designs![0]!, height: { openings: [335, 400] } }] });
    expect(screen.getByText(/The assembly steps changed after you ticked some of them/)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Assembly step 1 done" })).toHaveProperty("disabled", true);
    await userEvent.click(screen.getByRole("button", { name: "Keep my ticks" }));
    expect(screen.getByRole("checkbox", { name: "Assembly step 1 done" })).toHaveProperty("checked", true);
    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    await userEvent.click(screen.getByRole("button", { name: "Reset assembly" }));
    expect(readProgress(current().project, "assemblyProgress")).toBeNull();
    vi.restoreAllMocks();
  });

  it("prints the assembly steps", async () => {
    const onPrint = vi.fn();
    renderAssembly(designProject(), onPrint);
    await userEvent.click(screen.getByRole("button", { name: "Print assembly steps" }));
    expect(onPrint).toHaveBeenCalledWith({ kind: "booklet", sections: ["assembly"] });
  });

  it("names the designs that have no steps", () => {
    const project = designProject();
    renderAssembly({ ...project, designs: [...project.designs!, { ...project.designs![0]!, id: "broken", name: "Broken", material: "missing" }] });
    expect(screen.getByText(/^Broken has no steps, because the design makes no parts\. Fix it on the/)).toBeTruthy();
    expect(steps()).toHaveLength(9);
  });

  it("says what to do when there are no designs", () => {
    renderAssembly(createProject("Empty", "mm"));
    expect(screen.getByText(/^There are no designs\. Add a design on the/).textContent).toBe("There are no designs. Add a design on the Design tab to get its assembly steps.");
    expect(screen.queryByRole("button", { name: "Print assembly steps" })).toBeNull();
  });
});
