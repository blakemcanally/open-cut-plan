# Optimize cuts and manual cut edits — design spec

Status: draft for review. Date: 2026-10-09.

## 1. Summary

The cut tree of a sheet now comes from a fast search that runs for every candidate of the optimizer. That search
sometimes breaks one long cut into a number of short cuts, and the user cannot change the tree. This change lets the
user optimize and edit the cuts of a sheet after the layout is done, the same way they now edit the layout after
Optimize:

- **Optimize cuts** keeps every placement, runs a slow and thorough search of the cut tree on each sheet, and saves the
  best tree in the file. The current Optimize becomes **Optimize layout** and does the same job as now.
- **A Cuts mode** on the Layout tab lets the user extend, join, shorten, split, and remove cuts on the sheet, lock the
  cuts they like, and change the order of the cuts.

All of these write one new field, the saved cuts of a sheet. Every reader of the cut tree uses the saved cuts while
they are still correct for the sheet.

## 2. Goals and success criteria

1. The user can optimize the cuts of a layout and keep every part where it is.
2. The tree from Optimize cuts has the fewest cuts that the search finds, then the shortest total cut length. It never
   has more cuts than the tree that the sheet used before.
3. The user can change the cut tree of a sheet by hand, and every edit gives a valid guillotine tree.
4. The user can lock cuts, and Optimize cuts then keeps them.
5. The user can change the order of the cuts on a sheet.
6. Every reader of the cut tree (the validator, the sequence, the Cut tab, the Shop tab, the reports, and the SVG) uses
   the saved cuts while they are still correct for the sheet.
7. Saved cuts that are no longer correct are never used, also when an app of version 1.9 or earlier edited the file.
8. The user can see which sheets have saved cuts, and can go back to the automatic cuts.
9. The CLI can do every edit that the app can do.

Not goals: a change to the fast tree that Optimize layout uses to score candidates, a measure of saw setups, cuts that
are not guillotine cuts, and adding a cut through waste only.

## 3. Phases

Each phase gets its own implementation plan. The user can use each phase before the next one starts.

1. **Saved cuts and Optimize cuts.** The format 1.10, the check, the thorough search, the web app, the CLI, and the
   docs. Sections 4 to 9.
2. **The Cuts mode.** Extend, join, shorten, split, and remove, on the sheet and in the CLI. Section 10.
3. **Lock, then optimize the rest.** Section 11.
4. **Reorder the steps.** Section 12.
5. **Let parts slide.** An option for Optimize cuts, off by default. Section 13 gives the outline only. It gets its own
   design after Phase 4 is in use.

## 4. File format 1.10

`SUPPORTED_MINOR` becomes 10 and `FORMAT_VERSION` becomes `"1.10"`. A 1.9 file needs no migration. Phase 1 adds the
full format for all of the phases, so that the later phases need no new version. One optional field goes on each plan
sheet:

| Field | Meaning |
|---|---|
| `savedCuts` | A list of cut lines, in the order of the cuts on the sheet. Each line has `axis`, `at`, `from`, and `to`, the same fields as a tool choice, and an optional `locked` (`true` when Optimize cuts must keep the line). |

- The list has no `stage` and no `step`, because a reader finds them from the lines.
- The list does not include the trim cuts. The trim gives them, and they always come first.
- An empty list is the same as no field. A writer does not write an empty list.
- `cuts` stays derived data. A writer still writes it from the tree that it uses. Thus `cuts` agrees with `savedCuts`
  when the saved cuts pass the check.
- A writer of 1.9 or earlier keeps `savedCuts` unchanged, because it is an unknown field. It can change the
  placements and leave the old lines. The check in section 5 finds this.
- A line with a bad shape (a missing field, an `axis` that is not `"x"` or `"y"`, a value that is not a number, or a
  `locked` that is not a boolean) makes the file invalid, the same as a bad cut.
- `docs/format.md` and the JSON Schema in `schema/` describe version 1.10.

## 5. How a reader uses the saved cuts

### 5.1 The rebuild

A reader builds the tree from the lines. In the trimmed sheet, the lines that go fully across the sheet on one axis
make the first split. In each new piece, the same rule applies to the lines that are inside that piece. A line goes
fully across a piece when its `from` and `to` are the ends of the piece, in the same tolerance as `matchesChoice`.

### 5.2 The check of the tree

A reader uses the saved tree only when all of these are true:

1. Every line is in the trimmed sheet.
2. The rebuild uses every line, and no piece has lines that go fully across it on both axes.
3. No line, with its kerf, goes through a part.
4. Each piece with a part has one part only, and that piece is the size of the part, in the tolerance of
   `matchesChoice`.

The check finds the changes that come from outside the sheet: the kerf, the trim, a part size, and the stock. It also
finds a placement change that an older writer made.

The check does not look at the tools. A saved cut that no tool can make shows in the issue list, as it does now. When
the automatic tree of the sheet does not have that problem, the issue offers **Use automatic cuts**. A reader never
drops saved cuts because of a change to the tools.

### 5.3 The check of the order

The list order is the cut order of the sheet. The order fails the check when a cut comes before the cut that makes its
piece. When the tree passes and the order fails, the reader keeps the tree, uses the automatic order, and gives the
warning `saved-cut-order-stale`. Before Phase 4, the sequence uses the automatic order in every case, and Phase 4
adds this check and its warning.

### 5.4 When the check of the tree fails

- The reader uses the automatic tree.
- The reader gives the warning `saved-cuts-stale` for the sheet: "The saved cuts of sheet N no longer fit the layout.
  Run Optimize cuts again, or use the automatic cuts."
- On the next save, the writer removes the field, the same as it removes a tool choice that matches no cut.

### 5.5 The hook

`analyzeSheets` in `packages/core/src/plan/sheets.ts` builds the automatic tree as now. When the sheet has
`savedCuts` and the saved tree passes the check, it returns the saved tree in `tree`, and marks the sheet as having
saved cuts. The validator, the sequence, the Cut tab, the Shop tab, the reports, and the SVG then get the saved tree
with no other change. Tool choices match the saved cuts by line, as now.

The layout optimizer also scores a pinned sheet with its saved tree, because it uses `analyzeSheets`.

## 6. Edits to the layout

- The edit functions in `packages/core/src/edit` remove `savedCuts` from a sheet when they change the placements of
  that sheet: a move, a turn, an add, a remove, a move to the tray, and Push to factory edges.
- The edits must do this themselves, because one edit still passes the check: when a part goes off the sheet, its
  piece becomes waste, and the old cuts stay valid but are no longer the best.
- In the app, a notice tells the user: "The saved cuts of sheet N were removed, because a part moved." The notice has
  an **Undo** button.
- Optimize layout removes the field from every sheet that it changes. A pinned sheet keeps it.
- A change of units converts the lines, the same as it converts tool choices (`packages/core/src/edit/units.ts`).
- Other edits (kerf, trim, a part size, the stock, or the tools) do not remove the field. The check decides.

## 7. The thorough search (Phase 1)

### 7.1 The objective

The search compares trees in this order: stuck cuts, cuts without a tool, the cut count, and then the total cut length.
The trim cuts count the same in every tree, so they do not change the result. The setting `optimizer.goal` applies only
to Optimize layout.

### 7.2 The search

The search is the dynamic program of `buildCutTree`. It adds one kind of split: a split can join any range of next
runs into one piece, not only all of the runs. The search honours the tool limits in the same way as the automatic tree.

### 7.3 Passes

The full search can take more than 1 s on a busy sheet. Thus it runs in passes, so that a stop keeps a result:

- Pass p lets a split join up to 2^p next runs: 2, then 4, then 8, and so on.
- Each pass gives a full, valid tree. The search keeps the best tree so far.
- The search starts from the tree that the sheet uses now. It stops after the first pass in which no piece has more
  runs than the pass can join, or at the time limit.
- Each pass gets a new memo, because the result of a piece depends on the join limit. When the time of one slice
  ends during a pass, the pass keeps its memo and continues in the next slice.

### 7.4 The core API

- `createCutSearch(project, options)` returns an object with `step(budgetMs)` and `result()`, the same shape as
  `createSearch`. Each call of `step` runs until the budget ends or the search is done, and returns true when the
  search is done. `result()` gives, for each sheet, the best tree so far, the passes, and whether the sheet is done.
- `optimizeCuts(project, options)` runs the search on each sheet, or on one sheet. It returns the new project and, for
  each sheet, the cut count and the cut length before and after.
- The search compares its best tree with the tree that the sheet uses now: the saved tree when it passes the check,
  else the automatic tree. The sheet gets the new tree only when it has fewer cuts, no more stuck parts, and no more
  cuts that no tool can make. Otherwise the sheet keeps what it has. When the cut counts are equal, a shorter cut
  length is not enough to save a tree.
- Optimize cuts writes the lines in the sheet order of the sequence (`orderMode` `"sheet"`).
- A sheet with no parts, or with stuck parts, is not searched.
- `options` has `sheet`, `timeLimitMs` (for each sheet), and `passes` (stop after this pass and ignore the time).
- The search does not use random numbers. With `passes`, the result is the same on every computer.
- Before Phase 3, Optimize cuts leaves a sheet with a locked line unchanged.

## 8. The web app (Phase 1)

- **The Layout tab toolbar:**
  - Optimize becomes **Optimize layout**, with the same job and the same tooltip.
  - A new button, **Optimize cuts**, runs `optimizeCuts` on every sheet in the worker. It shows the same progress bar
    and **Stop**. The progress tells the sheet and the pass. **Stop** keeps the best tree found on each sheet so far.
  - **Undo optimize** also undoes Optimize cuts.
- **The sheet card:**
  - The header shows "saved cuts" when the sheet has saved cuts that pass the check, and "automatic cuts" when it has
    none.
  - The card has an **Optimize cuts** button for that sheet only.
  - The header has **Use automatic cuts** while the sheet has the field. It removes the field from that sheet.
- **The result.** After the run, a notice tells the change in the cut count and the cut length. When no sheet got
  fewer cuts, it says "These cuts are already the best found."
- **The warnings.** The warnings of sections 5.3 and 5.4 show in the issue list and on the sheet card.
- **The worker.** The worker protocol gets a second kind of run for Optimize cuts, with the same start, cancel,
  progress, and done messages. The time limit for each sheet is `optimizer.timeLimitMs`.

## 9. The CLI and the docs (Phase 1)

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
- **`layout show`** gives "cuts: saved" or "cuts: automatic" for each sheet.

### 9.2 The docs

- `docs/format.md`: version 1.10, the field, the rebuild, and the checks.
- `docs/cut-analysis.md`: when the saved tree replaces the automatic tree, and the objective of the thorough search.
- `docs/optimizer.md`: the difference between Optimize layout and Optimize cuts.
- `docs/cli.md` and `docs/web-app.md`: the new command and the new buttons.

Each later phase updates the same docs for its own edits.

## 10. Phase 2: the Cuts mode

### 10.1 The UI

- **The mode.** The Layout tab toolbar gets a toggle: **Parts** and **Cuts**. In the Cuts mode, the parts show pale
  and do not move, and a click selects a cut. Escape clears the selection.
- **The selected cut** shows thick, with a handle at each end. The inspector shows the cut number, the kind (rip or
  crosscut), the stage, the position, the extent, the length, the tool, and the buttons **Extend**, **Shorten**, and
  **Remove**. A button that has no valid result is off.
- **A drag of an end handle** shows the stops as green ticks, with the new length next to the handle. When you let go,
  the end snaps to the nearest stop. A drag to no stop changes nothing. A stop that makes a cut that no tool can make
  shows in amber, and the issue list tells why.
- **Join.** When the selected cut can join cuts on the same line, a chip "Join N cuts" shows next to it. A click
  extends the cut through all of them, as far as the stops allow.
- **After an edit**, the sheet header shows "saved cuts", and the inspector shows the new cut count of the sheet.
  Undo (Ctrl+Z) undoes the edit.
- **The tool choice UI** of a cut moves into the inspector, and the Shop tab keeps its own.

### 10.2 The edits in the core

- **One basic edit: extend.** The edit makes a cut longer, up to a stop. The perpendicular cuts that it now crosses
  split in two. Cuts on the same line join into one.
- **Shorten is extend on the other cut.** To shorten cut A at cut B, the edit extends B across A, and A splits there.
  Thus shorten and split are one edit.
- **Remove** is on only when the result passes the check, for example on a cut through waste.
- **Stops come from the check.** The edit tries each end point where a perpendicular cut or a sheet edge is, and keeps
  each end point where the new set of lines passes the check of section 5.2. The check is fast, so the app can run it
  during a drag.
- **The first edit** on a sheet with automatic cuts copies the automatic tree to `savedCuts`, in the order of the
  sequence. Then it applies the edit.
- **Tool choices stay with the cut.** An extended or joined cut keeps the tool choice of the selected cut. When that
  tool cannot make the new cut, the choice goes, and the cut gets the recommended tool.
- **Done ticks.** A changed cut loses its done tick in the Shop tab, because it is a new cut. The other ticks follow
  their cuts through `moveTicks`.
- The core functions are `cutStops(project, sheet, line, end)`, `extendCut`, `shortenCut`, and `removeCut`, in
  `packages/core/src/edit`.

### 10.3 The CLI

- `cuts show <file> --sheet <ref>` lists the cuts of the sheet and the stops of each cut.
- `cuts extend <file> --sheet <ref> --step <n> --end <from|to> --to <length|next|max>`.
- `cuts shorten` has the same shape, and `--to` is the position of the cut that goes across.
- `cuts remove <file> --sheet <ref> --step <n>`.
- A command that asks for a stop that does not exist fails with the code `no-stop`, and lists the stops.

## 11. Phase 3: lock, then optimize the rest

- **The UI.** A **Lock** toggle in the inspector, and the L key. A lock icon shows at the middle of a locked line.
  Extend, Shorten, and Remove are off for a locked cut. A stop that would split a locked cut is not a stop.
- **The search.** Optimize cuts keeps every locked line exactly: the same axis, position, and extent. The dynamic
  program skips each split that crosses a locked line, or that would make a locked line longer or shorter. Locked
  lines come from a valid tree, so a tree with all of them is always possible.
- **The save rule** of section 7.4 stays. The locked lines are in both trees that it compares.
- **Locks affect only Optimize cuts.** The automatic tree and Optimize layout do not use them. A part move removes the
  saved cuts with their locks, and the notice offers Undo.
- **The CLI.** `cuts lock` and `cuts unlock` take `--sheet <ref>` and `--step <n>`. `optimize-cuts` keeps the locks.
  `optimize-cuts --clear` removes the saved cuts with the locks.

## 12. Phase 4: reorder the steps

- **The data.** No new field. The order of `savedCuts` is the order of the cuts on the sheet.
- **The UI.** The inspector lists the steps of the sheet. You drag a step, or press Alt+Up and Alt+Down. A step can
  move only between the cut that makes its piece and the first cut inside that piece. The list shows the limits while
  you drag.
- **The first reorder** on a sheet with automatic cuts copies the tree, the same as any edit.
- **The sequence** uses the list order when `orderMode` is `"sheet"`. In `"setup"` mode, the sequence ignores the saved
  order, and the step list shows a note that the manual order applies only in `"sheet"` mode.
- **The Shop tab** shows the saved order. The done ticks follow their cuts through `moveTicks`.
- **The CLI.** `cuts move <file> --sheet <ref> --step <n> --before <m>` or `--after <m>`. A move past the limits fails
  with the code `order-limit`, and tells the limits.

## 13. Phase 5 outline: "Let parts slide"

- The option is off by default. It is a check box next to Optimize cuts, and `--slide` in the CLI.
- A part moves only in the free space of its own piece in the tree, and only along the axis of the split. It does not
  change the order of the parts, and it keeps one kerf from every other part. This is the rule of `pushToFactoryEdges`.
- The target is to put an edge of a part on the line of an edge of a next part, so that one cut releases both parts.
- Each new position is on the length grid.
- A slide changes the placements, so Optimize cuts with slides is a placement edit, and Undo optimize undoes it.

## 14. Tests

### 14.1 Phase 1

- **The search:**
  - A sheet with a long cut in short cuts gets one cut. The test layout is the case that the user saw.
  - The result never has more cuts than the tree that the sheet used before, on the test projects.
  - Each pass gives a full tree that passes the check.
  - With `passes`, two runs give the same result.
  - `step(budgetMs)` returns a result and stops when the budget ends.
- **The check.** The automatic tree of every test project passes the check. One test for each fail case: a new kerf,
  a new trim, a new part size, a moved part, a line through a part, lines that cross, and a line outside the sheet.
  Each test expects the automatic tree and the warning. A change to the tools keeps the saved cuts and gives the issue
  with **Use automatic cuts**.
- **The format.** A 1.9 file loads and saves with no change. A 1.10 file with the field loads, and a save keeps the
  field when the check passes and removes it when the check fails. A bad line makes the file invalid.
- **The layout edits.** A move, a turn, an add, a remove, a move to the tray, and Push to factory edges each remove the
  field. A pinned sheet keeps it through Optimize layout.
- **The units.** A change of units converts the lines, and the check still passes.
- **CLI.** One test for each option of `optimize-cuts`, with the output text and the JSON.
- **Web.** A component test for the Optimize cuts run, with Stop. A component test of the Layout tab: Optimize cuts,
  then "saved cuts" shows and the cut count goes down. A move removes the label and shows the notice, and Undo brings
  the label back.

### 14.2 Phase 2

- `cutStops` gives only stops whose result passes the check, on the test projects.
- Extend joins cuts on the same line, and splits the perpendicular cuts that it crosses.
- Shorten of A at B gives the same result as extend of B across A.
- Remove is off for a cut whose removal fails the check.
- The first edit copies the automatic tree, and the copy passes the check.
- Tool choices and done ticks follow the rules of section 10.2.
- CLI: one test for each command, including `no-stop`.
- e2e: in the Cuts mode, drag the end of cut 36 to the far stop, and the sheet has fewer cuts. Undo restores the old cuts.

### 14.3 Phase 3

- Optimize cuts keeps every locked line exactly, and still finds fewer cuts where the other lines allow it.
- A stop that would split a locked cut is not in `cutStops`.
- CLI: `cuts lock`, `cuts unlock`, and `optimize-cuts` with locks.

### 14.4 Phase 4

- A move inside the limits changes the sequence. A move past the limits is refused.
- An order that fails the check gives the automatic order and the warning.
- In `"setup"` mode the saved order has no effect.
- The done ticks follow their cuts after a move.
- CLI: `cuts move`, including `order-limit`.

## 15. Risks

- **Fewer cuts can mean more saw setups.** The objective does not count setups. The result notice shows the cut count
  and the cut length, so the user can compare and undo.
- **Search time.** The full search can be slow on a busy sheet. The passes and the time limit keep the app responsive,
  and Stop keeps the best tree so far.
- **The check runs on every analysis, and on each stop during a drag.** It is one rebuild and one walk of the tree.
  This costs much less than the automatic tree, which `analyzeSheets` already builds. If a drag is slow on a busy
  sheet, the app computes the stops once, when the drag starts.
- **A part move loses manual cut work.** The notice with Undo makes this safe, and it matches the order of the work:
  the layout first, then the cuts.
