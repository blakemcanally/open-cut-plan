import { analyzeProject, stageColor, TOOL_COLORS, TOOL_WARNING_COLOR, type Project } from "@opencutplan/core";
import { act, render, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOOKLET_PAGE_RULE, PrintView, type PrintJob, type PrintOptions } from "../src/print/PrintView.tsx";
import { printScale, sequencePrintLayout, sheetPrintLayout } from "../src/print/scale.ts";
import { formatMoney } from "../src/reports/money.ts";
import { assemblyGroups } from "../src/shop/progress.ts";
import { designProject, sampleProject } from "./helpers.ts";

let print: ReturnType<typeof vi.spyOn>;

function hexRgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}

beforeEach(() => {
  print = vi.spyOn(window, "print").mockImplementation(() => undefined);
});

afterEach(() => {
  print.mockRestore();
});

function renderPrint(job: PrintJob, project: Project = sampleProject(), onDone = vi.fn(), options: PrintOptions = { cutColors: "stage", detailedSteps: false }) {
  const view = render(
    <StrictMode>
      <div id="root-marker" />
      <PrintView job={job} analysis={analyzeProject(project)} options={options} onDone={onDone} />
    </StrictMode>,
  );
  const root = document.body.querySelector<HTMLElement>(":scope > .print-root");
  if (!root) throw new Error("no print root");
  return { ...view, root, onDone };
}

describe("printScale", () => {
  it("picks the largest standard scale that fits the box when it nearly fills the box", () => {
    expect(printScale({ length: 96, width: 48 }, "in", { width: 250, height: 130 })).toEqual({ ratio: 10, width: "243.8mm", height: "121.9mm" });
    expect(printScale({ length: 2440, width: 1220 }, "mm", { width: 250, height: 130 })).toEqual({ ratio: 10, width: "244mm", height: "122mm" });
    expect(printScale({ length: 200, width: 100 }, "mm", { width: 250, height: 130 })).toEqual({ ratio: 1, width: "200mm", height: "100mm" });
  });

  it("fills the box and has no scale when the standard scale leaves too much space, or even 1:50 is too large", () => {
    expect(printScale({ length: 96, width: 48 }, "in", { width: 170, height: 90 })).toEqual({ ratio: null, width: "170mm", height: "85mm" });
    expect(printScale({ length: 20000, width: 1000 }, "mm", { width: 250, height: 130 })).toEqual({ ratio: null, width: "250mm", height: "12.5mm" });
  });
});

describe("sheetPrintLayout", () => {
  it("fills the landscape page: the key goes below a long sheet and beside a square one", () => {
    expect(sheetPrintLayout({ length: 99.2, width: 51.2 }, "in", 3)).toEqual({ keyBeside: false, scale: { ratio: 10, width: "252mm", height: "130mm" } });
    expect(sheetPrintLayout({ length: 64, width: 64 }, "in", 3)).toEqual({ keyBeside: true, scale: { ratio: 10, width: "162.6mm", height: "162.6mm" } });
    expect(sheetPrintLayout({ length: 40000, width: 40000 }, "mm", 3)).toMatchObject({ scale: { ratio: null, width: "163mm" } });
  });

  it("leaves space for the plan problem notice and for more rows of the key", () => {
    expect(sheetPrintLayout({ length: 99.2, width: 51.2 }, "in", 3, { alert: true })).toEqual({ keyBeside: false, scale: { ratio: 10, width: "252mm", height: "130mm" } });
    expect(sheetPrintLayout({ length: 99.2, width: 51.2 }, "in", 30)).toEqual({ keyBeside: false, scale: { ratio: null, width: "234.4mm", height: "121mm" } });
    expect(sheetPrintLayout({ length: 99.2, width: 51.2 }, "in", 30, { alert: true })).toEqual({ keyBeside: false, scale: { ratio: null, width: "205.4mm", height: "106mm" } });
  });
});

describe("sequencePrintLayout", () => {
  it("puts the step table below a long sheet and beside a square one", () => {
    expect(sequencePrintLayout({ length: 99.2, width: 51.2 }, "in", 7)).toEqual({ table: "below", scale: { ratio: 12, width: "210mm", height: "108.4mm" } });
    expect(sequencePrintLayout({ length: 64, width: 64 }, "in", 11)).toEqual({ table: "beside", scale: { ratio: null, width: "156mm", height: "156mm" } });
  });

  it("gives the drawing the full page and puts the steps on the next page when there are many, or they are detailed", () => {
    expect(sequencePrintLayout({ length: 99.2, width: 51.2 }, "in", 30)).toEqual({ table: "next-page", scale: { ratio: 10, width: "252mm", height: "130mm" } });
    expect(sequencePrintLayout({ length: 99.2, width: 51.2 }, "in", 2, { detailed: true })).toMatchObject({ table: "next-page", scale: { ratio: 10 } });
  });
});

describe("formatMoney", () => {
  it("formats a currency and falls back for a code the browser does not know", () => {
    expect(formatMoney(60, "USD")).toMatch(/60\.00/);
    expect(formatMoney(12.5, "US")).toBe("12.50 US");
  });
});

describe("PrintView", () => {
  it("prints one page per sheet outside the app root, once, and ends when the dialog closes", () => {
    const { root, onDone } = renderPrint({ kind: "booklet", sections: ["sheets"] });
    expect(print).toHaveBeenCalledTimes(1);
    expect(root.parentElement).toBe(document.body);
    expect(root.getAttribute("data-job")).toBe("booklet");
    const pages = root.querySelectorAll(".print-page");
    expect(pages).toHaveLength(1);
    const page = within(pages[0] as HTMLElement);
    expect(page.getByRole("heading", { name: 'Sheet 1 of 1: Plywood 96" × 48"' })).toBeTruthy();
    expect(page.getByText(/^Scale 1:10 · Test$/)).toBeTruthy();
    const svg = pages[0]!.querySelector("svg")!;
    expect([svg.getAttribute("width"), svg.getAttribute("height")]).toEqual(["252mm", "130mm"]);
    expect(svg.querySelector("pattern")?.id).toBe("print-s1-h");
    expect(page.getByText("Side ×2").parentElement?.textContent).toBe('Side ×2 30" × 12" ↔');
    expect(page.getByText(/The number on a cut line is its step/)).toBeTruthy();
    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("prints the booklet sections in order, with portrait pages and landscape sheet pages", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 30));
    const { root } = renderPrint({ kind: "booklet", sections: ["assembly", "title", "sequence", "sheets", "shopping"] }, designProject());
    vi.useRealTimers();
    expect(root.querySelector("style")?.textContent).toBe(BOOKLET_PAGE_RULE);
    expect(BOOKLET_PAGE_RULE).toBe("@page { size: portrait; margin: 15mm; } @page sheet { size: landscape; margin: 10mm; }");
    expect([...root.querySelectorAll(":scope > section")].map((page) => page.querySelector("h1, h2")?.textContent)).toEqual([
      "Hall",
      "Hall: shopping list",
      "Sheet 1 of 1: Plywood 18 2440 mm × 1220 mm",
      "Hall: cut sequence",
      "Hall: Hall",
    ]);
    expect([...root.querySelectorAll(":scope > section")].map((page) => page.classList.contains("print-landscape"))).toEqual([false, false, true, true, false]);
    const title = within(root.querySelector<HTMLElement>(".print-title")!);
    expect(title.getByText(new Date(2026, 8, 30).toLocaleDateString(undefined, { dateStyle: "long" }))).toBeTruthy();
    expect(title.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Shopping list", "Sheet diagrams", "Cut sequence", "Assembly steps"]);
  });

  it("leaves out the sections that are not in the job", () => {
    const { root } = renderPrint({ kind: "booklet", sections: ["title", "sequence"] });
    expect([...root.querySelectorAll(":scope > section")].map((page) => page.querySelector("h1")?.textContent)).toEqual(["Test", "Test: cut sequence"]);
    expect(within(root.querySelector<HTMLElement>(".print-title")!).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Cut sequence"]);
  });

  it("gives one key row for each part and orientation, in the parts-list order", () => {
    const project = sampleProject();
    project.parts[0]!.quantity = 3;
    project.parts[1]!.quantity = 2;
    project.plan!.sheets[0]!.placements = [
      { part: "shelf", copy: 1, x: 42.625, y: 10.375, rotated: false },
      { part: "side", copy: 1, x: 30.5, y: 0.25, rotated: true },
      { part: "shelf", copy: 0, x: 42.625, y: 0.25, rotated: false },
      { part: "side", copy: 2, x: 0.25, y: 12.375, rotated: false },
      { part: "side", copy: 0, x: 0.25, y: 0.25, rotated: false },
    ];
    const { root } = renderPrint({ kind: "booklet", sections: ["sheets"] }, project);
    expect([...root.querySelectorAll(".print-key li")].map((row) => row.textContent)).toEqual([
      'Side ×2 30" × 12" ↔',
      'Side 2 12" × 30" ↕ ⟂ across the grain',
      'Shelf ×2 20" × 10"',
    ]);
  });

  it("prints the cut sequence as one landscape page per sheet, with a large drawing and a short table of the steps", () => {
    const project = sampleProject();
    project.parts.pop();
    const { root } = renderPrint({ kind: "booklet", sections: ["sequence"] }, project);
    const steps = analyzeProject(project).steps;
    const pages = [...root.querySelectorAll<HTMLElement>(".print-page")];
    expect(pages.map((page) => page.className)).toEqual(["print-page print-landscape print-sequence"]);
    const page = within(pages[0]!);
    expect(page.getByRole("heading", { name: "Test: cut sequence", level: 1 })).toBeTruthy();
    expect(page.getByRole("heading", { name: 'Sheet 1 of 1: Plywood 96" × 48"', level: 2 })).toBeTruthy();
    expect(page.getByText("Not to scale · Steps 1–7")).toBeTruthy();
    expect(pages[0]!.querySelector(".print-sequence-body")?.classList.contains("table-below")).toBe(true);
    const svg = pages[0]!.querySelector("svg")!;
    expect([svg.getAttribute("width"), svg.getAttribute("height")]).toEqual(["200.3mm", "103.4mm"]);
    expect(svg.querySelector("pattern")?.id).toBe("print-seq-s1-h");
    expect(page.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Done", "Step", "Tool", "Setting", "Finished parts"]);
    const rows = page.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(steps.length);
    expect(rows.map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent))).toEqual([
      ["☐", "1", "■ Table saw", 'Trim 1/4" off the top', ""],
      ["☐", "2", "■ Table saw", 'Trim 1/4" off the bottom', ""],
      ["☐", "3", "■ Table saw", 'Trim 1/4" off the left', ""],
      ["☐", "4", "■ Table saw", 'Trim 1/4" off the right', ""],
      ["☐", "5", "■ Table saw", 'Stop 30"', ""],
      ["☐", "6", "■ Table saw", 'Fence 12"', "Side 1"],
      ["☐", "7", "■ Table saw", 'Fence 12"', "Side 2"],
    ]);
    expect(rows[0]!.querySelector<HTMLElement>(".print-swatch")!.style.color).toBe(hexRgb(TOOL_COLORS[0]!));
    expect(page.getByText(/The colour shows the stage:/).textContent).toBe("The number on a cut line is its step in the cut sequence. The colour shows the stage: ■ stage 1■ stage 2. A dashed line is a trim cut.");
  });

  it("prints the full text of each step on the next page with Detailed steps", () => {
    const { root } = renderPrint({ kind: "booklet", sections: ["sequence"] }, sampleProject(), vi.fn(), { cutColors: "stage", detailedSteps: true });
    const steps = analyzeProject(sampleProject()).steps;
    expect(root.querySelector(".print-sequence-body")?.classList.contains("table-next-page")).toBe(true);
    expect(within(root).getByText("Scale 1:10 · Steps 1–7")).toBeTruthy();
    expect(within(root).getByRole("heading", { level: 3 }).textContent).toBe('Sheet 1 of 1: Plywood 96" × 48" · Steps 1–7');
    expect(root.querySelector("table")).toBeNull();
    const items = root.querySelectorAll(".print-steps li");
    expect(items).toHaveLength(steps.length);
    expect(items[0]!.querySelector(".print-box")?.textContent).toBe("☐");
    expect([...items[0]!.querySelectorAll(":scope > div > div")].map((line) => line.textContent)).toEqual([
      'Step 1 · Trim 1/4" off the top edge · Table saw · trim: a cut that removes the rough factory edge',
      'Pick up the full sheet 96" × 48" (sheet 1). 1. Cut 1/4" off the top edge.',
      'Waste: 96" × 1/8". Next: 96" × 47 3/4" with Side 1, Side 2, for step 2.',
    ]);
  });

  it("colours the cuts by tool in the booklet when the Layout tab does, with a tool legend", () => {
    const project = sampleProject();
    project.tools.push({ id: "tr", name: "Track saw", type: "track-saw", kerf: 0.0625, enabled: true });
    const { root } = renderPrint({ kind: "booklet", sections: ["sheets", "sequence"] }, project, vi.fn(), { cutColors: "tool", detailedSteps: false });
    const [sheetPage, sequencePage] = [...root.querySelectorAll<HTMLElement>(".print-page")];
    for (const page of [sheetPage!, sequencePage!]) {
      expect(page.querySelector("svg")!.innerHTML).toContain(`stroke="${TOOL_COLORS[0]}"`);
      expect(page.querySelector("svg")!.innerHTML).not.toContain(`stroke="${stageColor(1)}"`);
      expect(within(page).getByText(/The colour shows the tool:/).textContent).toBe("The number on a cut line is its step in the cut sequence. The colour shows the tool: ■ Table saw. A dashed line is a trim cut.");
    }
  });

  it("marks a cut with no tool in the table and in the tool legend", () => {
    const project = sampleProject();
    project.tools[0]!.enabled = false;
    const { root } = renderPrint({ kind: "booklet", sections: ["sequence"] }, project, vi.fn(), { cutColors: "tool", detailedSteps: false });
    const row = within(root).getAllByRole("row")[1]!;
    expect(within(row).getAllByRole("cell")[2]!.textContent).toBe("■ No tool ⚠");
    expect(row.querySelector<HTMLElement>(".print-swatch")!.style.color).toBe(hexRgb(TOOL_WARNING_COLOR));
    expect(within(root).getByText(/The colour shows the tool:/).textContent).toContain("■ no tool, or over a tool limit.");
  });

  it("prints the shopping list", () => {
    const { root } = renderPrint({ kind: "booklet", sections: ["shopping"] });
    expect(within(root).getByRole("heading", { name: "Test: shopping list" })).toBeTruthy();
    expect(within(root).getByRole("heading", { name: "Plywood", level: 2 })).toBeTruthy();
    expect(within(root).getByText(/^Total: .*60\.00/)).toBeTruthy();
  });

  it("prints the hardware on the shopping list, even with no sheets", () => {
    const { root } = renderPrint({ kind: "booklet", sections: ["shopping"] }, { ...designProject(), plan: { sheets: [] } });
    expect(within(root).queryByRole("heading", { name: "Plywood 18", level: 2 })).toBeNull();
    const hardware = within(root).getByRole("heading", { name: "Hardware" }).closest("section")!;
    expect(within(hardware).getAllByRole("row")).toHaveLength(5);
  });

  it("prints one page of assembly steps for each design", () => {
    const project = designProject();
    const { root } = renderPrint({ kind: "booklet", sections: ["assembly"] }, project);
    const pages = [...root.querySelectorAll<HTMLElement>(".print-page")];
    expect(pages).toHaveLength(1);
    expect(within(pages[0]!).getByRole("heading", { name: "Hall: Hall", level: 1 })).toBeTruthy();
    expect(pages[0]!.querySelector(".print-elevation svg")).toBeTruthy();
    expect([...pages[0]!.querySelectorAll(".print-steps li")].map((step) => step.textContent)).toEqual(assemblyGroups(project)[0]!.steps.map((step) => `☐${step.title} ${step.body}`));
  });

  it("places labels on the label sheet from the start position", () => {
    const { root } = renderPrint({ kind: "labels", layout: "avery-5160", start: 3 });
    expect(root.querySelector("style")?.textContent).toBe("@page { size: 8.5in 11in; margin: 0; }");
    const labels = [...root.querySelectorAll<HTMLElement>(".label")];
    expect(labels.map((label) => label.querySelector("strong")?.textContent)).toEqual(["Side 1", "Side 2", "Shelf"]);
    expect([labels[0]!.style.left, labels[0]!.style.top, labels[0]!.style.width]).toEqual(["5.6875in", "0.5in", "2.625in"]);
    expect([labels[1]!.style.left, labels[1]!.style.top]).toEqual(["0.1875in", "1.5in"]);
    const freedAt = analyzeProject(sampleProject()).labels[0]!.step;
    expect(labels[0]!.textContent).toBe(`Side 130" × 12" · PlywoodGrain ↔Sheet 1 · step ${freedAt}`);
    expect(labels[2]!.textContent).toBe('Shelf20" × 10" · PlywoodANot placed');
  });

  it("says factory edge on the label of a copy that asks for one", () => {
    const project = sampleProject();
    project.parts[0] = { ...project.parts[0]!, factoryEdge: "long" };
    const { root } = renderPrint({ kind: "labels", layout: "avery-5160", start: 1 }, project);
    const labels = [...root.querySelectorAll<HTMLElement>(".label")];
    expect(labels.map((label) => label.textContent?.includes("Factory edge"))).toEqual([true, true, false]);
  });

  it("uses mm for an A4 label sheet", () => {
    const { root } = renderPrint({ kind: "labels", layout: "avery-l7160", start: 1 });
    expect(root.querySelector("style")?.textContent).toBe("@page { size: 210mm 297mm; margin: 0; }");
    expect(root.querySelector<HTMLElement>(".label")!.style.height).toBe("38.1mm");
  });
});
