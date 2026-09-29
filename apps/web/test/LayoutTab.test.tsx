import { analyzeProject, type Project } from "@opencutplan/core";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo } from "react";
import { describe, expect, it } from "vitest";
import { LayoutTab } from "../src/layout/LayoutTab.tsx";
import { SheetView } from "../src/layout/SheetView.tsx";
import { useOptimizeRuns } from "../src/optimizer/useOptimizeRuns.ts";
import type { WorkerFactory, WorkerLike } from "../src/optimizer/useOptimizer.ts";
import { DEFAULT_PREFS } from "../src/state/prefs.ts";
import { useProject, type ProjectStore } from "../src/state/useProject.ts";
import { inProcessWorkers, sampleProject } from "./helpers.ts";

function renderLayout(initial: Project = sampleProject(), factory: WorkerFactory = inProcessWorkers().factory) {
  let latest: ProjectStore | null = null;
  function Harness() {
    const store = useProject(initial);
    latest = store;
    const analysis = useMemo(() => analyzeProject(store.project), [store.project]);
    const runs = useOptimizeRuns(store, factory);
    return <LayoutTab store={store} analysis={analysis} prefs={DEFAULT_PREFS} runs={runs} />;
  }
  render(<Harness />);
  return () => latest!;
}

const part = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name},`) });
const tray = () => screen.getByRole("region", { name: /Unplaced parts/ });

describe("SheetView", () => {
  const draw = (preview: Parameters<typeof SheetView>[0]["preview"], grid = 0) => {
    const project = sampleProject();
    const { container } = render(
      <SheetView
        ctx={analyzeProject(project).context}
        sheet={project.plan!.sheets[0]!}
        number={1}
        scale={4}
        steps={[]}
        colors={new Map()}
        errors={new Set()}
        selected={null}
        dragging={null}
        preview={preview}
        showCuts={false}
        showKerf={false}
        grid={grid}
        busy={false}
        onPartPointerDown={() => undefined}
        onSelect={() => undefined}
        onTogglePin={() => undefined}
        onRemove={() => undefined}
      />,
    );
    return container;
  };

  it("draws a guide across the sheet for each snapped axis", () => {
    const container = draw({ rect: { x: 40, y: 20, length: 20, width: 10 }, bad: false, guides: { x: 60, y: null } });
    const guides = container.querySelectorAll("line.snap-guide");
    expect(guides).toHaveLength(1);
    expect([...guides].map((line) => ["x1", "y1", "x2", "y2"].map((name) => line.getAttribute(name)))).toEqual([["240", "0", "240", "192"]]);
  });

  it("keeps a guide on the sheet edge inside the drawing", () => {
    const container = draw({ rect: { x: 40, y: 20, length: 20, width: 10 }, bad: false, guides: { x: 96, y: 0 } });
    const guides = container.querySelectorAll("line.snap-guide");
    expect(guides).toHaveLength(2);
    expect([...guides].map((line) => ["x1", "y1", "x2", "y2"].map((name) => line.getAttribute(name)))).toEqual([
      ["383", "0", "383", "192"],
      ["0", "1", "384", "1"],
    ]);
  });

  it("draws the grid from the trim corner, and no grid when the lines would be too close", () => {
    const grid = draw(null, 2).querySelector('pattern[id$="-grid"]');
    expect([grid?.getAttribute("x"), grid?.getAttribute("width")]).toEqual(["1", "8"]);
    expect(draw(null, 2).querySelector("rect.grid")).not.toBeNull();
    expect(draw(null, 1).querySelector("rect.grid")).toBeNull();
    expect(draw(null, 0).querySelector("rect.grid")).toBeNull();
  });
});

describe("LayoutTab", () => {
  it("turns a focused part with R and sends it to the tray with Delete", async () => {
    const current = renderLayout();
    part("Side 2").focus();
    await userEvent.keyboard("r");
    expect(current().project.plan!.sheets[0]!.placements[1]!.rotated).toBe(true);
    expect(document.activeElement).toBe(part("Side 2"));
    await userEvent.keyboard("{Delete}");
    expect(current().project.plan!.sheets[0]!.placements).toHaveLength(1);
    expect(within(tray()).getByRole("button", { name: /Side 2/ })).toBe(document.activeElement);
  });

  it("moves a focused part with the arrow keys and clears the selection with Escape", async () => {
    const current = renderLayout();
    part("Side 1").focus();
    await userEvent.keyboard("{ArrowDown}");
    const moved = current().project.plan!.sheets[0]!.placements[0]!;
    expect(moved.x).toBe(0.25);
    expect(moved.y).toBeGreaterThan(0.25);
    await userEvent.keyboard("{Escape}");
    expect(screen.getByText(/Select a part on a sheet or in the tray/)).toBeTruthy();
  });

  it("does not move the selected part when a key is pressed on a toolbar button", async () => {
    const current = renderLayout();
    part("Side 1").focus();
    const before = current().project;
    screen.getByRole("button", { name: "Zoom in" }).focus();
    await userEvent.keyboard("{ArrowLeft}r{Delete}");
    expect(current().project).toBe(before);
  });

  it("places a tray part on a sheet with the inspector, then moves it by typing X", async () => {
    const current = renderLayout();
    await userEvent.click(within(tray()).getByRole("button", { name: /Shelf/ }));
    await userEvent.selectOptions(screen.getByLabelText("Location"), "s1");
    expect(part("Shelf")).toBeTruthy();
    expect(within(tray()).queryByRole("button", { name: /Shelf/ })).toBeNull();
    const x = screen.getByLabelText("X (from the left)");
    await userEvent.clear(x);
    await userEvent.type(x, "50{Enter}");
    const shelf = current().project.plan!.sheets[0]!.placements.find((p) => p.part === "shelf")!;
    expect(shelf.x).toBe(50);
  });

  it("adds a sheet and removes empty sheets", async () => {
    const current = renderLayout();
    await userEvent.click(screen.getByRole("button", { name: "Add sheet" }));
    expect(current().project.plan!.sheets.map((s) => s.id)).toEqual(["s1", "s2"]);
    await userEvent.click(screen.getByRole("button", { name: "Remove empty sheets" }));
    expect(current().project.plan!.sheets.map((s) => s.id)).toEqual(["s1"]);
  });

  it("optimizes in a worker and applies a plan that places every part", async () => {
    const current = renderLayout();
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Optimize" }).hasAttribute("disabled")).toBe(false), { timeout: 10000 });
    expect(screen.getByText("Every part is on a sheet.")).toBeTruthy();
    expect(current().project.plan!.sheets.flatMap((s) => s.placements)).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Keep searching" }).hasAttribute("disabled")).toBe(false);
  }, 15000);

  it("stops a search and uses the best plan so far", async () => {
    const current = renderLayout();
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
    await userEvent.click(await screen.findByRole("button", { name: "Stop" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/^Stopped after/), { timeout: 5000 });
    expect(current().project.plan!.sheets.flatMap((s) => s.placements)).toHaveLength(3);
  });

  it("does not use a result when the project changed during the search", async () => {
    const current = renderLayout();
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
    await screen.findByRole("button", { name: "Stop" });
    act(() => current().edit((p) => ({ ...p, project: { ...p.project, name: "Changed" } })));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("The project changed while the optimizer ran"), { timeout: 10000 });
    expect(current().project.plan!.sheets.flatMap((s) => s.placements)).toHaveLength(2);
  }, 15000);

  it("does not use a result that arrives in the same update as an edit", async () => {
    const inner = inProcessWorkers().factory;
    let held: MessageEvent | null = null;
    let outer: WorkerLike | null = null;
    const factory: WorkerFactory = () => {
      const worker = inner();
      const wrapped: WorkerLike = { onmessage: null, onerror: null, postMessage: (m) => worker.postMessage(m), terminate: () => worker.terminate() };
      worker.onmessage = (event) => {
        if (event.data.type === "done") held = event;
        else wrapped.onmessage?.(event);
      };
      outer = wrapped;
      return wrapped;
    };
    const current = renderLayout(sampleProject(), factory);
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
    await waitFor(() => expect(held).not.toBeNull(), { timeout: 10000 });
    act(() => {
      current().edit((p) => ({ ...p, project: { ...p.project, name: "Changed" } }));
      outer!.onmessage!(held!);
    });
    expect(current().project.project.name).toBe("Changed");
    expect(current().project.plan!.sheets.flatMap((s) => s.placements)).toHaveLength(2);
    expect(screen.getByRole("status").textContent).toContain("The project changed while the optimizer ran");
  }, 15000);

  it("offers Keep searching only while the layout is the one the search produced", async () => {
    renderLayout();
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
    await userEvent.click(await screen.findByRole("button", { name: "Stop" }));
    const keep = await screen.findByRole("button", { name: "Keep searching" });
    await waitFor(() => expect(keep.hasAttribute("disabled")).toBe(false));
    part("Shelf").focus();
    await userEvent.keyboard("r");
    expect(screen.getByRole("button", { name: "Keep searching" }).hasAttribute("disabled")).toBe(true);
  });
});
