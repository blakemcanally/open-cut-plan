# Cabinet Generator Phase 2 — Outputs and CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each design its outputs (assembly steps, a hardware list with the Kreg pocket-screw chart and the IKEA items, and a front-view SVG), and give the CLI a `design` command group, `report assembly`, the `hardware` section of `report shopping`, and design parts that are made again on every write.

**Architecture:** The outputs are pure core functions of the project: `hardwareList(project)`, `assemblySteps(project, designId)`, and `designElevationSvg(project, designId)`. Each one gives nothing for a design that `designParts` refuses. The CLI keeps one write point, `finishMutation`, which now calls `regenerateDesigns` before it serializes, diffs, and validates, so every command keeps the design parts current. The new `commands/design.ts` turns flags into a `Design`, refuses a design with an error (exit 1, `invalid-value`, `error.issues`), and uses the core edit helpers in `design/edit.ts` for remove, detach, and a new id.

**Tech Stack:** as in phase 1: TypeScript (strict, erasable syntax only), zod 4, Vitest, fast-check, Node's `parseArgs` in the CLI. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-29-cabinet-generator-design.md` (§5.3 regeneration, §5.4 edits to generated parts, §6 outputs, §7 CLI, §9 code layout, §10 error handling, §11 testing, §12 phase 2). Appendix A has the IKEA numbers.

## Global Constraints

- Work in the worktree `worktrees/cabinet-generator-phase-2` on the branch `cabinet-generator-phase-2`. Phase 1 is on `main` at `6429e62`.
- The worktree has no `node_modules` of its own. Without the links in Task 1 Step 1, Node resolves `@opencutplan/core` to the **main checkout**, and the CLI compiles and tests against the wrong core.
- Add no dependencies.
- ESM only. Relative imports use the `.ts` extension. Only erasable TypeScript syntax (no enums, no parameter properties, no namespaces).
- Every length is in `project.units`. IKEA and pocket-hole numbers are in millimetres and convert with `convertLength`. Lengths that core computes are rounded with `roundLength` (1e-9).
- Readable text uses `formatLength(value, units, project.settings.display)`, so an inch project shows fractions such as `13 3/16"`.
- CLI conventions (`docs/cli.md`): `--json` prints one envelope; exit 0 success, 1 the command ran and found errors, 2 a usage error or an unknown id, 3 an unreadable input. Every command has at least one example (the flow test checks this).
- Error codes in this phase: `generated-part` (exit 1, with `id` and `design`), `invalid-value` with `issues` for a design error (exit 1, spec §10), `design-invalid` (exit 1, a read command on a design that makes no parts), `newer-version` (exit 1). Flag errors use the current codes: `missing-option`, `conflict`, `invalid-value`, `not-found`, `duplicate-id` (exit 2).
- Help text, messages, and docs follow the style of the current CLI text: short sentences, active voice, and simple words.
- Comments: default to none. Only a comment that carries information the code cannot (for example, an API contract).
- Commit after every task. Every commit message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (use two `-m` flags exactly as shown).
- The repo stays local. Do not push.
- The test commands: `npm test -w @opencutplan/core -- <filter>`, `npm test -w @opencutplan/cli -- <filter>`, and `npm run check` (lint, typecheck, all tests, and the build) at the end of each task.

## Review Focus

1. **A unit change on a design with a placed plan** (`settings set units in`, and back to `mm`): every copy stays on its sheet, because each write now makes the parts again. Pinned in Task 5 (`keeps every placed copy when the units change`).
2. **A second design with the same grid** (two `design add --system kallax --cols 2 --rows 4`): the second gets the id `kallax-2x4-2`, and its parts do not take the ids of the first. Pinned in Task 6 (`gives a second design with the same grid its own id and parts`).
3. **A new design id whose part ids are in use** (`design set --id hall` when a normal part `hall-vertical` exists): the change is refused with exit 1, `invalid-value`, and `design-conflict`, and nothing is written. Pinned in Task 6 (`refuses a new id whose parts would take the id of another part`).
4. **A change to one axis** (`design set --cols 3`): the other axis stays, a KALLAX gets IKEA cells, an EKET gets 350 mm modules in the project units, and a custom design without `--width` is a usage error. Pinned in Task 6 (`changes one axis and keeps the other`).
5. **An agent pipe** (`design add -` with the project on stdin, and `--dry-run --json`): stdout is the project with the design and its parts; a dry run reports the parts and writes nothing. Pinned in Task 6 (`reads stdin and prints the project with its parts, or writes nothing with --dry-run`).

## Decisions

These choices go beyond the spec's text. Task 8 records the user-visible ones in `docs/cli.md`.

- **The pocket-screw chart is Kreg's.** The spec chart put 1 1/8" stock on 2" screws and 1 3/8" stock on 2 1/2" screws. The Kreg K4/K5 manual gives 1 1/2" and 2". Core rounds the thickness to the nearest 1/8" jig setting and reads the screw from Kreg's chart. Task 2 updates spec §6.2.
- **`finishMutation` makes the design parts again** before it serializes, diffs, and validates. A command that puts the parts in its result (`design add`, `design set`) also calls `regenerateDesigns` itself; the second call returns the same object.
- **`changes.designs`** is a new `CollectionChanges` in the diff, and the readable output says "Added design: …", "Changed design: …", and "Removed design: …".
- **`parts set` and `parts remove` refuse a part only when its design exists.** A part whose `design` names a missing design is a normal part (the load gives `design-missing`), so it stays editable.
- **A material in use** now includes the material and the back material of each design (`materialInUse`, and `usedBy.designs` in `materials list`, `materials get`, and the `in-use` error).
- **A new material moves the copies to the tray.** `regenerateDesigns` also drops a placement when the part material changes, because a copy on a birch sheet is not a copy on an oak sheet.
- **`design add` defaults:** `--system custom`, no back, no `mount` field (floor), no `quantity` field (1). Each axis needs `--cols`/`--rows`, an outside size, or a list of openings; for `kallax` and `eket`, `--cols` and `--rows` alone give IKEA cells, and the depth defaults to the IKEA depth.
- **`design set --id` renames the design parts** (`renameDesign`) and keeps their copies on the sheets. This is the one exception to "ids do not change", and `docs/cli.md` says so. `--name` does not change the id, and a grid change does not change the name.
- **`design add` and `design set` refuse a file from a newer minor version** (`newer-version`, exit 1), because `designParts` makes no parts for such a file. `design set` on a design with an unknown system needs `--system`.
- **A read command on a design that makes no parts** (`design drawing`, `report assembly --design`) exits 1 with `design-invalid` and the error issues. `report assembly` without `--design` skips such a design and lists it in `skipped`.
- **The assembly text** follows spec §6.1, with two changes: the drill step names the Kreg jig setting ("Set the jig and the drill collar to the 3/4" mark.") instead of the stock size, and the marks are "from the bottom end" of the panel.
- **The drawing sizes that the appendix does not give:** the feet are drawn 24 mm high (the top of their 19 to 24 mm range) and 40 mm wide. The legs are 100 mm high and 30 mm wide (appendix A.2). The rails are dashed rectangles 630 mm or 295 mm long and 40 mm high, behind the top panel.
- **`validate` help** mentions the design checks and the `design` refs. `docs/format.md` fixes the "(cells + 1)" wording for an `openings` axis.

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/design/systems.ts` | `isPresetSystem`, `presetAxis`, `presetDepth`; `presetDesign` uses them |
| `packages/core/src/design/edit.ts` | `defaultDesignName`, `axisCells`, `removeDesign`, `detachDesign`, `renameDesign` |
| `packages/core/src/edit/stock.ts` | `materialInUse` counts the design materials |
| `packages/core/src/design/generate.ts` | a material change drops the placements |
| `packages/core/src/design/ikea.ts` | the IKEA article table (GB article numbers, URLs, guides, check date) |
| `packages/core/src/design/hardware.ts` | the Kreg chart, the hole and screw counts, the rails, `hardwareList` |
| `packages/core/src/design/assembly.ts` | `assemblySteps` |
| `packages/core/src/reports/elevation.ts` | `designElevationSvg` |
| `packages/core/src/index.ts` | export the new modules |
| `packages/cli/src/project.ts` | `finishMutation` calls `regenerateDesigns` |
| `packages/cli/src/diff.ts` | `changes.designs` |
| `packages/cli/src/commands/common.ts` | `assertNotGenerated` |
| `packages/cli/src/commands/parts.ts` | refuse generated parts |
| `packages/cli/src/commands/materials.ts` | `usedBy.designs` |
| `packages/cli/src/commands/project.ts` | the `validate` help text |
| `packages/cli/src/commands/design.ts` | the `design` group and `invalidDesign` |
| `packages/cli/src/commands/index.ts` | register the group |
| `packages/cli/src/commands/report.ts` | `report assembly`, `report shopping` `.hardware` |
| `packages/cli/test/helpers.ts` | `withDesignExamples`, `editFile` |
| `packages/cli/test/design-write.test.ts`, `design.test.ts`, `design-report.test.ts`, `flow.test.ts` | the CLI tests |
| `docs/cli.md`, `docs/format.md`, the spec | the documentation |

---

### Task 1: Design edits in core

**Files:**
- Modify: `packages/core/src/design/systems.ts`
- Create: `packages/core/src/design/edit.ts`
- Modify: `packages/core/src/edit/stock.ts` (`materialInUse`)
- Modify: `packages/core/src/design/generate.ts` (`regenerateDesign`)
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/design/edit.test.ts`

**Interfaces:**
- Consumes (phase 1): `Design`, `DesignAxis`, `Project` from `format/schema.ts`; `KALLAX`, `EKET`, `DesignSystem`, `presetDesign` from `design/systems.ts`; `roundLength` from `design/geometry.ts`; `withoutPlacements(project, drop)` from `edit/parts.ts`; `regenerateDesigns` from `design/generate.ts`.
- Produces:
  - `type PresetSystem = "kallax" | "eket"`, `isPresetSystem(system: string): system is PresetSystem`
  - `presetAxis(system: PresetSystem, cells: number, units: Units): DesignAxis` — KALLAX gives `{ openings: [335 mm, …] }`; EKET gives `{ outside: 350 mm × cells, cells }`.
  - `presetDepth(system: PresetSystem, units: Units): number`
  - `DESIGN_SYSTEM_NAMES: Readonly<Record<DesignSystem, string>>` (`KALLAX`, `EKET`, `Custom`), `defaultDesignName(system, cols, rows): string` (`"KALLAX 2x4"`), `axisCells(axis: DesignAxis): number`
  - `removeDesign(project, id): Project`, `detachDesign(project, id): Project`, `renameDesign(project, from, to): Project`. All three drop the `designs` key when no design is left.
  - `materialInUse(project, id)` is true also for a design material or a design back material.

- [ ] **Step 1: Link the worktree packages**

The CLI must resolve `@opencutplan/core` to this worktree. `node_modules` is git-ignored.

```bash
cd worktrees/cabinet-generator-phase-2
mkdir -p node_modules/@opencutplan
ln -sfn ../../packages/core node_modules/@opencutplan/core
ln -sfn ../../packages/cli node_modules/@opencutplan/cli
ln -sfn ../../apps/web node_modules/@opencutplan/web
node -e 'console.log(require("fs").realpathSync("node_modules/@opencutplan/core"))'
```

Expected: the path ends in `worktrees/cabinet-generator-phase-2/packages/core`.

- [ ] **Step 2: Write the failing tests**

Create `packages/core/test/design/edit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  axisCells,
  defaultDesignName,
  detachDesign,
  materialInUse,
  presetAxis,
  presetDepth,
  regenerateDesigns,
  removeDesign,
  removeMaterial,
  renameDesign,
  type Part,
  type Project,
} from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";

const side: Part = { id: "side", name: "Side", material: "ply18", length: 900, width: 300, quantity: 2, grain: "length" };

function placed(project: Project): Project {
  const placements = project.parts.map((part) => ({ part: part.id, copy: 0, x: 0, y: 0, rotated: false }));
  return { ...project, plan: { sheets: [{ id: "s1", stock: "ply18-sheet", placements }] } };
}

const onSheet = (project: Project) => project.plan!.sheets[0]!.placements.map((p) => p.part);

describe("design names and presets", () => {
  it("names a design by its system and grid", () => {
    expect(defaultDesignName("kallax", 2, 4)).toBe("KALLAX 2x4");
    expect(defaultDesignName("eket", 2, 1)).toBe("EKET 2x1");
    expect(defaultDesignName("custom", 3, 2)).toBe("Custom 3x2");
  });

  it("counts the cells of an axis", () => {
    expect(axisCells({ openings: [335, 400] })).toBe(2);
    expect(axisCells({ outside: 700, cells: 3 })).toBe(3);
  });

  it("makes the preset axis and depth in the project units", () => {
    expect(presetAxis("kallax", 2, "mm")).toEqual({ openings: [335, 335] });
    expect(presetAxis("eket", 2, "in")).toEqual({ outside: 27.559055118, cells: 2 });
    expect(presetDepth("kallax", "in")).toBe(15.354330709);
    expect(presetDepth("eket", "mm")).toBe(350);
  });
});

describe("removeDesign", () => {
  it("removes the design, its parts, and their copies, and keeps the other parts", () => {
    const project = placed(regenerateDesigns({ ...designProject([kallaxDesign(), eketDesign()]), parts: [side] }));
    const next = removeDesign(project, "kx");
    expect(next.designs!.map((d) => d.id)).toEqual(["ek"]);
    expect(next.parts.map((p) => p.id)).toEqual(["side", "ek-vertical", "ek-horizontal", "ek-back"]);
    expect(onSheet(next)).toEqual(["side", "ek-vertical", "ek-horizontal", "ek-back"]);
  });

  it("leaves no designs field when the last design goes", () => {
    const next = removeDesign(regenerateDesigns(designProject()), "kx");
    expect("designs" in next).toBe(false);
    expect(next.parts).toEqual([]);
  });
});

describe("detachDesign", () => {
  it("keeps the parts and their copies as normal parts", () => {
    const project = placed(regenerateDesigns(designProject()));
    const next = detachDesign(project, "kx");
    expect("designs" in next).toBe(false);
    expect(next.parts.map((p) => [p.id, p.design])).toEqual([
      ["kx-vertical", undefined],
      ["kx-horizontal", undefined],
    ]);
    expect("design" in next.parts[0]!).toBe(false);
    expect(onSheet(next)).toEqual(["kx-vertical", "kx-horizontal"]);
    expect(regenerateDesigns(next)).toBe(next);
  });
});

describe("renameDesign", () => {
  it("changes the ids of the design, its parts, and their copies", () => {
    const project = placed(regenerateDesigns({ ...designProject(), parts: [side] }));
    const next = renameDesign(project, "kx", "hall");
    expect(next.designs![0]!.id).toBe("hall");
    expect(next.parts.map((p) => [p.id, p.design])).toEqual([
      ["side", undefined],
      ["hall-vertical", "hall"],
      ["hall-horizontal", "hall"],
    ]);
    expect(onSheet(next)).toEqual(["side", "hall-vertical", "hall-horizontal"]);
    expect(regenerateDesigns(next)).toBe(next);
  });
});

describe("materials that designs use", () => {
  it("counts the design material and the back material as in use", () => {
    const project = designProject([eketDesign()]);
    expect(materialInUse(project, "ply18")).toBe(true);
    expect(materialInUse(project, "ply6")).toBe(true);
    expect(removeMaterial(project, "ply6")).toBe(project);
    expect(materialInUse({ ...designProject([kallaxDesign()]), stock: [] }, "ply6")).toBe(false);
  });

  it("takes the copies off the sheets when the design material changes", () => {
    const project = placed(regenerateDesigns(designProject([eketDesign()])));
    const birch = { ...project, materials: [...project.materials, { id: "birch18", name: "Birch 18", thickness: 18, grained: true }] };
    const next = regenerateDesigns({ ...birch, designs: [eketDesign({ material: "birch18" })] });
    expect(next.parts.map((p) => [p.id, p.material])).toEqual([
      ["ek-vertical", "birch18"],
      ["ek-horizontal", "birch18"],
      ["ek-back", "ply6"],
    ]);
    expect(onSheet(next)).toEqual(["ek-back"]);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npm test -w @opencutplan/core -- design/edit`
Expected: FAIL. `defaultDesignName`, `presetAxis`, and the other new functions are not exported (`TypeError: … is not a function`).

- [ ] **Step 4: Implement the presets**

Apply this change to `packages/core/src/design/systems.ts`:

```diff
--- a/packages/core/src/design/systems.ts
+++ b/packages/core/src/design/systems.ts
@@ -1,3 +1,3 @@
-import type { Design } from "../format/schema.ts";
+import type { Design, DesignAxis } from "../format/schema.ts";
 import { convertLength, type Units } from "../geometry/units.ts";
 import { roundLength } from "./geometry.ts";
@@ -49,6 +49,22 @@ export const DEFAULT_DESIGN_QUANTITY = 1;
 export const DEFAULT_DESIGN_MOUNT: DesignMount = "floor";
 
+export type PresetSystem = "kallax" | "eket";
+
+export function isPresetSystem(system: string): system is PresetSystem {
+  return system === "kallax" || system === "eket";
+}
+
+export function presetAxis(system: PresetSystem, cells: number, units: Units): DesignAxis {
+  const mm = (value: number) => roundLength(convertLength(value, "mm", units));
+  if (system === "kallax") return { openings: Array.from({ length: cells }, () => mm(KALLAX.opening.mm)) };
+  return { outside: mm(EKET.module.mm * cells), cells };
+}
+
+export function presetDepth(system: PresetSystem, units: Units): number {
+  return roundLength(convertLength(system === "kallax" ? KALLAX.depth.mm : EKET.depth.mm, "mm", units));
+}
+
 export interface PresetOptions {
-  system: "kallax" | "eket";
+  system: PresetSystem;
   id: string;
   name: string;
@@ -60,25 +76,4 @@ export interface PresetOptions {
 
 export function presetDesign({ system, id, name, material, cols, rows, units }: PresetOptions): Design {
-  const mm = (value: number) => roundLength(convertLength(value, "mm", units));
-  if (system === "kallax") {
-    const opening = mm(KALLAX.opening.mm);
-    return {
-      id,
-      name,
-      system,
-      material,
-      width: { openings: Array.from({ length: cols }, () => opening) },
-      height: { openings: Array.from({ length: rows }, () => opening) },
-      depth: mm(KALLAX.depth.mm),
-    };
-  }
-  return {
-    id,
-    name,
-    system,
-    material,
-    width: { outside: mm(EKET.module.mm * cols), cells: cols },
-    height: { outside: mm(EKET.module.mm * rows), cells: rows },
-    depth: mm(EKET.depth.mm),
-  };
+  return { id, name, system, material, width: presetAxis(system, cols, units), height: presetAxis(system, rows, units), depth: presetDepth(system, units) };
 }
```

- [ ] **Step 5: Implement the design edits**

Create `packages/core/src/design/edit.ts`:

```ts
import { withoutPlacements } from "../edit/parts.ts";
import type { Design, DesignAxis, Project } from "../format/schema.ts";
import type { DesignSystem } from "./systems.ts";

export const DESIGN_SYSTEM_NAMES: Readonly<Record<DesignSystem, string>> = { kallax: "KALLAX", eket: "EKET", custom: "Custom" };

export function defaultDesignName(system: DesignSystem, cols: number, rows: number): string {
  return `${DESIGN_SYSTEM_NAMES[system]} ${cols}x${rows}`;
}

export function axisCells(axis: DesignAxis): number {
  return "openings" in axis ? axis.openings.length : axis.cells;
}

function withDesigns(project: Project, designs: Design[]): Project {
  const { designs: _designs, ...rest } = project;
  return designs.length > 0 ? { ...rest, designs } : rest;
}

/** Removes the design, its parts, and their copies on the sheets. */
export function removeDesign(project: Project, id: string): Project {
  const gone = new Set(project.parts.filter((part) => part.design === id).map((part) => part.id));
  const next = withDesigns({ ...project, parts: project.parts.filter((part) => !gone.has(part.id)) }, (project.designs ?? []).filter((design) => design.id !== id));
  return withoutPlacements(next, (placement) => gone.has(placement.part));
}

/** Removes the design and keeps its parts, and their copies on the sheets, as normal parts. */
export function detachDesign(project: Project, id: string): Project {
  const parts = project.parts.map((part) => {
    if (part.design !== id) return part;
    const { design: _design, ...rest } = part;
    return rest;
  });
  return withDesigns({ ...project, parts }, (project.designs ?? []).filter((design) => design.id !== id));
}

/** Changes the design id, and the ids of its parts and their copies, so the copies stay on their sheets. */
export function renameDesign(project: Project, from: string, to: string): Project {
  const prefix = `${from}-`;
  const ids = new Map<string, string>();
  const parts = project.parts.map((part) => {
    if (part.design !== from) return part;
    const id = part.id.startsWith(prefix) ? `${to}-${part.id.slice(prefix.length)}` : part.id;
    ids.set(part.id, id);
    return { ...part, id, design: to };
  });
  const designs = (project.designs ?? []).map((design) => (design.id === from ? { ...design, id: to } : design));
  const next: Project = { ...project, designs, parts };
  if (project.plan) {
    next.plan = {
      ...project.plan,
      sheets: project.plan.sheets.map((sheet) => ({
        ...sheet,
        placements: sheet.placements.map((placement) => (ids.has(placement.part) ? { ...placement, part: ids.get(placement.part)! } : placement)),
      })),
    };
  }
  return next;
}
```

Apply these changes to `packages/core/src/edit/stock.ts` and `packages/core/src/design/generate.ts`:

```diff
--- a/packages/core/src/edit/stock.ts
+++ b/packages/core/src/edit/stock.ts
@@ -24,5 +24,9 @@ export function updateMaterial(project: Project, id: string, patch: Patch<Materi
 
 export function materialInUse(project: Project, id: string): boolean {
-  return project.parts.some((part) => part.material === id) || project.stock.some((stock) => stock.material === id);
+  return (
+    project.parts.some((part) => part.material === id) ||
+    project.stock.some((stock) => stock.material === id) ||
+    (project.designs ?? []).some((design) => design.material === id || design.back?.material === id)
+  );
 }
 
```

```diff
--- a/packages/core/src/design/generate.ts
+++ b/packages/core/src/design/generate.ts
@@ -59,5 +59,5 @@ function regenerateDesign(project: Project, design: Design): Project {
     if (!was) return false;
     const now = after.get(placement.part);
-    return !now || now.length !== was.length || now.width !== was.width || placement.copy >= now.quantity;
+    return !now || now.length !== was.length || now.width !== was.width || now.material !== was.material || placement.copy >= now.quantity;
   });
 }
```

In `packages/core/src/index.ts`, after `export * from "./design/checks.ts";`, add:

```ts
export * from "./design/edit.ts";
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npm test -w @opencutplan/core -- design`
Expected: PASS, with the phase 1 design tests (the `presetDesign` tests pass with the new helpers).

- [ ] **Step 7: Run the full check and commit**

Run: `npm run check`
Expected: exit 0.

```bash
git add packages/core
git commit -m "Add the design edits in core: presets, names, remove, detach, and rename" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The IKEA table and the hardware list

**Files:**
- Create: `packages/core/src/design/ikea.ts`
- Create: `packages/core/src/design/hardware.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `docs/superpowers/specs/2026-09-29-cabinet-generator-design.md` (§6.2 chart)
- Test: `packages/core/test/design/hardware.test.ts`

**Interfaces:**
- Consumes: `designParts` (phase 1), `designGeometry`, `materialsById`, `DesignGeometry`, `isDesignMount`, `DEFAULT_DESIGN_QUANTITY`, `DEFAULT_DESIGN_MOUNT`, `MIN_POCKET_THICKNESS_MM`, `MAX_POCKET_CHART_MM`, `convertLength`.
- Produces:
  - `interface IkeaItem { name; article; source; guide?; checked }`, `IKEA_CHECKED`, `IKEA_RAIL_70`, `IKEA_RAIL_35`, `IKEA_LEGS` (black, wood, silver), `IKEA_FEET`, `RAIL_CLEARANCE_MM` (50).
  - `interface PocketScrew { setting: number /* inches */; screw: string }`, `POCKET_SCREW_SOURCE`, `POCKET_SCREWS`, `pocketScrew(thicknessMm): PocketScrew | null`.
  - `pocketHolesPerEnd(panelDepthMm): number`, `backScrewName(backThicknessMm): string`, `backScrewCount(geometry: DesignGeometry, units: Units): number` (for one unit).
  - `interface Rails { long: number; short: number }`, `railsFor(outsideWidthMm): Rails`.
  - `type HardwareItem`, `interface HardwareChoice { name; article; source }`, `interface HardwareLine { item; name; article?; choices?; quantity: number | null; unit: "each" | "pack"; design: string | null; source? }`, `hardwareList(project): HardwareLine[]`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/design/hardware.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hardwareList, pocketHolesPerEnd, pocketScrew, railsFor, regenerateDesigns, type HardwareLine } from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";

const counts = (lines: HardwareLine[]) => lines.map((line) => [line.item, line.quantity, line.design]);

describe("pocketScrew", () => {
  it("follows the Kreg chart at the nearest 1/8 inch setting", () => {
    const rows = [17.4, 17.5, 20.6, 20.7, 25.4, 30, 30.2, 36.4, 36.6, 38.1].map((mm) => {
      const screw = pocketScrew(mm)!;
      return [mm, screw.setting, screw.screw];
    });
    expect(rows).toEqual([
      [17.4, 0.625, '1" (25 mm)'],
      [17.5, 0.75, '1 1/4" (32 mm)'],
      [20.6, 0.75, '1 1/4" (32 mm)'],
      [20.7, 0.875, '1 1/2" (38 mm)'],
      [25.4, 1, '1 1/2" (38 mm)'],
      [30, 1.125, '1 1/2" (38 mm)'],
      [30.2, 1.25, '2" (50 mm)'],
      [36.4, 1.375, '2" (50 mm)'],
      [36.6, 1.5, '2 1/2" (64 mm)'],
      [38.1, 1.5, '2 1/2" (64 mm)'],
    ]);
  });

  it("has no screw outside 15/32 to 1 1/2 inch", () => {
    expect(pocketScrew(11.8)).toBeNull();
    expect(pocketScrew(11.90625)).toMatchObject({ setting: 0.5, screw: '1" (25 mm)' });
    expect(pocketScrew(38.2)).toBeNull();
  });
});

describe("pocketHolesPerEnd and railsFor", () => {
  it("puts a hole 50 mm from each edge and at most 150 mm between holes", () => {
    expect([100, 250, 344, 390, 400, 401].map(pocketHolesPerEnd)).toEqual([2, 2, 3, 3, 3, 4]);
  });

  it("uses 70 cm rails, then one 35 cm rail", () => {
    expect([300, 350, 700, 1050, 1400, 1750].map(railsFor)).toEqual([
      { long: 0, short: 1 },
      { long: 0, short: 1 },
      { long: 1, short: 0 },
      { long: 1, short: 1 },
      { long: 2, short: 0 },
      { long: 2, short: 1 },
    ]);
  });
});

describe("hardwareList", () => {
  it("lists the pocket screws, the anti-tip fitting, and the glue for a KALLAX on the floor", () => {
    const lines = hardwareList(regenerateDesigns(designProject([kallaxDesign()])));
    expect(counts(lines)).toEqual([
      ["pocket-screws", 66, "kx"],
      ["anti-tip", 1, "kx"],
      ["wall-fixings", null, "kx"],
      ["glue", null, null],
    ]);
    expect(lines[0]!.name).toBe('Pocket screws, coarse thread, 1 1/4" (32 mm)');
  });

  it("lists the back screws and the rails for two EKET units on the wall", () => {
    const lines = hardwareList(regenerateDesigns(designProject([eketDesign()])));
    expect(counts(lines)).toEqual([
      ["pocket-screws", 53, "ek"],
      ["back-screws", 42, "ek"],
      ["eket-rail-70", 2, "ek"],
      ["wall-fixings", null, "ek"],
      ["glue", null, null],
    ]);
    expect(lines[1]!.name).toBe('#6 × 3/4" (4 × 20 mm) flat head wood screws');
    expect(lines[2]).toMatchObject({ name: "EKET suspension rail, 70 cm", article: "80340048" });
  });

  it("offers the three leg finishes, and anchors a unit on legs", () => {
    const lines = hardwareList(regenerateDesigns(designProject([eketDesign({ mount: "legs" })])));
    expect(counts(lines)).toEqual([
      ["pocket-screws", 53, "ek"],
      ["back-screws", 42, "ek"],
      ["eket-legs", 2, "ek"],
      ["anti-tip", 2, "ek"],
      ["wall-fixings", null, "ek"],
      ["glue", null, null],
    ]);
    expect(lines[2]!.choices!.map((choice) => choice.article)).toEqual(["70574660", "80474151", "70428904"]);
  });

  it("leaves out a design with an error and gives no glue line without designs", () => {
    expect(hardwareList(designProject([kallaxDesign({ material: "missing" })]))).toEqual([]);
    expect(hardwareList(designProject([]))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -w @opencutplan/core -- design/hardware`
Expected: FAIL. `pocketScrew`, `railsFor`, and `hardwareList` are not exported.

- [ ] **Step 3: Add the IKEA table**

Create `packages/core/src/design/ikea.ts`:

```ts
export interface IkeaItem {
  name: string;
  /** The IKEA GB article number. Other countries can use other numbers. */
  article: string;
  source: string;
  /** The IKEA assembly guide, when it was confirmed. */
  guide?: string;
  checked: string;
}

export const IKEA_CHECKED = "2026-09-29";

export const IKEA_RAIL_70: IkeaItem = {
  name: "EKET suspension rail, 70 cm",
  article: "80340048",
  source: "https://www.ikea.com/gb/en/p/eket-suspension-rail-70cm-80340048/",
  guide: "AA-1912543-9",
  checked: IKEA_CHECKED,
};

export const IKEA_RAIL_35: IkeaItem = {
  name: "EKET suspension rail, 35 cm",
  article: "00340047",
  source: "https://www.ikea.com/gb/en/p/eket-suspension-rail-35cm-00340047/",
  guide: "AA-1912543-9",
  checked: IKEA_CHECKED,
};

export const IKEA_LEGS: readonly IkeaItem[] = [
  { name: "EKET legs, black, 4-pack", article: "70574660", source: "https://www.ikea.com/gb/en/p/eket-legs-4-pack-black-70574660/", guide: "AA-2425733-1", checked: IKEA_CHECKED },
  { name: "EKET legs, wood, 4-pack", article: "80474151", source: "https://www.ikea.com/gb/en/p/eket-legs-4-pack-wood-80474151/", guide: "AA-2196566-3", checked: IKEA_CHECKED },
  { name: "EKET legs, silver, 4-pack", article: "70428904", source: "https://www.ikea.com/gb/en/p/eket-legs-4-pack-metal-70428904/", checked: IKEA_CHECKED },
];

export const IKEA_FEET: IkeaItem = {
  name: "EKET adjustable feet, 4-pack",
  article: "70340044",
  source: "https://www.ikea.com/gb/en/p/eket-adjustable-feet-70340044/",
  guide: "AA-1909148-2",
  checked: IKEA_CHECKED,
};

/** The EKET rail listing asks for 5 cm between the top of the unit and the ceiling. */
export const RAIL_CLEARANCE_MM = 50;
```

- [ ] **Step 4: Add the hardware list**

Create `packages/core/src/design/hardware.ts`:

```ts
import type { Project } from "../format/schema.ts";
import { convertLength, type Units } from "../geometry/units.ts";
import { designParts } from "./generate.ts";
import { designGeometry, materialsById, type DesignGeometry } from "./geometry.ts";
import { IKEA_FEET, IKEA_LEGS, IKEA_RAIL_35, IKEA_RAIL_70 } from "./ikea.ts";
import { DEFAULT_DESIGN_MOUNT, DEFAULT_DESIGN_QUANTITY, EKET, EKET_TOLERANCE_MM, isDesignMount, MAX_POCKET_CHART_MM, MIN_POCKET_THICKNESS_MM } from "./systems.ts";

export interface PocketScrew {
  /** The jig mark and the collar setting, in inches. */
  setting: number;
  screw: string;
}

export const POCKET_SCREW_SOURCE = "https://www.kregtool.com/on/demandware.static/-/Library-Sites-RefArchSharedLibrary/default/dwbda477b7/manuals/K5_NA.pdf";

/** Kreg's chart for the K4 and K5 jigs. The jig marks are the actual board thickness. */
export const POCKET_SCREWS: readonly PocketScrew[] = [
  { setting: 0.5, screw: '1" (25 mm)' },
  { setting: 0.625, screw: '1" (25 mm)' },
  { setting: 0.75, screw: '1 1/4" (32 mm)' },
  { setting: 0.875, screw: '1 1/2" (38 mm)' },
  { setting: 1, screw: '1 1/2" (38 mm)' },
  { setting: 1.125, screw: '1 1/2" (38 mm)' },
  { setting: 1.25, screw: '2" (50 mm)' },
  { setting: 1.375, screw: '2" (50 mm)' },
  { setting: 1.5, screw: '2 1/2" (64 mm)' },
];

const CHART_TOLERANCE_MM = 0.01;
const COUNT_EPSILON = 1e-9;

/** The row for the nearest jig mark, or null for stock outside the chart. */
export function pocketScrew(thicknessMm: number): PocketScrew | null {
  if (thicknessMm < MIN_POCKET_THICKNESS_MM - CHART_TOLERANCE_MM || thicknessMm > MAX_POCKET_CHART_MM + CHART_TOLERANCE_MM) return null;
  const setting = Math.min(1.5, Math.max(0.5, Math.round((thicknessMm / 25.4) * 8) / 8));
  return POCKET_SCREWS.find((row) => row.setting === setting) ?? null;
}

/** 50 mm from each edge, and at most 150 mm between holes. */
export function pocketHolesPerEnd(panelDepthMm: number): number {
  return Math.max(2, Math.ceil((panelDepthMm - 100) / 150 - COUNT_EPSILON) + 1);
}

const THIN_BACK_MM = 7;

export function backScrewName(backThicknessMm: number): string {
  return backThicknessMm <= THIN_BACK_MM + CHART_TOLERANCE_MM ? '#6 × 3/4" (4 × 20 mm) flat head wood screws' : '#8 × 1 1/4" (4 × 30 mm) flat head wood screws';
}

function edgeScrews(lengthMm: number): number {
  return Math.max(2, Math.ceil((lengthMm - 50) / 150 - COUNT_EPSILON) + 1);
}

/** The screws for one back: along the perimeter and each interior panel edge, 25 mm from the ends and at most 150 mm apart. */
export function backScrewCount(geometry: DesignGeometry, units: Units): number {
  const edges = [geometry.outsideHeight, geometry.outsideHeight, geometry.outsideWidth, geometry.outsideWidth];
  for (let column = 1; column < geometry.columns.length; column++) edges.push(geometry.outsideHeight);
  for (let line = 1; line < geometry.rows.length; line++) edges.push(...geometry.columns);
  return edges.reduce((sum, edge) => sum + edgeScrews(convertLength(edge, units, "mm")), 0);
}

export interface Rails {
  long: number;
  short: number;
}

/** As many 70 cm rails as fit the width, then a 35 cm rail for a remaining 350 mm module. */
export function railsFor(outsideWidthMm: number): Rails {
  const long = Math.floor((outsideWidthMm + EKET_TOLERANCE_MM) / (2 * EKET.module.mm));
  const rest = outsideWidthMm - long * 2 * EKET.module.mm;
  const short = rest >= EKET.module.mm - EKET_TOLERANCE_MM || long === 0 ? 1 : 0;
  return { long, short };
}

export type HardwareItem = "pocket-screws" | "back-screws" | "eket-legs" | "eket-feet" | "eket-rail-70" | "eket-rail-35" | "anti-tip" | "wall-fixings" | "glue";

export interface HardwareChoice {
  name: string;
  article: string;
  source: string;
}

export interface HardwareLine {
  item: HardwareItem;
  name: string;
  article?: string;
  /** The items to choose from, such as the finishes of the legs. */
  choices?: HardwareChoice[];
  /** Null when the amount depends on the work or the wall. */
  quantity: number | null;
  unit: "each" | "pack";
  /** Null for a line for the whole project. */
  design: string | null;
  source?: string;
}

/** The hardware for the designs that can make parts. A design with an error or an unknown system gets no lines. */
export function hardwareList(project: Project): HardwareLine[] {
  const units = project.project.units;
  const mm = (value: number) => convertLength(value, units, "mm");
  const materials = materialsById(project);
  const lines: HardwareLine[] = [];
  for (const design of project.designs ?? []) {
    if (designParts(project, design) === null) continue;
    const geometry = designGeometry(design, materials)!;
    const quantity = design.quantity ?? DEFAULT_DESIGN_QUANTITY;
    const add = (line: Omit<HardwareLine, "design">) => lines.push({ ...line, design: design.id });

    const pieces = geometry.columns.length * (geometry.rows.length + 1);
    const holes = pieces * 2 * pocketHolesPerEnd(mm(geometry.panelDepth)) * quantity;
    const screw = pocketScrew(mm(geometry.thickness));
    add({
      item: "pocket-screws",
      name: screw ? `Pocket screws, coarse thread, ${screw.screw}` : "Pocket screws, coarse thread (the chart has no length for this stock)",
      quantity: Math.ceil((holes * 11) / 10),
      unit: "each",
      source: POCKET_SCREW_SOURCE,
    });
    if (design.back) add({ item: "back-screws", name: backScrewName(mm(geometry.backThickness)), quantity: backScrewCount(geometry, units) * quantity, unit: "each" });

    const mount = design.mount ?? DEFAULT_DESIGN_MOUNT;
    if (!isDesignMount(mount)) continue;
    if (mount === "legs") add({ item: "eket-legs", name: "EKET legs, 4-pack", choices: IKEA_LEGS.map(({ name, article, source }) => ({ name, article, source })), quantity, unit: "pack" });
    if (mount === "feet") add({ item: "eket-feet", name: IKEA_FEET.name, article: IKEA_FEET.article, quantity, unit: "pack", source: IKEA_FEET.source });
    if (mount === "wall-rail") {
      const rails = railsFor(mm(geometry.outsideWidth));
      if (rails.long > 0) add({ item: "eket-rail-70", name: IKEA_RAIL_70.name, article: IKEA_RAIL_70.article, quantity: rails.long * quantity, unit: "each", source: IKEA_RAIL_70.source });
      if (rails.short > 0) add({ item: "eket-rail-35", name: IKEA_RAIL_35.name, article: IKEA_RAIL_35.article, quantity: rails.short * quantity, unit: "each", source: IKEA_RAIL_35.source });
    } else {
      add({ item: "anti-tip", name: "Anti-tip wall fitting (a strap or a bracket)", quantity, unit: "each" });
    }
    add({ item: "wall-fixings", name: "Wall screws and plugs for your wall type", quantity: null, unit: "each" });
  }
  if (lines.length > 0) lines.push({ item: "glue", name: "Wood glue (PVA)", quantity: null, unit: "each", design: null });
  return lines;
}
```

In `packages/core/src/index.ts`, after `export * from "./design/edit.ts";`, add:

```ts
export * from "./design/ikea.ts";
export * from "./design/hardware.ts";
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npm test -w @opencutplan/core -- design/hardware`
Expected: PASS (8 tests).

- [ ] **Step 6: Update the spec chart**

Apply this change to `docs/superpowers/specs/2026-09-29-cabinet-generator-design.md`:

```diff
--- a/docs/superpowers/specs/2026-09-29-cabinet-generator-design.md
+++ b/docs/superpowers/specs/2026-09-29-cabinet-generator-design.md
@@ -265,14 +265,15 @@ a `hardware` section, and it has no prices in v1.
 - **Pocket screws**, coarse thread, from a chart in core:
 
-  | Thickness | Screw |
-  |---|---|
-  | 11.9 mm (15/32") to < 17.5 mm (11/16") | 1" (25 mm) |
-  | 17.5 mm to < 20.6 mm (13/16") | 1 1/4" (32 mm) |
-  | 20.6 mm to ≤ 25.4 mm (1") | 1 1/2" (38 mm) |
-  | > 25.4 mm to < 34.9 mm (1 3/8") | 2" (50 mm) |
-  | 34.9 mm to 38.1 mm (1 1/2") | 2 1/2" (64 mm) |
-
-  The chart follows common pocket-hole practice. Phase 2 checks it against a jig maker's published chart before it
-  ships. The count is the number of holes plus 10 %, rounded up.
+  | Thickness | Jig setting | Screw |
+  |---|---|---|
+  | 11.9 mm (15/32") to < 17.5 mm (11/16") | 1/2" or 5/8" | 1" (25 mm) |
+  | 17.5 mm to < 20.6 mm (13/16") | 3/4" | 1 1/4" (32 mm) |
+  | 20.6 mm to < 30.2 mm (1 3/16") | 7/8", 1", or 1 1/8" | 1 1/2" (38 mm) |
+  | 30.2 mm to < 36.5 mm (1 7/16") | 1 1/4" or 1 3/8" | 2" (50 mm) |
+  | 36.5 mm to 38.1 mm (1 1/2") | 1 1/2" | 2 1/2" (64 mm) |
+
+  The jig setting is the thickness rounded to the nearest 1/8". The screw for each setting is from the Kreg K4 and K5
+  manual (`POCKET_SCREW_SOURCE` in `design/hardware.ts`), checked in phase 2. The count is the number of holes plus
+  10 %, rounded up.
 - **Back screws**: #6 × 3/4" (4 × 20 mm) flat head, for backs up to 7 mm thick. There is one screw every 150 mm, at
   most, along the perimeter and along each interior panel edge, starting 25 mm from the ends. A thicker back gets
```

- [ ] **Step 7: Run the full check and commit**

Run: `npm run check`
Expected: exit 0.

```bash
git add packages/core docs/superpowers/specs/2026-09-29-cabinet-generator-design.md
git commit -m "Add the IKEA table and the hardware list, with the Kreg pocket-screw chart" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Assembly steps

**Files:**
- Create: `packages/core/src/design/assembly.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/design/assembly.test.ts`

**Interfaces:**
- Consumes: `designParts`, `designGeometry`, `materialsById`, `roundLength`, `formatLength`, `convertLength`; from Task 2: `pocketScrew`, `pocketHolesPerEnd`, `backScrewCount`, `backScrewName`, `railsFor`, `IKEA_LEGS`, `IKEA_FEET`, `IKEA_RAIL_70`, `IKEA_RAIL_35`, `RAIL_CLEARANCE_MM`.
- Produces: `interface AssemblyStep { title: string; body: string }`, `assemblySteps(project, designId): AssemblyStep[] | null` (null for a missing design, or a design that makes no parts). The titles, in order: `Drill the pocket holes`, `Mark the shelf positions`, `Cut spacers`, `Assemble column <i> of <n>` (one for each column), `Check that it is square`, `Fit the back` (with a back), then `Fit the legs` + `Anchor the unit`, `Fit the feet` + `Anchor the unit`, `Hang the unit` (wall-rail), or `Anchor the unit` (floor). A design with an unknown mount ends after the back.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/design/assembly.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assemblySteps, convertProjectUnits, regenerateDesigns } from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";

const project = regenerateDesigns(designProject([kallaxDesign(), eketDesign(), kallaxDesign({ id: "c", name: "Mixed", system: "custom", width: { openings: [335, 400, 335] }, height: { openings: [300, 335] } })]));

describe("assemblySteps", () => {
  it("gives the KALLAX 2x4 steps in order", () => {
    const steps = assemblySteps(project, "kx")!;
    expect(steps.map((step) => step.title)).toEqual([
      "Drill the pocket holes",
      "Mark the shelf positions",
      "Cut spacers",
      "Assemble column 1 of 2",
      "Assemble column 2 of 2",
      "Check that it is square",
      "Anchor the unit",
    ]);
    expect(steps[0]!.body).toBe('Drill 3 pocket holes in each end of all 10 shelves, on the underside, for 18 mm stock. Set the jig and the drill collar to the 3/4" mark.');
    expect(steps[1]!.body).toBe("Mark the underside of each shelf on the vertical panels at 0 mm, 353 mm, 706 mm, 1059 mm and 1412 mm from the bottom end.");
    expect(steps[2]!.body).toBe("Cut 2 spacers to 335 mm from an offcut. They hold each shelf on its mark while you drive the screws.");
    expect(steps[3]!.body).toContain("Put the 5 shelves of this column (335 mm long)");
    expect(steps[3]!.body).toContain('1 1/4" (32 mm) coarse-thread pocket screws');
    expect(steps[4]!.body).toMatch(/^Use the right panel of column 1 as the left panel\./);
    expect(steps[5]!.body).toContain("Both must be 1603 mm.");
  });

  it("says how many to build, fits the back, and hangs an EKET on the rail", () => {
    const steps = assemblySteps(project, "ek")!;
    expect(steps[0]!.body).toMatch(/^Build 2 of these\. The numbers in these steps are for one unit\. Drill 3 pocket holes in each end of all 4 shelves/);
    expect(steps.map((step) => step.title).slice(-3)).toEqual(["Check that it is square", "Fit the back", "Hang the unit"]);
    expect(steps.at(-3)!.body).toContain("Both must be 782.5 mm.");
    expect(steps.at(-2)!.body).toBe('Glue the back to the rear edges, then screw it on with 21 #6 × 3/4" (4 × 20 mm) flat head wood screws: 25 mm from the ends of each edge, and at most 150 mm apart.');
    expect(steps.at(-1)!.body).toContain("(1 × EKET suspension rail, 70 cm)");
    expect(steps.at(-1)!.body).toContain("AA-1912543-9");
    expect(steps.at(-1)!.body).toContain("Leave at least 50 mm free above the unit.");
  });

  it("gives one spacer pair for each row opening, and one step for each column", () => {
    const steps = assemblySteps(project, "c")!;
    expect(steps[1]!.body).toContain("at 0 mm, 353 mm and 671 mm from the bottom end");
    expect(steps[2]!.body).toBe("Cut 2 spacers to 300 mm and 2 spacers to 335 mm from an offcut. They hold each shelf on its mark while you drive the screws.");
    expect(steps.filter((step) => step.title.startsWith("Assemble")).map((step) => step.body.match(/\((.+) long\)/)![1])).toEqual(["335 mm", "400 mm", "335 mm"]);
  });

  it("fits the legs with their guides, then anchors the unit", () => {
    const legs = regenerateDesigns(designProject([eketDesign({ mount: "legs", quantity: 1, back: undefined })]));
    const steps = assemblySteps(legs, "ek")!;
    expect(steps.map((step) => step.title).slice(-2)).toEqual(["Fit the legs", "Anchor the unit"]);
    expect(steps.at(-2)!.body).toContain("AA-2425733-1 (EKET legs, black, 4-pack) and AA-2196566-3 (EKET legs, wood, 4-pack)");
    expect(steps[0]!.body).not.toContain("Build");
  });

  it("gives the lengths in the project units", () => {
    const steps = assemblySteps(convertProjectUnits(project, "in"), "ek")!;
    expect(steps[0]!.body).toContain('for 23/32" stock');
    expect(steps[1]!.body).toBe('Mark the underside of each shelf on the vertical panels at 0" and 13 1/16" from the bottom end.');
    expect(steps[5]!.body).toContain('Both must be 30 13/16".');
  });

  it("gives null for a missing design or a design with an error", () => {
    expect(assemblySteps(project, "nope")).toBeNull();
    expect(assemblySteps(designProject([kallaxDesign({ material: "missing" })]), "kx")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -w @opencutplan/core -- design/assembly`
Expected: FAIL. `assemblySteps` is not exported.

- [ ] **Step 3: Implement**

Create `packages/core/src/design/assembly.ts`:

```ts
import { formatLength } from "../geometry/format.ts";
import { convertLength } from "../geometry/units.ts";
import type { Project } from "../format/schema.ts";
import { designParts } from "./generate.ts";
import { designGeometry, materialsById, roundLength } from "./geometry.ts";
import { backScrewCount, backScrewName, pocketHolesPerEnd, pocketScrew, railsFor } from "./hardware.ts";
import { IKEA_FEET, IKEA_LEGS, IKEA_RAIL_35, IKEA_RAIL_70, RAIL_CLEARANCE_MM } from "./ikea.ts";
import { DEFAULT_DESIGN_MOUNT, DEFAULT_DESIGN_QUANTITY, isDesignMount } from "./systems.ts";

export interface AssemblyStep {
  title: string;
  body: string;
}

function joinList(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** The steps to build one unit of a design, or null when the design does not exist or cannot make parts. */
export function assemblySteps(project: Project, designId: string): AssemblyStep[] | null {
  const design = project.designs?.find((candidate) => candidate.id === designId);
  if (!design || designParts(project, design) === null) return null;
  const geometry = designGeometry(design, materialsById(project))!;
  const units = project.project.units;
  const show = (value: number) => formatLength(value, units, project.settings.display);
  const mm = (value: number) => convertLength(value, units, "mm");
  const fromMm = (value: number) => convertLength(value, "mm", units);
  const quantity = design.quantity ?? DEFAULT_DESIGN_QUANTITY;
  const mount = design.mount ?? DEFAULT_DESIGN_MOUNT;
  const { thickness, columns, rows } = geometry;
  const lines = rows.length + 1;
  const pieces = columns.length * lines;
  const screw = pocketScrew(mm(thickness));
  const screws = screw ? `${screw.screw} coarse-thread pocket screws` : "pocket screws (the chart has no length for this stock)";
  const steps: AssemblyStep[] = [];

  const setting = screw ? ` Set the jig and the drill collar to the ${formatLength(screw.setting, "in", { inch: 8, mm: 1 })} mark.` : "";
  steps.push({
    title: "Drill the pocket holes",
    body: `${quantity > 1 ? `Build ${quantity} of these. The numbers in these steps are for one unit. ` : ""}Drill ${pocketHolesPerEnd(mm(geometry.panelDepth))} pocket holes in each end of ${pieces === 1 ? "the shelf" : `all ${pieces} shelves`}, on the underside, for ${show(thickness)} stock.${setting}`,
  });

  const marks = [0];
  for (let row = rows.length - 1; row >= 0; row--) marks.push(roundLength(marks.at(-1)! + thickness + rows[row]!));
  steps.push({ title: "Mark the shelf positions", body: `Mark the underside of each shelf on the vertical panels at ${joinList(marks.map(show))} from the bottom end.` });

  const spacers = [...new Set(rows)].map((opening) => `2 spacers to ${show(opening)}`);
  steps.push({ title: "Cut spacers", body: `Cut ${joinList(spacers)} from an offcut. They hold each shelf on its mark while you drive the screws.` });

  columns.forEach((opening, index) => {
    const start = index === 0 ? "Lay the first vertical panel on its side, with the marks up." : `Use the right panel of column ${index} as the left panel.`;
    steps.push({
      title: `Assemble column ${index + 1} of ${columns.length}`,
      body: `${start} Put the ${lines} shelves of this column (${show(opening)} long) on their marks, with the pocket holes down, and screw them to the panel with ${screws}. Then put the next vertical panel on the other ends of the shelves, and screw it on.`,
    });
  });

  const diagonal = roundLength(Math.hypot(geometry.outsideWidth, geometry.outsideHeight));
  steps.push({ title: "Check that it is square", body: `Measure the two diagonals of the front. Both must be ${show(diagonal)}. If they are not the same, push the long diagonal in until they are.` });

  if (design.back) {
    steps.push({
      title: "Fit the back",
      body: `Glue the back to the rear edges, then screw it on with ${backScrewCount(geometry, units)} ${backScrewName(mm(geometry.backThickness))}: ${show(fromMm(25))} from the ends of each edge, and at most ${show(fromMm(150))} apart.`,
    });
  }

  if (!isDesignMount(mount)) return steps;
  if (mount === "legs") {
    const guides = IKEA_LEGS.filter((legs) => legs.guide !== undefined).map((legs) => `${legs.guide} (${legs.name})`);
    steps.push({ title: "Fit the legs", body: `Screw the 4 EKET legs to the bottom panel, as the IKEA assembly guide of your legs shows: ${joinList(guides)}.` });
  }
  if (mount === "feet") steps.push({ title: "Fit the feet", body: `Screw the 4 EKET adjustable feet to the bottom panel, as IKEA assembly guide ${IKEA_FEET.guide} shows.` });
  if (mount === "wall-rail") {
    const rails = railsFor(mm(geometry.outsideWidth));
    const names = [...(rails.long > 0 ? [`${rails.long} × ${IKEA_RAIL_70.name}`] : []), ...(rails.short > 0 ? [`${rails.short} × ${IKEA_RAIL_35.name}`] : [])];
    steps.push({
      title: "Hang the unit",
      body: `Screw the rails (${joinList(names)}) to the wall with screws and plugs for your wall type, and hang the unit on them at its top back edge, as IKEA assembly guide ${IKEA_RAIL_70.guide} shows. Leave at least ${show(fromMm(RAIL_CLEARANCE_MM))} free above the unit.`,
    });
  } else {
    steps.push({ title: "Anchor the unit", body: "Fix the unit to the wall with the anti-tip fitting, as IKEA says to do for KALLAX and EKET units. Use screws and plugs for your wall type." });
  }
  return steps;
}
```

In `packages/core/src/index.ts`, after `export * from "./design/hardware.ts";`, add:

```ts
export * from "./design/assembly.ts";
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -w @opencutplan/core -- design/assembly`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full check and commit**

Run: `npm run check`
Expected: exit 0.

```bash
git add packages/core
git commit -m "Add the assembly steps of a design" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The front-view drawing

**Files:**
- Create: `packages/core/src/reports/elevation.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/reports/elevation.test.ts`

**Interfaces:**
- Consumes: `designParts`, `designGeometry`, `materialsById`, `roundLength`, `DEFAULT_DESIGN_MOUNT`, `formatLength`, `convertLength`; `groupColors`, `NO_GROUP_COLOR` from `reports/colors.ts`; `escapeXml` from `reports/svg.ts`; `railsFor` from Task 2.
- Produces: `designElevationSvg(project, designId): string | null` — one unit, to scale in project units. The root `<svg>` has a `viewBox` with a margin of 4 × (the larger outside size / 40) on each side, and `width`/`height` with the unit suffix. Each panel is a `<rect data-panel="vertical|horizontal">`; each opening has a `<text>` with its size; a mount is `<rect data-mount="legs|feet|wall-rail">`. The fill is the colour of the design group (`groupColors`). Null for a missing design, or a design that makes no parts.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/reports/elevation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { convertProjectUnits, designElevationSvg, regenerateDesigns } from "../../src/index.ts";
import { designProject, eketDesign, kallaxDesign } from "../helpers.ts";

const project = regenerateDesigns(designProject([kallaxDesign(), eketDesign(), eketDesign({ id: "l", name: "Legs", mount: "legs", back: undefined })]));
const count = (svg: string, pattern: RegExp) => svg.match(pattern)?.length ?? 0;

describe("designElevationSvg", () => {
  it("draws every panel to scale, with the opening sizes and the outside size", () => {
    const svg = designElevationSvg(project, "kx")!;
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="-143 -143 1010 1716" width="1010mm" height="1716mm"/);
    expect(svg).toContain("<title>Hall KALLAX: 724 mm × 1430 mm × 390 mm</title>");
    expect(count(svg, /data-panel="vertical"/g)).toBe(3);
    expect(count(svg, /data-panel="horizontal"/g)).toBe(10);
    expect(svg).toContain('<rect data-panel="vertical" x="353" y="0" width="18" height="1430"');
    expect(svg).toContain('<rect data-panel="horizontal" x="18" y="353" width="335" height="18"');
    expect(count(svg, />335 mm × 335 mm</g)).toBe(8);
    expect(svg).toContain(">724 mm</text>");
    expect(svg).toContain(">1430 mm</text>");
    expect(svg).toContain(">Depth 390 mm</text>");
  });

  it("fills the panels with the colour of the design group", () => {
    expect(designElevationSvg(project, "kx")).toContain('fill="#9cc3e6"');
    expect(designElevationSvg(project, "ek")).toContain('fill="#f2c27b"');
  });

  it("draws the rail behind an EKET on the wall, and the legs under a unit on legs", () => {
    expect(designElevationSvg(project, "ek")).toContain('<rect data-mount="wall-rail" x="35" y="18" width="630" height="40"');
    const legs = designElevationSvg(project, "l")!;
    expect(count(legs, /data-mount="legs"/g)).toBe(2);
    expect(legs).toContain('<rect data-mount="legs" x="18" y="350" width="30" height="100"');
    expect(designElevationSvg(project, "kx")).not.toContain("data-mount");
  });

  it("uses the project units and the display precision", () => {
    const svg = designElevationSvg(convertProjectUnits(project, "in"), "kx")!;
    expect(svg).toContain('width="39.764in"');
    expect(svg).toContain(">13 3/16&quot; × 13 3/16&quot;</text>");
  });

  it("gives null for a missing design or a design with an error", () => {
    expect(designElevationSvg(project, "nope")).toBeNull();
    expect(designElevationSvg(designProject([kallaxDesign({ material: "missing" })]), "kx")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -w @opencutplan/core -- reports/elevation`
Expected: FAIL. `designElevationSvg` is not exported.

- [ ] **Step 3: Implement**

Create `packages/core/src/reports/elevation.ts`:

```ts
import { convertLength } from "../geometry/units.ts";
import { formatLength } from "../geometry/format.ts";
import type { Project } from "../format/schema.ts";
import { designParts } from "../design/generate.ts";
import { designGeometry, materialsById, roundLength } from "../design/geometry.ts";
import { railsFor } from "../design/hardware.ts";
import { DEFAULT_DESIGN_MOUNT } from "../design/systems.ts";
import { groupColors, NO_GROUP_COLOR } from "./colors.ts";
import { escapeXml } from "./svg.ts";

const LEG_HEIGHT_MM = 100;
const LEG_DIAMETER_MM = 30;
const FOOT_HEIGHT_MM = 24;
const RAIL_HEIGHT_MM = 40;
const RAIL_LENGTH_MM = { long: 630, short: 295 };

function num(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/** A front view of one unit of a design, to scale in project units, or null when the design does not exist or cannot make parts. */
export function designElevationSvg(project: Project, designId: string): string | null {
  const design = project.designs?.find((candidate) => candidate.id === designId);
  if (!design || designParts(project, design) === null) return null;
  const geometry = designGeometry(design, materialsById(project))!;
  const units = project.project.units;
  const show = (value: number) => formatLength(value, units, project.settings.display);
  const fromMm = (value: number) => convertLength(value, "mm", units);
  const mount = design.mount ?? DEFAULT_DESIGN_MOUNT;
  const { thickness: t, columns, rows, outsideWidth: width, outsideHeight: height } = geometry;
  const unit = Math.max(width, height) / 40;
  const below = mount === "legs" ? fromMm(LEG_HEIGHT_MM) : mount === "feet" ? fromMm(FOOT_HEIGHT_MM) : 0;
  const margin = unit * 4;
  const fill = groupColors(project).get(design.name) ?? NO_GROUP_COLOR;
  const stroke = `stroke="#333" stroke-width="${num(unit * 0.08)}"`;
  const font = (scale: number) => `font-size="${num(unit * scale)}"`;
  const viewWidth = width + 2 * margin;
  const viewHeight = height + below + 2 * margin;
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(-margin)} ${num(-margin)} ${num(viewWidth)} ${num(viewHeight)}" width="${num(viewWidth)}${units}" height="${num(viewHeight)}${units}" font-family="Helvetica, Arial, sans-serif">`,
    `<title>${escapeXml(`${design.name}: ${show(width)} × ${show(height)} × ${show(geometry.depth)}`)}</title>`,
    `<g data-design="${escapeXml(design.id)}">`,
  ];
  const panel = (kind: string, x: number, y: number, w: number, h: number) =>
    out.push(`<rect data-panel="${kind}" x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" fill="${escapeXml(fill)}" ${stroke}/>`);

  let x = 0;
  for (let column = 0; column <= columns.length; column++) {
    panel("vertical", x, 0, t, height);
    if (column === columns.length) break;
    const opening = columns[column]!;
    let y = 0;
    for (let row = 0; row <= rows.length; row++) {
      panel("horizontal", x + t, y, opening, t);
      if (row === rows.length) break;
      const cell = rows[row]!;
      const size = `${show(opening)} × ${show(cell)}`;
      const scale = Math.min(0.9, opening / (0.62 * size.length + 1) / unit);
      out.push(`<text x="${num(x + t + opening / 2)}" y="${num(y + t + cell / 2)}" ${font(scale)} text-anchor="middle" dominant-baseline="middle" fill="#555">${escapeXml(size)}</text>`);
      y = roundLength(y + t + cell);
    }
    x = roundLength(x + t + opening);
  }

  if (mount === "legs" || mount === "feet") {
    const foot = mount === "legs" ? fromMm(LEG_DIAMETER_MM) : fromMm(40);
    for (const left of [t, width - t - foot]) {
      out.push(`<rect data-mount="${mount}" x="${num(left)}" y="${num(height)}" width="${num(foot)}" height="${num(below)}" fill="#444"/>`);
    }
  }
  if (mount === "wall-rail") {
    const rails = railsFor(convertLength(width, units, "mm"));
    const lengths = [...Array.from({ length: rails.long }, () => fromMm(RAIL_LENGTH_MM.long)), ...Array.from({ length: rails.short }, () => fromMm(RAIL_LENGTH_MM.short))];
    const pitch = width / lengths.length;
    lengths.forEach((length, index) => {
      out.push(
        `<rect data-mount="wall-rail" x="${num(index * pitch + (pitch - length) / 2)}" y="${num(t)}" width="${num(length)}" height="${num(fromMm(RAIL_HEIGHT_MM))}" fill="none" stroke="#333" stroke-width="${num(unit * 0.06)}" stroke-dasharray="${num(unit * 0.4)} ${num(unit * 0.25)}"/>`,
      );
    });
  }
  out.push("</g>");

  const dim = (x1: number, y1: number, x2: number, y2: number, label: string, tx: number, ty: number, rotate: boolean) =>
    out.push(
      `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="#1a5fd0" stroke-width="${num(unit * 0.06)}"/>`,
      `<text x="${num(tx)}" y="${num(ty)}" ${font(1)} text-anchor="middle" dominant-baseline="middle" fill="#1a5fd0"${rotate ? ` transform="rotate(-90 ${num(tx)} ${num(ty)})"` : ""}>${escapeXml(label)}</text>`,
    );
  dim(0, -unit * 1.5, width, -unit * 1.5, show(width), width / 2, -unit * 2.6, false);
  dim(width + unit * 1.5, 0, width + unit * 1.5, height, show(height), width + unit * 2.6, height / 2, true);
  out.push(`<text x="${num(width / 2)}" y="${num(height + below + unit * 2)}" ${font(1)} text-anchor="middle" dominant-baseline="middle" fill="#1a5fd0">${escapeXml(`Depth ${show(geometry.depth)}`)}</text>`);
  out.push("</svg>");
  return out.join("\n");
}
```

In `packages/core/src/index.ts`, after `export * from "./design/assembly.ts";`, add:

```ts
export * from "./reports/elevation.ts";
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -w @opencutplan/core -- reports/elevation`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full check and commit**

Run: `npm run check`
Expected: exit 0.

```bash
git add packages/core
git commit -m "Add the front-view drawing of a design" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The CLI write path

**Files:**
- Modify: `packages/cli/src/project.ts` (`finishMutation`)
- Modify: `packages/cli/src/diff.ts`
- Modify: `packages/cli/src/commands/common.ts`
- Modify: `packages/cli/src/commands/parts.ts`
- Modify: `packages/cli/src/commands/materials.ts`
- Modify: `packages/cli/src/commands/project.ts` (the `validate` help)
- Modify: `packages/cli/test/helpers.ts`
- Test: `packages/cli/test/design-write.test.ts`

**Interfaces:**
- Consumes: `regenerateDesigns` (phase 1); `materialInUse` (Task 1). The examples `examples/kallax-2x4-mm.cutplan.json` (mm, design id `kallax`, parts `kallax-vertical` 1430 × 390 × 3 and `kallax-horizontal` 335 × 390 × 10, no plan) and `examples/eket-wall-in.cutplan.json` (in, design id `eket`, materials `ply-23-32` and `ply-7-32`, parts `eket-vertical`, `eket-horizontal`, `eket-back`, no plan).
- Produces:
  - `finishMutation(invocation, loaded, changed, mutation)` makes the design parts again before all checks.
  - `Changes.designs: CollectionChanges`.
  - `assertNotGenerated(project: Project, part: Part): void` in `commands/common.ts` — throws `CliError(EXIT.failed, "generated-part", …, { id, design })` when `part.design` names an existing design.
  - `usedBy(project, id)` in `materials.ts` gives `{ parts, stock, designs }`.
  - Test helpers: `KALLAX = "kallax.cutplan.json"`, `EKET = "eket.cutplan.json"`, `withDesignExamples(extra?): MemoryIo`, `editFile(io, path, change)`.

- [ ] **Step 1: Add the test helpers**

Apply this change to `packages/cli/test/helpers.ts`:

```diff
--- a/packages/cli/test/helpers.ts
+++ b/packages/cli/test/helpers.ts
@@ -81,2 +81,17 @@ export function withExamples(extra: Record<string, string> = {}, stdin = ""): Me
   return memoryIo({ "shelf.cutplan.json": example(SHELF), "bookcase.cutplan.json": example(BOOKCASE), ...extra }, stdin);
 }
+
+export const KALLAX = "kallax.cutplan.json";
+export const EKET = "eket.cutplan.json";
+
+/** The KALLAX 2x4 example (mm, design id kallax) and the EKET wall example (in, design id eket), with no plan. */
+export function withDesignExamples(extra: Record<string, string> = {}): MemoryIo {
+  return memoryIo({ [KALLAX]: example("kallax-2x4-mm.cutplan.json"), [EKET]: example("eket-wall-in.cutplan.json"), ...extra });
+}
+
+/** Changes one JSON file in the memory io by hand, as a person with a text editor would. */
+export function editFile(io: MemoryIo, path: string, change: (file: Record<string, any>) => void): void {
+  const file = JSON.parse(io.files.get(path)!) as Record<string, any>;
+  change(file);
+  io.files.set(path, `${JSON.stringify(file, null, 2)}\n`);
+}
```

- [ ] **Step 2: Write the failing tests**

Create `packages/cli/test/design-write.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cli, EKET, editFile, KALLAX, withDesignExamples } from "./helpers.ts";

describe("every write makes the design parts again", () => {
  it("fixes a design that was changed by hand on the next write", async () => {
    const io = withDesignExamples();
    editFile(io, KALLAX, (file) => {
      file.designs[0].height = { openings: [335, 335, 335, 335, 335] };
    });
    const stale = await cli(["validate", KALLAX, "--json"], io);
    expect(stale.json().planIssues.map((issue: { code: string }) => issue.code)).toContain("design-stale");
    const added = await cli(["parts", "add", KALLAX, "--name", "Plinth", "--length", "724", "--width", "80", "--json"], io);
    expect(added.code).toBe(0);
    expect(added.json().changes.parts).toEqual({ added: ["plinth"], removed: [], changed: ["kallax-vertical", "kallax-horizontal"], reordered: false });
    const parts = added.file(KALLAX).parts.map((part) => [part.id, part.length, part.quantity]);
    expect(parts).toEqual([
      ["kallax-vertical", 1783, 3],
      ["kallax-horizontal", 335, 12],
      ["plinth", 724, 1],
    ]);
    const fixed = await cli(["validate", KALLAX, "--json"], io);
    expect(fixed.json().planIssues.map((issue: { code: string }) => issue.code)).not.toContain("design-stale");
  });

  it("lists the designs in changes, and converts them with the units", async () => {
    const result = await cli(["settings", "set", KALLAX, "units", "in", "--json"], withDesignExamples());
    expect(result.code).toBe(0);
    expect(result.json().changes.designs).toEqual({ added: [], removed: [], changed: ["kallax"], reordered: false });
    expect(result.stdout).not.toContain("design-stale");
    const text = await cli(["settings", "set", KALLAX, "units", "in"], withDesignExamples());
    expect(text.stdout).toContain("Changed design: kallax.");
    expect(result.file(KALLAX).parts.map((part) => part.quantity)).toEqual([3, 10]);
  });

  it("keeps every placed copy when the units change", async () => {
    const io = withDesignExamples();
    await cli(["optimize", KALLAX, "--iterations", "50", "--seed", "1"], io);
    const result = await cli(["settings", "set", KALLAX, "units", "in", "--json"], io);
    expect(result.json().changes.plan).toMatchObject({ placementsBefore: 13, placementsAfter: 13 });
    const back = await cli(["settings", "set", KALLAX, "units", "mm", "--json"], io);
    expect(back.json().changes.plan).toMatchObject({ placementsBefore: 13, placementsAfter: 13 });
  });
});

describe("generated parts", () => {
  it("refuses parts set and parts remove with exit 1, and writes nothing", async () => {
    const io = withDesignExamples();
    const before = io.files.get(KALLAX);
    const set = await cli(["parts", "set", KALLAX, "kallax-vertical", "--quantity", "1", "--json"], io);
    expect(set.code).toBe(1);
    expect(set.json().error).toMatchObject({ code: "generated-part", id: "kallax-vertical", design: "kallax" });
    expect(set.json().error.message).toContain("design detach");
    const remove = await cli(["parts", "remove", KALLAX, "kallax-horizontal", "--json"], io);
    expect(remove.code).toBe(1);
    expect(remove.json().error).toMatchObject({ code: "generated-part", id: "kallax-horizontal", design: "kallax" });
    expect(io.files.get(KALLAX)).toBe(before);
    expect(io.writes).toEqual([]);
  });

  it("lets you change a part whose design is missing", async () => {
    const io = withDesignExamples();
    editFile(io, KALLAX, (file) => {
      delete file.designs;
    });
    const set = await cli(["parts", "set", KALLAX, "kallax-vertical", "--quantity", "2", "--json"], io);
    expect(set.code).toBe(0);
    expect(set.json().part).toMatchObject({ id: "kallax-vertical", quantity: 2, design: "kallax" });
  });
});

describe("materials that designs use", () => {
  it("counts the designs, and refuses to remove the back material of a design", async () => {
    const io = withDesignExamples();
    const list = await cli(["materials", "list", EKET, "--json"], io);
    expect(list.json().materials.map((m: { id: string; usedBy: unknown }) => [m.id, m.usedBy])).toEqual([
      ["ply-23-32", { parts: 2, stock: 1, designs: 1 }],
      ["ply-7-32", { parts: 1, stock: 1, designs: 1 }],
    ]);
    expect((await cli(["materials", "get", EKET, "ply-7-32", "--json"], io)).json().usedBy).toEqual({ parts: ["eket-back"], stock: ["ply-7-32-4x8"], designs: ["eket"] });
    editFile(io, EKET, (file) => {
      file.parts = [];
      file.stock = file.stock.filter((stock: { material: string }) => stock.material !== "ply-7-32");
    });
    const refused = await cli(["materials", "remove", EKET, "ply-7-32", "--json"], io);
    expect(refused.code).toBe(1);
    expect(refused.json().error).toMatchObject({ code: "in-use", id: "ply-7-32", parts: [], stock: [], designs: ["eket"] });
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npm test -w @opencutplan/cli -- design-write`
Expected: FAIL. The stale design is not fixed, `changes.designs` is undefined, `parts set` changes a generated part with exit 0, and `usedBy` has no `designs`. The unit test passes already or fails on `changes.designs`; both are fine.

- [ ] **Step 4: Make the parts again on every write, and diff the designs**

Apply these changes to `packages/cli/src/project.ts` and `packages/cli/src/diff.ts`:

```diff
--- a/packages/cli/src/project.ts
+++ b/packages/cli/src/project.ts
@@ -1,3 +1,3 @@
-import { analyzeProject, errorMessage, formatPath, parseProject, serializeProject, withCuts, type Issue, type PlanIssue, type Project } from "@opencutplan/core";
+import { analyzeProject, errorMessage, formatPath, parseProject, regenerateDesigns, serializeProject, withCuts, type Issue, type PlanIssue, type Project } from "@opencutplan/core";
 import { describeChanges, diffProjects, type Changes } from "./diff.ts";
 import type { Io } from "./io.ts";
@@ -93,9 +93,11 @@ function target(invocation: Invocation, loaded: Loaded): string {
 
 /**
- * Checks the changed project, then writes it (or not, with --dry-run or a failed --strict). The file is refused when
- * core cannot read the result back, so the CLI never writes a file that the app would not open.
+ * Makes the parts of every design again, checks the changed project, then writes it (or not, with --dry-run or a failed
+ * --strict). The file is refused when core cannot read the result back, so the CLI never writes a file that the app
+ * would not open.
  */
-export async function finishMutation(invocation: Invocation, loaded: Loaded, next: Project, mutation: Mutation): Promise<Outcome> {
+export async function finishMutation(invocation: Invocation, loaded: Loaded, changed: Project, mutation: Mutation): Promise<Outcome> {
   const { io, options } = invocation;
+  const next = regenerateDesigns(changed);
   const output = loaded.hadCuts ? withCuts(next) : next;
   const text = serializeProject(output);
```

```diff
--- a/packages/cli/src/diff.ts
+++ b/packages/cli/src/diff.ts
@@ -25,4 +25,5 @@ export interface Changes {
   parts: CollectionChanges;
   tools: CollectionChanges;
+  designs: CollectionChanges;
   settings: string[];
   plan: PlanChanges;
@@ -87,4 +88,5 @@ export function diffProjects(before: Project, after: Project): Changes {
     parts: collection(before.parts, after.parts),
     tools: collection(before.tools, after.tools),
+    designs: collection(before.designs ?? [], after.designs ?? []),
     settings: changedKeys(before.settings, after.settings),
     plan: {
@@ -105,4 +107,5 @@ export function diffProjects(before: Project, after: Project): Changes {
     !isEmpty(changes.parts) ||
     !isEmpty(changes.tools) ||
+    !isEmpty(changes.designs) ||
     !isEmpty(sheets) ||
     (before.plan === undefined) !== (after.plan === undefined);
@@ -113,6 +116,6 @@ export function describeChanges(changes: Changes): string[] {
   if (!changes.changed) return ["No changes."];
   const lines: string[] = [];
-  const noun = { materials: "material", stock: "stock", parts: "part", tools: "tool" } as const;
-  for (const key of ["materials", "stock", "parts", "tools"] as const) {
+  const noun = { materials: "material", stock: "stock", parts: "part", tools: "tool", designs: "design" } as const;
+  for (const key of ["materials", "stock", "designs", "parts", "tools"] as const) {
     const c = changes[key];
     if (c.added.length > 0) lines.push(`Added ${noun[key]}: ${c.added.join(", ")}.`);
```

- [ ] **Step 5: Refuse generated parts**

Apply these changes to `packages/cli/src/commands/common.ts` and `packages/cli/src/commands/parts.ts`:

```diff
--- a/packages/cli/src/commands/common.ts
+++ b/packages/cli/src/commands/common.ts
@@ -1,4 +1,4 @@
-import { slugify, uniqueId, type Material, type Project } from "@opencutplan/core";
-import { usageError, type OptionSpec, type OptionValues } from "../spec.ts";
+import { slugify, uniqueId, type Material, type Part, type Project } from "@opencutplan/core";
+import { CliError, EXIT, usageError, type OptionSpec, type OptionValues } from "../spec.ts";
 import { list } from "../values.ts";
 
@@ -76,2 +76,13 @@ export function assertNoConflict(options: OptionValues, fields: readonly string[
   }
 }
+
+/** Refuses a change to a part that a design makes. A part whose design is missing is a normal part. */
+export function assertNotGenerated(project: Project, part: Part): void {
+  if (part.design === undefined || !(project.designs ?? []).some((design) => design.id === part.design)) return;
+  throw new CliError(
+    EXIT.failed,
+    "generated-part",
+    `The design ${part.design} makes the part ${part.id}. Change the design with 'opencutplan design set', or run 'opencutplan design detach' to make its parts normal parts.`,
+    { id: part.id, design: part.design },
+  );
+}
```

```diff
--- a/packages/cli/src/commands/parts.ts
+++ b/packages/cli/src/commands/parts.ts
@@ -5,5 +5,5 @@ import { type CommandSpec, type GroupSpec, type OptionValues } from "../spec.ts"
 import { len, size, table } from "../text.ts";
 import { integerValue, optionalChoice, optionalLength, str } from "../values.ts";
-import { assertNoConflict, findAll, findById, ID_OPTION, materialFor, newId, nonEmpty, resolveMaterial, unsetFields, unsetOption } from "./common.ts";
+import { assertNoConflict, assertNotGenerated, findAll, findById, ID_OPTION, materialFor, newId, nonEmpty, resolveMaterial, unsetFields, unsetOption } from "./common.ts";
 import { CSV_ARGS, EXPORT_OUT, exportCsv, importCsv, importOptions } from "./csv.ts";
 
@@ -141,5 +141,5 @@ const set: CommandSpec = {
   summary: "Change a part.",
   description:
-    "Change the fields of a part. Only the fields you give change. The id does not change. A lower quantity takes the extra copies off the sheets, as the app does; removedPlacements lists them.",
+    "Change the fields of a part. Only the fields you give change. The id does not change. A lower quantity takes the extra copies off the sheets, as the app does; removedPlacements lists them. A part that a design makes cannot change (exit 1, generated-part); change the design instead.",
   args: [FILE_ARG, { name: "id", description: "The part id." }],
   options: [OPTIONS.name, OPTIONS.length, OPTIONS.width, OPTIONS.quantity, OPTIONS.material, OPTIONS.grain, OPTIONS.group, OPTIONS.notes, unsetOption(["group", "notes"]), ...OUTPUT_OPTIONS],
@@ -148,5 +148,5 @@ const set: CommandSpec = {
     { command: `${PROGRAM} parts set shelf.cutplan.json side --unset group --dry-run`, description: "See what removing the group changes." },
   ],
-  output: "part (after the change), removedPlacements [{ part, copy }], changes, validation, written, dryRun.",
+  output: "part (after the change), removedPlacements [{ part, copy }], changes, validation, written, dryRun. For a generated part: error { code: \"generated-part\", id, design }.",
   async run(invocation) {
     const { args, options, io } = invocation;
@@ -154,4 +154,5 @@ const set: CommandSpec = {
     const { project } = loaded;
     const old = findById(project.parts, args[1]!, "part");
+    assertNotGenerated(project, old);
     const unset = unsetFields(options, ["group", "notes"] as const);
     assertNoConflict(options, ["group", "notes"], unset);
@@ -172,9 +173,9 @@ const remove: CommandSpec = {
   name: "parts remove",
   summary: "Remove parts and their placements.",
-  description: "Remove one or more parts. Their copies leave the plan. Nothing is removed when any id is unknown.",
+  description: "Remove one or more parts. Their copies leave the plan. Nothing is removed when any id is unknown, or when a design makes any of the parts (exit 1, generated-part).",
   args: [FILE_ARG, { name: "id", description: "A part id.", variadic: true }],
   options: [...OUTPUT_OPTIONS],
   examples: [{ command: `${PROGRAM} parts remove shelf.cutplan.json side shelf-2`, description: "Remove two parts." }],
-  output: "removed (the ids), removedPlacements [{ part, copy }], changes, validation, written, dryRun.",
+  output: "removed (the ids), removedPlacements [{ part, copy }], changes, validation, written, dryRun. For a generated part: error { code: \"generated-part\", id, design }.",
   async run(invocation) {
     const { args, io } = invocation;
@@ -182,4 +183,5 @@ const remove: CommandSpec = {
     const { project } = loaded;
     const parts = findAll(project.parts, args.slice(1), "part");
+    for (const part of parts) assertNotGenerated(project, part);
     const next = parts.reduce((p, part) => removePart(p, part.id), project);
     const removed = parts.map((part) => part.id);
```

- [ ] **Step 6: Count the designs that use a material, and update the validate help**

Apply these changes to `packages/cli/src/commands/materials.ts` and `packages/cli/src/commands/project.ts`:

```diff
--- a/packages/cli/src/commands/materials.ts
+++ b/packages/cli/src/commands/materials.ts
@@ -11,4 +11,5 @@ function usedBy(project: Project, id: string) {
     parts: project.parts.filter((part) => part.material === id).map((part) => part.id),
     stock: project.stock.filter((stock) => stock.material === id).map((stock) => stock.id),
+    designs: (project.designs ?? []).filter((design) => design.material === id || design.back?.material === id).map((design) => design.id),
   };
 }
@@ -16,5 +17,5 @@ function usedBy(project: Project, id: string) {
 function listed(project: Project, material: Material) {
   const users = usedBy(project, material.id);
-  return { ...material, usedBy: { parts: users.parts.length, stock: users.stock.length } };
+  return { ...material, usedBy: { parts: users.parts.length, stock: users.stock.length, designs: users.designs.length } };
 }
 
@@ -33,9 +34,9 @@ const list: CommandSpec = {
   name: "materials list",
   summary: "List the materials.",
-  description: "List the materials with the number of parts and stock items that use each one.",
+  description: "List the materials with the number of parts, stock items, and designs that use each one.",
   args: [FILE_ARG],
   options: [],
   examples: [{ command: `${PROGRAM} materials list shelf.cutplan.json --json`, description: "List the materials as JSON." }],
-  output: "units, materials [{ id, name, thickness, grained, color?, usedBy { parts, stock } }]. usedBy is derived; it is not a file field.",
+  output: "units, materials [{ id, name, thickness, grained, color?, usedBy { parts, stock, designs } }]. usedBy is derived; it is not a file field.",
   async run({ args, io }) {
     const loaded = await loadProject(io, args[0]!);
@@ -43,6 +44,6 @@ const list: CommandSpec = {
     const materials = project.materials.map((material) => listed(project, material));
     const text = table(
-      ["id", "name", "thickness", "grained", "color", "parts", "stock"],
-      materials.map((m) => [m.id, m.name, len(project, m.thickness), String(m.grained), m.color ?? "", String(m.usedBy.parts), String(m.usedBy.stock)]),
+      ["id", "name", "thickness", "grained", "color", "parts", "stock", "designs"],
+      materials.map((m) => [m.id, m.name, len(project, m.thickness), String(m.grained), m.color ?? "", String(m.usedBy.parts), String(m.usedBy.stock), String(m.usedBy.designs)]),
     );
     return { data: { units: project.project.units, materials }, text, warnings: warningLines(loaded) };
@@ -53,9 +54,9 @@ const get: CommandSpec = {
   name: "materials get",
   summary: "Show one material.",
-  description: "Show one material by id, with the ids of the parts and stock that use it.",
+  description: "Show one material by id, with the ids of the parts, stock, and designs that use it.",
   args: [FILE_ARG, { name: "id", description: "The material id." }],
   options: [],
   examples: [{ command: `${PROGRAM} materials get shelf.cutplan.json bb18 --json`, description: "Show the material bb18." }],
-  output: "units, material { id, name, thickness, grained, color? }, usedBy { parts: [ids], stock: [ids] }.",
+  output: "units, material { id, name, thickness, grained, color? }, usedBy { parts: [ids], stock: [ids], designs: [ids] }.",
   async run({ args, io }) {
     const loaded = await loadProject(io, args[0]!);
@@ -63,5 +64,5 @@ const get: CommandSpec = {
     const material = findById(project.materials, args[1]!, "material");
     const users = usedBy(project, material.id);
-    const text = [line(project, material), `Used by parts: ${users.parts.join(", ") || "none"}.`, `Used by stock: ${users.stock.join(", ") || "none"}.`].join("\n");
+    const text = [line(project, material), `Used by parts: ${users.parts.join(", ") || "none"}.`, `Used by stock: ${users.stock.join(", ") || "none"}.`, `Used by designs: ${users.designs.join(", ") || "none"}.`].join("\n");
     return { data: { units: project.project.units, material, usedBy: users }, text, warnings: warningLines(loaded) };
   },
@@ -133,9 +134,9 @@ const remove: CommandSpec = {
   name: "materials remove",
   summary: "Remove materials that no part or stock uses.",
-  description: "Remove one or more materials. A material that a part or a stock item uses cannot be removed (exit 1); change or remove those first. Nothing is removed when any id fails.",
+  description: "Remove one or more materials. A material that a part, a stock item, or a design uses cannot be removed (exit 1); change or remove those first. Nothing is removed when any id fails.",
   args: [FILE_ARG, { name: "id", description: "A material id.", variadic: true }],
   options: [...OUTPUT_OPTIONS],
   examples: [{ command: `${PROGRAM} materials remove shelf.cutplan.json spare-ply`, description: "Remove an unused material." }],
-  output: "removed (the ids), changes, validation, written, dryRun. For a material in use: error { code: \"in-use\", id, parts, stock }.",
+  output: "removed (the ids), changes, validation, written, dryRun. For a material in use: error { code: \"in-use\", id, parts, stock, designs }.",
   async run(invocation) {
     const { args, io } = invocation;
@@ -147,5 +148,5 @@ const remove: CommandSpec = {
       if (materialInUse(project, material.id)) {
         const users = usedBy(project, material.id);
-        throw new CliError(EXIT.failed, "in-use", `The material ${material.id} is in use by ${users.parts.length} parts and ${users.stock.length} stock items.`, {
+        throw new CliError(EXIT.failed, "in-use", `The material ${material.id} is in use by ${users.parts.length} parts, ${users.stock.length} stock items, and ${users.designs.length} designs.`, {
           id: material.id,
           ...users,
```

```diff
--- a/packages/cli/src/commands/project.ts
+++ b/packages/cli/src/commands/project.ts
@@ -113,5 +113,5 @@ export const validateCommand: CommandSpec = {
   summary: "Check the file format and the plan; exit 1 when there is an error.",
   description:
-    "Check the project file. File issues come from the format checks (the JSON, the version, the schema, ids, and references). Plan issues come from the layout validator (off-sheet, overlap, grain, cut order, tools, unplaced copies). The command exits 1 when there is any error, and also for a warning with --strict. A file that the format checks refuse is reported here with exit 1, not 3; exit 3 is only for a file that cannot be read.",
+    "Check the project file. File issues come from the format checks (the JSON, the version, the schema, ids, and references). Plan issues come from the layout validator (off-sheet, overlap, grain, cut order, tools, unplaced copies) and from the design checks. The command exits 1 when there is any error, and also for a warning with --strict. A file that the format checks refuse is reported here with exit 1, not 3; exit 3 is only for a file that cannot be read.",
   args: [FILE_ARG],
   options: [{ name: "strict", type: "boolean", description: "Treat warnings (such as unplaced copies) as errors." }],
@@ -121,5 +121,5 @@ export const validateCommand: CommandSpec = {
   ],
   output:
-    "valid, errors, warnings (counts over both lists), fileIssues [{ severity, code, message, path }], planIssues [{ severity, code, message, refs }]. refs point at sheets, placements (sheet id and index), part copies, stock, or cut steps.",
+    "valid, errors, warnings (counts over both lists), fileIssues [{ severity, code, message, path }], planIssues [{ severity, code, message, refs }]. refs point at sheets, placements (sheet id and index), part copies, stock, cut steps, or designs.",
   async run({ args, options, io }) {
     const source = args[0]!;
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `npm test -w @opencutplan/cli`
Expected: PASS. The 6 new tests pass, and the current CLI tests still pass (`materials list` uses `toMatchObject`, so the new `designs` count does not break it).

- [ ] **Step 8: Run the full check and commit**

Run: `npm run check`
Expected: exit 0.

```bash
git add packages/cli
git commit -m "Make the design parts again on every CLI write, and refuse edits to generated parts" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The `design` command group

**Files:**
- Create: `packages/cli/src/commands/design.ts`
- Modify: `packages/cli/src/commands/index.ts`
- Test: `packages/cli/test/design.test.ts`

**Interfaces:**
- Consumes: from core: `axisCells`, `checkDesigns`, `defaultDesignName`, `DESIGN_MOUNTS`, `DESIGN_SYSTEM_NAMES`, `DESIGN_SYSTEMS`, `designElevationSvg`, `designErrors`, `designGeometry`, `detachDesign`, `EKET`, `generatedParts`, `isDesignSystem`, `isNewerMinor`, `isPresetSystem`, `KALLAX`, `materialsById`, `MAX_DESIGN_CELLS`, `MAX_DESIGN_QUANTITY`, `presetAxis`, `presetDepth`, `regenerateDesigns`, `removeDesign`, `renameDesign`. From the CLI: `FILE_ARG`, `finishMutation`, `loadProject`, `OUTPUT_OPTIONS`, `warningLines`, `writeOutput`, `Loaded` (`project.ts`); `CliError`, `EXIT`, `usageError` (`spec.ts`); `len`, `plural`, `table` (`text.ts`); `choiceValue`, `integerValue`, `lengthValue`, `optionalChoice`, `optionalLength`, `str` (`values.ts`); `findAll`, `findById`, `ID_OPTION`, `materialFor`, `newId`, `nonEmpty`, `resolveMaterial` (`commands/common.ts`); the test helpers from Task 5.
- Produces:
  - `designGroup: GroupSpec` with `design systems`, `design list`, `design get`, `design add`, `design set`, `design remove`, `design detach`, and `design drawing`, registered after `toolsGroup` in `GROUPS`.
  - `invalidDesign(project: Project, design: Design): CliError` — exit 1, code `design-invalid`, details `{ id, issues }` (the error issues of the design). Task 7 uses it.
  - JSON results: `design add` → `design`, `parts`; `design set` → `design`, `parts`, `partChanges { added, removed, resized }`, `removedPlacements`; `design remove` → `removed`, `removedParts`, `removedPlacements`; `design detach` → `detached`, `parts`; `design drawing` → `design`, and `svg` or `path`; plus the usual `changes`, `validation`, `written`, `dryRun` on writes.

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/test/design.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cli, EKET, editFile, KALLAX, memoryIo, withDesignExamples, type MemoryIo } from "./helpers.ts";

const F = "hall.cutplan.json";

/** A mm project with 18 mm and 6 mm birch plywood and one sheet size, and no designs. */
async function hall(): Promise<MemoryIo> {
  const io = memoryIo();
  await cli(["new", F, "--name", "Hall", "--units", "mm"], io);
  await cli(["materials", "add", F, "--name", "Birch 18", "--id", "b18", "--thickness", "18"], io);
  await cli(["materials", "add", F, "--name", "Birch 6", "--id", "b6", "--thickness", "6"], io);
  await cli(["stock", "add", F, "--material", "b18", "--length", "2440", "--width", "1220", "--cost", "80"], io);
  return io;
}

const sizes = (parts: { id: string; length: number; width: number; quantity: number }[]) => parts.map((p) => [p.id, p.length, p.width, p.quantity]);

describe("design systems", () => {
  it("lists the systems with their IKEA numbers, and needs no file", async () => {
    const result = await cli(["design", "systems", "--json"]);
    expect(result.code).toBe(0);
    const systems = result.json().systems;
    expect(systems.map((s: { system: string }) => s.system)).toEqual(["kallax", "eket", "custom"]);
    expect(systems[0].values.opening).toMatchObject({ mm: 335, derived: true });
    expect(systems[1].values.module).toMatchObject({ mm: 350, derived: false });
    expect(systems[2].values).toEqual({});
    expect((await cli(["design", "systems"])).stdout).toContain("opening: 335 mm (derived)");
  });
});

describe("design add", () => {
  it("adds a KALLAX with IKEA-size cells, names it from the grid, and makes its parts", async () => {
    const io = await hall();
    const result = await cli(["design", "add", F, "--system", "kallax", "--cols", "2", "--rows", "4", "--material", "b18", "--json"], io);
    expect(result.code).toBe(0);
    const data = result.json();
    expect(data.design).toEqual({
      id: "kallax-2x4",
      name: "KALLAX 2x4",
      system: "kallax",
      material: "b18",
      width: { openings: [335, 335] },
      height: { openings: [335, 335, 335, 335] },
      depth: 390,
    });
    expect(sizes(data.parts)).toEqual([
      ["kallax-2x4-vertical", 1430, 390, 3],
      ["kallax-2x4-horizontal", 335, 390, 10],
    ]);
    expect(data.changes.designs.added).toEqual(["kallax-2x4"]);
    expect(data.changes.parts.added).toEqual(["kallax-2x4-vertical", "kallax-2x4-horizontal"]);
    expect(result.file(F).parts.every((part) => part.design === "kallax-2x4" && part.group === "KALLAX 2x4")).toBe(true);
  });

  it("adds EKET modules in the project units, with a back and a mount", async () => {
    const io = memoryIo();
    await cli(["new", F, "--name", "Wall", "--units", "in"], io);
    await cli(["materials", "add", F, "--name", "Ply 3/4", "--id", "p34", "--thickness", "23/32"], io);
    await cli(["materials", "add", F, "--name", "Ply 1/4", "--id", "p14", "--thickness", "7/32"], io);
    const result = await cli(["design", "add", F, "--system", "eket", "--cols", "2", "--rows", "1", "--material", "p34", "--back", "p14", "--mount", "wall-rail", "--quantity", "2", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().design).toMatchObject({
      id: "eket-2x1",
      width: { outside: 27.559055118, cells: 2 },
      height: { outside: 13.779527559, cells: 1 },
      depth: 13.779527559,
      back: { material: "p14" },
      mount: "wall-rail",
      quantity: 2,
    });
    expect(result.json().parts.map((part: { id: string; quantity: number }) => [part.id, part.quantity])).toEqual([
      ["eket-2x1-vertical", 6],
      ["eket-2x1-horizontal", 8],
      ["eket-2x1-back", 2],
    ]);
  });

  it("adds a custom grid from an outside size or from a list of openings", async () => {
    const io = await hall();
    const grid = await cli(["design", "add", F, "--width", "900", "--height", "600", "--cols", "2", "--rows", "2", "--depth", "300", "--material", "b18", "--json"], io);
    expect(grid.json().design).toMatchObject({ id: "custom-2x2", name: "Custom 2x2", system: "custom", width: { outside: 900, cells: 2 }, height: { outside: 600, cells: 2 } });
    expect(sizes(grid.json().parts)).toEqual([
      ["custom-2x2-vertical", 600, 300, 3],
      ["custom-2x2-horizontal", 423, 300, 6],
    ]);
    const mixed = await cli(["design", "add", F, "--column-openings", "335, 400,335", "--row-openings", "300,335", "--depth", "390", "--material", "b18", "--name", "Mixed", "--id", "mx", "--json"], io);
    expect(mixed.json().design).toMatchObject({ id: "mx", name: "Mixed", width: { openings: [335, 400, 335] }, height: { openings: [300, 335] } });
    expect(sizes(mixed.json().parts)).toEqual([
      ["mx-vertical", 689, 390, 4],
      ["mx-horizontal-1", 335, 390, 6],
      ["mx-horizontal-2", 400, 390, 3],
    ]);
  });

  it("gives usage errors for missing and conflicting axis flags", async () => {
    const io = await hall();
    const noWidth = await cli(["design", "add", F, "--cols", "2", "--rows", "2", "--depth", "300", "--material", "b18", "--json"], io);
    expect(noWidth.code).toBe(2);
    expect(noWidth.json().error).toMatchObject({ code: "missing-option", option: "width" });
    const noAxis = await cli(["design", "add", F, "--system", "kallax", "--rows", "2", "--material", "b18", "--json"], io);
    expect(noAxis.json().error).toMatchObject({ code: "missing-option", option: "cols" });
    const noDepth = await cli(["design", "add", F, "--width", "900", "--height", "600", "--material", "b18", "--json"], io);
    expect(noDepth.json().error).toMatchObject({ code: "missing-option", option: "depth" });
    const both = await cli(["design", "add", F, "--system", "kallax", "--cols", "2", "--column-openings", "335,335", "--rows", "1", "--material", "b18", "--json"], io);
    expect(both.json().error).toMatchObject({ code: "conflict", option: "column-openings" });
    const bad = await cli(["design", "add", F, "--system", "billy", "--cols", "1", "--rows", "1", "--json"], io);
    expect(bad.json().error).toMatchObject({ code: "invalid-value", option: "system" });
    expect((await cli(["design", "add", F, "--system", "kallax", "--cols", "51", "--rows", "1", "--material", "b18", "--json"], io)).json().error).toMatchObject({ code: "invalid-value", option: "cols" });
    expect(io.files.get(F)).not.toContain('"designs"');
  });

  it("refuses a design with an error with exit 1, invalid-value, and the checks", async () => {
    const io = await hall();
    await cli(["materials", "add", F, "--name", "Ply 9", "--id", "p9", "--thickness", "9"], io);
    const before = io.files.get(F);
    const thin = await cli(["design", "add", F, "--system", "kallax", "--cols", "1", "--rows", "1", "--material", "p9", "--json"], io);
    expect(thin.code).toBe(1);
    expect(thin.json().error.code).toBe("invalid-value");
    expect(thin.json().error.issues.map((issue: { code: string }) => issue.code)).toEqual(["pocket-thickness"]);
    const small = await cli(["design", "add", F, "--width", "30", "--height", "600", "--cols", "1", "--rows", "1", "--depth", "300", "--material", "b18", "--json"], io);
    expect(small.json().error.issues.map((issue: { code: string }) => issue.code)).toEqual(["design-too-small"]);
    expect(io.files.get(F)).toBe(before);
  });

  it("gives a second design with the same grid its own id and parts", async () => {
    const io = await hall();
    await cli(["design", "add", F, "--system", "kallax", "--cols", "2", "--rows", "4", "--material", "b18"], io);
    const second = await cli(["design", "add", F, "--system", "kallax", "--cols", "2", "--rows", "4", "--material", "b18", "--json"], io);
    expect(second.code).toBe(0);
    expect(second.json().design).toMatchObject({ id: "kallax-2x4-2", name: "KALLAX 2x4" });
    expect(second.file(F).parts.map((part) => part.id)).toEqual(["kallax-2x4-vertical", "kallax-2x4-horizontal", "kallax-2x4-2-vertical", "kallax-2x4-2-horizontal"]);
  });

  it("reads stdin and prints the project with its parts, or writes nothing with --dry-run", async () => {
    const io = await hall();
    const text = io.files.get(F)!;
    const piped = await cli(["design", "add", "-", "--system", "eket", "--cols", "1", "--rows", "2", "--material", "b18"], memoryIo({}, text));
    expect(piped.code).toBe(0);
    const project = JSON.parse(piped.stdout) as { designs: { id: string }[]; parts: { id: string }[] };
    expect(project.designs.map((design) => design.id)).toEqual(["eket-1x2"]);
    expect(project.parts.map((part) => part.id)).toEqual(["eket-1x2-vertical", "eket-1x2-horizontal"]);
    const dry = await cli(["design", "add", F, "--system", "eket", "--cols", "1", "--rows", "2", "--material", "b18", "--dry-run", "--json"], io);
    expect(dry.json()).toMatchObject({ ok: true, dryRun: true, written: null });
    expect(dry.json().parts).toHaveLength(2);
    expect(io.files.get(F)).toBe(text);
  });

  it("refuses a file from a newer minor version", async () => {
    const io = await hall();
    editFile(io, F, (file) => {
      file.version = "1.2";
    });
    const result = await cli(["design", "add", F, "--system", "kallax", "--cols", "1", "--rows", "1", "--material", "b18", "--json"], io);
    expect(result.code).toBe(1);
    expect(result.json().error).toMatchObject({ code: "newer-version", version: "1.2" });
  });
});

describe("design list and get", () => {
  it("lists the designs with the outside size and the part counts", async () => {
    const result = await cli(["design", "list", EKET, "--json"], withDesignExamples());
    expect(result.json().designs).toEqual([
      { id: "eket", name: "Wall EKET", system: "eket", quantity: 2, mount: "wall-rail", outside: { width: 27.559055118, height: 13.779527559, depth: 13.779527559 }, parts: 3, copies: 16 },
    ]);
    const text = await cli(["design", "list", KALLAX], withDesignExamples());
    expect(text.stdout).toMatch(/kallax\s+Hall KALLAX\s+kallax\s+724 mm × 1430 mm × 390 mm\s+1\s+floor\s+2\s+13/);
  });

  it("shows one design with its parts and its checks, and exits 2 for an unknown id", async () => {
    const io = withDesignExamples();
    editFile(io, KALLAX, (file) => {
      file.designs[0].depth = 340;
    });
    const result = await cli(["design", "get", KALLAX, "kallax", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().outside).toEqual({ width: 724, height: 1430, depth: 340 });
    expect(result.json().parts.map((part: { id: string }) => part.id)).toEqual(["kallax-vertical", "kallax-horizontal"]);
    expect(result.json().issues.map((issue: { code: string }) => issue.code)).toEqual(expect.arrayContaining(["design-stale"]));
    const missing = await cli(["design", "get", KALLAX, "nope", "--json"], io);
    expect(missing.code).toBe(2);
    expect(missing.json().error).toMatchObject({ code: "not-found", id: "nope", known: ["kallax"] });
  });
});

describe("design set", () => {
  it("makes the parts again, keeps the copies that still fit, and lists what changed", async () => {
    const io = withDesignExamples();
    await cli(["optimize", KALLAX, "--iterations", "50", "--seed", "1"], io);
    const result = await cli(["design", "set", KALLAX, "kallax", "--rows", "5", "--json"], io);
    expect(result.code).toBe(0);
    const data = result.json();
    expect(data.design.height).toEqual({ openings: [335, 335, 335, 335, 335] });
    expect(data.partChanges).toEqual({ added: [], removed: [], resized: ["kallax-vertical"] });
    expect(data.removedPlacements).toEqual([
      { part: "kallax-vertical", copy: 0 },
      { part: "kallax-vertical", copy: 1 },
      { part: "kallax-vertical", copy: 2 },
    ]);
    expect(data.changes.plan).toMatchObject({ placementsBefore: 13, placementsAfter: 10 });
    expect(result.file(KALLAX).parts.map((part) => part.quantity)).toEqual([3, 12]);
  });

  it("gives the design a new id, and the copies stay on their sheets", async () => {
    const io = withDesignExamples();
    await cli(["optimize", KALLAX, "--iterations", "50", "--seed", "1"], io);
    const result = await cli(["design", "set", KALLAX, "kallax", "--id", "hall", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().design.id).toBe("hall");
    expect(result.json().partChanges).toEqual({ added: [], removed: [], resized: [] });
    expect(result.json().removedPlacements).toEqual([]);
    expect(result.json().changes.parts).toMatchObject({ added: ["hall-vertical", "hall-horizontal"], removed: ["kallax-vertical", "kallax-horizontal"] });
    expect(result.json().changes.plan).toMatchObject({ placementsBefore: 13, placementsAfter: 13 });
    const duplicate = await cli(["design", "set", KALLAX, "hall", "--id", "hall", "--json"], io);
    expect(duplicate.code).toBe(0);
    await cli(["design", "add", KALLAX, "--system", "kallax", "--cols", "1", "--rows", "1", "--json"], io);
    const taken = await cli(["design", "set", KALLAX, "hall", "--id", "kallax-1x1", "--json"], io);
    expect(taken.code).toBe(2);
    expect(taken.json().error).toMatchObject({ code: "duplicate-id", id: "kallax-1x1" });
  });

  it("changes the back, the mount, the name, and the material", async () => {
    const io = withDesignExamples();
    const result = await cli(["design", "set", EKET, "eket", "--back", "none", "--mount", "legs", "--name", "Hall EKET", "--quantity", "1", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json().design).not.toHaveProperty("back");
    expect(result.json().design).toMatchObject({ name: "Hall EKET", mount: "legs", quantity: 1 });
    expect(result.json().partChanges).toEqual({ added: [], removed: ["eket-back"], resized: ["eket-vertical", "eket-horizontal"] });
    expect(result.file(EKET).parts.every((part) => part.group === "Hall EKET")).toBe(true);
  });

  it("refuses a change that gives a design error, and writes nothing", async () => {
    const io = withDesignExamples();
    const before = io.files.get(EKET);
    const result = await cli(["design", "set", EKET, "eket", "--material", "ply-7-32", "--json"], io);
    expect(result.code).toBe(1);
    expect(result.json().error.code).toBe("invalid-value");
    expect(result.json().error.issues.map((issue: { code: string }) => issue.code)).toEqual(["pocket-thickness"]);
    expect(io.files.get(EKET)).toBe(before);
  });

  it("changes one axis and keeps the other", async () => {
    const io = withDesignExamples();
    const cols = await cli(["design", "set", KALLAX, "kallax", "--cols", "3", "--json"], io);
    expect(cols.json().design).toMatchObject({ width: { openings: [335, 335, 335] }, height: { openings: [335, 335, 335, 335] } });
    const custom = await cli(["design", "set", KALLAX, "kallax", "--system", "custom", "--cols", "2", "--json"], io);
    expect(custom.code).toBe(2);
    expect(custom.json().error).toMatchObject({ code: "missing-option", option: "width" });
    const eket = await cli(["design", "set", EKET, "eket", "--cols", "3", "--json"], io);
    expect(eket.json().design.width).toEqual({ outside: 41.338582677, cells: 3 });
  });

  it("refuses a new id whose parts would take the id of another part", async () => {
    const io = withDesignExamples();
    await cli(["parts", "add", KALLAX, "--name", "Hall vertical", "--length", "500", "--width", "300"], io);
    const before = io.files.get(KALLAX);
    const result = await cli(["design", "set", KALLAX, "kallax", "--id", "hall", "--json"], io);
    expect(result.code).toBe(1);
    expect(result.json().error.code).toBe("invalid-value");
    expect(result.json().error.issues.map((issue: { code: string }) => issue.code)).toEqual(["design-conflict"]);
    expect(io.files.get(KALLAX)).toBe(before);
  });

  it("needs --system to change a design with an unknown system", async () => {
    const io = withDesignExamples();
    editFile(io, KALLAX, (file) => {
      file.designs[0].system = "billy";
    });
    const refused = await cli(["design", "set", KALLAX, "kallax", "--quantity", "2", "--json"], io);
    expect(refused.code).toBe(1);
    expect(refused.json().error).toMatchObject({ code: "invalid-value", option: "system" });
    const fixed = await cli(["design", "set", KALLAX, "kallax", "--system", "custom", "--quantity", "2", "--json"], io);
    expect(fixed.code).toBe(0);
    expect(fixed.file(KALLAX).parts.map((part) => part.quantity)).toEqual([6, 20]);
  });
});

describe("design remove and detach", () => {
  it("removes a design with its parts and their copies", async () => {
    const io = withDesignExamples();
    await cli(["optimize", KALLAX, "--iterations", "50", "--seed", "1"], io);
    const result = await cli(["design", "remove", KALLAX, "kallax", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json()).toMatchObject({ removed: ["kallax"], removedParts: ["kallax-vertical", "kallax-horizontal"] });
    expect(result.json().removedPlacements).toHaveLength(13);
    const file = result.file(KALLAX);
    expect(file.designs).toBeUndefined();
    expect(file.parts).toEqual([]);
    expect(io.files.get(KALLAX)).not.toContain('"designs"');
  });

  it("keeps the parts as normal parts, which parts set can then change", async () => {
    const io = withDesignExamples();
    const result = await cli(["design", "detach", KALLAX, "kallax", "--json"], io);
    expect(result.code).toBe(0);
    expect(result.json()).toMatchObject({ detached: "kallax", parts: ["kallax-vertical", "kallax-horizontal"] });
    expect(result.file(KALLAX).parts.map((part) => [part.id, part.design, part.group])).toEqual([
      ["kallax-vertical", undefined, "Hall KALLAX"],
      ["kallax-horizontal", undefined, "Hall KALLAX"],
    ]);
    expect((await cli(["parts", "set", KALLAX, "kallax-vertical", "--quantity", "2", "--json"], io)).code).toBe(0);
  });
});

describe("design drawing", () => {
  it("prints the SVG, or writes it to a file", async () => {
    const io = withDesignExamples();
    const printed = await cli(["design", "drawing", KALLAX, "kallax"], io);
    expect(printed.code).toBe(0);
    expect(printed.stdout).toMatch(/^<svg [^>]+>\n<title>Hall KALLAX: 724 mm × 1430 mm × 390 mm<\/title>/);
    const written = await cli(["design", "drawing", KALLAX, "kallax", "--out", "hall.svg", "--json"], io);
    expect(written.json()).toMatchObject({ ok: true, design: "kallax", path: "hall.svg" });
    expect(io.files.get("hall.svg")).toBe(printed.stdout);
  });

  it("exits 1 for a design that makes no parts", async () => {
    const io = withDesignExamples();
    editFile(io, KALLAX, (file) => {
      file.designs[0].material = "gone";
    });
    const result = await cli(["design", "drawing", KALLAX, "kallax", "--json"], io);
    expect(result.code).toBe(1);
    expect(result.json().error).toMatchObject({ code: "design-invalid", id: "kallax" });
    expect(result.json().error.issues.map((issue: { code: string }) => issue.code)).toEqual(["bad-ref"]);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -w @opencutplan/cli -- test/design.test.ts`
Expected: FAIL. `design` is an unknown command (exit 2, `unknown-command`).

- [ ] **Step 3: Implement the group**

Create `packages/cli/src/commands/design.ts`:

```ts
import {
  axisCells,
  checkDesigns,
  defaultDesignName,
  DESIGN_MOUNTS,
  DESIGN_SYSTEM_NAMES,
  DESIGN_SYSTEMS,
  designElevationSvg,
  designErrors,
  designGeometry,
  detachDesign,
  EKET,
  generatedParts,
  isDesignSystem,
  isNewerMinor,
  isPresetSystem,
  KALLAX,
  materialsById,
  MAX_DESIGN_CELLS,
  MAX_DESIGN_QUANTITY,
  presetAxis,
  presetDepth,
  regenerateDesigns,
  removeDesign,
  renameDesign,
  type Design,
  type DesignAxis,
  type DesignSystem,
  type Part,
  type PlanIssue,
  type Project,
  type Units,
} from "@opencutplan/core";
import { PROGRAM } from "../help.ts";
import { FILE_ARG, finishMutation, loadProject, OUTPUT_OPTIONS, warningLines, writeOutput, type Loaded } from "../project.ts";
import { CliError, EXIT, usageError, type CommandSpec, type GroupSpec, type OptionSpec, type OptionValues } from "../spec.ts";
import { len, plural, table } from "../text.ts";
import { choiceValue, integerValue, lengthValue, optionalChoice, optionalLength, str } from "../values.ts";
import { findAll, findById, ID_OPTION, materialFor, newId, nonEmpty, resolveMaterial } from "./common.ts";

const DESIGN_ARG = { name: "id", description: "The design id." };

const OPTIONS = {
  system: { name: "system", type: "string", value: "<kallax|eket|custom>", description: "The system. kallax and eket set the cell sizes and the depth from the IKEA sizes. Default for add: custom." },
  cols: { name: "cols", type: "string", value: "<n>", description: `The number of columns, 1 to ${MAX_DESIGN_CELLS}. A custom design also needs --width.` },
  rows: { name: "rows", type: "string", value: "<n>", description: `The number of rows, 1 to ${MAX_DESIGN_CELLS}. A custom design also needs --height.` },
  width: { name: "width", type: "string", value: "<length>", description: "The outside width. The columns divide it equally." },
  height: { name: "height", type: "string", value: "<length>", description: "The outside height. The rows divide it equally." },
  columnOpenings: { name: "column-openings", type: "string", value: "<list>", description: "The opening of each column, left to right, for example 335,400. It replaces --cols and --width." },
  rowOpenings: { name: "row-openings", type: "string", value: "<list>", description: "The opening of each row, top to bottom. It replaces --rows and --height." },
  depth: { name: "depth", type: "string", value: "<length>", description: "The outside depth, with the back. Default for kallax and eket: the IKEA depth." },
  material: { name: "material", type: "string", value: "<id|name>", description: "The material of the panels. Required when the project has more than one material." },
  back: { name: "back", type: "string", value: "<id|name|none>", description: "The material of the back, or none. Default for add: none." },
  mount: { name: "mount", type: "string", value: "<floor|legs|feet|wall-rail>", description: "How the unit stands or hangs. legs, feet, and wall-rail add the EKET items to the hardware list. Default: floor." },
  quantity: { name: "quantity", type: "string", value: "<n>", description: `The number of units to build, 1 to ${MAX_DESIGN_QUANTITY}. Default for add: 1.` },
  name: { name: "name", type: "string", value: "<text>", description: "The design name. It is also the group of its parts. Default for add: the system and the grid, such as KALLAX 2x4." },
} as const satisfies Record<string, OptionSpec>;

const FIELD_OPTIONS: OptionSpec[] = Object.values(OPTIONS);

interface AxisFlags {
  count: "cols" | "rows";
  outside: "width" | "height";
  openings: "column-openings" | "row-openings";
}

const WIDTH: AxisFlags = { count: "cols", outside: "width", openings: "column-openings" };
const HEIGHT: AxisFlags = { count: "rows", outside: "height", openings: "row-openings" };

function openingsValue(text: string, name: string, units: Units): number[] {
  const openings = text.split(",").map((item) => lengthValue(item.trim(), units, name));
  if (openings.length > MAX_DESIGN_CELLS) throw usageError(`--${name} has ${openings.length} openings. The most is ${MAX_DESIGN_CELLS}.`, "invalid-value", { option: name, value: text });
  return openings;
}

/** The axis from the flags, or the current axis when no flag for it is given. */
function axisValue(options: OptionValues, flags: AxisFlags, system: DesignSystem, units: Units, current: DesignAxis | undefined): DesignAxis | undefined {
  const openings = str(options, flags.openings);
  const countText = str(options, flags.count);
  const outside = optionalLength(options, flags.outside, units);
  if (openings !== undefined) {
    if (countText !== undefined || outside !== undefined) {
      throw usageError(`Give --${flags.openings}, or --${flags.count} and --${flags.outside}, not both.`, "conflict", { option: flags.openings });
    }
    return { openings: openingsValue(openings, flags.openings, units) };
  }
  const count = countText === undefined ? undefined : integerValue(countText, flags.count, 1, MAX_DESIGN_CELLS);
  if (outside !== undefined) return { outside, cells: count ?? (current ? axisCells(current) : 1) };
  if (count === undefined) return current;
  if (isPresetSystem(system)) return presetAxis(system, count, units);
  if (current && "outside" in current) return { outside: current.outside, cells: count };
  throw usageError(`--${flags.count} needs --${flags.outside} for a custom design.`, "missing-option", { option: flags.outside });
}

/** Refuses a file from a newer minor version: its designs can have fields that this CLI does not know. */
function assertCanGenerate(loaded: Loaded): void {
  if (!isNewerMinor(loaded.project.version)) return;
  throw new CliError(EXIT.failed, "newer-version", `The file has the format version ${loaded.project.version}. Update opencutplan to change its designs.`, { version: loaded.project.version });
}

/** Refuses a design with an error (spec §10): exit 1 with the checks in error.issues. */
function assertValid(project: Project, design: Design): void {
  if (!isDesignSystem(design.system)) {
    throw new CliError(EXIT.failed, "invalid-value", `The design ${design.id} uses the system "${design.system}". Give --system ${DESIGN_SYSTEMS.join("|")}.`, {
      option: "system",
      issues: [],
    });
  }
  const issues = designErrors(project, design);
  if (issues.length === 0) return;
  throw new CliError(EXIT.failed, "invalid-value", issues.map((issue) => issue.message).join(" "), { issues });
}

function designIssues(project: Project, id: string): PlanIssue[] {
  return checkDesigns(project).filter((issue) => issue.refs.some((ref) => ref.kind === "design" && ref.design === id));
}

function outsideSize(project: Project, design: Design) {
  const geometry = designGeometry(design, materialsById(project));
  return geometry ? { width: geometry.outsideWidth, height: geometry.outsideHeight, depth: geometry.depth } : null;
}

function sizeText(project: Project, design: Design): string {
  const outside = outsideSize(project, design);
  return outside ? `${len(project, outside.width)} × ${len(project, outside.height)} × ${len(project, outside.depth)}` : "no size";
}

function line(project: Project, design: Design): string {
  return `${design.id} (${design.name}, ${design.system} ${axisCells(design.width)}x${axisCells(design.height)}, ${sizeText(project, design)}, ×${design.quantity ?? 1})`;
}

function partChanges(before: readonly Part[], after: readonly Part[]) {
  const old = new Map(before.map((part) => [part.id, part]));
  const now = new Set(after.map((part) => part.id));
  return {
    added: after.filter((part) => !old.has(part.id)).map((part) => part.id),
    removed: before.filter((part) => !now.has(part.id)).map((part) => part.id),
    resized: after.filter((part) => old.has(part.id) && (old.get(part.id)!.length !== part.length || old.get(part.id)!.width !== part.width)).map((part) => part.id),
  };
}

function droppedCopies(before: Project, after: Project): { part: string; copy: number }[] {
  const kept = new Set((after.plan?.sheets ?? []).flatMap((s) => s.placements.map((p) => `${p.part}#${p.copy}`)));
  return (before.plan?.sheets ?? []).flatMap((s) => s.placements.filter((p) => !kept.has(`${p.part}#${p.copy}`)).map((p) => ({ part: p.part, copy: p.copy })));
}

const systems: CommandSpec = {
  name: "design systems",
  summary: "List the design systems and their IKEA numbers.",
  description:
    "List the systems that design add and design set accept: kallax, eket, and custom. Each IKEA number has its value in millimetres, its source, and derived (true when the number comes from arithmetic on IKEA's listed sizes, not from a listing). The command needs no file.",
  args: [],
  options: [],
  examples: [{ command: `${PROGRAM} design systems --json`, description: "Get the systems and their numbers as JSON." }],
  output: "systems [{ system, name, values { <name>: { mm, derived, source } } }].",
  async run() {
    const values: Record<DesignSystem, object> = { kallax: KALLAX, eket: EKET, custom: {} };
    const list = DESIGN_SYSTEMS.map((system) => ({ system, name: DESIGN_SYSTEM_NAMES[system], values: values[system] }));
    const text = list
      .map((entry) => {
        const lines = Object.entries(entry.values as Record<string, { mm: number; derived: boolean; source: string }>).map(
          ([name, value]) => `  ${name}: ${value.mm} mm${value.derived ? " (derived)" : ""} — ${value.source}`,
        );
        return [`${entry.system} (${entry.name})`, ...(lines.length > 0 ? lines : ["  Any size you give."])].join("\n");
      })
      .join("\n");
    return { data: { systems: list }, text };
  },
};

const list: CommandSpec = {
  name: "design list",
  summary: "List the designs.",
  description: "List the designs with their outside size and the number of parts and copies that each one makes.",
  args: [FILE_ARG],
  options: [],
  examples: [{ command: `${PROGRAM} design list hall.cutplan.json`, description: "List the designs as a table." }],
  output: "units, designs [{ id, name, system, quantity, mount, outside { width, height, depth } (null when the design has an error), parts, copies }]. outside, parts, and copies are derived; they are not file fields.",
  async run({ args, io }) {
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const designs = (project.designs ?? []).map((design) => {
      const parts = generatedParts(project, design.id);
      return {
        id: design.id,
        name: design.name,
        system: design.system,
        quantity: design.quantity ?? 1,
        mount: design.mount ?? "floor",
        outside: outsideSize(project, design),
        parts: parts.length,
        copies: parts.reduce((sum, part) => sum + part.quantity, 0),
      };
    });
    const text =
      designs.length === 0
        ? "The project has no designs."
        : table(
            ["id", "name", "system", "size", "qty", "mount", "parts", "copies"],
            designs.map((d, i) => [d.id, d.name, d.system, sizeText(project, project.designs![i]!), String(d.quantity), d.mount, String(d.parts), String(d.copies)]),
          );
    return { data: { units: project.project.units, designs }, text, warnings: warningLines(loaded) };
  },
};

const get: CommandSpec = {
  name: "design get",
  summary: "Show one design, its parts, and its checks.",
  description: "Show one design by id, the parts it makes, its outside size, and the design checks (errors and warnings) for it.",
  args: [FILE_ARG, DESIGN_ARG],
  options: [],
  examples: [{ command: `${PROGRAM} design get hall.cutplan.json kallax-2x4 --json`, description: "Show the design kallax-2x4." }],
  output: "units, design (the file object), outside { width, height, depth } or null, parts [the generated parts], issues [{ severity, code, message, refs }].",
  async run({ args, io }) {
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const design = findById(project.designs ?? [], args[1]!, "design");
    const parts = generatedParts(project, design.id);
    const issues = designIssues(project, design.id);
    const text = [
      line(project, design),
      ...parts.map((part) => `  ${part.id}: ${part.name}, ${len(project, part.length)} × ${len(project, part.width)}, ×${part.quantity}`),
      ...issues.map((issue) => `${issue.severity} ${issue.code}: ${issue.message}`),
    ].join("\n");
    return { data: { units: project.project.units, design, outside: outsideSize(project, design), parts, issues }, text, warnings: warningLines(loaded) };
  },
};

const add: CommandSpec = {
  name: "design add",
  summary: "Add a design and make its parts.",
  description:
    "Add a cabinet design and make its parts: the vertical panels, the shelves, and the back. Give each axis as --cols with --width (or --rows with --height), or as a list of openings. For kallax and eket, --cols and --rows alone give IKEA-size cells, and the depth is the IKEA depth; the numbers are converted to the project units. A design with an error (such as stock too thin for pocket screws) is refused with exit 1, invalid-value, and the checks in error.issues. The new parts are not placed; run optimize.",
  args: [FILE_ARG],
  options: [...FIELD_OPTIONS, ID_OPTION, ...OUTPUT_OPTIONS],
  examples: [
    { command: `${PROGRAM} design add hall.cutplan.json --system kallax --cols 2 --rows 4`, description: "Add a KALLAX 2x4; the id is kallax-2x4." },
    { command: `${PROGRAM} design add hall.cutplan.json --system eket --cols 2 --rows 1 --back ply6 --mount wall-rail --quantity 2`, description: "Add two EKET 2x1 units for the wall rail." },
    { command: `${PROGRAM} design add hall.cutplan.json --width 1200 --height 800 --cols 3 --rows 2 --depth 300 --name Sideboard`, description: "Add a custom 3x2 grid in a 1200 × 800 outside size." },
  ],
  output: "design (the new design), parts (the generated parts), changes, validation, written, dryRun. For a design with an error: error { code: \"invalid-value\", issues }.",
  async run(invocation) {
    const { args, options, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    assertCanGenerate(loaded);
    const { project } = loaded;
    const units = project.project.units;
    const system = choiceValue(str(options, "system") ?? "custom", "system", DESIGN_SYSTEMS);
    const width = axisValue(options, WIDTH, system, units, undefined);
    const height = axisValue(options, HEIGHT, system, units, undefined);
    if (!width) throw usageError("Give --cols, --width, or --column-openings.", "missing-option", { option: "cols" });
    if (!height) throw usageError("Give --rows, --height, or --row-openings.", "missing-option", { option: "rows" });
    const depth = optionalLength(options, "depth", units) ?? (isPresetSystem(system) ? presetDepth(system, units) : undefined);
    if (depth === undefined) throw usageError("Give --depth for a custom design.", "missing-option", { option: "depth" });
    const name = nonEmpty(str(options, "name"), "name") ?? defaultDesignName(system, axisCells(width), axisCells(height));
    const design: Design = {
      id: newId(project.designs ?? [], str(options, "id"), name, "design"),
      name,
      system,
      material: materialFor(project, str(options, "material")).id,
      width,
      height,
      depth,
    };
    const quantity = str(options, "quantity");
    if (quantity !== undefined) design.quantity = integerValue(quantity, "quantity", 1, MAX_DESIGN_QUANTITY);
    const back = str(options, "back");
    if (back !== undefined && back !== "none") design.back = { material: resolveMaterial(project, back).id };
    const mount = optionalChoice(options, "mount", DESIGN_MOUNTS);
    if (mount !== undefined) design.mount = mount;
    const added = { ...project, designs: [...(project.designs ?? []), design] };
    assertValid(added, design);
    const next = regenerateDesigns(added);
    return finishMutation(invocation, loaded, next, { summary: `Added design ${line(next, design)}.`, data: { design, parts: generatedParts(next, design.id) } });
  },
};

const set: CommandSpec = {
  name: "design set",
  summary: "Change a design and make its parts again.",
  description:
    "Change the fields of a design, then make its parts again. Only the fields you give change. --id gives the design a new id; its parts get new ids, and their copies stay on the sheets. A copy stays on its sheet when its part keeps the same id, size, and material; the other copies go to the tray, and removedPlacements lists them. A change that gives a design error is refused with exit 1, invalid-value, and the checks in error.issues.",
  args: [FILE_ARG, DESIGN_ARG],
  options: [...FIELD_OPTIONS, { ...ID_OPTION, description: "A new id for the design. Its parts get new ids with it." }, ...OUTPUT_OPTIONS],
  examples: [
    { command: `${PROGRAM} design set hall.cutplan.json kallax-2x4 --rows 5`, description: "Add a row of cells." },
    { command: `${PROGRAM} design set hall.cutplan.json sideboard --column-openings 400,300,400 --back none --dry-run`, description: "See what new column sizes and no back change." },
  ],
  output:
    "design (after the change), parts (the generated parts), partChanges { added, removed, resized } (part ids), removedPlacements [{ part, copy }], changes, validation, written, dryRun. For a design with an error: error { code: \"invalid-value\", issues }.",
  async run(invocation) {
    const { args, options, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    assertCanGenerate(loaded);
    const { project } = loaded;
    const units = project.project.units;
    const old = findById(project.designs ?? [], args[1]!, "design");
    const requested = str(options, "id");
    const id = requested === undefined || requested === old.id ? old.id : newId(project.designs ?? [], requested, old.name, "design");
    const renamed = id === old.id ? project : renameDesign(project, old.id, id);
    const systemText = str(options, "system");
    const system = systemText === undefined ? old.system : choiceValue(systemText, "system", DESIGN_SYSTEMS);
    const known = isDesignSystem(system) ? system : "custom";
    const design: Design = { ...old, id, system };
    design.width = axisValue(options, WIDTH, known, units, old.width)!;
    design.height = axisValue(options, HEIGHT, known, units, old.height)!;
    const depth = optionalLength(options, "depth", units);
    if (depth !== undefined) design.depth = depth;
    const name = nonEmpty(str(options, "name"), "name");
    if (name !== undefined) design.name = name;
    const material = str(options, "material");
    if (material !== undefined) design.material = resolveMaterial(project, material).id;
    const back = str(options, "back");
    if (back === "none") delete design.back;
    else if (back !== undefined) design.back = { material: resolveMaterial(project, back).id };
    const quantity = str(options, "quantity");
    if (quantity !== undefined) design.quantity = integerValue(quantity, "quantity", 1, MAX_DESIGN_QUANTITY);
    const mount = optionalChoice(options, "mount", DESIGN_MOUNTS);
    if (mount !== undefined) design.mount = mount;
    const changed = { ...renamed, designs: (renamed.designs ?? []).map((item) => (item.id === id ? design : item)) };
    assertValid(changed, design);
    const next = regenerateDesigns(changed);
    const parts = generatedParts(next, id);
    const removedPlacements = droppedCopies(renamed, next);
    return finishMutation(invocation, loaded, next, {
      summary: `Changed design ${line(next, design)}.`,
      data: { design, parts, partChanges: partChanges(generatedParts(renamed, id), parts), removedPlacements },
      ...(removedPlacements.length > 0 ? { details: [`Took ${plural(removedPlacements.length, "copy", "copies")} off the sheets.`] } : {}),
    });
  },
};

const remove: CommandSpec = {
  name: "design remove",
  summary: "Remove designs and their parts.",
  description: "Remove one or more designs, the parts they make, and the copies of those parts on the sheets. Nothing is removed when any id is unknown. To keep the parts, use design detach.",
  args: [FILE_ARG, { name: "id", description: "A design id.", variadic: true }],
  options: [...OUTPUT_OPTIONS],
  examples: [{ command: `${PROGRAM} design remove hall.cutplan.json kallax-2x4`, description: "Remove a design and its parts." }],
  output: "removed (the design ids), removedParts (the part ids), removedPlacements [{ part, copy }], changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const designs = findAll(project.designs ?? [], args.slice(1), "design");
    const next = designs.reduce((p, design) => removeDesign(p, design.id), project);
    const removed = designs.map((design) => design.id);
    const removedParts = designs.flatMap((design) => generatedParts(project, design.id).map((part) => part.id));
    return finishMutation(invocation, loaded, next, {
      summary: `Removed design ${removed.join(", ")} and ${plural(removedParts.length, "part")}.`,
      data: { removed, removedParts, removedPlacements: droppedCopies(project, next) },
    });
  },
};

const detach: CommandSpec = {
  name: "design detach",
  summary: "Keep the parts of a design as normal parts, and remove the design.",
  description: "Remove a design, and keep its parts and their copies on the sheets as normal parts. After this, parts set and parts remove can change them, and no design makes them again.",
  args: [FILE_ARG, DESIGN_ARG],
  options: [...OUTPUT_OPTIONS],
  examples: [{ command: `${PROGRAM} design detach hall.cutplan.json kallax-2x4`, description: "Make the KALLAX parts normal parts." }],
  output: "detached (the design id), parts (the ids of the parts that are now normal parts), changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const design = findById(project.designs ?? [], args[1]!, "design");
    const parts = generatedParts(project, design.id).map((part) => part.id);
    return finishMutation(invocation, loaded, detachDesign(project, design.id), {
      summary: `Detached design ${design.id}: ${plural(parts.length, "part")} are now normal parts.`,
      data: { detached: design.id, parts },
    });
  },
};

const drawing: CommandSpec = {
  name: "design drawing",
  summary: "Draw the front view of a design as SVG.",
  description:
    "Draw one unit of a design from the front, to scale: the panels at their true thickness, each opening size, the outside width and height, the depth, and the legs, feet, or wall rail. The default target is standard output. A design with an error has no drawing (exit 1, design-invalid).",
  args: [FILE_ARG, DESIGN_ARG],
  options: [{ name: "out", type: "string", value: "<path|->", description: "The SVG file to write, or - for standard output. Default: standard output." }],
  examples: [
    { command: `${PROGRAM} design drawing hall.cutplan.json kallax-2x4 --out hall.svg`, description: "Write the drawing to hall.svg." },
    { command: `${PROGRAM} design drawing hall.cutplan.json kallax-2x4 > hall.svg`, description: "Print the drawing." },
  ],
  output: "design (the id), path when --out is a file; svg on standard output. For a design with an error: error { code: \"design-invalid\", issues }.",
  async run({ args, options, io }) {
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const design = findById(project.designs ?? [], args[1]!, "design");
    const svg = designElevationSvg(project, design.id);
    if (svg === null) throw invalidDesign(project, design);
    const warnings = warningLines(loaded);
    const out = str(options, "out") ?? "-";
    if (out === "-") return { data: { design: design.id, svg }, text: "", payload: `${svg}\n`, warnings };
    await writeOutput(io, out, `${svg}\n`);
    return { data: { design: design.id, path: out }, text: `Wrote ${out}.`, warnings };
  },
};

/** The error for a read command on a design that makes no parts. */
export function invalidDesign(project: Project, design: Design): CliError {
  const issues = designIssues(project, design.id).filter((issue) => issue.severity === "error");
  const reason = isNewerMinor(project.version)
    ? `the file has the newer format version ${project.version}`
    : !isDesignSystem(design.system)
      ? `the system "${design.system}" is not known`
      : issues.map((issue) => issue.message).join(" ");
  return new CliError(EXIT.failed, "design-invalid", `The design ${design.id} makes no parts: ${reason}`, { id: design.id, issues });
}

export const designGroup: GroupSpec = { name: "design", summary: "Cabinet designs (KALLAX, EKET, custom)", commands: [systems, list, get, add, set, remove, detach, drawing] };
```

Apply this change to `packages/cli/src/commands/index.ts`:

```diff
--- a/packages/cli/src/commands/index.ts
+++ b/packages/cli/src/commands/index.ts
@@ -1,3 +1,4 @@
 import type { CommandSpec, GroupSpec } from "../spec.ts";
+import { designGroup } from "./design.ts";
 import { exportGroup } from "./export.ts";
 import { layoutGroup } from "./layout.ts";
@@ -13,3 +14,3 @@ import { newCommand, schemaCommand, showCommand, validateCommand } from "./proje
 export const COMMANDS: CommandSpec[] = [newCommand, showCommand, validateCommand, optimizeCommand, schemaCommand];
 
-export const GROUPS: GroupSpec[] = [partsGroup, stockGroup, materialsGroup, toolsGroup, settingsGroup, layoutGroup, reportGroup, exportGroup];
+export const GROUPS: GroupSpec[] = [partsGroup, stockGroup, materialsGroup, toolsGroup, designGroup, settingsGroup, layoutGroup, reportGroup, exportGroup];
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -w @opencutplan/cli`
Expected: PASS. The new tests pass, and `flow.test.ts` (`has help with an example for every command`) passes with the new commands.

- [ ] **Step 5: Run the full check and commit**

Run: `npm run check`
Expected: exit 0.

```bash
git add packages/cli
git commit -m "Add the design command group" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `report assembly` and the hardware in `report shopping`

**Files:**
- Modify: `packages/cli/src/commands/report.ts`
- Test: `packages/cli/test/design-report.test.ts`

**Interfaces:**
- Consumes: `assemblySteps` (Task 3), `hardwareList`, `HardwareLine` (Task 2), `invalidDesign` (Task 6), `findById` (`commands/common.ts`), the test helpers from Task 5.
- Produces: `report assembly <file> [--design <id>]` → `designs [{ design, name, quantity, steps [{ title, body }] }]`, `skipped` (ids). `report shopping` → `hardware` (the `HardwareLine[]`), and a `Hardware:` block in the readable output with one line for each item: the quantity (or `as needed`), the name, `(IKEA <article>)`, the choices, and `[<design id>]`.

- [ ] **Step 1: Write the failing tests**

Create `packages/cli/test/design-report.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cli, EKET, editFile, KALLAX, withDesignExamples, withExamples } from "./helpers.ts";

describe("report assembly", () => {
  it("gives the steps of every design", async () => {
    const result = await cli(["report", "assembly", EKET, "--json"], withDesignExamples());
    expect(result.code).toBe(0);
    const [design] = result.json().designs;
    expect(design).toMatchObject({ design: "eket", name: "Wall EKET", quantity: 2 });
    expect(design.steps.map((step: { title: string }) => step.title)).toEqual([
      "Drill the pocket holes",
      "Mark the shelf positions",
      "Cut spacers",
      "Assemble column 1 of 2",
      "Assemble column 2 of 2",
      "Check that it is square",
      "Fit the back",
      "Hang the unit",
    ]);
    expect(result.json().skipped).toEqual([]);
    const text = await cli(["report", "assembly", KALLAX], withDesignExamples());
    expect(text.stdout).toContain("Hall KALLAX (kallax)\n  1. Drill the pocket holes\n     Drill 3 pocket holes in each end of all 10 shelves");
  });

  it("skips a design that makes no parts, and exits 1 when --design names it", async () => {
    const io = withDesignExamples();
    editFile(io, KALLAX, (file) => {
      file.designs[0].material = "gone";
    });
    const all = await cli(["report", "assembly", KALLAX, "--json"], io);
    expect(all.json()).toMatchObject({ ok: true, designs: [], skipped: ["kallax"] });
    const one = await cli(["report", "assembly", KALLAX, "--design", "kallax", "--json"], io);
    expect(one.code).toBe(1);
    expect(one.json().error.code).toBe("design-invalid");
    expect((await cli(["report", "assembly", KALLAX, "--design", "nope", "--json"], io)).code).toBe(2);
  });

  it("says when the project has no designs", async () => {
    const result = await cli(["report", "assembly", "shelf.cutplan.json"], withExamples());
    expect(result.stdout).toBe("The project has no designs.\n");
  });
});

describe("report shopping hardware", () => {
  it("lists the hardware for the designs", async () => {
    const result = await cli(["report", "shopping", EKET, "--json"], withDesignExamples());
    expect(result.json().hardware.map((line: { item: string; quantity: number | null }) => [line.item, line.quantity])).toEqual([
      ["pocket-screws", 53],
      ["back-screws", 42],
      ["eket-rail-70", 2],
      ["wall-fixings", null],
      ["glue", null],
    ]);
    const text = await cli(["report", "shopping", EKET], withDesignExamples());
    expect(text.stdout).toContain('Hardware:\n  53 Pocket screws, coarse thread, 1 1/4" (32 mm) [eket]');
    expect(text.stdout).toContain("  2 EKET suspension rail, 70 cm (IKEA 80340048) [eket]");
    expect(text.stdout).toContain("  as needed Wood glue (PVA)");
  });

  it("has an empty hardware list without designs", async () => {
    const result = await cli(["report", "shopping", "shelf.cutplan.json", "--json"], withExamples());
    expect(result.json().hardware).toEqual([]);
    expect((await cli(["report", "shopping", "shelf.cutplan.json"], withExamples())).stdout).not.toContain("Hardware:");
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npm test -w @opencutplan/cli -- design-report`
Expected: FAIL. `report assembly` is an unknown command, and `hardware` is undefined.

- [ ] **Step 3: Implement**

Apply this change to `packages/cli/src/commands/report.ts`:

```diff
--- a/packages/cli/src/commands/report.ts
+++ b/packages/cli/src/commands/report.ts
@@ -1,9 +1,12 @@
 import {
   analyzeProject,
+  assemblySteps,
   describeStep,
   formatArea,
+  hardwareList,
   LABEL_LAYOUTS,
   labelPages,
   unsavedOffcuts,
+  type HardwareLine,
   type Project,
 } from "@opencutplan/core";
@@ -13,22 +16,32 @@ import type { CommandSpec, GroupSpec } from "../spec.ts";
 import { len, money, percent, plural, size, table } from "../text.ts";
 import { integerValue, optionalChoice, str } from "../values.ts";
+import { findById } from "./common.ts";
+import { invalidDesign } from "./design.ts";
 import { findSheet } from "./layout.ts";
 
 const SHEET_OPTION = { name: "sheet", type: "string", value: "<ref>", description: "Only this sheet: a sheet id, or its 1-based number in the plan." } as const;
 
+function hardwareText(line: HardwareLine): string {
+  const count = line.quantity === null ? "as needed" : line.unit === "pack" ? `${line.quantity} ×` : String(line.quantity);
+  const article = line.article === undefined ? "" : ` (IKEA ${line.article})`;
+  const choices = line.choices === undefined ? "" : `: ${line.choices.map((choice) => `${choice.name} ${choice.article}`).join(", ")}`;
+  return `  ${count} ${line.name}${article}${choices}${line.design === null ? "" : ` [${line.design}]`}`;
+}
+
 const shopping: CommandSpec = {
   name: "report shopping",
   summary: "What to buy, the cost, and the use of each sheet.",
   description:
-    "The shopping list, as in the app's Reports tab: for each material, the stock the plan uses, the pieces to buy (owned offcuts are not bought), and the cost. The total is null when the cost feature is off or a stock item to buy has no price; missingPrices lists those items.",
+    "The shopping list, as in the app's Reports tab: for each material, the stock the plan uses, the pieces to buy (owned offcuts are not bought), and the cost. The total is null when the cost feature is off or a stock item to buy has no price; missingPrices lists those items. hardware lists the screws, glue, and IKEA items that the designs need; it has no prices.",
   args: [FILE_ARG],
   options: [],
   examples: [{ command: `${PROGRAM} report shopping shelf.cutplan.json`, description: "Show what to buy." }],
   output:
-    "currency, total (null when unknown), missingPrices, sheetsToBuy, materials [{ material, name, lines [{ stock, label, kind, length, width, used, buy, unitCost, lineCost }], cost, stockArea, partArea, utilization }], sheets [{ sheet, sheetNumber, stock, stockArea, partArea, utilization }].",
+    "currency, total (null when unknown), missingPrices, sheetsToBuy, materials [{ material, name, lines [{ stock, label, kind, length, width, used, buy, unitCost, lineCost }], cost, stockArea, partArea, utilization }], sheets [{ sheet, sheetNumber, stock, stockArea, partArea, utilization }], hardware [{ item, name, article?, choices? [{ name, article, source }], quantity (null when you choose it), unit (each|pack), design (id, or null for all designs), source? }].",
   async run({ args, io }) {
     const loaded = await loadProject(io, args[0]!);
     const { project } = loaded;
     const list = analyzeProject(project).shopping;
+    const hardware = hardwareList(project);
     const sheetsToBuy = list.materials.flatMap((m) => m.lines).reduce((sum, line) => sum + line.buy, 0);
     const lines: string[] = [];
@@ -53,5 +66,6 @@ const shopping: CommandSpec = {
     lines.push(`Buy ${plural(sheetsToBuy, "piece")}. Total: ${money(list.total, list.currency)}.`);
     if (list.missingPrices.length > 0) lines.push(`No price: ${list.missingPrices.join(", ")}.`);
-    return { data: { ...list, sheetsToBuy }, text: lines.join("\n"), warnings: warningLines(loaded) };
+    if (hardware.length > 0) lines.push("Hardware:", ...hardware.map(hardwareText));
+    return { data: { ...list, sheetsToBuy, hardware }, text: lines.join("\n"), warnings: warningLines(loaded) };
   },
 };
@@ -224,3 +238,35 @@ const cutlist: CommandSpec = {
 };
 
-export const reportGroup: GroupSpec = { name: "report", summary: "Reports (read only)", commands: [shopping, sequence, offcuts, labels, cutlist] };
+const assembly: CommandSpec = {
+  name: "report assembly",
+  summary: "The steps to build each design.",
+  description:
+    "The assembly steps of each design, in order: drill the pocket holes, mark the shelf positions, cut spacers, assemble each column, check that it is square, fit the back, and mount or anchor the unit. The steps are for one unit; the first step says how many to build. A design that makes no parts has no steps; skipped lists it. With --design, a design that makes no parts is exit 1, design-invalid.",
+  args: [FILE_ARG],
+  options: [{ name: "design", type: "string", value: "<id>", description: "Only this design." }],
+  examples: [
+    { command: `${PROGRAM} report assembly hall.cutplan.json`, description: "Print the steps of every design." },
+    { command: `${PROGRAM} report assembly hall.cutplan.json --design kallax-2x4 --json`, description: "The steps of one design as JSON." },
+  ],
+  output: "designs [{ design, name, quantity, steps [{ title, body }] }], skipped (the ids of designs that make no parts).",
+  async run({ args, options, io }) {
+    const loaded = await loadProject(io, args[0]!);
+    const { project } = loaded;
+    const only = str(options, "design");
+    const chosen = only === undefined ? (project.designs ?? []) : [findById(project.designs ?? [], only, "design")];
+    const designs = [];
+    const skipped: string[] = [];
+    for (const design of chosen) {
+      const steps = assemblySteps(project, design.id);
+      if (steps === null && only !== undefined) throw invalidDesign(project, design);
+      if (steps === null) skipped.push(design.id);
+      else designs.push({ design: design.id, name: design.name, quantity: design.quantity ?? 1, steps });
+    }
+    const lines = designs.flatMap((design) => [`${design.name} (${design.design})`, ...design.steps.map((step, i) => `  ${i + 1}. ${step.title}\n     ${step.body}`)]);
+    if (skipped.length > 0) lines.push(`No steps for ${skipped.join(", ")}: the design makes no parts. Run 'opencutplan validate' for the reason.`);
+    if (chosen.length === 0) lines.push("The project has no designs.");
+    return { data: { designs, skipped }, text: lines.join("\n"), warnings: warningLines(loaded) };
+  },
+};
+
+export const reportGroup: GroupSpec = { name: "report", summary: "Reports (read only)", commands: [shopping, sequence, offcuts, labels, cutlist, assembly] };
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm test -w @opencutplan/cli`
Expected: PASS.

- [ ] **Step 5: Run the full check and commit**

Run: `npm run check`
Expected: exit 0.

```bash
git add packages/cli
git commit -m "Add report assembly and the hardware list of report shopping" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The documentation and the agent recipe

**Files:**
- Modify: `docs/cli.md`
- Modify: `docs/format.md`
- Test: `packages/cli/test/flow.test.ts`

**Interfaces:**
- Consumes: every command from Tasks 5 to 7, with the real file system (`real(argv)` in `flow.test.ts`).
- Produces: the `Designs` section, the `report assembly` row, the hardware note, the design recipe, and the convention changes in `docs/cli.md`; the wording fix in `docs/format.md`.

- [ ] **Step 1: Write the recipe test**

Apply this change to `packages/cli/test/flow.test.ts`. The new test runs the recipe of spec §7 in a real temporary directory:

```diff
--- a/packages/cli/test/flow.test.ts
+++ b/packages/cli/test/flow.test.ts
@@ -80,4 +80,25 @@ describe("an agent flow in a real directory", () => {
   });
 
+  it("runs the design recipe in docs/cli.md", async () => {
+    const file = join(dir, "hall.cutplan.json");
+    expect((await real(["new", file, "--name", "Hall storage", "--units", "mm", "--json"])).code).toBe(0);
+    expect((await real(["tools", "add", file, "--type", "track-saw", "--max-cut", "2800", "--position", "1", "--json"])).code).toBe(0);
+    expect((await real(["materials", "add", file, "--name", "Birch ply 18", "--thickness", "18", "--json"])).code).toBe(0);
+    expect((await real(["stock", "add", file, "--length", "2440", "--width", "1220", "--cost", "80", "--json"])).code).toBe(0);
+    const added = await real(["design", "add", file, "--system", "kallax", "--cols", "2", "--rows", "4", "--json"]);
+    expect(added.json().design.id).toBe("kallax-2x4");
+    const optimized = await real(["optimize", file, "--iterations", "200", "--seed", "1", "--strict", "--json"]);
+    expect(optimized.code).toBe(0);
+    expect(optimized.json().after).toMatchObject({ placedCopies: 13, unplacedCopies: 0, errors: 0 });
+    const assembly = await real(["report", "assembly", file, "--json"]);
+    expect(assembly.json().designs[0].steps.length).toBe(7);
+    const shopping = await real(["report", "shopping", file, "--json"]);
+    expect(shopping.json().hardware[0]).toMatchObject({ item: "pocket-screws", quantity: 66, design: "kallax-2x4" });
+    const drawing = await real(["design", "drawing", file, "kallax-2x4", "--out", join(dir, "hall.svg"), "--json"]);
+    expect(drawing.code).toBe(0);
+    expect(await readFile(join(dir, "hall.svg"), "utf8")).toMatch(/^<svg /);
+    expect((await real(["validate", file, "--strict", "--json"])).json()).toMatchObject({ valid: true });
+  });
+
   it("gives exit 3 for a file that is missing or not a project", async () => {
     expect((await real(["show", join(dir, "missing.json")])).code).toBe(3);
```

- [ ] **Step 2: Run the test**

Run: `npm test -w @opencutplan/cli -- flow`
Expected: PASS. The commands exist since Task 7, so this test pins the recipe. If it fails, the recipe in the docs does not work: fix the code, not the test.

- [ ] **Step 3: Update the documentation**

Apply these changes to `docs/cli.md` and `docs/format.md`:

````diff
--- a/docs/cli.md
+++ b/docs/cli.md
@@ -31,6 +31,6 @@ node packages/cli/src/main.ts help parts add
 - `ok` is true only when the exit code is 0. When a command runs but finds errors (exit 1), the document has
   `"ok": false`, the `error`, and the normal data.
-- Error codes are stable words, such as `not-found`, `missing-option`, `invalid-value`, `in-use`, `strict`, and
-  `unreadable-project`. The error can have more fields, such as `option`, `id`, or `known`.
+- Error codes are stable words, such as `not-found`, `missing-option`, `invalid-value`, `in-use`, `generated-part`,
+  `strict`, and `unreadable-project`. The error can have more fields, such as `option`, `id`, or `known`.
 
 ### Exit codes
@@ -39,5 +39,5 @@ node packages/cli/src/main.ts help parts add
 | ---- | ------- |
 | 0 | Success. |
-| 1 | The command ran but found errors: a plan error with `--strict`, an invalid file for `validate`, a material in use, no free spot, a CSV that needs a column map. |
+| 1 | The command ran but found errors: a plan error with `--strict`, an invalid file for `validate`, a material in use, no free spot, a CSV that needs a column map, a change to a generated part, a design with an error. |
 | 2 | A usage error: an unknown command or option, a bad value, a missing argument, or an unknown id. Nothing is read or written. |
 | 3 | The input cannot be read: the file is missing, or it is not a readable OpenCutPlan project. |
@@ -60,8 +60,11 @@ node packages/cli/src/main.ts help parts add
 - When the input file has cut lists (`plan.sheets[].cuts`), the CLI makes them again on each write, so they agree
   with the plan.
+- The CLI makes the parts of each design again on each write, so they agree with the design. A file that was changed
+  by hand gets the correct parts on its next write.
 
 ### Ids
 
-- Ids do not change. `set` commands do not change an id.
+- Ids do not change. `set` commands do not change an id. The one exception is `design set --id`, which also changes
+  the ids of the design parts, and keeps their copies on the sheets.
 - A new id comes from the name, as in the app: `Side panel` becomes `side-panel`, and a used id gets a number, such
   as `side-panel-2`. `--id` gives the id yourself.
@@ -127,4 +130,39 @@ files.
 | `tools move <file> <id>` | Changes the place of a saw in the preference order. | `opencutplan tools move shelf.cutplan.json track-saw --position 1` |
 
+### Designs
+
+A design is a cabinet grid: vertical panels that run the full height, with shelves between them, all joined with
+pocket screws. The CLI makes the parts of the design, and you cannot change them with `parts set` or `parts remove`
+(exit 1, `generated-part`). Change the design, or use `design detach` to make them normal parts.
+
+| Command | What it does | Example |
+| ------- | ------------ | ------- |
+| `design systems` | Lists `kallax`, `eket`, and `custom`, with the IKEA numbers and their sources. It needs no file. | `opencutplan design systems --json` |
+| `design list <file>` | Lists the designs with the outside size and the part counts. | `opencutplan design list hall.cutplan.json` |
+| `design get <file> <id>` | Shows one design, its parts, and its checks. | `opencutplan design get hall.cutplan.json kallax-2x4 --json` |
+| `design add <file>` | Adds a design and makes its parts. | `opencutplan design add hall.cutplan.json --system kallax --cols 2 --rows 4` |
+| `design set <file> <id>` | Changes a design and makes its parts again. | `opencutplan design set hall.cutplan.json kallax-2x4 --rows 5` |
+| `design remove <file> <id>...` | Removes designs, their parts, and the copies on the sheets. | `opencutplan design remove hall.cutplan.json kallax-2x4` |
+| `design detach <file> <id>` | Keeps the parts as normal parts, and removes the design. | `opencutplan design detach hall.cutplan.json kallax-2x4` |
+| `design drawing <file> <id>` | Draws the front view as SVG, to `--out` or to stdout. | `opencutplan design drawing hall.cutplan.json kallax-2x4 --out hall.svg` |
+
+The flags of `design add` and `design set`:
+
+- `--system kallax|eket|custom`. The default for `add` is `custom`.
+- `--cols <n>` and `--rows <n>`. For `kallax`, each cell gets the KALLAX opening (335 mm) and the depth is 390 mm. For
+  `eket`, each cell is one 350 mm module and the depth is 350 mm. A `custom` design also needs `--width` and
+  `--height`.
+- `--width <length>` and `--height <length>`: the outside size. The cells divide it equally.
+- `--column-openings <list>` and `--row-openings <list>`: each opening, for example `335,400`. They replace `--cols`
+  and `--width`, or `--rows` and `--height`.
+- `--depth <length>`, `--material <id|name>`, `--back <id|name|none>`, `--mount floor|legs|feet|wall-rail`,
+  `--quantity <n>`, `--name <text>`, and `--id <id>`.
+
+The IKEA numbers are in millimetres. The CLI converts them to the project units, so an inch project gets 13 3/16" for
+335 mm. Without `--name`, the name is the system and the grid, such as `KALLAX 2x4`, and the id comes from the name:
+`kallax-2x4`. A change that gives a design error, such as stock that is too thin for pocket screws, is refused with
+exit 1 and `invalid-value`, and `error.issues` lists the checks. `design set` gives `partChanges` (the parts that were
+added, removed, or resized) and `removedPlacements` (the copies that went to the tray).
+
 ### Settings
 
@@ -187,4 +225,8 @@ The reports do not change the file.
 | `report labels <file>` | One label for each copy. `--layout` splits them into pages. | `opencutplan report labels shelf.cutplan.json --layout avery-5160` |
 | `report cutlist <file>` | All parts with the size, count, and sheet numbers. | `opencutplan report cutlist shelf.cutplan.json` |
+| `report assembly <file>` | The steps to build each design. `--design <id>` selects one. | `opencutplan report assembly hall.cutplan.json --json` |
+
+`report shopping` also lists the hardware for the designs in `hardware`: the pocket screws, the back screws, the
+glue, and the IKEA legs, feet, or rails, with the IKEA article numbers. The hardware has no prices.
 
 Money in the readable output is `12.00 USD`. In `--json`, money is a number, and `null` means that a price is not
@@ -224,4 +266,19 @@ opencutplan validate $F --strict --json                             # .valid
 ```
 
+This recipe makes a KALLAX 2x4 from a track saw, pocket screws, and one sheet size:
+
+```bash
+F=hall.cutplan.json
+opencutplan new $F --name "Hall storage" --units mm --json
+opencutplan tools add $F --type track-saw --max-cut 2800 --position 1 --json
+opencutplan materials add $F --name "Birch ply 18" --thickness 18 --json
+opencutplan stock add $F --length 2440 --width 1220 --cost 80 --json
+opencutplan design add $F --system kallax --cols 2 --rows 4 --json      # .design.id is kallax-2x4
+opencutplan optimize $F --iterations 200 --seed 1 --strict --json
+opencutplan report assembly $F --json                                   # .designs[].steps[]
+opencutplan report shopping $F --json                                   # .hardware[]
+opencutplan design drawing $F kallax-2x4 --out hall.svg
+```
+
 Some rules help an agent:
 
@@ -229,5 +286,6 @@ Some rules help an agent:
 - Use `--iterations` with `optimize` when a later step compares results.
 - Use `--strict` so that a change with plan errors is not written.
-- Read the id of a new item from the result (`part.id`, `stock.id`, `material.id`), and use it in the next calls.
+- Read the id of a new item from the result (`part.id`, `stock.id`, `material.id`, `design.id`), and use it in the
+  next calls.
 - An error with exit 2 has the name of the bad option or id in `error.option` or `error.id`. Many errors also list the
   known ids in `error.known`.
````

```diff
--- a/docs/format.md
+++ b/docs/format.md
@@ -107,5 +107,5 @@ An **axis** is one of:
 
 - An `outside` axis has openings of (outside − (cells + 1) × *t*) / cells. An `openings` axis has an outside size of
-  the sum of the openings + (cells + 1) × *t*.
+  the sum of the openings + (*n* + 1) × *t*, where *n* is the number of openings.
 - The panel depth is `depth` minus the back thickness.
 - The vertical panels run the full height. Each shelf fits between two vertical panels. All joints are butt joints
```

- [ ] **Step 4: Check that the docs recipe is the tested recipe**

Run: `grep -n "design add \$F --system kallax --cols 2 --rows 4" docs/cli.md && grep -n '"--system", "kallax", "--cols", "2", "--rows", "4"' packages/cli/test/flow.test.ts`
Expected: one line from each file.

- [ ] **Step 5: Run the full check and commit**

Run: `npm run check`
Expected: exit 0.

```bash
git add docs/cli.md docs/format.md packages/cli/test/flow.test.ts
git commit -m "Document the design commands and test the agent recipe" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
