# Cabinet generator phase 3: web app implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the web app a Design tab, read-only design rows on the Parts tab, an assembly checklist on the Shop tab, and the hardware, front views, and assembly print on the Reports tab.

**Architecture:** The store's reducer calls `regenerateDesigns` on every edit, so every tab sees the parts of the current designs, and one undo step holds the design edit and its parts. The Design tab is a form over `project.designs` with a live SVG preview; values that make a design impossible are refused before they reach the store. The assembly checklist reuses the cut checklist's fingerprint and stale-tick rules, but stores its ticks under `assemblyProgress`.

**Tech Stack:** React 19, TypeScript strict, Vite, Vitest with jsdom and Testing Library, Playwright (Chromium), and `@opencutplan/core` (phases 1 and 2).

**Spec:** `docs/superpowers/specs/2026-09-29-cabinet-generator-design.md` (sections 5.3, 5.4, 8, 11, and 12, item 3).

## Global Constraints

- The Design tab is first in the workspace, before Parts.
- The form has: system, columns and rows, outside size or openings, depth, material, back, mount, quantity, and name. It uses the current `LengthInput` fields.
- The front-view preview changes as the user types.
- The checks of the design use the style of the current issue list.
- Each edit goes through `regenerateDesigns` and the current undo history.
- A form value that gives an error, such as `design-too-small`, marks the field and does not change the project.
- Generated parts are read-only rows on the Parts tab, marked "From design: <name>", with a link to the design. A **Detach** button on the design does `design detach`.
- The Layout tab does not change.
- The assembly checklist comes after the cut steps. Its ticks are saved in `extensions["opencutplan.app"].assemblyProgress` as `{ sequence, done }`, with the same fingerprint and reset rules as the cut checklist.
- The Reports tab has the hardware section in the shopping list, **Print assembly steps**, and the front-view drawings.
- Tests: component tests for the Design tab and the read-only Parts rows; one Playwright test from a new design through optimize to the assembly checklist. `kallax-2x4-mm` and `eket-wall-in` are in the web app's example list.
- User-visible text is in ASD-STE100 Simplified Technical English: active voice, short sentences, articles kept.
- No comment that restates the code. Match the file's comment density.
- `npm run check` (lint, typecheck, tests, build) passes at the end of every task. `npm run e2e -w @opencutplan/web` passes at the end of Task 8.
- Each commit ends with `-m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"`.

## Review Focus

1. A thickness change on the Stock tab, then one **Undo**: the design parts change size, the copies that changed leave the sheets, and one undo restores the parts and the sheets (Task 2 test "remakes the design parts on every edit, and one undo restores them").
2. A refused value (a material that is too thin, an outside width that is too small): the project does not change, there is no undo step, and the field stays marked with the reason (Task 1 test for the field; Task 4 test "refuses a value that makes the design impossible").
3. A design that the app cannot change (an unknown system, or a file from a newer minor version): every field is disabled, and **Detach** and **Delete design** still work (Task 4 test "locks a design with an unknown system, but lets the user detach it").
4. Stale assembly ticks do not change the cut ticks, and stale cut ticks do not change the assembly ticks (Task 3 tests in "assembly progress"; Task 6 test "offers to start over or keep the assembly ticks").
5. A unit change and back: no `design-stale` warning, and every placed copy stays (Task 2 test "keeps the copies through a unit change and back").

## Decisions

These are calls the spec leaves open. The plan makes them; the executor does not revisit them.

1. The reducer calls `regenerateDesigns` on the result of every action. It returns the same object when no design changes, so edits that do not touch a design cost one comparison.
2. The app does not make the design parts again when it opens a file. A hand-edited file shows `design-stale` until the next edit, as the CLI does until its next write.
3. A field's `onChange` can return `false` to refuse a value. The field then keeps the text, stays marked, and adds no undo step.
4. A count change on a custom axis sized by openings repeats the last opening. On an axis sized by the outside size, the outside size stays.
5. A system change to KALLAX or EKET applies its cell sizes and depth. A change to Custom keeps the sizes. The CLI keeps the axes on `--system`; this difference is only in the web form, where the user sees the result at once.
6. **Add design** adds a KALLAX 2x2 of the first material that is at least `MIN_POCKET_THICKNESS_MM` thick. With no materials, it first calls `ensureMaterial`.
7. The name does not follow the columns and rows, as with `design set --cols` in the CLI.
8. **Print assembly steps** is only on the Reports tab.
9. **Reset assembly** asks for a confirmation, as **Reset progress** does. **Delete design** does not, because **Undo** restores it, as with **Delete** on a part.
10. The Shop tab uses `h3` and `h4` for the assembly headings, so that the current tests that expect one `h2` still pass.
11. The mount field shows for every system, as the spec lists it in the form. `designErrors` refuses an EKET mount on a system that cannot take it.

## File Structure

- `apps/web/src/components/fields.tsx` (modify): `onChange` can refuse a value.
- `apps/web/src/state/useProject.ts` (modify): the reducer makes the design parts again.
- `apps/web/src/shop/progress.ts` (modify): the assembly checklist state, next to the cut checklist state.
- `apps/web/src/design/form.ts` (create): pure helpers for the Design form (add a design, try a design, axis and system changes, the openings text).
- `apps/web/src/screens/DesignTab.tsx` (create): the Design tab.
- `apps/web/src/screens/Workspace.tsx` (modify): the Design tab first; Parts links to a design.
- `apps/web/src/screens/PartsTab.tsx` (modify): read-only generated rows.
- `apps/web/src/screens/StockTab.tsx` (modify): the delete title names designs.
- `apps/web/src/shop/AssemblyChecklist.tsx` (create) and `apps/web/src/shop/ShopTab.tsx` (modify): the assembly checklist.
- `apps/web/src/reports/HardwareTable.tsx` (create), `apps/web/src/reports/ReportsTab.tsx` and `apps/web/src/print/PrintView.tsx` (modify): hardware, front views, and the assembly print.
- `apps/web/src/styles.css` (modify): the styles for each of the above.
- `apps/web/src/examples.ts` (modify): the two design examples.
- `apps/web/e2e/plan.e2e.ts` (modify) and `docs/web-app.md` (modify).
- Tests: `apps/web/test/helpers.ts` gets `designProject()`. New `useProject.test.tsx`, `DesignTab.test.tsx`, and `examples.test.ts`. Additions to `fields`, `progress`, `Workspace`, `PartsTab`, `screens`, `ShopTab`, `ReportsTab`, and `print` tests.

Every worktree needs the git-ignored workspace links before tests run:

```bash
mkdir -p node_modules/@opencutplan
ln -sfn ../../packages/core node_modules/@opencutplan/core
ln -sfn ../../packages/cli node_modules/@opencutplan/cli
ln -sfn ../../apps/web node_modules/@opencutplan/web
```

---

### Task 1: Fields that refuse a value

**Files:**
- Modify: `apps/web/src/components/fields.tsx`
- Test: `apps/web/test/fields.test.tsx`

**Interfaces:**
- Produces: `type Change<T> = (value: T) => boolean | void`. `TextInput`, `LengthInput`, and `NumberInput` take `onChange: Change<...>`. A return of `false` keeps the text and the mark; any other return accepts the value.

- [ ] **Step 1: Write the failing test**

Apply this change to `apps/web/test/fields.test.tsx` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/test/fields.test.tsx b/apps/web/test/fields.test.tsx
index 6ac8525..f55c81a 100644
--- a/apps/web/test/fields.test.tsx
+++ b/apps/web/test/fields.test.tsx
@@ -29,6 +29,19 @@ describe("LengthInput", () => {
     expect(onChange).not.toHaveBeenCalled();
   });
 
+  it("keeps the text marked when onChange refuses the value", async () => {
+    const onChange = vi.fn(() => false);
+    render(<LengthInput aria-label="Width" value={700} units="mm" display={display} onChange={onChange} />);
+    const input = screen.getByLabelText("Width");
+    await userEvent.clear(input);
+    await userEvent.type(input, "20{Enter}");
+    expect(onChange).toHaveBeenCalledWith(20);
+    expect(input.getAttribute("aria-invalid")).toBe("true");
+    expect(input).toHaveProperty("value", "20");
+    await userEvent.tab();
+    expect(input).toHaveProperty("value", "700 mm");
+  });
+
   it("clears an optional value with blank text, and Escape cancels an edit", async () => {
     const onChange = vi.fn();
     render(<LengthInput aria-label="Trim" value={6} units="mm" display={display} optional allowZero onChange={onChange} />);
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run --root apps/web test/fields.test.tsx`

Expected: FAIL on "keeps the text marked when onChange refuses the value": the field loses its mark after blur.

- [ ] **Step 3: Implement**

Apply this change to `apps/web/src/components/fields.tsx` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/src/components/fields.tsx b/apps/web/src/components/fields.tsx
index 10304a3..0064929 100644
--- a/apps/web/src/components/fields.tsx
+++ b/apps/web/src/components/fields.tsx
@@ -44,9 +44,12 @@ export function DraftInput({ value, onCommit, onKeyDown, onBlur, ...rest }: Draf
   );
 }
 
+/** An onChange that returns false refuses the value: the field keeps the text and marks it, as for text it cannot read. */
+type Change<T> = (value: T) => boolean | void;
+
 interface TextInputProps extends BaseProps {
   value: string;
-  onChange(value: string): void;
+  onChange: Change<string>;
   /** Rejects text that fails; the text is trimmed first. */
   valid?: (value: string) => boolean;
 }
@@ -61,8 +64,7 @@ export function TextInput({ value, onChange, required, valid, ...rest }: TextInp
       onCommit={(text) => {
         const trimmed = text.trim();
         if ((required && trimmed === "") || (valid && !valid(trimmed))) return false;
-        if (trimmed !== value) onChange(trimmed);
-        return true;
+        return trimmed === value || onChange(trimmed) !== false;
       }}
     />
   );
@@ -72,7 +74,7 @@ interface LengthInputProps extends BaseProps {
   value: number | undefined;
   units: Units;
   display: DisplayPrecision;
-  onChange(value: number | undefined): void;
+  onChange: Change<number | undefined>;
   /** Blank clears the value. */
   optional?: boolean;
   allowZero?: boolean;
@@ -88,13 +90,11 @@ export function LengthInput({ value, units, display, onChange, optional, allowZe
       onCommit={(text) => {
         if (text.trim() === "") {
           if (!optional) return false;
-          if (value !== undefined) onChange(undefined);
-          return true;
+          return value === undefined || onChange(undefined) !== false;
         }
         const parsed = parseLength(text, units);
         if (parsed === null || parsed < 0 || (parsed === 0 && !allowZero)) return false;
-        if (parsed !== value) onChange(parsed);
-        return true;
+        return parsed === value || onChange(parsed) !== false;
       }}
     />
   );
@@ -102,7 +102,7 @@ export function LengthInput({ value, units, display, onChange, optional, allowZe
 
 interface NumberInputProps extends BaseProps {
   value: number | undefined;
-  onChange(value: number | undefined): void;
+  onChange: Change<number | undefined>;
   optional?: boolean;
   integer?: boolean;
   minimum?: number;
@@ -119,13 +119,11 @@ export function NumberInput({ value, onChange, optional, integer, minimum = 0, m
       onCommit={(text) => {
         if (text.trim() === "") {
           if (!optional) return false;
-          if (value !== undefined) onChange(undefined);
-          return true;
+          return value === undefined || onChange(undefined) !== false;
         }
         const parsed = parsePlainNumber(text);
         if (parsed === null || parsed < minimum || parsed > maximum || (integer && !Number.isSafeInteger(parsed))) return false;
-        if (parsed !== value) onChange(parsed);
-        return true;
+        return parsed === value || onChange(parsed) !== false;
       }}
     />
   );
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run --root apps/web test/fields.test.tsx`

Expected: PASS, every test in the file.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/fields.tsx apps/web/test/fields.test.tsx
git commit -m "Let a field refuse a value and keep it marked" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```


### Task 2: The store makes the design parts again

**Files:**
- Modify: `apps/web/src/state/useProject.ts`
- Modify: `apps/web/test/helpers.ts`
- Create: `apps/web/test/useProject.test.tsx`

**Interfaces:**
- Consumes: `regenerateDesigns(project): Project` from `@opencutplan/core` (returns the same object when nothing changes).
- Produces: `designProject(): Project` in `test/helpers.ts`: an mm project "Hall" with materials `ply18` ("Plywood 18", 18 mm) and `ply6` ("Plywood 6", 6 mm), the stock `ply18-sheet` (2440 × 1220, unlimited, cost 50), the tool `ts` (kerf 3), the design `hall` (KALLAX 2x2 of `ply18`, name "Hall"), and one sheet `s1` with `hall-vertical` copy 0 at 0,0 and `hall-horizontal` copy 0 at 0,400. Every later task uses it.

- [ ] **Step 1: Write the failing test**

Apply this change to `apps/web/test/helpers.ts` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/test/helpers.ts b/apps/web/test/helpers.ts
index 5a54ec9..48af3a5 100644
--- a/apps/web/test/helpers.ts
+++ b/apps/web/test/helpers.ts
@@ -1,4 +1,4 @@
-import { createOptimizerHost, createProject, type OptimizerResponse, type Project } from "@opencutplan/core";
+import { createOptimizerHost, createProject, presetDesign, regenerateDesigns, type OptimizerResponse, type Project } from "@opencutplan/core";
 import type { WorkerFactory, WorkerLike } from "../src/optimizer/useOptimizer.ts";
 
 /** An inch project: plywood (grained), an unlimited 96 × 48 sheet, two 30 × 12 sides and a 20 × 10 shelf, a table saw, and one sheet that holds both sides. */
@@ -29,6 +29,36 @@ export function sampleProject(): Project {
   };
 }
 
+/**
+ * A millimetre project: 18 mm and 6 mm plywood, an unlimited 2440 × 1220 sheet of the 18 mm, a table saw, and the design
+ * "hall", a KALLAX 2x2 in the 18 mm with its parts. One sheet holds a vertical panel and a shelf.
+ */
+export function designProject(): Project {
+  const base = createProject("Hall", "mm");
+  return regenerateDesigns({
+    ...base,
+    materials: [
+      { id: "ply18", name: "Plywood 18", thickness: 18, grained: true },
+      { id: "ply6", name: "Plywood 6", thickness: 6, grained: true },
+    ],
+    stock: [{ id: "ply18-sheet", material: "ply18", length: 2440, width: 1220, quantity: null, cost: 50, kind: "sheet" }],
+    tools: [{ id: "ts", name: "Table saw", type: "table-saw", kerf: 3, enabled: true }],
+    designs: [presetDesign({ system: "kallax", id: "hall", name: "Hall", material: "ply18", cols: 2, rows: 2, units: "mm" })],
+    plan: {
+      sheets: [
+        {
+          id: "s1",
+          stock: "ply18-sheet",
+          placements: [
+            { part: "hall-vertical", copy: 0, x: 0, y: 0, rotated: false },
+            { part: "hall-horizontal", copy: 0, x: 0, y: 400, rotated: false },
+          ],
+        },
+      ],
+    },
+  });
+}
+
 /** Runs the real optimizer host in this thread, so tests see the same messages a Web Worker sends. */
 export function inProcessWorkers(): { factory: WorkerFactory; created: WorkerLike[] } {
   const created: WorkerLike[] = [];
```

Create `apps/web/test/useProject.test.tsx` with this content:

```tsx
import { checkDesigns, convertProjectUnits, updateMaterial } from "@opencutplan/core";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useProject } from "../src/state/useProject.ts";
import { designProject } from "./helpers.ts";

const placed = (project: ReturnType<typeof designProject>) => project.plan!.sheets[0]!.placements.map((p) => p.part);

describe("useProject", () => {
  it("makes the design parts again in the same undo step as a material change", () => {
    const { result } = renderHook(() => useProject(designProject()));
    act(() => result.current.edit((p) => updateMaterial(p, "ply18", { thickness: 19 })));
    const parts = result.current.project.parts.map((part) => [part.id, part.length, part.width]);
    expect(parts).toEqual([
      ["hall-vertical", 727, 390],
      ["hall-horizontal", 335, 390],
    ]);
    expect(placed(result.current.project)).toEqual(["hall-horizontal"]);
    act(() => result.current.undo());
    expect(result.current.project.materials[0]!.thickness).toBe(18);
    expect(result.current.project.parts[0]!.length).toBe(724);
    expect(placed(result.current.project)).toEqual(["hall-vertical", "hall-horizontal"]);
    expect(result.current.canUndo).toBe(false);
  });

  it("keeps every placed copy through a unit change and back, with no stale design", () => {
    const { result } = renderHook(() => useProject(designProject()));
    act(() => result.current.edit((p) => convertProjectUnits(p, "in")));
    expect(placed(result.current.project)).toEqual(["hall-vertical", "hall-horizontal"]);
    expect(checkDesigns(result.current.project).map((issue) => issue.code)).not.toContain("design-stale");
    act(() => result.current.edit((p) => convertProjectUnits(p, "mm")));
    expect(placed(result.current.project)).toEqual(["hall-vertical", "hall-horizontal"]);
    expect(checkDesigns(result.current.project).map((issue) => issue.code)).not.toContain("design-stale");
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run --root apps/web test/useProject.test.tsx`

Expected: FAIL on "remakes the design parts on every edit": the vertical panel stays 724 long.

- [ ] **Step 3: Implement**

Apply this change to `apps/web/src/state/useProject.ts` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/src/state/useProject.ts b/apps/web/src/state/useProject.ts
index 28cb162..c6e1dfc 100644
--- a/apps/web/src/state/useProject.ts
+++ b/apps/web/src/state/useProject.ts
@@ -1,4 +1,4 @@
-import type { Project } from "@opencutplan/core";
+import { regenerateDesigns, type Project } from "@opencutplan/core";
 import { useCallback, useMemo, useReducer } from "react";
 import { createHistory, record, redo, undo, type History } from "./history.ts";
 
@@ -13,7 +13,7 @@ function reducer(history: History<Project>, action: Action): History<Project> {
   switch (action.type) {
     case "edit": {
       const next = typeof action.edit === "function" ? action.edit(history.present) : action.edit;
-      return record(history, next, action.key, action.at);
+      return record(history, regenerateDesigns(next), action.key, action.at);
     }
     case "undo":
       return undo(history);
@@ -24,7 +24,7 @@ function reducer(history: History<Project>, action: Action): History<Project> {
 
 export interface ProjectStore {
   project: Project;
-  /** Records one undo step; edits with the same `key` in quick succession merge into one step. */
+  /** Records one undo step and makes the design parts again; edits with the same `key` in quick succession merge into one step. */
   edit(edit: ProjectEdit, key?: string): void;
   undo(): void;
   redo(): void;
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run --root apps/web`

Expected: PASS, the whole web suite.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/state/useProject.ts apps/web/test/helpers.ts apps/web/test/useProject.test.tsx
git commit -m "Make the design parts again on every web edit" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```


### Task 3: Assembly progress

**Files:**
- Modify: `apps/web/src/shop/progress.ts`
- Test: `apps/web/test/progress.test.ts`

**Interfaces:**
- Consumes: `assemblySteps(project, designId)` (null when the design cannot make parts) from core; `designProject()` from Task 2.
- Produces:
  - `type ProgressField = "progress" | "assemblyProgress"`.
  - `interface AssemblyGroup { design: string; name: string; start: number; steps: AssemblyStep[] }`; `start` is the number of the group's first step, counted from 1 across all groups.
  - `assemblyGroups(project): AssemblyGroup[]` (skips designs with no steps), `assemblyCount(groups)`, `assemblyKey(groups)`.
  - `readProgress(project, field = "progress")`, `writeProgress(project, progress, field = "progress")`.
  - `assemblyState(project, groups)`, `setAssemblyStepDone(project, groups, step, done)`, `keepAssemblyProgress(project, groups)`: the same shapes as `shopState`, `setStepDone`, and `keepProgress`.
  - `sequenceKey` keeps its current output, so saved cut ticks stay valid.

- [ ] **Step 1: Write the failing test**

Apply this change to `apps/web/test/progress.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/test/progress.test.ts b/apps/web/test/progress.test.ts
index ae6e87f..a405850 100644
--- a/apps/web/test/progress.test.ts
+++ b/apps/web/test/progress.test.ts
@@ -1,7 +1,21 @@
 import { analyzeProject, parseProject, serializeProject, type Project } from "@opencutplan/core";
 import { describe, expect, it } from "vitest";
-import { APP_EXTENSION, keepProgress, readProgress, sequenceKey, setStepDone, shopState, writeProgress } from "../src/shop/progress.ts";
-import { sampleProject } from "./helpers.ts";
+import {
+  APP_EXTENSION,
+  assemblyCount,
+  assemblyGroups,
+  assemblyKey,
+  assemblyState,
+  keepAssemblyProgress,
+  keepProgress,
+  readProgress,
+  sequenceKey,
+  setAssemblyStepDone,
+  setStepDone,
+  shopState,
+  writeProgress,
+} from "../src/shop/progress.ts";
+import { designProject, sampleProject } from "./helpers.ts";
 
 const stepsOf = (project: Project) => analyzeProject(project).steps;
 
@@ -66,3 +80,35 @@ describe("shop progress", () => {
     expect([...shopState(extra, steps).done]).toEqual([1]);
   });
 });
+
+describe("assembly progress", () => {
+  it("numbers the steps of every design that can make parts, in design order", () => {
+    const project = designProject();
+    const second = { ...project.designs![0]!, id: "two", name: "Two" };
+    const broken = { ...project.designs![0]!, id: "broken", name: "Broken", material: "ply6" };
+    const groups = assemblyGroups({ ...project, designs: [...project.designs!, broken, second] });
+    expect(groups.map((group) => [group.design, group.start, group.steps.length])).toEqual([
+      ["hall", 1, 7],
+      ["two", 8, 7],
+    ]);
+    expect(assemblyCount(groups)).toBe(14);
+  });
+
+  it("stores its ticks apart from the cut ticks, and a change to the steps makes them stale", () => {
+    const project = designProject();
+    const groups = assemblyGroups(project);
+    const steps = stepsOf(project);
+    const ticked = setAssemblyStepDone(setStepDone(project, steps, 1, true), groups, 2, true);
+    expect(readProgress(ticked, "assemblyProgress")).toEqual({ sequence: assemblyKey(groups), done: [2] });
+    expect(readProgress(ticked)?.done).toEqual([1]);
+
+    const taller = { ...ticked, designs: [{ ...ticked.designs![0]!, height: { openings: [335, 400] } }] };
+    const changed = assemblyGroups(taller);
+    expect(assemblyKey(changed)).not.toBe(assemblyKey(groups));
+    expect(assemblyState(taller, changed)).toMatchObject({ stale: true, done: new Set() });
+    const kept = keepAssemblyProgress(taller, changed);
+    expect(assemblyState(kept, changed)).toMatchObject({ stale: false, done: new Set([2]) });
+    expect(readProgress(kept)?.done).toEqual([1]);
+    expect(writeProgress(kept, null, "assemblyProgress").extensions).toEqual({ [APP_EXTENSION]: { progress: readProgress(ticked) } });
+  });
+});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run --root apps/web test/progress.test.ts`

Expected: FAIL: the imports `assemblyGroups`, `assemblyState`, `setAssemblyStepDone`, and `keepAssemblyProgress` do not exist.

- [ ] **Step 3: Implement**

Apply this change to `apps/web/src/shop/progress.ts` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/src/shop/progress.ts b/apps/web/src/shop/progress.ts
index 1eda181..34836c8 100644
--- a/apps/web/src/shop/progress.ts
+++ b/apps/web/src/shop/progress.ts
@@ -1,14 +1,16 @@
-import type { Project, Step } from "@opencutplan/core";
+import { assemblySteps, type AssemblyStep, type Project, type Step } from "@opencutplan/core";
 
 export const APP_EXTENSION = "opencutplan.app";
 
-/** Stored in `extensions["opencutplan.app"].progress`. */
+/** Stored in `extensions["opencutplan.app"].progress` for the cut steps, and in `.assemblyProgress` for the assembly steps. */
 export interface ShopProgress {
-  /** The `sequenceKey` of the steps that the ticks belong to. */
+  /** The fingerprint of the steps that the ticks belong to. */
   sequence: string;
   done: number[];
 }
 
+export type ProgressField = "progress" | "assemblyProgress";
+
 export interface ShopState {
   key: string;
   done: ReadonlySet<number>;
@@ -16,37 +18,70 @@ export interface ShopState {
   stale: boolean;
 }
 
+/** The assembly steps of one design; `start` is the number of its first step in the whole checklist. */
+export interface AssemblyGroup {
+  design: string;
+  name: string;
+  start: number;
+  steps: AssemblyStep[];
+}
+
 function round(value: number): number {
   return Math.round(value * 1000) / 1000;
 }
 
-/** A short fingerprint of the steps: it changes when any cut, its order, or its tool changes. */
-export function sequenceKey(steps: readonly Step[]): string {
-  const text = steps.map((s) => [s.sheet, s.kind, s.axis, round(s.at), round(s.from), round(s.to), s.tool?.id ?? ""].join(",")).join(";");
+function fingerprint(count: number, text: string): string {
   let hash = 0x811c9dc5;
   for (let i = 0; i < text.length; i++) {
     hash ^= text.charCodeAt(i);
     hash = Math.imul(hash, 0x01000193);
   }
-  return `${steps.length}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
+  return `${count}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
+}
+
+/** A short fingerprint of the steps: it changes when any cut, its order, or its tool changes. */
+export function sequenceKey(steps: readonly Step[]): string {
+  return fingerprint(steps.length, steps.map((s) => [s.sheet, s.kind, s.axis, round(s.at), round(s.from), round(s.to), s.tool?.id ?? ""].join(",")).join(";"));
+}
+
+/** The assembly steps of each design that can make parts, in design order. */
+export function assemblyGroups(project: Project): AssemblyGroup[] {
+  const groups: AssemblyGroup[] = [];
+  let start = 1;
+  for (const design of project.designs ?? []) {
+    const steps = assemblySteps(project, design.id);
+    if (!steps) continue;
+    groups.push({ design: design.id, name: design.name, start, steps });
+    start += steps.length;
+  }
+  return groups;
+}
+
+export function assemblyCount(groups: readonly AssemblyGroup[]): number {
+  return groups.reduce((sum, group) => sum + group.steps.length, 0);
+}
+
+/** A short fingerprint of the assembly steps: it changes when the text of any step changes. */
+export function assemblyKey(groups: readonly AssemblyGroup[]): string {
+  return fingerprint(assemblyCount(groups), groups.map((group) => [group.design, ...group.steps.map((step) => `${step.title}\n${step.body}`)].join("\n")).join("\n\n"));
 }
 
 function asRecord(value: unknown): Record<string, unknown> | null {
   return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
 }
 
-export function readProgress(project: Project): ShopProgress | null {
-  const progress = asRecord(asRecord(project.extensions?.[APP_EXTENSION])?.progress);
+export function readProgress(project: Project, field: ProgressField = "progress"): ShopProgress | null {
+  const progress = asRecord(asRecord(project.extensions?.[APP_EXTENSION])?.[field]);
   if (!progress || typeof progress.sequence !== "string" || !Array.isArray(progress.done)) return null;
   const done = progress.done.filter((n): n is number => Number.isInteger(n) && n > 0);
   return { sequence: progress.sequence, done };
 }
 
 /** Keeps every other extension; removes the namespace and `extensions` when they become empty. */
-export function writeProgress(project: Project, progress: ShopProgress | null): Project {
+export function writeProgress(project: Project, progress: ShopProgress | null, field: ProgressField = "progress"): Project {
   const app = { ...asRecord(project.extensions?.[APP_EXTENSION]) };
-  if (progress) app.progress = progress;
-  else delete app.progress;
+  if (progress) app[field] = progress;
+  else delete app[field];
   const extensions: Record<string, unknown> = { ...project.extensions };
   if (Object.keys(app).length > 0) extensions[APP_EXTENSION] = app;
   else delete extensions[APP_EXTENSION];
@@ -54,26 +89,49 @@ export function writeProgress(project: Project, progress: ShopProgress | null):
   return Object.keys(extensions).length > 0 ? { ...rest, extensions } : rest;
 }
 
-export function shopState(project: Project, steps: readonly Step[]): ShopState {
-  const key = sequenceKey(steps);
-  const progress = readProgress(project);
+function checklistState(project: Project, field: ProgressField, key: string, count: number): ShopState {
+  const progress = readProgress(project, field);
   if (!progress) return { key, done: new Set(), stale: false };
   if (progress.sequence !== key) return { key, done: new Set(), stale: progress.done.length > 0 };
-  return { key, done: new Set(progress.done.filter((n) => n <= steps.length)), stale: false };
+  return { key, done: new Set(progress.done.filter((n) => n <= count)), stale: false };
 }
 
-export function setStepDone(project: Project, steps: readonly Step[], step: number, done: boolean): Project {
-  const state = shopState(project, steps);
+function setDone(project: Project, field: ProgressField, state: ShopState, step: number, done: boolean): Project {
   const next = new Set(state.done);
   if (done) next.add(step);
   else next.delete(step);
-  return writeProgress(project, next.size > 0 ? { sequence: state.key, done: [...next].sort((a, b) => a - b) } : null);
+  return writeProgress(project, next.size > 0 ? { sequence: state.key, done: [...next].sort((a, b) => a - b) } : null, field);
+}
+
+function keepTicks(project: Project, field: ProgressField, key: string, count: number): Project {
+  const progress = readProgress(project, field);
+  if (!progress) return project;
+  const done = progress.done.filter((n) => n <= count);
+  return writeProgress(project, done.length > 0 ? { sequence: key, done } : null, field);
+}
+
+export function shopState(project: Project, steps: readonly Step[]): ShopState {
+  return checklistState(project, "progress", sequenceKey(steps), steps.length);
+}
+
+export function setStepDone(project: Project, steps: readonly Step[], step: number, done: boolean): Project {
+  return setDone(project, "progress", shopState(project, steps), step, done);
 }
 
 /** Keeps the ticked step numbers for the new sequence. */
 export function keepProgress(project: Project, steps: readonly Step[]): Project {
-  const progress = readProgress(project);
-  if (!progress) return project;
-  const done = progress.done.filter((n) => n <= steps.length);
-  return writeProgress(project, done.length > 0 ? { sequence: sequenceKey(steps), done } : null);
+  return keepTicks(project, "progress", sequenceKey(steps), steps.length);
+}
+
+export function assemblyState(project: Project, groups: readonly AssemblyGroup[]): ShopState {
+  return checklistState(project, "assemblyProgress", assemblyKey(groups), assemblyCount(groups));
+}
+
+export function setAssemblyStepDone(project: Project, groups: readonly AssemblyGroup[], step: number, done: boolean): Project {
+  return setDone(project, "assemblyProgress", assemblyState(project, groups), step, done);
+}
+
+/** Keeps the ticked step numbers for the new assembly steps. */
+export function keepAssemblyProgress(project: Project, groups: readonly AssemblyGroup[]): Project {
+  return keepTicks(project, "assemblyProgress", assemblyKey(groups), assemblyCount(groups));
 }
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run --root apps/web`

Expected: PASS, the whole web suite. The current ShopTab tests show that the cut checklist did not change.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/shop/progress.ts apps/web/test/progress.test.ts
git commit -m "Store the assembly ticks next to the cut ticks" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```


### Task 4: The Design tab

**Files:**
- Create: `apps/web/src/design/form.ts`
- Create: `apps/web/src/screens/DesignTab.tsx`
- Modify: `apps/web/src/screens/Workspace.tsx`
- Modify: `apps/web/src/styles.css`
- Create: `apps/web/test/DesignTab.test.tsx`
- Modify: `apps/web/test/Workspace.test.tsx`

**Interfaces:**
- Consumes: `Change<T>` refusal (Task 1), the regenerating store (Task 2), `designProject()` (Task 2). From core: `designErrors`, `regenerateDesigns`, `presetDesign`, `presetAxis`, `presetDepth`, `isPresetSystem`, `axisCells`, `defaultDesignName`, `DESIGN_SYSTEMS`, `DESIGN_MOUNTS`, `isDesignMount`, `isDesignSystem`, `isNewerMinor`, `removeDesign`, `detachDesign`, `designElevationSvg`, `ensureMaterial`, `uniqueId`, `slugify`, `MIN_POCKET_THICKNESS_MM`, `MAX_DESIGN_CELLS`, `MAX_DESIGN_QUANTITY`.
- Produces:
  - `DesignTab({ store, analysis, focus }: { store: ProjectStore; analysis: ProjectAnalysis; focus: string | null })`. `focus` is the id of the design to select when the tab mounts.
  - `designIssues(issues, designId)` (exported from `DesignTab.tsx`).
  - `TABS[0]` is `{ id: "design", label: "Design" }`.
  - The list buttons have the accessible name `"<name> <W> × <H> × <D>"` and `aria-pressed`.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/DesignTab.test.tsx` with this content:

```tsx
import { analyzeProject, createProject, regenerateDesigns, type Project } from "@opencutplan/core";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo } from "react";
import { describe, expect, it } from "vitest";
import { DesignTab } from "../src/screens/DesignTab.tsx";
import { useProject, type ProjectStore } from "../src/state/useProject.ts";
import { designProject } from "./helpers.ts";

function renderDesign(initial: Project = designProject(), focus: string | null = null) {
  let latest: ProjectStore | null = null;
  function Harness() {
    const store = useProject(initial);
    latest = store;
    const analysis = useMemo(() => analyzeProject(store.project), [store.project]);
    return <DesignTab store={store} analysis={analysis} focus={focus} />;
  }
  render(<Harness />);
  return () => latest!;
}

const preview = () => screen.getByRole("img", { name: /^Front view of / }).getAttribute("aria-label");
const design = (current: () => ProjectStore) => current().project.designs![0]!;

describe("DesignTab", () => {
  it("adds a KALLAX 2x2 and its parts, and a material when the project has none", async () => {
    const current = renderDesign(createProject("New", "mm"));
    expect(screen.getByText(/^No designs yet\./)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Add design" }));
    expect(current().project.materials.map((m) => [m.id, m.thickness])).toEqual([["plywood", 18]]);
    expect(design(current)).toMatchObject({ id: "kallax-2x2", name: "KALLAX 2x2", system: "kallax", material: "plywood" });
    expect(current().project.parts.map((part) => [part.id, part.quantity])).toEqual([
      ["kallax-2x2-vertical", 3],
      ["kallax-2x2-horizontal", 6],
    ]);
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "KALLAX 2x2");
    expect(preview()).toBe("Front view of KALLAX 2x2: 724 mm × 724 mm × 390 mm");
    await userEvent.click(screen.getByRole("button", { name: "Add design" }));
    expect(current().project.designs!.map((d) => d.id)).toEqual(["kallax-2x2", "kallax-2x2-2"]);
    expect(screen.getByRole("button", { name: /^KALLAX 2x2/, pressed: true })).toBe(screen.getAllByRole("button", { name: /^KALLAX 2x2/ })[1]);
  });

  it("changes the rows and makes the parts again in one undo step", async () => {
    const current = renderDesign();
    const rows = screen.getByLabelText("Rows");
    await userEvent.clear(rows);
    await userEvent.type(rows, "4{Enter}");
    expect(design(current).height).toEqual({ openings: [335, 335, 335, 335] });
    expect(current().project.parts.map((part) => [part.id, part.length, part.quantity])).toEqual([
      ["hall-vertical", 1430, 3],
      ["hall-horizontal", 335, 10],
    ]);
    act(() => current().undo());
    expect(design(current).height).toEqual({ openings: [335, 335] });
    expect(current().project.parts[1]!.quantity).toBe(6);
  });

  it("draws the new size while the user types, and Escape draws the stored size again", async () => {
    const current = renderDesign();
    const rows = screen.getByLabelText("Rows");
    await userEvent.clear(rows);
    await userEvent.type(rows, "3");
    expect(preview()).toBe("Front view of Hall: 724 mm × 1077 mm × 390 mm");
    expect(design(current).height).toEqual({ openings: [335, 335] });
    await userEvent.keyboard("{Escape}");
    expect(preview()).toBe("Front view of Hall: 724 mm × 724 mm × 390 mm");
  });

  it("refuses a value that gives a design error: it marks the field, says why, and changes nothing", async () => {
    const current = renderDesign();
    const before = current().project;
    const material = screen.getByLabelText("Material");
    await userEvent.selectOptions(material, "ply6");
    expect(current().project).toBe(before);
    expect(material).toHaveProperty("value", "ply18");
    expect(material.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toBe('✖ Design "Hall" uses stock that is too thin for pocket screws. Use stock that is 15/32" (11.9 mm) thick or more.');

    await userEvent.selectOptions(screen.getAllByLabelText("Size by")[0]!, "outside");
    expect(design(current).width).toEqual({ outside: 724, cells: 2 });
    expect(screen.queryByRole("alert")).toBeNull();
    const changed = current().project;
    const width = screen.getByLabelText("Outside width");
    await userEvent.clear(width);
    await userEvent.type(width, "40{Enter}");
    expect(current().project).toBe(changed);
    expect(width.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toBe('✖ Design "Hall" is too small: the panels leave no room for the cells.');
  });

  it("uses the EKET sizes when the system changes to EKET", async () => {
    const current = renderDesign();
    await userEvent.selectOptions(screen.getByLabelText("System"), "eket");
    expect(design(current)).toMatchObject({ system: "eket", width: { outside: 700, cells: 2 }, height: { outside: 700, cells: 2 }, depth: 350 });
    expect(current().project.parts.map((part) => [part.id, part.length, part.width])).toEqual([
      ["hall-vertical", 700, 350],
      ["hall-horizontal", 323, 350],
    ]);
  });

  it("lists the checks of the design", () => {
    const project = designProject();
    renderDesign(regenerateDesigns({ ...project, designs: [{ ...project.designs![0]!, height: { openings: [300, 335] } }] }));
    const checks = within(screen.getByRole("region", { name: "Checks" }));
    expect(checks.getByRole("listitem").textContent).toBe('⚠ Warning: Design "Hall" has a cell of 300 mm. KALLAX inserts need at least 332 mm.');
  });

  it("locks the form of a design with an unknown system, and can still detach it", async () => {
    const project = designProject();
    const current = renderDesign({ ...project, designs: [{ ...project.designs![0]!, system: "pax" }] });
    expect(screen.getByRole("status").textContent).toBe('⚠ This design uses the system "pax", which this app does not know. Its parts stay as they are.');
    expect(screen.getByLabelText("Rows").matches(":disabled")).toBe(true);
    expect(screen.getByText("The design has an error, so there is no drawing.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Detach" }));
    expect(current().project.designs).toBeUndefined();
    expect(current().project.parts.map((part) => [part.id, part.design])).toEqual([
      ["hall-vertical", undefined],
      ["hall-horizontal", undefined],
    ]);
    expect(current().project.plan!.sheets[0]!.placements).toHaveLength(2);
  });

  it("deletes a design with its parts and their copies, and shows the design that the Parts tab chose", async () => {
    const project = designProject();
    const current = renderDesign(regenerateDesigns({ ...project, designs: [...project.designs!, { ...project.designs![0]!, id: "two", name: "Two" }] }), "two");
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "Two");
    await userEvent.click(screen.getByRole("button", { name: "Delete design" }));
    expect(current().project.designs!.map((d) => d.id)).toEqual(["hall"]);
    expect(current().project.parts.map((part) => part.id)).toEqual(["hall-vertical", "hall-horizontal"]);
    await userEvent.click(screen.getByRole("button", { name: "Delete design" }));
    expect(current().project.parts).toEqual([]);
    expect(current().project.plan!.sheets[0]!.placements).toEqual([]);
  });
});
```

In `apps/web/test/Workspace.test.tsx`, in the test "opens on the Layout tab and moves between tabs with the arrow keys", replace the last `ArrowLeft` step:

```tsx
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Parts" }));
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Design" }).getAttribute("aria-selected")).toBe("true");
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: TABS.at(-1)!.label }).getAttribute("aria-selected")).toBe("true");
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root apps/web test/DesignTab.test.tsx test/Workspace.test.tsx`

Expected: FAIL: DesignTab.test cannot resolve "../src/screens/DesignTab.tsx"; the Workspace tab-order test finds no "Design" tab.

- [ ] **Step 3: Implement the form helpers and the tab**

Create `apps/web/src/design/form.ts` with this content:

```ts
import {
  axisCells,
  convertLength,
  defaultDesignName,
  designErrors,
  EPSILON,
  ensureMaterial,
  formatLength,
  isPresetSystem,
  MAX_DESIGN_CELLS,
  MIN_POCKET_THICKNESS_MM,
  parseLength,
  presetAxis,
  presetDepth,
  presetDesign,
  slugify,
  uniqueId,
  type Design,
  type DesignAxis,
  type DesignSystem,
  type DisplayPrecision,
  type PlanIssue,
  type Project,
  type Units,
} from "@opencutplan/core";

export type DesignEdit = { ok: true; project: Project } | { ok: false; issues: PlanIssue[] };

export type AxisMode = "outside" | "openings";

function withDesign(project: Project, design: Design): Project {
  const designs = project.designs ?? [];
  const known = designs.some((item) => item.id === design.id);
  return { ...project, designs: known ? designs.map((item) => (item.id === design.id ? design : item)) : [...designs, design] };
}

/** The project with the design, or the errors that refuse it (spec §10). The project store makes its parts. */
export function tryDesign(project: Project, design: Design): DesignEdit {
  const next = withDesign(project, design);
  const issues = designErrors(next, design);
  return issues.length > 0 ? { ok: false, issues } : { ok: true, project: next };
}

/** The first material that is thick enough for pocket screws, or the first material. */
function pocketMaterial(project: Project): string {
  const min = convertLength(MIN_POCKET_THICKNESS_MM, "mm", project.project.units) - EPSILON;
  return (project.materials.find((material) => material.thickness >= min) ?? project.materials[0]!).id;
}

/** Adds a KALLAX 2x2 of the first material that is thick enough. Its id is not the id of a design, and no part names it or uses its part ids. */
export function addDesign(project: Project): { ok: true; project: Project; id: string } | { ok: false; issues: PlanIssue[] } {
  const { project: base } = ensureMaterial(project);
  const name = defaultDesignName("kallax", 2, 2);
  const taken = new Set([...(base.designs ?? []).map((design) => design.id), ...base.parts.flatMap((part) => (part.design === undefined ? [] : [part.design]))]);
  for (;;) {
    const id = uniqueId(slugify(name), taken);
    const result = tryDesign(base, presetDesign({ system: "kallax", id, name, material: pocketMaterial(base), cols: 2, rows: 2, units: base.project.units }));
    if (result.ok) return { ...result, id };
    if (!result.issues.every((issue) => issue.code === "design-conflict")) return result;
    taken.add(id);
  }
}

export function axisMode(axis: DesignAxis): AxisMode {
  return "openings" in axis ? "openings" : "outside";
}

/** A new cell count: IKEA cells for kallax and eket; otherwise the same outside size, or the last opening repeated. */
export function withCells(system: string, axis: DesignAxis, cells: number, units: Units): DesignAxis {
  if (isPresetSystem(system)) return presetAxis(system, cells, units);
  if (!("openings" in axis)) return { ...axis, cells };
  const last = axis.openings.at(-1)!;
  return { ...axis, openings: Array.from({ length: cells }, (_, index) => axis.openings[index] ?? last) };
}

/** The same cells, given the other way: as the outside size, or as the size of each opening. */
export function withMode(axis: DesignAxis, mode: AxisMode, openings: readonly number[], outside: number): DesignAxis {
  if (mode === axisMode(axis)) return axis;
  return mode === "openings" ? { openings: [...openings] } : { outside, cells: axisCells(axis) };
}

/** kallax and eket set IKEA cells and the IKEA depth; custom keeps the sizes. */
export function withSystem(design: Design, system: DesignSystem, units: Units): Design {
  if (!isPresetSystem(system)) return { ...design, system };
  return {
    ...design,
    system,
    width: presetAxis(system, axisCells(design.width), units),
    height: presetAxis(system, axisCells(design.height), units),
    depth: presetDepth(system, units),
  };
}

export function openingsText(openings: readonly number[], units: Units, display: DisplayPrecision): string {
  return openings.map((opening) => formatLength(opening, units, display)).join(", ");
}

export function parseOpenings(text: string, units: Units): number[] | null {
  const openings = text.split(",").map((item) => parseLength(item.trim(), units));
  if (openings.length > MAX_DESIGN_CELLS || openings.some((opening) => opening === null || opening <= 0)) return null;
  return openings as number[];
}
```

Create `apps/web/src/screens/DesignTab.tsx` with this content:

```tsx
import {
  axisCells,
  DESIGN_MOUNTS,
  DESIGN_SYSTEM_NAMES,
  DESIGN_SYSTEMS,
  designElevationSvg,
  designGeometry,
  detachDesign,
  formatLength,
  isDesignMount,
  isDesignSystem,
  isNewerMinor,
  materialsById,
  MAX_DESIGN_CELLS,
  MAX_DESIGN_QUANTITY,
  parseLength,
  parsePlainNumber,
  removeDesign,
  type Design,
  type DesignAxis,
  type DesignMount,
  type DesignSystem,
  type PlanIssue,
  type Project,
  type ProjectAnalysis,
} from "@opencutplan/core";
import { useState, type InputHTMLAttributes } from "react";
import { LengthInput, NumberInput, TextInput } from "../components/fields.tsx";
import { addDesign, axisMode, openingsText, parseOpenings, tryDesign, withCells, withMode, withSystem, type AxisMode } from "../design/form.ts";
import type { ProjectStore } from "../state/useProject.ts";

const MOUNT_LABELS: Readonly<Record<DesignMount, string>> = { floor: "Floor", legs: "EKET legs", feet: "EKET feet", "wall-rail": "EKET wall rail" };

interface DesignTabProps {
  store: ProjectStore;
  analysis: ProjectAnalysis;
  /** The design to show first, from a link on the Parts tab. */
  focus?: string | null;
}

export function designIssues(issues: readonly PlanIssue[], id: string): PlanIssue[] {
  return issues.filter((issue) => issue.refs.some((ref) => ref.kind === "design" && ref.design === id));
}

function outsideText(project: Project, design: Design): string {
  const geometry = designGeometry(design, materialsById(project));
  if (!geometry) return "no size";
  const show = (value: number) => formatLength(value, project.project.units, project.settings.display);
  return `${show(geometry.outsideWidth)} × ${show(geometry.outsideHeight)} × ${show(geometry.depth)}`;
}

export function DesignTab({ store, analysis, focus = null }: DesignTabProps) {
  const { project, edit } = store;
  const designs = project.designs ?? [];
  const [chosen, setChosen] = useState<string | null>(focus);
  const [addError, setAddError] = useState<string | null>(null);
  const selected = designs.find((design) => design.id === chosen) ?? designs[0];

  const add = () => {
    const result = addDesign(project);
    if (!result.ok) {
      setAddError(result.issues.map((issue) => issue.message).join(" "));
      return;
    }
    setAddError(null);
    edit(result.project);
    setChosen(result.id);
  };

  return (
    <div className="design-tab">
      <div className="toolbar">
        <h2 id="design-title">Designs</h2>
        <button type="button" className="primary" onClick={add}>
          Add design
        </button>
      </div>
      {addError && (
        <p role="alert" className="error">
          ✖ {addError}
        </p>
      )}
      {!selected ? (
        <p className="muted">No designs yet. A design makes the parts of a box unit with a grid of cells: KALLAX-style, EKET-style, or your own sizes.</p>
      ) : (
        <div className="design-body">
          <ul className="design-list" aria-label="Designs">
            {designs.map((design) => (
              <li key={design.id}>
                <button type="button" aria-pressed={design.id === selected.id} onClick={() => setChosen(design.id)}>
                  <b>{design.name}</b> <span className="muted">{outsideText(project, design)}</span>
                </button>
              </li>
            ))}
          </ul>
          <DesignEditor key={selected.id} store={store} design={selected} issues={designIssues(analysis.issues, selected.id)} />
        </div>
      )}
    </div>
  );
}

interface EditorProps {
  store: ProjectStore;
  design: Design;
  issues: PlanIssue[];
}

type Which = "width" | "height";

const AXIS_TEXT: Readonly<Record<Which, { cells: string; outside: string; openings: string }>> = {
  width: { cells: "Columns", outside: "Outside width", openings: "Column openings, left to right" },
  height: { cells: "Rows", outside: "Outside height", openings: "Row openings, top to bottom" },
};

function DesignEditor({ store, design, issues }: EditorProps) {
  const { project, edit } = store;
  const units = project.project.units;
  const display = project.settings.display;
  const [refused, setRefused] = useState<{ field: string; message: string } | null>(null);
  const [typing, setTyping] = useState<Design | null>(null);
  const geometry = designGeometry(design, materialsById(project));
  const locked = isNewerMinor(project.version)
    ? `This file has the format version ${project.version}, from a newer OpenCutPlan. Update the app to change its designs.`
    : !isDesignSystem(design.system)
      ? `This design uses the system "${design.system}", which this app does not know. Its parts stay as they are.`
      : null;
  const system: DesignSystem = isDesignSystem(design.system) ? design.system : "custom";

  const apply = (field: string, change: (design: Design) => Design): boolean => {
    const result = tryDesign(project, change(design));
    if (!result.ok) {
      setRefused({ field, message: result.issues.map((issue) => issue.message).join(" ") });
      return false;
    }
    setRefused(null);
    setTyping(null);
    edit(result.project);
    return true;
  };

  /** Draws the design with the text in the field before the field commits it. */
  const live = (change: (design: Design, text: string) => Design | null): Pick<InputHTMLAttributes<HTMLInputElement>, "onInput" | "onBlur" | "onKeyDown"> => ({
    onInput: (event) => {
      const next = change(design, event.currentTarget.value);
      if (next && tryDesign(project, next).ok) setTyping(next);
    },
    onBlur: () => setTyping(null),
    onKeyDown: (event) => {
      if (event.key === "Enter" || event.key === "Escape") setTyping(null);
    },
  });
  const invalid = (field: string) => (refused?.field === field ? true : undefined);

  const shown = typing ? { ...project, designs: (project.designs ?? []).map((item) => (item.id === design.id ? typing : item)) } : project;
  const svg = designElevationSvg(shown, design.id);

  const axisFields = (which: Which) => {
    const axis = design[which];
    const text = AXIS_TEXT[which];
    const openings = geometry ? (which === "width" ? geometry.columns : geometry.rows) : [];
    const outside = geometry ? (which === "width" ? geometry.outsideWidth : geometry.outsideHeight) : 0;
    const put = (next: DesignAxis) => (d: Design) => ({ ...d, [which]: next });
    const cells = (d: Design, value: number) => ({ ...d, [which]: withCells(system, d[which], value, units) });
    return (
      <fieldset key={which} disabled={locked !== null}>
        <legend>{which === "width" ? "Width" : "Height"}</legend>
        <div className="pair">
          <label className="stack">
            {text.cells}
            <NumberInput
              value={axisCells(axis)}
              integer
              minimum={1}
              maximum={MAX_DESIGN_CELLS}
              onChange={(value) => value !== undefined && apply(`${which}-cells`, (d) => cells(d, value))}
              {...live((d, t) => {
                const value = parsePlainNumber(t);
                return value !== null && Number.isSafeInteger(value) && value >= 1 && value <= MAX_DESIGN_CELLS ? cells(d, value) : null;
              })}
            />
          </label>
          <label className="stack">
            Size by
            <select
              value={axisMode(axis)}
              disabled={!geometry}
              onChange={(event) => apply(`${which}-mode`, put(withMode(axis, event.target.value as AxisMode, openings, outside)))}
            >
              <option value="outside">The outside size</option>
              <option value="openings">Each opening</option>
            </select>
          </label>
        </div>
        {"openings" in axis ? (
          <label className="stack">
            {text.openings}
            <TextInput
              value={openingsText(axis.openings, units, display)}
              valid={(value) => parseOpenings(value, units) !== null}
              onChange={(value) => apply(`${which}-openings`, put({ ...axis, openings: parseOpenings(value, units)! }))}
              {...live((d, t) => {
                const parsed = parseOpenings(t, units);
                return parsed ? { ...d, [which]: { ...axis, openings: parsed } } : null;
              })}
            />
          </label>
        ) : (
          <label className="stack">
            {text.outside}
            <LengthInput
              value={axis.outside}
              units={units}
              display={display}
              onChange={(value) => value !== undefined && apply(`${which}-outside`, put({ ...axis, outside: value }))}
              {...live((d, t) => {
                const value = parseLength(t, units);
                return value !== null && value > 0 ? { ...d, [which]: { ...axis, outside: value } } : null;
              })}
            />
          </label>
        )}
      </fieldset>
    );
  };

  return (
    <div className="design-editor">
      <form className="design-form" aria-label={`Design ${design.name}`} onSubmit={(event) => event.preventDefault()}>
        {locked && (
          <p role="status" className="warning">
            ⚠ {locked}
          </p>
        )}
        <fieldset disabled={locked !== null}>
          <legend>Design</legend>
          <label className="stack">
            Name
            <TextInput value={design.name} required onChange={(name) => apply("name", (d) => ({ ...d, name }))} />
          </label>
          <div className="pair">
            <label className="stack">
              System
              <select aria-invalid={invalid("system")} value={system} onChange={(event) => apply("system", (d) => withSystem(d, event.target.value as DesignSystem, units))}>
                {DESIGN_SYSTEMS.map((value) => (
                  <option key={value} value={value}>
                    {DESIGN_SYSTEM_NAMES[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="stack">
              How many to build
              <NumberInput
                value={design.quantity ?? 1}
                integer
                minimum={1}
                maximum={MAX_DESIGN_QUANTITY}
                onChange={(value) => value !== undefined && apply("quantity", (d) => ({ ...d, quantity: value }))}
              />
            </label>
          </div>
        </fieldset>
        {axisFields("width")}
        {axisFields("height")}
        <fieldset disabled={locked !== null}>
          <legend>Box</legend>
          <label className="stack">
            Depth, with the back
            <LengthInput
              value={design.depth}
              units={units}
              display={display}
              onChange={(depth) => depth !== undefined && apply("depth", (d) => ({ ...d, depth }))}
              {...live((d, t) => {
                const depth = parseLength(t, units);
                return depth !== null && depth > 0 ? { ...d, depth } : null;
              })}
            />
          </label>
          <div className="pair">
            <label className="stack">
              Material
              <select aria-invalid={invalid("material")} value={design.material} onChange={(event) => apply("material", (d) => ({ ...d, material: event.target.value }))}>
                {project.materials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.name} ({formatLength(material.thickness, units, display)})
                  </option>
                ))}
                {!project.materials.some((material) => material.id === design.material) && <option value={design.material}>{design.material} (missing)</option>}
              </select>
            </label>
            <label className="stack">
              Back
              <select
                aria-invalid={invalid("back")}
                value={design.back?.material ?? ""}
                onChange={(event) =>
                  apply("back", (d) => {
                    const { back: _back, ...rest } = d;
                    return event.target.value === "" ? rest : { ...rest, back: { material: event.target.value } };
                  })
                }
              >
                <option value="">No back</option>
                {project.materials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.name} ({formatLength(material.thickness, units, display)})
                  </option>
                ))}
                {design.back && !project.materials.some((material) => material.id === design.back!.material) && (
                  <option value={design.back.material}>{design.back.material} (missing)</option>
                )}
              </select>
            </label>
          </div>
          <label className="stack">
            Mount
            <select value={design.mount ?? "floor"} onChange={(event) => apply("mount", (d) => ({ ...d, mount: event.target.value }))}>
              {DESIGN_MOUNTS.map((mount) => (
                <option key={mount} value={mount}>
                  {MOUNT_LABELS[mount]}
                </option>
              ))}
              {design.mount !== undefined && !isDesignMount(design.mount) && <option value={design.mount}>{design.mount} (unknown)</option>}
            </select>
          </label>
        </fieldset>
        {refused && (
          <p role="alert" className="error">
            ✖ {refused.message}
          </p>
        )}
        <div className="buttons">
          <button type="button" title="Keep the parts as normal parts, and remove the design." onClick={() => edit((p) => detachDesign(p, design.id))}>
            Detach
          </button>
          <button type="button" onClick={() => edit((p) => removeDesign(p, design.id))}>
            Delete design
          </button>
        </div>
      </form>
      <div className="design-side">
        <section aria-labelledby="design-preview-title">
          <h3 id="design-preview-title">Front view</h3>
          {svg ? (
            <div className="design-preview" role="img" aria-label={`Front view of ${design.name}: ${outsideText(shown, typing ?? design)}`} dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <p className="muted">The design has an error, so there is no drawing.</p>
          )}
        </section>
        <section aria-labelledby="design-checks-title">
          <h3 id="design-checks-title">Checks</h3>
          {issues.length === 0 ? (
            <p className="ok">✔ The design passes every check.</p>
          ) : (
            <ul className="issues">
              {[...issues]
                .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1))
                .map((issue, index) => (
                  <li key={index} className={issue.severity}>
                    <span aria-hidden="true">{issue.severity === "error" ? "✖ " : "⚠ "}</span>
                    <span className="visually-hidden">{issue.severity === "error" ? "Error: " : "Warning: "}</span>
                    {issue.message}
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
```

In `apps/web/src/screens/Workspace.tsx`, import the tab after the `saveProjectFile` import:

```tsx
import { DesignTab } from "./DesignTab.tsx";
```

Make the Design tab first in `TABS`:

```tsx
export const TABS = [
  { id: "design", label: "Design" },
  { id: "parts", label: "Parts" },
```

Add the focus state after the `printJob` state (Task 5 adds the setter):

```tsx
  const [designFocus] = useState<string | null>(null);
```

Render the tab first in the tab panel:

```tsx
        {tab === "design" && <DesignTab store={store} analysis={analysis} focus={designFocus} />}
        {tab === "parts" && <PartsTab store={store} />}
```

In `apps/web/src/styles.css`, add these rules after the `.shop-steps input[type="checkbox"]` rule:

```css
.design-body { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 16px; align-items: start; }
.design-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 4px; }
.design-list button { width: 100%; text-align: left; display: flex; flex-direction: column; }
.design-list button[aria-pressed="true"] { background: #eaf1fb; border-color: var(--focus); }
.design-editor { display: grid; grid-template-columns: minmax(280px, 400px) minmax(0, 1fr); gap: 16px; align-items: start; }
.design-form fieldset { border: 1px solid var(--line); border-radius: 8px; margin: 0 0 10px; }
.design-side { display: flex; flex-direction: column; gap: 14px; }
.design-preview svg { display: block; width: 100%; height: auto; max-height: 60vh; }
select[aria-invalid="true"] { border-color: var(--bad); outline: 2px solid var(--bad); }
```

In the `@media (max-width: 800px)` block, after `.layout-body { grid-template-columns: 1fr; }`, add:

```css
  .design-body, .design-editor { grid-template-columns: 1fr; }
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm run check`

Expected: exit 0: lint, typecheck, every test, and the build pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/design/form.ts apps/web/src/screens/DesignTab.tsx apps/web/src/screens/Workspace.tsx apps/web/src/styles.css apps/web/test/DesignTab.test.tsx apps/web/test/Workspace.test.tsx
git commit -m "Add the Design tab" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```


### Task 5: Read-only design rows on the Parts tab

**Files:**
- Modify: `apps/web/src/screens/PartsTab.tsx`
- Modify: `apps/web/src/screens/Workspace.tsx`
- Modify: `apps/web/src/screens/StockTab.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/test/PartsTab.test.tsx`, `apps/web/test/Workspace.test.tsx`, `apps/web/test/screens.test.tsx`

**Interfaces:**
- Consumes: `DesignTab` `focus` (Task 4); `designProject()` (Task 2).
- Produces: `PartsTab({ store, onShowDesign }: { store: ProjectStore; onShowDesign?(design: string): void })`. A part whose `design` names an existing design renders as `tr.generated` with no inputs. A part whose `design` names a missing design stays editable.

- [ ] **Step 1: Write the failing tests**

Apply this change to `apps/web/test/PartsTab.test.tsx` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/test/PartsTab.test.tsx b/apps/web/test/PartsTab.test.tsx
index 62389e8..9d0406b 100644
--- a/apps/web/test/PartsTab.test.tsx
+++ b/apps/web/test/PartsTab.test.tsx
@@ -1,8 +1,8 @@
-import { fireEvent, screen } from "@testing-library/react";
+import { fireEvent, screen, within } from "@testing-library/react";
 import userEvent from "@testing-library/user-event";
 import { describe, expect, it, vi } from "vitest";
 import { isTableText, PartsTab } from "../src/screens/PartsTab.tsx";
-import { sampleProject } from "./helpers.ts";
+import { designProject, sampleProject } from "./helpers.ts";
 import { renderWithStore } from "./render.tsx";
 
 vi.mock("../src/storage/files.ts", () => ({
@@ -54,6 +54,20 @@ describe("PartsTab", () => {
     expect(screen.queryByRole("dialog")).toBeNull();
   });
 
+  it("shows the parts of a design as rows that cannot change, with a link to the design", async () => {
+    const onShowDesign = vi.fn();
+    const project = designProject();
+    const orphan = { id: "plinth", name: "Plinth", material: "ply18", length: 700, width: 80, quantity: 1, grain: "length" as const, design: "gone" };
+    renderWithStore({ ...project, parts: [...project.parts, orphan] }, (store) => <PartsTab store={store} onShowDesign={onShowDesign} />);
+    const row = screen.getByRole("row", { name: /^Vertical panel/ });
+    expect(within(row).queryByRole("textbox")).toBeNull();
+    expect(within(row).queryByRole("button", { name: /^Delete/ })).toBeNull();
+    expect(within(row).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["Vertical panel", "724 mm", "390 mm", "3", "Plywood 18", "Along length", "Hall", "From design: Hall"]);
+    await userEvent.click(within(row).getByRole("button", { name: "Hall" }));
+    expect(onShowDesign).toHaveBeenCalledWith("hall");
+    expect(screen.getByLabelText("Name of Plinth")).toBeTruthy();
+  });
+
   it("treats text with a tab or a line break as table text", () => {
     expect(isTableText("Top\t30")).toBe(true);
     expect(isTableText("a\nb")).toBe(true);
```

Apply this change to `apps/web/test/screens.test.tsx` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/test/screens.test.tsx b/apps/web/test/screens.test.tsx
index 2dd67b3..64b2363 100644
--- a/apps/web/test/screens.test.tsx
+++ b/apps/web/test/screens.test.tsx
@@ -7,7 +7,7 @@ import { StockTab } from "../src/screens/StockTab.tsx";
 import { ToolsTab } from "../src/screens/ToolsTab.tsx";
 import { DEFAULT_PREFS, type ViewPrefs } from "../src/state/prefs.ts";
 import { openStorage } from "../src/storage/db.ts";
-import { sampleProject } from "./helpers.ts";
+import { designProject, sampleProject } from "./helpers.ts";
 import { renderWithStore } from "./render.tsx";
 
 vi.mock("../src/storage/files.ts", () => ({
@@ -23,6 +23,14 @@ describe("StockTab", () => {
     expect(current().project.plan!.sheets).toEqual([]);
   });
 
+  it("keeps a material that only a design uses as its back", () => {
+    const project = designProject();
+    renderWithStore({ ...project, designs: [{ ...project.designs![0]!, back: { material: "ply6" } }] }, (store) => <StockTab store={store} />);
+    const back = screen.getByRole("button", { name: "Delete material Plywood 6" });
+    expect(back).toHaveProperty("disabled", true);
+    expect(back).toHaveProperty("title", "Parts, stock, or designs use this material.");
+  });
+
   it("lets a sheet use its factory edges or its own trim", async () => {
     const { current } = renderWithStore(sampleProject(), (store) => <StockTab store={store} />);
     const edges = screen.getByRole("combobox", { name: "Edges of stock ply-4x8" });
```

In `apps/web/test/Workspace.test.tsx`, add the core import after the `userEvent` import, and `designProject` to the helpers import:

```tsx
import { regenerateDesigns } from "@opencutplan/core";
```

```tsx
import { designProject, inProcessWorkers, sampleProject } from "./helpers.ts";
```

Add this test at the end of the `describe("Workspace")` block:

```tsx
  it("opens the design of a part from the Parts tab", async () => {
    const project = designProject();
    await renderWorkspace(regenerateDesigns({ ...project, designs: [...project.designs!, { ...project.designs![0]!, id: "desk", name: "Desk" }] }));
    await userEvent.click(screen.getByRole("tab", { name: "Parts" }));
    await userEvent.click(within(screen.getAllByRole("row", { name: /^Vertical panel/ }).at(-1)!).getByRole("button", { name: "Desk" }));
    expect(screen.getByRole("tab", { name: "Design" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: /^Desk /, pressed: true })).toBeTruthy();
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root apps/web test/PartsTab.test.tsx test/Workspace.test.tsx test/screens.test.tsx`

Expected: FAIL on the three new tests: the generated row has text fields; the "Desk" link does not exist; the Stock delete title does not name designs.

- [ ] **Step 3: Implement**

Apply this change to `apps/web/src/screens/PartsTab.tsx` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/src/screens/PartsTab.tsx b/apps/web/src/screens/PartsTab.tsx
index 265a675..c8eae92 100644
--- a/apps/web/src/screens/PartsTab.tsx
+++ b/apps/web/src/screens/PartsTab.tsx
@@ -1,4 +1,4 @@
-import { addPart, errorMessage, formatArea, MAX_PART_QUANTITY, removePart, updatePart, type Grain, type Project } from "@opencutplan/core";
+import { addPart, errorMessage, formatArea, formatLength, MAX_PART_QUANTITY, removePart, updatePart, type Grain, type Project } from "@opencutplan/core";
 import { useState, type ClipboardEvent } from "react";
 import { CsvImportDialog } from "../components/CsvImportDialog.tsx";
 import { LengthInput, NumberInput, TextInput } from "../components/fields.tsx";
@@ -16,8 +16,14 @@ export function isTableText(text: string): boolean {
   return /[\t\n]/.test(text.trim());
 }
 
-export function PartsTab({ store }: { store: ProjectStore }) {
+interface PartsTabProps {
+  store: ProjectStore;
+  onShowDesign?(design: string): void;
+}
+
+export function PartsTab({ store, onShowDesign }: PartsTabProps) {
   const { project, edit } = store;
+  const designs = new Map((project.designs ?? []).map((design) => [design.id, design]));
   const [importing, setImporting] = useState<string | null>(null);
   const [readError, setReadError] = useState<string | null>(null);
   const [focusId, setFocusId] = useState<string | null>(null);
@@ -101,6 +107,26 @@ export function PartsTab({ store }: { store: ProjectStore }) {
             </thead>
             <tbody>
               {project.parts.map((part) => {
+                const design = part.design === undefined ? undefined : designs.get(part.design);
+                if (design) {
+                  return (
+                    <tr key={part.id} className="generated">
+                      <td>{part.name}</td>
+                      <td>{formatLength(part.length, units, display)}</td>
+                      <td>{formatLength(part.width, units, display)}</td>
+                      <td>{part.quantity}</td>
+                      <td>{project.materials.find((material) => material.id === part.material)?.name ?? part.material}</td>
+                      <td>{GRAINS.find((grain) => grain.value === part.grain)?.label}</td>
+                      <td>{part.group}</td>
+                      <td colSpan={2}>
+                        From design:{" "}
+                        <button type="button" className="link" onClick={() => onShowDesign?.(design.id)}>
+                          {design.name}
+                        </button>
+                      </td>
+                    </tr>
+                  );
+                }
                 const change = (patch: Parameters<typeof updatePart>[2]) => edit((p: Project) => updatePart(p, part.id, patch));
                 return (
                   <tr key={part.id}>
```

Apply this change to `apps/web/src/screens/StockTab.tsx` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/src/screens/StockTab.tsx b/apps/web/src/screens/StockTab.tsx
index 22e29c1..cbfa5b2 100644
--- a/apps/web/src/screens/StockTab.tsx
+++ b/apps/web/src/screens/StockTab.tsx
@@ -123,7 +123,7 @@ export function StockTab({ store }: { store: ProjectStore }) {
                         type="button"
                         aria-label={`Delete material ${material.name}`}
                         disabled={used}
-                        title={used ? "Parts or stock use this material." : undefined}
+                        title={used ? "Parts, stock, or designs use this material." : undefined}
                         onClick={() => edit((p) => removeMaterial(p, material.id))}
                       >
                         Delete
```

In `apps/web/src/screens/Workspace.tsx`, give the focus state its setter:

```tsx
  const [designFocus, setDesignFocus] = useState<string | null>(null);
```

Replace the Parts line in the tab panel:

```tsx
        {tab === "parts" && (
          <PartsTab
            store={store}
            onShowDesign={(design) => {
              setDesignFocus(design);
              setTab("design");
            }}
          />
        )}
```

In `apps/web/src/styles.css`, after the `select[aria-invalid="true"]` rule, add:

```css
table.grid tr.generated td { color: var(--muted); }
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm run check`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/PartsTab.tsx apps/web/src/screens/Workspace.tsx apps/web/src/screens/StockTab.tsx apps/web/src/styles.css apps/web/test/PartsTab.test.tsx apps/web/test/Workspace.test.tsx apps/web/test/screens.test.tsx
git commit -m "Show the design parts as rows that cannot change" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```


### Task 6: The assembly checklist on the Shop tab

**Files:**
- Create: `apps/web/src/shop/AssemblyChecklist.tsx`
- Modify: `apps/web/src/shop/ShopTab.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/test/ShopTab.test.tsx`

**Interfaces:**
- Consumes: `assemblyGroups`, `assemblyState`, `setAssemblyStepDone`, `keepAssemblyProgress`, `writeProgress(..., "assemblyProgress")` (Task 3).
- Produces: `AssemblyChecklist({ store }: { store: ProjectStore })`: renders nothing when there are no assembly groups; otherwise a `section` labelled by its `h3` "Assembly".

- [ ] **Step 1: Write the failing tests**

Apply this change to `apps/web/test/ShopTab.test.tsx` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/test/ShopTab.test.tsx b/apps/web/test/ShopTab.test.tsx
index 8a3da77..da26096 100644
--- a/apps/web/test/ShopTab.test.tsx
+++ b/apps/web/test/ShopTab.test.tsx
@@ -4,10 +4,10 @@ import userEvent from "@testing-library/user-event";
 import { useMemo } from "react";
 import { describe, expect, it, vi } from "vitest";
 import type { PrintJob } from "../src/print/PrintView.tsx";
-import { readProgress, setStepDone } from "../src/shop/progress.ts";
+import { assemblyGroups, readProgress, setAssemblyStepDone, setStepDone } from "../src/shop/progress.ts";
 import { ShopTab } from "../src/shop/ShopTab.tsx";
 import { useProject, type ProjectStore } from "../src/state/useProject.ts";
-import { sampleProject } from "./helpers.ts";
+import { designProject, sampleProject } from "./helpers.ts";
 
 function renderShop(initial: Project = sampleProject(), onPrint: (job: PrintJob) => void = () => undefined) {
   let latest: ProjectStore | null = null;
@@ -175,6 +175,41 @@ describe("ShopTab", () => {
     }
   });
 
+  it("lists the assembly steps after the cut steps, and stores their ticks apart", async () => {
+    const { current } = renderShop(designProject());
+    const assembly = within(screen.getByRole("region", { name: "Assembly" }));
+    expect(assembly.getByRole("heading", { name: "Hall", level: 4 })).toBeTruthy();
+    expect(assembly.getAllByRole("listitem")).toHaveLength(7);
+    expect(assembly.getAllByRole("listitem")[0]!.textContent).toMatch(/^Drill the pocket holesDrill 3 pocket holes in each end of all 6 shelves/);
+    await userEvent.click(assembly.getByRole("checkbox", { name: "Assembly step 2 done" }));
+    expect(readProgress(current().project, "assemblyProgress")?.done).toEqual([2]);
+    expect(readProgress(current().project)).toBeNull();
+    expect(assembly.getByText("1 of 7 assembly steps done.")).toBeTruthy();
+    act(() => current().undo());
+    expect(readProgress(current().project, "assemblyProgress")).toBeNull();
+  });
+
+  it("offers to start over or keep the assembly ticks when a design changes", async () => {
+    const project = designProject();
+    const ticked = setAssemblyStepDone(project, assemblyGroups(project), 1, true);
+    const { current } = renderShop({ ...ticked, designs: [{ ...ticked.designs![0]!, height: { openings: [335, 400] } }] });
+    const assembly = within(screen.getByRole("region", { name: "Assembly" }));
+    expect(assembly.getByText(/The assembly steps changed after you ticked some of them/)).toBeTruthy();
+    expect(assembly.getByRole("checkbox", { name: "Assembly step 1 done" })).toHaveProperty("disabled", true);
+    await userEvent.click(assembly.getByRole("button", { name: "Keep my ticks" }));
+    expect(assembly.getByRole("checkbox", { name: "Assembly step 1 done" })).toHaveProperty("checked", true);
+    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
+    await userEvent.click(assembly.getByRole("button", { name: "Reset assembly" }));
+    expect(readProgress(current().project, "assemblyProgress")).toBeNull();
+    vi.restoreAllMocks();
+  });
+
+  it("shows the assembly steps when there are no cut steps", () => {
+    renderShop({ ...designProject(), plan: { sheets: [] } });
+    expect(screen.getByText("There are no cut steps. Optimize on the Layout tab, or place parts on a sheet.")).toBeTruthy();
+    expect(screen.getByRole("region", { name: "Assembly" })).toBeTruthy();
+  });
+
   it("says when there are no steps", () => {
     renderShop({ ...sampleProject(), plan: { sheets: [] } });
     expect(screen.getByText("There are no cut steps. Optimize on the Layout tab, or place parts on a sheet.")).toBeTruthy();
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root apps/web test/ShopTab.test.tsx`

Expected: FAIL on the three new tests: there is no region "Assembly".

- [ ] **Step 3: Implement**

Create `apps/web/src/shop/AssemblyChecklist.tsx` with this content:

```tsx
import { useMemo } from "react";
import type { ProjectStore } from "../state/useProject.ts";
import { assemblyCount, assemblyGroups, assemblyState, keepAssemblyProgress, setAssemblyStepDone, writeProgress } from "./progress.ts";

export function AssemblyChecklist({ store }: { store: ProjectStore }) {
  const { project, edit } = store;
  const groups = useMemo(() => assemblyGroups(project), [project]);
  const state = useMemo(() => assemblyState(project, groups), [project, groups]);
  if (groups.length === 0) return null;
  const total = assemblyCount(groups);
  const startOver = () => edit((p) => writeProgress(p, null, "assemblyProgress"));
  const reset = () => {
    if (window.confirm("Clear the ticks on every assembly step?")) startOver();
  };

  return (
    <section className="assembly" aria-labelledby="assembly-title">
      <div className="toolbar">
        <h3 id="assembly-title">Assembly</h3>
        <span aria-live="polite">
          {state.done.size} of {total} assembly steps done.
        </span>
        <span className="spacer" />
        <button type="button" onClick={reset} disabled={state.done.size === 0}>
          Reset assembly
        </button>
      </div>
      {state.stale && (
        <div role="status" className="banner">
          <p>⚠ The assembly steps changed after you ticked some of them. The old ticks may not match the new steps.</p>
          <div className="buttons">
            <button type="button" onClick={startOver}>
              Start over
            </button>
            <button type="button" onClick={() => edit((p) => keepAssemblyProgress(p, groups))}>
              Keep my ticks
            </button>
          </div>
        </div>
      )}
      {groups.map((group) => (
        <div key={group.design}>
          <h4>{group.name}</h4>
          <ol className="assembly-steps" start={group.start}>
            {group.steps.map((step, index) => {
              const number = group.start + index;
              const done = state.done.has(number);
              return (
                <li key={number} className={done ? "done" : undefined}>
                  <input
                    type="checkbox"
                    checked={done}
                    disabled={state.stale}
                    aria-label={`Assembly step ${number} done`}
                    onChange={(event) => edit((p) => setAssemblyStepDone(p, groups, number, event.target.checked))}
                  />
                  <div>
                    <b>{step.title}</b>
                    <p>{step.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </section>
  );
}
```

Apply this change to `apps/web/src/shop/ShopTab.tsx` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/src/shop/ShopTab.tsx b/apps/web/src/shop/ShopTab.tsx
index 25f62d0..32e8e64 100644
--- a/apps/web/src/shop/ShopTab.tsx
+++ b/apps/web/src/shop/ShopTab.tsx
@@ -2,6 +2,7 @@ import { describeStep, groupColors, sheetSvg, stockLabel, type ProjectAnalysis,
 import { useEffect, useMemo, useRef, useState } from "react";
 import type { PrintJob } from "../print/PrintView.tsx";
 import type { ProjectStore } from "../state/useProject.ts";
+import { AssemblyChecklist } from "./AssemblyChecklist.tsx";
 import { keepProgress, setStepDone, shopState, writeProgress } from "./progress.ts";
 
 interface ShopTabProps {
@@ -47,11 +48,14 @@ export function ShopTab({ store, analysis, onPrint }: ShopTabProps) {
 
   if (steps.length === 0) {
     return (
-      <p className="muted">
-        {ctx.features.cutOrder
-          ? "There are no cut steps. Optimize on the Layout tab, or place parts on a sheet."
-          : "The cut order is off. Turn on Cut order in Settings to see the cut steps."}
-      </p>
+      <div className="shop">
+        <p className="muted">
+          {ctx.features.cutOrder
+            ? "There are no cut steps. Optimize on the Layout tab, or place parts on a sheet."
+            : "The cut order is off. Turn on Cut order in Settings to see the cut steps."}
+        </p>
+        <AssemblyChecklist store={store} />
+      </div>
     );
   }
 
@@ -149,6 +153,7 @@ export function ShopTab({ store, analysis, onPrint }: ShopTabProps) {
           ))}
         </section>
       </div>
+      <AssemblyChecklist store={store} />
     </div>
   );
 }
```

In `apps/web/src/styles.css`, after the `table.grid tr.generated td` rule, add:

```css
.assembly { margin-top: 24px; max-width: 70ch; }
.assembly-steps { list-style: none; padding: 0; margin: 0; }
.assembly-steps li { display: flex; gap: 8px; align-items: flex-start; padding: 4px 6px; }
.assembly-steps li p { margin: 2px 0 0; }
.assembly-steps li.done { color: var(--muted); }
.assembly-steps input[type="checkbox"] { width: 20px; height: 20px; flex: none; margin-top: 2px; }
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm run check`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/shop/AssemblyChecklist.tsx apps/web/src/shop/ShopTab.tsx apps/web/src/styles.css apps/web/test/ShopTab.test.tsx
git commit -m "Add the assembly checklist to the Shop tab" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```


### Task 7: Hardware, front views, and the assembly print

**Files:**
- Create: `apps/web/src/reports/HardwareTable.tsx`
- Modify: `apps/web/src/reports/ReportsTab.tsx`
- Modify: `apps/web/src/print/PrintView.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/test/ReportsTab.test.tsx`, `apps/web/test/print.test.tsx`, `apps/web/test/Workspace.test.tsx`

**Interfaces:**
- Consumes: `hardwareList(project): HardwareLine[]`, `designElevationSvg(project, designId): string | null` from core; `assemblyGroups` (Task 3); `designProject()` (Task 2).
- Produces:
  - `HardwareTable({ lines, project, level })`: a `section` labelled by its heading "Hardware".
  - `PrintJob` gains `{ kind: "assembly" }`.
  - The Reports tab has **Print assembly steps** (when there are assembly groups), a "Hardware" region in the shopping list, and a "Front views" section with one **<name> as SVG** button for each design that has a drawing.

- [ ] **Step 1: Write the failing tests**

Apply this change to `apps/web/test/ReportsTab.test.tsx` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/test/ReportsTab.test.tsx b/apps/web/test/ReportsTab.test.tsx
index ea505b0..5264621 100644
--- a/apps/web/test/ReportsTab.test.tsx
+++ b/apps/web/test/ReportsTab.test.tsx
@@ -6,7 +6,7 @@ import { afterEach, describe, expect, it, vi } from "vitest";
 import type { PrintJob } from "../src/print/PrintView.tsx";
 import { ReportsTab } from "../src/reports/ReportsTab.tsx";
 import { useProject, type ProjectStore } from "../src/state/useProject.ts";
-import { sampleProject } from "./helpers.ts";
+import { designProject, sampleProject } from "./helpers.ts";
 
 function renderReports(initial: Project = sampleProject(), onPrint: (job: PrintJob) => void = () => undefined) {
   let latest: ProjectStore | null = null;
@@ -141,6 +141,31 @@ describe("ReportsTab", () => {
     expect(await files[2]!.blob.text()).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="-1\.6 -1\.6 99\.2 51\.2" width="99\.2in"/);
   });
 
+  it("lists the hardware of the designs in the shopping list", () => {
+    renderReports({ ...designProject(), designs: [{ ...designProject().designs![0]!, mount: "wall-rail" }] });
+    const hardware = within(screen.getByRole("region", { name: "Hardware" }));
+    expect(hardware.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent))).toEqual([
+      ["Pocket screws, coarse thread, 1 1/4\" (32 mm)", "", "40", "Hall"],
+      ["EKET suspension rail, 70 cm", "80340048", "1", "Hall"],
+      ["Wall screws and plugs for your wall type", "", "As needed", "Hall"],
+      ["Wood glue (PVA)", "", "As needed", "Every design"],
+    ]);
+    expect(hardware.getByRole("link", { name: "80340048" }).getAttribute("href")).toMatch(/^https:\/\/www\.ikea\.com\/gb\//);
+  });
+
+  it("prints the assembly steps and downloads the front view of each design", async () => {
+    const onPrint = vi.fn();
+    const files = captureDownloads();
+    renderReports(designProject(), onPrint);
+    await userEvent.click(screen.getByRole("button", { name: "Print assembly steps" }));
+    expect(onPrint).toHaveBeenCalledWith({ kind: "assembly" });
+    const drawings = within(section("Front views"));
+    expect(drawings.getByRole("img", { name: "Front view of Hall" }).querySelector("svg")).toBeTruthy();
+    await userEvent.click(drawings.getByRole("button", { name: "Hall as SVG" }));
+    expect(files.map((file) => [file.name, file.blob.type])).toEqual([["Hall-hall.svg", "image/svg+xml"]]);
+    expect(await files[0]!.blob.text()).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
+  });
+
   it("says there is no plan and keeps the CSV exports", () => {
     renderReports({ ...sampleProject(), plan: { sheets: [] } });
     expect(screen.getByText("There is no plan yet. Optimize on the Layout tab.")).toBeTruthy();
```

Apply this change to `apps/web/test/print.test.tsx` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/test/print.test.tsx b/apps/web/test/print.test.tsx
index 4ce46ad..6a9c21c 100644
--- a/apps/web/test/print.test.tsx
+++ b/apps/web/test/print.test.tsx
@@ -5,7 +5,8 @@ import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
 import { PrintView, type PrintJob } from "../src/print/PrintView.tsx";
 import { printScale, sheetPrintLayout } from "../src/print/scale.ts";
 import { formatMoney } from "../src/reports/money.ts";
-import { sampleProject } from "./helpers.ts";
+import { assemblyGroups } from "../src/shop/progress.ts";
+import { designProject, sampleProject } from "./helpers.ts";
 
 let print: ReturnType<typeof vi.spyOn>;
 
@@ -116,6 +117,23 @@ describe("PrintView", () => {
     expect(within(root).getByText(/^Total: .*60\.00/)).toBeTruthy();
   });
 
+  it("prints the hardware on the shopping list, even with no sheets", () => {
+    const { root } = renderPrint({ kind: "shopping" }, { ...designProject(), plan: { sheets: [] } });
+    expect(within(root).queryByRole("heading", { name: "Plywood 18", level: 2 })).toBeNull();
+    const hardware = within(root).getByRole("heading", { name: "Hardware" }).closest("section")!;
+    expect(within(hardware).getAllByRole("row")).toHaveLength(5);
+  });
+
+  it("prints one page of assembly steps for each design", () => {
+    const project = designProject();
+    const { root } = renderPrint({ kind: "assembly" }, project);
+    const pages = [...root.querySelectorAll<HTMLElement>(".print-page")];
+    expect(pages).toHaveLength(1);
+    expect(within(pages[0]!).getByRole("heading", { name: "Hall: Hall", level: 1 })).toBeTruthy();
+    expect(pages[0]!.querySelector(".print-elevation svg")).toBeTruthy();
+    expect([...pages[0]!.querySelectorAll(".print-steps li")].map((step) => step.textContent)).toEqual(assemblyGroups(project)[0]!.steps.map((step) => `☐${step.title} ${step.body}`));
+  });
+
   it("places labels on the label sheet from the start position", () => {
     const { root } = renderPrint({ kind: "labels", layout: "avery-5160", start: 3 });
     expect(root.querySelector("style")?.textContent).toBe("@page { size: 8.5in 11in; margin: 0; }");
```

In `apps/web/test/Workspace.test.tsx`, add this test at the end of the `describe("Workspace")` block:

```tsx
  it("prints the assembly steps from the Reports tab", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    await renderWorkspace(designProject());
    await userEvent.click(screen.getByRole("tab", { name: "Reports" }));
    await userEvent.click(screen.getByRole("button", { name: "Print assembly steps" }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    const root = document.body.querySelector(":scope > .print-root")!;
    expect(root.getAttribute("data-job")).toBe("assembly");
    expect(root.querySelectorAll(".print-steps li")).toHaveLength(7);
    print.mockRestore();
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root apps/web test/ReportsTab.test.tsx test/print.test.tsx test/Workspace.test.tsx`

Expected: FAIL on the new tests: there is no "Hardware" region, no "Print assembly steps" button, and no assembly print pages.

- [ ] **Step 3: Implement**

Create `apps/web/src/reports/HardwareTable.tsx` with this content:

```tsx
import type { HardwareLine, Project } from "@opencutplan/core";

interface HardwareTableProps {
  project: Project;
  lines: readonly HardwareLine[];
  level: 2 | 3;
}

function quantityText(line: HardwareLine): string {
  if (line.quantity === null) return "As needed";
  if (line.unit === "each") return String(line.quantity);
  return `${line.quantity} ${line.quantity === 1 ? "pack" : "packs"}`;
}

export function HardwareTable({ project, lines, level }: HardwareTableProps) {
  const Heading = level === 2 ? "h2" : "h3";
  const names = new Map((project.designs ?? []).map((design) => [design.id, design.name]));
  return (
    <section className="hardware" aria-labelledby="hardware-title">
      <Heading id="hardware-title">Hardware</Heading>
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">IKEA article</th>
              <th scope="col">Quantity</th>
              <th scope="col">For</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td>
                  {line.name}
                  {line.choices && <span className="muted"> (choose one: {line.choices.map((choice) => `${choice.name}, ${choice.article}`).join("; ")})</span>}
                </td>
                <td>{line.article && (line.source ? <a href={line.source}>{line.article}</a> : line.article)}</td>
                <td>{quantityText(line)}</td>
                <td>{line.design === null ? "Every design" : (names.get(line.design) ?? line.design)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">The article numbers are for IKEA in Great Britain. In another country, find the item by its name.</p>
    </section>
  );
}
```

Apply this change to `apps/web/src/reports/ReportsTab.tsx` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/src/reports/ReportsTab.tsx b/apps/web/src/reports/ReportsTab.tsx
index 10c0091..29d3b79 100644
--- a/apps/web/src/reports/ReportsTab.tsx
+++ b/apps/web/src/reports/ReportsTab.tsx
@@ -1,9 +1,11 @@
 import {
+  designElevationSvg,
   exportPartsCsv,
   exportStockCsv,
   fileBase,
   formatSize,
   groupColors,
+  hardwareList,
   LABEL_LAYOUTS,
   labelLayout,
   labelPages,
@@ -18,7 +20,9 @@ import {
 import { useMemo, useState } from "react";
 import type { PrintJob } from "../print/PrintView.tsx";
 import type { ProjectStore } from "../state/useProject.ts";
+import { assemblyGroups } from "../shop/progress.ts";
 import { downloadText } from "../storage/files.ts";
+import { HardwareTable } from "./HardwareTable.tsx";
 import { ShoppingTables } from "./ShoppingTables.tsx";
 
 interface ReportsTabProps {
@@ -41,6 +45,15 @@ export function ReportsTab({ store, analysis, onPrint }: ReportsTabProps) {
   const perPage = labelsPerPage(layout);
   const firstLabel = Math.min(start, perPage);
   const pageCount = labelPages(analysis.labels, layout, firstLabel).length;
+  const hardware = useMemo(() => hardwareList(project), [project]);
+  const assembly = useMemo(() => assemblyGroups(project), [project]);
+  const drawings = useMemo(
+    () => (project.designs ?? []).flatMap((design) => {
+      const svg = designElevationSvg(project, design.id);
+      return svg ? [{ design, svg }] : [];
+    }),
+    [project],
+  );
 
   const saveOffcuts = () => {
     edit((p) => saveOffcutsToStock(p, unsavedOffcuts(p, analysis.offcuts)));
@@ -59,9 +72,14 @@ export function ReportsTab({ store, analysis, onPrint }: ReportsTabProps) {
           <button type="button" onClick={() => onPrint({ kind: "sequence" })} disabled={analysis.steps.length === 0}>
             Print cut sequence
           </button>
-          <button type="button" onClick={() => onPrint({ kind: "shopping" })} disabled={!planned}>
+          <button type="button" onClick={() => onPrint({ kind: "shopping" })} disabled={!planned && hardware.length === 0}>
             Print shopping list
           </button>
+          {assembly.length > 0 && (
+            <button type="button" onClick={() => onPrint({ kind: "assembly" })}>
+              Print assembly steps
+            </button>
+          )}
           <button type="button" onClick={() => downloadText(exportPartsCsv(project), `${base}-parts.csv`, "text/csv")}>
             Export parts CSV
           </button>
@@ -84,10 +102,30 @@ export function ReportsTab({ store, analysis, onPrint }: ReportsTabProps) {
         )}
       </section>
 
-      {planned && (
+      {(planned || hardware.length > 0) && (
         <section aria-labelledby="reports-shopping">
           <h2 id="reports-shopping">Shopping list</h2>
-          <ShoppingTables analysis={analysis} level={3} />
+          {planned && <ShoppingTables analysis={analysis} level={3} />}
+          {hardware.length > 0 && <HardwareTable project={project} lines={hardware} level={3} />}
+        </section>
+      )}
+
+      {drawings.length > 0 && (
+        <section aria-labelledby="reports-drawings">
+          <h2 id="reports-drawings">Front views</h2>
+          <div className="drawings">
+            {drawings.map(({ design, svg }) => (
+              <figure key={design.id}>
+                <div className="design-preview" role="img" aria-label={`Front view of ${design.name}`} dangerouslySetInnerHTML={{ __html: svg }} />
+                <figcaption>
+                  {design.name}{" "}
+                  <button type="button" onClick={() => downloadText(svg, `${base}-${design.id}.svg`, "image/svg+xml")}>
+                    {design.name} as SVG
+                  </button>
+                </figcaption>
+              </figure>
+            ))}
+          </div>
         </section>
       )}
```

Apply this change to `apps/web/src/print/PrintView.tsx` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/src/print/PrintView.tsx b/apps/web/src/print/PrintView.tsx
index 73fb2ac..75a0106 100644
--- a/apps/web/src/print/PrintView.tsx
+++ b/apps/web/src/print/PrintView.tsx
@@ -1,9 +1,11 @@
 import {
   copyLabel,
   describeStep,
+  designElevationSvg,
   formatSize,
   grainOk,
   groupColors,
+  hardwareList,
   labelLayout,
   labelPages,
   sheetSvg,
@@ -19,10 +21,12 @@ import {
 } from "@opencutplan/core";
 import { useEffect, useMemo, useRef } from "react";
 import { createPortal } from "react-dom";
+import { HardwareTable } from "../reports/HardwareTable.tsx";
 import { ShoppingTables } from "../reports/ShoppingTables.tsx";
+import { assemblyGroups } from "../shop/progress.ts";
 import { printScale, sheetPrintLayout } from "./scale.ts";
 
-export type PrintJob = { kind: "sheets" } | { kind: "sequence" } | { kind: "shopping" } | { kind: "labels"; layout: LabelLayoutId; start: number };
+export type PrintJob = { kind: "sheets" } | { kind: "sequence" } | { kind: "shopping" } | { kind: "assembly" } | { kind: "labels"; layout: LabelLayoutId; start: number };
 
 interface PrintViewProps {
   job: PrintJob;
@@ -60,18 +64,54 @@ export function PrintView({ job, analysis, onDone }: PrintViewProps) {
       <style>{pageRule(job)}</style>
       {job.kind === "sheets" && <SheetPages analysis={analysis} />}
       {job.kind === "sequence" && <SequencePages analysis={analysis} />}
-      {job.kind === "shopping" && (
-        <section className="print-page">
-          <h1>{analysis.context.project.project.name}: shopping list</h1>
-          <ShoppingTables analysis={analysis} level={2} />
-        </section>
-      )}
+      {job.kind === "shopping" && <ShoppingPage analysis={analysis} />}
+      {job.kind === "assembly" && <AssemblyPages analysis={analysis} />}
       {job.kind === "labels" && <LabelPages analysis={analysis} layout={job.layout} start={job.start} />}
     </div>,
     document.body,
   );
 }
 
+function ShoppingPage({ analysis }: { analysis: ProjectAnalysis }) {
+  const project = analysis.context.project;
+  const hardware = hardwareList(project);
+  return (
+    <section className="print-page">
+      <h1>{project.project.name}: shopping list</h1>
+      {analysis.sheets.length > 0 && <ShoppingTables analysis={analysis} level={2} />}
+      {hardware.length > 0 && <HardwareTable project={project} lines={hardware} level={2} />}
+    </section>
+  );
+}
+
+function AssemblyPages({ analysis }: { analysis: ProjectAnalysis }) {
+  const project = analysis.context.project;
+  return (
+    <>
+      {assemblyGroups(project).map((group) => (
+        <section key={group.design} className="print-page print-assembly">
+          <h1>
+            {project.project.name}: {group.name}
+          </h1>
+          <div className="print-elevation" dangerouslySetInnerHTML={{ __html: designElevationSvg(project, group.design)! }} />
+          <ol className="print-steps">
+            {group.steps.map((step, index) => (
+              <li key={index}>
+                <span className="print-box" aria-hidden="true">
+                  ☐
+                </span>
+                <div>
+                  <strong>{step.title}</strong> {step.body}
+                </div>
+              </li>
+            ))}
+          </ol>
+        </section>
+      ))}
+    </>
+  );
+}
+
 function sheetTitle(analysis: ProjectAnalysis, sheet: SheetAnalysis): string {
   return `Sheet ${sheet.index + 1} of ${analysis.sheets.length}: ${stockLabel(analysis.context, sheet.stock)}`;
 }
```

In `apps/web/src/styles.css`, after the `.assembly-steps input[type="checkbox"]` rule, add:

```css
.drawings { display: flex; flex-wrap: wrap; gap: 16px; }
.drawings figure { margin: 0; width: min(360px, 100%); }
```

In the print rules, after the `.print-box` rule, add:

```css
  .print-elevation svg { display: block; width: auto; height: 80mm; max-width: 100%; margin: 0 0 8pt; }
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm run check`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/reports/HardwareTable.tsx apps/web/src/reports/ReportsTab.tsx apps/web/src/print/PrintView.tsx apps/web/src/styles.css apps/web/test/ReportsTab.test.tsx apps/web/test/print.test.tsx apps/web/test/Workspace.test.tsx
git commit -m "Add the hardware, the front views, and the assembly print to Reports" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```


### Task 8: Examples, the Playwright test, and the docs

**Files:**
- Modify: `apps/web/src/examples.ts`
- Create: `apps/web/test/examples.test.ts`
- Modify: `apps/web/e2e/plan.e2e.ts`
- Modify: `docs/web-app.md`

**Interfaces:**
- Consumes: everything above. `examples/kallax-2x4-mm.cutplan.json` and `examples/eket-wall-in.cutplan.json` exist on main (phase 1).

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/examples.test.ts` with this content:

```ts
import { analyzeProject, parseProject } from "@opencutplan/core";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../src/examples.ts";

describe("EXAMPLES", () => {
  it("lists the design examples, and each example opens with no warnings or errors", () => {
    expect(EXAMPLES.map((example) => example.slug)).toEqual(["living-room-shelf", "simple-bookcase-mm", "kallax-2x4-mm", "eket-wall-in"]);
    for (const example of EXAMPLES) {
      const result = parseProject(example.text);
      if (!result.ok) throw new Error(`${example.slug}: ${result.errors.map((issue) => issue.message).join(" ")}`);
      expect(result.warnings).toEqual([]);
      expect(analyzeProject(result.project).issues.filter((issue) => issue.severity === "error")).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run --root apps/web test/examples.test.ts`

Expected: FAIL: the slug list has only `living-room-shelf` and `simple-bookcase-mm`.

- [ ] **Step 3: Add the examples**

Apply this change to `apps/web/src/examples.ts` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/src/examples.ts b/apps/web/src/examples.ts
index d631e4f..719af27 100644
--- a/apps/web/src/examples.ts
+++ b/apps/web/src/examples.ts
@@ -1,3 +1,5 @@
+import eketWall from "../../../examples/eket-wall-in.cutplan.json?raw";
+import kallax from "../../../examples/kallax-2x4-mm.cutplan.json?raw";
 import livingRoomShelf from "../../../examples/living-room-shelf.cutplan.json?raw";
 import simpleBookcase from "../../../examples/simple-bookcase-mm.cutplan.json?raw";
 
@@ -10,4 +12,6 @@ export interface Example {
 export const EXAMPLES: readonly Example[] = [
   { slug: "living-room-shelf", title: "Living-room shelf (inches, baltic birch)", text: livingRoomShelf },
   { slug: "simple-bookcase-mm", title: "Simple bookcase (millimetres)", text: simpleBookcase },
+  { slug: "kallax-2x4-mm", title: "KALLAX-style 2x4 unit (millimetres, design)", text: kallax },
+  { slug: "eket-wall-in", title: "EKET-style units on the wall rail (inches, design)", text: eketWall },
 ];
```

Run: `npx vitest run --root apps/web test/examples.test.ts`

Expected: PASS.

- [ ] **Step 4: Add the Playwright test and run it**

Apply this change to `apps/web/e2e/plan.e2e.ts` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/e2e/plan.e2e.ts b/apps/web/e2e/plan.e2e.ts
index 8850e16..70ec41b 100644
--- a/apps/web/e2e/plan.e2e.ts
+++ b/apps/web/e2e/plan.e2e.ts
@@ -170,6 +170,49 @@ test("edits the layout with the mouse and the keyboard, and undoes the edits", a
   await expect(page.getByLabel("X (from the left)")).toHaveValue('66"');
 });
 
+test("designs a unit, cuts it, keeps the assembly ticks, and prints its hardware and steps", async ({ page }) => {
+  await page.goto("/");
+  await page.getByLabel("Name").fill("E2E kallax");
+  await page.getByRole("button", { name: "Create project" }).click();
+
+  await page.getByRole("tab", { name: "Design" }).click();
+  await page.getByRole("button", { name: "Add design" }).click();
+  await expect(page.getByRole("img", { name: /^Front view of KALLAX 2x2: / })).toBeVisible();
+  await page.getByLabel("Rows").fill("3");
+  await page.getByLabel("Rows").press("Enter");
+  await expect(page.getByRole("img", { name: 'Front view of KALLAX 2x2: 28 5/8" × 42 9/16" × 15 11/32"' })).toBeVisible();
+
+  await page.getByRole("tab", { name: "Parts" }).click();
+  await expect(page.getByRole("row", { name: /^Vertical panel/ })).toContainText("From design: KALLAX 2x2");
+
+  await page.getByRole("tab", { name: "Stock" }).click();
+  await page.getByRole("button", { name: "Paste rows…" }).click();
+  await page.getByLabel("Rows (paste from a spreadsheet, or edit)").fill(STOCK);
+  await page.getByRole("button", { name: "Import 1 row" }).click();
+  await optimize(page);
+
+  await page.getByRole("tab", { name: "Shop" }).click();
+  const assembly = page.getByRole("region", { name: "Assembly" });
+  await assembly.getByRole("checkbox", { name: "Assembly step 1 done" }).check();
+  await expect(assembly.getByText(/^1 of \d+ assembly steps done\.$/)).toBeVisible();
+  await expect.poll(() => savedData(page)).toContain('"assemblyProgress"');
+  await page.reload();
+  await page.getByRole("tab", { name: "Shop" }).click();
+  await expect(page.getByRole("checkbox", { name: "Assembly step 1 done" })).toBeChecked();
+  await expect(page.getByRole("checkbox", { name: "Step 1 done", exact: true })).not.toBeChecked();
+
+  await page.getByRole("tab", { name: "Reports" }).click();
+  await expect(page.getByRole("region", { name: "Hardware" }).getByRole("row", { name: /^Pocket screws/ })).toBeVisible();
+  await page.getByRole("button", { name: "Print assembly steps" }).click();
+  await expect.poll(() => page.evaluate(() => window.printed)).toBe(1);
+  await page.emulateMedia({ media: "print" });
+  await expect(page.locator(".print-root").getByRole("heading", { name: "E2E kallax: KALLAX 2x2" })).toBeVisible();
+  await expect(page.locator(".print-root .print-elevation svg")).toBeVisible();
+  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
+  await page.emulateMedia({ media: "screen" });
+  await expect(page.locator(".print-root")).toHaveCount(0);
+});
+
 async function readDownload(download: { createReadStream(): Promise<NodeJS.ReadableStream> }): Promise<string> {
   const chunks: Buffer[] = [];
   for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
```

Run: `npm run e2e -w @opencutplan/web`

Expected: 3 passed. Tasks 1 to 7 already built what this test drives, so it passes at once; it checks that the pieces work together in a real browser. A failure is a defect in Tasks 1 to 7: debug it there.

- [ ] **Step 5: Update the docs**

Apply this change to `docs/web-app.md` (`git apply` accepts it as is):

```diff
diff --git a/docs/web-app.md b/docs/web-app.md
index b3a644f..469d5d5 100644
--- a/docs/web-app.md
+++ b/docs/web-app.md
@@ -37,8 +37,31 @@ is `#/project/<id>`, so a reload opens the same project.
   use **Save file**.
 - **Save file** writes the project with its computed cut sequence (`plan.cuts`), so other tools can read the cuts.
 
-The tabs are **Parts**, **Stock**, **Tools**, **Layout**, **Shop**, **Reports**, and **Settings**. The left and right
-arrow keys move between tabs.
+The tabs are **Design**, **Parts**, **Stock**, **Tools**, **Layout**, **Shop**, **Reports**, and **Settings**. The
+left and right arrow keys move between tabs.
+
+### Design
+
+A design describes a cabinet unit: a KALLAX-style or EKET-style grid of cells, or a custom grid. The app makes its
+parts from the design, and the Parts tab lists them. The file format is in [format.md](format.md#designs-added-in-11).
+
+- **Add design** adds a KALLAX 2x2 of the first material that is thick enough for pocket screws. With no materials, it
+  adds Plywood (3/4" or 18 mm) first.
+- The list on the left selects a design. The form has the name, the system, how many to build, the columns and rows,
+  the depth, the material, the back, and the mount.
+- A KALLAX or EKET width or height takes its size from the cells. A custom axis is sized by the outside size, or by
+  the list of openings (`335, 335`). Changing the count of a custom axis sized by openings repeats the last opening.
+- Changing the system to KALLAX or EKET applies its cell sizes and depth. Changing it to Custom keeps the sizes.
+- The front view updates while the user types. Enter or leaving the field applies the value; Escape goes back.
+- A value that makes the design impossible (for example, a material too thin for pocket screws) is not applied. The
+  field stays marked and a message gives the reason. It adds no undo step.
+- Each change makes the design's parts again. The copies of those parts leave the sheets when their size changes, and
+  stay when it does not. One **Undo** restores the design, its parts, and the sheets.
+- **Checks** lists the problems and warnings for the design, for example a cell that is too wide for a shelf.
+- **Detach** turns the parts into normal parts and removes the design. **Delete design** removes the design and its
+  parts. **Undo** brings back either one.
+- A file from a newer version, or with a system that this app does not know, shows the design but does not let the
+  user change it. **Detach** and **Delete design** still work.
 
 ### Parts
 
@@ -52,13 +75,14 @@ value when the focus leaves; Escape restores it at once.
   errors are listed and left out. The dialog names the materials that are new; **Import** adds them.
 - Lowering a quantity takes the extra copies off the sheets. Deleting a part removes its copies from the plan.
 - The totals give the number of pieces and the area for each material.
+- A part that a design makes cannot be changed on this tab. Its row says **From design:** with a link to the design.
 
 ### Stock
 
 A materials table (name, thickness, grain, colour) and a stock table (name, material, size, quantity or unlimited,
 cost, kind, edges, and whether to use it). Stock also has a CSV import. **Edges** is the project choice, **Use factory
-edges**, or **Trim** with a width for that stock. A material that parts or stock use cannot be
-deleted. Deleting stock also removes its sheets from the plan.
+edges**, or **Trim** with a width for that stock. A material that parts, stock, or designs use cannot
+be deleted. Deleting stock also removes its sheets from the plan.
 
 ### Tools
 
@@ -115,16 +139,25 @@ list follows.
 - **Reset progress** clears every tick after a confirmation. After **Reset progress** or **Start over**, the first
   step is current. **Print cut sequence** prints the checklist.
 - When the `cutOrder` feature is off, the tab has no steps. It tells the user to turn on **Cut order** in Settings.
+- **Assembly** follows the cut steps. It lists the assembly steps of each design, numbered from 1 across all the
+  designs. The ticks are saved apart from the cut ticks (`extensions["opencutplan.app"].assemblyProgress`). When a
+  design change changes the steps, the same **Start over** and **Keep my ticks** banner shows for the assembly steps
+  only. **Reset assembly** clears the assembly ticks after a confirmation. The list shows also when there are no cut
+  steps.
 
 ### Reports
 
-- **Print and export**: **Print sheet diagrams**, **Print cut sequence**, **Print shopping list**, **Export parts
-  CSV**, **Export stock CSV**, and one **Sheet N as SVG** button for each sheet. File names start with the project
+- **Print and export**: **Print sheet diagrams**, **Print cut sequence**, **Print shopping list**, **Print assembly
+  steps** (when there are designs), **Export parts CSV**, **Export stock CSV**, and one **Sheet N as SVG** button for
+  each sheet. File names start with the project
   name: `Shelf-parts.csv`, `Shelf-stock.csv`, `Shelf-sheet-1.svg`.
 - **Shopping list**: for each material, the stock, its size, the sheets in the plan, the count to buy (owned offcuts
   are not bought), the unit cost, the cost, and a subtotal; then the share of the stock that parts use, and the waste.
   The total follows, or a warning that names the stock with no price. The cost columns are hidden when the `cost`
   feature is off. A second table gives the use of each sheet.
+- **Hardware** (when there are designs): the screws, rails, legs, and glue to buy, with the IKEA article number and the
+  design that needs each item. The article numbers are for IKEA in Great Britain.
+- **Front views**: the drawing of each design, and a **<name> as SVG** button that downloads `Shelf-<design id>.svg`.
 - **Offcuts** (when the `offcuts` feature is on) lists the waste pieces that are at least the smallest useful offcut.
   **Save offcuts to stock** adds them to the Stock tab as owned offcuts. It adds each offcut once: an offcut that is
   already in stock from the same sheet number, with the same material and size (to within 1/64" or 0.1 mm), is not
@@ -147,7 +180,8 @@ dialog's "Save as PDF" for a PDF.
   parts list. A row for more than one copy shows the part name and the count, for example "Side ×4". The key goes
   beside the drawing when that gives a larger scale.
 - **Cut sequence**: portrait pages with a small drawing of each sheet and a box to tick for each step.
-- **Shopping list**: the tables from the Reports tab.
+- **Shopping list**: the tables from the Reports tab, with the hardware.
+- **Assembly steps**: one page for each design, with its front view and a box to tick for each step.
 - **Labels**: the page size of the label sheet with no margins. Print at 100% ("Actual size"), not "Fit to page".
 
 ### Settings
@@ -175,6 +209,7 @@ The optimizer tests run the real worker protocol in the test thread.
 
 `npm run e2e` runs the Playwright tests in `apps/web/e2e` in Chromium against a production build. They cover a new
 project from CSV through optimize, the Shop checklist across a reload and at a phone width, printing (with a PDF of
-the print pages), and the SVG and CSV downloads; and drag, rotate, and undo in the layout editor. Install the browser
+the print pages), and the SVG and CSV downloads; drag, rotate, and undo in the layout editor; and a design through
+optimize, the assembly checklist across a reload, and the assembly print. Install the browser
 once with `npx playwright install chromium`. `npm run check` does not run them; CI runs both
 (`.github/workflows/ci.yml`).
```

- [ ] **Step 6: Run everything**

Run: `npm run check && npm run e2e -w @opencutplan/web`

Expected: exit 0, and 3 passed.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/examples.ts apps/web/test/examples.test.ts apps/web/e2e/plan.e2e.ts docs/web-app.md
git commit -m "Document the web design features and test them in the browser" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

