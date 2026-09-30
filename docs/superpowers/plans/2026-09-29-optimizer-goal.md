# Optimizer goal implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user choose what the optimizer looks for after it fits every part (the lowest cost, the best offcuts, or the fewest cuts), with a limit on the extra cost, in the file, the CLI, and the web app.

**Architecture:** File format 1.2 adds `settings.optimizer.goal` (an open value set) and `extraCostPercent`. A new module `optimize/goal.ts` holds the goal names, the offcut-list comparison, and a trade-off list for each material: the plans that no other plan beats on cost and on the goal, among the plans with the fewest unplaced copies, cut to the cost limit of the cheapest plan found. The search keeps one list for each material in place of one best plan, except for the goal `cost`, which keeps the current code path, so its plans do not change.

**Tech Stack:** TypeScript strict (`erasableSyntaxOnly`), zod 4, Vitest, fast-check, React 19 with Testing Library, Playwright, npm workspaces (`packages/core`, `packages/cli`, `apps/web`).

**Spec:** `docs/superpowers/specs/2026-09-29-optimizer-goal-design.md`

## Global Constraints

- `FORMAT_VERSION` is `"1.2"`. A 1.1 file needs no migration. `SUPPORTED_MINOR` is 2.
- `settings.optimizer.goal`: default `"cost"`; known values `"cost"`, `"offcuts"`, `"cuts"`; the value set is open. An unknown value gives the warning `unknown-goal`, the optimizer uses `cost`, and the value is written back unchanged.
- `settings.optimizer.extraCostPercent`: default `10`, a number from 0 to 100. Any other value makes the file invalid.
- Fitting every part always comes first: the fewest unplaced copies win before cost or the goal.
- The limit is C × (1 + extraCostPercent / 100), where C is the lowest cost of the plans with the fewest unplaced copies. A plan that costs exactly the limit stays (the relative tolerance of `compareScores`, 1e-9).
- With the goal `cost`, the optimizer gives exactly the plans that it gives now, for the same seed and iterations.
- The worker protocol does not change.
- CLI: keys `optimizer.goal` and `optimizer.extraCostPercent`; flags `--goal` and `--extra-cost` change one run only. Text line: `Plywood: 3 sheets, 4 % more cost than the cheapest plan found.` JSON: `goal`, `extraCostPercent`, and `materials[].cheapestCost` and `materials[].extraCostPercent` (one decimal; 0 when C is 0).
- Web: **Goal** ("Lowest cost", "Best offcuts", "Fewest cuts"; "<value> (unknown)"), **Extra cost allowed (%)** (disabled for "Lowest cost"), and on Layout the line "Goal: best offcuts, up to 10 % extra cost." or "Goal: lowest cost." with a **Change** link to Settings.
- User-visible text is in ASD-STE100 Simplified Technical English: active voice, short sentences, articles kept.
- No comment that restates the code. Match the file's comment density.
- TypeScript uses `erasableSyntaxOnly`: no constructor parameter properties, no enums.
- `npm run check` (lint, typecheck, tests, build) passes at the end of every task. `npm run e2e -w @opencutplan/web` passes at the end of Task 5.
- Each commit ends with `-m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"`.

## Review Focus

1. An owned offcut that holds every part makes C = 0: the limit is 0, so only plans with no bought stock stay, and the extra cost is 0, not a division by zero (Task 3 test "keeps to plans with no bought stock when an owned offcut makes the cheapest cost 0"; Task 2 test for `extraCostPercent(12, 0)`).
2. `optimize --continue` on a file planned with the goal `offcuts`: the start has no `cheapestCost`, so the search runs its first stage again and the plan stays within the limit of the new C (Task 3 property test "never goes over the limit, also when it continues a search with or without the cheapest cost").
3. A file from a newer app with an unknown goal: it loads with a warning, plans for the lowest cost, keeps the value on save, and the web drop-down shows "<value> (unknown)" with the extra cost field disabled (Task 1 parse test; Task 2 test "uses the lowest cost for a goal that this app does not know, and says so"; Task 3 test "takes the goal and the limit from the settings, and uses the lowest cost for an unknown goal"; Task 5 test "says when the goal of best offcuts cannot work, and keeps a goal that the app does not know").
4. A change of the goal after a run in the web app: the extra cost line of the old run goes away, and **Keep searching** is not offered (Task 5 test "shows the extra cost that each material uses after a run").
5. The goal `offcuts` with the `offcuts` feature off: every offcut list is empty, so the plan is the plan of the goal `cost`, and the Settings tab says so (Task 2 test "lists every offcut area, largest first, and no offcuts when the offcuts feature is off"; Task 5 Settings test).

## Decisions

These are calls the spec leaves open, or where the spec conflicts with the code. The plan makes them; the executor does not revisit them.

1. A bad `--goal`, `--extra-cost`, or `settings set` value gives exit 2 and the code `invalid-value`, not exit 1 as spec sections 7 and 9 say. Every usage error of this CLI gives exit 2 (`usageError`), and the existing tests for bad values expect 2.
2. The argument parser reads `--extra-cost -5` as a missing value (`bad-option`). `--extra-cost=-5` gives `invalid-value`. The plan does not change the parser.
3. The promise "never over C × (1 + limit)" uses the `cheapestCost` of each run. A start with no `cheapestCost` (the CLI `--continue`) cannot know the C of the earlier run, so the property test checks the limit against the C of the new run.
4. "Never more unplaced copies than the cheapest plan" is true by construction (the list holds only plans with the fewest unplaced copies), so no property test checks it separately.
5. In the trade-off list, plan A beats plan B when A costs not more than B (with the tolerance) and A is not worse than B in the choice order (the goal, then `compareScores`). So of two equal plans the first found stays.
6. When no plan in the list is within the limit of a C that came from `start`, the list keeps its plans. Otherwise a start whose cheap plan the search cannot rebuild would leave the material with no plan.
7. The goal `cost` keeps the current code path (`compareScores` on one best plan), so its plans are exactly the same. `cheapestCost` for it is the cost of the chosen plan.
8. `describeGoal` gives "lowest cost", "best offcuts, up to 10 % extra cost", or "fewest cuts, with no extra cost" (for 0 %).
9. The extra cost field on the Settings tab is also disabled for an unknown goal, because the optimizer then uses the lowest cost.
10. The Layout line shows the extra cost only for the last run while the project is still the one that the run produced (`runs.current`).

## File Structure

- `packages/core/src/format/schema.ts`, `packages/core/src/format/version.ts` (modify): format 1.2.
- `packages/core/src/optimize/evaluate.ts` (modify): `Score.offcuts` and `sameNumber`.
- `packages/core/src/optimize/goal.ts` (create): goal names, `projectGoal`, `checkGoal`, `describeGoal`, `compareOffcuts`, `compareChoice`, the limit helpers, `extraCostPercent`, and `createTradeOffs`.
- `packages/core/src/plan/issues.ts`, `packages/core/src/analysis.ts`, `packages/core/src/index.ts` (modify): the `unknown-goal` warning and the export.
- `packages/core/src/optimize/search.ts` (modify): options, the trade-off list for each material, `cheapestCost`, and the continue rules.
- `packages/cli/src/values.ts`, `packages/cli/src/commands/settings.ts`, `packages/cli/src/commands/optimize.ts` (modify): the keys, the flags, and the output.
- `apps/web/src/screens/SettingsTab.tsx`, `apps/web/src/layout/LayoutTab.tsx`, `apps/web/src/screens/Workspace.tsx` (modify): the fields, the goal line, and the link.
- `examples/*.cutplan.json` and `schema/cutplan.schema.json`: made again by `npm run examples` and `npm run schema`.
- `docs/format.md`, `docs/optimizer.md`, `docs/cli.md`, `docs/web-app.md` (modify).
- Tests: new `packages/core/test/optimize/goal.test.ts`; additions to the format, evaluate, and search tests in core, `settings-optimize.test.ts` in the CLI, and the `screens`, `LayoutTab`, and `Workspace` tests in the web app.

Every worktree needs the git-ignored workspace links before tests run:

```bash
mkdir -p node_modules/@opencutplan
ln -sfn ../../packages/core node_modules/@opencutplan/core
ln -sfn ../../packages/cli node_modules/@opencutplan/cli
ln -sfn ../../apps/web node_modules/@opencutplan/web
```

---

### Task 1: File format 1.2

**Files:**
- Modify: `packages/core/src/format/schema.ts`, `packages/core/src/format/version.ts`
- Modify (made again): `examples/*.cutplan.json`, `schema/cutplan.schema.json`
- Modify: `docs/format.md`
- Test: `packages/core/test/format/schema.test.ts`, `packages/core/test/format/version.test.ts`, `packages/core/test/format/parse.test.ts`, `packages/core/test/design/checks.test.ts`, `packages/core/test/design/generate.test.ts`, `packages/cli/test/project.test.ts`, `packages/cli/test/design.test.ts`

**Interfaces:**
- Produces: `Settings["optimizer"]` has `goal: string` (default `"cost"`) and `extraCostPercent: number` (default 10, from 0 to 100). `FORMAT_VERSION === "1.2"`, `SUPPORTED_MINOR === 2`.

- [ ] **Step 1: Write the failing tests**

Apply this change to `packages/core/test/format/schema.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/test/format/schema.test.ts b/packages/core/test/format/schema.test.ts
index 1f9ef76..0b68767 100644
--- a/packages/core/test/format/schema.test.ts
+++ b/packages/core/test/format/schema.test.ts
@@ -6,14 +6,14 @@ describe("createProject", () => {
   it("fills every default", () => {
     const project = createProject("Shelf", "in");
     expect(project.format).toBe("opencutplan");
-    expect(project.version).toBe("1.1");
+    expect(project.version).toBe("1.2");
     expect(project.project).toEqual({ name: "Shelf", units: "in" });
     expect(project.settings).toEqual({
       features: Object.fromEntries(FEATURE_KEYS.map((key) => [key, true])),
       orderMode: "sheet",
       trim: 0,
       display: { inch: 32, mm: 0.5 },
-      optimizer: { timeLimitMs: 2000 },
+      optimizer: { timeLimitMs: 2000, goal: "cost", extraCostPercent: 10 },
       currency: "USD",
     });
   });
```

Apply this change to `packages/core/test/format/version.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/test/format/version.test.ts b/packages/core/test/format/version.test.ts
index 6c6f756..ff28648 100644
--- a/packages/core/test/format/version.test.ts
+++ b/packages/core/test/format/version.test.ts
@@ -18,7 +18,7 @@ describe("parseVersion", () => {
 
 describe("migrate", () => {
   it("leaves a current document unchanged", () => {
-    const doc = { version: "1.1", a: 1 };
+    const doc = { version: "1.2", a: 1 };
     expect(migrate(doc)).toEqual(doc);
   });
 
```

Apply this change to `packages/core/test/format/parse.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/test/format/parse.test.ts b/packages/core/test/format/parse.test.ts
index 5f52d16..529e6b8 100644
--- a/packages/core/test/format/parse.test.ts
+++ b/packages/core/test/format/parse.test.ts
@@ -125,13 +125,32 @@ describe("parseProject", () => {
     expect(result.ok && result.project.settings.features.cutOrder).toBe(true);
   });
 
-  it("loads a 1.0 file as version 1.1 with no warnings", () => {
-    const doc = { ...JSON.parse(serializeProject(sampleProject())), version: "1.0" };
+  it.each(["1.0", "1.1"])("loads a %s file as version 1.2 with the default goal and no warnings", (version) => {
+    const doc = JSON.parse(serializeProject(sampleProject()));
+    doc.version = version;
+    delete doc.settings.optimizer.goal;
+    delete doc.settings.optimizer.extraCostPercent;
     const result = parseProject(doc);
-    expect(result.ok && result.project.version).toBe("1.1");
+    expect(result.ok && result.project.version).toBe("1.2");
+    expect(result.ok && result.project.settings.optimizer).toMatchObject({ goal: "cost", extraCostPercent: 10 });
     expect(result.warnings).toEqual([]);
   });
 
+  it("keeps an optimizer goal that it does not know, and writes it back", () => {
+    const doc = JSON.parse(serializeProject(sampleProject()));
+    doc.settings.optimizer.goal = "time";
+    const result = parseProject(doc);
+    expect(result.ok && result.warnings).toEqual([]);
+    if (!result.ok) return;
+    expect(JSON.parse(serializeProject(result.project)).settings.optimizer.goal).toBe("time");
+  });
+
+  it.each([-1, 101, "10"])("refuses the extra cost percent %j", (value) => {
+    const doc = JSON.parse(serializeProject(sampleProject()));
+    doc.settings.optimizer.extraCostPercent = value;
+    expect(parseProject(doc).ok).toBe(false);
+  });
+
   it("loads a newer minor version with a warning and keeps every unknown field on re-save", () => {
     const project = sampleProject();
     const doc = JSON.parse(serializeProject(project));
@@ -150,7 +169,7 @@ describe("parseProject", () => {
       {
         severity: "warning",
         code: "newer-minor",
-        message: "This file uses format version 1.4, which is newer than this app (1.1). Unknown fields are kept but ignored.",
+        message: "This file uses format version 1.4, which is newer than this app (1.2). Unknown fields are kept but ignored.",
         path: ["version"],
       },
     ]);
```

Apply this change to `packages/core/test/design/checks.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/test/design/checks.test.ts b/packages/core/test/design/checks.test.ts
index e26657d..c446aa2 100644
--- a/packages/core/test/design/checks.test.ts
+++ b/packages/core/test/design/checks.test.ts
@@ -41,7 +41,7 @@ describe("checkDesigns", () => {
 
   it("gives no stale warning for a file from a newer minor version", () => {
     const once = current(kallaxDesign());
-    const newer = { ...once, version: "1.2", designs: [kallaxDesign({ width: { openings: [335, 335, 335] } })] };
+    const newer = { ...once, version: "1.3", designs: [kallaxDesign({ width: { openings: [335, 335, 335] } })] };
     expect(codes(newer)).toEqual([]);
   });
 
```

Apply this change to `packages/core/test/design/generate.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/test/design/generate.test.ts b/packages/core/test/design/generate.test.ts
index 9d8797d..b751c60 100644
--- a/packages/core/test/design/generate.test.ts
+++ b/packages/core/test/design/generate.test.ts
@@ -90,7 +90,7 @@ describe("regenerateDesigns", () => {
   it("leaves the stored parts of a file from a newer minor version alone", () => {
     const once = regenerateDesigns(designProject());
     const nested = { ...once.parts[1]!, id: "kx-cell-1-1-horizontal", name: "Nested shelf" };
-    const newer = { ...once, version: "1.2", parts: [...once.parts, nested] };
+    const newer = { ...once, version: "1.3", parts: [...once.parts, nested] };
     expect(regenerateDesigns(newer)).toBe(newer);
     expect(designParts(newer, newer.designs![0]!)).toBeNull();
   });
```

Apply this change to `packages/cli/test/project.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/cli/test/project.test.ts b/packages/cli/test/project.test.ts
index e4c94ba..c791d85 100644
--- a/packages/cli/test/project.test.ts
+++ b/packages/cli/test/project.test.ts
@@ -60,7 +60,7 @@ describe("show", () => {
     const result = await cli(["show", "shelf.cutplan.json", "--json"], withExamples());
     expect(result.code).toBe(0);
     const data = result.json();
-    expect(data).toMatchObject({ ok: true, command: "show", name: "Living room shelf", units: "in", version: "1.1" });
+    expect(data).toMatchObject({ ok: true, command: "show", name: "Living room shelf", units: "in", version: "1.2" });
     expect(data.counts).toMatchObject({ materials: 2, stock: 2, parts: 20, tools: 1, enabledTools: 1, sheets: 7, pinnedSheets: 0 });
     expect(data.copies.total).toBe(data.counts.copies);
     expect(data.copies.placed + data.copies.unplaced).toBe(data.copies.total);
@@ -91,7 +91,7 @@ describe("show", () => {
   });
 
   it("sends file warnings to stderr and into the envelope", async () => {
-    const newer = example(SHELF).replace('"version": "1.1"', '"version": "1.4"');
+    const newer = example(SHELF).replace('"version": "1.2"', '"version": "1.4"');
     const result = await cli(["show", "x.json", "--json"], memoryIo({ "x.json": newer }));
     expect(result.code).toBe(0);
     expect(result.json().warnings).toEqual([expect.stringContaining("newer than this app")]);
```

Apply this change to `packages/cli/test/design.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/cli/test/design.test.ts b/packages/cli/test/design.test.ts
index 00fa390..03be52b 100644
--- a/packages/cli/test/design.test.ts
+++ b/packages/cli/test/design.test.ts
@@ -148,11 +148,11 @@ describe("design add", () => {
   it("refuses a file from a newer minor version", async () => {
     const io = await hall();
     editFile(io, F, (file) => {
-      file.version = "1.2";
+      file.version = "1.3";
     });
     const result = await cli(["design", "add", F, "--system", "kallax", "--cols", "1", "--rows", "1", "--material", "b18", "--json"], io);
     expect(result.code).toBe(1);
-    expect(result.json().error).toMatchObject({ code: "newer-version", version: "1.2" });
+    expect(result.json().error).toMatchObject({ code: "newer-version", version: "1.3" });
   });
 });
 
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root packages/core test/format test/design && npx vitest run --root packages/cli test/project.test.ts test/design.test.ts`

Expected: FAIL: the schema test gets version "1.1", the parse tests get no `goal` in the optimizer settings and accept an extra cost percent of 101, and the newer-version tests load "1.2" as the current version.

- [ ] **Step 3: Implement**

Apply this change to `packages/core/src/format/schema.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/src/format/schema.ts b/packages/core/src/format/schema.ts
index 897ef82..461f9bb 100644
--- a/packages/core/src/format/schema.ts
+++ b/packages/core/src/format/schema.ts
@@ -2,7 +2,7 @@ import { z } from "zod";
 import { INCH_PRECISIONS, MM_PRECISIONS } from "../geometry/format.ts";
 
 export const FORMAT_ID = "opencutplan";
-export const FORMAT_VERSION = "1.1";
+export const FORMAT_VERSION = "1.2";
 /** Analysis and the editor work per copy, so a larger quantity would freeze them. */
 export const MAX_PART_QUANTITY = 10_000;
 export const MAX_DESIGN_CELLS = 50;
@@ -140,6 +140,8 @@ export const SettingsSchema = z
       .object({
         timeLimitMs: z.number().int().positive().default(2000),
         seed: z.number().int().optional(),
+        goal: z.string().default("cost"),
+        extraCostPercent: z.number().min(0).max(100).default(10),
       })
       .loose()
       .prefault({}),
```

Apply this change to `packages/core/src/format/version.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/src/format/version.ts b/packages/core/src/format/version.ts
index 6bd19d7..6fbfe1c 100644
--- a/packages/core/src/format/version.ts
+++ b/packages/core/src/format/version.ts
@@ -1,5 +1,5 @@
 export const SUPPORTED_MAJOR = 1;
-export const SUPPORTED_MINOR = 1;
+export const SUPPORTED_MINOR = 2;
 
 export interface Version {
   major: number;
```

Make the generated files again:

```bash
npm run examples
npm run schema
```

Expected: `git diff --stat examples schema` lists the four examples and `schema/cutplan.schema.json`. In each example, only `"version"` becomes `"1.2"` and `settings.optimizer` gets `"goal": "cost"` and `"extraCostPercent": 10`; the plans do not change.

Apply this change to `docs/format.md` (`git apply` accepts it as is):

```diff
diff --git a/docs/format.md b/docs/format.md
index 790e94d..7af3f59 100644
--- a/docs/format.md
+++ b/docs/format.md
@@ -1,4 +1,4 @@
-# The OpenCutPlan file format (`.cutplan.json`), version 1.1
+# The OpenCutPlan file format (`.cutplan.json`), version 1.2
 
 An OpenCutPlan file describes a sheet-goods cutting project: the parts to cut, the stock to cut them from, the tools
 available, settings, and optionally a layout of parts on sheets with an ordered list of cuts.
@@ -21,7 +21,7 @@ The machine-readable definition is [`schema/cutplan.schema.json`](../schema/cutp
 | Field | Required | Meaning |
 |---|---|---|
 | `format` | yes | Always `"opencutplan"`. |
-| `version` | yes | `"MAJOR.MINOR"`; this document describes `"1.1"`. |
+| `version` | yes | `"MAJOR.MINOR"`; this document describes `"1.2"`. |
 | `project` | yes | `name` (text), `units` (`"in"` or `"mm"`), optional `notes`, `created`, `modified` (should be ISO 8601 date-times; readers accept any string). |
 | `materials` | yes | Materials; see below. |
 | `stock` | yes | Stock pieces available for cutting. |
@@ -138,7 +138,7 @@ no limit.
 | `trim` | `0` | Edge trim on every edge of the stock. |
 | `minOffcut` | none | {`length`, `width`}: waste at least this size, in either orientation, is kept as an offcut. Readers use 12 × 6 in or 300 × 150 mm when it is absent. |
 | `display` | `{ "inch": 32, "mm": 0.5 }` | Rounding for display: `inch` is `8`, `16`, `32`, `64`, or `"decimal"`; `mm` is `1`, `0.5`, or `0.1`. |
-| `optimizer` | `{ "timeLimitMs": 2000 }` | Search time and an optional integer `seed`. |
+| `optimizer` | `{ "timeLimitMs": 2000, "goal": "cost", "extraCostPercent": 10 }` | Search time, an optional integer `seed`, and the goal (added in 1.2). `goal` is `"cost"`, `"offcuts"`, or `"cuts"`; a reader that does not know the value warns (`unknown-goal`), uses `"cost"`, and writes the value back. `extraCostPercent` is a number from 0 to 100: the most extra cost that the goals `offcuts` and `cuts` can use, in percent of the cheapest plan found. See [`optimizer.md`](optimizer.md#objective). |
 | `currency` | `"USD"` | ISO 4217 code for `cost`. |
 
 ## Plan
@@ -171,7 +171,7 @@ uses gets a new id (`s1` becomes `s1-2`) with a warning, because edits find a sh
 - Readers must load a file whose `plan` has invalid references, and report the problems as warnings.
 - The value sets of `type`, `grain`, `kind`, `units`, `orderMode`, `axis`, and `display.inch`/`display.mm` are fixed
   within a major version. Adding a value requires a new major version, so a reader can refuse a value it does not know.
-- `designs[].system` and `designs[].mount` are not fixed: a minor version can add values.
+- `designs[].system`, `designs[].mount`, and `settings.optimizer.goal` are not fixed: a minor version can add values.
 
 ## CSV part and stock lists
 
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm run check`

Expected: exit 0; every test passes.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/format/schema.ts packages/core/src/format/version.ts packages/core/test/format/schema.test.ts packages/core/test/format/version.test.ts packages/core/test/format/parse.test.ts packages/core/test/design/checks.test.ts packages/core/test/design/generate.test.ts packages/cli/test/project.test.ts packages/cli/test/design.test.ts examples/eket-wall-in.cutplan.json examples/kallax-2x4-mm.cutplan.json examples/living-room-shelf.cutplan.json examples/simple-bookcase-mm.cutplan.json schema/cutplan.schema.json docs/format.md
git commit -m "Add the optimizer goal and the extra cost to file format 1.2" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```


### Task 2: The measures and the goal module

**Files:**
- Create: `packages/core/src/optimize/goal.ts`
- Modify: `packages/core/src/optimize/evaluate.ts`, `packages/core/src/plan/issues.ts`, `packages/core/src/analysis.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/optimize/goal.test.ts` (create), `packages/core/test/optimize/evaluate.test.ts`

**Interfaces:**
- Consumes: `Settings["optimizer"].goal: string` from Task 1.
- Produces, in `evaluate.ts`: `Score.offcuts: number[]` (every offcut area, largest first; `largestOffcut` is `offcuts[0] ?? 0`), and `sameNumber(a: number, b: number): boolean`.
- Produces, in `goal.ts` (exported from the package index):
  - `type OptimizerGoal = "cost" | "offcuts" | "cuts"`, `OPTIMIZER_GOALS: readonly OptimizerGoal[]`, `MAX_EXTRA_COST_PERCENT = 100`
  - `isOptimizerGoal(value: unknown): value is OptimizerGoal`, `projectGoal(project: Project): OptimizerGoal`, `checkGoal(project: Project): PlanIssue[]`
  - `describeGoal(goal: OptimizerGoal, extra: number): string`
  - `compareOffcuts(a: readonly number[], b: readonly number[]): number`, `compareChoice(goal: OptimizerGoal, a: Score, b: Score): number`
  - `costLimit(cheapest: number, extra: number): number`, `withinLimit(cost: number, limit: number): boolean`, `extraCostPercent(cost: number, cheapest: number): number`
  - `interface TradeOffs<T> { readonly cheapest: number; add(score: Score, item: T): void; chosen(): TradeOff<T> | null }`, `interface TradeOff<T> { score: Score; item: T }`, `createTradeOffs<T>(goal: OptimizerGoal, extra: number, cheapest?: number): TradeOffs<T>`
- Produces, in `issues.ts`: the `PlanIssueCode` `"unknown-goal"`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/optimize/goal.test.ts` with this content:

```ts
import { describe, expect, it } from "vitest";
import { analyzeProject } from "../../src/analysis.ts";
import type { Score } from "../../src/optimize/evaluate.ts";
import { compareOffcuts, createTradeOffs, describeGoal, extraCostPercent, projectGoal } from "../../src/optimize/goal.ts";
import { sampleProject } from "../helpers.ts";

const score = (over: Partial<Score>): Score => ({ unplaced: 0, cost: 100, largestOffcut: 0, offcuts: [], cuts: 10, sheets: 1, ...over });

describe("compareOffcuts", () => {
  it("prefers the larger first area, then the larger second area, then the longer list", () => {
    expect(compareOffcuts([50], [40, 40])).toBeLessThan(0);
    expect(compareOffcuts([50, 10], [50, 20])).toBeGreaterThan(0);
    expect(compareOffcuts([50, 10], [50])).toBeLessThan(0);
    expect(compareOffcuts([], [1])).toBeGreaterThan(0);
    expect(compareOffcuts([50 + 1e-12], [50])).toBe(0);
    expect(compareOffcuts([], [])).toBe(0);
  });
});

describe("createTradeOffs", () => {
  it("chooses the best goal within the limit of the cheapest cost", () => {
    const list = createTradeOffs<string>("offcuts", 10);
    list.add(score({ cost: 100, offcuts: [10] }), "cheap");
    list.add(score({ cost: 108, offcuts: [90] }), "big offcut");
    list.add(score({ cost: 115, offcuts: [99] }), "too dear");
    expect(list.chosen()?.item).toBe("big offcut");
    expect(list.cheapest).toBe(100);
  });

  it("drops a plan when a cheaper plan moves the limit below it", () => {
    const list = createTradeOffs<string>("cuts", 10);
    list.add(score({ cost: 105, cuts: 3 }), "few cuts");
    list.add(score({ cost: 110, cuts: 20 }), "dear");
    list.add(score({ cost: 94, cuts: 30 }), "cheapest");
    expect(list.chosen()?.item).toBe("cheapest");
    expect(list.cheapest).toBe(94);
  });

  it("keeps a plan that costs exactly the limit", () => {
    const list = createTradeOffs<string>("cuts", 10);
    list.add(score({ cost: 100, cuts: 9 }), "cheap");
    list.add(score({ cost: 110, cuts: 2 }), "at the limit");
    expect(list.chosen()?.item).toBe("at the limit");
  });

  it("uses the plans with the fewest unplaced copies, and their own cheapest cost", () => {
    const list = createTradeOffs<string>("cuts", 10);
    list.add(score({ unplaced: 2, cost: 50, cuts: 1 }), "misses two");
    list.add(score({ unplaced: 0, cost: 200, cuts: 9 }), "fits");
    list.add(score({ unplaced: 1, cost: 10, cuts: 0 }), "misses one");
    expect(list.chosen()?.item).toBe("fits");
    expect(list.cheapest).toBe(200);
  });

  it("keeps the first of two equal plans, and uses the other scores to break a tie on the goal", () => {
    const list = createTradeOffs<string>("cuts", 10);
    list.add(score({ cuts: 5 }), "first");
    list.add(score({ cuts: 5 }), "second");
    expect(list.chosen()?.item).toBe("first");
    list.add(score({ cuts: 5, cost: 99 }), "cheaper");
    expect(list.chosen()?.item).toBe("cheaper");
  });

  it("starts from a given cheapest cost, and keeps a plan when no plan reaches that cost", () => {
    const list = createTradeOffs<string>("offcuts", 10, 100);
    list.add(score({ cost: 115, offcuts: [99] }), "over the start limit");
    expect(list.chosen()?.item).toBe("over the start limit");
    list.add(score({ cost: 109, offcuts: [5] }), "within");
    expect(list.chosen()?.item).toBe("within");
    expect(list.cheapest).toBe(100);
  });
});

describe("extraCostPercent", () => {
  it("gives the extra cost in percent, rounded to one decimal, and 0 when the cheapest cost is 0", () => {
    expect(extraCostPercent(104.26, 100)).toBe(4.3);
    expect(extraCostPercent(100, 100)).toBe(0);
    expect(extraCostPercent(12, 0)).toBe(0);
  });
});

describe("describeGoal", () => {
  it("names the goal and the limit", () => {
    expect(describeGoal("cost", 10)).toBe("lowest cost");
    expect(describeGoal("offcuts", 10)).toBe("best offcuts, up to 10 % extra cost");
    expect(describeGoal("cuts", 0)).toBe("fewest cuts, with no extra cost");
  });
});

describe("the project goal", () => {
  it("uses the lowest cost for a goal that this app does not know, and says so", () => {
    const project = sampleProject();
    const unknown = { ...project, settings: { ...project.settings, optimizer: { ...project.settings.optimizer, goal: "time" } } };
    expect(projectGoal(unknown)).toBe("cost");
    expect(analyzeProject(unknown).issues.filter((issue) => issue.code === "unknown-goal")).toEqual([
      { severity: "warning", code: "unknown-goal", message: 'The optimizer goal "time" is not known to this app. The optimizer uses the lowest cost.', refs: [] },
    ]);
    expect(analyzeProject(project).issues.some((issue) => issue.code === "unknown-goal")).toBe(false);
  });
});
```

Apply this change to `packages/core/test/optimize/evaluate.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/test/optimize/evaluate.test.ts b/packages/core/test/optimize/evaluate.test.ts
index 1eba325..6c11542 100644
--- a/packages/core/test/optimize/evaluate.test.ts
+++ b/packages/core/test/optimize/evaluate.test.ts
@@ -3,7 +3,7 @@ import { compareScores, evaluate, type Score } from "../../src/optimize/evaluate
 import { buildProblem } from "../../src/optimize/problem.ts";
 import { sampleProject } from "../helpers.ts";
 
-const score = (over: Partial<Score>): Score => ({ unplaced: 0, cost: 100, largestOffcut: 50, cuts: 10, sheets: 2, ...over });
+const score = (over: Partial<Score>): Score => ({ unplaced: 0, cost: 100, largestOffcut: 50, offcuts: [50], cuts: 10, sheets: 2, ...over });
 
 describe("compareScores", () => {
   it("compares unplaced, then cost, then largest offcut (bigger wins), then cuts, then sheets", () => {
@@ -33,6 +33,18 @@ describe("evaluate", () => {
     expect(result.score.largestOffcut).toBeGreaterThan(0);
   });
 
+  it("lists every offcut area, largest first, and no offcuts when the offcuts feature is off", () => {
+    const { problem, material, packing: p } = packing(sampleProject());
+    const { offcuts, largestOffcut } = evaluate(problem, material, p, "t").score;
+    expect(offcuts.length).toBeGreaterThan(1);
+    expect(offcuts).toEqual([...offcuts].sort((a, b) => b - a));
+    expect(offcuts[0]).toBe(largestOffcut);
+    const off = sampleProject();
+    off.settings.features.offcuts = false;
+    const other = packing(off);
+    expect(evaluate(other.problem, other.material, other.packing, "t").score).toMatchObject({ offcuts: [], largestOffcut: 0 });
+  });
+
   it("scores by stock area when a sheet stock has no price or the cost feature is off", () => {
     const project = sampleProject();
     project.settings.features.cost = false;
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root packages/core test/optimize/goal.test.ts test/optimize/evaluate.test.ts`

Expected: FAIL: goal.test.ts cannot load `../../src/optimize/goal.ts`, and the evaluate test gets `offcuts` undefined.

- [ ] **Step 3: Implement**

Create `packages/core/src/optimize/goal.ts` with this content:

```ts
import type { Project } from "../format/schema.ts";
import { planWarning, type PlanIssue } from "../plan/issues.ts";
import { compareScores, sameNumber, type Score } from "./evaluate.ts";

export type OptimizerGoal = "cost" | "offcuts" | "cuts";

export const OPTIMIZER_GOALS: readonly OptimizerGoal[] = ["cost", "offcuts", "cuts"];

export const MAX_EXTRA_COST_PERCENT = 100;

export function isOptimizerGoal(value: unknown): value is OptimizerGoal {
  return OPTIMIZER_GOALS.includes(value as OptimizerGoal);
}

/** The goal of the project, with `cost` for a value that this app does not know. */
export function projectGoal(project: Project): OptimizerGoal {
  const goal = project.settings.optimizer.goal;
  return isOptimizerGoal(goal) ? goal : "cost";
}

export function checkGoal(project: Project): PlanIssue[] {
  const goal = project.settings.optimizer.goal;
  if (isOptimizerGoal(goal)) return [];
  return [planWarning("unknown-goal", `The optimizer goal "${goal}" is not known to this app. The optimizer uses the lowest cost.`, [])];
}

const GOAL_NAMES: Readonly<Record<OptimizerGoal, string>> = { cost: "lowest cost", offcuts: "best offcuts", cuts: "fewest cuts" };

/** "lowest cost", or "best offcuts, up to 10 % extra cost". */
export function describeGoal(goal: OptimizerGoal, extra: number): string {
  if (goal === "cost") return GOAL_NAMES.cost;
  return extra > 0 ? `${GOAL_NAMES[goal]}, up to ${extra} % extra cost` : `${GOAL_NAMES[goal]}, with no extra cost`;
}

/** Negative when the offcut list `a` is better: the larger first area wins, then the larger second area, and so on. */
export function compareOffcuts(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined) return 1;
    if (y === undefined) return -1;
    if (!sameNumber(x, y)) return y - x;
  }
  return 0;
}

/** The order in which the search chooses among the plans within the cost limit. */
export function compareChoice(goal: OptimizerGoal, a: Score, b: Score): number {
  const byGoal = goal === "offcuts" ? compareOffcuts(a.offcuts, b.offcuts) : goal === "cuts" ? a.cuts - b.cuts : 0;
  return byGoal || compareScores(a, b);
}

export function costLimit(cheapest: number, extra: number): number {
  return cheapest * (1 + extra / 100);
}

export function withinLimit(cost: number, limit: number): boolean {
  return cost <= limit || sameNumber(cost, limit);
}

/** The extra cost of `cost` over `cheapest`, in percent, rounded to one decimal; 0 when `cheapest` is 0. */
export function extraCostPercent(cost: number, cheapest: number): number {
  if (cheapest <= 0 || withinLimit(cost, cheapest)) return 0;
  return Math.round(((cost - cheapest) / cheapest) * 1000) / 10;
}

export interface TradeOff<T> {
  score: Score;
  item: T;
}

export interface TradeOffs<T> {
  /** The lowest cost of the plans with the fewest unplaced copies so far. */
  readonly cheapest: number;
  add(score: Score, item: T): void;
  chosen(): TradeOff<T> | null;
}

/**
 * The plans of one material that no other plan beats on cost and on the choice order, among the plans with the fewest
 * unplaced copies. Plans over the cost limit leave the list, because the cheapest cost can only go down.
 */
export function createTradeOffs<T>(goal: OptimizerGoal, extra: number, cheapest = Number.POSITIVE_INFINITY): TradeOffs<T> {
  let entries: TradeOff<T>[] = [];
  let unplaced = Number.POSITIVE_INFINITY;
  let floor = cheapest;
  const notMore = (a: Score, b: Score) => withinLimit(a.cost, b.cost);
  const beats = (a: Score, b: Score) => notMore(a, b) && compareChoice(goal, a, b) <= 0;
  return {
    get cheapest() {
      return floor;
    },
    add(score, item) {
      if (score.unplaced > unplaced) return;
      if (score.unplaced < unplaced) {
        if (unplaced !== Number.POSITIVE_INFINITY) floor = Number.POSITIVE_INFINITY;
        unplaced = score.unplaced;
        entries = [];
      }
      floor = Math.min(floor, score.cost);
      if (entries.some((e) => beats(e.score, score))) return;
      entries = entries.filter((e) => !beats(score, e.score));
      entries.push({ score, item });
      const limit = costLimit(floor, extra);
      const kept = entries.filter((e) => withinLimit(e.score.cost, limit));
      // A start cost that no plan reaches again would otherwise leave the material with no plan.
      if (kept.length > 0) entries = kept;
    },
    chosen() {
      let best: TradeOff<T> | null = null;
      for (const entry of entries) {
        if (!best || compareChoice(goal, entry.score, best.score) < 0) best = entry;
      }
      return best;
    },
  };
}
```

Apply this change to `packages/core/src/optimize/evaluate.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/src/optimize/evaluate.ts b/packages/core/src/optimize/evaluate.ts
index 263f779..8f97411 100644
--- a/packages/core/src/optimize/evaluate.ts
+++ b/packages/core/src/optimize/evaluate.ts
@@ -18,6 +18,8 @@ export interface Score {
   cost: number;
   /** Area of the largest offcut. Bigger is better. */
   largestOffcut: number;
+  /** Areas of all offcuts, largest first. */
+  offcuts: number[];
   /** Cut steps, including trims. Fewer is better. */
   cuts: number;
   sheets: number;
@@ -31,8 +33,13 @@ export interface Evaluated {
 
 const RELATIVE = 1e-9;
 
+/** True when two measures are equal to within the relative tolerance of the comparisons. */
+export function sameNumber(a: number, b: number): boolean {
+  return Math.abs(a - b) <= RELATIVE * Math.max(1, Math.abs(a), Math.abs(b));
+}
+
 function differ(a: number, b: number): boolean {
-  return Math.abs(a - b) > RELATIVE * Math.max(1, Math.abs(a), Math.abs(b));
+  return !sameNumber(a, b);
 }
 
 /** Negative when `a` is better than `b`, positive when worse, 0 when equal. */
@@ -85,7 +92,9 @@ export function evaluate(problem: Problem, material: MaterialProblem, packing: P
     if (a.stock.kind === "offcut") continue;
     cost += priced ? (a.stock.cost ?? 0) : area(a.stock);
   }
-  const largestOffcut = Math.max(0, ...listOffcuts(ctx, keptAnalyses).map((o) => area(o.rect)));
+  const offcuts = listOffcuts(ctx, keptAnalyses)
+    .map((o) => area(o.rect))
+    .sort((a, b) => b - a);
   const order = new Map(problem.ctx.project.parts.map((p, i) => [p.id, i]));
   unplaced.sort((a, b) => (order.get(a.part) ?? 0) - (order.get(b.part) ?? 0) || a.copy - b.copy);
   return {
@@ -94,7 +103,8 @@ export function evaluate(problem: Problem, material: MaterialProblem, packing: P
     score: {
       unplaced: unplaced.length,
       cost,
-      largestOffcut,
+      largestOffcut: offcuts[0] ?? 0,
+      offcuts,
       cuts: steps.filter((s) => keptIds.has(s.sheet)).length,
       sheets: kept.length,
     },
```

Apply this change to `packages/core/src/plan/issues.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/src/plan/issues.ts b/packages/core/src/plan/issues.ts
index e299797..cdc734a 100644
--- a/packages/core/src/plan/issues.ts
+++ b/packages/core/src/plan/issues.ts
@@ -24,7 +24,8 @@ export type PlanIssueCode =
   | "mount-system"
   | "design-stale"
   | "design-unknown-system"
-  | "design-unknown-mount";
+  | "design-unknown-mount"
+  | "unknown-goal";
 
 /** `placement.index` is the placement's index in `plan.sheets[].placements`; `cut.step` is a sequence step number. */
 export type PlanRef =
```

Apply this change to `packages/core/src/analysis.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/src/analysis.ts b/packages/core/src/analysis.ts
index 1da0b9e..3f35afa 100644
--- a/packages/core/src/analysis.ts
+++ b/packages/core/src/analysis.ts
@@ -1,5 +1,6 @@
 import { checkDesigns } from "./design/checks.ts";
 import type { Project } from "./format/schema.ts";
+import { checkGoal } from "./optimize/goal.ts";
 import { planContext, type PlanContext } from "./plan/context.ts";
 import type { PlanIssue } from "./plan/issues.ts";
 import { checkLayout } from "./plan/layout.ts";
@@ -29,7 +30,7 @@ export function analyzeProject(project: Project): ProjectAnalysis {
   const layout = checkLayout(context);
   return {
     context,
-    issues: [...layout, ...checkCuts(context, layout, sheets, steps), ...checkDesigns(project)],
+    issues: [...layout, ...checkCuts(context, layout, sheets, steps), ...checkDesigns(project), ...checkGoal(project)],
     sheets,
     steps,
     offcuts: listOffcuts(context, sheets),
```

Apply this change to `packages/core/src/index.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/src/index.ts b/packages/core/src/index.ts
index a39ed9e..0b2278b 100644
--- a/packages/core/src/index.ts
+++ b/packages/core/src/index.ts
@@ -38,6 +38,7 @@ export * from "./analysis.ts";
 export * from "./errors.ts";
 export type { UnplacedCopy, UnplacedReason } from "./optimize/problem.ts";
 export * from "./optimize/evaluate.ts";
+export * from "./optimize/goal.ts";
 export * from "./optimize/search.ts";
 export * from "./optimize/worker.ts";
 export * from "./optimize/runs.ts";
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm run check`

Expected: exit 0; goal.test.ts has 10 passing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/optimize/goal.ts packages/core/test/optimize/goal.test.ts packages/core/test/optimize/evaluate.test.ts packages/core/src/optimize/evaluate.ts packages/core/src/plan/issues.ts packages/core/src/analysis.ts packages/core/src/index.ts
git commit -m "Add the offcut list and the optimizer goal comparisons" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```


### Task 3: The search chooses by the goal

**Files:**
- Modify: `packages/core/src/optimize/search.ts`
- Modify: `docs/optimizer.md`
- Test: `packages/core/test/optimize/search.test.ts`

**Interfaces:**
- Consumes: `createTradeOffs`, `projectGoal`, `OptimizerGoal`, `TradeOffs`, `costLimit`, `withinLimit` from Task 2.
- Produces: `OptimizeOptions.goal?: OptimizerGoal` and `OptimizeOptions.extraCostPercent?: number` (defaults: the project settings). `MaterialResult.cheapestCost: number`. A `start` whose material has `cheapestCost` starts C at that value; a material with no `cheapestCost` in `start` runs the first stage again for the goals `offcuts` and `cuts`.

- [ ] **Step 1: Write the failing tests**

Apply this change to `packages/core/test/optimize/search.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/test/optimize/search.test.ts b/packages/core/test/optimize/search.test.ts
index cd4fea6..81125f1 100644
--- a/packages/core/test/optimize/search.test.ts
+++ b/packages/core/test/optimize/search.test.ts
@@ -1,10 +1,12 @@
 import fc from "fast-check";
+import { createHash } from "node:crypto";
 import { describe, expect, it } from "vitest";
 import { EXAMPLES } from "../../../../examples/builders/index.ts";
 import type { Project } from "../../src/format/schema.ts";
 import { createProject } from "../../src/format/defaults.ts";
 import { parseProject } from "../../src/format/parse.ts";
-import { applyOptimizeResult, createSearch, optimize } from "../../src/optimize/search.ts";
+import { costLimit, withinLimit } from "../../src/optimize/goal.ts";
+import { applyOptimizeResult, createSearch, optimize, type OptimizeResult } from "../../src/optimize/search.ts";
 import { validatePlan } from "../../src/plan/validate.ts";
 import { sampleProject } from "../helpers.ts";
 
@@ -232,3 +234,107 @@ describe("optimize on random projects", () => {
     );
   });
 });
+
+describe("the optimizer goal", () => {
+  function twoStocks(a: { length: number; width: number; cost: number }, b: { length: number; width: number; cost: number }): Project {
+    const base = createProject("Goal", "mm");
+    return {
+      ...base,
+      materials: [{ id: "m", name: "M", thickness: 18, grained: false }],
+      stock: [
+        { id: "a", material: "m", ...a, quantity: null, kind: "sheet" },
+        { id: "b", material: "m", ...b, quantity: null, kind: "sheet" },
+      ],
+      parts: [{ id: "p", name: "P", material: "m", length: 900, width: 900, quantity: 1, grain: "none" }],
+      tools: [{ id: "t", name: "T", type: "table-saw", kerf: 3, enabled: true }],
+    };
+  }
+  const stockOf = (project: Project, options: Parameters<typeof optimize>[1]) => optimize(project, { iterations: 60, ...options }).sheets.map((sheet) => sheet.stock);
+
+  it("gives the same plans as before for the goal cost", () => {
+    const fingerprints = Object.fromEntries(
+      ["living-room-shelf", "simple-bookcase-mm", "kallax-2x4-mm", "eket-wall-in"].map((name) => {
+        const result = optimize(load(name), { iterations: 150, seed: 7, goal: "cost" });
+        const text = JSON.stringify({ sheets: result.sheets, unplaced: result.unplaced });
+        return [name, createHash("sha256").update(text).digest("hex").slice(0, 16)];
+      }),
+    );
+    expect(fingerprints).toEqual({
+      "living-room-shelf": "856f870d8ae44f6a",
+      "simple-bookcase-mm": "0179ead79bb2e7a9",
+      "kallax-2x4-mm": "09dce9c592a539a6",
+      "eket-wall-in": "12bae722ce52979a",
+    });
+  });
+
+  it("keeps to plans with no bought stock when an owned offcut makes the cheapest cost 0", () => {
+    const project = twoStocks({ length: 1000, width: 1000, cost: 100 }, { length: 2000, width: 1000, cost: 105 });
+    project.stock = [{ id: "o", material: "m", length: 950, width: 950, quantity: 1, kind: "offcut" }, project.stock[1]!];
+    const result = optimize(project, { iterations: 60, goal: "offcuts", extraCostPercent: 100 });
+    expect(result.sheets.map((sheet) => sheet.stock)).toEqual(["o"]);
+    expect(result.materials.map((m) => [m.score.cost, m.cheapestCost])).toEqual([[0, 0]]);
+  });
+
+  it("spends up to the limit for a larger offcut", () => {
+    const project = twoStocks({ length: 1000, width: 1000, cost: 100 }, { length: 2000, width: 1000, cost: 105 });
+    expect(stockOf(project, { goal: "cost" })).toEqual(["a"]);
+    expect(stockOf(project, { goal: "offcuts", extraCostPercent: 10 })).toEqual(["b"]);
+    expect(stockOf(project, { goal: "offcuts", extraCostPercent: 0 })).toEqual(["a"]);
+    const result = optimize(project, { iterations: 60, goal: "offcuts", extraCostPercent: 10 });
+    expect(result.materials.map((m) => [m.score.cost, m.cheapestCost])).toEqual([[105, 100]]);
+  });
+
+  it("spends up to the limit for fewer cuts", () => {
+    const project = twoStocks({ length: 1000, width: 1000, cost: 100 }, { length: 900, width: 900, cost: 104 });
+    expect(stockOf(project, { goal: "cuts", extraCostPercent: 10 })).toEqual(["b"]);
+    expect(stockOf(project, { goal: "cuts", extraCostPercent: 3 })).toEqual(["a"]);
+  });
+
+  it("takes the goal and the limit from the settings, and uses the lowest cost for an unknown goal", () => {
+    const project = twoStocks({ length: 1000, width: 1000, cost: 100 }, { length: 900, width: 900, cost: 104 });
+    const withGoal = (goal: string, extraCostPercent: number): Project => ({ ...project, settings: { ...project.settings, optimizer: { ...project.settings.optimizer, goal, extraCostPercent } } });
+    expect(stockOf(withGoal("cuts", 10), {})).toEqual(["b"]);
+    expect(stockOf(withGoal("cuts", 2), {})).toEqual(["a"]);
+    expect(stockOf(withGoal("time", 50), {})).toEqual(["a"]);
+    expect(stockOf(withGoal("cuts", 10), { goal: "cost" })).toEqual(["a"]);
+  });
+
+  it("gives the cost of the chosen plan as the cheapest cost for the goal cost", () => {
+    const result = optimize(load("simple-bookcase-mm"), { iterations: 30 });
+    expect(result.materials.map((m) => m.cheapestCost)).toEqual(result.materials.map((m) => m.score.cost));
+  });
+
+  it("never goes over the limit, also when it continues a search with or without the cheapest cost", () => {
+    const arb = fc.record({
+      goal: fc.constantFrom("offcuts" as const, "cuts" as const),
+      extra: fc.integer({ min: 0, max: 40 }),
+      stock: fc.array(fc.record({ length: fc.integer({ min: 30, max: 120 }), width: fc.integer({ min: 20, max: 60 }), cost: fc.integer({ min: 5, max: 60 }) }), { minLength: 1, maxLength: 3 }),
+      parts: fc.array(fc.record({ length: fc.integer({ min: 2, max: 60 }), width: fc.integer({ min: 2, max: 40 }), quantity: fc.integer({ min: 1, max: 4 }) }), { minLength: 1, maxLength: 6 }),
+      seed: fc.integer(),
+    });
+    fc.assert(
+      fc.property(arb, (a) => {
+        const base = createProject("Random", "in");
+        const project: Project = {
+          ...base,
+          materials: [{ id: "m", name: "M", thickness: 0.75, grained: false }],
+          stock: a.stock.map((s, i) => ({ id: `st${i}`, material: "m", ...s, quantity: null, kind: "sheet" as const })),
+          parts: a.parts.map((p, i) => ({ id: `p${i}`, name: `P${i}`, material: "m", ...p, grain: "none" as const })),
+          tools: [{ id: "t", name: "T", type: "table-saw", kerf: 0.125, enabled: true }],
+        };
+        const options = { iterations: 12, seed: a.seed, goal: a.goal, extraCostPercent: a.extra };
+        const within = (result: OptimizeResult) => result.materials.every((m) => withinLimit(m.score.cost, costLimit(m.cheapestCost, a.extra)));
+        let result = optimize(project, options);
+        expect(within(result)).toBe(true);
+        for (let run = 0; run < 3; run++) {
+          const next = optimize(project, { ...options, start: result });
+          expect(within(next)).toBe(true);
+          expect(next.materials.every((m, i) => m.cheapestCost <= result.materials[i]!.cheapestCost)).toBe(true);
+          result = next;
+        }
+        expect(within(optimize(project, { ...options, start: { ...result, materials: [] } }))).toBe(true);
+      }),
+      { numRuns: 60 },
+    );
+  });
+});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root packages/core test/optimize/search.test.ts`

Expected: FAIL in "the optimizer goal": the goal `offcuts` gets `["a"]` in place of `["b"]`, and `cheapestCost` is undefined. "gives the same plans as before for the goal cost" passes, because it pins the current plans.

- [ ] **Step 3: Implement**

Apply this change to `packages/core/src/optimize/search.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/core/src/optimize/search.ts b/packages/core/src/optimize/search.ts
index 0dd9785..6931db2 100644
--- a/packages/core/src/optimize/search.ts
+++ b/packages/core/src/optimize/search.ts
@@ -1,6 +1,7 @@
 import type { PlanSheet, Project, Stock } from "../format/schema.ts";
 import { uniqueId } from "../format/ids.ts";
 import { compareScores, evaluate, type Evaluated, type Score } from "./evaluate.ts";
+import { createTradeOffs, projectGoal, type OptimizerGoal, type TradeOffs } from "./goal.ts";
 import { guillotinePack, SPLIT_RULES, type SplitRule } from "./guillotine.ts";
 import type { Packing, RotationPolicy } from "./pack.ts";
 import { buildProblem, type Copy, type MaterialProblem, type Problem, type UnplacedCopy } from "./problem.ts";
@@ -18,11 +19,17 @@ export interface OptimizeOptions {
   now?: () => number;
   /** A previous result for the same project: the search continues from its plans ("Keep searching"). */
   start?: OptimizeResult;
+  /** Defaults to `settings.optimizer.goal`, with `cost` for a goal that this app does not know. */
+  goal?: OptimizerGoal;
+  /** Defaults to `settings.optimizer.extraCostPercent`. Ignored for the goal `cost`. */
+  extraCostPercent?: number;
 }
 
 export interface MaterialResult {
   material: string;
   score: Score;
+  /** The lowest cost of the plans with the fewest unplaced copies that the search found. */
+  cheapestCost: number;
 }
 
 export interface OptimizeResult {
@@ -56,7 +63,14 @@ interface MaterialSearch {
   base: Candidate[];
   next: number;
   evaluated: number;
-  best: { candidate: Candidate; result: Evaluated } | null;
+  best: Planned | null;
+  /** Null for the goal `cost`, which keeps only the best plan. */
+  trade: TradeOffs<Planned> | null;
+}
+
+interface Planned {
+  candidate: Candidate;
+  result: Evaluated;
 }
 
 const ORDERS: readonly ((a: Copy, b: Copy) => number)[] = [
@@ -75,9 +89,12 @@ export function createSearch(project: Project, options: OptimizeOptions = {}): S
   const seed = options.seed ?? settings.seed ?? 1;
   const now = options.now ?? Date.now;
   const perMaterial = options.iterations === undefined ? undefined : Math.max(1, options.iterations);
+  const goal = options.goal ?? projectGoal(project);
+  const extra = options.extraCostPercent ?? settings.extraCostPercent;
   const random = seededRandom(seed + (options.start?.iterations ?? 0));
-  const searches = problem.materials.map((m): MaterialSearch => ({ problem: m, base: baseCandidates(m), next: 0, evaluated: 0, best: null }));
-  if (options.start) seedFrom(problem, searches, options.start);
+  const tradeOffs = (cheapest?: number) => (goal === "cost" ? null : createTradeOffs<Planned>(goal, extra, cheapest));
+  const searches = problem.materials.map((m): MaterialSearch => ({ problem: m, base: baseCandidates(m), next: 0, evaluated: 0, best: null, trade: tradeOffs() }));
+  if (options.start) seedFrom(problem, searches, options.start, tradeOffs);
   let iterations = options.start?.iterations ?? 0;
   let elapsed = 0;
   let turn = 0;
@@ -97,7 +114,7 @@ export function createSearch(project: Project, options: OptimizeOptions = {}): S
     const result = evaluate(problem, search.problem, pack(problem, search.problem, candidate), `${search.problem.material}:`);
     search.evaluated++;
     iterations++;
-    if (!search.best || compareScores(result.score, search.best.result.score) < 0) search.best = { candidate, result };
+    record(search, { candidate, result });
   };
 
   return {
@@ -130,6 +147,15 @@ export function applyOptimizeResult(project: Project, result: OptimizeResult): P
   return { ...project, plan: { ...project.plan, sheets: result.sheets } };
 }
 
+function record(search: MaterialSearch, planned: Planned) {
+  if (!search.trade) {
+    if (!search.best || compareScores(planned.result.score, search.best.result.score) < 0) search.best = planned;
+    return;
+  }
+  search.trade.add(planned.result.score, planned);
+  search.best = search.trade.chosen()!.item;
+}
+
 function pack(problem: Problem, material: MaterialProblem, candidate: Candidate): Packing {
   const input = { ctx: problem.ctx, problem: material, order: candidate.order, stockOrder: candidate.stockOrder, rotation: candidate.rotation };
   return candidate.constructor === "strip" ? stripPack(input) : guillotinePack(input, candidate.constructor);
@@ -195,7 +221,7 @@ function randomCandidate(random: Random, search: MaterialSearch): Candidate {
   };
 }
 
-function seedFrom(problem: Problem, searches: MaterialSearch[], start: OptimizeResult) {
+function seedFrom(problem: Problem, searches: MaterialSearch[], start: OptimizeResult, tradeOffs: (cheapest?: number) => TradeOffs<Planned> | null) {
   const pinned = new Set(problem.pinned.map((s) => s.id));
   const reasons = new Map(start.unplaced.map((u) => [`${u.part}#${u.copy}`, u.reason]));
   for (const search of searches) {
@@ -223,8 +249,10 @@ function seedFrom(problem: Problem, searches: MaterialSearch[], start: OptimizeR
     }
     order.push(...copies.values());
     const unplaced = [...copies.values()].map((c) => ({ part: c.part.id, copy: c.copy, reason: reasons.get(`${c.part.id}#${c.copy}`) ?? ("no-stock" as const) }));
-    search.best = { candidate: { ...base, order }, result: evaluate(problem, search.problem, { sheets, unplaced }, `${search.problem.material}:`) };
-    search.next = search.base.length;
+    const cheapest = start.materials.find((m) => m.material === search.problem.material)?.cheapestCost;
+    search.trade = tradeOffs(cheapest);
+    record(search, { candidate: { ...base, order }, result: evaluate(problem, search.problem, { sheets, unplaced }, `${search.problem.material}:`) });
+    search.next = search.trade && cheapest === undefined ? 0 : search.base.length;
   }
 }
 
@@ -241,7 +269,7 @@ function assemble(problem: Problem, searches: MaterialSearch[], iterations: numb
       sheets.push({ id, stock: sheet.stock, placements: sheet.placements });
     }
     unplaced.push(...search.best.result.unplaced);
-    materials.push({ material: search.problem.material, score: search.best.result.score });
+    materials.push({ material: search.problem.material, score: search.best.result.score, cheapestCost: search.trade?.cheapest ?? search.best.result.score.cost });
   }
   return { sheets, unplaced, materials, iterations };
 }
```

Apply this change to `docs/optimizer.md` (`git apply` accepts it as is):

```diff
diff --git a/docs/optimizer.md b/docs/optimizer.md
index b9fd692..0eac322 100644
--- a/docs/optimizer.md
+++ b/docs/optimizer.md
@@ -41,7 +41,7 @@ The **rotation policy** decides which orientation a part that may rotate tries f
 
 1. The optimizer first tries every combination of four part orders (area, longest side, length, and width, each
    largest first), the five constructors, up to six sheet stock orders, and the rotation policies.
-2. It then tries random changes to the best candidate so far: swaps in the part order, a new order by area with
+2. It then tries random changes to the chosen candidate so far (see [Objective](#objective)): swaps in the part order, a new order by area with
    random noise, another constructor, another stock order, or another rotation policy.
 3. It stops at `timeLimitMs` (default `settings.optimizer.timeLimitMs`), but only after every material has at least
    one candidate. With `iterations`, it runs exactly that many candidates per material and ignores the time.
@@ -50,7 +50,9 @@ The random numbers come from `seed` (default `settings.optimizer.seed`, else 1).
 always give the same result. A timed run can stop at a different candidate on a different computer.
 
 **Keep searching**: pass the previous result as `start`. The search starts from its plans, skips the first stage, and
-continues with new random numbers. Copies that are now on a pinned sheet, or no longer in the project, are left out of
+continues with new random numbers. For the goals `offcuts` and `cuts`, the cheapest cost C of each material starts at
+the `cheapestCost` of that material in `start`. A material with no `cheapestCost` in `start` (the CLI builds such a
+start for `optimize --continue`) runs the first stage again, so that the search finds a cheap plan again. Copies that are now on a pinned sheet, or no longer in the project, are left out of
 those plans, and so are sheets past a stock's `quantity`.
 
 ## Validation
@@ -61,7 +63,9 @@ the plan-wide `no-tool` error drops nothing; the validator still reports it.
 
 ## Objective
 
-Candidates are compared per material, in this order:
+The goal is `goal` (default `settings.optimizer.goal`). A goal that this version does not know is `cost`.
+
+For the goal `cost`, candidates are compared per material, in this order:
 
 1. **Unplaced copies**: fewer is better.
 2. **Cost**: the sum of the stock `cost` of the sheets used. Owned offcuts count as 0. When the `cost` feature is off,
@@ -70,6 +74,20 @@ Candidates are compared per material, in this order:
 4. **Cut steps**, including trims: fewer is better.
 5. **Sheets**: fewer is better.
 
+For the goals `offcuts` and `cuts`, the search chooses a plan for each material with this rule:
+
+1. It keeps the candidates with the fewest unplaced copies.
+2. C is the lowest cost of those candidates. It keeps the candidates that cost at most
+   C × (1 + `extraCostPercent` / 100). `extraCostPercent` defaults to `settings.optimizer.extraCostPercent`.
+3. It chooses by the goal. For `offcuts`, the offcut areas compare largest first: the larger first area wins, then
+   the larger second area, and so on, and a list that ends first loses. For `cuts`, fewer cut steps win.
+4. When candidates are still equal, the order of the goal `cost` decides. Of two equal candidates, the first found
+   stays.
+
+Costs and areas that differ by less than a small relative tolerance are equal, so a candidate that costs exactly the
+limit stays. C can only go down, so the search drops a candidate when its cost goes over the limit. With the
+`offcuts` feature off, every offcut list is empty, and the goal `offcuts` gives the same plan as the goal `cost`.
+
 ## Result
 
 `OptimizeResult` has:
@@ -77,7 +95,9 @@ Candidates are compared per material, in this order:
 - `sheets`: the pinned sheets, then the new sheets of each material, in project material order;
 - `unplaced`: `{ part, copy, reason }` for each copy with no place, grouped by material in project material order,
   and in part order, then copy order, within each material;
-- `materials`: `{ material, score }`, with the score fields above;
+- `materials`: `{ material, score, cheapestCost }`. The `score` has the measures above, with `offcuts`: the area of
+  every offcut, largest first. `cheapestCost` is C for the goals `offcuts` and `cuts`, and the cost of the chosen plan
+  for the goal `cost`;
 - `iterations`: the candidates tried, over all materials, including those of a `start` result.
 
 | `reason` | Meaning |
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm run check`

Expected: exit 0; search.test.ts has 23 passing tests, and the fingerprints for the goal cost match.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/optimize/search.ts packages/core/test/optimize/search.test.ts docs/optimizer.md
git commit -m "Choose each material's plan by the optimizer goal within the cost limit" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```


### Task 4: The CLI keys, flags, and output

**Files:**
- Modify: `packages/cli/src/values.ts`, `packages/cli/src/commands/settings.ts`, `packages/cli/src/commands/optimize.ts`
- Modify: `docs/cli.md`
- Test: `packages/cli/test/settings-optimize.test.ts`

**Interfaces:**
- Consumes: `OPTIMIZER_GOALS`, `MAX_EXTRA_COST_PERCENT`, `describeGoal`, `extraCostPercent`, `projectGoal` from Task 2; `OptimizeOptions.goal`, `OptimizeOptions.extraCostPercent`, and `MaterialResult.cheapestCost` from Task 3.
- Produces: `numberValue(text: string, name: string, minimum = 0, maximum = Infinity): number`; with a finite maximum, the message is "a number from <minimum> to <maximum>".

- [ ] **Step 1: Write the failing tests**

Apply this change to `packages/cli/test/settings-optimize.test.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/cli/test/settings-optimize.test.ts b/packages/cli/test/settings-optimize.test.ts
index 59227a8..c7becc4 100644
--- a/packages/cli/test/settings-optimize.test.ts
+++ b/packages/cli/test/settings-optimize.test.ts
@@ -18,6 +18,8 @@ describe("settings", () => {
       "display.inch": 32,
       "optimizer.timeLimitMs": 2000,
       "optimizer.seed": null,
+      "optimizer.goal": "cost",
+      "optimizer.extraCostPercent": 10,
       currency: "USD",
       "features.grain": true,
     });
@@ -71,6 +73,19 @@ describe("settings", () => {
     expect((await cli(["settings", "set", SHELF, "features.grain", "yes"], io)).code).toBe(2);
     expect(io.writes).toEqual([]);
   });
+
+  it("sets the optimizer goal and the extra cost, and rejects bad values", async () => {
+    const io = withExamples();
+    const result = await cli(["settings", "set", SHELF, "optimizer.goal", "offcuts", "optimizer.extraCostPercent", "25", "--json"], io);
+    expect(result.file(SHELF).settings.optimizer).toMatchObject({ goal: "offcuts", extraCostPercent: 25 });
+    const before = io.files.get(SHELF);
+    for (const pair of [["optimizer.goal", "time"], ["optimizer.extraCostPercent", "101"], ["optimizer.extraCostPercent", "ten"]]) {
+      const bad = await cli(["settings", "set", SHELF, ...pair, "--json"], io);
+      expect(bad.code).toBe(2);
+      expect(bad.json().error.code).toBe("invalid-value");
+    }
+    expect(io.files.get(SHELF)).toBe(before);
+  });
 });
 
 describe("optimize", () => {
@@ -128,9 +143,37 @@ describe("optimize", () => {
     expect(io.files.get(BOOKCASE)).toBe(before);
   });
 
+  it("uses --goal and --extra-cost for one run, and reports the extra cost", async () => {
+    const io = withExamples();
+    const result = await cli(["optimize", SHELF, "--iterations", "40", "--seed", "3", "--goal", "offcuts", "--extra-cost", "50", "--json"], io);
+    expect(result.code).toBe(0);
+    const data = result.json();
+    expect(data).toMatchObject({ goal: "offcuts", extraCostPercent: 50 });
+    expect(data.materials.length).toBeGreaterThan(0);
+    for (const m of data.materials) {
+      expect(m.cheapestCost).toBeLessThanOrEqual(m.score.cost);
+      expect(m.score.cost).toBeLessThanOrEqual(m.cheapestCost * 1.5 + 1e-6);
+      expect(m.extraCostPercent).toBe(Math.round(((m.score.cost - m.cheapestCost) / m.cheapestCost) * 1000) / 10);
+    }
+    expect(data.materials.some((m: { extraCostPercent: number }) => m.extraCostPercent > 0)).toBe(true);
+    expect(result.file(SHELF).settings.optimizer).toMatchObject({ goal: "cost", extraCostPercent: 10 });
+
+    const text = await cli(["optimize", SHELF, "--iterations", "40", "--seed", "3", "--goal", "offcuts", "--extra-cost", "50", "--out", "/dev/null"], withExamples());
+    expect(text.stdout).toContain("Goal: best offcuts, up to 50 % extra cost.");
+    expect(text.stdout).toMatch(/^ {2}.+: \d+ sheets?, [\d.]+ % more cost than the cheapest plan found\.$/m);
+    const plain = await cli(["optimize", SHELF, "--iterations", "5", "--out", "/dev/null"], withExamples());
+    expect(plain.stdout).toContain("Goal: lowest cost.");
+    expect(plain.stdout).not.toContain("% more cost");
+  });
+
   it("rejects conflicting modes and bad numbers", async () => {
     expect((await cli(["optimize", SHELF, "--rest-only", "--keep-pinned"], withExamples())).code).toBe(2);
     expect((await cli(["optimize", SHELF, "--time", "0"], withExamples())).code).toBe(2);
     expect((await cli(["optimize", SHELF, "--iterations", "many"], withExamples())).code).toBe(2);
+    for (const flags of [["--goal", "time"], ["--extra-cost", "101"], ["--extra-cost=-5"]]) {
+      const bad = await cli(["optimize", SHELF, ...flags, "--json"], withExamples());
+      expect(bad.code).toBe(2);
+      expect(bad.json().error.code).toBe("invalid-value");
+    }
   });
 });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root packages/cli test/settings-optimize.test.ts`

Expected: FAIL: `settings get` has no `optimizer.goal`, `settings set` does not know the key, and `optimize --goal` gives `bad-option`.

- [ ] **Step 3: Implement**

Apply this change to `packages/cli/src/values.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/cli/src/values.ts b/packages/cli/src/values.ts
index 6f85629..f1af88a 100644
--- a/packages/cli/src/values.ts
+++ b/packages/cli/src/values.ts
@@ -52,9 +52,11 @@ export function integerValue(text: string, name: string, minimum = Number.NEGATI
   return value;
 }
 
-export function numberValue(text: string, name: string, minimum = 0): number {
+export function numberValue(text: string, name: string, minimum = 0, maximum = Number.POSITIVE_INFINITY): number {
   const value = /^\d+(?:\.\d+)?$|^\.\d+$/.test(text.trim()) ? Number(text) : Number.NaN;
-  if (!Number.isFinite(value) || value < minimum) throw invalid(name, text, `a number of ${minimum} or more`);
+  if (!Number.isFinite(value) || value < minimum || value > maximum) {
+    throw invalid(name, text, maximum === Number.POSITIVE_INFINITY ? `a number of ${minimum} or more` : `a number from ${minimum} to ${maximum}`);
+  }
   return value;
 }
 
```

Apply this change to `packages/cli/src/commands/settings.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/cli/src/commands/settings.ts b/packages/cli/src/commands/settings.ts
index 3b796fb..5d8048c 100644
--- a/packages/cli/src/commands/settings.ts
+++ b/packages/cli/src/commands/settings.ts
@@ -3,7 +3,9 @@ import {
   DEFAULT_MIN_OFFCUT,
   FEATURE_KEYS,
   INCH_PRECISIONS,
+  MAX_EXTRA_COST_PERCENT,
   MM_PRECISIONS,
+  OPTIMIZER_GOALS,
   OrderModeSchema,
   UnitsSchema,
   type Project,
@@ -13,7 +15,7 @@ import { PROGRAM } from "../help.ts";
 import { FILE_ARG, finishMutation, loadProject, OUTPUT_OPTIONS, warningLines } from "../project.ts";
 import { usageError, type CommandSpec, type GroupSpec } from "../spec.ts";
 import { len, table } from "../text.ts";
-import { booleanValue, choiceValue, flag, integerValue, lengthValue } from "../values.ts";
+import { booleanValue, choiceValue, flag, integerValue, lengthValue, numberValue } from "../values.ts";
 
 interface Key {
   key: string;
@@ -138,6 +140,21 @@ const KEYS: Key[] = [
         return { ...s, optimizer: v === "none" ? optimizer : { ...optimizer, seed: integerValue(v, "optimizer.seed") } };
       }),
   },
+  {
+    key: "optimizer.goal",
+    values: OPTIMIZER_GOALS.join("|"),
+    description: "What the optimizer looks for after it fits every part: the lowest cost, the best offcuts (the largest offcut first), or the fewest cut steps. Default: cost.",
+    get: (p) => p.settings.optimizer.goal,
+    set: (p, v) => withSettings(p, (s) => ({ ...s, optimizer: { ...s.optimizer, goal: choiceValue(v, "optimizer.goal", OPTIMIZER_GOALS) } })),
+  },
+  {
+    key: "optimizer.extraCostPercent",
+    values: "<percent>",
+    description: "The most extra cost that the goal offcuts or cuts can use, in percent of the cheapest plan found (0 to 100). Default: 10.",
+    get: (p) => p.settings.optimizer.extraCostPercent,
+    set: (p, v) =>
+      withSettings(p, (s) => ({ ...s, optimizer: { ...s.optimizer, extraCostPercent: numberValue(v, "optimizer.extraCostPercent", 0, MAX_EXTRA_COST_PERCENT) } })),
+  },
   {
     key: "currency",
     values: "<code>",
```

Apply this change to `packages/cli/src/commands/optimize.ts` (`git apply` accepts it as is):

```diff
diff --git a/packages/cli/src/commands/optimize.ts b/packages/cli/src/commands/optimize.ts
index d8ee194..cb07cef 100644
--- a/packages/cli/src/commands/optimize.ts
+++ b/packages/cli/src/commands/optimize.ts
@@ -1,10 +1,23 @@
-import { applyRun, copyLabel, optimize, optimizeRequest, regenerateDesigns, type OptimizeOptions, type OptimizeResult } from "@opencutplan/core";
+import {
+  applyRun,
+  copyLabel,
+  describeGoal,
+  extraCostPercent,
+  MAX_EXTRA_COST_PERCENT,
+  OPTIMIZER_GOALS,
+  optimize,
+  optimizeRequest,
+  projectGoal,
+  regenerateDesigns,
+  type OptimizeOptions,
+  type OptimizeResult,
+} from "@opencutplan/core";
 import { PROGRAM } from "../help.ts";
 import { FILE_ARG, finishMutation, loadProject, OUTPUT_OPTIONS } from "../project.ts";
 import { usageError, type CommandSpec } from "../spec.ts";
 import { planStats, type PlanStats } from "../stats.ts";
 import { money, plural } from "../text.ts";
-import { flag, integerValue, numberValue, str } from "../values.ts";
+import { flag, integerValue, numberValue, optionalChoice, str } from "../values.ts";
 
 function statsLine(stats: PlanStats): string {
   return `${plural(stats.sheets, "sheet")}, ${stats.placedCopies} of ${stats.copies} copies placed, buy ${plural(stats.sheetsToBuy, "sheet")}, cost ${money(stats.cost, stats.currency)}`;
@@ -18,11 +31,18 @@ export const optimizeCommand: CommandSpec = {
   name: "optimize",
   summary: "Plan the parts on the stock, store the plan, and report what changed.",
   description:
-    "Run the optimizer and store its plan in the project. By default pinned sheets stay as they are and every other copy is planned again (the app's Optimize). --rest-only keeps every sheet and plans only the copies in the tray (Optimize the rest). --continue starts the search from the current plan, so the result is never worse than it (by the optimizer's objective). A run with --iterations gives the same result for the same seed on every computer; a timed run can stop at a different candidate. The currency of cost is the project currency.",
+    "Run the optimizer and store its plan in the project. By default pinned sheets stay as they are and every other copy is planned again (the app's Optimize). --rest-only keeps every sheet and plans only the copies in the tray (Optimize the rest). --continue starts the search from the current plan, so the result is never worse than it (by the optimizer's objective). --goal and --extra-cost change the goal for this run only; the stored settings stay. A run with --iterations gives the same result for the same seed on every computer; a timed run can stop at a different candidate. The currency of cost is the project currency.",
   args: [FILE_ARG],
   options: [
     { name: "time", type: "string", value: "<seconds>", description: "The search time. Default: the optimizer.timeLimitMs setting (2 s). Ignored with --iterations." },
     { name: "seed", type: "string", value: "<n>", description: "The random seed. Default: the optimizer.seed setting, else 1." },
+    { name: "goal", type: "string", value: OPTIMIZER_GOALS.join("|"), description: "The goal for this run: the lowest cost, the best offcuts, or the fewest cut steps. Default: the optimizer.goal setting." },
+    {
+      name: "extra-cost",
+      type: "string",
+      value: "<percent>",
+      description: "The most extra cost that the goal offcuts or cuts can use in this run, in percent of the cheapest plan found (0 to 100). Default: the optimizer.extraCostPercent setting.",
+    },
     { name: "iterations", type: "string", value: "<n>", description: "Try exactly n candidates per material and ignore the time. The result then depends only on the project and the seed." },
     { name: "keep-pinned", type: "boolean", description: "Keep the pinned sheets and plan everything else again. This is the default." },
     { name: "rest-only", type: "boolean", description: "Keep every sheet as it is and plan only the unplaced copies." },
@@ -35,7 +55,7 @@ export const optimizeCommand: CommandSpec = {
     { command: `${PROGRAM} optimize shelf.cutplan.json --time 10 --continue --json`, description: "Search 10 more seconds from the current plan." },
   ],
   output:
-    'mode ("all" or "rest"), continued, seed, timeLimitMs (null with --iterations), iterations (candidates tried), deterministic, before and after { sheets, placedCopies, unplacedCopies, sheetsToBuy, cost, errors }, unplaced [{ part, copy, name, reason }] (reason: too-large, no-stock, no-tool, not-guillotine), materials [{ material, score }], changes, validation, written, dryRun. With --strict, unplaced copies also give exit 1.',
+    'mode ("all" or "rest"), continued, goal, extraCostPercent (the limit of the run), seed, timeLimitMs (null with --iterations), iterations (candidates tried), deterministic, before and after { sheets, placedCopies, unplacedCopies, sheetsToBuy, cost, errors }, unplaced [{ part, copy, name, reason }] (reason: too-large, no-stock, no-tool, not-guillotine), materials [{ material, score, cheapestCost, extraCostPercent (the extra cost that the plan uses) }], changes, validation, written, dryRun. With --strict, unplaced copies also give exit 1.',
   async run(invocation) {
     const { args, options, io } = invocation;
     if (flag(options, "rest-only") && flag(options, "keep-pinned")) throw usageError("Give --keep-pinned or --rest-only, not both.", "conflict");
@@ -55,6 +75,12 @@ export const optimizeCommand: CommandSpec = {
     if (seedText !== undefined) opts.seed = integerValue(seedText, "seed");
     const iterationsText = str(options, "iterations");
     if (iterationsText !== undefined) opts.iterations = integerValue(iterationsText, "iterations", 1);
+    const goalOption = optionalChoice(options, "goal", OPTIMIZER_GOALS);
+    if (goalOption !== undefined) opts.goal = goalOption;
+    const extraText = str(options, "extra-cost");
+    if (extraText !== undefined) opts.extraCostPercent = numberValue(extraText, "extra-cost", 0, MAX_EXTRA_COST_PERCENT);
+    const goal = opts.goal ?? projectGoal(project);
+    const extra = opts.extraCostPercent ?? settings.extraCostPercent;
     const continued = flag(options, "continue");
     if (continued) {
       const start: OptimizeResult = { sheets: request.input.plan?.sheets ?? [], unplaced: [], materials: [], iterations: 0 };
@@ -67,9 +93,15 @@ export const optimizeCommand: CommandSpec = {
     const parts = new Map(project.parts.map((part) => [part.id, part]));
     const unplaced = result.unplaced.map((u) => ({ ...u, name: copyLabel(parts.get(u.part)!, u.copy) }));
     const deterministic = opts.iterations !== undefined;
+    const materials = result.materials.map((m) => ({ ...m, extraCostPercent: extraCostPercent(m.score.cost, m.cheapestCost) }));
+    const names = new Map(project.materials.map((material) => [material.id, material.name]));
     const details = [
       `Before: ${statsLine(before)}.`,
       `After: ${statsLine(after)}.`,
+      `Goal: ${describeGoal(goal, extra)}.`,
+      ...materials
+        .filter((m) => m.extraCostPercent > 0)
+        .map((m) => `  ${names.get(m.material) ?? m.material}: ${plural(m.score.sheets, "sheet")}, ${m.extraCostPercent} % more cost than the cheapest plan found.`),
       ...unplaced.map((u) => `  not placed: ${u.name} (${u.part} copy ${u.copy}): ${u.reason}`),
       `Tried ${result.iterations} candidates${deterministic ? "" : " (a timed run; use --iterations for the same result every time)"}.`,
     ];
@@ -79,6 +111,8 @@ export const optimizeCommand: CommandSpec = {
       data: {
         mode,
         continued,
+        goal,
+        extraCostPercent: extra,
         seed: opts.seed ?? settings.seed ?? 1,
         timeLimitMs: deterministic ? null : (opts.timeLimitMs ?? settings.timeLimitMs),
         iterations: result.iterations,
@@ -86,7 +120,7 @@ export const optimizeCommand: CommandSpec = {
         before: brief(before),
         after: brief(after),
         unplaced,
-        materials: result.materials,
+        materials,
       },
       ...(after.unplacedCopies > 0 ? { strictFailure: `${plural(after.unplacedCopies, "copy", "copies")} could not be placed.` } : {}),
     });
```

Apply this change to `docs/cli.md` (`git apply` accepts it as is):

```diff
diff --git a/docs/cli.md b/docs/cli.md
index a610138..ba6d742 100644
--- a/docs/cli.md
+++ b/docs/cli.md
@@ -176,7 +176,8 @@ apply in order, so a length after `units` is in the new units. `opencutplan help
 
 The keys are `name`, `notes`, `units`, `trim` (a length, or `factory`), `orderMode`, `minOffcut.length`,
 `minOffcut.width`, `minOffcut` (`default`), `display.inch`, `display.mm`, `optimizer.timeLimitMs`, `optimizer.seed`
-(a number, or `none`), `currency`, and `features.<name>` for each feature switch. A change of `units` converts all
+(a number, or `none`), `optimizer.goal` (`cost`, `offcuts`, or `cuts`), `optimizer.extraCostPercent` (0 to 100),
+`currency`, and `features.<name>` for each feature switch. A change of `units` converts all
 lengths in the project. `--factory-edges` is the same as `trim factory`.
 
 ### Optimize
@@ -185,13 +186,24 @@ lengths in the project. `--factory-edges` is the same as `trim factory`.
 
 - The default mode keeps the pinned sheets and plans all other copies again.
 - `--rest-only` keeps all sheets and plans only the copies in the tray.
-- `--continue` starts from the current plan, so the result is not worse than the current plan.
+- `--continue` starts from the current plan. For the goal `cost`, the result is not worse than the current plan. For
+  the goals `offcuts` and `cuts`, the search first tries its fixed candidates again to find the cheapest cost, so the
+  result can cost less and have a worse goal measure than the current plan.
 - `--time <seconds>` sets the search time. `--seed <n>` sets the random seed.
+- `--goal <goal>` and `--extra-cost <percent>` set the goal and the extra cost for this run only. The stored settings
+  do not change. See [`optimizer.md`](optimizer.md#objective).
 - `--iterations <n>` tries a fixed number of candidates and ignores the time. Use it when you need the same result
   each time. A timed run can stop at a different candidate on a different computer, even with the same seed.
 
+The text output names the goal. For each material whose plan costs more than the cheapest plan found, it adds a line:
+`Plywood: 3 sheets, 4 % more cost than the cheapest plan found.` The `--json` output has `goal` and
+`extraCostPercent` (the limit of the run), and `materials`: `{ material, score, cheapestCost, extraCostPercent }` for
+each material, where `extraCostPercent` is the extra cost that the plan uses, rounded to one decimal (0 when
+`cheapestCost` is 0).
+
 ```bash
 opencutplan optimize shelf.cutplan.json --iterations 200 --seed 1 --strict
+opencutplan optimize shelf.cutplan.json --goal offcuts --extra-cost 15
 ```
 
 ### Layout
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm run check`

Expected: exit 0; settings-optimize.test.ts has 14 passing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/values.ts packages/cli/src/commands/settings.ts packages/cli/src/commands/optimize.ts packages/cli/test/settings-optimize.test.ts docs/cli.md
git commit -m "Add the optimizer goal keys and flags to the CLI" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```


### Task 5: The web app

**Files:**
- Modify: `apps/web/src/screens/SettingsTab.tsx`, `apps/web/src/layout/LayoutTab.tsx`, `apps/web/src/screens/Workspace.tsx`
- Modify: `docs/web-app.md`
- Test: `apps/web/test/screens.test.tsx`, `apps/web/test/LayoutTab.test.tsx`, `apps/web/test/Workspace.test.tsx`

**Interfaces:**
- Consumes: `isOptimizerGoal`, `MAX_EXTRA_COST_PERCENT`, `OptimizerGoal`, `describeGoal`, `extraCostPercent`, `projectGoal` from Task 2; `MaterialResult.cheapestCost` from Task 3.
- Produces: `LayoutTabProps.onShowSettings(): void`; `GOAL_LABELS: Readonly<Record<OptimizerGoal, string>>` in `SettingsTab.tsx`.

- [ ] **Step 1: Write the failing tests**

Apply this change to `apps/web/test/screens.test.tsx` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/test/screens.test.tsx b/apps/web/test/screens.test.tsx
index 64b2363..bfcf557 100644
--- a/apps/web/test/screens.test.tsx
+++ b/apps/web/test/screens.test.tsx
@@ -165,6 +165,43 @@ describe("SettingsTab", () => {
     expect(screen.queryByRole("checkbox", { name: /^Edge trim/ })).toBeNull();
   });
 
+  it("sets the optimizer goal, and allows extra cost only for a goal other than the lowest cost", async () => {
+    const { current } = renderWithStore(sampleProject(), (store) => <WithPrefs store={store} />);
+    const goal = screen.getByRole("combobox", { name: "Goal" });
+    expect(within(goal).getAllByRole("option").map((option) => option.textContent)).toEqual(["Lowest cost", "Best offcuts", "Fewest cuts"]);
+    expect(goal).toHaveProperty("value", "cost");
+    const extra = screen.getByLabelText("Extra cost allowed (%)");
+    expect(extra).toHaveProperty("disabled", true);
+    expect(extra).toHaveProperty("value", "10");
+    await userEvent.selectOptions(goal, "Fewest cuts");
+    expect(current().project.settings.optimizer.goal).toBe("cuts");
+    expect(extra).toHaveProperty("disabled", false);
+    await userEvent.clear(extra);
+    await userEvent.type(extra, "101{Enter}");
+    expect(current().project.settings.optimizer.extraCostPercent).toBe(10);
+    await userEvent.clear(extra);
+    await userEvent.type(extra, "25{Enter}");
+    expect(current().project.settings.optimizer.extraCostPercent).toBe(25);
+  });
+
+  it("says when the goal of best offcuts cannot work, and keeps a goal that the app does not know", async () => {
+    const project = sampleProject();
+    const { current } = renderWithStore(
+      { ...project, settings: { ...project.settings, optimizer: { ...project.settings.optimizer, goal: "time" } } },
+      (store) => <WithPrefs store={store} />,
+    );
+    const goal = screen.getByRole("combobox", { name: "Goal" });
+    expect(goal).toHaveProperty("value", "time");
+    expect(within(goal).getByRole("option", { name: "time (unknown)" })).toBeTruthy();
+    expect(screen.getByLabelText("Extra cost allowed (%)")).toHaveProperty("disabled", true);
+    await userEvent.selectOptions(goal, "Best offcuts");
+    expect(screen.queryByText(/The Offcuts feature is off/)).toBeNull();
+    await userEvent.click(screen.getByRole("checkbox", { name: /^Offcuts/ }));
+    expect(current().project.settings.features.offcuts).toBe(false);
+    expect(screen.getByText("The Offcuts feature is off, so this goal gives the same plan as the lowest cost.")).toBeTruthy();
+    expect(within(goal).queryByRole("option", { name: "time (unknown)" })).toBeNull();
+  });
+
   it("keeps the snap switch and the grid together, and the grid in this browser", async () => {
     const { current } = renderWithStore(sampleProject(), (store) => <WithPrefs store={store} />);
     const snapping = within(screen.getByRole("group", { name: "Snapping" }));
```

Apply this change to `apps/web/test/LayoutTab.test.tsx` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/test/LayoutTab.test.tsx b/apps/web/test/LayoutTab.test.tsx
index b666ee7..8484550 100644
--- a/apps/web/test/LayoutTab.test.tsx
+++ b/apps/web/test/LayoutTab.test.tsx
@@ -1,4 +1,4 @@
-import { analyzeProject, type Project } from "@opencutplan/core";
+import { analyzeProject, createProject, type Project } from "@opencutplan/core";
 import { act, render, screen, waitFor, within } from "@testing-library/react";
 import userEvent from "@testing-library/user-event";
 import { useMemo } from "react";
@@ -11,14 +11,14 @@ import { DEFAULT_PREFS } from "../src/state/prefs.ts";
 import { useProject, type ProjectStore } from "../src/state/useProject.ts";
 import { inProcessWorkers, sampleProject } from "./helpers.ts";
 
-function renderLayout(initial: Project = sampleProject(), factory: WorkerFactory = inProcessWorkers().factory) {
+function renderLayout(initial: Project = sampleProject(), factory: WorkerFactory = inProcessWorkers().factory, onShowSettings = () => {}) {
   let latest: ProjectStore | null = null;
   function Harness() {
     const store = useProject(initial);
     latest = store;
     const analysis = useMemo(() => analyzeProject(store.project), [store.project]);
     const runs = useOptimizeRuns(store, factory);
-    return <LayoutTab store={store} analysis={analysis} prefs={DEFAULT_PREFS} runs={runs} />;
+    return <LayoutTab store={store} analysis={analysis} prefs={DEFAULT_PREFS} runs={runs} onShowSettings={onShowSettings} />;
   }
   render(<Harness />);
   return () => latest!;
@@ -186,6 +186,38 @@ describe("LayoutTab", () => {
     expect(screen.getByRole("status").textContent).toContain("The project changed while the optimizer ran");
   }, 15000);
 
+  it("names the goal, with a link to the settings", async () => {
+    const shown: string[] = [];
+    renderLayout(sampleProject(), inProcessWorkers().factory, () => shown.push("settings"));
+    expect(screen.getByText(/^Goal: lowest cost\./)).toBeTruthy();
+    await userEvent.click(screen.getByRole("button", { name: "Change" }));
+    expect(shown).toEqual(["settings"]);
+  });
+
+  it("shows the extra cost that each material uses after a run", async () => {
+    const base = createProject("Goal", "mm");
+    const project: Project = {
+      ...base,
+      settings: { ...base.settings, optimizer: { ...base.settings.optimizer, goal: "offcuts", timeLimitMs: 300 } },
+      materials: [{ id: "m", name: "Plywood", thickness: 18, grained: false }],
+      stock: [
+        { id: "a", material: "m", length: 1000, width: 1000, quantity: null, cost: 100, kind: "sheet" },
+        { id: "b", material: "m", length: 2000, width: 1000, quantity: null, cost: 105, kind: "sheet" },
+      ],
+      parts: [{ id: "p", name: "Panel", material: "m", length: 900, width: 900, quantity: 1, grain: "none" }],
+      tools: [{ id: "t", name: "Saw", type: "table-saw", kerf: 3, enabled: true }],
+    };
+    const current = renderLayout(project);
+    expect(screen.getByText(/^Goal: best offcuts, up to 10 % extra cost\./)).toBeTruthy();
+    expect(screen.queryByText(/more cost than the cheapest plan found/)).toBeNull();
+    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
+    expect(await screen.findByText("Plywood: 5 % more cost than the cheapest plan found.", {}, { timeout: 10000 })).toBeTruthy();
+    act(() => current().edit((p) => ({ ...p, settings: { ...p.settings, optimizer: { ...p.settings.optimizer, goal: "cost" } } })));
+    expect(screen.getByText(/^Goal: lowest cost\./)).toBeTruthy();
+    expect(screen.queryByText(/more cost than the cheapest plan found/)).toBeNull();
+    expect(screen.getByRole("button", { name: "Keep searching" }).hasAttribute("disabled")).toBe(true);
+  }, 15000);
+
   it("offers Keep searching only while the layout is the one the search produced", async () => {
     renderLayout();
     await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
```

Apply this change to `apps/web/test/Workspace.test.tsx` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/test/Workspace.test.tsx b/apps/web/test/Workspace.test.tsx
index a6b23b2..57b1545 100644
--- a/apps/web/test/Workspace.test.tsx
+++ b/apps/web/test/Workspace.test.tsx
@@ -127,6 +127,13 @@ describe("Workspace", () => {
     expect(screen.queryByText("The file was downloaded.")).toBeNull();
   });
 
+  it("opens the Settings tab from the goal on the Layout tab", async () => {
+    await renderWorkspace();
+    await userEvent.click(screen.getByRole("button", { name: "Change" }));
+    expect(screen.getByRole("tab", { name: "Settings" }).getAttribute("aria-selected")).toBe("true");
+    expect(screen.getByRole("combobox", { name: "Goal" })).toBeTruthy();
+  });
+
   it("stops drawing grain on the layout when the grain feature is turned off", async () => {
     await renderWorkspace();
     part("Side 2").focus();
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root apps/web test/screens.test.tsx test/LayoutTab.test.tsx test/Workspace.test.tsx`

Expected: FAIL: there is no combobox "Goal", no text "Goal: lowest cost.", and no button "Change".

- [ ] **Step 3: Implement**

Apply this change to `apps/web/src/screens/SettingsTab.tsx` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/src/screens/SettingsTab.tsx b/apps/web/src/screens/SettingsTab.tsx
index 7b484d6..1d669b7 100644
--- a/apps/web/src/screens/SettingsTab.tsx
+++ b/apps/web/src/screens/SettingsTab.tsx
@@ -4,7 +4,10 @@ import {
   DEFAULT_TRIM,
   FEATURE_KEYS,
   INCH_PRECISIONS,
+  isOptimizerGoal,
+  MAX_EXTRA_COST_PERCENT,
   MM_PRECISIONS,
+  type OptimizerGoal,
   type Features,
   type InchPrecision,
   type Project,
@@ -27,6 +30,8 @@ export const FEATURE_TEXT: Readonly<Record<keyof Features, { label: string; deta
   snapping: { label: "Snapping", detail: "Snap dragged parts to edges, neighbours, and the grid. Hold Alt (⌥) to drag without it." },
 };
 
+export const GOAL_LABELS: Readonly<Record<OptimizerGoal, string>> = { cost: "Lowest cost", offcuts: "Best offcuts", cuts: "Fewest cuts" };
+
 function inchLabel(precision: InchPrecision): string {
   return precision === "decimal" ? "Decimal inches" : `1/${precision}"`;
 }
@@ -45,6 +50,7 @@ export function SettingsTab({ store, prefs, onPrefs }: SettingsTabProps) {
   const display = settings.display;
   const set = (change: (settings: Settings) => Settings, key?: string) => edit((p: Project) => ({ ...p, settings: change(p.settings) }), key);
   const minOffcut = settings.minOffcut ?? DEFAULT_MIN_OFFCUT[units];
+  const goal = settings.optimizer.goal;
   const factoryEdges = !settings.features.trim || settings.trim === 0;
   const feature = (key: keyof Features) => (
     <label key={key} className="switch">
@@ -187,6 +193,27 @@ export function SettingsTab({ store, prefs, onPrefs }: SettingsTabProps) {
 
       <fieldset>
         <legend>Optimizer</legend>
+        <label className="stack">
+          Goal
+          <select value={goal} onChange={(event) => set((s) => ({ ...s, optimizer: { ...s.optimizer, goal: event.target.value } }))}>
+            {Object.entries(GOAL_LABELS).map(([value, label]) => (
+              <option key={value} value={value}>
+                {label}
+              </option>
+            ))}
+            {!isOptimizerGoal(goal) && <option value={goal}>{goal} (unknown)</option>}
+          </select>
+          {goal === "offcuts" && !settings.features.offcuts && <small>The Offcuts feature is off, so this goal gives the same plan as the lowest cost.</small>}
+        </label>
+        <label className="stack">
+          Extra cost allowed (%)
+          <NumberInput
+            value={settings.optimizer.extraCostPercent}
+            maximum={MAX_EXTRA_COST_PERCENT}
+            disabled={goal === "cost" || !isOptimizerGoal(goal)}
+            onChange={(extraCostPercent) => extraCostPercent !== undefined && set((s) => ({ ...s, optimizer: { ...s.optimizer, extraCostPercent } }))}
+          />
+        </label>
         <label className="stack">
           Search time (seconds)
           <NumberInput
```

Apply this change to `apps/web/src/layout/LayoutTab.tsx` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/src/layout/LayoutTab.tsx b/apps/web/src/layout/LayoutTab.tsx
index 0de19cb..2faf4f0 100644
--- a/apps/web/src/layout/LayoutTab.tsx
+++ b/apps/web/src/layout/LayoutTab.tsx
@@ -3,6 +3,8 @@ import {
   clearsKerf,
   contains,
   copyLabel,
+  describeGoal,
+  extraCostPercent,
   findCopy,
   findFreeSpot,
   groupColors,
@@ -11,6 +13,7 @@ import {
   nudgeCopy,
   orientedSize,
   placeCopy,
+  projectGoal,
   removeEmptySheets,
   removeSheet,
   rotateCopy,
@@ -62,6 +65,7 @@ interface LayoutTabProps {
   analysis: ProjectAnalysis;
   prefs: ViewPrefs;
   runs: OptimizeRuns;
+  onShowSettings(): void;
 }
 
 /** The nudge step: one display step, or 1 in / 25 mm with Shift. */
@@ -75,7 +79,7 @@ function isEditable(target: EventTarget | null): boolean {
   return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName));
 }
 
-export function LayoutTab({ store, analysis, prefs, runs }: LayoutTabProps) {
+export function LayoutTab({ store, analysis, prefs, runs, onShowSettings }: LayoutTabProps) {
   const { project, edit } = store;
   const ctx = analysis.context;
   const busy = runs.running !== null;
@@ -290,6 +294,10 @@ export function LayoutTab({ store, analysis, prefs, runs }: LayoutTabProps) {
   const dragging = drag?.started ? drag.ref : null;
   const progress = runs.running ? Math.min(1, (Date.now() - runs.running.startedAt) / runs.running.timeLimitMs) : 0;
   const canOptimize = !busy && project.parts.length > 0 && enabledStock.length > 0;
+  const goal = describeGoal(projectGoal(project), project.settings.optimizer.extraCostPercent);
+  const extraCosts = (runs.current?.result.materials ?? [])
+    .map((m) => ({ name: project.materials.find((material) => material.id === m.material)?.name ?? m.material, percent: extraCostPercent(m.score.cost, m.cheapestCost) }))
+    .filter((m) => m.percent > 0);
 
   return (
     // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- layout shortcuts for the focused part or sheet bubble up to this element
@@ -345,6 +353,15 @@ export function LayoutTab({ store, analysis, prefs, runs }: LayoutTabProps) {
           </button>
         </span>
       </div>
+      <p className="muted">
+        Goal: {goal}.{" "}
+        <button type="button" className="link" onClick={onShowSettings}>
+          Change
+        </button>
+        {extraCosts.map((m) => (
+          <span key={m.name}> {`${m.name}: ${m.percent} % more cost than the cheapest plan found.`}</span>
+        ))}
+      </p>
       {(runs.error || runs.notice) && (
         <p role="status" className={runs.error ? "banner error" : "banner"}>
           {runs.error ? `✖ The optimizer failed: ${runs.error}` : runs.notice}
```

Apply this change to `apps/web/src/screens/Workspace.tsx` (`git apply` accepts it as is):

```diff
diff --git a/apps/web/src/screens/Workspace.tsx b/apps/web/src/screens/Workspace.tsx
index 1698abf..e6df23a 100644
--- a/apps/web/src/screens/Workspace.tsx
+++ b/apps/web/src/screens/Workspace.tsx
@@ -176,7 +176,7 @@ export function Workspace({ id, initial, notices: initialNotices, handle: initia
         )}
         {tab === "stock" && <StockTab store={store} />}
         {tab === "tools" && <ToolsTab store={store} storage={storage} />}
-        {tab === "layout" && <LayoutTab store={store} analysis={analysis} prefs={prefs} runs={runs} />}
+        {tab === "layout" && <LayoutTab store={store} analysis={analysis} prefs={prefs} runs={runs} onShowSettings={() => setTab("settings")} />}
         {tab === "shop" && <ShopTab store={store} analysis={analysis} onPrint={setPrintJob} />}
         {tab === "reports" && <ReportsTab store={store} analysis={analysis} onPrint={setPrintJob} />}
         {tab === "settings" && <SettingsTab store={store} prefs={prefs} onPrefs={setPrefs} />}
```

Apply this change to `docs/web-app.md` (`git apply` accepts it as is):

```diff
diff --git a/docs/web-app.md b/docs/web-app.md
index 469d5d5..d016f2b 100644
--- a/docs/web-app.md
+++ b/docs/web-app.md
@@ -103,6 +103,9 @@ turns red and has a ⚠ mark; the **Problems** list names each problem, and **Sh
 - **Keep searching** continues the last search from its best plan. It is offered while the project is still the one
   the last search produced.
 - **Stop** ends a search and uses the best plan so far.
+- A line under the buttons names the optimizer goal, for example "Goal: best offcuts, up to 10 % extra cost.", and
+  **Change** opens the Settings tab. After a search, the line names each material whose plan costs more than the
+  cheapest plan found, for example "Plywood: 4 % more cost than the cheapest plan found."
 - The optimizer runs in a Web Worker, so the page stays responsive. A progress bar shows the part of the time limit
   that is used. When the project changes during a search, the result is not used.
 - **Pin** on a sheet keeps it through **Optimize**. **Remove** puts its parts in the tray.
@@ -194,7 +197,10 @@ The Settings tab puts the common settings first:
 - **Snapping**: the snapping switch and the grid size. A grid of 0 turns the grid off. The default grid is 1" or
   25 mm.
 - **Plan**: the cut order and the smallest useful offcut.
-- **Optimizer**: the search time (up to 3600 seconds) and the seed.
+- **Optimizer**: the **Goal** ("Lowest cost", "Best offcuts", or "Fewest cuts"), **Extra cost allowed (%)** (0 to
+  100; off for "Lowest cost"), the search time (up to 3600 seconds), and the seed. A goal from a newer version of the
+  app shows as "<value> (unknown)", and the optimizer uses the lowest cost. When the Offcuts feature is off, a note
+  says that "Best offcuts" gives the same plan as "Lowest cost". See [`optimizer.md`](optimizer.md#objective).
 - **Money**: the currency.
 - **View**: **Show cut lines** and **Draw cut lines at kerf width**.
 - **Features**: the other feature switches.
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npm run check && npm run e2e -w @opencutplan/web`

Expected: exit 0; the web suite passes, and the 3 Playwright tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/screens/SettingsTab.tsx apps/web/src/layout/LayoutTab.tsx apps/web/src/screens/Workspace.tsx apps/web/test/screens.test.tsx apps/web/test/LayoutTab.test.tsx apps/web/test/Workspace.test.tsx docs/web-app.md
git commit -m "Add the optimizer goal to the Settings and Layout tabs" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
