import { describe, expect, it } from "vitest";
import { importStockCsv, snapLength } from "../../src/index.ts";
import { expectOk } from "../helpers.ts";

describe("importStockCsv", () => {
  it("reads sheets and offcuts with prices, thickness, and unlimited quantities", () => {
    const csv = [
      "Material,Length,Width,Thickness,Qty,Price,Kind,Name",
      "Baltic birch 18mm,60,60,18mm,,$95.00,sheet,",
      "Baltic birch 18mm,30,22,18mm,1,,offcut,From the bench",
      'MDF 3/4,96,48,3/4,unlimited,"1,299.00",panel,',
    ].join("\n");
    const result = expectOk(importStockCsv(csv, { units: "in" }));
    expect(result.issues).toEqual([]);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toEqual({ material: "Baltic birch 18mm", length: 60, width: 60, thickness: snapLength(18 / 25.4, "in"), quantity: null, cost: 95, kind: "sheet" });
    expect(result.rows[1]).toEqual({
      material: "Baltic birch 18mm",
      length: 30,
      width: 22,
      thickness: snapLength(18 / 25.4, "in"),
      quantity: 1,
      kind: "offcut",
      name: "From the bench",
    });
    expect(result.rows[2]).toEqual({ material: "MDF 3/4", length: 96, width: 48, thickness: 0.75, quantity: null, cost: 1299, kind: "sheet" });
  });

  it.each(["Copies", "Anzahl", "Menge", "Stück", "Stk", "Number of", "No of"])("maps %j to quantity", (header) => {
    expect(expectOk(importStockCsv(`length,width,${header}\n96,48,3\n`, { units: "in" })).rows[0]!.quantity).toBe(3);
  });

  it("reads euro prices with decimal commas", () => {
    const [row] = expectOk(importStockCsv("material;length;width;cost\nMDF;2440;1220;42,50 €\n", { units: "mm" })).rows;
    expect(row).toEqual({ material: "MDF", length: 2440, width: 1220, quantity: null, cost: 42.5, kind: "sheet" });
  });

  it("reads dotted thousands in a semicolon file", () => {
    const csv = "material;length;width;quantity;cost\nMDF;2.440;1.220;1;1.299,00 €\n";
    const [row] = expectOk(importStockCsv(csv, { units: "mm" })).rows;
    expect(row).toEqual({ material: "MDF", length: 2440, width: 1220, quantity: 1, cost: 1299, kind: "sheet" });
  });

  it("rejects unreadable costs and accepts a leading currency code", () => {
    const csv = ["material,length,width,cost", "A,96,48,-5.00", "B,96,48,abc123", 'C,96,48,"EUR 42,50"'].join("\n");
    const result = expectOk(importStockCsv(csv, { units: "in" }));
    expect(result.rows).toEqual([
      { material: "A", length: 96, width: 48, quantity: null, kind: "sheet" },
      { material: "B", length: 96, width: 48, quantity: null, kind: "sheet" },
      { material: "C", length: 96, width: 48, quantity: null, cost: 42.5, kind: "sheet" },
    ]);
    expect(result.issues).toEqual([
      { severity: "warning", row: 2, column: "cost", message: 'Row 2: cost "-5.00" is not a number, so it is ignored.' },
      { severity: "warning", row: 3, column: "cost", message: 'Row 3: cost "abc123" is not a number, so it is ignored.' },
    ]);
  });

  it("reports bad rows and odd values", () => {
    const csv = ["material,length,width,quantity,cost,kind", "A,96,0,1,,", "B,96,48,0,,", "C,96,48,2,free,mystery"].join("\n");
    const result = expectOk(importStockCsv(csv, { units: "in" }));
    expect(result.rows).toEqual([{ material: "C", length: 96, width: 48, quantity: 2, kind: "sheet" }]);
    expect(result.issues).toEqual([
      { severity: "error", row: 2, column: "width", message: 'Row 2: width "0" is not a valid length.' },
      { severity: "error", row: 3, column: "quantity", message: 'Row 3: quantity "0" is not a whole number of 1 or more, or "unlimited".' },
      { severity: "warning", row: 4, column: "cost", message: 'Row 4: cost "free" is not a number, so it is ignored.' },
      { severity: "warning", row: 4, column: "kind", message: 'Row 4: kind "mystery" is not recognized, so "sheet" is used.' },
    ]);
  });

  it("asks for a mapping when length or width is missing", () => {
    const result = importStockCsv("material,size\nMDF,4x8\n", { units: "in" });
    expect(result.status).toBe("needs-mapping");
    expect(result.status === "needs-mapping" && result.missing).toEqual(["length", "width"]);
  });

  it("detects a file without a header row", () => {
    const csv = "MDF,96,48\nPine,48,24\n";
    const first = importStockCsv(csv, { units: "in" });
    expect(first.status).toBe("needs-mapping");
    expect(first.table.hasHeader).toBe(false);
    const second = expectOk(importStockCsv(csv, { units: "in", mapping: { material: 0, length: 1, width: 2 } }));
    expect(second.rows.map((row) => row.material)).toEqual(["MDF", "Pine"]);
  });

  it("reports spreadsheet rows and long rows", () => {
    const csv = "material,length,width\nA,96,48\n\nB,96,0\nC,96,48,1\n";
    expect(expectOk(importStockCsv(csv, { units: "in" })).issues).toEqual([
      { severity: "error", row: 4, column: "width", message: 'Row 4: width "0" is not a valid length.' },
      { severity: "warning", row: 5, message: "Row 5: this row has more cells than the header. Check for an unquoted comma." },
    ]);
  });
});
