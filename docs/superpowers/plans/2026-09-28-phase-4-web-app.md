# OpenCutPlan Phase 4 — Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `apps/web`, a React + Vite single-page app on top of `@opencutplan/core`: the home screen and saved projects, the Parts, Stock, Tools, and Layout tabs, the settings drawer with the feature switches, the layout editor with drag, keyboard editing, and the optimizer in a Web Worker, autosave to IndexedDB, `.cutplan.json` open and save, and undo/redo.

**Architecture:** The app holds one `Project` document in a history (`src/state`); every edit is a pure function `Project → Project` (`src/edit`), and everything shown about a plan comes from core's `analyzeProject`. Storage (`src/storage`) wraps IndexedDB and the File System Access API. The optimizer runs core's `createOptimizerHost` in a module Web Worker (`src/optimizer`); a result is applied only when the project did not change during the run. Screens (`src/screens`, `src/layout`) are plain React function components with accessible names, so the tests drive them the way a keyboard or screen-reader user would.

**Tech Stack:** Node ≥ 24, TypeScript 7.0.2, React 19.3.0, Vite 8.3.1 with `@vitejs/plugin-react` 6.1.1, Vitest 5.0.2 with jsdom 30.1.1, Testing Library (`@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2, `@testing-library/user-event` 14.6.7), fake-indexeddb 6.2.5.

**Spec:** `docs/superpowers/specs/2026-09-27-opencutplan-design.md` (§3 architecture, workers, persistence; §7 web app; §8 feature switches; §10 error handling; §11 web tests; §12 phase 4).

## Global Constraints

- Dependencies are exactly the ones in `apps/web/package.json` (Task 1), pinned to exact versions. Add no others.
- ESM only. Relative imports use the `.ts` / `.tsx` extension. Only erasable TypeScript syntax (no `enum`, `namespace`, parameter properties). `apps/web/tsconfig.json` extends `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`).
- The web app imports core only from the package root: `import … from "@opencutplan/core"`. Never a deep path into `packages/core/src`. `packages/core` does not change in this phase.
- Single source of truth (spec §3): the app state is one `Project`. Every edit returns a new `Project` and never mutates its input. Issues, cut lines, and the sequence come from `analyzeProject(project)` and are never stored in state.
- The optimizer runs in a Web Worker (spec §3). The UI never runs a full search on the main thread.
- Undo/redo keeps 100 steps (spec §7.2).
- Accessibility (spec §7.4): every action works from the keyboard; controls have accessible names; colour is never the only signal (red parts also get ⚠ and "has a problem" in their name; cross-grain parts get ⟂).
- Validation issues never block editing (spec §10). Storage failures show a banner that stays open (spec §10).
- UI text is plain English, short sentences, one idea each. Copy the strings in this plan exactly; the tests match them.
- Comments: default to none. Only a comment that carries information the code cannot (an API contract or a non-obvious rule).
- Commit after every task. Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- The repo stays local. Do not add a git remote or push (Block policy; spec §13).

## Review Focus

1. **The project changes while the optimizer runs** (an edit, an undo, a rename): the result is not applied, and a notice says so; "Keep searching" is offered only while the layout is still the search's result. Pinned in Task 7 (`does not use a result when the project changed during the search`, `offers Keep searching only while the layout is the one the search produced`).
2. **Text a length field cannot read** (`abc`, `12 3/`): the field keeps the text, marks it `aria-invalid`, never commits `NaN`, and restores the last good value on blur. Pinned in Task 4 (`fields.test.tsx`).
3. **The browser cannot store data** (no IndexedDB, private mode, quota): the app still opens, and a banner stays open and names Save file. Pinned in Task 3 (`fails every save when the browser has no storage`) and Task 8 (`keeps a banner open when the browser cannot save the project`).
4. **Unit conversion noise**: inches → mm → inches gives exactly 30 and 12, not 29.999999999999996. Pinned in Task 2 (`converts every length and keeps costs`).
5. **A search stopped at once**: Stop always applies a plan that accounts for every part (core now guarantees a candidate per material). Pinned in Task 7 (`stops a search and uses the best plan so far`).

## Decisions

These choices go beyond the spec's text. Task 9 records the user-visible ones in the spec and in `docs/web-app.md`.

- The **Shop** and **Reports** tabs come in phase 5 with their content (print, shop view, labels, export). This phase has Parts, Stock, Tools, and Layout.
- **Optimize** keeps pinned sheets and plans everything else. **Optimize the rest** pins every sheet only for the run and puts the sheets back as they were, so only tray copies are planned. **Keep searching** passes the last result as `start`, and is offered only while the project is the one that result produced.
- **Stop** applies the best plan so far. A result is not applied when the project changed during the run.
- **Save file** writes `withCuts(project)`, so other tools can read the cut sequence (spec §4.4).
- A new project has one table saw with the default kerf (1/8" or 3 mm), so a plan can be cut at once.
- Deleting stock also removes the plan sheets cut from it; a material that parts or stock use cannot be deleted.
- Changing units converts every length, rounds to 1e-6, and drops the stored cut list.
- Tool profiles store their units, and using one converts its lengths to the project's units.
- The view choices (show cut lines, draw cut lines at kerf width) are kept per browser in `localStorage` (`opencutplan.view`), not in the project file.
- When IndexedDB cannot open, the app runs with `unavailableStorage(reason)`: nothing is saved, and the autosave banner shows.
- Arrow-key moves of one part less than one second apart merge into one undo step.

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/package.json`, `tsconfig.json`, `vite.config.ts`, `index.html` | The workspace package, compiler options, Vite and Vitest config, the page |
| `src/state/history.ts` | Undo/redo history with a 100-step limit and keyed merging |
| `src/state/useProject.ts` | `ProjectStore`: the project, `edit`, `undo`, `redo` |
| `src/state/prefs.ts` | Per-browser view choices |
| `src/state/useAutosave.ts` | Debounced save to storage; returns the last error |
| `src/edit/*.ts` | Pure project edits: parts, stock and materials, tools, units, layout |
| `src/storage/db.ts` | IndexedDB projects and tool profiles; `unavailableStorage` |
| `src/storage/files.ts` | Open and save `.cutplan.json` (File System Access API or download) |
| `src/components/fields.tsx` | Draft inputs for text, lengths, and numbers |
| `src/components/Dialog.tsx` | Modal dialog and drawer with Escape and focus return |
| `src/components/CsvImportDialog.tsx` | Paste or load CSV, map columns, import rows |
| `src/optimizer/*.ts` | The worker entry, the worker hook, run requests, and the run hook |
| `src/screens/*.tsx` | Home, Workspace, Parts, Stock, Tools, Settings |
| `src/layout/*.tsx` | Sheet drawing, tray, inspector, issue list, snapping, the Layout tab |
| `src/App.tsx`, `src/main.tsx`, `src/examples.ts`, `src/styles.css` | Routing, start-up, bundled examples, styles |
| `apps/web/test/*` | Setup, helpers, and component tests |

Tests use Vitest with jsdom. `test/setup.ts` loads fake-indexeddb, and after each test it unmounts, clears `localStorage`, and gives `indexedDB` a new empty database. `test/helpers.ts` has `sampleProject()` and, from Task 5, `inProcessWorkers()`, which runs the real core worker host in the test thread.

Run one task's tests with `npx vitest run --root apps/web <test files>`, and everything with `npm run check` from the repo root.

### Task 1: Web app scaffold, edit history, and view prefs

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/src/state/history.ts`
- Create: `apps/web/src/state/useProject.ts`
- Create: `apps/web/src/state/prefs.ts`
- Modify: `package.json`
- Modify: package-lock.json (by `npm install`)
- Test: `apps/web/test/setup.ts`
- Test: `apps/web/test/history.test.ts`

**Interfaces:**
- Consumes: `@opencutplan/core`: `Project`. Nothing from earlier tasks.
- Produces:
  - `src/state/history.ts`: `const HISTORY_LIMIT = 100;`; `const MERGE_MS = 1000;`; `interface History<T>`; `function createHistory<T>(present: T): History<T>`; `function record<T>(history: History<T>, next: T, key?: string, at: number = Date.now()): History<T>`; `function undo<T>(history: History<T>): History<T>`; `function redo<T>(history: History<T>): History<T>`
  - `src/state/useProject.ts`: `type ProjectEdit = Project | ((project: Project) => Project);`; `interface ProjectStore`; `function useProject(initial: Project): ProjectStore`
  - `src/state/prefs.ts`: `interface ViewPrefs`; `const DEFAULT_PREFS: ViewPrefs = { showCuts: true, showKerf: false };`; `function loadPrefs(storage: globalThis.Storage = localStorage): ViewPrefs`; `function usePrefs(): [ViewPrefs, (prefs: ViewPrefs) => void]`

- [ ] **Step 1: Add the web workspace and its package manifest**

Replace the root `package.json` with:

```json
{
  "name": "opencutplan",
  "private": true,
  "type": "module",
  "workspaces": [
    "packages/*",
    "apps/*"
  ],
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "typecheck": "tsc -p packages/core && tsc -p examples && tsc -p apps/web",
    "test": "npm test -w @opencutplan/core && npm test -w @opencutplan/web",
    "schema": "node packages/core/scripts/write-schema.ts",
    "examples": "node examples/build.ts",
    "check": "npm run typecheck && npm test"
  },
  "devDependencies": {
    "@types/node": "26.6.3",
    "typescript": "7.0.2"
  }
}
```

Create `apps/web/package.json`:

```json
{
  "name": "@opencutplan/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@opencutplan/core": "0.1.0",
    "react": "19.3.0",
    "react-dom": "19.3.0"
  },
  "devDependencies": {
    "@testing-library/dom": "10.4.2",
    "@testing-library/react": "16.3.3",
    "@testing-library/user-event": "14.6.7",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "6.1.1",
    "fake-indexeddb": "6.2.5",
    "jsdom": "30.1.1",
    "vite": "8.3.1",
    "vitest": "5.0.2"
  }
}
```

Create `apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["es2023", "dom", "dom.iterable"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src", "test", "vite.config.ts"]
}
```

Create `apps/web/vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  plugins: [react()],
  worker: { format: "es" },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
  },
});
```

Create `apps/web/test/setup.ts`:

```ts
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  localStorage.clear();
  globalThis.indexedDB = new IDBFactory();
});
```

Run `npm install` from the repo root. Expected: it installs the pinned packages and updates `package-lock.json`, with no errors.

- [ ] **Step 2: Write the failing tests**

Create `apps/web/test/history.test.ts`:

```ts
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
    localStorage.setItem("opencutplan.view", JSON.stringify({ showCuts: false, showKerf: "yes" }));
    expect(loadPrefs()).toEqual({ showCuts: false, showKerf: DEFAULT_PREFS.showKerf });
    localStorage.setItem("opencutplan.view", "{not json");
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
    localStorage.clear();
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run --root apps/web test/history.test.ts`

Expected: FAIL — the modules under test do not exist yet (`Failed to resolve import` / `Cannot find module`).

- [ ] **Step 4: Write the code**

Create `apps/web/src/state/history.ts`:

```ts
export const HISTORY_LIMIT = 100;
export const MERGE_MS = 1000;

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** The key and time of the last recorded edit; edits with the same key within `MERGE_MS` become one undo step. */
  last: { key: string; at: number } | null;
}

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], last: null };
}

export function record<T>(history: History<T>, next: T, key?: string, at: number = Date.now()): History<T> {
  if (Object.is(next, history.present)) return history;
  const last = key === undefined ? null : { key, at };
  if (key !== undefined && history.last?.key === key && at - history.last.at <= MERGE_MS) {
    return { ...history, present: next, future: [], last };
  }
  return { past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: next, future: [], last };
}

export function undo<T>(history: History<T>): History<T> {
  if (history.past.length === 0) return history;
  return {
    past: history.past.slice(0, -1),
    present: history.past[history.past.length - 1]!,
    future: [history.present, ...history.future],
    last: null,
  };
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...future] = history.future;
  if (next === undefined) return history;
  return { past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: next, future, last: null };
}
```

Create `apps/web/src/state/useProject.ts`:

```ts
import type { Project } from "@opencutplan/core";
import { useCallback, useMemo, useReducer } from "react";
import { createHistory, record, redo, undo, type History } from "./history.ts";

export type ProjectEdit = Project | ((project: Project) => Project);

type Action =
  | { type: "edit"; edit: ProjectEdit; key: string | undefined; at: number }
  | { type: "undo" }
  | { type: "redo" };

function reducer(history: History<Project>, action: Action): History<Project> {
  switch (action.type) {
    case "edit": {
      const next = typeof action.edit === "function" ? action.edit(history.present) : action.edit;
      return record(history, next, action.key, action.at);
    }
    case "undo":
      return undo(history);
    case "redo":
      return redo(history);
  }
}

export interface ProjectStore {
  project: Project;
  /** Records one undo step; edits with the same `key` in quick succession merge into one step. */
  edit(edit: ProjectEdit, key?: string): void;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useProject(initial: Project): ProjectStore {
  const [history, dispatch] = useReducer(reducer, initial, createHistory);
  const edit = useCallback((edit: ProjectEdit, key?: string) => dispatch({ type: "edit", edit, key, at: Date.now() }), []);
  const undoEdit = useCallback(() => dispatch({ type: "undo" }), []);
  const redoEdit = useCallback(() => dispatch({ type: "redo" }), []);
  return useMemo(
    () => ({
      project: history.present,
      edit,
      undo: undoEdit,
      redo: redoEdit,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
    }),
    [history, edit, undoEdit, redoEdit],
  );
}
```

Create `apps/web/src/state/prefs.ts`:

```ts
import { useCallback, useState } from "react";

export interface ViewPrefs {
  showCuts: boolean;
  showKerf: boolean;
}

export const DEFAULT_PREFS: ViewPrefs = { showCuts: true, showKerf: false };
const KEY = "opencutplan.view";

export function loadPrefs(storage: globalThis.Storage = localStorage): ViewPrefs {
  try {
    const saved = JSON.parse(storage.getItem(KEY) ?? "{}") as Partial<ViewPrefs>;
    return {
      showCuts: typeof saved.showCuts === "boolean" ? saved.showCuts : DEFAULT_PREFS.showCuts,
      showKerf: typeof saved.showKerf === "boolean" ? saved.showKerf : DEFAULT_PREFS.showKerf,
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
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run --root apps/web test/history.test.ts`

Expected: PASS — 7 tests.

- [ ] **Step 6: Run the full check**

Run: `npm run check` from the repo root.

Expected: the typecheck is clean (core, examples, and `apps/web`); core has 351 tests and the web app has 7 tests, all passing.

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/src/state/history.ts apps/web/src/state/prefs.ts apps/web/src/state/useProject.ts apps/web/test/history.test.ts apps/web/test/setup.ts apps/web/tsconfig.json apps/web/vite.config.ts package-lock.json package.json
git commit -m "feat(web): add the web app scaffold, edit history, and view prefs" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Project edits

**Files:**
- Create: `apps/web/src/edit/patch.ts`
- Create: `apps/web/src/edit/parts.ts`
- Create: `apps/web/src/edit/stock.ts`
- Create: `apps/web/src/edit/tools.ts`
- Create: `apps/web/src/edit/units.ts`
- Create: `apps/web/src/edit/layout.ts`
- Test: `apps/web/test/helpers.ts`
- Test: `apps/web/test/edit.test.ts`

**Interfaces:**
- Consumes: `@opencutplan/core`: `analyzeProject`, `contains`, `convertLength`, `createProject`, `EPSILON`, `gapAlong`, `Material`, `Part`, `placedRect`, `Placement`, `planContext`, `PlanContext`, `PlanSheet`, `Project`, `Rect`, `Size`, `slugify`, `Stock`, `Tool`, `ToolType`, `uniqueId`, `Units`, `usableRect`, `validatePlan`. Nothing from earlier tasks.
- Produces:
  - `src/edit/patch.ts`: `type Patch<T> = { [K in keyof T]?: T[K] | undefined };`; `function applyPatch<T extends object>(item: T, patch: Patch<T>): T`; `function idsOf(items: readonly { id: string }[]): Set<string>`
  - `src/edit/parts.ts`: `const NEW_PART_SIZE: Readonly<Record<Units, Size>> = { in: { length: 24, width: 12 }, mm: { length: 600, width: 300 } };`; `const DEFAULT_THICKNESS: Readonly<Record<Units, number>> = { in: 0.75, mm: 18 };`; `function ensureMaterial(project: Project): { project: Project; material: string }`; `function addPart(project: Project): { project: Project; id: string }`; `function updatePart(project: Project, id: string, patch: Patch<Part>): Project`; `function removePart(project: Project, id: string): Project`; `function withoutPlacements(project: Project, drop: (placement: { part: string; copy: number }) => boolean): Project`
  - `src/edit/stock.ts`: `const NEW_SHEET_SIZE: Readonly<Record<Units, Size>> = { in: { length: 96, width: 48 }, mm: { length: 2440, width: 1220 } };`; `function addMaterial(project: Project): Project`; `function updateMaterial(project: Project, id: string, patch: Patch<Material>): Project`; `function materialInUse(project: Project, id: string): boolean`; `function removeMaterial(project: Project, id: string): Project`; `function addStock(project: Project): Project`; `function updateStock(project: Project, id: string, patch: Patch<Stock>): Project`; `function removeStock(project: Project, id: string): Project`
  - `src/edit/tools.ts`: `const TOOL_TYPES: readonly ToolType[] = ["table-saw", "track-saw", "circular-saw", "panel-saw"];`; `const TOOL_TYPE_NAMES: Readonly<Record<ToolType, string>> =`; `const DEFAULT_KERF: Readonly<Record<Units, number>> = { in: 0.125, mm: 3 };`; `function newTool(type: ToolType, units: Units, taken: ReadonlySet<string>): Tool`; `function addTool(project: Project, type: ToolType): Project`; `function updateTool(project: Project, id: string, change: (tool: Tool) => Tool): Project`; `function removeTool(project: Project, id: string): Project`; `function moveTool(project: Project, id: string, delta: -1 | 1): Project`
  - `src/edit/units.ts`: `function convertTool(tool: Tool, from: Units, to: Units): Tool`; `function convertProjectUnits(project: Project, units: Units): Project`
  - `src/edit/layout.ts`: `interface CopyRef`; `interface Located`; `function orientedSize(part: Part, rotated: boolean): Size`; `function sameCopy(a: CopyRef | null, b: CopyRef | null): boolean`; `function findCopy(project: Project, ref: CopyRef): Located | null`; `function unplacedCopies(project: Project): CopyRef[]`; `function moveToTray(project: Project, ref: CopyRef): Project`; `function placeCopy(project: Project, ref: CopyRef, sheetId: string, x: number, y: number, rotated: boolean): Project`; `function rotateCopy(project: Project, ref: CopyRef): Project`; `function nudgeCopy(project: Project, ref: CopyRef, dx: number, dy: number): Project`; `function moveCopyTo(project: Project, ref: CopyRef, x: number, y: number): Project`; `function addSheet(project: Project, stock: string): { project: Project; id: string }`; `function removeSheet(project: Project, sheetId: string): Project`; `function removeEmptySheets(project: Project): Project`; `function setPinned(project: Project, sheetId: string, pinned: boolean): Project`; `function clearsKerf(a: Rect, b: Rect, kerf: number): boolean`; `function sheetRects(ctx: PlanContext, sheet: PlanSheet, except?: CopyRef): Rect[]`; `function findFreeSpot(ctx: PlanContext, sheet: PlanSheet, size: Size, except?: CopyRef): { x: number; y: number } | null`
  - `test/helpers.ts`: `function sampleProject(): Project`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/helpers.ts`:

```ts
import { createProject, type Project } from "@opencutplan/core";

/** An inch project: plywood (grained), an unlimited 96 × 48 sheet, two 30 × 12 sides and a 20 × 10 shelf, a table saw, and one sheet that holds both sides. */
export function sampleProject(): Project {
  const base = createProject("Test", "in");
  return {
    ...base,
    materials: [{ id: "ply", name: "Plywood", thickness: 0.75, grained: true }],
    stock: [{ id: "ply-4x8", material: "ply", length: 96, width: 48, quantity: null, cost: 60, kind: "sheet" }],
    parts: [
      { id: "side", name: "Side", material: "ply", length: 30, width: 12, quantity: 2, grain: "length" },
      { id: "shelf", name: "Shelf", material: "ply", length: 20, width: 10, quantity: 1, grain: "none", group: "A" },
    ],
    tools: [{ id: "ts", name: "Table saw", type: "table-saw", kerf: 0.125, enabled: true }],
    plan: {
      sheets: [
        {
          id: "s1",
          stock: "ply-4x8",
          placements: [
            { part: "side", copy: 0, x: 0.25, y: 0.25, rotated: false },
            { part: "side", copy: 1, x: 0.25, y: 12.375, rotated: false },
          ],
        },
      ],
    },
  };
}
```

Create `apps/web/test/edit.test.ts`:

```ts
import { analyzeProject, createProject, planContext, validatePlan } from "@opencutplan/core";
import { describe, expect, it } from "vitest";
import {
  addSheet,
  findCopy,
  findFreeSpot,
  moveToTray,
  nudgeCopy,
  placeCopy,
  removeEmptySheets,
  removeSheet,
  rotateCopy,
  setPinned,
  unplacedCopies,
} from "../src/edit/layout.ts";
import { addPart, removePart, updatePart } from "../src/edit/parts.ts";
import { addStock, materialInUse, removeMaterial, removeStock, updateStock } from "../src/edit/stock.ts";
import { addTool, moveTool } from "../src/edit/tools.ts";
import { convertProjectUnits } from "../src/edit/units.ts";
import { sampleProject } from "./helpers.ts";

describe("part edits", () => {
  it("adds a part, and a material when the project has none", () => {
    const { project, id } = addPart(createProject("New", "mm"));
    expect(project.materials).toEqual([{ id: "plywood", name: "Plywood", thickness: 18, grained: true }]);
    expect(project.parts).toEqual([{ id, name: "Part 1", material: "plywood", length: 600, width: 300, quantity: 1, grain: "length" }]);
  });

  it("gives each new part a new id", () => {
    const first = addPart(sampleProject());
    const second = addPart(first.project);
    expect(first.id).not.toBe(second.id);
  });

  it("removes placements of copies past a lower quantity", () => {
    const project = updatePart(sampleProject(), "side", { quantity: 1 });
    expect(project.plan!.sheets[0]!.placements.map((p) => p.copy)).toEqual([0]);
    expect(validatePlan(project).filter((i) => i.code === "bad-copy")).toEqual([]);
  });

  it("clears an optional field with undefined", () => {
    const project = updatePart(sampleProject(), "shelf", { group: undefined });
    expect(project.parts[1]).not.toHaveProperty("group");
  });

  it("removes a part with its placements", () => {
    const project = removePart(sampleProject(), "side");
    expect(project.parts.map((p) => p.id)).toEqual(["shelf"]);
    expect(project.plan!.sheets[0]!.placements).toEqual([]);
  });
});

describe("stock and material edits", () => {
  it("keeps a material that parts or stock use", () => {
    const project = sampleProject();
    expect(materialInUse(project, "ply")).toBe(true);
    expect(removeMaterial(project, "ply")).toBe(project);
  });

  it("adds an unlimited sheet of the first material", () => {
    const project = addStock(sampleProject());
    expect(project.stock[1]).toMatchObject({ material: "ply", length: 96, width: 48, quantity: null, kind: "sheet" });
  });

  it("removes stock and the sheets cut from it", () => {
    const project = removeStock(sampleProject(), "ply-4x8");
    expect(project.stock).toEqual([]);
    expect(project.plan!.sheets).toEqual([]);
  });

  it("sets a quantity to unlimited and back", () => {
    const limited = updateStock(sampleProject(), "ply-4x8", { quantity: 3 });
    expect(limited.stock[0]!.quantity).toBe(3);
    expect(updateStock(limited, "ply-4x8", { quantity: null }).stock[0]!.quantity).toBeNull();
  });
});

describe("tool edits", () => {
  it("adds tools with the unit's default kerf and reorders them", () => {
    let project = addTool(sampleProject(), "track-saw");
    expect(project.tools[1]).toEqual({ id: "track-saw", name: "Track saw", type: "track-saw", kerf: 0.125, enabled: true });
    project = moveTool(project, "track-saw", -1);
    expect(project.tools.map((t) => t.id)).toEqual(["track-saw", "ts"]);
    expect(moveTool(project, "track-saw", -1)).toBe(project);
  });
});

describe("layout edits", () => {
  const side0 = { part: "side", copy: 0 };
  const shelf = { part: "shelf", copy: 0 };

  it("lists unplaced copies in part order", () => {
    expect(unplacedCopies(sampleProject())).toEqual([shelf]);
    expect(unplacedCopies(moveToTray(sampleProject(), side0))).toEqual([side0, shelf]);
  });

  it("places a tray copy on a sheet and moves it between sheets", () => {
    const { project: withSheet, id } = addSheet(sampleProject(), "ply-4x8");
    expect(id).toBe("s2");
    let project = placeCopy(withSheet, shelf, "s1", 30.5, 0.25, false);
    expect(findCopy(project, shelf)).toMatchObject({ sheetIndex: 0, placement: { x: 30.5, y: 0.25, rotated: false } });
    project = placeCopy(project, shelf, "s2", 0.25, 0.25, true);
    expect(findCopy(project, shelf)).toMatchObject({ sheetIndex: 1, placement: { rotated: true } });
    expect(project.plan!.sheets[0]!.placements).toHaveLength(2);
  });

  it("rotates and nudges a placed copy", () => {
    let project = rotateCopy(sampleProject(), side0);
    expect(findCopy(project, side0)!.placement.rotated).toBe(true);
    project = nudgeCopy(project, side0, 1, -0.25);
    expect(findCopy(project, side0)!.placement).toMatchObject({ x: 1.25, y: 0 });
  });

  it("leaves the project alone when the copy is not placed", () => {
    const project = sampleProject();
    expect(rotateCopy(project, shelf)).toBe(project);
    expect(moveToTray(project, shelf)).toBe(project);
  });

  it("removes sheets, empty sheets, and pins", () => {
    const { project: withSheet } = addSheet(sampleProject(), "ply-4x8");
    expect(removeEmptySheets(withSheet).plan!.sheets.map((s) => s.id)).toEqual(["s1"]);
    expect(unplacedCopies(removeSheet(withSheet, "s1"))).toHaveLength(3);
    const pinned = setPinned(withSheet, "s1", true);
    expect(pinned.plan!.sheets[0]!.pinned).toBe(true);
    expect(setPinned(pinned, "s1", false).plan!.sheets[0]).not.toHaveProperty("pinned");
  });

  it("finds a free spot one kerf from the other parts", () => {
    const project = sampleProject();
    const ctx = planContext(project);
    const sheet = project.plan!.sheets[0]!;
    const spot = findFreeSpot(ctx, sheet, { length: 20, width: 10 });
    expect(spot).toEqual({ x: 0.25, y: 24.5 });
    const placed = placeCopy(project, shelf, "s1", spot!.x, spot!.y, false);
    expect(analyzeProject(placed).issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(findFreeSpot(ctx, sheet, { length: 100, width: 10 })).toBeNull();
  });
});

describe("convertProjectUnits", () => {
  it("converts every length and keeps costs", () => {
    const mm = convertProjectUnits(sampleProject(), "mm");
    expect(mm.project.units).toBe("mm");
    expect(mm.parts[0]).toMatchObject({ length: 762, width: 304.8 });
    expect(mm.stock[0]).toMatchObject({ length: 2438.4, width: 1219.2, cost: 60 });
    expect(mm.materials[0]!.thickness).toBeCloseTo(19.05);
    expect(mm.tools[0]!.kerf).toBeCloseTo(3.175);
    expect(mm.settings.trim).toBeCloseTo(6.35);
    expect(mm.plan!.sheets[0]!.placements[1]).toMatchObject({ x: 6.35 });
    const back = convertProjectUnits(mm, "in");
    expect(back.parts[0]).toMatchObject({ length: 30, width: 12 });
    expect(back.tools[0]!.kerf).toBe(0.125);
  });

  it("converts tool limits", () => {
    const project = { ...sampleProject(), tools: [{ id: "ts", name: "TS", type: "table-saw" as const, kerf: 0.125, enabled: true, maxRip: 30, maxPiece: { length: 48, width: 24 } }] };
    const tool = convertProjectUnits(project, "mm").tools[0]!;
    expect(tool).toMatchObject({ maxRip: 762, maxPiece: { length: 1219.2, width: 609.6 } });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root apps/web test/edit.test.ts`

Expected: FAIL — the modules under test do not exist yet (`Failed to resolve import` / `Cannot find module`).

- [ ] **Step 3: Write the code**

Create `apps/web/src/edit/patch.ts`:

```ts
/** A change to some fields; `undefined` removes an optional field. */
export type Patch<T> = { [K in keyof T]?: T[K] | undefined };

export function applyPatch<T extends object>(item: T, patch: Patch<T>): T {
  const next = { ...item } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next as T;
}

export function idsOf(items: readonly { id: string }[]): Set<string> {
  return new Set(items.map((item) => item.id));
}
```

Create `apps/web/src/edit/parts.ts`:

```ts
import { slugify, uniqueId, type Material, type Part, type Project, type Size, type Units } from "@opencutplan/core";
import { applyPatch, idsOf, type Patch } from "./patch.ts";

export const NEW_PART_SIZE: Readonly<Record<Units, Size>> = { in: { length: 24, width: 12 }, mm: { length: 600, width: 300 } };
export const DEFAULT_THICKNESS: Readonly<Record<Units, number>> = { in: 0.75, mm: 18 };

/** The project's first material, adding a "Plywood" material when it has none. */
export function ensureMaterial(project: Project): { project: Project; material: string } {
  const first = project.materials[0];
  if (first) return { project, material: first.id };
  const material: Material = { id: "plywood", name: "Plywood", thickness: DEFAULT_THICKNESS[project.project.units], grained: true };
  return { project: { ...project, materials: [material] }, material: material.id };
}

export function addPart(project: Project): { project: Project; id: string } {
  const { project: withMaterial, material } = ensureMaterial(project);
  const name = `Part ${project.parts.length + 1}`;
  const id = uniqueId(slugify(name), idsOf(project.parts));
  const part: Part = { id, name, material, ...NEW_PART_SIZE[project.project.units], quantity: 1, grain: "length" };
  return { project: { ...withMaterial, parts: [...withMaterial.parts, part] }, id };
}

/** Lowering the quantity sends the removed copies' placements away. */
export function updatePart(project: Project, id: string, patch: Patch<Part>): Project {
  let quantity = Number.POSITIVE_INFINITY;
  const parts = project.parts.map((part) => {
    if (part.id !== id) return part;
    const next = applyPatch(part, patch);
    quantity = next.quantity;
    return next;
  });
  return withoutPlacements({ ...project, parts }, (placement) => placement.part === id && placement.copy >= quantity);
}

export function removePart(project: Project, id: string): Project {
  return withoutPlacements({ ...project, parts: project.parts.filter((part) => part.id !== id) }, (placement) => placement.part === id);
}

export function withoutPlacements(project: Project, drop: (placement: { part: string; copy: number }) => boolean): Project {
  if (!project.plan) return project;
  let changed = false;
  const sheets = project.plan.sheets.map((sheet) => {
    const placements = sheet.placements.filter((placement) => !drop(placement));
    if (placements.length === sheet.placements.length) return sheet;
    changed = true;
    return { ...sheet, placements };
  });
  return changed ? { ...project, plan: { ...project.plan, sheets } } : project;
}
```

Create `apps/web/src/edit/stock.ts`:

```ts
import { slugify, uniqueId, type Material, type Project, type Size, type Stock, type Units } from "@opencutplan/core";
import { DEFAULT_THICKNESS, ensureMaterial } from "./parts.ts";
import { applyPatch, idsOf, type Patch } from "./patch.ts";

export const NEW_SHEET_SIZE: Readonly<Record<Units, Size>> = { in: { length: 96, width: 48 }, mm: { length: 2440, width: 1220 } };

export function addMaterial(project: Project): Project {
  const name = `Material ${project.materials.length + 1}`;
  const material: Material = {
    id: uniqueId(slugify(name), idsOf(project.materials)),
    name,
    thickness: DEFAULT_THICKNESS[project.project.units],
    grained: true,
  };
  return { ...project, materials: [...project.materials, material] };
}

export function updateMaterial(project: Project, id: string, patch: Patch<Material>): Project {
  return { ...project, materials: project.materials.map((material) => (material.id === id ? applyPatch(material, patch) : material)) };
}

export function materialInUse(project: Project, id: string): boolean {
  return project.parts.some((part) => part.material === id) || project.stock.some((stock) => stock.material === id);
}

/** Only an unused material can go; the project is returned unchanged otherwise. */
export function removeMaterial(project: Project, id: string): Project {
  if (materialInUse(project, id)) return project;
  return { ...project, materials: project.materials.filter((material) => material.id !== id) };
}

export function addStock(project: Project): Project {
  const { project: withMaterial, material } = ensureMaterial(project);
  const size = NEW_SHEET_SIZE[project.project.units];
  const id = uniqueId(slugify(`${material} ${size.length}x${size.width}`), idsOf(project.stock));
  const stock: Stock = { id, material, ...size, quantity: null, kind: "sheet" };
  return { ...withMaterial, stock: [...withMaterial.stock, stock] };
}

export function updateStock(project: Project, id: string, patch: Patch<Stock>): Project {
  return { ...project, stock: project.stock.map((stock) => (stock.id === id ? applyPatch(stock, patch) : stock)) };
}

/** Plan sheets cut from the stock go too, so their parts return to the unplaced tray. */
export function removeStock(project: Project, id: string): Project {
  const next = { ...project, stock: project.stock.filter((stock) => stock.id !== id) };
  if (!project.plan) return next;
  return { ...next, plan: { ...project.plan, sheets: project.plan.sheets.filter((sheet) => sheet.stock !== id) } };
}
```

Create `apps/web/src/edit/tools.ts`:

```ts
import { slugify, uniqueId, type Project, type Tool, type ToolType, type Units } from "@opencutplan/core";
import { idsOf } from "./patch.ts";

export const TOOL_TYPES: readonly ToolType[] = ["table-saw", "track-saw", "circular-saw", "panel-saw"];

export const TOOL_TYPE_NAMES: Readonly<Record<ToolType, string>> = {
  "table-saw": "Table saw",
  "track-saw": "Track saw",
  "circular-saw": "Circular saw",
  "panel-saw": "Panel saw",
};

export const DEFAULT_KERF: Readonly<Record<Units, number>> = { in: 0.125, mm: 3 };

export function newTool(type: ToolType, units: Units, taken: ReadonlySet<string>): Tool {
  const name = TOOL_TYPE_NAMES[type];
  return { id: uniqueId(slugify(name), taken), name, type, kerf: DEFAULT_KERF[units], enabled: true };
}

export function addTool(project: Project, type: ToolType): Project {
  return { ...project, tools: [...project.tools, newTool(type, project.project.units, idsOf(project.tools))] };
}

export function updateTool(project: Project, id: string, change: (tool: Tool) => Tool): Project {
  return { ...project, tools: project.tools.map((tool) => (tool.id === id ? change(tool) : tool)) };
}

export function removeTool(project: Project, id: string): Project {
  return { ...project, tools: project.tools.filter((tool) => tool.id !== id) };
}

/** Tool order is the preference order for cut assignment. */
export function moveTool(project: Project, id: string, delta: -1 | 1): Project {
  const from = project.tools.findIndex((tool) => tool.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= project.tools.length) return project;
  const tools = [...project.tools];
  [tools[from], tools[to]] = [tools[to]!, tools[from]!];
  return { ...project, tools };
}
```

Create `apps/web/src/edit/units.ts`:

```ts
import { convertLength, type Project, type Tool, type Units } from "@opencutplan/core";

const TOOL_LENGTHS = ["maxRip", "maxCrosscut", "maxCut"] as const;

/** Rounds to 1e-6 so 48 in becomes 1219.2 mm, not 1219.1999999999998; the error stays below the geometry tolerance. */
function converter(from: Units, to: Units): (value: number) => number {
  return (value) => Math.round(convertLength(value, from, to) * 1e6) / 1e6;
}

export function convertTool(tool: Tool, from: Units, to: Units): Tool {
  const c = converter(from, to);
  const next: Record<string, unknown> = { ...tool, kerf: c(tool.kerf) };
  for (const key of TOOL_LENGTHS) {
    const value = next[key];
    if (typeof value === "number") next[key] = c(value);
  }
  if (tool.type === "table-saw" && tool.maxPiece) {
    next.maxPiece = { ...tool.maxPiece, length: c(tool.maxPiece.length), width: c(tool.maxPiece.width) };
  }
  return next as Tool;
}

/** Converts every length to `units`. Stored cut lists are dropped; the app computes them again. */
export function convertProjectUnits(project: Project, units: Units): Project {
  const from = project.project.units;
  if (from === units) return project;
  const c = converter(from, units);
  const settings = { ...project.settings, trim: c(project.settings.trim) };
  const { minOffcut } = project.settings;
  if (minOffcut) settings.minOffcut = { ...minOffcut, length: c(minOffcut.length), width: c(minOffcut.width) };
  const next: Project = {
    ...project,
    project: { ...project.project, units },
    materials: project.materials.map((material) => ({ ...material, thickness: c(material.thickness) })),
    stock: project.stock.map((stock) => {
      const item = { ...stock, length: c(stock.length), width: c(stock.width) };
      if (stock.trim !== undefined) item.trim = c(stock.trim);
      return item;
    }),
    parts: project.parts.map((part) => ({ ...part, length: c(part.length), width: c(part.width) })),
    tools: project.tools.map((tool) => convertTool(tool, from, units)),
    settings,
  };
  if (project.plan) {
    const sheets = project.plan.sheets.map((sheet) => {
      const { cuts: _cuts, ...rest } = sheet;
      return { ...rest, placements: sheet.placements.map((placement) => ({ ...placement, x: c(placement.x), y: c(placement.y) })) };
    });
    next.plan = { ...project.plan, sheets };
  }
  return next;
}
```

Create `apps/web/src/edit/layout.ts`:

```ts
import {
  contains,
  EPSILON,
  gapAlong,
  placedRect,
  uniqueId,
  usableRect,
  type PlanContext,
  type Part,
  type Placement,
  type PlanSheet,
  type Project,
  type Rect,
  type Size,
} from "@opencutplan/core";
import { idsOf } from "./patch.ts";

export interface CopyRef {
  part: string;
  copy: number;
}

export interface Located {
  sheet: PlanSheet;
  sheetIndex: number;
  index: number;
  placement: Placement;
}

export function orientedSize(part: Part, rotated: boolean): Size {
  return rotated ? { length: part.width, width: part.length } : { length: part.length, width: part.width };
}

export function sameCopy(a: CopyRef | null, b: CopyRef | null): boolean {
  return a !== null && b !== null && a.part === b.part && a.copy === b.copy;
}

export function findCopy(project: Project, ref: CopyRef): Located | null {
  const sheets = project.plan?.sheets ?? [];
  for (const [sheetIndex, sheet] of sheets.entries()) {
    const index = sheet.placements.findIndex((placement) => sameCopy(placement, ref));
    if (index >= 0) return { sheet, sheetIndex, index, placement: sheet.placements[index]! };
  }
  return null;
}

/** Part copies with no placement on any sheet, in part order. */
export function unplacedCopies(project: Project): CopyRef[] {
  const placed = new Set((project.plan?.sheets ?? []).flatMap((sheet) => sheet.placements.map((p) => `${p.part}#${p.copy}`)));
  return project.parts.flatMap((part) =>
    Array.from({ length: part.quantity }, (_, copy) => ({ part: part.id, copy })).filter((ref) => !placed.has(`${ref.part}#${ref.copy}`)),
  );
}

function mapSheets(project: Project, change: (sheet: PlanSheet) => PlanSheet): Project {
  if (!project.plan) return project;
  return { ...project, plan: { ...project.plan, sheets: project.plan.sheets.map(change) } };
}

export function moveToTray(project: Project, ref: CopyRef): Project {
  if (!findCopy(project, ref)) return project;
  return mapSheets(project, (sheet) =>
    sheet.placements.some((p) => sameCopy(p, ref)) ? { ...sheet, placements: sheet.placements.filter((p) => !sameCopy(p, ref)) } : sheet,
  );
}

/** Moves the copy (from a sheet or the tray) to `sheetId`, keeping any other fields of its placement. */
export function placeCopy(project: Project, ref: CopyRef, sheetId: string, x: number, y: number, rotated: boolean): Project {
  const old = findCopy(project, ref)?.placement;
  const placement: Placement = { ...old, part: ref.part, copy: ref.copy, x, y, rotated };
  return mapSheets(moveToTray(project, ref), (sheet) => (sheet.id === sheetId ? { ...sheet, placements: [...sheet.placements, placement] } : sheet));
}

function changePlacement(project: Project, ref: CopyRef, change: (placement: Placement) => Placement): Project {
  const found = findCopy(project, ref);
  if (!found) return project;
  return mapSheets(project, (sheet) =>
    sheet === found.sheet ? { ...sheet, placements: sheet.placements.map((p, i) => (i === found.index ? change(p) : p)) } : sheet,
  );
}

/** Turns the copy a quarter turn about its top-left corner. */
export function rotateCopy(project: Project, ref: CopyRef): Project {
  return changePlacement(project, ref, (placement) => ({ ...placement, rotated: !placement.rotated }));
}

export function nudgeCopy(project: Project, ref: CopyRef, dx: number, dy: number): Project {
  return changePlacement(project, ref, (placement) => ({ ...placement, x: placement.x + dx, y: placement.y + dy }));
}

export function moveCopyTo(project: Project, ref: CopyRef, x: number, y: number): Project {
  return changePlacement(project, ref, (placement) => ({ ...placement, x, y }));
}

export function addSheet(project: Project, stock: string): { project: Project; id: string } {
  const sheets = project.plan?.sheets ?? [];
  const id = uniqueId(`s${sheets.length + 1}`, idsOf(sheets));
  return { project: { ...project, plan: { ...project.plan, sheets: [...sheets, { id, stock, placements: [] }] } }, id };
}

/** The sheet's parts return to the tray. */
export function removeSheet(project: Project, sheetId: string): Project {
  if (!project.plan) return project;
  return { ...project, plan: { ...project.plan, sheets: project.plan.sheets.filter((sheet) => sheet.id !== sheetId) } };
}

export function removeEmptySheets(project: Project): Project {
  if (!project.plan?.sheets.some((sheet) => sheet.placements.length === 0)) return project;
  return { ...project, plan: { ...project.plan, sheets: project.plan.sheets.filter((sheet) => sheet.placements.length > 0) } };
}

export function setPinned(project: Project, sheetId: string, pinned: boolean): Project {
  return mapSheets(project, (sheet) => {
    if (sheet.id !== sheetId) return sheet;
    const { pinned: _old, ...rest } = sheet;
    return pinned ? { ...rest, pinned: true } : rest;
  });
}

export function clearsKerf(a: Rect, b: Rect, kerf: number): boolean {
  return gapAlong(a, b, "x") >= kerf - EPSILON || gapAlong(a, b, "y") >= kerf - EPSILON;
}

export function sheetRects(ctx: PlanContext, sheet: PlanSheet, except?: CopyRef): Rect[] {
  return sheet.placements.flatMap((placement) => {
    const part = ctx.parts.get(placement.part);
    return part && !sameCopy(placement, except ?? null) ? [placedRect(part, placement)] : [];
  });
}

/** The first spot (smallest x, then y) where `size` fits in the usable area at least one kerf from every other part. */
export function findFreeSpot(ctx: PlanContext, sheet: PlanSheet, size: Size, except?: CopyRef): { x: number; y: number } | null {
  const stock = ctx.stock.get(sheet.stock);
  if (!stock) return null;
  const usable = usableRect(ctx, stock);
  const others = sheetRects(ctx, sheet, except);
  const xs = [usable.x, ...others.map((r) => r.x + r.length + ctx.kerf)].sort((a, b) => a - b);
  const ys = [usable.y, ...others.map((r) => r.y + r.width + ctx.kerf)].sort((a, b) => a - b);
  for (const x of xs) {
    for (const y of ys) {
      const rect = { x, y, ...size };
      if (contains(usable, rect) && others.every((other) => clearsKerf(other, rect, ctx.kerf))) return { x, y };
    }
  }
  return null;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run --root apps/web test/edit.test.ts`

Expected: PASS — 18 tests.

- [ ] **Step 5: Run the full check**

Run: `npm run check` from the repo root.

Expected: the typecheck is clean (core, examples, and `apps/web`); core has 351 tests and the web app has 25 tests, all passing.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/edit/layout.ts apps/web/src/edit/parts.ts apps/web/src/edit/patch.ts apps/web/src/edit/stock.ts apps/web/src/edit/tools.ts apps/web/src/edit/units.ts apps/web/test/edit.test.ts apps/web/test/helpers.ts
git commit -m "feat(web): add project edits for parts, stock, tools, units, and layout" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Browser storage and project files

**Files:**
- Create: `apps/web/src/storage/db.ts`
- Create: `apps/web/src/storage/files.ts`
- Test: `apps/web/test/db.test.ts`

**Interfaces:**
- Consumes: `@opencutplan/core`: `parseProject`, `Project`, `serializeProject`, `Tool`, `Units`. Task 2: `sampleProject()` in `test/helpers.ts`.
- Produces:
  - `src/storage/db.ts`: `type ProjectSummary = Omit<ProjectRecord, "data">;`; `interface ToolProfile`; `interface Storage`; `function openStorage(factory: IDBFactory = indexedDB, now: () => Date = () => new Date()): Promise<Storage>`; `function unavailableStorage(reason: string): Storage`
  - `src/storage/files.ts`: `interface OpenedFile`; `function chooseFile(accept: string, doc: Document = document): Promise<File | null>`; `async function openProjectFile(win: Window & PickerWindow = window): Promise<OpenedFile | null>`; `function downloadText(text: string, name: string, type: string, doc: Document = document): void`; `async function saveProjectFile(`; `function projectFileName(name: string): string`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/db.test.ts`:

```ts
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { openStorage, unavailableStorage } from "../src/storage/db.ts";
import { sampleProject } from "./helpers.ts";

const clock = () => {
  let t = Date.UTC(2026, 8, 28, 12);
  return () => new Date((t += 1000));
};

describe("browser storage", () => {
  it("saves, lists newest first, loads, and deletes projects", async () => {
    const storage = await openStorage(new IDBFactory(), clock());
    const project = sampleProject();
    await storage.saveProject("a", project);
    await storage.saveProject("b", { ...project, project: { ...project.project, name: "Second" } });
    const list = await storage.listProjects();
    expect(list.map((p) => [p.id, p.name, p.units, p.parts])).toEqual([
      ["b", "Second", "in", 3],
      ["a", "Test", "in", 3],
    ]);
    expect(await storage.loadProject("a")).toEqual(project);
    expect(await storage.loadProject("missing")).toBeNull();
    await storage.deleteProject("a");
    expect((await storage.listProjects()).map((p) => p.id)).toEqual(["b"]);
  });

  it("keeps tool profiles by name", async () => {
    const storage = await openStorage(new IDBFactory());
    const tools = sampleProject().tools;
    await storage.saveProfile({ name: "Shop", units: "in", tools });
    await storage.saveProfile({ name: "Garage", units: "mm", tools: [] });
    expect((await storage.listProfiles()).map((p) => p.name)).toEqual(["Garage", "Shop"]);
    await storage.deleteProfile("Shop");
    expect(await storage.listProfiles()).toEqual([{ name: "Garage", units: "mm", tools: [] }]);
  });

  it("fails every save when the browser has no storage", async () => {
    const storage = unavailableStorage("no database");
    expect(await storage.listProjects()).toEqual([]);
    await expect(storage.saveProject("a", sampleProject())).rejects.toThrow("no database");
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root apps/web test/db.test.ts`

Expected: FAIL — the modules under test do not exist yet (`Failed to resolve import` / `Cannot find module`).

- [ ] **Step 3: Write the code**

Create `apps/web/src/storage/db.ts`:

```ts
import { parseProject, serializeProject, type Project, type Tool, type Units } from "@opencutplan/core";

const DB_NAME = "opencutplan";
const DB_VERSION = 1;
const PROJECTS = "projects";
const PROFILES = "toolProfiles";

interface ProjectRecord {
  id: string;
  name: string;
  units: Units;
  parts: number;
  modified: string;
  data: string;
}

export type ProjectSummary = Omit<ProjectRecord, "data">;

export interface ToolProfile {
  name: string;
  units: Units;
  tools: Tool[];
}

export interface Storage {
  /** Newest first. */
  listProjects(): Promise<ProjectSummary[]>;
  /** Null when no project has this id. Throws when the stored file no longer parses. */
  loadProject(id: string): Promise<Project | null>;
  saveProject(id: string, project: Project): Promise<void>;
  deleteProject(id: string): Promise<void>;
  /** Sorted by name. */
  listProfiles(): Promise<ToolProfile[]>;
  saveProfile(profile: ToolProfile): Promise<void>;
  deleteProfile(name: string): Promise<void>;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("The browser database request failed."));
  });
}

export function openStorage(factory: IDBFactory = indexedDB, now: () => Date = () => new Date()): Promise<Storage> {
  return new Promise((resolve, reject) => {
    const open = factory.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(PROFILES)) db.createObjectStore(PROFILES, { keyPath: "name" });
    };
    open.onerror = () => reject(open.error ?? new Error("The browser database could not be opened."));
    open.onsuccess = () => resolve(databaseStorage(open.result, now));
  });
}

function databaseStorage(db: IDBDatabase, now: () => Date): Storage {
  const read = (store: string) => db.transaction(store, "readonly").objectStore(store);
  const write = (store: string, run: (objects: IDBObjectStore) => void) =>
    new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(store, "readwrite");
      run(transaction.objectStore(store));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("The browser could not save."));
      transaction.onabort = () => reject(transaction.error ?? new Error("The browser stopped the save."));
    });

  return {
    async listProjects() {
      const records = await request(read(PROJECTS).getAll() as IDBRequest<ProjectRecord[]>);
      return records
        .map(({ data: _data, ...summary }) => summary)
        .sort((a, b) => b.modified.localeCompare(a.modified));
    },
    async loadProject(id) {
      const record = await request(read(PROJECTS).get(id) as IDBRequest<ProjectRecord | undefined>);
      if (!record) return null;
      const result = parseProject(record.data);
      if (!result.ok) throw new Error(`The saved project "${record.name}" is damaged: ${result.errors[0]?.message ?? "unknown error"}`);
      return result.project;
    },
    saveProject(id, project) {
      const record: ProjectRecord = {
        id,
        name: project.project.name,
        units: project.project.units,
        parts: project.parts.reduce((sum, part) => sum + part.quantity, 0),
        modified: now().toISOString(),
        data: serializeProject(project),
      };
      return write(PROJECTS, (store) => store.put(record));
    },
    deleteProject(id) {
      return write(PROJECTS, (store) => store.delete(id));
    },
    async listProfiles() {
      const profiles = await request(read(PROFILES).getAll() as IDBRequest<ToolProfile[]>);
      return profiles.sort((a, b) => a.name.localeCompare(b.name));
    },
    saveProfile(profile) {
      return write(PROFILES, (store) => store.put(profile));
    },
    deleteProfile(name) {
      return write(PROFILES, (store) => store.delete(name));
    },
  };
}

/** Used when the browser has no database (for example, some private windows): nothing is kept, and every save fails with `reason`. */
export function unavailableStorage(reason: string): Storage {
  const fail = () => Promise.reject(new Error(reason));
  return {
    listProjects: () => Promise.resolve([]),
    loadProject: () => Promise.resolve(null),
    saveProject: fail,
    deleteProject: () => Promise.resolve(),
    listProfiles: () => Promise.resolve([]),
    saveProfile: fail,
    deleteProfile: () => Promise.resolve(),
  };
}
```

Create `apps/web/src/storage/files.ts`:

```ts
export interface OpenedFile {
  name: string;
  text: string;
  handle?: FileSystemFileHandle;
}

interface PickerType {
  description: string;
  accept: Record<string, string[]>;
}

/** The File System Access API is not in every browser, so its entry points are optional. */
interface PickerWindow {
  showOpenFilePicker?: (options: { types: PickerType[]; multiple: false }) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options: { types: PickerType[]; suggestedName: string }) => Promise<FileSystemFileHandle>;
}

const PROJECT_TYPE: PickerType = { description: "OpenCutPlan project", accept: { "application/json": [".json"] } };

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Resolves to null when the user closes the file chooser. */
export function chooseFile(accept: string, doc: Document = document): Promise<File | null> {
  return new Promise((resolve) => {
    const input = doc.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });
}

export async function openProjectFile(win: Window & PickerWindow = window): Promise<OpenedFile | null> {
  if (win.showOpenFilePicker) {
    try {
      const [handle] = await win.showOpenFilePicker({ types: [PROJECT_TYPE], multiple: false });
      if (!handle) return null;
      const file = await handle.getFile();
      return { name: file.name, text: await file.text(), handle };
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
  }
  const file = await chooseFile(".json,.cutplan.json,application/json", win.document);
  return file ? { name: file.name, text: await file.text() } : null;
}

export function downloadText(text: string, name: string, type: string, doc: Document = document): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = doc.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Writes to `handle` when given; otherwise asks for a place to save (or downloads when the browser cannot ask).
 * Returns the handle to reuse for the next save, or null when the user cancelled.
 */
export async function saveProjectFile(
  text: string,
  suggestedName: string,
  handle: FileSystemFileHandle | undefined,
  win: Window & PickerWindow = window,
): Promise<FileSystemFileHandle | undefined | null> {
  try {
    const target = handle ?? (win.showSaveFilePicker ? await win.showSaveFilePicker({ types: [PROJECT_TYPE], suggestedName }) : undefined);
    if (!target) {
      downloadText(text, suggestedName, "application/json", win.document);
      return undefined;
    }
    const writable = await target.createWritable();
    await writable.write(text);
    await writable.close();
    return target;
  } catch (error) {
    if (isAbort(error)) return null;
    throw error;
  }
}

export function projectFileName(name: string): string {
  const base = name.trim().replace(/[\\/:*?"<>|]+/g, "-") || "project";
  return `${base}.cutplan.json`;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run --root apps/web test/db.test.ts`

Expected: PASS — 3 tests.

- [ ] **Step 5: Run the full check**

Run: `npm run check` from the repo root.

Expected: the typecheck is clean (core, examples, and `apps/web`); core has 351 tests and the web app has 28 tests, all passing.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/storage/db.ts apps/web/src/storage/files.ts apps/web/test/db.test.ts
git commit -m "feat(web): store projects and tool profiles in IndexedDB, and open and save files" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Form fields, dialogs, and CSV import

**Files:**
- Create: `apps/web/src/components/fields.tsx`
- Create: `apps/web/src/components/Dialog.tsx`
- Create: `apps/web/src/components/CsvImportDialog.tsx`
- Test: `apps/web/test/render.tsx`
- Test: `apps/web/test/fields.test.tsx`
- Test: `apps/web/test/CsvImportDialog.test.tsx`

**Interfaces:**
- Consumes: `@opencutplan/core`: `addPartRows`, `addStockRows`, `ColumnMapping`, `CsvRowIssue`, `DisplayPrecision`, `formatLength`, `importPartsCsv`, `importStockCsv`, `parseLength`, `parsePlainNumber`, `PART_ALIASES`, `PART_REQUIRED`, `Project`, `STOCK_ALIASES`, `STOCK_REQUIRED`, `Table`, `Units`. Task 1: `useProject`, `ProjectStore`. Task 2: `sampleProject()`.
- Produces:
  - `src/components/fields.tsx`: `function DraftInput({ value, onCommit, onKeyDown, onBlur, ...rest }: DraftInputProps)`; `function TextInput({ value, onChange, required, valid, ...rest }: TextInputProps)`; `function LengthInput({ value, units, display, onChange, optional, allowZero, ...rest }: LengthInputProps)`; `function NumberInput({ value, onChange, optional, integer, minimum = 0, ...rest }: NumberInputProps)`
  - `src/components/Dialog.tsx`: `function Dialog({ title, onClose, children, drawer }: DialogProps)`
  - `src/components/CsvImportDialog.tsx`: `type CsvKind = "parts" | "stock";`; `function CsvImportDialog({ kind, text: initialText, project, onImport, onClose }: CsvImportDialogProps)`
  - `test/render.tsx`: `function renderWithStore(initial: Project, ui: (store: ProjectStore) => ReactNode)`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/render.tsx`:

```tsx
import type { Project } from "@opencutplan/core";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { useProject, type ProjectStore } from "../src/state/useProject.ts";

/** Renders UI that takes a project store; `current()` returns the store from the latest render. */
export function renderWithStore(initial: Project, ui: (store: ProjectStore) => ReactNode) {
  let latest: ProjectStore | null = null;
  function Harness() {
    const store = useProject(initial);
    latest = store;
    return <>{ui(store)}</>;
  }
  const result = render(<Harness />);
  return { ...result, current: () => latest! };
}
```

Create `apps/web/test/fields.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LengthInput, NumberInput, TextInput } from "../src/components/fields.tsx";

const display = { inch: 32, mm: 0.5 } as const;

describe("LengthInput", () => {
  it("shows the value in the display precision and commits a parsed length on Enter", async () => {
    const onChange = vi.fn();
    render(<LengthInput aria-label="Length" value={15.375} units="in" display={display} onChange={onChange} />);
    const input = screen.getByLabelText("Length");
    expect(input).toHaveProperty("value", '15 3/8"');
    await userEvent.clear(input);
    await userEvent.type(input, "1' 2 1/2{Enter}");
    expect(onChange).toHaveBeenCalledWith(14.5);
  });

  it("keeps rejected text marked on Enter and puts the old value back on blur", async () => {
    const onChange = vi.fn();
    render(<LengthInput aria-label="Length" value={10} units="mm" display={display} onChange={onChange} />);
    const input = screen.getByLabelText("Length");
    await userEvent.clear(input);
    await userEvent.type(input, "abc{Enter}");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input).toHaveProperty("value", "abc");
    await userEvent.tab();
    expect(input).toHaveProperty("value", "10 mm");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears an optional value with blank text, and Escape cancels an edit", async () => {
    const onChange = vi.fn();
    render(<LengthInput aria-label="Trim" value={6} units="mm" display={display} optional allowZero onChange={onChange} />);
    const input = screen.getByLabelText("Trim");
    await userEvent.type(input, "9{Escape}");
    expect(input).toHaveProperty("value", "6 mm");
    await userEvent.clear(input);
    await userEvent.tab();
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});

describe("NumberInput and TextInput", () => {
  it("accepts only whole numbers at or above the minimum", async () => {
    const onChange = vi.fn();
    render(<NumberInput aria-label="Qty" value={2} integer minimum={1} onChange={onChange} />);
    const input = screen.getByLabelText("Qty");
    await userEvent.clear(input);
    await userEvent.type(input, "0{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.clear(input);
    await userEvent.type(input, "4{Enter}");
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("trims text and refuses a blank required value", async () => {
    const onChange = vi.fn();
    render(<TextInput aria-label="Name" value="Side" required onChange={onChange} />);
    const input = screen.getByLabelText("Name");
    await userEvent.clear(input);
    await userEvent.tab();
    expect(input).toHaveProperty("value", "Side");
    await userEvent.clear(input);
    await userEvent.type(input, "  Top  {Enter}");
    expect(onChange).toHaveBeenCalledWith("Top");
  });
});
```

Create `apps/web/test/CsvImportDialog.test.tsx`:

```tsx
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

  it("closes with Escape", async () => {
    const onClose = vi.fn();
    render(<CsvImportDialog kind="parts" text="" project={sampleProject()} onImport={() => undefined} onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root apps/web test/fields.test.tsx test/CsvImportDialog.test.tsx`

Expected: FAIL — the modules under test do not exist yet (`Failed to resolve import` / `Cannot find module`).

- [ ] **Step 3: Write the code**

Create `apps/web/src/components/fields.tsx`:

```tsx
import { formatLength, parseLength, parsePlainNumber, type DisplayPrecision, type Units } from "@opencutplan/core";
import { useState, type InputHTMLAttributes, type KeyboardEvent } from "react";

type BaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "defaultValue">;

interface DraftInputProps extends BaseProps {
  value: string;
  /** Returns false to reject the text. Enter keeps rejected text so it can be fixed; leaving the field puts the old value back. */
  onCommit(text: string): boolean;
}

export function DraftInput({ value, onCommit, onKeyDown, onBlur, ...rest }: DraftInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const reset = () => {
    setDraft(null);
    setInvalid(false);
  };
  const commit = (keepInvalid: boolean) => {
    if (draft === null || draft === value || onCommit(draft)) reset();
    else if (keepInvalid) setInvalid(true);
    else reset();
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") commit(true);
    else if (event.key === "Escape") reset();
    onKeyDown?.(event);
  };
  return (
    <input
      {...rest}
      value={draft ?? value}
      aria-invalid={invalid || undefined}
      onChange={(event) => {
        setDraft(event.target.value);
        setInvalid(false);
      }}
      onKeyDown={keyDown}
      onBlur={(event) => {
        commit(false);
        onBlur?.(event);
      }}
    />
  );
}

interface TextInputProps extends BaseProps {
  value: string;
  onChange(value: string): void;
  /** Rejects text that fails; the text is trimmed first. */
  valid?: (value: string) => boolean;
}

export function TextInput({ value, onChange, required, valid, ...rest }: TextInputProps) {
  return (
    <DraftInput
      {...rest}
      type="text"
      value={value}
      required={required}
      onCommit={(text) => {
        const trimmed = text.trim();
        if ((required && trimmed === "") || (valid && !valid(trimmed))) return false;
        onChange(trimmed);
        return true;
      }}
    />
  );
}

interface LengthInputProps extends BaseProps {
  value: number | undefined;
  units: Units;
  display: DisplayPrecision;
  onChange(value: number | undefined): void;
  /** Blank clears the value. */
  optional?: boolean;
  allowZero?: boolean;
}

export function LengthInput({ value, units, display, onChange, optional, allowZero, ...rest }: LengthInputProps) {
  return (
    <DraftInput
      {...rest}
      type="text"
      inputMode="decimal"
      value={value === undefined ? "" : formatLength(value, units, display)}
      onCommit={(text) => {
        if (text.trim() === "") {
          if (!optional) return false;
          onChange(undefined);
          return true;
        }
        const parsed = parseLength(text, units);
        if (parsed === null || parsed < 0 || (parsed === 0 && !allowZero)) return false;
        onChange(parsed);
        return true;
      }}
    />
  );
}

interface NumberInputProps extends BaseProps {
  value: number | undefined;
  onChange(value: number | undefined): void;
  optional?: boolean;
  integer?: boolean;
  minimum?: number;
}

export function NumberInput({ value, onChange, optional, integer, minimum = 0, ...rest }: NumberInputProps) {
  return (
    <DraftInput
      {...rest}
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      value={value === undefined ? "" : String(value)}
      onCommit={(text) => {
        if (text.trim() === "") {
          if (!optional) return false;
          onChange(undefined);
          return true;
        }
        const parsed = parsePlainNumber(text);
        if (parsed === null || parsed < minimum || (integer && !Number.isInteger(parsed))) return false;
        onChange(parsed);
        return true;
      }}
    />
  );
}
```

Create `apps/web/src/components/Dialog.tsx`:

```tsx
import { useEffect, useId, useRef, type ReactNode } from "react";

interface DialogProps {
  title: string;
  onClose(): void;
  children: ReactNode;
  /** A drawer sits at the right edge. */
  drawer?: boolean;
}

export function Dialog({ title, onClose, children, drawer }: DialogProps) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLElement>("textarea, input, select, button")?.focus();
    return () => opener?.focus();
  }, []);
  return (
    <div className={drawer ? "backdrop drawer-backdrop" : "backdrop"} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={ref}
        className={drawer ? "dialog drawer" : "dialog"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <header className="dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
```

Create `apps/web/src/components/CsvImportDialog.tsx`:

```tsx
import {
  addPartRows,
  addStockRows,
  importPartsCsv,
  importStockCsv,
  PART_ALIASES,
  PART_REQUIRED,
  STOCK_ALIASES,
  STOCK_REQUIRED,
  type ColumnMapping,
  type CsvRowIssue,
  type Project,
  type Table,
} from "@opencutplan/core";
import { useMemo, useState } from "react";
import { Dialog } from "./Dialog.tsx";

export type CsvKind = "parts" | "stock";

const FIELD_LABELS: Readonly<Record<string, string>> = {
  name: "Name",
  length: "Length",
  width: "Width",
  quantity: "Quantity",
  material: "Material",
  grain: "Grain",
  group: "Group",
  notes: "Notes",
  thickness: "Thickness",
  cost: "Cost",
  kind: "Kind",
};

interface Preview {
  table: Table;
  mapping: ColumnMapping<string>;
  missing: string[];
  rows: number;
  issues: CsvRowIssue[];
  apply(project: Project): Project;
}

function preview(kind: CsvKind, text: string, project: Project, hasHeader: boolean | undefined, mapping: ColumnMapping<string> | undefined): Preview {
  const options = {
    units: project.project.units,
    ...(project.materials[0] ? { defaultMaterial: project.materials[0].name } : {}),
    ...(hasHeader === undefined ? {} : { hasHeader }),
  };
  if (kind === "parts") {
    const result = importPartsCsv(text, mapping ? { ...options, mapping } : options);
    if (result.status === "needs-mapping") return { ...result, rows: 0, issues: [], apply: (p) => p };
    return { ...result, missing: [], rows: result.rows.length, apply: (p) => addPartRows(p, result.rows).project };
  }
  const result = importStockCsv(text, mapping ? { ...options, mapping } : options);
  if (result.status === "needs-mapping") return { ...result, rows: 0, issues: [], apply: (p) => p };
  return { ...result, missing: [], rows: result.rows.length, apply: (p) => addStockRows(p, result.rows).project };
}

interface CsvImportDialogProps {
  kind: CsvKind;
  text: string;
  project: Project;
  onImport(project: Project): void;
  onClose(): void;
}

export function CsvImportDialog({ kind, text: initialText, project, onImport, onClose }: CsvImportDialogProps) {
  const [text, setText] = useState(initialText);
  const [hasHeader, setHasHeader] = useState<boolean | undefined>(undefined);
  const [mapping, setMapping] = useState<ColumnMapping<string> | undefined>(undefined);
  const fields = Object.keys(kind === "parts" ? PART_ALIASES : STOCK_ALIASES);
  const required: readonly string[] = kind === "parts" ? PART_REQUIRED : STOCK_REQUIRED;
  const result = useMemo(() => preview(kind, text, project, hasHeader, mapping), [kind, text, project, hasHeader, mapping]);
  const errors = result.issues.filter((issue) => issue.severity === "error");
  const warnings = result.issues.filter((issue) => issue.severity === "warning");

  const setField = (field: string, value: string) => {
    const next: ColumnMapping<string> = { ...result.mapping };
    delete next[field];
    if (value !== "") {
      for (const [other, column] of Object.entries(next)) if (column === Number(value)) delete next[other];
      next[field] = Number(value);
    }
    setMapping(next);
  };

  return (
    <Dialog title={kind === "parts" ? "Import parts" : "Import stock"} onClose={onClose}>
      <label className="stack">
        Rows (paste from a spreadsheet, or edit)
        <textarea
          rows={6}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setMapping(undefined);
          }}
        />
      </label>
      <label className="inline">
        <input
          type="checkbox"
          checked={result.table.hasHeader}
          onChange={(event) => {
            setHasHeader(event.target.checked);
            setMapping(undefined);
          }}
        />
        The first row is a header
      </label>
      <fieldset>
        <legend>Columns</legend>
        <div className="mapping">
          {fields.map((field) => (
            <label key={field}>
              {FIELD_LABELS[field] ?? field}
              {required.includes(field) ? " (required)" : ""}
              <select value={result.mapping[field] ?? ""} onChange={(event) => setField(field, event.target.value)}>
                <option value="">Not used</option>
                {result.table.headers.map((header, index) => (
                  <option key={index} value={index}>
                    {header || `Column ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </fieldset>
      {result.missing.length > 0 && (
        <p role="alert" className="error">
          Choose a column for: {result.missing.map((field) => FIELD_LABELS[field] ?? field).join(", ")}.
        </p>
      )}
      {result.missing.length === 0 && (
        <p>
          {result.rows} {result.rows === 1 ? "row is" : "rows are"} ready.
          {errors.length > 0 && ` ${errors.length} ${errors.length === 1 ? "row has an error and is" : "rows have errors and are"} left out.`}
        </p>
      )}
      {result.issues.length > 0 && (
        <ul className="issues">
          {[...errors, ...warnings].map((issue, index) => (
            <li key={index} className={issue.severity}>
              {issue.severity === "error" ? "✖ " : "⚠ "}
              {issue.message}
            </li>
          ))}
        </ul>
      )}
      <footer className="dialog-foot">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="primary" disabled={result.rows === 0} onClick={() => onImport(result.apply(project))}>
          Import {result.rows} {result.rows === 1 ? "row" : "rows"}
        </button>
      </footer>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run --root apps/web test/fields.test.tsx test/CsvImportDialog.test.tsx`

Expected: PASS — 9 tests.

- [ ] **Step 5: Run the full check**

Run: `npm run check` from the repo root.

Expected: the typecheck is clean (core, examples, and `apps/web`); core has 351 tests and the web app has 37 tests, all passing.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/CsvImportDialog.tsx apps/web/src/components/Dialog.tsx apps/web/src/components/fields.tsx apps/web/test/CsvImportDialog.test.tsx apps/web/test/fields.test.tsx apps/web/test/render.tsx
git commit -m "feat(web): add form fields, dialogs, and the CSV import dialog" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Optimizer runs in a Web Worker

**Files:**
- Create: `apps/web/src/optimizer/optimizer.worker.ts`
- Create: `apps/web/src/optimizer/runs.ts`
- Create: `apps/web/src/optimizer/useOptimizer.ts`
- Create: `apps/web/src/optimizer/useOptimizeRuns.ts`
- Modify: `apps/web/test/helpers.ts`
- Test: `apps/web/test/runs.test.ts`

**Interfaces:**
- Consumes: `@opencutplan/core`: `applyOptimizeResult`, `createOptimizerHost`, `createProject`, `optimize`, `OptimizeResult`, `OptimizerRequest`, `OptimizerResponse`, `PlanSheet`, `Project`. Task 1: `ProjectStore`. Task 2: `setPinned`, `sampleProject()`.
- Produces:
  - `src/optimizer/runs.ts`: `type OptimizeMode = "all" | "rest";`; `interface OptimizeRequest`; `interface LastRun`; `function optimizeRequest(project: Project, mode: OptimizeMode): OptimizeRequest`; `function keepSearchingRequest(last: LastRun): OptimizeRequest`; `function applyRun(request: OptimizeRequest, result: OptimizeResult): Project`
  - `src/optimizer/useOptimizer.ts`: `interface WorkerLike`; `type WorkerFactory = () => WorkerLike;`; `const createOptimizerWorker: WorkerFactory = () =>`; `interface RunningState`; `interface Optimizer`; `function useOptimizer(factory: WorkerFactory): Optimizer`
  - `src/optimizer/useOptimizeRuns.ts`: `interface OptimizeRuns`; `function useOptimizeRuns(store: ProjectStore, factory: WorkerFactory): OptimizeRuns`
  - `test/helpers.ts`: `function sampleProject(): Project`; `function inProcessWorkers(): { factory: WorkerFactory; created: WorkerLike[] }`

- [ ] **Step 1: Write the failing tests**

Replace `apps/web/test/helpers.ts` with:

```ts
import { createOptimizerHost, createProject, type OptimizerResponse, type Project } from "@opencutplan/core";
import type { WorkerFactory, WorkerLike } from "../src/optimizer/useOptimizer.ts";

/** An inch project: plywood (grained), an unlimited 96 × 48 sheet, two 30 × 12 sides and a 20 × 10 shelf, a table saw, and one sheet that holds both sides. */
export function sampleProject(): Project {
  const base = createProject("Test", "in");
  return {
    ...base,
    materials: [{ id: "ply", name: "Plywood", thickness: 0.75, grained: true }],
    stock: [{ id: "ply-4x8", material: "ply", length: 96, width: 48, quantity: null, cost: 60, kind: "sheet" }],
    parts: [
      { id: "side", name: "Side", material: "ply", length: 30, width: 12, quantity: 2, grain: "length" },
      { id: "shelf", name: "Shelf", material: "ply", length: 20, width: 10, quantity: 1, grain: "none", group: "A" },
    ],
    tools: [{ id: "ts", name: "Table saw", type: "table-saw", kerf: 0.125, enabled: true }],
    plan: {
      sheets: [
        {
          id: "s1",
          stock: "ply-4x8",
          placements: [
            { part: "side", copy: 0, x: 0.25, y: 0.25, rotated: false },
            { part: "side", copy: 1, x: 0.25, y: 12.375, rotated: false },
          ],
        },
      ],
    },
  };
}

/** Runs the real optimizer host in this thread, so tests see the same messages a Web Worker sends. */
export function inProcessWorkers(): { factory: WorkerFactory; created: WorkerLike[] } {
  const created: WorkerLike[] = [];
  const factory: WorkerFactory = () => {
    const worker: WorkerLike = {
      onmessage: null,
      onerror: null,
      postMessage: (message) => handle(message),
      terminate: () => undefined,
    };
    const handle = createOptimizerHost(
      (response: OptimizerResponse) => setTimeout(() => worker.onmessage?.({ data: response } as MessageEvent<OptimizerResponse>), 0),
      (run) => void setTimeout(run, 0),
    );
    created.push(worker);
    return worker;
  };
  return { factory, created };
}
```

Create `apps/web/test/runs.test.ts`:

```ts
import { optimize } from "@opencutplan/core";
import { describe, expect, it } from "vitest";
import { setPinned } from "../src/edit/layout.ts";
import { applyRun, keepSearchingRequest, optimizeRequest } from "../src/optimizer/runs.ts";
import { sampleProject } from "./helpers.ts";

describe("optimizer runs", () => {
  it("'all' plans every copy again", () => {
    const project = sampleProject();
    const request = optimizeRequest(project, "all");
    expect(request.input).toBe(project);
    const result = optimize(request.input, { iterations: 5 });
    const applied = applyRun(request, result);
    expect(applied.plan!.sheets.flatMap((s) => s.placements)).toHaveLength(3);
  });

  it("'rest' keeps every sheet as it was and places only the unplaced copies", () => {
    const project = sampleProject();
    const request = optimizeRequest(project, "rest");
    expect(request.input.plan!.sheets.every((s) => s.pinned)).toBe(true);
    const applied = applyRun(request, optimize(request.input, { iterations: 5 }));
    expect(applied.plan!.sheets[0]).toBe(project.plan!.sheets[0]);
    expect(applied.plan!.sheets[0]).not.toHaveProperty("pinned");
    expect(applied.plan!.sheets).toHaveLength(2);
    expect(applied.plan!.sheets[1]!.placements.map((p) => p.part)).toEqual(["shelf"]);
  });

  it("keeps searching from the same request", () => {
    const request = optimizeRequest(setPinned(sampleProject(), "s1", true), "all");
    const result = optimize(request.input, { iterations: 3 });
    const more = keepSearchingRequest({ request, result, applied: applyRun(request, result) });
    expect(more.input).toBe(request.input);
    expect(more.start).toBe(result);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root apps/web test/runs.test.ts`

Expected: FAIL — the modules under test do not exist yet (`Failed to resolve import` / `Cannot find module`).

- [ ] **Step 3: Write the code**

Create `apps/web/src/optimizer/optimizer.worker.ts`:

```ts
import { createOptimizerHost, type OptimizerRequest, type OptimizerResponse } from "@opencutplan/core";

const scope = self as unknown as { postMessage(message: OptimizerResponse): void; onmessage: ((event: MessageEvent<OptimizerRequest>) => void) | null };
const handle = createOptimizerHost((message) => scope.postMessage(message));
scope.onmessage = (event) => handle(event.data);
```

Create `apps/web/src/optimizer/runs.ts`:

```ts
import { applyOptimizeResult, type OptimizeResult, type PlanSheet, type Project } from "@opencutplan/core";

export type OptimizeMode = "all" | "rest";

export interface OptimizeRequest {
  input: Project;
  start?: OptimizeResult;
  /** Sheets to put back as they were: "Optimize the rest" pins every sheet only for the run. */
  restore: ReadonlyMap<string, PlanSheet>;
}

export interface LastRun {
  request: OptimizeRequest;
  result: OptimizeResult;
  /** The project the result produced; "Keep searching" is offered while the project is still this one. */
  applied: Project;
}

/** "all" keeps pinned sheets and plans everything else again; "rest" keeps every sheet and plans only unplaced copies. */
export function optimizeRequest(project: Project, mode: OptimizeMode): OptimizeRequest {
  if (mode === "all" || !project.plan) return { input: project, restore: new Map() };
  const sheets = project.plan.sheets;
  return {
    input: { ...project, plan: { ...project.plan, sheets: sheets.map((sheet) => ({ ...sheet, pinned: true })) } },
    restore: new Map(sheets.map((sheet) => [sheet.id, sheet])),
  };
}

export function keepSearchingRequest(last: LastRun): OptimizeRequest {
  return { ...last.request, start: last.result };
}

export function applyRun(request: OptimizeRequest, result: OptimizeResult): Project {
  const applied = applyOptimizeResult(request.input, result);
  if (request.restore.size === 0 || !applied.plan) return applied;
  return { ...applied, plan: { ...applied.plan, sheets: applied.plan.sheets.map((sheet) => request.restore.get(sheet.id) ?? sheet) } };
}
```

Create `apps/web/src/optimizer/useOptimizer.ts`:

```ts
import type { OptimizeResult, OptimizerRequest, OptimizerResponse } from "@opencutplan/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { OptimizeRequest } from "./runs.ts";

export interface WorkerLike {
  postMessage(message: OptimizerRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<OptimizerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

export type WorkerFactory = () => WorkerLike;

export const createOptimizerWorker: WorkerFactory = () =>
  new Worker(new URL("./optimizer.worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike;

export interface RunningState {
  startedAt: number;
  timeLimitMs: number;
  best: OptimizeResult | null;
}

export interface Optimizer {
  running: RunningState | null;
  error: string | null;
  start(request: OptimizeRequest, onDone: (result: OptimizeResult, cancelled: boolean) => void): void;
  /** Stops the search; `onDone` still runs with the best result so far. */
  cancel(): void;
  clearError(): void;
}

export function useOptimizer(factory: WorkerFactory): Optimizer {
  const [running, setRunning] = useState<RunningState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const worker = useRef<WorkerLike | null>(null);
  const job = useRef(0);
  const onDone = useRef<((result: OptimizeResult, cancelled: boolean) => void) | null>(null);

  useEffect(
    () => () => {
      worker.current?.terminate();
      worker.current = null;
    },
    [],
  );

  const ensureWorker = useCallback((): WorkerLike => {
    if (worker.current) return worker.current;
    const created = factory();
    created.onmessage = (event) => {
      const message = event.data;
      if (message.id !== job.current) return;
      if (message.type === "progress") {
        setRunning((state) => state && { ...state, best: message.result });
      } else if (message.type === "done") {
        setRunning(null);
        onDone.current?.(message.result, message.cancelled);
      } else {
        setRunning(null);
        setError(message.message);
      }
    };
    created.onerror = (event) => {
      event.preventDefault();
      created.terminate();
      worker.current = null;
      setRunning(null);
      setError(event.message || "The optimizer stopped because of an error.");
    };
    worker.current = created;
    return created;
  }, [factory]);

  const start = useCallback(
    (request: OptimizeRequest, done: (result: OptimizeResult, cancelled: boolean) => void) => {
      const id = ++job.current;
      onDone.current = done;
      setError(null);
      setRunning({ startedAt: Date.now(), timeLimitMs: request.input.settings.optimizer.timeLimitMs, best: null });
      const options = request.start ? { start: request.start } : {};
      try {
        ensureWorker().postMessage({ type: "start", id, project: request.input, options });
      } catch (e) {
        setRunning(null);
        setError((e as Error).message);
      }
    },
    [ensureWorker],
  );

  const cancel = useCallback(() => worker.current?.postMessage({ type: "cancel", id: job.current }), []);
  const clearError = useCallback(() => setError(null), []);
  return { running, error, start, cancel, clearError };
}
```

Create `apps/web/src/optimizer/useOptimizeRuns.ts`:

```ts
import type { OptimizeResult, Project } from "@opencutplan/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectStore } from "../state/useProject.ts";
import { applyRun, keepSearchingRequest, optimizeRequest, type LastRun, type OptimizeMode, type OptimizeRequest } from "./runs.ts";
import { useOptimizer, type RunningState, type WorkerFactory } from "./useOptimizer.ts";

export interface OptimizeRuns {
  running: RunningState | null;
  error: string | null;
  /** The outcome of the last run, for a status line. */
  notice: string | null;
  /** The last run while the project is still the one it produced. */
  current: LastRun | null;
  optimize(mode: OptimizeMode): void;
  keepSearching(): void;
  stop(): void;
}

function summary(result: OptimizeResult, cancelled: boolean): string {
  const unplaced = result.unplaced.length;
  const sheets = result.sheets.length;
  return `${cancelled ? "Stopped after" : "Tried"} ${result.iterations.toLocaleString()} plans. The best uses ${sheets} ${sheets === 1 ? "sheet" : "sheets"}${
    unplaced > 0 ? ` and leaves ${unplaced} ${unplaced === 1 ? "part" : "parts"} unplaced` : ""
  }.`;
}

export function useOptimizeRuns(store: ProjectStore, factory: WorkerFactory): OptimizeRuns {
  const optimizer = useOptimizer(factory);
  const [last, setLast] = useState<LastRun | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const latest = useRef<Project>(store.project);
  useEffect(() => {
    latest.current = store.project;
  }, [store.project]);

  const run = useCallback(
    (request: OptimizeRequest) => {
      const from = store.project;
      setNotice(null);
      optimizer.start(request, (result, cancelled) => {
        if (latest.current !== from) {
          setNotice("The project changed while the optimizer ran, so its plan was not used.");
          return;
        }
        const applied = applyRun(request, result);
        store.edit(applied);
        setLast({ request, result, applied });
        setNotice(summary(result, cancelled));
      });
    },
    [optimizer, store],
  );

  const current = last && last.applied === store.project ? last : null;
  return {
    running: optimizer.running,
    error: optimizer.error,
    notice,
    current,
    optimize: (mode) => run(optimizeRequest(store.project, mode)),
    keepSearching: () => current && run(keepSearchingRequest(current)),
    stop: optimizer.cancel,
  };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run --root apps/web test/runs.test.ts`

Expected: PASS — 3 tests.

- [ ] **Step 5: Run the full check**

Run: `npm run check` from the repo root.

Expected: the typecheck is clean (core, examples, and `apps/web`); core has 351 tests and the web app has 40 tests, all passing.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/optimizer/optimizer.worker.ts apps/web/src/optimizer/runs.ts apps/web/src/optimizer/useOptimizeRuns.ts apps/web/src/optimizer/useOptimizer.ts apps/web/test/helpers.ts apps/web/test/runs.test.ts
git commit -m "feat(web): run the optimizer in a Web Worker" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Parts, stock, tools, and settings screens

**Files:**
- Create: `apps/web/src/screens/area.ts`
- Create: `apps/web/src/screens/PartsTab.tsx`
- Create: `apps/web/src/screens/StockTab.tsx`
- Create: `apps/web/src/screens/ToolsTab.tsx`
- Create: `apps/web/src/screens/SettingsDrawer.tsx`
- Test: `apps/web/test/PartsTab.test.tsx`
- Test: `apps/web/test/screens.test.tsx`

**Interfaces:**
- Consumes: `@opencutplan/core`: `DEFAULT_MIN_OFFCUT`, `FEATURE_KEYS`, `Features`, `formatLength`, `Grain`, `InchPrecision`, `MmPrecision`, `Project`, `Settings`, `StockKind`, `Tool`, `ToolType`, `Units`. Task 1: `ProjectStore`, `ViewPrefs`, `DEFAULT_PREFS`. Task 2: the `src/edit/*` functions. Task 3: `Storage`, `ToolProfile`, `openStorage`, `chooseFile`. Task 4: `TextInput`, `LengthInput`, `NumberInput`, `Dialog`, `CsvImportDialog`, `renderWithStore`.
- Produces:
  - `src/screens/area.ts`: `function formatArea(area: number, units: Units): string`
  - `src/screens/PartsTab.tsx`: `function isTableText(text: string): boolean`; `function PartsTab({ store }: { store: ProjectStore })`
  - `src/screens/StockTab.tsx`: `function StockTab({ store }: { store: ProjectStore })`
  - `src/screens/ToolsTab.tsx`: `function ToolsTab({ store, storage }: ToolsTabProps)`
  - `src/screens/SettingsDrawer.tsx`: `const FEATURE_TEXT: Readonly<Record<keyof Features, { label: string; detail: string }>> =`; `function SettingsDrawer({ store, prefs, onPrefs, onClose }: SettingsDrawerProps)`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/PartsTab.test.tsx`:

```tsx
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { isTableText, PartsTab } from "../src/screens/PartsTab.tsx";
import { sampleProject } from "./helpers.ts";
import { renderWithStore } from "./render.tsx";

describe("PartsTab", () => {
  it("commits an edited length and lowers the quantity, which takes the extra copy off the sheet", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <PartsTab store={store} />);
    const length = screen.getByLabelText("Length of Side");
    await userEvent.clear(length);
    await userEvent.type(length, "32{Enter}");
    expect(current().project.parts[0]!.length).toBe(32);
    const quantity = screen.getByLabelText("Quantity of Side");
    await userEvent.clear(quantity);
    await userEvent.type(quantity, "1{Enter}");
    expect(current().project.parts[0]!.quantity).toBe(1);
    expect(current().project.plan!.sheets[0]!.placements).toHaveLength(1);
    expect(screen.getByLabelText("Totals").textContent).toContain("Plywood: 2 pieces");
  });

  it("adds a part and focuses its name", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <PartsTab store={store} />);
    await userEvent.click(screen.getByRole("button", { name: "Add part" }));
    expect(current().project.parts).toHaveLength(3);
    const added = current().project.parts[2]!;
    expect(document.activeElement).toBe(screen.getByLabelText(`Name of ${added.name}`));
  });

  it("deletes a part and removes its copies from the plan", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <PartsTab store={store} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete Side" }));
    expect(current().project.parts.map((p) => p.id)).toEqual(["shelf"]);
    expect(current().project.plan!.sheets[0]!.placements).toEqual([]);
  });

  it("opens the import dialog when rows from a spreadsheet are pasted", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <PartsTab store={store} />);
    fireEvent.paste(screen.getByLabelText("Notes for Shelf"), { clipboardData: { getData: () => "Name\tLength\tWidth\nTop\t30\t12\n" } });
    await userEvent.click(await screen.findByRole("button", { name: "Import 1 row" }));
    expect(current().project.parts.map((p) => p.name)).toEqual(["Side", "Shelf", "Top"]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("treats text with a tab or a line break as table text", () => {
    expect(isTableText("Top\t30")).toBe(true);
    expect(isTableText("a\nb")).toBe(true);
    expect(isTableText("  12 1/2  \n")).toBe(false);
  });
});
```

Create `apps/web/test/screens.test.tsx`:

```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SettingsDrawer } from "../src/screens/SettingsDrawer.tsx";
import { StockTab } from "../src/screens/StockTab.tsx";
import { ToolsTab } from "../src/screens/ToolsTab.tsx";
import { DEFAULT_PREFS } from "../src/state/prefs.ts";
import { openStorage } from "../src/storage/db.ts";
import { sampleProject } from "./helpers.ts";
import { renderWithStore } from "./render.tsx";

describe("StockTab", () => {
  it("keeps a material that parts use, and deleting stock removes its sheets", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <StockTab store={store} />);
    expect(screen.getByRole("button", { name: "Delete material Plywood" })).toHaveProperty("disabled", true);
    await userEvent.click(screen.getByRole("button", { name: "Delete stock ply-4x8" }));
    expect(current().project.stock).toEqual([]);
    expect(current().project.plan!.sheets).toEqual([]);
  });

  it("adds stock, and an unused material can be deleted", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <StockTab store={store} />);
    await userEvent.click(screen.getByRole("button", { name: "Add material" }));
    const added = current().project.materials[1]!;
    await userEvent.click(screen.getByRole("button", { name: `Delete material ${added.name}` }));
    expect(current().project.materials.map((m) => m.id)).toEqual(["ply"]);
    await userEvent.click(screen.getByRole("button", { name: "Add stock" }));
    expect(current().project.stock).toHaveLength(2);
  });
});

describe("ToolsTab", () => {
  it("adds a track saw, moves it first, and saves the tools as a profile", async () => {
    const storage = await openStorage(indexedDB);
    const { current } = renderWithStore(sampleProject(), (store) => <ToolsTab store={store} storage={storage} />);
    await userEvent.selectOptions(screen.getByLabelText("Type"), "track-saw");
    await userEvent.click(screen.getByRole("button", { name: "Add tool" }));
    const track = current().project.tools[1]!;
    expect(track.type).toBe("track-saw");
    await userEvent.click(screen.getByRole("button", { name: `Move ${track.name} up` }));
    expect(current().project.tools.map((t) => t.type)).toEqual(["track-saw", "table-saw"]);
    await userEvent.type(screen.getByLabelText("Profile name"), "Garage");
    await userEvent.click(screen.getByRole("button", { name: "Save tools as profile" }));
    await waitFor(async () => expect((await storage.listProfiles()).map((p) => [p.name, p.units, p.tools.length])).toEqual([["Garage", "in", 2]]));
  });

  it("uses a millimetre profile in an inch project and converts the kerf", async () => {
    const storage = await openStorage(indexedDB);
    await storage.saveProfile({ name: "Metric", units: "mm", tools: [{ id: "t", name: "Track", type: "track-saw", kerf: 2.54, enabled: true }] });
    const { current } = renderWithStore(sampleProject(), (store) => <ToolsTab store={store} storage={storage} />);
    await userEvent.click(await screen.findByRole("button", { name: "Use profile" }));
    expect(current().project.tools).toEqual([{ id: "t", name: "Track", type: "track-saw", kerf: 0.1, enabled: true }]);
    expect(screen.getByRole("status").textContent).toContain("Metric");
  });
});

describe("SettingsDrawer", () => {
  it("converts the project to millimetres and turns a feature off", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <SettingsDrawer store={store} prefs={DEFAULT_PREFS} onPrefs={() => undefined} onClose={() => undefined} />);
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    await userEvent.selectOptions(within(dialog).getByLabelText("Units"), "mm");
    expect(current().project.project.units).toBe("mm");
    expect(current().project.parts[0]!.length).toBe(762);
    expect(current().project.tools[0]!.kerf).toBe(3.175);
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /^Grain/ }));
    expect(current().project.settings.features.grain).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root apps/web test/PartsTab.test.tsx test/screens.test.tsx`

Expected: FAIL — the modules under test do not exist yet (`Failed to resolve import` / `Cannot find module`).

- [ ] **Step 3: Write the code**

Create `apps/web/src/screens/area.ts`:

```ts
import type { Units } from "@opencutplan/core";

export function formatArea(area: number, units: Units): string {
  return units === "in" ? `${(area / 144).toFixed(1)} sq ft` : `${(area / 1_000_000).toFixed(2)} m²`;
}
```

Create `apps/web/src/screens/PartsTab.tsx`:

```tsx
import type { Grain, Project } from "@opencutplan/core";
import { useState, type ClipboardEvent } from "react";
import { CsvImportDialog } from "../components/CsvImportDialog.tsx";
import { LengthInput, NumberInput, TextInput } from "../components/fields.tsx";
import { addPart, removePart, updatePart } from "../edit/parts.ts";
import type { ProjectStore } from "../state/useProject.ts";
import { chooseFile } from "../storage/files.ts";
import { formatArea } from "./area.ts";

const GRAINS: readonly { value: Grain; label: string }[] = [
  { value: "length", label: "Along length" },
  { value: "width", label: "Along width" },
  { value: "none", label: "None" },
];

/** Text with a tab or a line break came from a spreadsheet, not from typing in one cell. */
export function isTableText(text: string): boolean {
  return /[\t\n]/.test(text.trim());
}

export function PartsTab({ store }: { store: ProjectStore }) {
  const { project, edit } = store;
  const [importing, setImporting] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const units = project.project.units;
  const display = project.settings.display;

  const onPaste = (event: ClipboardEvent) => {
    const text = event.clipboardData.getData("text/plain");
    if (!isTableText(text)) return;
    event.preventDefault();
    setImporting(text);
  };

  const totals = new Map<string, { copies: number; area: number }>();
  for (const part of project.parts) {
    const total = totals.get(part.material) ?? { copies: 0, area: 0 };
    total.copies += part.quantity;
    total.area += part.quantity * part.length * part.width;
    totals.set(part.material, total);
  }

  return (
    <section aria-labelledby="parts-title" onPaste={onPaste}>
      <div className="toolbar">
        <h2 id="parts-title">Parts</h2>
        <button
          type="button"
          className="primary"
          onClick={() => {
            const result = addPart(project);
            edit(result.project);
            setFocusId(result.id);
          }}
        >
          Add part
        </button>
        <button type="button" onClick={() => setImporting("")}>
          Paste rows…
        </button>
        <button
          type="button"
          onClick={async () => {
            const file = await chooseFile(".csv,.tsv,.txt,text/csv");
            if (file) setImporting(await file.text());
          }}
        >
          Import CSV…
        </button>
      </div>
      {project.parts.length === 0 ? (
        <p className="muted">No parts yet. Add a part, or paste rows from a spreadsheet (name, length, width, quantity…).</p>
      ) : (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Length</th>
                <th scope="col">Width</th>
                <th scope="col">Qty</th>
                <th scope="col">Material</th>
                <th scope="col">Grain</th>
                <th scope="col">Group</th>
                <th scope="col">Notes</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {project.parts.map((part) => {
                const change = (patch: Parameters<typeof updatePart>[2]) => edit((p: Project) => updatePart(p, part.id, patch));
                return (
                  <tr key={part.id}>
                    <td>
                      <TextInput aria-label={`Name of ${part.name}`} value={part.name} required autoFocus={focusId === part.id} onChange={(name) => change({ name })} />
                    </td>
                    <td>
                      <LengthInput aria-label={`Length of ${part.name}`} value={part.length} units={units} display={display} onChange={(length) => length !== undefined && change({ length })} />
                    </td>
                    <td>
                      <LengthInput aria-label={`Width of ${part.name}`} value={part.width} units={units} display={display} onChange={(width) => width !== undefined && change({ width })} />
                    </td>
                    <td>
                      <NumberInput
                        aria-label={`Quantity of ${part.name}`}
                        className="narrow"
                        value={part.quantity}
                        integer
                        minimum={1}
                        onChange={(quantity) => quantity !== undefined && change({ quantity })}
                      />
                    </td>
                    <td>
                      <select aria-label={`Material of ${part.name}`} value={part.material} onChange={(event) => change({ material: event.target.value })}>
                        {project.materials.map((material) => (
                          <option key={material.id} value={material.id}>
                            {material.name}
                          </option>
                        ))}
                        {!project.materials.some((material) => material.id === part.material) && <option value={part.material}>{part.material} (missing)</option>}
                      </select>
                    </td>
                    <td>
                      <select aria-label={`Grain of ${part.name}`} value={part.grain} onChange={(event) => change({ grain: event.target.value as Grain })}>
                        {GRAINS.map((grain) => (
                          <option key={grain.value} value={grain.value}>
                            {grain.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <TextInput aria-label={`Group of ${part.name}`} value={part.group ?? ""} onChange={(group) => change({ group: group || undefined })} />
                    </td>
                    <td>
                      <TextInput aria-label={`Notes for ${part.name}`} value={part.notes ?? ""} onChange={(notes) => change({ notes: notes || undefined })} />
                    </td>
                    <td>
                      <button type="button" aria-label={`Delete ${part.name}`} onClick={() => edit((p) => removePart(p, part.id))}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {totals.size > 0 && (
        <ul className="totals" aria-label="Totals">
          {[...totals].map(([material, total]) => (
            <li key={material}>
              {project.materials.find((m) => m.id === material)?.name ?? material}: {total.copies}{" "}
              {total.copies === 1 ? "piece" : "pieces"}, {formatArea(total.area, units)}
            </li>
          ))}
        </ul>
      )}
      {importing !== null && (
        <CsvImportDialog
          kind="parts"
          text={importing}
          project={project}
          onImport={(next) => {
            edit(next);
            setImporting(null);
          }}
          onClose={() => setImporting(null)}
        />
      )}
    </section>
  );
}
```

Create `apps/web/src/screens/StockTab.tsx`:

```tsx
import { formatLength, type StockKind } from "@opencutplan/core";
import { useState } from "react";
import { CsvImportDialog } from "../components/CsvImportDialog.tsx";
import { LengthInput, NumberInput, TextInput } from "../components/fields.tsx";
import { addMaterial, addStock, materialInUse, removeMaterial, removeStock, updateMaterial, updateStock } from "../edit/stock.ts";
import type { ProjectStore } from "../state/useProject.ts";
import { chooseFile } from "../storage/files.ts";
import { isTableText } from "./PartsTab.tsx";

export function StockTab({ store }: { store: ProjectStore }) {
  const { project, edit } = store;
  const [importing, setImporting] = useState<string | null>(null);
  const units = project.project.units;
  const display = project.settings.display;
  const currency = project.settings.currency;

  return (
    <div
      className="stock-tab"
      onPaste={(event) => {
        const text = event.clipboardData.getData("text/plain");
        if (!isTableText(text)) return;
        event.preventDefault();
        setImporting(text);
      }}
    >
      <section aria-labelledby="materials-title">
        <div className="toolbar">
          <h2 id="materials-title">Materials</h2>
          <button type="button" onClick={() => edit(addMaterial)}>
            Add material
          </button>
        </div>
        {project.materials.length === 0 ? (
          <p className="muted">No materials yet. Adding stock or parts adds one.</p>
        ) : (
          <table className="grid">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Thickness</th>
                <th scope="col">Grained</th>
                <th scope="col">Colour</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {project.materials.map((material) => {
                const used = materialInUse(project, material.id);
                return (
                  <tr key={material.id}>
                    <td>
                      <TextInput aria-label={`Name of material ${material.name}`} value={material.name} required onChange={(name) => edit((p) => updateMaterial(p, material.id, { name }))} />
                    </td>
                    <td>
                      <LengthInput
                        aria-label={`Thickness of ${material.name}`}
                        value={material.thickness}
                        units={units}
                        display={display}
                        onChange={(thickness) => thickness !== undefined && edit((p) => updateMaterial(p, material.id, { thickness }))}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${material.name} has grain`}
                        checked={material.grained}
                        onChange={(event) => edit((p) => updateMaterial(p, material.id, { grained: event.target.checked }))}
                      />
                    </td>
                    <td>
                      <input
                        type="color"
                        aria-label={`Colour of ${material.name}`}
                        value={material.color ?? "#d9c9a3"}
                        onChange={(event) => edit((p) => updateMaterial(p, material.id, { color: event.target.value }), `material-color:${material.id}`)}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        aria-label={`Delete material ${material.name}`}
                        disabled={used}
                        title={used ? "Parts or stock use this material." : undefined}
                        onClick={() => edit((p) => removeMaterial(p, material.id))}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="stock-title">
        <div className="toolbar">
          <h2 id="stock-title">Stock</h2>
          <button type="button" className="primary" onClick={() => edit(addStock)}>
            Add stock
          </button>
          <button type="button" onClick={() => setImporting("")}>
            Paste rows…
          </button>
          <button
            type="button"
            onClick={async () => {
              const file = await chooseFile(".csv,.tsv,.txt,text/csv");
              if (file) setImporting(await file.text());
            }}
          >
            Import CSV…
          </button>
        </div>
        {project.stock.length === 0 ? (
          <p className="muted">No stock yet. Add the sheets you can buy and the offcuts you own.</p>
        ) : (
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Material</th>
                  <th scope="col">Length</th>
                  <th scope="col">Width</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Cost ({currency})</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Trim</th>
                  <th scope="col">Use</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {project.stock.map((stock) => {
                  const label = stock.name ?? stock.id;
                  const change = (patch: Parameters<typeof updateStock>[2]) => edit((p) => updateStock(p, stock.id, patch));
                  return (
                    <tr key={stock.id}>
                      <td>
                        <TextInput aria-label={`Name of stock ${label}`} placeholder={stock.id} value={stock.name ?? ""} onChange={(name) => change({ name: name || undefined })} />
                      </td>
                      <td>
                        <select aria-label={`Material of stock ${label}`} value={stock.material} onChange={(event) => change({ material: event.target.value })}>
                          {project.materials.map((material) => (
                            <option key={material.id} value={material.id}>
                              {material.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <LengthInput aria-label={`Length of stock ${label}`} value={stock.length} units={units} display={display} onChange={(length) => length !== undefined && change({ length })} />
                      </td>
                      <td>
                        <LengthInput aria-label={`Width of stock ${label}`} value={stock.width} units={units} display={display} onChange={(width) => width !== undefined && change({ width })} />
                      </td>
                      <td>
                        <NumberInput
                          aria-label={`Quantity of stock ${label}`}
                          className="narrow"
                          placeholder="Unlimited"
                          value={stock.quantity ?? undefined}
                          integer
                          minimum={1}
                          optional
                          onChange={(quantity) => change({ quantity: quantity ?? null })}
                        />
                      </td>
                      <td>
                        <NumberInput aria-label={`Cost of stock ${label}`} className="narrow" value={stock.cost} optional onChange={(cost) => change({ cost })} />
                      </td>
                      <td>
                        <select aria-label={`Kind of stock ${label}`} value={stock.kind} onChange={(event) => change({ kind: event.target.value as StockKind })}>
                          <option value="sheet">Sheet to buy</option>
                          <option value="offcut">Offcut I own</option>
                        </select>
                      </td>
                      <td>
                        <LengthInput
                          aria-label={`Trim of stock ${label}`}
                          className="narrow"
                          placeholder={formatLength(project.settings.trim, units, display)}
                          value={stock.trim}
                          units={units}
                          display={display}
                          optional
                          allowZero
                          onChange={(trim) => change({ trim })}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Use stock ${label}`}
                          checked={stock.enabled !== false}
                          onChange={(event) => change({ enabled: event.target.checked ? undefined : false })}
                        />
                      </td>
                      <td>
                        <button type="button" aria-label={`Delete stock ${label}`} onClick={() => edit((p) => removeStock(p, stock.id))}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {importing !== null && (
        <CsvImportDialog
          kind="stock"
          text={importing}
          project={project}
          onImport={(next) => {
            edit(next);
            setImporting(null);
          }}
          onClose={() => setImporting(null)}
        />
      )}
    </div>
  );
}
```

Create `apps/web/src/screens/ToolsTab.tsx`:

```tsx
import type { Tool, ToolType } from "@opencutplan/core";
import { useEffect, useState } from "react";
import { LengthInput, NumberInput, TextInput } from "../components/fields.tsx";
import { addTool, moveTool, removeTool, TOOL_TYPE_NAMES, TOOL_TYPES, updateTool } from "../edit/tools.ts";
import { convertTool } from "../edit/units.ts";
import type { ProjectStore } from "../state/useProject.ts";
import type { Storage, ToolProfile } from "../storage/db.ts";

type Limit = "maxRip" | "maxCrosscut" | "maxCut";

const LIMIT_LABELS: Readonly<Record<Limit, string>> = {
  maxRip: "Widest rip",
  maxCrosscut: "Longest crosscut",
  maxCut: "Longest cut",
};

const TYPE_LIMITS: Readonly<Record<ToolType, readonly Limit[]>> = {
  "table-saw": ["maxRip", "maxCrosscut"],
  "track-saw": ["maxCut"],
  "circular-saw": ["maxCut"],
  "panel-saw": ["maxCut"],
};

function setLimit(tool: Tool, key: string, value: number | undefined): Tool {
  const next: Record<string, unknown> = { ...tool };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next as Tool;
}

/** A largest piece needs both sizes: setting one fills the other with the same value, and clearing one clears both. */
function setMaxPiece(tool: Tool, length: number | undefined, width: number | undefined): Tool {
  return length === undefined || width === undefined ? setLimit(tool, "maxPiece", undefined) : ({ ...tool, maxPiece: { length, width } } as Tool);
}

interface ToolsTabProps {
  store: ProjectStore;
  storage: Storage;
}

export function ToolsTab({ store, storage }: ToolsTabProps) {
  const { project, edit } = store;
  const units = project.project.units;
  const display = project.settings.display;
  const [type, setType] = useState<ToolType>("table-saw");
  const [profiles, setProfiles] = useState<ToolProfile[]>([]);
  const [profileName, setProfileName] = useState("");
  const [chosen, setChosen] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const refresh = () =>
    storage.listProfiles().then(
      (list) => setProfiles(list),
      (e: unknown) => setStatus(`The saved profiles could not be read: ${(e as Error).message}`),
    );
  useEffect(() => {
    void refresh();
  }, [storage]);

  const profile = profiles.find((p) => p.name === chosen) ?? profiles[0];

  return (
    <div className="tools-tab">
      <section aria-labelledby="tools-title">
        <div className="toolbar">
          <h2 id="tools-title">Tools</h2>
          <label className="inline">
            Type
            <select value={type} onChange={(event) => setType(event.target.value as ToolType)}>
              {TOOL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TOOL_TYPE_NAMES[t]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="primary" onClick={() => edit((p) => addTool(p, type))}>
            Add tool
          </button>
        </div>
        <p className="muted">Each cut goes to the first enabled tool in this list that can make it. Leave a limit blank for no limit.</p>
        {project.tools.length === 0 && <p className="error">✖ No tools yet. Add a tool so the plan can be cut.</p>}
        <ol className="tool-list">
          {project.tools.map((tool, index) => {
            const change = (next: (t: Tool) => Tool) => edit((p) => updateTool(p, tool.id, next));
            return (
              <li key={tool.id} className={tool.enabled ? "" : "disabled"}>
                <fieldset>
                  <legend>
                    {index + 1}. {TOOL_TYPE_NAMES[tool.type]}
                  </legend>
                  <div className="tool-fields">
                    <label className="stack">
                      Name
                      <TextInput value={tool.name} required onChange={(name) => change((t) => ({ ...t, name }))} />
                    </label>
                    <label className="stack">
                      Kerf
                      <LengthInput value={tool.kerf} units={units} display={display} allowZero onChange={(kerf) => kerf !== undefined && change((t) => ({ ...t, kerf }))} />
                    </label>
                    {TYPE_LIMITS[tool.type].map((key) => (
                      <label className="stack" key={key}>
                        {LIMIT_LABELS[key]}
                        <LengthInput
                          value={(tool as Partial<Record<Limit, number>>)[key]}
                          units={units}
                          display={display}
                          optional
                          placeholder="No limit"
                          onChange={(value) => change((t) => setLimit(t, key, value))}
                        />
                      </label>
                    ))}
                    {tool.type === "table-saw" && (
                      <>
                        <label className="stack">
                          Largest piece, length
                          <LengthInput
                            value={tool.maxPiece?.length}
                            units={units}
                            display={display}
                            optional
                            placeholder="No limit"
                            onChange={(length) => change((t) => setMaxPiece(t, length, length === undefined ? undefined : (tool.maxPiece?.width ?? length)))}
                          />
                        </label>
                        <label className="stack">
                          Largest piece, width
                          <LengthInput
                            value={tool.maxPiece?.width}
                            units={units}
                            display={display}
                            optional
                            placeholder="No limit"
                            onChange={(width) => change((t) => setMaxPiece(t, width === undefined ? undefined : (tool.maxPiece?.length ?? width), width))}
                          />
                        </label>
                      </>
                    )}
                    {tool.type === "panel-saw" && (
                      <label className="stack">
                        Most cut stages
                        <NumberInput value={tool.maxStages} integer minimum={1} optional placeholder="No limit" onChange={(value) => change((t) => setLimit(t, "maxStages", value))} />
                      </label>
                    )}
                    <label className="inline">
                      <input type="checkbox" checked={tool.enabled} onChange={(event) => change((t) => ({ ...t, enabled: event.target.checked }))} />
                      Enabled
                    </label>
                  </div>
                  <div className="buttons">
                    <button type="button" disabled={index === 0} onClick={() => edit((p) => moveTool(p, tool.id, -1))} aria-label={`Move ${tool.name} up`}>
                      ↑ Up
                    </button>
                    <button type="button" disabled={index === project.tools.length - 1} onClick={() => edit((p) => moveTool(p, tool.id, 1))} aria-label={`Move ${tool.name} down`}>
                      ↓ Down
                    </button>
                    <button type="button" onClick={() => edit((p) => removeTool(p, tool.id))} aria-label={`Delete ${tool.name}`}>
                      Delete
                    </button>
                  </div>
                </fieldset>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="profiles-title">
        <h2 id="profiles-title">Tool profiles</h2>
        <p className="muted">A profile keeps a set of tools in this browser, so you can use it in other projects.</p>
        <div className="toolbar">
          <label className="inline">
            Profile name
            <input type="text" value={profileName} onChange={(event) => setProfileName(event.target.value)} />
          </label>
          <button
            type="button"
            disabled={profileName.trim() === "" || project.tools.length === 0}
            onClick={async () => {
              const name = profileName.trim();
              try {
                await storage.saveProfile({ name, units, tools: project.tools });
                setStatus(`Saved the profile “${name}”.`);
                setProfileName("");
                setChosen(name);
                await refresh();
              } catch (e) {
                setStatus(`The profile could not be saved: ${(e as Error).message}`);
              }
            }}
          >
            Save tools as profile
          </button>
        </div>
        {profiles.length > 0 && (
          <div className="toolbar">
            <label className="inline">
              Saved profiles
              <select value={profile?.name ?? ""} onChange={(event) => setChosen(event.target.value)}>
                {profiles.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.tools.length} {p.tools.length === 1 ? "tool" : "tools"})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!profile}
              onClick={() => {
                if (!profile) return;
                edit((p) => ({ ...p, tools: profile.tools.map((tool) => convertTool(tool, profile.units, units)) }));
                setStatus(`The project now uses the tools from “${profile.name}”.`);
              }}
            >
              Use profile
            </button>
            <button
              type="button"
              disabled={!profile}
              onClick={async () => {
                if (!profile) return;
                await storage.deleteProfile(profile.name);
                setStatus(`Deleted the profile “${profile.name}”.`);
                await refresh();
              }}
            >
              Delete profile
            </button>
          </div>
        )}
        {status && <p role="status">{status}</p>}
      </section>
    </div>
  );
}
```

Create `apps/web/src/screens/SettingsDrawer.tsx`:

```tsx
import {
  DEFAULT_MIN_OFFCUT,
  FEATURE_KEYS,
  type Features,
  type InchPrecision,
  type MmPrecision,
  type Project,
  type Settings,
  type Units,
} from "@opencutplan/core";
import { Dialog } from "../components/Dialog.tsx";
import { LengthInput, NumberInput, TextInput } from "../components/fields.tsx";
import { convertProjectUnits } from "../edit/units.ts";
import type { ViewPrefs } from "../state/prefs.ts";
import type { ProjectStore } from "../state/useProject.ts";

export const FEATURE_TEXT: Readonly<Record<keyof Features, { label: string; detail: string }>> = {
  grain: { label: "Grain", detail: "Keep each part's grain along the sheet grain. Off: every part may turn." },
  kerf: { label: "Kerf", detail: "Leave one saw kerf between parts. Off: the kerf is 0." },
  trim: { label: "Edge trim", detail: "Cut off the factory edges of each sheet. Off: no trim." },
  cutOrder: { label: "Cut order", detail: "Show cut lines and the cut sequence, and check that every part can be cut free." },
  toolLimits: { label: "Tool limits", detail: "Keep each cut inside its tool's limits." },
  offcuts: { label: "Offcuts", detail: "List the usable offcuts that the plan leaves." },
  cost: { label: "Cost", detail: "Use stock prices. Off: the optimizer uses sheet area." },
  labels: { label: "Labels", detail: "Make a label for each part." },
  snapping: { label: "Snapping", detail: "Snap dragged parts to edges and neighbours. Hold Alt (⌥) to drag without it." },
};

const INCH_STEPS: readonly { value: InchPrecision; label: string }[] = [
  { value: 8, label: '1/8"' },
  { value: 16, label: '1/16"' },
  { value: 32, label: '1/32"' },
  { value: 64, label: '1/64"' },
  { value: "decimal", label: "Decimal inches" },
];
const MM_STEPS: readonly MmPrecision[] = [1, 0.5, 0.1];

interface SettingsDrawerProps {
  store: ProjectStore;
  prefs: ViewPrefs;
  onPrefs(prefs: ViewPrefs): void;
  onClose(): void;
}

export function SettingsDrawer({ store, prefs, onPrefs, onClose }: SettingsDrawerProps) {
  const { project, edit } = store;
  const { settings } = project;
  const units = project.project.units;
  const display = settings.display;
  const set = (change: (settings: Settings) => Settings, key?: string) => edit((p: Project) => ({ ...p, settings: change(p.settings) }), key);
  const minOffcut = settings.minOffcut ?? DEFAULT_MIN_OFFCUT[units];

  return (
    <Dialog title="Settings" onClose={onClose} drawer>
      <fieldset>
        <legend>Features</legend>
        {FEATURE_KEYS.map((key) => (
          <label key={key} className="switch">
            <input
              type="checkbox"
              checked={settings.features[key]}
              onChange={(event) => set((s) => ({ ...s, features: { ...s.features, [key]: event.target.checked } }))}
            />
            <span>
              <b>{FEATURE_TEXT[key].label}</b>
              <small>{FEATURE_TEXT[key].detail}</small>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Units and precision</legend>
        <label className="stack">
          Units
          <select value={units} onChange={(event) => edit((p) => convertProjectUnits(p, event.target.value as Units))}>
            <option value="in">Inches</option>
            <option value="mm">Millimetres</option>
          </select>
        </label>
        {units === "in" ? (
          <label className="stack">
            Show lengths to
            <select
              value={String(display.inch)}
              onChange={(event) => {
                const value = event.target.value === "decimal" ? "decimal" : (Number(event.target.value) as InchPrecision);
                set((s) => ({ ...s, display: { ...s.display, inch: value } }));
              }}
            >
              {INCH_STEPS.map((step) => (
                <option key={step.value} value={String(step.value)}>
                  {step.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="stack">
            Show lengths to
            <select value={String(display.mm)} onChange={(event) => set((s) => ({ ...s, display: { ...s.display, mm: Number(event.target.value) as MmPrecision } }))}>
              {MM_STEPS.map((step) => (
                <option key={step} value={String(step)}>
                  {step} mm
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>

      <fieldset>
        <legend>Plan</legend>
        <label className="stack">
          Cut order
          <select value={settings.orderMode} onChange={(event) => set((s) => ({ ...s, orderMode: event.target.value as Settings["orderMode"] }))}>
            <option value="sheet">Sheet by sheet</option>
            <option value="setup">Group cuts with the same saw setting</option>
          </select>
        </label>
        <label className="stack">
          Edge trim
          <LengthInput value={settings.trim} units={units} display={display} allowZero onChange={(trim) => trim !== undefined && set((s) => ({ ...s, trim }))} />
        </label>
        <div className="pair">
          <label className="stack">
            Smallest offcut, length
            <LengthInput
              value={minOffcut.length}
              units={units}
              display={display}
              onChange={(length) => length !== undefined && set((s) => ({ ...s, minOffcut: { ...minOffcut, length } }))}
            />
          </label>
          <label className="stack">
            Smallest offcut, width
            <LengthInput
              value={minOffcut.width}
              units={units}
              display={display}
              onChange={(width) => width !== undefined && set((s) => ({ ...s, minOffcut: { ...minOffcut, width } }))}
            />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Optimizer</legend>
        <label className="stack">
          Search time (seconds)
          <NumberInput
            value={settings.optimizer.timeLimitMs / 1000}
            minimum={0.1}
            onChange={(seconds) => seconds !== undefined && set((s) => ({ ...s, optimizer: { ...s.optimizer, timeLimitMs: Math.max(1, Math.round(seconds * 1000)) } }))}
          />
        </label>
        <label className="stack">
          Seed (blank for the default)
          <NumberInput
            value={settings.optimizer.seed}
            integer
            optional
            onChange={(seed) =>
              set((s) => {
                const { seed: _old, ...optimizer } = s.optimizer;
                return { ...s, optimizer: seed === undefined ? optimizer : { ...optimizer, seed } };
              })
            }
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>Money</legend>
        <label className="stack">
          Currency (3-letter code)
          <TextInput
            value={settings.currency}
            maxLength={3}
            valid={(text) => /^[A-Za-z]{3}$/.test(text)}
            onChange={(currency) => set((s) => ({ ...s, currency: currency.toUpperCase() }))}
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>View (this browser only)</legend>
        <label className="switch">
          <input type="checkbox" checked={prefs.showCuts} onChange={(event) => onPrefs({ ...prefs, showCuts: event.target.checked })} />
          <span>
            <b>Show cut lines</b>
          </span>
        </label>
        <label className="switch">
          <input type="checkbox" checked={prefs.showKerf} onChange={(event) => onPrefs({ ...prefs, showKerf: event.target.checked })} />
          <span>
            <b>Draw cut lines at kerf width</b>
          </span>
        </label>
      </fieldset>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run --root apps/web test/PartsTab.test.tsx test/screens.test.tsx`

Expected: PASS — 10 tests.

- [ ] **Step 5: Run the full check**

Run: `npm run check` from the repo root.

Expected: the typecheck is clean (core, examples, and `apps/web`); core has 351 tests and the web app has 50 tests, all passing.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/screens/PartsTab.tsx apps/web/src/screens/SettingsDrawer.tsx apps/web/src/screens/StockTab.tsx apps/web/src/screens/ToolsTab.tsx apps/web/src/screens/area.ts apps/web/test/PartsTab.test.tsx apps/web/test/screens.test.tsx
git commit -m "feat(web): add the parts, stock, tools, and settings screens" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Layout editor

**Files:**
- Create: `apps/web/src/layout/snap.ts`
- Create: `apps/web/src/layout/colors.ts`
- Create: `apps/web/src/layout/SheetView.tsx`
- Create: `apps/web/src/layout/Tray.tsx`
- Create: `apps/web/src/layout/IssueList.tsx`
- Create: `apps/web/src/layout/Inspector.tsx`
- Create: `apps/web/src/layout/LayoutTab.tsx`
- Test: `apps/web/test/snap.test.ts`
- Test: `apps/web/test/LayoutTab.test.tsx`

**Interfaces:**
- Consumes: `@opencutplan/core`: `analyzeProject`, `contains`, `copyLabel`, `formatSize`, `grainOk`, `materialName`, `placedRect`, `PlanContext`, `PlanIssue`, `PlanSheet`, `Project`, `ProjectAnalysis`, `Rect`, `Size`, `Step`, `stockLabel`, `UnplacedReason`, `usableRect`. Task 1: `ProjectStore`, `useProject`, `ViewPrefs`, `DEFAULT_PREFS`. Task 2: `src/edit/layout.ts`. Task 4: `LengthInput`. Task 5: `OptimizeRuns`, `useOptimizeRuns`, `inProcessWorkers()`.
- Produces:
  - `src/layout/snap.ts`: `interface SnapInput`; `function snapPosition(input: SnapInput): { x: number; y: number }`
  - `src/layout/colors.ts`: `const NO_GROUP_COLOR = "#d9d4c7";`; `const STAGE_COLORS = ["#c0392b", "#1a5fd0", "#7a4bb5", "#1e8449", "#b9770e"];`; `function groupColors(project: Project): Map<string, string>`; `function stageColor(stage: number): string`
  - `src/layout/SheetView.tsx`: `interface DropPreview`; `function copyKey(ref: CopyRef): string`; `function SheetView(props: SheetViewProps)`
  - `src/layout/Tray.tsx`: `const REASON_TEXT: Readonly<Record<UnplacedReason, string>> =`; `function Tray({ ctx, copies, colors, reasons, selected, dropping, onPointerDown, onSelect }: TrayProps)`
  - `src/layout/IssueList.tsx`: `function issueCopy(project: Project, issue: PlanIssue): CopyRef | null`; `function IssueList({ project, issues, onShow }: IssueListProps)`
  - `src/layout/Inspector.tsx`: `function Inspector({ ctx, project, selected, busy, message, onLocation, onMove, onRotate }: InspectorProps)`
  - `src/layout/LayoutTab.tsx`: `function nudgeStep(analysis: ProjectAnalysis, big: boolean): number`; `function LayoutTab({ store, analysis, prefs, runs }: LayoutTabProps)`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/snap.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { snapPosition } from "../src/layout/snap.ts";

const base = {
  size: { length: 10, width: 5 },
  sheet: { x: 0, y: 0, length: 96, width: 48 },
  usable: { x: 0.25, y: 0.25, length: 95.5, width: 47.5 },
  others: [{ x: 0.25, y: 0.25, length: 30, width: 12 }],
  kerf: 0.125,
  threshold: 1,
};

describe("snapPosition", () => {
  it("snaps to the trim line", () => {
    expect(snapPosition({ ...base, others: [], x: 0.6, y: 0.9 })).toEqual({ x: 0.25, y: 0.25 });
  });

  it("snaps to one kerf past a neighbour", () => {
    expect(snapPosition({ ...base, x: 30.9, y: 3 })).toEqual({ x: 30.375, y: 3 });
    expect(snapPosition({ ...base, x: 5, y: 12.8 })).toEqual({ x: 5, y: 12.375 });
  });

  it("snaps the far edge to the far trim line", () => {
    expect(snapPosition({ ...base, others: [], x: 85.2, y: 42.5 })).toEqual({ x: 85.75, y: 42.75 });
  });

  it("leaves a position alone when nothing is close", () => {
    expect(snapPosition({ ...base, x: 50, y: 20 })).toEqual({ x: 50, y: 20 });
  });

  it("picks the nearest line", () => {
    expect(snapPosition({ ...base, others: [{ x: 40, y: 30, length: 10, width: 10 }], x: 50.4, y: 20 }).x).toBe(50.125);
  });
});
```

Create `apps/web/test/LayoutTab.test.tsx`:

```tsx
import { analyzeProject, type Project } from "@opencutplan/core";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo } from "react";
import { describe, expect, it } from "vitest";
import { LayoutTab } from "../src/layout/LayoutTab.tsx";
import { useOptimizeRuns } from "../src/optimizer/useOptimizeRuns.ts";
import { DEFAULT_PREFS } from "../src/state/prefs.ts";
import { useProject, type ProjectStore } from "../src/state/useProject.ts";
import { inProcessWorkers, sampleProject } from "./helpers.ts";

function renderLayout(initial: Project = sampleProject()) {
  const factory = inProcessWorkers().factory;
  let latest: ProjectStore | null = null;
  function Harness() {
    const store = useProject(initial);
    latest = store;
    const analysis = useMemo(() => analyzeProject(store.project), [store.project]);
    const runs = useOptimizeRuns(store, factory);
    return <LayoutTab store={store} analysis={analysis} prefs={DEFAULT_PREFS} runs={runs} />;
  }
  render(<Harness />);
  return () => latest!;
}

const part = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name},`) });
const tray = () => screen.getByRole("region", { name: /Unplaced parts/ });

describe("LayoutTab", () => {
  it("turns a focused part with R and sends it to the tray with Delete", async () => {
    const current = renderLayout();
    part("Side 2").focus();
    await userEvent.keyboard("r");
    expect(current().project.plan!.sheets[0]!.placements[1]!.rotated).toBe(true);
    expect(document.activeElement).toBe(part("Side 2"));
    await userEvent.keyboard("{Delete}");
    expect(current().project.plan!.sheets[0]!.placements).toHaveLength(1);
    expect(within(tray()).getByRole("button", { name: /Side 2/ })).toBe(document.activeElement);
  });

  it("moves a focused part with the arrow keys and clears the selection with Escape", async () => {
    const current = renderLayout();
    part("Side 1").focus();
    await userEvent.keyboard("{ArrowDown}");
    const moved = current().project.plan!.sheets[0]!.placements[0]!;
    expect(moved.x).toBe(0.25);
    expect(moved.y).toBeGreaterThan(0.25);
    await userEvent.keyboard("{Escape}");
    expect(screen.getByText(/Select a part on a sheet or in the tray/)).toBeTruthy();
  });

  it("places a tray part on a sheet with the inspector, then moves it by typing X", async () => {
    const current = renderLayout();
    await userEvent.click(within(tray()).getByRole("button", { name: /Shelf/ }));
    await userEvent.selectOptions(screen.getByLabelText("Location"), "s1");
    expect(part("Shelf")).toBeTruthy();
    expect(within(tray()).queryByRole("button", { name: /Shelf/ })).toBeNull();
    const x = screen.getByLabelText("X (from the left)");
    await userEvent.clear(x);
    await userEvent.type(x, "50{Enter}");
    const shelf = current().project.plan!.sheets[0]!.placements.find((p) => p.part === "shelf")!;
    expect(shelf.x).toBe(50);
  });

  it("adds a sheet and removes empty sheets", async () => {
    const current = renderLayout();
    await userEvent.click(screen.getByRole("button", { name: "Add sheet" }));
    expect(current().project.plan!.sheets.map((s) => s.id)).toEqual(["s1", "s2"]);
    await userEvent.click(screen.getByRole("button", { name: "Remove empty sheets" }));
    expect(current().project.plan!.sheets.map((s) => s.id)).toEqual(["s1"]);
  });

  it("optimizes in a worker and applies a plan that places every part", async () => {
    const current = renderLayout();
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Optimize" }).hasAttribute("disabled")).toBe(false), { timeout: 10000 });
    expect(screen.getByText("Every part is on a sheet.")).toBeTruthy();
    expect(current().project.plan!.sheets.flatMap((s) => s.placements)).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Keep searching" }).hasAttribute("disabled")).toBe(false);
  }, 15000);

  it("stops a search and uses the best plan so far", async () => {
    const current = renderLayout();
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
    await userEvent.click(await screen.findByRole("button", { name: "Stop" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/^Stopped after/), { timeout: 5000 });
    expect(current().project.plan!.sheets.flatMap((s) => s.placements)).toHaveLength(3);
  });

  it("does not use a result when the project changed during the search", async () => {
    const current = renderLayout();
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
    await screen.findByRole("button", { name: "Stop" });
    act(() => current().edit((p) => ({ ...p, project: { ...p.project, name: "Changed" } })));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("The project changed while the optimizer ran"), { timeout: 10000 });
    expect(current().project.plan!.sheets.flatMap((s) => s.placements)).toHaveLength(2);
  }, 15000);

  it("offers Keep searching only while the layout is the one the search produced", async () => {
    renderLayout();
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
    await userEvent.click(await screen.findByRole("button", { name: "Stop" }));
    const keep = await screen.findByRole("button", { name: "Keep searching" });
    await waitFor(() => expect(keep.hasAttribute("disabled")).toBe(false));
    part("Shelf").focus();
    await userEvent.keyboard("r");
    expect(screen.getByRole("button", { name: "Keep searching" }).hasAttribute("disabled")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root apps/web test/snap.test.ts test/LayoutTab.test.tsx`

Expected: FAIL — the modules under test do not exist yet (`Failed to resolve import` / `Cannot find module`).

- [ ] **Step 3: Write the code**

Create `apps/web/src/layout/snap.ts`:

```ts
import type { Rect, Size } from "@opencutplan/core";

export interface SnapInput {
  x: number;
  y: number;
  size: Size;
  /** The whole sheet and the area inside the trim. */
  sheet: Rect;
  usable: Rect;
  others: readonly Rect[];
  kerf: number;
  /** The largest distance that snaps, in project units. */
  threshold: number;
}

function snapAxis(start: number, length: number, leading: number[], trailing: number[], threshold: number): number {
  let best = start;
  let bestDistance = threshold;
  const consider = (target: number) => {
    const distance = Math.abs(target - start);
    if (distance <= bestDistance) {
      best = target;
      bestDistance = distance;
    }
  };
  for (const line of leading) consider(line);
  for (const line of trailing) consider(line - length);
  return best;
}

/**
 * Snaps each axis on its own. The part's near edge snaps to the sheet edge, the trim line, a neighbour's far edge plus
 * one kerf, or a neighbour's near edge; its far edge snaps to the same lines from the other side.
 */
export function snapPosition(input: SnapInput): { x: number; y: number } {
  const { sheet, usable, others, kerf, size, threshold } = input;
  const x = snapAxis(
    input.x,
    size.length,
    [sheet.x, usable.x, ...others.flatMap((r) => [r.x + r.length + kerf, r.x])],
    [sheet.x + sheet.length, usable.x + usable.length, ...others.flatMap((r) => [r.x - kerf, r.x + r.length])],
    threshold,
  );
  const y = snapAxis(
    input.y,
    size.width,
    [sheet.y, usable.y, ...others.flatMap((r) => [r.y + r.width + kerf, r.y])],
    [sheet.y + sheet.width, usable.y + usable.width, ...others.flatMap((r) => [r.y - kerf, r.y + r.width])],
    threshold,
  );
  return { x, y };
}
```

Create `apps/web/src/layout/colors.ts`:

```ts
import type { Project } from "@opencutplan/core";

const PALETTE = ["#9cc3e6", "#f2c27b", "#a8d5a2", "#e6a6c7", "#c7b8ea", "#f4a582", "#b8e0d2", "#e8d27a"];
export const NO_GROUP_COLOR = "#d9d4c7";
export const STAGE_COLORS = ["#c0392b", "#1a5fd0", "#7a4bb5", "#1e8449", "#b9770e"];

/** One colour per part group, in the order groups first appear in the parts list. */
export function groupColors(project: Project): Map<string, string> {
  const colors = new Map<string, string>();
  for (const part of project.parts) {
    if (part.group !== undefined && !colors.has(part.group)) colors.set(part.group, PALETTE[colors.size % PALETTE.length]!);
  }
  return colors;
}

export function stageColor(stage: number): string {
  return STAGE_COLORS[(stage - 1) % STAGE_COLORS.length]!;
}
```

Create `apps/web/src/layout/SheetView.tsx`:

```tsx
import {
  copyLabel,
  formatSize,
  grainOk,
  placedRect,
  stockLabel,
  usableRect,
  type PlanContext,
  type PlanSheet,
  type Rect,
  type Step,
} from "@opencutplan/core";
import { useId, type PointerEvent } from "react";
import { sameCopy, type CopyRef } from "../edit/layout.ts";
import { NO_GROUP_COLOR, stageColor } from "./colors.ts";

export interface DropPreview {
  rect: Rect;
  bad: boolean;
}

interface SheetViewProps {
  ctx: PlanContext;
  sheet: PlanSheet;
  number: number;
  scale: number;
  steps: readonly Step[];
  colors: ReadonlyMap<string, string>;
  /** Placement indices with an error or a warning. */
  errors: ReadonlySet<number>;
  selected: CopyRef | null;
  dragging: CopyRef | null;
  preview: DropPreview | null;
  showCuts: boolean;
  showKerf: boolean;
  busy: boolean;
  onPartPointerDown(event: PointerEvent<SVGGElement>, ref: CopyRef): void;
  onSelect(ref: CopyRef): void;
  onTogglePin(): void;
  onRemove(): void;
}

export function copyKey(ref: CopyRef): string {
  return `${ref.part}#${ref.copy}`;
}

export function SheetView(props: SheetViewProps) {
  const { ctx, sheet, number, scale, steps, colors, errors, selected, dragging, preview, showCuts, showKerf, busy } = props;
  const uid = useId();
  const stock = ctx.stock.get(sheet.stock);
  const px = (value: number) => value * scale;
  const material = stock ? ctx.materials.get(stock.material) : undefined;
  const grained = ctx.features.grain && material?.grained === true;

  if (!stock) {
    return (
      <section className="sheet missing" aria-label={`Sheet ${number}`}>
        <p className="error">✖ Sheet {number} uses stock “{sheet.stock}”, which does not exist.</p>
        <button type="button" onClick={props.onRemove} disabled={busy}>
          Remove sheet
        </button>
      </section>
    );
  }

  const usable = usableRect(ctx, stock);
  const trim = usable.x;
  return (
    <section className="sheet" aria-label={`Sheet ${number}: ${stockLabel(ctx, stock)}`}>
      <header className="sheet-head">
        <span className="name">Sheet {number}</span>
        <span className="meta">{stockLabel(ctx, stock)}</span>
        <button type="button" aria-pressed={sheet.pinned === true} onClick={props.onTogglePin} disabled={busy} title="A pinned sheet keeps its layout when you optimize.">
          {sheet.pinned ? "📌 Pinned" : "Pin"}
        </button>
        <button type="button" onClick={props.onRemove} disabled={busy} aria-label={`Remove sheet ${number}`}>
          Remove
        </button>
      </header>
      <svg
        className="sheet-area"
        data-sheet={sheet.id}
        width={px(stock.length)}
        height={px(stock.width)}
        role="group"
        aria-label={`Sheet ${number} layout, ${formatSize(ctx, stock)}`}
      >
        <defs>
          <pattern id={`${uid}-h`} width="6" height="6" patternUnits="userSpaceOnUse">
            <line x1="0" y1="5.5" x2="6" y2="5.5" stroke="#00000022" />
          </pattern>
          <pattern id={`${uid}-v`} width="6" height="6" patternUnits="userSpaceOnUse">
            <line x1="5.5" y1="0" x2="5.5" y2="6" stroke="#00000022" />
          </pattern>
        </defs>
        <rect className="wood" x={0} y={0} width={px(stock.length)} height={px(stock.width)} />
        {grained && <rect x={0} y={0} width={px(stock.length)} height={px(stock.width)} fill={`url(#${uid}-h)`} />}
        {trim > 0 && <rect className="trim" x={px(usable.x)} y={px(usable.y)} width={px(usable.length)} height={px(usable.width)} />}
        {sheet.placements.map((placement, index) => {
          const part = ctx.parts.get(placement.part);
          if (!part) return null;
          const ref = { part: placement.part, copy: placement.copy };
          const rect = placedRect(part, placement);
          const label = copyLabel(part, placement.copy);
          const bad = errors.has(index);
          const striped = grained && part.grain !== "none";
          const horizontal = (part.grain === "length") !== placement.rotated;
          const cross = striped && !grainOk(ctx, part, placement.rotated);
          const isSelected = sameCopy(selected, ref);
          const size = formatSize(ctx, rect);
          const w = px(rect.length);
          const h = px(rect.width);
          const font = Math.max(8, Math.min(12, h / 3));
          return (
            <g
              key={`${copyKey(ref)}@${index}`}
              className={`part${bad ? " bad" : ""}${isSelected ? " selected" : ""}${sameCopy(dragging, ref) ? " dragging" : ""}`}
              data-copy-key={copyKey(ref)}
              transform={`translate(${px(rect.x)} ${px(rect.y)})`}
              tabIndex={0}
              role="button"
              aria-pressed={isSelected}
              aria-label={`${label}, ${size}${placement.rotated ? ", turned" : ""}${cross ? ", across the grain" : ""}${bad ? ", has a problem" : ""}`}
              onPointerDown={(event) => props.onPartPointerDown(event, ref)}
              onFocus={() => props.onSelect(ref)}
            >
              <rect className="fill" width={w} height={h} fill={(part.group !== undefined && colors.get(part.group)) || NO_GROUP_COLOR} />
              {striped && <rect width={w} height={h} fill={`url(#${uid}-${horizontal ? "h" : "v"})`} />}
              <rect className="outline" width={w} height={h} />
              {w > 28 && h > 14 && (
                <text x={w / 2} y={h / 2} fontSize={font} textAnchor="middle" dominantBaseline="middle">
                  <tspan x={w / 2} dy={h > 3 * font ? -font / 2 : 0}>
                    {bad ? "⚠ " : ""}
                    {label}
                    {cross ? " ⟂" : ""}
                  </tspan>
                  {h > 3 * font && (
                    <tspan x={w / 2} dy={font * 1.1} fontSize={font * 0.85}>
                      {size}
                    </tspan>
                  )}
                </text>
              )}
            </g>
          );
        })}
        {showCuts &&
          steps.map((step) => {
            const [x1, y1, x2, y2] = step.axis === "x" ? [step.at, step.from, step.at, step.to] : [step.from, step.at, step.to, step.at];
            const color = stageColor(step.stage);
            const mx = px((x1 + x2) / 2);
            const my = px((y1 + y2) / 2);
            return (
              <g key={step.step} className="cut" aria-hidden="true">
                <title>{`Step ${step.step}: ${step.kind}, stage ${step.stage}`}</title>
                <line
                  x1={px(x1)}
                  y1={px(y1)}
                  x2={px(x2)}
                  y2={px(y2)}
                  stroke={color}
                  strokeWidth={showKerf ? Math.max(1, px(ctx.kerf)) : 1.5}
                  strokeOpacity={showKerf ? 0.55 : 0.9}
                  strokeDasharray={step.kind === "trim" ? "4 3" : undefined}
                />
                <circle cx={mx} cy={my} r={8} fill="#fff" stroke={color} />
                <text x={mx} y={my} fontSize={9} textAnchor="middle" dominantBaseline="central" fill={color}>
                  {step.step}
                </text>
              </g>
            );
          })}
        {preview && (
          <rect
            className={`drop-preview${preview.bad ? " bad" : ""}`}
            x={px(preview.rect.x)}
            y={px(preview.rect.y)}
            width={px(preview.rect.length)}
            height={px(preview.rect.width)}
          />
        )}
      </svg>
    </section>
  );
}
```

Create `apps/web/src/layout/Tray.tsx`:

```tsx
import { copyLabel, formatSize, materialName, type PlanContext, type UnplacedReason } from "@opencutplan/core";
import type { PointerEvent } from "react";
import { sameCopy, type CopyRef } from "../edit/layout.ts";
import { NO_GROUP_COLOR } from "./colors.ts";
import { copyKey } from "./SheetView.tsx";

export const REASON_TEXT: Readonly<Record<UnplacedReason, string>> = {
  "too-large": "larger than every enabled stock",
  "no-stock": "no stock left",
  "no-tool": "no tool can make its cuts",
  "not-guillotine": "cannot be cut free",
};

interface TrayProps {
  ctx: PlanContext;
  copies: readonly CopyRef[];
  colors: ReadonlyMap<string, string>;
  reasons: ReadonlyMap<string, UnplacedReason>;
  selected: CopyRef | null;
  dropping: boolean;
  onPointerDown(event: PointerEvent<HTMLButtonElement>, ref: CopyRef): void;
  onSelect(ref: CopyRef): void;
}

export function Tray({ ctx, copies, colors, reasons, selected, dropping, onPointerDown, onSelect }: TrayProps) {
  const byMaterial = new Map<string, CopyRef[]>();
  for (const ref of copies) {
    const material = ctx.parts.get(ref.part)?.material ?? "";
    byMaterial.set(material, [...(byMaterial.get(material) ?? []), ref]);
  }
  return (
    <section className={`tray${dropping ? " dropping" : ""}`} data-tray="" aria-labelledby="tray-title">
      <h3 id="tray-title">
        Unplaced parts <span className="muted">({copies.length})</span>
      </h3>
      {copies.length === 0 && <p className="muted">Every part is on a sheet.</p>}
      {[...byMaterial].map(([material, refs]) => (
        <div key={material} className="tray-group">
          <h4>{materialName(ctx, material)}</h4>
          <ul>
            {refs.map((ref) => {
              const part = ctx.parts.get(ref.part)!;
              const reason = reasons.get(copyKey(ref));
              return (
                <li key={copyKey(ref)}>
                  <button
                    type="button"
                    className="tray-part"
                    data-copy-key={copyKey(ref)}
                    aria-pressed={sameCopy(selected, ref)}
                    onPointerDown={(event) => onPointerDown(event, ref)}
                    onClick={() => onSelect(ref)}
                    onFocus={() => onSelect(ref)}
                  >
                    <span className="swatch" style={{ background: (part.group !== undefined && colors.get(part.group)) || NO_GROUP_COLOR }} />
                    <b>{copyLabel(part, ref.copy)}</b> <span>{formatSize(ctx, part)}</span>
                    {reason && <span className="reason"> ⚠ {REASON_TEXT[reason]}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
```

Create `apps/web/src/layout/IssueList.tsx`:

```tsx
import type { PlanIssue, Project } from "@opencutplan/core";
import type { CopyRef } from "../edit/layout.ts";

/** The first part copy an issue points at, if any. */
export function issueCopy(project: Project, issue: PlanIssue): CopyRef | null {
  for (const ref of issue.refs) {
    if (ref.kind === "part") return { part: ref.part, copy: ref.copy };
    if (ref.kind === "placement") {
      const placement = project.plan?.sheets.find((sheet) => sheet.id === ref.sheet)?.placements[ref.index];
      if (placement) return { part: placement.part, copy: placement.copy };
    }
  }
  return null;
}

interface IssueListProps {
  project: Project;
  issues: readonly PlanIssue[];
  onShow(ref: CopyRef): void;
}

export function IssueList({ project, issues, onShow }: IssueListProps) {
  const sorted = [...issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));
  const errors = issues.filter((issue) => issue.severity === "error").length;
  return (
    <section aria-labelledby="issues-title">
      <h3 id="issues-title">
        Problems <span className="muted">({errors} {errors === 1 ? "error" : "errors"}, {issues.length - errors} {issues.length - errors === 1 ? "warning" : "warnings"})</span>
      </h3>
      {issues.length === 0 && <p className="ok">✔ The layout has no problems.</p>}
      <ul className="issues">
        {sorted.map((issue, index) => {
          const ref = issueCopy(project, issue);
          return (
            <li key={index} className={issue.severity}>
              <span aria-hidden="true">{issue.severity === "error" ? "✖ " : "⚠ "}</span>
              <span className="visually-hidden">{issue.severity === "error" ? "Error: " : "Warning: "}</span>
              {issue.message}
              {ref && (
                <button type="button" className="link" onClick={() => onShow(ref)}>
                  Show
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

Create `apps/web/src/layout/Inspector.tsx`:

```tsx
import { copyLabel, formatSize, materialName, placedRect, stockLabel, type PlanContext, type Project } from "@opencutplan/core";
import { LengthInput } from "../components/fields.tsx";
import { findCopy, type CopyRef } from "../edit/layout.ts";

interface InspectorProps {
  ctx: PlanContext;
  project: Project;
  selected: CopyRef | null;
  busy: boolean;
  message: string | null;
  onLocation(sheet: string | null): void;
  onMove(x: number, y: number): void;
  onRotate(): void;
}

const GRAIN_TEXT = { length: "along the length", width: "along the width", none: "none (may turn)" } as const;

export function Inspector({ ctx, project, selected, busy, message, onLocation, onMove, onRotate }: InspectorProps) {
  const part = selected ? ctx.parts.get(selected.part) : undefined;
  if (!selected || !part) {
    return (
      <section aria-labelledby="inspector-title">
        <h3 id="inspector-title">Selected part</h3>
        <p className="muted">Select a part on a sheet or in the tray. Keys: R turns it, Delete sends it to the tray, the arrow keys move it (Shift for bigger steps), Escape clears the selection.</p>
      </section>
    );
  }
  const found = findCopy(project, selected);
  const sheets = project.plan?.sheets ?? [];
  const rect = found ? placedRect(part, found.placement) : null;
  return (
    <section aria-labelledby="inspector-title">
      <h3 id="inspector-title">Selected part</h3>
      <p>
        <b>{copyLabel(part, selected.copy)}</b>
        <br />
        {formatSize(ctx, part)}, {materialName(ctx, part.material)}
        <br />
        Grain: {GRAIN_TEXT[part.grain]}
      </p>
      <label className="stack">
        Location
        <select value={found?.sheet.id ?? ""} disabled={busy} onChange={(event) => onLocation(event.target.value || null)}>
          <option value="">Unplaced tray</option>
          {sheets.map((sheet, index) => {
            const stock = ctx.stock.get(sheet.stock);
            const other = stock !== undefined && stock.material !== part.material;
            return (
              <option key={sheet.id} value={sheet.id}>
                Sheet {index + 1}
                {stock ? ` — ${stockLabel(ctx, stock)}` : ""}
                {other ? " (other material)" : ""}
              </option>
            );
          })}
        </select>
      </label>
      {message && (
        <p role="status" className="error">
          {message}
        </p>
      )}
      {found && rect && (
        <>
          <div className="pair">
            <label className="stack">
              X (from the left)
              <LengthInput value={rect.x} units={ctx.units} display={ctx.display} allowZero disabled={busy} onChange={(x) => x !== undefined && onMove(x, rect.y)} />
            </label>
            <label className="stack">
              Y (from the top)
              <LengthInput value={rect.y} units={ctx.units} display={ctx.display} allowZero disabled={busy} onChange={(y) => y !== undefined && onMove(rect.x, y)} />
            </label>
          </div>
          <div className="buttons">
            <button type="button" onClick={onRotate} disabled={busy} aria-keyshortcuts="R">
              Turn (R)
            </button>
            <button type="button" onClick={() => onLocation(null)} disabled={busy} aria-keyshortcuts="Delete">
              To tray (Delete)
            </button>
          </div>
        </>
      )}
    </section>
  );
}
```

Create `apps/web/src/layout/LayoutTab.tsx`:

```tsx
import {
  contains,
  copyLabel,
  stockLabel,
  usableRect,
  type ProjectAnalysis,
  type Rect,
  type Size,
  type UnplacedReason,
} from "@opencutplan/core";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  addSheet,
  clearsKerf,
  findCopy,
  findFreeSpot,
  moveCopyTo,
  moveToTray,
  nudgeCopy,
  orientedSize,
  placeCopy,
  removeEmptySheets,
  removeSheet,
  rotateCopy,
  setPinned,
  sheetRects,
  unplacedCopies,
  type CopyRef,
} from "../edit/layout.ts";
import type { OptimizeRuns } from "../optimizer/useOptimizeRuns.ts";
import type { ViewPrefs } from "../state/prefs.ts";
import type { ProjectStore } from "../state/useProject.ts";
import { groupColors } from "./colors.ts";
import { Inspector } from "./Inspector.tsx";
import { IssueList } from "./IssueList.tsx";
import { copyKey, SheetView, type DropPreview } from "./SheetView.tsx";
import { snapPosition } from "./snap.ts";
import { Tray } from "./Tray.tsx";

const SNAP_PX = 8;
const DRAG_START_PX = 4;
const ZOOM_STEP = 1.25;

type DropTarget = { kind: "sheet"; sheet: string; x: number; y: number; bad: boolean } | { kind: "tray" };

interface Drag {
  ref: CopyRef;
  size: Size;
  rotated: boolean;
  /** Pointer position inside the part, in project units. */
  grab: { x: number; y: number };
  start: { x: number; y: number };
  client: { x: number; y: number };
  started: boolean;
  target: DropTarget | null;
}

interface LayoutTabProps {
  store: ProjectStore;
  analysis: ProjectAnalysis;
  prefs: ViewPrefs;
  runs: OptimizeRuns;
}

/** The nudge step: one display step, or 1 in / 25 mm with Shift. */
export function nudgeStep(analysis: ProjectAnalysis, big: boolean): number {
  const { units, display } = analysis.context;
  if (units === "in") return big ? 1 : display.inch === "decimal" ? 0.01 : 1 / display.inch;
  return big ? 25 : display.mm;
}

function isEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName));
}

export function LayoutTab({ store, analysis, prefs, runs }: LayoutTabProps) {
  const { project, edit } = store;
  const ctx = analysis.context;
  const busy = runs.running !== null;
  const [selected, setSelected] = useState<CopyRef | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(800);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [stockChoice, setStockChoice] = useState("");
  const focusAfter = useRef<CopyRef | null>(null);
  const sheetsRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  const sheets = project.plan?.sheets ?? [];
  const colors = useMemo(() => groupColors(project), [project]);
  const unplaced = useMemo(() => unplacedCopies(project), [project]);
  const enabledStock = project.stock.filter((stock) => stock.enabled !== false);
  const chosenStock = enabledStock.find((stock) => stock.id === stockChoice) ?? enabledStock[0];

  const longest = Math.max(1, ...sheets.map((sheet) => ctx.stock.get(sheet.stock)?.length ?? 0), ...(sheets.length === 0 ? enabledStock.map((s) => s.length) : []));
  const scale = Math.max(0.02, ((width - 48) / longest) * zoom);

  useEffect(() => {
    const element = sheetsRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => entry && entry.contentRect.width > 0 && setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const ref = focusAfter.current;
    if (!ref) return;
    focusAfter.current = null;
    const key = copyKey(ref);
    [...document.querySelectorAll<HTMLElement | SVGElement>("[data-copy-key]")].find((element) => element.dataset.copyKey === key)?.focus();
  });

  useEffect(() => {
    if (selected && !ctx.parts.has(selected.part)) setSelected(null);
  }, [ctx, selected]);

  const errorsBySheet = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const issue of analysis.issues) {
      if (issue.severity !== "error") continue;
      for (const ref of issue.refs) {
        if (ref.kind !== "placement") continue;
        map.set(ref.sheet, (map.get(ref.sheet) ?? new Set()).add(ref.index));
      }
    }
    return map;
  }, [analysis.issues]);

  const reasons = useMemo(
    () => new Map<string, UnplacedReason>((runs.current?.result.unplaced ?? []).map((u) => [copyKey(u), u.reason])),
    [runs.current],
  );

  const select = (ref: CopyRef | null) => {
    setSelected(ref);
    setMessage(null);
  };

  const sizeOf = (ref: CopyRef, rotated: boolean): Size | null => {
    const part = ctx.parts.get(ref.part);
    return part ? orientedSize(part, rotated) : null;
  };

  const locate = (ref: CopyRef, sheetId: string | null) => {
    if (sheetId === null) {
      edit((p) => moveToTray(p, ref));
      focusAfter.current = ref;
      return;
    }
    const sheet = sheets.find((s) => s.id === sheetId);
    const rotated = findCopy(project, ref)?.placement.rotated ?? false;
    const size = sizeOf(ref, rotated);
    if (!sheet || !size) return;
    const spot = findFreeSpot(ctx, sheet, size, ref);
    const index = sheets.indexOf(sheet) + 1;
    if (!spot) {
      setMessage(`Sheet ${index} has no free space for this part.`);
      return;
    }
    setMessage(null);
    edit((p) => placeCopy(p, ref, sheet.id, spot.x, spot.y, rotated));
    focusAfter.current = ref;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isEditable(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "Escape") {
      if (dragRef.current) setDrag(null);
      else select(null);
      return;
    }
    if (!selected || busy || !findCopy(project, selected)) return;
    const step = nudgeStep(analysis, event.shiftKey);
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (event.key === "r" || event.key === "R") {
      edit((p) => rotateCopy(p, selected));
    } else if (event.key === "Delete" || event.key === "Backspace") {
      edit((p) => moveToTray(p, selected));
      focusAfter.current = selected;
    } else if (moves[event.key]) {
      const [dx, dy] = moves[event.key]!;
      edit((p) => nudgeCopy(p, selected, dx, dy), `nudge:${copyKey(selected)}`);
    } else {
      return;
    }
    event.preventDefault();
  };

  const target = (clientX: number, clientY: number, current: Drag, freeMove: boolean): DropTarget | null => {
    const elements = document.elementsFromPoint?.(clientX, clientY) ?? [];
    for (const element of elements) {
      if (element.closest("[data-tray]")) return { kind: "tray" };
      const svg = element.closest<SVGSVGElement>("svg[data-sheet]");
      if (!svg) continue;
      const sheet = sheets.find((s) => s.id === svg.dataset.sheet);
      const stock = sheet && ctx.stock.get(sheet.stock);
      const part = ctx.parts.get(current.ref.part);
      if (!sheet || !stock || !part) return null;
      const box = svg.getBoundingClientRect();
      const others = sheetRects(ctx, sheet, current.ref);
      const usable = usableRect(ctx, stock);
      let x = (clientX - box.left) / scale - current.grab.x;
      let y = (clientY - box.top) / scale - current.grab.y;
      if (ctx.features.snapping && !freeMove) {
        ({ x, y } = snapPosition({
          x,
          y,
          size: current.size,
          sheet: { x: 0, y: 0, length: stock.length, width: stock.width },
          usable,
          others,
          kerf: ctx.kerf,
          threshold: SNAP_PX / scale,
        }));
      }
      const rect: Rect = { x, y, ...current.size };
      const bad = part.material !== stock.material || !contains(usable, rect) || !others.every((other) => clearsKerf(other, rect, ctx.kerf));
      return { kind: "sheet", sheet: sheet.id, x, y, bad };
    }
    return null;
  };
  const targetRef = useRef(target);
  targetRef.current = target;

  const startDrag = (event: ReactPointerEvent<Element>, ref: CopyRef, grab: { x: number; y: number } | null) => {
    if (busy || event.button !== 0) return;
    const rotated = findCopy(project, ref)?.placement.rotated ?? false;
    const size = sizeOf(ref, rotated);
    if (!size) return;
    select(ref);
    const box = event.currentTarget.getBoundingClientRect();
    const inside = grab ?? { x: (event.clientX - box.left) / scale, y: (event.clientY - box.top) / scale };
    const point = { x: event.clientX, y: event.clientY };
    setDrag({ ref, size, rotated, grab: inside, start: point, client: point, started: false, target: null });
  };

  useEffect(() => {
    if (!drag) return;
    const move = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const moved = Math.hypot(event.clientX - current.start.x, event.clientY - current.start.y) >= DRAG_START_PX;
      if (!current.started && !moved) return;
      setDrag({ ...current, started: true, client: { x: event.clientX, y: event.clientY }, target: targetRef.current(event.clientX, event.clientY, current, event.altKey) });
    };
    const up = () => {
      const current = dragRef.current;
      setDrag(null);
      if (!current?.started || !current.target) return;
      const drop = current.target;
      if (drop.kind === "tray") edit((p) => moveToTray(p, current.ref));
      else edit((p) => placeCopy(p, current.ref, drop.sheet, drop.x, drop.y, current.rotated));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [drag !== null, edit]);

  const dragging = drag?.started ? drag.ref : null;
  const progress = runs.running ? Math.min(1, (Date.now() - runs.running.startedAt) / runs.running.timeLimitMs) : 0;
  const canOptimize = !busy && project.parts.length > 0 && enabledStock.length > 0;

  return (
    <div className="layout" onKeyDown={onKeyDown}>
      <div className="toolbar" role="toolbar" aria-label="Layout">
        <button type="button" className="primary" disabled={!canOptimize} onClick={() => runs.optimize("all")} title="Plan every part again. Pinned sheets stay as they are.">
          Optimize
        </button>
        <button type="button" disabled={!canOptimize || unplaced.length === 0} onClick={() => runs.optimize("rest")} title="Keep every sheet and plan only the unplaced parts.">
          Optimize the rest
        </button>
        <button type="button" disabled={busy || !runs.current} onClick={runs.keepSearching} title="Continue the last search from its best plan.">
          Keep searching
        </button>
        {busy && (
          <>
            <button type="button" onClick={runs.stop}>
              Stop
            </button>
            <progress max={1} value={progress} aria-label="Optimizer progress" />
            <span className="muted" aria-live="polite">
              {runs.running?.best ? `${runs.running.best.iterations.toLocaleString()} plans tried` : "Starting…"}
            </span>
          </>
        )}
        <span className="spacer" />
        <label className="inline">
          Stock
          <select value={chosenStock?.id ?? ""} onChange={(event) => setStockChoice(event.target.value)} disabled={busy || enabledStock.length === 0}>
            {enabledStock.map((stock) => (
              <option key={stock.id} value={stock.id}>
                {stockLabel(ctx, stock)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={busy || !chosenStock} onClick={() => chosenStock && edit((p) => addSheet(p, chosenStock.id).project)}>
          Add sheet
        </button>
        <button type="button" disabled={busy || !sheets.some((s) => s.placements.length === 0)} onClick={() => edit(removeEmptySheets)}>
          Remove empty sheets
        </button>
        <span className="zoom" role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.25, z / ZOOM_STEP))}>
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(8, z * ZOOM_STEP))}>
            +
          </button>
          <button type="button" onClick={() => setZoom(1)}>
            Fit
          </button>
        </span>
      </div>
      {(runs.error || runs.notice) && (
        <p role="status" className={runs.error ? "banner error" : "banner"}>
          {runs.error ? `✖ The optimizer failed: ${runs.error}` : runs.notice}
        </p>
      )}
      {project.parts.length === 0 && <p className="muted">Add parts on the Parts tab first.</p>}
      {project.parts.length > 0 && enabledStock.length === 0 && <p className="muted">Add stock on the Stock tab to lay out or optimize.</p>}
      <div className="layout-body">
        <div className="layout-main">
          <Tray
            ctx={ctx}
            copies={unplaced}
            colors={colors}
            reasons={reasons}
            selected={selected}
            dropping={drag?.target?.kind === "tray"}
            onPointerDown={(event, ref) => {
              const size = sizeOf(ref, false);
              if (size) startDrag(event, ref, { x: size.length / 2, y: size.width / 2 });
            }}
            onSelect={select}
          />
          <div className="sheets" ref={sheetsRef}>
            {sheets.length === 0 && <p className="muted">No sheets yet. Press Optimize, or add a sheet and drag parts onto it.</p>}
            {sheets.map((sheet, index) => {
              const drop = drag?.started && drag.target?.kind === "sheet" && drag.target.sheet === sheet.id ? drag.target : null;
              const preview: DropPreview | null = drop && drag ? { rect: { x: drop.x, y: drop.y, ...drag.size }, bad: drop.bad } : null;
              return (
                <SheetView
                  key={sheet.id}
                  ctx={ctx}
                  sheet={sheet}
                  number={index + 1}
                  scale={scale}
                  steps={analysis.steps.filter((step) => step.sheet === sheet.id)}
                  colors={colors}
                  errors={errorsBySheet.get(sheet.id) ?? new Set()}
                  selected={selected}
                  dragging={dragging}
                  preview={preview}
                  showCuts={prefs.showCuts && ctx.features.cutOrder}
                  showKerf={prefs.showKerf}
                  busy={busy}
                  onPartPointerDown={(event, ref) => startDrag(event, ref, null)}
                  onSelect={select}
                  onTogglePin={() => edit((p) => setPinned(p, sheet.id, !sheet.pinned))}
                  onRemove={() => edit((p) => removeSheet(p, sheet.id))}
                />
              );
            })}
          </div>
        </div>
        <aside className="layout-side">
          <Inspector
            ctx={ctx}
            project={project}
            selected={selected}
            busy={busy}
            message={message}
            onLocation={(sheet) => selected && locate(selected, sheet)}
            onMove={(x, y) => selected && edit((p) => moveCopyTo(p, selected, x, y))}
            onRotate={() => selected && edit((p) => rotateCopy(p, selected))}
          />
          <IssueList
            project={project}
            issues={analysis.issues}
            onShow={(ref) => {
              select(ref);
              focusAfter.current = ref;
            }}
          />
        </aside>
      </div>
      {drag?.started && (
        <div
          className={`ghost${drag.target?.kind === "sheet" && drag.target.bad ? " bad" : ""}`}
          aria-hidden="true"
          style={{
            left: drag.client.x - drag.grab.x * scale,
            top: drag.client.y - drag.grab.y * scale,
            width: drag.size.length * scale,
            height: drag.size.width * scale,
          }}
        >
          {(() => {
            const part = ctx.parts.get(drag.ref.part);
            return part ? copyLabel(part, drag.ref.copy) : "";
          })()}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run --root apps/web test/snap.test.ts test/LayoutTab.test.tsx`

Expected: PASS — 13 tests.

- [ ] **Step 5: Run the full check**

Run: `npm run check` from the repo root.

Expected: the typecheck is clean (core, examples, and `apps/web`); core has 351 tests and the web app has 63 tests, all passing.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/layout/Inspector.tsx apps/web/src/layout/IssueList.tsx apps/web/src/layout/LayoutTab.tsx apps/web/src/layout/SheetView.tsx apps/web/src/layout/Tray.tsx apps/web/src/layout/colors.ts apps/web/src/layout/snap.ts apps/web/test/LayoutTab.test.tsx apps/web/test/snap.test.ts
git commit -m "feat(web): add the layout editor" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Workspace, home screen, and app shell

**Files:**
- Create: `apps/web/src/state/useAutosave.ts`
- Create: `apps/web/src/screens/Home.tsx`
- Create: `apps/web/src/screens/Workspace.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/examples.ts`
- Create: `apps/web/src/styles.css`
- Create: `apps/web/index.html`
- Modify: `package.json`
- Test: `apps/web/test/Workspace.test.tsx`
- Test: `apps/web/test/App.test.tsx`

**Interfaces:**
- Consumes: `@opencutplan/core`: `analyzeProject`, `createProject`, `parseProject`, `Project`, `serializeProject`, `Units`, `withCuts`. Every earlier task.
- Produces:
  - `src/state/useAutosave.ts`: `const AUTOSAVE_MS = 500;`; `function useAutosave(storage: Storage, id: string, project: Project, delayMs: number = AUTOSAVE_MS): string | null`
  - `src/screens/Home.tsx`: `interface OpenRequest`; `function newProject(name: string, units: Units): Project`; `function Home({ storage, onOpen, onCreate }: HomeProps)`
  - `src/screens/Workspace.tsx`: `const TABS = [`; `type TabId = (typeof TABS)[number]["id"];`; `function Workspace({ id, initial, notices: initialNotices, handle: initialHandle, storage, workerFactory, onHome }: WorkspaceProps)`
  - `src/App.tsx`: `function App({ storage, workerFactory, newId = () => crypto.randomUUID() }: AppProps)`
  - `src/examples.ts`: `interface Example`; `const EXAMPLES: readonly Example[] = [`

- [ ] **Step 1: Add the build to the root scripts**

Replace the root `package.json` with:

```json
{
  "name": "opencutplan",
  "private": true,
  "type": "module",
  "workspaces": [
    "packages/*",
    "apps/*"
  ],
  "engines": {
    "node": ">=24"
  },
  "scripts": {
    "dev": "npm run dev -w @opencutplan/web",
    "build": "npm run build -w @opencutplan/web",
    "typecheck": "tsc -p packages/core && tsc -p examples && tsc -p apps/web",
    "test": "npm test -w @opencutplan/core && npm test -w @opencutplan/web",
    "schema": "node packages/core/scripts/write-schema.ts",
    "examples": "node examples/build.ts",
    "check": "npm run typecheck && npm test && npm run build"
  },
  "devDependencies": {
    "@types/node": "26.6.3",
    "typescript": "7.0.2"
  }
}
```

- [ ] **Step 2: Write the failing tests**

Create `apps/web/test/Workspace.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Workspace } from "../src/screens/Workspace.tsx";
import { openStorage, unavailableStorage, type Storage } from "../src/storage/db.ts";
import { inProcessWorkers, sampleProject } from "./helpers.ts";

async function renderWorkspace(project = sampleProject(), given?: Storage) {
  const storage = given ?? (await openStorage(indexedDB));
  render(<Workspace id="p1" initial={project} notices={[]} storage={storage} workerFactory={inProcessWorkers().factory} onHome={() => undefined} />);
  return storage;
}

const part = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name},`) });

describe("Workspace", () => {
  it("opens on the Layout tab and moves between tabs with the arrow keys", async () => {
    await renderWorkspace();
    expect(screen.getByRole("tab", { name: "Layout" }).getAttribute("aria-selected")).toBe("true");
    screen.getByRole("tab", { name: "Layout" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Parts" }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Parts" }));
  });

  it("undoes and redoes layout edits with the keyboard and the buttons", async () => {
    await renderWorkspace();
    part("Side 2").focus();
    await userEvent.keyboard("r");
    expect(part("Side 2").getAttribute("aria-label")).toContain("turned");
    await userEvent.keyboard("{Delete}");
    const tray = screen.getByRole("region", { name: /Unplaced parts/ });
    expect(within(tray).getByRole("button", { name: /Side 2/ })).toBeTruthy();
    await userEvent.keyboard("{Meta>}z{/Meta}");
    expect(part("Side 2").getAttribute("aria-label")).toContain("turned");
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(part("Side 2").getAttribute("aria-label")).not.toContain("turned");
    await userEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(part("Side 2").getAttribute("aria-label")).toContain("turned");
  });

  it("counts quick arrow-key moves of one part as one edit", async () => {
    await renderWorkspace();
    part("Side 1").focus();
    const before = part("Side 1").getAttribute("transform");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(part("Side 1").getAttribute("transform")).not.toBe(before);
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(part("Side 1").getAttribute("transform")).toBe(before);
    expect(screen.getByRole("button", { name: "Undo" }).hasAttribute("disabled")).toBe(true);
  });

  it("autosaves the project to the browser after an edit", async () => {
    const storage = await renderWorkspace();
    await userEvent.click(screen.getByRole("tab", { name: "Parts" }));
    const name = screen.getByLabelText("Name of Shelf");
    await userEvent.clear(name);
    await userEvent.type(name, "Top{Enter}");
    await waitFor(async () => expect((await storage.loadProject("p1"))?.parts[1]?.name).toBe("Top"), { timeout: 3000 });
  });

  it("keeps a banner open when the browser cannot save the project", async () => {
    await renderWorkspace(sampleProject(), unavailableStorage("private mode"));
    const alert = await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(alert.textContent).toContain("could not save the project");
    expect(alert.textContent).toContain("Save file");
  });

  it("returns focus to Settings when the settings drawer closes", async () => {
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    const kerf = within(dialog).getByRole("checkbox", { name: /^Kerf/ });
    await userEvent.click(kerf);
    expect((kerf as HTMLInputElement).checked).toBe(false);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Settings" }));
  });
});
```

Create `apps/web/test/App.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App.tsx";
import { newProject } from "../src/screens/Home.tsx";
import { openStorage } from "../src/storage/db.ts";
import { inProcessWorkers, sampleProject } from "./helpers.ts";

beforeEach(() => {
  window.location.hash = "";
});

async function renderApp() {
  const storage = await openStorage(indexedDB);
  let next = 0;
  render(<App storage={storage} workerFactory={inProcessWorkers().factory} newId={() => `p${++next}`} />);
  return storage;
}

describe("App", () => {
  it("creates a millimetre project with one table saw and opens it on the Parts tab", async () => {
    await renderApp();
    await userEvent.type(screen.getByLabelText("Name"), "Shelf");
    await userEvent.selectOptions(screen.getByLabelText("Units"), "mm");
    await userEvent.click(screen.getByRole("button", { name: "Create project" }));
    expect(window.location.hash).toBe("#/project/p1");
    expect((screen.getByLabelText("Project name") as HTMLInputElement).value).toBe("Shelf");
    expect(screen.getByRole("tab", { name: "Parts" }).getAttribute("aria-selected")).toBe("true");
    const created = newProject("Shelf", "mm");
    expect(created.tools.map((t) => [t.type, t.kerf])).toEqual([["table-saw", 3]]);
  });

  it("opens an example and returns to the list, which shows the saved project", async () => {
    await renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Open example" }));
    const name = (await screen.findByLabelText("Project name")) as HTMLInputElement;
    const title = name.value;
    await userEvent.click(screen.getByRole("button", { name: "← Projects" }));
    expect(await screen.findByRole("button", { name: title })).toBeTruthy();
  });

  it("deletes a saved project after the person confirms", async () => {
    const storage = await openStorage(indexedDB);
    await storage.saveProject("old", sampleProject());
    let next = 0;
    render(<App storage={storage} workerFactory={inProcessWorkers().factory} newId={() => `q${++next}`} />);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    await userEvent.click(await screen.findByRole("button", { name: "Delete Test" }));
    expect(confirm).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("No saved projects yet.")).toBeTruthy());
    expect(await storage.loadProject("old")).toBeNull();
  });

  it("shows an error for a project id that is not saved", async () => {
    window.location.hash = "#/project/missing";
    await renderApp();
    expect((await screen.findByRole("alert")).textContent).toContain("not saved in this browser");
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run --root apps/web test/Workspace.test.tsx test/App.test.tsx`

Expected: FAIL — the modules under test do not exist yet (`Failed to resolve import` / `Cannot find module`).

- [ ] **Step 4: Write the code**

Create `apps/web/src/state/useAutosave.ts`:

```ts
import type { Project } from "@opencutplan/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Storage } from "../storage/db.ts";

export const AUTOSAVE_MS = 500;

/** Saves the project to the browser shortly after each change, and at once when the page is hidden or closed. Returns the last save error. */
export function useAutosave(storage: Storage, id: string, project: Project, delayMs: number = AUTOSAVE_MS): string | null {
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<Project | null>(null);

  const flush = useCallback(() => {
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    storage.saveProject(id, next).then(
      () => setError(null),
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [storage, id]);

  useEffect(() => {
    pending.current = project;
    const timer = setTimeout(flush, delayMs);
    return () => clearTimeout(timer);
  }, [project, flush, delayMs]);

  useEffect(() => {
    const hidden = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      flush();
    };
  }, [flush]);

  return error;
}
```

Create `apps/web/src/screens/Home.tsx`:

```tsx
import { createProject, parseProject, type Project, type Units } from "@opencutplan/core";
import { useEffect, useState } from "react";
import { EXAMPLES } from "../examples.ts";
import type { ProjectSummary, Storage } from "../storage/db.ts";
import { openProjectFile } from "../storage/files.ts";
import { newTool } from "../edit/tools.ts";

export interface OpenRequest {
  project: Project;
  notices: string[];
  handle?: FileSystemFileHandle;
}

interface HomeProps {
  storage: Storage;
  onOpen(id: string): void;
  onCreate(request: OpenRequest): void;
}

/** A new project starts with one table saw so the plan can be cut at once. */
export function newProject(name: string, units: Units): Project {
  const project = createProject(name, units);
  return { ...project, tools: [newTool("table-saw", units, new Set())] };
}

export function Home({ storage, onOpen, onCreate }: HomeProps) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [units, setUnits] = useState<Units>("in");
  const [example, setExample] = useState(EXAMPLES[0]!.slug);

  const refresh = () =>
    storage.listProjects().then(setProjects, (e: unknown) => {
      setProjects([]);
      setError(`Saved projects could not be read: ${(e as Error).message}`);
    });
  useEffect(() => {
    void refresh();
  }, [storage]);

  const openText = (text: string, handle?: FileSystemFileHandle) => {
    const result = parseProject(text);
    if (!result.ok) {
      setError(`The file could not be opened. ${result.errors.map((issue) => issue.message).join(" ")}`);
      return;
    }
    onCreate({ project: result.project, notices: result.warnings.map((issue) => issue.message), ...(handle ? { handle } : {}) });
  };

  return (
    <main className="home">
      <h1>OpenCutPlan</h1>
      <p className="muted">Plan sheet-goods cuts: parts, stock, tools, an optimizer, and a layout you can edit.</p>
      {error && (
        <p role="alert" className="banner error">
          ✖ {error}
        </p>
      )}
      <div className="home-actions">
        <form
          className="card"
          onSubmit={(event) => {
            event.preventDefault();
            onCreate({ project: newProject(name.trim() || "Untitled project", units), notices: [] });
          }}
        >
          <h2>New project</h2>
          <label className="stack">
            Name
            <input type="text" value={name} placeholder="Untitled project" onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="stack">
            Units
            <select value={units} onChange={(event) => setUnits(event.target.value as Units)}>
              <option value="in">Inches</option>
              <option value="mm">Millimetres</option>
            </select>
          </label>
          <button type="submit" className="primary">
            Create project
          </button>
        </form>
        <div className="card">
          <h2>Open</h2>
          <button
            type="button"
            onClick={async () => {
              setError(null);
              try {
                const file = await openProjectFile();
                if (file) openText(file.text, file.handle);
              } catch (e) {
                setError(`The file could not be read: ${(e as Error).message}`);
              }
            }}
          >
            Open a .cutplan.json file…
          </button>
          <label className="stack">
            Example
            <select value={example} onChange={(event) => setExample(event.target.value)}>
              {EXAMPLES.map((e) => (
                <option key={e.slug} value={e.slug}>
                  {e.title}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => openText(EXAMPLES.find((e) => e.slug === example)!.text)}>
            Open example
          </button>
        </div>
      </div>
      <section aria-labelledby="saved-title">
        <h2 id="saved-title">Projects in this browser</h2>
        {projects === null && <p className="muted">Loading…</p>}
        {projects?.length === 0 && <p className="muted">No saved projects yet.</p>}
        {projects && projects.length > 0 && (
          <table className="grid">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Units</th>
                <th scope="col">Pieces</th>
                <th scope="col">Changed</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td>
                    <button type="button" className="link" onClick={() => onOpen(project.id)}>
                      {project.name}
                    </button>
                  </td>
                  <td>{project.units}</td>
                  <td>{project.parts}</td>
                  <td>{new Date(project.modified).toLocaleString()}</td>
                  <td>
                    <button
                      type="button"
                      aria-label={`Delete ${project.name}`}
                      onClick={async () => {
                        if (!window.confirm(`Delete “${project.name}” from this browser? Files you saved are not changed.`)) return;
                        await storage.deleteProject(project.id);
                        await refresh();
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
```

Create `apps/web/src/screens/Workspace.tsx`:

```tsx
import { analyzeProject, serializeProject, withCuts, type Project } from "@opencutplan/core";
import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { TextInput } from "../components/fields.tsx";
import { LayoutTab } from "../layout/LayoutTab.tsx";
import { useOptimizeRuns } from "../optimizer/useOptimizeRuns.ts";
import type { WorkerFactory } from "../optimizer/useOptimizer.ts";
import { usePrefs } from "../state/prefs.ts";
import { useAutosave } from "../state/useAutosave.ts";
import { useProject } from "../state/useProject.ts";
import type { Storage } from "../storage/db.ts";
import { projectFileName, saveProjectFile } from "../storage/files.ts";
import { PartsTab } from "./PartsTab.tsx";
import { SettingsDrawer } from "./SettingsDrawer.tsx";
import { StockTab } from "./StockTab.tsx";
import { ToolsTab } from "./ToolsTab.tsx";

export const TABS = [
  { id: "parts", label: "Parts" },
  { id: "stock", label: "Stock" },
  { id: "tools", label: "Tools" },
  { id: "layout", label: "Layout" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

interface WorkspaceProps {
  id: string;
  initial: Project;
  notices: string[];
  handle?: FileSystemFileHandle | undefined;
  storage: Storage;
  workerFactory: WorkerFactory;
  onHome(): void;
}

function isEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName));
}

export function Workspace({ id, initial, notices: initialNotices, handle: initialHandle, storage, workerFactory, onHome }: WorkspaceProps) {
  const store = useProject(initial);
  const { project, edit } = store;
  const analysis = useMemo(() => analyzeProject(project), [project]);
  const runs = useOptimizeRuns(store, workerFactory);
  const [prefs, setPrefs] = usePrefs();
  const [tab, setTab] = useState<TabId>(initial.parts.length > 0 ? "layout" : "parts");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notices, setNotices] = useState(initialNotices);
  const [handle, setHandle] = useState(initialHandle);
  const [fileStatus, setFileStatus] = useState<string | null>(null);
  const saveError = useAutosave(storage, id, project);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || isEditable(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) store.undo();
      else if ((key === "z" && event.shiftKey) || key === "y") store.redo();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  const save = async (as: boolean) => {
    try {
      const text = serializeProject(withCuts(project));
      const next = await saveProjectFile(text, projectFileName(project.project.name), as ? undefined : handle);
      if (next === null) return;
      setHandle(next);
      setFileStatus(next ? `Saved to ${next.name}.` : "The file was downloaded.");
    } catch (e) {
      setFileStatus(`The file could not be saved: ${(e as Error).message}`);
    }
  };

  const onTabKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const index = TABS.findIndex((t) => t.id === tab);
    const next = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1 : null;
    if (next === null) return;
    const target = TABS[(next + TABS.length) % TABS.length]!;
    setTab(target.id);
    document.getElementById(`tab-${target.id}`)?.focus();
    event.preventDefault();
  };

  return (
    <div className="workspace">
      <header className="app-head">
        <button type="button" onClick={onHome}>
          ← Projects
        </button>
        <TextInput
          className="project-name"
          aria-label="Project name"
          value={project.project.name}
          required
          onChange={(name) => edit((p) => ({ ...p, project: { ...p.project, name } }))}
        />
        <button type="button" onClick={store.undo} disabled={!store.canUndo} aria-keyshortcuts="Meta+Z Control+Z">
          Undo
        </button>
        <button type="button" onClick={store.redo} disabled={!store.canRedo} aria-keyshortcuts="Meta+Shift+Z Control+Y">
          Redo
        </button>
        <span className="spacer" />
        <button type="button" onClick={() => void save(false)}>
          Save file
        </button>
        <button type="button" onClick={() => void save(true)}>
          Save as…
        </button>
        <button type="button" onClick={() => setSettingsOpen(true)} aria-haspopup="dialog">
          Settings
        </button>
      </header>
      {saveError && (
        <p role="alert" className="banner error">
          ✖ This browser could not save the project ({saveError}). Use Save file to keep your work.
        </p>
      )}
      {notices.length > 0 && (
        <div role="status" className="banner">
          {notices.map((notice, index) => (
            <p key={index}>⚠ {notice}</p>
          ))}
          <button type="button" onClick={() => setNotices([])}>
            Dismiss
          </button>
        </div>
      )}
      {fileStatus && (
        <p role="status" className="banner">
          {fileStatus}
        </p>
      )}
      <div role="tablist" aria-label="Project" className="tabs" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="panel">
        {tab === "parts" && <PartsTab store={store} />}
        {tab === "stock" && <StockTab store={store} />}
        {tab === "tools" && <ToolsTab store={store} storage={storage} />}
        {tab === "layout" && <LayoutTab store={store} analysis={analysis} prefs={prefs} runs={runs} />}
      </div>
      {settingsOpen && <SettingsDrawer store={store} prefs={prefs} onPrefs={setPrefs} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
```

Create `apps/web/src/App.tsx`:

```tsx
import type { Project } from "@opencutplan/core";
import { useEffect, useState } from "react";
import type { WorkerFactory } from "./optimizer/useOptimizer.ts";
import { Home, type OpenRequest } from "./screens/Home.tsx";
import { Workspace } from "./screens/Workspace.tsx";
import type { Storage } from "./storage/db.ts";

const PROJECT_ROUTE = /^#\/project\/(.+)$/;

function routeId(): string | null {
  const match = PROJECT_ROUTE.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]!) : null;
}

interface Opened extends OpenRequest {
  id: string;
}

interface AppProps {
  storage: Storage;
  workerFactory: WorkerFactory;
  newId?: () => string;
}

export function App({ storage, workerFactory, newId = () => crypto.randomUUID() }: AppProps) {
  const [id, setId] = useState(routeId);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const onHash = () => setId(routeId());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (id === null || opened?.id === id) return;
    let live = true;
    setLoadError(null);
    storage.loadProject(id).then(
      (project: Project | null) => {
        if (!live) return;
        if (project) setOpened({ id, project, notices: [] });
        else setLoadError("This project is not saved in this browser.");
      },
      (e: unknown) => live && setLoadError((e as Error).message),
    );
    return () => {
      live = false;
    };
  }, [id, opened, storage]);

  const go = (next: string | null) => {
    window.location.hash = next === null ? "#/" : `#/project/${encodeURIComponent(next)}`;
    setId(next);
  };

  if (id === null) {
    return (
      <Home
        storage={storage}
        onOpen={go}
        onCreate={(request) => {
          const created = newId();
          setOpened({ ...request, id: created });
          go(created);
        }}
      />
    );
  }
  if (loadError) {
    return (
      <main className="home">
        <p role="alert" className="banner error">
          ✖ {loadError}
        </p>
        <button type="button" onClick={() => go(null)}>
          ← Projects
        </button>
      </main>
    );
  }
  if (opened?.id !== id) return <p className="muted">Loading…</p>;
  return (
    <Workspace
      key={opened.id}
      id={opened.id}
      initial={opened.project}
      notices={opened.notices}
      handle={opened.handle}
      storage={storage}
      workerFactory={workerFactory}
      onHome={() => {
        setOpened(null);
        go(null);
      }}
    />
  );
}
```

Create `apps/web/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { createOptimizerWorker } from "./optimizer/useOptimizer.ts";
import { openStorage, unavailableStorage } from "./storage/db.ts";
import "./styles.css";

const storage = await openStorage().catch((error: unknown) =>
  unavailableStorage(`this browser has no project storage: ${error instanceof Error ? error.message : String(error)}`),
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App storage={storage} workerFactory={createOptimizerWorker} />
  </StrictMode>,
);
```

Create `apps/web/src/examples.ts`:

```ts
import livingRoomShelf from "../../../examples/living-room-shelf.cutplan.json?raw";
import simpleBookcase from "../../../examples/simple-bookcase-mm.cutplan.json?raw";

export interface Example {
  slug: string;
  title: string;
  text: string;
}

export const EXAMPLES: readonly Example[] = [
  { slug: "living-room-shelf", title: "Living-room shelf (inches, baltic birch)", text: livingRoomShelf },
  { slug: "simple-bookcase-mm", title: "Simple bookcase (millimetres)", text: simpleBookcase },
];
```

Create `apps/web/src/styles.css`:

```css
:root {
  --bg: #f5f3ee;
  --panel: #fff;
  --ink: #222;
  --muted: #6b6b6b;
  --line: #d8d4ca;
  --bad: #c62828;
  --warn: #9a6700;
  --ok: #1a7f37;
  --focus: #1a5fd0;
  --wood: #efe3c8;
  color-scheme: light;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: var(--bg); color: var(--ink); font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
h1 { font-size: 24px; margin: 0 0 4px; }
h2 { font-size: 17px; margin: 0; }
h3 { font-size: 14px; margin: 0 0 6px; }
h4 { font-size: 12px; margin: 8px 0 4px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
button, select, input, textarea { font: inherit; color: inherit; }
button { background: #fff; border: 1px solid #b9b3a6; border-radius: 6px; padding: 5px 10px; cursor: pointer; }
button:hover:not(:disabled) { background: #f0ede6; }
button:disabled { opacity: 0.5; cursor: default; }
button.primary { background: #2b5fb4; border-color: #22509b; color: #fff; }
button.primary:hover:not(:disabled) { background: #22509b; }
button.link { border: none; background: none; padding: 0 4px; color: var(--focus); text-decoration: underline; }
button.icon { border: none; background: none; font-size: 20px; line-height: 1; padding: 2px 6px; }
input[type="text"], select, textarea { border: 1px solid #b9b3a6; border-radius: 4px; padding: 4px 6px; background: #fff; }
input[aria-invalid="true"] { border-color: var(--bad); outline: 2px solid var(--bad); }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.muted { color: var(--muted); }
.error { color: var(--bad); }
.warning { color: var(--warn); }
.ok { color: var(--ok); }
.spacer { flex: 1; }
.stack { display: flex; flex-direction: column; gap: 2px; margin: 6px 0; }
.inline { display: inline-flex; align-items: center; gap: 6px; }
.pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; }
.pair input { width: 100%; min-width: 0; }
.buttons { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 0 0 10px; }
.banner { margin: 8px 16px; padding: 8px 12px; border-radius: 6px; background: #fff7d6; border: 1px solid #e9d27a; }
.banner.error { background: #fdecea; border-color: #f0a9a2; color: var(--bad); }
.banner p { margin: 2px 0; }

.home { max-width: 960px; margin: 0 auto; padding: 24px 16px 60px; }
.home-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin: 16px 0 24px; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 6px; }

.workspace { display: flex; flex-direction: column; min-height: 100vh; }
.app-head { display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: #2b2b2b; color: #fff; flex-wrap: wrap; }
.app-head button { background: #444; border-color: #555; color: #fff; }
.app-head button:hover:not(:disabled) { background: #555; }
.app-head .project-name { font-size: 16px; font-weight: 600; min-width: 200px; background: #3a3a3a; border-color: #555; color: #fff; }
.tabs { display: flex; gap: 2px; padding: 8px 16px 0; border-bottom: 1px solid var(--line); overflow-x: auto; }
.tabs [role="tab"] { border: 1px solid transparent; border-bottom: none; border-radius: 6px 6px 0 0; background: none; padding: 7px 16px; }
.tabs [role="tab"][aria-selected="true"] { background: var(--panel); border-color: var(--line); font-weight: 600; margin-bottom: -1px; }
.panel { flex: 1; background: var(--panel); padding: 16px; }

.table-wrap { overflow-x: auto; }
table.grid { border-collapse: collapse; width: 100%; }
table.grid th { text-align: left; font-size: 12px; color: var(--muted); font-weight: 600; padding: 4px 6px; border-bottom: 1px solid var(--line); white-space: nowrap; }
table.grid td { padding: 3px 6px; border-bottom: 1px solid #eee; vertical-align: middle; }
table.grid td input[type="text"] { width: 100%; min-width: 80px; }
table.grid td input.narrow { min-width: 60px; width: 80px; }
.totals { list-style: none; padding: 0; color: var(--muted); }
.stock-tab section + section { margin-top: 24px; }

.tool-list { list-style: none; padding: 0; display: grid; gap: 10px; }
.tool-list fieldset { border: 1px solid var(--line); border-radius: 8px; }
.tool-list li.disabled fieldset { opacity: 0.7; border-style: dashed; }
.tool-fields { display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: flex-end; }
.tools-tab section + section { margin-top: 24px; }

.backdrop { position: fixed; inset: 0; background: #0005; display: flex; align-items: center; justify-content: center; z-index: 50; }
.dialog { background: var(--panel); border-radius: 10px; padding: 16px; width: min(760px, 94vw); max-height: 90vh; overflow: auto; box-shadow: 0 10px 40px #0004; }
.drawer-backdrop { justify-content: flex-end; align-items: stretch; }
.dialog.drawer { width: min(420px, 100vw); max-height: none; height: 100vh; border-radius: 0; }
.dialog-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.dialog-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.dialog textarea { width: 100%; font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
.dialog fieldset { border: 1px solid var(--line); border-radius: 8px; margin: 10px 0; }
.mapping { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 6px 12px; }
.mapping label { display: flex; flex-direction: column; font-size: 13px; }
.switch { display: flex; gap: 8px; align-items: flex-start; margin: 6px 0; }
.switch small { display: block; color: var(--muted); }
.issues { padding-left: 0; list-style: none; margin: 4px 0; }
.issues li { margin: 3px 0; }

.layout-body { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 16px; }
.layout-main { min-width: 0; }
.layout-side { border-left: 1px solid var(--line); padding-left: 14px; display: flex; flex-direction: column; gap: 18px; }
.zoom { display: inline-flex; align-items: center; gap: 4px; }
.tray { border: 1px dashed #b9b3a6; border-radius: 8px; padding: 8px 10px; margin-bottom: 16px; }
.tray.dropping { background: #eaf1fb; border-color: var(--focus); }
.tray ul { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.tray-part { display: inline-flex; align-items: center; gap: 6px; touch-action: none; user-select: none; }
.tray-part[aria-pressed="true"] { outline: 2px solid var(--focus); }
.tray-part .reason { color: var(--warn); font-size: 12px; }
.swatch { width: 12px; height: 12px; border-radius: 2px; border: 1px solid #0003; display: inline-block; }
.sheets { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; }
.sheet { background: #fff; border-radius: 8px; padding: 8px 10px 10px; box-shadow: 0 1px 3px #0002; }
.sheet-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.sheet-head .name { font-weight: 700; }
.sheet-head .meta { color: var(--muted); font-size: 12px; flex: 1; }
.sheet-head button { padding: 2px 8px; font-size: 12px; }
.sheet-head button[aria-pressed="true"] { background: #fff2c2; border-color: #d9b94a; }
.sheet-area { display: block; user-select: none; }
.sheet-area .wood { fill: var(--wood); stroke: #333; stroke-width: 2; }
.sheet-area .trim { fill: none; stroke: #0006; stroke-dasharray: 4 3; }
.sheet-area .part { cursor: grab; touch-action: none; outline: none; }
.sheet-area .part .outline { fill: none; stroke: #333; stroke-width: 1; }
.sheet-area .part text { fill: #222; pointer-events: none; font-weight: 600; }
.sheet-area .part.bad .fill { fill: #f6b3b3; }
.sheet-area .part.bad .outline { stroke: var(--bad); stroke-width: 2.5; stroke-dasharray: 5 2; }
.sheet-area .part.selected .outline { stroke: var(--focus); stroke-width: 3; }
.sheet-area .part:focus-visible .outline { stroke: var(--focus); stroke-width: 4; }
.sheet-area .part.dragging { opacity: 0.3; }
.sheet-area .cut { pointer-events: none; }
.sheet-area .drop-preview { fill: #1a5fd022; stroke: var(--focus); stroke-width: 2; stroke-dasharray: 6 3; pointer-events: none; }
.sheet-area .drop-preview.bad { fill: #c6282822; stroke: var(--bad); }
.ghost { position: fixed; pointer-events: none; z-index: 100; background: #9cc3e6cc; border: 1px solid #333; box-shadow: 0 4px 14px #0004; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; overflow: hidden; }
.ghost.bad { background: #f6b3b3cc; outline: 2px solid var(--bad); }

@media (max-width: 800px) {
  .layout-body { grid-template-columns: 1fr; }
  .layout-side { border-left: none; padding-left: 0; }
  .panel { padding: 10px; }
}
```

Create `apps/web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OpenCutPlan</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run --root apps/web test/Workspace.test.tsx test/App.test.tsx`

Expected: PASS — 10 tests.

- [ ] **Step 6: Run the full check**

Run: `npm run check` from the repo root.

Expected: the typecheck is clean; core has 351 tests and the web app has 73 tests, all passing; `vite build` writes `apps/web/dist` with an `index-*.js`, an `optimizer.worker-*.js`, and an `index-*.css` asset.

- [ ] **Step 7: Commit**

```bash
git add apps/web/index.html apps/web/src/App.tsx apps/web/src/examples.ts apps/web/src/main.tsx apps/web/src/screens/Home.tsx apps/web/src/screens/Workspace.tsx apps/web/src/state/useAutosave.ts apps/web/src/styles.css apps/web/test/App.test.tsx apps/web/test/Workspace.test.tsx package.json
git commit -m "feat(web): add the workspace, home screen, and app shell" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Web app docs

**Files:**
- Create: `docs/web-app.md`
- Modify: `README.md` (the intro sentence, the docs list, the commands)
- Modify: `docs/superpowers/specs/2026-09-27-opencutplan-design.md` (§3 Persistence, §7.2 Layout, §12 item 4)

**Interfaces:**
- Consumes: the behaviour and UI strings of Tasks 1–8.
- Produces: nothing that code uses.

- [ ] **Step 1: Write the web app guide**

Create `docs/web-app.md`:

````markdown
# Web app

The web app in `apps/web` is a React single-page app built with Vite. It runs in the browser only: projects stay on
the user's machine, in the browser's storage and in `.cutplan.json` files.

```bash
npm run dev        # start a development server
npm run build      # write a static build to apps/web/dist
```

The build uses relative paths, so `apps/web/dist` works from any static host or folder.

## Home

- **New project** asks for a name and units (inches or millimetres). A new project has one table saw with the default
  kerf (1/8" or 3 mm) and no parts or stock.
- **Open a .cutplan.json file** reads a project file. Browsers with the File System Access API remember the file, so
  **Save file** writes back to it. Other browsers upload the file and download it again on save.
- **Open example** opens one of the projects in `examples/`.
- **Projects in this browser** lists the saved projects, newest change first. **Delete** asks first and removes the
  project from the browser only; saved files are not changed.

A file that does not pass the format checks is not opened, and the home screen shows the reasons. A file with warnings
(for example, a newer minor version) opens, and the workspace shows the warnings until the user dismisses them.

## Workspace

The header has the project name, **Undo** and **Redo**, **Save file**, **Save as…**, and **Settings**. The address
is `#/project/<id>`, so a reload opens the same project.

- **Undo and redo** keep the last 100 edits. Arrow-key moves of one part less than one second apart count as one
  edit. The keys are ⌘Z / Ctrl+Z, and ⇧⌘Z / Ctrl+Y for redo. The keys do not act while the focus is in a text field,
  so the field's own undo works there.
- **Autosave** writes the project to IndexedDB half a second after each change, and at once when the page is hidden.
  When the browser cannot save (for example, private mode or a full disk), a banner stays open and asks the user to
  use **Save file**.
- **Save file** writes the project with its computed cut sequence (`plan.cuts`), so other tools can read the cuts.

The tabs are **Parts**, **Stock**, **Tools**, and **Layout**. The left and right arrow keys move between tabs.
The **Shop** and **Reports** tabs come in the next phase, with printing and export.

### Parts

An editable table: name, length, width, quantity, material, grain, group, and notes. Lengths accept fractions and
feet (`2' 3 1/2`), decimals, and millimetres. A field keeps text it cannot read, marks it, and restores the last good
value when the focus leaves; Escape restores it at once.

- **Add part** adds a part and puts the focus in its name.
- Pasting rows from a spreadsheet anywhere on the tab opens the import dialog. **Paste rows…** and **Import CSV…** open
  the same dialog. The dialog guesses the columns from the header; when it cannot, the user picks them. Rows with
  errors are listed and left out.
- Lowering a quantity takes the extra copies off the sheets. Deleting a part removes its copies from the plan.
- The totals give the number of pieces and the area for each material.

### Stock

A materials table (name, thickness, grain, colour) and a stock table (name, material, size, quantity or unlimited,
cost, kind, trim, and whether to use it). Stock also has a CSV import. A material that parts or stock use cannot be
deleted. Deleting stock also removes its sheets from the plan.

### Tools

The tools in the order the cut analysis tries them. Each tool has a name, a kerf, the limits for its type, and an
**Enabled** switch. **Up** and **Down** change the order.

**Tool profiles** keep a set of tools in the browser for use in other projects. A profile stores its units; using a
millimetre profile in an inch project converts the kerf and limits.

### Layout

Sheets are drawn to scale. Parts have the colour of their group, grain stripes, and a ⟂ mark when they lie across the
grain. The trim zone is dashed. Cut lines are numbered in sequence order and coloured by stage. A part with a problem
turns red and has a ⚠ mark; the **Problems** list names each problem, and **Show** selects the part.

- **Optimize** plans every part again. Pinned sheets stay as they are.
- **Optimize the rest** keeps every sheet and plans only the parts in the tray.
- **Keep searching** continues the last search from its best plan. It is offered while the project is still the one
  the last search produced.
- **Stop** ends a search and uses the best plan so far.
- The optimizer runs in a Web Worker, so the page stays responsive. A progress bar shows the part of the time limit
  that is used. When the project changes during a search, the result is not used.
- **Pin** on a sheet keeps it through **Optimize**. **Remove** puts its parts in the tray.
- **Add sheet** adds a sheet of the chosen stock. **Remove empty sheets** removes sheets with no parts.
- **−**, **+**, and **Fit** change the zoom.

Parts move by dragging between sheets and the tray. A drag snaps to sheet edges, the trim line, and one kerf from
other parts; hold Alt (⌥) to drag without snapping. The keyboard does the same work: Tab or a click selects a part,
**R** turns it, **Delete** sends it to the tray, the arrow keys move it by the display precision (with Shift, by 1"
or 25 mm), and **Escape** clears the selection. The side panel shows the selected part, a **Location** list to move it
to a sheet or the tray, and **X** and **Y** fields for an exact position.

A layout with problems is never blocked: the user can keep editing, and the Problems list updates after each change.

### Settings

The settings drawer has the feature switches, units and display precision, cut order, edge trim, the smallest useful
offcut, the optimizer time and seed, the currency, and two view choices: **Show cut lines** and **Draw cut lines at
kerf width**. Changing units converts every length in the project and removes the stored cut sequence. The view
choices belong to the browser, not to the project file.

## Tests

`npm test -w @opencutplan/web` runs the component tests with Vitest, jsdom, Testing Library, and fake-indexeddb.
The optimizer tests run the real worker protocol in the test thread.
````

- [ ] **Step 2: Update the README and the spec**

Save this script as `/tmp/docs_edits.py`. Each edit replaces one exact piece of text and stops with an error when that text is not found exactly once.

```python
from pathlib import Path


def replace(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if text.count(old) != 1:
        raise SystemExit(f"{path}: expected the old text once, found it {text.count(old)} times:\n{old}")
    file.write_text(text.replace(old, new))


replace(
    "README.md",
    "saw. It is under development: this repository currently contains the core library (file format, CSV, cut analysis,\nand the optimizer).",
    "saw. It is under development: this repository contains the core library (file format, CSV, cut analysis, and the\noptimizer) and a web app to enter parts, stock, and tools and to edit layouts.",
)
replace(
    "README.md",
    "  protocol.\n",
    "  protocol.\n- **Web app:** [`docs/web-app.md`](docs/web-app.md) — the screens, the layout editor and its keys, and where projects\n  are stored.\n",
)
replace(
    "README.md",
    "npm run check      # typecheck and run all tests\n",
    "npm run dev        # start the web app at http://localhost:5173\nnpm run build      # build the web app into apps/web/dist\nnpm run check      # typecheck, run all tests, and build the web app\n",
)

SPEC = "docs/superpowers/specs/2026-09-27-opencutplan-design.md"
replace(
    SPEC,
    "`.cutplan.json` files with the File System Access API where available, and download/upload otherwise.\n",
    "`.cutplan.json` files with the File System Access API where available, and download/upload otherwise. Tool profiles\nand view choices (show cut lines, draw cut lines at kerf width) are kept in the browser, not in the project file.\n",
)
replace(
    SPEC,
    "- **Optimize**, **Keep searching**, **Optimize the rest**, per-sheet **Pin**; progress bar while the worker runs.\n",
    "- **Optimize** (pinned sheets stay), **Optimize the rest** (every sheet stays; only the tray is planned), **Keep\n  searching** (continues the last search while the layout is still its result), per-sheet **Pin**; progress bar while\n  the worker runs. **Stop** uses the best plan so far. A result is not used when the project changed during the run.\n",
)
replace(
    SPEC,
    "4. **Web app** — workspace tabs, layout editor (ported from the shelf tool), settings and feature switches,\n   persistence, undo/redo.\n",
    "4. **Web app** — workspace tabs, layout editor (ported from the shelf tool), settings and feature switches,\n   persistence, undo/redo. The Shop and Reports tabs arrive with their content in phase 5.\n",
)
print("docs edits applied")
```

Run: `python3 /tmp/docs_edits.py` from the repo root.
Expected: `docs edits applied`. Then `git diff --stat` shows `README.md` and the spec changed, and nothing else.

- [ ] **Step 3: Run the full check**

Run: `npm run check` from the repo root.
Expected: the typecheck is clean; core has 351 tests and the web app has 73 tests, all passing; the build succeeds.

- [ ] **Step 4: Commit**

```bash
git add docs/web-app.md README.md docs/superpowers/specs/2026-09-27-opencutplan-design.md
git commit -m "docs: describe the web app" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
