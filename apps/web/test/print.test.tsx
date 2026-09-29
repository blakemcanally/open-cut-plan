import { analyzeProject, type Project } from "@opencutplan/core";
import { act, render, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrintView, type PrintJob } from "../src/print/PrintView.tsx";
import { printScale, sheetPrintLayout } from "../src/print/scale.ts";
import { formatMoney } from "../src/reports/money.ts";
import { sampleProject } from "./helpers.ts";

let print: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  print = vi.spyOn(window, "print").mockImplementation(() => undefined);
});

afterEach(() => {
  print.mockRestore();
});

function renderPrint(job: PrintJob, project: Project = sampleProject(), onDone = vi.fn()) {
  const view = render(
    <StrictMode>
      <div id="root-marker" />
      <PrintView job={job} analysis={analyzeProject(project)} onDone={onDone} />
    </StrictMode>,
  );
  const root = document.body.querySelector<HTMLElement>(":scope > .print-root");
  if (!root) throw new Error("no print root");
  return { ...view, root, onDone };
}

describe("printScale", () => {
  it("picks the largest standard scale that fits the box", () => {
    expect(printScale({ length: 96, width: 48 }, "in", { width: 250, height: 130 })).toEqual({ ratio: 10, width: "243.8mm", height: "121.9mm" });
    expect(printScale({ length: 2440, width: 1220 }, "mm", { width: 250, height: 130 })).toEqual({ ratio: 10, width: "244mm", height: "122mm" });
    expect(printScale({ length: 200, width: 100 }, "mm", { width: 250, height: 130 })).toEqual({ ratio: 1, width: "200mm", height: "100mm" });
    expect(printScale({ length: 96, width: 48 }, "in", { width: 170, height: 90 })).toMatchObject({ ratio: 16 });
  });

  it("fills the box and has no scale when even 1:50 is too large", () => {
    expect(printScale({ length: 20000, width: 1000 }, "mm", { width: 250, height: 130 })).toEqual({ ratio: null, width: "250mm", height: "12.5mm" });
  });
});

describe("sheetPrintLayout", () => {
  it("puts the key below a long sheet and beside a square one", () => {
    expect(sheetPrintLayout({ length: 99.2, width: 51.2 }, "in")).toEqual({ keyBeside: false, scale: { ratio: 12, width: "210mm", height: "108.4mm" } });
    expect(sheetPrintLayout({ length: 64, width: 64 }, "in")).toEqual({ keyBeside: true, scale: { ratio: 12, width: "135.5mm", height: "135.5mm" } });
    expect(sheetPrintLayout({ length: 40000, width: 40000 }, "mm")).toMatchObject({ keyBeside: false, scale: { ratio: null } });
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
    const { root, onDone } = renderPrint({ kind: "sheets" });
    expect(print).toHaveBeenCalledTimes(1);
    expect(root.parentElement).toBe(document.body);
    expect(root.querySelector("style")?.textContent).toBe("@page { size: landscape; margin: 12mm; }");
    const pages = root.querySelectorAll(".print-page");
    expect(pages).toHaveLength(1);
    const page = within(pages[0] as HTMLElement);
    expect(page.getByRole("heading", { name: 'Sheet 1 of 1: Plywood 96" × 48"' })).toBeTruthy();
    expect(page.getByText(/^Scale 1:12 · Test$/)).toBeTruthy();
    const svg = pages[0]!.querySelector("svg")!;
    expect([svg.getAttribute("width"), svg.getAttribute("height")]).toEqual(["210mm", "108.4mm"]);
    expect(svg.querySelector("pattern")?.id).toBe("print-s1-h");
    expect(page.getByText("Side ×2").parentElement?.textContent).toBe('Side ×2 30" × 12" ↔');
    expect(page.getByText(/The number on a cut line is its step/)).toBeTruthy();
    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    expect(onDone).toHaveBeenCalledTimes(1);
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
    const { root } = renderPrint({ kind: "sheets" }, project);
    expect([...root.querySelectorAll(".print-key li")].map((row) => row.textContent)).toEqual([
      'Side ×2 30" × 12" ↔',
      'Side 2 12" × 30" ↕ ⟂ across the grain',
      'Shelf ×2 20" × 10"',
    ]);
  });

  it("prints the cut sequence with a box to tick for each step", () => {
    const { root } = renderPrint({ kind: "sequence" });
    const steps = analyzeProject(sampleProject()).steps;
    expect(root.querySelector("style")?.textContent).toBe("@page { size: portrait; margin: 15mm; }");
    expect(within(root).getByRole("heading", { name: "Test: cut sequence" })).toBeTruthy();
    const items = root.querySelectorAll(".print-steps li");
    expect(items).toHaveLength(steps.length);
    expect(items[0]!.textContent).toMatch(/^☐Step 1\. Table saw, /);
    expect(within(root).getByText("Scale 1:16")).toBeTruthy();
  });

  it("prints the shopping list", () => {
    const { root } = renderPrint({ kind: "shopping" });
    expect(within(root).getByRole("heading", { name: "Test: shopping list" })).toBeTruthy();
    expect(within(root).getByRole("heading", { name: "Plywood", level: 2 })).toBeTruthy();
    expect(within(root).getByText(/^Total: .*60\.00/)).toBeTruthy();
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

  it("uses mm for an A4 label sheet", () => {
    const { root } = renderPrint({ kind: "labels", layout: "avery-l7160", start: 1 });
    expect(root.querySelector("style")?.textContent).toBe("@page { size: 210mm 297mm; margin: 0; }");
    expect(root.querySelector<HTMLElement>(".label")!.style.height).toBe("38.1mm");
  });
});
