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

## Cut tree

Every sheet whose stock exists gets a guillotine cut tree. A sheet with no valid placements has a `waste` root and no
trims.

1. With trim on, four trim cuts come first: the two long edges, then the two short edges. Each kerf lies inside the
   trim, against the usable area. When the trim is narrower than the kerf, the trim strip has zero size.
2. Every other piece is cut recursively. A cut line must run across the whole piece without touching a part. At the
   first stage the tree tries rips before crosscuts; each deeper stage tries the other direction first.
3. All cuts in one direction are made at once, in ascending position. A cut's kerf sits against a part edge:
   - after the last part before a gap, and again before the next part when the gap is wider than one kerf;
   - before the first part when there is waste at the start, and after the last part when there is waste at the end.
   A gap between one and two kerfs wide gives a second cut that removes a sliver narrower than the blade.
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

`describeStep(context, step)` gives the shop text, for example:

> **Step 5. Table saw, rip.** Piece: sheet 1, panel 59 1/2" × 59 1/2". Fence at 15 3/8". Fence side: B Top, next at
> step 8. Other side: B Bottom, A Top, A Shelf 1, next at step 6.

Trims say how much they remove ("Trim 1/4" off the edge."). Table saw crosscuts and panel saws say "Set the stop at";
track and circular saws say "Mark … from the edge". A step with no tool also says "Mark … from the edge".

## Offcuts

`listOffcuts` lists the cut tree's waste pieces that meet the minimum offcut, unless the `offcuts` feature is off.
`saveOffcutsToStock(project, offcuts)` adds them as stock with `kind: "offcut"`, `quantity: 1`, `cost: 0`, `trim: 0`
(every edge is a cut edge), and the name "Offcut from <project>, sheet N". Saved sizes round down to 1/64" in inch
projects and to 0.1 mm in mm projects.

## Reports

- `shoppingList`: per material and stock, the sheets used, the count to buy (owned offcuts are not bought), unit and line
  cost, and the total. The total is null when the `cost` feature is off or a stock to buy has no price
  (`missingPrices` lists those). Utilization is part area over stock area, per sheet and per material.
- `partLabels`: one label per part copy with its name, group, size, material, grain (`none` when grain does not
  constrain the part), sheet number, and the step that cuts it free. A stuck part has no such step. `analyzeProject`
  returns no labels when the `labels` feature is off.
- `sheetSvg`: a standalone SVG drawing of one sheet in project units, with the parts in their group colours, grain
  stripes and arrows, the trim zone, and numbered cut lines in stage colours. Options pick the group colours, the
  `width` and `height` attributes, a step to draw stronger, and the steps to draw as done. `sheetSvgExtent` gives the
  area it draws: the sheet and a margin on every side, so the numbers on edge cuts are not clipped. All text is
  escaped, so the result is safe to put in a page.
- `groupColors` and `stageColor` give the colours that the drawings use. A part without a group is `NO_GROUP_COLOR`.
- `LABEL_LAYOUTS` has the label sheets: Avery 5160 (US Letter, 3 × 10), Avery L7160 (A4, 3 × 7), and a 4 × 2 in
  thermal label. `labelPages(labels, layout, start)` puts the labels on pages from a start position (1 is the top
  left, then along the row) and fills the rest of the last page with `null`.
