# Box construction implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every design a box: the top and the bottom run the full width, the sides and the dividers fit between them, and the shelves fill the rest, with the parts, the front view, the hardware, and the assembly steps to match.

**Architecture:** A new pure function `designPanels(geometry)` in `design/panels.ts` gives the panels and the cells of one unit in the front view. The front view draws from it, and a property test checks it against `buildDesignParts`, which now makes the parts top, bottom, side, divider, and shelf. The file format does not change: generated parts are derived data, so an old file gets the new parts at its next write. The hardware count and the assembly steps then follow the new joints.

**Tech Stack:** TypeScript strict (`erasableSyntaxOnly`), Vitest, fast-check, React 19 with Testing Library, Playwright, npm workspaces (`packages/core`, `packages/cli`, `apps/web`).

**Spec:** `docs/superpowers/specs/2026-09-30-box-construction-design.md`

## Global Constraints

- The file format does not change. No migration: an old file shows `design-stale` until its next write, and then gets the new parts. Copies of the old parts leave the sheets.
- Part ids and names: `<design>-top` "Top", `<design>-bottom` "Bottom", `<design>-side` "Side", `<design>-divider` "Divider", `<design>-shelf` "Shelf" (or `<design>-shelf-<k>` "Shelf k" for more than one opening size), `<design>-back` "Back". This order.
- Sizes: top and bottom W × D (×q); side (H − 2t) × D (×2q); divider (H − 2t) × D (×(n − 1)q); shelf column opening × D (×(m − 1) × the columns with that opening × q); back H × W (×q).
- Pocket screws: ends = 2 × (2 + (n − 1)) + 2 × n × (m − 1); the count is ends × `pocketHolesPerEnd(D)` × q, plus 10 %, rounded up.
- Back screws: the perimeter, each divider edge (H − 2t long), and each shelf edge (its column opening).
- Front view: `data-panel` values `top`, `bottom`, `side`, `divider`, and `shelf`.
- The design checks do not change.
- User-visible text is in ASD-STE100 Simplified Technical English: active voice, short sentences, articles kept.
- No comment that restates the code. Match the file's comment density.
- `npm run check` (lint, typecheck, tests, build) and `npm run e2e -w @opencutplan/web` pass at the end of every task.
- Each commit ends with `-m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"`.

## Review Focus

1. A file saved with the ladder construction (parts `<id>-vertical` and `<id>-horizontal`, with copies on the sheets): it loads with `design-stale`, and the next write replaces the parts and takes their copies off the sheets, with no `design-conflict` (Task 1 test "replaces the parts of a file from the ladder construction, and takes their copies off the sheets").
2. A grid with 1 column or 1 row: no divider part or no shelf part, a front view that still fills the outside, and assembly steps that leave out the marks, the spacers, and the columns (Task 1 tests "has no divider for one column, and neither a divider nor a shelf for 1×1" and the `designPanels` property test with 1 to 5 columns and rows; Task 2 tests "counts the ends of the sides, the dividers, and the shelves of the box" and "leaves out the dividers for 1 column and the shelves for 1 row").
3. Columns with different openings: one shelf part for each size, and the divider marks add the openings and the thicknesses from the left (Task 1 test "makes one shelf part for each opening size, in column order"; Task 2 test "gives one spacer pair for each opening under a shelf, a mark for each divider, and one step for each column").
4. An inch project with 23/32" stock: the side is H − 2t with no rounding drift, a unit change and back keeps every placed copy, and the marks show in inches (the `eket-wall-in` example; CLI test "keeps every placed copy when the units change"; Task 2 test "gives the lengths in the project units").
5. A change of the rows only: the top and the bottom keep their copies on the sheets, and only the side and the divider go to the tray (CLI test "makes the parts again, keeps the copies that still fit, and lists what changed").

## Decisions

These are calls the spec leaves open. The plan makes them; the executor does not revisit them.

1. Task 1 changes the parts and the front view, and every test and doc that names the old parts, in one task. The CLI and web tests read the part ids, so a split would leave `npm run check` red between tasks. Task 2 changes the hardware and the assembly steps, and the tests that count them.
2. The assembly text is singular where the count is 1: "the shelf" for one shelf, "Put the shelf of this column … on its mark … screw it", and "the other ends of the shelf". The generic sentences keep the spec wording with "each divider" and "the sides and the dividers", also for one divider.
3. Spec step 5 says "Then put the next divider (or the right side, for the last column)". The plan writes the one that applies: "the next divider" for every column but the last, and "the right side" for the last.
4. With 1 row, the fit step reads "Stand the sides and the dividers on the bottom, with each divider on its mark, and screw them to it through the pocket holes in their ends. Then fit the top the same way." With 1 column, "and the dividers" and the mark clause go away.
5. The step "Mark the divider positions" comes after "Mark the shelf positions", and the step "Fit the bottom and the top" comes after the columns and before "Check that it is square", as in spec section 7.
6. `pocketHoleEnds(geometry)` is a new export of `hardware.ts`, so the hardware test can check the 14 ends of the spec example directly.
7. The `design-too-large` test uses a quantity of 5 in place of 4: a 50 × 50 grid now has 49 × 50 shelves for each unit, so 4 units stay under 10 000 copies.

## File Structure

- `packages/core/src/design/panels.ts` (create): `designPanels`, `Panel`, `PanelKind`, and `Cell`.
- `packages/core/src/design/parts.ts` (modify): the box parts.
- `packages/core/src/reports/elevation.ts` (modify): draws from `designPanels`.
- `packages/core/src/index.ts` (modify): exports `panels.ts`.
- `packages/core/src/design/hardware.ts` (modify): `pocketHoleEnds`, the pocket screw count, and the divider edges of the back.
- `packages/core/src/design/assembly.ts` (modify): the steps of spec section 7.
- `packages/cli/src/commands/design.ts` (modify): the `design add` help text.
- `examples/kallax-2x4-mm.cutplan.json`, `examples/eket-wall-in.cutplan.json`, and their CSV files: made again by `npm run examples`.
- `docs/format.md`, `docs/cli.md`, `docs/superpowers/specs/2026-09-29-cabinet-generator-design.md` (modify).
- Tests: new `packages/core/test/design/panels.test.ts`; changes to the design, report, example, and search tests in core, to the design and flow tests in the CLI, and to the web tests and the e2e test.

Every worktree needs the git-ignored workspace links before tests run:

```bash
mkdir -p node_modules/@opencutplan
ln -sfn ../../packages/core node_modules/@opencutplan/core
ln -sfn ../../packages/cli node_modules/@opencutplan/cli
ln -sfn ../../apps/web node_modules/@opencutplan/web
```

---

### Task 1: The box parts and the front view

**Files:**
- Create: `packages/core/src/design/panels.ts`
- Modify: `packages/core/src/design/parts.ts`, `packages/core/src/reports/elevation.ts`, `packages/core/src/index.ts`, `packages/cli/src/commands/design.ts`
- Modify (made again): `examples/kallax-2x4-mm.cutplan.json`, `examples/eket-wall-in.cutplan.json`, `examples/csv/kallax-2x4-mm-parts.csv`, `examples/csv/eket-wall-in-parts.csv`
- Modify: `docs/format.md`, `docs/cli.md`, `docs/superpowers/specs/2026-09-29-cabinet-generator-design.md`
- Test: `packages/core/test/design/panels.test.ts` (create), `packages/core/test/design/parts.test.ts`, `packages/core/test/reports/elevation.test.ts`, `packages/core/test/design/generate.test.ts`, `packages/core/test/design/errors.test.ts`, `packages/core/test/design/checks.test.ts`, `packages/core/test/design/edit.test.ts`, `packages/core/test/examples.test.ts`, `packages/core/test/helpers.ts`, `packages/core/test/optimize/search.test.ts`, `packages/cli/test/design.test.ts`, `packages/cli/test/design-write.test.ts`, `packages/cli/test/flow.test.ts`, `apps/web/test/helpers.ts`, `apps/web/test/useProject.test.tsx`, `apps/web/test/DesignTab.test.tsx`, `apps/web/test/PartsTab.test.tsx`, `apps/web/test/Workspace.test.tsx`, `apps/web/e2e/plan.e2e.ts`

**Interfaces:**
- Consumes: `DesignGeometry` (`thickness`, `columns`, `rows` from top to bottom, `outsideWidth`, `outsideHeight`, `panelDepth`) and `roundLength` from `packages/core/src/design/geometry.ts`.
- Produces, in `panels.ts` (exported from the package index):
  - `type PanelKind = "top" | "bottom" | "side" | "divider" | "shelf"`
  - `interface Panel { kind: PanelKind; x: number; y: number; width: number; height: number }` (from the top-left corner of the front)
  - `interface Cell { column: number; row: number; x: number; y: number; width: number; height: number }`
  - `designPanels(geometry: DesignGeometry): { panels: Panel[]; cells: Cell[] }`
- Produces: `buildDesignParts` gives the parts `<design>-top`, `-bottom`, `-side`, `-divider` (only with 2 or more columns), `-shelf` or `-shelf-<k>` (only with 2 or more rows), and `-back`, in this order.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/design/panels.test.ts` with this content:

```ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildDesignParts, designGeometry, designPanels, materialsById, roundLength, type Design, type Panel } from "../../src/index.ts";
import { designProject, kallaxDesign } from "../helpers.ts";

const geometryOf = (design: Design) => designGeometry(design, materialsById(designProject()))!;
const area = (r: { width: number; height: number }) => r.width * r.height;
const overlap = (a: Panel, b: Panel) =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1e-6 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1e-6;

describe("designPanels", () => {
  it("puts the top and the bottom across the full width, and the sides, the divider, and the shelves between them", () => {
    const { panels, cells } = designPanels(geometryOf(kallaxDesign()));
    const of = (kind: Panel["kind"]) => panels.filter((panel) => panel.kind === kind);
    expect(of("top")).toEqual([{ kind: "top", x: 0, y: 0, width: 724, height: 18 }]);
    expect(of("bottom")).toEqual([{ kind: "bottom", x: 0, y: 1412, width: 724, height: 18 }]);
    expect(of("side")).toEqual([
      { kind: "side", x: 0, y: 18, width: 18, height: 1394 },
      { kind: "side", x: 706, y: 18, width: 18, height: 1394 },
    ]);
    expect(of("divider")).toEqual([{ kind: "divider", x: 353, y: 18, width: 18, height: 1394 }]);
    expect(of("shelf")).toHaveLength(6);
    expect(of("shelf")[0]).toEqual({ kind: "shelf", x: 18, y: 353, width: 335, height: 18 });
    expect(cells).toHaveLength(8);
    expect(cells[0]).toEqual({ column: 0, row: 0, x: 18, y: 18, width: 335, height: 335 });
  });

  it("fills the outside with panels and cells that do not overlap, and matches the parts", () => {
    const opening = fc.integer({ min: 50, max: 600 });
    const arb = fc.record({
      columns: fc.array(opening, { minLength: 1, maxLength: 5 }),
      rows: fc.array(opening, { minLength: 1, maxLength: 5 }),
      thickness: fc.constantFrom(12, 15, 18, 25),
    });
    fc.assert(
      fc.property(arb, ({ columns, rows, thickness }) => {
        const design = kallaxDesign({ system: "custom", width: { openings: columns }, height: { openings: rows } });
        const geometry = { ...geometryOf(design), thickness };
        geometry.outsideWidth = roundLength(columns.reduce((a, b) => a + b, 0) + (columns.length + 1) * thickness);
        geometry.outsideHeight = roundLength(rows.reduce((a, b) => a + b, 0) + (rows.length + 1) * thickness);
        const { panels, cells } = designPanels(geometry);
        const rects = [...panels, ...cells.map((cell) => ({ ...cell, kind: "cell" as never }))];
        for (let i = 0; i < rects.length; i++) {
          const r = rects[i]!;
          expect(r.x).toBeGreaterThanOrEqual(-1e-9);
          expect(r.y).toBeGreaterThanOrEqual(-1e-9);
          expect(r.x + r.width).toBeLessThanOrEqual(geometry.outsideWidth + 1e-9);
          expect(r.y + r.height).toBeLessThanOrEqual(geometry.outsideHeight + 1e-9);
          for (let j = i + 1; j < rects.length; j++) expect(overlap(r, rects[j]!)).toBe(false);
        }
        const covered = rects.reduce((sum, r) => sum + area(r), 0);
        expect(covered).toBeCloseTo(geometry.outsideWidth * geometry.outsideHeight, 6);

        const drawn = new Map<string, number>();
        for (const panel of panels) {
          const kind = panel.kind === "shelf" ? "shelf" : panel.kind;
          const length = panel.kind === "side" || panel.kind === "divider" ? panel.height : panel.width;
          const key = `${kind}:${roundLength(length)}`;
          drawn.set(key, (drawn.get(key) ?? 0) + 1);
        }
        const expected = new Map<string, number>();
        for (const part of buildDesignParts(design, geometry)) {
          const kind = part.id.replace(/^kx-/, "").replace(/-\d+$/, "");
          const key = `${kind}:${roundLength(part.length)}`;
          expected.set(key, (expected.get(key) ?? 0) + part.quantity);
        }
        expect(drawn).toEqual(expected);
      }),
      { numRuns: 200 },
    );
  });
});
```

Apply this change to `packages/core/test/design/parts.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/test/design/parts.test.ts b/packages/core/test/design/parts.test.ts
index 8530a9a..e5da922 100644
--- a/packages/core/test/design/parts.test.ts
+++ b/packages/core/test/design/parts.test.ts
@@ -9,33 +9,58 @@ function build(design: Design): Part[] {
 const summary = (parts: Part[]) => parts.map((part) => [part.id, part.name, part.material, part.length, part.width, part.quantity]);
 
 describe("buildDesignParts", () => {
-  it("makes 3 vertical panels and 10 shelves for a KALLAX 2×4", () => {
+  it("makes a box for a KALLAX 2×4: a full-width top and bottom, the sides and the divider between them, and the shelves", () => {
     const parts = build(kallaxDesign());
     expect(summary(parts)).toEqual([
-      ["kx-vertical", "Vertical panel", "ply18", 1430, 390, 3],
-      ["kx-horizontal", "Shelf", "ply18", 335, 390, 10],
+      ["kx-top", "Top", "ply18", 724, 390, 1],
+      ["kx-bottom", "Bottom", "ply18", 724, 390, 1],
+      ["kx-side", "Side", "ply18", 1394, 390, 2],
+      ["kx-divider", "Divider", "ply18", 1394, 390, 1],
+      ["kx-shelf", "Shelf", "ply18", 335, 390, 6],
     ]);
     expect(parts[0]).toEqual({
-      id: "kx-vertical",
-      name: "Vertical panel",
+      id: "kx-top",
+      name: "Top",
       material: "ply18",
-      length: 1430,
+      length: 724,
       width: 390,
-      quantity: 3,
+      quantity: 1,
       grain: "length",
       group: "Hall KALLAX",
       design: "kx",
     });
   });
 
-  it("multiplies by the quantity and adds the back for an EKET 2×1", () => {
+  it("multiplies by the quantity, adds the back, and has no shelf for one row", () => {
     expect(summary(build(eketDesign()))).toEqual([
-      ["ek-vertical", "Vertical panel", "ply18", 350, 344, 6],
-      ["ek-horizontal", "Shelf", "ply18", 323, 344, 8],
+      ["ek-top", "Top", "ply18", 700, 344, 2],
+      ["ek-bottom", "Bottom", "ply18", 700, 344, 2],
+      ["ek-side", "Side", "ply18", 314, 344, 4],
+      ["ek-divider", "Divider", "ply18", 314, 344, 2],
       ["ek-back", "Back", "ply6", 350, 700, 2],
     ]);
   });
 
+  it("has no divider for one column, and neither a divider nor a shelf for 1×1", () => {
+    expect(summary(build(kallaxDesign({ width: { openings: [335] }, height: { openings: [335, 335, 335] } })))).toEqual([
+      ["kx-top", "Top", "ply18", 371, 390, 1],
+      ["kx-bottom", "Bottom", "ply18", 371, 390, 1],
+      ["kx-side", "Side", "ply18", 1041, 390, 2],
+      ["kx-shelf", "Shelf", "ply18", 335, 390, 2],
+    ]);
+    expect(summary(build(kallaxDesign({ width: { openings: [335, 335, 335] }, height: { openings: [335] } })))).toEqual([
+      ["kx-top", "Top", "ply18", 1077, 390, 1],
+      ["kx-bottom", "Bottom", "ply18", 1077, 390, 1],
+      ["kx-side", "Side", "ply18", 335, 390, 2],
+      ["kx-divider", "Divider", "ply18", 335, 390, 2],
+    ]);
+    expect(summary(build(kallaxDesign({ width: { openings: [335] }, height: { openings: [335] } })))).toEqual([
+      ["kx-top", "Top", "ply18", 371, 390, 1],
+      ["kx-bottom", "Bottom", "ply18", 371, 390, 1],
+      ["kx-side", "Side", "ply18", 335, 390, 2],
+    ]);
+  });
+
   it("makes one shelf part for each opening size, in column order", () => {
     const design: Design = {
       id: "cu",
@@ -47,9 +72,12 @@ describe("buildDesignParts", () => {
       depth: 390,
     };
     expect(summary(build(design))).toEqual([
-      ["cu-vertical", "Vertical panel", "ply18", 718, 390, 4],
-      ["cu-horizontal-1", "Shelf 1", "ply18", 335, 390, 6],
-      ["cu-horizontal-2", "Shelf 2", "ply18", 400, 390, 3],
+      ["cu-top", "Top", "ply18", 1142, 390, 1],
+      ["cu-bottom", "Bottom", "ply18", 1142, 390, 1],
+      ["cu-side", "Side", "ply18", 682, 390, 2],
+      ["cu-divider", "Divider", "ply18", 682, 390, 2],
+      ["cu-shelf-1", "Shelf 1", "ply18", 335, 390, 2],
+      ["cu-shelf-2", "Shelf 2", "ply18", 400, 390, 1],
     ]);
   });
 });
```

Apply this change to `packages/core/test/reports/elevation.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/test/reports/elevation.test.ts b/packages/core/test/reports/elevation.test.ts
index 9c978cb..1cff59b 100644
--- a/packages/core/test/reports/elevation.test.ts
+++ b/packages/core/test/reports/elevation.test.ts
@@ -10,10 +10,14 @@ describe("designElevationSvg", () => {
     const svg = designElevationSvg(project, "kx")!;
     expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="-143 -143 1010 1716" width="1010mm" height="1716mm"/);
     expect(svg).toContain("<title>Hall KALLAX: 724 mm × 1430 mm × 390 mm</title>");
-    expect(count(svg, /data-panel="vertical"/g)).toBe(3);
-    expect(count(svg, /data-panel="horizontal"/g)).toBe(10);
-    expect(svg).toContain('<rect data-panel="vertical" x="353" y="0" width="18" height="1430"');
-    expect(svg).toContain('<rect data-panel="horizontal" x="18" y="353" width="335" height="18"');
+    expect(count(svg, /data-panel="top"/g)).toBe(1);
+    expect(count(svg, /data-panel="bottom"/g)).toBe(1);
+    expect(count(svg, /data-panel="side"/g)).toBe(2);
+    expect(count(svg, /data-panel="divider"/g)).toBe(1);
+    expect(count(svg, /data-panel="shelf"/g)).toBe(6);
+    expect(svg).toContain('<rect data-panel="top" x="0" y="0" width="724" height="18"');
+    expect(svg).toContain('<rect data-panel="divider" x="353" y="18" width="18" height="1394"');
+    expect(svg).toContain('<rect data-panel="shelf" x="18" y="353" width="335" height="18"');
     expect(count(svg, />335 mm × 335 mm</g)).toBe(8);
     expect(svg).toContain(">724 mm</text>");
     expect(svg).toContain(">1430 mm</text>");
```

Apply this change to `packages/core/test/design/generate.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/test/design/generate.test.ts b/packages/core/test/design/generate.test.ts
index b751c60..7542202 100644
--- a/packages/core/test/design/generate.test.ts
+++ b/packages/core/test/design/generate.test.ts
@@ -29,16 +29,16 @@ function withDesign(project: Project, patch: Partial<Design>): Project {
 
 describe("regenerateDesigns", () => {
   it("adds the parts of a design that has none", () => {
-    expect(ids(regenerateDesigns(designProject([kallaxDesign(), eketDesign()])))).toEqual(["kx-vertical", "kx-horizontal", "ek-vertical", "ek-horizontal", "ek-back"]);
+    expect(ids(regenerateDesigns(designProject([kallaxDesign(), eketDesign()])))).toEqual(["kx-top", "kx-bottom", "kx-side", "kx-divider", "kx-shelf", "ek-top", "ek-bottom", "ek-side", "ek-divider", "ek-back"]);
   });
 
   it("keeps the other parts, and puts the design's parts where they were", () => {
     const side: Part = { id: "side", name: "Side", material: "ply18", length: 900, width: 300, quantity: 2, grain: "length" };
     const top: Part = { id: "top", name: "Top", material: "ply18", length: 800, width: 300, quantity: 1, grain: "length" };
     const once = regenerateDesigns({ ...designProject(), parts: [side] });
-    expect(ids(once)).toEqual(["side", "kx-vertical", "kx-horizontal"]);
-    const moved = { ...once, parts: [once.parts[1]!, once.parts[2]!, side, top] };
-    expect(ids(regenerateDesigns(withDesign(moved, { width: { openings: [335, 335, 335] } })))).toEqual(["kx-vertical", "kx-horizontal", "side", "top"]);
+    expect(ids(once)).toEqual(["side", "kx-top", "kx-bottom", "kx-side", "kx-divider", "kx-shelf"]);
+    const moved = { ...once, parts: [...once.parts.slice(1), side, top] };
+    expect(ids(regenerateDesigns(withDesign(moved, { width: { openings: [335, 335, 335] } })))).toEqual(["kx-top", "kx-bottom", "kx-side", "kx-divider", "kx-shelf", "side", "top"]);
   });
 
   it("returns the same object when the parts are current", () => {
@@ -50,43 +50,64 @@ describe("regenerateDesigns", () => {
 
   it("keeps a copy on its sheet when its part keeps the same id and size", () => {
     const once = placed(regenerateDesigns(designProject()), [
-      { part: "kx-vertical", copy: 2 },
-      { part: "kx-horizontal", copy: 9 },
+      { part: "kx-top", copy: 0 },
+      { part: "kx-side", copy: 1 },
+      { part: "kx-divider", copy: 0 },
+      { part: "kx-shelf", copy: 5 },
     ]);
     const wider = regenerateDesigns(withDesign(once, { width: { openings: [335, 335, 335] } }));
-    expect(wider.parts.map((p) => [p.id, p.quantity])).toEqual([
-      ["kx-vertical", 4],
-      ["kx-horizontal", 15],
+    expect(wider.parts.map((p) => [p.id, p.length, p.quantity])).toEqual([
+      ["kx-top", 1077, 1],
+      ["kx-bottom", 1077, 1],
+      ["kx-side", 1394, 2],
+      ["kx-divider", 1394, 2],
+      ["kx-shelf", 335, 9],
     ]);
-    expect(onSheet(wider)).toEqual(["kx-vertical#2", "kx-horizontal#9"]);
+    expect(onSheet(wider)).toEqual(["kx-side#1", "kx-divider#0", "kx-shelf#5"]);
   });
 
   it("drops the copies of a part whose size changes, and the copies above the new quantity", () => {
     const once = placed(regenerateDesigns(designProject()), [
-      { part: "kx-vertical", copy: 0 },
-      { part: "kx-horizontal", copy: 1 },
-      { part: "kx-horizontal", copy: 9 },
+      { part: "kx-side", copy: 0 },
+      { part: "kx-shelf", copy: 1 },
+      { part: "kx-shelf", copy: 5 },
     ]);
     const shorter = regenerateDesigns(withDesign(once, { height: { openings: [335, 335, 335] } }));
-    expect(shorter.parts[0]!.length).toBe(1077);
-    expect(onSheet(shorter)).toEqual(["kx-horizontal#1"]);
+    expect(shorter.parts.find((p) => p.id === "kx-side")!.length).toBe(1041);
+    expect(onSheet(shorter)).toEqual(["kx-shelf#1"]);
 
-    const edited = { ...once, parts: once.parts.map((p) => (p.id === "kx-vertical" ? { ...p, length: 1400 } : p)) };
+    const edited = { ...once, parts: once.parts.map((p) => (p.id === "kx-side" ? { ...p, length: 1400 } : p)) };
     const restored = regenerateDesigns(edited);
-    expect(restored.parts[0]!.length).toBe(1430);
-    expect(onSheet(restored)).toEqual(["kx-horizontal#1", "kx-horizontal#9"]);
+    expect(restored.parts.find((p) => p.id === "kx-side")!.length).toBe(1394);
+    expect(onSheet(restored)).toEqual(["kx-shelf#1", "kx-shelf#5"]);
   });
 
   it("drops the copies of a part that the design no longer makes", () => {
     const once = placed(regenerateDesigns(designProject([eketDesign()])), [
       { part: "ek-back", copy: 0 },
-      { part: "ek-vertical", copy: 0 },
+      { part: "ek-side", copy: 0 },
     ]);
     const open = regenerateDesigns({ ...once, designs: [{ ...eketDesign(), back: undefined }] });
-    expect(ids(open)).toEqual(["ek-vertical", "ek-horizontal"]);
+    expect(ids(open)).toEqual(["ek-top", "ek-bottom", "ek-side", "ek-divider"]);
     expect(onSheet(open)).toEqual([]);
   });
 
+  it("replaces the parts of a file from the ladder construction, and takes their copies off the sheets", () => {
+    const ladder: Part[] = [
+      { id: "kx-vertical", name: "Vertical panel", material: "ply18", length: 1430, width: 390, quantity: 3, grain: "length", group: "Hall KALLAX", design: "kx" },
+      { id: "kx-horizontal", name: "Shelf", material: "ply18", length: 335, width: 390, quantity: 10, grain: "length", group: "Hall KALLAX", design: "kx" },
+    ];
+    const old = placed({ ...designProject(), parts: ladder }, [
+      { part: "kx-vertical", copy: 0 },
+      { part: "kx-horizontal", copy: 9 },
+    ]);
+    expect(checkDesigns(old).map((issue) => issue.code)).toEqual(["design-stale"]);
+    const next = regenerateDesigns(old);
+    expect(ids(next)).toEqual(["kx-top", "kx-bottom", "kx-side", "kx-divider", "kx-shelf"]);
+    expect(onSheet(next)).toEqual([]);
+    expect(checkDesigns(next)).toEqual([]);
+  });
+
   it("leaves the stored parts of a file from a newer minor version alone", () => {
     const once = regenerateDesigns(designProject());
     const nested = { ...once.parts[1]!, id: "kx-cell-1-1-horizontal", name: "Nested shelf" };
@@ -101,7 +122,7 @@ describe("regenerateDesigns", () => {
     expect(regenerateDesigns(missing)).toBe(missing);
     const unknown = withDesign(once, { system: "pax", width: { openings: [500] } });
     expect(regenerateDesigns(unknown)).toBe(unknown);
-    const manual: Part = { id: "kx-vertical", name: "Side", material: "ply18", length: 900, width: 300, quantity: 2, grain: "length" };
+    const manual: Part = { id: "kx-side", name: "Side", material: "ply18", length: 900, width: 300, quantity: 2, grain: "length" };
     const conflict = designProject();
     conflict.parts = [manual];
     expect(regenerateDesigns(conflict).parts).toEqual([manual]);
@@ -155,8 +176,10 @@ describe("regenerateDesigns on random grids", () => {
         const once = regenerateDesigns(randomProject(input));
         expect(regenerateDesigns(once)).toBe(once);
         const geometry = designGeometry(once.designs![0]!, materialsById(once))!;
-        const vertical = once.parts.find((p) => p.id === "d-vertical")!;
-        expect(vertical.length).toBeCloseTo(geometry.rows.reduce((a, b) => a + b, 0) + (geometry.rows.length + 1) * geometry.thickness, 6);
+        const side = once.parts.find((p) => p.id === "d-side")!;
+        const top = once.parts.find((p) => p.id === "d-top")!;
+        expect(side.length + 2 * geometry.thickness).toBeCloseTo(geometry.rows.reduce((a, b) => a + b, 0) + (geometry.rows.length + 1) * geometry.thickness, 6);
+        expect(top.length).toBeCloseTo(geometry.outsideWidth, 6);
         expect(geometry.columns.reduce((a, b) => a + b, 0) + (geometry.columns.length + 1) * geometry.thickness).toBeCloseTo(geometry.outsideWidth, 6);
       }),
     );
```

Apply this change to `packages/core/test/design/errors.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/test/design/errors.test.ts b/packages/core/test/design/errors.test.ts
index 9b48299..7386068 100644
--- a/packages/core/test/design/errors.test.ts
+++ b/packages/core/test/design/errors.test.ts
@@ -42,23 +42,23 @@ describe("designErrors", () => {
 
   it("reports a design that needs more than 10000 copies of one part", () => {
     const hundreds = { openings: Array.from({ length: 50 }, () => 100) };
-    expect(codes(designProject(), kallaxDesign({ width: hundreds, height: hundreds, quantity: 4 }))).toEqual(["design-too-large"]);
+    expect(codes(designProject(), kallaxDesign({ width: hundreds, height: hundreds, quantity: 5 }))).toEqual(["design-too-large"]);
   });
 
   it("reports a part that already uses a generated id", () => {
     const project = designProject();
-    project.parts = [{ id: "kx-vertical", name: "Side", material: "ply18", length: 900, width: 300, quantity: 2, grain: "length" }];
+    project.parts = [{ id: "kx-side", name: "Side", material: "ply18", length: 900, width: 300, quantity: 2, grain: "length" }];
     const issues = designErrors(project, kallaxDesign());
     expect(issues.map((issue) => issue.code)).toEqual(["design-conflict"]);
     expect(issues[0]!.refs).toEqual([
       { kind: "design", design: "kx" },
-      { kind: "part", part: "kx-vertical", copy: 0 },
+      { kind: "part", part: "kx-side", copy: 0 },
     ]);
   });
 
   it("does not report the design's own stored parts as a conflict", () => {
     const project = designProject();
-    project.parts = [{ id: "kx-vertical", name: "Vertical panel", material: "ply18", length: 1430, width: 390, quantity: 3, grain: "length", design: "kx" }];
+    project.parts = [{ id: "kx-side", name: "Side", material: "ply18", length: 1394, width: 390, quantity: 2, grain: "length", design: "kx" }];
     expect(codes(project, kallaxDesign())).toEqual([]);
   });
 });
```

Apply this change to `packages/core/test/design/checks.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/test/design/checks.test.ts b/packages/core/test/design/checks.test.ts
index c446aa2..6cbfdcf 100644
--- a/packages/core/test/design/checks.test.ts
+++ b/packages/core/test/design/checks.test.ts
@@ -71,7 +71,7 @@ describe("checkDesigns", () => {
 
   it("warns when the stored parts do not match the design", () => {
     const once = current(kallaxDesign());
-    const edited = { ...once, parts: once.parts.map((p) => (p.id === "kx-vertical" ? { ...p, length: 1400 } : p)) };
+    const edited = { ...once, parts: once.parts.map((p) => (p.id === "kx-side" ? { ...p, length: 1400 } : p)) };
     expect(codes(edited)).toEqual(["warning:design-stale"]);
     expect(codes(designProject())).toEqual(["warning:design-stale"]);
   });
```

Apply this change to `packages/core/test/design/edit.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/test/design/edit.test.ts b/packages/core/test/design/edit.test.ts
index 1a8dd43..f82f7b8 100644
--- a/packages/core/test/design/edit.test.ts
+++ b/packages/core/test/design/edit.test.ts
@@ -49,8 +49,8 @@ describe("removeDesign", () => {
     const project = placed(regenerateDesigns({ ...designProject([kallaxDesign(), eketDesign()]), parts: [side] }));
     const next = removeDesign(project, "kx");
     expect(next.designs!.map((d) => d.id)).toEqual(["ek"]);
-    expect(next.parts.map((p) => p.id)).toEqual(["side", "ek-vertical", "ek-horizontal", "ek-back"]);
-    expect(onSheet(next)).toEqual(["side", "ek-vertical", "ek-horizontal", "ek-back"]);
+    expect(next.parts.map((p) => p.id)).toEqual(["side", "ek-top", "ek-bottom", "ek-side", "ek-divider", "ek-back"]);
+    expect(onSheet(next)).toEqual(["side", "ek-top", "ek-bottom", "ek-side", "ek-divider", "ek-back"]);
   });
 
   it("leaves no designs field when the last design goes", () => {
@@ -66,11 +66,14 @@ describe("detachDesign", () => {
     const next = detachDesign(project, "kx");
     expect("designs" in next).toBe(false);
     expect(next.parts.map((p) => [p.id, p.design])).toEqual([
-      ["kx-vertical", undefined],
-      ["kx-horizontal", undefined],
+      ["kx-top", undefined],
+      ["kx-bottom", undefined],
+      ["kx-side", undefined],
+      ["kx-divider", undefined],
+      ["kx-shelf", undefined],
     ]);
     expect("design" in next.parts[0]!).toBe(false);
-    expect(onSheet(next)).toEqual(["kx-vertical", "kx-horizontal"]);
+    expect(onSheet(next)).toEqual(["kx-top", "kx-bottom", "kx-side", "kx-divider", "kx-shelf"]);
     expect(regenerateDesigns(next)).toBe(next);
   });
 });
@@ -82,10 +85,13 @@ describe("renameDesign", () => {
     expect(next.designs![0]!.id).toBe("hall");
     expect(next.parts.map((p) => [p.id, p.design])).toEqual([
       ["side", undefined],
-      ["hall-vertical", "hall"],
-      ["hall-horizontal", "hall"],
+      ["hall-top", "hall"],
+      ["hall-bottom", "hall"],
+      ["hall-side", "hall"],
+      ["hall-divider", "hall"],
+      ["hall-shelf", "hall"],
     ]);
-    expect(onSheet(next)).toEqual(["side", "hall-vertical", "hall-horizontal"]);
+    expect(onSheet(next)).toEqual(["side", "hall-top", "hall-bottom", "hall-side", "hall-divider", "hall-shelf"]);
     expect(regenerateDesigns(next)).toBe(next);
   });
 });
@@ -104,8 +110,10 @@ describe("materials that designs use", () => {
     const birch = { ...project, materials: [...project.materials, { id: "birch18", name: "Birch 18", thickness: 18, grained: true }] };
     const next = regenerateDesigns({ ...birch, designs: [eketDesign({ material: "birch18" })] });
     expect(next.parts.map((p) => [p.id, p.material])).toEqual([
-      ["ek-vertical", "birch18"],
-      ["ek-horizontal", "birch18"],
+      ["ek-top", "birch18"],
+      ["ek-bottom", "birch18"],
+      ["ek-side", "birch18"],
+      ["ek-divider", "birch18"],
       ["ek-back", "ply6"],
     ]);
     expect(onSheet(next)).toEqual(["ek-back"]);
```

Apply this change to `packages/core/test/examples.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/test/examples.test.ts b/packages/core/test/examples.test.ts
index bc16718..d24aba4 100644
--- a/packages/core/test/examples.test.ts
+++ b/packages/core/test/examples.test.ts
@@ -97,10 +97,13 @@ describe("living-room-shelf", () => {
 describe("kallax-2x4-mm", () => {
   const project = build("kallax-2x4-mm");
 
-  it("makes 3 vertical panels and 10 shelves with 335 mm cells", () => {
+  it("makes a box with a full-width top and bottom, 2 sides, 1 divider, and 6 shelves with 335 mm cells", () => {
     expect(project.parts.map((p) => [p.id, p.length, p.width, p.quantity])).toEqual([
-      ["kallax-vertical", 1430, 390, 3],
-      ["kallax-horizontal", 335, 390, 10],
+      ["kallax-top", 724, 390, 1],
+      ["kallax-bottom", 724, 390, 1],
+      ["kallax-side", 1394, 390, 2],
+      ["kallax-divider", 1394, 390, 1],
+      ["kallax-shelf", 335, 390, 6],
     ]);
   });
 
@@ -125,8 +128,10 @@ describe("eket-wall-in", () => {
 
   it("makes the parts of 2 units, with a back", () => {
     expect(project.parts.map((p) => [p.id, p.quantity])).toEqual([
-      ["eket-vertical", 6],
-      ["eket-horizontal", 8],
+      ["eket-top", 2],
+      ["eket-bottom", 2],
+      ["eket-side", 4],
+      ["eket-divider", 2],
       ["eket-back", 2],
     ]);
   });
```

Apply this change to `packages/core/test/helpers.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/test/helpers.ts b/packages/core/test/helpers.ts
index 817fd81..309e960 100644
--- a/packages/core/test/helpers.ts
+++ b/packages/core/test/helpers.ts
@@ -57,7 +57,7 @@ export function expectOk<R, F extends string>(result: CsvImport<R, F>) {
   return result;
 }
 
-/** KALLAX 2×4 in 18 mm plywood, no back: 3 vertical panels 1430 × 390 and 10 shelves 335 × 390. */
+/** KALLAX 2×4 in 18 mm plywood, no back: a top and a bottom 724 × 390, 2 sides and 1 divider 1394 × 390, and 6 shelves 335 × 390. */
 export function kallaxDesign(patch: Partial<Design> = {}): Design {
   return {
     id: "kx",
```

Apply this change to `packages/core/test/optimize/search.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/test/optimize/search.test.ts b/packages/core/test/optimize/search.test.ts
index b7238c1..b39bd34 100644
--- a/packages/core/test/optimize/search.test.ts
+++ b/packages/core/test/optimize/search.test.ts
@@ -262,8 +262,8 @@ describe("the optimizer goal", () => {
     expect(fingerprints).toEqual({
       "living-room-shelf": "856f870d8ae44f6a",
       "simple-bookcase-mm": "0179ead79bb2e7a9",
-      "kallax-2x4-mm": "09dce9c592a539a6",
-      "eket-wall-in": "12bae722ce52979a",
+      "kallax-2x4-mm": "c3e32cca2747f250",
+      "eket-wall-in": "252be793e5f5e0fa",
     });
   });
 
```

Apply this change to `packages/cli/test/design.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/cli/test/design.test.ts b/packages/cli/test/design.test.ts
index 03be52b..8ba2e04 100644
--- a/packages/cli/test/design.test.ts
+++ b/packages/cli/test/design.test.ts
@@ -44,11 +44,14 @@ describe("design add", () => {
       depth: 390,
     });
     expect(sizes(data.parts)).toEqual([
-      ["kallax-2x4-vertical", 1430, 390, 3],
-      ["kallax-2x4-horizontal", 335, 390, 10],
+      ["kallax-2x4-top", 724, 390, 1],
+      ["kallax-2x4-bottom", 724, 390, 1],
+      ["kallax-2x4-side", 1394, 390, 2],
+      ["kallax-2x4-divider", 1394, 390, 1],
+      ["kallax-2x4-shelf", 335, 390, 6],
     ]);
     expect(data.changes.designs.added).toEqual(["kallax-2x4"]);
-    expect(data.changes.parts.added).toEqual(["kallax-2x4-vertical", "kallax-2x4-horizontal"]);
+    expect(data.changes.parts.added).toEqual(["kallax-2x4-top", "kallax-2x4-bottom", "kallax-2x4-side", "kallax-2x4-divider", "kallax-2x4-shelf"]);
     expect(result.file(F).parts.every((part) => part.design === "kallax-2x4" && part.group === "KALLAX 2x4")).toBe(true);
   });
 
@@ -69,8 +72,10 @@ describe("design add", () => {
       quantity: 2,
     });
     expect(result.json().parts.map((part: { id: string; quantity: number }) => [part.id, part.quantity])).toEqual([
-      ["eket-2x1-vertical", 6],
-      ["eket-2x1-horizontal", 8],
+      ["eket-2x1-top", 2],
+      ["eket-2x1-bottom", 2],
+      ["eket-2x1-side", 4],
+      ["eket-2x1-divider", 2],
       ["eket-2x1-back", 2],
     ]);
   });
@@ -80,15 +85,21 @@ describe("design add", () => {
     const grid = await cli(["design", "add", F, "--width", "900", "--height", "600", "--cols", "2", "--rows", "2", "--depth", "300", "--material", "b18", "--json"], io);
     expect(grid.json().design).toMatchObject({ id: "custom-2x2", name: "Custom 2x2", system: "custom", width: { outside: 900, cells: 2 }, height: { outside: 600, cells: 2 } });
     expect(sizes(grid.json().parts)).toEqual([
-      ["custom-2x2-vertical", 600, 300, 3],
-      ["custom-2x2-horizontal", 423, 300, 6],
+      ["custom-2x2-top", 900, 300, 1],
+      ["custom-2x2-bottom", 900, 300, 1],
+      ["custom-2x2-side", 564, 300, 2],
+      ["custom-2x2-divider", 564, 300, 1],
+      ["custom-2x2-shelf", 423, 300, 2],
     ]);
     const mixed = await cli(["design", "add", F, "--column-openings", "335, 400,335", "--row-openings", "300,335", "--depth", "390", "--material", "b18", "--name", "Mixed", "--id", "mx", "--json"], io);
     expect(mixed.json().design).toMatchObject({ id: "mx", name: "Mixed", width: { openings: [335, 400, 335] }, height: { openings: [300, 335] } });
     expect(sizes(mixed.json().parts)).toEqual([
-      ["mx-vertical", 689, 390, 4],
-      ["mx-horizontal-1", 335, 390, 6],
-      ["mx-horizontal-2", 400, 390, 3],
+      ["mx-top", 1142, 390, 1],
+      ["mx-bottom", 1142, 390, 1],
+      ["mx-side", 653, 390, 2],
+      ["mx-divider", 653, 390, 2],
+      ["mx-shelf-1", 335, 390, 2],
+      ["mx-shelf-2", 400, 390, 1],
     ]);
   });
 
@@ -128,7 +139,7 @@ describe("design add", () => {
     const second = await cli(["design", "add", F, "--system", "kallax", "--cols", "2", "--rows", "4", "--material", "b18", "--json"], io);
     expect(second.code).toBe(0);
     expect(second.json().design).toMatchObject({ id: "kallax-2x4-2", name: "KALLAX 2x4" });
-    expect(second.file(F).parts.map((part) => part.id)).toEqual(["kallax-2x4-vertical", "kallax-2x4-horizontal", "kallax-2x4-2-vertical", "kallax-2x4-2-horizontal"]);
+    expect(second.file(F).parts.map((part) => part.id)).toEqual(["kallax-2x4-top", "kallax-2x4-bottom", "kallax-2x4-side", "kallax-2x4-divider", "kallax-2x4-shelf", "kallax-2x4-2-top", "kallax-2x4-2-bottom", "kallax-2x4-2-side", "kallax-2x4-2-divider", "kallax-2x4-2-shelf"]);
   });
 
   it("reads stdin and prints the project with its parts, or writes nothing with --dry-run", async () => {
@@ -138,10 +149,10 @@ describe("design add", () => {
     expect(piped.code).toBe(0);
     const project = JSON.parse(piped.stdout) as { designs: { id: string }[]; parts: { id: string }[] };
     expect(project.designs.map((design) => design.id)).toEqual(["eket-1x2"]);
-    expect(project.parts.map((part) => part.id)).toEqual(["eket-1x2-vertical", "eket-1x2-horizontal"]);
+    expect(project.parts.map((part) => part.id)).toEqual(["eket-1x2-top", "eket-1x2-bottom", "eket-1x2-side", "eket-1x2-shelf"]);
     const dry = await cli(["design", "add", F, "--system", "eket", "--cols", "1", "--rows", "2", "--material", "b18", "--dry-run", "--json"], io);
     expect(dry.json()).toMatchObject({ ok: true, dryRun: true, written: null });
-    expect(dry.json().parts).toHaveLength(2);
+    expect(dry.json().parts).toHaveLength(4);
     expect(io.files.get(F)).toBe(text);
   });
 
@@ -160,10 +171,10 @@ describe("design list and get", () => {
   it("lists the designs with the outside size and the part counts", async () => {
     const result = await cli(["design", "list", EKET, "--json"], withDesignExamples());
     expect(result.json().designs).toEqual([
-      { id: "eket", name: "Wall EKET", system: "eket", quantity: 2, mount: "wall-rail", outside: { width: 27.559055118, height: 13.779527559, depth: 13.779527559 }, parts: 3, copies: 16 },
+      { id: "eket", name: "Wall EKET", system: "eket", quantity: 2, mount: "wall-rail", outside: { width: 27.559055118, height: 13.779527559, depth: 13.779527559 }, parts: 5, copies: 12 },
     ]);
     const text = await cli(["design", "list", KALLAX], withDesignExamples());
-    expect(text.stdout).toMatch(/kallax\s+Hall KALLAX\s+kallax\s+724 mm × 1430 mm × 390 mm\s+1\s+floor\s+2\s+13/);
+    expect(text.stdout).toMatch(/kallax\s+Hall KALLAX\s+kallax\s+724 mm × 1430 mm × 390 mm\s+1\s+floor\s+5\s+11/);
   });
 
   it("shows one design with its parts and its checks, and exits 2 for an unknown id", async () => {
@@ -174,7 +185,7 @@ describe("design list and get", () => {
     const result = await cli(["design", "get", KALLAX, "kallax", "--json"], io);
     expect(result.code).toBe(0);
     expect(result.json().outside).toEqual({ width: 724, height: 1430, depth: 340 });
-    expect(result.json().parts.map((part: { id: string }) => part.id)).toEqual(["kallax-vertical", "kallax-horizontal"]);
+    expect(result.json().parts.map((part: { id: string }) => part.id)).toEqual(["kallax-top", "kallax-bottom", "kallax-side", "kallax-divider", "kallax-shelf"]);
     expect(result.json().issues.map((issue: { code: string }) => issue.code)).toEqual(expect.arrayContaining(["design-stale"]));
     const missing = await cli(["design", "get", KALLAX, "nope", "--json"], io);
     expect(missing.code).toBe(2);
@@ -190,14 +201,14 @@ describe("design set", () => {
     expect(result.code).toBe(0);
     const data = result.json();
     expect(data.design.height).toEqual({ openings: [335, 335, 335, 335, 335] });
-    expect(data.partChanges).toEqual({ added: [], removed: [], resized: ["kallax-vertical"] });
+    expect(data.partChanges).toEqual({ added: [], removed: [], resized: ["kallax-side", "kallax-divider"] });
     expect(data.removedPlacements).toEqual([
-      { part: "kallax-vertical", copy: 0 },
-      { part: "kallax-vertical", copy: 1 },
-      { part: "kallax-vertical", copy: 2 },
+      { part: "kallax-side", copy: 0 },
+      { part: "kallax-side", copy: 1 },
+      { part: "kallax-divider", copy: 0 },
     ]);
-    expect(data.changes.plan).toMatchObject({ placementsBefore: 13, placementsAfter: 10 });
-    expect(result.file(KALLAX).parts.map((part) => part.quantity)).toEqual([3, 12]);
+    expect(data.changes.plan).toMatchObject({ placementsBefore: 11, placementsAfter: 8 });
+    expect(result.file(KALLAX).parts.map((part) => part.quantity)).toEqual([1, 1, 2, 1, 8]);
   });
 
   it("gives the design a new id, and the copies stay on their sheets", async () => {
@@ -208,8 +219,8 @@ describe("design set", () => {
     expect(result.json().design.id).toBe("hall");
     expect(result.json().partChanges).toEqual({ added: [], removed: [], resized: [] });
     expect(result.json().removedPlacements).toEqual([]);
-    expect(result.json().changes.parts).toMatchObject({ added: ["hall-vertical", "hall-horizontal"], removed: ["kallax-vertical", "kallax-horizontal"] });
-    expect(result.json().changes.plan).toMatchObject({ placementsBefore: 13, placementsAfter: 13 });
+    expect(result.json().changes.parts).toMatchObject({ added: ["hall-top", "hall-bottom", "hall-side", "hall-divider", "hall-shelf"], removed: ["kallax-top", "kallax-bottom", "kallax-side", "kallax-divider", "kallax-shelf"] });
+    expect(result.json().changes.plan).toMatchObject({ placementsBefore: 11, placementsAfter: 11 });
     const duplicate = await cli(["design", "set", KALLAX, "hall", "--id", "hall", "--json"], io);
     expect(duplicate.code).toBe(0);
     await cli(["design", "add", KALLAX, "--system", "kallax", "--cols", "1", "--rows", "1", "--json"], io);
@@ -224,7 +235,7 @@ describe("design set", () => {
     expect(result.code).toBe(0);
     expect(result.json().design).not.toHaveProperty("back");
     expect(result.json().design).toMatchObject({ name: "Hall EKET", mount: "legs", quantity: 1 });
-    expect(result.json().partChanges).toEqual({ added: [], removed: ["eket-back"], resized: ["eket-vertical", "eket-horizontal"] });
+    expect(result.json().partChanges).toEqual({ added: [], removed: ["eket-back"], resized: ["eket-top", "eket-bottom", "eket-side", "eket-divider"] });
     expect(result.file(EKET).parts.every((part) => part.group === "Hall EKET")).toBe(true);
   });
 
@@ -251,7 +262,7 @@ describe("design set", () => {
 
   it("refuses a new id whose parts would take the id of another part", async () => {
     const io = withDesignExamples();
-    await cli(["parts", "add", KALLAX, "--name", "Hall vertical", "--length", "500", "--width", "300"], io);
+    await cli(["parts", "add", KALLAX, "--name", "Hall side", "--length", "500", "--width", "300"], io);
     const before = io.files.get(KALLAX);
     const result = await cli(["design", "set", KALLAX, "kallax", "--id", "hall", "--json"], io);
     expect(result.code).toBe(1);
@@ -270,7 +281,7 @@ describe("design set", () => {
     expect(refused.json().error).toMatchObject({ code: "invalid-value", option: "system" });
     const fixed = await cli(["design", "set", KALLAX, "kallax", "--system", "custom", "--quantity", "2", "--json"], io);
     expect(fixed.code).toBe(0);
-    expect(fixed.file(KALLAX).parts.map((part) => part.quantity)).toEqual([6, 20]);
+    expect(fixed.file(KALLAX).parts.map((part) => part.quantity)).toEqual([2, 2, 4, 2, 12]);
   });
 });
 
@@ -280,8 +291,8 @@ describe("design remove and detach", () => {
     await cli(["optimize", KALLAX, "--iterations", "50", "--seed", "1"], io);
     const result = await cli(["design", "remove", KALLAX, "kallax", "--json"], io);
     expect(result.code).toBe(0);
-    expect(result.json()).toMatchObject({ removed: ["kallax"], removedParts: ["kallax-vertical", "kallax-horizontal"] });
-    expect(result.json().removedPlacements).toHaveLength(13);
+    expect(result.json()).toMatchObject({ removed: ["kallax"], removedParts: ["kallax-top", "kallax-bottom", "kallax-side", "kallax-divider", "kallax-shelf"] });
+    expect(result.json().removedPlacements).toHaveLength(11);
     const file = result.file(KALLAX);
     expect(file.designs).toBeUndefined();
     expect(file.parts).toEqual([]);
@@ -292,12 +303,15 @@ describe("design remove and detach", () => {
     const io = withDesignExamples();
     const result = await cli(["design", "detach", KALLAX, "kallax", "--json"], io);
     expect(result.code).toBe(0);
-    expect(result.json()).toMatchObject({ detached: "kallax", parts: ["kallax-vertical", "kallax-horizontal"] });
+    expect(result.json()).toMatchObject({ detached: "kallax", parts: ["kallax-top", "kallax-bottom", "kallax-side", "kallax-divider", "kallax-shelf"] });
     expect(result.file(KALLAX).parts.map((part) => [part.id, part.design, part.group])).toEqual([
-      ["kallax-vertical", undefined, "Hall KALLAX"],
-      ["kallax-horizontal", undefined, "Hall KALLAX"],
+      ["kallax-top", undefined, "Hall KALLAX"],
+      ["kallax-bottom", undefined, "Hall KALLAX"],
+      ["kallax-side", undefined, "Hall KALLAX"],
+      ["kallax-divider", undefined, "Hall KALLAX"],
+      ["kallax-shelf", undefined, "Hall KALLAX"],
     ]);
-    expect((await cli(["parts", "set", KALLAX, "kallax-vertical", "--quantity", "2", "--json"], io)).code).toBe(0);
+    expect((await cli(["parts", "set", KALLAX, "kallax-side", "--quantity", "2", "--json"], io)).code).toBe(0);
   });
 });
 
```

Apply this change to `packages/cli/test/design-write.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/cli/test/design-write.test.ts b/packages/cli/test/design-write.test.ts
index db76206..5e52cca 100644
--- a/packages/cli/test/design-write.test.ts
+++ b/packages/cli/test/design-write.test.ts
@@ -11,11 +11,14 @@ describe("every write makes the design parts again", () => {
     expect(stale.json().planIssues.map((issue: { code: string }) => issue.code)).toContain("design-stale");
     const added = await cli(["parts", "add", KALLAX, "--name", "Plinth", "--length", "724", "--width", "80", "--json"], io);
     expect(added.code).toBe(0);
-    expect(added.json().changes.parts).toEqual({ added: ["plinth"], removed: [], changed: ["kallax-vertical", "kallax-horizontal"], reordered: false });
+    expect(added.json().changes.parts).toEqual({ added: ["plinth"], removed: [], changed: ["kallax-side", "kallax-divider", "kallax-shelf"], reordered: false });
     const parts = added.file(KALLAX).parts.map((part) => [part.id, part.length, part.quantity]);
     expect(parts).toEqual([
-      ["kallax-vertical", 1783, 3],
-      ["kallax-horizontal", 335, 12],
+      ["kallax-top", 724, 1],
+      ["kallax-bottom", 724, 1],
+      ["kallax-side", 1747, 2],
+      ["kallax-divider", 1747, 1],
+      ["kallax-shelf", 335, 8],
       ["plinth", 724, 1],
     ]);
     const fixed = await cli(["validate", KALLAX, "--json"], io);
@@ -30,7 +33,7 @@ describe("every write makes the design parts again", () => {
     });
     const result = await cli(["optimize", KALLAX, "--iterations", "50", "--seed", "1", "--strict", "--json"], io);
     expect(result.code).toBe(0);
-    expect(result.json().after).toMatchObject({ placedCopies: 13, unplacedCopies: 0 });
+    expect(result.json().after).toMatchObject({ placedCopies: 11, unplacedCopies: 0 });
     const valid = await cli(["validate", KALLAX, "--strict", "--json"], io);
     expect(valid.json()).toMatchObject({ valid: true, errors: 0, warnings: 0 });
   });
@@ -42,16 +45,16 @@ describe("every write makes the design parts again", () => {
     expect(result.stdout).not.toContain("design-stale");
     const text = await cli(["settings", "set", KALLAX, "units", "in"], withDesignExamples());
     expect(text.stdout).toContain("Changed design: kallax.");
-    expect(result.file(KALLAX).parts.map((part) => part.quantity)).toEqual([3, 10]);
+    expect(result.file(KALLAX).parts.map((part) => part.quantity)).toEqual([1, 1, 2, 1, 6]);
   });
 
   it("keeps every placed copy when the units change", async () => {
     const io = withDesignExamples();
     await cli(["optimize", KALLAX, "--iterations", "50", "--seed", "1"], io);
     const result = await cli(["settings", "set", KALLAX, "units", "in", "--json"], io);
-    expect(result.json().changes.plan).toMatchObject({ placementsBefore: 13, placementsAfter: 13 });
+    expect(result.json().changes.plan).toMatchObject({ placementsBefore: 11, placementsAfter: 11 });
     const back = await cli(["settings", "set", KALLAX, "units", "mm", "--json"], io);
-    expect(back.json().changes.plan).toMatchObject({ placementsBefore: 13, placementsAfter: 13 });
+    expect(back.json().changes.plan).toMatchObject({ placementsBefore: 11, placementsAfter: 11 });
   });
 });
 
@@ -59,13 +62,13 @@ describe("generated parts", () => {
   it("refuses parts set and parts remove with exit 1, and writes nothing", async () => {
     const io = withDesignExamples();
     const before = io.files.get(KALLAX);
-    const set = await cli(["parts", "set", KALLAX, "kallax-vertical", "--quantity", "1", "--json"], io);
+    const set = await cli(["parts", "set", KALLAX, "kallax-side", "--quantity", "1", "--json"], io);
     expect(set.code).toBe(1);
-    expect(set.json().error).toMatchObject({ code: "generated-part", id: "kallax-vertical", design: "kallax" });
+    expect(set.json().error).toMatchObject({ code: "generated-part", id: "kallax-side", design: "kallax" });
     expect(set.json().error.message).toContain("design detach");
-    const remove = await cli(["parts", "remove", KALLAX, "kallax-horizontal", "--json"], io);
+    const remove = await cli(["parts", "remove", KALLAX, "kallax-shelf", "--json"], io);
     expect(remove.code).toBe(1);
-    expect(remove.json().error).toMatchObject({ code: "generated-part", id: "kallax-horizontal", design: "kallax" });
+    expect(remove.json().error).toMatchObject({ code: "generated-part", id: "kallax-shelf", design: "kallax" });
     expect(io.files.get(KALLAX)).toBe(before);
     expect(io.writes).toEqual([]);
   });
@@ -75,9 +78,9 @@ describe("generated parts", () => {
     editFile(io, KALLAX, (file) => {
       delete file.designs;
     });
-    const set = await cli(["parts", "set", KALLAX, "kallax-vertical", "--quantity", "2", "--json"], io);
+    const set = await cli(["parts", "set", KALLAX, "kallax-side", "--quantity", "2", "--json"], io);
     expect(set.code).toBe(0);
-    expect(set.json().part).toMatchObject({ id: "kallax-vertical", quantity: 2, design: "kallax" });
+    expect(set.json().part).toMatchObject({ id: "kallax-side", quantity: 2, design: "kallax" });
   });
 });
 
@@ -86,7 +89,7 @@ describe("materials that designs use", () => {
     const io = withDesignExamples();
     const list = await cli(["materials", "list", EKET, "--json"], io);
     expect(list.json().materials.map((m: { id: string; usedBy: unknown }) => [m.id, m.usedBy])).toEqual([
-      ["ply-23-32", { parts: 2, stock: 1, designs: 1 }],
+      ["ply-23-32", { parts: 4, stock: 1, designs: 1 }],
       ["ply-7-32", { parts: 1, stock: 1, designs: 1 }],
     ]);
     expect((await cli(["materials", "get", EKET, "ply-7-32", "--json"], io)).json().usedBy).toEqual({ parts: ["eket-back"], stock: ["ply-7-32-4x8"], designs: ["eket"] });
```

Apply this change to `packages/cli/test/flow.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/cli/test/flow.test.ts b/packages/cli/test/flow.test.ts
index 42d5cff..c8acf75 100644
--- a/packages/cli/test/flow.test.ts
+++ b/packages/cli/test/flow.test.ts
@@ -89,7 +89,7 @@ describe("an agent flow in a real directory", () => {
     expect(added.json().design.id).toBe("kallax-2x4");
     const optimized = await real(["optimize", file, "--iterations", "200", "--seed", "1", "--strict", "--json"]);
     expect(optimized.code).toBe(0);
-    expect(optimized.json().after).toMatchObject({ placedCopies: 13, unplacedCopies: 0, errors: 0 });
+    expect(optimized.json().after).toMatchObject({ placedCopies: 11, unplacedCopies: 0, errors: 0 });
     const assembly = await real(["report", "assembly", file, "--json"]);
     expect(assembly.json().designs[0].steps.length).toBe(7);
     const shopping = await real(["report", "shopping", file, "--json"]);
```

Apply this change to `apps/web/test/helpers.ts` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/test/helpers.ts b/apps/web/test/helpers.ts
index 48af3a5..f3fd78f 100644
--- a/apps/web/test/helpers.ts
+++ b/apps/web/test/helpers.ts
@@ -31,7 +31,7 @@ export function sampleProject(): Project {
 
 /**
  * A millimetre project: 18 mm and 6 mm plywood, an unlimited 2440 × 1220 sheet of the 18 mm, a table saw, and the design
- * "hall", a KALLAX 2x2 in the 18 mm with its parts. One sheet holds a vertical panel and a shelf.
+ * "hall", a KALLAX 2x2 in the 18 mm with its parts. One sheet holds a side and a shelf.
  */
 export function designProject(): Project {
   const base = createProject("Hall", "mm");
@@ -50,8 +50,8 @@ export function designProject(): Project {
           id: "s1",
           stock: "ply18-sheet",
           placements: [
-            { part: "hall-vertical", copy: 0, x: 0, y: 0, rotated: false },
-            { part: "hall-horizontal", copy: 0, x: 0, y: 400, rotated: false },
+            { part: "hall-side", copy: 0, x: 0, y: 0, rotated: false },
+            { part: "hall-shelf", copy: 0, x: 0, y: 400, rotated: false },
           ],
         },
       ],
```

Apply this change to `apps/web/test/useProject.test.tsx` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/test/useProject.test.tsx b/apps/web/test/useProject.test.tsx
index 48f5666..ed04782 100644
--- a/apps/web/test/useProject.test.tsx
+++ b/apps/web/test/useProject.test.tsx
@@ -12,24 +12,27 @@ describe("useProject", () => {
     act(() => result.current.edit((p) => updateMaterial(p, "ply18", { thickness: 19 })));
     const parts = result.current.project.parts.map((part) => [part.id, part.length, part.width]);
     expect(parts).toEqual([
-      ["hall-vertical", 727, 390],
-      ["hall-horizontal", 335, 390],
+      ["hall-top", 727, 390],
+      ["hall-bottom", 727, 390],
+      ["hall-side", 689, 390],
+      ["hall-divider", 689, 390],
+      ["hall-shelf", 335, 390],
     ]);
-    expect(placed(result.current.project)).toEqual(["hall-horizontal"]);
+    expect(placed(result.current.project)).toEqual(["hall-shelf"]);
     act(() => result.current.undo());
     expect(result.current.project.materials[0]!.thickness).toBe(18);
     expect(result.current.project.parts[0]!.length).toBe(724);
-    expect(placed(result.current.project)).toEqual(["hall-vertical", "hall-horizontal"]);
+    expect(placed(result.current.project)).toEqual(["hall-side", "hall-shelf"]);
     expect(result.current.canUndo).toBe(false);
   });
 
   it("keeps every placed copy through a unit change and back, with no stale design", () => {
     const { result } = renderHook(() => useProject(designProject()));
     act(() => result.current.edit((p) => convertProjectUnits(p, "in")));
-    expect(placed(result.current.project)).toEqual(["hall-vertical", "hall-horizontal"]);
+    expect(placed(result.current.project)).toEqual(["hall-side", "hall-shelf"]);
     expect(checkDesigns(result.current.project).map((issue) => issue.code)).not.toContain("design-stale");
     act(() => result.current.edit((p) => convertProjectUnits(p, "mm")));
-    expect(placed(result.current.project)).toEqual(["hall-vertical", "hall-horizontal"]);
+    expect(placed(result.current.project)).toEqual(["hall-side", "hall-shelf"]);
     expect(checkDesigns(result.current.project).map((issue) => issue.code)).not.toContain("design-stale");
   });
 });
```

Apply this change to `apps/web/test/DesignTab.test.tsx` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/test/DesignTab.test.tsx b/apps/web/test/DesignTab.test.tsx
index ec93759..6ba40fb 100644
--- a/apps/web/test/DesignTab.test.tsx
+++ b/apps/web/test/DesignTab.test.tsx
@@ -30,8 +30,11 @@ describe("DesignTab", () => {
     expect(current().project.materials.map((m) => [m.id, m.thickness])).toEqual([["plywood", 18]]);
     expect(design(current)).toMatchObject({ id: "kallax-2x2", name: "KALLAX 2x2", system: "kallax", material: "plywood" });
     expect(current().project.parts.map((part) => [part.id, part.quantity])).toEqual([
-      ["kallax-2x2-vertical", 3],
-      ["kallax-2x2-horizontal", 6],
+      ["kallax-2x2-top", 1],
+      ["kallax-2x2-bottom", 1],
+      ["kallax-2x2-side", 2],
+      ["kallax-2x2-divider", 1],
+      ["kallax-2x2-shelf", 2],
     ]);
     expect(screen.getByLabelText("Name")).toHaveProperty("value", "KALLAX 2x2");
     expect(preview()).toBe("Front view of KALLAX 2x2: 724 mm × 724 mm × 390 mm");
@@ -47,12 +50,15 @@ describe("DesignTab", () => {
     await userEvent.type(rows, "4{Enter}");
     expect(design(current).height).toEqual({ openings: [335, 335, 335, 335] });
     expect(current().project.parts.map((part) => [part.id, part.length, part.quantity])).toEqual([
-      ["hall-vertical", 1430, 3],
-      ["hall-horizontal", 335, 10],
+      ["hall-top", 724, 1],
+      ["hall-bottom", 724, 1],
+      ["hall-side", 1394, 2],
+      ["hall-divider", 1394, 1],
+      ["hall-shelf", 335, 6],
     ]);
     act(() => current().undo());
     expect(design(current).height).toEqual({ openings: [335, 335] });
-    expect(current().project.parts[1]!.quantity).toBe(6);
+    expect(current().project.parts.find((part) => part.id === "hall-shelf")!.quantity).toBe(2);
   });
 
   it("draws the new size while the user types, and Escape draws the stored size again", async () => {
@@ -93,8 +99,11 @@ describe("DesignTab", () => {
     await userEvent.selectOptions(screen.getByLabelText("System"), "eket");
     expect(design(current)).toMatchObject({ system: "eket", width: { outside: 700, cells: 2 }, height: { outside: 700, cells: 2 }, depth: 350 });
     expect(current().project.parts.map((part) => [part.id, part.length, part.width])).toEqual([
-      ["hall-vertical", 700, 350],
-      ["hall-horizontal", 323, 350],
+      ["hall-top", 700, 350],
+      ["hall-bottom", 700, 350],
+      ["hall-side", 664, 350],
+      ["hall-divider", 664, 350],
+      ["hall-shelf", 323, 350],
     ]);
   });
 
@@ -114,8 +123,11 @@ describe("DesignTab", () => {
     await userEvent.click(screen.getByRole("button", { name: "Detach" }));
     expect(current().project.designs).toBeUndefined();
     expect(current().project.parts.map((part) => [part.id, part.design])).toEqual([
-      ["hall-vertical", undefined],
-      ["hall-horizontal", undefined],
+      ["hall-top", undefined],
+      ["hall-bottom", undefined],
+      ["hall-side", undefined],
+      ["hall-divider", undefined],
+      ["hall-shelf", undefined],
     ]);
     expect(current().project.plan!.sheets[0]!.placements).toHaveLength(2);
   });
@@ -136,7 +148,7 @@ describe("DesignTab", () => {
     expect(screen.getByLabelText("Name")).toHaveProperty("value", "Two");
     await userEvent.click(screen.getByRole("button", { name: "Delete design" }));
     expect(current().project.designs!.map((d) => d.id)).toEqual(["hall"]);
-    expect(current().project.parts.map((part) => part.id)).toEqual(["hall-vertical", "hall-horizontal"]);
+    expect(current().project.parts.map((part) => part.id)).toEqual(["hall-top", "hall-bottom", "hall-side", "hall-divider", "hall-shelf"]);
     await userEvent.click(screen.getByRole("button", { name: "Delete design" }));
     expect(current().project.parts).toEqual([]);
     expect(current().project.plan!.sheets[0]!.placements).toEqual([]);
```

Apply this change to `apps/web/test/PartsTab.test.tsx` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/test/PartsTab.test.tsx b/apps/web/test/PartsTab.test.tsx
index 9d0406b..ba0e868 100644
--- a/apps/web/test/PartsTab.test.tsx
+++ b/apps/web/test/PartsTab.test.tsx
@@ -59,10 +59,10 @@ describe("PartsTab", () => {
     const project = designProject();
     const orphan = { id: "plinth", name: "Plinth", material: "ply18", length: 700, width: 80, quantity: 1, grain: "length" as const, design: "gone" };
     renderWithStore({ ...project, parts: [...project.parts, orphan] }, (store) => <PartsTab store={store} onShowDesign={onShowDesign} />);
-    const row = screen.getByRole("row", { name: /^Vertical panel/ });
+    const row = screen.getByRole("row", { name: /^Side/ });
     expect(within(row).queryByRole("textbox")).toBeNull();
     expect(within(row).queryByRole("button", { name: /^Delete/ })).toBeNull();
-    expect(within(row).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["Vertical panel", "724 mm", "390 mm", "3", "Plywood 18", "Along length", "Hall", "From design: Hall"]);
+    expect(within(row).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["Side", "688 mm", "390 mm", "2", "Plywood 18", "Along length", "Hall", "From design: Hall"]);
     await userEvent.click(within(row).getByRole("button", { name: "Hall" }));
     expect(onShowDesign).toHaveBeenCalledWith("hall");
     expect(screen.getByLabelText("Name of Plinth")).toBeTruthy();
```

Apply this change to `apps/web/test/Workspace.test.tsx` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/test/Workspace.test.tsx b/apps/web/test/Workspace.test.tsx
index 57b1545..4d49c2a 100644
--- a/apps/web/test/Workspace.test.tsx
+++ b/apps/web/test/Workspace.test.tsx
@@ -178,7 +178,7 @@ describe("Workspace", () => {
     const project = designProject();
     await renderWorkspace(regenerateDesigns({ ...project, designs: [...project.designs!, { ...project.designs![0]!, id: "desk", name: "Desk" }] }));
     await userEvent.click(screen.getByRole("tab", { name: "Parts" }));
-    await userEvent.click(within(screen.getAllByRole("row", { name: /^Vertical panel/ }).at(-1)!).getByRole("button", { name: "Desk" }));
+    await userEvent.click(within(screen.getAllByRole("row", { name: /^Side/ }).at(-1)!).getByRole("button", { name: "Desk" }));
     expect(screen.getByRole("tab", { name: "Design" }).getAttribute("aria-selected")).toBe("true");
     expect(screen.getByRole("button", { name: /^Desk /, pressed: true })).toBeTruthy();
   });
```

Apply this change to `apps/web/e2e/plan.e2e.ts` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/e2e/plan.e2e.ts b/apps/web/e2e/plan.e2e.ts
index 70ec41b..5a1f0a3 100644
--- a/apps/web/e2e/plan.e2e.ts
+++ b/apps/web/e2e/plan.e2e.ts
@@ -183,7 +183,7 @@ test("designs a unit, cuts it, keeps the assembly ticks, and prints its hardware
   await expect(page.getByRole("img", { name: 'Front view of KALLAX 2x2: 28 5/8" × 42 9/16" × 15 11/32"' })).toBeVisible();
 
   await page.getByRole("tab", { name: "Parts" }).click();
-  await expect(page.getByRole("row", { name: /^Vertical panel/ })).toContainText("From design: KALLAX 2x2");
+  await expect(page.getByRole("row", { name: /^Side/ })).toContainText("From design: KALLAX 2x2");
 
   await page.getByRole("tab", { name: "Stock" }).click();
   await page.getByRole("button", { name: "Paste rows…" }).click();
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root packages/core test/design test/reports/elevation.test.ts`

Expected: FAIL: panels.test.ts gets `designPanels is not a function`; the parts tests get `kx-vertical` and `kx-horizontal` in place of `kx-top`; the elevation test finds no `data-panel="top"`; and the ladder test gets no `design-stale`.

- [ ] **Step 3: Implement**

Create `packages/core/src/design/panels.ts` with this content:

```ts
import { roundLength, type DesignGeometry } from "./geometry.ts";

export type PanelKind = "top" | "bottom" | "side" | "divider" | "shelf";

/** A panel in the front view of one unit, from the top-left corner. */
export interface Panel {
  kind: PanelKind;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A cell opening in the front view, from the top-left corner. */
export interface Cell {
  column: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The panels and the cells of the box: the top and the bottom across the full width, the sides and the dividers between them, and the shelves between those. */
export function designPanels(geometry: DesignGeometry): { panels: Panel[]; cells: Cell[] } {
  const { thickness: t, columns, rows, outsideWidth: width, outsideHeight: height } = geometry;
  const inner = roundLength(height - 2 * t);
  const panels: Panel[] = [
    { kind: "top", x: 0, y: 0, width, height: t },
    { kind: "bottom", x: 0, y: roundLength(height - t), width, height: t },
  ];
  const cells: Cell[] = [];
  let x = 0;
  for (let column = 0; column <= columns.length; column++) {
    panels.push({ kind: column === 0 || column === columns.length ? "side" : "divider", x, y: t, width: t, height: inner });
    if (column === columns.length) break;
    const opening = columns[column]!;
    let y = t;
    rows.forEach((cell, row) => {
      if (row > 0) {
        panels.push({ kind: "shelf", x: roundLength(x + t), y, width: opening, height: t });
        y = roundLength(y + t);
      }
      cells.push({ column, row, x: roundLength(x + t), y, width: opening, height: cell });
      y = roundLength(y + cell);
    });
    x = roundLength(x + t + opening);
  }
  return { panels, cells };
}
```

Apply this change to `packages/core/src/design/parts.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/src/design/parts.ts b/packages/core/src/design/parts.ts
index e45bc17..915c413 100644
--- a/packages/core/src/design/parts.ts
+++ b/packages/core/src/design/parts.ts
@@ -1,5 +1,5 @@
 import type { Design, Part } from "../format/schema.ts";
-import type { DesignGeometry } from "./geometry.ts";
+import { roundLength, type DesignGeometry } from "./geometry.ts";
 import { DEFAULT_DESIGN_QUANTITY } from "./systems.ts";
 
 export function buildDesignParts(design: Design, geometry: DesignGeometry): Part[] {
@@ -16,19 +16,27 @@ export function buildDesignParts(design: Design, geometry: DesignGeometry): Part
     design: design.id,
   });
 
-  const columns = geometry.columns.length;
-  const lines = geometry.rows.length + 1;
-  const parts = [part("vertical", "Vertical panel", design.material, geometry.outsideHeight, geometry.panelDepth, columns + 1)];
+  const { thickness, columns, rows, outsideWidth, outsideHeight, panelDepth } = geometry;
+  const upright = roundLength(outsideHeight - 2 * thickness);
+  const parts = [
+    part("top", "Top", design.material, outsideWidth, panelDepth, 1),
+    part("bottom", "Bottom", design.material, outsideWidth, panelDepth, 1),
+    part("side", "Side", design.material, upright, panelDepth, 2),
+  ];
+  if (columns.length > 1) parts.push(part("divider", "Divider", design.material, upright, panelDepth, columns.length - 1));
 
-  const sizes = new Map<number, number>();
-  for (const opening of geometry.columns) sizes.set(opening, (sizes.get(opening) ?? 0) + 1);
-  let k = 0;
-  for (const [opening, count] of sizes) {
-    k++;
-    const single = sizes.size === 1;
-    parts.push(part(single ? "horizontal" : `horizontal-${k}`, single ? "Shelf" : `Shelf ${k}`, design.material, opening, geometry.panelDepth, lines * count));
+  const shelves = rows.length - 1;
+  if (shelves > 0) {
+    const sizes = new Map<number, number>();
+    for (const opening of columns) sizes.set(opening, (sizes.get(opening) ?? 0) + 1);
+    let k = 0;
+    for (const [opening, count] of sizes) {
+      k++;
+      const single = sizes.size === 1;
+      parts.push(part(single ? "shelf" : `shelf-${k}`, single ? "Shelf" : `Shelf ${k}`, design.material, opening, panelDepth, shelves * count));
+    }
   }
 
-  if (design.back) parts.push(part("back", "Back", design.back.material, geometry.outsideHeight, geometry.outsideWidth, 1));
+  if (design.back) parts.push(part("back", "Back", design.back.material, outsideHeight, outsideWidth, 1));
   return parts;
 }
```

Apply this change to `packages/core/src/reports/elevation.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/src/reports/elevation.ts b/packages/core/src/reports/elevation.ts
index c51eac4..67e6bb2 100644
--- a/packages/core/src/reports/elevation.ts
+++ b/packages/core/src/reports/elevation.ts
@@ -2,8 +2,9 @@ import { convertLength } from "../geometry/units.ts";
 import { formatLength } from "../geometry/format.ts";
 import type { Project } from "../format/schema.ts";
 import { designParts } from "../design/generate.ts";
-import { designGeometry, materialsById, roundLength } from "../design/geometry.ts";
+import { designGeometry, materialsById } from "../design/geometry.ts";
 import { railsFor } from "../design/hardware.ts";
+import { designPanels } from "../design/panels.ts";
 import { DEFAULT_DESIGN_MOUNT } from "../design/systems.ts";
 import { groupColors, NO_GROUP_COLOR } from "./colors.ts";
 import { escapeXml } from "./svg.ts";
@@ -27,7 +28,7 @@ export function designElevationSvg(project: Project, designId: string): string |
   const show = (value: number) => formatLength(value, units, project.settings.display);
   const fromMm = (value: number) => convertLength(value, "mm", units);
   const mount = design.mount ?? DEFAULT_DESIGN_MOUNT;
-  const { thickness: t, columns, rows, outsideWidth: width, outsideHeight: height } = geometry;
+  const { thickness: t, outsideWidth: width, outsideHeight: height } = geometry;
   const unit = Math.max(width, height) / 40;
   const below = mount === "legs" ? fromMm(LEG_HEIGHT_MM) : mount === "feet" ? fromMm(FOOT_HEIGHT_MM) : 0;
   const margin = unit * 4;
@@ -44,22 +45,12 @@ export function designElevationSvg(project: Project, designId: string): string |
   const panel = (kind: string, x: number, y: number, w: number, h: number) =>
     out.push(`<rect data-panel="${kind}" x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" fill="${escapeXml(fill)}" ${stroke}/>`);
 
-  let x = 0;
-  for (let column = 0; column <= columns.length; column++) {
-    panel("vertical", x, 0, t, height);
-    if (column === columns.length) break;
-    const opening = columns[column]!;
-    let y = 0;
-    for (let row = 0; row <= rows.length; row++) {
-      panel("horizontal", x + t, y, opening, t);
-      if (row === rows.length) break;
-      const cell = rows[row]!;
-      const size = `${show(opening)} × ${show(cell)}`;
-      const scale = Math.min(0.9, opening / (0.62 * size.length + 1) / unit);
-      out.push(`<text x="${num(x + t + opening / 2)}" y="${num(y + t + cell / 2)}" ${font(scale)} text-anchor="middle" dominant-baseline="middle" fill="#555">${escapeXml(size)}</text>`);
-      y = roundLength(y + t + cell);
-    }
-    x = roundLength(x + t + opening);
+  const { panels, cells } = designPanels(geometry);
+  for (const p of panels) panel(p.kind, p.x, p.y, p.width, p.height);
+  for (const cell of cells) {
+    const size = `${show(cell.width)} × ${show(cell.height)}`;
+    const scale = Math.min(0.9, cell.width / (0.62 * size.length + 1) / unit);
+    out.push(`<text x="${num(cell.x + cell.width / 2)}" y="${num(cell.y + cell.height / 2)}" ${font(scale)} text-anchor="middle" dominant-baseline="middle" fill="#555">${escapeXml(size)}</text>`);
   }
 
   if (mount === "legs" || mount === "feet") {
```

Apply this change to `packages/core/src/index.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/src/index.ts b/packages/core/src/index.ts
index f02c830..811b927 100644
--- a/packages/core/src/index.ts
+++ b/packages/core/src/index.ts
@@ -52,6 +52,7 @@ export * from "./edit/layout.ts";
 export * from "./design/systems.ts";
 export * from "./design/geometry.ts";
 export * from "./design/parts.ts";
+export * from "./design/panels.ts";
 export * from "./design/errors.ts";
 export * from "./design/generate.ts";
 export * from "./design/checks.ts";
```

Apply this change to `packages/cli/src/commands/design.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/cli/src/commands/design.ts b/packages/cli/src/commands/design.ts
index 8a276d8..c7510e2 100644
--- a/packages/cli/src/commands/design.ts
+++ b/packages/cli/src/commands/design.ts
@@ -230,7 +230,7 @@ const add: CommandSpec = {
   name: "design add",
   summary: "Add a design and make its parts.",
   description:
-    "Add a cabinet design and make its parts: the vertical panels, the shelves, and the back. Give each axis as --cols with --width (or --rows with --height), or as a list of openings. For kallax and eket, --cols and --rows alone give IKEA-size cells, and the depth is the IKEA depth; the numbers are converted to the project units. A design with an error (such as stock too thin for pocket screws) is refused with exit 1, invalid-value, and the checks in error.issues. The new parts are not placed; run optimize.",
+    "Add a cabinet design and make its parts: the top, the bottom, the sides, the dividers, the shelves, and the back. Give each axis as --cols with --width (or --rows with --height), or as a list of openings. For kallax and eket, --cols and --rows alone give IKEA-size cells, and the depth is the IKEA depth; the numbers are converted to the project units. A design with an error (such as stock too thin for pocket screws) is refused with exit 1, invalid-value, and the checks in error.issues. The new parts are not placed; run optimize.",
   args: [FILE_ARG],
   options: [...FIELD_OPTIONS, ID_OPTION, ...OUTPUT_OPTIONS],
   examples: [
```

Make the generated examples again:

```bash
npm run examples
```

Expected: `git status --short examples` lists `examples/kallax-2x4-mm.cutplan.json`, `examples/eket-wall-in.cutplan.json`, and their two CSV files, and no other file. The other examples have no designs.

Apply this change to `docs/format.md` (`git apply` accepts it as is):

```diff
diff --git a/docs/format.md b/docs/format.md
index 7af3f59..45fc457 100644
--- a/docs/format.md
+++ b/docs/format.md
@@ -101,15 +101,19 @@ An **axis** is one of:
 
 | Part id | Name | Length × width | Quantity |
 |---|---|---|---|
-| `<id>-vertical` | Vertical panel | outside height × panel depth | (*n* + 1) × *q* |
-| `<id>-horizontal`, or `<id>-horizontal-<k>` | Shelf, or Shelf *k* | column opening × panel depth | (*m* + 1) × the columns with that opening × *q* |
+| `<id>-top` | Top | outside width × panel depth | *q* |
+| `<id>-bottom` | Bottom | outside width × panel depth | *q* |
+| `<id>-side` | Side | (outside height − 2*t*) × panel depth | 2 × *q* |
+| `<id>-divider` | Divider | (outside height − 2*t*) × panel depth | (*n* − 1) × *q* |
+| `<id>-shelf`, or `<id>-shelf-<k>` | Shelf, or Shelf *k* | column opening × panel depth | (*m* − 1) × the columns with that opening × *q* |
 | `<id>-back` | Back | outside height × outside width | *q* |
 
 - An `outside` axis has openings of (outside − (cells + 1) × *t*) / cells. An `openings` axis has an outside size of
   the sum of the openings + (*n* + 1) × *t*, where *n* is the number of openings.
 - The panel depth is `depth` minus the back thickness.
-- The vertical panels run the full height. Each shelf fits between two vertical panels. All joints are butt joints
-  with pocket screws.
+- The design is a box. The top and the bottom run the full width. The sides and the dividers fit between the top and
+  the bottom, and each shelf fits between a side and a divider or between two dividers. All joints are butt joints
+  with pocket screws. A design with 1 column has no divider part, and a design with 1 row has no shelf part.
 - Columns with the same opening share one shelf part. With more than one opening size, *k* counts the sizes in column
   order from 1.
 - Every generated part has `grain: "length"` and `group` set to the design name.
```

Apply this change to `docs/cli.md` (`git apply` accepts it as is):

```diff
diff --git a/docs/cli.md b/docs/cli.md
index ba6d742..556c791 100644
--- a/docs/cli.md
+++ b/docs/cli.md
@@ -131,8 +131,8 @@ files.
 
 ### Designs
 
-A design is a cabinet grid: vertical panels that run the full height, with shelves between them, all joined with
-pocket screws. The CLI makes the parts of the design, and you cannot change them with `parts set` or `parts remove`
+A design is a cabinet box: a top and a bottom that run the full width, the sides and the dividers between them, and
+the shelves between the sides and the dividers, all joined with pocket screws. The CLI makes the parts of the design, and you cannot change them with `parts set` or `parts remove`
 (exit 1, `generated-part`). Change the design, or use `design detach` to make them normal parts.
 
 | Command | What it does | Example |
```

Apply this change to `docs/superpowers/specs/2026-09-29-cabinet-generator-design.md` (`git apply` accepts it as is):

```diff
diff --git a/docs/superpowers/specs/2026-09-29-cabinet-generator-design.md b/docs/superpowers/specs/2026-09-29-cabinet-generator-design.md
index 573ad24..affefab 100644
--- a/docs/superpowers/specs/2026-09-29-cabinet-generator-design.md
+++ b/docs/superpowers/specs/2026-09-29-cabinet-generator-design.md
@@ -155,6 +155,10 @@ fixed, so later minor versions can add systems, such as PAX, and mounts.
 
 ### 5.1 Joinery rule
 
+> `2026-09-30-box-construction-design.md` replaces this construction, the part table in 5.2, the assembly steps in 6.1,
+> and the pocket screw count in 6.2: the top and the bottom now run the full width, and the sides and the dividers fit
+> between them.
+
 Only butt joints with pocket screws. The jig drills the holes in the end of the piece that butts.
 
 - Each side and each interior divider is one **vertical panel** that runs the full outside height. A unit with *n*
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm run check && npm run e2e -w @opencutplan/web`

Expected: exit 0; core 531, CLI 122, and web 155 tests pass, and the 3 Playwright tests pass. The search fingerprints of `living-room-shelf` and `simple-bookcase-mm` do not change.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/design/panels.ts packages/core/test/design/panels.test.ts packages/core/src/design/parts.ts packages/core/src/reports/elevation.ts packages/core/src/index.ts packages/cli/src/commands/design.ts packages/core/test/design/parts.test.ts packages/core/test/reports/elevation.test.ts packages/core/test/design/generate.test.ts packages/core/test/design/errors.test.ts packages/core/test/design/checks.test.ts packages/core/test/design/edit.test.ts packages/core/test/examples.test.ts packages/core/test/helpers.ts packages/core/test/optimize/search.test.ts packages/cli/test/design.test.ts packages/cli/test/design-write.test.ts packages/cli/test/flow.test.ts apps/web/test/helpers.ts apps/web/test/useProject.test.tsx apps/web/test/DesignTab.test.tsx apps/web/test/PartsTab.test.tsx apps/web/test/Workspace.test.tsx apps/web/e2e/plan.e2e.ts examples/eket-wall-in.cutplan.json examples/kallax-2x4-mm.cutplan.json examples/csv/eket-wall-in-parts.csv examples/csv/kallax-2x4-mm-parts.csv docs/format.md docs/cli.md docs/superpowers/specs/2026-09-29-cabinet-generator-design.md
git commit -m "Make each design a box with a full-width top and bottom" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```


### Task 2: The hardware and the assembly steps of the box

**Files:**
- Modify: `packages/core/src/design/hardware.ts`, `packages/core/src/design/assembly.ts`
- Test: `packages/core/test/design/hardware.test.ts`, `packages/core/test/design/assembly.test.ts`, `packages/cli/test/design-report.test.ts`, `packages/cli/test/flow.test.ts`, `apps/web/test/ReportsTab.test.tsx`, `apps/web/test/ShopTab.test.tsx`, `apps/web/test/progress.test.ts`, `apps/web/test/Workspace.test.tsx`

**Interfaces:**
- Consumes: the box parts and `DesignGeometry` from Task 1.
- Produces, in `hardware.ts`: `pocketHoleEnds(geometry: DesignGeometry): number`, which is 2 × (columns + 1) + 2 × columns × (rows − 1). `backScrewCount` uses H − 2t for each divider edge.
- Produces, in `assembly.ts`: the step titles "Drill the pocket holes", "Mark the shelf positions" (with 2 or more rows), "Mark the divider positions" (with 2 or more columns), "Cut spacers" and "Assemble column c of n" (with 2 or more rows), "Fit the bottom and the top", "Check that it is square", "Fit the back" (with a back), and the mount steps, in this order.

- [ ] **Step 1: Write the failing tests**

Apply this change to `packages/core/test/design/hardware.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/test/design/hardware.test.ts b/packages/core/test/design/hardware.test.ts
index 9ab0434..6ac0204 100644
--- a/packages/core/test/design/hardware.test.ts
+++ b/packages/core/test/design/hardware.test.ts
@@ -1,8 +1,9 @@
 import { describe, expect, it } from "vitest";
-import { hardwareList, pocketHolesPerEnd, pocketScrew, railsFor, regenerateDesigns, type HardwareLine } from "../../src/index.ts";
+import { backScrewCount, designGeometry, hardwareList, materialsById, pocketHoleEnds, pocketHolesPerEnd, pocketScrew, railsFor, regenerateDesigns, type Design, type HardwareLine } from "../../src/index.ts";
 import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";
 
 const counts = (lines: HardwareLine[]) => lines.map((line) => [line.item, line.quantity, line.design]);
+const geometryOf = (design: Design) => designGeometry(design, materialsById(designProject()))!;
 
 describe("pocketScrew", () => {
   it("follows the Kreg chart at the nearest 1/8 inch setting", () => {
@@ -52,7 +53,7 @@ describe("hardwareList", () => {
   it("lists the pocket screws, the anti-tip fitting, and the glue for a KALLAX on the floor", () => {
     const lines = hardwareList(regenerateDesigns(designProject([kallaxDesign()])));
     expect(counts(lines)).toEqual([
-      ["pocket-screws", 66, "kx"],
+      ["pocket-screws", 60, "kx"],
       ["anti-tip", 1, "kx"],
       ["wall-fixings", null, "kx"],
       ["glue", null, null],
@@ -63,7 +64,7 @@ describe("hardwareList", () => {
   it("lists the back screws and the rails for two EKET units on the wall", () => {
     const lines = hardwareList(regenerateDesigns(designProject([eketDesign()])));
     expect(counts(lines)).toEqual([
-      ["pocket-screws", 53, "ek"],
+      ["pocket-screws", 40, "ek"],
       ["back-screws", 42, "ek"],
       ["eket-rail-70", 2, "ek"],
       ["wall-fixings", null, "ek"],
@@ -76,7 +77,7 @@ describe("hardwareList", () => {
   it("offers the three leg finishes, and anchors a unit on legs", () => {
     const lines = hardwareList(regenerateDesigns(designProject([eketDesign({ mount: "legs" })])));
     expect(counts(lines)).toEqual([
-      ["pocket-screws", 53, "ek"],
+      ["pocket-screws", 40, "ek"],
       ["back-screws", 42, "ek"],
       ["eket-legs", 2, "ek"],
       ["anti-tip", 2, "ek"],
@@ -86,6 +87,19 @@ describe("hardwareList", () => {
     expect(lines[2]!.choices!.map((choice) => choice.article)).toEqual(["70574660", "80474151", "70428904"]);
   });
 
+  it("counts the ends of the sides, the dividers, and the shelves of the box", () => {
+    const pocket = (design: Design) => hardwareList(regenerateDesigns(designProject([design])))[0]!.quantity;
+    expect(pocket(kallaxDesign({ height: { openings: [335, 335, 335] } }))).toBe(47);
+    expect(pocket(kallaxDesign({ width: { openings: [335] }, height: { openings: [335] } }))).toBe(14);
+    expect(pocketHoleEnds(geometryOf(kallaxDesign({ height: { openings: [335, 335, 335] } })))).toBe(14);
+    expect(pocketHoleEnds(geometryOf(kallaxDesign({ width: { openings: [335] }, height: { openings: [335] } })))).toBe(4);
+  });
+
+  it("puts the back screws along the perimeter, the dividers between the top and the bottom, and the shelves", () => {
+    expect(backScrewCount(geometryOf(kallaxDesign({ back: { material: "ply6" } })), "mm")).toBe(62);
+    expect(backScrewCount(geometryOf(kallaxDesign({ back: { material: "ply6" }, width: { openings: [335] }, height: { openings: [335] } })), "mm")).toBe(16);
+  });
+
   it("leaves out a design with an error and gives no glue line without designs", () => {
     expect(hardwareList(designProject([kallaxDesign({ material: "missing" })]))).toEqual([]);
     expect(hardwareList(designProject([]))).toEqual([]);
```

Apply this change to `packages/core/test/design/assembly.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/test/design/assembly.test.ts b/packages/core/test/design/assembly.test.ts
index 2c0742c..c3b4cc1 100644
--- a/packages/core/test/design/assembly.test.ts
+++ b/packages/core/test/design/assembly.test.ts
@@ -2,7 +2,7 @@ import { describe, expect, it } from "vitest";
 import { assemblySteps, convertProjectUnits, regenerateDesigns } from "../../src/index.ts";
 import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";
 
-const project = regenerateDesigns(designProject([kallaxDesign(), eketDesign(), kallaxDesign({ id: "c", name: "Mixed", system: "custom", width: { openings: [335, 400, 335] }, height: { openings: [300, 335] } })]));
+const project = regenerateDesigns(designProject([kallaxDesign(), eketDesign(), kallaxDesign({ id: "c", name: "Mixed", system: "custom", width: { openings: [335, 400, 335] }, height: { openings: [400, 300, 335] } })]));
 
 describe("assemblySteps", () => {
   it("gives the KALLAX 2x4 steps in order", () => {
@@ -10,39 +10,85 @@ describe("assemblySteps", () => {
     expect(steps.map((step) => step.title)).toEqual([
       "Drill the pocket holes",
       "Mark the shelf positions",
+      "Mark the divider positions",
       "Cut spacers",
       "Assemble column 1 of 2",
       "Assemble column 2 of 2",
+      "Fit the bottom and the top",
       "Check that it is square",
       "Anchor the unit",
     ]);
-    expect(steps[0]!.body).toBe('Drill 3 pocket holes in each end of all 10 shelves, on the underside, for 18 mm stock. Set the jig and the drill collar to the 3/4" mark.');
-    expect(steps[1]!.body).toBe("Mark the underside of each shelf on the vertical panels at 0 mm, 353 mm, 706 mm, 1059 mm and 1412 mm from the bottom end.");
-    expect(steps[2]!.body).toBe("Cut 2 spacers to 335 mm from an offcut. They hold each shelf on its mark while you drive the screws.");
-    expect(steps[3]!.body).toContain("Put the 5 shelves of this column (335 mm long)");
-    expect(steps[3]!.body).toContain('1 1/4" (32 mm) coarse-thread pocket screws');
-    expect(steps[4]!.body).toMatch(/^Use the right panel of column 1 as the left panel\./);
-    expect(steps[5]!.body).toContain("Both must be 1603 mm.");
+    expect(steps[0]!.body).toBe(
+      'Drill 3 pocket holes in each end of the 2 sides and the 1 divider, on the inside face of each side and on one face of the divider, and in each end of the 6 shelves, on the underside, for 18 mm stock. Set the jig and the drill collar to the 3/4" mark.',
+    );
+    expect(steps[1]!.body).toBe("Mark the underside of each shelf on the sides and the dividers at 335 mm, 688 mm and 1041 mm from the bottom end.");
+    expect(steps[2]!.body).toBe("Mark the left face of each divider on the top and the bottom at 353 mm from the left end.");
+    expect(steps[3]!.body).toBe("Cut 2 spacers to 335 mm from an offcut. They hold each shelf on its mark while you drive the screws.");
+    expect(steps[4]!.body).toBe(
+      'Lay the left side on its outside face, with the marks up. Put the 3 shelves of this column (335 mm long) on their marks, with the pocket holes down, and screw them to the panel with 1 1/4" (32 mm) coarse-thread pocket screws. Then put the next divider on the other ends of the shelves, and screw it on.',
+    );
+    expect(steps[5]!.body).toMatch(/^Use the divider on the right of column 1 as the left panel\./);
+    expect(steps[5]!.body).toMatch(/Then put the right side on the other ends of the shelves, and screw it on\.$/);
+    expect(steps[6]!.body).toBe(
+      "Lay the frame on its back. Put the bottom on the lower ends of the sides and the dividers, with each divider on its mark, and screw it on through the pocket holes in their ends. Then fit the top the same way.",
+    );
+    expect(steps[7]!.body).toContain("Both must be 1603 mm.");
   });
 
   it("says how many to build, fits the back, and hangs an EKET on the rail", () => {
     const steps = assemblySteps(project, "ek")!;
-    expect(steps[0]!.body).toMatch(/^Build 2 of these\. The numbers in these steps are for one unit\. Drill 3 pocket holes in each end of all 4 shelves/);
-    expect(steps.map((step) => step.title).slice(-3)).toEqual(["Check that it is square", "Fit the back", "Hang the unit"]);
-    expect(steps.at(-3)!.body).toContain("Both must be 782.5 mm.");
-    expect(steps.at(-2)!.body).toBe('Glue the back to the rear edges, then screw it on with 21 #6 × 3/4" (4 × 20 mm) flat head wood screws: 25 mm from the ends of each edge, and at most 150 mm apart.');
-    expect(steps.at(-1)!.body).toContain("(1 × EKET suspension rail, 70 cm)");
-    expect(steps.at(-1)!.body).toContain("AA-1912543-9");
-    expect(steps.at(-1)!.body).toContain("Leave at least 50 mm free above the unit.");
+    expect(steps.map((step) => step.title)).toEqual(["Drill the pocket holes", "Mark the divider positions", "Fit the bottom and the top", "Check that it is square", "Fit the back", "Hang the unit"]);
+    expect(steps[0]!.body).toMatch(
+      /^Build 2 of these\. The numbers in these steps are for one unit\. Drill 3 pocket holes in each end of the 2 sides and the 1 divider, on the inside face of each side and on one face of the divider, for 18 mm stock\./,
+    );
+    expect(steps[1]!.body).toBe("Mark the left face of each divider on the top and the bottom at 341 mm from the left end.");
+    expect(steps[2]!.body).toBe("Stand the sides and the dividers on the bottom, with each divider on its mark, and screw them to it through the pocket holes in their ends. Then fit the top the same way.");
+    expect(steps[3]!.body).toContain("Both must be 782.5 mm.");
+    expect(steps[4]!.body).toBe('Glue the back to the rear edges, then screw it on with 21 #6 × 3/4" (4 × 20 mm) flat head wood screws: 25 mm from the ends of each edge, and at most 150 mm apart.');
+    expect(steps[5]!.body).toContain("(1 × EKET suspension rail, 70 cm)");
+    expect(steps[5]!.body).toContain("AA-1912543-9");
+    expect(steps[5]!.body).toContain("Leave at least 50 mm free above the unit.");
   });
 
-  it("gives one spacer pair for each row opening, and one step for each column", () => {
+  it("gives one spacer pair for each opening under a shelf, a mark for each divider, and one step for each column", () => {
     const steps = assemblySteps(project, "c")!;
-    expect(steps[1]!.body).toContain("at 0 mm, 353 mm and 671 mm from the bottom end");
-    expect(steps[2]!.body).toBe("Cut 2 spacers to 300 mm and 2 spacers to 335 mm from an offcut. They hold each shelf on its mark while you drive the screws.");
+    const body = (title: string) => steps.find((step) => step.title === title)!.body;
+    expect(body("Mark the shelf positions")).toContain("at 335 mm and 653 mm from the bottom end");
+    expect(body("Mark the divider positions")).toContain("at 353 mm and 771 mm from the left end");
+    expect(body("Cut spacers")).toBe("Cut 2 spacers to 300 mm and 2 spacers to 335 mm from an offcut. They hold each shelf on its mark while you drive the screws.");
     expect(steps.filter((step) => step.title.startsWith("Assemble")).map((step) => step.body.match(/\((.+) long\)/)![1])).toEqual(["335 mm", "400 mm", "335 mm"]);
   });
 
+  it("leaves out the dividers for 1 column and the shelves for 1 row", () => {
+    const single = regenerateDesigns(
+      designProject([
+        kallaxDesign({ id: "one", width: { openings: [335] }, height: { openings: [335] } }),
+        kallaxDesign({ id: "tall", width: { openings: [335] }, height: { openings: [335, 335] } }),
+      ]),
+    );
+    const one = assemblySteps(single, "one")!;
+    expect(one.map((step) => step.title)).toEqual(["Drill the pocket holes", "Fit the bottom and the top", "Check that it is square", "Anchor the unit"]);
+    expect(one[0]!.body).toMatch(/^Drill 3 pocket holes in each end of the 2 sides, on the inside face of each side, for 18 mm stock\./);
+    expect(one[1]!.body).toBe("Stand the sides on the bottom, and screw them to it through the pocket holes in their ends. Then fit the top the same way.");
+
+    const tall = assemblySteps(single, "tall")!;
+    expect(tall.map((step) => step.title)).toEqual([
+      "Drill the pocket holes",
+      "Mark the shelf positions",
+      "Cut spacers",
+      "Assemble column 1 of 1",
+      "Fit the bottom and the top",
+      "Check that it is square",
+      "Anchor the unit",
+    ]);
+    expect(tall[0]!.body).toMatch(/^Drill 3 pocket holes in each end of the 2 sides, on the inside face of each side, and in each end of the shelf, on the underside, for 18 mm stock\./);
+    expect(tall[1]!.body).toBe("Mark the underside of each shelf on the sides at 335 mm from the bottom end.");
+    expect(tall[3]!.body).toBe(
+      'Lay the left side on its outside face, with the marks up. Put the shelf of this column (335 mm long) on its mark, with the pocket holes down, and screw it to the panel with 1 1/4" (32 mm) coarse-thread pocket screws. Then put the right side on the other ends of the shelf, and screw it on.',
+    );
+    expect(tall[4]!.body).toMatch(/^Lay the frame on its back\. Put the bottom on the lower ends of the sides, and screw it on/);
+  });
+
   it("fits the legs with their guides, then anchors the unit", () => {
     const legs = regenerateDesigns(designProject([eketDesign({ mount: "legs", quantity: 1, back: undefined })]));
     const steps = assemblySteps(legs, "ek")!;
@@ -54,8 +100,8 @@ describe("assemblySteps", () => {
   it("gives the lengths in the project units", () => {
     const steps = assemblySteps(convertProjectUnits(project, "in"), "ek")!;
     expect(steps[0]!.body).toContain('for 23/32" stock');
-    expect(steps[1]!.body).toBe('Mark the underside of each shelf on the vertical panels at 0" and 13 1/16" from the bottom end.');
-    expect(steps[5]!.body).toContain('Both must be 30 13/16".');
+    expect(steps[1]!.body).toBe('Mark the left face of each divider on the top and the bottom at 13 7/16" from the left end.');
+    expect(steps[3]!.body).toContain('Both must be 30 13/16".');
   });
 
   it("gives null for a missing design or a design with an error", () => {
```

Apply this change to `packages/cli/test/design-report.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/cli/test/design-report.test.ts b/packages/cli/test/design-report.test.ts
index 89fa98c..eeb79ae 100644
--- a/packages/cli/test/design-report.test.ts
+++ b/packages/cli/test/design-report.test.ts
@@ -9,17 +9,15 @@ describe("report assembly", () => {
     expect(design).toMatchObject({ design: "eket", name: "Wall EKET", quantity: 2 });
     expect(design.steps.map((step: { title: string }) => step.title)).toEqual([
       "Drill the pocket holes",
-      "Mark the shelf positions",
-      "Cut spacers",
-      "Assemble column 1 of 2",
-      "Assemble column 2 of 2",
+      "Mark the divider positions",
+      "Fit the bottom and the top",
       "Check that it is square",
       "Fit the back",
       "Hang the unit",
     ]);
     expect(result.json().skipped).toEqual([]);
     const text = await cli(["report", "assembly", KALLAX], withDesignExamples());
-    expect(text.stdout).toContain("Hall KALLAX (kallax)\n  1. Drill the pocket holes\n     Drill 3 pocket holes in each end of all 10 shelves");
+    expect(text.stdout).toContain("Hall KALLAX (kallax)\n  1. Drill the pocket holes\n     Drill 3 pocket holes in each end of the 2 sides and the 1 divider");
   });
 
   it("skips a design that makes no parts, and exits 1 when --design names it", async () => {
@@ -45,14 +43,14 @@ describe("report shopping hardware", () => {
   it("lists the hardware for the designs", async () => {
     const result = await cli(["report", "shopping", EKET, "--json"], withDesignExamples());
     expect(result.json().hardware.map((line: { item: string; quantity: number | null }) => [line.item, line.quantity])).toEqual([
-      ["pocket-screws", 53],
+      ["pocket-screws", 40],
       ["back-screws", 42],
       ["eket-rail-70", 2],
       ["wall-fixings", null],
       ["glue", null],
     ]);
     const text = await cli(["report", "shopping", EKET], withDesignExamples());
-    expect(text.stdout).toContain('Hardware:\n  53 Pocket screws, coarse thread, 1 1/4" (32 mm) [eket]');
+    expect(text.stdout).toContain('Hardware:\n  40 Pocket screws, coarse thread, 1 1/4" (32 mm) [eket]');
     expect(text.stdout).toContain("  2 EKET suspension rail, 70 cm (IKEA 80340048) [eket]");
     expect(text.stdout).toContain("  as needed Wood glue (PVA)");
   });
```

Apply this change to `packages/cli/test/flow.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/cli/test/flow.test.ts b/packages/cli/test/flow.test.ts
index c8acf75..c054133 100644
--- a/packages/cli/test/flow.test.ts
+++ b/packages/cli/test/flow.test.ts
@@ -91,9 +91,9 @@ describe("an agent flow in a real directory", () => {
     expect(optimized.code).toBe(0);
     expect(optimized.json().after).toMatchObject({ placedCopies: 11, unplacedCopies: 0, errors: 0 });
     const assembly = await real(["report", "assembly", file, "--json"]);
-    expect(assembly.json().designs[0].steps.length).toBe(7);
+    expect(assembly.json().designs[0].steps.length).toBe(9);
     const shopping = await real(["report", "shopping", file, "--json"]);
-    expect(shopping.json().hardware[0]).toMatchObject({ item: "pocket-screws", quantity: 66, design: "kallax-2x4" });
+    expect(shopping.json().hardware[0]).toMatchObject({ item: "pocket-screws", quantity: 60, design: "kallax-2x4" });
     const drawing = await real(["design", "drawing", file, "kallax-2x4", "--out", join(dir, "hall.svg"), "--json"]);
     expect(drawing.code).toBe(0);
     expect(await readFile(join(dir, "hall.svg"), "utf8")).toMatch(/^<svg /);
```

Apply this change to `apps/web/test/ReportsTab.test.tsx` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/test/ReportsTab.test.tsx b/apps/web/test/ReportsTab.test.tsx
index 5264621..7ab2876 100644
--- a/apps/web/test/ReportsTab.test.tsx
+++ b/apps/web/test/ReportsTab.test.tsx
@@ -145,7 +145,7 @@ describe("ReportsTab", () => {
     renderReports({ ...designProject(), designs: [{ ...designProject().designs![0]!, mount: "wall-rail" }] });
     const hardware = within(screen.getByRole("region", { name: "Hardware" }));
     expect(hardware.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent))).toEqual([
-      ["Pocket screws, coarse thread, 1 1/4\" (32 mm)", "", "40", "Hall"],
+      ["Pocket screws, coarse thread, 1 1/4\" (32 mm)", "", "33", "Hall"],
       ["EKET suspension rail, 70 cm", "80340048", "1", "Hall"],
       ["Wall screws and plugs for your wall type", "", "As needed", "Hall"],
       ["Wood glue (PVA)", "", "As needed", "Every design"],
```

Apply this change to `apps/web/test/ShopTab.test.tsx` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/test/ShopTab.test.tsx b/apps/web/test/ShopTab.test.tsx
index da26096..ebdb91a 100644
--- a/apps/web/test/ShopTab.test.tsx
+++ b/apps/web/test/ShopTab.test.tsx
@@ -179,12 +179,12 @@ describe("ShopTab", () => {
     const { current } = renderShop(designProject());
     const assembly = within(screen.getByRole("region", { name: "Assembly" }));
     expect(assembly.getByRole("heading", { name: "Hall", level: 4 })).toBeTruthy();
-    expect(assembly.getAllByRole("listitem")).toHaveLength(7);
-    expect(assembly.getAllByRole("listitem")[0]!.textContent).toMatch(/^Drill the pocket holesDrill 3 pocket holes in each end of all 6 shelves/);
+    expect(assembly.getAllByRole("listitem")).toHaveLength(9);
+    expect(assembly.getAllByRole("listitem")[0]!.textContent).toMatch(/^Drill the pocket holesDrill 3 pocket holes in each end of the 2 sides and the 1 divider/);
     await userEvent.click(assembly.getByRole("checkbox", { name: "Assembly step 2 done" }));
     expect(readProgress(current().project, "assemblyProgress")?.done).toEqual([2]);
     expect(readProgress(current().project)).toBeNull();
-    expect(assembly.getByText("1 of 7 assembly steps done.")).toBeTruthy();
+    expect(assembly.getByText("1 of 9 assembly steps done.")).toBeTruthy();
     act(() => current().undo());
     expect(readProgress(current().project, "assemblyProgress")).toBeNull();
   });
```

Apply this change to `apps/web/test/progress.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/test/progress.test.ts b/apps/web/test/progress.test.ts
index a405850..9c0a52f 100644
--- a/apps/web/test/progress.test.ts
+++ b/apps/web/test/progress.test.ts
@@ -88,10 +88,10 @@ describe("assembly progress", () => {
     const broken = { ...project.designs![0]!, id: "broken", name: "Broken", material: "ply6" };
     const groups = assemblyGroups({ ...project, designs: [...project.designs!, broken, second] });
     expect(groups.map((group) => [group.design, group.start, group.steps.length])).toEqual([
-      ["hall", 1, 7],
-      ["two", 8, 7],
+      ["hall", 1, 9],
+      ["two", 10, 9],
     ]);
-    expect(assemblyCount(groups)).toBe(14);
+    expect(assemblyCount(groups)).toBe(18);
   });
 
   it("stores its ticks apart from the cut ticks, and a change to the steps makes them stale", () => {
```

Apply this change to `apps/web/test/Workspace.test.tsx` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/test/Workspace.test.tsx b/apps/web/test/Workspace.test.tsx
index 4d49c2a..649b8aa 100644
--- a/apps/web/test/Workspace.test.tsx
+++ b/apps/web/test/Workspace.test.tsx
@@ -191,7 +191,7 @@ describe("Workspace", () => {
     await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
     const root = document.body.querySelector(":scope > .print-root")!;
     expect(root.getAttribute("data-job")).toBe("assembly");
-    expect(root.querySelectorAll(".print-steps li")).toHaveLength(7);
+    expect(root.querySelectorAll(".print-steps li")).toHaveLength(9);
     print.mockRestore();
   });
 });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root packages/core test/design/hardware.test.ts test/design/assembly.test.ts`

Expected: FAIL: the hardware test gets `pocketHoleEnds is not a function` and 66 pocket screws in place of 60; the assembly tests get "Drill 3 pocket holes in each end of all 10 shelves" and no step "Mark the divider positions".

- [ ] **Step 3: Implement**

Apply this change to `packages/core/src/design/hardware.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/src/design/hardware.ts b/packages/core/src/design/hardware.ts
index 384a179..ec73c73 100644
--- a/packages/core/src/design/hardware.ts
+++ b/packages/core/src/design/hardware.ts
@@ -54,11 +54,18 @@ function edgeScrews(lengthMm: number): number {
 /** The screws for one back: along the perimeter and each interior panel edge, 25 mm from the ends and at most 150 mm apart. */
 export function backScrewCount(geometry: DesignGeometry, units: Units): number {
   const edges = [geometry.outsideHeight, geometry.outsideHeight, geometry.outsideWidth, geometry.outsideWidth];
-  for (let column = 1; column < geometry.columns.length; column++) edges.push(geometry.outsideHeight);
+  const upright = geometry.outsideHeight - 2 * geometry.thickness;
+  for (let column = 1; column < geometry.columns.length; column++) edges.push(upright);
   for (let line = 1; line < geometry.rows.length; line++) edges.push(...geometry.columns);
   return edges.reduce((sum, edge) => sum + edgeScrews(convertLength(edge, units, "mm")), 0);
 }
 
+/** The panel ends with pocket holes in one unit: both ends of each side, divider, and shelf. */
+export function pocketHoleEnds(geometry: DesignGeometry): number {
+  const columns = geometry.columns.length;
+  return 2 * (columns + 1) + 2 * columns * (geometry.rows.length - 1);
+}
+
 export interface Rails {
   long: number;
   short: number;
@@ -106,8 +113,7 @@ export function hardwareList(project: Project): HardwareLine[] {
     const quantity = design.quantity ?? DEFAULT_DESIGN_QUANTITY;
     const add = (line: Omit<HardwareLine, "design">) => lines.push({ ...line, design: design.id });
 
-    const pieces = geometry.columns.length * (geometry.rows.length + 1);
-    const holes = pieces * 2 * pocketHolesPerEnd(mm(geometry.panelDepth)) * quantity;
+    const holes = pocketHoleEnds(geometry) * pocketHolesPerEnd(mm(geometry.panelDepth)) * quantity;
     const screw = pocketScrew(mm(geometry.thickness));
     add({
       item: "pocket-screws",
```

Apply this change to `packages/core/src/design/assembly.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/src/design/assembly.ts b/packages/core/src/design/assembly.ts
index ee2c38b..04e1c09 100644
--- a/packages/core/src/design/assembly.ts
+++ b/packages/core/src/design/assembly.ts
@@ -28,31 +28,66 @@ export function assemblySteps(project: Project, designId: string): AssemblyStep[
   const quantity = design.quantity ?? DEFAULT_DESIGN_QUANTITY;
   const mount = design.mount ?? DEFAULT_DESIGN_MOUNT;
   const { thickness, columns, rows } = geometry;
-  const lines = rows.length + 1;
-  const pieces = columns.length * lines;
+  const dividers = columns.length - 1;
+  const perColumn = rows.length - 1;
+  const shelves = columns.length * perColumn;
   const screw = pocketScrew(mm(thickness));
   const screws = screw ? `${screw.screw} coarse-thread pocket screws` : "pocket screws (the chart has no length for this stock)";
+  const uprights = dividers === 0 ? "the sides" : "the sides and the dividers";
   const steps: AssemblyStep[] = [];
 
   const setting = screw ? ` Set the jig and the drill collar to the ${formatLength(screw.setting, "in", { inch: 8, mm: 1 })} mark.` : "";
+  const drilled =
+    dividers === 0
+      ? "the 2 sides, on the inside face of each side"
+      : `the 2 sides and the ${dividers} ${dividers === 1 ? "divider" : "dividers"}, on the inside face of each side and on one face of ${dividers === 1 ? "the divider" : "each divider"}`;
+  const drilledShelves = shelves === 0 ? "" : `, and in each end of ${shelves === 1 ? "the shelf" : `the ${shelves} shelves`}, on the underside`;
   steps.push({
     title: "Drill the pocket holes",
-    body: `${quantity > 1 ? `Build ${quantity} of these. The numbers in these steps are for one unit. ` : ""}Drill ${pocketHolesPerEnd(mm(geometry.panelDepth))} pocket holes in each end of ${pieces === 1 ? "the shelf" : `all ${pieces} shelves`}, on the underside, for ${show(thickness)} stock.${setting}`,
+    body: `${quantity > 1 ? `Build ${quantity} of these. The numbers in these steps are for one unit. ` : ""}Drill ${pocketHolesPerEnd(mm(geometry.panelDepth))} pocket holes in each end of ${drilled}${drilledShelves}, for ${show(thickness)} stock.${setting}`,
   });
 
-  const marks = [0];
-  for (let row = rows.length - 1; row >= 0; row--) marks.push(roundLength(marks.at(-1)! + thickness + rows[row]!));
-  steps.push({ title: "Mark the shelf positions", body: `Mark the underside of each shelf on the vertical panels at ${joinList(marks.map(show))} from the bottom end.` });
+  if (perColumn > 0) {
+    const marks = [rows.at(-1)!];
+    for (let row = rows.length - 2; row > 0; row--) marks.push(roundLength(marks.at(-1)! + thickness + rows[row]!));
+    steps.push({ title: "Mark the shelf positions", body: `Mark the underside of each shelf on ${uprights} at ${joinList(marks.map(show))} from the bottom end.` });
+  }
+
+  if (dividers > 0) {
+    const marks: number[] = [];
+    let x = 0;
+    for (let column = 0; column < dividers; column++) {
+      x = roundLength(x + thickness + columns[column]!);
+      marks.push(x);
+    }
+    steps.push({ title: "Mark the divider positions", body: `Mark the left face of each divider on the top and the bottom at ${joinList(marks.map(show))} from the left end.` });
+  }
 
-  const spacers = [...new Set(rows)].map((opening) => `2 spacers to ${show(opening)}`);
-  steps.push({ title: "Cut spacers", body: `Cut ${joinList(spacers)} from an offcut. They hold each shelf on its mark while you drive the screws.` });
+  if (perColumn > 0) {
+    const spacers = [...new Set(rows.slice(1))].map((opening) => `2 spacers to ${show(opening)}`);
+    steps.push({ title: "Cut spacers", body: `Cut ${joinList(spacers)} from an offcut. They hold each shelf on its mark while you drive the screws.` });
 
-  columns.forEach((opening, index) => {
-    const start = index === 0 ? "Lay the first vertical panel on its side, with the marks up." : `Use the right panel of column ${index} as the left panel.`;
-    steps.push({
-      title: `Assemble column ${index + 1} of ${columns.length}`,
-      body: `${start} Put the ${lines} shelves of this column (${show(opening)} long) on their marks, with the pocket holes down, and screw them to the panel with ${screws}. Then put the next vertical panel on the other ends of the shelves, and screw it on.`,
+    columns.forEach((opening, index) => {
+      const start = index === 0 ? "Lay the left side on its outside face, with the marks up." : `Use the divider on the right of column ${index} as the left panel.`;
+      const put =
+        perColumn === 1
+          ? `Put the shelf of this column (${show(opening)} long) on its mark, with the pocket holes down, and screw it to the panel with ${screws}.`
+          : `Put the ${perColumn} shelves of this column (${show(opening)} long) on their marks, with the pocket holes down, and screw them to the panel with ${screws}.`;
+      const next = index === dividers ? "the right side" : "the next divider";
+      steps.push({
+        title: `Assemble column ${index + 1} of ${columns.length}`,
+        body: `${start} ${put} Then put ${next} on the other ends of the ${perColumn === 1 ? "shelf" : "shelves"}, and screw it on.`,
+      });
     });
+  }
+
+  const onMark = dividers === 0 ? "" : ", with each divider on its mark";
+  steps.push({
+    title: "Fit the bottom and the top",
+    body:
+      perColumn > 0
+        ? `Lay the frame on its back. Put the bottom on the lower ends of ${uprights}${onMark}, and screw it on through the pocket holes in their ends. Then fit the top the same way.`
+        : `Stand ${uprights} on the bottom${onMark}, and screw them to it through the pocket holes in their ends. Then fit the top the same way.`,
   });
 
   const diagonal = roundLength(Math.hypot(geometry.outsideWidth, geometry.outsideHeight));
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm run check && npm run e2e -w @opencutplan/web`

Expected: exit 0; core 534, CLI 122, and web 155 tests pass, and the 3 Playwright tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/design/hardware.ts packages/core/src/design/assembly.ts packages/core/test/design/hardware.test.ts packages/core/test/design/assembly.test.ts packages/cli/test/design-report.test.ts packages/cli/test/flow.test.ts apps/web/test/ReportsTab.test.tsx apps/web/test/ShopTab.test.tsx apps/web/test/progress.test.ts apps/web/test/Workspace.test.tsx
git commit -m "Count the hardware and write the assembly steps for the box" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
