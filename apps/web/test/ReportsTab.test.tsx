import { analyzeProject, fileBase, unsavedOffcuts, type Project } from "@opencutplan/core";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrintJob } from "../src/print/PrintView.tsx";
import { ReportsTab } from "../src/reports/ReportsTab.tsx";
import { useProject, type ProjectStore } from "../src/state/useProject.ts";
import { designProject, sampleProject } from "./helpers.ts";

function renderReports(initial: Project = sampleProject(), onPrint: (job: PrintJob) => void = () => undefined) {
  let latest: ProjectStore | null = null;
  function Harness() {
    const store = useProject(initial);
    latest = store;
    const analysis = useMemo(() => analyzeProject(store.project), [store.project]);
    return <ReportsTab store={store} analysis={analysis} onPrint={onPrint} />;
  }
  render(<Harness />);
  return () => latest!;
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
  it("shows the shopping list with costs, the subtotal, the total, and the sheet use", () => {
    renderReports();
    const shopping = within(section("Shopping list"));
    expect(shopping.getByRole("heading", { name: "Plywood", level: 3 })).toBeTruthy();
    expect(shopping.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Stock", "Size", "In the plan", "To buy", "Unit cost", "Cost", "Sheet", "Stock", "Parts use"]);
    const row = shopping.getAllByRole("row")[1]!;
    expect(within(row).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(['Plywood 96" × 48"', '96" × 48"', "1", "1", "$60.00", "$60.00"]);
    expect(shopping.getByRole("rowheader", { name: "Subtotal" })).toBeTruthy();
    expect(shopping.getByText("Parts use 16% of this stock. Waste is 84%.")).toBeTruthy();
    expect(shopping.getByText("Total: $60.00")).toBeTruthy();
  });

  it("hides the costs when the cost feature is off", () => {
    renderReports(withFeatures({ cost: false }));
    const shopping = within(section("Shopping list"));
    expect(shopping.queryByRole("columnheader", { name: "Cost" })).toBeNull();
    expect(shopping.queryByText(/Total/)).toBeNull();
  });

  it("names the stock that has no price instead of a total", () => {
    const project = sampleProject();
    delete project.stock[0]!.cost;
    renderReports(project);
    expect(screen.getByText('⚠ The total is not known. This stock has no price: Plywood 96" × 48".')).toBeTruthy();
  });

  it("saves each offcut to stock once, and the save can be undone", async () => {
    const current = renderReports();
    const offcuts = within(section("Offcuts"));
    expect(offcuts.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      'Sheet 1: 65 3/8" × 12" Plywood',
      'Sheet 1: 65 3/8" × 12" Plywood',
      'Sheet 1: 95 1/2" × 23 1/4" Plywood',
    ]);
    await userEvent.click(offcuts.getByRole("button", { name: "Save offcuts to stock" }));
    expect(current().project.stock.filter((stock) => stock.kind === "offcut")).toHaveLength(3);
    expect(offcuts.getByRole("status").textContent).toBe("3 offcuts were added to the Stock tab.");
    expect(offcuts.getByRole("button", { name: "Every offcut is in stock" })).toHaveProperty("disabled", true);
    act(() => current().undo());
    expect(offcuts.getByRole("button", { name: "Save offcuts to stock" })).toHaveProperty("disabled", false);
  });

  it("counts two offcuts of the same size separately", () => {
    const project = sampleProject();
    const { offcuts } = analyzeProject(project);
    const oneSaved = { ...project, stock: [...project.stock, { id: "o1", material: "ply", length: 65.375, width: 12, quantity: 1, cost: 0, kind: "offcut" as const, trim: 0, name: "Offcut from Test, sheet 1" }] };
    expect(unsavedOffcuts(oneSaved, offcuts).map((offcut) => offcut.rect.y)).toEqual([12.375, 24.5]);
    renderReports(oneSaved);
    expect(screen.getByRole("button", { name: "Save 2 new offcuts to stock" })).toBeTruthy();
  });

  it("counts the label pages from the start position and prints the labels", async () => {
    const onPrint = vi.fn();
    renderReports(sampleProject(), onPrint);
    const labels = within(section("Labels"));
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
    expect(screen.queryByRole("region", { name: "Labels" })).toBeNull();
  });

  it("prints and exports", async () => {
    const onPrint = vi.fn();
    const files = captureDownloads();
    renderReports({ ...sampleProject(), project: { ...sampleProject().project, name: "Shelf: v2" } }, onPrint);
    const output = within(section("Print and export"));
    await userEvent.click(output.getByRole("button", { name: "Print sheet diagrams" }));
    await userEvent.click(output.getByRole("button", { name: "Print cut sequence" }));
    await userEvent.click(output.getByRole("button", { name: "Print shopping list" }));
    expect(onPrint.mock.calls.map(([job]) => job)).toEqual([{ kind: "sheets" }, { kind: "sequence" }, { kind: "shopping" }]);
    await userEvent.click(output.getByRole("button", { name: "Export parts CSV" }));
    await userEvent.click(output.getByRole("button", { name: "Export stock CSV" }));
    await userEvent.click(output.getByRole("button", { name: "Sheet 1 as SVG" }));
    expect(files.map((file) => [file.name, file.blob.type])).toEqual([
      ["Shelf- v2-parts.csv", "text/csv"],
      ["Shelf- v2-stock.csv", "text/csv"],
      ["Shelf- v2-sheet-1.svg", "image/svg+xml"],
    ]);
    expect(await files[0]!.blob.text()).toMatch(/^name,length,width,quantity,material,grain,group,notes\r?\nSide,30,12,2,Plywood,length,,/);
    expect(await files[2]!.blob.text()).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="-1\.6 -1\.6 99\.2 51\.2" width="99\.2in"/);
  });

  it("lists the hardware of the designs in the shopping list", () => {
    renderReports({ ...designProject(), designs: [{ ...designProject().designs![0]!, mount: "wall-rail" }] });
    const hardware = within(screen.getByRole("region", { name: "Hardware" }));
    expect(hardware.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent))).toEqual([
      ["Pocket screws, coarse thread, 1 1/4\" (32 mm)", "", "40", "Hall"],
      ["EKET suspension rail, 70 cm", "80340048", "1", "Hall"],
      ["Wall screws and plugs for your wall type", "", "As needed", "Hall"],
      ["Wood glue (PVA)", "", "As needed", "Every design"],
    ]);
    expect(hardware.getByRole("link", { name: "80340048" }).getAttribute("href")).toMatch(/^https:\/\/www\.ikea\.com\/gb\//);
  });

  it("prints the assembly steps and downloads the front view of each design", async () => {
    const onPrint = vi.fn();
    const files = captureDownloads();
    renderReports(designProject(), onPrint);
    await userEvent.click(screen.getByRole("button", { name: "Print assembly steps" }));
    expect(onPrint).toHaveBeenCalledWith({ kind: "assembly" });
    const drawings = within(section("Front views"));
    expect(drawings.getByRole("img", { name: "Front view of Hall" }).querySelector("svg")).toBeTruthy();
    await userEvent.click(drawings.getByRole("button", { name: "Hall as SVG" }));
    expect(files.map((file) => [file.name, file.blob.type])).toEqual([["Hall-hall.svg", "image/svg+xml"]]);
    expect(await files[0]!.blob.text()).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  });

  it("says there is no plan and keeps the CSV exports", () => {
    renderReports({ ...sampleProject(), plan: { sheets: [] } });
    expect(screen.getByText("There is no plan yet. Optimize on the Layout tab.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Print sheet diagrams" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Print cut sequence" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Export parts CSV" })).toHaveProperty("disabled", false);
    expect(screen.queryByRole("region", { name: "Shopping list" })).toBeNull();
  });
});

describe("fileBase", () => {
  it("makes the project name safe for a file name", () => {
    expect(fileBase('  a/b:c*"d"  ')).toBe("a-b-c-d-");
    expect(fileBase("   ")).toBe("project");
  });
});
