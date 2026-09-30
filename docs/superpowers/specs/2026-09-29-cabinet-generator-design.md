# Cabinet generator — design spec

Date: 2026-09-29
Status: draft for review
Builds on: [`2026-09-27-opencutplan-design.md`](2026-09-27-opencutplan-design.md). That spec lists parametric project
templates as a v1 non-goal. This spec adds them.

## 1. Summary

The cabinet generator turns a short description of a box unit into the parts of that unit. Example: "a KALLAX-style
unit, 2 columns, 4 rows, 18 mm plywood". The current optimizer, Shop checklist, and reports then use those parts with no
change. The generator also gives assembly steps, a hardware list, and a front-view drawing.

The first two systems follow IKEA KALLAX and EKET, so real IKEA inserts, storage boxes, legs, and wall rails fit the
units. Every unit uses butt joints and pocket screws only, so a track saw and a pocket-hole jig are the only tools a
user must buy.

## 2. Goals, users, success criteria

**Users.** People who want to build their own storage and own no shop. They buy a track saw and a pocket-hole jig.
Many of them use an AI agent that runs the `opencutplan` command for them.

**Goals**
1. A general box primitive: an outer box with a grid of cells inside it (§4).
2. System presets for KALLAX and EKET that fill in IKEA-compatible sizes, with a `custom` system that has no preset.
3. Tier 1 IKEA compatibility (§3): KALLAX inserts and storage boxes fit the cells; the EKET 350 mm grid, legs, feet,
   and suspension rail fit the units.
4. The easiest joinery: butt joints and pocket screws, with no dados, rabbets, or other cut joints.
5. Outputs: assembly steps, a hardware list, and a front-view drawing of each unit.
6. The CLI first, then the web app. An agent can go from nothing to a cut plan and assembly steps with CLI commands
   only.

**Non-goals**
- Tier 2 IKEA compatibility (§3): EKET doors and drawers, and any IKEA hardware that needs holes at exact positions.
- Doors and drawers that the user makes.
- Nested grids (a cell that holds its own grid). The format leaves room for them (§4.5).
- Other joinery layouts, such as a top and bottom that run through (§5.1).
- Dados, rabbets, face frames, and edge banding.
- Hardware prices, and IKEA article numbers for markets other than GB.
- Other IKEA systems, such as PAX and METOD.

**Success criteria**
- `opencutplan design add` with `--system kallax --cols 2 --rows 4` makes parts that optimize to a valid plan. Every
  cell is at least 332 mm in both directions, and the panel depth is at least 380 mm.
- `--system eket --cols 2 --rows 1` makes a unit that is 700 × 350 × 350 mm on the outside, for any material thickness
  from 11.9 mm (15/32") to 38.1 mm (1 1/2").
- A change to the material thickness resizes the parts of every design that uses the material, and keeps the placements
  of the parts that did not change size.
- An agent can follow the recipe in `docs/cli.md` from `new` to `report assembly` with no other help.
- A 1.0 reader can open a 1.1 file with designs, and it can optimize and cut the stored parts.

## 3. IKEA compatibility

IKEA publishes outside sizes, insert sizes, and box sizes. It does not publish panel thicknesses, cell openings, or hole
positions. Appendix A lists every number, with its source and whether it is listed or derived.

**Tier 1 (in scope).** The fit depends only on an opening or an outside size, or the hardware screws on with a bracket
that allows for a few millimetres of error.

| IKEA part | What must match | Value used |
|---|---|---|
| KALLAX inserts (door, 2 drawers, shelf) | cell opening, and depth | insert 330 × 330 mm, 370 mm deep; opening ≥ 332 mm |
| Storage boxes (DRÖNA and others) | cell opening, and depth | box 330 × 330 mm, 380 mm deep; panel depth ≥ 380 mm |
| EKET grid | outside size | 350 mm modules; depth 350 or 250 mm |
| EKET legs and feet | a flat bottom panel | screw-on brackets |
| EKET suspension rail | a top back edge, and the outside width | 35 cm and 70 cm rails, and 50 mm free above the unit |

KALLAX inserts fix to the cell with self-tapping screws through their own front strip, so the cell panels need no
holes.

**Tier 2 (out of scope).** An EKET door pivots on pins in sockets that press into the top and bottom panels. An EKET
drawer runs on runners that screw to the side panels. The positions of those holes are not public, and the doors are
not sold on their own. Tier 2 needs measurements from a real EKET cabinet.

**Derived numbers.** The KALLAX cell opening (335 mm) and depth (390 mm) come from arithmetic on the listed outside
sizes (Appendix A). Core keeps each derived number as a named constant with `derived: true`. The presets write these
numbers into the design, so the user sees them and can change them. `design systems` lists them.

## 4. Data model (format 1.1)

### 4.1 Version

- `FORMAT_VERSION` becomes `"1.1"`, and `SUPPORTED_MINOR` becomes 1.
- The migration from 1.0 to 1.1 does nothing: a 1.0 file is a valid 1.1 file.
- A 1.0 reader loads a 1.1 file with the current `newer-minor` warning, and keeps the unknown fields.

### 4.2 `designs`

A new optional top-level array. All lengths are in `project.units`.

| Field | Type | Notes |
|---|---|---|
| `id` | string | unique among designs; the prefix of the generated part ids |
| `name` | string | the `group` of the generated parts |
| `system` | string | `"kallax"`, `"eket"`, or `"custom"` (§4.4) |
| `material` | material ref | the material of the box |
| `quantity` | integer, optional | 1 to 100; default 1; the number of identical units |
| `width` | axis | the columns, left to right (§4.3) |
| `height` | axis | the rows, top to bottom (§4.3) |
| `depth` | number | the outside depth, including the back |
| `back` | object, optional | `{ "material": <ref> }`; no field means no back |
| `mount` | string, optional | `"floor"`, `"legs"`, `"feet"`, or `"wall-rail"`; default `"floor"` (§4.4) |

**Axis.** One of two forms:
- `{ "openings": [335, 335] }`: the size of each cell. From 1 to 50 values.
- `{ "outside": 700, "cells": 2 }`: the outside size, divided equally into cells. `cells` is from 1 to 50.

An axis stores what the user asked for. When the thickness changes, `openings` keeps the cell sizes, and `outside`
keeps the outside size.

### 4.3 Example

```json
"designs": [{
  "id": "kallax",
  "name": "Hall KALLAX",
  "system": "kallax",
  "material": "ply18",
  "width":  { "openings": [335, 335] },
  "height": { "openings": [335, 335, 335, 335] },
  "depth": 390
}, {
  "id": "eket",
  "name": "Wall EKET",
  "system": "eket",
  "material": "ply18",
  "quantity": 2,
  "width":  { "outside": 700, "cells": 2 },
  "height": { "outside": 350, "cells": 1 },
  "depth": 350,
  "back": { "material": "ply6" },
  "mount": "wall-rail"
}]
```

### 4.4 Open value sets

The original spec fixes some value sets within a major version (§4.5 of that spec). `system` and `mount` are **not**
fixed, so later minor versions can add systems, such as PAX, and mounts.

- An unknown `system` loads with the warning `design-unknown-system`. Regeneration skips the design and keeps its
  stored parts.
- An unknown `mount` loads with the warning `design-unknown-mount`. The parts generate as normal. The hardware list and
  the assembly steps leave the mount out.

### 4.5 Generated parts

- A generated part has the new optional field `design`: the id of its design.
- Generated parts are stored as normal parts, so any reader can optimize and cut them.
- A part whose `design` names a missing design gets the warning `design-missing`, and it behaves as a normal part.
- Nesting later: a later minor version can add an optional grid to a cell. This gives a full split tree with no
  migration.

## 5. Geometry and joinery

### 5.1 Joinery rule

> `2026-09-30-box-construction-design.md` replaces this construction, the part table in 5.2, the assembly steps in 6.1,
> and the pocket screw count in 6.2: the top and the bottom now run the full width, and the sides and the dividers fit
> between them.

Only butt joints with pocket screws. The jig drills the holes in the end of the piece that butts.

- Each side and each interior divider is one **vertical panel** that runs the full outside height. A unit with *n*
  columns has *n* + 1 identical vertical panels.
- The top, the bottom, and the shelves are **horizontal pieces**. Each one fits between two vertical panels, so each
  row line has one piece for each column.
- So every joint is a horizontal piece into a vertical panel, and **every pocket hole is on the underside** of a
  horizontal piece. The only visible holes are under the top row of cells.
- The top surface is in segments: the top edges of the dividers show between the top pieces. This is the cost of the
  rule.

### 5.2 Dimensions

Let *t* be the material thickness, *n* the number of columns, and *m* the number of rows.

- Opening from an `outside` axis: (outside − (*n* + 1)·*t*) / *n*. The height works the same way with *m*.
- Outside width: Σ column openings + (*n* + 1)·*t*. The height works the same way.
- Panel depth: `depth` − the back thickness, or `depth` when there is no back.

| Part | Id | Length × width | Quantity |
|---|---|---|---|
| Vertical panel | `<design>-vertical` | outside height × panel depth | (*n* + 1) × `quantity` |
| Horizontal piece | `<design>-horizontal`, or `<design>-horizontal-<k>` | column opening × panel depth | (*m* + 1) × columns of that opening × `quantity` |
| Back | `<design>-back` | outside height × outside width | `quantity` |

- Columns with the same opening share one horizontal part. With one opening size, the id is `<design>-horizontal`.
  With more than one, *k* is 1, 2, … in the order of the first column that uses each size.
- The part names are `Vertical panel`, `Shelf` (or `Shelf 1`, `Shelf 2`, …), and `Back`. The `group` is the design
  `name`, so the current colours and labels work.
- Every part has `grain: "length"`. The grain of a vertical panel runs up and down, and the grain of a horizontal piece
  runs left to right.
- The back overlays the rear edges. The user glues it and screws it on.
- `mount` changes no part. It adds only hardware and assembly steps.

### 5.3 Regeneration

`regenerateDesigns(project)` in core makes the parts of every design again.

- It replaces the parts whose `design` is that design, and it leaves all other parts alone.
- A placed copy stays on its sheet when its part keeps the same id, length, and width. The current `withoutPlacements`
  moves all other copies of generated parts to the tray. A lower quantity removes the extra copies, as `updatePart`
  does now.
- It gives the same result when it runs twice.
- The CLI calls it on every write. The web app calls it after every edit. This follows the current rule that the CLI
  makes the cut lists again on each write.
- A unit change converts the design lengths with all other lengths (`edit/units.ts`).
- `validate` gives the warning `design-stale` when the stored parts are not the parts that the design makes. This
  happens only after an edit by hand. The next write fixes it.

### 5.4 Edits to generated parts

- `parts set` and `parts remove` refuse a generated part with exit 1 and the code `generated-part`. `error.design`
  gives the design id.
- The web app shows generated parts as read-only rows.
- `design detach` removes the design and the `design` field of its parts. The parts then become normal parts.

### 5.5 Checks

The checks join the current issue list. They have `refs` to the design.

| Code | Severity | Condition |
|---|---|---|
| `design-too-small` | error | an `outside` axis gives an opening of 0 or less |
| `design-too-large` | error | a generated part needs a quantity over `MAX_PART_QUANTITY` (10,000) |
| `pocket-thickness` | error | the material is thinner than 11.9 mm (15/32", the actual size of 1/2" plywood), so a pocket-hole jig cannot drill it |
| `pocket-chart` | warning | the material is thicker than 38.1 mm (1 1/2"), so the screw chart has no length for it |
| `kallax-opening` | warning | `kallax` system, and a cell is less than 332 mm (the 330 mm insert plus 2 mm) in either direction |
| `kallax-depth` | warning | `kallax` system, and the panel depth is less than 380 mm |
| `eket-grid` | warning | `eket` system, and the outside width or height is not a multiple of 350 mm (±1 mm), or `depth` is not 250 or 350 mm |
| `shelf-span` | warning | a column opening is more than 45 × *t* (810 mm for 18 mm stock), so the shelf can sag |
| `mount-system` | warning | `wall-rail` on a system other than `eket` |
| `design-stale` | warning | the stored parts are not the parts that the design makes (§5.3) |
| `design-unknown-system`, `design-unknown-mount`, `design-missing` | warning | §4.4, §4.5 |
| `bad-ref` | error | the design `material` or `back.material` does not exist (the current code) |

Only `design-too-small`, `design-too-large`, `pocket-thickness`, and `bad-ref` are errors. A design with an error generates no parts. When a file loads with such a design, its stored parts stay as they are.

## 6. Outputs

All outputs are derived from the project and are never stored.

### 6.1 Assembly steps

`assemblySteps(project, designId)` returns one checklist for each design. When `quantity` is more than 1, the steps say
"Build 2 of these". They do not repeat.

1. **Drill.** "Drill 3 pocket holes in each end of all 10 shelves, on the underside. Set the jig and the collar for 18 mm
   (3/4") stock." The first hole is 50 mm from each edge, and there is at most 150 mm between holes:
   max(2, ⌈(panel depth − 100) / 150⌉ + 1).
2. **Mark.** "Mark the underside of each shelf on the vertical panels at 0, 353, 706, … mm from the bottom." The marks
   are the positions of the horizontal pieces, from the bottom end of the panel.
3. **Cut spacers.** "Cut 2 spacers to 335 mm from an offcut. They hold each shelf in place while you drive the screws."
   There is one pair for each different row opening.
4. **Assemble.** One step for each column, from left to right: screw the column's horizontal pieces to the vertical
   panel on the left, then put the next vertical panel on and screw it.
5. **Check square.** "Both diagonals must be 1,603 mm." (KALLAX 2×4 in 18 mm stock.) The value is √(outside width² + outside height²).
6. **Back** (with a back): glue and screw the back to the rear edges.
7. **Mount.** For `legs`, `feet`, or `wall-rail`: the IKEA article and the number of its assembly guide.
8. **Anchor** (with `floor`, `legs`, or `feet`): anchor the unit to the wall, as IKEA says to do for KALLAX and EKET.

Each step has a `title` and a `body`, in the same shape as the cut sequence steps.

### 6.2 Hardware list

`hardwareList(project)` returns lines of `{ name, article?, quantity, unit, design, source? }`. The shopping report gets
a `hardware` section, and it has no prices in v1.

- **Pocket screws**, coarse thread, from a chart in core:

  | Thickness | Jig setting | Screw |
  |---|---|---|
  | 11.9 mm (15/32") to < 17.5 mm (11/16") | 1/2" or 5/8" | 1" (25 mm) |
  | 17.5 mm to < 20.6 mm (13/16") | 3/4" | 1 1/4" (32 mm) |
  | 20.6 mm to < 30.2 mm (1 3/16") | 7/8", 1", or 1 1/8" | 1 1/2" (38 mm) |
  | 30.2 mm to < 36.5 mm (1 7/16") | 1 1/4" or 1 3/8" | 2" (50 mm) |
  | 36.5 mm to 38.1 mm (1 1/2") | 1 1/2" | 2 1/2" (64 mm) |

  The jig setting is the thickness rounded to the nearest 1/8". The screw for each setting is from the Kreg K4 and K5
  manual (`POCKET_SCREW_SOURCE` in `design/hardware.ts`), checked in phase 2. The count is the number of holes plus
  10 %, rounded up.
- **Back screws**: #6 × 3/4" (4 × 20 mm) flat head, for backs up to 7 mm thick. There is one screw every 150 mm, at
  most, along the perimeter and along each interior panel edge, starting 25 mm from the ends. A thicker back gets
  #8 × 1 1/4" (4 × 30 mm).
- **Wood glue**: one line, with no quantity.
- **IKEA items**, from a data table in core (`design/ikea.ts`). Each entry has the name, the GB article number, the
  source URL, and the date of the last check. The list always shows the name next to the article, because article
  numbers can be different in other countries.
  - `legs`: 1 EKET leg 4-pack for each unit. The table lists the three finishes.
  - `feet`: 1 EKET adjustable foot set for each unit.
  - `wall-rail`: EKET suspension rails that match the outside width: as many 70 cm rails as fit, then one 35 cm rail
    for a remaining 350 mm. Plus a line for wall screws and plugs, which IKEA does not include.
  - `floor`, `legs`, and `feet`: an anti-tip wall fixing, and wall screws and plugs.

### 6.3 Front-view drawing

`designElevationSvg(project, designId)` returns an SVG to scale.

- It shows the panels at their true thickness, each opening size, and the outside width, height, and depth.
- It shows the legs, the feet, or the rail when the design has them.
- It uses the design colours of the current sheet drawings (`reports/colors.ts`) and the display precision.

## 7. CLI

A new `design` group follows the current conventions (`docs/cli.md`): `--json`, `--dry-run`, `--strict`, `--out`, the
exit codes, and the length parser.

| Command | What it does |
|---|---|
| `design systems` | Lists `kallax`, `eket`, and `custom` with their defaults, sources, and `derived` flags. It needs no file. |
| `design list <file>` | Lists the designs with their outside size and part count. |
| `design get <file> <id>` | Shows one design, its parts, and its checks. |
| `design add <file>` | Adds a design and generates its parts. The result has `design.id`. |
| `design set <file> <id>` | Changes a design and generates its parts again. `changes` lists the parts that were added, removed, or resized, and the copies that went to the tray. |
| `design remove <file> <id>...` | Removes designs and their parts. |
| `design detach <file> <id>` | Keeps the parts as normal parts and removes the design. |
| `design drawing <file> <id>` | Writes the front-view SVG to `--out`, or to stdout. |
| `report assembly <file>` | Gives the assembly steps: `.designs[].steps[]`. `--design <id>` selects one. |

`report shopping` gets `.hardware[]`.

**Flags of `design add` and `design set`**

- `--system kallax|eket|custom`. The default for `add` is `custom`.
- `--cols <n>` and `--rows <n>`.
  - `kallax`: each cell gets the preset opening (335 mm), and the depth is 390 mm.
  - `eket`: each cell is one 350 mm module, so the axis is `{ outside: 350 × n, cells: n }`, and the depth is 350 mm.
    `--cols 2 --rows 2` is the 700 × 700 "4 compartments". `--cols 1 --rows 2` is the 350 × 700 "door and 1 shelf".
  - `custom`: `--cols` and `--rows` need `--width` and `--height`.
- `--width <length>` and `--height <length>`: the outside size. With `--cols` or `--rows`, the cells divide it equally.
- `--column-openings <list>` and `--row-openings <list>`: each opening, for example `335,400`. They replace `--cols` and
  `--rows` for that axis.
- Without `--name`, the name is the system and the grid, such as `KALLAX 2x4`, `EKET 2x1`, or `Custom 3x2`. The id
  comes from the name by the current rule, so `KALLAX 2x4` gets the id `kallax-2x4`.
- `--depth <length>`, `--material <id|name>`, `--back <material>|none`, `--mount floor|legs|feet|wall-rail`,
  `--quantity <n>`, `--name <text>`, and `--id <id>`.
- The preset numbers are in millimetres. The CLI converts them to the project units, so an inch project gets
  13 3/16" for 335 mm.

**Agent recipe** (added to `docs/cli.md`):

```bash
F=hall.cutplan.json
opencutplan new $F --name "Hall storage" --units mm --json
opencutplan tools add $F --type track-saw --max-cut 2800 --position 1 --json
opencutplan materials add $F --name "Birch ply 18" --thickness 18 --json
opencutplan stock add $F --length 2440 --width 1220 --cost 80 --json
opencutplan design add $F --system kallax --cols 2 --rows 4 --json
opencutplan optimize $F --iterations 200 --seed 1 --strict --json
opencutplan report assembly $F --json          # .designs[].steps[]
opencutplan report shopping $F --json          # .hardware[]
opencutplan design drawing $F kallax-2x4 --out hall.svg   # the id is in .design.id of design add
```

## 8. Web app

- **Design tab**, first in the workspace, before Parts.
  - A list of designs, with **Add design**.
  - A form: system, columns and rows, outside size or openings, depth, material, back, mount, quantity, and name. It
    uses the current `LengthInput` fields.
  - The front-view preview, which changes as the user types.
  - The checks of the design, in the style of the current issue list.
  - Each edit goes through `regenerateDesigns` and the current undo history.
  - A form value that gives an error, such as `design-too-small`, marks the field and does not change the project.
- **Parts tab**: generated parts are read-only rows, marked "From design: <name>", with a link to the design. A
  **Detach** button on the design does `design detach`.
- **Layout tab**: no change.
- **Shop tab**: the assembly checklist comes after the cut steps. Its ticks are saved in
  `extensions["opencutplan.app"].assemblyProgress` as `{ sequence, done }`, with the same fingerprint and reset rules
  as the cut checklist.
- **Reports tab**: the hardware section in the shopping list, **Print assembly steps**, and the front-view drawings.

## 9. Code layout

```
packages/core/src/
  format/schema.ts        DesignSchema, the axis union, Part.design, FORMAT_VERSION 1.1
  format/references.ts    design material refs, design-missing
  design/systems.ts       the presets and the derived constants, with sources
  design/geometry.ts      openings, outside size, and panel depth from a design
  design/generate.ts      design → parts; regenerateDesigns
  design/checks.ts        the checks in §5.5
  design/ikea.ts          the IKEA article table
  design/hardware.ts      hardwareList
  design/assembly.ts      assemblySteps
  reports/elevation.ts    designElevationSvg
packages/cli/src/commands/design.ts
apps/web/src/screens/DesignTab.tsx
examples/builders/kallax-2x4-mm.ts, eket-wall-in.ts
```

## 10. Error handling

- A design change that gives an error (§5.5) is refused. The CLI exits 1 with `invalid-value`, and `error.issues` lists
  the checks. The web form marks the field.
- A file with a bad design loads, with the issues. Its stored parts stay as they are.
- Warnings never block an edit.

## 11. Testing

- **Core geometry**: on each axis, the openings and the panels add up to the outside size. The part counts and sizes
  are correct for KALLAX 2×4, EKET 2×1, and a custom grid with mixed openings.
- **Core property tests** (fast-check, random grids, thicknesses, and backs):
  - `regenerateDesigns` twice gives the same result as once.
  - A placed copy stays when its part keeps the same id and size.
  - Every generated project, after optimize, has no error issues.
- **Core format**: a 1.1 file round-trips. A 1.0 file loads with no change. Unknown `system` and `mount` values load
  with warnings. The JSON Schema in `schema/` is current.
- **Assembly and hardware**: fixed designs give the expected hole counts, screw lengths, marks, diagonals, and rail
  combinations.
- **CLI**: each command, its exit codes, and its `--json` fields, in the style of the current CLI tests. The agent recipe
  runs end to end.
- **Web**: component tests for the Design tab and for the read-only rows in the Parts tab. One Playwright test goes from
  a new design through optimize to the assembly checklist.
- **Examples**: `kallax-2x4-mm` (KALLAX 2×4, track saw, millimetres) and `eket-wall-in` (EKET 2×1 on the wall rail, in
  inches). Both are in `examples/` and in the web app's example list.

## 12. Delivery phases

Each phase gets its own implementation plan, written after the previous phase lands. Each phase ends with working,
tested software.

1. **Core model and generator**: format 1.1, `designs`, `Part.design`, the geometry, generation, regeneration, the
   checks, the unit conversion, the schema, and the examples.
2. **Outputs and the CLI**: the assembly steps, the IKEA table, the hardware list, the drawing, the `design` commands,
   `report assembly`, the `hardware` section of `report shopping`, and `docs/cli.md` and `docs/format.md`.
3. **Web app**: the Design tab, the Parts rows, the Shop checklist, the Reports additions, `docs/web-app.md`, and the
   Playwright test.

## Appendix A. IKEA numbers

Researched on 2026-09-29 from IKEA GB listings and assembly PDFs. **L** = an IKEA listing. **P** = an IKEA assembly
PDF. **D** = derived by arithmetic. **3P** = a third party.

### A.1 KALLAX

| Item | Value (mm) | Source |
|---|---|---|
| 1x1 outside | 415 × 390 × 407 (W × D × H) | L, article 20301554 |
| 2x2 outside | 765 × 390 × 765 | L, [20275814](https://www.ikea.com/gb/en/p/kallax-shelving-unit-white-20275814/) |
| 2x4 outside | 765 × 390 × 1465 | L, 80275887 |
| 4x4 outside | 1470 × 390 × 1465 | L, 30275861 |
| 5x5 outside | 1820 × 390 × 1820 | L, 70301537 |
| Width step for each column | 350 | D: 765 − 415, 1115 − 765, 1465 − 1115 |
| Cell opening | about 335 | D: *c* + *t*ᵢ = 350 and 2*t*ₒ − *t*ᵢ = 65; *t*ᵢ = 15 gives *c* = 335, *t*ₒ = 40. The listings round to 5 mm, so this is uncertain by a few mm. |
| Door and 2-drawer inserts | 330 × 370 × 330 | L, [80653317](https://www.ikea.com/gb/en/p/kallax-insert-with-door-white-80653317/), [40653319](https://www.ikea.com/gb/en/p/kallax-insert-with-2-drawers-white-40653319/) |
| Shelf inserts | 330 × 360 × 330 | L, 20423720, 40423719 (verify the 360) |
| Insert fixing | self-tapping screws through the insert's front strip into the cell panel | P, AA-1009339-8, AA-1009361-5 |
| DRÖNA box | 330 × 380 × 330 | L, [10625714](https://www.ikea.com/gb/en/p/droena-box-black-off-white-10625714/): "min. 38 cm deep" |
| KUGGIS, BRANÄS, LABBSAL | 320 × 320 × 320, 320 × 340 × 320, 320 × 340 × 320 | L |
| Prior art | opening 336.55 (13 1/4"), 3/4" ply, pocket screws | 3P, [kallax-configurator](https://github.com/adamvosburgh/kallax-configurator) (MIT) |

### A.2 EKET

| Item | Value (mm) | Source |
|---|---|---|
| Cabinet sizes | 350 × 350 × 350, 350 × 250 × 350, 700 × 350 × 350, 350 × 350 × 700, 700 × 350 × 700 | L |
| Suspension rail 35 cm | 295 × 15 × 40, article 00340047, for a 350 mm unit | L, [00340047](https://www.ikea.com/gb/en/p/eket-suspension-rail-35cm-00340047/); P, AA-1912543-9 |
| Suspension rail 70 cm | 630 × 15 × 40, article 80340048, for a 700 mm unit | L |
| Space above a rail-mounted unit | at least 50 | P, AA-1912543-9 |
| Legs | 100 high, Ø 30, 4-pack: 70574660 (black), 80474151 (wood), 70428904 (silver) | L; P, AA-2425733-1 |
| Adjustable feet | 19 to 24 high, article 70340044 | L; P, AA-1909148-2 |
| Door hinge | pivot pins in sockets in the top and bottom panels (tier 2) | P, AA-2702920-1 |
| Drawer runners | on the side panels (tier 2) | P, AA-2164291-6 |

### A.3 Not found

- KALLAX and EKET panel thicknesses, and the back thicknesses.
- Any hole position or diameter in the cell panels, and for the legs, feet, rail hooks, or connectors.
- The EKET door size and gaps, and the drawer runner positions.

A caliper measurement of one real unit fixes the KALLAX opening. The tier 2 work needs a full set of EKET
measurements.
