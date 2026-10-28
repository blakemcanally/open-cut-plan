# Backlog

Requests and ideas, with what the code does now. Items 1–23 are done. Their text is in the git history of this file
(last at `36d4237`). The specs in `docs/superpowers/specs/` describe how they were built. New items start at 24, so
that an old link to an item number is not ambiguous.

## 24. The crate: the first open-top box

**Status:** Done. See `docs/superpowers/specs/2026-10-28-crate-design.md`.

**Size:** M.

**Request:** A starter for a crate that fits in a KALLAX-style cube, as an accessory to the cube shelves.

**Now:** The only design is a box that is open on the front. A crate made from it has the wrong bottom (an overlay
back with face screws), is 1/32" too tall for the opening, has cabinet part names, and ends with a wall-anchor step.

**Chosen approach:**

- A design has a `kind`. No `kind` or `"box"` is the box of today. `"open-box"` is an open-top box: a front, a back,
  two sides, and a bottom inside the walls, all of one material, with no top, back panel, cells, or mount. The user
  cannot change the kind of a design.
- The joinery is pocket screws and glue, with the pocket-hole spacing of today. The sides screw into the front and the
  back. The bottom screws into the walls from its underside, where the cube hides the holes.
- A design has a list of `finish` steps, in plain text, for both kinds. The assembly steps show them after the
  build steps. They do not change the parts, the cut plan, or the hardware. File format 1.11 adds `kind` and
  `finish`.
- The system `kallax` on an open-top box means that the box goes in a KALLAX-style cube. The check `kallax-fit` gives
  a warning when the box is more than 333 mm wide or tall, or more than 390 mm deep. The dialog shows **Fits** "KALLAX
  cells" only when the check is quiet.
- The starter `crate`, in the new group Accessories, is 12 1/2" × 12 1/2" × 13 1/2" (318 × 318 × 343 mm). It comes
  with three finish steps: the two handle holes, the roundover, and a light sand.
- The Design tab has an editor for the open-top box with the name, **Fits a KALLAX-style cube**, the quantity, the
  outside width, height, and depth, the material, and the colours. Every design has the finish-steps editor. The CLI
  makes and changes both kinds, and sets and removes the finish steps. See [web-app.md](web-app.md) and
  [cli.md](cli.md).
- Not done: other sizes (item 25), sizes from the cells of a shelf (item 26), grooved bottoms and drawers (item 27),
  trays (item 28), cells in an open-top box (item 29), and holes as geometry (item 31).

## 25. More crate sizes: half height, double stack, and others

**Status:** Open.

**Size:** S.

**Request:** Quick choices for the crate: a half-height crate, two of which stack in one cube, and other common
sizes.

**Now:** The crate of item 24 has one size and no quick choices.

**Idea:** A height choice (full, half) on the crate starter. The fit check of item 24 checks a stack of two half
crates against the opening.

## 26. Size a crate from the cells of a cube shelf in the project

**Status:** Open.

**Size:** M.

**Request:** Make a crate for each cell size of a shelf design, so that the crate fits a custom opening, not only the
KALLAX-style opening.

**Now:** The crate starter has a fixed size. The user changes the size by hand in the design editor.

**Idea:** In the starter dialog or the design editor, pick a shelf design and a cell. The crate gets the opening
minus the clearance, and the depth of the shelf minus a margin.

## 27. Drawer boxes

**Status:** Open.

**Size:** L.

**Request:** Drawer boxes, as open-top boxes.

**Now:** The open-top box of item 24 has one bottom: a full-thickness panel inside the four walls, on pocket screws.
The tool has no groove, dado, or rabbet, and no drawer slides.

**Idea:**

- A second kind of bottom: a thin panel in a groove near the lower edge of the walls. This needs a groove step in the
  cut steps or the assembly steps.
- Later: drawer slides or runners, and a cabinet opening that holds the drawers, with the clearance that the slides
  need.

## 28. Trays

**Status:** Open.

**Size:** S.

**Request:** A tray starter: a low open-top box, with handle holes in the short walls.

**Now:** The open-top box of item 24 can be low, but there is no starter for it.

## 29. Cells and dividers in an open-top box

**Status:** Open.

**Size:** M.

**Request:** Dividers inside a crate, tray, or drawer box.

**Now:** The open-top box of item 24 has no cells, dividers, or shelves.

## 30. Default finish steps for the other starters

**Status:** Open.

**Size:** S.

**Request:** The finish steps of item 24 (plain text on a design) for the other starters: sanding, a roundover, paint
or oil.

**Now:** Only the crate starter fills in finish steps.

## 31. Holes and cutouts as geometry

**Status:** Open.

**Size:** M.

**Request:** Draw a handle hole or a cutout on the part, with its position, so that the user can mark it.

**Now:** A handle hole is a finish step in plain text (item 24). The part drawings do not show it.

## 32. Older IKEA names in the text

**Status:** Open.

**Size:** S.

**Request:** All user-facing text follows the IKEA-name rules of the design starters spec (§3a): an IKEA name only as
"KALLAX-style …" or "Fits KALLAX …".

**Now:** The `design` command group summary says "Cabinet designs (KALLAX, EKET, custom)". The examples in
`examples/` have names such as "Media KALLAX".

## 33. Follow-ups from the design starters

**Status:** Open.

**Size:** S each.

- **IKEA sizes:** The KALLAX 6 × 6 and 6 × 1 sizes are derived, not from an IKEA page. Many KALLAX and BILLY sizes come
  from search-result titles, not fetched pages. Confirm them, and fill in the sources.
- **Source tests:** The core tests do not compare the `sources` values of a starter with its design. For example,
  `wall-cubes` `"5x2": 1750` is not checked against the geometry.
- **CLI tests:** No CLI test for the nightstand with `--mount feet`, or for the media unit.
- **Docs:** One line in `docs/web-app.md` (the design list on the Design tab) is about 141 characters long.

## 34. The stacking shelf of Evan Monsma

**Status:** Done. See `docs/superpowers/specs/2026-10-28-stacking-shelf-design.md`.

**Size:** L.

**Request:** A starter for the stackable shelf module in the video "Starting the shelf system I've always wanted" by
Evan Monsma, true to his design: the same parts, the same joints, the same cleats.

**Now:** A box has its top and bottom over the full width, with the sides between them. It uses pocket screws only.
Its mounts are floor, legs, feet, and the wall rail. So the box cannot make his module.

**Chosen approach:**

- A box has a `corners` setting: `"top-over-sides"` (the box of today) or `"sides-over-top"` (his corners, with the
  sides over the top and the bottom). No field means `"top-over-sides"`.
- A box has a `fastener` setting: `"pocket-screws"` (today) or `"face-screws"` (screws through the sides into the ends
  of the panels). No field means `"pocket-screws"`. Face screws and the sides-over-top corners need a box with 1
  column. A box with more columns gets the error `design-one-column`.
- The mount `cleats` adds two feet under the bottom and two cleats on the top, so that one module stands on another.
  The parts are Foot and Top cleat. The assembly gets the step **Fit the cleats**.
- A design can have `hiddenWarnings`, a list of warning codes. A check leaves out a hidden warning. It never hides an
  error. The Design tab and `design set --show-warnings` show the warnings again.
- An open-top box refuses all three settings (`design-open-box`). A value that the app does not know keeps the stored
  parts of the design and gives a warning.
- The starter `stacking-shelf`, in the new group Shop storage, makes 1 column and 4 rows, 16" deep, with the sides
  40" long. It uses the three settings and hides the warning `shelf-span`. Its note credits Evan Monsma, and adds no
  other note about his corners.
- The Design tab has the **Corners** and **Fastener** lists next to **Mount**, and a line for the hidden warnings
  with a **Show it** or **Show them** button. The CLI has `--corners`, `--fastener`, and `--show-warnings`. File format
  1.12 adds `corners`, `fastener`, and `hiddenWarnings`, and the mount `cleats`. See [web-app.md](web-app.md) and
  [cli.md](cli.md).
- Not done: his metal-bracket repair, storage boxes that fit the openings, a wall plan for many modules, and his
  corners or face screws in a box with more than 1 column.
