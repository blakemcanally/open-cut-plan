import { analyzeProject, fileBase, stageColor, TOOL_COLORS, unsavedOffcuts, type Project } from "@opencutplan/core";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrintJob } from "../src/print/PrintView.tsx";
import { ReportsTab } from "../src/reports/ReportsTab.tsx";
import { DEFAULT_PREFS, type ViewPrefs } from "../src/state/prefs.ts";
import { useProject, type ProjectStore } from "../src/state/useProject.ts";
import { designProject, sampleProject, offsetStripProject } from "./helpers.ts";

function renderReports(initial: Project = sampleProject(), onPrint: (job: PrintJob) => void = () => undefined, initialPrefs: ViewPrefs = DEFAULT_PREFS) {
  let latest: ProjectStore | null = null;
  let savedPrefs = initialPrefs;
  function Harness() {
    const store = useProject(initial);
    const [prefs, setPrefs] = useState(initialPrefs);
    latest = store;
    const analysis = useMemo(() => analyzeProject(store.project), [store.project]);
    const onPrefs = (next: ViewPrefs) => {
      savedPrefs = next;
      setPrefs(next);
    };
    return <ReportsTab store={store} analysis={analysis} prefs={prefs} onPrefs={onPrefs} onPrint={onPrint} />;
  }
  render(<Harness />);
  return Object.assign(() => latest!, { prefs: () => savedPrefs });
}

function booklet() {
  return within(screen.getByRole("group", { name: "Print booklet" }));
}

function withFeatures(features: Partial<Project["settings"]["features"]>): Project {
  const project = sampleProject();
  return { ...project, settings: { ...project.settings, features: { ...project.settings.features, ...features } } };
}

function captureDownloads() {
  const files: { name: string; blob: Blob }[] = [];
  let last: Blob | null = null;
  URL.createObjectURL = (blob: Blob) => {
    last = blob;
    return "blob:report";
  };
  URL.revokeObjectURL = () => undefined;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    files.push({ name: this.download, blob: last! });
  });
  return files;
}

afterEach(() => {
  delete (URL as { createObjectURL?: unknown }).createObjectURL;
  delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
  vi.restoreAllMocks();
});

const section = (name: string) => screen.getByRole("region", { name });

describe("ReportsTab", () => {
  it("puts the sections in the order summary, print and export, buy, cut, build, with headings to jump between", () => {
    renderReports(designProject());
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["Summary", "Print and export", "Buy", "Cut", "Build"]);
    for (const name of ["Summary", "Print and export", "Buy", "Cut", "Build"]) expect(section(name)).toBeTruthy();
  });

  it("sums up the plan: sheets, cost, cut steps, cut length, and parts placed", () => {
    renderReports();
    const summary = within(section("Summary"));
    expect(summary.getAllByRole("term").map((term) => term.textContent)).toEqual(["Sheets", "Cost", "Cut steps", "Cut length", "Parts placed"]);
    expect(summary.getAllByRole("definition").map((value) => value.textContent)).toEqual(["1", "$60.00", "7", '394 1/2"', "2 of 3"]);
  });

  it("gives the stock area in place of a cost that is not known, and no cuts when the cut order is off", () => {
    const project = withFeatures({ cutOrder: false });
    delete project.stock[0]!.cost;
    renderReports(project);
    const summary = within(section("Summary"));
    expect(summary.getAllByRole("term").map((term) => term.textContent)).toEqual(["Sheets", "Stock area", "Parts placed"]);
    expect(summary.getByText("32.0 sq ft")).toBeTruthy();
  });

  it("shows the shopping list with costs, the subtotal, and the total, with the size once", () => {
    renderReports();
    const buy = within(section("Buy"));
    expect(buy.getByRole("heading", { name: "Plywood", level: 3 })).toBeTruthy();
    expect(buy.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Stock", "In the plan", "To buy", "Unit cost", "Cost"]);
    const row = buy.getAllByRole("row")[1]!;
    expect(within(row).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(['96" × 48"', "1", "1", "$60.00", "$60.00"]);
    expect(buy.getByRole("rowheader", { name: "Subtotal" })).toBeTruthy();
    expect(buy.getByText("Parts use 16% of this stock. Waste is 84%.")).toBeTruthy();
    expect(buy.getByText("Total: $60.00")).toBeTruthy();
  });

  it("names stock that has its own name, and marks an owned offcut", () => {
    const project = sampleProject();
    project.stock = [{ id: "o1", material: "ply", length: 96, width: 48, quantity: 1, cost: 0, kind: "offcut", name: "Shop offcut" }];
    project.plan!.sheets[0]!.stock = "o1";
    renderReports(project);
    const row = within(section("Buy")).getAllByRole("row")[1]!;
    expect(within(row).getAllByRole("cell")[0]!.textContent).toBe('Shop offcut, 96" × 48" (offcut you have)');
  });

  it("hides the costs when the cost feature is off", () => {
    renderReports(withFeatures({ cost: false }));
    const buy = within(section("Buy"));
    expect(buy.queryByRole("columnheader", { name: "Cost" })).toBeNull();
    expect(buy.queryByText(/Total/)).toBeNull();
    expect(within(section("Summary")).queryByRole("term", { name: "Cost" })).toBeNull();
  });

  it("names the stock that has no price instead of a total", () => {
    const project = sampleProject();
    delete project.stock[0]!.cost;
    renderReports(project);
    expect(screen.getByText('⚠ The total is not known. This stock has no price: Plywood 96" × 48".')).toBeTruthy();
  });

  it("shows the sheet use and the cut list in the Cut section", () => {
    const project = sampleProject();
    project.parts[0]!.factoryEdge = "long";
    renderReports(project);
    const sheets = within(screen.getByRole("region", { name: "Sheet use" }));
    expect(sheets.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent))).toEqual([["1", 'Plywood 96" × 48"', "16%"]]);
    const list = within(screen.getByRole("region", { name: "Cut list" }));
    expect(list.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Part", "Size", "Quantity", "Placed", "Material", "Factory edge", "Sheets"]);
    expect(list.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent))).toEqual([
      ["Side", '30" × 12"', "2", "2", "Plywood", "Long edge", "1"],
      ["Shelf", '20" × 10"', "1", "0", "Plywood", "", ""],
    ]);
    expect(list.getByText("Plywood: 2 parts, 3 copies, 6.4 sq ft.")).toBeTruthy();
  });

  it("hides the factory edge column of the cut list when no part asks for one", () => {
    renderReports();
    const list = within(screen.getByRole("region", { name: "Cut list" }));
    expect(list.queryByRole("columnheader", { name: "Factory edge" })).toBeNull();
  });

  it("saves each offcut to stock once, and the save can be undone", async () => {
    const current = renderReports();
    const offcuts = within(section("Offcuts"));
    expect(offcuts.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      'Sheet 1: 30" × 23 1/4" Plywood',
      'Sheet 1: 65 3/8" × 47 1/2" Plywood',
    ]);
    await userEvent.click(offcuts.getByRole("button", { name: "Save offcuts to stock" }));
    expect(current().project.stock.filter((stock) => stock.kind === "offcut")).toHaveLength(2);
    expect(offcuts.getByRole("status").textContent).toBe("2 offcuts were added to the Stock tab.");
    expect(offcuts.getByRole("button", { name: "Every offcut is in stock" })).toHaveProperty("disabled", true);
    act(() => current().undo());
    expect(offcuts.getByRole("button", { name: "Save offcuts to stock" })).toHaveProperty("disabled", false);
  });

  it("counts two offcuts of the same size separately", () => {
    const project = offsetStripProject();
    project.settings.minOffcut = { length: 5, width: 5 };
    const { offcuts } = analyzeProject(project);
    const oneSaved = { ...project, stock: [...project.stock, { id: "o1", material: "ply", length: 5.375, width: 12, quantity: 1, cost: 0, kind: "offcut" as const, trim: 0, name: "Offcut from Test, sheet 1" }] };
    expect(unsavedOffcuts(oneSaved, offcuts).map((offcut) => offcut.rect.y)).toEqual([12.375, 24.5]);
    renderReports(oneSaved);
    expect(screen.getByRole("button", { name: "Save 2 new offcuts to stock" })).toBeTruthy();
  });

  it("counts the label pages from the start position and prints the labels", async () => {
    const onPrint = vi.fn();
    renderReports(sampleProject(), onPrint);
    const labels = within(screen.getByRole("group", { name: "Labels" }));
    expect(labels.getByRole("combobox", { name: "Label sheet" })).toHaveProperty("value", "avery-5160");
    expect(labels.getByText("3 labels on 1 page.")).toBeTruthy();
    await userEvent.selectOptions(labels.getByRole("combobox", { name: "Start at label" }), "30");
    expect(labels.getByText("3 labels on 2 pages.")).toBeTruthy();
    await userEvent.click(labels.getByRole("button", { name: "Print labels" }));
    expect(onPrint).toHaveBeenCalledWith({ kind: "labels", layout: "avery-5160", start: 30 });
    await userEvent.selectOptions(labels.getByRole("combobox", { name: "Label sheet" }), "thermal-4x2");
    expect(labels.queryByRole("combobox", { name: "Start at label" })).toBeNull();
    expect(labels.getByText("3 labels on 3 pages.")).toBeTruthy();
  });

  it("hides offcuts and labels when their features are off", () => {
    renderReports(withFeatures({ offcuts: false, labels: false }));
    expect(screen.queryByRole("region", { name: "Offcuts" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Labels" })).toBeNull();
  });

  it("prints the chosen sections as one booklet and remembers the choice", async () => {
    const onPrint = vi.fn();
    const reports = renderReports(sampleProject(), onPrint);
    const names = ["Title page", "Shopping list", "Sheet diagrams", "Cut sequence"];
    expect(names.map((name) => booklet().getByRole("checkbox", { name, checked: true }))).toHaveLength(4);
    await userEvent.click(booklet().getByRole("checkbox", { name: "Sheet diagrams" }));
    expect(reports.prefs().booklet).toEqual({ ...DEFAULT_PREFS.booklet, sheets: false });
    await userEvent.click(booklet().getByRole("button", { name: "Print booklet" }));
    expect(onPrint).toHaveBeenCalledWith({ kind: "booklet", sections: ["title", "shopping", "sequence"] });
  });

  it("offers the detailed cut steps while the cut sequence is in the booklet", async () => {
    const reports = renderReports();
    const detailed = booklet().getByRole("checkbox", { name: "Detailed steps", description: "The full text of each step, in place of the short table." });
    expect([detailed.hasAttribute("disabled"), (detailed as HTMLInputElement).checked]).toEqual([false, false]);
    await userEvent.click(detailed);
    expect(reports.prefs().detailedSteps).toBe(true);
    await userEvent.click(booklet().getByRole("checkbox", { name: "Cut sequence" }));
    expect(booklet().getByRole("checkbox", { name: "Detailed steps" })).toHaveProperty("disabled", true);
  });

  it("loads the saved booklet choice and needs a section with content to print", async () => {
    const onPrint = vi.fn();
    renderReports(sampleProject(), onPrint, { ...DEFAULT_PREFS, booklet: { ...DEFAULT_PREFS.booklet, title: false, shopping: false } });
    expect(booklet().getByRole("checkbox", { name: "Title page" })).toHaveProperty("checked", false);
    await userEvent.click(booklet().getByRole("checkbox", { name: "Title page" }));
    await userEvent.click(booklet().getByRole("checkbox", { name: "Sheet diagrams" }));
    await userEvent.click(booklet().getByRole("checkbox", { name: "Cut sequence" }));
    expect(booklet().getByRole("button", { name: "Print booklet" })).toHaveProperty("disabled", true);
  });

  it("prints and exports", async () => {
    const files = captureDownloads();
    renderReports({ ...sampleProject(), project: { ...sampleProject().project, name: "Shelf: v2" } });
    const output = within(section("Print and export"));
    expect(output.queryByRole("button", { name: "Print sheet diagrams" })).toBeNull();
    await userEvent.click(output.getByRole("button", { name: "Export parts CSV" }));
    await userEvent.click(output.getByRole("button", { name: "Export stock CSV" }));
    await userEvent.click(output.getByRole("button", { name: "Sheet 1 as SVG" }));
    expect(files.map((file) => [file.name, file.blob.type])).toEqual([
      ["Shelf- v2-parts.csv", "text/csv"],
      ["Shelf- v2-stock.csv", "text/csv"],
      ["Shelf- v2-sheet-1.svg", "image/svg+xml"],
    ]);
    expect(await files[0]!.blob.text()).toMatch(/^name,length,width,quantity,material,grain,group,notes\r?\nSide,30,12,2,Plywood,length,,/);
    const svg = await files[2]!.blob.text();
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="-1\.6 -1\.6 99\.2 51\.2" width="99\.2in"/);
    expect(svg).toContain(`stroke="${stageColor(1)}"`);
    expect(output.getByText("The cuts in print and in the SVG files have the colour of their stage, as on the Layout tab.")).toBeTruthy();
  });

  it("colours the cuts by tool in the SVG files when the Layout tab does", async () => {
    const files = captureDownloads();
    renderReports(sampleProject(), undefined, { ...DEFAULT_PREFS, cutColors: "tool" });
    expect(screen.getByText("The cuts in print and in the SVG files have the colour of their tool, as on the Layout tab.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Sheet 1 as SVG" }));
    const svg = await files[0]!.blob.text();
    expect(svg).toContain(`stroke="${TOOL_COLORS[0]}"`);
    expect(svg).not.toContain(`stroke="${stageColor(1)}"`);
  });

  it("lists the hardware of the designs in the Build section, with the IKEA column only when an item has an article", () => {
    renderReports({ ...designProject(), designs: [{ ...designProject().designs![0]!, mount: "wall-rail" }] });
    const hardware = within(within(section("Build")).getByRole("region", { name: "Hardware" }));
    expect(hardware.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent))).toEqual([
      ["Pocket screws, coarse thread, 1 1/4\" (32 mm)", "", "33", "Hall"],
      ["EKET suspension rail, 70 cm", "80340048", "1", "Hall"],
      ["Wall screws and plugs for your wall type", "", "As needed", "Hall"],
      ["Wood glue (PVA)", "", "As needed", "Every design"],
    ]);
    expect(hardware.getByRole("link", { name: "80340048" }).getAttribute("href")).toMatch(/^https:\/\/www\.ikea\.com\/gb\//);
    expect(hardware.getByText(/IKEA in Great Britain/)).toBeTruthy();
  });

  it("hides the IKEA article column when no hardware item has one", () => {
    renderReports(designProject());
    const hardware = within(screen.getByRole("region", { name: "Hardware" }));
    expect(hardware.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Item", "Quantity", "For"]);
    expect(hardware.queryByText(/IKEA in Great Britain/)).toBeNull();
  });

  it("shows the front view and the assembly steps of each design, and prints and downloads them", async () => {
    const onPrint = vi.fn();
    const files = captureDownloads();
    renderReports(designProject(), onPrint);
    const design = within(within(section("Build")).getByRole("region", { name: "Hall" }));
    expect(design.getByRole("img", { name: "Front view of Hall" }).querySelector("svg")).toBeTruthy();
    expect(design.queryByText("Hall as SVG")).toBeNull();
    expect(design.getAllByRole("listitem")[0]!.textContent).toBe("Drill the pocket holes");
    expect(design.getByText("The Assembly tab has these steps as a checklist, with a drawing for each step.")).toBeTruthy();
    expect(booklet().getByRole("checkbox", { name: "Assembly steps" })).toHaveProperty("checked", true);
    await userEvent.click(booklet().getByRole("button", { name: "Print booklet" }));
    expect(onPrint).toHaveBeenCalledWith({ kind: "booklet", sections: ["title", "shopping", "sheets", "sequence", "assembly"] });
    await userEvent.click(within(section("Print and export")).getByRole("button", { name: "Hall front view as SVG" }));
    expect(files.map((file) => [file.name, file.blob.type])).toEqual([["Hall-hall.svg", "image/svg+xml"]]);
    expect(await files[0]!.blob.text()).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  });

  it("says there is no plan and keeps the CSV exports and the cut list", () => {
    renderReports({ ...sampleProject(), plan: { sheets: [] } });
    expect(screen.getByText("There is no plan yet. Optimize on the Layout tab.")).toBeTruthy();
    for (const [name, note] of [["Shopping list", "Needs a plan or a design."], ["Sheet diagrams", "Needs a plan."], ["Cut sequence", "Needs a plan."]] as const) {
      const check = booklet().getByRole("checkbox", { name, description: note });
      expect([check.hasAttribute("disabled"), (check as HTMLInputElement).checked]).toEqual([true, false]);
    }
    expect(booklet().getByRole("checkbox", { name: "Title page" })).toHaveProperty("disabled", false);
    expect(booklet().getByRole("checkbox", { name: "Detailed steps" })).toHaveProperty("disabled", true);
    expect(booklet().getByRole("button", { name: "Print booklet" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Export parts CSV" })).toHaveProperty("disabled", false);
    expect(screen.queryByRole("region", { name: "Summary" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Buy" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Sheet use" })).toBeNull();
    expect(screen.getByRole("region", { name: "Cut list" })).toBeTruthy();
  });
});

describe("fileBase", () => {
  it("makes the project name safe for a file name", () => {
    expect(fileBase('  a/b:c*"d"  ')).toBe("a-b-c-d-");
    expect(fileBase("   ")).toBe("project");
  });
});
