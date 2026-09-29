import { describe, expect, it } from "vitest";
import { createHistory, HISTORY_LIMIT, MERGE_MS, record, redo, undo } from "../src/state/history.ts";
import { DEFAULT_PREFS, loadPrefs } from "../src/state/prefs.ts";

describe("history", () => {
  it("undoes and redoes edits in order", () => {
    let h = createHistory("a");
    h = record(h, "b");
    h = record(h, "c");
    h = undo(h);
    expect(h.present).toBe("b");
    h = undo(h);
    expect(h.present).toBe("a");
    expect(undo(h)).toBe(h);
    h = redo(redo(h));
    expect(h.present).toBe("c");
    expect(redo(h)).toBe(h);
  });

  it("drops the redo list after a new edit", () => {
    let h = record(record(createHistory(1), 2), 3);
    h = record(undo(h), 4);
    expect(h.future).toEqual([]);
    expect(undo(h).present).toBe(2);
  });

  it("ignores an edit that changes nothing", () => {
    const h = createHistory({ n: 1 });
    expect(record(h, h.present)).toBe(h);
  });

  it("merges quick edits with the same key into one step", () => {
    let h = createHistory(0);
    h = record(h, 1, "nudge", 1000);
    h = record(h, 2, "nudge", 1000 + MERGE_MS);
    h = record(h, 3, "nudge", 1000 + 3 * MERGE_MS);
    expect(h.past).toEqual([0, 2]);
    h = record(h, 4, "other", 1000 + 3 * MERGE_MS);
    expect(h.past).toEqual([0, 2, 3]);
    expect(undo(h).present).toBe(3);
  });

  it("does not merge across an undo", () => {
    let h = record(createHistory(0), 1, "k", 0);
    h = undo(h);
    h = record(h, 2, "k", 10);
    expect(h.past).toEqual([0]);
  });

  it(`keeps at most ${HISTORY_LIMIT} undo steps`, () => {
    let h = createHistory(0);
    for (let n = 1; n <= HISTORY_LIMIT + 20; n++) h = record(h, n);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toBe(20);
    for (let n = 0; n < HISTORY_LIMIT; n++) h = undo(h);
    expect(h.present).toBe(20);
    expect(undo(h)).toBe(h);
  });
});

describe("view prefs", () => {
  it("loads saved choices and falls back to the defaults for bad or missing values", () => {
    localStorage.setItem("opencutplan.view", JSON.stringify({ showCuts: false, showKerf: "yes", grid: { in: 0.5, mm: -1 } }));
    expect(loadPrefs()).toEqual({ showCuts: false, showKerf: DEFAULT_PREFS.showKerf, grid: { in: 0.5, mm: 25 } });
    localStorage.setItem("opencutplan.view", "{not json");
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
    localStorage.clear();
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });
});
