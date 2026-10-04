# Backlog

Requests from a review of the app on 2026-10-04. Each item has the request and what the code does now.

## 1. Keep parts from the same design on the same sheet

**Status:** Done.

**Request:** The optimizer puts the parts of one design (for example, all parts of "Shelf 1") on one sheet when it can.
Now it mixes parts from all designs on all sheets.

**Now:** The optimizer has no measure for this. The objective compares unplaced copies, cost, the largest offcut, cut
steps, and sheets (`docs/optimizer.md`, Objective). The part orders sort by size only, so the parts of one group do
not stay together.

**Possible approach:**

- Add a score: the number of sheets that each group uses, summed over the groups. Fewer is better.
- Put this score after cost, so that it never makes the plan cost more.
- Add a part order that sorts by group first, then by size.
- Make it a setting, because some users want the least waste and do not care about groups.

**Chosen approach:**

- A group is a colour key from item 3: one unit of a design, or one group of parts without a design.
- The score has `groupSpread`: for each group, the sheets of the material that hold it minus 1, summed. The goal
  `cost` compares it after the cost. The goals `offcuts` and `cuts` compare it after the cost limit.
- File format 1.5 adds `settings.optimizer.keepGroupsTogether`. It is true when the file does not give it. When it is
  false, the optimizer gives the same plans as before.
- The search adds a part order with the groups together, moves of whole groups, and group affinity in the
  constructors. The result puts the sheets that share a group next to each other.
- The Settings tab has "Keep each unit and group together". The Layout tab and the CLI tell which units and groups
  are on more than one sheet.

## 2. Put parts against the factory edges

**Status:** Done.

**Request:** The optimizer and the cut plan put parts against the factory edges, mostly long parts. A factory edge on
a long part is straighter and looks better than a cut edge.

**Now:** "Factory edges" only sets the trim to 0. The usable area then includes the factory edge, and parts *may*
touch it. Nothing makes the optimizer *prefer* it.

**Possible approach:**

- Add a part option: "use a factory edge" (none, one long edge, or both long edges).
- Add a score for the parts with this option that are not against a factory edge. Fewer is better.
- Optional: a project setting that gives this option to every part longer than a set length.
- Show the factory edges of each part in the layout and on the labels.

**Chosen approach:**

- File format 1.6 adds `parts[].factoryEdge` (`"long"` or `"none"`, an open set of values) and the rule
  `settings.factoryEdge.minLength`. The choice of a part comes before the rule. A request for both long edges is
  left for a later version.
- A sheet has factory edges when it is sheet stock with no trim. Owned offcuts and trimmed sheets have none. The
  validator gives a `factory-edge` warning for each placed copy that does not get its factory edge.
- The score has `factoryEdgeMisses`. The goal `cost` compares it after the cost. The goals `offcuts` and `cuts`
  compare it after the cost limit. So it never makes a plan cost more or leave more copies unplaced.
- To mirror a sheet does not help: all four edges of a sheet are factory edges, or none are. In its place, the search
  pushes the pieces of the cut tree of each candidate against the edges of the sheet, and keeps the pushed copy when
  it is better. The random moves start from the best plan when the misses do not count, so a project with no
  requests gets the same plans as before.
- The Layout tab marks the factory edges of the parts that ask for one, and **Push to factory edges** does the same
  push on one sheet. The Parts tab, the Settings tab, the labels, the CLI, and the cut list show the request.

## 3. Give each copy of a design its own colour, and let the user choose colours

**Status:** Done.

**Request:** When a design has a quantity of 2, the layout shows the parts of the two cabinets in different colours.
The user can choose the colour of each one.

**Now:** The colour comes from the part's `group`, and the group is the design name (`packages/core/src/design/parts.ts`).
A design with a quantity of 2 doubles the quantity of each part, so both cabinets have one group and one colour.
`groupColors` gives the colours from the palette in the order that the groups first occur
(`packages/core/src/reports/colors.ts`). The colour does not come from the name.

**Possible approach:**

- Give each copy of a design its own group, or a sub-group ("KALLAX #1", "KALLAX #2").
- Add an optional `color` to a design (and to a group of manual parts) in the file format.
- Add a colour picker in the Design tab and the Parts tab.
- This item also helps item 1: "keep the parts of cabinet #1 on one sheet".

**Chosen approach:**

- Each unit of a design is one colour key, for example "KALLAX 2 of 2". Copy *c* of a part belongs to unit
  ⌊*c* / *count*⌋ + 1. Each group of parts without a design is one key. The `group` of the parts does not change.
- `partColors` in core gives the colour of each copy and a legend (`packages/core/src/reports/colors.ts`). The palette
  has 12 light colours. The first 8 are the old colours, so a file without designs of 2 or more units keeps its colours.
- File format 1.4: an optional `designs[].colors` (one `#rrggbb` for each unit) and an optional top-level `groups`
  (a `color` for each group). See [format.md](format.md#colours-added-in-14).
- A colour box and **Automatic** for each unit on the Design tab, and for each group on the Parts tab. A **Colours**
  list in the Layout tab. Labels show the unit.
- `design add` and `design set --color <unit>=<#rrggbb|auto>`, `parts group-color`, and `parts colors` in the CLI.

## 4. A full catalogue of materials and stock

**Status:** Done.

**Request:** The app has a large list of common materials and sheet sizes, from big box stores. Examples: Baltic birch
(5' × 5'), 3/4" plywood, 1/2" plywood, MDF, melamine, hardboard.

**Now:** A new project has no materials. The Design tab makes one 1/4" (6 mm) plywood when it needs a back panel
(`apps/web/src/design/form.ts`).

**Chosen approach:**

- A catalogue in core (`packages/core/src/catalog/`) with 33 materials and 64 sheet sizes. Each size has its listings:
  the store, the price or none, the page, and the date. See [catalog.md](catalog.md).
- **Add from catalogue…** in the Stock tab, and the catalogue materials in the Material and Back lists of the Design
  tab.
- `catalog list`, `materials add --catalog`, and `stock add --catalog` in the CLI.
- We collected the data one time and checked it by hand. The app does not read the store web sites.
- The file format does not change.

## 5. Choose the cut that is shortest across waste

**Status:** Done.

**Request:** The cut plan chooses the cuts with the least total cut length, and also the fewest cuts.

Example: one part on a sheet. The plan now makes a long rip along the full sheet, then a crosscut. A crosscut across the
short direction first, then a short rip, gives less total cut length.

**Now:** The cut tree tries rips before crosscuts at the first stage, and the other direction first at each deeper
stage (`docs/cut-analysis.md`, Cut tree). It takes the first direction that works. It does not compare the cut
length of the two directions. The optimizer score counts cut steps, not cut length.

**Possible approach:**

- At each piece, build the tree with each direction first, and keep the tree with the shorter total cut length. When
  the lengths are equal, keep the tree with fewer steps.
- Add the total cut length to the optimizer score, after cut steps.
- Show the total cut length in the reports.

## 6. Make the Settings tab easier to use

**Status:** Done.

**Request:** The Settings tab has eight sections. It works, but it is hard to find a setting.

**Now:** The sections are Units and precision, Factory edges, Snapping, Plan, Optimizer, Money, View, and Features
(`apps/web/src/screens/SettingsTab.tsx`).

**Chosen approach:**

- A side list of the sections. A click on a section shows that section only.
- A search box above the list. A search shows the settings that match it, from all sections.

## 7. Tools in the layout and the cut plan

**Status:** Done.

**Request:** "There was something on the layout and the cut plan that I wanted to optimize for tools. I like how it
shows in different colours for those things."

**Now:** On the Layout tab, the cut lines have stage colours only. The sheet header shows only the stock name, and
the name is cut off at three columns. The use of each sheet shows only on the Reports tab.

**Chosen approach:**

- The Layout drawing has a "Colour cuts by: stage / tool" choice, with the other view choices of the browser. The
  default is stage. With "tool", each cut line and its number have the colour of the tool. Each enabled tool has one
  colour, in profile order. A cut with no tool, or with a chosen tool over its limit, has a warning style. The stage
  colours do not change. A small legend shows the colours of the current choice. The Shop tab uses the same tool
  colours. In the core, the tool colours are next to `stageColor`, and `sheetSvg` can colour the cuts by tool.
- Under each sheet title, one short summary line, for example "Track saw 3 cuts · Table saw 9 cuts · 96% used ·
  $65". The sheet title wraps, so it is not cut off at three columns.
- A click (or Enter) on a cut number in the Layout drawing opens that step on the Shop tab.

# Proposed

Ideas from a walk through the app on 2026-10-04, with screenshots, and follow-ups from the work on items 1–7. None of
these items has started. Size: S is a day or less, M is a few days, L is a week or more.

## 8. Warn about plan problems on the Shop tab, the Reports tab, and in print

**Status:** Done.

**Size:** S–M. **Recommended.**

**Problem:** The Shop tab, the Reports tab, and the printed booklet do not read the plan issues. In the review, a part
dragged on top of another part gave an `overlap` error on the Layout tab. The Shop tab then showed 19 steps in place
of 21, with no warning, and the two parts had no cut step. A user can do every step at the saw and still be short of
parts.

**Idea:**

- A banner at the top of the Shop tab, the Reports tab, and the first page of the booklet, for example "2 parts have
  no cut step: Side 3, Door. Fix the layout first." A link opens the Layout tab with the Problems list.
- A count badge on the Layout tab when the plan has errors.

**Files:** `apps/web/src/shop/ShopTab.tsx`, `reports/ReportsTab.tsx`, `print/PrintView.tsx`, `print/booklet.ts`,
`screens/Workspace.tsx`, `layout/IssueList.tsx`.

**Chosen approach:**

- `planAlert` in the core reads the issues of `analyzeProject`. It names the placed parts that an error points at, and
  the parts with the `unplaced` warning. It counts the errors that name no part. The text is short, for example "The
  plan is not ready to cut. 2 parts have a layout error: Side 1 and Side 2. 1 part is not on a sheet: Shelf." A list
  of more than 5 parts ends with "and N more".
- The Shop tab and the Reports tab show the text in a banner. **Show the problems on the Layout tab** opens the Layout
  tab and puts the focus on the Problems heading. The banner only warns. **Mark done** and the other controls stay.
- The first page of the booklet starts with the same text, whichever section is first.
- The Layout tab has a red badge with the number of errors. The badge is hidden from screen readers, so the tab name
  stays "Layout". The tab has a description, for example "The plan has 1 error."
- The CLI reports `shopping`, `sequence`, `offcuts`, `labels`, and `cutlist` give the text as a warning.

## 9. Help the user set up a design so that the first optimize works

**Status:** Done.

**Size:** M. **Recommended.**

**Problem:** **Add design** makes the materials "Plywood 3/4"" and "Plywood 1/4"". It adds a 96" × 48" sheet for the
1/4" back only. After **Optimize**, all 13 parts in 3/4" plywood say "larger than every enabled stock". The real cause
is that the material has no stock.

**Idea:**

- A design adds a sheet stock for its main material too (now possible from the catalogue, item 4).
- A new reason for an unplaced part: "Plywood 3/4" has no stock", with an **Add stock** button.
- The Parts tab and the Stock tab show a line for each material that has no stock or no price.
- A new project opens on the Design tab. Each empty state links to the tab that fixes it.

**Files:** `apps/web/src/design/form.ts`, `packages/core/src/optimize/problem.ts`, `apps/web/src/layout/Tray.tsx`,
`screens/PartsTab.tsx`, `screens/StockTab.tsx`, `screens/Workspace.tsx`.

**Chosen approach:**

- `suggestedStock` in the core gives the sheet for a material: the largest size of the catalogue material with the
  same id or name, with the typical price in USD projects, or else a 96" × 48" (2440 × 1220 mm) sheet with no price.
- **Add design**, and a change of the material or the back material of a design, add the suggested sheet for each
  design material that has no enabled stock. `design add` and `design set` in the CLI do the same, and give
  `addedStock`. `stock add --suggested` adds the sheet for one material.
- The new unplaced reason `no-stock-for-material` is for a part whose material has no enabled stock. `too-large` is
  now only for a part that fits no enabled stock of its material. The tray shows the reason before a run, with
  **Add stock**. `optimize` in the CLI gives the command that adds the stock.
- The Parts tab and the Stock tab have a line with **Add stock** for each material that parts use and that has no
  enabled stock. The line for a material with no price is left for item 17.
- A new project opens on the Design tab. The empty states of the Layout, Parts, Shop, and Reports tabs link to the tab
  that fixes them.

## 10. Show the result of an optimize run, and undo it

**Status:** Done.

**Chosen approach:**

- After **Optimize**, **Optimize the rest**, or **Keep searching**, the banner has two lines, for example "Before: 4
  sheets, $260.00, 2 parts unplaced, 1344" of cuts." and "After: …". The line gives the cost, or the stock area when
  the cost is not known. The cut length shows when the `cutOrder` feature is on.
- **Undo optimize** is the undo step of the run. It shows while the project is still the one the run produced.
- A run that does not change the plan adds no undo step. For **Keep searching**, the banner says "Keep searching
  found no better plan, so the plan did not change." The CLI says the same for `optimize --continue`, and its
  `--json` output has `planChanged`.
- `planStats` moved from the CLI to the core, so the CLI and the app count the plan in the same way.

**Size:** S.

**Problem:** After a run, the Layout tab says "Tried 192,031 plans. The best uses 3 sheets." It does not give the cost
or a comparison with the plan before the run. The CLI prints "Before" and "After" with the cost.

**Idea:** Show "Before: 4 sheets, $260. After: 3 sheets, $195." with an **Undo optimize** button. When **Keep
searching** finds no better plan, say so.

**Files:** `apps/web/src/optimizer/useOptimizeRuns.ts`, `layout/LayoutTab.tsx`.

## 11. Draw overlaps and small parts clearly

**Status:** Done.

**Chosen approach:**

- Overlapping parts are see-through and have a red dashed outline on top. The area that they share has red hatching.
- The label of a part is the largest that fits: the name and the size, the name, or the size, from 12 px down to
  7 px. A tall narrow part has a turned label. A part that is too small has no label. Each part has a tooltip with
  its name and size.
- **Stop**, the progress bar, and the count of plans tried show at the end of the goal line, so the toolbar does not
  change while the optimizer runs.

**Size:** S.

**Problem:** A part on top of another part hides the lower part fully. The labels of small parts overlap each other.
The toolbar moves while the optimizer runs.

**Idea:** Draw overlapping parts with transparency and an outline, so the lower part stays visible. Make the label
smaller, or show the size only, when the part is small. Keep the toolbar height fixed.

**Files:** `apps/web/src/layout/SheetView.tsx`, `styles.css`.

## 12. Small fixes to the forms

**Status:** Done.

**Size:** S.

**Problem and idea:**

- **Add part** does not select the name "Part 6", so typing gives "Part 6Door". Select the name.
- Both default materials get the same beige colour. Give each new material its own colour.
- A stock row shows an id as its name, for example "plywood-1-4-96x48". Show a readable name.
- A bad value in a length field, for example "abc", gets a red border but no message. Show the message.
- "Size by" goes back to "Each opening" after a reload. Keep the choice.

**Files:** `apps/web/src/screens/PartsTab.tsx`, `screens/StockTab.tsx`, `components/fields.tsx`, `screens/DesignTab.tsx`.

**Chosen approach:**

- **Add part** puts the focus in the new name and selects it.
- A material with no chosen colour gets the colour of its place in the list, from `MATERIAL_PALETTE` (wood and board
  tones that are not part colours). The file does not change until the user chooses a colour.
- A stock with no name shows `stockLabel`, for example "Birch plywood 3/4" 96" × 48"", as its label and placeholder.
- A length or number field with a bad value shows a message under it, for example "Type a length, for example 24 1/2,
  2' 3", or 600 mm." The field names the message with `aria-describedby`.
- "Size by" comes from the axis in the file (`openings` or `outside` and `cells`), so a reload keeps it. The real loss
  was a new count of KALLAX or EKET cells, which always gave the IKEA axis. That count now keeps the choice.

## 13. Group the Shop steps by saw setting

**Status:** Done.

**Size:** M.

**Problem:** "Group cuts with the same saw setting" is in Settings → Plan, where users do not find it. When it is on,
the Shop list repeats "SHEET 1 · TABLE SAW" three times, and one 30" setup is split into steps 5–6 and 15–16.

**Idea:** A switch on the Shop tab: "Order: by sheet / by saw setting". Each group has a heading with the setup, for
example "Table saw · stop at 30" · 4 cuts". A note shows when the setup changes.

**Files:** `apps/web/src/shop/ShopTab.tsx`, `packages/core/src/sequence/sequence.ts`.

**Chosen approach:**

- **Order** on the Shop tab (**By sheet** / **By saw setting**) sets `settings.orderMode`. **Cut order** in Settings →
  Plan shows the same choice. A change keeps the ticks and the current step on their cuts.
- By saw setting, the list has a heading for each setup ("Table saw · fence at 15 3/8" · 4 cuts"), and each step
  shows its sheet. A note "New setup: …" shows on the current step when its setup is not the setup of the step
  before.
- The setup order starts the next setup with the first one that can finish in one run, so a setting is not split
  only because one of its cuts waits for another setting. A property test checks that the order keeps every cut after
  the cut that makes its piece. A setup can still split when two settings wait for each other (a rip, then a
  crosscut, then a rip again).
- `report sequence` gives the `setup` of each step, and groups the text by setup in the order by saw setting.

## 14. Make the tool limits realistic

**Status:** Done.

**Size:** M–L.

**Problem:** The table saw has one "Largest piece" limit for rips and crosscuts. So the plan can tell the user to
crosscut a 96" × 15 3/4" strip on the table saw with the stop at 30". The app has no miter saw.

**Idea:** Give the table saw separate limits for a rip and a crosscut. Add a miter saw type for short crosscuts on
narrow strips. Add help text and presets for common saws.

**Files:** `apps/web/src/screens/ToolsTab.tsx`, `packages/core/src/sequence/tools.ts`, `format/schema.ts`, `schema/`,
`docs/cut-analysis.md`. This item changes the file format.

**Chosen approach:**

- File format 1.8: a table saw has `maxCrosscutPiece`, the largest piece for a crosscut. When it is missing,
  `maxPiece` is the limit for a crosscut too, so older files mean the same thing. A new tool type `"miter-saw"` has
  `maxCut`, the widest piece that it can cut across. It makes crosscuts only, on a piece of any length. A reader of
  1.7 or earlier refuses a file with a mitre saw.
- A new project's table saw has a crosscut piece of 48" × 24" (1220 × 610 mm). So a 96" × 15 3/4" strip goes to the
  track saw or a mitre saw, not to the table saw with the stop at 30". The cut tree sees the new limits too.
- The Tools tab has help text for each type, the crosscut piece fields, and **Typical saw** presets: a 10" jobsite
  table saw, a cabinet saw with a crosscut sled, track saws with 55" and 118" rails, and a 12" sliding mitre saw.
  `tools add --preset` and `--type miter-saw` do the same in the CLI.

## 15. Put the Reports tab in three sections: Buy, Cut, and Build

**Size:** M.

**Problem:** The Reports tab is one long page (about 2000 px) with no structure. Buttons, SVG exports, and tables are
mixed. The Stock and Size columns repeat each other. The IKEA article column is empty for a custom design. The front
view caption says "Garage cabinet Garage cabinet as SVG". The app has no cut list, but the CLI has `report cutlist`.

**Idea:** A summary row at the top (sheets, cost, cut length). A **Buy** section (shopping list), a **Cut** section
(sheet use and a new cut list), and a **Build** section (hardware and assembly). One panel for print and export.
Remove the repeated column and the empty column.

**Files:** `apps/web/src/reports/ReportsTab.tsx`, `reports/ShoppingTables.tsx`, `reports/HardwareTable.tsx`,
`packages/core/src/reports/`.

## 16. Print the cut sequence for use at the saw

**Size:** M.

**Problem:** The printed cut sequence is a block of text under a drawing at 1:16 that is too small to read. The sheet
diagram uses only about 60% of the landscape page.

**Idea:** One sheet for each page, with a large drawing. Under it, a short table: a tick box, the step, the tool, the
setting, and the part. The diagram fills the page. The print can use the tool colours from item 7.

**Files:** `apps/web/src/print/PrintView.tsx`, `print/scale.ts`, `styles.css`.

## 17. Show the material status on the Stock tab

**Status:** Done.

**Size:** S.

**Problem:** The Stock tab does not tell which materials the parts use, or which stock has no price. The **Delete**
button is disabled for a material in use, with no reason.

**Idea:** A line for each material, for example "Used by 13 parts · 1 size · no price". A tooltip on the disabled
**Delete** button says why.

**Files:** `apps/web/src/screens/StockTab.tsx`.

**Chosen approach:**

- `materialStatus` and `materialStatusText` in the core give the line, for example "Used by 13 parts · 1 size · no
  price". It counts the part rows, the enabled stock, and the enabled sheets with no cost.
- The Materials table has a **Status** column. A material that parts use with no enabled stock says "no stock" and
  has **Add stock**. This takes the place of the item 9 line on the Stock tab. The Parts tab keeps that line.
- A material in use has a **Delete** button with `aria-disabled`, so it stays in the Tab order. A tip on hover and
  focus says why, for example "Parts and stock use this material. Change them first." The tip is the description of
  the button.
- `materials list` in the CLI gives the same `status` text.

## 18. Show the parts and a sheet estimate on the Design tab

**Status:** Done.

**Size:** S.

**Problem:** The user must go to the Parts tab and the Layout tab to see what a design needs.

**Idea:** Under the front view, an estimate, for example "About 2 sheets of Birch plywood 3/4"", with an **Optimize
now** button. (The combined cubbies prototype already adds a Parts list under the front view.)

**Files:** `apps/web/src/screens/DesignTab.tsx`, `packages/core/src/design/parts.ts`.

**Chosen approach:**

- `designSheetEstimate` (`packages/core/src/design/estimate.ts`) runs the optimizer for 8 iterations with seed 1 on
  the parts of the design alone, for each material of the design. It uses each enabled sheet stock of the material
  with no limit on the quantity, no offcuts, no pinned sheets, and the goal `cost` with no extra cost. A run takes
  about 5 to 50 ms for designs up to 5 × 5 cells × 10 units, and gave the same count as a run of 400 iterations.
- The **Sheets** section under the parts list says "About 2 sheets of Plywood (18 mm), 2440 mm × 1220 mm." and that
  it is an estimate. It follows the text in a field before the field commits it, through `useDeferredValue`, so that
  typing stays fast.
- **Optimize now** runs **Optimize** of the Layout tab and opens the Layout tab. It is disabled while the optimizer
  runs.
- A material with no sheet stock gets a warning. For a catalogue material, a button adds its largest sheet. For a
  material of its own, a button adds a 96" × 48" or 2440 mm × 1220 mm sheet, and a note points to the catalogue
  materials in the Material list. When the Material list adds a catalogue material with its sheet, the estimate
  shows at once.
- `design get` in the CLI gives the same `estimate`.

## 19. Make the app work on a phone

**Status:** Done.

**Size:** M.

**Problem:** At a width of 420 px, the tab bar hides Shop, Reports, and Settings with no hint. The tables hide
columns.

**Idea:** A hint or a **More** menu on the tab bar. Show the Parts and Stock tables as cards on narrow screens.

**Files:** `apps/web/src/screens/Workspace.tsx`, `screens/PartsTab.tsx`, `screens/StockTab.tsx`, `styles.css`.

**Chosen approach:**

- The tab bar scrolls sideways with a shadow at each end that has more tabs. The tab bar scrolls to show the chosen
  tab. The arrow keys still move between the tabs.
- Below 640 px, the Parts, Materials, and Stock tables show each row as a card, with the column name above each field.
- The header puts the project name on its own line, so the buttons fit in one line at 420 px.

## 20. Follow-ups from items 1–7

**Size:** S each.

- **Offcuts against cut length (item 5):** The shortest cuts can cut the waste into smaller pieces. On one sheet of
  `simple-bookcase-mm`, the largest offcut became about 23% smaller. Idea: when the optimizer goal is `offcuts`, the
  cut tree compares the largest offcut before the cut length. **Status:** Done. When `settings.optimizer.goal` is
  `offcuts`, each piece of the cut tree keeps the largest offcut that it can, and then the shortest cuts. The plan
  context holds the choice, so the validator, the sequence, the Shop tab, and the reports use the same tree. On
  `simple-bookcase-mm`, the largest offcut of the HDF sheet is 0.983 m² again (0.755 m² with the shortest cuts).
- **Tool colours (item 7):** The table saw is dark blue and the track saw is dark green. A cut can be hard to see on a
  part with a blue or green fill. Idea: give the cut lines a white outline, or choose tool colours far from the part
  colours. **Status:** Done. Each cut line has a white halo under it (`CUT_HALO_COLOR`), on the Layout tab and in
  `sheetSvg`, for both "stage" and "tool". The tool colours did not change.
- **Print and export (item 7):** The booklet and the "Sheet N as SVG" export colour the cuts by stage only. Idea: use
  the choice from the Layout tab.
- **Typical price (item 4):** The typical price is the lowest listing. Some low prices come from old search results.
  Idea: use the median, or the newest listing. **Status:** Done. The typical price is the median of the priced
  listings, because all the listings have the same check date. The catalogue shows the store and the date of the
  middle listing, or "median of N listings" when the count is even.
- **Speed with factory edges (item 2):** With requests, each candidate takes 2–3 times as long. Idea: push only the
  candidates that can become the best plan. **Status:** Done. The search pushes each different packing one time,
  and evaluates a pushed copy only when its best possible score can go into the result. The plans do not change.
  With requests, the iterations per second go up by about 1.3 to 2.3 times on the examples.
- **Group renames (item 3):** A chosen group colour does not follow a rename of the group. Idea: an edit helper that
  renames a group and moves its colour. **Status:** Done. `renameGroup` renames the group on all the parts that
  are not in a design, moves its entry in `groups`, and merges it when the new name is a group already. The Parts tab
  has a "Rename" action next to each group colour, and the CLI has `parts rename-group`.

## 21. Combined cubbies: the next phases

**Status:** Done.

**Size:** M.

The prototype (spec: `docs/superpowers/specs/2026-10-04-combined-cubbies-design.md`) covers the core, the parts, the
checks, the front view, and the Design tab. Next:

- `design combine` and `design split` in the CLI (task 11 of the plan).
- The rest of the UI work (task 12 of the plan) and an e2e test.
- A divider that stands on a shelf does not count as a support for the board above it. This gives more warnings than
  necessary. Decide the rule.
- Check the assembly text in a real build.
- The span check does not look at the bottom panel when the unit is on legs or on a wall rail.

**Chosen approach:**

- `design combine <file> <id> --cell <c>,<r> --to <c>,<r>` and `design split <file> <id> --cell <c>,<r>`, with the
  output of `design set`. A command that changes nothing is refused with exit 2, so that it does not write the file.
- A divider counts as a support when its load reaches a firm board: it holds up the board over it when the board
  under it is firm at that point, and the reverse. A board is firm where it stands on the floor, hangs on the rail, or
  spans 45 times the thickness or less. A back holds every divider. The warning names the board and gives its free
  span. Spec §8.2 gives the full rule and the reasons.
- The span check also looks at the bottom when the unit stands on legs or feet, or hangs on the wall rail, and at the
  top when the unit does not hang on the rail.
- The assembly steps join each short divider to the long shelf under it (or over it, when the divider stands on the
  bottom) first, flat on the bench. The column steps then name each board, for example "the shelf under row 1 (Shelf,
  columns 1–2)". A check in a real build is still to do.
- The front view gives each board its part name as a title, and a label on the boards that a combined cell makes. It
  marks the selected cells of the Cells grid in blue.
- `apps/web/e2e/plan.e2e.ts` combines two cells, checks the parts list and the front view, and optimizes from
  **Optimize now**.
