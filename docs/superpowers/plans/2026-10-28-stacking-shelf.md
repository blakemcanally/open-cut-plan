# The Stacking Shelf: Corners, Face Screws, and Cleats — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three box settings (corners, fastener, and a cleats mount), hidden warnings, and a Stacking shelf starter
that makes the shelf module of Evan Monsma.

**Architecture:** Three new optional design fields (`corners`, `fastener`, `hiddenWarnings`) and a new mount value
(`cleats`) in format 1.12. The box code of today stays the path for `top-over-sides` with `pocket-screws`. The other
combinations need 1 column, and their assembly steps live in a new file, `design/oneColumnSteps.ts`. The screw sizes
live in a new leaf module, `design/screws.ts`. `checkDesigns` drops hidden warnings at its end, and `starterFits` asks
for the full list.

**Tech Stack:** TypeScript, zod, Vitest, React, Testing Library, Playwright. `npm run check` runs lint, types, tests,
and the build. `npm run e2e` runs Playwright. `npm run schema` writes `schema/cutplan.schema.json`.

**Spec:** `docs/superpowers/specs/2026-10-28-stacking-shelf-design.md`

## Global Constraints

- All user-facing text (messages, step text, labels, docs) is in ASD-STE100 style: short sentences, active voice, one
  idea per sentence, as the text of today.
- "A shelf design of today has the same parts, hardware, steps, drawings, and file contents as before (apart from the
  new format version)." A design with no `corners`, no `fastener`, and no `hiddenWarnings` is a shelf design of today.
- The format version becomes `1.12`. Old files read as before.
- The starter credits Evan Monsma by name in its note and its source, and adds no other note or warning about his
  corners.
- "Keep the leaf modules of the crate work (`pocket.ts`, `ref.ts`, `assemblyTypes.ts`, `reports/drawing.ts`) and make no
  import cycle." The new `design/screws.ts` is a leaf module too: it imports only from `geometry/` and `systems.ts`.
- No code comment restates the code. Match the comment density of the file.
- Each commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Use exactly this line, even
  if your own session names another model.

## Review Focus

1. A box with face screws in stock outside the pocket chart (for example 1/4" or 1 3/4") gets a screw length, no
   `pocket-thickness` error, and no `pocket-chart` warning (T2, T3).
2. A 1-column "sides over top" box with combined cells (merged rows) makes the right parts, marks, and steps, with no
   throw (T2, T5).
3. A box with a back and cleats makes strips that are `panelDepth` long, not `depth` long (T4).
4. A quantity of 2 doubles the Foot and Top cleat parts and the face and cleat screws (T3, T4).
5. An open-top box from a file with `corners`, `fastener`, or `mount: "cleats"` gets the `design-open-box` error, and
   the parts, steps, and drawings are null, not a throw (T7).

---

### Task 1: Format 1.12, the setting values, unknown values, and hidden warnings in the checks

**Files:**
- Modify: `packages/core/src/format/schema.ts` (DesignSchema, `FORMAT_VERSION`), `packages/core/src/format/version.ts`
  (`SUPPORTED_MINOR = 12`), `packages/core/src/design/systems.ts`, `packages/core/src/design/generate.ts`,
  `packages/core/src/design/checks.ts`, `packages/core/src/design/starters.ts` (`starterFits` only),
  `packages/core/src/design/edit.ts`, `packages/core/src/plan/issues.ts`
- Modify: `schema/cutplan.schema.json` (run `npm run schema`), `docs/format.md`, every `examples/*.cutplan.json`
  version, and every test that asserts `"1.11"` (commit `6981b4f` is the list of the last version bump)
- Test: `packages/core/test/format/parse.test.ts`, `packages/core/test/design/checks.test.ts`,
  `packages/core/test/design/generate.test.ts`, `packages/core/test/design/edit.test.ts`

**Interfaces:**
- Produces: `DesignSchema` fields `corners: z.string().min(1).optional()`, `fastener: z.string().min(1).optional()`,
  and `hiddenWarnings: z.array(z.string().min(1)).max(MAX_HIDDEN_WARNINGS).optional()`, with
  `MAX_HIDDEN_WARNINGS = 50` exported from `schema.ts`.
- Produces in `systems.ts`: `DESIGN_CORNERS = ["top-over-sides", "sides-over-top"] as const`, `type DesignCorners`,
  `isDesignCorners(value: string): value is DesignCorners`, `designCorners(design: Design): string` (returns
  `design.corners ?? "top-over-sides"`). The same four for the fastener: `DESIGN_FASTENERS = ["pocket-screws",
  "face-screws"] as const`, `type DesignFastener`, `isDesignFastener`, `designFastener(design)` (default
  `"pocket-screws"`). `"cleats"` is NOT added to `DESIGN_MOUNTS` in this task (Task 4 adds it).
- Produces in `checks.ts`: `checkDesigns(project: Project, options: { keepHidden?: boolean } = {}): PlanIssue[]`.
  With `keepHidden` true, it gives every issue, as today.
- Produces in `edit.ts`: `showHiddenWarnings(design: Design): Design` — removes the `hiddenWarnings` field.
- Produces in `issues.ts`: the codes `design-unknown-corners`, `design-unknown-fastener`, and `design-one-column`
  (Task 2 uses the last one).

Rules:
- `designParts` gives null when `isDesignCorners(designCorners(design))` or `isDesignFastener(designFastener(design))`
  is false, as for an unknown kind.
- `checkDesigns`, after the unknown-kind check, in this order, each with `continue`:
  - `design-unknown-corners`: `Design "X" has the corners "V", which this app does not know. Its parts stay as they are.`
  - `design-unknown-fastener`: `Design "X" uses the fastener "V", which this app does not know. Its parts stay as they are.`
- At the end, unless `keepHidden`, `checkDesigns` drops each warning whose design ref names a design whose
  `hiddenWarnings` has the warning's code. Errors are never dropped.
- `starterFits` calls `checkDesigns(project, { keepHidden: true })`.
- `docs/format.md` gets a "Box settings (added in 1.12)" section in the style of the 1.11 entry, with the table of §4
  of the spec and the unknown-value rule.

- [ ] **Step 1: Write the failing tests**

```ts
it("reads a 1.11 file with no new fields as before", () => { /* parse ok; designParts same as before */ });
it("keeps corners, fastener, and hiddenWarnings through parse and serialize", () => { /* round trip */ });
it("gives design-unknown-corners and no parts for an unknown corners value", () => {
  // kallaxDesign({ corners: "mitred" }): designParts null; one warning, code design-unknown-corners, message as above
});
it("gives design-unknown-fastener and no parts for an unknown fastener value", () => { /* fastener: "nails" */ });
it("drops a hidden warning and keeps it with keepHidden", () => {
  // a custom 1×1 box 1500 mm wide in 18 mm stock gets shelf-span; with hiddenWarnings ["shelf-span"]:
  // checkDesigns(p) has no shelf-span; checkDesigns(p, { keepHidden: true }) has it
});
it("never drops an error", () => { /* hiddenWarnings ["pocket-thickness"] on 6 mm stock: the error stays */ });
it("drops only the warnings of the design that hides them", () => { /* two designs, one hides shelf-span */ });
it("removes the field with showHiddenWarnings", () => { /* result has no hiddenWarnings key */ });
```

- [ ] **Step 2: Run the tests and see them fail.** Run: `npx vitest run packages/core/test/design/checks.test.ts`
- [ ] **Step 3: Implement the rules above, bump the version, and run `npm run schema`.**
- [ ] **Step 4: Run `npm run check`.** Expected: PASS, with the example and version tests updated to `1.12`.
- [ ] **Step 5: Commit** — `Add format 1.12 with the corners, the fastener, and the hidden warnings of a design`

---

### Task 2: The corners in the parts and the panels, and the one-column error

**Files:**
- Modify: `packages/core/src/design/parts.ts`, `packages/core/src/design/panels.ts`, `packages/core/src/design/errors.ts`
- Test: `packages/core/test/design/parts.test.ts`, `packages/core/test/design/panels.test.ts`,
  `packages/core/test/design/errors.test.ts`

**Interfaces:**
- Consumes: `designCorners`, `designFastener` (Task 1), the code `design-one-column` (Task 1).
- Produces: `buildDesignParts` and `designPanels` follow the corners. Part ids and names do not change.

Rules:
- `sides-over-top`: Top and Bottom are `outsideWidth − 2t` long. Side is `outsideHeight` long. In `designPanels`, the
  sides are at `y = 0` with `height = outsideHeight`, and the top and the bottom are at `x = t` with
  `width = outsideWidth − 2t`. Dividers and shelves do not change.
- `design-one-column` errors, after the `design-too-small` and combined-cell checks, when `geometry.columns.length > 1`:
  - face screws: `Design "X" uses face screws, so it can have only 1 column. Use pocket screws for more columns.`
  - sides over top: `Design "X" has its sides over the top, so it can have only 1 column. Use the top over the sides for more columns.`
  - A box with both gets both errors.
- The `pocket-thickness` error applies only when `designFastener(design) === "pocket-screws"`.

The test box below is "his module": `system: "custom"`, `width: { outside: 52.5, cells: 1 }`,
`height: { outside: 40, cells: 4 }`, `depth: 16`, 3/4" material, in an `in` project.

- [ ] **Step 1: Write the failing tests**

```ts
it("makes full-height sides with sides over top", () => {
  // his module, corners sides-over-top: Side 40×16 ×2, Top 51×16 ×1, Bottom 51×16 ×1, Shelf 51×16 ×3
});
it("keeps the parts of today with top over sides", () => { /* same box, no corners: Top 52.5, Bottom 52.5, Side 38.5 */ });
it("draws the sides over the top and the bottom", () => {
  // designPanels: side x 0 and 51.75, y 0, height 40; top x 0.75, y 0, width 51; bottom x 0.75, y 39.25, width 51
});
it("gives design-one-column for face screws on 2 columns", () => { /* exact text above */ });
it("gives design-one-column for sides over top on 2 columns", () => { /* exact text above */ });
it("gives both errors for a 2-column box with both settings", () => { /* 2 issues */ });
it("does not give pocket-thickness for face screws", () => { /* 1/4" stock, fastener face-screws: no error */ });
it("makes the parts of a sides-over-top box with merged rows", () => {
  // his module with combined [{ column: 1, row: 1, columns: 1, rows: 2 }]: Shelf ×2, Side 40, no throw
});
```

- [ ] **Step 2: Run the tests and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm run check`.** Expected: PASS.
- [ ] **Step 5: Commit** — `Add the sides-over-top corners and the one-column error`

---

### Task 3: Face screws in the hardware and the checks

**Files:**
- Create: `packages/core/src/design/screws.ts`
- Modify: `packages/core/src/design/hardware.ts`, `packages/core/src/design/checks.ts`
- Test: `packages/core/test/design/screws.test.ts`, `packages/core/test/design/hardware.test.ts`,
  `packages/core/test/design/checks.test.ts`

**Interfaces:**
- Consumes: `designFastener` (Task 1).
- Produces in `screws.ts`:
  - `WOOD_SCREWS_IN: readonly { inches: number; name: string }[]` — #8 screws of 1, 1 1/4, 1 1/2, 1 5/8, 2, 2 1/2,
    and 3 inches, with names such as `#8 × 2"` and `#8 × 1 1/4"`.
  - `WOOD_SCREWS_MM: readonly { mm: number; name: string }[]` — 4 mm screws of 30, 35, 40, 45, 50, 60, 70, and 80 mm,
    with names such as `4 × 50 mm`.
  - `woodScrew(lengthMm: number, units: Units): string` — the name of the nearest length in the table for the units
    (`in` → inch table, `mm` → mm table). A tie goes to the longer screw.
  - `faceScrew(thicknessMm: number, units: Units): string` — `woodScrew(thicknessMm + 31.75, units)`.
  - `cleatScrew(thicknessMm: number, units: Units): string` — `woodScrew(thicknessMm + 12.7, units)`.
- Produces in `hardware.ts`: `HardwareItem` gains `"face-screws"` and `"cleat-screws"` (Task 4 adds the cleat lines).

Rules:
- With face screws, the `pocket-screws` line is replaced by a `face-screws` line: name
  `Wood screws for the joints, ${faceScrew(...)}`, quantity `ceil(holes × 11 / 10)`, where `holes` is the count of
  today (`pocketHoleEnds(geometry) × pocketHolesPerEnd(mm(panelDepth)) × quantity`), unit `each`, no source.
- The `pocket-chart` warning applies only to pocket screws.

- [ ] **Step 1: Write the failing tests**

```ts
it("picks #8 × 2\" face screws and #8 × 1 1/4\" cleat screws for 3/4\" stock", () => { /* faceScrew(19.05, "in"), cleatScrew(19.05, "in") */ });
it("picks 4 × 50 mm face screws and 4 × 30 mm cleat screws for 18 mm stock", () => { /* mm */ });
it("picks a length for stock outside the pocket chart", () => { /* faceScrew(6.35, "in") '#8 × 1 1/2"'; faceScrew(44.45, "in") '#8 × 3"' */ });
it("gives 44 face screws and no pocket screws for his module", () => {
  // his module, sides-over-top, face-screws, floor: a face-screws line, quantity 44,
  // name 'Wood screws for the joints, #8 × 2"'; no pocket-screws line
});
it("doubles the face screws for a quantity of 2", () => { /* ceil(80 × 1.1) = 88 */ });
it("keeps the pocket screws of today", () => { /* no fastener: the line is as before */ });
it("gives no pocket-chart warning for face screws", () => { /* 1 3/4" stock, face-screws */ });
```

- [ ] **Step 2: Run the tests and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm run check`.** Expected: PASS.
- [ ] **Step 5: Commit** — `Add face screws to the hardware list`

---

### Task 4: The cleats mount: parts, hardware, and spans

**Files:**
- Modify: `packages/core/src/design/systems.ts` (`DESIGN_MOUNTS`, `CLEAT_WIDTH`), `packages/core/src/design/parts.ts`,
  `packages/core/src/design/hardware.ts`, `packages/core/src/design/layout.ts` (`freeSpans`),
  `packages/core/src/design/checks.ts` (`LIFTED`)
- Modify: `apps/web/src/screens/DesignTab.tsx` (`MOUNT_LABELS`), `apps/web/src/design/StarterDialog.tsx`
  (`MOUNT_TEXT`), and the `--mount` description in `packages/cli/src/commands/design.ts`, so that the types and the
  text include the new value
- Test: `packages/core/test/design/parts.test.ts`, `packages/core/test/design/hardware.test.ts`,
  `packages/core/test/design/layout.test.ts`, `packages/core/test/design/checks.test.ts`

**Interfaces:**
- Consumes: `cleatScrew` (Task 3).
- Produces: `DESIGN_MOUNTS = ["floor", "legs", "feet", "wall-rail", "cleats"]`.
  `CLEAT_WIDTH: Readonly<Record<Units, number>> = { in: 3.5, mm: 89 }` in `systems.ts`.
  `cleatPositions(geometry: DesignGeometry, units: Units): { feet: number[]; topCleats: number[] }` in `parts.ts` —
  the left edges, in project units, from the left outer edge of the box: feet `[0, W − c]`, top cleats `[c, W − 2c]`,
  where `c = CLEAT_WIDTH[units]`. Task 6 draws from it.

Rules:
- With mount `cleats`, `buildDesignParts` adds `foot` ("Foot") and `top-cleat` ("Top cleat"), each 2 per unit, in
  `design.material`, `length = panelDepth`, `width = c`, grain `length`. They come after the shelves and before the back.
- Hardware for cleats: a `cleat-screws` line, name `Wood screws for the cleats, ${cleatScrew(...)}`, quantity
  `ceil(4 × pocketHolesPerEnd(mm(panelDepth)) × quantity × 11 / 10)`, unit `each`. No `anti-tip` line and no
  `wall-fixings` line.
- `freeSpans`: `cleats` is lifted. `LIFTED.cleats = "stands on cleats"`. No `mount-system` warning for cleats.
- Web labels: `MOUNT_LABELS.cleats = "Cleats"`, `MOUNT_TEXT.cleats = "Cleats"`. CLI `--mount` value text:
  `<floor|legs|feet|wall-rail|cleats>`, and the description says that cleats add the feet and the top cleats to the
  parts.

- [ ] **Step 1: Write the failing tests**

```ts
it("adds 2 feet and 2 top cleats to his module", () => { /* Foot 16×3.5 ×2, Top cleat 16×3.5 ×2, material = box */ });
it("makes 89 mm strips in a mm project", () => { /* width 89 */ });
it("makes strips as long as the panels when the box has a back", () => {
  // depth 16, back 1/4": strips 15.75 long
});
it("places the feet at the outer edges and the top cleats one width in", () => {
  // his module: cleatPositions → feet [0, 49], topCleats [3.5, 45.5]
});
it("gives 18 cleat screws and no anti-tip fitting for his module", () => {
  // cleat-screws quantity 18, name 'Wood screws for the cleats, #8 × 1 1/4"'; no anti-tip, no wall-fixings
});
it("doubles the cleat parts and the cleat screws for a quantity of 2", () => { /* parts ×4 each; screws ceil(32 × 1.1) = 36 */ });
it("treats the bottom on cleats as lifted", () => {
  // a 1×1 custom box 1500 mm wide, mount cleats: shelf-span text starts 'Design "X" stands on cleats, so the floor'
});
it("gives no mount-system warning for cleats on kallax", () => { /* none */ });
```

- [ ] **Step 2: Run the tests and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm run check`.** Expected: PASS.
- [ ] **Step 5: Commit** — `Add the cleats mount: the feet, the top cleats, and their screws`

---

### Task 5: The assembly steps of the corners, the face screws, and the cleats

**Files:**
- Create: `packages/core/src/design/oneColumnSteps.ts`
- Modify: `packages/core/src/design/assembly.ts`, `packages/core/src/design/assemblyTypes.ts`
- Test: `packages/core/test/design/assembly.test.ts`

**Interfaces:**
- Consumes: `designCorners`, `designFastener` (Task 1); `faceScrew`, `cleatScrew` (Task 3); `CLEAT_WIDTH` (Task 4).
- Produces: `LEFT`, `RIGHT`, `TOP`, `BOTTOM` move from `assembly.ts` to `assemblyTypes.ts` and are exported.
  `oneColumnSteps(project: Project, design: Design, geometry: DesignGeometry): AssemblyStep[]` in
  `oneColumnSteps.ts` gives the steps from the first one to the last join step. `assemblySteps` calls it when the
  corners are `sides-over-top` or the fastener is `face-screws`, and keeps the code of today for the other boxes. The
  square, back, mount, anchor, and finish steps after it are shared.

Step order of `oneColumnSteps` (the step text is free, in the style of today, unless quoted here):
1. **Mark the shelf positions** (`mark`, boards the 2 sides), when there is a shelf. Each mark is the distance from the
   bottom end of the side to the underside of the shelf. For his module: 9 13/16", 19 5/8", and 29 7/16" with sides
   over top; 9 1/16", 18 7/8", and 28 11/16" with top over sides.
2. **Drill the pilot holes** (`drill`) for face screws, or **Drill the pocket holes** (`drill`) for pocket screws.
   - Face screws: `pocketHolesPerEnd` holes for each joint, through the board whose face covers the other board's end
     (spec §5.2). The body names the screw from `faceScrew` and has the two sentences `The screw heads show on the
     outer face.` and `A pilot hole keeps the plywood from splitting.` The first step body starts with
     `buildCountText(quantity)`.
   - Pocket screws with sides over top: the holes go in each end of the top (upper face), the bottom (lower face), and
     each shelf (underside), with the jig setting of today.
3. **Cut spacers** (`spacers`), as today, when there is a shelf.
4. Sides over top: **Fit the top and the bottom** (`join`, boards TOP, BOTTOM, LEFT, RIGHT): between the sides, flush
   with their ends, with glue. Then **Fit the shelves** (`join`, the shelf boards), on their marks, with glue.
   Top over sides with face screws: **Assemble column 1 of 1** (`join`, LEFT, the shelves, RIGHT), then **Fit the
   bottom and the top** (`join`, BOTTOM, TOP), with glue and screws through the pilot holes.

The cleats step, in `assemblySteps` for mount `cleats`, in place of a legs, feet, or rail step:
- **Fit the cleats** (`mount`, no boards): glue and screw the 2 feet under the bottom, flush with the left and the right
  outer edges; then glue and screw the 2 top cleats on the top, `c` in from the left and the right outer edges, so the
  feet of the next unit fit outside them. Each strip gets `pocketHolesPerEnd(mm(panelDepth))` screws named by
  `cleatScrew`.
- No **Anchor the unit** step for cleats.

- [ ] **Step 1: Write the failing tests**

```ts
it("builds his module in the order of sides over top", () => {
  // titles: Mark the shelf positions, Drill the pilot holes, Cut spacers, Fit the top and the bottom, Fit the shelves,
  // Check that it is square, Fit the cleats. No Anchor the unit.
});
it("marks the shelves from the bottom end of a full-height side", () => { /* body has 9 13/16", 19 5/8", 29 7/16" */ });
it("says that the heads show and that pilot holes stop splits", () => { /* both exact sentences; '#8 × 2"'; '4 ' holes per joint */ });
it("fits the cleats with 4 screws each", () => { /* body has '3 1/2"' and '#8 × 1 1/4"' */ });
it("uses pocket holes in the top, the bottom, and the shelves with sides over top and pocket screws", () => { /* Drill the pocket holes; jig setting */ });
it("screws through the pilot holes with top over sides and face screws", () => { /* marks 9 1/16" ...; Assemble column 1 of 1; Fit the bottom and the top */ });
it("builds a sides-over-top box with merged rows", () => { /* combined rows: 2 shelves, 2 marks, no throw */ });
it("starts with the build count for a quantity of 2", () => { /* first body starts 'Build 2 of these.' */ });
it("keeps the steps of a box of today", () => { /* the existing assembly tests pass unchanged */ });
```

- [ ] **Step 2: Run the tests and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm run check`.** Expected: PASS.
- [ ] **Step 5: Commit** — `Add the assembly steps of the sides-over-top corners, face screws, and cleats`

---

### Task 6: The drawings of the corners and the cleats

**Files:**
- Modify: `packages/core/src/reports/elevation.ts`
- Test: `packages/core/test/reports/elevation.test.ts` (or the test file of `designElevationSvg` and
  `assemblyDrawings` of today)

**Interfaces:**
- Consumes: `designPanels` with the corners (Task 2), `cleatPositions` (Task 4), the steps of Task 5.
- Produces: `MountShape.kind` gains `"foot"` and `"top-cleat"`.

Rules:
- `mountHeight("cleats")` is the box thickness `t`, so the front view and the step drawings make room for the feet
  below the box.
- The feet are rects `data-mount="foot"` at `y = H`, height `t`, width `c`, at the `cleatPositions` feet. The top cleats
  are rects `data-mount="top-cleat"` at `y = −t`, height `t`, width `c`, at the `cleatPositions` top cleats. Both
  draw as the feet of today (`fill="#444"` in the front view, the mount state in the step drawings).
- The view box of both drawings includes the top cleats.
- The `mount` step text is `Front view with the cleats marked.`
- The step drawings of `oneColumnSteps` mark the boards of each step, as for the steps of today.

- [ ] **Step 1: Write the failing tests**

```ts
it("draws full-height sides with sides over top", () => { /* data-panel="side" y 0 height 40; data-panel="top" x 0.75 width 51 */ });
it("draws the feet under the box and the top cleats on it", () => {
  // his module: 2 foot rects at y 40, x 0 and 49; 2 top-cleat rects at y -0.75, x 3.5 and 45.5; all 3.5 × 0.75
});
it("makes the view box tall enough for the feet and the top cleats", () => { /* viewBox top < -0.75, bottom > 40.75 */ });
it("marks the cleats in the step of the cleats", () => { /* the Fit the cleats drawing: shapes current; text above */ });
it("gives a drawing for each step of his module", () => { /* assemblyDrawings length = assemblySteps length */ });
```

- [ ] **Step 2: Run the tests and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm run check`.** Expected: PASS.
- [ ] **Step 5: Commit** — `Draw the sides-over-top corners, the feet, and the top cleats`

---

### Task 7: The Stacking shelf starter, and the open-top box refusals

**Files:**
- Modify: `packages/core/src/design/starters.ts`, `packages/core/src/design/openBox.ts` (`openBoxErrors`)
- Test: `packages/core/test/design/starters.test.ts`, `packages/core/test/design/openBox.test.ts`

**Interfaces:**
- Consumes: everything of Tasks 1–6.
- Produces: `StarterId` gains `"stacking-shelf"`. `StarterGroup` gains `"Shop storage"`. The starter is in `STARTERS`
  after the crate and before `custom-grid`.

The starter: id `stacking-shelf`, name `Stacking shelf`, group `Shop storage`, no choices, defaults
`{ columns: 1, rows: 4, options: {} }`. Note:
`A shelf module that stacks on cleats, after the shelf system of Evan Monsma. The four openings fit storage boxes 8" high.`
`sources.size`: `{ mm: 1333.5, derived: false, source: 'Evan Monsma, "Starting the shelf system I\'ve always wanted", https://www.youtube.com/watch?v=cRj2tih1IaI: 3/4" plywood, 16" deep, sides 40", panels 51", cleats from 3/4" stock 3 1/2" wide' }`.

The design: `{ system: "custom", name: "Stacking shelf", material, width: { outside: W, cells: 1 },
height: { outside: H, cells: 4 }, depth: D, corners: "sides-over-top", fastener: "face-screws", mount: "cleats",
hiddenWarnings: ["shelf-span"] }`, with no back and no finish. In `in`: W 52.5, H 40, D 16. In `mm`: W 1334, H 1016,
D 406. `starterName` gives `Stacking shelf`. `addStarterDesign` adds no back material for it, whatever `options.back`
is (as for the crate). `starterFits` gives `[]`.

`openBoxErrors` adds, with the `refuse` helper of today:
- `design.corners !== undefined`: `, so it has no corners setting.`
- `design.fastener !== undefined`: `, so it has no fastener setting.`
- `mount: "cleats"` is already refused by the mount rule of today; a test pins it.

- [ ] **Step 1: Write the failing tests**

```ts
it("makes his module in a new in project", () => {
  // createProject("p", "in") + measured 3/4" plywood: addStarterDesign(stacking-shelf), regenerateDesigns
  // parts: Side 40×16 ×2, Top 51×16 ×1, Bottom 51×16 ×1, Shelf 51×16 ×3, Foot 16×3.5 ×2, Top cleat 16×3.5 ×2
  // checkDesigns: no errors, no warnings. outside 52.5 × 40 × 16. Hardware: face-screws 44, cleat-screws 18, glue,
  // no pocket-screws. Materials: only the plywood.
});
it("makes his module with no warnings in a new mm project", () => { /* 18 mm; 1334 × 1016 × 406; checkDesigns [] */ });
it("hides the shelf span, but starterFits reads it", () => {
  // checkDesigns(p, { keepHidden: true }) has shelf-span; checkDesigns(p) has none; starterFits []
});
it("adds no back, even when a back is given", () => { /* options.back "ply6": design.back undefined */ });
it("lists the starter in the Shop storage group, after the crate", () => { /* STARTERS order and group */ });
it("refuses corners, fastener, and cleats on an open-top box", () => {
  // three crates from a file: each gets design-open-box; designParts, assemblySteps, designElevationSvg null
});
```

The core test that runs every starter with every allowed value must include the new starter.

- [ ] **Step 2: Run the tests and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm run check`.** Expected: PASS.
- [ ] **Step 5: Commit** — `Add the Stacking shelf starter, after the shelf system of Evan Monsma`

---

### Task 8: The CLI

**Files:**
- Modify: `packages/cli/src/commands/design.ts`, `docs/cli.md`
- Test: `packages/cli/test/design-write.test.ts`, `packages/cli/test/design-starters.test.ts`,
  `packages/cli/test/design-open-box.test.ts`, `packages/cli/test/design.test.ts`

**Interfaces:**
- Consumes: `DESIGN_CORNERS`, `DESIGN_FASTENERS`, `isDesignCorners`, `isDesignFastener`, `designCorners`,
  `designFastener`, `showHiddenWarnings` (Task 1); the starter (Task 7).

Rules:
- `design add` and `design set` take `--corners <top-over-sides|sides-over-top>` and
  `--fastener <pocket-screws|face-screws>`, read with `optionalChoice`, as `--mount` is. On `design set`, the default
  value removes the field (as `--mount floor` does on an open-top box); another value sets it.
- `--mount cleats` works on `design add` and `design set` of a box.
- An open-top box refuses `--corners` and `--fastener` with exit 2 and `conflict`, in `refuseBackAndMount` (rename it
  to `refuseBoxSettings`). `--starter` refuses `--corners` and `--fastener` with `conflict`, as it refuses `--system`.
- `design add --starter stacking-shelf` refuses `--back` with `conflict`, as for the crate.
- `design set --show-warnings` (boolean) calls `showHiddenWarnings`.
- `design get` (text and `--json`) shows `corners`, `fastener`, and `hiddenWarnings`, each only when the design has
  the field.
- `assertValid` and the `design-invalid` reason treat an unknown corners or fastener value as an unknown kind:
  `The design X has the corners "V", which this CLI does not know. Use design detach or design remove.` and the
  same with `the fastener`.
- `docs/cli.md` documents the flags, `cleats`, `--show-warnings`, and an example of `--starter stacking-shelf`.

- [ ] **Step 1: Write the failing tests**

```ts
it("adds his module with --starter stacking-shelf", () => { /* exit 0; parts as in Task 7; no back */ });
it("refuses --back with the stacking shelf", () => { /* exit 2, conflict */ });
it("sets the corners, the fastener, and the cleats with design set", () => { /* fields in the file; parts change */ });
it("removes the corners field with --corners top-over-sides", () => { /* no corners key */ });
it("refuses face screws on a 2-column box", () => { /* exit 1, invalid-value, design-one-column in error.issues */ });
it("clears the hidden warnings with --show-warnings", () => { /* no hiddenWarnings key; design get shows shelf-span */ });
it("shows corners, fastener, and hidden warnings in design get", () => { /* text and json */ });
it("refuses --corners and --fastener on an open-top box", () => { /* exit 2, conflict, on add and set */ });
it("refuses a design with an unknown corners value", () => { /* design set on corners "mitred": exit 1, invalid-value */ });
```

- [ ] **Step 2: Run the tests and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm run check`.** Expected: PASS.
- [ ] **Step 5: Commit** — `Add the corners, the fastener, the cleats, and --show-warnings to the CLI`

---

### Task 9: The web app, the docs, and an e2e test

**Files:**
- Modify: `apps/web/src/screens/DesignTab.tsx`, `apps/web/src/design/StarterDialog.tsx` (only if the group list is
  not derived from `STARTERS`), `docs/web-app.md`, `README.md` (the Designs bullet), `docs/backlog.md`
- Test: `apps/web/test/DesignTab.test.tsx`, `apps/web/test/StarterDialog.test.tsx`, `apps/web/e2e/plan.e2e.ts`

**Interfaces:**
- Consumes: Tasks 1–7.

Rules:
- The box editor gets a **Corners** select (`Top over the sides`, `Sides over the top`) and a **Fastener** select
  (`Pocket screws`, `Face screws`) next to the **Mount** select, in the same row style. The default value removes the
  field. A refused change shows the design error as the other fields do today. An unknown value shows as
  `<value> (unknown)`, as the mount does.
- The `locked` message covers an unknown corners or fastener value:
  `This design has the corners "V", which this app does not know. Its parts stay as they are.` and the same with
  `uses the fastener`.
- The hidden-warnings line, when the design has `hiddenWarnings`: `This design hides N warning: a.` or
  `This design hides N warnings: a and b.` The names are the codes with `-` as a space, joined as `joinList` joins.
  The button `Show it` (1 code) or `Show them` (more) calls `showHiddenWarnings`.
- The starter dialog shows the **Shop storage** group and the starter, with its note and no Fits line.
- `docs/backlog.md` item 34, `The stacking shelf of Evan Monsma`, status Done, in the style of item 24. The README and
  `docs/web-app.md` describe the three settings and the hidden-warnings line.

- [ ] **Step 1: Write the failing tests**

```ts
it("sets the corners and the fastener of a box", () => { /* select Sides over the top: the Side part is H long */ });
it("shows the cleats in the mount select", () => { /* option Cleats; picking it adds Foot and Top cleat parts */ });
it("shows the hidden warnings and shows them again", () => {
  // design with hiddenWarnings ["shelf-span"]: 'This design hides 1 warning: shelf span.'; click Show it: the line goes,
  // and the shelf-span warning shows
});
it("locks a design with an unknown fastener", () => { /* message above; fieldset disabled */ });
it("lists the Stacking shelf in the Shop storage group", () => { /* StarterDialog; Use this design adds it */ });
```

e2e (`plan.e2e.ts`): add the Stacking shelf from the starter dialog, see the Foot and Top cleat parts on the Parts tab,
and see the **Fit the cleats** step on the Assembly tab.

- [ ] **Step 2: Run the tests and see them fail.**
- [ ] **Step 3: Implement, and update the docs.**
- [ ] **Step 4: Run `npm run check` and `npm run e2e`.** Expected: PASS.
- [ ] **Step 5: Commit** — `Add the corners, the fastener, the cleats, and the hidden warnings to the Design tab`
