# The stacking shelf: corners, face screws, and cleats — design spec

Status: draft for review. Date: 2026-10-28.

Builds on: [`2026-10-27-design-starters-design.md`](2026-10-27-design-starters-design.md) (the starter catalogue and
its §3a name rules), [`2026-09-30-box-construction-design.md`](2026-09-30-box-construction-design.md) (the box and its
pocket-screw joinery), and [`2026-10-28-crate-design.md`](2026-10-28-crate-design.md) (format 1.11, the open-top box,
and the finish steps). This spec adds to them. It does not replace a section of them.

## 1. Summary

Evan Monsma builds a stackable shelf module in his video "Starting the shelf system I've always wanted"
(<https://www.youtube.com/watch?v=cRj2tih1IaI>). The product owner wants it in the catalogue, for the fans of his
channel, true to his design.

Today's box cannot make it. His box differs from ours in three ways:

1. **Corners.** His sides run the full height, and the top and the bottom sit between them. Our top and bottom run
   the full width, and the sides sit between them.
2. **Fasteners.** He drills pilot holes and drives screws through the sides into the ends of the panels. Our box uses
   pocket screws only.
3. **Cleats.** Two feet under the bottom and two cleats on the top let one module stack on another. Our mounts are
   floor, legs, feet, and a wall rail.

This spec adds:

1. A **corners** setting on a box: today's corners, or his.
2. A **fastener** setting on a box: pocket screws (today), or face screws.
3. A **cleats** mount: four strips that let modules stack.
4. **Hidden warnings**: a design can hide the warnings that you choose.
5. A **Stacking shelf** starter with his sizes.

## 2. Intent

The starter is a tribute. It must make his module: the same parts, the same cut list, the same joints, the same
cleats. The three settings are general, so any box can use them. The starter is the first user of all three.

His video shows a repair: he first cut three shelves 3" short, and he extended them with metal brackets and filler
pieces. The starter makes the module he planned, with all five panels at full length. It does not copy the repair.

The product owner knows that his corners put the load on the screws, and chose to stay true to his design. The tool
adds no note about it.

## 3. Goals, non-goals, and success criteria

**Goals**

- The Stacking shelf starter makes his module, part for part, with no errors and no warnings.
- The corners, the fastener, and the cleats are normal design settings. The user can change them on any box, in the
  web editor and in the CLI. The parts, the cut plan, the hardware, the steps, and the drawings follow them.
- A design can hide chosen warnings, and the user can show them again.

**Non-goals** (backlog items, not this work)

- His metal-bracket repair.
- Storage boxes sized to the openings.
- A wall plan for many modules.
- His corners or face screws in a box with more than one column (see §5.3). You stack or line up more modules.
- Corners, fasteners, or cleats on an open-top box. The crate stays as it is. `openBoxErrors` refuses `corners`,
  `fastener`, and `mount: "cleats"` with `design-open-box`, as it refuses a back today.
- Cleats from a second material by default. The user can give the cleats another material (§6), but the starter uses
  the box material.

**Success criteria**

- In a new `in` project with a 3/4" plywood that is marked as measured, the starter at its defaults makes these
  parts, and no errors and no warnings:

  | Part | Size | Quantity |
  |---|---|---|
  | Side | 40" × 16" | 2 |
  | Top | 51" × 16" | 1 |
  | Bottom | 51" × 16" | 1 |
  | Shelf | 51" × 16" | 3 |
  | Foot | 16" × 3 1/2" | 2 |
  | Top cleat | 16" × 3 1/2" | 2 |

  (The first size of each part is its length, as the parts list of today shows it. The part names of the shelves
  follow the shelf names of today.)
- The outside size is 52 1/2" wide × 40" tall × 16" deep. With the feet, the module stands 40 3/4" tall. Two stacked
  modules stand 81 1/2" tall, because the top cleats fit between the feet of the next module.
- The hardware list has 44 face screws #8 × 2" (40 and the 10% extra of the pocket screws of today), 18 cleat
  screws #8 × 1 1/4" (16 and the same extra), glue, and no pocket screws.
- A shelf design of today has the same parts, hardware, steps, drawings, and file contents as before (apart from the
  new format version).

## 4. Format 1.12

Four new optional fields on a design. Absent means today's behaviour.

| Field | Values | Absent means |
|---|---|---|
| `corners` | `"top-over-sides"`, `"sides-over-top"` | `"top-over-sides"` |
| `fastener` | `"pocket-screws"`, `"face-screws"` | `"pocket-screws"` |
| `mount` | adds `"cleats"` to the mounts of today | `"floor"`, as today |
| `hiddenWarnings` | a list of warning codes, for example `["shelf-span"]` | no hidden warnings |

The format version becomes `1.12`. Old files read as before. An unknown value of `corners` or `fastener` is handled as
an unknown kind is handled today: a warning (`design-unknown-corners` or `design-unknown-fastener`), the parts stay as
they are (`designParts` is null), and the web editor and the CLI lock the design. `docs/format.md` documents the fields in the style of the 1.11 entry.

## 5. The box settings

### 5.1 Corners

- **Top over sides** (today): the top and the bottom are `W` long. The sides are `H − 2t` long, between them.
- **Sides over top**: the sides are `H` long. The top and the bottom are `W − 2t` long, between the sides.

The outside size does not change. Only the lengths of the top, the bottom, and the sides change. The shelves and the
dividers are the same in both. The front view and the step drawings draw the corners as they are.

### 5.2 Fastener

- **Pocket screws** (today): no change.
- **Face screws**: pilot holes through the face of one board, and wood screws into the end of the other board, with
  glue.
  - The screw goes through the board whose face covers the end of the other board. In "sides over top", the screws go
    through the sides into the top, the bottom, and the shelves. In "top over sides", they go through the top and the
    bottom into the sides, and through the sides into the shelves.
  - The count for each joint uses the spacing rule of the pocket holes of today (`pocketHolesPerEnd`) on the depth of
    the joint. A 16" deep joint gets 4 screws.
  - The screw is #8, `t + 1 1/4"` long, rounded to a common length: 2" for 3/4" stock. In `mm`, the nearest common
    metric length (for 18 mm stock, 4 × 50 mm).
  - The steps say that the screw heads show on the outer face, and that a pilot hole keeps the plywood from splitting.
  - The pocket-thickness error does not apply to face screws. The pocket chart check does not apply either.

### 5.3 His corners and face screws need one column

His system is one column for each module. You build more modules, not more columns. So both new settings need a box
with 1 column:

- A box with face screws and more than one column gets an error. A shelf on each side of a divider covers both faces
  of the divider, so no screw can reach the second shelf. The text: `Design "X" uses face screws, so it can have only
  1 column. Use pocket screws for more columns.`
- A box with "sides over top" and more than one column gets an error. The text: `Design "X" has its sides over the
  top, so it can have only 1 column. Use the top over the sides for more columns.`
- The code is `design-one-column`. The assembly steps of "sides over top" are one new step order for a 1-column box.
  The multi-column steps of today do not change.

### 5.4 Cleats mount

- Four strips, `3 1/2"` wide (89 mm in `mm`) and as long as the depth, in the box material, grain along the length.
  - **Foot** ×2: under the bottom, flush with the left and the right outer edges.
  - **Top cleat** ×2: on the top, `3 1/2"` in from the left and the right outer edges, so the feet of the next module
    fit outside them.
- The feet add `t` to the height of the module. The top cleats add nothing when modules are stacked.
- Each strip gets glue and cleat screws, with the count from the same spacing rule on its length. The cleat screw is
  #8, `t + 1/2"` long, rounded to a common length: 1 1/4" for 3/4" stock.
- A strip is as long as the panels are deep (`panelDepth`), so a box with a back keeps the strips clear of the back.
- The cleats lift the bottom, as feet do: the bottom-span check treats `cleats` as lifted, with the text "on cleats".
- The cleats are parts, so they go on the cut plan. The optimizer places them in the offcuts as it does for any part.
- Cleats get no `mount-system` warning on any system, as legs and feet get none today.
- The steps get a "Fit the cleats" step in place of a legs, feet, or rail step. There is no anchor step and no wall
  fixing for cleats, because a stack of cleated modules stands on the floor. (The anchor step of today stays for a
  floor mount.)

### 5.5 Hidden warnings

- `checkDesigns` drops a warning of a design when its code is in that design's `hiddenWarnings`. Errors are never
  hidden.
- The web editor shows a short line when a design hides a warning, for example `This design hides 1 warning: shelf
  span.` (N counts the codes in the list.), with a button `Show it` that removes the code from the list.
- The CLI: `design get` lists the hidden codes. `design set --show-warnings` clears the list. There is no flag to hide
  a warning; a starter or a file sets them.

## 6. The Stacking shelf starter

- id `stacking-shelf`, name `Stacking shelf`, a new group `Shop storage`, no choices (as the crate).
- Note: `A shelf module that stacks on cleats, after the shelf system of Evan Monsma. The four openings fit storage
  boxes 8" high.`
- `sources.size`: the video URL above, with the sizes from the video: 3/4" plywood, 16" deep, sides 40", panels 51",
  cleats from 3/4" stock 3 1/2" wide.
- The design: `system: "custom"`, 1 column, 4 rows, outside `52 1/2"` × `40"` × `16"` (in `mm`: 1334 × 1016 × 406),
  `corners: "sides-over-top"`, `fastener: "face-screws"`, `mount: "cleats"`, no back, `hiddenWarnings:
  ["shelf-span"]`, no finish steps.
- The cleats use the box material. The user can give them another material later (for example a 1x4 added as a
  narrow sheet, 3 1/2" × 96"); that is a normal material change on the Foot and Top cleat parts, if the app allows
  it today, and is not new work.
- `starterFits` gives `[]`. `starterFits` reads the checks before hidden warnings are dropped, so a hidden warning never
  makes a unit look as if it fits.
- The starter never adds a back, whatever the back option is, and the CLI refuses `--back` with it, as for the crate.

## 7. Code

### 7.1 Core

- `systems.ts`: the corner and fastener values, with `is…` guards and defaults, as `DESIGN_MOUNTS` is today. Add
  `"cleats"` to `DESIGN_MOUNTS`.
- `panels.ts`: the panel layout for both corner types.
- `parts.ts`: the lengths of the top, the bottom, and the sides for both corner types; the Foot and Top cleat parts.
- `errors.ts`: the face-screw column error (§5.3); unknown corners or fastener as an unknown mount.
- `hardware.ts`: face screws and cleat screws in place of pocket screws, by the rules of §5.
- `checks.ts`: hidden warnings; pocket checks only for pocket screws.
- `assembly.ts`: drill pilot holes in place of pocket holes, the join steps for both corner types, the cleats step.
- `reports/elevation.ts`: the corners, the feet, and the top cleats in the front view and the step drawings.
- `starters.ts`: the starter and the group.

Keep the leaf modules of the crate work (`pocket.ts`, `ref.ts`, `assemblyTypes.ts`, `reports/drawing.ts`) and make no
import cycle.

### 7.2 Web app

- The design editor of a box gets a **Corners** select and a **Fastener** select, next to the mount, and the mount
  select gets **Cleats**.
- The hidden-warnings line of §5.5.
- The starter dialog shows the new group and the starter.

### 7.3 CLI

- `design add` and `design set`: `--corners <top-over-sides|sides-over-top>`, `--fastener
  <pocket-screws|face-screws>`, and `cleats` as a `--mount` value. An open-top box refuses `--corners` and
  `--fastener` with `conflict`.
- `design set --show-warnings`.
- `design get` shows the corners, the fastener, and the hidden warnings.

### 7.4 Docs

`docs/format.md`, `docs/cli.md`, `docs/web-app.md`, the README Designs bullet, and a backlog item (Done) in the style of
item 24.

## 8. Tests

- The success criteria of §3, in `in` and in `mm`.
- Both corner types with both fasteners on a 1-column box: the part lengths, the screw counts, and the steps.
- The `design-one-column` error for face screws and for "sides over top" on a box with 2 columns.
- The cleats on a box of another size: the positions, the height, and the screw count.
- Hidden warnings: hidden in the checks, shown again by the button and by `--show-warnings`; an error is never hidden.
- Every example file and every other starter gives the same parts, hardware, steps, and drawings as before.
- An e2e test: add the starter, see the parts and the cleats step.

## 9. Calls made in this spec

These are the calls of the controller, not of the product owner:

1. The name `Stacking shelf`, the group `Shop storage`, and the note text.
2. The design and the starter credit Evan Monsma by name in the note and the source.
3. The screw sizes (#8 × 2" face screws, #8 × 1 1/4" cleat screws) and their mm equivalents. He does not say them.
4. The screw count per joint uses the pocket-hole spacing rule: 4 for a 16" joint, 40 for his module. Face and cleat
   screws get the 10% extra of the pocket screws.
5. The cleat width of 3 1/2" (89 mm) and the top-cleat inset equal to the cleat width.
6. Face screws and "sides over top" need one column (§5.3). The product owner confirmed the one-column rule for his
   system.
7. Hidden warnings are a list of codes on the design, and the starter hides `shelf-span`.
8. Cleats have no anchor step.
9. The mm defaults: 1334 × 1016 × 406.
10. An unknown `corners` or `fastener` value is handled as an unknown kind.
11. A strip is `panelDepth` long; cleats count as lifted for the bottom span; cleats get no `mount-system` warning.
12. An open-top box refuses the new settings; `starterFits` reads the checks before hiding; the starter never has a
    back.

## 10. Left to the builder

- The exact step text, in the style of the steps of today and in ASD-STE100 style.
- The SVG detail of the feet and the cleats.
- The CLI and web layout of the new controls, in the style of the mount control.
