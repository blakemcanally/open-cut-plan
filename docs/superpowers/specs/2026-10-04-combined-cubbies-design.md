# Combined cubbies for designs — design spec

Status: draft for review. Date: 2026-10-04.

Builds on: [`2026-09-29-cabinet-generator-design.md`](2026-09-29-cabinet-generator-design.md) and
[`2026-09-30-box-construction-design.md`](2026-09-30-box-construction-design.md). This spec adds to them. It does not
replace a section of them.

## 1. Summary

A user can combine adjacent cells of a design into one larger cell, as `colspan` and `rowspan` do in a table. Example:
in a KALLAX 4 × 2, the user combines the cells at column 1, row 1 and column 2, row 1 into one cell that is 688 mm
wide.

The outer box does not change. Inside the box, the app removes the shelf and divider pieces that are inside a combined
cell, and then joins the remaining pieces into boards with one simple rule (§5.3): **at a junction, the divider runs
through when it continues on both sides of the junction; otherwise the shelf runs through.** With no combined cells,
this rule gives the parts of today exactly.

The rule gives each combined cell one continuous shelf board above it and below it, and one continuous divider board
on each side. Section 5.4 shows that the rule never has a conflict for rectangles that do not overlap, and that no
board is longer than the box.

## 2. Goals and success criteria

**Goals**

1. The user can combine a rectangle of cells, and split it again, on the Design tab.
2. The outer box (the top, the bottom, and the two sides) never changes.
3. A shelf above or below a combined cell that spans columns is one board across the full span. A divider on the side of
   a combined cell that spans rows is one board along the full span.
4. The parts, the joints, the hardware, the assembly steps, the front view, and the checks follow the boards.
5. A design with no combined cells gives the same parts as today: the same ids, names, sizes, quantities, and order.

**Not goals**

- Cells that are not rectangles (an L-shaped cell).
- A choice of which member runs through at a junction. The rule decides it.
- Doors, drawers, or inserts for a combined cell.
- Automatic splits of a board that is too long for the stock (§5.8 shows that combined cells never make such a board).

**Success criteria**

- The KALLAX 4 × 2 with column 1, row 1 and column 2, row 1 combined gives the parts in §14.1.
- Every file in `examples/` and every design in the current tests gives the same parts as before.
- A property test with random grids and random combined cells finds no board that goes through a combined cell, no
  opening that is not closed on all four sides, and no board end that is not on another board or on the box.

## 3. Compatibility (format 1.7)

- `FORMAT_VERSION` becomes `"1.7"`, and `SUPPORTED_MINOR` becomes 7. The migration from 1.6 does nothing.
- A 1.6 reader loads a 1.7 file with the `newer-minor` warning. `designParts` returns null for a file from a newer minor
  version, so a 1.6 reader keeps the stored parts and does not make parts that ignore the combined cells. This is the
  reason for the new minor version.
- A file with no `combined` field, or with an empty `combined` array, gives the parts of today.

## 4. Data model

### 4.1 The field

A design gets the optional field `combined`: a list of cell spans.

| Field | Type | Notes |
|---|---|---|
| `column` | integer, 1 to 50 | the left column of the span, from the left |
| `row` | integer, 1 to 50 | the top row of the span, from the top |
| `columns` | integer, 1 to 50 | the number of columns in the span |
| `rows` | integer, 1 to 50 | the number of rows in the span |

```json
"designs": [{
  "id": "kallax", "name": "Hall KALLAX", "system": "kallax", "material": "ply18",
  "width":  { "openings": [335, 335, 335, 335] },
  "height": { "openings": [335, 335] },
  "depth": 390,
  "combined": [{ "column": 1, "row": 1, "columns": 2, "rows": 1 }]
}]
```

- The numbers are 1-based and anchor on the top-left cell, so they match the cell names in the app ("column 2,
  row 1") and the order of the axes (columns from the left, rows from the top).
- The list has at most 1250 items (50 × 50 / 2). The order of the list has no meaning. Writers keep the order that
  the user made.
- Each object keeps unknown fields, as all objects in the format do.

### 4.2 Validation

A design with a bad span gets the error `design-combined`, and makes no parts (as for the other design errors):

- The span is in the grid: `column + columns − 1` ≤ the number of columns, and `row + rows − 1` ≤ the number of rows.
- The span has 2 cells or more. A 1 × 1 span changes nothing, so it is an error and not a silent no-op.
- No two spans have a cell in common.

A span that covers the full grid is valid. It gives a box with no dividers and no shelves, the same as a 1 × 1 grid of
the same outside size. It is not useful, but it is not dangerous, and a refusal would give the user one more rule to
learn.

The schema gives the integer limits. The rules above need the grid, so they are in `designErrors`.

### 4.3 When the grid changes

The app adds and removes cells at the right end and at the bottom end of an axis (`withCells`). The spans anchor on
their top-left cell, so they keep their place. `fitCombined(design)` adapts the spans to the grid:

- A span that is fully in the grid does not change.
- A span that crosses the new right or bottom edge gets shorter, to the edge.
- A span that then has fewer than 2 cells, or that starts outside the grid, goes away.

The web form and `design set` apply `fitCombined` on every change, so a smaller grid never gives `design-combined`. A
file that a person changed by hand can still have a bad span, and gets the error. A larger grid does not make a span
larger. **Undo** brings back a span that went away.

### 4.4 Combine and split

Core gives pure helpers that the web app and the CLI share:

- `expandSelection(design, rect)`: makes a selected rectangle larger until it fully holds each span that it touches,
  as a spreadsheet does when a selection touches a merged cell.
- `combineCells(design, rect)`: removes the spans in the rectangle and adds one span for the rectangle. It refuses a
  rectangle of 1 cell.
- `splitCells(design, rect)`: removes the spans in the rectangle. With no spans left, the design has no `combined`
  field.

## 5. Board layout

This is the core of the feature.

### 5.1 Terms

Let *n* be the number of columns and *m* the number of rows. Columns and rows are 1-based in text, as in §4.

- A **column line** *j* (1 to *n* − 1) is the line between column *j* and column *j* + 1. The dividers are on column
  lines. The sides are on the outer lines.
- A **row line** *i* (1 to *m* − 1) is the line between row *i* and row *i* + 1. The shelves are on row lines. The top
  and the bottom are on the outer lines.
- A **divider segment** is the part of a column line *j* in one row *r*. A **shelf segment** is the part of a row line
  *i* in one column *c*.
- A **junction** is the point where row line *i* crosses column line *j*. It has four **arms**: the divider segment
  above it (row *i*), the divider segment below it (row *i* + 1), the shelf segment on its left (column *j*), and the
  shelf segment on its right (column *j* + 1).
- A **board** is one piece of material: a run of one or more segments on one line.

### 5.2 Which segments exist

A segment exists when the two cells on its two sides are not in the same combined cell. So a combined cell removes
every segment inside it, and keeps every segment on its edges. The top, the bottom, and the sides are not segments:
they always exist and do not change.

### 5.3 The junction rule

> At a junction, the divider runs through when the divider segments above and below the junction both exist.
> Otherwise, the shelf runs through.

The member that runs through is one board across the junction. The other member stops at it: its board ends there,
and its end butts into the face of the member that runs through.

So:

- **Divider boards** on a column line are the longest runs of divider segments that exist, with no gap. A divider board
  ends at the top, at the bottom, or at a shelf that runs over a missing divider segment.
- **Shelf boards** on a row line are the longest runs of shelf segments that exist, cut at each junction where the
  divider runs through. A shelf board ends at a side or at a divider.

Today, every junction has 4 arms, so every divider runs the full inside height and each shelf is one cell wide. The rule
keeps that, and only changes the junctions next to a combined cell.

### 5.4 Why the rule always works

**Lemma 1 (no corners, no dead ends).** At a junction, the arms that exist are 0, 2 in a straight line, 3, or all 4.

*Proof.* Assume that the arm below and the arm on the right are missing. Then one combined cell holds the two cells
below the junction (the arm below is between them), and one combined cell holds the two cells on the right of the
junction. The cell below and on the right is in both, so it is the same combined cell, because combined cells do not
overlap. A rectangle that holds the cell below-left and the cell above-right also holds the cell above-left, so all four
cells are in it, and all four arms are missing. The same argument works for each pair of a vertical arm and a
horizontal arm. So when a vertical arm and a horizontal arm are both missing, all four are missing. This removes the
corner (2 arms at a right angle) and the dead end (1 arm). ∎

**Consequences.**

1. A junction with 3 arms is a T. The rule makes the member with both arms run through, and the stem stops. There is no
   choice to make.
2. A junction with 4 arms is a +. The rule makes the divider run through, as today.
3. A junction with 2 arms in a line is not a joint. The member continues as one board.
4. Every board end butts into a member that runs through, or into the box. No board hangs free at one end.

**Lemma 2 (the requirements hold).** Let a combined cell span the columns *a* to *b* (*b* > *a*). At each junction
strictly inside its top edge or its bottom edge, the divider segment on the side of the combined cell is missing, so the
shelf runs through. So the shelf above the cell and the shelf below the cell are each one board across the full span.
The same argument on the columns gives one divider board along each side of a cell that spans rows. ∎

**Lemma 3 (no conflict).** A conflict is a junction where the shelf must run through (it is strictly inside the top or
bottom edge of a combined cell) and the divider must run through (it is strictly inside the left or right edge of
another combined cell). The first needs a missing vertical arm, and the second needs a missing horizontal arm. By
lemma 1, all four arms are then missing, so the junction is inside a combined cell and not on an edge. So a conflict
cannot occur. ∎

This is why the format allows only rectangles that do not overlap: they are the shapes for which the simple rule is
always correct. §14.4 shows a layout that looks like a conflict.

### 5.5 Board sizes

- A divider board from row *a* to row *b* is the sum of the row openings *a* to *b*, plus (*b* − *a*) × *t*. Its depth
  is the panel depth.
- A shelf board from column *a* to column *b* is the sum of the column openings *a* to *b*, plus (*b* − *a*) × *t*.
- In the front view, a board starts at the inside edge of its first cell and ends at the inside edge of its last cell.

### 5.6 Back compatibility

With no combined cells, every segment exists and every junction is a +. Each column line is one divider board of
H − 2*t*, and each row line has one shelf board for each column. The parts, their ids, names, sizes, quantities, and
order are those of today (§6). A test compares the new code with a copy of the current `buildDesignParts` for random
grids.

### 5.7 Rules that this spec does not use

- **The shelf runs through at a +.** This is the other natural rule. It changes every design of today, so it breaks
  goal 5.
- **The longer board runs through.** This makes fewer joints, but a small change far away can change a board, and
  its id, at the other end of the unit. It also needs a tie-break, and it gives no better structure: the box carries the
  load in both cases.
- **The user chooses at each junction.** This gives the user a decision with no clear answer, and a format field for
  each junction. A later version can add it, if a need comes up.

### 5.8 When one board is not possible

The rule always gives one board for each run (lemma 2 and lemma 3), so the question is only whether the stock is long
enough.

- A shelf board is at most the inside width (W − 2*t*), and a divider board is at most the inside height (H − 2*t*).
  The top and the bottom are W long, and the sides are H − 2*t* long. So a combined cell never makes a board longer
  than the boards of the box.
- When the stock is too short for a board, it is also too short for the top. The optimizer then reports the part as
  `too-large`, as it does today. Example: a KALLAX with 7 columns has a top of 2489 mm, which a 2440 mm sheet cannot
  hold, with or without combined cells.
- The app does not split a long board by itself. A split needs support under the joint, and under a long shelf there
  is only the combined opening.

## 6. Parts

Let *q* be the design quantity. The order of the parts is the order of this table.

| Part | Id | Name | Length | Quantity |
|---|---|---|---|---|
| Top | `<design>-top` | Top | W | *q* |
| Bottom | `<design>-bottom` | Bottom | W | *q* |
| Side | `<design>-side` | Side | H − 2*t* | 2 × *q* |
| Full divider | `<design>-divider` | Divider | H − 2*t* | the full-height divider boards × *q* |
| Short divider | `<design>-divider-rows-<a>`, or `<design>-divider-rows-<a>-<b>` | Divider, row *a*, or Divider, rows *a*–*b* | §5.5 | the divider boards from row *a* to row *b* × *q* |
| One-cell shelf | `<design>-shelf`, or `<design>-shelf-<k>` | Shelf, or Shelf *k* | the column opening | the one-column shelf boards with that opening × *q* |
| Long shelf | `<design>-shelf-cols-<a>-<b>` | Shelf, columns *a*–*b* | §5.5 | the shelf boards from column *a* to column *b* × *q* |
| Back | `<design>-back` | Back | H × W | *q* |

- The width of each part except the back is the panel depth, as today. Every part has `grain: "length"` and the
  `group` of the design name.
- **One-cell shelves keep the rules of today.** *k* comes from the column openings of the full grid, in the order of
  the first column that uses each opening, and `<design>-shelf` is used when the grid has one column opening. A group
  with no boards left (all its shelves are in combined cells) is not in the list, and the other groups keep their *k*.
  So a combined cell does not change the ids of the other shelves.
- **Short dividers and long shelves get ids from their place**, not from a count. Two boards with the same rows (or
  columns) have the same length, so they are one part with a quantity. A new combined cell in another place does not
  change their ids, so their copies stay on the sheets.
- Short dividers come in the order of *a*, then *b*. Long shelves come in the order of *a*, then *b*.
- A short divider and a long shelf can have the same size as another part. They stay separate parts, because the name
  tells the user where the board goes.
- The `–` in the names is an en dash. The ids use `-`.

## 7. Joints

The joints stay butt joints with pocket screws. Each board end that butts into another board gets
`pocketHolesPerEnd(D)` pocket holes, as today.

- A shelf board end butts into a side or a divider that runs through. Its holes are on the underside.
- A divider board end butts into the top, the bottom, or a shelf that runs through. Its holes are on one face.
- A divider that stands on a long shelf (a T with the stem above) screws down into the shelf. Its holes show in the cell
  above, on one face, as the holes of a divider at the top do today.

## 8. Structural checks

### 8.1 The outer box

The top, the bottom, and the sides do not change, so the stiffness of the box is the same as for a grid with fewer
cells and the same outside size. A property test checks that these four parts do not change when cells are combined.
There is no new check for the box.

### 8.2 Shelf span (`shelf-span`, changed)

Today the check uses the longest column opening. It now uses the longest **free span**: the longest length of the top or
of a shelf board between two supports.

- The supports of a board are its two ends, and each junction along it where a divider continues **below** it.
- A divider that stands **on** the board (the stem of a T is above) is not a support. It ties the board to the boards
  above it, and it puts their weight on the board.
- The bottom is not in the check: it stands on the floor, the legs, or the feet.
- The limit stays `SHELF_SPAN_RATIO` × *t* (45 × *t*, 810 mm for 18 mm stock).

With no combined cells, the free spans are the column openings, so the result and the message are the same as today.
With combined cells, the message names the board: `Design "Hall" has a shelf (Shelf, columns 1–3) that spans 1041 mm
with no divider under it. A shelf longer than 810 mm in this stock can sag.` For the top, it says "the top".

This check is the check for "a long shelf whose middle loses its divider support" (§14.5).

### 8.3 Dividers

- **A divider that hangs free** cannot occur: each board end butts into a member that runs through (§5.4, consequence 4).
- **A divider that stands on a span** puts a point load on the shelf. §8.2 does not count it as a support, so a long
  span with a divider on it gets `shelf-span`. A short span with a divider on it is a normal bookcase detail and gets no
  warning.
- **A very short divider**: a divider board is at least one row opening long, and a row opening is never less than the
  smallest cell that the user asked for. There is no new check. The `kallax-opening` check does not change, because a
  combined cell is larger than its cells.

### 8.4 Codes

| Code | Severity | Condition |
|---|---|---|
| `design-combined` | error | a span is not in the grid, has fewer than 2 cells, or overlaps another span (§4.2) |
| `shelf-span` | warning | changed: the longest free span of the top or a shelf board is more than 45 × *t* (§8.2) |

## 9. Hardware

- **Pocket screws.** The ends are 2 × (2 + the divider boards + the shelf boards). The count is ends ×
  `pocketHolesPerEnd(D)` × *q*, plus 10 %, rounded up, as today. With no combined cells, the divider boards are
  *n* − 1 and the shelf boards are *n* × (*m* − 1), as today.
- **Back screws.** The edges are the perimeter, each divider board, and each shelf board, each with its own length.
- The other lines do not change.

## 10. Assembly steps

With no combined cells, the steps and their text do not change. With combined cells, the steps keep their titles and
their order, and their text follows the boards:

1. **Drill the pocket holes.** The counts are the divider boards and the shelf boards.
2. **Mark the shelf positions.** Each upright (a side or a divider board) gets the marks of the shelves that butt into
   it, from its bottom end. Uprights with the same marks share one clause. Example: "Mark the underside of each shelf,
   from the bottom end of the panel: on the sides at 335 mm; on the divider on the right of column 2 and the divider on
   the right of column 3 at 335 mm."
3. **Mark the divider positions.** The top, the bottom, and each long shelf get the marks of the dividers that butt
   into them, from the left end.
4. **Cut spacers.** One pair for each different height of the opening under a shelf board. The opening under a shelf can
   be a combined cell.
5. **Assemble column *c* of *n*.** The steps still go from left to right. Each step puts the shelf boards that **start**
   in column *c*, then the divider boards on the right of column *c* (or the right side). A divider that stands on a
   shelf, or hangs from one, is screwed to that shelf in the same step. A column where no board starts and no divider
   is on the right gets no step.
6. **Fit the bottom and the top**, and the other steps, as today. The text says "the dividers that reach it", because
   some dividers stop at a shelf.

**Why the column order always works.** A shelf board that starts in column *c* has its left end on the panel on the
left of column *c*, which an earlier step put in place. Its right end is on a panel that this step or a later step puts
in place. A divider on the right of column *c* butts into the top, the bottom (both fitted last), or a shelf that runs
over it. That shelf started in column *c* or before, so it is in place. So each step only screws a board to a board that
is already there. This also holds for the layout in §14.4, where each board butts into the next one around the center
cell.

The prototype gives correct but plain text for step 5. Better text, with the part names on the boards, is a later task
(§16).

## 11. Front view

- `designPanels(geometry)` draws one panel for each board, with `data-panel` `top`, `bottom`, `side`, `divider`, or
  `shelf`, as today. A short divider is a `divider`. A long shelf is a `shelf`.
- A combined cell is one cell, with its opening size as the label (for example "688 mm × 335 mm"). The `Cell` type
  gets the optional fields `columns` and `rows` for a combined cell.
- With no combined cells, the panels and the cells, and their order, are those of today.

## 12. Web app (Design tab)

- A new fieldset **Cells** in the design form shows the grid of cells, to scale (the column and row openings set the
  sizes). A combined cell is one box that spans its cells.
- **Select cells.** A click selects one cell. Shift-click selects the rectangle from the first cell to this cell. A drag
  over the grid with the mouse does the same. The selection becomes larger to hold each combined cell that it touches
  (§4.4). The arrow keys move between the cells, and Shift with an arrow key makes the selection larger.
- **Combine** combines the selection. It is available when the selection has 2 cells or more and is not already one
  combined cell. **Split** splits each combined cell in the selection. It is available when the selection holds a
  combined cell.
- Each Combine or Split is one edit: one undo step, and the parts are made again. The front view, the checks, and the
  parts list change at once.
- A new section **Parts** under the front view lists the parts of the design (name, size, quantity), so the user sees
  the boards change with each edit.
- A change of the number of columns or rows applies `fitCombined` (§4.3).
- A locked design (a newer file or an unknown system) shows the grid but disables the buttons.

## 13. CLI (later phase)

- `design combine <file> <id> --cell <column>,<row> --to <column>,<row>`: combines the rectangle between the two cells.
  It uses `expandSelection` and `combineCells`.
- `design split <file> <id> --cell <column>,<row>`: splits the combined cell that holds the cell.
- `design get` and `design list` show `combined`. `design set` applies `fitCombined` when `--cols`, `--rows`, or the
  openings change. (The prototype does this part already, so `design set` cannot make a bad file.)
- `docs/cli.md` gets the commands and an agent recipe step.

## 14. Worked examples

All examples use KALLAX openings (335 mm), 18 mm stock, a depth of 390 mm, and no back. In the drawings, `=` is a
horizontal board (the top, the bottom, a shelf) and `|` is a vertical board (a side, a divider). At a junction, a `|`
that cuts a `=` line means the divider runs through and the shelves stop at it. A `=` that runs over a `|` means the
shelf runs through and the divider stops at it.

### 14.1 KALLAX 4 × 2, column 1, row 1 and column 2, row 1 combined

`"combined": [{ "column": 1, "row": 1, "columns": 2, "rows": 1 }]`. Outside 1430 × 724 mm.

```
+=======================================+   Top, 1430
|                   |         |         |
|  combined cell    |  (3,1)  |  (4,1)  |
|  688 × 335        |         |         |
|===================|=========|=========|   row line 1
|         |         |         |         |
|  (1,2)  |  (2,2)  |  (3,2)  |  (4,2)  |
|         |         |         |         |
+=======================================+   Bottom, 1430
```

- Column line 1 has no segment in row 1, so its board is row 2 only: "Divider, row 2", 335 mm. It stands on the
  bottom and holds up the long shelf at its middle.
- At row line 1, column line 1, the junction is a T with the stem below: the shelf runs through. At column lines 2 and
  3, the junctions are + junctions: the dividers run through.

| Id | Name | Length × width | Quantity |
|---|---|---|---|
| `kx-top` | Top | 1430 × 390 | 1 |
| `kx-bottom` | Bottom | 1430 × 390 | 1 |
| `kx-side` | Side | 688 × 390 | 2 |
| `kx-divider` | Divider | 688 × 390 | 2 |
| `kx-divider-rows-2` | Divider, row 2 | 335 × 390 | 1 |
| `kx-shelf` | Shelf | 335 × 390 | 2 |
| `kx-shelf-cols-1-2` | Shelf, columns 1–2 | 688 × 390 | 1 |

- Pocket screws: 8 boards, so 16 ends × 3 holes = 48 holes, and 53 screws (today: 18 ends, 54 holes, 60 screws).
- Shelf span: the top spans 688 mm from the left side to the divider on column line 2. The long shelf has the short
  divider under it, so its spans are 335 mm. 688 mm is less than 810 mm, so there is no warning.

### 14.2 KALLAX 4 × 4, a 2 × 2 block combined in the middle

`"combined": [{ "column": 2, "row": 2, "columns": 2, "rows": 2 }]`. Outside 1430 × 1430 mm.

```
+=======================================+
|         |         |         |         |
|  (1,1)  |  (2,1)  |  (3,1)  |  (4,1)  |
|         |         |         |         |
|=========|===================|=========|   row line 1
|         |                   |         |
|  (1,2)  |                   |  (4,2)  |
|         |                   |         |
|=========|   combined cell   |=========|   row line 2
|         |     688 × 688     |         |
|  (1,3)  |                   |  (4,3)  |
|         |                   |         |
|=========|===================|=========|   row line 3
|         |         |         |         |
|  (1,4)  |  (2,4)  |  (3,4)  |  (4,4)  |
|         |         |         |         |
+=======================================+
```

| Id | Name | Length | Quantity |
|---|---|---|---|
| `kx-top`, `kx-bottom` | Top, Bottom | 1430 | 1 each |
| `kx-side` | Side | 1394 | 2 |
| `kx-divider` | Divider | 1394 | 2 (column lines 1 and 3) |
| `kx-divider-rows-1` | Divider, row 1 | 335 | 1 |
| `kx-divider-rows-4` | Divider, row 4 | 335 | 1 |
| `kx-shelf` | Shelf | 335 | 6 |
| `kx-shelf-cols-2-3` | Shelf, columns 2–3 | 688 | 2 (row lines 1 and 3) |

- The dividers on column lines 1 and 3 run the full height. On row line 2, the shelf segment on the side of the
  combined cell is missing, so each junction is a T with the divider on both sides. The shelves in column 1 and column
  4 stop at the dividers.
- "Divider, row 1" stands on the long shelf on row line 1. That shelf has no divider under it, so its free span is
  688 mm. "Divider, row 4" holds up the long shelf on row line 3, so that shelf has spans of 335 mm.

### 14.3 KALLAX 3 × 4, three cells combined in a column

`"combined": [{ "column": 2, "row": 2, "columns": 1, "rows": 3 }]`. Outside 1077 × 1430 mm.

```
+=============================+
|         |         |         |
|  (1,1)  |  (2,1)  |  (3,1)  |
|         |         |         |
|=========|=========|=========|   row line 1
|         |         |         |
|  (1,2)  |         |  (3,2)  |
|         |         |         |
|=========|combined |=========|   row line 2
|         |  cell   |         |
|  (1,3)  |335×1041 |  (3,3)  |
|         |         |         |
|=========|         |=========|   row line 3
|         |         |         |
|  (1,4)  |         |  (3,4)  |
|         |         |         |
+=============================+
```

- Both dividers run the full height (1394 mm), as today: on row lines 2 and 3, the junctions are T junctions with the
  divider on both sides, so the shelves in columns 1 and 3 stop at them.
- The shelves of column 2 on row lines 2 and 3 go away. The parts are the parts of today with 7 shelves in place of 9.
- A combined cell that only spans rows never changes a divider. It only removes shelves.

### 14.4 KALLAX 3 × 3, a layout that looks like a conflict

Four combined cells turn around the center cell:

```json
"combined": [
  { "column": 1, "row": 1, "columns": 2, "rows": 1 },
  { "column": 3, "row": 1, "columns": 1, "rows": 2 },
  { "column": 2, "row": 3, "columns": 2, "rows": 1 },
  { "column": 1, "row": 2, "columns": 1, "rows": 2 }
]
```

```
+=============================+
|                   |         |
|        A          |         |
|                   |         |
|===================|    B    |   row line 1
|         |         |         |
|         |  (2,2)  |         |
|    D    |         |         |
|         |===================|   row line 2
|         |                   |
|         |        C          |
|         |                   |
+=============================+
```

Each combined cell needs a continuous board on its long inner edge: the shelf under A, the divider on the left of B,
the shelf over C, and the divider on the right of D. Each of these boards ends at a corner of the center cell, where the
next board needs to run through. So it looks as if the four boards fight for the four corners.

There is no conflict. Each corner of the center cell is a T (one arm is inside a combined cell), so the rule has no
choice to make: at each corner, the board with both arms runs through, and the other one stops. The result is a
pinwheel of four boards of 688 mm: "Shelf, columns 1–2", "Divider, rows 1–2", "Shelf, columns 2–3", and "Divider,
rows 2–3". Each board butts into the next one. Lemma 3 shows that a real conflict needs a junction with a missing
vertical arm and a missing horizontal arm, which rectangles that do not overlap cannot make.

The column order of §10 assembles it: column 1 puts "Shelf, columns 1–2" on the left side and "Divider, rows 2–3"
under it; column 2 puts "Shelf, columns 2–3" on that divider and "Divider, rows 1–2" on the right end of the first
shelf; column 3 puts the right side on.

### 14.5 KALLAX 4 × 2, three cells combined in the bottom row (a span warning)

`"combined": [{ "column": 1, "row": 2, "columns": 3, "rows": 1 }]`.

```
+=======================================+
|         |         |         |         |
|  (1,1)  |  (2,1)  |  (3,1)  |  (4,1)  |
|         |         |         |         |
|=============================|=========|   row line 1
|                             |         |
|        combined cell        |  (4,2)  |
|         1041 × 335          |         |
+=======================================+
```

- "Shelf, columns 1–3" is one board of 1041 mm. The dividers on column lines 1 and 2 stand on it ("Divider, row 1",
  335 mm, quantity 2). They are not supports (§8.2), so the free span is 1041 mm.
- 1041 mm is more than 810 mm, so the design gets `shelf-span`: `Design "…" has a shelf (Shelf, columns 1–3) that spans
  1041 mm with no divider under it. A shelf longer than 810 mm in this stock can sag.`
- With 2 cells combined in place of 3, the span is 688 mm and there is no warning.

## 15. Testing

- **Back compatibility.** A copy of the current `buildDesignParts` in the test file is the oracle. For random grids
  with no combined cells, and for every example, the new parts are equal to the oracle parts. `combined: []` gives the
  same parts as no field. The existing tests do not change, except for the format version.
- **Validation.** Each rule of §4.2, and `fitCombined` for a smaller grid, a larger grid, and a span that gets too small.
- **Combine and split.** `expandSelection` with a selection that touches a combined cell; `combineCells` that absorbs
  the spans inside it; `splitCells`.
- **Worked examples.** The parts of §14.1, §14.2, §14.3, §14.4, and §14.5, and the `shelf-span` result of §14.5.
- **Properties** (fast-check; random openings, thickness, and random spans that do not overlap):
  - every board has a positive length;
  - each board length is the sum of its openings plus the thicknesses between them (§5.5);
  - the panels and the cells fill the outside exactly, with no overlap, so no board goes through a combined cell;
  - each cell is closed on all four sides: the strip of thickness *t* along each edge is fully covered by panels;
  - each board end touches a panel that runs through, or the box;
  - the parts match the panels: each part has as many copies as there are boards of its kind and length;
  - the top, the bottom, and the sides do not change when cells are combined.
- **Hardware and assembly.** The counts for §14.1, and steps that only screw a board to a board that is already in
  place, for random layouts.
- **Web.** Select a cell, shift-click a second cell, **Combine**, see the new parts and the combined cell in the
  preview; **Split**; undo.

## 16. Delivery

1. **Core (prototype).** The format field and version, the validation and the helpers, the board layout, the parts, the
   front view, the checks, the hardware, and correct but plain assembly text. `design set` applies `fitCombined`.
2. **Web (prototype).** The Cells fieldset with Combine and Split, the Parts section, and an example file.
3. **CLI.** `design combine`, `design split`, and the docs (§13).
4. **Polish.** The assembly text with the board names, a highlight of the selected cells in the front view, labels on
   the boards in the front view, and an e2e test.

## 17. Open questions

- Should a span that crosses the edge after a smaller grid go away in place of getting shorter? This spec makes it
  shorter, because that keeps more of what the user did.
- Should the span check also look at the bottom of a unit on legs or on the wall rail, where the bottom does not stand
  on the floor? Today it does not, and this spec does not change that.
- The format version was 1.4 at first. Other work took 1.4, 1.5, and 1.6 first, so combined cells use 1.7.
