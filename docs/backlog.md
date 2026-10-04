# Backlog

Requests from a review of the app on 2026-10-04. Each item has the request and what the code does now.

## 1. Keep parts from the same design on the same sheet

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

**Request:** When a design has a quantity of 2, the layout shows the parts of the two cabinets in different colours.
The user can choose the colour of each one.

**Now:** The colour comes from the part's `group`, and the group is the design name (`packages/core/src/design/parts.ts`).
A design with a quantity of 2 doubles the quantity of each part, so both cabinets have one group and one colour.
`groupColors` gives the colours from the palette in the order that the groups first occur
(`packages/core/src/reports/colors.ts`). The colour does not come from the name.

**Possible approach:**

- Give each copy of a design its own group, or a sub-group ("Calyx cabinet #1", "Calyx cabinet #2").
- Add an optional `color` to a design (and to a group of manual parts) in the file format.
- Add a colour picker in the Design tab and the Parts tab.
- This item also helps item 1: "keep the parts of cabinet #1 on one sheet".

## 4. A full catalogue of materials and stock

**Request:** The app has a large list of common materials and sheet sizes, from big box stores. Examples: Baltic birch
(5' × 5'), 3/4" plywood, 1/2" plywood, MDF, melamine, hardboard.

**Now:** A new project has no materials. The Design tab makes one 1/4" (6 mm) plywood when it needs a back panel
(`apps/web/src/design/form.ts`).

**Possible approach:**

- Make a catalogue file in the repo with each material: name, thickness (nominal and actual), grain, sheet sizes, and
  a typical price with the date of the price.
- Let the user add a material and its stock from the catalogue in the Stock tab.
- Collect the data from the websites of Home Depot and Lowe's one time, with a script, and check it by hand. Do not
  scrape at run time, because the pages change and the terms of the sites can forbid it.
- Give inch and mm versions.

## 5. Choose the cut that is shortest across waste

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

**Request:** The Settings tab has eight sections. It works, but it is hard to find a setting.

**Now:** The sections are Units and precision, Factory edges, Snapping, Plan, Optimizer, Money, View, and Features
(`apps/web/src/screens/SettingsTab.tsx`).

**Chosen approach:**

- A side list of the sections. A click on a section shows that section only.
- A search box above the list. A search shows the settings that match it, from all sections.

## Open

- **Tools in the layout and the cut plan:** something to improve here, not yet defined. The tool colours are good.
