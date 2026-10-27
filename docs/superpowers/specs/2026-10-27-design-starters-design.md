# Starter designs — design spec

Status: draft for review. Date: 2026-10-27.

Builds on: [`2026-09-29-cabinet-generator-design.md`](2026-09-29-cabinet-generator-design.md),
[`2026-09-30-box-construction-design.md`](2026-09-30-box-construction-design.md), and
[`2026-10-04-combined-cubbies-design.md`](2026-10-04-combined-cubbies-design.md). This spec adds to them. It does not
replace a section of them.

## 1. Summary

Now, **Add design** always adds the same KALLAX 2 × 2 (`addDesign` in `apps/web/src/design/form.ts`). The user must
then change it into the unit that they want. A user who wants a bookcase or a TV bench gets no help, and does not see
what the tool can make.

This spec adds a **catalogue of starter designs**. **Add design** opens a dialog with a list of starters, for example a
cube shelf, a TV bench, a bookcase, and wall cubes. Each starter is a good base with IKEA proportions. A starter can
have one or two **quick choices**, for example the grid of a cube shelf. **Use this design** adds a normal design, and
the design editor of today opens. The user can then change all of it.

The catalogue is a base to build on. Later work adds new design features, such as doors, drawers, a base, and a top
that overhangs. Then new starters, such as a credenza and a crate that fits a KALLAX cell, go into the same catalogue.

## 2. Intent

The weak point of the tool is the lack of good designs. The editor lets a user change a design, but changing a design
from a KALLAX 2 × 2 into a good bookcase is difficult. A user wants inspiration: a set of tested designs to pick from,
and then make their own.

IKEA has good proportions and good unit sizes. The starters use IKEA sizes, so that they look right and, for the KALLAX
and EKET starters, IKEA inserts, boxes, legs, and rails fit.

## 3. Goals, non-goals, and success criteria

**Goals**

1. **Add design** opens a catalogue of starters, in groups, with a preview of each starter.
2. Each starter makes a design that the box model of today can make, with no new design feature.
3. A starter can have quick choices, when IKEA sells that unit in a range of sizes (§5.2).
4. **Use this design** adds a normal design. All the edits of today work on it.
5. The CLI has the same catalogue, so an AI agent can list and use the starters.
6. Each IKEA size has a source, as the presets in `packages/core/src/design/systems.ts` do now.

**Non-goals**

- Doors, drawers, a base or plinth, a top that overhangs, an open top, hand holes, and other new design features. The
  credenza and the crate need these, so they are not starters in this work.
- User-made starters, or "save this design as a starter".
- A change to the file format.
- A link from a design back to its starter. After **Use this design**, the starter has no more effect.
- Photos or 3D drawings. The preview uses the front-view drawing of today.

**Success criteria**

- Every starter, with every quick choice, makes a design with no errors and no warnings from the design checks, in a new
  `in` project and in a new `mm` project, with an 18 mm (3/4") box material and a 6 mm (1/4") back material.
- The sizes that IKEA fixes match the IKEA source of that starter, within the tolerance of today
  (`KALLAX_CLEARANCE_MM`, `EKET_TOLERANCE_MM`). For a KALLAX starter, that is the cell opening and the depth, not the
  outside size (§5.4). For an EKET starter and the bookcase, that is the outside size.
- A user can go from a new project to a cut plan for a 3 × 2 cube shelf with: **Add design**, a click in the grid, **Use
  this design**, and **Optimize**.
- `opencutplan design starters` lists every starter. `opencutplan design add --starter cube-shelf --cols 3 --rows 2`
  makes the same design as the web app.

## 3a. Compatibility, and the IKEA brands

The goal of the IKEA sizes is **compatibility**: IKEA inserts, boxes, legs, and rails fit the units that a user makes.
The starters must not infringe or diminish the IKEA brands or trademarks. This section applies to all the text of this
work: the dialog, the CLI output, the names, the docs, and the tests. It follows the wording of today, for example
"KALLAX-style" in `README.md`, `docs/web-app.md`, and the Design tab.

**Rules**

1. **Generic names.** A starter name never uses an IKEA product name. The names are "Cube shelf", "TV bench",
   "Media unit", "Bookcase", "Wall cubes", and "Nightstand". The design that a starter makes has the same generic name.
2. **IKEA names only to say what fits or what the sizes follow.** For example: "Fits KALLAX inserts and boxes",
   "KALLAX-style cells", "BILLY-style sizes", and "EKET legs". Never use an IKEA name as if it is a name of this app, a
   name of the user's unit, or a verb.
3. **IKEA names as IKEA writes them.** Use capitals (KALLAX, EKET, BILLY), with no change of spelling, no plural or
   possessive form, and no word play.
4. **No IKEA brand materials.** Use no IKEA logo, colours, fonts, photos, product drawings, or assembly instructions.
   The drawings of the starters are the front views that the app makes from the design.
5. **No comparison with IKEA.** The text makes no claim that a unit is better, stronger, or cheaper than an IKEA
   product, and no claim that IKEA supports or tests it.
6. **Only claims that the app checks.** "Fits" names only the Tier 1 items of the cabinet generator spec (§3 of that
   spec), and only when the design checks give no warning against them (§4.2).
7. **A notice.** The dialog shows one line of small text at the bottom of the list pane: "IKEA, KALLAX, EKET, and BILLY
   are trademarks of Inter IKEA Systems B.V. OpenCutPlan is not affiliated with or endorsed by IKEA." `design starters`
   in the CLI gives the same notice, in the text output and in a `notice` field of the `--json` result. `README.md` and
   `docs/web-app.md` get the same notice.
8. **The names of today.** `defaultDesignName` makes names such as "KALLAX 2x2" now, for `design add` without
   `--starter`. Change it to "KALLAX-style 2x2" and "EKET-style 2x2", so that a design name is never an IKEA product
   name. This changes the names of new designs only. Saved designs keep their names. The default id does not change:
   it stays "kallax-2x2" and "eket-2x2" (from `slugify` of the old name), so scripts and agents that use the ids keep
   working. The product owner chose this.

This section is a set of conventions for the text of the app. It is not a legal review.

## 4. The catalogue dialog

### 4.1 Layout

**Add design** on the Design tab opens a dialog, with the `Dialog` component of today. The dialog has two panes:

```
┌ Add a design ──────────────────────────────────────────────────────────┐
│ CUBE SHELVES          │  Cube shelf 3 × 2                              │
│ ▣ Cube shelf          │  KALLAX-style cells. Pick columns and rows.    │
│   1 × 1 to 6 × 6      │                                                │
│ LOW UNITS             │   ▦▦▦□□□                                       │
│ ▭ TV bench            │   ▦▦▦□□□      ┌────┬────┬────┐                 │
│   147 × 42 × 39 cm    │   □□□□□□      │    │    │    │                 │
│ BOOKCASES             │   □□□□□□      ├────┼────┼────┤                 │
│ ▯ Bookcase            │   □□□□□□      │    │    │    │                 │
│   80 × 202 × 28 cm    │   □□□□□□      └────┴────┴────┘                 │
│ …                     │    3 × 2                                       │
│ + Custom grid         │  Outside  112 × 77 × 39 cm                     │
│                       │  Fits     KALLAX inserts and boxes             │
│                       │  Sheets   About 2                              │
│                       │                         Cancel  [Use this design]│
└───────────────────────┴────────────────────────────────────────────────┘
```

- **The list** is the left pane, one third of the width. Group headings divide it (§5.1). Each row shows a small
  front-view drawing, the name, and the outside size, or the range of the quick choice (for example "1 × 1 to 6 × 6").
  The last row is **Custom grid** (§5.3).
- **The preview** is the right pane, two thirds of the width. It shows the name, a one-line note, the quick choices, a
  front-view drawing, a table of facts, and the buttons **Cancel** and **Use this design**.
- **The style is quiet.** The drawing uses light lines with a lot of white space around it. The text is small. The
  buttons are small and on the right. The preview must not look more important than the list.
- On a narrow screen, the panes stack: the list first, then the preview.

### 4.2 The preview

- **The drawing** is the front view of the design that **Use this design** would add, from `designElevationSvg`
  (`packages/core/src/reports/elevation.ts`), at a small size.
- **The facts** are:
  - **Outside:** the outside width × height × depth, in the units and the display precision of the project.
  - **Mount:** floor, legs, feet, or wall rail.
  - **Fits:** for a KALLAX starter, "KALLAX inserts and boxes"; for an EKET starter, "EKET legs, feet, and wall rail" as
    the mount allows. A starter on legs or feet adds "EKET legs" or "EKET feet", as the hardware list of today names
    them. Other starters have no **Fits** row. The row leaves out an item when the design checks give a warning that
    the item does not fit, for example `kallax-depth` with a thick back.
  - **Sheets:** the sheet estimate of `designSheetEstimate`, for the materials that **Use this design** would pick
    (§6.2).
  - **Warnings:** the warnings of the design checks for the design that **Use this design** would add, in small text
    under the facts. For example, a 12 mm material gives a `shelf-span` warning on the 80 cm bookcase. A starter with no
    warning shows no row.
- The outside size includes no legs or feet, as the outside size of a design does now.
- The preview follows the selected row. When the dialog opens, the first starter is selected.

### 4.3 The grid choice

The cube shelf, the TV bench, and the wall cubes use a grid choice. A grid size is always columns × rows, as in
`defaultDesignName`, so "2 × 4" is 2 columns and 4 rows. The grid works like "insert a table" in a word processor:

- The grid has the maximum columns and rows of the starter, for example 6 × 6.
- When the pointer moves over the grid, the cells from the top left to the pointer are marked, and a label shows the
  size, for example "3 × 2". The drawing and the facts follow the pointer.
- A click sets the size. When the pointer leaves the grid, the drawing and the facts go back to the size that is set.
- On a touch screen, a tap sets the size.
- The arrow keys move the size, and the grid has an accessible name and value, for example "Grid: 3 columns, 2 rows".
  `CellGrid.tsx` has the keyboard pattern of today.

A starter with only one row (the TV bench) shows a grid of one row.

### 4.4 Other quick choices

Other quick choices are a small set of buttons, for example **40 cm** and **80 cm** for the width of a bookcase. The
selected button has `aria-pressed`. The drawing and the facts follow the selected button.

## 5. The starters

### 5.1 The first set

All sizes come from IKEA. The app converts them into the units of the project, as `presetAxis` does now. The **source**
column is what the builder must check against ikea.com (§9). "Derived" means the size comes from arithmetic on listed
IKEA sizes, not from a listing.

| Group | Starter id | Name | System | Quick choices | Default | Mount | Back |
|---|---|---|---|---|---|---|---|
| Cube shelves | `cube-shelf` | Cube shelf | `kallax` | grid, 1 × 1 to 6 × 6 | 2 × 4 | floor | yes |
| Low units | `tv-bench` | TV bench | `kallax` | grid, 2 × 1 to 6 × 1; mount, legs or floor | 4 × 1, legs | legs | yes |
| Low units | `media-unit` | Media unit | `kallax` | none | 4 × 2, with the two top center cells combined | legs | yes |
| Bookcases | `bookcase` | Bookcase | `custom` | width, 40 or 80 cm; height, 106 or 202 cm | 80 × 202 | floor | yes |
| Wall units | `wall-cubes` | Wall cubes | `eket` | grid, 1 × 1 to 4 × 2 | 3 × 1 | wall rail | yes |
| Small units | `nightstand` | Nightstand | `eket` | height, 1 or 2 cells; mount, legs or feet | 1 × 2, legs | legs | yes |

Notes:

- **Cube shelf.** IKEA sells KALLAX up to 5 × 5. A 6 × 6 uses the same KALLAX cells, so the inserts still fit. The
  outside size of a 6 × 6 is derived.
- **Media unit.** The combined cell is the wide opening for a TV box or a speaker. It shows that a starter can use the
  combined cells of today. The example `examples/builders/kallax-4x2-combined-mm.ts` combines the cells at column 1,
  row 1 and column 2, row 1. The media unit combines column 2 and column 3 of row 1, so the wide cell is in the
  center.
- **Bookcase.** The sizes follow BILLY: 40 or 80 cm wide, 106 or 202 cm high, 28 cm deep. The grid uses the `outside`
  form of the axis (`{ outside, cells }`), with 1 column, and 3 rows for 106 cm or 6 rows for 202 cm. The system is
  `custom`, because BILLY is not a system of the app. The BILLY shelves can move; the starter shelves are fixed, because
  the box model has fixed shelves only. The 80 cm width must pass the shelf span check of today (`SHELF_SPAN_RATIO`).
- **Wall cubes.** The maximum of 4 × 2 is a guess. The builder must check which EKET sizes IKEA sells for the wall
  rail, and set the maximum from that (§9).
- **Nightstand.** An EKET 1 × 2 (35 × 70 × 35 cm) on legs, or on feet.
- **Legs on a KALLAX starter.** The `legs` mount of today uses EKET legs, which screw to a flat bottom panel with a
  bracket. A KALLAX box has a flat bottom panel, so the EKET legs fit the TV bench and the media unit. The hardware list
  and the assembly steps of today need no change. The builder checks that the design checks give no warning for
  `legs` on a `kallax` design; `mount-system` warns only for `wall-rail` now.

### 5.2 The rule for quick choices

A quick choice changes only a value that IKEA itself sells in a range: the number of KALLAX or EKET cells, a BILLY width
or height, or a mount that IKEA sells for that unit. All other changes happen in the editor, after **Use this design**.
Each starter has no more than two quick choices. A starter that does not have a range has no quick choice.

### 5.3 Custom grid

**Custom grid** is the last row of the list, after the groups. It has no quick choice. It makes a design with the system
`custom` and a grid of 2 × 2, with the KALLAX sizes as the start sizes. Its preview note says that the user sets every
size in the editor.

### 5.4 The design that a starter makes

- **The name** is the starter name and the grid, for example "Cube shelf 3 × 2", "TV bench 4 × 1", or "Bookcase 80 ×
  202". The id comes from the name, as now (`slugify` and `uniqueId`, with the `design-conflict` loop of `addDesign`).
- **The quantity** is 1.
- **The depth** is the IKEA depth of the starter.
- **The colours** are automatic.
- **The KALLAX sizes.** A KALLAX starter keeps the IKEA cell opening of 335 mm, as `presetAxis` does now, so the
  inserts and boxes fit. So its outside size comes from the opening and the thickness of the material, and it is not the
  IKEA outside size. For example, a 2 × 2 in 18 mm is 724 mm wide; the IKEA 2 × 2 is 77 cm wide. The list rows and the
  **Outside** fact show the outside size that the app computes for the material that **Use this design** would pick,
  not a fixed IKEA text. The list rows in §4.1 are examples only.

## 6. Code

### 6.1 Core

- A new module, `packages/core/src/design/starters.ts`, has the list of starters. Each starter has:
  - an id, a name, a group, and a one-line note;
  - its quick choices: for each choice, a key, a label, the allowed values, and the default value;
  - a function from the chosen values, the units, and the material ids to a `Design`;
  - the sources of its sizes, as `SystemValue` records do in `systems.ts`.
- The KALLAX and EKET starters use `presetAxis` and `presetDepth`, so their sizes stay the same as the sizes of
  `--system kallax` and `--system eket` today.
- Core exports the list, a lookup by id, and a function that makes the design of a starter.

### 6.2 Materials and stock

**Use this design** picks the materials and the stock the same way as `addDesign` does now: the first material that is
thick enough for pocket screws for the box, the first thin material for the back (or a new 1/4" or 6 mm plywood with
one sheet), and the suggested sheet for each material with no enabled stock.

Move this pick from `apps/web/src/design/form.ts` into core, so that the web app and `design add --starter` in the CLI
use the same code. Then a function in core adds the design of a starter to a project, with its materials and stock.
`addDesign` in the web app calls it, in place of the fixed KALLAX 2 × 2. The sheet estimate in the preview uses the same
function, on a copy of the project that the dialog does not save.

### 6.3 Web app

- A new `StarterDialog` component in `apps/web/src/design/`, with the layout of §4.
- **Add design** on the Design tab opens the dialog. **Use this design** adds the design, closes the dialog, and selects
  the new design in the editor. **Cancel** and Escape close the dialog with no change.
- Every place that calls `addDesign` today opens the dialog.
- The preview computes the estimate with `useDeferredValue`, as `SheetEstimate.tsx` does, so that a move over the grid
  does not wait for the estimate.

### 6.4 CLI

- `opencutplan design starters` lists the starters: the id, the name, the group, and the quick choices with their
  allowed values and defaults. It has a `--json` result, as the other commands do.
- `opencutplan design add --starter <id>` makes the design of the starter. The quick choices map to flags:
  - the grid uses `--cols` and `--rows`;
  - the mount uses `--mount`;
  - the bookcase width and height use `--size <width>x<height>`, with the IKEA sizes in cm, for example `--size 80x202`.
- A quick-choice flag with a value that the starter does not allow gives a usage error with the code `invalid-value`,
  and the message lists the allowed values. So does a quick-choice flag that the starter does not have, for example
  `--starter bookcase --cols 3` or `--starter cube-shelf --mount legs`.
- The flags that set the shape of the grid (`--system`, `--width`, `--height`, `--column-openings`, `--row-openings`)
  give a usage error with the code `conflict` when they come with `--starter`. To change the grid past the quick
  choices, use `design set` after `design add`.
- These flags of `design add` work with `--starter`, and change the design after the starter makes it: `--name`,
  `--id`, `--material`, `--back`, `--quantity`, `--depth`, and `--color`. The id comes from the name when `--id` is not
  given, as now.
- With `--starter`, the CLI picks the materials, the back, and the stock with the core function of §6.2, as the web app
  does. `--material` and `--back` replace the pick. `--back none` gives no back.
- `design add` without `--starter` works as now, with the same defaults as now.

### 6.5 Docs

- `docs/web-app.md`: the catalogue dialog.
- `docs/cli.md`: `design starters` and `--starter`, and the agent recipe starts with `design starters`.
- `README.md`: the **Designs** bullet names the catalogue of starters.

## 7. Tests

- Core: each starter, with each allowed value of each quick choice, in an `in` project and an `mm` project, with an
  18 mm (3/4") box material and a 6 mm (1/4") back, has no errors and no warnings. The sizes that IKEA fixes match the
  IKEA source within the tolerance (§3). The default values give the default design of §5.1. The pick of §6.2 gives
  the same materials and stock as `addDesign` does now, for the projects in the tests of `addDesign` today.
- Web: the dialog opens from **Add design**; a click in the grid changes the preview; the arrow keys change the grid;
  **Use this design** adds the design and selects it; **Cancel** adds nothing.
- CLI: `design starters --json`; `design add --starter` with each kind of choice; a value that is not allowed; a
  quick-choice flag that the starter does not have; a grid flag with `--starter`; a starter with `--name`,
  `--material`, and `--back none`; and the same design as the web app for the same project.
- Names: no starter name and no default design name is an IKEA product name alone. The dialog and `design starters`
  show the notice of §3a.

## 8. Calls made in this spec

These are the calls of the author of this spec, not of the product owner. Check them.

1. The starters live in core, so that the web app and the CLI share them (§6.1).
2. The file format does not change, and a design does not record its starter (§3).
3. The default of the cube shelf is 2 × 4, the best-known KALLAX size (§5.1).
4. The first set of starters, the groups, and the quick choices in §5.1, apart from the cube shelf grid of 1 × 1 to
   6 × 6, which is from the product owner.
5. The rule for quick choices in §5.2.
6. **Custom grid** in place of a "Start empty" row, with a 2 × 2 grid (§5.3).
7. The names of the designs (§5.4).
8. The CLI flags, in particular `--size` for the bookcase, and the `conflict` error for the grid flags (§6.4).
9. On a narrow screen, the panes stack (§4.1).
10. A KALLAX starter keeps the IKEA cell opening, so its outside size is not the IKEA outside size (§5.4).
11. The TV bench and the media unit stand on EKET legs (§5.1).
12. The pick of the materials moves into core, and `design add --starter` adds a back by default (§6.2, §6.4).
13. The preview shows the warnings of the design checks, and **Fits** leaves out an item that a warning says does not
    fit (§4.2).
14. The rules for the IKEA names, the text of the notice, and the change of `defaultDesignName` to "KALLAX-style 2x2"
    (§3a). The product owner asked for the intent: compatibility, with no harm to the IKEA brands.

## 9. Left to the builder

- Check every size of §5.1 against ikea.com, and record each source. Use the GB site, as `systems.ts` does. Correct a
  size in §5.1 that does not match, and say so in the pull request.
- Set the maximum grid of the wall cubes from the EKET sizes that IKEA sells for the wall rail.
- The exact one-line note of each starter, in the style of the app.
- The size of the small drawings in the list, and of the drawing in the preview.
- The internal shape of the starter records in `starters.ts`, as long as §6.1 holds.
