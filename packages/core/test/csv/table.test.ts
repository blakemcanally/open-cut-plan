import { describe, expect, it } from "vitest";
import { detectDelimiter, guessMapping, headerLengthUnit, normalizeHeader, readTable } from "../../src/index.ts";

describe("readTable", () => {
  it("handles an Excel export: BOM, CRLF, semicolons, and blank trailing rows", () => {
    const table = readTable("\uFEFFPart;Qty;L;W\r\nSide;2;1800;300\r\nShelf;3;764,5;280\r\n\r\n;;;\r\n");
    expect(table).toEqual({
      headers: ["Part", "Qty", "L", "W"],
      rows: [
        ["Side", "2", "1800", "300"],
        ["Shelf", "3", "764,5", "280"],
      ],
      delimiter: ";",
      hasHeader: true,
      rowNumbers: [2, 3],
      issues: [],
    });
  });

  it("numbers rows as a spreadsheet does, counting blank lines and quoted newlines", () => {
    const table = readTable('name,notes\nA,1\n\n"B","two\nlines"\n;\nC,3\n');
    expect(table.rows.map((row) => row[0])).toEqual(["A", "B", ";", "C"]);
    expect(table.rowNumbers).toEqual([2, 4, 5, 6]);
  });

  it("uses a leading sep= line as the delimiter and skips it", () => {
    const table = readTable("\uFEFFsep=;\r\nname;length\r\nSide,left;30,5\r\n");
    expect(table).toMatchObject({ delimiter: ";", headers: ["name", "length"], rows: [["Side,left", "30,5"]], rowNumbers: [2] });
    expect(readTable("sep=,\na;b,c\n1;2,3\n")).toMatchObject({ delimiter: ",", headers: ["a;b", "c"] });
  });

  it("reads a table without a header row", () => {
    const table = readTable("Side,30,12\nTop,24,12,1\n", { hasHeader: false });
    expect(table).toEqual({
      headers: ["Column 1", "Column 2", "Column 3", "Column 4"],
      rows: [
        ["Side", "30", "12", ""],
        ["Top", "24", "12", "1"],
      ],
      delimiter: ",",
      hasHeader: false,
      rowNumbers: [1, 2],
      issues: [],
    });
  });

  it("asks a predicate whether the first row is a header", () => {
    const seen: string[][] = [];
    const table = readTable("\n1;2\n3;4\n", {
      hasHeader: (row, delimiter) => {
        seen.push([...row, delimiter]);
        return false;
      },
    });
    expect(seen).toEqual([["1", "2", ";"]]);
    expect(table.rowNumbers).toEqual([2, 3]);
  });

  it("keeps delimiters, quotes, and newlines inside quoted cells", () => {
    const table = readTable('name,notes\n"Shelf, top","has ""pin""\nholes"\n');
    expect(table.rows).toEqual([["Shelf, top", 'has "pin"\nholes']]);
  });

  it("pads short rows to the header width", () => {
    expect(readTable("a,b,c\n1\n").rows).toEqual([["1", "", ""]]);
  });

  it("returns an empty table for empty text", () => {
    expect(readTable("")).toEqual({ headers: [], rows: [], delimiter: ",", hasHeader: true, rowNumbers: [], issues: [] });
  });

  it("keeps every row after a quote that is not closed, and warns", () => {
    const table = readTable('"Side,30\nTop,20\nBack,10', { hasHeader: false });
    expect(table.rows).toEqual([
      ['"Side', "30"],
      ["Top", "20"],
      ["Back", "10"],
    ]);
    expect(table.issues).toEqual([{ severity: "warning", row: 1, message: 'Row 1: a quote (") is not closed, so quotes from this row on are read as plain text.' }]);
  });

  it("keeps quoted cells before the row with the open quote", () => {
    const table = readTable('name,len\nA,1\n"x\ny",2\nB,"3\nC,4');
    expect(table.rows).toEqual([
      ["A", "1"],
      ["x\ny", "2"],
      ["B", '"3'],
      ["C", "4"],
    ]);
    expect(table.rowNumbers).toEqual([2, 3, 4, 5]);
    expect(table.issues.map((issue) => issue.row)).toEqual([4]);
  });
});

describe("detectDelimiter", () => {
  it.each([
    ["a,b,c\n1;2;3", ","],
    ["a;b;c\n1,5;2;3", ";"],
    ["a\tb\tc", "\t"],
    ["name", ","],
  ])("%j uses %j", (text, expected) => {
    expect(detectDelimiter(text)).toBe(expected);
  });
});

describe("headers", () => {
  it("normalizes headers", () => {
    expect(normalizeHeader(" Cutting Length (mm) ")).toBe("cuttinglength");
    expect(normalizeHeader("Qty.")).toBe("qty");
    expect(normalizeHeader("Part #")).toBe("partnumber");
  });

  it("reads units from headers", () => {
    expect(headerLengthUnit("Length (mm)")).toBe("mm");
    expect(headerLengthUnit("Length (CM)")).toBe("cm");
    expect(headerLengthUnit("Width [m]")).toBe("m");
    expect(headerLengthUnit('Width (")')).toBe("in");
    expect(headerLengthUnit("Width [inches]")).toBe("in");
    expect(headerLengthUnit("Width (inch)")).toBe("in");
    expect(headerLengthUnit("Length (ft)")).toBe("ft");
    expect(headerLengthUnit("Length [feet]")).toBe("ft");
    expect(headerLengthUnit("Length (')")).toBe("ft");
    expect(headerLengthUnit("Name (optional)")).toBeUndefined();
    expect(headerLengthUnit("Width")).toBeUndefined();
    expect(headerLengthUnit(undefined)).toBeUndefined();
  });

  it("maps each field to an unused column, trying its aliases in order", () => {
    const aliases = { name: ["name", "part"], length: ["length", "l"], width: ["width", "w"] };
    expect(guessMapping(["Part", "W", "L", "Name"], aliases)).toEqual({ name: 3, length: 2, width: 1 });
  });
});
