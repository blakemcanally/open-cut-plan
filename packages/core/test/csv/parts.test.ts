import { describe, expect, it } from "vitest";
import { importPartsCsv } from "../../src/index.ts";
import { expectOk } from "../helpers.ts";

describe("importPartsCsv", () => {
  it("reads our own columns with fractions and quoted cells", () => {
    const csv = [
      "name,length,width,quantity,material,grain,group,notes",
      "A Top,42 19/32,15 3/8,1,Baltic birch 18mm,length,3x2 A,",
      '"Shelf, adjustable",13 1/4,15 3/8,3,Baltic birch 18mm,length,3x2 A,"has ""pin"" holes"',
    ].join("\n");
    const result = expectOk(importPartsCsv(csv, { units: "in" }));
    expect(result.issues).toEqual([]);
    expect(result.rows).toEqual([
      { name: "A Top", length: 42.59375, width: 15.375, quantity: 1, material: "Baltic birch 18mm", grain: "length", group: "3x2 A" },
      {
        name: "Shelf, adjustable",
        length: 13.25,
        width: 15.375,
        quantity: 3,
        material: "Baltic birch 18mm",
        grain: "length",
        group: "3x2 A",
        notes: 'has "pin" holes',
      },
    ]);
  });

  it("reads a European Excel export with semicolons and decimal commas", () => {
    const csv = "\uFEFFPart;Qty;L;W;Material;Grain\r\nSide;2;1800;300;MDF;none\r\nShelf;3;764,5;280;MDF;-\r\n\r\n;;;;;\r\n";
    const result = expectOk(importPartsCsv(csv, { units: "mm" }));
    expect(result.rows).toEqual([
      { name: "Side", length: 1800, width: 300, quantity: 2, material: "MDF", grain: "none" },
      { name: "Shelf", length: 764.5, width: 280, quantity: 3, material: "MDF", grain: "none" },
    ]);
  });

  it("reads dotted thousands in a semicolon file", () => {
    const csv = "name;length;width;quantity\nSide;2.440;600,5;2\n";
    expect(expectOk(importPartsCsv(csv, { units: "mm" })).rows).toEqual([
      { name: "Side", length: 2440, width: 600.5, quantity: 2, material: "Material", grain: "length" },
    ]);
  });

  it("recognizes common alternative headers", () => {
    const csv = "Part name,Count,Cutting length,Cutting width,Material name,Grain direction\nDoor,2,700,396,Birch ply,yes\n";
    const result = expectOk(importPartsCsv(csv, { units: "mm" }));
    expect(result.rows).toEqual([{ name: "Door", length: 700, width: 396, quantity: 2, material: "Birch ply", grain: "length" }]);
  });

  it("maps quantity aliases, Part #, and prefers the cutting size", () => {
    const csv = "Part #,Description,Length,Width,Cutting length,Cutting width,Copies\n7,Door,700,396,702,398,2\n";
    const result = expectOk(importPartsCsv(csv, { units: "mm" }));
    expect(result.mapping).toMatchObject({ name: 1, length: 4, width: 5, quantity: 6 });
    expect(result.rows).toEqual([{ name: "Door", length: 702, width: 398, quantity: 2, material: "Material", grain: "length" }]);
    expect(result.issues).toEqual([]);
  });

  it.each(["Anzahl", "Menge", "Stück", "Stk", "Number of", "No. of"])("maps %j to quantity", (header) => {
    expect(expectOk(importPartsCsv(`length,width,${header}\n10,5,3\n`, { units: "in" })).rows[0]!.quantity).toBe(3);
  });

  it("warns once when no quantity column is found but some columns are unmapped", () => {
    const warned = expectOk(importPartsCsv("name,length,width,Colour\nA,10,5,red\nB,10,5,blue\n", { units: "in" }));
    expect(warned.issues).toEqual([
      { severity: "warning", row: 1, column: "quantity", message: "No quantity column was found, so each part has quantity 1." },
    ]);
    expect(expectOk(importPartsCsv("name,length,width\nA,10,5\n", { units: "in" })).issues).toEqual([]);
  });

  it("converts values from units declared in the headers", () => {
    const csv = "Name,Length (mm),Width (mm),Qty,Thickness (mm)\nSide,1800,300,2,18\n";
    const [row] = expectOk(importPartsCsv(csv, { units: "in" })).rows;
    expect(row!.length).toBeCloseTo(1800 / 25.4, 9);
    expect(row!.width).toBeCloseTo(300 / 25.4, 9);
    expect(row!.thickness).toBeCloseTo(18 / 25.4, 9);
  });

  it("converts cm, m, and ft header units to the project units", () => {
    const [metric] = expectOk(importPartsCsv("Name (optional),Length (cm),Width (m),Thickness (mm)\nSide,60,1.2,18mm\n", { units: "mm" })).rows;
    expect(metric).toMatchObject({ name: "Side", thickness: 18 });
    expect(metric!.length).toBeCloseTo(600, 9);
    expect(metric!.width).toBeCloseTo(1200, 9);
    const [imperial] = expectOk(importPartsCsv("Length (ft),Width (in)\n8,24\n", { units: "in" })).rows;
    expect(imperial).toMatchObject({ length: 96, width: 24 });
  });

  it("asks for a mapping when required columns are unknown, then uses it", () => {
    const csv = "Item,Long side,Short side,How many\nSide,30,12,2\n";
    const first = importPartsCsv(csv, { units: "in" });
    expect(first.status).toBe("needs-mapping");
    if (first.status !== "needs-mapping") return;
    expect(first.missing).toEqual(["length", "width"]);
    expect(first.mapping).toEqual({ name: 0 });
    expect(first.table.headers).toEqual(["Item", "Long side", "Short side", "How many"]);

    const second = expectOk(importPartsCsv(csv, { units: "in", mapping: { name: 0, length: 1, width: 2, quantity: 3 } }));
    expect(second.rows).toEqual([{ name: "Side", length: 30, width: 12, quantity: 2, material: "Material", grain: "length" }]);
  });

  it("skips rows with errors and keeps rows with warnings", () => {
    const csv = [
      "name,length,width,quantity,grain,thickness",
      "Good,10,5,1,,",
      "BadLength,abc,5,1,,",
      "BadQty,10,5,1.5,,",
      "HugeQty,10,5,10001,,",
      "OddGrain,10,5,1,diagonal,thick",
    ].join("\n");
    const result = expectOk(importPartsCsv(csv, { units: "in" }));
    expect(result.rows.map((row) => row.name)).toEqual(["Good", "OddGrain"]);
    expect(result.rows[1]!.grain).toBe("length");
    expect(result.rows[1]).not.toHaveProperty("thickness");
    expect(result.issues).toEqual([
      { severity: "error", row: 3, column: "length", message: 'Row 3: length "abc" is not a valid length.' },
      { severity: "error", row: 4, column: "quantity", message: 'Row 4: quantity "1.5" is not a whole number from 1 to 10000.' },
      { severity: "error", row: 5, column: "quantity", message: 'Row 5: quantity "10001" is not a whole number from 1 to 10000.' },
      { severity: "warning", row: 6, column: "grain", message: 'Row 6: grain "diagonal" is not recognized, so "length" is used.' },
      { severity: "warning", row: 6, column: "thickness", message: 'Row 6: thickness "thick" is not a valid length, so it is ignored.' },
    ]);
  });

  it("fills defaults for empty cells", () => {
    const result = expectOk(importPartsCsv("length,width\n10,5\n", { units: "in", defaultMaterial: "Pine ply" }));
    expect(result.rows).toEqual([{ name: "Part 1", length: 10, width: 5, quantity: 1, material: "Pine ply", grain: "length" }]);
  });

  it("reads inch fractions in a metric project", () => {
    const [row] = expectOk(importPartsCsv("length,width\n15 3/8,10\n", { units: "mm" })).rows;
    expect(row!.length).toBeCloseTo(390.525, 9);
    expect(row!.width).toBe(10);
  });

  it("detects a file without a header row and keeps its first row", () => {
    const csv = "Side,30,12,2\nTop,24,12,1\n";
    const first = importPartsCsv(csv, { units: "in" });
    expect(first.status).toBe("needs-mapping");
    expect(first.table.hasHeader).toBe(false);
    expect(first.table.headers).toEqual(["Column 1", "Column 2", "Column 3", "Column 4"]);

    const second = expectOk(importPartsCsv(csv, { units: "in", mapping: { name: 0, length: 1, width: 2, quantity: 3 } }));
    expect(second.rows.map((row) => row.name)).toEqual(["Side", "Top"]);
    expect(second.issues).toEqual([]);
  });

  it("numbers issues by spreadsheet row when a headerless file has errors", () => {
    const result = expectOk(importPartsCsv("Side,abc,12\n", { units: "in", mapping: { name: 0, length: 1, width: 2 } }));
    expect(result.issues[0]).toMatchObject({ row: 1, message: 'Row 1: length "abc" is not a valid length.' });
  });

  it("keeps a headerless first row whose text cells match aliases", () => {
    const csv = "Side,30,12,2,Plywood,length\nDoor,700,396,2,Cabinet,width\n";
    const result = importPartsCsv(csv, { units: "in" });
    expect(result.table.hasHeader).toBe(false);
    expect(result.table.rows).toHaveLength(2);
  });

  it("treats a first row with no lengths as a header", () => {
    const result = importPartsCsv("Stück,Lang,Breit\n2,30,12\n", { units: "in" });
    expect(result.table.hasHeader).toBe(true);
    expect(result.table.rows).toEqual([["2", "30", "12"]]);
  });

  it("forces a header row with hasHeader: true", () => {
    const result = importPartsCsv("Side,30,12,2\nTop,24,12,1\n", { units: "in", hasHeader: true, mapping: { name: 0, length: 1, width: 2 } });
    expect(result.table.headers).toEqual(["Side", "30", "12", "2"]);
    expect(expectOk(result).rows.map((row) => row.name)).toEqual(["Top"]);
  });

  it("reports the spreadsheet row when blank lines come before it", () => {
    const result = expectOk(importPartsCsv("name,length,width\nA,1,1\n\nB,abc,1\n", { units: "in" }));
    expect(result.issues).toEqual([{ severity: "error", row: 4, column: "length", message: 'Row 4: length "abc" is not a valid length.' }]);
  });

  it("names unnamed parts by data row index", () => {
    const result = expectOk(importPartsCsv("length,width\n10,5\n\n20,5\n", { units: "in" }));
    expect(result.rows.map((row) => row.name)).toEqual(["Part 1", "Part 2"]);
  });

  it("warns about a row with more cells than the header", () => {
    const result = expectOk(importPartsCsv("name,length,width,quantity\nShelf,764,5,280,1\n", { units: "mm" }));
    expect(result.rows).toEqual([{ name: "Shelf", length: 764, width: 5, quantity: 280, material: "Material", grain: "length" }]);
    expect(result.issues).toEqual([
      { severity: "warning", row: 2, message: "Row 2: this row has more cells than the header. Check for an unquoted comma." },
    ]);
  });
});
