# The crate, an open-top box — design spec

Status: draft for review. Date: 2026-10-28.

Builds on: [`2026-10-27-design-starters-design.md`](2026-10-27-design-starters-design.md) (the starter catalogue, and
§3a, the IKEA-name rules) and [`2026-09-30-box-construction-design.md`](2026-09-30-box-construction-design.md) (the
pocket-screw joinery). This spec adds to them. It does not replace a section of them.

## 1. Summary

The starter catalogue has units that are open on the front: cube shelves, a bookcase, wall cubes. A user also wants
things that go **into** those units. The first one is a **crate** that slides into a KALLAX-style cube, with a hand
hole in the front and the back.

Today's design model cannot make a crate correctly. The only design is a box that is open on the front. A crate made
from it (the box on its back) has an overlay bottom with face screws, is 1/32" too tall for the cube opening, has
cabinet part names ("Top" for the crate front), and its steps end with a wall anchor.

This spec adds:

1. A second kind of design, the **open-top box**: four walls and a bottom, open at the top.
2. **Finish steps** on every design: plain-text steps after the build steps, for example sanding, a roundover, or
   holes for the handles.
3. A **fit check**: a warning when an open-top box is too large for a KALLAX-style cube.
4. A **Crate** starter in the catalogue, with the sizes of a crate that the product owner built.

## 2. Intent

The product owner built this crate in the shop. The tool must plan that crate as it was built: the same parts, the
same joinery, the same steps. The crate is the first accessory. The open-top box is also the base for drawer boxes,
trays, and half-height crates later (backlog items 25–29). This spec builds only what the crate needs. It must not
make those later items harder.

The IKEA sizes are for **compatibility**. The rules of §3a of the design starters spec apply to all text of this work.

## 3. Goals, non-goals, and success criteria

**Goals**

- A crate starter makes a crate that matches the built crate, part for part.
- The open-top box is a normal design: the user can change its size, material, quantity, name, colours, and finish
  steps in the design editor and the CLI, and it makes parts, a cut plan, hardware, and assembly steps.
- Every design kind can have finish steps.

**Non-goals** (backlog items, not this work)

- Other crate sizes, half height, double stack (item 25).
- A crate sized from the cells of a shelf in the project (item 26).
- A thin bottom in a groove, drawer boxes, drawer slides (item 27).
- A tray starter (item 28).
- Cells, dividers, or shelves in an open-top box (item 29).
- Default finish steps for the other starters (item 30).
- Holes or cutouts as geometry on a part (item 31). A handle hole is a finish step in text only, and it does not
  change the cut plan.

**Success criteria**

- In a new `in` project with a measured 23/32" plywood, the crate starter at its defaults makes these parts, and no
  errors and no warnings:

  | Part | Size | Quantity |
  |---|---|---|
  | Front | 12 1/2" × 12 1/2" | 1 |
  | Back | 12 1/2" × 12 1/2" | 1 |
  | Side | 12 1/16" × 12 1/2" | 2 |
  | Bottom | 11 1/16" × 12 1/16" | 1 |

  (The first size of each part is its length, as the parts list of today shows it. The builder keeps the grain rule
  of today.)
- In a new `mm` project with an 18 mm material, the crate has no errors and no warnings, and fits the KALLAX opening.
- The assembly steps have no wall anchor, no back, and no mount step. They end with the three finish steps of §5.
- An open-top box that is larger than the KALLAX opening, with the KALLAX fit on, gets a warning, not an error.
- A shelf design of today has the same parts, steps, drawings, and file contents as before (apart from the new format
  version).

## 4. The open-top box

### 4.1 Shape

- **Walls.** The front and the back are full width. The two sides sit between them. All four walls are the full
  height of the box.
- **Bottom.** One panel of the box material, inside the four walls, flush with their lower edges. Its size is the
  inside size: (width − 2 × thickness) × (depth − 2 × thickness).
- **No top**, no back panel, no cells, no mount.
- **The size** is the outside width, height, and depth. The parts follow from the thickness of the material, as for
  the box of today.
- **Part names:** Front, Back, Side, Bottom.

### 4.2 Joinery

The joinery follows the box construction spec: butt joints, glue, and pocket screws, with the pocket screw chart and
the pocket-hole spacing of today (`pocketScrew`, `pocketHolesPerEnd`).

- **Sides to the front and the back:** pocket holes in both ends of each side, on the inside face, into the front and
  the back. The outside faces stay clean.
- **Bottom to the walls:** pocket holes along all four edges of the bottom, on its underside, into the walls.
- The hardware list counts these pocket screws and the glue. It has no back screws, no legs, no rail, no anti-tip
  fitting.

### 4.3 Assembly steps

The steps for one open-top box:

1. Drill the pocket holes: the ends of the sides (inside face) and the edges of the bottom (underside).
2. Join the sides between the front and the back, with glue and pocket screws, flush at the top and the bottom.
3. Check that it is square: the two diagonals of the top opening.
4. Fit the bottom between the walls, flush with their lower edges, with glue and pocket screws.
5. The finish steps of the design (§5), if it has any.

Each step has a drawing, as the steps of today do. The builder chooses the views.

### 4.4 Drawing

The front-view drawing (`designElevationSvg`) and the starter thumbnail show the open-top box from the front. The
builder chooses how it shows the bottom and the walls behind the front.

### 4.5 Fit check

An open-top box can say that it is made to go in a KALLAX-style cube. Then the design checks give a **warning** (not an
error) when:

- the outside width or height is more than the KALLAX opening (335 mm) minus `KALLAX_CLEARANCE_MM`, or
- the outside depth is more than the KALLAX depth (390 mm).

The message says which size is too large, by how much, and what the limit is. The project still plans and the design
can still be added. When the check gives no warning, the starter dialog shows **Fits** "KALLAX cells" for the crate.
This extends rule 6 of §3a: a "Fits" claim for a box that goes into a cell names the KALLAX cell, and only when this
check gives no warning.

## 5. Finish steps

- A design of either kind has an optional list of finish steps. Each step is one line of plain text.
- The assembly steps show them after the build steps, in their order, one step each. They have ticks like the other
  steps. The printed booklet and `report assembly` include them.
- The Design tab edits them for the selected design (add, change, remove, reorder). The CLI sets them on `design add`
  and `design set`, and can remove them.
- A finish step does not change the parts, the cut plan, or the hardware list.
- A starter can give default finish steps. The crate starter gives these three, in the units of the project:
  1. "Drill a 2 1/8" (54 mm) hole through the front and the back, centered left to right, with its top 1 1/2" (38 mm)
     below the top edge. The two holes are the handles."
  2. "Round over all the edges with a router, including the edges of the holes."
  3. "Sand lightly."
- The legs, feet, and rail steps of today stay generated steps. Finish steps are in addition to them.

## 6. The crate starter

| Group | Starter id | Name | Kind | Quick choices | Default size (W × H × D) | Fits |
|---|---|---|---|---|---|---|
| Accessories | `crate` | Crate | open-top box | none | 12 1/2" × 12 1/2" × 13 1/2" (in), 318 × 318 × 343 mm (mm) | KALLAX cells |

- The name is generic ("Crate"), as rule 1 of §3a says. The design name is "Crate".
- The KALLAX fit of §4.5 is on.
- The material pick of the starters (`pickBoxMaterial`) gives the material. The crate has no back material.
- The preview note says that the crate slides into a KALLAX-style cube, and that the holes are the handles.
- The source of the size is the crate that the product owner built on 2026-10-27, not an IKEA product. The size
  leaves about 11/16" (17 mm) of clearance in the width and the height of a 335 mm opening.

## 7. Code

### 7.1 Core

- **Format.** The project format gets a new minor version. A design gets a field for its kind (absent means the box of
  today) and an optional list of finish steps. Old files read as before. `docs/format.md` documents both fields.
- **Open-top box.** Geometry, parts, hardware, assembly steps, assembly drawings, the front-view drawing, the sheet
  estimate, and the design errors (for example, an inside size of zero or less) for the new kind. The checks of the
  box of today that do not apply (cell openings, KALLAX insert and depth checks, the shelf span, the mount checks, the
  back) do not run for it.
- **Fit check.** A new warning code for §4.5.
- **Finish steps.** In `assemblySteps` (`packages/core/src/design/assembly.ts`) for both kinds.
- **Starter.** The `crate` starter in `STARTERS`, and `starterFits` for it.

### 7.2 Web app

- The Design tab editor for an open-top box: name, material, outside width, height, and depth, quantity, colours, the
  KALLAX fit, and the finish steps. No grid, back, mount, or combined cells.
- The finish-steps editor for both kinds.
- The starter dialog lists the crate in a new **Accessories** group.

### 7.3 CLI

- `design add --starter crate`.
- `design add` and `design set` can make and change an open-top box, and set and remove the finish steps.
- `design list` and `design get` show the kind and the finish steps.
- `docs/cli.md` documents the new flags.

### 7.4 Docs

- `docs/web-app.md`, `docs/cli.md`, `docs/format.md`, and `README.md` (the Designs bullet).
- `docs/backlog.md` item 24 gets the status "Done" and the chosen approach.

## 8. Tests

- Core: the success criteria of §3, in `in` and `mm`. The parts, hardware, and steps of the crate. The fit warning for
  a box that is too wide, too tall, or too deep, and none at the limit. A finish step on a box of today and on an
  open-top box. A file without the new fields reads as before.
- Web: the crate in the dialog; **Use this design** adds it; the editor shows the open-top fields and not the grid
  fields; the finish steps can be added, changed, reordered, and removed, and show on the Assembly tab.
- CLI: `design add --starter crate`; finish steps on `design add` and `design set`.
- e2e: add the crate, see its parts, and see the finish steps on the Assembly tab.

## 9. Calls made in this spec

These are the calls of the spec writer, not of the product owner. The product owner can change them on review.

1. The bottom uses the pocket-hole spacing of today, which gives 3 holes on each edge (12 in total). The built crate
   used about 6.
2. The bottom's pocket holes are on its underside, where the cube hides them.
3. The crate has no quick choices. Sizes are backlog item 25.
4. The new starter group is "Accessories".
5. The mm default is the inch default converted and rounded to the millimetre.
6. The fit check uses `KALLAX_CLEARANCE_MM` (2 mm), as the insert check does. The crate itself leaves 17 mm.
7. The fit check is a setting of the design, which the crate starter turns on. A user who makes a box for another
   opening turns it off.
8. Finish steps are free text, with no units. The crate starter writes its defaults in the units of the project.
9. The handle hole is 2 1/8" (54 mm), the common bore for a door knob.
10. The finish steps come last, after the generated mount and anchor steps of a box of today.
11. The kind of a design is fixed when the design is made. `design set` and the editor do not change it.

## 10. Left to the builder

- The names of the new fields and codes, and the format version number.
- How the kind and the KALLAX fit are stored (for example, the kind and the `system` field of today, or a new field).
- The views of the front drawing and of each assembly drawing.
- The grain of each part, by the rule of today.
- The editor layout of the finish steps.
- The text of the assembly steps and the fit warning, in the style of today (ASD-STE100).
