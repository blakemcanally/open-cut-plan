# OpenCutPlan Phase 3 — Optimizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add plan generation to `@opencutplan/core`: strip and guillotine constructors, a seeded search with the spec's lexicographic objective, validation of every candidate, pinning, "keep searching", and a Web Worker message protocol.

**Architecture:** `buildProblem(project)` splits the work per material (copies with allowed orientations, enabled stock with offcuts first, stock left after pinned sheets). Constructors turn a candidate (part order, stock order, rotation policy) into a packing. `evaluate` runs the Phase 2 validator on the packing, drops sheets with errors, and scores the rest. `createSearch` tries fixed candidates first and then random changes to the best one, in time slices; `optimize` runs it to the end, and `createOptimizerHost` wraps it in a worker message handler. Everything is pure and deterministic for a given seed and iteration count.

**Tech Stack:** unchanged — Node ≥ 24, TypeScript 7.0.2, Vitest 5.0.2, fast-check 4.10.2. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-27-opencutplan-design.md` (§5 plan generation, §8 feature switches, §10 optimizer errors, §11 optimizer tests, §12 phase 3).

## Global Constraints

- No new dependencies. ESM only; relative imports use the `.ts` extension; only erasable TypeScript syntax (no `enum`, `namespace`, parameter properties).
- `packages/core/src` must not use DOM or Node APIs. The worker host takes `post` and `schedule` functions; its default `schedule` uses the global `setTimeout`, which exists in browsers, workers, and Node. Every function is pure: it never mutates its input project.
- All lengths are decimal numbers in `project.units`. Compare lengths with `EPSILON` (1e-6) from `src/geometry/rect.ts`.
- Coordinates (spec §4.4): origin at the stock's top-left corner; `x` along the stock length, `y` along the stock width; `rotated: true` means the part length runs along the stock width.
- The optimizer always builds guillotine layouts, even when the `cutOrder` feature is off (spec §8): `buildProblem` forces `cutOrder` on in its context.
- The optimizer never returns a sheet with a validator error (spec §5.2 step 3). Parts it cannot place are listed with a reason (spec §10).
- The same seed and iteration count give the same result (spec §11).
- Comments: default to none. Only a comment that carries information the code cannot (an API contract or a non-obvious rule).
- Commit after every task. Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- The repo stays local. Do not add a git remote or push (Block policy; spec §13).

## Review Focus

1. **A part larger than every stock, or a sheet no tool can cut**: the copy is reported unplaced (`too-large` or `no-tool`), and nothing throws. Pinned in Task 1 (too-large), Task 3 (no-tool), and Task 4.
2. **Stock quantities with pinned sheets**: pinned sheets count against `quantity`, and new sheets never exceed what is left (`no-stock`). Pinned in Task 1, Task 2, and Task 4.
3. **Nothing to plan, or a tiny time limit**: the search returns at once for an empty project, and every material still gets at least one candidate. Pinned in Task 4 (a clock that never moves, and a clock that moves 1 ms per call).
4. **Float sums in mm projects with 2.2 or 3.2 mm kerf**: optimized plans have no `overlap` or `off-sheet` errors. Pinned in the Task 4 property test (inch and mm units, five kerfs).
5. **Cancel during a run, and a new start during a run**: each job sends exactly one `done`, and a cancelled job sends nothing after it. Pinned in Task 5.

## File Structure

All new code is in `packages/core/src/optimize/`, with tests in `packages/core/test/optimize/`.

| File | Responsibility |
|---|---|
| `random.ts` | Seeded random numbers (mulberry32), `randomInt`, `shuffled` |
| `problem.ts` | `buildProblem`: per-material copies, orientations, stock order, stock left after pinned sheets, too-large copies |
| `pack.ts` | Shared packing types, rotation policy, and the stock pool that opens new sheets |
| `strip.ts` | Strip constructor: rip strips, crosscut segments, re-rip narrower parts |
| `guillotine.ts` | Guillotine best-area-fit constructor with four split rules |
| `evaluate.ts` | Validate a packing, drop sheets with errors, score it; `compareScores` |
| `search.ts` | `createSearch`, `optimize`, `applyOptimizeResult`: candidates, time slices, keep searching, result assembly |
| `worker.ts` | `createOptimizerHost`: the worker message protocol |

Also changed: `packages/core/src/index.ts` (exports), `examples/builders/simple-bookcase-mm.ts` and `examples/simple-bookcase-mm.cutplan.json` (Task 4), `docs/optimizer.md`, `README.md`, and the spec (Task 6).

Tests use `sampleProject()` from `packages/core/test/helpers.ts`: an inch project with material `ply` (grained), stock `ply-4x8` (96 × 48, cost 60, unlimited), part `side` (30 × 12, quantity 2, grain `length`), tool `ts` (table saw, kerf 1/8", maxRip 30), trim 1/4", and sheet `s1` with both copies. Examples load with `EXAMPLES` from `../../../../examples/builders/index.ts`.

---

### Task 1: Seeded random numbers and the optimizer problem

**Files:**
- Create: `packages/core/src/optimize/random.ts`
- Create: `packages/core/src/optimize/problem.ts`
- Test: `packages/core/test/optimize/random.test.ts`
- Test: `packages/core/test/optimize/problem.test.ts`

**Interfaces:**
- Consumes: `planContext`, `grainOk`, `usableRect`, `PlanContext` from `src/plan/context.ts`; `EPSILON`, `Size` from `src/geometry/rect.ts`; `Part`, `PlanSheet`, `Project`, `Stock` from `src/format/schema.ts`.
- Produces:
- `random.ts`: `type Random = () => number`, `seededRandom(seed: number): Random`, `randomInt(random, below): number`, `shuffled<T>(random, items): T[]`.
- `problem.ts`: `Copy { part: Part; copy: number; orientations: boolean[] }`, `type UnplacedReason = "too-large" | "no-stock" | "no-tool" | "not-guillotine"`, `UnplacedCopy { part: string; copy: number; reason: UnplacedReason }`, `MaterialProblem { material; copies; stock; available: ReadonlyMap<string, number | null>; tooLarge: UnplacedCopy[] }`, `Problem { ctx: PlanContext; pinned: PlanSheet[]; materials: MaterialProblem[] }`, `orientedSize(part, rotated): Size`, `fitsStock(ctx, stock, size): boolean`, `buildProblem(project): Problem`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/optimize/random.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { randomInt, seededRandom, shuffled } from "../../src/optimize/random.ts";

describe("seededRandom", () => {
  it("repeats the same sequence for the same seed", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const first = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(first);
    expect(Array.from({ length: 5 }, seededRandom(43))).not.toEqual(first);
  });

  it("gives values in [0, 1)", () => {
    const random = seededRandom(7);
    for (let i = 0; i < 1000; i++) {
      const v = random();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("shuffles into a permutation and picks integers below the bound", () => {
    const random = seededRandom(1);
    expect(shuffled(random, [1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
    for (let i = 0; i < 100; i++) expect(randomInt(random, 3)).toBeLessThan(3);
  });
});
```

`packages/core/test/optimize/problem.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildProblem } from "../../src/optimize/problem.ts";
import { sampleProject } from "../helpers.ts";

describe("buildProblem", () => {
  it("expands copies with their allowed orientations and forces cutOrder on", () => {
    const project = sampleProject();
    project.settings.features.cutOrder = false;
    project.parts.push({ id: "shelf", name: "Shelf", material: "ply", length: 20, width: 10, quantity: 1, grain: "none" });
    const problem = buildProblem({ ...project, plan: { sheets: [] } });
    expect(problem.ctx.features.cutOrder).toBe(true);
    const [material] = problem.materials;
    expect(material!.copies.map((c) => [c.part.id, c.copy, c.orientations])).toEqual([
      ["side", 0, [false]],
      ["side", 1, [false]],
      ["shelf", 0, [false, true]],
    ]);
  });

  it("keeps pinned sheets, skips their copies, and counts their stock", () => {
    const project = sampleProject();
    project.stock[0]!.quantity = 3;
    project.plan!.sheets[0]!.pinned = true;
    project.parts[0]!.quantity = 3;
    const problem = buildProblem(project);
    expect(problem.pinned.map((s) => s.id)).toEqual(["s1"]);
    expect(problem.materials[0]!.copies.map((c) => c.copy)).toEqual([2]);
    expect(problem.materials[0]!.available.get("ply-4x8")).toBe(2);
  });

  it("puts offcuts first, leaves out disabled stock, and reports copies too large for every stock", () => {
    const project = sampleProject();
    project.stock.push(
      { id: "scrap", material: "ply", length: 40, width: 20, quantity: 1, kind: "offcut" },
      { id: "off", material: "ply", length: 200, width: 100, quantity: null, kind: "sheet", enabled: false },
    );
    project.parts.push({ id: "huge", name: "Huge", material: "ply", length: 100, width: 10, quantity: 2, grain: "length" });
    const [material] = buildProblem({ ...project, plan: { sheets: [] } }).materials;
    expect(material!.stock.map((s) => s.id)).toEqual(["scrap", "ply-4x8"]);
    expect(material!.tooLarge).toEqual([
      { part: "huge", copy: 0, reason: "too-large" },
      { part: "huge", copy: 1, reason: "too-large" },
    ]);
  });

  it("lets a grained part rotate only when its grain runs across it", () => {
    const project = sampleProject();
    project.parts[0]!.grain = "width";
    const [material] = buildProblem({ ...project, plan: { sheets: [] } }).materials;
    expect(material!.copies[0]!.orientations).toEqual([true]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --root packages/core test/optimize/random.test.ts test/optimize/problem.test.ts`
Expected: FAIL — the modules `../../src/optimize/random.ts` and `../../src/optimize/problem.ts` do not exist yet.

- [ ] **Step 3: Write the implementation**

`packages/core/src/optimize/random.ts`:

```ts
export type Random = () => number;

/** Mulberry32: a small, fast, seeded generator with values in [0, 1). */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(random: Random, below: number): number {
  return Math.floor(random() * below);
}

export function shuffled<T>(random: Random, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(random, i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
```

`packages/core/src/optimize/problem.ts`:

```ts
import type { Part, PlanSheet, Project, Stock } from "../format/schema.ts";
import { EPSILON, type Size } from "../geometry/rect.ts";
import { grainOk, planContext, usableRect, type PlanContext } from "../plan/context.ts";

export interface Copy {
  part: Part;
  copy: number;
  /** Allowed values of `rotated`, never empty. */
  orientations: boolean[];
}

/**
 * `too-large`: fits no enabled stock. `no-stock`: the stock quantities ran out. `no-tool`: no enabled tool can make a cut
 * its sheet needs. `not-guillotine`: its sheet failed the validator for another reason; constructors never cause it.
 */
export type UnplacedReason = "too-large" | "no-stock" | "no-tool" | "not-guillotine";

export interface UnplacedCopy {
  part: string;
  copy: number;
  reason: UnplacedReason;
}

export interface MaterialProblem {
  material: string;
  /** Copies to plan, in project order. */
  copies: Copy[];
  /** Enabled stock of this material: offcuts first, then sheets, each in project order. */
  stock: Stock[];
  /** Pieces of each stock still available after pinned sheets, or null for unlimited. */
  available: ReadonlyMap<string, number | null>;
  /** Copies that fit no enabled stock in any allowed orientation. */
  tooLarge: UnplacedCopy[];
}

export interface Problem {
  /** The project with `cutOrder` forced on, because optimized layouts must always be guillotine. */
  ctx: PlanContext;
  pinned: PlanSheet[];
  materials: MaterialProblem[];
}

export function orientedSize(part: Part, rotated: boolean): Size {
  return rotated ? { length: part.width, width: part.length } : { length: part.length, width: part.width };
}

export function fitsStock(ctx: PlanContext, stock: Stock, size: Size): boolean {
  const usable = usableRect(ctx, stock);
  return size.length <= usable.length + EPSILON && size.width <= usable.width + EPSILON;
}

export function buildProblem(project: Project): Problem {
  const ctx = planContext({
    ...project,
    settings: { ...project.settings, features: { ...project.settings.features, cutOrder: true } },
  });
  const pinned = (project.plan?.sheets ?? []).filter((sheet) => sheet.pinned === true);
  const placed = new Set<string>();
  const used = new Map<string, number>();
  for (const sheet of pinned) {
    used.set(sheet.stock, (used.get(sheet.stock) ?? 0) + 1);
    for (const p of sheet.placements) placed.add(`${p.part}#${p.copy}`);
  }

  const materials: MaterialProblem[] = [];
  for (const material of project.materials) {
    const enabled = project.stock.filter((s) => s.material === material.id && s.enabled !== false);
    const stock = [...enabled.filter((s) => s.kind === "offcut"), ...enabled.filter((s) => s.kind === "sheet")];
    const available = new Map<string, number | null>(
      stock.map((s) => [s.id, s.quantity === null ? null : Math.max(0, s.quantity - (used.get(s.id) ?? 0))]),
    );
    const copies: Copy[] = [];
    const tooLarge: UnplacedCopy[] = [];
    for (const part of project.parts) {
      if (part.material !== material.id) continue;
      const orientations = [false, true].filter((r) => grainOk(ctx, part, r));
      for (let copy = 0; copy < part.quantity; copy++) {
        if (placed.has(`${part.id}#${copy}`)) continue;
        const fits = orientations.some((r) => stock.some((s) => fitsStock(ctx, s, orientedSize(part, r))));
        if (fits) copies.push({ part, copy, orientations });
        else tooLarge.push({ part: part.id, copy, reason: "too-large" });
      }
    }
    if (copies.length > 0 || tooLarge.length > 0) materials.push({ material: material.id, copies, stock, available, tooLarge });
  }
  return { ctx, pinned, materials };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --root packages/core test/optimize/random.test.ts test/optimize/problem.test.ts`
Expected: PASS — 7 tests in 2 files.
Then run `npm run check` from the repo root. Expected: the typecheck is clean and every test passes.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/optimize/random.ts packages/core/src/optimize/problem.ts packages/core/test/optimize/random.test.ts packages/core/test/optimize/problem.test.ts
git commit -m "feat(core): add seeded random numbers and the per-material optimizer problem

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 2: Strip and guillotine constructors

**Files:**
- Create: `packages/core/src/optimize/pack.ts`
- Create: `packages/core/src/optimize/strip.ts`
- Create: `packages/core/src/optimize/guillotine.ts`
- Test: `packages/core/test/optimize/constructors.test.ts`

**Interfaces:**
- Consumes: Task 1 (`Copy`, `MaterialProblem`, `UnplacedCopy`, `fitsStock`, `orientedSize`, `buildProblem`); `usableRect`, `PlanContext` from `src/plan/context.ts`; `EPSILON`, `area`, `Rect`, `Size` from `src/geometry/rect.ts`; `validatePlan` (tests only).
- Produces:
- `pack.ts`: `type RotationPolicy = "keep" | "long" | "short"`, `PackInput { ctx; problem: MaterialProblem; order: Copy[]; stockOrder: Stock[]; rotation: RotationPolicy }`, `PackedSheet { stock: Stock; placements: Placement[] }`, `Packing { sheets: PackedSheet[]; unplaced: UnplacedCopy[] }`, `orientations(copy, policy)`, `sizeOf(copy, rotated)`, `placement(copy, x, y, rotated)`, `StockPool`, `stockPool(input)`.
- `strip.ts`: `stripPack(input: PackInput): Packing`.
- `guillotine.ts`: `type SplitRule = "short-axis" | "long-axis" | "min-area" | "max-area"`, `SPLIT_RULES`, `guillotinePack(input: PackInput, rule: SplitRule): Packing`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/optimize/constructors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import type { Project } from "../../src/format/schema.ts";
import { parseProject } from "../../src/format/parse.ts";
import { guillotinePack, SPLIT_RULES } from "../../src/optimize/guillotine.ts";
import type { PackInput, Packing } from "../../src/optimize/pack.ts";
import { buildProblem } from "../../src/optimize/problem.ts";
import { stripPack } from "../../src/optimize/strip.ts";
import { validatePlan } from "../../src/plan/validate.ts";
import { sampleProject } from "../helpers.ts";

function load(name: string): Project {
  const result = parseProject(EXAMPLES[name]!());
  if (!result.ok) throw new Error(name);
  return result.project;
}

function inputs(project: Project, material = 0): PackInput {
  const problem = buildProblem({ ...project, plan: { sheets: [] } });
  const m = problem.materials[material]!;
  const order = [...m.copies].sort((a, b) => b.part.length * b.part.width - a.part.length * a.part.width);
  return { ctx: problem.ctx, problem: m, order, stockOrder: m.stock, rotation: "keep" };
}

function errors(project: Project, packing: Packing): string[] {
  const sheets = packing.sheets.map((s, i) => ({ id: `s${i + 1}`, stock: s.stock.id, placements: s.placements }));
  return validatePlan({ ...project, plan: { sheets } })
    .filter((i) => i.severity === "error")
    .map((i) => i.code);
}

const packers: [string, (input: PackInput) => Packing][] = [
  ["strip", stripPack],
  ...SPLIT_RULES.map((rule): [string, (input: PackInput) => Packing] => [rule, (input) => guillotinePack(input, rule)]),
];

describe.each(packers)("%s packing", (_name, packer) => {
  it("packs the living-room shelf into valid guillotine sheets", () => {
    const project = load("living-room-shelf");
    for (const material of [0, 1]) {
      const packing = packer(inputs(project, material));
      expect(packing.unplaced).toEqual([]);
      expect(errors(project, packing)).toEqual([]);
    }
  });

  it("fills a sheet exactly: one kerf between parts and none at the usable edge", () => {
    const project = sampleProject();
    project.parts = [{ id: "p", name: "P", material: "ply", length: 47.6875, width: 23.6875, quantity: 4, grain: "length" }];
    const packing = packer(inputs(project));
    expect(packing.sheets).toHaveLength(1);
    expect(errors(project, packing)).toEqual([]);
  });

  it("reports copies past the stock quantity as no-stock", () => {
    const project = sampleProject();
    project.stock[0]!.quantity = 1;
    project.parts = [{ id: "p", name: "P", material: "ply", length: 90, width: 40, quantity: 3, grain: "length" }];
    const packing = packer(inputs(project));
    expect(packing.sheets).toHaveLength(1);
    expect(packing.unplaced.map((u) => [u.copy, u.reason])).toEqual([
      [1, "no-stock"],
      [2, "no-stock"],
    ]);
  });
});

describe("stripPack", () => {
  it("uses 5 sheets of 18mm and 2 of 6mm for the living-room shelf", () => {
    const project = load("living-room-shelf");
    expect([0, 1].map((m) => stripPack(inputs(project, m)).sheets.length)).toEqual([5, 2]);
  });

  it("re-rips a narrower part out of the rest of a segment", () => {
    const project = sampleProject();
    project.parts = [
      { id: "a", name: "A", material: "ply", length: 40, width: 20, quantity: 1, grain: "length" },
      { id: "b", name: "B", material: "ply", length: 30, width: 12, quantity: 1, grain: "length" },
      { id: "c", name: "C", material: "ply", length: 30, width: 7, quantity: 1, grain: "length" },
    ];
    const packing = stripPack(inputs(project));
    expect(packing.sheets[0]!.placements.map((p) => [p.part, p.x, p.y])).toEqual([
      ["a", 0.25, 0.25],
      ["b", 40.375, 0.25],
      ["c", 40.375, 12.375],
    ]);
    expect(errors(project, packing)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --root packages/core test/optimize/constructors.test.ts`
Expected: FAIL — the modules `pack.ts`, `strip.ts`, and `guillotine.ts` do not exist yet.

- [ ] **Step 3: Write the implementation**

`packages/core/src/optimize/pack.ts`:

```ts
import type { Placement, Stock } from "../format/schema.ts";
import type { Size } from "../geometry/rect.ts";
import type { PlanContext } from "../plan/context.ts";
import { fitsStock, orientedSize, type Copy, type MaterialProblem, type UnplacedCopy } from "./problem.ts";

/** Which orientation a rotatable copy tries first: as defined, long side along the stock length, or short side along it. */
export type RotationPolicy = "keep" | "long" | "short";

export interface PackInput {
  ctx: PlanContext;
  problem: MaterialProblem;
  order: Copy[];
  /** Stock in the order new sheets are opened; offcuts come first. */
  stockOrder: Stock[];
  rotation: RotationPolicy;
}

export interface PackedSheet {
  stock: Stock;
  placements: Placement[];
}

export interface Packing {
  sheets: PackedSheet[];
  unplaced: UnplacedCopy[];
}

export function orientations(copy: Copy, policy: RotationPolicy): boolean[] {
  if (copy.orientations.length < 2 || policy === "keep") return copy.orientations;
  const longAlongLength = copy.part.length >= copy.part.width;
  return (policy === "long") === longAlongLength ? [false, true] : [true, false];
}

export function sizeOf(copy: Copy, rotated: boolean): Size {
  return orientedSize(copy.part, rotated);
}

export function placement(copy: Copy, x: number, y: number, rotated: boolean): Placement {
  return { part: copy.part.id, copy: copy.copy, x, y, rotated };
}

export interface StockPool {
  /** The next stock in order that has pieces left and fits the copy, or the reason there is none. */
  take(copy: Copy): Stock | "no-stock";
}

export function stockPool(input: PackInput): StockPool {
  const left = new Map(input.problem.available);
  return {
    take(copy) {
      for (const stock of input.stockOrder) {
        const n = left.get(stock.id);
        if (n === 0 || n === undefined) continue;
        if (!copy.orientations.some((r) => fitsStock(input.ctx, stock, orientedSize(copy.part, r)))) continue;
        if (n !== null) left.set(stock.id, n - 1);
        return stock;
      }
      return "no-stock";
    },
  };
}
```

`packages/core/src/optimize/strip.ts`:

```ts
import { EPSILON, type Rect } from "../geometry/rect.ts";
import { usableRect } from "../plan/context.ts";
import { orientations, placement, sizeOf, stockPool, type PackedSheet, type PackInput, type Packing } from "./pack.ts";
import type { Copy } from "./problem.ts";

/**
 * Rips strips along the stock length at the width of the first part in each strip, crosscuts the strip into
 * segments, and re-rips narrower parts out of the rest of each segment.
 */
export function stripPack(input: PackInput): Packing {
  const { ctx } = input;
  const kerf = ctx.kerf;
  const pool = stockPool(input);
  const pending = [...input.order];
  const sheets: PackedSheet[] = [];
  const unplaced: Packing["unplaced"] = [];

  const take = (fits: (length: number, width: number) => boolean): { copy: Copy; rotated: boolean } | null => {
    for (let i = 0; i < pending.length; i++) {
      const copy = pending[i]!;
      for (const rotated of orientations(copy, input.rotation)) {
        const size = sizeOf(copy, rotated);
        if (fits(size.length, size.width)) {
          pending.splice(i, 1);
          return { copy, rotated };
        }
      }
    }
    return null;
  };

  while (pending.length > 0) {
    const stock = pool.take(pending[0]!);
    if (stock === "no-stock") {
      const copy = pending.shift()!;
      unplaced.push({ part: copy.part.id, copy: copy.copy, reason: "no-stock" });
      continue;
    }
    const usable: Rect = usableRect(ctx, stock);
    const right = usable.x + usable.length + EPSILON;
    const bottom = usable.y + usable.width + EPSILON;
    const sheet: PackedSheet = { stock, placements: [] };
    let y = usable.y;
    for (;;) {
      const starter = take((length, width) => usable.x + length <= right && y + width <= bottom);
      if (!starter) break;
      const height = sizeOf(starter.copy, starter.rotated).width;
      let x = usable.x;
      let next: { copy: Copy; rotated: boolean } | null = starter;
      while (next) {
        const segment = sizeOf(next.copy, next.rotated).length;
        let yy = y;
        let row: { copy: Copy; rotated: boolean } | null = next;
        while (row) {
          sheet.placements.push(placement(row.copy, x, yy, row.rotated));
          yy += sizeOf(row.copy, row.rotated).width + kerf;
          const top = yy;
          row = take((length, width) => length <= segment + EPSILON && top + width <= y + height + EPSILON);
        }
        x += segment + kerf;
        const left = x;
        next = take((length, width) => left + length <= right && width <= height + EPSILON);
      }
      y += height + kerf;
    }
    sheets.push(sheet);
  }
  return { sheets, unplaced };
}
```

`packages/core/src/optimize/guillotine.ts`:

```ts
import { EPSILON, area, type Rect } from "../geometry/rect.ts";
import { usableRect } from "../plan/context.ts";
import { orientations, placement, sizeOf, stockPool, type PackedSheet, type PackInput, type Packing } from "./pack.ts";

/** How a free rectangle is split after a part is placed in its top-left corner (Jylänki, "A Thousand Ways to Pack the Bin"). */
export type SplitRule = "short-axis" | "long-axis" | "min-area" | "max-area";

export const SPLIT_RULES: readonly SplitRule[] = ["short-axis", "long-axis", "min-area", "max-area"];

interface OpenSheet {
  sheet: PackedSheet;
  free: Rect[];
}

/**
 * Best-area-fit guillotine packing over all open sheets. Parts and free rectangles are grown by one kerf on their
 * far edges, so placed parts are at least one kerf apart and may still touch the far edge of the usable area.
 */
export function guillotinePack(input: PackInput, rule: SplitRule): Packing {
  const { ctx } = input;
  const kerf = ctx.kerf;
  const pool = stockPool(input);
  const open: OpenSheet[] = [];
  const unplaced: Packing["unplaced"] = [];

  for (const copy of input.order) {
    let best: { target: OpenSheet; index: number; rotated: boolean; fit: number; side: number } | null = null;
    const consider = (target: OpenSheet) => {
      target.free.forEach((free, index) => {
        for (const rotated of orientations(copy, input.rotation)) {
          const size = sizeOf(copy, rotated);
          const length = size.length + kerf;
          const width = size.width + kerf;
          if (length > free.length + EPSILON || width > free.width + EPSILON) continue;
          const fit = area(free) - length * width;
          const side = Math.min(free.length - length, free.width - width);
          if (!best || fit < best.fit - EPSILON || (Math.abs(fit - best.fit) <= EPSILON && side < best.side - EPSILON)) {
            best = { target, index, rotated, fit, side };
          }
        }
      });
    };
    for (const target of open) consider(target);
    if (!best) {
      const stock = pool.take(copy);
      if (stock === "no-stock") {
        unplaced.push({ part: copy.part.id, copy: copy.copy, reason: "no-stock" });
        continue;
      }
      const usable = usableRect(ctx, stock);
      const target: OpenSheet = {
        sheet: { stock, placements: [] },
        free: [{ ...usable, length: usable.length + kerf, width: usable.width + kerf }],
      };
      open.push(target);
      consider(target);
    }
    const chosen = best as { target: OpenSheet; index: number; rotated: boolean } | null;
    if (!chosen) {
      unplaced.push({ part: copy.part.id, copy: copy.copy, reason: "no-stock" });
      continue;
    }
    const free = chosen.target.free[chosen.index]!;
    const size = sizeOf(copy, chosen.rotated);
    chosen.target.sheet.placements.push(placement(copy, free.x, free.y, chosen.rotated));
    chosen.target.free.splice(chosen.index, 1, ...split(free, size.length + kerf, size.width + kerf, rule));
  }
  return { sheets: open.map((o) => o.sheet), unplaced };
}

function split(free: Rect, length: number, width: number, rule: SplitRule): Rect[] {
  const dl = free.length - length;
  const dw = free.width - width;
  const across: Rect[] = [
    { x: free.x + length, y: free.y, length: dl, width },
    { x: free.x, y: free.y + width, length: free.length, width: dw },
  ];
  const down: Rect[] = [
    { x: free.x + length, y: free.y, length: dl, width: free.width },
    { x: free.x, y: free.y + width, length, width: dw },
  ];
  const smaller = (rects: Rect[]) => Math.min(...rects.map(area));
  const useAcross =
    rule === "short-axis" ? dl <= dw
    : rule === "long-axis" ? dl > dw
    : rule === "min-area" ? smaller(across) <= smaller(down)
    : smaller(across) > smaller(down);
  return (useAcross ? across : down).filter((r) => r.length > EPSILON && r.width > EPSILON);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --root packages/core test/optimize/constructors.test.ts`
Expected: PASS — 17 tests (3 for each of the 5 constructors, plus 2 strip tests).
Then run `npm run check` from the repo root. Expected: the typecheck is clean and every test passes.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/optimize/pack.ts packages/core/src/optimize/strip.ts packages/core/src/optimize/guillotine.ts packages/core/test/optimize/constructors.test.ts
git commit -m "feat(core): add strip and guillotine best-area-fit constructors

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 3: Candidate evaluation and the objective

**Files:**
- Create: `packages/core/src/optimize/evaluate.ts`
- Test: `packages/core/test/optimize/evaluate.test.ts`
- Modify: `packages/core/src/index.ts` (append exports at the end)

**Interfaces:**
- Consumes: Task 1 (`MaterialProblem`, `Problem`, `UnplacedCopy`, `buildProblem`), Task 2 (`Packing`); from Phase 2: `planContext`, `analyzeSheets`, `sequenceCuts`, `checkLayout`, `checkCuts`, `listOffcuts`, `PlanIssue`; `area` from `src/geometry/rect.ts`.
- Produces:
- `Score { unplaced; cost; largestOffcut; cuts; sheets }`, `Evaluated { sheets: PlanSheet[]; unplaced: UnplacedCopy[]; score: Score }`.
- `compareScores(a, b): number` (negative when `a` is better), `pricedMaterial(problem, material): boolean`, `evaluate(problem, material, packing, prefix: string): Evaluated`.
- `src/index.ts` gains `export type { UnplacedCopy, UnplacedReason } from "./optimize/problem.ts";` and `export * from "./optimize/evaluate.ts";`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/optimize/evaluate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { compareScores, evaluate, type Score } from "../../src/optimize/evaluate.ts";
import { buildProblem } from "../../src/optimize/problem.ts";
import { sampleProject } from "../helpers.ts";

const score = (over: Partial<Score>): Score => ({ unplaced: 0, cost: 100, largestOffcut: 50, cuts: 10, sheets: 2, ...over });

describe("compareScores", () => {
  it("compares unplaced, then cost, then largest offcut (bigger wins), then cuts, then sheets", () => {
    const base = score({});
    expect(compareScores(score({ unplaced: 1, cost: 0 }), base)).toBeGreaterThan(0);
    expect(compareScores(score({ cost: 90, largestOffcut: 0 }), base)).toBeLessThan(0);
    expect(compareScores(score({ largestOffcut: 60, cuts: 99 }), base)).toBeLessThan(0);
    expect(compareScores(score({ cuts: 9, sheets: 9 }), base)).toBeLessThan(0);
    expect(compareScores(score({ sheets: 1 }), base)).toBeLessThan(0);
    expect(compareScores(score({ cost: 100 + 1e-12 }), base)).toBe(0);
  });
});

describe("evaluate", () => {
  const packing = (project: ReturnType<typeof sampleProject>) => {
    const problem = buildProblem({ ...project, plan: { sheets: [] } });
    const material = problem.materials[0]!;
    const stock = material.stock[0]!;
    return { problem, material, packing: { sheets: [{ stock, placements: project.plan!.sheets[0]!.placements }], unplaced: [] } };
  };

  it("scores a valid packing by price, offcut, cuts, and sheets", () => {
    const { problem, material, packing: p } = packing(sampleProject());
    const result = evaluate(problem, material, p, "t");
    expect(result.sheets.map((s) => s.id)).toEqual(["t1"]);
    expect(result.score).toMatchObject({ unplaced: 0, cost: 60, cuts: 8, sheets: 1 });
    expect(result.score.largestOffcut).toBeGreaterThan(0);
  });

  it("scores by stock area when a sheet stock has no price or the cost feature is off", () => {
    const project = sampleProject();
    project.settings.features.cost = false;
    const { problem, material, packing: p } = packing(project);
    expect(evaluate(problem, material, p, "t").score.cost).toBe(96 * 48);
  });

  it("drops a sheet no enabled tool can cut and reports its parts as no-tool", () => {
    const project = sampleProject();
    project.tools[0] = { id: "ts", name: "Table saw", type: "table-saw", kerf: 0.125, enabled: true, maxPiece: { length: 50, width: 30 } };
    const { problem, material, packing: p } = packing(project);
    const result = evaluate(problem, material, p, "t");
    expect(result.sheets).toEqual([]);
    expect(result.unplaced).toEqual([
      { part: "side", copy: 0, reason: "no-tool" },
      { part: "side", copy: 1, reason: "no-tool" },
    ]);
    expect(result.score).toMatchObject({ unplaced: 2, cost: 0, cuts: 0, sheets: 0 });
  });

  it("keeps sheets when no tool is enabled at all", () => {
    const project = sampleProject();
    project.tools[0]!.enabled = false;
    const { problem, material, packing: p } = packing(project);
    expect(evaluate(problem, material, p, "t").sheets).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --root packages/core test/optimize/evaluate.test.ts`
Expected: FAIL — the module `evaluate.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

`packages/core/src/optimize/evaluate.ts`:

```ts
import type { PlanSheet, Project } from "../format/schema.ts";
import { area } from "../geometry/rect.ts";
import { planContext } from "../plan/context.ts";
import type { PlanIssue } from "../plan/issues.ts";
import { checkLayout } from "../plan/layout.ts";
import { analyzeSheets } from "../plan/sheets.ts";
import { checkCuts } from "../plan/validate.ts";
import { listOffcuts } from "../reports/offcuts.ts";
import { sequenceCuts } from "../sequence/sequence.ts";
import type { Packing } from "./pack.ts";
import type { MaterialProblem, Problem, UnplacedCopy } from "./problem.ts";

/** Compared in field order; see `compareScores`. */
export interface Score {
  /** Copies that could not be placed. Fewer is better. */
  unplaced: number;
  /** Stock cost, or stock area when prices are missing or the cost feature is off. Owned offcuts count as 0. Lower is better. */
  cost: number;
  /** Area of the largest offcut. Bigger is better. */
  largestOffcut: number;
  /** Cut steps, including trims. Fewer is better. */
  cuts: number;
  sheets: number;
}

export interface Evaluated {
  sheets: PlanSheet[];
  unplaced: UnplacedCopy[];
  score: Score;
}

const RELATIVE = 1e-9;

function differ(a: number, b: number): boolean {
  return Math.abs(a - b) > RELATIVE * Math.max(1, Math.abs(a), Math.abs(b));
}

/** Negative when `a` is better than `b`, positive when worse, 0 when equal. */
export function compareScores(a: Score, b: Score): number {
  if (a.unplaced !== b.unplaced) return a.unplaced - b.unplaced;
  if (differ(a.cost, b.cost)) return a.cost - b.cost;
  if (differ(a.largestOffcut, b.largestOffcut)) return b.largestOffcut - a.largestOffcut;
  if (a.cuts !== b.cuts) return a.cuts - b.cuts;
  return a.sheets - b.sheets;
}

/** True when the material is scored by price: the cost feature is on and every sheet stock of it has a price. */
export function pricedMaterial(problem: Problem, material: MaterialProblem): boolean {
  return problem.ctx.features.cost && material.stock.every((s) => s.kind === "offcut" || s.cost !== undefined);
}

/**
 * Validates a packing with the same checks as a manual layout and drops every sheet that has an error;
 * the parts of a dropped sheet become unplaced. A plan-wide `no-tool` error (no tool is enabled) drops nothing.
 */
export function evaluate(problem: Problem, material: MaterialProblem, packing: Packing, prefix: string): Evaluated {
  const sheets: PlanSheet[] = packing.sheets.map((s, i) => ({ id: `${prefix}${i + 1}`, stock: s.stock.id, placements: s.placements }));
  const project: Project = { ...problem.ctx.project, plan: { sheets } };
  const ctx = planContext(project);
  const analyses = analyzeSheets(ctx);
  const steps = sequenceCuts(ctx, analyses);
  const layout = checkLayout(ctx);
  const issues = [...layout, ...checkCuts(ctx, layout, analyses, steps)];

  const dropped = new Map<string, "no-tool" | "not-guillotine">();
  for (const issue of issues) {
    if (issue.severity !== "error") continue;
    for (const id of sheetsOf(issue)) {
      if (dropped.get(id) !== "no-tool") dropped.set(id, issue.code === "no-tool" ? "no-tool" : "not-guillotine");
    }
  }

  const unplaced = [...material.tooLarge, ...packing.unplaced];
  const kept: PlanSheet[] = [];
  for (const sheet of sheets) {
    const reason = dropped.get(sheet.id);
    if (reason === undefined) kept.push(sheet);
    else for (const p of sheet.placements) unplaced.push({ part: p.part, copy: p.copy, reason });
  }
  const keptIds = new Set(kept.map((s) => s.id));
  const keptAnalyses = analyses.filter((a) => keptIds.has(a.sheet.id));
  const priced = pricedMaterial(problem, material);
  let cost = 0;
  for (const a of keptAnalyses) {
    if (a.stock.kind === "offcut") continue;
    cost += priced ? (a.stock.cost ?? 0) : area(a.stock);
  }
  const largestOffcut = Math.max(0, ...listOffcuts(ctx, keptAnalyses).map((o) => area(o.rect)));
  const order = new Map(problem.ctx.project.parts.map((p, i) => [p.id, i]));
  unplaced.sort((a, b) => (order.get(a.part) ?? 0) - (order.get(b.part) ?? 0) || a.copy - b.copy);
  return {
    sheets: kept,
    unplaced,
    score: {
      unplaced: unplaced.length,
      cost,
      largestOffcut,
      cuts: steps.filter((s) => keptIds.has(s.sheet)).length,
      sheets: kept.length,
    },
  };
}

function sheetsOf(issue: PlanIssue): string[] {
  const ids = new Set<string>();
  for (const ref of issue.refs) {
    if (ref.kind === "sheet" || ref.kind === "placement" || ref.kind === "cut") ids.add(ref.sheet);
  }
  return [...ids];
}
```

Append to the end of `packages/core/src/index.ts`:

```ts
export type { UnplacedCopy, UnplacedReason } from "./optimize/problem.ts";
export * from "./optimize/evaluate.ts";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --root packages/core test/optimize/evaluate.test.ts`
Expected: PASS — 5 tests.
Then run `npm run check` from the repo root. Expected: the typecheck is clean and every test passes.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/optimize/evaluate.ts packages/core/test/optimize/evaluate.test.ts packages/core/src/index.ts
git commit -m "feat(core): validate and score optimizer candidates

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 4: Search, optimize, pinning, and keep searching

**Files:**
- Create: `packages/core/src/optimize/search.ts`
- Test: `packages/core/test/optimize/search.test.ts`
- Modify: `packages/core/src/index.ts` (append exports at the end)
- Modify: `examples/builders/simple-bookcase-mm.ts`; regenerate `examples/simple-bookcase-mm.cutplan.json`

**Interfaces:**
- Consumes: Tasks 1–3; `uniqueId` from `src/format/ids.ts`; `validatePlan`, `parseProject`, `createProject` (tests).
- Produces:
- `OptimizeOptions { timeLimitMs?; seed?; iterations?; now?: () => number; start?: OptimizeResult }`, `MaterialResult { material; score }`, `OptimizeResult { sheets: PlanSheet[]; unplaced: UnplacedCopy[]; materials: MaterialResult[]; iterations: number }`, `Search { step(budgetMs): boolean; result(): OptimizeResult }`.
- `createSearch(project, options?): Search`, `optimize(project, options?): OptimizeResult`, `applyOptimizeResult(project, result): Project`.
- `src/index.ts` gains `export * from "./optimize/search.ts";`.

- [ ] **Step 1: Give the bookcase example a track saw rail that can cut its sheets**

The 1.4 m rail cannot make a cut along a 2440 mm sheet, and the table saw's `maxPiece` is smaller than the sheet, so no tool can cut the example's sheets. In `examples/builders/simple-bookcase-mm.ts`, replace the track saw line with:

```ts
      { id: "track-saw", name: "Track saw (2.8 m rail)", type: "track-saw", kerf: 2.2, enabled: true, maxCut: 2800 },
```

Then run `npm run examples` from the repo root. Expected: `wrote living-room-shelf` and `wrote simple-bookcase-mm`; `git diff --stat` shows only the builder and `examples/simple-bookcase-mm.cutplan.json` (the tool `name` and `maxCut`).

- [ ] **Step 2: Write the failing tests**

`packages/core/test/optimize/search.test.ts`:

```ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import type { Project } from "../../src/format/schema.ts";
import { createProject } from "../../src/format/defaults.ts";
import { parseProject } from "../../src/format/parse.ts";
import { applyOptimizeResult, createSearch, optimize } from "../../src/optimize/search.ts";
import { validatePlan } from "../../src/plan/validate.ts";
import { sampleProject } from "../helpers.ts";

function load(name: string): Project {
  const result = parseProject(EXAMPLES[name]!());
  if (!result.ok) throw new Error(name);
  return result.project;
}

const errors = (project: Project) => validatePlan(project).filter((i) => i.severity === "error");

describe("optimize", () => {
  it("plans the living-room shelf on at most 5 + 2 sheets with no errors", () => {
    const project = load("living-room-shelf");
    const result = optimize(project, { iterations: 20 });
    expect(result.unplaced).toEqual([]);
    expect(result.materials.map((m) => [m.material, m.score.sheets])).toEqual([
      ["bb18", 5],
      ["bb6", 2],
    ]);
    expect(errors(applyOptimizeResult(project, result))).toEqual([]);
  });

  it("plans the mm bookcase with its own saws and uses the owned offcut", () => {
    const project = load("simple-bookcase-mm");
    const result = optimize(project, { iterations: 30 });
    expect(result.unplaced).toEqual([]);
    expect(errors(applyOptimizeResult(project, result))).toEqual([]);
    expect(result.materials.map((m) => [m.material, m.score.cost])).toEqual([
      ["mdf18", 42],
      ["hdf3", 15],
    ]);
  });

  it("gives the same plan for the same seed and iteration count", () => {
    const project = load("living-room-shelf");
    const a = optimize(project, { iterations: 60, seed: 5 });
    const b = optimize(project, { iterations: 60, seed: 5 });
    expect(b).toEqual(a);
  });

  it("stops at the time limit and still returns a plan for every material", () => {
    const project = load("living-room-shelf");
    let clock = 0;
    const result = optimize(project, { timeLimitMs: 10, now: () => (clock += 1) });
    expect(result.materials).toHaveLength(2);
    expect(result.iterations).toBeGreaterThanOrEqual(2);
    expect(result.iterations).toBeLessThan(20);
  });

  it("uses an owned offcut before buying a sheet", () => {
    const project = sampleProject();
    project.stock.push({ id: "scrap", material: "ply", length: 40, width: 30, quantity: 1, kind: "offcut" });
    const result = optimize({ ...project, plan: { sheets: [] } }, { iterations: 20 });
    expect(result.sheets.map((s) => s.stock)).toEqual(["scrap"]);
    expect(result.materials[0]!.score.cost).toBe(0);
  });

  it("reports parts larger than every stock and parts past the stock quantity", () => {
    const project = sampleProject();
    project.stock[0]!.quantity = 1;
    project.parts = [
      { id: "big", name: "Big", material: "ply", length: 90, width: 40, quantity: 2, grain: "length" },
      { id: "huge", name: "Huge", material: "ply", length: 100, width: 10, quantity: 1, grain: "length" },
    ];
    const result = optimize({ ...project, plan: { sheets: [] } }, { iterations: 10 });
    expect(result.unplaced).toEqual([
      { part: "big", copy: 1, reason: "no-stock" },
      { part: "huge", copy: 0, reason: "too-large" },
    ]);
  });

  it("keeps pinned sheets unchanged and plans only the other copies", () => {
    const project = load("living-room-shelf");
    const pinned = { ...project.plan!.sheets[0]!, pinned: true };
    const input = { ...project, plan: { sheets: [pinned, ...project.plan!.sheets.slice(1)] } };
    const result = optimize(input, { iterations: 10 });
    expect(result.sheets[0]).toEqual(pinned);
    const ids = result.sheets.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const placed = result.sheets.flatMap((s) => s.placements.map((p) => `${p.part}#${p.copy}`));
    expect(new Set(placed).size).toBe(placed.length);
    expect(placed).toHaveLength(31);
    expect(errors(applyOptimizeResult(input, result))).toEqual([]);
  });

  it("continues from a previous result and never gets worse", () => {
    const project = load("simple-bookcase-mm");
    const first = optimize(project, { iterations: 5 });
    const more = optimize(project, { iterations: 30, start: first });
    expect(more.iterations).toBe(first.iterations + 60);
    first.materials.forEach((m, i) => {
      const next = more.materials[i]!.score;
      expect(next.unplaced).toBeLessThanOrEqual(m.score.unplaced);
      expect(next.cost).toBeLessThanOrEqual(m.score.cost);
    });
  });

  it("returns at once when there is nothing to plan", () => {
    const project = { ...sampleProject(), parts: [], plan: { sheets: [] } };
    expect(optimize(project, { now: () => 0 })).toEqual({ sheets: [], unplaced: [], materials: [], iterations: 0 });
  });

  it("steps in slices until finished", () => {
    const search = createSearch(load("living-room-shelf"), { iterations: 3 });
    let steps = 0;
    while (!search.step(0)) steps++;
    expect(steps).toBeGreaterThan(0);
    expect(search.result().iterations).toBe(6);
  });
});

describe("optimize on random projects", () => {
  const arb = fc.record({
    units: fc.constantFrom("in" as const, "mm" as const),
    kerf: fc.constantFrom(0, 0.125, 0.25, 2.2, 3.2),
    trim: fc.constantFrom(0, 0.25, 1),
    grained: fc.boolean(),
    grain: fc.boolean(),
    stock: fc.array(
      fc.record({
        length: fc.integer({ min: 20, max: 120 }),
        width: fc.integer({ min: 10, max: 60 }),
        quantity: fc.option(fc.integer({ min: 1, max: 3 })),
        offcut: fc.boolean(),
      }),
      { minLength: 1, maxLength: 3 },
    ),
    parts: fc.array(
      fc.record({
        length: fc.double({ min: 1, max: 70, noNaN: true }),
        width: fc.double({ min: 1, max: 40, noNaN: true }),
        quantity: fc.integer({ min: 1, max: 5 }),
        grain: fc.constantFrom("length" as const, "width" as const, "none" as const),
      }),
      { minLength: 1, maxLength: 8 },
    ),
    maxRip: fc.option(fc.integer({ min: 5, max: 60 })),
    seed: fc.integer(),
  });

  it("returns plans with no errors, and every copy is placed or reported unplaced", () => {
    fc.assert(
      fc.property(arb, (a) => {
        const base = createProject("Random", a.units);
        const project: Project = {
          ...base,
          materials: [{ id: "m", name: "M", thickness: 0.75, grained: a.grained }],
          stock: a.stock.map((s, i) => ({
            id: `st${i}`,
            material: "m",
            length: s.length,
            width: s.width,
            quantity: s.offcut ? (s.quantity ?? 1) : s.quantity,
            kind: s.offcut ? ("offcut" as const) : ("sheet" as const),
          })),
          parts: a.parts.map((p, i) => ({ id: `p${i}`, name: `P${i}`, material: "m", ...p })),
          tools: [
            { id: "t", name: "T", type: "table-saw", kerf: a.kerf, enabled: true, ...(a.maxRip === null ? {} : { maxRip: a.maxRip }) },
          ],
          settings: { ...base.settings, trim: a.trim, features: { ...base.settings.features, grain: a.grain } },
        };
        const result = optimize(project, { iterations: 15, seed: a.seed });
        expect(errors(applyOptimizeResult(project, result))).toEqual([]);
        const placed = result.sheets.reduce((n, s) => n + s.placements.length, 0);
        expect(placed + result.unplaced.length).toBe(a.parts.reduce((n, p) => n + p.quantity, 0));
        expect(result.unplaced.every((u) => u.reason !== "not-guillotine")).toBe(true);
      }),
      { numRuns: 150 },
    );
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run --root packages/core test/optimize/search.test.ts`
Expected: FAIL — the module `search.ts` does not exist yet.

- [ ] **Step 4: Write the implementation**

`packages/core/src/optimize/search.ts`:

```ts
import type { PlanSheet, Project, Stock } from "../format/schema.ts";
import { uniqueId } from "../format/ids.ts";
import { compareScores, evaluate, type Evaluated, type Score } from "./evaluate.ts";
import { guillotinePack, SPLIT_RULES, type SplitRule } from "./guillotine.ts";
import type { Packing, RotationPolicy } from "./pack.ts";
import { buildProblem, type Copy, type MaterialProblem, type Problem, type UnplacedCopy } from "./problem.ts";
import { randomInt, seededRandom, shuffled, type Random } from "./random.ts";
import { stripPack } from "./strip.ts";

export interface OptimizeOptions {
  /** Defaults to `settings.optimizer.timeLimitMs`. */
  timeLimitMs?: number;
  /** Defaults to `settings.optimizer.seed`, else 1. */
  seed?: number;
  /** Candidates per material. When set, the time limit is ignored and the result depends only on the seed. */
  iterations?: number;
  /** Milliseconds clock; defaults to `Date.now`. */
  now?: () => number;
  /** A previous result for the same project: the search continues from its plans ("Keep searching"). */
  start?: OptimizeResult;
}

export interface MaterialResult {
  material: string;
  score: Score;
}

export interface OptimizeResult {
  /** Pinned sheets unchanged, then the new sheets for each material. */
  sheets: PlanSheet[];
  unplaced: UnplacedCopy[];
  materials: MaterialResult[];
  /** Candidates evaluated so far, over all materials. */
  iterations: number;
}

export interface Search {
  /** Runs candidates for about `budgetMs`; returns true when the search is finished. */
  step(budgetMs: number): boolean;
  result(): OptimizeResult;
}

type Constructor = "strip" | SplitRule;

const CONSTRUCTORS: readonly Constructor[] = ["strip", ...SPLIT_RULES];

interface Candidate {
  order: Copy[];
  constructor: Constructor;
  stockOrder: Stock[];
  rotation: RotationPolicy;
}

interface MaterialSearch {
  problem: MaterialProblem;
  base: Candidate[];
  next: number;
  evaluated: number;
  best: { candidate: Candidate; result: Evaluated } | null;
}

const ORDERS: readonly ((a: Copy, b: Copy) => number)[] = [
  (a, b) => b.part.length * b.part.width - a.part.length * a.part.width,
  (a, b) => Math.max(b.part.length, b.part.width) - Math.max(a.part.length, a.part.width),
  (a, b) => b.part.length - a.part.length || b.part.width - a.part.width,
  (a, b) => b.part.width - a.part.width || b.part.length - a.part.length,
];

const MAX_STOCK_ORDERS = 6;

export function createSearch(project: Project, options: OptimizeOptions = {}): Search {
  const problem = buildProblem(project);
  const settings = project.settings.optimizer;
  const timeLimit = options.timeLimitMs ?? settings.timeLimitMs;
  const seed = options.seed ?? settings.seed ?? 1;
  const now = options.now ?? Date.now;
  const random = seededRandom(seed + (options.start?.iterations ?? 0));
  const searches = problem.materials.map((m): MaterialSearch => ({ problem: m, base: baseCandidates(m), next: 0, evaluated: 0, best: null }));
  if (options.start) seedFrom(problem, searches, options.start);
  let iterations = options.start?.iterations ?? 0;
  let elapsed = 0;
  let turn = 0;

  const finished = () => {
    if (searches.length === 0) return true;
    if (searches.some((s) => s.best === null)) return false;
    if (options.iterations !== undefined) return searches.every((s) => s.evaluated >= options.iterations!);
    return elapsed >= timeLimit;
  };

  const runOne = () => {
    const pending = searches.filter((s) => options.iterations === undefined || s.evaluated < options.iterations);
    const search = pending.find((s) => s.best === null) ?? pending[turn++ % pending.length];
    if (!search) return;
    const candidate = search.next < search.base.length ? search.base[search.next++]! : randomCandidate(random, search);
    const result = evaluate(problem, search.problem, pack(problem, search.problem, candidate), `${search.problem.material}:`);
    search.evaluated++;
    iterations++;
    if (!search.best || compareScores(result.score, search.best.result.score) < 0) search.best = { candidate, result };
  };

  return {
    step(budgetMs) {
      const started = now();
      while (!finished()) {
        runOne();
        const spent = now() - started;
        if (options.iterations === undefined && elapsed + spent >= timeLimit) break;
        if (spent >= budgetMs) break;
      }
      elapsed += now() - started;
      return finished();
    },
    result: () => assemble(problem, searches, iterations),
  };
}

export function optimize(project: Project, options: OptimizeOptions = {}): OptimizeResult {
  const search = createSearch(project, options);
  while (!search.step(Number.POSITIVE_INFINITY));
  return search.result();
}

/** The project with its plan replaced by the optimized sheets. */
export function applyOptimizeResult(project: Project, result: OptimizeResult): Project {
  return { ...project, plan: { ...project.plan, sheets: result.sheets } };
}

function pack(problem: Problem, material: MaterialProblem, candidate: Candidate): Packing {
  const input = { ctx: problem.ctx, problem: material, order: candidate.order, stockOrder: candidate.stockOrder, rotation: candidate.rotation };
  return candidate.constructor === "strip" ? stripPack(input) : guillotinePack(input, candidate.constructor);
}

function stockOrders(material: MaterialProblem): Stock[][] {
  const offcuts = material.stock.filter((s) => s.kind === "offcut");
  const sheets = material.stock.filter((s) => s.kind === "sheet");
  const orders: Stock[][] = [];
  const permute = (rest: Stock[], prefix: Stock[]) => {
    if (orders.length >= MAX_STOCK_ORDERS) return;
    if (rest.length === 0) {
      orders.push([...offcuts, ...prefix]);
      return;
    }
    rest.forEach((s, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...prefix, s]));
  };
  permute(sheets, []);
  return orders;
}

function rotations(material: MaterialProblem): RotationPolicy[] {
  return material.copies.some((c) => c.orientations.length > 1) ? ["keep", "long", "short"] : ["keep"];
}

function baseCandidates(material: MaterialProblem): Candidate[] {
  const out: Candidate[] = [];
  for (const compare of ORDERS) {
    const order = [...material.copies].sort(compare);
    for (const constructor of CONSTRUCTORS) {
      for (const stockOrder of stockOrders(material)) {
        for (const rotation of rotations(material)) out.push({ order, constructor, stockOrder, rotation });
      }
    }
  }
  return out;
}

function randomCandidate(random: Random, search: MaterialSearch): Candidate {
  const material = search.problem;
  const from = search.best?.candidate ?? search.base[0]!;
  const order = [...from.order];
  if (random() < 0.3 || order.length < 2) {
    const noise = new Map(order.map((c) => [c, c.part.length * c.part.width * (0.7 + 0.6 * random())]));
    order.sort((a, b) => noise.get(b)! - noise.get(a)!);
  } else {
    const swaps = 1 + randomInt(random, 3);
    for (let n = 0; n < swaps; n++) {
      const i = randomInt(random, order.length);
      const j = randomInt(random, order.length);
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
  }
  const stock = stockOrders(material);
  const offcuts = material.stock.filter((s) => s.kind === "offcut");
  const stockOrder = random() < 0.5 ? from.stockOrder : [...offcuts, ...shuffled(random, stock[0]!.slice(offcuts.length))];
  const rotationList = rotations(material);
  return {
    order,
    constructor: random() < 0.5 ? from.constructor : CONSTRUCTORS[randomInt(random, CONSTRUCTORS.length)]!,
    stockOrder,
    rotation: random() < 0.5 ? from.rotation : rotationList[randomInt(random, rotationList.length)]!,
  };
}

function seedFrom(problem: Problem, searches: MaterialSearch[], start: OptimizeResult) {
  const pinned = new Set(problem.pinned.map((s) => s.id));
  for (const search of searches) {
    const stockIds = new Set(search.problem.stock.map((s) => s.id));
    const sheets = start.sheets.filter((s) => !pinned.has(s.id) && stockIds.has(s.stock));
    const copies = new Map(search.problem.copies.map((c) => [`${c.part.id}#${c.copy}`, c]));
    const order: Copy[] = [];
    for (const sheet of sheets) {
      for (const p of sheet.placements) {
        const copy = copies.get(`${p.part}#${p.copy}`);
        if (copy) {
          order.push(copy);
          copies.delete(`${p.part}#${p.copy}`);
        }
      }
    }
    order.push(...copies.values());
    const stockById = new Map(search.problem.stock.map((s) => [s.id, s]));
    const packing: Packing = {
      sheets: sheets.flatMap((s) => {
        const stock = stockById.get(s.stock);
        return stock ? [{ stock, placements: s.placements }] : [];
      }),
      unplaced: [...copies.values()].map((c) => ({ part: c.part.id, copy: c.copy, reason: "no-stock" as const })),
    };
    const base = search.base[0];
    if (!base) continue;
    search.best = { candidate: { ...base, order }, result: evaluate(problem, search.problem, packing, `${search.problem.material}:`) };
    search.next = search.base.length;
  }
}

function assemble(problem: Problem, searches: MaterialSearch[], iterations: number): OptimizeResult {
  const taken = new Set(problem.pinned.map((s) => s.id));
  const sheets: PlanSheet[] = [...problem.pinned];
  const unplaced: UnplacedCopy[] = [];
  const materials: MaterialResult[] = [];
  for (const search of searches) {
    if (!search.best) continue;
    for (const sheet of search.best.result.sheets) {
      const id = uniqueId(`s${sheets.length + 1}`, taken);
      taken.add(id);
      sheets.push({ id, stock: sheet.stock, placements: sheet.placements });
    }
    unplaced.push(...search.best.result.unplaced);
    materials.push({ material: search.problem.material, score: search.best.result.score });
  }
  return { sheets, unplaced, materials, iterations };
}
```

Append to the end of `packages/core/src/index.ts`:

```ts
export * from "./optimize/search.ts";
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --root packages/core test/optimize/search.test.ts`
Expected: PASS — 11 tests, including the property test (150 random projects).
Then run `npm run check` from the repo root. Expected: the typecheck is clean and every test passes.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/optimize/search.ts packages/core/test/optimize/search.test.ts packages/core/src/index.ts examples/builders/simple-bookcase-mm.ts examples/simple-bookcase-mm.cutplan.json
git commit -m "feat(core): search for the best plan with pinning and keep searching

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 5: Worker message protocol

**Files:**
- Create: `packages/core/src/optimize/worker.ts`
- Test: `packages/core/test/optimize/worker.test.ts`
- Modify: `packages/core/src/index.ts` (append exports at the end)

**Interfaces:**
- Consumes: Task 4 (`createSearch`, `OptimizeOptions`, `OptimizeResult`).
- Produces:
- `OptimizerRequest` (`start` / `cancel`), `OptimizerResponse` (`progress` / `done` / `error`), `type Schedule = (run: () => void) => void`.
- `createOptimizerHost(post, schedule?): (request: OptimizerRequest) => void`.
- `src/index.ts` gains `export * from "./optimize/worker.ts";`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/optimize/worker.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import type { Project } from "../../src/format/schema.ts";
import { parseProject } from "../../src/format/parse.ts";
import { createOptimizerHost, type OptimizerResponse } from "../../src/optimize/worker.ts";

function shelf(): Project {
  const result = parseProject(EXAMPLES["living-room-shelf"]!());
  if (!result.ok) throw new Error("shelf");
  return result.project;
}

function host() {
  const sent: OptimizerResponse[] = [];
  const queue: (() => void)[] = [];
  const handle = createOptimizerHost((m) => sent.push(m), (run) => queue.push(run));
  const drain = (limit = 1000) => {
    for (let i = 0; i < limit && queue.length > 0; i++) queue.shift()!();
  };
  return { sent, queue, handle, drain };
}

describe("createOptimizerHost", () => {
  it("sends progress after each slice and done at the end", () => {
    const { sent, handle, drain } = host();
    handle({ type: "start", id: 1, project: shelf(), options: { iterations: 4 }, progressMs: 0 });
    drain();
    const last = sent.at(-1)!;
    expect(last).toMatchObject({ type: "done", id: 1, cancelled: false });
    expect(sent.slice(0, -1).every((m) => m.type === "progress" && m.id === 1)).toBe(true);
    expect(sent.length).toBeGreaterThan(1);
    if (last.type === "done") expect(last.result.iterations).toBe(8);
  });

  it("stops on cancel and sends the best result so far", () => {
    const { sent, queue, handle } = host();
    handle({ type: "start", id: 2, project: shelf(), options: { iterations: 1000 }, progressMs: 0 });
    queue.shift()!();
    handle({ type: "cancel", id: 2 });
    expect(sent.at(-1)).toMatchObject({ type: "done", id: 2, cancelled: true });
    const count = sent.length;
    while (queue.length > 0) queue.shift()!();
    expect(sent).toHaveLength(count);
  });

  it("cancels the running job when a new one starts", () => {
    const { sent, handle, drain } = host();
    handle({ type: "start", id: 3, project: shelf(), options: { iterations: 1000 }, progressMs: 0 });
    handle({ type: "start", id: 4, project: shelf(), options: { iterations: 1 }, progressMs: 0 });
    drain();
    expect(sent[0]).toMatchObject({ type: "done", id: 3, cancelled: true });
    expect(sent.at(-1)).toMatchObject({ type: "done", id: 4, cancelled: false });
    expect(sent.filter((m) => m.id === 3)).toHaveLength(1);
  });

  it("reports an error for a project it cannot read", () => {
    const { sent, handle, drain } = host();
    handle({ type: "start", id: 5, project: {} as Project });
    drain();
    expect(sent).toEqual([{ type: "error", id: 5, message: expect.any(String) }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --root packages/core test/optimize/worker.test.ts`
Expected: FAIL — the module `worker.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

`packages/core/src/optimize/worker.ts`:

```ts
import type { Project } from "../format/schema.ts";
import { createSearch, type OptimizeOptions, type OptimizeResult } from "./search.ts";

export type OptimizerRequest =
  | { type: "start"; id: number; project: Project; options?: Omit<OptimizeOptions, "now">; progressMs?: number }
  | { type: "cancel"; id: number };

export type OptimizerResponse =
  | { type: "progress"; id: number; result: OptimizeResult }
  | { type: "done"; id: number; result: OptimizeResult; cancelled: boolean }
  | { type: "error"; id: number; message: string };

export type Schedule = (run: () => void) => void;

const DEFAULT_PROGRESS_MS = 100;

/**
 * The message handler for an optimizer worker. The search runs in slices of `progressMs` with a `progress` message
 * after each slice, and yields between slices so a `cancel` can arrive. A new `start` cancels the running job.
 * In a Web Worker: `self.onmessage = (e) => handle(e.data)` with `handle = createOptimizerHost((m) => self.postMessage(m))`.
 */
export function createOptimizerHost(
  post: (response: OptimizerResponse) => void,
  schedule: Schedule = (run) => void setTimeout(run, 0),
): (request: OptimizerRequest) => void {
  let job: { id: number; cancelled: boolean; search: ReturnType<typeof createSearch> } | null = null;

  const stop = () => {
    if (!job) return;
    job.cancelled = true;
    post({ type: "done", id: job.id, result: job.search.result(), cancelled: true });
    job = null;
  };

  return (request) => {
    if (request.type === "cancel") {
      if (job?.id === request.id) stop();
      return;
    }
    stop();
    let search: ReturnType<typeof createSearch>;
    try {
      search = createSearch(request.project, request.options ?? {});
    } catch (e) {
      post({ type: "error", id: request.id, message: (e as Error).message });
      return;
    }
    const current = { id: request.id, cancelled: false, search };
    job = current;
    const slice = request.progressMs ?? DEFAULT_PROGRESS_MS;
    const tick = () => {
      if (current.cancelled) return;
      try {
        const finished = current.search.step(slice);
        if (finished) {
          job = null;
          post({ type: "done", id: current.id, result: current.search.result(), cancelled: false });
        } else {
          post({ type: "progress", id: current.id, result: current.search.result() });
          schedule(tick);
        }
      } catch (e) {
        job = null;
        post({ type: "error", id: current.id, message: (e as Error).message });
      }
    };
    schedule(tick);
  };
}
```

Append to the end of `packages/core/src/index.ts`:

```ts
export * from "./optimize/worker.ts";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --root packages/core test/optimize/worker.test.ts`
Expected: PASS — 4 tests.
Then run `npm run check` from the repo root. Expected: the typecheck is clean and every test passes.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/optimize/worker.ts packages/core/test/optimize/worker.test.ts packages/core/src/index.ts
git commit -m "feat(core): add the optimizer worker message protocol

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

### Task 6: Documentation and spec amendments

**Files:**
- Create: `docs/optimizer.md`
- Modify: `README.md`, `docs/superpowers/specs/2026-09-27-opencutplan-design.md`

**Interfaces:**
- Consumes: the behaviour built in Tasks 1–5.
- Produces: user and third-party documentation of the optimizer; spec text that matches the implementation.

- [ ] **Step 1: Write `docs/optimizer.md`**

````markdown
# Optimizer

`optimize(project, options)` in `@opencutplan/core` builds a plan for every part copy that is not on a pinned sheet.
`applyOptimizeResult(project, result)` puts the result into the project's plan. The optimizer never changes the
project it is given.

## What it keeps

- **Pinned sheets** (`pinned: true`) stay exactly as they are, with their placements. Their copies are not planned
  again, and each pinned sheet counts against its stock's `quantity`. All other sheets in the plan are replaced.
- **New sheet ids** are `s1`, `s2`, … in order after the pinned sheets, skipping ids that pinned sheets use.

## Inputs

Each material is planned on its own, with:

- its part copies, with the orientations the grain allows (see `grain` in [`cut-analysis.md`](cut-analysis.md));
- its enabled stock (`enabled` is not `false`): owned offcuts first, then sheets;
- the planning kerf and trim from [`cut-analysis.md`](cut-analysis.md#terms).

The optimizer always builds guillotine layouts, even when the `cutOrder` feature is off.

## Constructors

Each candidate plan comes from one constructor, a part order, a stock order, and a rotation policy.

- **Strip**: rips a strip along the stock length at the width of its first part, crosscuts the strip into segments,
  and re-rips narrower parts out of the rest of each segment. This is the common shop practice.
- **Guillotine best-area-fit**: places each part in the free rectangle of any open sheet that it fills best, then
  splits the rest of that rectangle in two (Jylänki, "A Thousand Ways to Pack the Bin"). The four split rules are
  `short-axis`, `long-axis`, `min-area`, and `max-area`.

Parts are at least one kerf apart and may touch the edge of the usable area. When no open sheet has room, the
constructor opens the first stock in the stock order that has pieces left and that the part fits.

The **rotation policy** decides which orientation a part that may rotate tries first: `keep` (as defined), `long`
(long side along the stock length), or `short`.

## Search

1. The optimizer first tries every combination of four part orders (area, longest side, length, and width, each
   largest first), the five constructors, up to six sheet stock orders, and the rotation policies.
2. It then tries random changes to the best candidate so far: swaps in the part order, a new order by area with
   random noise, another constructor, another stock order, or another rotation policy.
3. It stops at `timeLimitMs` (default `settings.optimizer.timeLimitMs`), but only after every material has at least
   one candidate. With `iterations`, it runs exactly that many candidates per material and ignores the time.

The random numbers come from `seed` (default `settings.optimizer.seed`, else 1). The same seed and iteration count
always give the same result. A timed run can stop at a different candidate on a different computer.

**Keep searching**: pass the previous result as `start`. The search starts from its plans, skips the first stage, and
continues with new random numbers.

## Validation

Every candidate goes through the validator in [`cut-analysis.md`](cut-analysis.md). A sheet with any error is dropped,
and its parts become unplaced. So the optimizer never returns a sheet with an error. When no tool is enabled at all,
the plan-wide `no-tool` error drops nothing; the validator still reports it.

## Objective

Candidates are compared per material, in this order:

1. **Unplaced copies**: fewer is better.
2. **Cost**: the sum of the stock `cost` of the sheets used. Owned offcuts count as 0. When the `cost` feature is off,
   or any enabled sheet stock of the material has no `cost`, the stock area is used in place of the cost.
3. **Largest offcut** area: bigger is better (0 when the `offcuts` feature is off).
4. **Cut steps**, including trims: fewer is better.
5. **Sheets**: fewer is better.

## Result

`OptimizeResult` has:

- `sheets`: the pinned sheets, then the new sheets of each material, in project material order;
- `unplaced`: `{ part, copy, reason }` for each copy with no place, in part order;
- `materials`: `{ material, score }`, with the score fields above;
- `iterations`: the candidates tried, over all materials, including those of a `start` result.

| `reason` | Meaning |
|---|---|
| `too-large` | the copy fits no enabled stock of its material in any allowed orientation |
| `no-stock` | the stock quantities ran out |
| `no-tool` | no enabled tool can make a cut that its sheet needs |
| `not-guillotine` | its sheet failed the validator for another reason; the constructors are not expected to cause it |

## Worker protocol

The web app runs the optimizer in a Web Worker. `createOptimizerHost(post)` returns the worker's message handler:

```ts
const handle = createOptimizerHost((message) => self.postMessage(message));
self.onmessage = (event) => handle(event.data);
```

| Message | Direction | Fields |
|---|---|---|
| `start` | to the worker | `id`, `project`, optional `options` (all `OptimizeOptions` except `now`), optional `progressMs` (default 100) |
| `cancel` | to the worker | `id` |
| `progress` | from the worker | `id`, `result` (the best result so far) |
| `done` | from the worker | `id`, `result`, `cancelled` |
| `error` | from the worker | `id`, `message` |

The worker runs the search in slices of `progressMs` and sends `progress` after each slice. It yields between slices,
so a `cancel` can arrive. A cancelled job sends `done` with `cancelled: true` and its best result so far. A new
`start` cancels the running job first.

For code that does not use a worker, `createSearch(project, options)` returns a search with `step(budgetMs)`, which
returns true when the search is finished, and `result()`.
````

- [ ] **Step 2: Amend the README**

Run this script from the repo root. It asserts that each old string occurs exactly once.

```python
from pathlib import Path
p = Path("README.md")
s = p.read_text()
edits = [
    ("saw. It is under development: this repository currently contains the core library (file format, CSV, and cut analysis).",
     "saw. It is under development: this repository currently contains the core library (file format, CSV, cut analysis,\nand the optimizer)."),
    ("  rules, shop sequence, offcuts, and reports.\n",
     "  rules, shop sequence, offcuts, and reports.\n- **Optimizer:** [`docs/optimizer.md`](docs/optimizer.md) — plan generation, the objective, pinning, and the worker\n  protocol.\n"),
]
for old, new in edits:
    assert s.count(old) == 1, old
    s = s.replace(old, new)
p.write_text(s)
print("amended", len(edits))
```

Expected output: `amended 2`.

- [ ] **Step 3: Amend the spec**

Run this script from the repo root. It asserts that each old string occurs exactly once.

```python
from pathlib import Path
p = Path("docs/superpowers/specs/2026-09-27-opencutplan-design.md")
s = p.read_text()
edits = [
    ("Each material is planned independently.\n",
     "Each material is planned independently. [`docs/optimizer.md`](../../optimizer.md) gives the exact rules.\n"),
    ("free-rectangle guillotine packing with several split rules (shorter-leftover-axis,\n     longer-leftover-axis, min-area) (Jylänki,",
     "free-rectangle guillotine packing with several split rules (shorter-leftover-axis,\n     longer-leftover-axis, min-area, max-area) (Jylänki,"),
    ("   another time slice from the current best.\n",
     "   another time slice from the current best. The same seed and iteration count always give the same plan.\n"),
    ("3. **Validation**: every candidate goes through the same validator as manual layouts (§5.4). Invalid candidates are\n   discarded, so the optimizer never returns an invalid plan.\n",
     "3. **Validation**: every candidate goes through the same validator as manual layouts (§5.4). A sheet with an error is\n   dropped from the candidate and its parts become unplaced, so the optimizer never returns a sheet with an error.\n   When no tool is enabled at all, the plan-wide `no-tool` error drops nothing.\n"),
    ("4. **Objective** (lexicographic): (1) total stock cost, or total stock area when any used stock has no price;\n   (2) largest usable offcut area (bigger is better); (3) number of cuts; (4) number of sheets.\n",
     "4. **Objective** (lexicographic, per material): (1) fewest unplaced copies; (2) total stock cost, with owned offcuts\n   at 0, or total stock area when the cost feature is off or any enabled sheet stock of the material has no price;\n   (3) largest usable offcut area (bigger is better); (4) number of cuts; (5) number of sheets.\n"),
    ("the living-room-shelf example uses ≤ 5 + 2 sheets; fixed seed ⇒ same plan.",
     "the living-room-shelf example uses ≤ 5 + 2 sheets; fixed seed and iteration count ⇒ same plan."),
]
for old, new in edits:
    assert s.count(old) == 1, old
    s = s.replace(old, new)
p.write_text(s)
print("amended", len(edits))
```

Expected output: `amended 6`.

- [ ] **Step 4: Check**

Run `npm run check` from the repo root. Expected: the typecheck is clean and every test passes. Check by reading that every rule in `docs/optimizer.md` matches `packages/core/src/optimize/`.

- [ ] **Step 5: Commit**

```bash
git add docs/optimizer.md README.md docs/superpowers/specs/2026-09-27-opencutplan-design.md
git commit -m "docs: describe the optimizer and align the spec with it

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

