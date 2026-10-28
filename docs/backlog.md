# Backlog

Requests and ideas, with what the code does now. Items 1–23 are done. Their text is in the git history of this file
(last at `36d4237`). The specs in `docs/superpowers/specs/` describe how they were built. New items start at 24, so
that an old link to an item number is not ambiguous.

## 24. The crate: the first open-top box

**Status:** Designing. See `docs/superpowers/specs/2026-10-28-crate-design.md`.

**Size:** M.

**Request:** A starter for a crate that fits in a KALLAX-style cube, as an accessory to the cube shelves.

**Now:** The only design is a box that is open on the front. A crate made from it has the wrong bottom (an overlay
back with face screws), is 1/32" too tall for the opening, has cabinet part names, and ends with a wall-anchor step.

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
