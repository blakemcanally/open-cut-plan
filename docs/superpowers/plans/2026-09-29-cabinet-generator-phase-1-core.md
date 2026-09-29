# Cabinet Generator Phase 1 — Core Model and Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add format 1.1 `designs` to core. A design is a box with a grid of cells. Core turns it into parts, makes the parts again when the design or its material changes, and checks it against the KALLAX, EKET, and pocket-hole rules.

**Architecture:** A design is project data, like parts and stock. Its parts are derived from it, but they are stored as normal parts with a `design` field, so the optimizer, the Shop checklist, and the reports use them with no change. The pure pipeline is `designGeometry` (sizes) → `buildDesignParts` (parts) → `designErrors` (the problems that stop generation) → `designParts` / `regenerateDesigns` (the project edit) → `checkDesigns` (all issues, including warnings). `checkDesigns` joins `analyzeProject` and `validatePlan`. Phase 1 changes no CLI command and no web screen; phases 2 and 3 call `regenerateDesigns` on each write.

**Tech Stack:** as in the earlier phases: TypeScript (strict, erasable syntax only), zod 4, Vitest, fast-check. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-29-cabinet-generator-design.md` (§4 data model, §5 geometry and joinery, §9 code layout, §11 testing, §12 phase 1). Appendix A has the IKEA numbers.

## Global Constraints

- Add no dependencies.
- ESM only. Relative imports use the `.ts` extension. Only erasable TypeScript syntax (no enums, no parameter properties, no namespaces).
- `FORMAT_VERSION` is `"1.1"` and `SUPPORTED_MINOR` is 1. The migration from 1.0 to 1.1 does nothing.
- `designs` is an optional top-level array. `system` and `mount` are free strings in the schema; the known values are `kallax`, `eket`, `custom` and `floor`, `legs`, `feet`, `wall-rail`.
- An axis is `{ openings: number[] }` (1 to 50 positive values) or `{ outside: number, cells: integer }` (cells 1 to 50). `quantity` is an integer from 1 to 100, default 1. `mount` defaults to `floor`.
- Generated part ids: `<design>-vertical`, `<design>-horizontal` (or `<design>-horizontal-<k>` when the columns have more than one opening size), `<design>-back`. Names: `Vertical panel`, `Shelf` (or `Shelf <k>`), `Back`. `group` is the design `name`. `grain` is `"length"`.
- Vertical panels run the full outside height; horizontal pieces fit between them. Panel depth = `depth` − back thickness.
- Every length is in `project.units`. Preset numbers are in millimetres and convert with `convertLength`. Lengths that core computes are rounded to 1e-9, as `edit/units.ts` does.
- Comments: default to none. Only a comment that carries information the code cannot (for example, where a number comes from).
- Commit after every task. Every commit message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (use two `-m` flags exactly as shown).
- The repo stays local. Do not add a git remote or push.
- Work in the worktree `worktrees/cabinet-generator` on the branch `cabinet-generator`.

## Review Focus

1. **A unit change** (mm → in) converts the design lengths, and the generated parts stay current: `regenerateDesigns` returns the same object, no copy leaves its sheet, and there is no `design-stale` warning. Pinned in Task 8 (`converts design lengths, and the parts stay current and placed`).
2. **A hand-made part whose id is a generated id** (for example, a manual part `kx-vertical`) is never overwritten. The design gets `design-conflict` and makes no parts. Pinned in Task 5 (`reports a part that already uses a generated id`) and Task 6 (`leaves the stored parts alone when the design has an error`).
3. **A generated part edited by hand in the file** gives `design-stale`, and `regenerateDesigns` puts the design's size back and moves the copies of that part to the tray. Pinned in Task 6 (`drops the copies of a part whose size changes`) and Task 7 (`warns when the stored parts do not match the design`).
4. **A design whose material does not exist** still loads. It gets a `bad-ref` error, makes no parts, and its stored parts stay. Pinned in Task 5 (`reports a missing material or back material`) and Task 6 (`leaves the stored parts alone when the design has an error`).
5. **An `outside` axis with a fractional thickness** (23/32" plywood in an inch project) gives equal openings that add up to the outside size, and the EKET check passes. Pinned in Task 3 (`divides an outside size equally with a fractional thickness`) and Task 9 (`eket-wall-in` example tests).

## Decisions

These choices go beyond the spec's text. Task 9 records the user-visible ones in `docs/format.md`.

- The spec's `design/generate.ts` is split into `design/parts.ts` (the pure part builder), `design/errors.ts` (the checks that stop generation), and `design/generate.ts` (the project edit). This split removes an import cycle between generation and the checks.
- New issue code `design-conflict` (error): a part that is not from this design already uses one of its generated ids. The spec does not name this case.
- Duplicate design ids refuse the file (`duplicate-id` error), like duplicate part and stock ids.
- A missing design material is a plan-level `bad-ref` **error** from `checkDesigns`, not a load error, so the file loads (spec §10). `design-missing` (a part names a design that does not exist) is a load **warning** from `checkReferences`.
- A generated part within `EPSILON` (1e-6) of its stored size keeps the stored numbers. Without this, the 1e-9 rounding after a unit change would look like a size change and move copies to the tray.
- `regenerateDesigns` returns the same object when nothing changes, so a React `useMemo` and the CLI can tell that nothing changed.
- Unknown keys on a stored generated part (for example `notes` added by hand) make the part differ from the design. `regenerateDesigns` replaces the part and drops those keys: the design owns its parts.
- `docs/format.md` is updated in this phase (the spec put it in phase 2), because the format changes here.
- The spec's agent recipe uses a 1.4 m track (`--max-cut 1400`). A 2440 mm sheet needs a 2440 mm rip, so the recipe and the example use a 2.8 m track. Task 9 fixes the spec.

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/format/schema.ts` | `DesignAxisSchema`, `DesignSchema`, `Part.design`, `Project.designs`, `FORMAT_VERSION` 1.1 |
| `packages/core/src/format/version.ts` | `SUPPORTED_MINOR` 1 |
| `packages/core/src/format/issues.ts` | the load issue code `design-missing` |
| `packages/core/src/format/references.ts` | duplicate design ids, parts that name a missing design |
| `packages/core/src/plan/issues.ts` | the design issue codes and the `design` ref kind |
| `packages/core/src/design/systems.ts` | the known systems and mounts, the IKEA and pocket-hole constants, `presetDesign` |
| `packages/core/src/design/geometry.ts` | `designGeometry`: openings, outside size, panel depth |
| `packages/core/src/design/parts.ts` | `buildDesignParts`: geometry → parts |
| `packages/core/src/design/errors.ts` | `designErrors`: the problems that stop generation |
| `packages/core/src/design/generate.ts` | `designParts`, `regenerateDesigns`, `sameParts` |
| `packages/core/src/design/checks.ts` | `checkDesigns`: every design issue |
| `packages/core/src/analysis.ts`, `plan/validate.ts` | include `checkDesigns` |
| `packages/core/src/edit/units.ts` | convert design lengths |
| `packages/core/src/index.ts` | export the design modules |
| `packages/core/test/helpers.ts` | `designProject`, `kallaxDesign`, `eketDesign` |
| `packages/core/test/design/*.test.ts` | the tests of the design modules |
| `examples/builders/*.ts`, `examples/*.cutplan.json`, `examples/csv/*` | version 1.1, and the two design examples |
| `schema/cutplan.schema.json` | regenerated |
| `docs/format.md`, the spec | the format documentation |

---

### Task 1: Format 1.1 with designs

**Files:**
- Modify: `packages/core/src/format/schema.ts`
- Modify: `packages/core/src/format/version.ts:2`
- Modify: `packages/core/test/helpers.ts` (append)
- Modify: `packages/core/test/format/schema.test.ts`, `packages/core/test/format/parse.test.ts`, `packages/core/test/format/version.test.ts:21`
- Modify: `examples/builders/living-room-shelf.ts:89`, `examples/builders/simple-bookcase-mm.ts:6`
- Modify: `packages/cli/test/project.test.ts:63,94`
- Regenerate: `examples/*.cutplan.json`, `schema/cutplan.schema.json`

**Interfaces:**
- Consumes: nothing new.
- Produces: `DesignAxisSchema`, `DesignSchema`, `type DesignAxis`, `type Design`, `MAX_DESIGN_CELLS = 50`, `MAX_DESIGN_QUANTITY = 100`, `Part.design?: string`, `Project.designs?: Design[]`, `FORMAT_VERSION = "1.1"`. Test helpers `designProject(designs?: Design[]): Project`, `kallaxDesign(patch?: Partial<Design>): Design`, `eketDesign(patch?: Partial<Design>): Design`.

- [ ] **Step 1: Add the test helpers**

Append to `packages/core/test/helpers.ts`, and add `type Design` to its import from `"../src/index.ts"`:

```ts
/** KALLAX 2×4 in 18 mm plywood, no back: 3 vertical panels 1430 × 390 and 10 shelves 335 × 390. */
export function kallaxDesign(patch: Partial<Design> = {}): Design {
  return {
    id: "kx",
    name: "Hall KALLAX",
    system: "kallax",
    material: "ply18",
    width: { openings: [335, 335] },
    height: { openings: [335, 335, 335, 335] },
    depth: 390,
    ...patch,
  };
}

/** EKET 2×1, 700 × 350 × 350 outside, 6 mm back, 2 units on the wall rail. */
export function eketDesign(patch: Partial<Design> = {}): Design {
  return {
    id: "ek",
    name: "Wall EKET",
    system: "eket",
    material: "ply18",
    quantity: 2,
    width: { outside: 700, cells: 2 },
    height: { outside: 350, cells: 1 },
    depth: 350,
    back: { material: "ply6" },
    mount: "wall-rail",
    ...patch,
  };
}

/** A mm project with 18 mm and 6 mm plywood, unlimited 2440 × 1220 sheets, a 2.8 m track saw, and no parts. */
export function designProject(designs: Design[] = [kallaxDesign()]): Project {
  const base = createProject("Designs", "mm");
  return {
    ...base,
    materials: [
      { id: "ply18", name: "Birch ply 18", thickness: 18, grained: true },
      { id: "ply6", name: "Birch ply 6", thickness: 6, grained: true },
    ],
    stock: [
      { id: "ply18-sheet", material: "ply18", length: 2440, width: 1220, quantity: null, cost: 80, kind: "sheet" },
      { id: "ply6-sheet", material: "ply6", length: 2440, width: 1220, quantity: null, cost: 40, kind: "sheet" },
    ],
    parts: [],
    tools: [{ id: "track", name: "Track saw", type: "track-saw", kerf: 2.2, enabled: true, maxCut: 2800 }],
    designs,
  };
}
```

- [ ] **Step 2: Write the failing tests**

In `packages/core/test/format/schema.test.ts`, change `expect(project.version).toBe("1.0");` to `expect(project.version).toBe("1.1");`. Add `parseProject`, `serializeProject`, and `type Design` to the import from `"../../src/index.ts"`, and `designProject`, `eketDesign`, `kallaxDesign` to the import from `"../helpers.ts"`. Append:

```ts
describe("designs", () => {
  it("loads a design and a generated part, and round-trips them", () => {
    const project = designProject([kallaxDesign(), eketDesign()]);
    project.parts = [
      { id: "kx-vertical", name: "Vertical panel", material: "ply18", length: 1430, width: 390, quantity: 3, grain: "length", group: "Hall KALLAX", design: "kx" },
    ];
    const result = parseProject(serializeProject(project));
    expect(result.ok && result.warnings).toEqual([]);
    expect(result.ok && result.project).toEqual(project);
  });

  it.each([
    ["an empty openings list", { width: { openings: [] } }],
    ["a zero opening", { width: { openings: [335, 0] } }],
    ["51 cells", { width: { outside: 5000, cells: 51 } }],
    ["0 cells", { width: { outside: 700, cells: 0 } }],
    ["a quantity of 101", { quantity: 101 }],
    ["a quantity of 0", { quantity: 0 }],
    ["an axis with neither form", { height: { size: 700 } }],
    ["a zero depth", { depth: 0 }],
  ])("refuses %s", (_name, patch) => {
    const project = designProject([{ ...kallaxDesign(), ...patch } as Design]);
    expect(parseProject(JSON.parse(serializeProject(project))).ok).toBe(false);
  });
});
```

In `packages/core/test/format/parse.test.ts`, inside the `describe` that holds `"applies defaults to a minimal file"`, add:

```ts
  it("loads a 1.0 file as version 1.1 with no warnings", () => {
    const doc = { ...JSON.parse(serializeProject(sampleProject())), version: "1.0" };
    const result = parseProject(doc);
    expect(result.ok && result.project.version).toBe("1.1");
    expect(result.warnings).toEqual([]);
  });
```

In `packages/core/test/format/version.test.ts`, in `"leaves a current document unchanged"`, change `{ version: "1.0", a: 1 }` to `{ version: "1.1", a: 1 }`.

- [ ] **Step 3: Run the tests to see them fail**

Run: `npm test -w @opencutplan/core -- format/`
Expected: FAIL. `createProject` gives `"1.0"`, the 1.0 file stays at `"1.0"`, and every refusal case loads, because the loose project schema keeps `designs` as an unknown field. The round-trip test can pass already for the same reason; it pins the typed schema from Step 4.

- [ ] **Step 4: Change the schema**

In `packages/core/src/format/schema.ts`:

Change `export const FORMAT_VERSION = "1.0";` to `export const FORMAT_VERSION = "1.1";`. Under `MAX_PART_QUANTITY`, add:

```ts
export const MAX_DESIGN_CELLS = 50;
export const MAX_DESIGN_QUANTITY = 100;
```

In `PartSchema`, after `notes: z.string().optional(),`, add `design: id.optional(),`.

After `PartSchema`, add:

```ts
const cells = z.number().int().min(1).max(MAX_DESIGN_CELLS);

export const DesignAxisSchema = z.union([
  z.object({ openings: z.array(positive).min(1).max(MAX_DESIGN_CELLS) }).loose(),
  z.object({ outside: positive, cells }).loose(),
]);

export const DesignSchema = z
  .object({
    id,
    name: z.string().min(1),
    system: z.string().min(1),
    material: id,
    quantity: z.number().int().min(1).max(MAX_DESIGN_QUANTITY).optional(),
    width: DesignAxisSchema,
    height: DesignAxisSchema,
    depth: positive,
    back: z.object({ material: id }).loose().optional(),
    mount: z.string().min(1).optional(),
  })
  .loose();
```

In `ProjectSchema`, after `parts: z.array(PartSchema),`, add `designs: z.array(DesignSchema).optional(),`.

After `export type Part = …`, add:

```ts
export type DesignAxis = StripIndex<z.output<typeof DesignAxisSchema>>;
export type Design = StripIndex<z.output<typeof DesignSchema>>;
```

In `packages/core/src/format/version.ts`, change `export const SUPPORTED_MINOR = 0;` to `export const SUPPORTED_MINOR = 1;`.

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm test -w @opencutplan/core -- format/`
Expected: PASS, except `jsonSchema.test.ts` ("matches the checked-in schema"), which fails until Step 6.

- [ ] **Step 6: Update the builders, the examples, the schema, and the CLI tests**

In `examples/builders/living-room-shelf.ts` and `examples/builders/simple-bookcase-mm.ts`, change `version: "1.0",` to `version: FORMAT_VERSION,`, and change the import line to `import { FORMAT_VERSION, type ProjectInput } from "../../packages/core/src/index.ts";`.

In `packages/cli/test/project.test.ts`, change `version: "1.0"` (line 63) to `version: "1.1"`, and change `.replace('"version": "1.0"', '"version": "1.4"')` (line 94) to `.replace('"version": "1.1"', '"version": "1.4"')`.

Run: `npm run examples && npm run schema`
Expected: `wrote living-room-shelf`, `wrote simple-bookcase-mm`, and `wrote …/schema/cutplan.schema.json`. `git diff --stat examples` shows only the `"version"` line of each `.cutplan.json` file.

- [ ] **Step 7: Run all checks**

Run: `npm run check`
Expected: lint, typecheck, and all core, CLI, and web tests PASS; the web build succeeds.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/format packages/core/test packages/cli/test/project.test.ts examples schema
git commit -m "Add designs to the file format as version 1.1" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Design references

**Files:**
- Modify: `packages/core/src/format/issues.ts`
- Modify: `packages/core/src/format/references.ts`
- Test: `packages/core/test/format/references.test.ts`

**Interfaces:**
- Consumes: `Project.designs`, `Part.design` (Task 1).
- Produces: `IssueCode` gains `"design-missing"`. `checkReferences` reports duplicate design ids (error `duplicate-id`, path `["designs", i, "id"]`) and parts that name a missing design (warning `design-missing`, path `["parts", i, "design"]`).

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/test/format/references.test.ts` (add `parseProject`, `serializeProject` to its core import if missing, and `designProject`, `kallaxDesign` from `"../helpers.ts"`):

```ts
describe("design references", () => {
  it("refuses two designs with the same id", () => {
    const project = designProject([kallaxDesign(), kallaxDesign({ name: "Second" })]);
    const result = parseProject(serializeProject(project));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors).toEqual([expect.objectContaining({ code: "duplicate-id", path: ["designs", 1, "id"] })]);
  });

  it("loads a part that names a missing design, with a warning", () => {
    const project = designProject([]);
    project.parts = [{ id: "old", name: "Old shelf", material: "ply18", length: 300, width: 200, quantity: 1, grain: "length", design: "gone" }];
    const result = parseProject(serializeProject(project));
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([expect.objectContaining({ severity: "warning", code: "design-missing", path: ["parts", 0, "design"] })]);
  });

  it("accepts a part that names an existing design", () => {
    const project = designProject([kallaxDesign()]);
    project.parts = [{ id: "kx-vertical", name: "Vertical panel", material: "ply18", length: 1430, width: 390, quantity: 3, grain: "length", design: "kx" }];
    expect(parseProject(serializeProject(project)).warnings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -w @opencutplan/core -- format/references`
Expected: FAIL. The duplicate loads, and there is no `design-missing` warning.

- [ ] **Step 3: Implement**

In `packages/core/src/format/issues.ts`, add `| "design-missing"` to `IssueCode` after `| "duplicate-placement"`.

In `packages/core/src/format/references.ts`, in `checkReferences`, after `const tools = collectIds(project.tools, ["tools"], issues);`, add:

```ts
  const designs = collectIds(project.designs ?? [], ["designs"], issues);
```

After the `project.parts.forEach` loop that checks materials, add:

```ts
  project.parts.forEach((part, index) => {
    if (part.design !== undefined && !designs.has(part.design)) {
      issues.push(
        warningIssue("design-missing", `Part "${part.name}" names design "${part.design}", which does not exist. The part works as a normal part.`, [
          "parts",
          index,
          "design",
        ]),
      );
    }
  });
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -w @opencutplan/core -- format/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/format packages/core/test/format/references.test.ts
git commit -m "Check design ids and the designs that parts name" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Systems, presets, and geometry

**Files:**
- Create: `packages/core/src/design/systems.ts`
- Create: `packages/core/src/design/geometry.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/design/geometry.test.ts`

**Interfaces:**
- Consumes: `Design`, `DesignAxis`, `Material`, `Project` (Task 1); `convertLength`, `Units` (`geometry/units.ts`).
- Produces:
  - `systems.ts`: `DESIGN_SYSTEMS`, `type DesignSystem`, `DESIGN_MOUNTS`, `type DesignMount`, `isDesignSystem(value: string): value is DesignSystem`, `isDesignMount(value: string): value is DesignMount`, `interface SystemValue { mm: number; derived: boolean; source: string }`, `KALLAX` (`opening`, `depth`, `insert`, `boxDepth`), `EKET` (`module`, `depth`, `shallowDepth`), `KALLAX_CLEARANCE_MM = 2`, `EKET_TOLERANCE_MM = 1`, `MIN_POCKET_THICKNESS_MM = 12.7`, `MAX_POCKET_CHART_MM = 38`, `SHELF_SPAN_RATIO = 45`, `DEFAULT_DESIGN_QUANTITY = 1`, `DEFAULT_DESIGN_MOUNT = "floor"`, `interface PresetOptions`, `presetDesign(options: PresetOptions): Design`.
  - `geometry.ts`: `roundLength(value: number): number`, `axisOpenings(axis: DesignAxis, thickness: number): number[]`, `interface DesignGeometry { thickness; backThickness; columns: number[]; rows: number[]; outsideWidth; outsideHeight; depth; panelDepth }`, `materialsById(project: Project): ReadonlyMap<string, Material>`, `designGeometry(design: Design, materials: ReadonlyMap<string, Material>): DesignGeometry | null`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/design/geometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { axisOpenings, designGeometry, isDesignMount, isDesignSystem, materialsById, presetDesign } from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";

describe("presetDesign", () => {
  it("makes a KALLAX 2×4 with 335 mm cells and a 390 mm depth", () => {
    expect(presetDesign({ system: "kallax", id: "kx", name: "Hall KALLAX", material: "ply18", cols: 2, rows: 4, units: "mm" })).toEqual(kallaxDesign());
  });

  it("makes an EKET 1×2 from 350 mm modules", () => {
    expect(presetDesign({ system: "eket", id: "ek", name: "Tall EKET", material: "ply18", cols: 1, rows: 2, units: "mm" })).toEqual({
      id: "ek",
      name: "Tall EKET",
      system: "eket",
      material: "ply18",
      width: { outside: 350, cells: 1 },
      height: { outside: 700, cells: 2 },
      depth: 350,
    });
  });

  it("converts the preset numbers to inches", () => {
    const kallax = presetDesign({ system: "kallax", id: "kx", name: "K", material: "ply", cols: 1, rows: 1, units: "in" });
    expect(kallax.width).toEqual({ openings: [13.188976378] });
    expect(kallax.depth).toBe(15.354330709);
    const eket = presetDesign({ system: "eket", id: "ek", name: "E", material: "ply", cols: 2, rows: 1, units: "in" });
    expect(eket.width).toEqual({ outside: 27.559055118, cells: 2 });
    expect(eket.depth).toBe(13.779527559);
  });
});

describe("known values", () => {
  it("knows the systems and mounts of the spec", () => {
    expect(["kallax", "eket", "custom"].every(isDesignSystem)).toBe(true);
    expect(isDesignSystem("pax")).toBe(false);
    expect(["floor", "legs", "feet", "wall-rail"].every(isDesignMount)).toBe(true);
    expect(isDesignMount("ceiling")).toBe(false);
  });
});

describe("designGeometry", () => {
  it("adds the openings and the panels for a KALLAX 2×4", () => {
    const project = designProject();
    expect(designGeometry(kallaxDesign(), materialsById(project))).toEqual({
      thickness: 18,
      backThickness: 0,
      columns: [335, 335],
      rows: [335, 335, 335, 335],
      outsideWidth: 724,
      outsideHeight: 1430,
      depth: 390,
      panelDepth: 390,
    });
  });

  it("divides an outside size equally, and takes the back off the panel depth", () => {
    const project = designProject();
    expect(designGeometry(eketDesign(), materialsById(project))).toEqual({
      thickness: 18,
      backThickness: 6,
      columns: [323, 323],
      rows: [314],
      outsideWidth: 700,
      outsideHeight: 350,
      depth: 350,
      panelDepth: 344,
    });
  });

  it("divides an outside size equally with a fractional thickness", () => {
    const outside = 27.559055118;
    const openings = axisOpenings({ outside, cells: 2 }, 0.71875);
    expect(openings[0]).toBe(openings[1]);
    expect(openings[0]! * 2 + 3 * 0.71875).toBeCloseTo(outside, 8);
  });

  it("returns null when the material or the back material does not exist", () => {
    const materials = materialsById(designProject());
    expect(designGeometry(kallaxDesign({ material: "gone" }), materials)).toBeNull();
    expect(designGeometry(eketDesign({ back: { material: "gone" } }), materials)).toBeNull();
  });

  it("gives an opening of 0 or less when the outside size is too small", () => {
    expect(axisOpenings({ outside: 30, cells: 1 }, 18)).toEqual([-6]);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -w @opencutplan/core -- design/geometry`
Expected: FAIL with "presetDesign is not a function" (or a missing-export error).

- [ ] **Step 3: Create `packages/core/src/design/geometry.ts`**

```ts
import type { Design, DesignAxis, Material, Project } from "../format/schema.ts";

export interface DesignGeometry {
  thickness: number;
  /** 0 when the design has no back. */
  backThickness: number;
  /** Cell openings, left to right. */
  columns: number[];
  /** Cell openings, top to bottom. */
  rows: number[];
  outsideWidth: number;
  outsideHeight: number;
  depth: number;
  panelDepth: number;
}

export function roundLength(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}

export function axisOpenings(axis: DesignAxis, thickness: number): number[] {
  if ("openings" in axis) return [...axis.openings];
  const opening = roundLength((axis.outside - (axis.cells + 1) * thickness) / axis.cells);
  return Array.from({ length: axis.cells }, () => opening);
}

function outsideSize(axis: DesignAxis, openings: readonly number[], thickness: number): number {
  if ("outside" in axis) return axis.outside;
  return roundLength(openings.reduce((sum, opening) => sum + opening, 0) + (openings.length + 1) * thickness);
}

export function materialsById(project: Project): ReadonlyMap<string, Material> {
  const map = new Map<string, Material>();
  for (const material of project.materials) if (!map.has(material.id)) map.set(material.id, material);
  return map;
}

/** Null when the material or the back material does not exist. */
export function designGeometry(design: Design, materials: ReadonlyMap<string, Material>): DesignGeometry | null {
  const material = materials.get(design.material);
  if (!material) return null;
  let backThickness = 0;
  if (design.back) {
    const back = materials.get(design.back.material);
    if (!back) return null;
    backThickness = back.thickness;
  }
  const thickness = material.thickness;
  const columns = axisOpenings(design.width, thickness);
  const rows = axisOpenings(design.height, thickness);
  return {
    thickness,
    backThickness,
    columns,
    rows,
    outsideWidth: outsideSize(design.width, columns, thickness),
    outsideHeight: outsideSize(design.height, rows, thickness),
    depth: design.depth,
    panelDepth: roundLength(design.depth - backThickness),
  };
}
```

- [ ] **Step 4: Create `packages/core/src/design/systems.ts`**

```ts
import type { Design } from "../format/schema.ts";
import { convertLength, type Units } from "../geometry/units.ts";
import { roundLength } from "./geometry.ts";

export const DESIGN_SYSTEMS = ["kallax", "eket", "custom"] as const;
export type DesignSystem = (typeof DESIGN_SYSTEMS)[number];
export const DESIGN_MOUNTS = ["floor", "legs", "feet", "wall-rail"] as const;
export type DesignMount = (typeof DESIGN_MOUNTS)[number];

export function isDesignSystem(value: string): value is DesignSystem {
  return (DESIGN_SYSTEMS as readonly string[]).includes(value);
}

export function isDesignMount(value: string): value is DesignMount {
  return (DESIGN_MOUNTS as readonly string[]).includes(value);
}

export interface SystemValue {
  mm: number;
  /** True when the number comes from arithmetic on IKEA's listed sizes. A caliper measurement can replace it. */
  derived: boolean;
  source: string;
}

export const KALLAX = {
  opening: {
    mm: 335,
    derived: true,
    source: "Derived from the KALLAX outside sizes on ikea.com/gb: a 350 mm step per column and a 415 mm 1x1 (spec appendix A.1)",
  },
  depth: { mm: 390, derived: false, source: "https://www.ikea.com/gb/en/p/kallax-shelving-unit-white-20275814/" },
  insert: { mm: 330, derived: false, source: "https://www.ikea.com/gb/en/p/kallax-insert-with-door-white-80653317/" },
  boxDepth: { mm: 380, derived: false, source: "https://www.ikea.com/gb/en/p/droena-box-black-off-white-10625714/" },
} as const satisfies Record<string, SystemValue>;

export const EKET = {
  module: { mm: 350, derived: false, source: "https://www.ikea.com/gb/en/p/eket-cabinet-white-80334603/" },
  depth: { mm: 350, derived: false, source: "https://www.ikea.com/gb/en/p/eket-cabinet-white-80334603/" },
  shallowDepth: { mm: 250, derived: false, source: "IKEA GB listing: EKET cabinet 35x25x35, article 70332124" },
} as const satisfies Record<string, SystemValue>;

export const KALLAX_CLEARANCE_MM = 2;
export const EKET_TOLERANCE_MM = 1;
export const MIN_POCKET_THICKNESS_MM = 12.7;
export const MAX_POCKET_CHART_MM = 38;
/** A rule of thumb for plywood shelves under books, not a load calculation. */
export const SHELF_SPAN_RATIO = 45;
export const DEFAULT_DESIGN_QUANTITY = 1;
export const DEFAULT_DESIGN_MOUNT: DesignMount = "floor";

export interface PresetOptions {
  system: "kallax" | "eket";
  id: string;
  name: string;
  material: string;
  cols: number;
  rows: number;
  units: Units;
}

export function presetDesign({ system, id, name, material, cols, rows, units }: PresetOptions): Design {
  const mm = (value: number) => roundLength(convertLength(value, "mm", units));
  if (system === "kallax") {
    const opening = mm(KALLAX.opening.mm);
    return {
      id,
      name,
      system,
      material,
      width: { openings: Array.from({ length: cols }, () => opening) },
      height: { openings: Array.from({ length: rows }, () => opening) },
      depth: mm(KALLAX.depth.mm),
    };
  }
  return {
    id,
    name,
    system,
    material,
    width: { outside: mm(EKET.module.mm * cols), cells: cols },
    height: { outside: mm(EKET.module.mm * rows), cells: rows },
    depth: mm(EKET.depth.mm),
  };
}
```

- [ ] **Step 5: Export the modules**

In `packages/core/src/index.ts`, after `export * from "./edit/layout.ts";`, add:

```ts
export * from "./design/systems.ts";
export * from "./design/geometry.ts";
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npm test -w @opencutplan/core -- design/geometry && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/design packages/core/src/index.ts packages/core/test/design
git commit -m "Add the KALLAX and EKET presets and the design geometry" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Build the parts of a design

**Files:**
- Create: `packages/core/src/design/parts.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/design/parts.test.ts`

**Interfaces:**
- Consumes: `designGeometry`, `materialsById`, `DesignGeometry` (Task 3); `DEFAULT_DESIGN_QUANTITY` (Task 3).
- Produces: `buildDesignParts(design: Design, geometry: DesignGeometry): Part[]`. The order is the vertical panel, the horizontal parts in the order of the first column that uses each opening, then the back. The field order of each part is `id, name, material, length, width, quantity, grain, group, design`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/design/parts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildDesignParts, designGeometry, materialsById, type Design, type Part } from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";

function build(design: Design): Part[] {
  return buildDesignParts(design, designGeometry(design, materialsById(designProject()))!);
}

const summary = (parts: Part[]) => parts.map((part) => [part.id, part.name, part.material, part.length, part.width, part.quantity]);

describe("buildDesignParts", () => {
  it("makes 3 vertical panels and 10 shelves for a KALLAX 2×4", () => {
    const parts = build(kallaxDesign());
    expect(summary(parts)).toEqual([
      ["kx-vertical", "Vertical panel", "ply18", 1430, 390, 3],
      ["kx-horizontal", "Shelf", "ply18", 335, 390, 10],
    ]);
    expect(parts[0]).toEqual({
      id: "kx-vertical",
      name: "Vertical panel",
      material: "ply18",
      length: 1430,
      width: 390,
      quantity: 3,
      grain: "length",
      group: "Hall KALLAX",
      design: "kx",
    });
  });

  it("multiplies by the quantity and adds the back for an EKET 2×1", () => {
    expect(summary(build(eketDesign()))).toEqual([
      ["ek-vertical", "Vertical panel", "ply18", 350, 344, 6],
      ["ek-horizontal", "Shelf", "ply18", 323, 344, 8],
      ["ek-back", "Back", "ply6", 350, 700, 2],
    ]);
  });

  it("makes one shelf part for each opening size, in column order", () => {
    const design: Design = {
      id: "cu",
      name: "Desk hutch",
      system: "custom",
      material: "ply18",
      width: { openings: [335, 400, 335] },
      height: { outside: 718, cells: 2 },
      depth: 390,
    };
    expect(summary(build(design))).toEqual([
      ["cu-vertical", "Vertical panel", "ply18", 718, 390, 4],
      ["cu-horizontal-1", "Shelf 1", "ply18", 335, 390, 6],
      ["cu-horizontal-2", "Shelf 2", "ply18", 400, 390, 3],
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -w @opencutplan/core -- design/parts`
Expected: FAIL with "buildDesignParts is not a function".

- [ ] **Step 3: Create `packages/core/src/design/parts.ts`**

```ts
import type { Design, Part } from "../format/schema.ts";
import type { DesignGeometry } from "./geometry.ts";
import { DEFAULT_DESIGN_QUANTITY } from "./systems.ts";

export function buildDesignParts(design: Design, geometry: DesignGeometry): Part[] {
  const quantity = design.quantity ?? DEFAULT_DESIGN_QUANTITY;
  const part = (id: string, name: string, material: string, length: number, width: number, count: number): Part => ({
    id: `${design.id}-${id}`,
    name,
    material,
    length,
    width,
    quantity: count * quantity,
    grain: "length",
    group: design.name,
    design: design.id,
  });

  const columns = geometry.columns.length;
  const lines = geometry.rows.length + 1;
  const parts = [part("vertical", "Vertical panel", design.material, geometry.outsideHeight, geometry.panelDepth, columns + 1)];

  const sizes = new Map<number, number>();
  for (const opening of geometry.columns) sizes.set(opening, (sizes.get(opening) ?? 0) + 1);
  let k = 0;
  for (const [opening, count] of sizes) {
    k++;
    const single = sizes.size === 1;
    parts.push(part(single ? "horizontal" : `horizontal-${k}`, single ? "Shelf" : `Shelf ${k}`, design.material, opening, geometry.panelDepth, lines * count));
  }

  if (design.back) parts.push(part("back", "Back", design.back.material, geometry.outsideHeight, geometry.outsideWidth, 1));
  return parts;
}
```

In `packages/core/src/index.ts`, after `export * from "./design/geometry.ts";`, add `export * from "./design/parts.ts";`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -w @opencutplan/core -- design/ && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/design/parts.ts packages/core/src/index.ts packages/core/test/design/parts.test.ts
git commit -m "Build the vertical panels, shelves, and back of a design" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The errors that stop a design

**Files:**
- Modify: `packages/core/src/plan/issues.ts`
- Create: `packages/core/src/design/errors.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/design/errors.test.ts`

**Interfaces:**
- Consumes: `designGeometry`, `materialsById` (Task 3); `buildDesignParts` (Task 4); `MIN_POCKET_THICKNESS_MM` (Task 3); `MAX_PART_QUANTITY` (`format/schema.ts`); `EPSILON` (`geometry/rect.ts`); `planError` (`plan/issues.ts`).
- Produces:
  - `PlanIssueCode` gains `"design-too-small" | "design-too-large" | "design-conflict" | "pocket-thickness" | "pocket-chart" | "kallax-opening" | "kallax-depth" | "eket-grid" | "shelf-span" | "mount-system" | "design-stale" | "design-unknown-system" | "design-unknown-mount"`.
  - `PlanRef` gains `{ kind: "design"; design: string }`.
  - `designRef(design: Design): PlanRef[]` and `designErrors(project: Project, design: Design): PlanIssue[]` (errors only: `bad-ref`, `pocket-thickness`, `design-too-small`, `design-too-large`, `design-conflict`).

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/design/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { designErrors, type Design, type Project } from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";

const codes = (project: Project, design: Design) => designErrors(project, design).map((issue) => issue.code);

describe("designErrors", () => {
  it("finds nothing wrong with the KALLAX and EKET samples", () => {
    const project = designProject([kallaxDesign(), eketDesign()]);
    expect(codes(project, kallaxDesign())).toEqual([]);
    expect(codes(project, eketDesign())).toEqual([]);
  });

  it("reports a missing material or back material", () => {
    const project = designProject();
    const issues = designErrors(project, eketDesign({ material: "gone", back: { material: "lost" } }));
    expect(issues.map((issue) => [issue.severity, issue.code])).toEqual([
      ["error", "bad-ref"],
      ["error", "bad-ref"],
    ]);
    expect(issues[0]!.refs).toEqual([{ kind: "design", design: "ek" }]);
    expect(issues[1]!.message).toBe('Design "Wall EKET" uses material "lost", which does not exist.');
  });

  it("reports stock that is too thin for pocket screws, in either unit system", () => {
    const project = designProject();
    project.materials = [{ id: "ply18", name: "Thin ply", thickness: 12, grained: true }];
    expect(codes(project, kallaxDesign())).toEqual(["pocket-thickness"]);
    project.materials = [{ id: "ply18", name: "Half inch", thickness: 12.7, grained: true }];
    expect(codes(project, kallaxDesign())).toEqual([]);
  });

  it("reports an outside size that leaves no room for the cells", () => {
    expect(codes(designProject(), eketDesign({ width: { outside: 30, cells: 1 } }))).toEqual(["design-too-small"]);
    expect(codes(designProject(), eketDesign({ depth: 6 }))).toEqual(["design-too-small"]);
  });

  it("reports a design that needs more than 10000 copies of one part", () => {
    const hundreds = { openings: Array.from({ length: 50 }, () => 100) };
    expect(codes(designProject(), kallaxDesign({ width: hundreds, height: hundreds, quantity: 4 }))).toEqual(["design-too-large"]);
  });

  it("reports a part that already uses a generated id", () => {
    const project = designProject();
    project.parts = [{ id: "kx-vertical", name: "Side", material: "ply18", length: 900, width: 300, quantity: 2, grain: "length" }];
    const issues = designErrors(project, kallaxDesign());
    expect(issues.map((issue) => issue.code)).toEqual(["design-conflict"]);
    expect(issues[0]!.refs).toEqual([
      { kind: "design", design: "kx" },
      { kind: "part", part: "kx-vertical", copy: 0 },
    ]);
  });

  it("does not report the design's own stored parts as a conflict", () => {
    const project = designProject();
    project.parts = [{ id: "kx-vertical", name: "Vertical panel", material: "ply18", length: 1430, width: 390, quantity: 3, grain: "length", design: "kx" }];
    expect(codes(project, kallaxDesign())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -w @opencutplan/core -- design/errors`
Expected: FAIL with "designErrors is not a function".

- [ ] **Step 3: Add the issue codes and the ref kind**

In `packages/core/src/plan/issues.ts`, replace the end of `PlanIssueCode` (`| "duplicate-placement";`) with:

```ts
  | "duplicate-placement"
  | "design-too-small"
  | "design-too-large"
  | "design-conflict"
  | "pocket-thickness"
  | "pocket-chart"
  | "kallax-opening"
  | "kallax-depth"
  | "eket-grid"
  | "shelf-span"
  | "mount-system"
  | "design-stale"
  | "design-unknown-system"
  | "design-unknown-mount";
```

In `PlanRef`, after `| { kind: "cut"; sheet: string; step: number }`, add `| { kind: "design"; design: string }` (the `;` moves to the new last line).

- [ ] **Step 4: Create `packages/core/src/design/errors.ts`**

```ts
import { MAX_PART_QUANTITY, type Design, type Project } from "../format/schema.ts";
import { EPSILON } from "../geometry/rect.ts";
import { convertLength } from "../geometry/units.ts";
import { planError, type PlanIssue, type PlanRef } from "../plan/issues.ts";
import { designGeometry, materialsById } from "./geometry.ts";
import { buildDesignParts } from "./parts.ts";
import { MIN_POCKET_THICKNESS_MM } from "./systems.ts";

export function designRef(design: Design): PlanRef[] {
  return [{ kind: "design", design: design.id }];
}

/** The problems that stop a design from making parts. */
export function designErrors(project: Project, design: Design): PlanIssue[] {
  const ref = designRef(design);
  const materials = materialsById(project);
  const issues: PlanIssue[] = [];
  for (const material of [design.material, design.back?.material]) {
    if (material !== undefined && !materials.has(material)) {
      issues.push(planError("bad-ref", `Design "${design.name}" uses material "${material}", which does not exist.`, ref));
    }
  }
  const geometry = designGeometry(design, materials);
  if (!geometry) return issues;

  if (geometry.thickness < convertLength(MIN_POCKET_THICKNESS_MM, "mm", project.project.units) - EPSILON) {
    issues.push(
      planError("pocket-thickness", `Design "${design.name}" uses stock that is too thin for pocket screws. Use stock that is 1/2" (12.7 mm) thick or more.`, ref),
    );
  }
  if ([...geometry.columns, ...geometry.rows].some((opening) => opening <= EPSILON) || geometry.panelDepth <= EPSILON) {
    issues.push(planError("design-too-small", `Design "${design.name}" is too small: the panels leave no room for the cells.`, ref));
    return issues;
  }

  const parts = buildDesignParts(design, geometry);
  if (parts.some((part) => part.quantity > MAX_PART_QUANTITY)) {
    issues.push(
      planError("design-too-large", `Design "${design.name}" needs more than ${MAX_PART_QUANTITY} copies of one part. Use fewer cells or a lower quantity.`, ref),
    );
  }
  const ids = new Set(parts.map((part) => part.id));
  for (const part of project.parts) {
    if (!ids.has(part.id) || part.design === design.id) continue;
    issues.push(
      planError("design-conflict", `Part "${part.name}" already uses the id "${part.id}". Change the id of design "${design.name}".`, [
        ...ref,
        { kind: "part", part: part.id, copy: 0 },
      ]),
    );
  }
  return issues;
}
```

In `packages/core/src/index.ts`, after `export * from "./design/parts.ts";`, add `export * from "./design/errors.ts";`.

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm test -w @opencutplan/core -- design/ && npm run typecheck`
Expected: PASS. The typecheck also covers `apps/web`, which reads `PlanRef` without an exhaustive switch.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/plan/issues.ts packages/core/src/design/errors.ts packages/core/src/index.ts packages/core/test/design/errors.test.ts
git commit -m "Report the design problems that stop it from making parts" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Generate and regenerate the parts

**Files:**
- Create: `packages/core/src/design/generate.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/design/generate.test.ts`

**Interfaces:**
- Consumes: `designErrors` (Task 5); `buildDesignParts` (Task 4); `designGeometry`, `materialsById` (Task 3); `isDesignSystem` (Task 3); `withoutPlacements` (`edit/parts.ts`); `EPSILON`.
- Produces:
  - `generatedParts(project: Project, designId: string): Part[]`: the stored parts whose `design` is `designId`, in file order.
  - `designParts(project: Project, design: Design): Part[] | null`: the parts the design makes now, or null for an unknown system or an error. A part within `EPSILON` of its stored size keeps the stored length and width.
  - `sameParts(a: readonly Part[], b: readonly Part[]): boolean`: equal in order, field by field, with the key order ignored.
  - `regenerateDesigns(project: Project): Project`: returns the same object when every design is current.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/design/generate.test.ts`:

```ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  applyOptimizeResult,
  designGeometry,
  materialsById,
  optimize,
  regenerateDesigns,
  validatePlan,
  type Design,
  type Part,
  type Project,
} from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";

const ids = (project: Project) => project.parts.map((part) => part.id);

function placed(project: Project, placements: { part: string; copy: number }[]): Project {
  return { ...project, plan: { sheets: [{ id: "s1", stock: "ply18-sheet", placements: placements.map((p) => ({ ...p, x: 0, y: 0, rotated: false })) }] } };
}

const onSheet = (project: Project) => project.plan!.sheets[0]!.placements.map((p) => `${p.part}#${p.copy}`);

function withDesign(project: Project, patch: Partial<Design>): Project {
  return { ...project, designs: project.designs!.map((design) => ({ ...design, ...patch })) };
}

describe("regenerateDesigns", () => {
  it("adds the parts of a design that has none", () => {
    expect(ids(regenerateDesigns(designProject([kallaxDesign(), eketDesign()])))).toEqual(["kx-vertical", "kx-horizontal", "ek-vertical", "ek-horizontal", "ek-back"]);
  });

  it("keeps the other parts, and puts the design's parts where they were", () => {
    const side: Part = { id: "side", name: "Side", material: "ply18", length: 900, width: 300, quantity: 2, grain: "length" };
    const top: Part = { id: "top", name: "Top", material: "ply18", length: 800, width: 300, quantity: 1, grain: "length" };
    const once = regenerateDesigns({ ...designProject(), parts: [side] });
    expect(ids(once)).toEqual(["side", "kx-vertical", "kx-horizontal"]);
    const moved = { ...once, parts: [once.parts[1]!, once.parts[2]!, side, top] };
    expect(ids(regenerateDesigns(withDesign(moved, { width: { openings: [335, 335, 335] } })))).toEqual(["kx-vertical", "kx-horizontal", "side", "top"]);
  });

  it("returns the same object when the parts are current", () => {
    const once = regenerateDesigns(designProject([kallaxDesign(), eketDesign()]));
    expect(regenerateDesigns(once)).toBe(once);
    const plain = designProject([]);
    expect(regenerateDesigns(plain)).toBe(plain);
  });

  it("keeps a copy on its sheet when its part keeps the same id and size", () => {
    const once = placed(regenerateDesigns(designProject()), [
      { part: "kx-vertical", copy: 2 },
      { part: "kx-horizontal", copy: 9 },
    ]);
    const wider = regenerateDesigns(withDesign(once, { width: { openings: [335, 335, 335] } }));
    expect(wider.parts.map((p) => [p.id, p.quantity])).toEqual([
      ["kx-vertical", 4],
      ["kx-horizontal", 15],
    ]);
    expect(onSheet(wider)).toEqual(["kx-vertical#2", "kx-horizontal#9"]);
  });

  it("drops the copies of a part whose size changes, and the copies above the new quantity", () => {
    const once = placed(regenerateDesigns(designProject()), [
      { part: "kx-vertical", copy: 0 },
      { part: "kx-horizontal", copy: 1 },
      { part: "kx-horizontal", copy: 9 },
    ]);
    const shorter = regenerateDesigns(withDesign(once, { height: { openings: [335, 335, 335] } }));
    expect(shorter.parts[0]!.length).toBe(1077);
    expect(onSheet(shorter)).toEqual(["kx-horizontal#1"]);

    const edited = { ...once, parts: once.parts.map((p) => (p.id === "kx-vertical" ? { ...p, length: 1400 } : p)) };
    const restored = regenerateDesigns(edited);
    expect(restored.parts[0]!.length).toBe(1430);
    expect(onSheet(restored)).toEqual(["kx-horizontal#1", "kx-horizontal#9"]);
  });

  it("drops the copies of a part that the design no longer makes", () => {
    const once = placed(regenerateDesigns(designProject([eketDesign()])), [
      { part: "ek-back", copy: 0 },
      { part: "ek-vertical", copy: 0 },
    ]);
    const open = regenerateDesigns({ ...once, designs: [{ ...eketDesign(), back: undefined }] });
    expect(ids(open)).toEqual(["ek-vertical", "ek-horizontal"]);
    expect(onSheet(open)).toEqual([]);
  });

  it("leaves the stored parts alone when the design has an error or an unknown system", () => {
    const once = regenerateDesigns(designProject());
    const missing = withDesign(once, { material: "gone", width: { openings: [500] } });
    expect(regenerateDesigns(missing)).toBe(missing);
    const unknown = withDesign(once, { system: "pax", width: { openings: [500] } });
    expect(regenerateDesigns(unknown)).toBe(unknown);
    const manual: Part = { id: "kx-vertical", name: "Side", material: "ply18", length: 900, width: 300, quantity: 2, grain: "length" };
    const conflict = designProject();
    conflict.parts = [manual];
    expect(regenerateDesigns(conflict).parts).toEqual([manual]);
  });

  it("replaces a stored generated part that has an extra field", () => {
    const once = regenerateDesigns(designProject());
    const noted = { ...once, parts: once.parts.map((p, i) => (i === 0 ? { ...p, notes: "Sand the edges" } : p)) };
    expect(regenerateDesigns(noted).parts[0]).toEqual(once.parts[0]);
  });
});

const axis = fc.oneof(
  fc.array(fc.integer({ min: 100, max: 800 }), { minLength: 1, maxLength: 4 }).map((openings) => ({ openings })),
  fc.integer({ min: 1, max: 4 }).chain((cells) => fc.integer({ min: cells * 100 + (cells + 1) * 25, max: 2000 }).map((outside) => ({ outside, cells }))),
);

const randomDesign = fc.record({
  system: fc.constantFrom("kallax", "eket", "custom"),
  width: axis,
  height: axis,
  depth: fc.integer({ min: 200, max: 600 }),
  back: fc.boolean(),
  quantity: fc.integer({ min: 1, max: 3 }),
  thickness: fc.constantFrom(12.7, 15, 18, 19.05, 25),
});

type RandomInput = typeof randomDesign extends fc.Arbitrary<infer T> ? T : never;

function randomProject(input: RandomInput): Project {
  const { thickness, back, ...rest } = input;
  const design: Design = { id: "d", name: "Random", material: "ply18", ...rest, ...(back ? { back: { material: "ply6" } } : {}) };
  const project = designProject([design]);
  project.materials = project.materials.map((m) => (m.id === "ply18" ? { ...m, thickness } : m));
  return project;
}

describe("regenerateDesigns on random grids", () => {
  it("gives the same result when it runs twice, and the panels add up to the outside size", () => {
    fc.assert(
      fc.property(randomDesign, (input) => {
        const once = regenerateDesigns(randomProject(input));
        expect(regenerateDesigns(once)).toBe(once);
        const geometry = designGeometry(once.designs![0]!, materialsById(once))!;
        const vertical = once.parts.find((p) => p.id === "d-vertical")!;
        expect(vertical.length).toBeCloseTo(geometry.rows.reduce((a, b) => a + b, 0) + (geometry.rows.length + 1) * geometry.thickness, 6);
        expect(geometry.columns.reduce((a, b) => a + b, 0) + (geometry.columns.length + 1) * geometry.thickness).toBeCloseTo(geometry.outsideWidth, 6);
      }),
    );
  });

  it("gives a plan with no errors after optimize", () => {
    fc.assert(
      fc.property(randomDesign, (input) => {
        const project = regenerateDesigns(randomProject(input));
        const planned = applyOptimizeResult(project, optimize(project, { iterations: 3 }));
        expect(validatePlan(planned).filter((issue) => issue.severity === "error")).toEqual([]);
      }),
      { numRuns: 15 },
    );
  });
});
```

`validatePlan` has no design checks until Task 7, so here the optimize property checks the plan only. Task 7 adds a property that a regenerated random design is never stale.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -w @opencutplan/core -- design/generate`
Expected: FAIL with "regenerateDesigns is not a function".

- [ ] **Step 3: Create `packages/core/src/design/generate.ts`**

```ts
import { withoutPlacements } from "../edit/parts.ts";
import type { Design, Part, Project } from "../format/schema.ts";
import { EPSILON } from "../geometry/rect.ts";
import { designErrors } from "./errors.ts";
import { designGeometry, materialsById } from "./geometry.ts";
import { buildDesignParts } from "./parts.ts";
import { isDesignSystem } from "./systems.ts";

export function generatedParts(project: Project, designId: string): Part[] {
  return project.parts.filter((part) => part.design === designId);
}

/**
 * The parts a design makes, or null for an unknown system or a design with an error. A part within EPSILON of its stored
 * size keeps the stored numbers, so the rounding after a unit change does not count as a change.
 */
export function designParts(project: Project, design: Design): Part[] | null {
  if (!isDesignSystem(design.system) || designErrors(project, design).length > 0) return null;
  const geometry = designGeometry(design, materialsById(project));
  if (!geometry) return null;
  const stored = new Map(generatedParts(project, design.id).map((part) => [part.id, part]));
  return buildDesignParts(design, geometry).map((part) => keepStoredSize(part, stored.get(part.id)));
}

function keepStoredSize(part: Part, stored: Part | undefined): Part {
  if (!stored || Math.abs(part.length - stored.length) > EPSILON || Math.abs(part.width - stored.width) > EPSILON) return part;
  return { ...part, length: stored.length, width: stored.width };
}

export function sameParts(a: readonly Part[], b: readonly Part[]): boolean {
  return a.length === b.length && a.every((part, index) => partKey(part) === partKey(b[index]!));
}

function partKey(part: Part): string {
  return JSON.stringify(Object.entries(part).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

export function regenerateDesigns(project: Project): Project {
  let next = project;
  for (const design of project.designs ?? []) next = regenerateDesign(next, design);
  return next;
}

function regenerateDesign(project: Project, design: Design): Project {
  const parts = designParts(project, design);
  if (!parts) return project;
  const old = generatedParts(project, design.id);
  if (sameParts(old, parts)) return project;

  const first = project.parts.findIndex((part) => part.design === design.id);
  const others = project.parts.filter((part) => part.design !== design.id);
  const at = first === -1 ? others.length : first;
  const before = new Map(old.map((part) => [part.id, part]));
  const after = new Map(parts.map((part) => [part.id, part]));
  return withoutPlacements({ ...project, parts: [...others.slice(0, at), ...parts, ...others.slice(at)] }, (placement) => {
    const was = before.get(placement.part);
    if (!was) return false;
    const now = after.get(placement.part);
    return !now || now.length !== was.length || now.width !== was.width || placement.copy >= now.quantity;
  });
}
```

In `packages/core/src/index.ts`, after `export * from "./design/errors.ts";`, add `export * from "./design/generate.ts";`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -w @opencutplan/core -- design/ && npm run typecheck`
Expected: PASS. The optimize property takes a few seconds.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/design/generate.ts packages/core/src/index.ts packages/core/test/design/generate.test.ts
git commit -m "Make the parts of each design again and keep the copies that still fit" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Design checks in the project analysis

**Files:**
- Create: `packages/core/src/design/checks.ts`
- Modify: `packages/core/src/analysis.ts`, `packages/core/src/plan/validate.ts`, `packages/core/src/index.ts`
- Modify: `packages/core/test/design/generate.test.ts` (one more property)
- Test: `packages/core/test/design/checks.test.ts`

**Interfaces:**
- Consumes: `designErrors`, `designRef` (Task 5); `designParts`, `generatedParts`, `sameParts` (Task 6); `designGeometry`, `materialsById` (Task 3); the constants in `systems.ts` (Task 3); `formatLength` (`geometry/format.ts`); `planWarning`.
- Produces: `checkDesigns(project: Project): PlanIssue[]`. `analyzeProject(project).issues` and `validatePlan(project)` end with `checkDesigns(project)`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/design/checks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { analyzeProject, checkDesigns, regenerateDesigns, validatePlan, type Design, type Project } from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";

const codes = (project: Project) => checkDesigns(project).map((issue) => `${issue.severity}:${issue.code}`);
const current = (...designs: Design[]) => regenerateDesigns(designProject(designs));

describe("checkDesigns", () => {
  it("finds nothing wrong with current KALLAX and EKET designs", () => {
    expect(codes(current(kallaxDesign(), eketDesign()))).toEqual([]);
  });

  it("includes the errors that stop a design, and skips its warnings", () => {
    expect(codes(current(kallaxDesign({ material: "gone", width: { openings: [100] } })))).toEqual(["error:bad-ref"]);
  });

  it("warns about an unknown system and skips the other checks", () => {
    const issues = checkDesigns(designProject([kallaxDesign({ system: "pax", depth: 100 })]));
    expect(issues.map((issue) => issue.code)).toEqual(["design-unknown-system"]);
    expect(issues[0]!.refs).toEqual([{ kind: "design", design: "kx" }]);
  });

  it("warns about an unknown mount", () => {
    expect(codes(current(kallaxDesign({ mount: "ceiling" })))).toEqual(["warning:design-unknown-mount"]);
  });

  it("warns when stock is thicker than the screw chart", () => {
    const project = designProject([eketDesign()]);
    project.materials = project.materials.map((m) => (m.id === "ply18" ? { ...m, thickness: 40 } : m));
    expect(codes(regenerateDesigns(project))).toEqual(["warning:pocket-chart"]);
  });

  it("warns when a KALLAX cell is too small for the inserts, or the panels are too shallow for the boxes", () => {
    expect(codes(current(kallaxDesign({ width: { openings: [331, 335] } })))).toEqual(["warning:kallax-opening"]);
    expect(codes(current(kallaxDesign({ width: { openings: [332, 335] } })))).toEqual([]);
    expect(codes(current(kallaxDesign({ depth: 379 })))).toEqual(["warning:kallax-depth"]);
    const message = checkDesigns(current(kallaxDesign({ height: { openings: [320, 335, 335, 335] } })))[0]!.message;
    expect(message).toBe('Design "Hall KALLAX" has a cell of 320 mm. KALLAX inserts need at least 332 mm.');
  });

  it("warns when an EKET design is off the 350 mm grid or has another depth", () => {
    expect(codes(current(eketDesign({ width: { outside: 600, cells: 2 } })))).toEqual(["warning:eket-grid"]);
    expect(codes(current(eketDesign({ depth: 300 })))).toEqual(["warning:eket-grid"]);
    expect(codes(current(eketDesign({ depth: 250 })))).toEqual([]);
    expect(codes(current(eketDesign({ width: { outside: 700.5, cells: 2 } })))).toEqual([]);
  });

  it("warns about a shelf that can sag", () => {
    expect(codes(current(kallaxDesign({ system: "custom", width: { openings: [811] } })))).toEqual(["warning:shelf-span"]);
    expect(codes(current(kallaxDesign({ system: "custom", width: { openings: [810] } })))).toEqual([]);
  });

  it("warns when a design other than EKET uses the EKET wall rail", () => {
    expect(codes(current(kallaxDesign({ mount: "wall-rail" })))).toEqual(["warning:mount-system"]);
  });

  it("warns when the stored parts do not match the design", () => {
    const once = current(kallaxDesign());
    const edited = { ...once, parts: once.parts.map((p) => (p.id === "kx-vertical" ? { ...p, length: 1400 } : p)) };
    expect(codes(edited)).toEqual(["warning:design-stale"]);
    expect(codes(designProject())).toEqual(["warning:design-stale"]);
  });

  it("joins the project analysis and the plan validator", () => {
    const project = current(eketDesign({ width: { outside: 30, cells: 1 } }));
    expect(analyzeProject(project).issues.map((issue) => issue.code)).toContain("design-too-small");
    expect(validatePlan(project).map((issue) => issue.code)).toContain("design-too-small");
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -w @opencutplan/core -- design/checks`
Expected: FAIL with "checkDesigns is not a function".

- [ ] **Step 3: Create `packages/core/src/design/checks.ts`**

```ts
import type { Project } from "../format/schema.ts";
import { formatLength } from "../geometry/format.ts";
import { EPSILON } from "../geometry/rect.ts";
import { convertLength } from "../geometry/units.ts";
import { planWarning, type PlanIssue } from "../plan/issues.ts";
import { designErrors, designRef } from "./errors.ts";
import { designParts, generatedParts, sameParts } from "./generate.ts";
import { designGeometry, materialsById } from "./geometry.ts";
import {
  EKET,
  EKET_TOLERANCE_MM,
  isDesignMount,
  isDesignSystem,
  KALLAX,
  KALLAX_CLEARANCE_MM,
  MAX_POCKET_CHART_MM,
  SHELF_SPAN_RATIO,
} from "./systems.ts";

export function checkDesigns(project: Project): PlanIssue[] {
  const units = project.project.units;
  const mm = (value: number) => convertLength(value, "mm", units);
  const show = (value: number) => formatLength(value, units, project.settings.display);
  const materials = materialsById(project);
  const issues: PlanIssue[] = [];

  for (const design of project.designs ?? []) {
    const ref = designRef(design);
    const name = `Design "${design.name}"`;
    if (!isDesignSystem(design.system)) {
      issues.push(planWarning("design-unknown-system", `${name} uses the system "${design.system}", which this app does not know. Its parts stay as they are.`, ref));
      continue;
    }
    if (design.mount !== undefined && !isDesignMount(design.mount)) {
      issues.push(planWarning("design-unknown-mount", `${name} uses the mount "${design.mount}", which this app does not know. The hardware list leaves it out.`, ref));
    }
    const errors = designErrors(project, design);
    issues.push(...errors);
    if (errors.length > 0) continue;
    const geometry = designGeometry(design, materials)!;

    if (geometry.thickness > mm(MAX_POCKET_CHART_MM) + EPSILON) {
      issues.push(planWarning("pocket-chart", `${name} uses stock thicker than 1 1/2" (38 mm). The pocket screw chart has no screw for it.`, ref));
    }
    if (design.system === "kallax") {
      const needed = mm(KALLAX.insert.mm + KALLAX_CLEARANCE_MM);
      const smallest = Math.min(...geometry.columns, ...geometry.rows);
      if (smallest < needed - EPSILON) {
        issues.push(planWarning("kallax-opening", `${name} has a cell of ${show(smallest)}. KALLAX inserts need at least ${show(needed)}.`, ref));
      }
      const boxDepth = mm(KALLAX.boxDepth.mm);
      if (geometry.panelDepth < boxDepth - EPSILON) {
        issues.push(planWarning("kallax-depth", `${name} has panels ${show(geometry.panelDepth)} deep. KALLAX boxes need at least ${show(boxDepth)}.`, ref));
      }
    }
    if (design.system === "eket") {
      const module = mm(EKET.module.mm);
      const tolerance = mm(EKET_TOLERANCE_MM);
      const onGrid = (value: number) => Math.round(value / module) >= 1 && Math.abs(value - Math.round(value / module) * module) <= tolerance;
      const depthFits = [EKET.depth.mm, EKET.shallowDepth.mm].some((depth) => Math.abs(geometry.depth - mm(depth)) <= tolerance);
      if (!onGrid(geometry.outsideWidth) || !onGrid(geometry.outsideHeight) || !depthFits) {
        issues.push(
          planWarning(
            "eket-grid",
            `${name} is ${show(geometry.outsideWidth)} × ${show(geometry.outsideHeight)} × ${show(geometry.depth)}. EKET units are multiples of 350 mm, and 250 or 350 mm deep.`,
            ref,
          ),
        );
      }
    }
    const span = SHELF_SPAN_RATIO * geometry.thickness;
    const longest = Math.max(...geometry.columns);
    if (longest > span + EPSILON) {
      issues.push(planWarning("shelf-span", `${name} has a shelf of ${show(longest)}. A shelf longer than ${show(span)} in this stock can sag.`, ref));
    }
    if (design.mount === "wall-rail" && design.system !== "eket") {
      issues.push(planWarning("mount-system", `${name} uses the EKET wall rail, which is made for EKET units.`, ref));
    }
    if (!sameParts(generatedParts(project, design.id), designParts(project, design)!)) {
      issues.push(planWarning("design-stale", `The parts of design "${design.name}" do not match the design. The next change makes them again.`, ref));
    }
  }
  return issues;
}
```

- [ ] **Step 4: Wire it into the analysis and the validator**

In `packages/core/src/analysis.ts`, add `import { checkDesigns } from "./design/checks.ts";` and change the `issues` line to:

```ts
    issues: [...layout, ...checkCuts(context, layout, sheets, steps), ...checkDesigns(project)],
```

In `packages/core/src/plan/validate.ts`, add `import { checkDesigns } from "../design/checks.ts";` and change the return of `validatePlan` to:

```ts
  return [...layout, ...checkCuts(ctx, layout, sheets, sequenceCuts(ctx, sheets)), ...checkDesigns(project)];
```

In `packages/core/src/index.ts`, after `export * from "./design/generate.ts";`, add `export * from "./design/checks.ts";`.

- [ ] **Step 5: Add the stale property to the generate test, and run the tests**

In `packages/core/test/design/generate.test.ts`, add `checkDesigns` to the import from `"../../src/index.ts"`, and add this test inside `describe("regenerateDesigns on random grids", …)`:

```ts
  it("leaves no design stale and no design error", () => {
    fc.assert(
      fc.property(randomDesign, (input) => {
        const issues = checkDesigns(regenerateDesigns(randomProject(input)));
        expect(issues.filter((issue) => issue.code === "design-stale" || issue.severity === "error")).toEqual([]);
      }),
    );
  });
```

Run: `npm test -w @opencutplan/core && npm run typecheck`
Expected: PASS. The examples have no designs, so their tests do not change.

- [ ] **Step 6: Run all checks**

Run: `npm run check`
Expected: PASS. The CLI and the web app see no design issues, because no project in their tests has designs.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/design/checks.ts packages/core/src/analysis.ts packages/core/src/plan/validate.ts packages/core/src/index.ts packages/core/test/design
git commit -m "Check designs against the KALLAX, EKET, and pocket-hole rules" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Convert design lengths with the project units

**Files:**
- Modify: `packages/core/src/edit/units.ts`
- Test: `packages/core/test/design/units.test.ts`

**Interfaces:**
- Consumes: `Design`, `DesignAxis` (Task 1); `regenerateDesigns` (Task 6); `checkDesigns` (Task 7).
- Produces: `convertProjectUnits` converts `designs[].width`, `designs[].height` (`openings` values or `outside`), and `designs[].depth`. `cells`, `quantity`, `system`, `mount`, and `back` do not change.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/design/units.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checkDesigns, convertProjectUnits, regenerateDesigns, type DesignAxis, type Project } from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";

function openings(axis: DesignAxis): number[] {
  if (!("openings" in axis)) throw new Error("expected an openings axis");
  return axis.openings;
}

function placed(project: Project): Project {
  const placements = project.parts.map((part) => ({ part: part.id, copy: 0, x: 0, y: 0, rotated: false }));
  return { ...project, plan: { sheets: [{ id: "s1", stock: "ply18-sheet", placements }] } };
}

describe("convertProjectUnits with designs", () => {
  it("converts design lengths, and the parts stay current and placed", () => {
    const mm = placed(regenerateDesigns(designProject([kallaxDesign(), eketDesign()])));
    const inches = convertProjectUnits(mm, "in");
    const [kallax, eket] = inches.designs!;
    expect(kallax!.width).toEqual({ openings: [13.188976378, 13.188976378] });
    expect(kallax!.depth).toBe(15.354330709);
    expect(eket!.width).toEqual({ outside: 27.559055118, cells: 2 });
    expect(eket!.quantity).toBe(2);
    expect(eket!.back).toEqual({ material: "ply6" });
    expect(regenerateDesigns(inches)).toBe(inches);
    expect(checkDesigns(inches)).toEqual([]);
    expect(inches.plan!.sheets[0]!.placements).toHaveLength(mm.parts.length);
  });

  it("comes back to the same millimetres", () => {
    const back = convertProjectUnits(convertProjectUnits(regenerateDesigns(designProject()), "in"), "mm");
    for (const value of openings(back.designs![0]!.width)) expect(value).toBeCloseTo(335, 6);
    expect(regenerateDesigns(back)).toBe(back);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -w @opencutplan/core -- design/units`
Expected: FAIL: `kallax.width` is still `{ openings: [335, 335] }`.

- [ ] **Step 3: Implement**

In `packages/core/src/edit/units.ts`, change the import to `import type { Design, DesignAxis, Project, Tool } from "../format/schema.ts";`. After `convertTool`, add:

```ts
function convertAxis(axis: DesignAxis, c: (value: number) => number): DesignAxis {
  return "openings" in axis ? { ...axis, openings: axis.openings.map(c) } : { ...axis, outside: c(axis.outside) };
}

function convertDesign(design: Design, c: (value: number) => number): Design {
  return { ...design, width: convertAxis(design.width, c), height: convertAxis(design.height, c), depth: c(design.depth) };
}
```

In `convertProjectUnits`, before `if (project.plan) {`, add:

```ts
  if (project.designs) next.designs = project.designs.map((design) => convertDesign(design, c));
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -w @opencutplan/core && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/edit/units.ts packages/core/test/design/units.test.ts
git commit -m "Convert design lengths when the project units change" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Design examples and the format documentation

**Files:**
- Create: `examples/builders/designs.ts`, `examples/builders/kallax-2x4-mm.ts`, `examples/builders/eket-wall-in.ts`
- Modify: `examples/builders/index.ts`
- Generate: `examples/kallax-2x4-mm.cutplan.json`, `examples/eket-wall-in.cutplan.json`, `examples/csv/kallax-2x4-mm-*.csv`, `examples/csv/eket-wall-in-*.csv`
- Modify: `packages/core/test/examples.test.ts`
- Modify: `docs/format.md`, `docs/superpowers/specs/2026-09-29-cabinet-generator-design.md` (§7 agent recipe), `README.md` (the examples line)

**Interfaces:**
- Consumes: `presetDesign` (Task 3), `regenerateDesigns` (Task 6), `checkDesigns` (Task 7), `designGeometry`, `materialsById` (Task 3), `optimize`, `applyOptimizeResult`, `validatePlan`, `convertLength`.
- Produces: the examples `kallax-2x4-mm` and `eket-wall-in` in `EXAMPLES`.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/examples.test.ts`, add `applyOptimizeResult`, `checkDesigns`, `convertLength`, `designGeometry`, `materialsById`, `optimize`, `regenerateDesigns`, and `validatePlan` to the import from `"../src/index.ts"`. Inside `describe.each(Object.keys(EXAMPLES))`, add:

```ts
  it("has current design parts and no design issues", () => {
    const project = build(slug);
    expect(regenerateDesigns(project)).toBe(project);
    expect(checkDesigns(project)).toEqual([]);
  });
```

At the end of the file, add:

```ts
describe("kallax-2x4-mm", () => {
  const project = build("kallax-2x4-mm");

  it("makes 3 vertical panels and 10 shelves with 335 mm cells", () => {
    expect(project.parts.map((p) => [p.id, p.length, p.width, p.quantity])).toEqual([
      ["kallax-vertical", 1430, 390, 3],
      ["kallax-horizontal", 335, 390, 10],
    ]);
  });

  it("optimizes on the track saw with every copy placed and no errors", () => {
    const result = optimize(project, { iterations: 10 });
    expect(result.unplaced).toEqual([]);
    expect(validatePlan(applyOptimizeResult(project, result)).filter((issue) => issue.severity === "error")).toEqual([]);
  });
});

describe("eket-wall-in", () => {
  const project = build("eket-wall-in");

  it("is 700 × 350 × 350 mm outside in an inch project with 23/32 plywood", () => {
    const geometry = designGeometry(project.designs![0]!, materialsById(project))!;
    expect(geometry.thickness).toBe(0.71875);
    expect(convertLength(geometry.outsideWidth, "in", "mm")).toBeCloseTo(700, 6);
    expect(convertLength(geometry.outsideHeight, "in", "mm")).toBeCloseTo(350, 6);
    expect(convertLength(geometry.depth, "in", "mm")).toBeCloseTo(350, 6);
    expect(geometry.columns[0]).toBe(geometry.columns[1]);
  });

  it("makes the parts of 2 units, with a back", () => {
    expect(project.parts.map((p) => [p.id, p.quantity])).toEqual([
      ["eket-vertical", 6],
      ["eket-horizontal", 8],
      ["eket-back", 2],
    ]);
  });

  it("optimizes with every copy placed and no errors", () => {
    const result = optimize(project, { iterations: 10 });
    expect(result.unplaced).toEqual([]);
    expect(validatePlan(applyOptimizeResult(project, result)).filter((issue) => issue.severity === "error")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -w @opencutplan/core -- examples`
Expected: FAIL: `build("kallax-2x4-mm")` throws, because `EXAMPLES` has no such builder.

- [ ] **Step 3: Create the builders**

Create `examples/builders/designs.ts`:

```ts
import { parseProject, regenerateDesigns, type ProjectInput } from "../../packages/core/src/index.ts";

export function withDesignParts(input: ProjectInput): ProjectInput {
  const result = parseProject(input);
  if (!result.ok) throw new Error(result.errors.map((issue) => issue.message).join("; "));
  return regenerateDesigns(result.project);
}
```

Create `examples/builders/kallax-2x4-mm.ts`:

```ts
import { FORMAT_VERSION, presetDesign, type ProjectInput } from "../../packages/core/src/index.ts";
import { withDesignParts } from "./designs.ts";

export function kallax2x4Mm(): ProjectInput {
  return withDesignParts({
    format: "opencutplan",
    version: FORMAT_VERSION,
    project: { name: "KALLAX-style 2x4 (metric)", units: "mm" },
    materials: [{ id: "ply18", name: "Birch plywood 18mm", thickness: 18, grained: true }],
    stock: [{ id: "ply18-2440x1220", material: "ply18", length: 2440, width: 1220, quantity: null, cost: 80, kind: "sheet" }],
    parts: [],
    designs: [presetDesign({ system: "kallax", id: "kallax", name: "Hall KALLAX", material: "ply18", cols: 2, rows: 4, units: "mm" })],
    tools: [{ id: "track-saw", name: "Track saw (2.8 m rail)", type: "track-saw", kerf: 2.2, enabled: true, maxCut: 2800 }],
    settings: { trim: 0, display: { mm: 1 } },
  });
}
```

Create `examples/builders/eket-wall-in.ts`:

```ts
import { FORMAT_VERSION, presetDesign, type ProjectInput } from "../../packages/core/src/index.ts";
import { withDesignParts } from "./designs.ts";

export function eketWallIn(): ProjectInput {
  return withDesignParts({
    format: "opencutplan",
    version: FORMAT_VERSION,
    project: { name: "EKET-style wall cabinets (inches)", units: "in" },
    materials: [
      { id: "ply-23-32", name: 'Plywood 3/4" (23/32 actual)', thickness: 0.71875, grained: true },
      { id: "ply-7-32", name: 'Plywood 1/4" (7/32 actual)', thickness: 0.21875, grained: true },
    ],
    stock: [
      { id: "ply-23-32-4x8", material: "ply-23-32", length: 96, width: 48, quantity: null, cost: 65, kind: "sheet" },
      { id: "ply-7-32-4x8", material: "ply-7-32", length: 96, width: 48, quantity: null, cost: 35, kind: "sheet" },
    ],
    parts: [],
    designs: [
      {
        ...presetDesign({ system: "eket", id: "eket", name: "Wall EKET", material: "ply-23-32", cols: 2, rows: 1, units: "in" }),
        quantity: 2,
        back: { material: "ply-7-32" },
        mount: "wall-rail",
      },
    ],
    tools: [{ id: "track-saw", name: 'Track saw (110" of rail)', type: "track-saw", kerf: 0.09375, enabled: true, maxCut: 110 }],
    settings: { trim: 0 },
  });
}
```

In `examples/builders/index.ts`, import both builders and add them to `EXAMPLES`:

```ts
import type { ProjectInput } from "../../packages/core/src/index.ts";
import { eketWallIn } from "./eket-wall-in.ts";
import { kallax2x4Mm } from "./kallax-2x4-mm.ts";
import { livingRoomShelf } from "./living-room-shelf.ts";
import { simpleBookcaseMm } from "./simple-bookcase-mm.ts";

export const EXAMPLES: Readonly<Record<string, () => ProjectInput>> = {
  "living-room-shelf": livingRoomShelf,
  "simple-bookcase-mm": simpleBookcaseMm,
  "kallax-2x4-mm": kallax2x4Mm,
  "eket-wall-in": eketWallIn,
};
```

- [ ] **Step 4: Generate the files and run the tests**

Run: `npm run examples && npm test -w @opencutplan/core && npm run typecheck`
Expected: `wrote kallax-2x4-mm` and `wrote eket-wall-in`, and all tests PASS. If the typecheck says that `Project` is not assignable to `ProjectInput` in `designs.ts`, return `JSON.parse(serializeProject(regenerateDesigns(result.project))) as ProjectInput` instead, and import `serializeProject`.

- [ ] **Step 5: Document the format**

In `docs/format.md`:

1. Change the title to `# The OpenCutPlan file format (\`.cutplan.json\`), version 1.1`, and change `this document describes \`"1.0"\`` to `this document describes \`"1.1"\``.
2. In the **Top level** table, after the `parts` row, add:
   `| \`designs\` | no | Box units that generate parts (added in 1.1); see below. |`
3. In the **Parts** table, add the row:
   `| \`design\` | no | The id of the design that made this part (added in 1.1). Readers that do not know designs treat the part as a normal part. |`
4. After the **Parts** section, add this section:

````markdown
## Designs (added in 1.1)

A design describes a box unit with a grid of cells. An app that knows designs makes the unit's parts from it and stores
them in `parts`, each with `design` set to the design id. A reader that does not know designs can plan and cut the
stored parts as normal parts.

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Unique among designs. The generated part ids start with it. |
| `name` | yes | The `group` of the generated parts. |
| `system` | yes | `"kallax"`, `"eket"`, or `"custom"`. Other values can come in later minor versions; a reader keeps the stored parts of a system it does not know. |
| `material` | yes | A material id: the material of the box. |
| `quantity` | no | The number of identical units, 1 to 100. Default 1. |
| `width` | yes | The columns, left to right: an axis. |
| `height` | yes | The rows, top to bottom: an axis. |
| `depth` | yes | The outside depth, including the back. |
| `back` | no | `{ "material": <id> }`: a back on the rear edges. No field means no back. |
| `mount` | no | `"floor"`, `"legs"`, `"feet"`, or `"wall-rail"`. Default `"floor"`. Other values can come in later minor versions. |

An **axis** is one of:

- `{ "openings": [335, 335] }`: the size of each cell, 1 to 50 values.
- `{ "outside": 700, "cells": 2 }`: the outside size, divided into 1 to 50 equal cells.

**Generated parts.** With *t* the material thickness, *n* columns, *m* rows, and *q* the quantity:

| Part id | Name | Length × width | Quantity |
|---|---|---|---|
| `<id>-vertical` | Vertical panel | outside height × panel depth | (*n* + 1) × *q* |
| `<id>-horizontal`, or `<id>-horizontal-<k>` | Shelf, or Shelf *k* | column opening × panel depth | (*m* + 1) × the columns with that opening × *q* |
| `<id>-back` | Back | outside height × outside width | *q* |

- An `outside` axis has openings of (outside − (cells + 1) × *t*) / cells. An `openings` axis has an outside size of
  the sum of the openings + (cells + 1) × *t*.
- The panel depth is `depth` minus the back thickness.
- The vertical panels run the full height. Each shelf fits between two vertical panels. All joints are butt joints
  with pocket screws.
- Columns with the same opening share one shelf part. With more than one opening size, *k* counts the sizes in column
  order from 1.
- Every generated part has `grain: "length"` and `group` set to the design name.

When a design and its stored parts do not agree, the design wins: an app makes the parts again and moves the copies
of changed parts off their sheets.
````

5. In the section on compatibility rules (the list that says the value sets are fixed within a major version), add:
   `- \`designs[].system\` and \`designs[].mount\` are not fixed: a minor version can add values.`

In `docs/superpowers/specs/2026-09-29-cabinet-generator-design.md`, in the §7 agent recipe, change `--max-cut 1400` to `--max-cut 2800`.

In `README.md`, change the **Examples** line to list the four examples: `living-room-shelf` (inches, with a full layout), `simple-bookcase-mm` (metric, with an owned offcut and two saws), `kallax-2x4-mm` (a KALLAX-style design), and `eket-wall-in` (two EKET-style wall units, in inches).

- [ ] **Step 6: Run all checks**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add examples packages/core/test/examples.test.ts docs/format.md docs/superpowers/specs/2026-09-29-cabinet-generator-design.md README.md
git commit -m "Add the KALLAX and EKET design examples and document designs" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
