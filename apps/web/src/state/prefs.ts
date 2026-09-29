import type { Units } from "@opencutplan/core";
import { useCallback, useState } from "react";

export interface ViewPrefs {
  showCuts: boolean;
  showKerf: boolean;
  /** The snap grid for each unit system, in that unit. 0 turns the grid off. */
  grid: Readonly<Record<Units, number>>;
}

export const DEFAULT_PREFS: ViewPrefs = { showCuts: true, showKerf: false, grid: { in: 1, mm: 25 } };
const KEY = "opencutplan.view";

function gridSize(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function loadPrefs(storage: globalThis.Storage = localStorage): ViewPrefs {
  try {
    const saved = JSON.parse(storage.getItem(KEY) ?? "{}") as Partial<Record<keyof ViewPrefs, unknown>>;
    const grid = (typeof saved.grid === "object" && saved.grid !== null ? saved.grid : {}) as Partial<Record<Units, unknown>>;
    return {
      showCuts: typeof saved.showCuts === "boolean" ? saved.showCuts : DEFAULT_PREFS.showCuts,
      showKerf: typeof saved.showKerf === "boolean" ? saved.showKerf : DEFAULT_PREFS.showKerf,
      grid: { in: gridSize(grid.in, DEFAULT_PREFS.grid.in), mm: gridSize(grid.mm, DEFAULT_PREFS.grid.mm) },
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** View choices belong to this browser, not to the project file. */
export function usePrefs(): [ViewPrefs, (prefs: ViewPrefs) => void] {
  const [prefs, setPrefs] = useState(() => loadPrefs());
  const save = useCallback((next: ViewPrefs) => {
    setPrefs(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Private browsing can refuse storage; the choice still applies for this visit.
    }
  }, []);
  return [prefs, save];
}
