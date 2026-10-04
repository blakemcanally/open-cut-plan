import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { addCatalogStock, createProject } from "@opencutplan/core";
import { describe, expect, it, vi } from "vitest";
import { SettingsTab, type SettingsSectionId } from "../src/screens/SettingsTab.tsx";
import { StockTab } from "../src/screens/StockTab.tsx";
import { ToolsTab } from "../src/screens/ToolsTab.tsx";
import { DEFAULT_PREFS, type ViewPrefs } from "../src/state/prefs.ts";
import { openStorage } from "../src/storage/db.ts";
import { designProject, sampleProject } from "./helpers.ts";
import { renderWithStore } from "./render.tsx";

vi.mock("../src/storage/files.ts", () => ({
  chooseFile: () => Promise.resolve({ text: () => Promise.reject(new Error("the file was moved")) }),
}));

describe("StockTab", () => {
  it("keeps a material that parts use, and deleting stock removes its sheets", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <StockTab store={store} />);
    expect(screen.getByRole("button", { name: "Delete material Plywood" })).toHaveProperty("disabled", true);
    await userEvent.click(screen.getByRole("button", { name: "Delete stock ply-4x8" }));
    expect(current().project.stock).toEqual([]);
    expect(current().project.plan!.sheets).toEqual([]);
  });

  it("keeps a material that only a design uses as its back", () => {
    const project = designProject();
    renderWithStore({ ...project, designs: [{ ...project.designs![0]!, back: { material: "ply6" } }] }, (store) => <StockTab store={store} />);
    const back = screen.getByRole("button", { name: "Delete material Plywood 6" });
    expect(back).toHaveProperty("disabled", true);
    expect(back).toHaveProperty("title", "Parts, stock, or designs use this material.");
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

  it("shows an error when the chosen CSV file cannot be read", async () => {
    renderWithStore(sampleProject(), (store) => <StockTab store={store} />);
    await userEvent.click(screen.getByRole("button", { name: "Import CSV…" }));
    expect((await screen.findByRole("alert")).textContent).toBe("✖ The file could not be read: the file was moved");
    expect(screen.queryByRole("dialog")).toBeNull();
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

  it("adds a catalogue material and two of its sheet sizes, with the typical prices", async () => {
    const { current } = renderWithStore(createProject("New", "in"), (store) => <StockTab store={store} />);
    await userEvent.click(screen.getByRole("button", { name: "Add from catalogue…" }));
    const dialog = screen.getByRole("dialog", { name: "Add from catalogue" });
    expect(dialog.textContent).toContain("Prices are typical: the median price");
    await userEvent.selectOptions(within(dialog).getByLabelText("Family"), "MDF");
    await userEvent.selectOptions(within(dialog).getByLabelText("Material"), 'MDF 3/4"');
    expect(dialog.textContent).toContain('Actual thickness 0.75"');
    const big = within(dialog).getByRole("row", { name: /4 × 8 ft/ });
    expect(big.textContent).toContain("97\" × 49\"");
    expect(big.textContent).toContain("$49.98");
    expect(big.textContent).toContain("(median of 2 listings, checked 2026-10-04)");
    expect(within(big).queryByRole("link")).toBeNull();
    const small = within(dialog).getByRole("row", { name: /2 × 4 ft/ });
    expect(small.textContent).toContain("$32.44 (Home Depot, checked 2026-10-04)");
    expect(within(small).getByRole("link", { name: "Home Depot" }).getAttribute("href")).toMatch(/^https:\/\/www\.homedepot\.com\//);
    const add = within(dialog).getByRole("button", { name: /^Add/ });
    expect(add).toHaveProperty("disabled", true);
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "4 × 8 ft" }));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "2 × 4 ft" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Add 2 sizes" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(current().project.materials).toEqual([{ id: "mdf-3-4", name: 'MDF 3/4"', thickness: 0.75, grained: false }]);
    expect(current().project.stock).toEqual([
      { id: "mdf-3-4-4x8", material: "mdf-3-4", length: 97, width: 49, quantity: null, kind: "sheet", cost: 49.98 },
      { id: "mdf-3-4-2x4", material: "mdf-3-4", length: 47.75, width: 23.75, quantity: null, kind: "sheet", cost: 32.44 },
    ]);
  });

  it("marks a size that the project has, says when no price is known, and gives no cost in another currency", async () => {
    const base = createProject("Metric", "mm");
    const project = addCatalogStock({ ...base, settings: { ...base.settings, currency: "EUR" } }, "baltic-birch-18mm-5x5").project;
    const { current } = renderWithStore(project, (store) => <StockTab store={store} />);
    await userEvent.click(screen.getByRole("button", { name: "Add from catalogue…" }));
    const dialog = screen.getByRole("dialog", { name: "Add from catalogue" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Family"), "Baltic birch plywood");
    await userEvent.selectOptions(within(dialog).getByLabelText("Material"), 'Baltic birch 3/4" (18 mm)');
    expect(within(dialog).getByRole("checkbox", { name: "5 × 5 ft" })).toHaveProperty("disabled", true);
    expect(within(dialog).getByRole("row", { name: /5 × 5 ft/ }).textContent).toContain("In the project");
    expect(within(dialog).getByRole("row", { name: /2 × 5 ft/ }).textContent).toContain("No price found");
    expect(dialog.textContent).toContain("The project currency is EUR");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "2 × 5 ft" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Add 1 size" }));
    expect(current().project.materials).toHaveLength(1);
    expect(current().project.stock[1]).toEqual({ id: "baltic-birch-18mm-2x5", material: "baltic-birch-18mm", length: 1524, width: 610, quantity: null, kind: "sheet" });
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

  it("adds a typical saw from a preset, in the units of the project, with help for its limits", async () => {
    const storage = await openStorage(indexedDB);
    const { current } = renderWithStore(sampleProject(), (store) => <ToolsTab store={store} storage={storage} />);
    expect(screen.getByText(/typical values/i)).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText("Typical saw"), '12" sliding mitre saw');
    await userEvent.click(screen.getByRole("button", { name: "Add typical saw" }));
    expect(current().project.tools[1]).toEqual({ id: "mitre-saw", name: '12" sliding mitre saw', type: "miter-saw", kerf: 0.125, enabled: true, maxCut: 14 });
    const miter = screen.getByRole("group", { name: "2. Mitre saw" });
    expect(within(miter).getByText(/makes crosscuts only/)).toBeTruthy();
    expect(within(miter).getByLabelText<HTMLInputElement>("Widest crosscut").value).toBe('14"');
    await userEvent.selectOptions(screen.getByLabelText("Type"), "miter-saw");
    await userEvent.click(screen.getByRole("button", { name: "Add tool" }));
    expect(current().project.tools[2]).toMatchObject({ id: "mitre-saw-2", type: "miter-saw", maxCut: 14 });
  });

  it("sets the largest piece for a crosscut apart from the largest piece for a rip", async () => {
    const storage = await openStorage(indexedDB);
    const { current } = renderWithStore(sampleProject(), (store) => <ToolsTab store={store} storage={storage} />);
    const table = screen.getByRole("group", { name: "1. Table saw" });
    expect(within(table).getByText(/A blank crosscut piece uses the piece for a rip/)).toBeTruthy();
    const length = within(table).getByLabelText<HTMLInputElement>("Largest piece for a crosscut, length");
    expect(length.placeholder).toBe("As for a rip");
    await userEvent.type(length, "48{Enter}");
    expect(current().project.tools[0]).toMatchObject({ maxCrosscutPiece: { length: 48, width: 48 } });
    await userEvent.clear(within(table).getByLabelText("Largest piece for a crosscut, width"));
    await userEvent.type(within(table).getByLabelText("Largest piece for a crosscut, width"), "24{Enter}");
    expect(current().project.tools[0]).toMatchObject({ maxCrosscutPiece: { length: 48, width: 24 } });
    expect(current().project.tools[0]).not.toHaveProperty("maxPiece");
    await userEvent.type(within(table).getByLabelText("Largest piece for a rip, length"), "96{Enter}");
    expect(current().project.tools[0]).toMatchObject({ maxPiece: { length: 96, width: 96 }, maxCrosscutPiece: { length: 48, width: 24 } });
  });

  it("uses a millimetre profile in an inch project and converts the kerf", async () => {
    const storage = await openStorage(indexedDB);
    await storage.saveProfile({ name: "Metric", units: "mm", tools: [{ id: "t", name: "Track", type: "track-saw", kerf: 2.54, enabled: true }] });
    const { current } = renderWithStore(sampleProject(), (store) => <ToolsTab store={store} storage={storage} />);
    await userEvent.click(await screen.findByRole("button", { name: "Use profile" }));
    expect(current().project.tools).toEqual([{ id: "t", name: "Track", type: "track-saw", kerf: 0.1, enabled: true }]);
    expect(screen.getByRole("status").textContent).toContain("Metric");
  });

  it("shows an error and keeps the profile when the delete fails", async () => {
    const storage = await openStorage(indexedDB);
    await storage.saveProfile({ name: "Garage", units: "in", tools: sampleProject().tools });
    vi.spyOn(storage, "deleteProfile").mockRejectedValue(new Error("The disk is full."));
    renderWithStore(sampleProject(), (store) => <ToolsTab store={store} storage={storage} />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete profile" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("The profile could not be deleted: The disk is full."));
    expect(screen.getByRole("option", { name: /^Garage/ })).toBeTruthy();
  });
});

describe("SettingsTab", () => {
  let prefs: ViewPrefs = DEFAULT_PREFS;
  function WithPrefs({ store }: { store: Parameters<typeof SettingsTab>[0]["store"] }) {
    const [value, setValue] = useState(DEFAULT_PREFS);
    const [section, setSection] = useState<SettingsSectionId>("units");
    prefs = value;
    return <SettingsTab store={store} prefs={value} onPrefs={setValue} section={section} onSection={setSection} />;
  }
  const sections = () => within(screen.getByRole("navigation", { name: "Settings sections" }));
  const showSection = (name: string) => userEvent.click(sections().getByRole("button", { name }));
  const shownGroups = () => screen.queryAllByRole("group").map((group) => group.querySelector("legend")?.textContent);

  it("lists the sections and shows one section at a time, the first by default", async () => {
    renderWithStore(sampleProject(), (store) => <WithPrefs store={store} />);
    expect(sections().getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Units and precision",
      "Factory edges",
      "Snapping",
      "Plan",
      "Optimizer",
      "Money",
      "View (this browser only)",
      "Features",
    ]);
    expect(sections().getByRole("button", { name: "Units and precision" }).getAttribute("aria-current")).toBe("true");
    expect(shownGroups()).toEqual(["Units and precision"]);
    await showSection("Optimizer");
    expect(sections().getByRole("button", { name: "Optimizer" }).getAttribute("aria-current")).toBe("true");
    expect(sections().getByRole("button", { name: "Units and precision" }).getAttribute("aria-current")).toBe("false");
    expect(shownGroups()).toEqual(["Optimizer"]);
    expect(screen.queryByLabelText("Units")).toBeNull();
  });

  it("shows the section that it is given", () => {
    renderWithStore(sampleProject(), (store) => <SettingsTab store={store} prefs={DEFAULT_PREFS} onPrefs={() => {}} section="optimizer" onSection={() => {}} />);
    expect(sections().getByRole("button", { name: "Optimizer" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("combobox", { name: "Goal" })).toBeTruthy();
  });

  it("shows the settings that match a search from all sections, under their section names", async () => {
    renderWithStore(sampleProject(), (store) => <WithPrefs store={store} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search settings" }), "KERF");
    expect(shownGroups()).toEqual(["View (this browser only)", "Features"]);
    const view = within(screen.getByRole("group", { name: "View (this browser only)" }));
    expect(view.getAllByRole("checkbox").map((box) => box.closest("label")?.querySelector("b")?.textContent)).toEqual(["Draw cut lines at kerf width"]);
    const features = within(screen.getByRole("group", { name: "Features" }));
    expect(features.getAllByRole("checkbox").map((box) => box.closest("label")?.querySelector("b")?.textContent)).toEqual(["Kerf"]);
  });

  it("shows a whole section when the search matches its name", async () => {
    renderWithStore(sampleProject(), (store) => <WithPrefs store={store} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search settings" }), "optim");
    expect(shownGroups()).toEqual(["Optimizer"]);
    expect(screen.getByRole("combobox", { name: "Goal" })).toBeTruthy();
    expect(screen.getByLabelText("Seed (blank for the default)")).toBeTruthy();
  });

  it("finds a setting of a group of choices by any of its names", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <WithPrefs store={store} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search settings" }), "trim width");
    expect(shownGroups()).toEqual(["Factory edges"]);
    await userEvent.click(screen.getByRole("radio", { name: /^Use the factory edges/ }));
    expect(current().project.settings.trim).toBe(0);
  });

  it("says when no setting matches the search", async () => {
    renderWithStore(sampleProject(), (store) => <WithPrefs store={store} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Search settings" }), "zebra");
    expect(shownGroups()).toEqual([]);
    expect(screen.getByText('No setting matches "zebra".')).toBeTruthy();
  });

  it("goes back to the chosen section when the search is cleared or a section is clicked", async () => {
    renderWithStore(sampleProject(), (store) => <WithPrefs store={store} />);
    await showSection("Snapping");
    const search = screen.getByRole("searchbox", { name: "Search settings" });
    await userEvent.type(search, "grain");
    expect(shownGroups()).toEqual(["Features"]);
    await userEvent.clear(search);
    expect(shownGroups()).toEqual(["Snapping"]);
    await userEvent.type(search, "grain");
    await showSection("Money");
    expect(search).toHaveProperty("value", "");
    expect(shownGroups()).toEqual(["Money"]);
  });

  it("converts the project to millimetres and turns a feature off", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <WithPrefs store={store} />);
    await userEvent.selectOptions(screen.getByLabelText("Units"), "mm");
    expect(current().project.project.units).toBe("mm");
    expect(current().project.parts[0]!.length).toBe(762);
    expect(current().project.tools[0]!.kerf).toBe(3.175);
    await showSection("Features");
    await userEvent.click(screen.getByRole("checkbox", { name: /^Grain/ }));
    expect(current().project.settings.features.grain).toBe(false);
  });

  it("stores the display rounding as the schema values", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <WithPrefs store={store} />);
    const rounding = screen.getByRole("combobox", { name: "Show lengths to" });
    expect(within(rounding).getAllByRole("option").map((option) => option.textContent)).toEqual(['1/8"', '1/16"', '1/32"', '1/64"', "Decimal inches"]);
    await userEvent.selectOptions(rounding, '1/64"');
    expect(current().project.settings.display.inch).toBe(64);
    await userEvent.selectOptions(rounding, "Decimal inches");
    expect(current().project.settings.display.inch).toBe("decimal");
    await userEvent.selectOptions(screen.getByLabelText("Units"), "mm");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Show lengths to" }), "0.1 mm");
    expect(current().project.settings.display.mm).toBe(0.1);
  });

  it("switches between the factory edges and a trim", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <WithPrefs store={store} />);
    await showSection("Factory edges");
    const edges = within(screen.getByRole("group", { name: "Factory edges" }));
    expect(edges.getByRole("radio", { name: /^Trim each edge/ })).toHaveProperty("checked", true);
    expect(edges.getByLabelText("Trim width")).toHaveProperty("value", '1/4"');
    await userEvent.click(edges.getByRole("radio", { name: /^Use the factory edges/ }));
    expect(current().project.settings.trim).toBe(0);
    expect(edges.queryByLabelText("Trim width")).toBeNull();
    await userEvent.click(edges.getByRole("radio", { name: /^Trim each edge/ }));
    expect(current().project.settings.trim).toBe(0.25);
  });

  it("turns on the rule that puts long parts on a factory edge, only while the plan uses the factory edges", async () => {
    const project = sampleProject();
    const { current } = renderWithStore({ ...project, settings: { ...project.settings, trim: 0 } }, (store) => <WithPrefs store={store} />);
    await showSection("Factory edges");
    const edges = within(screen.getByRole("group", { name: "Factory edges" }));
    const rule = edges.getByRole("checkbox", { name: /^Put long parts on a factory edge/ });
    expect(rule).toHaveProperty("checked", false);
    expect(edges.queryByLabelText("Shortest long part")).toBeNull();
    await userEvent.click(rule);
    expect(current().project.settings.factoryEdge).toEqual({ minLength: 36 });
    const length = edges.getByLabelText("Shortest long part");
    await userEvent.clear(length);
    await userEvent.type(length, "48{Enter}");
    expect(current().project.settings.factoryEdge).toEqual({ minLength: 48 });
    await userEvent.click(edges.getByRole("radio", { name: /^Trim each edge/ }));
    expect(edges.getByRole("checkbox", { name: /^Put long parts on a factory edge/ })).toHaveProperty("disabled", true);
    expect(edges.getByLabelText("Shortest long part")).toHaveProperty("disabled", true);
    await userEvent.click(edges.getByRole("radio", { name: /^Use the factory edges/ }));
    await userEvent.click(edges.getByRole("checkbox", { name: /^Put long parts on a factory edge/ }));
    expect(current().project.settings).not.toHaveProperty("factoryEdge");
  });

  it("shows the factory edges when an old file turned the trim feature off", async () => {
    const project = sampleProject();
    const { current } = renderWithStore({ ...project, settings: { ...project.settings, features: { ...project.settings.features, trim: false } } }, (store) => <WithPrefs store={store} />);
    await showSection("Factory edges");
    const edges = within(screen.getByRole("group", { name: "Factory edges" }));
    expect(edges.getByRole("radio", { name: /^Use the factory edges/ })).toHaveProperty("checked", true);
    await userEvent.click(edges.getByRole("radio", { name: /^Trim each edge/ }));
    expect(current().project.settings.features.trim).toBe(true);
    expect(current().project.settings.trim).toBe(0.25);
    await showSection("Features");
    expect(screen.queryByRole("checkbox", { name: /^Edge trim/ })).toBeNull();
  });

  it("sets the optimizer goal, and allows extra cost only for a goal other than the lowest cost", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <WithPrefs store={store} />);
    await showSection("Optimizer");
    const goal = screen.getByRole("combobox", { name: "Goal" });
    expect(within(goal).getAllByRole("option").map((option) => option.textContent)).toEqual(["Lowest cost", "Best offcuts", "Fewest cuts"]);
    expect(goal).toHaveProperty("value", "cost");
    const extra = screen.getByLabelText("Extra cost allowed (%)");
    expect(extra).toHaveProperty("disabled", true);
    expect(extra).toHaveProperty("value", "10");
    await userEvent.selectOptions(goal, "Fewest cuts");
    expect(current().project.settings.optimizer.goal).toBe("cuts");
    expect(extra).toHaveProperty("disabled", false);
    await userEvent.clear(extra);
    await userEvent.type(extra, "101{Enter}");
    expect(current().project.settings.optimizer.extraCostPercent).toBe(10);
    await userEvent.clear(extra);
    await userEvent.type(extra, "25{Enter}");
    expect(current().project.settings.optimizer.extraCostPercent).toBe(25);
  });

  it("keeps the parts of each design unit and group together by default, and turns it off", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <WithPrefs store={store} />);
    await showSection("Optimizer");
    const together = screen.getByRole("checkbox", { name: /^Keep each unit and group together/ });
    expect(together).toHaveProperty("checked", true);
    await userEvent.click(together);
    expect(current().project.settings.optimizer.keepGroupsTogether).toBe(false);
    expect(together).toHaveProperty("checked", false);
  });

  it("says when the goal of best offcuts cannot work, and keeps a goal that the app does not know", async () => {
    const project = sampleProject();
    const { current } = renderWithStore(
      { ...project, settings: { ...project.settings, optimizer: { ...project.settings.optimizer, goal: "time" } } },
      (store) => <WithPrefs store={store} />,
    );
    await showSection("Optimizer");
    const goal = screen.getByRole("combobox", { name: "Goal" });
    expect(goal).toHaveProperty("value", "time");
    expect(within(goal).getByRole("option", { name: "time (unknown)" })).toBeTruthy();
    expect(screen.getByLabelText("Extra cost allowed (%)")).toHaveProperty("disabled", true);
    await userEvent.selectOptions(goal, "Best offcuts");
    expect(screen.queryByText(/The Offcuts feature is off/)).toBeNull();
    await showSection("Features");
    await userEvent.click(screen.getByRole("checkbox", { name: /^Offcuts/ }));
    expect(current().project.settings.features.offcuts).toBe(false);
    await showSection("Optimizer");
    expect(screen.getByText("The Offcuts feature is off, so this goal gives the same plan as the lowest cost.")).toBeTruthy();
    expect(within(screen.getByRole("combobox", { name: /^Goal/ })).queryByRole("option", { name: "time (unknown)" })).toBeNull();
  });

  it("keeps the snap switch and the grid together, and the grid in this browser", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <WithPrefs store={store} />);
    await showSection("Snapping");
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
