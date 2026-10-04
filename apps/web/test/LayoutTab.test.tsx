import { analyzeProject, createProject, PART_PALETTE, partColors, regenerateDesigns, toolColors, type Project } from "@opencutplan/core";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo } from "react";
import { describe, expect, it } from "vitest";
import { SHEET_CHROME, WINDOW_ALLOWANCE } from "../src/layout/fit.ts";
import { LayoutTab } from "../src/layout/LayoutTab.tsx";
import { SheetView } from "../src/layout/SheetView.tsx";
import { useOptimizeRuns } from "../src/optimizer/useOptimizeRuns.ts";
import { formatMoney } from "../src/reports/money.ts";
import type { WorkerFactory, WorkerLike } from "../src/optimizer/useOptimizer.ts";
import { DEFAULT_PREFS } from "../src/state/prefs.ts";
import { useProject, type ProjectStore } from "../src/state/useProject.ts";
import { designProject, inProcessWorkers, sampleProject } from "./helpers.ts";

function renderLayout(initial: Project = sampleProject(), factory: WorkerFactory = inProcessWorkers().factory, onShowSettings = () => {}) {
  let latest: ProjectStore | null = null;
  function Harness() {
    const store = useProject(initial);
    latest = store;
    const analysis = useMemo(() => analyzeProject(store.project), [store.project]);
    const runs = useOptimizeRuns(store, factory);
    return <LayoutTab store={store} analysis={analysis} prefs={DEFAULT_PREFS} onPrefs={() => {}} runs={runs} onShowSettings={onShowSettings} onOpenStep={() => {}} />;
  }
  render(<Harness />);
  return () => latest!;
}

const part = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name},`) });
const tray = () => screen.getByRole("region", { name: /Unplaced parts/ });

describe("SheetView", () => {
  const draw = (preview: Parameters<typeof SheetView>[0]["preview"], grid = 0, project = sampleProject(), errors = new Set<number>()) => {
    const { container } = render(
      <SheetView
        ctx={analyzeProject(project).context}
        sheet={project.plan!.sheets[0]!}
        number={1}
        scale={4}
        steps={[]}
        colors={partColors(project)}
        summary={{ tools: [], utilization: 0, cost: null }}
        currency="USD"
        cutColors="stage"
        tools={toolColors(project.tools)}
        errors={errors}
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
        onOpenStep={() => undefined}
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

  it("draws overlapping parts see-through, with the shared area marked, so that the lower part stays visible", () => {
    const project = sampleProject();
    project.plan!.sheets[0]!.placements[1]!.y = 6;
    const container = draw(null, 0, project, new Set([0, 1]));
    const parts = [...container.querySelectorAll("g.part")];
    expect(parts.map((g) => g.classList.contains("overlapping"))).toEqual([true, true]);
    const areas = [...container.querySelectorAll("rect[data-overlap]")];
    expect(areas.map((rect) => ["x", "y", "width", "height"].map((name) => rect.getAttribute(name)))).toEqual([["1", "24", "120", "25"]]);
    expect(container.querySelectorAll("rect.overlap-outline")).toHaveLength(2);
    expect(draw(null).querySelector("g.part.overlapping, rect[data-overlap]")).toBeNull();
  });

  it("fits the label to a small part, turns it on a tall narrow part, and names the part in a tooltip", () => {
    const project = sampleProject();
    project.parts = [
      { id: "stile", name: "Stile", material: "ply", length: 30, width: 3, quantity: 1, grain: "none" },
      { id: "block", name: "Corner block", material: "ply", length: 3, width: 2, quantity: 1, grain: "none" },
    ];
    project.plan!.sheets[0]!.placements = [
      { part: "stile", copy: 0, x: 1, y: 1, rotated: true },
      { part: "block", copy: 0, x: 10, y: 1, rotated: false },
    ];
    const container = draw(null, 0, project);
    const [stile, block] = [...container.querySelectorAll("g.part")];
    expect(stile!.querySelector("title")!.textContent).toBe('Stile, 3" × 30"');
    expect(stile!.querySelector("text")!.getAttribute("transform")).toMatch(/^rotate\(-90 /);
    expect(block!.querySelector("title")!.textContent).toBe('Corner block, 3" × 2"');
    expect(block!.querySelector("text")).toBeNull();
  });
});

describe("LayoutTab", () => {
  it("shows each unit of a design in its own colour, on the sheets and in the tray", () => {
    const base = designProject();
    const project = regenerateDesigns({ ...base, designs: [{ ...base.designs![0]!, quantity: 2, colors: ["", "#123456"] }] });
    project.plan!.sheets[0]!.placements = [
      { part: "hall-top", copy: 0, x: 0, y: 0, rotated: false },
      { part: "hall-top", copy: 1, x: 0, y: 400, rotated: false },
    ];
    renderLayout(project);
    const fill = (key: string) => document.querySelector(`[data-copy-key="${key}"] rect.fill`)?.getAttribute("fill");
    expect(fill("hall-top#0")).toBe(PART_PALETTE[0]);
    expect(fill("hall-top#1")).toBe("#123456");
    const swatch = (key: string) => (document.querySelector(`.tray [data-copy-key="${key}"] .swatch`) as HTMLElement).style.background;
    expect(swatch("hall-side#1")).toBe("rgb(156, 195, 230)");
    expect(swatch("hall-side#2")).toBe("rgb(18, 52, 86)");
    const legend = screen.getByRole("list", { name: "Colours" });
    expect(within(legend).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Hall 1 of 2", "Hall 2 of 2"]);
    expect(screen.getByRole("button", { name: /^Top 2, .*, Hall 2 of 2$/ })).toBeTruthy();
  });

  it("fits the sheets in the window height at 100 % and follows a resize of the window", () => {
    const saved = window.innerHeight;
    const setHeight = (value: number) => Object.defineProperty(window, "innerHeight", { value, configurable: true });
    try {
      setHeight(500);
      renderLayout();
      const sheet = () => screen.getByRole("group", { name: /^Sheet 1 layout/ });
      expect(Number(sheet().getAttribute("height"))).toBeCloseTo(500 - WINDOW_ALLOWANCE - SHEET_CHROME.y);
      setHeight(2000);
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });
      expect(Number(sheet().getAttribute("width"))).toBeCloseTo(800 - SHEET_CHROME.x);
    } finally {
      setHeight(saved);
    }
  });

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

  it("marks the factory edges of the parts that ask for one, and pushes a sheet against its factory edges", async () => {
    const project = sampleProject();
    project.settings.trim = 0;
    project.parts[0] = { ...project.parts[0]!, factoryEdge: "long" };
    project.plan!.sheets[0]!.placements = [
      { part: "side", copy: 0, x: 0, y: 0, rotated: false },
      { part: "side", copy: 1, x: 0, y: 20, rotated: false },
    ];
    const current = renderLayout(project);
    expect(part("Side 1").getAttribute("aria-label")).toContain("on a factory edge");
    expect(part("Side 2").getAttribute("aria-label")).not.toContain("factory edge");
    expect(part("Side 1").querySelectorAll("[data-factory-edge]")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Push sheet 1 to the factory edges" }));
    expect(current().project.plan!.sheets[0]!.placements.map(({ x, y }) => [x, y])).toEqual([
      [0, 0],
      [0, 36],
    ]);
    expect(part("Side 2").getAttribute("aria-label")).toContain("on a factory edge");
    expect(screen.queryByRole("button", { name: "Push sheet 1 to the factory edges" })).toBeNull();
  });

  it("offers no push when no part asks for a factory edge", () => {
    renderLayout();
    expect(screen.queryByRole("button", { name: /to the factory edges/ })).toBeNull();
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

  it("names the goal, with a link to the settings", async () => {
    const shown: string[] = [];
    renderLayout(sampleProject(), inProcessWorkers().factory, () => shown.push("settings"));
    expect(screen.getByText(/^Goal: lowest cost\./)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(shown).toEqual(["settings"]);
  });

  it("shows the extra cost that each material uses after a run", async () => {
    const base = createProject("Goal", "mm");
    const project: Project = {
      ...base,
      settings: { ...base.settings, optimizer: { ...base.settings.optimizer, goal: "offcuts", timeLimitMs: 300 } },
      materials: [{ id: "m", name: "Plywood", thickness: 18, grained: false }],
      stock: [
        { id: "a", material: "m", length: 1000, width: 1000, quantity: null, cost: 100, kind: "sheet" },
        { id: "b", material: "m", length: 2000, width: 1000, quantity: null, cost: 105, kind: "sheet" },
      ],
      parts: [{ id: "p", name: "Panel", material: "m", length: 900, width: 900, quantity: 1, grain: "none" }],
      tools: [{ id: "t", name: "Saw", type: "table-saw", kerf: 3, enabled: true }],
    };
    const current = renderLayout(project);
    expect(screen.getByText(/^Goal: best offcuts, up to 10 % extra cost\./)).toBeTruthy();
    expect(screen.queryByText(/more cost than the cheapest plan found/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
    expect(await screen.findByText("Plywood: 5 % more cost than the cheapest plan found.", {}, { timeout: 10000 })).toBeTruthy();
    act(() => current().edit((p) => ({ ...p, settings: { ...p.settings, optimizer: { ...p.settings.optimizer, goal: "cost" } } })));
    expect(screen.getByText(/^Goal: lowest cost\./)).toBeTruthy();
    expect(screen.queryByText(/more cost than the cheapest plan found/)).toBeNull();
    expect(screen.getByRole("button", { name: "Keep searching" }).hasAttribute("disabled")).toBe(true);
  }, 15000);

  it("says after a run whether each unit and group is on one sheet, when the groups stay together", async () => {
    const base = createProject("Groups", "in");
    const project: Project = {
      ...base,
      settings: { ...base.settings, optimizer: { ...base.settings.optimizer, timeLimitMs: 300 } },
      materials: [{ id: "m", name: "Plywood", thickness: 0.75, grained: false }],
      stock: [{ id: "s", material: "m", length: 96, width: 48, quantity: null, cost: 60, kind: "sheet" }],
      parts: [
        { id: "a", name: "A side", material: "m", length: 40, width: 20, quantity: 2, grain: "none", group: "Cabinet A" },
        { id: "b", name: "B side", material: "m", length: 40, width: 20, quantity: 2, grain: "none", group: "Cabinet B" },
      ],
      tools: [{ id: "t", name: "Saw", type: "table-saw", kerf: 0.125, enabled: true }],
    };
    const current = renderLayout(project);
    expect(screen.queryByText(/is on one sheet/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
    expect(await screen.findByText("Each group is on one sheet.", {}, { timeout: 10000 })).toBeTruthy();
    act(() => current().edit((p) => ({ ...p, settings: { ...p.settings, optimizer: { ...p.settings.optimizer, keepGroupsTogether: false } } })));
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Keep searching" }).hasAttribute("disabled")).toBe(false), { timeout: 10000 });
    expect(screen.queryByText(/is on one sheet/)).toBeNull();
  }, 20000);

  it("compares the plan before and after a run, and Undo optimize puts back the plan from before it", async () => {
    const current = renderLayout();
    const placed = () => current().project.plan!.sheets.flatMap((s) => s.placements).length;
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
    const undoRun = await screen.findByRole("button", { name: "Undo optimize" }, { timeout: 10000 });
    const status = screen.getByRole("status").textContent;
    expect(status).toContain(`Before: 1 sheet, ${formatMoney(60, "USD")}, 1 part unplaced, `);
    expect(status).toContain(`After: 1 sheet, ${formatMoney(60, "USD")}, every part placed, `);
    expect(undoRun.getAttribute("title")).toMatch(/^Puts back the plan from before Optimize: 1 sheet,/);
    expect(placed()).toBe(3);
    await userEvent.click(undoRun);
    expect(placed()).toBe(2);
    expect(screen.getByRole("status").textContent).toBe("The plan from before the optimize run is back. Redo puts the new plan back.");
    expect(screen.queryByRole("button", { name: "Undo optimize" })).toBeNull();
    act(() => current().redo());
    expect(placed()).toBe(3);
    expect(screen.getByRole("button", { name: "Undo optimize" })).toBeTruthy();
    part("Shelf").focus();
    await userEvent.keyboard("r");
    expect(screen.queryByRole("button", { name: "Undo optimize" })).toBeNull();
    expect(screen.getByRole("status").textContent).not.toContain("Before:");
  }, 15000);

  it("compares the stock area when the cost feature is off", async () => {
    const project = sampleProject();
    project.settings = { ...project.settings, features: { ...project.settings.features, cost: false } };
    renderLayout(project);
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
    await screen.findByRole("button", { name: "Undo optimize" }, { timeout: 10000 });
    expect(screen.getByRole("status").textContent).toContain("Before: 1 sheet, 32.0 sq ft of stock, 1 part unplaced");
  }, 15000);

  it("says when Keep searching finds no better plan, and offers no undo for it", async () => {
    const inner = inProcessWorkers().factory;
    const factory: WorkerFactory = () => {
      const worker = inner();
      const wrapped: WorkerLike = {
        onmessage: null,
        onerror: null,
        postMessage: (message) => {
          if (message.type === "start" && message.options?.start) {
            const result = { ...message.options.start, iterations: 40 };
            setTimeout(() => wrapped.onmessage?.({ data: { type: "done", id: message.id, result, cancelled: false } } as MessageEvent), 0);
          } else {
            worker.postMessage(message);
          }
        },
        terminate: () => worker.terminate(),
      };
      worker.onmessage = (event) => wrapped.onmessage?.(event);
      return wrapped;
    };
    const current = renderLayout(sampleProject(), factory);
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
    await screen.findByRole("button", { name: "Undo optimize" }, { timeout: 10000 });
    const optimized = current().project;
    const canUndo = current().canUndo;
    await userEvent.click(screen.getByRole("button", { name: "Keep searching" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Tried 40 plans. Keep searching found no better plan, so the plan did not change."));
    expect(current().project).toBe(optimized);
    expect(current().canUndo).toBe(canUndo);
    expect(screen.queryByRole("button", { name: "Undo optimize" })).toBeNull();
    expect(screen.getByRole("button", { name: "Keep searching" }).hasAttribute("disabled")).toBe(false);
  }, 15000);

  it("shows the optimizer status beside the goal, so that the toolbar does not change while a search runs", async () => {
    renderLayout();
    const toolbar = screen.getByRole("toolbar", { name: "Layout" });
    const contents = () => [...toolbar.querySelectorAll("*")].map((element) => element.tagName);
    const idle = contents();
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
    const status = screen.getByText(/^Goal:/).closest<HTMLElement>(".layout-status")!;
    expect(within(status).getByRole("button", { name: "Stop" })).toBeTruthy();
    expect(within(status).getByRole("progressbar", { name: "Optimizer progress" })).toBeTruthy();
    expect(contents()).toEqual(idle);
    await screen.findByRole("button", { name: "Undo optimize" }, { timeout: 10000 });
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
