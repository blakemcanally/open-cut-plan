# Combined cubbies implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user combine a rectangle of cells of a design into one cell, and make the parts, the front view, the checks, the hardware, and the assembly steps follow the new boards, with no change for a design that has no combined cells.

**Architecture:** A design gets the optional field `combined` (format 1.7): a list of 1-based cell spans. A new pure function `boardLayout(columns, rows, combined)` in `design/layout.ts` finds the divider and shelf boards with the junction rule of spec §5.3. `designGeometry` carries the spans, so `buildDesignParts`, `designPanels`, the hardware counts, the span check, and the assembly steps read the boards from the same layout. Pure helpers in `design/combined.ts` check, fit, combine, and split the spans; the web app and the CLI share them. The web app gets a Cells fieldset with Combine and Split, and a Parts section.

**Tech Stack:** TypeScript strict (`erasableSyntaxOnly`, `exactOptionalPropertyTypes`), Vitest, fast-check, React 19 with Testing Library, npm workspaces (`packages/core`, `packages/cli`, `apps/web`).

**Spec:** `docs/superpowers/specs/2026-10-04-combined-cubbies-design.md`

## Global Constraints

- A design with no `combined` field, or with `combined: []`, gives exactly the parts of today: the same ids, names, sizes, quantities, and order. The same holds for the front view panels and cells, the hardware counts, the assembly text, and the check messages.
- Format 1.7. The migration from 1.6 does nothing. `designParts` already returns null for a newer minor version, so a 1.6 reader keeps the stored parts.
- Spans are 1-based in the file and in every user text. Code inside `layout.ts` uses 0-based cell indices; a column line `j` (1 to n − 1) is between 0-based columns `j − 1` and `j`.
- New part ids: `<design>-divider-rows-<a>` or `<design>-divider-rows-<a>-<b>` ("Divider, row a" or "Divider, rows a–b"); `<design>-shelf-cols-<a>-<b>` ("Shelf, columns a–b"). The names use an en dash.
- User-visible text is in ASD-STE100 Simplified Technical English: active voice, short sentences, articles kept.
- No comment that restates the code. Match the comment density of each file.
- `npm run lint && npm run typecheck && npm test && npm run build` passes at the end of every task. Do not run `npm run e2e` in a shared worktree.
- Each commit has a plain imperative subject and ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Back compatibility: the oracle test that compares `buildDesignParts` with a copy of the code from `main` for random grids with no combined cells (Task 4), and the unchanged examples (Task 1).
2. The junction rule: `boardLayout` for the worked examples of spec §14 and the property tests of Task 5 (tiling, closed cells, board ends on a member that runs through).
3. Stable ids: a combined cell does not change the id of a one-cell shelf in another column (Task 4 test "keeps the shelf ids of the other columns").
4. The span check with a divider that stands on a long shelf (spec §14.5, Task 6).
5. The column order of the assembly steps for the pinwheel of spec §14.4 (Task 7).

## Decisions

These are calls the spec leaves open. The plan makes them; the executor does not revisit them.

1. `DesignGeometry` gets `combined?: readonly CombinedCell[]`, set only when the design has at least one span. So the `toEqual` tests on `designGeometry` do not change, and every function that takes a geometry sees the spans with no new parameter.
2. `boardLayout` returns the boards in a fixed order: divider boards by column line, then from the top; shelf boards by row line, then from the left. Parts, panels, and steps sort from there.
3. `designPanels` keeps the order of today: the top, the bottom, then for each column line from the left, its vertical boards from the top, then the shelf boards that start in the column on its right, from the top.
4. `design-combined` is checked after `design-too-small` and before the parts are built, and it stops the check (as `design-too-small` does), because `boardLayout` assumes valid spans.
5. The web form applies `fitCombined` inside `tryDesign`, so every form change (cell counts, openings text, system change) keeps valid spans. `design set` in the CLI applies it after the axis flags.
6. The CLI commands `design combine` and `design split` are a later phase (Task 11). The prototype ends at Task 10.
7. The assembly text with combined cells is plain but correct (spec §10). The text of a design with no combined cells comes from the same code path as today, unchanged.
8. The new example is `examples/kallax-4x2-combined-mm.cutplan.json`: the spec §14.1 unit. It is in the web app example list.

## File Structure

- `packages/core/src/format/schema.ts` (modify): `CombinedCellSchema`, `DesignSchema.combined`, `FORMAT_VERSION` 1.7, type `CombinedCell`.
- `packages/core/src/format/version.ts` (modify): `SUPPORTED_MINOR` 7.
- `packages/core/src/design/combined.ts` (create): `combinedErrors`, `fitCombined`, `expandSelection`, `combineCells`, `splitCells`, `combinedAt`.
- `packages/core/src/design/layout.ts` (create): `boardLayout`, `Board`, `BoardLayout`, `designLayout`, `boardLength`, `freeSpans`.
- `packages/core/src/design/geometry.ts` (modify): `combined` in `DesignGeometry`.
- `packages/core/src/design/errors.ts` (modify): `design-combined`.
- `packages/core/src/design/parts.ts` (modify): parts from boards.
- `packages/core/src/design/panels.ts` (modify): panels from boards; `Cell.columns` and `Cell.rows`.
- `packages/core/src/design/checks.ts` (modify): `shelf-span` from free spans.
- `packages/core/src/design/hardware.ts` (modify): `pocketHoleEnds` and `backScrewCount` from boards.
- `packages/core/src/design/assembly.ts` (modify): the steps with combined cells.
- `packages/core/src/index.ts` (modify): exports.
- `packages/cli/src/commands/design.ts` (modify): `fitCombined` in `design set`.
- `apps/web/src/design/form.ts` (modify): `fitCombined` in `tryDesign`.
- `apps/web/src/design/CellGrid.tsx` (create): the grid, the selection, Combine, and Split.
- `apps/web/src/screens/DesignTab.tsx` (modify): the Cells fieldset and the Parts section.
- `apps/web/src/styles.css` (modify): the grid styles.
- `apps/web/src/examples.ts`, `examples/builders/*` (modify), `examples/kallax-4x2-combined-mm.cutplan.json` and its CSV files (create).
- `schema/cutplan.schema.json` (made again by `npm run schema`).
- `docs/format.md`, `docs/web-app.md`, `docs/cli.md` (modify).
- Tests: new `packages/core/test/design/combined.test.ts`, `layout.test.ts`, `legacy.ts` (the oracle); changes to `parts.test.ts`, `panels.test.ts`, `checks.test.ts`, `hardware.test.ts`, `assembly.test.ts`, `errors.test.ts`, the format version tests, `apps/web/test/DesignTab.test.tsx`, and `apps/web/test/examples.test.ts`.

---

### Task 1: Format 1.7 and the `combined` field

**Files:**
- Modify: `packages/core/src/format/schema.ts`, `packages/core/src/format/version.ts`, `docs/format.md`, `schema/cutplan.schema.json` (generated), `examples/*.cutplan.json` (generated)
- Test: `packages/core/test/format/schema.test.ts`, `parse.test.ts`, `version.test.ts`, `packages/core/test/sequence/choice.test.ts`, `packages/core/test/design/checks.test.ts`, `generate.test.ts`, `packages/cli/test/project.test.ts`, `packages/cli/test/design.test.ts`

**Interfaces:**
- Produces: `CombinedCellSchema = z.object({ column, row, columns, rows }).loose()` with each field `z.number().int().min(1).max(MAX_DESIGN_CELLS)`; `DesignSchema.combined: z.array(CombinedCellSchema).max(MAX_COMBINED).optional()` with `MAX_COMBINED = 1250`; `type CombinedCell`.

- [ ] **Step 1:** Write the failing tests: a design with `combined: [{ column: 1, row: 1, columns: 2, rows: 1 }]` round-trips through `parseProject` and `serializeProject`; a span with `columns: 0` or `column: 1.5` is a schema error; `FORMAT_VERSION` is `"1.7"`; a 1.6 file loads as 1.7 with no warning.
- [ ] **Step 2:** Run `npm test -w @opencutplan/core -- format` and see them fail.
- [ ] **Step 3:** Add the schema, the type, and the version. Change `"1.6"` to `"1.7"` in the tests that read the version of a new project, and `"1.7"` to `"1.8"` in the CLI test of a newer file.
- [ ] **Step 4:** Run `npm run schema` and `npm run examples`. Only the `version` line of each example changes.
- [ ] **Step 5:** Add `combined` to the design table in `docs/format.md` ("added in 1.7"), with the rules of spec §4.1 and §4.2, and change the version in the title and the `version` row.
- [ ] **Step 6:** Run the full check, and commit: `Add the combined cells of a design to file format 1.7`.

### Task 2: Check, fit, combine, and split the spans

**Files:**
- Create: `packages/core/src/design/combined.ts`, `packages/core/test/design/combined.test.ts`
- Modify: `packages/core/src/design/errors.ts`, `packages/core/src/index.ts`, `packages/core/test/design/errors.test.ts`

**Interfaces:**
- `combinedErrors(design: Design): string[]`: one message for each bad span, in the words of spec §4.2, for example `Combined cell 2 (column 3, row 1, 2 × 1) is not in the grid of 4 × 2 cells.`
- `fitCombined(design: Design): Design`: spec §4.3. It returns the same object when nothing changes, and removes the field when no span is left.
- `combinedAt(design, column, row): CombinedCell | undefined` (1-based).
- `expandSelection(design, rect: CombinedCell): CombinedCell`, `combineCells(design, rect): Design | null`, `splitCells(design, rect): Design`.
- `designErrors` gives `planError("design-combined", \`Design "${name}" has a bad combined cell: ${message}\`, ref)` for each message, after `design-too-small`, and returns.

- [ ] **Step 1:** Write the failing tests: each rule (out of the grid on the right and at the bottom, 1 × 1, overlap, the full grid is valid); `fitCombined` with a smaller grid (a span gets shorter; a span that is left with 1 cell goes away; a span that starts outside goes away), with a larger grid (no change), and with no field (same object); `expandSelection` that grows in two steps (a selection touches span A, and the larger selection touches span B); `combineCells` that absorbs two spans; `splitCells` that removes the field.
- [ ] **Step 2:** Run them and see them fail.
- [ ] **Step 3:** Write `combined.ts`. Use `axisCells` for the grid size. `expandSelection` loops until no span crosses the edge of the selection.
- [ ] **Step 4:** Add the error to `designErrors`. Test: a design with an overlap makes no parts (`designParts` is null) and `checkDesigns` lists `design-combined`.
- [ ] **Step 5:** Run the full check, and commit: `Check, fit, combine, and split the combined cells of a design`.

### Task 3: The board layout

**Files:**
- Create: `packages/core/src/design/layout.ts`, `packages/core/test/design/layout.test.ts`
- Modify: `packages/core/src/design/geometry.ts`, `packages/core/src/index.ts`

**Interfaces:**

```ts
export interface Board {
  kind: "divider" | "shelf";
  /** The column line (divider) or the row line (shelf), 1 to the cell count − 1. */
  line: number;
  /** The first and the last cell along the line, 0-based. */
  from: number;
  to: number;
}

export interface BoardLayout {
  dividers: Board[];
  shelves: Board[];
}

export function boardLayout(columns: number, rows: number, combined: readonly CombinedCell[]): BoardLayout;
export function designLayout(geometry: DesignGeometry): BoardLayout;
export function boardLength(board: Board, geometry: DesignGeometry): number;
```

The algorithm (spec §5.2 and §5.3):

```ts
const owner = cellOwners(columns, rows, combined); // owner[row][column]: the index of the span, or -1
const same = (r1, c1, r2, c2) => owner[r1][c1] !== -1 && owner[r1][c1] === owner[r2][c2];
const divider = (j, r) => !same(r, j - 1, r, j);  // the segment of column line j in row r
const shelf = (i, c) => !same(i - 1, c, i, c);    // the segment of row line i in column c
// Divider boards: the longest runs of rows where divider(j, r).
// Shelf boards: the runs of columns where shelf(i, c), cut before column c when divider(c, i - 1) && divider(c, i).
```

- [ ] **Step 1:** Write the failing tests: no combined cells gives n − 1 full dividers and n × (m − 1) one-cell shelves; the layouts of spec §14.1 to §14.5 as lists of `{ kind, line, from, to }`; `boardLength` of a long shelf is 688 for 2 KALLAX columns.
- [ ] **Step 2:** Add `combined` to `designGeometry` (decision 1) and write `layout.ts`.
- [ ] **Step 3:** Run the full check, and commit: `Find the divider and shelf boards of a design with combined cells`.

### Task 4: Parts from the boards

**Files:**
- Create: `packages/core/test/design/legacy.ts` (a copy of `buildDesignParts` from `main`, as the oracle)
- Modify: `packages/core/src/design/parts.ts`, `packages/core/test/design/parts.test.ts`

- [ ] **Step 1:** Write the failing tests: the parts tables of spec §14.1 and §14.2; the oracle property (random openings for 1 to 6 columns and rows, random thickness, a back or not, a quantity of 1 to 3, and no combined cells, or `combined: []`); "keeps the shelf ids of the other columns" (a grid with two column openings, `shelf-1` and `shelf-2`; combine two rows of column 1, and `shelf-2` keeps its id); a group with no boards left is not in the list.
- [ ] **Step 2:** Rewrite `buildDesignParts` on top of `designLayout`: full dividers to `divider`; short dividers grouped by `from`/`to`; one-cell shelves grouped by column opening with *k* from the full column list; long shelves grouped by `from`/`to`; the order of spec §6.
- [ ] **Step 3:** Run the full check, and commit: `Make the parts of a design from its boards, with long shelves and short dividers`.

### Task 5: The front view

**Files:**
- Modify: `packages/core/src/design/panels.ts`, `packages/core/test/design/panels.test.ts`, `packages/core/test/reports/elevation.test.ts`

- [ ] **Step 1:** Write the failing tests: the panels and the cells of spec §14.1 (one cell of 688 × 335 with `columns: 2`); a property test with random spans: the panels and the cells fill the outside with no overlap; each cell is closed on all four sides; each board end touches a panel or the box edge; each board length matches spec §5.5; the parts match the panels; the top, the bottom, and the side parts do not change when cells are combined. The SVG of §14.1 has one label "688 mm × 335 mm".
- [ ] **Step 2:** Rewrite `designPanels` from the layout, in the order of decision 3. Skip the cells that a span covers, and give the span cell at its top-left cell.
- [ ] **Step 3:** Run the full check, and commit: `Draw the boards and the combined cells in the front view`.

### Task 6: The span check

**Files:**
- Modify: `packages/core/src/design/layout.ts` (`freeSpans`), `packages/core/src/design/checks.ts`, `packages/core/test/design/checks.test.ts`

**Interfaces:** `freeSpans(geometry): { board: Board | "top"; span: number }[]`: the longest free span of the top and of each shelf board, with the supports of spec §8.2.

- [ ] **Step 1:** Write the failing tests: the message of today for a grid with a wide column (no combined cells); spec §14.5 gives the new message with "Shelf, columns 1–3" and 1041 mm; spec §14.1 gives no warning; a 3-column combined cell in the top row gives the message for "the top".
- [ ] **Step 2:** Write `freeSpans` and use it in `checkDesigns`. Keep the message of today when the design has no combined cells.
- [ ] **Step 3:** Run the full check, and commit: `Check the free span of each shelf board and the top of a design with combined cells`.

### Task 7: Hardware and assembly steps

**Files:**
- Modify: `packages/core/src/design/hardware.ts`, `packages/core/src/design/assembly.ts`, `packages/core/test/design/hardware.test.ts`, `packages/core/test/design/assembly.test.ts`

- [ ] **Step 1:** Write the failing tests: `pocketHoleEnds` is 16 for spec §14.1 and 18 with no combined cells; the back screw count adds the board lengths; the steps of spec §14.1 (the drill counts, the marks on the top and the bottom that are not the same, a column step with no shelf to put); for the pinwheel of spec §14.4 and for random layouts, the column steps only screw a board to a board that an earlier or the same step put in place.
- [ ] **Step 2:** Count the ends and the back edges from the boards. Write the assembly path for combined cells (spec §10). Keep the code path of today for a design with no combined cells.
- [ ] **Step 3:** Run the full check, and commit: `Count the hardware and write the assembly steps from the boards`.

### Task 8: Keep the spans valid in `design set`

**Files:**
- Modify: `packages/cli/src/commands/design.ts`, `packages/cli/test/design-write.test.ts`

- [ ] **Step 1:** Write the failing test: `design set --cols 1` on a design with a span over columns 1 and 2 removes the span and makes the parts of a 1-column grid.
- [ ] **Step 2:** Apply `fitCombined` after the axis flags.
- [ ] **Step 3:** Run the full check, and commit: `Fit the combined cells to the grid in design set`.

### Task 9: Combine and split on the Design tab

**Files:**
- Create: `apps/web/src/design/CellGrid.tsx`
- Modify: `apps/web/src/design/form.ts`, `apps/web/src/screens/DesignTab.tsx`, `apps/web/src/styles.css`, `apps/web/test/DesignTab.test.tsx`

**Interfaces:** `CellGrid({ design, geometry, disabled, onCombine, onSplit })`. The grid is a `role="grid"` with one `role="gridcell"` button for each cell or span, named "Column 1, row 1" or "Columns 1–2, row 1". A selected cell has `aria-selected="true"`.

- [ ] **Step 1:** Write the failing tests: click "Column 1, row 1", shift-click "Column 2, row 1", click **Combine**: the design has the span, the parts list has "Shelf, columns 1–2", the preview has the label "688 mm × 335 mm". Click the combined cell and **Split**: the span goes away. **Undo** brings it back. The Combine button is disabled for one cell. A change of the column count to 1 removes the span.
- [ ] **Step 2:** Write `CellGrid`: a CSS grid with `grid-template-columns` from the column openings (as `fr`), and spans placed with `grid-column` and `grid-row`. Click, shift-click, pointer drag, and the arrow keys change the selection; `expandSelection` grows it.
- [ ] **Step 3:** Add the Cells fieldset and the Parts section to the Design tab. Apply `fitCombined` in `tryDesign`.
- [ ] **Step 4:** Run the full check, and commit: `Combine and split cells on the Design tab, and list the parts of the design`.

### Task 10: The example and the docs

**Files:**
- Create: `examples/builders/kallax-4x2-combined-mm.ts`, `examples/kallax-4x2-combined-mm.cutplan.json`, `examples/csv/kallax-4x2-combined-mm-parts.csv`, `examples/csv/kallax-4x2-combined-mm-stock.csv`
- Modify: `examples/builders/index.ts`, `apps/web/src/examples.ts`, `apps/web/test/examples.test.ts`, `docs/format.md`, `docs/web-app.md`, `docs/cli.md`

- [ ] **Step 1:** Add the builder for spec §14.1 and run `npm run examples`. The example tests check that it has current parts and no design issues.
- [ ] **Step 2:** Add it to the web example list.
- [ ] **Step 3:** Describe the boards in the generated parts section of `docs/format.md`, the Cells fieldset in `docs/web-app.md`, and the effect on `design set` in `docs/cli.md`.
- [ ] **Step 4:** Run the full check, and commit: `Add a KALLAX 4x2 example with combined cells, and describe them in the docs`.

### Task 11 (later phase): CLI commands

Done: `design combine` and `design split` in `packages/cli/src/commands/design.ts`, with the tests in `packages/cli/test/design.test.ts` and the recipe step in `docs/cli.md`.

- `design combine <file> <id> --cell <column>,<row> --to <column>,<row>` and `design split <file> <id> --cell <column>,<row>`, with `--json` output in the style of `design set` (`design`, `parts`, `partChanges`, `removedPlacements`), help text, tests, and `docs/cli.md`.

### Task 12 (later phase): Polish

Done: the assembly text names each board and joins each short divider to its long shelf first (`shelfAssemblies`), the front view names each board and labels the boards of a combined cell, the Design tab marks the selected cells in the front view, and `apps/web/e2e/plan.e2e.ts` combines two cells and optimizes.

- Assembly text with the part names on each board, and one step for each through member when it reads better.
- A highlight of the selected cells in the front view, and labels with the part names on the boards.
- An e2e test that combines cells on the Design tab and optimizes.
