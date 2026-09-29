import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CsvImportDialog } from "../src/components/CsvImportDialog.tsx";
import { sampleProject } from "./helpers.ts";

describe("CsvImportDialog", () => {
  it("guesses the columns from the header and imports the rows", async () => {
    const onImport = vi.fn();
    render(<CsvImportDialog kind="parts" text={"Name\tLength\tWidth\tQty\nTop\t30\t12\t2\nBack\t30\t20\t1"} project={sampleProject()} onImport={onImport} onClose={() => undefined} />);
    expect(screen.getByText("2 rows are ready.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Import 2 rows" }));
    const parts = onImport.mock.calls[0]![0].parts;
    expect(parts.slice(2).map((p: { name: string; quantity: number; material: string }) => [p.name, p.quantity, p.material])).toEqual([
      ["Top", 2, "ply"],
      ["Back", 1, "ply"],
    ]);
  });

  it("asks for the missing columns when there is no header, then imports", async () => {
    const onImport = vi.fn();
    render(<CsvImportDialog kind="parts" text={"Top,30,12\nBack,30,20"} project={sampleProject()} onImport={onImport} onClose={() => undefined} />);
    expect(screen.getByRole("alert").textContent).toContain("Length, Width");
    expect(screen.getByRole("button", { name: "Import 0 rows" })).toHaveProperty("disabled", true);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Name" }), "Column 1");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Length (required)" }), "Column 2");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Width (required)" }), "Column 3");
    await userEvent.click(screen.getByRole("button", { name: "Import 2 rows" }));
    expect(onImport.mock.calls[0]![0].parts.map((p: { name: string }) => p.name)).toEqual(["Side", "Shelf", "Top", "Back"]);
  });

  it("lists row errors and leaves those rows out", () => {
    render(<CsvImportDialog kind="stock" text={"Material,Length,Width,Qty\nPly,96,48,2\nPly,x,48,1"} project={sampleProject()} onImport={() => undefined} onClose={() => undefined} />);
    expect(screen.getByText(/1 row is ready\. 1 row has an error/)).toBeTruthy();
    expect(within(screen.getByRole("list")).getByText(/Row 3/)).toBeTruthy();
  });

  it("names the materials the import will add before the person imports", async () => {
    const onImport = vi.fn();
    render(<CsvImportDialog kind="parts" text={"Name,Length,Width,Material\nTop,30,12,Plywod\nBack,30,20,Plywood"} project={sampleProject()} onImport={onImport} onClose={() => undefined} />);
    expect(screen.getByText("These materials are new and will be added: Plywod.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Import 2 rows" }));
    expect(onImport.mock.calls[0]![0].materials.map((m: { name: string }) => m.name)).toEqual(["Plywood", "Plywod"]);
  });

  it("closes with Escape", async () => {
    const onClose = vi.fn();
    render(<CsvImportDialog kind="parts" text="" project={sampleProject()} onImport={() => undefined} onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
