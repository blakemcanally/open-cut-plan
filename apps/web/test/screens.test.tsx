import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { SettingsTab } from "../src/screens/SettingsTab.tsx";
import { StockTab } from "../src/screens/StockTab.tsx";
import { ToolsTab } from "../src/screens/ToolsTab.tsx";
import { DEFAULT_PREFS, type ViewPrefs } from "../src/state/prefs.ts";
import { openStorage } from "../src/storage/db.ts";
import { sampleProject } from "./helpers.ts";
import { renderWithStore } from "./render.tsx";

describe("StockTab", () => {
  it("keeps a material that parts use, and deleting stock removes its sheets", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <StockTab store={store} />);
    expect(screen.getByRole("button", { name: "Delete material Plywood" })).toHaveProperty("disabled", true);
    await userEvent.click(screen.getByRole("button", { name: "Delete stock ply-4x8" }));
    expect(current().project.stock).toEqual([]);
    expect(current().project.plan!.sheets).toEqual([]);
  });

  it("lets a sheet use its factory edges or its own trim", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <StockTab store={store} />);
    const edges = screen.getByRole("combobox", { name: "Edges of stock ply-4x8" });
    expect(edges).toHaveProperty("value", "project");
    expect(within(edges).getByRole("option", { name: 'Project: trim 1/4"' })).toBeTruthy();
    await userEvent.selectOptions(edges, "use");
    expect(current().project.stock[0]!.trim).toBe(0);
    expect(screen.queryByLabelText("Trim of stock ply-4x8")).toBeNull();
    await userEvent.selectOptions(edges, "trim");
    expect(current().project.stock[0]!.trim).toBe(0.25);
    const width = screen.getByLabelText("Trim of stock ply-4x8");
    await userEvent.clear(width);
    await userEvent.type(width, "1/2{Enter}");
    expect(current().project.stock[0]!.trim).toBe(0.5);
    await userEvent.selectOptions(edges, "project");
    expect(current().project.stock[0]).not.toHaveProperty("trim");
  });

  it("disables the edges choice while the trim feature is off", () => {
    const project = sampleProject();
    project.settings.features.trim = false;
    renderWithStore(project, (store) => <StockTab store={store} />);
    const edges = screen.getByRole("combobox", { name: "Edges of stock ply-4x8" });
    expect(edges).toHaveProperty("disabled", true);
    expect(edges).toHaveProperty("title", "Choose Trim each edge on the Settings tab to use this.");
  });

  it("adds stock, and an unused material can be deleted", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <StockTab store={store} />);
    await userEvent.click(screen.getByRole("button", { name: "Add material" }));
    const added = current().project.materials[1]!;
    await userEvent.click(screen.getByRole("button", { name: `Delete material ${added.name}` }));
    expect(current().project.materials.map((m) => m.id)).toEqual(["ply"]);
    await userEvent.click(screen.getByRole("button", { name: "Add stock" }));
    expect(current().project.stock).toHaveLength(2);
  });
});

describe("ToolsTab", () => {
  it("adds a track saw, moves it first, and saves the tools as a profile", async () => {
    const storage = await openStorage(indexedDB);
    const { current } = renderWithStore(sampleProject(), (store) => <ToolsTab store={store} storage={storage} />);
    await userEvent.selectOptions(screen.getByLabelText("Type"), "track-saw");
    await userEvent.click(screen.getByRole("button", { name: "Add tool" }));
    const track = current().project.tools[1]!;
    expect(track.type).toBe("track-saw");
    await userEvent.click(screen.getByRole("button", { name: `Move ${track.name} up` }));
    expect(current().project.tools.map((t) => t.type)).toEqual(["track-saw", "table-saw"]);
    await userEvent.type(screen.getByLabelText("Profile name"), "Garage");
    await userEvent.click(screen.getByRole("button", { name: "Save tools as profile" }));
    await waitFor(async () => expect((await storage.listProfiles()).map((p) => [p.name, p.units, p.tools.length])).toEqual([["Garage", "in", 2]]));
  });

  it("uses a millimetre profile in an inch project and converts the kerf", async () => {
    const storage = await openStorage(indexedDB);
    await storage.saveProfile({ name: "Metric", units: "mm", tools: [{ id: "t", name: "Track", type: "track-saw", kerf: 2.54, enabled: true }] });
    const { current } = renderWithStore(sampleProject(), (store) => <ToolsTab store={store} storage={storage} />);
    await userEvent.click(await screen.findByRole("button", { name: "Use profile" }));
    expect(current().project.tools).toEqual([{ id: "t", name: "Track", type: "track-saw", kerf: 0.1, enabled: true }]);
    expect(screen.getByRole("status").textContent).toContain("Metric");
  });
});

describe("SettingsTab", () => {
  let prefs: ViewPrefs = DEFAULT_PREFS;
  function WithPrefs({ store }: { store: Parameters<typeof SettingsTab>[0]["store"] }) {
    const [value, setValue] = useState(DEFAULT_PREFS);
    prefs = value;
    return <SettingsTab store={store} prefs={value} onPrefs={setValue} />;
  }

  it("converts the project to millimetres and turns a feature off", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <WithPrefs store={store} />);
    await userEvent.selectOptions(screen.getByLabelText("Units"), "mm");
    expect(current().project.project.units).toBe("mm");
    expect(current().project.parts[0]!.length).toBe(762);
    expect(current().project.tools[0]!.kerf).toBe(3.175);
    await userEvent.click(screen.getByRole("checkbox", { name: /^Grain/ }));
    expect(current().project.settings.features.grain).toBe(false);
  });

  it("switches between the factory edges and a trim", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <WithPrefs store={store} />);
    const edges = within(screen.getByRole("group", { name: "Factory edges" }));
    expect(edges.getByRole("radio", { name: /^Trim each edge/ })).toHaveProperty("checked", true);
    expect(edges.getByLabelText("Trim width")).toHaveProperty("value", '1/4"');
    await userEvent.click(edges.getByRole("radio", { name: /^Use the factory edges/ }));
    expect(current().project.settings.trim).toBe(0);
    expect(edges.queryByLabelText("Trim width")).toBeNull();
    await userEvent.click(edges.getByRole("radio", { name: /^Trim each edge/ }));
    expect(current().project.settings.trim).toBe(0.25);
  });

  it("shows the factory edges when an old file turned the trim feature off", async () => {
    const project = sampleProject();
    const { current } = renderWithStore({ ...project, settings: { ...project.settings, features: { ...project.settings.features, trim: false } } }, (store) => <WithPrefs store={store} />);
    const edges = within(screen.getByRole("group", { name: "Factory edges" }));
    expect(edges.getByRole("radio", { name: /^Use the factory edges/ })).toHaveProperty("checked", true);
    await userEvent.click(edges.getByRole("radio", { name: /^Trim each edge/ }));
    expect(current().project.settings.features.trim).toBe(true);
    expect(current().project.settings.trim).toBe(0.25);
    expect(screen.queryByRole("checkbox", { name: /^Edge trim/ })).toBeNull();
  });

  it("keeps the snap switch and the grid together, and the grid in this browser", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <WithPrefs store={store} />);
    const snapping = within(screen.getByRole("group", { name: "Snapping" }));
    await userEvent.click(snapping.getByRole("checkbox", { name: /^Snapping/ }));
    expect(current().project.settings.features.snapping).toBe(false);
    const grid = snapping.getByLabelText(/^Grid/);
    expect(grid).toHaveProperty("value", '1"');
    await userEvent.clear(grid);
    await userEvent.type(grid, "1/2{Enter}");
    expect(prefs.grid).toEqual({ in: 0.5, mm: 25 });
    expect(current().project.settings).not.toHaveProperty("grid");
  });
});
