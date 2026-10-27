# Starter designs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** **Add design** opens a catalogue of starter designs with IKEA proportions and quick choices; the CLI gets the
same catalogue.

**Architecture:** The starters live in core (`packages/core/src/design/starters.ts`) as data plus a function from the
chosen values to a normal `Design`. The material pick of `addDesign` moves from the web app into core
(`packages/core/src/design/add.ts`), so the web dialog and `design add --starter` add the same design. The web app gets a
`StarterDialog` with a `GridPicker`; the CLI gets `design starters` and `--starter`.

**Tech Stack:** TypeScript 7, React, Vitest, Testing Library, Playwright (e2e), zod (format).

**Spec:** `docs/superpowers/specs/2026-10-27-design-starters-design.md`

## Global Constraints

- No change to the file format (`packages/core/src/format/schema.ts`), and no `FORMAT_VERSION` change.
- Starter names are generic: "Cube shelf", "TV bench", "Media unit", "Bookcase", "Wall cubes", "Nightstand", "Custom
  grid". An IKEA name appears only as "KALLAX-style …", "BILLY-style …", "Fits KALLAX inserts and boxes", "EKET legs",
  and so on (spec §3a rules 1–3).
- IKEA names in capitals: KALLAX, EKET, BILLY. No plural, possessive, or word play. No comparison with IKEA.
- The notice text, exact: `IKEA, KALLAX, EKET, and BILLY are trademarks of Inter IKEA Systems B.V. OpenCutPlan is not affiliated with or endorsed by IKEA.`
- A grid size is columns × rows. Design names use " × " (U+00D7) with spaces, for example "Cube shelf 3 × 2"; the
  default names of today keep "x" with no spaces ("KALLAX-style 2x4").
- Default design ids do not change: `kallax-2x4`, `eket-2x1`, `custom-3x2`.
- Every size has a `SystemValue` source (`packages/core/src/design/systems.ts`); IKEA GB URLs, as now.
- UI and doc text follow the Simplified Technical English style of the repo (short sentences, active voice).
- Run `npm run check` before the last commit of each task that touches more than one package.

## Review Focus

1. **A project whose only material is too thin for pocket screws** (for example only 6 mm). The pick returns that
   material, the design has an error, and the dialog must show the error and disable **Use this design**, not throw.
   Test in Task 6.
2. **A starter id that is taken** (a design "cube-shelf-2-4" exists, or a manual part has the id
   "cube-shelf-2-4-top"). The add must pick "cube-shelf-2-4-2", as `addDesign` does now. Test in Task 3.
3. **An inch project with unmeasured 3/4" plywood.** The preview shows the `nominal-thickness` warning and keeps
   **Use this design** enabled; a warning never blocks. Test in Task 6.
4. **The arrow keys at the edge of the grid** (1 × 1, or the maximum). The size stays at the limit and does not wrap.
   Test in Task 5.
5. **An unknown starter id in the CLI** (`--starter kallax`). A usage error `invalid-value` that lists the ids, exit 2.
   Test in Task 4.

---

### Task 1: Generic default names and the notice

**Files:**
- Modify: `packages/core/src/design/edit.ts:6-10`
- Modify: `packages/cli/src/commands/design.ts:304-306` (the id base in `add`)
- Modify: `apps/web/src/design/form.ts:100-102`
- Test: `packages/core/test/design/edit.test.ts:29-31`, `packages/cli/test/design.test.ts`, `apps/web/test/DesignTab.test.tsx`

**Interfaces:**
- Produces: `IKEA_NOTICE: string`; `defaultDesignName(system, cols, rows): string` (now "KALLAX-style 2x4");
  `defaultDesignId(system: DesignSystem, cols: number, rows: number): string` (stays "kallax-2x4").

- [ ] **Step 1: Write the failing tests** in `edit.test.ts`

```ts
expect(defaultDesignName("kallax", 2, 4)).toBe("KALLAX-style 2x4");
expect(defaultDesignName("eket", 2, 1)).toBe("EKET-style 2x1");
expect(defaultDesignName("custom", 3, 2)).toBe("Custom 3x2");
expect(defaultDesignId("kallax", 2, 4)).toBe("kallax-2x4");
expect(defaultDesignId("eket", 2, 1)).toBe("eket-2x1");
expect(defaultDesignId("custom", 3, 2)).toBe("custom-3x2");
expect(IKEA_NOTICE).toBe("IKEA, KALLAX, EKET, and BILLY are trademarks of Inter IKEA Systems B.V. OpenCutPlan is not affiliated with or endorsed by IKEA.");
```

- [ ] **Step 2: Run** `npm test -w @opencutplan/core -- edit` — Expected: FAIL.
- [ ] **Step 3: Implement** in `edit.ts`. `DESIGN_SYSTEM_NAMES` stays as it is (the system select uses it).
  `defaultDesignId` is `slugify` of `` `${DESIGN_SYSTEM_NAMES[system]} ${cols}x${rows}` ``. `defaultDesignName` uses
  "KALLAX-style" and "EKET-style". Export `IKEA_NOTICE` from `edit.ts`.
- [ ] **Step 4: Keep the ids.** In the CLI `add`, when `--name` is not given, pass `defaultDesignId(...)` as the base
  of `newId`; with `--name`, pass the name as now. In `form.ts` `addDesign`, use `defaultDesignId("kallax", 2, 2)` as
  the id base.
- [ ] **Step 5: Update the name assertions** that now fail: `design.test.ts` lines 39, 55, 141 ("KALLAX-style 2x4";
  the ids stay), and the "KALLAX 2x2" names in `DesignTab.test.tsx` (ids stay "kallax-2x2"). Do not change the
  example files: saved designs keep their names.
- [ ] **Step 6: Run** `npm test` — Expected: PASS.
- [ ] **Step 7: Commit** — `git commit -m "Name new default designs KALLAX-style and EKET-style, and keep their ids"`

### Task 2: Move the material pick into core

**Files:**
- Create: `packages/core/src/design/add.ts`
- Modify: `packages/core/src/index.ts` (export `./design/add.ts`)
- Modify: `apps/web/src/design/form.ts:67-110` (remove `pocketMaterial`, `BACK_MATERIAL`, `backMaterial`; `addDesign`
  calls core)
- Test: `packages/core/test/design/add.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface DesignMaterials { project: Project; material: string; back: string }
  /** The box material and the back material that a new design gets, with the suggested sheet for each that has no enabled stock. */
  export function pickDesignMaterials(project: Project): DesignMaterials;
  export type DesignAdd = { ok: true; project: Project; id: string } | { ok: false; issues: PlanIssue[] };
  /** Adds the design that `make(id)` gives, with the first free id from `base`, and tries the next id while the only errors are design-conflict. No parts. */
  export function addDesignWithId(project: Project, base: string, make: (id: string) => Design): DesignAdd;
  ```

- [ ] **Step 1: Write the failing tests** in `add.test.ts`. Port the four material cases from
  `apps/web/test/DesignTab.test.tsx:47-124` to direct calls of `pickDesignMaterials`, with the same expected materials
  and stock: a new mm project gives `plywood` (18) and `plywood-6-mm` (6) with `plywood-2440x1220` and
  `plywood-6-mm-2440x1220`; a project with `ply18` and `ply6` adds only `ply6-2440x1220`; the inch project with `birch`
  (45/64) and `thin` adds `birch-ply-3-4-4x8`; the inch project with only `birch` 0.75 and a 97 × 49 sheet adds
  `plywood-1-4` with `plywood-1-4-97x49`. For `addDesignWithId`: a project that has a design `kallax-2x2` gives the id
  `kallax-2x2-2`; a project with a manual part `kallax-2x2-top` (no design) gives `kallax-2x2-2`.
- [ ] **Step 2: Run** `npm test -w @opencutplan/core -- add` — Expected: FAIL.
- [ ] **Step 3: Implement** `add.ts` by moving the code of `form.ts` (`pocketMaterial`, `BACK_MATERIAL`,
  `backMaterial`, the id loop of `addDesign`) with no change of behaviour. `addDesignWithId` uses `fitCombined` and
  `designErrors`, as `tryDesign` in `form.ts` does. `form.ts` `addDesign` becomes `pickDesignMaterials` plus
  `addDesignWithId(base, defaultDesignId("kallax", 2, 2), …)`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS, with no change to `DesignTab.test.tsx`.
- [ ] **Step 5: Commit** — `git commit -m "Move the material pick and the id loop of a new design into core"`

### Task 3: The starters in core

**Files:**
- Create: `packages/core/src/design/starters.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/design/starters.test.ts`

**Interfaces:**
- Consumes: `presetAxis`, `presetDepth`, `KALLAX`, `EKET`, `SystemValue` (`systems.ts`); `pickDesignMaterials`,
  `addDesignWithId` (Task 2); `checkDesigns`, `regenerateDesigns`.
- Produces:
  ```ts
  export type StarterId = "cube-shelf" | "tv-bench" | "media-unit" | "bookcase" | "wall-cubes" | "nightstand" | "custom-grid";
  export type StarterGroup = "Cube shelves" | "Low units" | "Bookcases" | "Wall units" | "Small units" | null; // null: Custom grid, after the groups
  export interface GridChoice { kind: "grid"; columns: { min: number; max: number }; rows: { min: number; max: number } }
  export interface OptionChoice { kind: "option"; key: "mount" | "width" | "height"; label: string; values: readonly { value: string; label: string }[] }
  export type StarterChoice = GridChoice | OptionChoice;
  export interface StarterValues { columns: number; rows: number; options: Readonly<Partial<Record<OptionChoice["key"], string>>> }
  export interface Starter { id: StarterId; name: string; group: StarterGroup; note: string; choices: readonly StarterChoice[]; defaults: StarterValues; sources: Readonly<Record<string, SystemValue>> }
  export const STARTERS: readonly Starter[];
  export function starterById(id: string): Starter | undefined;
  /** The messages for values the starter does not allow; empty when all are allowed. */
  export function starterValueErrors(starter: Starter, values: StarterValues): string[];
  export function starterName(starter: Starter, values: StarterValues): string;
  export function starterDesign(starter: Starter, values: StarterValues, target: { id: string; units: Units; material: string; back: string | null }): Design;
  /** Adds the design of the starter with the picked materials (or the given ones), its id from its name. No parts. */
  export function addStarterDesign(project: Project, starter: Starter, values: StarterValues, options?: { material?: string; back?: string | null; name?: string; id?: string }): DesignAdd;
  /** The Fits items of spec §4.2 for a design in a project with its parts, minus each item that a warning of that design rules out. */
  export function starterFits(project: Project, designId: string): string[];
  ```

The table of spec §5.1 sets the data. Specific values:

| Starter | System | Grid min–max (cols × rows) | Options | Defaults | Mount | Depth |
|---|---|---|---|---|---|---|
| `cube-shelf` | kallax | 1–6 × 1–6 | — | 2 × 4 | floor | `presetDepth` |
| `tv-bench` | kallax | 2–6 × 1–1 | mount: legs, floor | 4 × 1, legs | from option | `presetDepth` |
| `media-unit` | kallax | none (4 × 2) | — | combined `{ column: 2, row: 1, columns: 2, rows: 1 }` | legs | `presetDepth` |
| `bookcase` | custom | none | width: 40, 80; height: 106, 202 (cm) | 80, 202 | floor | 280 mm |
| `wall-cubes` | eket | 1–4 × 1–2 | — | 3 × 1 | wall-rail | `presetDepth` |
| `nightstand` | eket | 1–1 × 1–2 | mount: legs, feet | 1 × 2, legs | from option | `presetDepth` |
| `custom-grid` | custom | none (2 × 2) | — | openings of `KALLAX.opening` | floor | `presetDepth("kallax")` |

- Every starter has a back (`target.back`), except when `back` is `null`.
- The bookcase axes use the `outside` form: width `{ outside: 400|800 mm, cells: 1 }`, height
  `{ outside: 1060|2020 mm, cells: 3|6 }`, converted with `convertLength` and `roundLength`.
- Names (spec §5.4): grid starters "Cube shelf 3 × 2", "TV bench 4 × 1", "Wall cubes 3 × 1", "Nightstand 1 × 2";
  "Media unit"; "Bookcase 80 × 202"; "Custom grid 2 × 2".
- Notes (one line each), for example cube shelf: "KALLAX-style cells. Pick the columns and rows."; bookcase:
  "BILLY-style sizes, with fixed shelves." The builder writes the rest in the same style (spec §9).
- Fits items: kallax → "KALLAX inserts and boxes" (left out on a `kallax-opening` or `kallax-depth` warning); eket →
  "EKET wall rail" when the mount is `wall-rail` (left out on `eket-grid`); mount `legs` → "EKET legs"; mount `feet` →
  "EKET feet". Custom and the bookcase give only the leg or foot items.

- [ ] **Step 1: Check the sizes against ikea.com.** Fetch the GB listings for KALLAX 1 × 4 / 2 × 2 / 2 × 4 / 4 × 4 /
  5 × 5, BILLY 40 × 28 × 106, 40 × 28 × 202, 80 × 28 × 106, 80 × 28 × 202, EKET 35 × 35 × 70, and the EKET wall
  combinations with the suspension rail. Record a URL for each `sources` entry. Set the `wall-cubes` maximum from the
  largest EKET wall combination IKEA sells. Write each size that differs from the spec into the commit message.
- [ ] **Step 2: Write the failing tests** in `starters.test.ts`:
  - `it.each` over every starter and every allowed value (each grid size from min to max, each option value), in an
    `mm` project with `{ id: "ply18", thickness: 18, measured: true }` and `{ id: "ply6", thickness: 6, measured: true }`,
    and in an `in` project with 0.75 and 0.25 (`measured: true`): `addStarterDesign` gives `ok: true`, and
    `checkDesigns(regenerateDesigns(result.project))` has no issue for that design.
  - KALLAX starters: every opening is `presetAxis("kallax", …)` (335 mm), and the panel depth is ≥ 380 mm.
  - EKET starters: outside width and height are multiples of 350 mm within `EKET_TOLERANCE_MM`.
  - Bookcase 80 × 202 in mm: outside 800 × 2020 × 280.
  - Defaults: `starterName(cube, cube.defaults)` is "Cube shelf 2 × 4"; the design of `media-unit` has
    `combined: [{ column: 2, row: 1, columns: 2, rows: 1 }]`.
  - `starterValueErrors(cube, { columns: 7, rows: 1, options: {} })` is not empty; so is
    `starterValueErrors(bookcase, { …, options: { width: "60" } })`.
  - Ids: in a project with a design `cube-shelf-2-4`, the id is `cube-shelf-2-4-2`; with a manual part
    `cube-shelf-2-4-top`, the id is `cube-shelf-2-4-2` (Review Focus 2).
  - `starterFits`: the TV bench on legs gives `["KALLAX inserts and boxes", "EKET legs"]`; a cube shelf with a 25 mm
    back (panel depth < 380 mm) gives no "KALLAX inserts and boxes".
  - Names: no `starterName` is "KALLAX", "EKET", or "BILLY" alone, and none starts with one of them.
- [ ] **Step 3: Run** `npm test -w @opencutplan/core -- starters` — Expected: FAIL.
- [ ] **Step 4: Implement** `starters.ts` with the interfaces above and the table.
- [ ] **Step 5: Run** `npm test -w @opencutplan/core` — Expected: PASS. A `shelf-span` warning on a lifted unit means
  a value of the table is wrong; fix the data, not the test.
- [ ] **Step 6: Commit** — `git commit -m "Add the starter designs to core, with IKEA sources and the fits list"`

### Task 4: The CLI

**Files:**
- Modify: `packages/cli/src/commands/design.ts` (new `starters` command; `add` gets `--starter` and `--size`; add
  `starters` to `designGroup.commands` after `systems`)
- Modify: `docs/cli.md` (§ Designs, and § For agents: the recipe starts with `design starters`)
- Test: `packages/cli/test/design-starters.test.ts`

**Interfaces:**
- Consumes: `STARTERS`, `starterById`, `starterValueErrors`, `addStarterDesign`, `IKEA_NOTICE` (Tasks 1, 3).
- Produces: `design starters` output `starters [{ id, name, group, note, choices, defaults }], notice`.

Rules (spec §6.4):
- `--starter` with `--system`, `--width`, `--height`, `--column-openings`, or `--row-openings` → usage error
  `conflict`.
- `--cols`/`--rows` set the grid; `--mount` sets the `mount` option; `--size <w>x<h>` (cm) sets `width` and `height`.
  A flag that the starter has no choice for, or a value it does not allow → usage error `invalid-value`, and the
  message lists the allowed values.
- `--material`, `--back` (`none` → `null`), `--name`, and `--id` go to `addStarterDesign` (`--id` first passes the
  `newId` check of today). `--quantity`, `--depth`, and `--color` change the design after it; then `assertValid`,
  `stockFor`, and `regenerateDesigns` run as in `add` now.

- [ ] **Step 1: Write the failing tests:**
  - `design starters --json`: 7 starters in the order of spec §5.1 then `custom-grid`; `notice` equals `IKEA_NOTICE`;
    the text output ends with the notice.
  - `design add F --starter cube-shelf --cols 3 --rows 2 --json` in a new mm project: design
    `{ id: "cube-shelf-3-2", name: "Cube shelf 3 × 2", system: "kallax", back: { material: "plywood-6-mm" } }`, and the
    file equals the project of `addStarterDesign` with the same values after `regenerateDesigns`.
  - `--starter tv-bench --mount floor` → `mount: "floor"`; `--starter bookcase --size 40x106` → width outside 400.
  - `--starter bookcase --cols 3` → exit 2, `invalid-value`; `--starter cube-shelf --mount legs` → `invalid-value`;
    `--starter cube-shelf --cols 7` → `invalid-value` with "1 to 6" in the message.
  - `--starter cube-shelf --width 900` → exit 2, `conflict`.
  - `--starter kallax` → exit 2, `invalid-value`, and the message lists `cube-shelf` (Review Focus 5).
  - `--starter nightstand --name "Bed side" --material ply18 --back none` → name "Bed side", id "bed-side", no back.
- [ ] **Step 2: Run** `npm test -w @opencutplan/cli -- design-starters` — Expected: FAIL.
- [ ] **Step 3: Implement** the command and the flags. `design add` without `--starter` keeps all its rules of today.
- [ ] **Step 4: Update `docs/cli.md`**: the `design starters` command, the `--starter` and `--size` flags with the
  rules above, the notice, and the agent recipe.
- [ ] **Step 5: Run** `npm test -w @opencutplan/cli` — Expected: PASS.
- [ ] **Step 6: Commit** — `git commit -m "Add design starters and design add --starter to the CLI"`

### Task 5: The grid picker

**Files:**
- Create: `apps/web/src/design/GridPicker.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/test/GridPicker.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  interface GridPickerProps {
    columns: { min: number; max: number };
    rows: { min: number; max: number };
    value: { columns: number; rows: number };
    onHover(size: { columns: number; rows: number } | null): void; // null when the pointer leaves
    onChange(size: { columns: number; rows: number }): void;
  }
  export function GridPicker(props: GridPickerProps): JSX.Element;
  ```

- [ ] **Step 1: Write the failing tests:**
  - It draws `max columns × max rows` cells; the cells up to `value` have the class `on`.
  - Pointer over the cell at column 3, row 2 → `onHover({ columns: 3, rows: 2 })`; the label shows "3 × 2". Pointer
    leave → `onHover(null)`; the label shows the value.
  - A click on that cell → `onChange({ columns: 3, rows: 2 })`. A click below the minimum (TV bench rows 1–1) gives the
    minimum.
  - The grid is one focusable element (`tabIndex={0}`) whose accessible name is "Grid: 3 columns, 2 rows" for that
    value. ArrowRight at 6 columns with max 6 → no `onChange`; ArrowLeft at 1 column → no `onChange` (Review Focus
    4). ArrowDown at 2 rows → `onChange({ columns: 3, rows: 3 })`.
- [ ] **Step 2: Run** `npm test -w @opencutplan/web -- GridPicker` — Expected: FAIL.
- [ ] **Step 3: Implement.** Follow the key handling of `CellGrid.tsx` (`STEPS`). Cells are 14 px squares with a 3 px
  gap, light borders, and `--accent`-tinted marked cells.
- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Add the grid picker for the starter dialog"`

### Task 6: The starter dialog, the Design tab, and the docs

**Files:**
- Create: `apps/web/src/design/StarterDialog.tsx`
- Modify: `apps/web/src/design/form.ts` (`addDesign(project)` → `addStarter(project, starter, values): DesignAdd`,
  using `addStarterDesign`)
- Modify: `apps/web/src/screens/DesignTab.tsx:86-118` (the button opens the dialog)
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/test/DesignTab.test.tsx` (the add tests go through the dialog), `apps/web/e2e/plan.e2e.ts:199,260,293`
- Modify: `docs/web-app.md` (§ Design), `README.md` (the **Designs** bullet, and the notice)
- Test: `apps/web/test/StarterDialog.test.tsx`

**Interfaces:**
- Consumes: `STARTERS`, `starterName`, `addStarterDesign`, `starterFits`, `checkDesigns`, `regenerateDesigns`,
  `designElevationSvg`, `designGeometry`, `designSheetEstimate`, `IKEA_NOTICE`; `GridPicker` (Task 5); `Dialog`.
- Produces: `StarterDialog({ project, onUse(result: { project: Project; id: string }): void, onClose(): void })`.

Behaviour (spec §4): two panes, one third and two thirds (`grid-template-columns: 1fr 2fr`), stacked under the narrow
breakpoint that `styles.css` uses now. The list: group headings, each row a button with `aria-pressed`, a small front
view, the name, and the outside size (or "1 × 1 to 6 × 6" for a grid starter); **Custom grid** last; the notice in
small text at the bottom. The preview: name, note, choices (`GridPicker` or `aria-pressed` buttons), front view at about
60 % of the pane width, facts (Outside, Mount, Fits, Sheets, then the warnings in small text), **Cancel** and **Use this
design**. The preview builds a candidate with `addStarterDesign` then `regenerateDesigns`; hover values replace the
set values for the candidate; the estimate uses `useDeferredValue` on the candidate.

- [ ] **Step 1: Write the failing tests** in `StarterDialog.test.tsx`:
  - It opens with **Cube shelf** pressed and the heading "Cube shelf 2 × 4"; the notice text is in the dialog.
  - The list has the group headings of spec §5.1 in order, and **Custom grid** last.
  - A click on the grid cell 3 × 2 changes the heading to "Cube shelf 3 × 2" and the Outside fact to the size of
    `designGeometry` for that candidate (mm project: "1077 mm × 724 mm × 390 mm" for 18 mm).
  - **TV bench** → the Fits fact is "KALLAX inserts and boxes, EKET legs"; **Floor** → no "EKET legs".
  - **Use this design** calls `onUse` with the project of `addStarterDesign` and the id; **Cancel** calls `onClose` only.
  - A project whose only material is `{ id: "thin", thickness: 6 }` shows the design error in a `role="alert"` and
    **Use this design** is disabled (Review Focus 1).
  - An inch project with `{ name: 'Plywood 3/4"', thickness: 0.75 }` (not measured) shows a `nominal-thickness`
    warning and **Use this design** stays enabled (Review Focus 3).
- [ ] **Step 2: Run** `npm test -w @opencutplan/web -- StarterDialog` — Expected: FAIL.
- [ ] **Step 3: Implement** `StarterDialog.tsx` and `addStarter` in `form.ts`. Remove `addDesign` from `form.ts` when
  nothing calls it.
- [ ] **Step 4: Wire the Design tab.** **Add design** opens the dialog (still disabled for a newer file). `onUse` runs
  `edit(result.project)`, selects `result.id`, and closes the dialog. Update the empty-state text to name the
  catalogue.
- [ ] **Step 5: Update `DesignTab.test.tsx`.** Add a helper that clicks **Add design**, picks the 2 × 2 cell, and
  clicks **Use this design**, so the material tests (lines 47–124) keep their expected materials and stock. The design
  becomes `{ id: "cube-shelf-2-2", name: "Cube shelf 2 × 2" }` and its parts `cube-shelf-2-2-…`. Update the three e2e
  flows the same way.
- [ ] **Step 6: Run** `npm test -w @opencutplan/web` and `npm run e2e` — Expected: PASS.
- [ ] **Step 7: Docs.** `docs/web-app.md` § Design: the dialog, the quick choices, and the notice. `README.md`: the
  **Designs** bullet starts "Pick a starter design (a cube shelf, a TV bench, a bookcase, wall cubes, and more), or a
  custom grid of cells."; add the notice in a short "Trademarks" section at the end.
- [ ] **Step 8: Run** `npm run check` — Expected: PASS.
- [ ] **Step 9: Commit** — `git commit -m "Open a catalogue of starter designs from Add design"`
