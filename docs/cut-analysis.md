# Cut analysis

`@opencutplan/core` derives everything below from a project document. Nothing here is stored in the file, except that
`withCuts(project)` can write the sequence into `plan.sheets[].cuts` for other readers (see
[`format.md`](format.md#plan)).

`analyzeProject(project)` computes all of it at once: issues, cut trees, steps, offcuts, the shopping list, and labels.

## Terms

- **Planning kerf**: the largest kerf among enabled tools, or 0 when the `kerf` feature is off.
- **Trim**: the stock's `trim`, else `settings.trim`, or 0 when the `trim` feature is off.
- **Rip**: a cut along the stock length (a line of constant `y`). **Crosscut**: a line of constant `x`.
- **Minimum offcut**: `settings.minOffcut`, else 12" × 6" or 300 × 150 mm. A size meets it in either orientation.

## Validator

`validatePlan(project)` returns issues `{ severity, code, message, refs }`. `refs` point at sheets, placements (by
index in the sheet's `placements`), part copies, stock, or cut steps. Issues never stop editing.

| Code | Severity | When |
|---|---|---|
| `bad-ref` | error | a sheet's stock or a placement's part does not exist |
| `bad-copy` | error | a placement's `copy` is not less than the part's quantity |
| `duplicate-placement` | error | the same part copy is placed twice |
| `wrong-material` | error | the part's material is not the stock's material |
| `grain` | error | grain matters (the `grain` feature is on, the material is grained, the part's grain is not `none`) and the part's grain dimension does not run along the stock length |
| `off-sheet` | error | the part extends past the stock, or into the trim |
| `overlap` | error | two parts overlap, or are closer than the planning kerf in both directions |
| `stock-exceeded` | error | more sheets of a stock are used than its `quantity` |
| `unplaced` | warning | one issue per part with copies on no sheet |
| `not-guillotine` | error | `cutOrder` on: one issue per group of parts that no order of through-cuts separates; parts that already have `off-sheet` or `overlap` are left out |
| `no-tool` | error | `cutOrder` on: no tool is enabled (one issue), or `toolLimits` on and no enabled tool can make a cut (one issue per cut) |
| `factory-edge` | warning | one issue per placed copy that asks for a factory edge and does not get one (see [Factory edges](#factory-edges)). The message says when the sheet has no factory edges: an owned offcut, or a trimmed sheet |
| `unknown-factory-edge` | warning | one issue per part whose `factoryEdge` this app does not know; the part uses the rule of the settings |

## Factory edges

A part asks for a factory edge on a long edge when its `factoryEdge` is `"long"`, or when it has no `factoryEdge` and
its long side is at least `settings.factoryEdge.minLength` (see [format.md](format.md#factory-edges-added-in-16)).

- A sheet has factory edges when its stock `kind` is `"sheet"` and its [trim](#terms) is 0. Then all four edges are
  factory edges. An owned offcut and a trimmed sheet have none.
- A copy gets its factory edge when one of its long edges lies on an edge of such a sheet, to within a small
  tolerance. The long edges are the edges along the long side of the part, also when the part is turned. A square part
  has four long edges.
- `factoryEdgeRequest(project, part)` gives the request of a part, `getsFactoryEdge` tells if a placed copy gets its
  factory edge, `factoryEdgeSides` gives the edges of a placed copy that lie on a factory edge, and
  `sheetFactoryEdgeMisses` counts the copies of a sheet that ask for a factory edge and do not get one.
- `factoryEdgeMarks` gives the long edges on a factory edge of a copy that asks for one. The Layout tab and
  `sheetSvg` draw a thick black line on each of these edges. `sideLine` gives the line of an edge.
- `pushToFactoryEdges(ctx, sheet)` moves pieces of the sheet so that more copies get their factory edge. It builds the
  cut tree of the sheet. At each split, the pieces with parts can change order: one piece goes against each end of the
  split, and the other pieces follow the first piece, one kerf apart. The waste moves to the gap that is left. It
  chooses the order with the most copies on a factory edge, and keeps a split as it is when no order is better. Parts
  do not turn. It gives null when no copy gains, when the sheet has no factory edges, or when the sheet has parts that
  no cut separates.
- `pushSheetToFactoryEdges(project, sheetId)` is the same push as an edit of the project. The Layout tab uses it for
  **Push to factory edges**, and the optimizer uses `pushToFactoryEdges` on its candidates (see
  [optimizer.md](optimizer.md#search)).

## Cut tree

Every sheet whose stock exists gets a guillotine cut tree. A sheet with no valid placements has a `waste` root and no
trims.

1. With trim on, four trim cuts come first: the two long edges, then the two short edges. Each kerf lies inside the
   trim, against the usable area. When the trim is narrower than the kerf, the trim strip has zero size.
2. Every other piece is cut recursively. A cut line must run across the whole piece without touching a part. The tree
   tries rips and crosscuts. In each direction, the cuts of one split are made at once, in ascending position. A
   cut's kerf sits against a part edge:
   - after the last part before a gap, and again before the next part when the gap is wider than one kerf;
   - before the first part when there is waste at the start, and after the last part when there is waste at the end.

   A gap between one and two kerfs wide gives a second cut that removes a sliver narrower than the blade. A split can
   also make only one cut at a gap. The waste of the gap then stays on the piece on the other side of the cut, and a
   deeper cut removes it. The waste at each end of the piece can also stay on the end piece. A split must divide the
   piece.
3. The tree chooses the split whose subtree (the split and all the cuts below it) has, in this order:
   1. the fewest stuck parts;
   2. the fewest cuts that no enabled tool can make (only with `toolLimits` on, see below);
   3. the least total cut length;
   4. the fewest cuts.

   When two subtrees are equal, the tree keeps the earlier split in this order: at the first stage rips before
   crosscuts, and at each deeper stage the other direction first; in each direction, a cut at each side of every gap
   first. For example, a 20" × 10" part in a corner of a 96" × 48" sheet gets a 48" crosscut and then a 20" rip
   (68" of cuts). Rips first would give a 96" rip and then a 10" crosscut (106").

   With `toolLimits` on, the tree is first built with no tool check. When an enabled tool can make every cut of that
   tree, the tree stays. Otherwise the tree is built again, and this time it counts the cuts that no enabled tool can
   make, with the piece and the stage that the cut has in the sequence. So a tree can be longer than the shortest
   tree when that is necessary to keep a cut in the limits of a tool, for example `maxStages` of a panel saw.
4. A piece is a part when it is exactly one part, waste when it has no parts, and stuck when no cut is possible.
   A part that lies wholly outside the usable area lands in a zero-size piece. That piece is stuck and is not cut
   again; the validator reports the part as `off-sheet`.

## Tools

Each cut gets the first enabled tool, in profile order, that can make it. With `toolLimits` off, that is the first
enabled tool.

| Tool | Can make the cut when |
|---|---|
| Table saw, rip | the piece fits `maxPiece` (either orientation), and the cut-off side or the remainder is at most `maxRip` wide; the side that fits goes against the fence, the cut-off side first. A zero-size cut-off side does not count, except on a trim cut |
| Table saw, crosscut | the piece fits `maxPiece`, and the cut is at most `maxCrosscut` long |
| Track saw, circular saw | the cut is at most `maxCut` long |
| Panel saw | the cut is at most `maxCut` long, and its stage is at most `maxStages` |

Trim cuts use the rip or crosscut rule for their direction.

A new project has a table saw (largest piece 96" × 24", widest rip 24", longest crosscut 24"; 2440 × 610, 610, and
610 mm) and then a track saw (longest cut 110", 2800 mm, for a 118" or 3000 mm rail). So the track saw breaks down
full sheets, and the table saw cuts the pieces that fit it.

A sheet can store a chosen tool for a cut (`toolChoices`). The step then uses that tool, even when the cut is over one
of its limits; `overLimit` names the limit, and the step text warns first. `recommended` is the tool that the rules
above pick, and `chosen` is true when a stored choice sets the tool. A choice of a tool that is turned off has no
effect.

For a rip or a crosscut, the setting is measured on a side with positive size. When the cut removes a sliver narrower
than the kerf, the cut-off side has zero size, so the remainder goes against the fence, stop, or mark. Trim text does
not show the setting, so a trim keeps the cut-off side.

## Sequence

`sequencePlan(project)` returns steps. Each step has the piece on the saw, the cut-off side (`released`) and the side
that continues (`remainder`), the parts on each side, the tool, the setting (the size of the side against the fence,
stop, or mark), and links: `requires` (the step that makes the piece), `releasedNext` and `remainderNext` (the next
step that cuts each side).

- `orderMode: "sheet"`: sheets in plan order; on each sheet the trims, then each piece's cuts, then its pieces in order.
- `orderMode: "setup"`: the same cuts, grouped by tool, cut kind, and displayed setting. The current setup continues
  while any of its cuts is ready (the step that makes its piece is done); then the first ready cut in sheet order starts
  the next setup.
- With `cutOrder` off there are no steps.

`describeStep(context, step)` gives the shop text in parts: a `title` and a `headline` that say what the cut does, a
`method` (the tool and the kind of cut, with its meaning), the piece to pick up (`pickUp`), numbered `actions`, and
one `results` item for each side of the cut. For example:

> **Step 5 · Cut 15 3/8" off the panel** — Table saw · rip: a cut along the length of the sheet
>
> Pick up the panel 59 1/2" × 59 1/2" from step 4.
> 1. Set the fence 15 3/8" from the blade. 2. Put a 59 1/2" edge of the panel against the fence. 3. Make the cut.
>
> Next (between the fence and the blade): 59 1/2" × 15 3/8" with B Top, for step 8. Next: 59 1/2" × 44" with
> B Bottom, A Top, A Shelf 1, for step 6.

A result is a `part` (finished), `next` (a later step cuts it), `offcut` (set it aside), or `waste`. The measured side
comes first and says where it is at the saw. Trims name the edge ("Trim 1/4" off the top edge"). A table saw rip sets
the fence; a table saw crosscut and a panel saw set the stop; a track saw, a circular saw, and a step with no tool
mark the cut. A step with no tool starts with a warning. `resultSentence(result)` gives one result as a sentence;
`body` joins the pick-up line, the actions, and the result sentences.

## Offcuts

`listOffcuts` lists the cut tree's waste pieces that meet the minimum offcut, unless the `offcuts` feature is off.
`saveOffcutsToStock(project, offcuts)` adds them as stock with `kind: "offcut"`, `quantity: 1`, `cost: 0`, `trim: 0`
(every edge is a cut edge), and the name "Offcut from <project>, sheet N". Saved sizes round down to 1/64" in inch
projects and to 0.1 mm in mm projects.

## Reports

- `shoppingList`: per material and stock, the sheets used, the count to buy (owned offcuts are not bought), unit and line
  cost, and the total. The total is null when the `cost` feature is off or a stock to buy has no price
  (`missingPrices` lists those). Utilization is part area over stock area, per sheet and per material.
- `totalCutLength(steps)`: the sum of the lengths of the cut lines of the steps, trims included. The CLI `show` and
  `report sequence` commands and the Reports tab of the web app give it next to the count of cut steps.
- `partLabels`: one label per part copy with its name, colour key (the group, or the design and its unit, for example
  "Hall KALLAX 2 of 3"), size, material, grain (`none` when grain does not
  constrain the part), sheet number, and the step that cuts it free. A stuck part has no such step. `analyzeProject`
  returns no labels when the `labels` feature is off.
- `sheetSvg`: a standalone SVG drawing of one sheet in project units, with the parts in their colours, grain
  stripes and arrows, the trim zone, and numbered cut lines in stage colours. Options pick the part colours, the
  `width` and `height` attributes, a step to draw stronger, and the steps to draw as done. With the option
  `cutColors: "tool"`, the cut lines and their numbers have the colours of `toolColors`, and the number of a cut with
  a warning has the fill `TOOL_WARNING_FILL`. The highlighted step and the steps that are done keep their colours.
  Under all the cut lines, a wider line in `CUT_HALO_COLOR` (white) runs along each cut, so that a cut shows on
  every part colour. `sheetSvgExtent` gives the
  area it draws: the sheet and a margin on every side, so the numbers on edge cuts are not clipped. All text is
  escaped, so the result is safe to put in a page.
- `partColors(project)` gives the colour of each part copy. Each unit of a design is one colour key, and each group of
  parts without a design is one key (see [format.md](format.md#colours-added-in-14)). `colorOf(part, copy)` gives the
  colour, `keyOf(part, copy)` gives the key with its label, and `legend` lists the keys in the order that they first
  occur. A chosen colour replaces the automatic colour of its key. The automatic colours come from `PART_PALETTE`
  (12 light colours with a contrast of 7 or more against black text). A part without a design or a group is
  `NO_GROUP_COLOR`. `designUnit(project, part, copy)` gives the unit of a design part copy.
- `setDesignColor(project, design, unit, color)` and `setGroupColor(project, group, color)` set a chosen colour, or
  make it automatic again with `null`. `detachDesign` keeps the colour of the first unit as the colour of the group.
- `stageColor` gives the colour of the cut lines of a stage.
- `toolColors(tools)` gives one colour from `TOOL_COLORS` to each enabled tool, in profile order. After the sixth
  tool, the colours start again. A tool keeps its colour while the plan changes. `legend` lists the enabled tools
  with their colours, and `colorOf(id)` gives the colour of one tool. `cutColor(step)` gives the colour of a cut. A
  cut with no tool, or over a limit of its tool (`toolWarning(step)`), has `TOOL_WARNING_COLOR` (red). The tool
  colours have a contrast of 4.5 or more against white, and none of them is red.
- `LABEL_LAYOUTS` has the label sheets: Avery 5160 (US Letter, 3 × 10), Avery L7160 (A4, 3 × 7), and a 4 × 2 in
  thermal label. `labelPages(labels, layout, start)` puts the labels on pages from a start position (1 is the top
  left, then along the row) and fills the rest of the last page with `null`.
