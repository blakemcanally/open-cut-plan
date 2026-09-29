# OpenCutPlan Phase 6 — Settings Tab, Snapping, and Factory Edges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three issues from the user: make snapping visible while dragging and add a snap grid; let sheets use their factory edges (no trim) and make that the default for new projects; move the settings from the header drawer into a Settings tab.

**Architecture:** "Use the factory edges" is the existing trim setting with the value 0, so the file format and the optimizer do not change: the project radio sets `settings.trim` to 0 or to a width, and a stock item's `trim` is `undefined` (project), `0` (factory edges), or a width. The snap grid is a browser preference (`ViewPrefs.grid`, one size per unit system), not project data. `snapPosition` returns the snapped position and the guide lines; the Layout tab moves the drag ghost to the snapped position, and `SheetView` draws the grid and the guides.

**Tech Stack:** as in phase 5. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-27-opencutplan-design.md` (§4 settings `trim`, §7.1 screens, §7.2 layout editor, §8 feature switches). Task 5 updates these sections.

## Global Constraints

- Add no dependencies.
- The project file format does not change. No schema change, no new `formatVersion`. Old files keep their own `settings.trim` and `stock[].trim`.
- ESM only. Relative imports use the `.ts` / `.tsx` extension. Only erasable TypeScript syntax. The web app imports core only from `"@opencutplan/core"`, never a deep path.
- Single source of truth (spec §3): project settings change only through `store.edit`, so they are undoable and autosaved. The grid and the view choices are browser preferences in `localStorage` key `opencutplan.view`, never in the project.
- Accessibility (spec §7.4): every control has an accessible name; the Settings tab is a normal tab in the tab list, and the arrow keys reach it.
- UI text is plain English, short sentences, one idea each. Copy the strings in this plan exactly; the tests match them.
- Comments: default to none. Only a comment that carries information the code cannot.
- Commit after every task. Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` after a blank line (use two `-m` flags exactly as shown).
- The repo stays local. Do not add a git remote or push (Block policy; spec §13).

## Review Focus

1. **An old project file with a trim** (`settings.trim` 0.25) opens with its trim, and the Settings tab shows **Trim each edge** with that width. Only new projects use the factory edges. Pinned in Task 1 (`uses the factory edges in new projects`; the test helpers keep a 0.25 trim) and Task 2 (`switches between the factory edges and a trim`).
2. **An old file that turned the `trim` feature off** shows **Use the factory edges**; choosing **Trim each edge** turns the feature back on, and the Stock tab edges choice is disabled while the feature is off. Pinned in Task 2 (`shows the factory edges when an old file turned the trim feature off`) and Task 3 (`disables the edges choice while the trim feature is off`).
3. **A bad grid value in localStorage** (a negative number, or bad JSON) falls back to the default grid. Pinned in Task 2 (`loads saved choices and falls back to the defaults for bad or missing values`).
4. **A drag near an edge on a grid** snaps to the edge, not to the grid, and shows the guide on that edge; the ghost sits where the part will drop. Pinned in Task 4 (`prefers a line to the grid`, `snaps the far edge to the far trim line, with the guide on that line`, and the end-to-end drag).
5. **A small zoom with a fine grid**: the grid is not drawn when its lines would be closer than 6 px, so the sheet does not turn grey. Pinned in Task 4 (`draws the grid from the trim corner, and no grid when the lines would be too close`).

## Decisions

These choices go beyond the spec's text. Task 5 records the user-visible ones in the spec and in `docs/web-app.md`.

- New projects use `settings.trim` 0. `DEFAULT_TRIM` (1/4" or 6 mm) stays exported: it is the width the Settings tab and the Stock tab fill in when the user first chooses a trim.
- The Settings tab shows the `trim` feature switch as the **Factory edges** radio, and the `snapping` switch in the **Snapping** section beside the grid size. The Features list shows the other switches. "Use the factory edges" is chosen when the `trim` feature is off or the trim is 0.
- A stock item's **Edges** choice: **Project: …** (`trim` undefined), **Use factory edges** (`trim` 0), or **Trim** (a width). Choosing **Trim** fills in the stock's own width, else the project trim, else `DEFAULT_TRIM`.
- The snap distance goes from 8 to 12 screen pixels. A line (a sheet edge, a trim line, or one kerf from a part) inside the distance wins over the grid. The grid starts at the corner inside the trim. Alt (⌥) and the `snapping` switch turn both off.
- The default grid is 1" or 25 mm. A grid of 0 turns it off. `SheetView` draws the grid only when one step is at least 6 screen pixels.
- The header **Settings** button and the drawer are removed. `Dialog` loses its `drawer` prop. The Settings tab is the last tab.

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/format/defaults.ts` | New projects start with `trim: 0` |
| `apps/web/src/screens/SettingsTab.tsx` | The Settings tab (renamed from `SettingsDrawer.tsx`) |
| `apps/web/src/state/prefs.ts` | Browser view preferences, now with the grid |
| `apps/web/src/screens/Workspace.tsx` | The Settings tab in the tab list; no drawer |
| `apps/web/src/components/Dialog.tsx` | Modal dialog, without the drawer variant |
| `apps/web/src/screens/StockTab.tsx` | The **Edges** column |
| `apps/web/src/layout/snap.ts` | Snap to lines, then to the grid; returns the guides |
| `apps/web/src/layout/LayoutTab.tsx` | The ghost follows the snapped position |
| `apps/web/src/layout/SheetView.tsx` | Draws the grid and the guide lines |
| `docs/web-app.md`, the spec | The user guide and the spec |

---

### Task 1: Core: new projects use the factory edges

**Files:**
- Modify: `apps/web/test/helpers.ts`
- Modify: `packages/core/src/format/defaults.ts`
- Test (modify): `packages/core/test/format/schema.test.ts`
- Modify: `packages/core/test/helpers.ts`

**Interfaces:**
- Consumes: Nothing from earlier tasks. Core already has `createProject`, `DEFAULT_TRIM` (`{ in: 0.25, mm: 6 }`), `trimFor`, and `usableRect`; the optimizer packs inside `usableRect`, so trim 0 packs to the sheet edges.
- Produces (new or changed exports): nothing new.

- [ ] **Step 1: Write the failing tests**

Apply this diff to `packages/core/test/format/schema.test.ts` (save it to a file, then `git apply <file>`):

```diff
--- a/packages/core/test/format/schema.test.ts
+++ b/packages/core/test/format/schema.test.ts
@@ -1,5 +1,5 @@
 import { describe, expect, it } from "vitest";
-import { createProject, FEATURE_KEYS, ProjectSchema } from "../../src/index.ts";
+import { createProject, DEFAULT_TRIM, FEATURE_KEYS, ProjectSchema } from "../../src/index.ts";
 import { sampleProject } from "../helpers.ts";
 
 describe("createProject", () => {
@@ -11,15 +11,16 @@
     expect(project.settings).toEqual({
       features: Object.fromEntries(FEATURE_KEYS.map((key) => [key, true])),
       orderMode: "sheet",
-      trim: 0.25,
+      trim: 0,
       display: { inch: 32, mm: 0.5 },
       optimizer: { timeLimitMs: 2000 },
       currency: "USD",
     });
   });
 
-  it("uses a metric trim for mm projects", () => {
-    expect(createProject("Case", "mm").settings.trim).toBe(6);
+  it("uses the factory edges in new projects", () => {
+    expect(createProject("Case", "mm").settings.trim).toBe(0);
+    expect(DEFAULT_TRIM).toEqual({ in: 0.25, mm: 6 });
   });
 
   it("lists the nine feature switches", () => {
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root packages/core test/format/schema.test.ts`

Expected: FAIL — the new behaviour does not exist yet (a wrong value, a missing element, or `Failed to resolve import`).

- [ ] **Step 3: Write the code**

Apply this diff to `apps/web/test/helpers.ts` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/test/helpers.ts
+++ b/apps/web/test/helpers.ts
@@ -6,6 +6,7 @@
   const base = createProject("Test", "in");
   return {
     ...base,
+    settings: { ...base.settings, trim: 0.25 },
     materials: [{ id: "ply", name: "Plywood", thickness: 0.75, grained: true }],
     stock: [{ id: "ply-4x8", material: "ply", length: 96, width: 48, quantity: null, cost: 60, kind: "sheet" }],
     parts: [
```

Apply this diff to `packages/core/src/format/defaults.ts` (save it to a file, then `git apply <file>`):

```diff
--- a/packages/core/src/format/defaults.ts
+++ b/packages/core/src/format/defaults.ts
@@ -12,6 +12,6 @@
     stock: [],
     parts: [],
     tools: [],
-    settings: { trim: DEFAULT_TRIM[units] },
+    settings: { trim: 0 },
   });
 }
```

Apply this diff to `packages/core/test/helpers.ts` (save it to a file, then `git apply <file>`):

```diff
--- a/packages/core/test/helpers.ts
+++ b/packages/core/test/helpers.ts
@@ -4,6 +4,7 @@
   const base = createProject("Test", "in");
   return {
     ...base,
+    settings: { ...base.settings, trim: 0.25 },
     materials: [{ id: "ply", name: "Plywood 3/4", thickness: 0.75, grained: true }],
     stock: [{ id: "ply-4x8", material: "ply", length: 96, width: 48, quantity: null, cost: 60, kind: "sheet" }],
     parts: [{ id: "side", name: "Side", material: "ply", length: 30, width: 12, quantity: 2, grain: "length" }],
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run --root packages/core test/format/schema.test.ts`

Expected: PASS.

- [ ] **Step 5: Run the full check**

Run: `npm run check` from the repo root.

Expected: the typecheck is clean; core has 370 tests and the web app has 123 tests, all passing; the build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/web/test/helpers.ts packages/core/src/format/defaults.ts packages/core/test/format/schema.test.ts packages/core/test/helpers.ts
git commit -m "feat(core): start new projects on the factory edges" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```


---

### Task 2: Web: the Settings tab and the grid preference

**Files:**
- Modify: `apps/web/src/components/Dialog.tsx`
- Rename and modify: `apps/web/src/screens/SettingsDrawer.tsx` → `apps/web/src/screens/SettingsTab.tsx`
- Modify: `apps/web/src/screens/Workspace.tsx`
- Modify: `apps/web/src/state/prefs.ts`
- Modify: `apps/web/src/styles.css`
- Test (modify): `apps/web/test/Workspace.test.tsx`
- Test (modify): `apps/web/test/history.test.ts`
- Test (modify): `apps/web/test/screens.test.tsx`

**Interfaces:**
- Consumes: Task 1: new projects have `settings.trim` 0. Core: `DEFAULT_TRIM`, `FEATURE_KEYS`, `convertProject`. Web: `ProjectStore` (`project`, `edit`), `LengthInput` (`allowZero`), `usePrefs()` → `[ViewPrefs, setPrefs]`, `sampleProject()` in `test/helpers.ts` (trim 0.25, one 96 × 48 stock item `ply-4x8`).
- Produces (new or changed exports):
  - `apps/web/src/components/Dialog.tsx`: `function Dialog({ title, onClose, children }: DialogProps)`
  - `apps/web/src/screens/SettingsTab.tsx`: `function SettingsTab({ store, prefs, onPrefs }: SettingsTabProps)`
  - `apps/web/src/screens/SettingsTab.tsx` no longer exports: `function SettingsDrawer({ store, prefs, onPrefs, onClose }: SettingsDrawerProps)`
  - `apps/web/src/state/prefs.ts`: `const DEFAULT_PREFS: ViewPrefs = { showCuts: true, showKerf: false, grid: { in: 1, mm: 25 } };`
  - `apps/web/src/state/prefs.ts`: `ViewPrefs` gains `grid: Readonly<Record<Units, number>>`, the snap grid for each unit system (0 = off).

- [ ] **Step 1: Write the failing tests**

Apply this diff to `apps/web/test/Workspace.test.tsx` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/test/Workspace.test.tsx
+++ b/apps/web/test/Workspace.test.tsx
@@ -76,24 +76,23 @@
     expect(alert.textContent).toContain("Save file");
   });
 
-  it("returns focus to Settings when the settings drawer closes", async () => {
+  it("returns focus to the opener when a dialog closes", async () => {
     await renderWorkspace();
-    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
-    const dialog = screen.getByRole("dialog", { name: "Settings" });
-    const kerf = within(dialog).getByRole("checkbox", { name: /^Kerf/ });
-    await userEvent.click(kerf);
-    expect((kerf as HTMLInputElement).checked).toBe(false);
+    await userEvent.click(screen.getByRole("tab", { name: "Parts" }));
+    await userEvent.click(screen.getByRole("button", { name: "Paste rows…" }));
+    expect(screen.getByRole("dialog", { name: "Import parts" })).toBeTruthy();
     await userEvent.keyboard("{Escape}");
     expect(screen.queryByRole("dialog")).toBeNull();
-    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Settings" }));
+    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Paste rows…" }));
   });
 
-  it("keeps Tab inside the open settings drawer", async () => {
+  it("keeps Tab inside an open dialog", async () => {
     await renderWorkspace();
-    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
-    const dialog = screen.getByRole("dialog", { name: "Settings" });
+    await userEvent.click(screen.getByRole("tab", { name: "Parts" }));
+    await userEvent.click(screen.getByRole("button", { name: "Paste rows…" }));
+    const dialog = screen.getByRole("dialog", { name: "Import parts" });
     const close = within(dialog).getByRole("button", { name: "Close" });
-    expect(document.activeElement).toBe(close);
+    close.focus();
     await userEvent.tab({ shift: true });
     expect(dialog.contains(document.activeElement)).toBe(true);
     expect(document.activeElement).not.toBe(close);
@@ -107,9 +106,11 @@
     await renderWorkspace();
     part("Side 2").focus();
     await userEvent.keyboard("r");
-    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
+    await userEvent.click(screen.getByRole("tab", { name: "Parts" }));
+    await userEvent.click(screen.getByRole("button", { name: "Paste rows…" }));
     await userEvent.keyboard("{Meta>}z{/Meta}");
     await userEvent.keyboard("{Escape}");
+    await userEvent.click(screen.getByRole("tab", { name: "Layout" }));
     expect(part("Side 2").getAttribute("aria-label")).toContain("turned");
   });
 
@@ -131,11 +132,11 @@
     const stripes = () => sheet.querySelectorAll('rect[fill^="url("]').length;
     expect(part("Side 2").getAttribute("aria-label")).toContain("across the grain");
     expect(stripes()).toBeGreaterThan(0);
-    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
-    await userEvent.click(within(screen.getByRole("dialog", { name: "Settings" })).getByRole("checkbox", { name: /^Grain/ }));
-    await userEvent.keyboard("{Escape}");
+    await userEvent.click(screen.getByRole("tab", { name: "Settings" }));
+    await userEvent.click(screen.getByRole("checkbox", { name: /^Grain/ }));
+    await userEvent.click(screen.getByRole("tab", { name: "Layout" }));
+    expect(screen.getByRole("group", { name: /^Sheet 1 layout/ }).querySelectorAll('rect[fill^="url("]').length).toBe(0);
     expect(part("Side 2").getAttribute("aria-label")).not.toContain("across the grain");
-    expect(stripes()).toBe(0);
   });
 
   it("prints the cut sequence from the Shop tab and removes the print pages after the dialog", async () => {
```

Apply this diff to `apps/web/test/history.test.ts` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/test/history.test.ts
+++ b/apps/web/test/history.test.ts
@@ -60,8 +60,8 @@
 
 describe("view prefs", () => {
   it("loads saved choices and falls back to the defaults for bad or missing values", () => {
-    localStorage.setItem("opencutplan.view", JSON.stringify({ showCuts: false, showKerf: "yes" }));
-    expect(loadPrefs()).toEqual({ showCuts: false, showKerf: DEFAULT_PREFS.showKerf });
+    localStorage.setItem("opencutplan.view", JSON.stringify({ showCuts: false, showKerf: "yes", grid: { in: 0.5, mm: -1 } }));
+    expect(loadPrefs()).toEqual({ showCuts: false, showKerf: DEFAULT_PREFS.showKerf, grid: { in: 0.5, mm: 25 } });
     localStorage.setItem("opencutplan.view", "{not json");
     expect(loadPrefs()).toEqual(DEFAULT_PREFS);
     localStorage.clear();
```

Apply this diff to `apps/web/test/screens.test.tsx` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/test/screens.test.tsx
+++ b/apps/web/test/screens.test.tsx
@@ -1,10 +1,11 @@
 import { screen, waitFor, within } from "@testing-library/react";
 import userEvent from "@testing-library/user-event";
+import { useState } from "react";
 import { describe, expect, it } from "vitest";
-import { SettingsDrawer } from "../src/screens/SettingsDrawer.tsx";
+import { SettingsTab } from "../src/screens/SettingsTab.tsx";
 import { StockTab } from "../src/screens/StockTab.tsx";
 import { ToolsTab } from "../src/screens/ToolsTab.tsx";
-import { DEFAULT_PREFS } from "../src/state/prefs.ts";
+import { DEFAULT_PREFS, type ViewPrefs } from "../src/state/prefs.ts";
 import { openStorage } from "../src/storage/db.ts";
 import { sampleProject } from "./helpers.ts";
 import { renderWithStore } from "./render.tsx";
@@ -54,15 +55,57 @@
   });
 });
 
-describe("SettingsDrawer", () => {
+describe("SettingsTab", () => {
+  let prefs: ViewPrefs = DEFAULT_PREFS;
+  function WithPrefs({ store }: { store: Parameters<typeof SettingsTab>[0]["store"] }) {
+    const [value, setValue] = useState(DEFAULT_PREFS);
+    prefs = value;
+    return <SettingsTab store={store} prefs={value} onPrefs={setValue} />;
+  }
+
   it("converts the project to millimetres and turns a feature off", async () => {
-    const { current } = renderWithStore(sampleProject(), (store) => <SettingsDrawer store={store} prefs={DEFAULT_PREFS} onPrefs={() => undefined} onClose={() => undefined} />);
-    const dialog = screen.getByRole("dialog", { name: "Settings" });
-    await userEvent.selectOptions(within(dialog).getByLabelText("Units"), "mm");
+    const { current } = renderWithStore(sampleProject(), (store) => <WithPrefs store={store} />);
+    await userEvent.selectOptions(screen.getByLabelText("Units"), "mm");
     expect(current().project.project.units).toBe("mm");
     expect(current().project.parts[0]!.length).toBe(762);
     expect(current().project.tools[0]!.kerf).toBe(3.175);
-    await userEvent.click(within(dialog).getByRole("checkbox", { name: /^Grain/ }));
+    await userEvent.click(screen.getByRole("checkbox", { name: /^Grain/ }));
     expect(current().project.settings.features.grain).toBe(false);
   });
+
+  it("switches between the factory edges and a trim", async () => {
+    const { current } = renderWithStore(sampleProject(), (store) => <WithPrefs store={store} />);
+    const edges = within(screen.getByRole("group", { name: "Factory edges" }));
+    expect(edges.getByRole("radio", { name: /^Trim each edge/ })).toHaveProperty("checked", true);
+    expect(edges.getByLabelText("Trim width")).toHaveProperty("value", '1/4"');
+    await userEvent.click(edges.getByRole("radio", { name: /^Use the factory edges/ }));
+    expect(current().project.settings.trim).toBe(0);
+    expect(edges.queryByLabelText("Trim width")).toBeNull();
+    await userEvent.click(edges.getByRole("radio", { name: /^Trim each edge/ }));
+    expect(current().project.settings.trim).toBe(0.25);
+  });
+
+  it("shows the factory edges when an old file turned the trim feature off", async () => {
+    const project = sampleProject();
+    const { current } = renderWithStore({ ...project, settings: { ...project.settings, features: { ...project.settings.features, trim: false } } }, (store) => <WithPrefs store={store} />);
+    const edges = within(screen.getByRole("group", { name: "Factory edges" }));
+    expect(edges.getByRole("radio", { name: /^Use the factory edges/ })).toHaveProperty("checked", true);
+    await userEvent.click(edges.getByRole("radio", { name: /^Trim each edge/ }));
+    expect(current().project.settings.features.trim).toBe(true);
+    expect(current().project.settings.trim).toBe(0.25);
+    expect(screen.queryByRole("checkbox", { name: /^Edge trim/ })).toBeNull();
+  });
+
+  it("keeps the snap switch and the grid together, and the grid in this browser", async () => {
+    const { current } = renderWithStore(sampleProject(), (store) => <WithPrefs store={store} />);
+    const snapping = within(screen.getByRole("group", { name: "Snapping" }));
+    await userEvent.click(snapping.getByRole("checkbox", { name: /^Snapping/ }));
+    expect(current().project.settings.features.snapping).toBe(false);
+    const grid = snapping.getByLabelText(/^Grid/);
+    expect(grid).toHaveProperty("value", '1"');
+    await userEvent.clear(grid);
+    await userEvent.type(grid, "1/2{Enter}");
+    expect(prefs.grid).toEqual({ in: 0.5, mm: 25 });
+    expect(current().project.settings).not.toHaveProperty("grid");
+  });
 });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root apps/web test/Workspace.test.tsx test/history.test.ts test/screens.test.tsx`

Expected: FAIL — the new behaviour does not exist yet (a wrong value, a missing element, or `Failed to resolve import`).

- [ ] **Step 3: Write the code**

Apply this diff to `apps/web/src/components/Dialog.tsx` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/src/components/Dialog.tsx
+++ b/apps/web/src/components/Dialog.tsx
@@ -6,11 +6,9 @@
   title: string;
   onClose(): void;
   children: ReactNode;
-  /** A drawer sits at the right edge. */
-  drawer?: boolean;
 }
 
-export function Dialog({ title, onClose, children, drawer }: DialogProps) {
+export function Dialog({ title, onClose, children }: DialogProps) {
   const titleId = useId();
   const ref = useRef<HTMLDivElement>(null);
   useEffect(() => {
@@ -35,10 +33,10 @@
     event.preventDefault();
   };
   return (
-    <div className={drawer ? "backdrop drawer-backdrop" : "backdrop"} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
+    <div className="backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
       <div
         ref={ref}
-        className={drawer ? "dialog drawer" : "dialog"}
+        className="dialog"
         role="dialog"
         aria-modal="true"
         aria-labelledby={titleId}
```

Rename the file with `git mv apps/web/src/screens/SettingsDrawer.tsx apps/web/src/screens/SettingsTab.tsx`, then apply this diff to `apps/web/src/screens/SettingsTab.tsx` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/src/screens/SettingsTab.tsx
+++ b/apps/web/src/screens/SettingsTab.tsx
@@ -1,5 +1,6 @@
 import {
   DEFAULT_MIN_OFFCUT,
+  DEFAULT_TRIM,
   FEATURE_KEYS,
   type Features,
   type InchPrecision,
@@ -8,7 +9,6 @@
   type Settings,
   type Units,
 } from "@opencutplan/core";
-import { Dialog } from "../components/Dialog.tsx";
 import { LengthInput, NumberInput, TextInput } from "../components/fields.tsx";
 import { convertProjectUnits } from "../edit/units.ts";
 import type { ViewPrefs } from "../state/prefs.ts";
@@ -34,41 +34,39 @@
   { value: "decimal", label: "Decimal inches" },
 ];
 const MM_STEPS: readonly MmPrecision[] = [1, 0.5, 0.1];
-
-interface SettingsDrawerProps {
+const LISTED_FEATURES = FEATURE_KEYS.filter((key) => key !== "trim" && key !== "snapping");
+
+interface SettingsTabProps {
   store: ProjectStore;
   prefs: ViewPrefs;
   onPrefs(prefs: ViewPrefs): void;
-  onClose(): void;
 }
 
-export function SettingsDrawer({ store, prefs, onPrefs, onClose }: SettingsDrawerProps) {
+export function SettingsTab({ store, prefs, onPrefs }: SettingsTabProps) {
   const { project, edit } = store;
   const { settings } = project;
   const units = project.project.units;
   const display = settings.display;
   const set = (change: (settings: Settings) => Settings, key?: string) => edit((p: Project) => ({ ...p, settings: change(p.settings) }), key);
   const minOffcut = settings.minOffcut ?? DEFAULT_MIN_OFFCUT[units];
+  const factoryEdges = !settings.features.trim || settings.trim === 0;
+  const feature = (key: keyof Features) => (
+    <label key={key} className="switch">
+      <input
+        type="checkbox"
+        checked={settings.features[key]}
+        onChange={(event) => set((s) => ({ ...s, features: { ...s.features, [key]: event.target.checked } }))}
+      />
+      <span>
+        <b>{FEATURE_TEXT[key].label}</b>
+        <small>{FEATURE_TEXT[key].detail}</small>
+      </span>
+    </label>
+  );
 
   return (
-    <Dialog title="Settings" onClose={onClose} drawer>
-      <fieldset>
-        <legend>Features</legend>
-        {FEATURE_KEYS.map((key) => (
-          <label key={key} className="switch">
-            <input
-              type="checkbox"
-              checked={settings.features[key]}
-              onChange={(event) => set((s) => ({ ...s, features: { ...s.features, [key]: event.target.checked } }))}
-            />
-            <span>
-              <b>{FEATURE_TEXT[key].label}</b>
-              <small>{FEATURE_TEXT[key].detail}</small>
-            </span>
-          </label>
-        ))}
-      </fieldset>
-
+    <div className="settings-tab">
+      <h2 className="visually-hidden">Settings</h2>
       <fieldset>
         <legend>Units and precision</legend>
         <label className="stack">
@@ -110,6 +108,51 @@
       </fieldset>
 
       <fieldset>
+        <legend>Factory edges</legend>
+        <label className="switch">
+          <input type="radio" name="factory-edges" checked={factoryEdges} onChange={() => set((s) => ({ ...s, trim: 0 }))} />
+          <span>
+            <b>Use the factory edges</b>
+            <small>Parts go up to the sheet edges. The plan has no trim cuts.</small>
+          </span>
+        </label>
+        <label className="switch">
+          <input
+            type="radio"
+            name="factory-edges"
+            checked={!factoryEdges}
+            onChange={() => set((s) => ({ ...s, features: { ...s.features, trim: true }, trim: s.trim > 0 ? s.trim : DEFAULT_TRIM[units] }))}
+          />
+          <span>
+            <b>Trim each edge</b>
+            <small>The first cuts take a strip off each factory edge.</small>
+          </span>
+        </label>
+        {!factoryEdges && (
+          <label className="stack">
+            Trim width
+            <LengthInput value={settings.trim} units={units} display={display} onChange={(trim) => trim !== undefined && set((s) => ({ ...s, trim }))} />
+          </label>
+        )}
+        <p className="muted">A sheet on the Stock tab can make its own choice.</p>
+      </fieldset>
+
+      <fieldset>
+        <legend>Snapping</legend>
+        {feature("snapping")}
+        <label className="stack">
+          Grid (this browser only; 0 turns it off)
+          <LengthInput
+            value={prefs.grid[units]}
+            units={units}
+            display={display}
+            allowZero
+            onChange={(grid) => grid !== undefined && onPrefs({ ...prefs, grid: { ...prefs.grid, [units]: grid } })}
+          />
+        </label>
+      </fieldset>
+
+      <fieldset>
         <legend>Plan</legend>
         <label className="stack">
           Cut order
@@ -117,10 +160,6 @@
             <option value="sheet">Sheet by sheet</option>
             <option value="setup">Group cuts with the same saw setting</option>
           </select>
-        </label>
-        <label className="stack">
-          Edge trim
-          <LengthInput value={settings.trim} units={units} display={display} allowZero onChange={(trim) => trim !== undefined && set((s) => ({ ...s, trim }))} />
         </label>
         <div className="pair">
           <label className="stack">
@@ -198,6 +237,11 @@
           </span>
         </label>
       </fieldset>
-    </Dialog>
+
+      <fieldset>
+        <legend>Features</legend>
+        {LISTED_FEATURES.map(feature)}
+      </fieldset>
+    </div>
   );
 }
```

Apply this diff to `apps/web/src/screens/Workspace.tsx` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/src/screens/Workspace.tsx
+++ b/apps/web/src/screens/Workspace.tsx
@@ -13,7 +13,7 @@
 import type { Storage } from "../storage/db.ts";
 import { projectFileName, saveProjectFile } from "../storage/files.ts";
 import { PartsTab } from "./PartsTab.tsx";
-import { SettingsDrawer } from "./SettingsDrawer.tsx";
+import { SettingsTab } from "./SettingsTab.tsx";
 import { StockTab } from "./StockTab.tsx";
 import { ToolsTab } from "./ToolsTab.tsx";
 
@@ -24,6 +24,7 @@
   { id: "layout", label: "Layout" },
   { id: "shop", label: "Shop" },
   { id: "reports", label: "Reports" },
+  { id: "settings", label: "Settings" },
 ] as const;
 
 export type TabId = (typeof TABS)[number]["id"];
@@ -50,7 +51,6 @@
   const runs = useOptimizeRuns(store, workerFactory);
   const [prefs, setPrefs] = usePrefs();
   const [tab, setTab] = useState<TabId>(initial.parts.length > 0 ? "layout" : "parts");
-  const [settingsOpen, setSettingsOpen] = useState(false);
   const [notices, setNotices] = useState(initialNotices);
   const [handle, setHandle] = useState(initialHandle);
   const [fileStatus, setFileStatus] = useState<string | null>(null);
@@ -119,9 +119,6 @@
         <button type="button" onClick={() => void save(true)}>
           Save as…
         </button>
-        <button type="button" onClick={() => setSettingsOpen(true)} aria-haspopup="dialog">
-          Settings
-        </button>
       </header>
       {saveError && (
         <p role="alert" className="banner error">
@@ -169,9 +166,9 @@
         {tab === "layout" && <LayoutTab store={store} analysis={analysis} prefs={prefs} runs={runs} />}
         {tab === "shop" && <ShopTab store={store} analysis={analysis} onPrint={setPrintJob} />}
         {tab === "reports" && <ReportsTab store={store} analysis={analysis} onPrint={setPrintJob} />}
+        {tab === "settings" && <SettingsTab store={store} prefs={prefs} onPrefs={setPrefs} />}
       </div>
       {printJob && <PrintView job={printJob} analysis={analysis} onDone={endPrint} />}
-      {settingsOpen && <SettingsDrawer store={store} prefs={prefs} onPrefs={setPrefs} onClose={() => setSettingsOpen(false)} />}
     </div>
   );
 }
```

Apply this diff to `apps/web/src/state/prefs.ts` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/src/state/prefs.ts
+++ b/apps/web/src/state/prefs.ts
@@ -1,19 +1,28 @@
+import type { Units } from "@opencutplan/core";
 import { useCallback, useState } from "react";
 
 export interface ViewPrefs {
   showCuts: boolean;
   showKerf: boolean;
+  /** The snap grid for each unit system, in that unit. 0 turns the grid off. */
+  grid: Readonly<Record<Units, number>>;
 }
 
-export const DEFAULT_PREFS: ViewPrefs = { showCuts: true, showKerf: false };
+export const DEFAULT_PREFS: ViewPrefs = { showCuts: true, showKerf: false, grid: { in: 1, mm: 25 } };
 const KEY = "opencutplan.view";
+
+function gridSize(value: unknown, fallback: number): number {
+  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
+}
 
 export function loadPrefs(storage: globalThis.Storage = localStorage): ViewPrefs {
   try {
-    const saved = JSON.parse(storage.getItem(KEY) ?? "{}") as Partial<ViewPrefs>;
+    const saved = JSON.parse(storage.getItem(KEY) ?? "{}") as Partial<Record<keyof ViewPrefs, unknown>>;
+    const grid = (typeof saved.grid === "object" && saved.grid !== null ? saved.grid : {}) as Partial<Record<Units, unknown>>;
     return {
       showCuts: typeof saved.showCuts === "boolean" ? saved.showCuts : DEFAULT_PREFS.showCuts,
       showKerf: typeof saved.showKerf === "boolean" ? saved.showKerf : DEFAULT_PREFS.showKerf,
+      grid: { in: gridSize(grid.in, DEFAULT_PREFS.grid.in), mm: gridSize(grid.mm, DEFAULT_PREFS.grid.mm) },
     };
   } catch {
     return DEFAULT_PREFS;
```

Apply this diff to `apps/web/src/styles.css` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/src/styles.css
+++ b/apps/web/src/styles.css
@@ -72,11 +72,11 @@
 .tool-list li.disabled fieldset { opacity: 0.7; border-style: dashed; }
 .tool-fields { display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: flex-end; }
 .tools-tab section + section { margin-top: 24px; }
+.settings-tab { max-width: 640px; }
+.settings-tab fieldset { border: 1px solid var(--line); border-radius: 8px; margin: 0 0 14px; }
 
 .backdrop { position: fixed; inset: 0; background: #0005; display: flex; align-items: center; justify-content: center; z-index: 50; }
 .dialog { background: var(--panel); border-radius: 10px; padding: 16px; width: min(760px, 94vw); max-height: 90vh; overflow: auto; box-shadow: 0 10px 40px #0004; }
-.drawer-backdrop { justify-content: flex-end; align-items: stretch; }
-.dialog.drawer { width: min(420px, 100vw); max-height: none; height: 100vh; border-radius: 0; }
 .dialog-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
 .dialog-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
 .dialog textarea { width: 100%; font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run --root apps/web test/Workspace.test.tsx test/history.test.ts test/screens.test.tsx`

Expected: PASS (web: 3 new tests).

- [ ] **Step 5: Run the full check**

Run: `npm run check` from the repo root.

Expected: the typecheck is clean; core has 370 tests and the web app has 126 tests, all passing; the build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/Dialog.tsx apps/web/src/screens/SettingsTab.tsx apps/web/src/screens/Workspace.tsx apps/web/src/state/prefs.ts apps/web/src/styles.css apps/web/test/Workspace.test.tsx apps/web/test/history.test.ts apps/web/test/screens.test.tsx
git commit -m "feat(web): move the settings into a Settings tab" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```


---

### Task 3: Web: the Stock tab edges choice

**Files:**
- Modify: `apps/web/src/screens/StockTab.tsx`
- Test (modify): `apps/web/test/screens.test.tsx`

**Interfaces:**
- Consumes: Task 1: `DEFAULT_TRIM`. Core: `formatLength(value, units, display)`, `Stock` (`trim?: number`). Web: `StockTab`, `LengthInput`, `renderWithStore` in `test/render.tsx`.
- Produces (new or changed exports): nothing new.

- [ ] **Step 1: Write the failing tests**

Apply this diff to `apps/web/test/screens.test.tsx` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/test/screens.test.tsx
+++ b/apps/web/test/screens.test.tsx
@@ -17,6 +17,31 @@
     await userEvent.click(screen.getByRole("button", { name: "Delete stock ply-4x8" }));
     expect(current().project.stock).toEqual([]);
     expect(current().project.plan!.sheets).toEqual([]);
+  });
+
+  it("lets a sheet use its factory edges or its own trim", async () => {
+    const { current } = renderWithStore(sampleProject(), (store) => <StockTab store={store} />);
+    const edges = screen.getByRole("combobox", { name: "Edges of stock ply-4x8" });
+    expect(edges).toHaveProperty("value", "project");
+    expect(within(edges).getByRole("option", { name: 'Project: trim 1/4"' })).toBeTruthy();
+    await userEvent.selectOptions(edges, "use");
+    expect(current().project.stock[0]!.trim).toBe(0);
+    expect(screen.queryByLabelText("Trim of stock ply-4x8")).toBeNull();
+    await userEvent.selectOptions(edges, "trim");
+    expect(current().project.stock[0]!.trim).toBe(0.25);
+    const width = screen.getByLabelText("Trim of stock ply-4x8");
+    await userEvent.clear(width);
+    await userEvent.type(width, "1/2{Enter}");
+    expect(current().project.stock[0]!.trim).toBe(0.5);
+    await userEvent.selectOptions(edges, "project");
+    expect(current().project.stock[0]).not.toHaveProperty("trim");
+  });
+
+  it("disables the edges choice while the trim feature is off", () => {
+    const project = sampleProject();
+    project.settings.features.trim = false;
+    renderWithStore(project, (store) => <StockTab store={store} />);
+    expect(screen.getByRole("combobox", { name: "Edges of stock ply-4x8" })).toHaveProperty("disabled", true);
   });
 
   it("adds stock, and an unused material can be deleted", async () => {
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root apps/web test/screens.test.tsx`

Expected: FAIL — the new behaviour does not exist yet (a wrong value, a missing element, or `Failed to resolve import`).

- [ ] **Step 3: Write the code**

Apply this diff to `apps/web/src/screens/StockTab.tsx` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/src/screens/StockTab.tsx
+++ b/apps/web/src/screens/StockTab.tsx
@@ -1,4 +1,4 @@
-import { formatLength, type StockKind } from "@opencutplan/core";
+import { DEFAULT_TRIM, formatLength, type Stock, type StockKind, type Units } from "@opencutplan/core";
 import { useState } from "react";
 import { CsvImportDialog } from "../components/CsvImportDialog.tsx";
 import { LengthInput, NumberInput, TextInput } from "../components/fields.tsx";
@@ -7,12 +7,27 @@
 import { chooseFile } from "../storage/files.ts";
 import { isTableText } from "./PartsTab.tsx";
 
+type EdgeChoice = "project" | "use" | "trim";
+
+function edgeChoice(stock: Stock): EdgeChoice {
+  return stock.trim === undefined ? "project" : stock.trim === 0 ? "use" : "trim";
+}
+
+function trimForChoice(choice: EdgeChoice, stock: Stock, projectTrim: number, units: Units): number | undefined {
+  if (choice === "project") return undefined;
+  if (choice === "use") return 0;
+  if (stock.trim !== undefined && stock.trim > 0) return stock.trim;
+  return projectTrim > 0 ? projectTrim : DEFAULT_TRIM[units];
+}
+
 export function StockTab({ store }: { store: ProjectStore }) {
   const { project, edit } = store;
   const [importing, setImporting] = useState<string | null>(null);
   const units = project.project.units;
   const display = project.settings.display;
   const currency = project.settings.currency;
+  const { features, trim: projectTrim } = project.settings;
+  const projectEdges = !features.trim || projectTrim === 0 ? "Project: use factory edges" : `Project: trim ${formatLength(projectTrim, units, display)}`;
 
   return (
     <div
@@ -131,7 +146,7 @@
                   <th scope="col">Qty</th>
                   <th scope="col">Cost ({currency})</th>
                   <th scope="col">Kind</th>
-                  <th scope="col">Trim</th>
+                  <th scope="col">Edges</th>
                   <th scope="col">Use</th>
                   <th scope="col">
                     <span className="visually-hidden">Actions</span>
@@ -184,17 +199,28 @@
                         </select>
                       </td>
                       <td>
-                        <LengthInput
-                          aria-label={`Trim of stock ${label}`}
-                          className="narrow"
-                          placeholder={formatLength(project.settings.trim, units, display)}
-                          value={stock.trim}
-                          units={units}
-                          display={display}
-                          optional
-                          allowZero
-                          onChange={(trim) => change({ trim })}
-                        />
+                        <span className="inline">
+                          <select
+                            aria-label={`Edges of stock ${label}`}
+                            value={edgeChoice(stock)}
+                            disabled={!features.trim}
+                            onChange={(event) => change({ trim: trimForChoice(event.target.value as EdgeChoice, stock, projectTrim, units) })}
+                          >
+                            <option value="project">{projectEdges}</option>
+                            <option value="use">Use factory edges</option>
+                            <option value="trim">Trim</option>
+                          </select>
+                          {edgeChoice(stock) === "trim" && (
+                            <LengthInput
+                              aria-label={`Trim of stock ${label}`}
+                              className="narrow"
+                              value={stock.trim}
+                              units={units}
+                              display={display}
+                              onChange={(trim) => trim !== undefined && change({ trim })}
+                            />
+                          )}
+                        </span>
                       </td>
                       <td>
                         <input
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run --root apps/web test/screens.test.tsx`

Expected: PASS (web: 2 new tests).

- [ ] **Step 5: Run the full check**

Run: `npm run check` from the repo root.

Expected: the typecheck is clean; core has 370 tests and the web app has 128 tests, all passing; the build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/screens/StockTab.tsx apps/web/test/screens.test.tsx
git commit -m "feat(web): let each stock item use its factory edges or a trim" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```


---

### Task 4: Web: visible snapping and the grid

**Files:**
- Test (modify): `apps/web/e2e/plan.e2e.ts`
- Modify: `apps/web/src/layout/LayoutTab.tsx`
- Modify: `apps/web/src/layout/SheetView.tsx`
- Modify: `apps/web/src/layout/snap.ts`
- Modify: `apps/web/src/styles.css`
- Test (modify): `apps/web/test/LayoutTab.test.tsx`
- Test (modify): `apps/web/test/Workspace.test.tsx`
- Test (modify): `apps/web/test/snap.test.ts`

**Interfaces:**
- Consumes: Task 2: `ViewPrefs.grid: Readonly<Record<Units, number>>`, `DEFAULT_PREFS.grid` = `{ in: 1, mm: 25 }`; the Settings tab is the last tab, labelled `Settings`. Core: `usableRect(ctx, stock)`, `PlanContext` (`units`, `features.snapping`, `kerf`).
- Produces (new or changed exports):
  - `apps/web/src/layout/snap.ts`: `interface Snapped`; `function snapPosition(input: SnapInput): Snapped`
  - `apps/web/src/layout/snap.ts`: `SnapInput` gains `grid: number` (project units, 0 = off); `Snapped` is `{ x, y, guides: { x: number | null; y: number | null } }`.
  - `apps/web/src/layout/SheetView.tsx`: `SheetView` takes a new `grid: number` prop; `DropPreview` gains `guides`.

- [ ] **Step 1: Write the failing tests**

Apply this diff to `apps/web/e2e/plan.e2e.ts` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/e2e/plan.e2e.ts
+++ b/apps/web/e2e/plan.e2e.ts
@@ -152,6 +152,22 @@
   await page.getByRole("button", { name: "Undo" }).click();
   await expect(tray.getByRole("button", { name: /Side 1/ })).toHaveCount(0);
   await expect(page.getByRole("button", { name: /^Side 1,/ })).toBeVisible();
+
+  const sheet = (await page.locator("svg[data-sheet]").first().boundingBox())!;
+  const start = (await page.getByRole("button", { name: /^Side 1,/ }).boundingBox())!;
+  await page.mouse.move(start.x + 5, start.y + 5);
+  await page.mouse.down();
+  await page.mouse.move(start.x + 25, start.y + 25, { steps: 4 });
+  const inch = sheet.width / 96;
+  await page.mouse.move(sheet.x + 65.2 * inch + 5, sheet.y + 30 * inch + 5, { steps: 10 });
+  const ghost = (await page.locator(".ghost").boundingBox())!;
+  const drop = (await page.locator(".drop-preview").boundingBox())!;
+  expect(Math.abs(ghost.x - drop.x)).toBeLessThan(1.5);
+  expect(Math.abs(ghost.y - drop.y)).toBeLessThan(1.5);
+  const guide = (await page.locator("line.snap-guide").first().boundingBox())!;
+  expect(Math.abs(guide.x - (sheet.x + sheet.width))).toBeLessThan(1.5);
+  await page.mouse.up();
+  await expect(page.getByLabel("X (from the left)")).toHaveValue('66"');
 });
 
 async function readDownload(download: { createReadStream(): Promise<NodeJS.ReadableStream> }): Promise<string> {
```

Apply this diff to `apps/web/test/LayoutTab.test.tsx` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/test/LayoutTab.test.tsx
+++ b/apps/web/test/LayoutTab.test.tsx
@@ -4,6 +4,7 @@
 import { useMemo } from "react";
 import { describe, expect, it } from "vitest";
 import { LayoutTab } from "../src/layout/LayoutTab.tsx";
+import { SheetView } from "../src/layout/SheetView.tsx";
 import { useOptimizeRuns } from "../src/optimizer/useOptimizeRuns.ts";
 import type { WorkerFactory, WorkerLike } from "../src/optimizer/useOptimizer.ts";
 import { DEFAULT_PREFS } from "../src/state/prefs.ts";
@@ -25,6 +26,50 @@
 
 const part = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name},`) });
 const tray = () => screen.getByRole("region", { name: /Unplaced parts/ });
+
+describe("SheetView", () => {
+  const draw = (preview: Parameters<typeof SheetView>[0]["preview"], grid = 0) => {
+    const project = sampleProject();
+    const { container } = render(
+      <SheetView
+        ctx={analyzeProject(project).context}
+        sheet={project.plan!.sheets[0]!}
+        number={1}
+        scale={4}
+        steps={[]}
+        colors={new Map()}
+        errors={new Set()}
+        selected={null}
+        dragging={null}
+        preview={preview}
+        showCuts={false}
+        showKerf={false}
+        grid={grid}
+        busy={false}
+        onPartPointerDown={() => undefined}
+        onSelect={() => undefined}
+        onTogglePin={() => undefined}
+        onRemove={() => undefined}
+      />,
+    );
+    return container;
+  };
+
+  it("draws a guide across the sheet for each snapped axis", () => {
+    const container = draw({ rect: { x: 40, y: 20, length: 20, width: 10 }, bad: false, guides: { x: 60, y: null } });
+    const guides = container.querySelectorAll("line.snap-guide");
+    expect(guides).toHaveLength(1);
+    expect([...guides].map((line) => ["x1", "y1", "x2", "y2"].map((name) => line.getAttribute(name)))).toEqual([["240", "0", "240", "192"]]);
+  });
+
+  it("draws the grid from the trim corner, and no grid when the lines would be too close", () => {
+    const grid = draw(null, 2).querySelector('pattern[id$="-grid"]');
+    expect([grid?.getAttribute("x"), grid?.getAttribute("width")]).toEqual(["1", "8"]);
+    expect(draw(null, 2).querySelector("rect.grid")).not.toBeNull();
+    expect(draw(null, 1).querySelector("rect.grid")).toBeNull();
+    expect(draw(null, 0).querySelector("rect.grid")).toBeNull();
+  });
+});
 
 describe("LayoutTab", () => {
   it("turns a focused part with R and sends it to the tray with Delete", async () => {
```

Apply this diff to `apps/web/test/Workspace.test.tsx` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/test/Workspace.test.tsx
+++ b/apps/web/test/Workspace.test.tsx
@@ -129,13 +129,13 @@
     part("Side 2").focus();
     await userEvent.keyboard("r");
     const sheet = screen.getByRole("group", { name: /^Sheet 1 layout/ });
-    const stripes = () => sheet.querySelectorAll('rect[fill^="url("]').length;
+    const stripes = () => sheet.querySelectorAll('rect:not(.grid)[fill^="url("]').length;
     expect(part("Side 2").getAttribute("aria-label")).toContain("across the grain");
     expect(stripes()).toBeGreaterThan(0);
     await userEvent.click(screen.getByRole("tab", { name: "Settings" }));
     await userEvent.click(screen.getByRole("checkbox", { name: /^Grain/ }));
     await userEvent.click(screen.getByRole("tab", { name: "Layout" }));
-    expect(screen.getByRole("group", { name: /^Sheet 1 layout/ }).querySelectorAll('rect[fill^="url("]').length).toBe(0);
+    expect(screen.getByRole("group", { name: /^Sheet 1 layout/ }).querySelectorAll('rect:not(.grid)[fill^="url("]').length).toBe(0);
     expect(part("Side 2").getAttribute("aria-label")).not.toContain("across the grain");
   });
 
```

Apply this diff to `apps/web/test/snap.test.ts` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/test/snap.test.ts
+++ b/apps/web/test/snap.test.ts
@@ -8,27 +8,36 @@
   others: [{ x: 0.25, y: 0.25, length: 30, width: 12 }],
   kerf: 0.125,
   threshold: 1,
+  grid: 0,
 };
 
 describe("snapPosition", () => {
-  it("snaps to the trim line", () => {
-    expect(snapPosition({ ...base, others: [], x: 0.6, y: 0.9 })).toEqual({ x: 0.25, y: 0.25 });
+  it("snaps to the trim line and names it as the guide", () => {
+    expect(snapPosition({ ...base, others: [], x: 0.6, y: 0.9 })).toEqual({ x: 0.25, y: 0.25, guides: { x: 0.25, y: 0.25 } });
   });
 
   it("snaps to one kerf past a neighbour", () => {
-    expect(snapPosition({ ...base, x: 30.9, y: 3 })).toEqual({ x: 30.375, y: 3 });
-    expect(snapPosition({ ...base, x: 5, y: 12.8 })).toEqual({ x: 5, y: 12.375 });
+    expect(snapPosition({ ...base, x: 30.9, y: 3 })).toMatchObject({ x: 30.375, y: 3 });
+    expect(snapPosition({ ...base, x: 5, y: 12.8 })).toMatchObject({ x: 5, y: 12.375 });
   });
 
-  it("snaps the far edge to the far trim line", () => {
-    expect(snapPosition({ ...base, others: [], x: 85.2, y: 42.5 })).toEqual({ x: 85.75, y: 42.75 });
+  it("snaps the far edge to the far trim line, with the guide on that line", () => {
+    expect(snapPosition({ ...base, others: [], x: 85.2, y: 42.5 })).toEqual({ x: 85.75, y: 42.75, guides: { x: 95.75, y: 47.75 } });
   });
 
-  it("leaves a position alone when nothing is close", () => {
-    expect(snapPosition({ ...base, x: 50, y: 20 })).toEqual({ x: 50, y: 20 });
+  it("leaves a position alone when nothing is close and the grid is off", () => {
+    expect(snapPosition({ ...base, x: 50, y: 20 })).toEqual({ x: 50, y: 20, guides: { x: null, y: null } });
   });
 
   it("picks the nearest line", () => {
     expect(snapPosition({ ...base, others: [{ x: 40, y: 30, length: 10, width: 10 }], x: 50.4, y: 20 }).x).toBe(50.125);
   });
+
+  it("snaps to the grid from the trim corner when no line is close", () => {
+    expect(snapPosition({ ...base, grid: 1, x: 50.4, y: 20.9 })).toEqual({ x: 50.25, y: 21.25, guides: { x: null, y: null } });
+  });
+
+  it("prefers a line to the grid", () => {
+    expect(snapPosition({ ...base, grid: 1, x: 30.9, y: 20.9 })).toEqual({ x: 30.375, y: 21.25, guides: { x: 30.375, y: null } });
+  });
 });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root apps/web test/LayoutTab.test.tsx test/Workspace.test.tsx test/snap.test.ts`

Expected: FAIL — the new behaviour does not exist yet (a wrong value, a missing element, or `Failed to resolve import`).

- [ ] **Step 3: Write the code**

Apply this diff to `apps/web/src/layout/LayoutTab.tsx` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/src/layout/LayoutTab.tsx
+++ b/apps/web/src/layout/LayoutTab.tsx
@@ -34,14 +34,16 @@
 import { Inspector } from "./Inspector.tsx";
 import { IssueList } from "./IssueList.tsx";
 import { copyKey, SheetView, type DropPreview } from "./SheetView.tsx";
-import { snapPosition } from "./snap.ts";
+import { snapPosition, type Snapped } from "./snap.ts";
 import { Tray } from "./Tray.tsx";
 
-const SNAP_PX = 8;
+const SNAP_PX = 12;
 const DRAG_START_PX = 4;
 const ZOOM_STEP = 1.25;
 
-type DropTarget = { kind: "sheet"; sheet: string; x: number; y: number; bad: boolean } | { kind: "tray" };
+type DropTarget =
+  | { kind: "sheet"; sheet: string; x: number; y: number; bad: boolean; guides: Snapped["guides"]; left: number; top: number }
+  | { kind: "tray" };
 
 interface Drag {
   ref: CopyRef;
@@ -205,8 +207,9 @@
       const usable = usableRect(ctx, stock);
       let x = (clientX - box.left) / scale - current.grab.x;
       let y = (clientY - box.top) / scale - current.grab.y;
+      let guides: Snapped["guides"] = { x: null, y: null };
       if (ctx.features.snapping && !freeMove) {
-        ({ x, y } = snapPosition({
+        ({ x, y, guides } = snapPosition({
           x,
           y,
           size: current.size,
@@ -215,11 +218,12 @@
           others,
           kerf: ctx.kerf,
           threshold: SNAP_PX / scale,
+          grid: prefs.grid[ctx.units],
         }));
       }
       const rect: Rect = { x, y, ...current.size };
       const bad = part.material !== stock.material || !contains(usable, rect) || !others.every((other) => clearsKerf(other, rect, ctx.kerf));
-      return { kind: "sheet", sheet: sheet.id, x, y, bad };
+      return { kind: "sheet", sheet: sheet.id, x, y, bad, guides, left: box.left + x * scale, top: box.top + y * scale };
     }
     return null;
   };
@@ -348,7 +352,7 @@
             {sheets.length === 0 && <p className="muted">No sheets yet. Press Optimize, or add a sheet and drag parts onto it.</p>}
             {sheets.map((sheet, index) => {
               const drop = drag?.started && drag.target?.kind === "sheet" && drag.target.sheet === sheet.id ? drag.target : null;
-              const preview: DropPreview | null = drop && drag ? { rect: { x: drop.x, y: drop.y, ...drag.size }, bad: drop.bad } : null;
+              const preview: DropPreview | null = drop && drag ? { rect: { x: drop.x, y: drop.y, ...drag.size }, bad: drop.bad, guides: drop.guides } : null;
               return (
                 <SheetView
                   key={sheet.id}
@@ -364,6 +368,7 @@
                   preview={preview}
                   showCuts={prefs.showCuts && ctx.features.cutOrder}
                   showKerf={prefs.showKerf}
+                  grid={ctx.features.snapping ? prefs.grid[ctx.units] : 0}
                   busy={busy}
                   onPartPointerDown={(event, ref) => startDrag(event, ref, null)}
                   onSelect={select}
@@ -400,8 +405,8 @@
           className={`ghost${drag.target?.kind === "sheet" && drag.target.bad ? " bad" : ""}`}
           aria-hidden="true"
           style={{
-            left: drag.client.x - drag.grab.x * scale,
-            top: drag.client.y - drag.grab.y * scale,
+            left: drag.target?.kind === "sheet" ? drag.target.left : drag.client.x - drag.grab.x * scale,
+            top: drag.target?.kind === "sheet" ? drag.target.top : drag.client.y - drag.grab.y * scale,
             width: drag.size.length * scale,
             height: drag.size.width * scale,
           }}
```

Apply this diff to `apps/web/src/layout/SheetView.tsx` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/src/layout/SheetView.tsx
+++ b/apps/web/src/layout/SheetView.tsx
@@ -18,6 +18,7 @@
 export interface DropPreview {
   rect: Rect;
   bad: boolean;
+  guides: { x: number | null; y: number | null };
 }
 
 interface SheetViewProps {
@@ -34,6 +35,8 @@
   preview: DropPreview | null;
   showCuts: boolean;
   showKerf: boolean;
+  /** The snap grid in project units; 0 draws none. */
+  grid: number;
   busy: boolean;
   onPartPointerDown(event: PointerEvent<SVGGElement>, ref: CopyRef): void;
   onSelect(ref: CopyRef): void;
@@ -41,12 +44,14 @@
   onRemove(): void;
 }
 
+const GRID_MIN_PX = 6;
+
 export function copyKey(ref: CopyRef): string {
   return `${ref.part}#${ref.copy}`;
 }
 
 export function SheetView(props: SheetViewProps) {
-  const { ctx, sheet, number, scale, steps, colors, errors, selected, dragging, preview, showCuts, showKerf, busy } = props;
+  const { ctx, sheet, number, scale, steps, colors, errors, selected, dragging, preview, showCuts, showKerf, grid, busy } = props;
   const uid = useId();
   const stock = ctx.stock.get(sheet.stock);
   const px = (value: number) => value * scale;
@@ -66,6 +71,8 @@
 
   const usable = usableRect(ctx, stock);
   const trim = usable.x;
+  const gridPx = px(grid);
+  const showGrid = gridPx >= GRID_MIN_PX;
   return (
     <section className="sheet" aria-label={`Sheet ${number}: ${stockLabel(ctx, stock)}`}>
       <header className="sheet-head">
@@ -93,9 +100,15 @@
           <pattern id={`${uid}-v`} width="6" height="6" patternUnits="userSpaceOnUse">
             <line x1="5.5" y1="0" x2="5.5" y2="6" stroke="#00000022" />
           </pattern>
+          {showGrid && (
+            <pattern id={`${uid}-grid`} x={px(usable.x)} y={px(usable.y)} width={gridPx} height={gridPx} patternUnits="userSpaceOnUse">
+              <path d={`M ${gridPx} 0 L 0 0 0 ${gridPx}`} fill="none" stroke="#0000001a" />
+            </pattern>
+          )}
         </defs>
         <rect className="wood" x={0} y={0} width={px(stock.length)} height={px(stock.width)} />
         {grained && <rect x={0} y={0} width={px(stock.length)} height={px(stock.width)} fill={`url(#${uid}-h)`} />}
+        {showGrid && <rect className="grid" x={px(usable.x)} y={px(usable.y)} width={px(usable.length)} height={px(usable.width)} fill={`url(#${uid}-grid)`} />}
         {trim > 0 && <rect className="trim" x={px(usable.x)} y={px(usable.y)} width={px(usable.length)} height={px(usable.width)} />}
         {sheet.placements.map((placement, index) => {
           const part = ctx.parts.get(placement.part);
@@ -180,6 +193,8 @@
             height={px(preview.rect.width)}
           />
         )}
+        {preview?.guides.x != null && <line className="snap-guide" x1={px(preview.guides.x)} y1={0} x2={px(preview.guides.x)} y2={px(stock.width)} />}
+        {preview?.guides.y != null && <line className="snap-guide" x1={0} y1={px(preview.guides.y)} x2={px(stock.length)} y2={px(preview.guides.y)} />}
       </svg>
     </section>
   );
```

Apply this diff to `apps/web/src/layout/snap.ts` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/src/layout/snap.ts
+++ b/apps/web/src/layout/snap.ts
@@ -9,37 +9,58 @@
   usable: Rect;
   others: readonly Rect[];
   kerf: number;
-  /** The largest distance that snaps, in project units. */
+  /** The largest distance that snaps to a line, in project units. */
   threshold: number;
+  /** The grid step from the corner of the usable area, in project units. 0 turns the grid off. */
+  grid: number;
 }
 
-function snapAxis(start: number, length: number, leading: number[], trailing: number[], threshold: number): number {
-  let best = start;
+export interface Snapped {
+  x: number;
+  y: number;
+  /** The line that each axis snapped to, for a guide. Null for a grid snap or no snap. */
+  guides: { x: number | null; y: number | null };
+}
+
+function snapAxis(
+  start: number,
+  length: number,
+  leading: number[],
+  trailing: number[],
+  threshold: number,
+  origin: number,
+  grid: number,
+): { position: number; guide: number | null } {
+  const candidates = [...leading.map((line) => ({ position: line, guide: line })), ...trailing.map((line) => ({ position: line - length, guide: line }))];
+  let best: { position: number; guide: number } | null = null;
   let bestDistance = threshold;
-  const consider = (target: number) => {
-    const distance = Math.abs(target - start);
+  for (const candidate of candidates) {
+    const distance = Math.abs(candidate.position - start);
     if (distance <= bestDistance) {
-      best = target;
+      best = candidate;
       bestDistance = distance;
     }
-  };
-  for (const line of leading) consider(line);
-  for (const line of trailing) consider(line - length);
-  return best;
+  }
+  if (best) return best;
+  if (grid > 0) return { position: origin + Math.round((start - origin) / grid) * grid, guide: null };
+  return { position: start, guide: null };
 }
 
 /**
  * Snaps each axis on its own. The part's near edge snaps to the sheet edge, the trim line, a neighbour's far edge plus
- * one kerf, or a neighbour's near edge; its far edge snaps to the same lines from the other side.
+ * one kerf, or a neighbour's near edge; its far edge snaps to the same lines from the other side. When no line is
+ * close, the near edge snaps to the grid.
  */
-export function snapPosition(input: SnapInput): { x: number; y: number } {
-  const { sheet, usable, others, kerf, size, threshold } = input;
+export function snapPosition(input: SnapInput): Snapped {
+  const { sheet, usable, others, kerf, size, threshold, grid } = input;
   const x = snapAxis(
     input.x,
     size.length,
     [sheet.x, usable.x, ...others.flatMap((r) => [r.x + r.length + kerf, r.x])],
     [sheet.x + sheet.length, usable.x + usable.length, ...others.flatMap((r) => [r.x - kerf, r.x + r.length])],
     threshold,
+    usable.x,
+    grid,
   );
   const y = snapAxis(
     input.y,
@@ -47,6 +68,8 @@
     [sheet.y, usable.y, ...others.flatMap((r) => [r.y + r.width + kerf, r.y])],
     [sheet.y + sheet.width, usable.y + usable.width, ...others.flatMap((r) => [r.y - kerf, r.y + r.width])],
     threshold,
+    usable.y,
+    grid,
   );
-  return { x, y };
+  return { x: x.position, y: y.position, guides: { x: x.guide, y: y.guide } };
 }
```

Apply this diff to `apps/web/src/styles.css` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/src/styles.css
+++ b/apps/web/src/styles.css
@@ -120,6 +120,8 @@
 .sheet-area .cut { pointer-events: none; }
 .sheet-area .drop-preview { fill: #1a5fd022; stroke: var(--focus); stroke-width: 2; stroke-dasharray: 6 3; pointer-events: none; }
 .sheet-area .drop-preview.bad { fill: #c6282822; stroke: var(--bad); }
+.sheet-area .grid, .sheet-area .snap-guide { pointer-events: none; }
+.sheet-area .snap-guide { stroke: var(--focus); stroke-width: 1; stroke-dasharray: 4 3; }
 .ghost { position: fixed; pointer-events: none; z-index: 100; background: #9cc3e6cc; border: 1px solid #333; box-shadow: 0 4px 14px #0004; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; overflow: hidden; }
 .ghost.bad { background: #f6b3b3cc; outline: 2px solid var(--bad); }
 .shop-body { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run --root apps/web test/LayoutTab.test.tsx test/Workspace.test.tsx test/snap.test.ts`

Expected: PASS (web: 4 new tests).

- [ ] **Step 5: Run the end-to-end tests**

Run: `npm run e2e` from the repo root.

Expected: `2 passed`.

- [ ] **Step 6: Run the full check**

Run: `npm run check` from the repo root.

Expected: the typecheck is clean; core has 370 tests and the web app has 132 tests, all passing; the build succeeds.

- [ ] **Step 7: Commit**

```bash
git add apps/web/e2e/plan.e2e.ts apps/web/src/layout/LayoutTab.tsx apps/web/src/layout/SheetView.tsx apps/web/src/layout/snap.ts apps/web/src/styles.css apps/web/test/LayoutTab.test.tsx apps/web/test/Workspace.test.tsx apps/web/test/snap.test.ts
git commit -m "feat(web): show the snapped position, guide lines, and a snap grid" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```


---

### Task 5: Documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-09-27-opencutplan-design.md`
- Modify: `docs/web-app.md`

**Interfaces:**
- Consumes: Every earlier task.
- Produces (new or changed exports): nothing new.

- [ ] **Step 1: Update the user guide and the spec**

Apply this diff to `docs/superpowers/specs/2026-09-27-opencutplan-design.md` (save it to a file, then `git apply <file>`):

```diff
--- a/docs/superpowers/specs/2026-09-27-opencutplan-design.md
+++ b/docs/superpowers/specs/2026-09-27-opencutplan-design.md
@@ -136,7 +136,7 @@
 **Settings**
 - `features`: booleans, see §8.
 - `orderMode`: `"sheet"` \| `"setup"` (§6.3).
-- `trim`: default edge trim.
+- `trim`: default edge trim. New projects use 0, so they use the factory edges.
 - `minOffcut`: {`length`, `width`}; waste pieces at least this size, in either orientation, are kept as offcuts.
   Default 12 × 6 in or 300 × 150 mm.
 - `display`: {`inch`, `mm`}: `inch` is a denominator `8|16|32|64` or `"decimal"` (default 32); `mm` is a step
@@ -289,14 +289,17 @@
   4. **Layout** — the sheet editor and optimizer (§7.2).
   5. **Shop** — the cut sequence checklist (§7.3).
   6. **Reports** — shopping list and cost, offcuts, labels, print and export.
-- **Settings drawer** — feature switches (§8), units and precision, trim, kerf display, minimum offcut, optimizer time.
+  7. **Settings** — units and precision, factory edges or trim, snapping and the grid, cut order, minimum offcut,
+     optimizer time, currency, view choices, and the other feature switches (§8). The common settings come first.
 
 ### 7.2 Layout editor
 
 Carried over from the living-room-shelf tool and generalized:
 - Sheets drawn to scale in SVG; parts coloured by `group`; grain stripes; cross-grain marker; trim zone dashed.
-- Drag parts between sheets and the unplaced tray; snapping to edges, trim, and neighbours at one kerf; hold ⌥/Alt to
-  disable; `R` rotate, `Del` to tray, arrows nudge by the display precision (Shift = 1 in / 25 mm).
+- Drag parts between sheets and the unplaced tray; snapping to edges, trim, and neighbours at one kerf, with a guide
+  line for each snapped edge, else to a grid (a browser setting, default 1 in / 25 mm); the dragged part shows the
+  snapped position; hold ⌥/Alt to disable; `R` rotate, `Del` to tray, arrows nudge by the display precision
+  (Shift = 1 in / 25 mm).
 - Live validation: invalid parts turn red; the issue list links to the part.
 - Cut lines numbered in sequence order, coloured by stage.
 - **Optimize** (pinned sheets stay), **Optimize the rest** (every sheet stays; only the tray is planned), **Keep
@@ -330,6 +333,9 @@
 | `cost` | on | no prices in the shopping list; objective uses area |
 | `labels` | on | Labels report hidden |
 | `snapping` | on | drag without snapping |
+
+The Settings tab shows `trim` as the factory-edges choice (use the factory edges, or trim each edge), and `snapping`
+next to the grid size. The other switches are in its Features list.
 
 ## 9. Outputs
 
```

Apply this diff to `docs/web-app.md` (save it to a file, then `git apply <file>`):

```diff
--- a/docs/web-app.md
+++ b/docs/web-app.md
@@ -14,7 +14,7 @@
 ## Home
 
 - **New project** asks for a name and units (inches or millimetres). A new project has one table saw with the default
-  kerf (1/8" or 3 mm) and no parts or stock.
+  kerf (1/8" or 3 mm) and no parts or stock. It uses the factory edges of each sheet, so it has no trim.
 - **Open a .cutplan.json file** reads a project file. Browsers with the File System Access API remember the file, so
   **Save file** writes back to it. Other browsers upload the file and download it again on save.
 - **Open example** opens one of the projects in `examples/`.
@@ -26,7 +26,7 @@
 
 ## Workspace
 
-The header has the project name, **Undo** and **Redo**, **Save file**, **Save as…**, and **Settings**. The address
+The header has the project name, **Undo** and **Redo**, **Save file**, and **Save as…**. The address
 is `#/project/<id>`, so a reload opens the same project.
 
 - **Undo and redo** keep the last 100 edits. Arrow-key moves of one part less than one second apart count as one
@@ -37,8 +37,8 @@
   use **Save file**.
 - **Save file** writes the project with its computed cut sequence (`plan.cuts`), so other tools can read the cuts.
 
-The tabs are **Parts**, **Stock**, **Tools**, **Layout**, **Shop**, and **Reports**. The left and right arrow keys
-move between tabs.
+The tabs are **Parts**, **Stock**, **Tools**, **Layout**, **Shop**, **Reports**, and **Settings**. The left and right
+arrow keys move between tabs.
 
 ### Parts
 
@@ -56,7 +56,8 @@
 ### Stock
 
 A materials table (name, thickness, grain, colour) and a stock table (name, material, size, quantity or unlimited,
-cost, kind, trim, and whether to use it). Stock also has a CSV import. A material that parts or stock use cannot be
+cost, kind, edges, and whether to use it). Stock also has a CSV import. **Edges** is the project choice, **Use factory
+edges**, or **Trim** with a width for that stock. A material that parts or stock use cannot be
 deleted. Deleting stock also removes its sheets from the plan.
 
 ### Tools
@@ -85,7 +86,9 @@
 - **−**, **+**, and **Fit** change the zoom.
 
 Parts move by dragging between sheets and the tray. A drag snaps to sheet edges, the trim line, and one kerf from
-other parts; hold Alt (⌥) to drag without snapping. The keyboard does the same work: Tab or a click selects a part,
+other parts. The dragged part moves to the snapped position, and a dashed guide line shows each line that it snapped
+to. Away from these lines, the near edges of the part snap to the grid. The grid starts at the corner inside the
+trim, and the sheets show it as faint lines. Hold Alt (⌥) to drag without snapping. The keyboard does the same work: Tab or a click selects a part,
 **R** turns it, **Delete** sends it to the tray, the arrow keys move it by the display precision (with Shift, by 1"
 or 25 mm), and **Escape** clears the selection. **R**, **Delete**, and the arrow keys act only while the focus is on a
 part. The side panel shows the selected part, a **Location** list to move it
@@ -147,10 +150,21 @@
 
 ### Settings
 
-The settings drawer has the feature switches, units and display precision, cut order, edge trim, the smallest useful
-offcut, the optimizer time and seed, the currency, and two view choices: **Show cut lines** and **Draw cut lines at
-kerf width**. Changing units converts every length in the project and removes the stored cut sequence. The view
-choices belong to the browser, not to the project file. While a dialog or the drawer is open, Tab stays inside it.
+The Settings tab puts the common settings first:
+
+- **Units and precision**. Changing units converts every length in the project and removes the stored cut sequence.
+- **Factory edges**: **Use the factory edges** (no trim) or **Trim each edge** with a trim width. A stock item on the
+  Stock tab can make its own choice.
+- **Snapping**: the snapping switch and the grid size. A grid of 0 turns the grid off. The default grid is 1" or
+  25 mm.
+- **Plan**: the cut order and the smallest useful offcut.
+- **Optimizer**: the search time and the seed.
+- **Money**: the currency.
+- **View**: **Show cut lines** and **Draw cut lines at kerf width**.
+- **Features**: the other feature switches.
+
+The grid and the view choices belong to the browser, not to the project file. While a dialog is open, Tab stays
+inside it.
 
 ## Tests
 
```

- [ ] **Step 2: Check that nothing else changed**

Run: `git diff --stat`

Expected: only the two files above change.

- [ ] **Step 3: Run the full check**

Run: `npm run check` from the repo root.

Expected: the typecheck is clean; core has 370 tests and the web app has 132 tests, all passing; the build succeeds.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-27-opencutplan-design.md docs/web-app.md
git commit -m "docs: describe the Settings tab, factory edges, and snapping" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

