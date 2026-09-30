import { describe, expect, it } from "vitest";
import { cli, example, withExamples } from "./helpers.ts";

const SHELF = "shelf.cutplan.json";
const BOOKCASE = "bookcase.cutplan.json";

describe("stock", () => {
  it("lists stock with the sheets used", async () => {
    const result = await cli(["stock", "list", SHELF, "--json"], withExamples());
    expect(result.json().stock[0]).toMatchObject({ id: "bb18-5x5", quantity: null, kind: "sheet", sheetsUsed: 5 });
    expect((await cli(["stock", "get", BOOKCASE, "mdf18-offcut", "--json"], withExamples())).json().stock).toMatchObject({ kind: "offcut", quantity: 1 });
  });

  it("adds stock with an id from the material and size", async () => {
    const result = await cli(["stock", "add", SHELF, "--material", "bb18", "--length", "8'", "--width", "4'", "--cost", "95.5", "--quantity", "3", "--factory-edges", "--json"], withExamples());
    expect(result.code).toBe(0);
    expect(result.json().stock).toEqual({ id: "baltic-birch-18mm-96x48", material: "bb18", length: 96, width: 48, quantity: 3, kind: "sheet", cost: 95.5, trim: 0 });
  });

  it("changes edges, quantity, and price, and removes fields", async () => {
    const io = withExamples();
    const trimmed = await cli(["stock", "set", SHELF, "bb18-5x5", "--trim", "1/2", "--quantity", "2", "--enabled", "false", "--json"], io);
    expect(trimmed.json().stock).toMatchObject({ trim: 0.5, quantity: 2, enabled: false });
    const reset = await cli(["stock", "set", SHELF, "bb18-5x5", "--trim", "project", "--quantity", "unlimited", "--unset", "enabled", "--json"], io);
    expect(reset.json().stock).toEqual({ id: "bb18-5x5", material: "bb18", length: 60, width: 60, quantity: null, kind: "sheet" });
    const bad = await cli(["stock", "set", SHELF, "bb18-5x5", "--unset", "material"], io);
    expect(bad.code).toBe(2);
  });

  it("removes stock and the sheets cut from it", async () => {
    const result = await cli(["stock", "remove", SHELF, "bb6-5x5", "--json"], withExamples());
    expect(result.json().removedSheets).toHaveLength(2);
    expect(result.json().changes.plan).toMatchObject({ sheetsBefore: 7, sheetsAfter: 5 });
  });

  it("imports and exports stock CSV", async () => {
    const io = withExamples({ "stock.csv": example("csv/simple-bookcase-mm-stock.csv") });
    await cli(["new", "p.json", "--name", "P", "--units", "mm"], io);
    const imported = await cli(["stock", "import", "p.json", "stock.csv", "--json"], io);
    expect(imported.json()).toMatchObject({ imported: 3, ids: ["mdf-18mm-2440x1220", "mdf-18mm-900x400", "hardboard-3mm-2440x1220"] });
    const exported = await cli(["stock", "export", "p.json"], io);
    expect(exported.stdout).toBe(io.files.get("stock.csv"));
  });

  it("saves the offcuts once", async () => {
    const io = withExamples();
    const first = await cli(["stock", "save-offcuts", SHELF, "--json"], io);
    expect(first.json().added.length).toBeGreaterThan(0);
    expect(first.json().added[0]).toMatchObject({ kind: "offcut", quantity: 1, cost: 0, trim: 0 });
    const again = await cli(["stock", "save-offcuts", SHELF, "--json"], io);
    expect(again.json()).toMatchObject({ added: [], changes: { changed: false }, written: null });
  });
});

describe("tools", () => {
  it("lists tools in order with their position", async () => {
    const result = await cli(["tools", "list", BOOKCASE, "--json"], withExamples());
    expect(result.json().tools.map((t: { id: string; position: number }) => [t.id, t.position])).toEqual([
      ["track-saw", 1],
      ["table-saw", 2],
    ]);
  });

  it("adds a tool with default kerf and limits for its type", async () => {
    const io = withExamples();
    const result = await cli(["tools", "add", SHELF, "--type", "panel-saw", "--max-cut", "62", "--max-stages", "3", "--position", "1", "--json"], io);
    expect(result.json()).toMatchObject({ tool: { id: "panel-saw", name: "Panel saw", type: "panel-saw", kerf: 0.125, enabled: true, maxCut: 62, maxStages: 3 }, position: 1 });
    expect(result.json().changes.tools).toMatchObject({ added: ["panel-saw"], reordered: false });
    const wrong = await cli(["tools", "add", SHELF, "--type", "track-saw", "--max-rip", "24", "--json"], io);
    expect(wrong.code).toBe(2);
    expect(wrong.json().error.code).toBe("invalid-option");
    const track = await cli(["tools", "add", SHELF, "--type", "track-saw", "--json"], io);
    expect(track.json().tool).toEqual({ id: "track-saw", name: "Track saw", type: "track-saw", kerf: 0.125, enabled: true, maxCut: 110 });
    const table = await cli(["tools", "add", SHELF, "--type", "table-saw", "--name", "Jobsite saw", "--max-rip", "20", "--json"], io);
    expect(table.json().tool).toMatchObject({ id: "jobsite-saw", maxRip: 20, maxCrosscut: 24, maxPiece: { length: 96, width: 24 } });
  });

  it("sets and removes table saw limits", async () => {
    const io = withExamples();
    const set = await cli(["tools", "set", SHELF, "table-saw", "--max-rip", "24", "--max-piece-length", "48", "--max-piece-width", "30", "--kerf", "3/32", "--json"], io);
    expect(set.json().tool).toMatchObject({ kerf: 0.09375, maxRip: 24, maxPiece: { length: 48, width: 30 } });
    const unset = await cli(["tools", "set", SHELF, "table-saw", "--unset", "max-piece-length", "--unset", "max-rip", "--json"], io);
    expect(unset.json().tool).not.toHaveProperty("maxPiece");
    expect(unset.json().tool).not.toHaveProperty("maxRip");
  });

  it("moves and removes tools", async () => {
    const io = withExamples();
    const moved = await cli(["tools", "move", BOOKCASE, "table-saw", "--position", "1", "--json"], io);
    expect(moved.json()).toMatchObject({ order: ["table-saw", "track-saw"], changes: { tools: { reordered: true } } });
    const removed = await cli(["tools", "remove", BOOKCASE, "table-saw", "track-saw", "--json"], io);
    expect(removed.json().removed).toEqual(["table-saw", "track-saw"]);
    const none = await cli(["tools", "move", BOOKCASE, "x", "--position", "1"], io);
    expect(none.code).toBe(2);
  });
});
