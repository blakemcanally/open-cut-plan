# OpenCutPlan Phase 2 — Cut Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cut analysis to `@opencutplan/core`: the layout validator, the guillotine cut tree, tool assignment, the ordered shop sequence with step text, offcuts, and report data (shopping list, utilization, labels).

**Architecture:** Pure functions over the Phase 1 `Project` type. `planContext(project)` resolves features, planning kerf, trim, and lookups once. `analyzeSheets` builds one cut tree per sheet; the sequencer walks the trees, assigns tools, and orders cuts by sheet or by setup; validators and reports read the same trees. `analyzeProject` computes everything once for the web app. All lengths stay in project units and are compared with `EPSILON = 1e-6`.

**Tech Stack:** unchanged from Phase 1 — Node ≥ 24, TypeScript 7.0.2, Vitest 5.0.2, fast-check 4.10.2. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-27-opencutplan-design.md` (§5.4 validator, §6 cut ordering and shop sequence, §8 feature switches, §9 outputs, §11 testing, §12 phase 2).

## Global Constraints

- No new dependencies. ESM only; relative imports use the `.ts` extension; only erasable TypeScript syntax (no `enum`, `namespace`, parameter properties).
- `packages/core/src` must not use DOM or Node APIs. Every function is pure: it never mutates its input project.
- All lengths are decimal numbers in `project.units`. Compare lengths with `EPSILON` (1e-6) from `src/geometry/rect.ts`.
- Coordinates (spec §4.4): origin at the stock's top-left corner; `x` along the stock length, `y` along the stock width; `rotated: true` means the part length runs along the stock width. A cut with `axis: "x"` is a line of constant x (a crosscut); `axis: "y"` is a line of constant y (a rip, along the grain). A cut's `at` is the kerf centre line.
- Feature switches (spec §8) come from `project.settings.features`: `grain`, `kerf`, `trim`, `cutOrder`, `toolLimits`, `offcuts`, `cost`, `labels`.
- User-facing text uses `formatLength` through `formatIn`/`formatSize` so sizes follow `settings.display`.
- Comments: default to none. Only a comment that carries information the code cannot (an API contract or a non-obvious rule).
- Commit after every task. Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- The repo stays local. Do not add a git remote or push (Block policy; spec §13).

## Review Focus

1. **Positions that are sums of floats** (metric kerf 2.2 mm; inch parts converted from 18 mm): parts exactly one kerf apart are neither `overlap` nor stuck. Pinned in Task 2 (metric sums) and Task 3 (every living-room-shelf sheet has no stuck parts).
2. **A plan that still references a deleted part or a copy past a reduced quantity**: the validator reports it, and the cut tree and sequence skip it without throwing. Pinned in Task 2 and Task 3.
3. **No enabled tool**: the sequence is still produced with `tool: null`, and the validator gives one `no-tool` error, not one per cut. Pinned in Task 5 and Task 7.
4. **An empty sheet in the plan**: no trim cuts, no steps, no offcuts. Pinned in Task 3, Task 5, and Task 8.
5. **Trim narrower than the kerf** (for example 1 mm trim, 3 mm kerf): trim strips have zero size, never negative. Pinned in Task 3.

---

## File Structure

```
packages/core/src/
  geometry/rect.ts        Rect, Size, Axis, EPSILON, span/gap/fit helpers (Task 1)
  plan/issues.ts          PlanIssue, PlanRef, planError, planWarning (Task 1)
  plan/context.ts         planContext, trim, placedRect, grain, labels, isOffcutSize (Task 1)
  plan/layout.ts          checkLayout: geometry and reference checks (Task 2)
  plan/cutTree.ts         buildCutTree, CutNode, nodeItems (Task 3)
  plan/sheets.ts          analyzeSheets: one cut tree per sheet (Task 3)
  sequence/tools.ts       cutKind, toolCanCut, assignTool (Task 4)
  sequence/sequence.ts    Step, sequencePlan, sequenceCuts, withCuts (Task 5)
  sequence/text.ts        describeStep (Task 6)
  plan/validate.ts        validatePlan, checkCuts (Task 7)
  reports/offcuts.ts      listOffcuts, saveOffcutsToStock (Task 8)
  reports/shopping.ts     shoppingList (Task 9)
  reports/labels.ts       partLabels (Task 9)
  analysis.ts             analyzeProject (Task 9)
packages/core/test/
  geometry/rect.test.ts, plan/*.test.ts, sequence/*.test.ts, reports/*.test.ts
docs/cut-analysis.md      (Task 10)
```

Tests import the examples with `../../../../examples/builders/index.ts` (from `packages/core/test/<dir>/`) and the shared `sampleProject()` from `../helpers.ts`. `sampleProject()` is an inch project: material `ply` (grained), stock `ply-4x8` (96 × 48, cost 60, unlimited), part `side` (30 × 12, quantity 2, grain `length`), tool `ts` (table saw, kerf 1/8", maxRip 30), settings trim 1/4", and sheet `s1` with the two copies at (0.25, 0.25) and (0.25, 12.375).

---

### Task 1: Rectangles, plan context, and plan issues

**Files:**
- Create: `packages/core/src/geometry/rect.ts`
- Create: `packages/core/src/plan/issues.ts`
- Create: `packages/core/src/plan/context.ts`
- Create: `packages/core/test/geometry/rect.test.ts`
- Create: `packages/core/test/plan/context.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `Project`, `Part`, `Placement`, `Stock`, `Tool`, `Features`, `Material` from `src/format/schema.ts`; `IssueSeverity` from `src/format/issues.ts`; `formatLength`, `DisplayPrecision` from `src/geometry/format.ts`; `Units` from `src/geometry/units.ts`.
- Produces: `Axis`, `Size`, `Rect`, `EPSILON`, `otherAxis`, `span`, `sizeAlong`, `withSpan`, `gapAlong`, `area`, `inset`, `contains`, `sameRect`, `fitsWithin`; `PlanIssueCode`, `PlanRef`, `PlanIssue`, `planError`, `planWarning`; `DEFAULT_MIN_OFFCUT`, `PlanContext`, `planContext`, `formatIn`, `formatSize`, `trimFor`, `stockRect`, `usableRect`, `placedRect`, `canRotate`, `grainOk`, `copyLabel`, `materialName`, `stockLabel`, `isOffcutSize`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/geometry/rect.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { area, contains, fitsWithin, gapAlong, inset, otherAxis, sameRect, sizeAlong, span, withSpan, type Rect } from "../../src/index.ts";

const r = (x: number, y: number, length: number, width: number): Rect => ({ x, y, length, width });

describe("rect helpers", () => {
  it("measures spans and sizes along each axis", () => {
    const rect = r(1, 2, 10, 5);
    expect(span(rect, "x")).toEqual([1, 11]);
    expect(span(rect, "y")).toEqual([2, 7]);
    expect(sizeAlong(rect, "x")).toBe(10);
    expect(sizeAlong(rect, "y")).toBe(5);
    expect(otherAxis("x")).toBe("y");
    expect(area(rect)).toBe(50);
  });

  it("replaces the span along one axis", () => {
    expect(withSpan(r(0, 0, 10, 5), "x", 2, 4)).toEqual(r(2, 0, 2, 5));
    expect(withSpan(r(0, 0, 10, 5), "y", 1, 3)).toEqual(r(0, 1, 10, 2));
  });

  it("gives the gap between rectangles, negative when they overlap", () => {
    expect(gapAlong(r(0, 0, 10, 5), r(12, 0, 3, 5), "x")).toBe(2);
    expect(gapAlong(r(12, 0, 3, 5), r(0, 0, 10, 5), "x")).toBe(2);
    expect(gapAlong(r(0, 0, 10, 5), r(8, 0, 3, 5), "x")).toBe(-2);
  });

  it("insets, compares, and checks containment with a tolerance", () => {
    expect(inset(r(0, 0, 96, 48), 0.25)).toEqual(r(0.25, 0.25, 95.5, 47.5));
    expect(contains(r(0, 0, 10, 10), r(0, 0, 10 + 1e-9, 10))).toBe(true);
    expect(contains(r(0, 0, 10, 10), r(0, 0, 10.001, 10))).toBe(false);
    expect(sameRect(r(0.1 + 0.2, 0, 1, 1), r(0.3, 0, 1, 1))).toBe(true);
  });

  it("fits a size in either orientation", () => {
    expect(fitsWithin({ length: 20, width: 40 }, { length: 48, width: 24 })).toBe(true);
    expect(fitsWithin({ length: 30, width: 30 }, { length: 48, width: 24 })).toBe(false);
  });
});
```

`packages/core/test/plan/context.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  canRotate,
  copyLabel,
  DEFAULT_MIN_OFFCUT,
  formatSize,
  grainOk,
  isOffcutSize,
  placedRect,
  planContext,
  stockLabel,
  trimFor,
  usableRect,
  type Project,
} from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

function project(patch: (p: Project) => void = () => {}): Project {
  const p = sampleProject();
  patch(p);
  return p;
}

describe("planContext", () => {
  it("uses the largest kerf among enabled tools", () => {
    const ctx = planContext(
      project((p) => {
        p.tools.push({ id: "track", name: "Track saw", type: "track-saw", kerf: 0.0625, enabled: true });
        p.tools.push({ id: "old", name: "Old saw", type: "circular-saw", kerf: 0.25, enabled: false });
      }),
    );
    expect(ctx.kerf).toBe(0.125);
    expect(ctx.tools.map((tool) => tool.id)).toEqual(["ts", "track"]);
  });

  it("uses kerf 0 when the kerf feature is off or no tool is enabled", () => {
    expect(planContext(project((p) => (p.settings.features.kerf = false))).kerf).toBe(0);
    expect(planContext(project((p) => (p.tools[0]!.enabled = false))).kerf).toBe(0);
  });

  it("defaults the minimum offcut by units", () => {
    expect(planContext(project()).minOffcut).toEqual(DEFAULT_MIN_OFFCUT.in);
    expect(planContext(project((p) => (p.settings.minOffcut = { length: 20, width: 10 }))).minOffcut).toEqual({ length: 20, width: 10 });
  });

  it("resolves trim from the stock, then settings, and 0 when the trim feature is off", () => {
    const p = project();
    const stock = p.stock[0]!;
    expect(trimFor(planContext(p), stock)).toBe(0.25);
    expect(trimFor(planContext(p), { ...stock, trim: 0.5 })).toBe(0.5);
    p.settings.features.trim = false;
    expect(trimFor(planContext(p), { ...stock, trim: 0.5 })).toBe(0);
    expect(usableRect(planContext(p), stock)).toEqual({ x: 0, y: 0, length: 96, width: 48 });
  });

  it("swaps length and width for rotated placements", () => {
    const part = project().parts[0]!;
    expect(placedRect(part, { part: "side", copy: 0, x: 1, y: 2, rotated: false })).toEqual({ x: 1, y: 2, length: 30, width: 12 });
    expect(placedRect(part, { part: "side", copy: 0, x: 1, y: 2, rotated: true })).toEqual({ x: 1, y: 2, length: 12, width: 30 });
  });

  it("allows rotation only when grain does not constrain the part", () => {
    const p = project();
    const part = p.parts[0]!;
    expect(canRotate(planContext(p), part)).toBe(false);
    expect(canRotate(planContext(p), { ...part, grain: "none" })).toBe(true);
    expect(grainOk(planContext(p), part, false)).toBe(true);
    expect(grainOk(planContext(p), part, true)).toBe(false);
    expect(grainOk(planContext(p), { ...part, grain: "width" }, true)).toBe(true);
    p.materials[0]!.grained = false;
    expect(canRotate(planContext(p), part)).toBe(true);
    p.materials[0]!.grained = true;
    p.settings.features.grain = false;
    expect(grainOk(planContext(p), part, true)).toBe(true);
  });

  it("labels copies, sizes, and stock", () => {
    const p = project();
    const ctx = planContext(p);
    expect(copyLabel(p.parts[0]!, 1)).toBe("Side 2");
    expect(copyLabel({ ...p.parts[0]!, quantity: 1 }, 0)).toBe("Side");
    expect(formatSize(ctx, { length: 15.375, width: 12 })).toBe('15 3/8" × 12"');
    expect(stockLabel(ctx, p.stock[0]!)).toBe('Plywood 3/4 96" × 48"');
    expect(stockLabel(ctx, { ...p.stock[0]!, name: "Shop plywood" })).toBe("Shop plywood");
  });

  it("sizes offcuts against the minimum in either orientation", () => {
    const p = project();
    expect(isOffcutSize(planContext(p), { length: 6, width: 12 })).toBe(true);
    expect(isOffcutSize(planContext(p), { length: 11.9, width: 20 })).toBe(true);
    expect(isOffcutSize(planContext(p), { length: 5.9, width: 30 })).toBe(false);
    p.settings.features.offcuts = false;
    expect(isOffcutSize(planContext(p), { length: 40, width: 40 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --root packages/core test/geometry/rect.test.ts test/plan/context.test.ts`
Expected: FAIL — the new exports do not exist yet ("does not provide an export named …").

- [ ] **Step 3: Implement**

`packages/core/src/geometry/rect.ts`:

```ts
export type Axis = "x" | "y";

export interface Size {
  length: number;
  width: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

/** Tolerance for comparing lengths, in project units. */
export const EPSILON = 1e-6;

export function otherAxis(axis: Axis): Axis {
  return axis === "x" ? "y" : "x";
}

export function span(rect: Rect, axis: Axis): [number, number] {
  return axis === "x" ? [rect.x, rect.x + rect.length] : [rect.y, rect.y + rect.width];
}

export function sizeAlong(rect: Size, axis: Axis): number {
  return axis === "x" ? rect.length : rect.width;
}

export function withSpan(rect: Rect, axis: Axis, start: number, end: number): Rect {
  return axis === "x" ? { ...rect, x: start, length: end - start } : { ...rect, y: start, width: end - start };
}

/** Distance between two rectangles along an axis; negative when their extents overlap. */
export function gapAlong(a: Rect, b: Rect, axis: Axis): number {
  const [a0, a1] = span(a, axis);
  const [b0, b1] = span(b, axis);
  return Math.max(b0 - a1, a0 - b1);
}

export function area(rect: Size): number {
  return rect.length * rect.width;
}

export function inset(rect: Rect, by: number): Rect {
  return { x: rect.x + by, y: rect.y + by, length: rect.length - 2 * by, width: rect.width - 2 * by };
}

export function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x - EPSILON &&
    inner.y >= outer.y - EPSILON &&
    inner.x + inner.length <= outer.x + outer.length + EPSILON &&
    inner.y + inner.width <= outer.y + outer.width + EPSILON
  );
}

export function sameRect(a: Rect, b: Rect): boolean {
  return (
    Math.abs(a.x - b.x) <= EPSILON &&
    Math.abs(a.y - b.y) <= EPSILON &&
    Math.abs(a.length - b.length) <= EPSILON &&
    Math.abs(a.width - b.width) <= EPSILON
  );
}

/** True when `size` fits inside `limit` in either orientation. */
export function fitsWithin(size: Size, limit: Size): boolean {
  const [s1, s2] = [Math.max(size.length, size.width), Math.min(size.length, size.width)];
  const [l1, l2] = [Math.max(limit.length, limit.width), Math.min(limit.length, limit.width)];
  return s1 <= l1 + EPSILON && s2 <= l2 + EPSILON;
}
```

`packages/core/src/plan/issues.ts`:

```ts
import type { IssueSeverity } from "../format/issues.ts";

export type PlanIssueCode =
  | "off-sheet"
  | "overlap"
  | "wrong-material"
  | "grain"
  | "not-guillotine"
  | "no-tool"
  | "unplaced"
  | "stock-exceeded"
  | "bad-ref"
  | "bad-copy"
  | "duplicate-placement";

/** `placement.index` is the placement's index in `plan.sheets[].placements`; `cut.step` is a sequence step number. */
export type PlanRef =
  | { kind: "sheet"; sheet: string }
  | { kind: "placement"; sheet: string; index: number }
  | { kind: "part"; part: string; copy: number }
  | { kind: "stock"; stock: string }
  | { kind: "cut"; sheet: string; step: number };

export interface PlanIssue {
  severity: IssueSeverity;
  code: PlanIssueCode;
  message: string;
  refs: PlanRef[];
}

export function planError(code: PlanIssueCode, message: string, refs: PlanRef[] = []): PlanIssue {
  return { severity: "error", code, message, refs };
}

export function planWarning(code: PlanIssueCode, message: string, refs: PlanRef[] = []): PlanIssue {
  return { severity: "warning", code, message, refs };
}
```

`packages/core/src/plan/context.ts`:

```ts
import type { Features, Material, Part, Placement, Project, Stock, Tool } from "../format/schema.ts";
import { formatLength, type DisplayPrecision } from "../geometry/format.ts";
import { fitsWithin, inset, type Rect, type Size } from "../geometry/rect.ts";
import type { Units } from "../geometry/units.ts";

export const DEFAULT_MIN_OFFCUT: Readonly<Record<Units, Size>> = {
  in: { length: 12, width: 6 },
  mm: { length: 300, width: 150 },
};

export interface PlanContext {
  project: Project;
  units: Units;
  display: DisplayPrecision;
  features: Features;
  /** Enabled tools in profile order. */
  tools: Tool[];
  /** The largest kerf among enabled tools, or 0 when the kerf feature is off. */
  kerf: number;
  minOffcut: Size;
  materials: ReadonlyMap<string, Material>;
  stock: ReadonlyMap<string, Stock>;
  parts: ReadonlyMap<string, Part>;
}

export function planContext(project: Project): PlanContext {
  const { settings } = project;
  const tools = project.tools.filter((tool) => tool.enabled);
  return {
    project,
    units: project.project.units,
    display: settings.display,
    features: settings.features,
    tools,
    kerf: settings.features.kerf ? Math.max(0, ...tools.map((tool) => tool.kerf)) : 0,
    minOffcut: settings.minOffcut ?? DEFAULT_MIN_OFFCUT[project.project.units],
    materials: byId(project.materials),
    stock: byId(project.stock),
    parts: byId(project.parts),
  };
}

function byId<T extends { id: string }>(items: readonly T[]): ReadonlyMap<string, T> {
  const map = new Map<string, T>();
  for (const item of items) if (!map.has(item.id)) map.set(item.id, item);
  return map;
}

export function formatIn(ctx: PlanContext, value: number): string {
  return formatLength(value, ctx.units, ctx.display);
}

export function formatSize(ctx: PlanContext, size: Size): string {
  return `${formatIn(ctx, size.length)} × ${formatIn(ctx, size.width)}`;
}

export function trimFor(ctx: PlanContext, stock: Stock): number {
  return ctx.features.trim ? (stock.trim ?? ctx.project.settings.trim) : 0;
}

export function stockRect(stock: Stock): Rect {
  return { x: 0, y: 0, length: stock.length, width: stock.width };
}

export function usableRect(ctx: PlanContext, stock: Stock): Rect {
  return inset(stockRect(stock), trimFor(ctx, stock));
}

export function placedRect(part: Part, placement: Placement): Rect {
  return placement.rotated
    ? { x: placement.x, y: placement.y, length: part.width, width: part.length }
    : { x: placement.x, y: placement.y, length: part.length, width: part.width };
}

/** A part may rotate when its grain is "none", its material is not grained, or the grain feature is off. */
export function canRotate(ctx: PlanContext, part: Part): boolean {
  if (!ctx.features.grain || part.grain === "none") return true;
  return ctx.materials.get(part.material)?.grained !== true;
}

export function grainOk(ctx: PlanContext, part: Part, rotated: boolean): boolean {
  return canRotate(ctx, part) || rotated === (part.grain === "width");
}

export function copyLabel(part: Part, copy: number): string {
  return part.quantity > 1 ? `${part.name} ${copy + 1}` : part.name;
}

export function materialName(ctx: PlanContext, id: string): string {
  return ctx.materials.get(id)?.name ?? id;
}

export function stockLabel(ctx: PlanContext, stock: Stock): string {
  return stock.name ?? `${materialName(ctx, stock.material)} ${formatSize(ctx, stock)}`;
}

/** Waste at least `minOffcut` in both dimensions (either orientation) is an offcut; never when the offcuts feature is off. */
export function isOffcutSize(ctx: PlanContext, size: Size): boolean {
  return ctx.features.offcuts && fitsWithin(ctx.minOffcut, size);
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./geometry/rect.ts";
export * from "./plan/issues.ts";
export * from "./plan/context.ts";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --root packages/core test/geometry/rect.test.ts test/plan/context.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole check, then commit**

Run: `npm run check`
Expected: typecheck clean, all tests pass.

```bash
git add packages/core/src/geometry/rect.ts packages/core/src/plan/issues.ts packages/core/src/plan/context.ts packages/core/test/geometry/rect.test.ts packages/core/test/plan/context.test.ts packages/core/src/index.ts
git commit -m "feat(core): add rectangles, plan context, and plan issues" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Layout checks

**Files:**
- Create: `packages/core/src/plan/layout.ts`
- Create: `packages/core/test/plan/layout.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: Task 1 context helpers and `planError`/`planWarning`.
- Produces: `checkLayout(ctx: PlanContext): PlanIssue[]` — codes `bad-ref`, `bad-copy`, `duplicate-placement`, `wrong-material`, `grain`, `off-sheet`, `overlap`, `stock-exceeded`, `unplaced`, in that order per sheet, then stock, then parts.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/plan/layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import { checkLayout, createProject, parseProject, planContext, type Placement, type Project, type ProjectInput } from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

function check(project: Project) {
  return checkLayout(planContext(project));
}

function withPlacements(placements: Placement[], patch: (p: Project) => void = () => {}): Project {
  const project = sampleProject();
  project.plan!.sheets[0]!.placements = placements;
  patch(project);
  return project;
}

function load(input: ProjectInput): Project {
  const result = parseProject(input);
  if (!result.ok) throw new Error(result.errors.map((issue) => issue.message).join("\n"));
  return result.project;
}

const at = (x: number, y: number, copy = 0, rotated = false): Placement => ({ part: "side", copy, x, y, rotated });

describe("checkLayout", () => {
  it("accepts the sample project", () => {
    expect(check(sampleProject())).toEqual([]);
  });

  it("accepts both examples' layouts", () => {
    expect(check(load(EXAMPLES["living-room-shelf"]!()))).toEqual([]);
    const bookcase = check(load(EXAMPLES["simple-bookcase-mm"]!()));
    expect(bookcase.map((issue) => issue.code)).toEqual(["unplaced", "unplaced", "unplaced", "unplaced"]);
  });

  it("reports a part in the trim zone, and allows it when trim is off", () => {
    const project = withPlacements([at(0.1, 0.25), at(0.25, 12.375, 1)]);
    expect(check(project)).toEqual([
      {
        severity: "error",
        code: "off-sheet",
        message: 'Side 1 extends past the sheet or into the 1/4" edge trim.',
        refs: [{ kind: "placement", sheet: "s1", index: 0 }],
      },
    ]);
    project.settings.features.trim = false;
    expect(check(project)).toEqual([]);
  });

  it("reports a part past the sheet edge", () => {
    const project = withPlacements([at(70, 0.25), at(0.25, 12.375, 1)], (p) => (p.settings.trim = 0));
    expect(check(project)[0]).toMatchObject({ code: "off-sheet", message: "Side 1 extends past the sheet." });
  });

  it("reports overlapping parts and parts closer than the kerf", () => {
    expect(check(withPlacements([at(0.25, 0.25), at(10, 5, 1)]))).toEqual([
      {
        severity: "error",
        code: "overlap",
        message: "Side 1 and Side 2 overlap.",
        refs: [
          { kind: "placement", sheet: "s1", index: 0 },
          { kind: "placement", sheet: "s1", index: 1 },
        ],
      },
    ]);
    expect(check(withPlacements([at(0.25, 0.25), at(0.25, 12.3, 1)]))[0]).toMatchObject({
      code: "overlap",
      message: 'Side 1 and Side 2 are closer than the 1/8" kerf.',
    });
  });

  it("lets parts touch when the kerf feature is off", () => {
    const project = withPlacements([at(0.25, 0.25), at(0.25, 12.25, 1)]);
    expect(check(project).map((issue) => issue.code)).toEqual(["overlap"]);
    project.settings.features.kerf = false;
    expect(check(project)).toEqual([]);
  });

  it("accepts metric parts exactly one kerf apart when positions are sums", () => {
    const project = createProject("Metric", "mm");
    project.materials = [{ id: "mdf", name: "MDF", thickness: 18, grained: false }];
    project.stock = [{ id: "sheet", material: "mdf", length: 2440, width: 1220, quantity: null, kind: "sheet" }];
    project.parts = [{ id: "shelf", name: "Shelf", material: "mdf", length: 762.3, width: 280.1, quantity: 3, grain: "none" }];
    project.tools = [{ id: "ts", name: "Table saw", type: "table-saw", kerf: 2.2, enabled: true }];
    let y = 6;
    const placements: Placement[] = [];
    for (let copy = 0; copy < 3; copy++) {
      placements.push({ part: "shelf", copy, x: 6, y, rotated: false });
      y += 280.1 + 2.2;
    }
    project.plan = { sheets: [{ id: "s1", stock: "sheet", placements }] };
    expect(check(project)).toEqual([]);
  });

  it("reports the wrong material", () => {
    const project = withPlacements([at(0.25, 0.25), at(0.25, 12.375, 1)], (p) => {
      p.materials.push({ id: "mdf", name: "MDF 1/2", thickness: 0.5, grained: false });
      p.stock[0]!.material = "mdf";
    });
    expect(check(project).map((issue) => issue.message)).toEqual([
      "Side 1 is Plywood 3/4, but Sheet 1 is MDF 1/2.",
      "Side 2 is Plywood 3/4, but Sheet 1 is MDF 1/2.",
    ]);
  });

  it("reports grain across the sheet only when grain matters", () => {
    const project = withPlacements([at(0.25, 0.25, 0, true), at(12.5, 0.25, 1, true)]);
    expect(check(project).map((issue) => issue.message)).toEqual([
      "Side 1 is turned so its grain runs across the sheet's grain.",
      "Side 2 is turned so its grain runs across the sheet's grain.",
    ]);
    project.settings.features.grain = false;
    expect(check(project)).toEqual([]);
  });

  it("reports bad references, bad copies, and duplicate placements", () => {
    const project = withPlacements([at(0.25, 0.25), { ...at(0.25, 12.375, 1), part: "gone" }, at(40, 0.25, 5), at(40, 12.375, 0)]);
    project.plan!.sheets.push({ id: "s2", stock: "missing", placements: [] });
    expect(check(project).map((issue) => [issue.code, issue.message])).toEqual([
      ["bad-ref", 'Sheet 1 places part "gone", which does not exist.'],
      ["bad-copy", "Sheet 1 places copy 6 of Side, but its quantity is 2."],
      ["duplicate-placement", "Side 1 is placed more than once."],
      ["bad-ref", 'Sheet 2 uses stock "missing", which does not exist.'],
      ["unplaced", "1 of 2 copies of Side are not placed on any sheet."],
    ]);
  });

  it("reports more sheets than the stock quantity", () => {
    const project = sampleProject();
    project.stock[0]!.quantity = 1;
    project.plan!.sheets.push({ id: "s2", stock: "ply-4x8", placements: [] });
    expect(check(project)).toEqual([
      {
        severity: "error",
        code: "stock-exceeded",
        message: 'The plan uses 2 sheets of Plywood 3/4 96" × 48", but only 1 is available.',
        refs: [{ kind: "stock", stock: "ply-4x8" }],
      },
    ]);
  });

  it("reports unplaced copies once per part", () => {
    const project = withPlacements([at(0.25, 0.25, 1)]);
    project.parts.push({ id: "top", name: "Top", material: "ply", length: 20, width: 12, quantity: 1, grain: "length" });
    expect(check(project)).toEqual([
      { severity: "warning", code: "unplaced", message: "1 of 2 copies of Side are not placed on any sheet.", refs: [{ kind: "part", part: "side", copy: 0 }] },
      { severity: "warning", code: "unplaced", message: "Top is not placed on any sheet.", refs: [{ kind: "part", part: "top", copy: 0 }] },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --root packages/core test/plan/layout.test.ts`
Expected: FAIL — the new exports do not exist yet ("does not provide an export named …").

- [ ] **Step 3: Implement**

`packages/core/src/plan/layout.ts`:

```ts
import { contains, EPSILON, gapAlong, type Rect } from "../geometry/rect.ts";
import {
  copyLabel,
  formatIn,
  grainOk,
  materialName,
  placedRect,
  stockLabel,
  trimFor,
  usableRect,
  type PlanContext,
} from "./context.ts";
import { planError, planWarning, type PlanIssue, type PlanRef } from "./issues.ts";

interface Placed {
  ref: PlanRef;
  label: string;
  rect: Rect;
}

export function checkLayout(ctx: PlanContext): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const placedCopies = new Map<string, Set<number>>();
  const sheetsUsed = new Map<string, number>();

  (ctx.project.plan?.sheets ?? []).forEach((sheet, sheetIndex) => {
    const sheetName = `Sheet ${sheetIndex + 1}`;
    const stock = ctx.stock.get(sheet.stock);
    if (stock) sheetsUsed.set(stock.id, (sheetsUsed.get(stock.id) ?? 0) + 1);
    else issues.push(planError("bad-ref", `${sheetName} uses stock "${sheet.stock}", which does not exist.`, [{ kind: "sheet", sheet: sheet.id }]));

    const placed: Placed[] = [];
    sheet.placements.forEach((placement, index) => {
      const ref: PlanRef = { kind: "placement", sheet: sheet.id, index };
      const part = ctx.parts.get(placement.part);
      if (!part) {
        issues.push(planError("bad-ref", `${sheetName} places part "${placement.part}", which does not exist.`, [ref]));
        return;
      }
      if (placement.copy >= part.quantity) {
        issues.push(
          planError("bad-copy", `${sheetName} places copy ${placement.copy + 1} of ${part.name}, but its quantity is ${part.quantity}.`, [ref]),
        );
        return;
      }
      const label = copyLabel(part, placement.copy);
      const copies = placedCopies.get(part.id) ?? new Set<number>();
      if (copies.has(placement.copy)) {
        issues.push(planError("duplicate-placement", `${label} is placed more than once.`, [ref]));
        return;
      }
      copies.add(placement.copy);
      placedCopies.set(part.id, copies);

      const rect = placedRect(part, placement);
      placed.push({ ref, label, rect });
      if (!stock) return;
      if (part.material !== stock.material) {
        issues.push(
          planError("wrong-material", `${label} is ${materialName(ctx, part.material)}, but ${sheetName} is ${materialName(ctx, stock.material)}.`, [ref]),
        );
      }
      if (!grainOk(ctx, part, placement.rotated)) {
        issues.push(planError("grain", `${label} is turned so its grain runs across the sheet's grain.`, [ref]));
      }
      if (!contains(usableRect(ctx, stock), rect)) {
        const trim = trimFor(ctx, stock);
        const message = trim > 0 ? `${label} extends past the sheet or into the ${formatIn(ctx, trim)} edge trim.` : `${label} extends past the sheet.`;
        issues.push(planError("off-sheet", message, [ref]));
      }
    });

    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!;
        const b = placed[j]!;
        const gapX = gapAlong(a.rect, b.rect, "x");
        const gapY = gapAlong(a.rect, b.rect, "y");
        if (gapX >= ctx.kerf - EPSILON || gapY >= ctx.kerf - EPSILON) continue;
        const message =
          gapX < -EPSILON && gapY < -EPSILON
            ? `${a.label} and ${b.label} overlap.`
            : `${a.label} and ${b.label} are closer than the ${formatIn(ctx, ctx.kerf)} kerf.`;
        issues.push(planError("overlap", message, [a.ref, b.ref]));
      }
    }
  });

  for (const [stockId, used] of sheetsUsed) {
    const stock = ctx.stock.get(stockId)!;
    if (stock.quantity === null || used <= stock.quantity) continue;
    issues.push(
      planError("stock-exceeded", `The plan uses ${used} sheets of ${stockLabel(ctx, stock)}, but only ${stock.quantity} ${stock.quantity === 1 ? "is" : "are"} available.`, [
        { kind: "stock", stock: stockId },
      ]),
    );
  }

  for (const part of ctx.project.parts) {
    const copies = placedCopies.get(part.id);
    const missing: number[] = [];
    for (let copy = 0; copy < part.quantity; copy++) if (!copies?.has(copy)) missing.push(copy);
    if (missing.length === 0) continue;
    const message =
      part.quantity === 1
        ? `${part.name} is not placed on any sheet.`
        : `${missing.length} of ${part.quantity} copies of ${part.name} are not placed on any sheet.`;
    issues.push(planWarning("unplaced", message, missing.map((copy) => ({ kind: "part", part: part.id, copy }))));
  }

  return issues;
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./plan/layout.ts";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --root packages/core test/plan/layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole check, then commit**

Run: `npm run check`
Expected: typecheck clean, all tests pass.

```bash
git add packages/core/src/plan/layout.ts packages/core/test/plan/layout.test.ts packages/core/src/index.ts
git commit -m "feat(core): check plan layouts for geometry, grain, stock, and reference problems" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Guillotine cut tree and sheet analysis

**Files:**
- Create: `packages/core/src/plan/cutTree.ts`
- Create: `packages/core/src/plan/sheets.ts`
- Create: `packages/core/test/plan/cutTree.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: Task 1 rect helpers, `placedRect`, `stockRect`, `trimFor`, `PlanContext`.
- Produces: `TreeItem {index, rect}`; `CutNode` (union of `part`/`waste`/`stuck`/`split`); `TrimCut {axis, at, piece, released, remainder}`; `CutTree {trims, root, stuck: number[][]}`; `buildCutTree(sheet: Rect, items: readonly TreeItem[], kerf: number, trim: number): CutTree`; `nodeItems(node): number[]`; `SheetAnalysis {sheet, index, stock, trim, items, tree}`; `analyzeSheets(ctx): SheetAnalysis[]`.

The property test generates random guillotine layouts on multiples of 1/8 so every position is exact in binary floating point; 300 runs take well under a second.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/plan/cutTree.test.ts`:

```ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import {
  analyzeSheets,
  buildCutTree,
  nodeItems,
  parseProject,
  planContext,
  span,
  otherAxis,
  type CutNode,
  type Rect,
  type TreeItem,
} from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

const r = (x: number, y: number, length: number, width: number): Rect => ({ x, y, length, width });
const items = (...rects: Rect[]): TreeItem[] => rects.map((rect, index) => ({ index, rect }));

function parts(node: CutNode): number[] {
  if (node.kind === "part") return [node.item];
  if (node.kind === "split") return node.children.flatMap(parts);
  return [];
}

function wastes(node: CutNode): Rect[] {
  if (node.kind === "waste") return [node.rect];
  if (node.kind === "split") return node.children.flatMap(wastes);
  return [];
}

describe("buildCutTree", () => {
  it("returns a part leaf when the part fills the region", () => {
    const tree = buildCutTree(r(0, 0, 10, 5), items(r(0, 0, 10, 5)), 0.125, 0);
    expect(tree).toEqual({ trims: [], root: { kind: "part", rect: r(0, 0, 10, 5), stage: 1, item: 0 }, stuck: [] });
  });

  it("trims each factory edge first, with the kerf inside the trim", () => {
    const tree = buildCutTree(r(0, 0, 96, 48), items(r(0.25, 0.25, 95.5, 47.5)), 0.125, 0.25);
    expect(tree.trims.map((cut) => [cut.axis, cut.at])).toEqual([
      ["y", 0.1875],
      ["y", 47.8125],
      ["x", 0.1875],
      ["x", 95.8125],
    ]);
    expect(tree.trims[0]!.released).toEqual(r(0, 0, 96, 0.125));
    expect(tree.trims[1]!.piece).toEqual(r(0, 0.25, 96, 47.75));
    expect(tree.trims[3]!.remainder).toEqual(r(0.25, 0.25, 95.5, 47.5));
    expect(tree.root).toMatchObject({ kind: "part", item: 0 });
  });

  it("gives zero-size trim strips when the trim is narrower than the kerf", () => {
    const tree = buildCutTree(r(0, 0, 100, 50), items(r(1, 1, 98, 48)), 3, 1);
    expect(tree.trims.map((cut) => cut.released.width * cut.released.length)).toEqual([0, 0, 0, 0]);
    expect(tree.root).toMatchObject({ kind: "part" });
  });

  it("rips strips first and crosscuts inside them", () => {
    const k = 0.125;
    const tree = buildCutTree(r(0, 0, 20 + k, 10 + k + 5), items(r(0, 0, 10, 10), r(10 + k, 0, 10, 10), r(0, 10 + k, 20 + k, 5)), k, 0);
    expect(tree.stuck).toEqual([]);
    expect(tree.root).toMatchObject({ kind: "split", axis: "y", stage: 1, cuts: [10 + k / 2] });
    const root = tree.root as Extract<CutNode, { kind: "split" }>;
    expect(root.children[0]).toMatchObject({ kind: "split", axis: "x", stage: 2, cuts: [10 + k / 2] });
    expect(root.children[1]).toMatchObject({ kind: "part", item: 2, stage: 2 });
  });

  it("crosscuts first when no rip runs across the sheet", () => {
    const tree = buildCutTree(r(0, 0, 21, 10), items(r(0, 0, 10, 4), r(0, 5, 10, 5), r(11, 0, 10, 10)), 1, 0);
    expect(tree.root).toMatchObject({ kind: "split", axis: "x", stage: 1, cuts: [10.5] });
  });

  it("cuts waste away from a part with one cut per side", () => {
    const tree = buildCutTree(r(0, 0, 50, 40), items(r(0, 0, 30, 12)), 0.125, 0);
    expect(tree.root).toMatchObject({ kind: "split", axis: "y", cuts: [12.0625] });
    const root = tree.root as Extract<CutNode, { kind: "split" }>;
    expect(root.children[0]).toMatchObject({ kind: "split", axis: "x", cuts: [30.0625] });
    expect(wastes(tree.root)).toEqual([r(30.125, 0, 19.875, 12), r(0, 12.125, 50, 27.875)]);
  });

  it("separates touching parts when the kerf is 0", () => {
    const tree = buildCutTree(r(0, 0, 20, 10), items(r(0, 0, 10, 10), r(10, 0, 10, 10)), 0, 0);
    expect(tree.root).toMatchObject({ kind: "split", axis: "x", cuts: [10] });
    expect(parts(tree.root)).toEqual([0, 1]);
  });

  it("uses two cuts, with a zero-size waste piece, when a gap is between one and two kerfs", () => {
    const tree = buildCutTree(r(0, 0, 10, 21.5), items(r(0, 0, 10, 10), r(0, 11.5, 10, 10)), 1, 0);
    const root = tree.root as Extract<CutNode, { kind: "split" }>;
    expect(root.cuts).toEqual([10.5, 11]);
    expect(root.children[1]).toEqual({ kind: "waste", rect: r(0, 11, 10, 0), stage: 2 });
  });

  it("reports parts closer than the kerf as stuck", () => {
    const tree = buildCutTree(r(0, 0, 10, 20.5), items(r(0, 0, 10, 10), r(0, 10.5, 10, 10)), 1, 0);
    expect(tree.stuck).toEqual([[0, 1]]);
  });

  it("reports a pinwheel as stuck", () => {
    const pinwheel = items(r(0, 0, 2, 1), r(2, 0, 1, 2), r(1, 2, 2, 1), r(0, 1, 1, 2), r(1, 1, 1, 1));
    const tree = buildCutTree(r(0, 0, 3, 3), pinwheel, 0, 0);
    expect(tree.root.kind).toBe("stuck");
    expect(tree.stuck).toEqual([[0, 1, 2, 3, 4]]);
  });

  it("frees a crosscut that is valid only after a rip", () => {
    const tree = buildCutTree(r(0, 0, 20, 10), items(r(0, 0, 8, 5), r(12, 5, 8, 5)), 0, 0);
    expect(tree.stuck).toEqual([]);
    expect(tree.root).toMatchObject({ kind: "split", axis: "y", cuts: [5] });
  });

  it("accepts random guillotine layouts and never cuts through a part", () => {
    fc.assert(
      fc.property(fc.integer(), fc.constantFrom(0, 0.125, 0.25), (seed, kerf) => {
        const random = mulberry32(seed);
        const region = r(0, 0, 96, 48);
        const rects: Rect[] = [];
        guillotine(random, region, kerf, 5, rects);
        const tree = buildCutTree(region, items(...rects), kerf, 0);
        expect(tree.stuck).toEqual([]);
        expect(parts(tree.root).sort((a, b) => a - b)).toEqual(rects.map((_, i) => i));
        assertCutsMissParts(tree.root, rects, kerf);
      }),
      { numRuns: 300 },
    );
  });
});

describe("analyzeSheets", () => {
  it("builds a tree for every sheet of the living-room shelf with no stuck parts", () => {
    const result = parseProject(EXAMPLES["living-room-shelf"]!());
    if (!result.ok) throw new Error("example did not load");
    const sheets = analyzeSheets(planContext(result.project));
    expect(sheets).toHaveLength(7);
    for (const sheet of sheets) {
      expect(sheet.tree.stuck).toEqual([]);
      expect(sheet.tree.trims).toHaveLength(4);
      expect(parts(sheet.tree.root)).toHaveLength(sheet.sheet.placements.length);
    }
  });

  it("skips bad placements and sheets with missing stock, and gives empty sheets no cuts", () => {
    const project = sampleProject();
    project.plan!.sheets[0]!.placements.push({ part: "gone", copy: 0, x: 50, y: 1, rotated: false });
    project.plan!.sheets[0]!.placements.push({ part: "side", copy: 7, x: 50, y: 20, rotated: false });
    project.plan!.sheets.push({ id: "s2", stock: "missing", placements: [] });
    project.plan!.sheets.push({ id: "s3", stock: "ply-4x8", placements: [{ part: "side", copy: 0, x: 1, y: 1, rotated: false }] });
    const sheets = analyzeSheets(planContext(project));
    expect(sheets.map((sheet) => [sheet.sheet.id, sheet.index, sheet.items.map((item) => item.index)])).toEqual([
      ["s1", 0, [0, 1]],
      ["s3", 2, []],
    ]);
    expect(sheets[1]!.tree).toEqual({ trims: [], root: { kind: "waste", rect: r(0, 0, 96, 48), stage: 1 }, stuck: [] });
    expect(nodeItems(sheets[0]!.tree.root)).toEqual([0, 1]);
  });
});

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function guillotine(random: () => number, rect: Rect, kerf: number, depth: number, out: Rect[]): void {
  const axis = random() < 0.5 ? "x" : "y";
  const size = axis === "x" ? rect.length : rect.width;
  const steps = Math.floor((size - kerf - 2) / 0.125);
  if (depth === 0 || steps < 1 || random() < 0.15) {
    if (random() < 0.8) out.push(rect);
    return;
  }
  const first = 1 + Math.floor(random() * steps) * 0.125;
  const [lo] = span(rect, axis);
  const a = axis === "x" ? { ...rect, length: first } : { ...rect, width: first };
  const b = axis === "x" ? { ...rect, x: lo + first + kerf, length: size - first - kerf } : { ...rect, y: lo + first + kerf, width: size - first - kerf };
  guillotine(random, a, kerf, depth - 1, out);
  guillotine(random, b, kerf, depth - 1, out);
}

function assertCutsMissParts(node: CutNode, rects: readonly Rect[], kerf: number): void {
  if (node.kind !== "split") return;
  const [lo, hi] = span(node.rect, otherAxis(node.axis));
  for (const at of node.cuts) {
    for (const index of node.items) {
      const [s, e] = span(rects[index]!, node.axis);
      const [os, oe] = span(rects[index]!, otherAxis(node.axis));
      const crossesLine = s < at + kerf / 2 - 1e-6 && e > at - kerf / 2 + 1e-6;
      const withinPiece = oe > lo + 1e-6 && os < hi - 1e-6;
      expect(crossesLine && withinPiece).toBe(false);
    }
  }
  node.children.forEach((child) => assertCutsMissParts(child, rects, kerf));
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --root packages/core test/plan/cutTree.test.ts`
Expected: FAIL — the new exports do not exist yet ("does not provide an export named …").

- [ ] **Step 3: Implement**

`packages/core/src/plan/cutTree.ts`:

```ts
import { EPSILON, inset, otherAxis, sameRect, span, withSpan, type Axis, type Rect } from "../geometry/rect.ts";

export interface TreeItem {
  /** Index of the placement in its sheet's `placements`. */
  index: number;
  rect: Rect;
}

export type CutNode =
  | { kind: "part"; rect: Rect; stage: number; item: number }
  | { kind: "waste"; rect: Rect; stage: number }
  | { kind: "stuck"; rect: Rect; stage: number; items: number[] }
  | { kind: "split"; rect: Rect; stage: number; axis: Axis; cuts: number[]; children: CutNode[]; items: number[] };

export interface TrimCut {
  axis: Axis;
  at: number;
  piece: Rect;
  released: Rect;
  remainder: Rect;
}

export interface CutTree {
  trims: TrimCut[];
  root: CutNode;
  /** Groups of placement indices that no through-cut order separates. */
  stuck: number[][];
}

/**
 * Cut positions are kerf centre lines. Each split node's `cuts` are ascending along `axis`, and `children[i]` is the
 * piece before `cuts[i]` (the last child is the piece after the last cut). Children can have zero size where a kerf
 * removes a sliver narrower than itself.
 */
export function buildCutTree(sheet: Rect, items: readonly TreeItem[], kerf: number, trim: number): CutTree {
  const stuck: number[][] = [];
  const trims = trim > 0 ? trimCuts(sheet, trim, kerf) : [];
  const region = trim > 0 ? inset(sheet, trim) : sheet;
  return { trims, root: split(region, items, 1, "y", kerf, stuck), stuck };
}

function trimCuts(sheet: Rect, trim: number, kerf: number): TrimCut[] {
  const cuts: TrimCut[] = [];
  let piece = sheet;
  const cut = (axis: Axis, atStart: boolean) => {
    const [lo, hi] = span(piece, axis);
    const at = atStart ? lo + trim - kerf / 2 : hi - trim + kerf / 2;
    const before = Math.min(hi, Math.max(lo, at - kerf / 2));
    const after = Math.max(before, Math.min(hi, at + kerf / 2));
    const released = atStart ? withSpan(piece, axis, lo, before) : withSpan(piece, axis, after, hi);
    const remainder = atStart ? withSpan(piece, axis, lo + trim, hi) : withSpan(piece, axis, lo, hi - trim);
    cuts.push({ axis, at, piece, released, remainder });
    piece = remainder;
  };
  cut("y", true);
  cut("y", false);
  cut("x", true);
  cut("x", false);
  return cuts;
}

function split(rect: Rect, items: readonly TreeItem[], stage: number, prefer: Axis, kerf: number, stuck: number[][]): CutNode {
  if (items.length === 0) return { kind: "waste", rect, stage };
  const only = items.length === 1 ? items[0]! : undefined;
  if (only && sameRect(only.rect, rect)) return { kind: "part", rect, stage, item: only.index };
  for (const axis of [prefer, otherAxis(prefer)]) {
    const cuts = cutPositions(rect, items, axis, kerf);
    if (cuts.length === 0) continue;
    const pieces = piecesBetween(rect, axis, cuts, kerf);
    const groups = pieces.map((): TreeItem[] => []);
    for (const item of items) {
      const start = span(item.rect, axis)[0];
      groups[cuts.filter((cut) => cut < start + EPSILON).length]!.push(item);
    }
    const children = pieces.map((piece, i) => split(piece, groups[i]!, stage + 1, otherAxis(axis), kerf, stuck));
    return { kind: "split", rect, stage, axis, cuts, children, items: items.map((item) => item.index) };
  }
  const indices = items.map((item) => item.index);
  stuck.push(indices);
  return { kind: "stuck", rect, stage, items: indices };
}

function cutPositions(rect: Rect, items: readonly TreeItem[], axis: Axis, kerf: number): number[] {
  const [lo, hi] = span(rect, axis);
  const intervals = items.map((item) => span(item.rect, axis)).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of intervals) {
    const last = merged.at(-1);
    if (last && start - last[1] < kerf - EPSILON) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  const cuts: number[] = [];
  if (merged[0]![0] - lo > EPSILON) cuts.push(merged[0]![0] - kerf / 2);
  merged.forEach(([, end], i) => {
    const next = merged[i + 1];
    if (!next) {
      if (hi - end > EPSILON) cuts.push(end + kerf / 2);
      return;
    }
    cuts.push(end + kerf / 2);
    if (next[0] - end - kerf > EPSILON) cuts.push(next[0] - kerf / 2);
  });
  return cuts;
}

function piecesBetween(rect: Rect, axis: Axis, cuts: readonly number[], kerf: number): Rect[] {
  const [lo, hi] = span(rect, axis);
  const clamp = (value: number) => Math.min(hi, Math.max(lo, value));
  const pieces: Rect[] = [];
  for (let i = 0; i <= cuts.length; i++) {
    const start = clamp(i === 0 ? lo : cuts[i - 1]! + kerf / 2);
    const end = Math.max(start, clamp(i === cuts.length ? hi : cuts[i]! - kerf / 2));
    pieces.push(withSpan(rect, axis, start, end));
  }
  return pieces;
}

export function nodeItems(node: CutNode): number[] {
  switch (node.kind) {
    case "part":
      return [node.item];
    case "waste":
      return [];
    default:
      return node.items;
  }
}
```

`packages/core/src/plan/sheets.ts`:

```ts
import type { PlanSheet, Stock } from "../format/schema.ts";
import { placedRect, stockRect, trimFor, type PlanContext } from "./context.ts";
import { buildCutTree, type CutTree, type TreeItem } from "./cutTree.ts";

export interface SheetAnalysis {
  sheet: PlanSheet;
  /** 0-based position in `plan.sheets`. */
  index: number;
  stock: Stock;
  trim: number;
  items: TreeItem[];
  tree: CutTree;
}

/**
 * Builds the cut tree of every sheet whose stock exists. Placements with a missing part, a copy index past the
 * quantity, or a repeated part copy are left out; sheets with no remaining placements get no cuts.
 */
export function analyzeSheets(ctx: PlanContext): SheetAnalysis[] {
  const seen = new Set<string>();
  const result: SheetAnalysis[] = [];
  (ctx.project.plan?.sheets ?? []).forEach((sheet, index) => {
    const items: TreeItem[] = [];
    sheet.placements.forEach((placement, i) => {
      const part = ctx.parts.get(placement.part);
      const key = `${placement.part}#${placement.copy}`;
      if (!part || placement.copy >= part.quantity || seen.has(key)) return;
      seen.add(key);
      items.push({ index: i, rect: placedRect(part, placement) });
    });
    const stock = ctx.stock.get(sheet.stock);
    if (!stock) return;
    const trim = trimFor(ctx, stock);
    const tree = buildCutTree(stockRect(stock), items, ctx.kerf, items.length > 0 ? trim : 0);
    result.push({ sheet, index, stock, trim, items, tree });
  });
  return result;
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./plan/cutTree.ts";
export * from "./plan/sheets.ts";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --root packages/core test/plan/cutTree.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole check, then commit**

Run: `npm run check`
Expected: typecheck clean, all tests pass.

```bash
git add packages/core/src/plan/cutTree.ts packages/core/src/plan/sheets.ts packages/core/test/plan/cutTree.test.ts packages/core/src/index.ts
git commit -m "feat(core): build guillotine cut trees for plan sheets" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Tool assignment

**Files:**
- Create: `packages/core/src/sequence/tools.ts`
- Create: `packages/core/test/sequence/tools.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `Tool` from the schema; `EPSILON`, `fitsWithin`, `sizeAlong`, `Axis`, `Rect` from Task 1.
- Produces: `CutKind` (`rip`/`crosscut`/`trim`), `SettingSide` (`released`/`remainder`), `CutGeometry {axis, stage, length, piece, released, remainder}`, `ToolChoice {tool, side}`, `cutKind(axis, trim)`, `toolCanCut(tool, cut, limits): SettingSide | null`, `assignTool(tools, cut, limits): ToolChoice | null`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/sequence/tools.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assignTool, cutKind, toolCanCut, type CutGeometry, type Rect, type Tool } from "../../src/index.ts";

const r = (x: number, y: number, length: number, width: number): Rect => ({ x, y, length, width });

const rip: CutGeometry = { axis: "y", stage: 1, length: 96, piece: r(0, 0, 96, 48), released: r(0, 0, 96, 15), remainder: r(0, 15.125, 96, 32.875) };
const crosscut: CutGeometry = { axis: "x", stage: 2, length: 15, piece: r(0, 0, 96, 15), released: r(0, 0, 30, 15), remainder: r(30.125, 0, 65.875, 15) };

const tableSaw = (limits: Partial<Extract<Tool, { type: "table-saw" }>> = {}): Tool => ({
  id: "ts",
  name: "Table saw",
  type: "table-saw",
  kerf: 0.125,
  enabled: true,
  ...limits,
});

describe("cutKind", () => {
  it("names rips, crosscuts, and trims", () => {
    expect(cutKind("y", false)).toBe("rip");
    expect(cutKind("x", false)).toBe("crosscut");
    expect(cutKind("x", true)).toBe("trim");
  });
});

describe("toolCanCut", () => {
  it("rips on a table saw with the released side at the fence when it fits", () => {
    expect(toolCanCut(tableSaw({ maxRip: 24 }), rip, true)).toBe("released");
  });

  it("puts the remainder at the fence when only it fits the rip capacity", () => {
    const wide = { ...rip, released: r(0, 0, 96, 40), remainder: r(0, 40.125, 96, 7.875) };
    expect(toolCanCut(tableSaw({ maxRip: 24 }), wide, true)).toBe("remainder");
    expect(toolCanCut(tableSaw({ maxRip: 6 }), wide, true)).toBeNull();
  });

  it("limits table saw crosscuts by cut length", () => {
    expect(toolCanCut(tableSaw({ maxCrosscut: 24 }), crosscut, true)).toBe("released");
    expect(toolCanCut(tableSaw({ maxCrosscut: 12 }), crosscut, true)).toBeNull();
  });

  it("limits the piece a table saw can handle, in either orientation", () => {
    expect(toolCanCut(tableSaw({ maxPiece: { length: 48, width: 96 } }), rip, true)).toBe("released");
    expect(toolCanCut(tableSaw({ maxPiece: { length: 60, width: 30 } }), rip, true)).toBeNull();
  });

  it("limits track and circular saws by cut length", () => {
    const track: Tool = { id: "t", name: "Track saw", type: "track-saw", kerf: 0.0625, enabled: true, maxCut: 55 };
    const circular: Tool = { id: "c", name: "Circular saw", type: "circular-saw", kerf: 0.0625, enabled: true, maxCut: 100 };
    expect(toolCanCut(track, rip, true)).toBeNull();
    expect(toolCanCut(track, crosscut, true)).toBe("released");
    expect(toolCanCut(circular, rip, true)).toBe("released");
  });

  it("limits panel saws by cut length and stage", () => {
    const panel: Tool = { id: "p", name: "Panel saw", type: "panel-saw", kerf: 0.125, enabled: true, maxCut: 100, maxStages: 1 };
    expect(toolCanCut(panel, rip, true)).toBe("released");
    expect(toolCanCut(panel, crosscut, true)).toBeNull();
  });

  it("ignores every limit when tool limits are off", () => {
    expect(toolCanCut(tableSaw({ maxRip: 1, maxCrosscut: 1 }), rip, false)).toBe("released");
  });
});

describe("assignTool", () => {
  it("picks the first capable tool in profile order", () => {
    const track: Tool = { id: "track", name: "Track saw", type: "track-saw", kerf: 0.0625, enabled: true };
    const small = tableSaw({ maxCrosscut: 12 });
    expect(assignTool([small, track], crosscut, true)).toEqual({ tool: track, side: "released" });
    expect(assignTool([small, track], rip, true)).toEqual({ tool: small, side: "released" });
    expect(assignTool([small], crosscut, true)).toBeNull();
    expect(assignTool([], rip, false)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --root packages/core test/sequence/tools.test.ts`
Expected: FAIL — the new exports do not exist yet ("does not provide an export named …").

- [ ] **Step 3: Implement**

`packages/core/src/sequence/tools.ts`:

```ts
import type { Tool } from "../format/schema.ts";
import { EPSILON, fitsWithin, sizeAlong, type Axis, type Rect } from "../geometry/rect.ts";

export type CutKind = "rip" | "crosscut" | "trim";

/** The side of the cut whose size is set on the fence, stop, or mark. */
export type SettingSide = "released" | "remainder";

export interface CutGeometry {
  axis: Axis;
  stage: number;
  /** Length of the cut line. */
  length: number;
  piece: Rect;
  released: Rect;
  remainder: Rect;
}

export interface ToolChoice {
  tool: Tool;
  side: SettingSide;
}

/** Cuts along the stock length (lines of constant y) are rips; lines of constant x are crosscuts. */
export function cutKind(axis: Axis, trim: boolean): CutKind {
  if (trim) return "trim";
  return axis === "y" ? "rip" : "crosscut";
}

const within = (value: number, limit: number | undefined) => limit === undefined || value <= limit + EPSILON;

export function toolCanCut(tool: Tool, cut: CutGeometry, limits: boolean): SettingSide | null {
  if (!limits) return "released";
  switch (tool.type) {
    case "table-saw": {
      if (tool.maxPiece && !fitsWithin(cut.piece, tool.maxPiece)) return null;
      if (cut.axis === "x") return within(cut.length, tool.maxCrosscut) ? "released" : null;
      if (within(sizeAlong(cut.released, "y"), tool.maxRip)) return "released";
      if (within(sizeAlong(cut.remainder, "y"), tool.maxRip)) return "remainder";
      return null;
    }
    case "track-saw":
    case "circular-saw":
      return within(cut.length, tool.maxCut) ? "released" : null;
    case "panel-saw":
      return within(cut.length, tool.maxCut) && (tool.maxStages === undefined || cut.stage <= tool.maxStages) ? "released" : null;
  }
}

/** The first tool, in profile order, that can make the cut. */
export function assignTool(tools: readonly Tool[], cut: CutGeometry, limits: boolean): ToolChoice | null {
  for (const tool of tools) {
    const side = toolCanCut(tool, cut, limits);
    if (side) return { tool, side };
  }
  return null;
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./sequence/tools.ts";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --root packages/core test/sequence/tools.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole check, then commit**

Run: `npm run check`
Expected: typecheck clean, all tests pass.

```bash
git add packages/core/src/sequence/tools.ts packages/core/test/sequence/tools.test.ts packages/core/src/index.ts
git commit -m "feat(core): assign tools to cuts by type and capacity" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Shop sequence

**Files:**
- Create: `packages/core/src/sequence/sequence.ts`
- Create: `packages/core/test/sequence/sequence.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `analyzeSheets`, `SheetAnalysis`, `CutNode`, `nodeItems` (Task 3); `assignTool`, `cutKind` (Task 4); `planContext`, `formatIn` (Task 1); `Cut`, `PlanSheet`, `Project`, `Tool` from the schema.
- Produces: `Step` (fields `step, sheet, sheetNumber, kind, axis, stage, at, from, to, piece, released, remainder, releasedPlacements, remainderPlacements, tool, side, setting, requires, releasedNext, remainderNext`); `sequencePlan(project): Step[]`; `sequenceCuts(ctx, sheets): Step[]`; `withCuts(project): Project`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/sequence/sequence.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import { formatLength, parseProject, sequencePlan, withCuts, type Project, type Step } from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

function shelf(): Project {
  const result = parseProject(EXAMPLES["living-room-shelf"]!());
  if (!result.ok) throw new Error("example did not load");
  return result.project;
}

const summary = (step: Step) => [step.step, step.kind, formatLength(step.setting, "in"), step.requires, step.releasedNext, step.remainderNext];

function setupChanges(steps: Step[]): number {
  const key = (step: Step) => `${step.tool?.id}|${step.kind}|${formatLength(step.setting, "in")}`;
  return steps.filter((step, i) => i > 0 && key(step) !== key(steps[i - 1]!)).length;
}

describe("sequencePlan", () => {
  it("orders the sample sheet: trims, rips, then crosscuts in each strip", () => {
    expect(sequencePlan(sampleProject()).map(summary)).toEqual([
      [1, "trim", '1/8"', null, null, 2],
      [2, "trim", '1/8"', 1, null, 3],
      [3, "trim", '1/8"', 2, null, 4],
      [4, "trim", '1/8"', 3, null, 5],
      [5, "rip", '12"', 4, 7, 6],
      [6, "rip", '12"', 5, 8, null],
      [7, "crosscut", '30"', 5, null, null],
      [8, "crosscut", '30"', 6, null, null],
    ]);
  });

  it("describes the geometry of each cut", () => {
    const rip = sequencePlan(sampleProject())[4]!;
    expect(rip).toMatchObject({
      sheet: "s1",
      sheetNumber: 1,
      axis: "y",
      stage: 1,
      at: 12.3125,
      from: 0.25,
      to: 95.75,
      piece: { x: 0.25, y: 0.25, length: 95.5, width: 47.5 },
      released: { x: 0.25, y: 0.25, length: 95.5, width: 12 },
      remainder: { x: 0.25, y: 12.375, length: 95.5, width: 35.375 },
      releasedPlacements: [0],
      remainderPlacements: [1],
      side: "released",
    });
    expect(rip.tool?.id).toBe("ts");
  });

  it("sequences every living-room-shelf sheet in sheet order", () => {
    const steps = sequencePlan(shelf());
    expect(steps).toHaveLength(76);
    expect(steps.filter((step) => step.sheetNumber === 1).map(summary)).toEqual([
      [1, "trim", '1/8"', null, null, 2],
      [2, "trim", '1/8"', 1, null, 3],
      [3, "trim", '1/8"', 2, null, 4],
      [4, "trim", '1/8"', 3, null, 5],
      [5, "rip", '15 3/8"', 4, 8, 6],
      [6, "rip", '15 3/8"', 5, 9, 7],
      [7, "rip", '15 3/8"', 6, 10, null],
      [8, "crosscut", '56 17/32"', 5, null, null],
      [9, "crosscut", '56 17/32"', 6, null, null],
      [10, "crosscut", '42 19/32"', 7, null, 11],
      [11, "crosscut", '13 1/4"', 10, null, null],
    ]);
    expect(steps.map((step) => step.sheetNumber)).toEqual([...steps.map((step) => step.sheetNumber)].sort((a, b) => a - b));
  });

  it("groups cuts with the same setup across sheets in setup order, respecting dependencies", () => {
    const project = shelf();
    const bySheet = sequencePlan(project);
    project.settings.orderMode = "setup";
    const bySetup = sequencePlan(project);
    expect(bySetup).toHaveLength(bySheet.length);
    expect(bySetup.map((step) => step.step)).toEqual(bySetup.map((_, i) => i + 1));
    for (const step of bySetup) if (step.requires !== null) expect(step.requires).toBeLessThan(step.step);
    expect(setupChanges(bySetup)).toBeLessThan(setupChanges(bySheet));
    const cutsOf = (steps: Step[]) => steps.map((step) => `${step.sheetNumber}|${step.axis}|${step.at}`).sort();
    expect(cutsOf(bySetup)).toEqual(cutsOf(bySheet));
  });

  it("puts the remainder at the fence when the released side is wider than the rip capacity", () => {
    const project = sampleProject();
    project.parts[0] = { ...project.parts[0]!, width: 40, quantity: 1 };
    project.plan!.sheets[0]!.placements = [{ part: "side", copy: 0, x: 0.25, y: 0.25, rotated: false }];
    project.tools[0] = { id: "ts", name: "Table saw", type: "table-saw", kerf: 0.125, enabled: true, maxRip: 20 };
    const rip = sequencePlan(project).find((step) => step.kind === "rip")!;
    expect(rip.side).toBe("remainder");
    expect(rip.setting).toBe(7.375);
  });

  it("leaves steps without a tool when no tool is enabled (kerf 0, so the 1/8\" gap takes two cuts)", () => {
    const project = sampleProject();
    project.tools[0]!.enabled = false;
    const steps = sequencePlan(project);
    expect(steps).toHaveLength(9);
    expect(steps.every((step) => step.tool === null && step.side === "released")).toBe(true);
  });

  it("returns no steps when cut order is off, and none for an empty sheet", () => {
    const off = sampleProject();
    off.settings.features.cutOrder = false;
    expect(sequencePlan(off)).toEqual([]);
    const empty = sampleProject();
    empty.plan!.sheets[0]!.placements = [];
    expect(sequencePlan(empty)).toEqual([]);
  });
});

describe("withCuts", () => {
  it("writes the sequence into each sheet's cuts", () => {
    const cuts = withCuts(sampleProject()).plan!.sheets[0]!.cuts!;
    expect(cuts).toHaveLength(8);
    expect(cuts[0]).toEqual({ step: 1, stage: 1, axis: "y", at: 0.1875, from: 0, to: 96, tool: "ts", trim: true });
    expect(cuts[4]).toEqual({ step: 5, stage: 1, axis: "y", at: 12.3125, from: 0.25, to: 95.75, tool: "ts" });
  });

  it("removes stale cuts when there is no sequence", () => {
    const project = withCuts(sampleProject());
    project.settings.features.cutOrder = false;
    expect(withCuts(project).plan!.sheets[0]).not.toHaveProperty("cuts");
    const { plan: _plan, ...noPlan } = project;
    expect(withCuts(noPlan).plan).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --root packages/core test/sequence/sequence.test.ts`
Expected: FAIL — the new exports do not exist yet ("does not provide an export named …").

- [ ] **Step 3: Implement**

`packages/core/src/sequence/sequence.ts`:

```ts
import type { Cut, PlanSheet, Project, Tool } from "../format/schema.ts";
import { otherAxis, sizeAlong, span, withSpan, type Axis, type Rect } from "../geometry/rect.ts";
import { formatIn, planContext, type PlanContext } from "../plan/context.ts";
import { nodeItems, type CutNode } from "../plan/cutTree.ts";
import { analyzeSheets, type SheetAnalysis } from "../plan/sheets.ts";
import { assignTool, cutKind, type CutKind, type SettingSide } from "./tools.ts";

export interface Step {
  /** 1-based position in the shop order. */
  step: number;
  sheet: string;
  /** 1-based position of the sheet in `plan.sheets`. */
  sheetNumber: number;
  kind: CutKind;
  axis: Axis;
  stage: number;
  at: number;
  from: number;
  to: number;
  /** The piece on the saw, the side the cut separates off, and the side that continues. */
  piece: Rect;
  released: Rect;
  remainder: Rect;
  /** Placement indices on each side. */
  releasedPlacements: number[];
  remainderPlacements: number[];
  tool: Tool | null;
  side: SettingSide;
  /** Size of `side` across the cut line: the fence, stop, or mark setting. */
  setting: number;
  /** The step that makes `piece`, or null for a sheet's first cut. */
  requires: number | null;
  /** The next step that cuts each side, or null when that side is a part, waste, or stuck. */
  releasedNext: number | null;
  remainderNext: number | null;
}

interface RawCut extends Omit<Step, "step" | "requires" | "releasedNext" | "remainderNext"> {
  id: number;
  requires: number | null;
  releasedNext: number | null;
  remainderNext: number | null;
}

type Geometry = Pick<Step, "kind" | "axis" | "stage" | "at" | "piece" | "released" | "remainder" | "releasedPlacements" | "remainderPlacements">;

export function sequencePlan(project: Project): Step[] {
  const ctx = planContext(project);
  return sequenceCuts(ctx, analyzeSheets(ctx));
}

/** Returns the project with each sheet's `cuts` set from the sequence; sheets without steps get no `cuts`. */
export function withCuts(project: Project): Project {
  if (!project.plan) return project;
  const steps = sequencePlan(project);
  const sheets = project.plan.sheets.map((sheet, index): PlanSheet => {
    const { cuts: _old, ...rest } = sheet;
    const cuts = steps.filter((step) => step.sheetNumber === index + 1).map(toCut);
    return cuts.length > 0 ? { ...rest, cuts } : rest;
  });
  return { ...project, plan: { ...project.plan, sheets } };
}

function toCut(step: Step): Cut {
  const cut: Cut = { step: step.step, stage: step.stage, axis: step.axis, at: step.at, from: step.from, to: step.to };
  if (step.tool) cut.tool = step.tool.id;
  if (step.kind === "trim") cut.trim = true;
  return cut;
}

/** Returns no steps when the cutOrder feature is off. */
export function sequenceCuts(ctx: PlanContext, sheets: readonly SheetAnalysis[]): Step[] {
  if (!ctx.features.cutOrder) return [];
  const cuts: RawCut[] = [];
  for (const sheet of sheets) collectSheet(ctx, sheet, cuts);
  const ordered = ctx.project.settings.orderMode === "setup" ? setupOrder(ctx, cuts) : cuts;
  const stepOf = new Map(ordered.map((cut, i) => [cut.id, i + 1]));
  const step = (id: number | null) => (id === null ? null : stepOf.get(id)!);
  return ordered.map(({ id, ...cut }) => ({
    ...cut,
    step: stepOf.get(id)!,
    requires: step(cut.requires),
    releasedNext: step(cut.releasedNext),
    remainderNext: step(cut.remainderNext),
  }));
}

function collectSheet(ctx: PlanContext, analysis: SheetAnalysis, cuts: RawCut[]): void {
  const half = ctx.kerf / 2;
  const push = (geometry: Geometry, parent: RawCut | null, parentSide: SettingSide): RawCut => {
    const [from, to] = span(geometry.piece, otherAxis(geometry.axis));
    const choice = assignTool(ctx.tools, { ...geometry, length: to - from }, ctx.features.toolLimits);
    const side = choice?.side ?? "released";
    const cut: RawCut = {
      ...geometry,
      id: cuts.length,
      sheet: analysis.sheet.id,
      sheetNumber: analysis.index + 1,
      from,
      to,
      tool: choice?.tool ?? null,
      side,
      setting: sizeAlong(geometry[side], geometry.axis),
      requires: parent?.id ?? null,
      releasedNext: null,
      remainderNext: null,
    };
    if (parent && parentSide === "released") parent.releasedNext = cut.id;
    if (parent && parentSide === "remainder") parent.remainderNext = cut.id;
    cuts.push(cut);
    return cut;
  };

  let last: RawCut | null = null;
  const all = analysis.items.map((item) => item.index);
  for (const trim of analysis.tree.trims) {
    last = push({ ...trim, kind: "trim", stage: 1, releasedPlacements: [], remainderPlacements: all }, last, "remainder");
  }

  const walk = (node: CutNode, parent: RawCut | null, parentSide: SettingSide): void => {
    if (node.kind !== "split") return;
    const [, hi] = span(node.rect, node.axis);
    let start = span(node.rect, node.axis)[0];
    let previous = parent;
    let previousSide = parentSide;
    const releasedBy: RawCut[] = [];
    node.cuts.forEach((at, i) => {
      const remainderStart = Math.min(hi, Math.max(start, at + half));
      const cut = push(
        {
          kind: cutKind(node.axis, false),
          axis: node.axis,
          stage: node.stage,
          at,
          piece: withSpan(node.rect, node.axis, start, hi),
          released: node.children[i]!.rect,
          remainder: withSpan(node.rect, node.axis, remainderStart, hi),
          releasedPlacements: nodeItems(node.children[i]!),
          remainderPlacements: node.children.slice(i + 1).flatMap(nodeItems),
        },
        previous,
        previousSide,
      );
      releasedBy.push(cut);
      previous = cut;
      previousSide = "remainder";
      start = remainderStart;
    });
    node.children.forEach((child, i) => {
      if (i < node.cuts.length) walk(child, releasedBy[i]!, "released");
      else walk(child, previous, "remainder");
    });
  };
  walk(analysis.tree.root, last, "remainder");
}

/**
 * Groups cuts that share a tool, cut kind, and displayed setting, taking any ready cut of the current setup before
 * switching. A cut is ready once the cut that makes its piece is done.
 */
function setupOrder(ctx: PlanContext, cuts: readonly RawCut[]): RawCut[] {
  const key = (cut: RawCut) => `${cut.tool?.id ?? ""}|${cut.kind}|${formatIn(ctx, cut.setting)}`;
  const done = new Set<number>();
  const ready = (cut: RawCut) => !done.has(cut.id) && (cut.requires === null || done.has(cut.requires));
  const order: RawCut[] = [];
  let current: string | null = null;
  while (order.length < cuts.length) {
    let next = current === null ? undefined : cuts.find((cut) => ready(cut) && key(cut) === current);
    if (!next) {
      next = cuts.find(ready)!;
      current = key(next);
    }
    done.add(next.id);
    order.push(next);
  }
  return order;
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./sequence/sequence.ts";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --root packages/core test/sequence/sequence.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole check, then commit**

Run: `npm run check`
Expected: typecheck clean, all tests pass.

```bash
git add packages/core/src/sequence/sequence.ts packages/core/test/sequence/sequence.test.ts packages/core/src/index.ts
git commit -m "feat(core): order cuts into shop steps by sheet or by setup" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Step text

**Files:**
- Create: `packages/core/src/sequence/text.ts`
- Create: `packages/core/test/sequence/text.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `Step` (Task 5); `copyLabel`, `formatIn`, `formatSize`, `isOffcutSize`, `stockRect` (Task 1).
- Produces: `StepText {title, body}`; `describeStep(ctx: PlanContext, step: Step): StepText`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/sequence/text.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import { describeStep, parseProject, planContext, sequencePlan, type Project } from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

function texts(project: Project) {
  const ctx = planContext(project);
  return sequencePlan(project).map((step) => describeStep(ctx, step));
}

describe("describeStep", () => {
  it("describes trims by the amount they remove", () => {
    expect(texts(sampleProject())[0]).toEqual({
      title: "Step 1. Table saw, trim.",
      body: 'Piece: sheet 1, full sheet 96" × 48". Trim 1/4" off the edge.',
    });
  });

  it("describes a table saw rip with the fence setting and both sides", () => {
    expect(texts(sampleProject())[4]).toEqual({
      title: "Step 5. Table saw, rip.",
      body: 'Piece: sheet 1, panel 95 1/2" × 47 1/2". Fence at 12". Fence side: Side 1, next at step 7. Other side: Side 2, next at step 6.',
    });
  });

  it("names an offcut or waste when a side has no parts", () => {
    const [, , , , , second] = texts(sampleProject());
    expect(second!.body).toBe(
      'Piece: sheet 1, panel 95 1/2" × 35 3/8". Fence at 12". Fence side: Side 2, next at step 8. Other side: offcut 95 1/2" × 23 1/4".',
    );
    const project = sampleProject();
    project.settings.features.offcuts = false;
    expect(texts(project)[5]!.body).toMatch(/Other side: waste\.$/);
  });

  it("uses the stop for table saw crosscuts and a mark for hand-held saws", () => {
    expect(texts(sampleProject())[6]!.body).toBe('Piece: sheet 1, panel 95 1/2" × 12". Set the stop at 30". Measured side: Side 1. Other side: offcut 65 3/8" × 12".');
    const project = sampleProject();
    project.tools = [{ id: "track", name: "Track saw", type: "track-saw", kerf: 0.125, enabled: true }];
    expect(texts(project)[6]).toEqual({
      title: "Step 7. Track saw, crosscut.",
      body: 'Piece: sheet 1, panel 95 1/2" × 12". Mark 30" from the edge. Measured side: Side 1. Other side: offcut 65 3/8" × 12".',
    });
  });

  it("lists long part lists briefly and says when no tool can make the cut", () => {
    const project = sampleProject();
    project.parts[0]!.quantity = 5;
    project.plan!.sheets[0]!.placements = [0, 1, 2, 3, 4].map((copy) => ({ part: "side", copy, x: 0.25 + copy * 12.125, y: 0.25, rotated: true }));
    project.tools[0]!.enabled = false;
    const [first] = texts(project).filter((text) => text.title.includes("rip"));
    expect(first!.title).toBe("Step 5. No tool, rip.");
    expect(first!.body).toContain("Measured side: Side 1, Side 2, Side 3, and 2 more, next at step");
  });

  it("describes every living-room-shelf step", () => {
    const result = parseProject(EXAMPLES["living-room-shelf"]!());
    if (!result.ok) throw new Error("example did not load");
    const all = texts(result.project);
    expect(all).toHaveLength(76);
    expect(all.every((text) => !text.body.includes("?"))).toBe(true);
    expect(all[4]!.body).toBe(
      'Piece: sheet 1, panel 59 1/2" × 59 1/2". Fence at 15 3/8". Fence side: B Top, next at step 8. Other side: B Bottom, A Top, A Shelf 1, next at step 6.',
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --root packages/core test/sequence/text.test.ts`
Expected: FAIL — the new exports do not exist yet ("does not provide an export named …").

- [ ] **Step 3: Implement**

`packages/core/src/sequence/text.ts`:

```ts
import { sameRect, sizeAlong, type Rect } from "../geometry/rect.ts";
import { copyLabel, formatIn, formatSize, isOffcutSize, stockRect, type PlanContext } from "../plan/context.ts";
import type { Step } from "./sequence.ts";

export interface StepText {
  title: string;
  body: string;
}

const KIND_WORD = { rip: "rip", crosscut: "crosscut", trim: "trim" } as const;

export function describeStep(ctx: PlanContext, step: Step): StepText {
  const title = `Step ${step.step}. ${step.tool?.name ?? "No tool"}, ${KIND_WORD[step.kind]}.`;
  const sheet = ctx.project.plan?.sheets[step.sheetNumber - 1];
  const stock = sheet ? ctx.stock.get(sheet.stock) : undefined;
  const whole = stock !== undefined && sameRect(step.piece, stockRect(stock));
  const sentences = [`Piece: sheet ${step.sheetNumber}, ${whole ? "full sheet" : "panel"} ${formatSize(ctx, step.piece)}.`];

  if (step.kind === "trim") {
    sentences.push(`Trim ${formatIn(ctx, sizeAlong(step.piece, step.axis) - sizeAlong(step.remainder, step.axis))} off the edge.`);
    return { title, body: sentences.join(" ") };
  }

  const setting = formatIn(ctx, step.setting);
  const tool = step.tool?.type;
  const fence = tool === "table-saw" && step.axis === "y";
  if (fence) sentences.push(`Fence at ${setting}.`);
  else if (tool === "table-saw" || tool === "panel-saw") sentences.push(`Set the stop at ${setting}.`);
  else sentences.push(`Mark ${setting} from the edge.`);

  const names = (placements: readonly number[]) =>
    placements.map((index) => {
      const placement = sheet?.placements[index];
      const part = placement ? ctx.parts.get(placement.part) : undefined;
      return part && placement ? copyLabel(part, placement.copy) : "?";
    });
  const summary = (placements: readonly number[], rect: Rect, next: number | null) => {
    const contents = placements.length > 0 ? list(names(placements)) : isOffcutSize(ctx, rect) ? `offcut ${formatSize(ctx, rect)}` : "waste";
    return next === null ? contents : `${contents}, next at step ${next}`;
  };
  const released = summary(step.releasedPlacements, step.released, step.releasedNext);
  const remainder = summary(step.remainderPlacements, step.remainder, step.remainderNext);
  const [measured, other] = step.side === "released" ? [released, remainder] : [remainder, released];
  sentences.push(`${fence ? "Fence side" : "Measured side"}: ${measured}. Other side: ${other}.`);
  return { title, body: sentences.join(" ") };
}

function list(names: readonly string[]): string {
  if (names.length <= 4) return names.join(", ");
  return `${names.slice(0, 3).join(", ")}, and ${names.length - 3} more`;
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./sequence/text.ts";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --root packages/core test/sequence/text.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole check, then commit**

Run: `npm run check`
Expected: typecheck clean, all tests pass.

```bash
git add packages/core/src/sequence/text.ts packages/core/test/sequence/text.test.ts packages/core/src/index.ts
git commit -m "feat(core): describe shop steps in plain text" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Plan validator with cut checks

**Files:**
- Create: `packages/core/src/plan/validate.ts`
- Create: `packages/core/test/plan/validate.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `checkLayout` (Task 2), `analyzeSheets` (Task 3), `sequenceCuts`, `Step` (Task 5).
- Produces: `validatePlan(project): PlanIssue[]`; `checkCuts(ctx, layout, sheets, steps): PlanIssue[]` (codes `not-guillotine`, `no-tool`).

- [ ] **Step 1: Write the failing tests**

`packages/core/test/plan/validate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import { parseProject, validatePlan, type Project } from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

function pinwheel(): Project {
  const project = sampleProject();
  project.settings.trim = 0;
  project.settings.features.kerf = false;
  project.parts = [
    { id: "long", name: "Long", material: "ply", length: 20, width: 10, quantity: 4, grain: "none" },
    { id: "center", name: "Center", material: "ply", length: 10, width: 10, quantity: 1, grain: "none" },
  ];
  project.plan!.sheets[0]!.placements = [
    { part: "long", copy: 0, x: 0, y: 0, rotated: false },
    { part: "long", copy: 1, x: 20, y: 0, rotated: true },
    { part: "long", copy: 2, x: 10, y: 20, rotated: false },
    { part: "long", copy: 3, x: 0, y: 10, rotated: true },
    { part: "center", copy: 0, x: 10, y: 10, rotated: false },
  ];
  return project;
}

describe("validatePlan", () => {
  it("accepts the sample project and the living-room shelf", () => {
    expect(validatePlan(sampleProject())).toEqual([]);
    const shelf = parseProject(EXAMPLES["living-room-shelf"]!());
    if (!shelf.ok) throw new Error("example did not load");
    expect(validatePlan(shelf.project)).toEqual([]);
  });

  it("reports a pinwheel as not guillotine, only while cut order is on", () => {
    const project = pinwheel();
    expect(validatePlan(project)).toEqual([
      {
        severity: "error",
        code: "not-guillotine",
        message: "Sheet 1: Long 1, Long 2, Long 3, Long 4, and Center cannot be cut free with straight cuts that run across the whole piece.",
        refs: [0, 1, 2, 3, 4].map((index) => ({ kind: "placement", sheet: "s1", index })),
      },
    ]);
    project.settings.features.cutOrder = false;
    expect(validatePlan(project)).toEqual([]);
  });

  it("does not report overlapping parts again as not guillotine", () => {
    const project = sampleProject();
    project.plan!.sheets[0]!.placements[1]!.y = 6;
    expect(validatePlan(project).map((issue) => issue.code)).toEqual(["overlap"]);
  });

  it("reports one issue when no tool is enabled", () => {
    const project = sampleProject();
    project.tools[0]!.enabled = false;
    expect(validatePlan(project)).toEqual([
      { severity: "error", code: "no-tool", message: "No tool is enabled. Add a tool or enable one on the Tools tab.", refs: [] },
    ]);
  });

  it("reports each cut no tool can make, unless tool limits are off", () => {
    const project = sampleProject();
    project.tools = [{ id: "ts", name: "Table saw", type: "table-saw", kerf: 0.125, enabled: true, maxCrosscut: 24 }];
    expect(validatePlan(project).map((issue) => issue.message)).toEqual([
      'No tool in your profile can make cut 3 (a 47 1/2" trim cut).',
      'No tool in your profile can make cut 4 (a 47 1/2" trim cut).',
    ]);
    expect(validatePlan(project)[0]!.refs).toEqual([{ kind: "cut", sheet: "s1", step: 3 }]);
    project.settings.features.toolLimits = false;
    expect(validatePlan(project)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --root packages/core test/plan/validate.test.ts`
Expected: FAIL — the new exports do not exist yet ("does not provide an export named …").

- [ ] **Step 3: Implement**

`packages/core/src/plan/validate.ts`:

```ts
import type { Project } from "../format/schema.ts";
import { sequenceCuts, type Step } from "../sequence/sequence.ts";
import { copyLabel, formatIn, planContext, type PlanContext } from "./context.ts";
import { planError, type PlanIssue } from "./issues.ts";
import { checkLayout } from "./layout.ts";
import { analyzeSheets, type SheetAnalysis } from "./sheets.ts";

const KIND_NOUN = { rip: "rip", crosscut: "crosscut", trim: "trim cut" } as const;

export function validatePlan(project: Project): PlanIssue[] {
  const ctx = planContext(project);
  const sheets = analyzeSheets(ctx);
  const layout = checkLayout(ctx);
  return [...layout, ...checkCuts(ctx, layout, sheets, sequenceCuts(ctx, sheets))];
}

/**
 * The cut-order checks. Placements that already have an `off-sheet` or `overlap` issue are not reported again as
 * `not-guillotine`. Returns nothing when the cutOrder feature is off.
 */
export function checkCuts(ctx: PlanContext, layout: readonly PlanIssue[], sheets: readonly SheetAnalysis[], steps: readonly Step[]): PlanIssue[] {
  if (!ctx.features.cutOrder) return [];
  const issues: PlanIssue[] = [];
  const reported = new Set<string>();
  for (const issue of layout) {
    if (issue.code !== "off-sheet" && issue.code !== "overlap") continue;
    for (const ref of issue.refs) if (ref.kind === "placement") reported.add(`${ref.sheet}#${ref.index}`);
  }

  for (const { sheet, index, tree } of sheets) {
    for (const group of tree.stuck) {
      const free = group.filter((i) => !reported.has(`${sheet.id}#${i}`));
      if (free.length === 0) continue;
      const labels = free.map((i) => {
        const placement = sheet.placements[i]!;
        return copyLabel(ctx.parts.get(placement.part)!, placement.copy);
      });
      issues.push(
        planError(
          "not-guillotine",
          `Sheet ${index + 1}: ${joinAnd(labels)} cannot be cut free with straight cuts that run across the whole piece.`,
          free.map((i) => ({ kind: "placement", sheet: sheet.id, index: i })),
        ),
      );
    }
  }

  if (steps.length === 0) return issues;
  if (ctx.tools.length === 0) {
    issues.push(planError("no-tool", "No tool is enabled. Add a tool or enable one on the Tools tab."));
  } else if (ctx.features.toolLimits) {
    for (const step of steps) {
      if (step.tool) continue;
      issues.push(
        planError("no-tool", `No tool in your profile can make cut ${step.step} (a ${formatIn(ctx, step.to - step.from)} ${KIND_NOUN[step.kind]}).`, [
          { kind: "cut", sheet: step.sheet, step: step.step },
        ]),
      );
    }
  }
  return issues;
}

function joinAnd(items: readonly string[]): string {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./plan/validate.ts";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --root packages/core test/plan/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole check, then commit**

Run: `npm run check`
Expected: typecheck clean, all tests pass.

```bash
git add packages/core/src/plan/validate.ts packages/core/test/plan/validate.test.ts packages/core/src/index.ts
git commit -m "feat(core): validate plans for guillotine cut order and tool capacity" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Offcuts

**Files:**
- Create: `packages/core/src/reports/offcuts.ts`
- Create: `packages/core/test/reports/offcuts.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `slugify`, `uniqueId` from `src/format/ids.ts`; `isOffcutSize` (Task 1); `CutNode` (Task 3); `SheetAnalysis` (Task 3).
- Produces: `Offcut {sheet, sheetNumber, stock, material, rect}`; `listOffcuts(ctx, sheets): Offcut[]`; `saveOffcutsToStock(project, offcuts): Project`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/reports/offcuts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { analyzeSheets, listOffcuts, planContext, saveOffcutsToStock, validatePlan, type Project } from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

function offcuts(project: Project) {
  const ctx = planContext(project);
  return listOffcuts(ctx, analyzeSheets(ctx));
}

describe("listOffcuts", () => {
  it("lists waste pieces at least the minimum offcut size", () => {
    expect(offcuts(sampleProject())).toEqual([
      { sheet: "s1", sheetNumber: 1, stock: "ply-4x8", material: "ply", rect: { x: 30.375, y: 0.25, length: 65.375, width: 12 } },
      { sheet: "s1", sheetNumber: 1, stock: "ply-4x8", material: "ply", rect: { x: 30.375, y: 12.375, length: 65.375, width: 12 } },
      { sheet: "s1", sheetNumber: 1, stock: "ply-4x8", material: "ply", rect: { x: 0.25, y: 24.5, length: 95.5, width: 23.25 } },
    ]);
  });

  it("uses the minimum offcut setting and the offcuts feature", () => {
    const project = sampleProject();
    project.settings.minOffcut = { length: 70, width: 20 };
    expect(offcuts(project).map((offcut) => offcut.rect.width)).toEqual([23.25]);
    project.settings.features.offcuts = false;
    expect(offcuts(project)).toEqual([]);
  });

  it("lists nothing for a sheet without placements", () => {
    const project = sampleProject();
    project.plan!.sheets[0]!.placements = [];
    expect(offcuts(project)).toEqual([]);
  });
});

describe("saveOffcutsToStock", () => {
  it("adds each offcut as owned stock with no cost and no trim", () => {
    const project = sampleProject();
    const saved = saveOffcutsToStock(project, offcuts(project));
    expect(saved.stock.slice(1)).toEqual([
      { id: "ply-offcut", material: "ply", length: 65.375, width: 12, quantity: 1, cost: 0, kind: "offcut", trim: 0, name: "Offcut from Test, sheet 1" },
      { id: "ply-offcut-2", material: "ply", length: 65.375, width: 12, quantity: 1, cost: 0, kind: "offcut", trim: 0, name: "Offcut from Test, sheet 1" },
      { id: "ply-offcut-3", material: "ply", length: 95.5, width: 23.25, quantity: 1, cost: 0, kind: "offcut", trim: 0, name: "Offcut from Test, sheet 1" },
    ]);
    expect(project.stock).toHaveLength(1);
    expect(validatePlan(saved)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --root packages/core test/reports/offcuts.test.ts`
Expected: FAIL — the new exports do not exist yet ("does not provide an export named …").

- [ ] **Step 3: Implement**

`packages/core/src/reports/offcuts.ts`:

```ts
import { slugify, uniqueId } from "../format/ids.ts";
import type { Project, Stock } from "../format/schema.ts";
import type { Rect } from "../geometry/rect.ts";
import { isOffcutSize, type PlanContext } from "../plan/context.ts";
import type { CutNode } from "../plan/cutTree.ts";
import type { SheetAnalysis } from "../plan/sheets.ts";

export interface Offcut {
  sheet: string;
  sheetNumber: number;
  stock: string;
  material: string;
  rect: Rect;
}

/** Waste pieces of the cut trees that are at least `minOffcut`. Sheets without placements have none. */
export function listOffcuts(ctx: PlanContext, sheets: readonly SheetAnalysis[]): Offcut[] {
  if (!ctx.features.offcuts) return [];
  const offcuts: Offcut[] = [];
  for (const { sheet, index, stock, items, tree } of sheets) {
    if (items.length === 0) continue;
    const visit = (node: CutNode): void => {
      if (node.kind === "split") node.children.forEach(visit);
      else if (node.kind === "waste" && isOffcutSize(ctx, node.rect)) {
        offcuts.push({ sheet: sheet.id, sheetNumber: index + 1, stock: stock.id, material: stock.material, rect: node.rect });
      }
    };
    visit(tree.root);
  }
  return offcuts;
}

/** Offcut edges are all cut edges, so the new stock has no trim. */
export function saveOffcutsToStock(project: Project, offcuts: readonly Offcut[]): Project {
  const taken = new Set(project.stock.map((stock) => stock.id));
  const added = offcuts.map((offcut): Stock => {
    const id = uniqueId(slugify(`${offcut.material} offcut`), taken);
    taken.add(id);
    return {
      id,
      material: offcut.material,
      length: offcut.rect.length,
      width: offcut.rect.width,
      quantity: 1,
      cost: 0,
      kind: "offcut",
      trim: 0,
      name: `Offcut from ${project.project.name}, sheet ${offcut.sheetNumber}`,
    };
  });
  return { ...project, stock: [...project.stock, ...added] };
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./reports/offcuts.ts";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --root packages/core test/reports/offcuts.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole check, then commit**

Run: `npm run check`
Expected: typecheck clean, all tests pass.

```bash
git add packages/core/src/reports/offcuts.ts packages/core/test/reports/offcuts.test.ts packages/core/src/index.ts
git commit -m "feat(core): list offcuts and save them to stock" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Shopping list, labels, and project analysis

**Files:**
- Create: `packages/core/src/reports/shopping.ts`
- Create: `packages/core/src/reports/labels.ts`
- Create: `packages/core/src/analysis.ts`
- Create: `packages/core/test/reports/shopping.test.ts`
- Create: `packages/core/test/reports/labels.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: Everything from Tasks 1–8.
- Produces: `SheetUsage`, `ShoppingLine`, `MaterialShopping`, `ShoppingList`, `shoppingList(ctx, sheets)`; `PartLabel`, `partLabels(ctx, steps)`; `ProjectAnalysis {context, issues, sheets, steps, offcuts, shopping, labels}`, `analyzeProject(project)`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/reports/shopping.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import { analyzeSheets, parseProject, planContext, shoppingList, type Project } from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

function shopping(project: Project) {
  const ctx = planContext(project);
  return shoppingList(ctx, analyzeSheets(ctx));
}

describe("shoppingList", () => {
  it("counts sheets to buy, prices them, and measures utilization", () => {
    expect(shopping(sampleProject())).toEqual({
      currency: "USD",
      materials: [
        {
          material: "ply",
          name: "Plywood 3/4",
          lines: [
            { stock: "ply-4x8", label: 'Plywood 3/4 96" × 48"', kind: "sheet", length: 96, width: 48, used: 1, buy: 1, unitCost: 60, lineCost: 60 },
          ],
          cost: 60,
          stockArea: 4608,
          partArea: 720,
          utilization: 0.15625,
        },
      ],
      sheets: [{ sheet: "s1", sheetNumber: 1, stock: "ply-4x8", stockArea: 4608, partArea: 720, utilization: 0.15625 }],
      total: 60,
      missingPrices: [],
    });
  });

  it("does not buy owned offcuts", () => {
    const project = sampleProject();
    project.stock.push({ id: "scrap", material: "ply", length: 40, width: 30, quantity: 1, kind: "offcut" });
    project.plan!.sheets.push({ id: "s2", stock: "scrap", placements: [] });
    const line = shopping(project).materials[0]!.lines[1]!;
    expect(line).toMatchObject({ stock: "scrap", used: 1, buy: 0, unitCost: null, lineCost: 0 });
    expect(shopping(project).total).toBe(60);
  });

  it("leaves the total empty when a bought sheet has no price", () => {
    const project = sampleProject();
    delete project.stock[0]!.cost;
    expect(shopping(project)).toMatchObject({ total: null, missingPrices: ["ply-4x8"] });
  });

  it("shows no prices when the cost feature is off", () => {
    const project = sampleProject();
    project.settings.features.cost = false;
    const list = shopping(project);
    expect(list.materials[0]!.lines[0]).toMatchObject({ unitCost: null, lineCost: null });
    expect(list).toMatchObject({ total: null, missingPrices: [] });
  });

  it("lists the living-room shelf's 5 + 2 sheets", () => {
    const result = parseProject(EXAMPLES["living-room-shelf"]!());
    if (!result.ok) throw new Error("example did not load");
    const list = shopping(result.project);
    expect(list.materials.map((material) => [material.material, material.lines[0]!.buy])).toEqual([
      ["bb18", 5],
      ["bb6", 2],
    ]);
    expect(list.missingPrices).toEqual(["bb18-5x5", "bb6-5x5"]);
  });
});
```

`packages/core/test/reports/labels.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import { analyzeProject, parseProject, partLabels, planContext, sequencePlan } from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

describe("partLabels", () => {
  it("makes one label per part copy with its sheet and the step that frees it", () => {
    const project = sampleProject();
    expect(partLabels(planContext(project), sequencePlan(project))).toEqual([
      { part: "side", copy: 0, name: "Side 1", group: null, length: 30, width: 12, material: "Plywood 3/4", grain: "length", sheetNumber: 1, step: 7 },
      { part: "side", copy: 1, name: "Side 2", group: null, length: 30, width: 12, material: "Plywood 3/4", grain: "length", sheetNumber: 1, step: 8 },
    ]);
  });

  it("leaves the sheet and step empty for unplaced copies, and shows no grain when grain does not matter", () => {
    const project = sampleProject();
    project.plan!.sheets[0]!.placements.pop();
    project.settings.features.grain = false;
    const labels = partLabels(planContext(project), sequencePlan(project));
    expect(labels[1]).toMatchObject({ name: "Side 2", sheetNumber: null, step: null, grain: "none" });
  });

  it("frees a part that fills the trimmed sheet at the last trim cut", () => {
    const project = sampleProject();
    project.parts[0] = { ...project.parts[0]!, length: 95.5, width: 47.5, quantity: 1 };
    project.plan!.sheets[0]!.placements = [{ part: "side", copy: 0, x: 0.25, y: 0.25, rotated: false }];
    expect(partLabels(planContext(project), sequencePlan(project))[0]).toMatchObject({ step: 4 });
  });
});

describe("analyzeProject", () => {
  it("derives everything for the living-room shelf", () => {
    const result = parseProject(EXAMPLES["living-room-shelf"]!());
    if (!result.ok) throw new Error("example did not load");
    const analysis = analyzeProject(result.project);
    expect(analysis.issues).toEqual([]);
    expect(analysis.sheets).toHaveLength(7);
    expect(analysis.steps).toHaveLength(76);
    expect(analysis.labels).toHaveLength(31);
    expect(analysis.labels.every((label) => label.sheetNumber !== null && label.step !== null)).toBe(true);
    expect(analysis.shopping.materials).toHaveLength(2);
  });

  it("returns no labels when the labels feature is off", () => {
    const project = sampleProject();
    project.settings.features.labels = false;
    expect(analyzeProject(project).labels).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --root packages/core test/reports`
Expected: FAIL — the new exports do not exist yet ("does not provide an export named …").

- [ ] **Step 3: Implement**

`packages/core/src/reports/shopping.ts`:

```ts
import type { StockKind } from "../format/schema.ts";
import { area } from "../geometry/rect.ts";
import { materialName, stockLabel, type PlanContext } from "../plan/context.ts";
import type { SheetAnalysis } from "../plan/sheets.ts";

export interface SheetUsage {
  sheet: string;
  sheetNumber: number;
  stock: string;
  stockArea: number;
  partArea: number;
  /** partArea / stockArea; waste is 1 - utilization. */
  utilization: number;
}

export interface ShoppingLine {
  stock: string;
  label: string;
  kind: StockKind;
  length: number;
  width: number;
  /** Sheets of this stock in the plan. */
  used: number;
  /** Pieces to buy: `used` for sheets, 0 for owned offcuts. */
  buy: number;
  /** Null when the cost feature is off or the stock has no price. */
  unitCost: number | null;
  lineCost: number | null;
}

export interface MaterialShopping {
  material: string;
  name: string;
  lines: ShoppingLine[];
  cost: number | null;
  stockArea: number;
  partArea: number;
  utilization: number;
}

export interface ShoppingList {
  currency: string;
  materials: MaterialShopping[];
  sheets: SheetUsage[];
  /** Null when the cost feature is off or any stock to buy has no price. */
  total: number | null;
  /** Stock ids that must be bought but have no price. */
  missingPrices: string[];
}

export function shoppingList(ctx: PlanContext, sheets: readonly SheetAnalysis[]): ShoppingList {
  const costOn = ctx.features.cost;
  const usage: SheetUsage[] = sheets.map(({ sheet, index, stock, items }) => {
    const stockArea = area(stock);
    const partArea = items.reduce((sum, item) => sum + area(item.rect), 0);
    return { sheet: sheet.id, sheetNumber: index + 1, stock: stock.id, stockArea, partArea, utilization: ratio(partArea, stockArea) };
  });

  const missingPrices: string[] = [];
  const materials: MaterialShopping[] = [];
  for (const material of ctx.project.materials) {
    const lines: ShoppingLine[] = [];
    let stockArea = 0;
    let partArea = 0;
    for (const stock of ctx.project.stock) {
      if (stock.material !== material.id) continue;
      const sheetsOfStock = usage.filter((sheet) => sheet.stock === stock.id);
      if (sheetsOfStock.length === 0) continue;
      stockArea += sheetsOfStock.reduce((sum, sheet) => sum + sheet.stockArea, 0);
      partArea += sheetsOfStock.reduce((sum, sheet) => sum + sheet.partArea, 0);
      const buy = stock.kind === "sheet" ? sheetsOfStock.length : 0;
      const unitCost = costOn ? (stock.cost ?? null) : null;
      const lineCost = !costOn ? null : unitCost !== null ? buy * unitCost : buy === 0 ? 0 : null;
      if (costOn && lineCost === null) missingPrices.push(stock.id);
      lines.push({ stock: stock.id, label: stockLabel(ctx, stock), kind: stock.kind, length: stock.length, width: stock.width, used: sheetsOfStock.length, buy, unitCost, lineCost });
    }
    if (lines.length === 0) continue;
    materials.push({
      material: material.id,
      name: materialName(ctx, material.id),
      lines,
      cost: sumOrNull(lines.map((line) => line.lineCost)),
      stockArea,
      partArea,
      utilization: ratio(partArea, stockArea),
    });
  }

  const total = costOn ? sumOrNull(materials.map((material) => material.cost)) : null;
  return { currency: ctx.project.settings.currency, materials, sheets: usage, total, missingPrices };
}

function ratio(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

function sumOrNull(values: readonly (number | null)[]): number | null {
  let sum = 0;
  for (const value of values) {
    if (value === null) return null;
    sum += value;
  }
  return sum;
}
```

`packages/core/src/reports/labels.ts`:

```ts
import type { Grain } from "../format/schema.ts";
import { canRotate, copyLabel, materialName, type PlanContext } from "../plan/context.ts";
import type { Step } from "../sequence/sequence.ts";

export interface PartLabel {
  part: string;
  copy: number;
  name: string;
  group: string | null;
  length: number;
  width: number;
  material: string;
  /** "none" when grain does not constrain the part. */
  grain: Grain;
  sheetNumber: number | null;
  /** The step that cuts the part free, or null when it is not placed or needs no cut. */
  step: number | null;
}

export function partLabels(ctx: PlanContext, steps: readonly Step[]): PartLabel[] {
  const where = new Map<string, { sheetNumber: number; index: number }>();
  (ctx.project.plan?.sheets ?? []).forEach((sheet, sheetIndex) => {
    sheet.placements.forEach((placement, index) => {
      const key = `${placement.part}#${placement.copy}`;
      if (!where.has(key)) where.set(key, { sheetNumber: sheetIndex + 1, index });
    });
  });

  const freedBy = new Map<string, number>();
  for (const step of steps) {
    if (step.releasedPlacements.length === 1 && step.releasedNext === null) freedBy.set(`${step.sheetNumber}#${step.releasedPlacements[0]}`, step.step);
    if (step.remainderPlacements.length === 1 && step.remainderNext === null) freedBy.set(`${step.sheetNumber}#${step.remainderPlacements[0]}`, step.step);
  }

  const labels: PartLabel[] = [];
  for (const part of ctx.project.parts) {
    for (let copy = 0; copy < part.quantity; copy++) {
      const placed = where.get(`${part.id}#${copy}`);
      labels.push({
        part: part.id,
        copy,
        name: copyLabel(part, copy),
        group: part.group ?? null,
        length: part.length,
        width: part.width,
        material: materialName(ctx, part.material),
        grain: canRotate(ctx, part) ? "none" : part.grain,
        sheetNumber: placed?.sheetNumber ?? null,
        step: placed ? (freedBy.get(`${placed.sheetNumber}#${placed.index}`) ?? null) : null,
      });
    }
  }
  return labels;
}
```

`packages/core/src/analysis.ts`:

```ts
import type { Project } from "./format/schema.ts";
import { planContext, type PlanContext } from "./plan/context.ts";
import type { PlanIssue } from "./plan/issues.ts";
import { checkLayout } from "./plan/layout.ts";
import { analyzeSheets, type SheetAnalysis } from "./plan/sheets.ts";
import { checkCuts } from "./plan/validate.ts";
import { listOffcuts, type Offcut } from "./reports/offcuts.ts";
import { partLabels, type PartLabel } from "./reports/labels.ts";
import { shoppingList, type ShoppingList } from "./reports/shopping.ts";
import { sequenceCuts, type Step } from "./sequence/sequence.ts";

export interface ProjectAnalysis {
  context: PlanContext;
  issues: PlanIssue[];
  sheets: SheetAnalysis[];
  steps: Step[];
  offcuts: Offcut[];
  shopping: ShoppingList;
  /** Empty when the labels feature is off. */
  labels: PartLabel[];
}

/** Everything derived from a project, computed once. */
export function analyzeProject(project: Project): ProjectAnalysis {
  const context = planContext(project);
  const sheets = analyzeSheets(context);
  const steps = sequenceCuts(context, sheets);
  const layout = checkLayout(context);
  return {
    context,
    issues: [...layout, ...checkCuts(context, layout, sheets, steps)],
    sheets,
    steps,
    offcuts: listOffcuts(context, sheets),
    shopping: shoppingList(context, sheets),
    labels: context.features.labels ? partLabels(context, steps) : [],
  };
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./reports/shopping.ts";
export * from "./reports/labels.ts";
export * from "./analysis.ts";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --root packages/core test/reports`
Expected: PASS.

- [ ] **Step 5: Run the whole check, then commit**

Run: `npm run check`
Expected: typecheck clean, all tests pass.

```bash
git add packages/core/src/reports/shopping.ts packages/core/src/reports/labels.ts packages/core/src/analysis.ts packages/core/test/reports/shopping.test.ts packages/core/test/reports/labels.test.ts packages/core/src/index.ts
git commit -m "feat(core): add shopping list, part labels, and project analysis" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Documentation and spec amendments

**Files:**
- Create: `docs/cut-analysis.md`
- Modify: `README.md`, `docs/format.md`, `docs/superpowers/specs/2026-09-27-opencutplan-design.md`

**Interfaces:**
- Consumes: the behaviour built in Tasks 1–9.
- Produces: user and third-party documentation of the analysis rules; spec text that matches the implementation.

- [ ] **Step 1: Write `docs/cut-analysis.md`**

````markdown
# Cut analysis

`@opencutplan/core` derives everything below from a project document. Nothing here is stored in the file, except that
`withCuts(project)` can write the sequence into `plan.sheets[].cuts` for other readers (see
[`format.md`](format.md#plan)).

`analyzeProject(project)` computes all of it at once: issues, cut trees, steps, offcuts, the shopping list, and labels.

## Terms

- **Planning kerf**: the largest kerf among enabled tools, or 0 when the `kerf` feature is off.
- **Trim**: the stock's `trim`, else `settings.trim`, or 0 when the `trim` feature is off.
- **Rip**: a cut along the stock length (a line of constant `y`). **Crosscut**: a line of constant `x`.
- **Minimum offcut**: `settings.minOffcut`, else 12" × 6" or 300 × 150 mm. A size meets it in either orientation.

## Validator

`validatePlan(project)` returns issues `{ severity, code, message, refs }`. `refs` point at sheets, placements (by
index in the sheet's `placements`), part copies, stock, or cut steps. Issues never stop editing.

| Code | Severity | When |
|---|---|---|
| `bad-ref` | error | a sheet's stock or a placement's part does not exist |
| `bad-copy` | error | a placement's `copy` is not less than the part's quantity |
| `duplicate-placement` | error | the same part copy is placed twice |
| `wrong-material` | error | the part's material is not the stock's material |
| `grain` | error | grain matters (the `grain` feature is on, the material is grained, the part's grain is not `none`) and the part's grain dimension does not run along the stock length |
| `off-sheet` | error | the part extends past the stock, or into the trim |
| `overlap` | error | two parts overlap, or are closer than the planning kerf in both directions |
| `stock-exceeded` | error | more sheets of a stock are used than its `quantity` |
| `unplaced` | warning | one issue per part with copies on no sheet |
| `not-guillotine` | error | `cutOrder` on: one issue per group of parts that no order of through-cuts separates; parts that already have `off-sheet` or `overlap` are left out |
| `no-tool` | error | `cutOrder` on: no tool is enabled (one issue), or `toolLimits` on and no enabled tool can make a cut (one issue per cut) |

## Cut tree

Each sheet with at least one valid placement gets a guillotine cut tree. Sheets without placements get no cuts.

1. With trim on, four trim cuts come first: the two long edges, then the two short edges. Each kerf lies inside the
   trim, against the usable area.
2. Every other piece is cut recursively. A cut line must run across the whole piece without touching a part. At the
   first stage the tree tries rips before crosscuts; each deeper stage tries the other direction first.
3. All cuts in one direction are made at once, in ascending position. A cut's kerf sits against a part edge:
   - after the last part before a gap, and again before the next part when the gap is wider than one kerf;
   - before the first part when there is waste at the start, and after the last part when there is waste at the end.
   A gap between one and two kerfs wide gives a second cut that removes a sliver narrower than the blade.
4. A piece is a part when it is exactly one part, waste when it has no parts, and stuck when no cut is possible.

## Tools

Each cut gets the first enabled tool, in profile order, that can make it. With `toolLimits` off, that is the first
enabled tool.

| Tool | Can make the cut when |
|---|---|
| Table saw, rip | the piece fits `maxPiece` (either orientation), and the cut-off side or the remainder is at most `maxRip` wide; the side that fits goes against the fence, the cut-off side first |
| Table saw, crosscut | the piece fits `maxPiece`, and the cut is at most `maxCrosscut` long |
| Track saw, circular saw | the cut is at most `maxCut` long |
| Panel saw | the cut is at most `maxCut` long, and its stage is at most `maxStages` |

Trim cuts use the rip or crosscut rule for their direction.

## Sequence

`sequencePlan(project)` returns steps. Each step has the piece on the saw, the cut-off side (`released`) and the side
that continues (`remainder`), the parts on each side, the tool, the setting (the size of the side against the fence,
stop, or mark), and links: `requires` (the step that makes the piece), `releasedNext` and `remainderNext` (the next
step that cuts each side).

- `orderMode: "sheet"`: sheets in plan order; on each sheet the trims, then each piece's cuts, then its pieces in order.
- `orderMode: "setup"`: the same cuts, grouped by tool, cut kind, and displayed setting. The current setup continues
  while any of its cuts is ready (the step that makes its piece is done); then the first ready cut in sheet order starts
  the next setup.
- With `cutOrder` off there are no steps.

`describeStep(context, step)` gives the shop text, for example:

> **Step 5. Table saw, rip.** Piece: sheet 1, panel 59 1/2" × 59 1/2". Fence at 15 3/8". Fence side: B Top, next at
> step 8. Other side: B Bottom, A Top, A Shelf 1, next at step 6.

Trims say how much they remove ("Trim 1/4" off the edge."). Table saw crosscuts and panel saws say "Set the stop at";
track and circular saws say "Mark … from the edge".

## Offcuts

`listOffcuts` lists the cut tree's waste pieces that meet the minimum offcut, unless the `offcuts` feature is off.
`saveOffcutsToStock(project, offcuts)` adds them as stock with `kind: "offcut"`, `quantity: 1`, `cost: 0`, `trim: 0`
(every edge is a cut edge), and the name "Offcut from <project>, sheet N".

## Reports

- `shoppingList`: per material and stock, the sheets used, the count to buy (owned offcuts are not bought), unit and line
  cost, and the total. The total is null when the `cost` feature is off or a stock to buy has no price
  (`missingPrices` lists those). Utilization is part area over stock area, per sheet and per material.
- `partLabels`: one label per part copy with its name, group, size, material, grain (`none` when grain does not
  constrain the part), sheet number, and the step that cuts it free. `analyzeProject` returns no labels when the
  `labels` feature is off.
````

- [ ] **Step 2: Amend the README, format doc, and spec**

Save this script outside the repo (for example `/tmp/amend.py`) and run it from the repo root with `python3 /tmp/amend.py`. Each replacement asserts that its old text occurs exactly once.

```python
from pathlib import Path

def edit(path, pairs):
    p = Path(path)
    s = p.read_text(encoding="utf-8")
    for old, new in pairs:
        assert s.count(old) == 1, (path, old)
        s = s.replace(old, new)
    p.write_text(s, encoding="utf-8")

edit("docs/superpowers/specs/2026-09-27-opencutplan-design.md", [
    ("- `minOffcut`: {`length`, `width`}; waste pieces at least this size are kept as offcuts.",
     "- `minOffcut`: {`length`, `width`}; waste pieces at least this size, in either orientation, are kept as offcuts.\n  Default 12 × 6 in or 300 × 150 mm."),
    ("| `not-guillotine` | error | cut order on and no guillotine cut order frees the part (§6.1) |",
     "| `not-guillotine` | error | cut order on and no guillotine cut order frees a group of parts (§6.1); one issue per group, leaving out parts that already have `off-sheet` or `overlap` |"),
    ("| `no-tool` | error | tool limits on and no enabled tool can make a cut (§6.2) |",
     "| `no-tool` | error | cut order on, and either no tool is enabled (one issue) or tool limits are on and no enabled tool can make a cut (§6.2) |"),
    ("| `unplaced` | warning | a part copy is not on any sheet |",
     "| `unplaced` | warning | copies of a part are not on any sheet (one issue per part) |"),
    ("| `bad-ref`, `bad-copy` | error | reference to a missing part, stock, or copy index |",
     "| `bad-ref`, `bad-copy`, `duplicate-placement` | error | reference to a missing part, stock, or copy index; a part copy placed twice |"),
    ("When trim is on, trim cuts on each factory edge come first (`trim: true`).",
     "When trim is on, trim cuts on each factory edge come first (`trim: true`). Sheets without placements get no cuts.\nThe exact kerf placement rules are in `docs/cut-analysis.md`."),
    ("- *Table saw rip*: the piece on the fence side is ≤ `maxRip` and the piece being cut is ≤ `maxPiece`.",
     "- *Table saw rip*: the piece on the fence side is ≤ `maxRip` and the piece being cut is ≤ `maxPiece`. The cut-off side\n  goes against the fence; when only the remainder fits `maxRip`, the remainder does."),
    ("- `orderMode: \"setup\"`: group cuts with the same tool and fence setting across all sheets, while respecting the tree",
     "- `orderMode: \"setup\"`: group cuts with the same tool, cut kind, and displayed setting across all sheets, while respecting the tree"),
    ("them as `stock` entries with `kind: \"offcut\"`, `quantity: 1`, `cost: 0`.",
     "them as `stock` entries with `kind: \"offcut\"`, `quantity: 1`, `cost: 0`, `trim: 0` (every edge is a cut edge), and the name\n\"Offcut from <project>, sheet N\"."),
])

edit("docs/format.md", [
    ("| `minOffcut` | none | {`length`, `width`}: waste at least this size is kept as an offcut. |",
     "| `minOffcut` | none | {`length`, `width`}: waste at least this size, in either orientation, is kept as an offcut. Readers use 12 × 6 in or 300 × 150 mm when it is absent. |"),
])

edit("README.md", [
    ("- **File format:** [`docs/format.md`](docs/format.md) and the JSON Schema in [`schema/`](schema/).",
     "- **File format:** [`docs/format.md`](docs/format.md) and the JSON Schema in [`schema/`](schema/).\n- **Cut analysis:** [`docs/cut-analysis.md`](docs/cut-analysis.md) — the layout validator, guillotine cut tree, tool\n  rules, shop sequence, offcuts, and reports."),
    ("It is under development: this repository currently contains the core library and the file format.",
     "It is under development: this repository currently contains the core library (file format, CSV, and cut analysis)."),
])
```

- [ ] **Step 3: Check that every documented example and name matches the code**

Run: `npm run check`
Expected: PASS. Then confirm by reading that the step text example in `docs/cut-analysis.md` is the same string that `test/sequence/text.test.ts` asserts for living-room-shelf step 5.

- [ ] **Step 4: Commit**

```bash
git add docs/cut-analysis.md README.md docs/format.md docs/superpowers/specs/2026-09-27-opencutplan-design.md
git commit -m "docs: describe cut analysis and align the spec with it" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
