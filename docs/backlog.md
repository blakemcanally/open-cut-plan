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

**Request:** The optimizer and the cut plan put parts against the factory edges, mostly long parts. A factory edge on
a long part is straighter and looks better than a cut edge.

**Now:** "Factory edges" only sets the trim to 0. The usable area then includes the factory edge, and parts *may*
touch it. Nothing makes the optimizer *prefer* it.

**Possible approach:**

- Add a part option: "use a factory edge" (none, one long edge, or both long edges).
- Add a score for the parts with this option that are not against a factory edge. Fewer is better.
- Optional: a project setting that gives this option to every part longer than a set length.
- Show the factory edges of each part in the layout and on the labels.

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
