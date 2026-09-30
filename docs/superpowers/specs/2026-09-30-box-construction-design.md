# Box construction for designs — design spec

Status: draft for review. Date: 2026-09-30.

This spec replaces sections 5.1, 5.2 (the part table), 6.1, and 6.2 (the pocket screw count) of
`2026-09-29-cabinet-generator-design.md`. The rest of that spec stays.

## 1. Summary

**The new construction (a box):** the top and the bottom run the full width. The sides and the dividers fit between
the top and the bottom. The shelves fill the rest: each shelf fits between a side and a divider, or between two
dividers.

**The construction that this spec replaces (a ladder):** in the current code, every vertical panel runs the full
height, and the top, the bottom, and the shelves are pieces between two vertical panels. So a divider cuts the top
and the bottom into pieces.

## 2. Goals and success criteria

1. No edge of the box is in pieces: the top, the bottom, and each side are one part each.
2. Each divider is one part from the top to the bottom.
3. The outside sizes and the cell openings do not change, so KALLAX inserts and EKET sizes still fit.
4. The hardware list, the assembly steps, and the front view match the new parts.
5. The change applies to every system: `kallax`, `eket`, and `custom`.

Not goals: a choice between the ladder and the box, a migration of existing plans, and other joints than pocket screws.

## 3. Compatibility

- The file format does not change. Generated parts are derived data.
- A file made by the current app gets the new parts at its next edit, as for any design change. Copies of the old
  parts leave the sheets, and the user optimizes again. The project is at an early stage, so this spec does not keep
  old plans.
- Until that edit, the file shows the warning `design-stale`, as now.

## 4. The parts

Let *t* be the material thickness, *n* the number of columns, *m* the number of rows, W and H the outside width and
height, and D the panel depth (`depth` − the back thickness, or `depth` with no back). *q* is the design `quantity`.

| Part | Id | Name | Length × width | Quantity |
|---|---|---|---|---|
| Top | `<design>-top` | Top | W × D | *q* |
| Bottom | `<design>-bottom` | Bottom | W × D | *q* |
| Side | `<design>-side` | Side | (H − 2*t*) × D | 2 × *q* |
| Divider | `<design>-divider` | Divider | (H − 2*t*) × D | (*n* − 1) × *q* |
| Shelf | `<design>-shelf`, or `<design>-shelf-<k>` | Shelf, or Shelf *k* | column opening × D | (*m* − 1) × the columns with that opening × *q* |
| Back | `<design>-back` | Back | H × W | *q* |

- A design with 1 column has no divider part. A design with 1 row has no shelf part.
- Columns with the same opening share one shelf part. With one opening size, the id is `<design>-shelf`. With more
  than one, *k* is 1, 2, … in the order of the first column that uses each size, as now.
- The parts come in this order: top, bottom, side, divider, the shelves, back.
- Every part has `grain: "length"`, and the `group` is the design `name`, as now. The grain of a side and a divider
  runs up and down; the grain of the top, the bottom, and a shelf runs left to right.
- The ids `<design>-vertical` and `<design>-horizontal` go away.

Example: a KALLAX 2 × 3 (openings of 335 mm) in 18 mm stock, with no back and 390 mm deep, is 724 × 1077 mm. It gives
a top and a bottom of 724 mm, 2 sides and 1 divider of 1041 mm, and 4 shelves of 335 mm: 9 panels in place of 11.

## 5. Joints

All joints are butt joints with pocket screws. The jig drills the holes near the end of the piece that butts.

- Each side and each divider has pocket holes in both ends. The screws go into the top and the bottom. On a side, the
  holes are on the inside face. On a divider, they are on one face.
- Each shelf has pocket holes in both ends, on the underside, as now. The screws go into a side or a divider.
- The number of holes at each end is `pocketHolesPerEnd(D)`, as now.
- The only holes that show are on the inside faces of the sides, in the top and the bottom cells, and under the
  shelves. A KALLAX box or insert covers the holes in the sides.

## 6. Hardware

- **Pocket screws**: the ends are 2 × (2 + (*n* − 1)) for the sides and the dividers, plus 2 × *n* × (*m* − 1) for the
  shelves. The count is ends × `pocketHolesPerEnd(D)` × *q*, plus 10 %, rounded up, as now. For the example in
  section 4: 14 ends × 3 holes = 42 holes, so 47 screws (the ladder needs 53).
- **Back screws**: the rule does not change. The edges are the perimeter, each divider edge (H − 2*t* long), and each
  shelf edge (its column opening).
- The legs, the feet, the rails, the anti-tip fitting, the wall fixings, and the glue do not change. The legs and the
  feet go on the bottom panel, which is now one piece.

## 7. Assembly steps

`assemblySteps(project, designId)` gives these steps. A step marked "(skip …)" is not in the list for that case.

1. **Drill the pocket holes.** "Drill 3 pocket holes in each end of the 2 sides and the 1 divider, on the inside face
   of each side and on one face of the divider, and in each end of the 4 shelves, on the underside, for 18 mm stock."
   The jig setting sentence stays. The words for the dividers and the shelves leave out a part that the design does
   not have.
2. **Mark the shelf positions** (skip with 1 row). "Mark the underside of each shelf on the sides and the dividers at
   335 mm and 688 mm from the bottom end." The marks are the cumulative openings of the rows from the bottom, with a
   thickness between them: the lowest row opening, then that + *t* + the next opening, and so on, *m* − 1 marks.
3. **Mark the divider positions** (skip with 1 column). "Mark the left face of each divider on the top and the bottom
   at 353 mm from the left end." Divider *k* (1-based) is at *k*·*t* + the sum of the first *k* column openings.
4. **Cut spacers** (skip with 1 row). "Cut 2 spacers to 335 mm from an offcut. They hold each shelf on its mark
   while you drive the screws." There is one pair for each different opening of the rows under a shelf (every row
   but the top row).
5. **Assemble column *c* of *n*** (skip with 1 row), one step for each column, left to right. The first: "Lay the
   left side on its outside face, with the marks up." The next: "Use the divider on the right of column *c* − 1 as the
   left panel." Then: "Put the 2 shelves of this column (335 mm long) on their marks, with the pocket holes down, and
   screw them to the panel with 1 1/4" (32 mm) coarse-thread pocket screws. Then put the next divider (or the right side, for
   the last column) on the other ends of the shelves, and screw it on."
6. **Fit the bottom and the top.** "Lay the frame on its back. Put the bottom on the lower ends of the sides and the
   dividers, with each divider on its mark, and screw it on through the pocket holes in their ends. Then fit the top
   the same way." With 1 row, the sentence starts with "Stand the sides and the dividers on the bottom" in place of
   "Lay the frame on its back", because there is no frame yet.
7. **Check that it is square**, **Fit the back**, the mount step, and **Anchor the unit**, as now.

## 8. Front view

`designElevationSvg(project, designId)` draws:

- the top and the bottom across the full width, with `data-panel="top"` and `data-panel="bottom"`;
- the sides and the dividers between them, with `data-panel="side"` and `data-panel="divider"`;
- one shelf in each column at each boundary between two rows, with `data-panel="shelf"`.

The opening labels, the outside sizes, the depth, the colours, and the mount drawings do not change.

## 9. Checks

The design checks do not change. `shelf-span` uses the longest column opening: the dividers hold the top and the
bottom, so the longest free span is still one opening. `design-too-small` and `design-too-large` use the new parts.

## 10. Testing

- **Parts**: the ids, the names, the sizes, the counts, and the order for 1 × 1, 1 × 3, 3 × 1, 2 × 3, and columns with
  two different openings, with and without a back, and with *q* = 2.
- **Property test** (fast-check; random columns, rows, openings, and thickness): the front-view panels do not overlap;
  the panels and the cells together cover the outside rectangle exactly; and for each part except the back, the
  drawn panels of its kind match its size and its quantity for one unit.
- **Hardware**: the pocket screw count and the back screw count for the example in section 4, and for 1 × 1.
- **Assembly**: the step titles, the marks, and the counts for the example in section 4; the steps that are left out
  for 1 row and for 1 column.
- **Examples**: `npm run examples` makes `kallax-2x4-mm` and `eket-wall-in` again. The fingerprints of those two in the
  search test get their new values; the other two do not change.
- **CLI, web, and e2e**: the tests that name the old parts or steps use the new names.

## 11. Docs

- `docs/format.md` (the table of generated parts) and `docs/cli.md` (the design section) describe the box.
- The `design add` help text names the new parts.
- The cabinet generator spec gets a note at the top of section 5.1 that this spec replaces its construction.

## 12. Delivery

One implementation plan: the parts and the front view first (with the property test), then the hardware and the
assembly steps, then the examples, the CLI, the web tests, and the docs.
