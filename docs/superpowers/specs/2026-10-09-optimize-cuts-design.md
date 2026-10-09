# Optimize cuts — design spec

Status: draft for review. Date: 2026-10-09.

## 1. Summary

The cut tree of a sheet now comes from a fast search that runs for every candidate of the optimizer. That search
sometimes breaks one long cut into a number of short cuts. This change adds a second action, **Optimize cuts**. It
keeps every placement, runs a slow and thorough search of the cut tree on each sheet, and saves the best tree in the
file. The current Optimize becomes **Optimize layout** and does the same job as now.

## 2. Goals and success criteria

1. The user can optimize the cuts of a layout and keep every part where it is.
2. The saved tree has the fewest cuts that the search finds, then the shortest total cut length.
3. A saved tree never has more cuts than the automatic tree of the same sheet.
4. Every reader of the cut tree (the validator, the sequence, the Cut tab, the reports, and the SVG) uses the saved
   tree while it is still correct for the sheet.
5. A saved tree that is no longer correct is never used, also when an app of version 1.9 or earlier edited the file.
6. The user can see which sheets have saved cuts, and can go back to the automatic cuts.

Not goals: a change to the fast tree that Optimize layout uses to score candidates, a measure of saw setups, and moving
parts (that is Phase 2).

## 3. Phases

- **Phase 1, Optimize cuts with no moves.** The thorough search, the saved tree in format 1.10, the web app, the CLI,
  and the docs. This spec describes Phase 1 in full.
- **Phase 2, "Let parts slide".** An option, off by default, that lets parts move in their own piece so that more edges
  line up. Section 10 gives the outline. Phase 2 gets its own plan after Phase 1 is in use.

## 4. File format 1.10

`SUPPORTED_MINOR` becomes 10 and `FORMAT_VERSION` becomes `"1.10"`. A 1.9 file needs no migration. One optional field
goes on each plan sheet:

| Field | Meaning |
|---|---|
| `optimizedCuts` | A list of cut lines. Each line has `axis`, `at`, `from`, and `to`, the same fields as a tool choice. |

- The list has no order. It has no `stage` and no `step`, because a reader finds them from the lines.
- The list does not include the trim cuts. The trim gives them.
- An empty list is the same as no field. A writer does not write an empty list.
- `cuts` stays derived data, and a writer still writes it from the tree that it uses. Thus `cuts` agrees with
  `optimizedCuts` when the saved tree passes the check.
- A writer of 1.9 or earlier keeps `optimizedCuts` unchanged, because it is an unknown field. It can change the
  placements and leave the old lines. The check in section 5 finds this.
- A line with a bad shape (a missing field, an `axis` that is not `"x"` or `"y"`, or a value that is not a number)
  makes the file invalid, the same as a bad cut.
- `docs/format.md` and the JSON Schema in `schema/` describe version 1.10.

## 5. How a reader uses the saved tree

### 5.1 The rebuild

A reader builds the tree from the lines. In the trimmed sheet, the lines that go fully across the sheet on one axis
make the first split. In each new piece, the same rule applies to the lines that are inside that piece. A line goes
fully across a piece when its `from` and `to` are the ends of the piece, in the same tolerance as `matchesChoice`.

### 5.2 The check

A reader uses the saved tree only when all of these are true:

1. Every line is in the trimmed sheet.
2. The rebuild uses every line, and no piece has lines that go fully across it on both axes.
3. No line, with its kerf, goes through a part.
4. Each piece with a part has one part only, and that piece is the size of the part, in the tolerance of
   `matchesChoice`.
5. The tree has no more stuck cuts, and no more cuts without a tool, than the automatic tree.

The check finds the changes that come from outside the sheet: the kerf, the trim, a part size, the stock, and the
tools. It also finds a placement change that an older writer made.

### 5.3 When the check fails

- The reader uses the automatic tree.
- The reader gives the warning `optimized-cuts-stale` for the sheet: "The saved cuts of sheet N no longer fit the
  layout. Run Optimize cuts again."
- On the next save, the writer removes the field, the same as it removes a tool choice that matches no cut.

### 5.4 The hook

`analyzeSheets` in `packages/core/src/plan/sheets.ts` builds the automatic tree as now. When the sheet has
`optimizedCuts` and the saved tree passes the check, it returns the saved tree in `tree`, and marks the sheet as
optimized. The validator, the sequence, the Cut tab, the reports, and the SVG then get the saved tree with no other
change. Tool choices match the saved cuts by line, as now.

The layout optimizer also scores a pinned sheet with its saved tree, because it uses `analyzeSheets`.

## 6. Edits

- The edit functions in `packages/core/src/edit` remove `optimizedCuts` from a sheet when they change the placements
  of that sheet: a move, a turn, an add, a remove, a move to the tray, and Push to factory edges.
- The edits must do this themselves, because one edit still passes the check: when a part goes off the sheet, its
  piece becomes waste, and the old cuts stay valid but are no longer the best.
- Optimize layout removes the field from every sheet that it changes. A pinned sheet keeps it.
- A change of units converts the lines, the same as it converts tool choices (`packages/core/src/edit/units.ts`).
- Other edits (kerf, trim, a part size, the stock, or the tools) do not remove the field. The check decides.

## 7. The thorough search

### 7.1 The objective

The search compares trees in this order: stuck cuts, cuts without a tool, the cut count, and then the total cut length.
The trim cuts count the same in every tree, so they do not change the result. The setting `optimizer.goal` applies only
to Optimize layout.

### 7.2 The search

The search is the dynamic program of `buildCutTree`. It adds one kind of split: a split can join any range of next
runs into one piece, not only all of the runs. The search honours the tool limits in the same way as the automatic tree.

### 7.3 Passes

The full search can take more than 1 s on a busy sheet. Thus it runs in passes, so that a stop keeps a result:

- Pass k lets a split join up to k next runs.
- Each pass gives a full, valid tree. The search keeps the best tree so far.
- The search starts from the automatic tree. It stops at k = all runs, or at the time limit.
- The memo stays from one pass to the next.

### 7.4 The core API

- `createCutSearch(ctx, sheet)` returns an object with `step(budgetMs)`, the same shape as `createSearch`. Each call
  runs until the budget ends or the search is done. It returns the best tree so far, the pass, and whether the search
  is done.
- `optimizeCuts(project, options)` runs the search on each sheet, or on one sheet. It returns the new project and, for
  each sheet, the cut count and the cut length before and after. The search compares its best tree with the tree that
  the sheet uses now: the saved tree when it passes the check, else the automatic tree. The sheet gets the new tree
  only when it has fewer cuts. Otherwise the sheet keeps what it has. When the cut counts are equal, a shorter cut
  length is not enough to save a tree.
- `options` has `sheet`, `timeLimitMs` (for each sheet), and `passes` (stop after this pass and ignore the time).
- The search does not use random numbers. With `passes`, the result is the same on every computer.

## 8. The web app

- **The Layout tab toolbar:**
  - Optimize becomes **Optimize layout**, with the same job and the same tooltip.
  - A new button, **Optimize cuts**, runs `optimizeCuts` on every sheet in the worker. It shows the same progress bar
    and **Stop**. The progress tells the sheet and the pass. **Stop** keeps the best tree found on each sheet so far.
  - **Undo optimize** also undoes Optimize cuts.
- **The sheet card:**
  - The header shows "Cuts optimized" when the sheet has a saved tree that passes the check.
  - The card has an **Optimize cuts** button for that sheet only.
  - The card menu has **Use automatic cuts**. It removes the field from that sheet.
- **The result.** After the run, a notice tells the change in the cut count and the cut length. When no sheet got
  fewer cuts, it says "These cuts are already the best found."
- **The warning.** A stale saved tree shows the warning of section 5.3 in the issues list and on the sheet card.
- **The worker.** The worker protocol gets a second kind of run for Optimize cuts, with the same start, cancel,
  progress, and done messages. The time limit for each sheet is `optimizer.timeLimitMs`.

## 9. The CLI and the docs

### 9.1 The CLI

- **A new command, `optimize-cuts <file>`.** It keeps every placement, runs the search, and saves the field on each
  sheet that gets fewer cuts. It reports, for each sheet, the cut count and the cut length before and after.
  - `--sheet <ref>` searches one sheet only.
  - `--time <seconds>` sets the time limit for each sheet. The default is `optimizer.timeLimitMs`.
  - `--passes <n>` stops after pass n and ignores the time.
  - `--clear` removes the saved cuts, so the sheets go back to the automatic tree. With `--sheet`, it removes them
    from one sheet only.
  - It takes the usual output options, such as `--json`.
- **`optimize` does not change its job.** Its help says that it removes the saved cuts of each sheet that it changes,
  and it names `optimize-cuts`.
- **`layout show`** gives "cuts: optimized" or "cuts: automatic" for each sheet.

### 9.2 The docs

- `docs/format.md`: version 1.10, the field, the rebuild, and the check.
- `docs/cut-analysis.md`: when the saved tree replaces the automatic tree, and the objective of the thorough search.
- `docs/optimizer.md`: the difference between Optimize layout and Optimize cuts.
- `docs/cli.md` and `docs/web-app.md`: the new command and the new buttons.

## 10. Phase 2 outline: "Let parts slide"

- The option is off by default. It is a check box next to Optimize cuts, and `--slide` in the CLI.
- A part moves only in the free space of its own piece in the tree, and only along the axis of the split. It does not
  change the order of the parts, and it keeps one kerf from every other part. This is the rule of `pushToFactoryEdges`.
- The target is to put an edge of a part on the line of an edge of a next part, so that one cut releases both parts.
- Each new position is on the length grid.
- A slide changes the placements, so Optimize cuts with slides is a placement edit, and Undo optimize undoes it.

## 11. Tests

- **Core, the search:**
  - A sheet with a long cut in short cuts gets one cut. The test layout is the case that the user saw.
  - The result never has more cuts than the automatic tree, on the test projects.
  - Each pass gives a full tree that passes the check.
  - With `passes`, two runs give the same result.
  - `step(budgetMs)` returns a result and stops when the budget ends.
- **Core, the check.** The automatic tree of every test project passes the check. One test for each fail case: a new kerf, a new trim, a new part size, a moved part, a line
  through a part, lines that cross, and a line outside the sheet. Each test expects the automatic tree and the warning.
- **Core, the format.** A 1.9 file loads and saves with no change. A 1.10 file with the field loads, and a save keeps
  the field when the check passes and removes it when the check fails.
- **Core, the edits.** A move, a turn, an add, a remove, a move to the tray, and Push to factory edges each remove the
  field. A pinned sheet keeps it through Optimize layout.
- **Core, the units.** A change of units converts the lines, and the check still passes.
- **CLI.** One test for each option, with the output text and the JSON.
- **Web:**
  - A unit test for the hook state of the Optimize cuts run, with Stop.
  - An e2e test: Optimize cuts, then "Cuts optimized" shows and the cut count goes down. A move removes the label, and
    Undo optimize brings the label back.

## 12. Risks

- **Fewer cuts can mean more saw setups.** The objective does not count setups. The result notice shows the cut count
  and the cut length, so the user can compare and undo.
- **Search time.** The full search can be slow on a busy sheet. The passes and the time limit keep the app responsive,
  and Stop keeps the best tree so far.
- **The check runs on every analysis.** It is one rebuild and one walk of the tree for each sheet with saved cuts. This
  costs much less than the automatic tree, which `analyzeSheets` already builds.
