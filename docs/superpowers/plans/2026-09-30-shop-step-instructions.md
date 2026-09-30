# Clear Cut Instructions on the Shop Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-line step text with a structured step (title, method, pick-up line, numbered actions, labelled results), outline the piece on the Shop diagram, and use the new form on the Shop tab, in the printed cut sequence, and in `report sequence`.

**Architecture:** `describeStep` in core returns the structured `StepText`; a new exported `resultSentence` turns one result into a sentence for the body, the print, and the CLI. `sheetSvg` gets a `focus` option that pales the sheet outside the current piece and outlines it. The web Shop tab, `SequencePages`, and the CLI render the new fields.

**Tech Stack:** TypeScript (strict, `erasableSyntaxOnly`), Vitest, React 19 + Testing Library, Playwright; npm workspaces `packages/core`, `packages/cli`, `apps/web`.

**Spec:** `docs/superpowers/specs/2026-09-30-shop-step-instructions-design.md`

## Global Constraints

- The UI and text strings are exactly those in spec section 4 (for example `Step 7 · Cut 15 3/8" off the panel`, `Set the fence 15 3/8" from the blade.`). The separator in the title and the method is ` · ` (space, U+00B7, space).
- Sizes use `formatIn` and `formatSize` from `packages/core/src/plan/context.ts`; never format a number by hand.
- Top, bottom, left, right are the diagram directions: x grows to the right along the stock length, y grows down along the stock width.
- The file format does not change.
- Comments: none that restate code. Match the density of the file.
- Worktree: `worktrees/shop-steps` on branch `shop-steps` from main. Set up the `node_modules/@opencutplan` links (see Task 0).
- Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. A cut whose measured side is the remainder (the released side is a sliver): the headline is `Cut the panel to …`, and `where` goes on the remainder result, which comes first. Pinned in Task 1.
2. A step with no tool (kerf 0): the warning action comes first, then the circular saw actions, and `where` is "the top piece". Pinned in Task 1.
3. One sheet cut with two tools: the run heading is only `Sheet 1`, and each list item ends with ` · <tool name>`. Pinned in Task 3.
4. A side with more than four parts: `parts` is `["Side 1", "Side 2", "Side 3", "and 2 more"]` and the sentence reads naturally. Pinned in Task 1.
5. `focus` with a highlight step that is on another sheet: that drawing has no outline and no pale layer. Pinned in Task 2.

---

### Task 0: Worktree

- [ ] **Step 1: Create the worktree and the package links**

```bash
cd /Users/bmcanally/Development/open-cut-plan
git worktree add -q worktrees/shop-steps -b shop-steps main
cd worktrees/shop-steps
mkdir -p node_modules/@opencutplan
ln -sfn ../../packages/core node_modules/@opencutplan/core
ln -sfn ../../packages/cli node_modules/@opencutplan/cli
ln -sfn ../../apps/web node_modules/@opencutplan/web
```

Expected: `git log --oneline -1` shows the plan commit on main.

---

### Task 1: Structured step text in core

**Files:**
- Modify: `packages/core/src/sequence/text.ts` (whole file)
- Modify: `packages/core/src/index.ts` (export the new names, if `text.ts` is not exported with `export *`)
- Test: `packages/core/test/sequence/text.test.ts` (whole file), `packages/core/test/sequence/sequence.test.ts:119`
- Modify (old-title assertions only): `packages/cli/test/report-export.test.ts:24`, `apps/web/test/ShopTab.test.tsx`, `apps/web/test/Workspace.test.tsx:29`, `apps/web/test/print.test.tsx:133`, `apps/web/e2e/plan.e2e.ts:76,79`

**Interfaces:**
- Produces:
  ```ts
  export type StepResultKind = "part" | "next" | "offcut" | "waste";
  export interface StepResult { kind: StepResultKind; where: string | null; size: string; parts: string[]; next: number | null }
  export interface StepText { title: string; headline: string; method: string; pickUp: string; actions: string[]; results: StepResult[]; body: string }
  export function describeStep(ctx: PlanContext, step: Step): StepText;
  export function resultLabel(result: StepResult): string; // "Part" | "Parts" | "Next" | "Offcut" | "Waste"
  export function resultSentence(result: StepResult): string;
  ```

- [ ] **Step 1: Write the failing tests**

Replace `packages/core/test/sequence/text.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import { describeStep, formatSize, parseProject, planContext, sequencePlan, type Project, type Tool } from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

function texts(project: Project) {
  const ctx = planContext(project);
  return sequencePlan(project).map((step) => describeStep(ctx, step));
}

function withTool(tool: Tool): Project {
  const project = sampleProject();
  project.tools = [tool];
  return project;
}

function example(name: string): Project {
  const result = parseProject(EXAMPLES[name]!());
  if (!result.ok) throw new Error("example did not load");
  return result.project;
}

describe("describeStep", () => {
  it("names the trimmed edge and picks up the full sheet first", () => {
    const all = texts(sampleProject());
    expect(all[0]).toEqual({
      title: 'Step 1 · Trim 1/4" off the top edge',
      headline: 'Trim 1/4" off the top edge',
      method: "Table saw · trim: a cut that removes the rough factory edge",
      pickUp: 'the full sheet 96" × 48" (sheet 1)',
      actions: ['Cut 1/4" off the top edge.'],
      results: [
        { kind: "waste", where: null, size: '96" × 1/8"', parts: [], next: null },
        { kind: "next", where: null, size: '96" × 47 3/4"', parts: ["Side 1", "Side 2"], next: 2 },
      ],
      body: 'Pick up the full sheet 96" × 48" (sheet 1). 1. Cut 1/4" off the top edge. Waste: 96" × 1/8". Next: 96" × 47 3/4" with Side 1, Side 2, for step 2.',
    });
    expect(all.slice(0, 4).map((text) => text.headline)).toEqual([
      'Trim 1/4" off the top edge',
      'Trim 1/4" off the bottom edge',
      'Trim 1/4" off the left edge',
      'Trim 1/4" off the right edge',
    ]);
    expect(all[1]!.pickUp).toBe('the panel 96" × 47 3/4" from step 1');
  });

  it("sets the fence for a table saw rip and says where each side goes", () => {
    const rip = texts(sampleProject())[4]!;
    expect(rip.title).toBe('Step 5 · Cut 12" off the panel');
    expect(rip.method).toBe("Table saw · rip: a cut along the length of the sheet");
    expect(rip.pickUp).toBe('the panel 95 1/2" × 47 1/2" from step 4');
    expect(rip.actions).toEqual(['Set the fence 12" from the blade.', 'Put a 95 1/2" edge of the panel against the fence.', "Make the cut."]);
    expect(rip.results).toEqual([
      { kind: "next", where: "between the fence and the blade", size: '95 1/2" × 12"', parts: ["Side 1"], next: 7 },
      { kind: "next", where: null, size: '95 1/2" × 35 3/8"', parts: ["Side 2"], next: 6 },
    ]);
    expect(rip.body).toBe(
      'Pick up the panel 95 1/2" × 47 1/2" from step 4. 1. Set the fence 12" from the blade. 2. Put a 95 1/2" edge of the panel against the fence. 3. Make the cut. Next (between the fence and the blade): 95 1/2" × 12" with Side 1, for step 7. Next: 95 1/2" × 35 3/8" with Side 2, for step 6.',
    );
  });

  it("labels an offcut, or waste when offcuts are off", () => {
    expect(texts(sampleProject())[5]!.results[1]).toEqual({ kind: "offcut", where: null, size: '95 1/2" × 23 1/4"', parts: [], next: null });
    expect(texts(sampleProject())[5]!.body).toMatch(/ Offcut: 95 1\/2" × 23 1\/4"\. Set it aside\.$/);
    const project = sampleProject();
    project.settings.features.offcuts = false;
    expect(texts(project)[5]!.results[1]!.kind).toBe("waste");
    expect(texts(project)[5]!.body).toMatch(/ Waste: 95 1\/2" × 23 1\/4"\.$/);
  });

  it("uses the stop for a table saw crosscut and labels a finished part", () => {
    const cut = texts(sampleProject())[6]!;
    expect(cut.headline).toBe('Cut 30" off the panel');
    expect(cut.method).toBe("Table saw · crosscut: a cut across the length of the sheet");
    expect(cut.actions).toEqual(['Set the stop 30" from the blade.', 'Put a 12" edge of the panel against the stop.', "Make the cut."]);
    expect(cut.results[0]).toEqual({ kind: "part", where: "at the stop", size: '30" × 12"', parts: ["Side 1"], next: null });
    expect(cut.body).toContain('Part (at the stop): Side 1, 30" × 12".');
  });

  it("uses the stop on a panel saw, for a rip too", () => {
    const rip = texts(withTool({ id: "ps", name: "Panel saw", type: "panel-saw", kerf: 0.125, enabled: true }))[4]!;
    expect(rip.actions).toEqual(['Set the stop 12" from the blade.', 'Put a 95 1/2" edge of the panel against the stop.', "Make the cut."]);
    expect(rip.results[0]!.where).toBe("at the stop");
  });

  it("marks the cut for a track saw and a circular saw", () => {
    const track = texts(withTool({ id: "track", name: "Track saw", type: "track-saw", kerf: 0.125, enabled: true }))[6]!;
    expect(track.method).toBe("Track saw · crosscut: a cut across the length of the sheet");
    expect(track.actions).toEqual(['Mark 30" from the left edge, at the two ends of the cut.', "Put the edge of the track on the marks.", "Cut with the blade to the right of the marks."]);
    expect(track.results[0]!.where).toBe("the left piece");
    const circular = texts(withTool({ id: "circ", name: "Circular saw", type: "circular-saw", kerf: 0.125, enabled: true }))[4]!;
    expect(circular.actions).toEqual(['Mark 12" from the top edge, at the two ends of the cut.', "Clamp a straightedge so that the blade cuts next to the marks.", "Cut with the blade below the marks."]);
    expect(circular.results[0]!.where).toBe("the top piece");
  });

  it("warns when no tool can make the cut", () => {
    const project = sampleProject();
    project.tools[0]!.enabled = false;
    const cut = texts(project).find((text) => !text.headline.startsWith("Trim"))!;
    expect(cut.method).toMatch(/^No tool · /);
    expect(cut.actions).toEqual([
      "No enabled tool can make this cut. Check the Tools tab.",
      'Mark 12" from the top edge, at the two ends of the cut.',
      "Clamp a straightedge so that the blade cuts next to the marks.",
      "Cut with the blade below the marks.",
    ]);
    expect(cut.results[0]!.where).toBe("the top piece");
  });

  it("shortens a long part list", () => {
    const project = sampleProject();
    project.parts[0]!.quantity = 5;
    project.plan!.sheets[0]!.placements = [0, 1, 2, 3, 4].map((copy) => ({ part: "side", copy, x: 0.25 + copy * 12.125, y: 0.25, rotated: true }));
    const first = texts(project)[0]!;
    expect(first.results[1]!.parts).toEqual(["Side 1", "Side 2", "Side 3", "and 2 more"]);
    expect(first.body).toContain("with Side 1, Side 2, Side 3, and 2 more, for step 2.");
  });

  it("cuts the panel to size when the measured side is the remainder", () => {
    const gap = sampleProject();
    gap.plan!.sheets[0]!.placements[1]!.y = 12.4375;
    gap.tools[0] = { id: "ts", name: "Table saw", type: "table-saw", kerf: 0.125, enabled: true, maxRip: 40 };
    const ctx = planContext(gap);
    const sliver = sequencePlan(gap).find((step) => step.at === 12.375)!;
    const text = describeStep(ctx, sliver);
    expect(text.headline).toBe('Cut the panel to 35 5/16"');
    expect(text.actions[0]).toBe('Set the fence 35 5/16" from the blade.');
    expect(text.results[0]).toMatchObject({ where: "between the fence and the blade", size: formatSize(ctx, sliver.remainder) });
    expect(text.results[1]!.where).toBeNull();
  });

  it("describes every living-room-shelf step, and mm steps in mm", () => {
    const all = texts(example("living-room-shelf"));
    expect(all).toHaveLength(76);
    expect(all.every((text) => !text.body.includes("?"))).toBe(true);
    expect(all[4]!.title).toBe('Step 5 · Cut 15 3/8" off the panel');
    expect(all[4]!.body).toBe(
      'Pick up the panel 59 1/2" × 59 1/2" from step 4. 1. Set the fence 15 3/8" from the blade. 2. Put a 59 1/2" edge of the panel against the fence. 3. Make the cut. Next (between the fence and the blade): 59 1/2" × 15 3/8" with B Top, for step 8. Next: 59 1/2" × 44" with B Bottom, A Top, A Shelf 1, for step 6.',
    );
    const mm = texts(example("kallax-2x4-mm"));
    expect(mm.length).toBeGreaterThan(0);
    expect(mm.every((text) => !text.body.includes("?") && !text.body.includes('"'))).toBe(true);
    expect(mm.find((text) => !text.headline.startsWith("Trim"))!.headline).toMatch(/^Cut (the (sheet|panel) to )?\d+(\.\d+)? mm( off the (sheet|panel))?$/);
  });
});
```

In `packages/core/test/sequence/sequence.test.ts`, change line 116 (the old body said `Fence at 0"`; the new actions say `… 0" from the blade.` or `Mark 0" from …`):

```ts
        expect(describeStep(ctx, step).actions.join(" ")).not.toMatch(/ 0" from /);
```

and line 119:

```ts
    expect(describeStep(planContext(gap), sliver).actions[0]).toBe('Set the fence 35 5/16" from the blade.');
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root packages/core test/sequence/text.test.ts test/sequence/sequence.test.ts`
Expected: FAIL — `title` is `Step 1. Table saw, trim.` and `headline`, `method`, `pickUp`, `actions`, `results` are undefined.

- [ ] **Step 3: Write the implementation**

Replace `packages/core/src/sequence/text.ts` with:

```ts
import { EPSILON, sameRect, sizeAlong, type Axis, type Rect } from "../geometry/rect.ts";
import { copyLabel, formatIn, formatSize, isOffcutSize, stockRect, type PlanContext } from "../plan/context.ts";
import type { Step } from "./sequence.ts";

export type StepResultKind = "part" | "next" | "offcut" | "waste";

export interface StepResult {
  kind: StepResultKind;
  /** Where this side is at the saw; only the measured side of a rip or a crosscut has it. */
  where: string | null;
  size: string;
  parts: string[];
  next: number | null;
}

export interface StepText {
  title: string;
  headline: string;
  method: string;
  pickUp: string;
  actions: string[];
  /** The measured side first; for a trim, the removed strip first. */
  results: StepResult[];
  body: string;
}

type Edge = "top" | "bottom" | "left" | "right";

const MEANING = {
  rip: "a cut along the length of the sheet",
  crosscut: "a cut across the length of the sheet",
  trim: "a cut that removes the rough factory edge",
} as const;

const AWAY: Readonly<Record<Edge, string>> = { top: "below", bottom: "above", left: "to the right of", right: "to the left of" };

const LABEL: Readonly<Record<StepResultKind, string>> = { part: "Part", next: "Next", offcut: "Offcut", waste: "Waste" };

function edgeOf(piece: Rect, side: Rect, axis: Axis): Edge {
  if (axis === "y") return side.y <= piece.y + EPSILON ? "top" : "bottom";
  return side.x <= piece.x + EPSILON ? "left" : "right";
}

export function resultLabel(result: StepResult): string {
  return result.kind === "part" && result.parts.length > 1 ? "Parts" : LABEL[result.kind];
}

export function resultSentence(result: StepResult): string {
  const head = result.where === null ? `${resultLabel(result)}:` : `${resultLabel(result)} (${result.where}):`;
  const parts = result.parts.join(", ");
  switch (result.kind) {
    case "part":
      return `${head} ${parts}, ${result.size}.`;
    case "next":
      return `${head} ${result.size}${parts ? ` with ${parts}` : ""}, for step ${result.next}.`;
    case "offcut":
      return `${head} ${result.size}. Set it aside.`;
    case "waste":
      return `${head} ${result.size}.`;
  }
}

export function describeStep(ctx: PlanContext, step: Step): StepText {
  const sheet = ctx.project.plan?.sheets[step.sheetNumber - 1];
  const stock = sheet ? ctx.stock.get(sheet.stock) : undefined;
  const whole = stock !== undefined && sameRect(step.piece, stockRect(stock));
  const pieceWord = whole ? "sheet" : "panel";
  const size = formatSize(ctx, step.piece);
  const pickUp = whole
    ? `the full sheet ${size} (sheet ${step.sheetNumber})`
    : step.requires !== null
      ? `the panel ${size} from step ${step.requires}`
      : `the panel ${size} on sheet ${step.sheetNumber}`;
  const method = `${step.tool?.name ?? "No tool"} · ${step.kind}: ${MEANING[step.kind]}`;

  const names = (placements: readonly number[]) =>
    list(
      placements.map((index) => {
        const placement = sheet?.placements[index];
        const part = placement ? ctx.parts.get(placement.part) : undefined;
        return part && placement ? copyLabel(part, placement.copy) : "?";
      }),
    );
  const result = (rect: Rect, placements: readonly number[], next: number | null, where: string | null): StepResult => {
    const parts = names(placements);
    const kind: StepResultKind = next !== null ? "next" : parts.length > 0 ? "part" : isOffcutSize(ctx, rect) ? "offcut" : "waste";
    return { kind, where, size: formatSize(ctx, rect), parts, next };
  };
  const released = (where: string | null) => result(step.released, step.releasedPlacements, step.releasedNext, where);
  const remainder = (where: string | null) => result(step.remainder, step.remainderPlacements, step.remainderNext, where);
  const finish = (headline: string, actions: string[], results: StepResult[]): StepText => ({
    title: `Step ${step.step} · ${headline}`,
    headline,
    method,
    pickUp,
    actions,
    results,
    body: [`Pick up ${pickUp}.`, ...actions.map((action, i) => `${i + 1}. ${action}`), ...results.map(resultSentence)].join(" "),
  });

  if (step.kind === "trim") {
    const edge = edgeOf(step.piece, step.released, step.axis);
    const amount = formatIn(ctx, sizeAlong(step.piece, step.axis) - sizeAlong(step.remainder, step.axis));
    return finish(`Trim ${amount} off the ${edge} edge`, [`Cut ${amount} off the ${edge} edge.`], [released(null), remainder(null)]);
  }

  const setting = formatIn(ctx, step.setting);
  const length = formatIn(ctx, step.to - step.from);
  const edge = edgeOf(step.piece, step[step.side], step.axis);
  const headline = step.side === "released" ? `Cut ${setting} off the ${pieceWord}` : `Cut the ${pieceWord} to ${setting}`;
  const type = step.tool?.type;
  let actions: string[];
  let where: string;
  if (type === "table-saw" && step.axis === "y") {
    actions = [`Set the fence ${setting} from the blade.`, `Put a ${length} edge of the ${pieceWord} against the fence.`, "Make the cut."];
    where = "between the fence and the blade";
  } else if (type === "table-saw" || type === "panel-saw") {
    actions = [`Set the stop ${setting} from the blade.`, `Put a ${length} edge of the ${pieceWord} against the stop.`, "Make the cut."];
    where = "at the stop";
  } else {
    const guide = type === "track-saw" ? "Put the edge of the track on the marks." : "Clamp a straightedge so that the blade cuts next to the marks.";
    actions = [`Mark ${setting} from the ${edge} edge, at the two ends of the cut.`, guide, `Cut with the blade ${AWAY[edge]} the marks.`];
    if (step.tool === null) actions.unshift("No enabled tool can make this cut. Check the Tools tab.");
    where = `the ${edge} piece`;
  }
  const results = step.side === "released" ? [released(where), remainder(null)] : [remainder(where), released(null)];
  return finish(headline, actions, results);
}

function list(names: readonly string[]): string[] {
  if (names.length <= 4) return [...names];
  return [...names.slice(0, 3), `and ${names.length - 3} more`];
}
```

Check `packages/core/src/index.ts`: if it names exports from `./sequence/text.ts` one by one, add `resultLabel`, `resultSentence`, `type StepResult`, and `type StepResultKind`. If it uses `export *`, change nothing.

- [ ] **Step 4: Run the core tests to see them pass**

Run: `npx vitest run --root packages/core test/sequence`
Expected: PASS. If a size string differs (for example the trim strip is not `96" × 1/8"`), print `formatSize(ctx, step.released)` and correct the test only when the code follows the spec rule; record a ruling.

- [ ] **Step 5: Update the assertions on the old title in the other packages**

These tests assert the old title form only. Change them to the new form:

- `packages/cli/test/report-export.test.ts:24`: in the `toMatchObject`, replace `title: "Step 1. Table saw, trim."` with `title: 'Step 1 · Trim 1/4" off the top edge'`.
- `apps/web/test/ShopTab.test.tsx`: replace `/^Step 1\. Table saw, /` (line 32) with `/^Step 1 · Trim 1\/4" off the top edge$/`. Replace every other `/^Step N\. /` with `/^Step N · /`: `sed -E -i '' 's#/\^Step ([0-9]+)\\\. /#/^Step \1 · /#g' apps/web/test/ShopTab.test.tsx`. This also changes the list button names, which show the title until Task 3.
- `apps/web/test/Workspace.test.tsx:29`: `/^Step 1\. /` → `/^Step 1 · /`.
- `apps/web/test/print.test.tsx:133`: `/^☐Step 1\. Table saw, /` → `/^☐Step 1 · Trim 1\/4" off the top edge/`.
- `apps/web/e2e/plan.e2e.ts:76,79`: `/^Step 1\. /` → `/^Step 1 · /`, `/^Step 2\. /` → `/^Step 2 · /`.

Then: `grep -rn 'Step [0-9]*\\\. \|Table saw, ' apps/web/test apps/web/e2e packages/cli/test`
Expected: no match that refers to a cut step title (assembly steps and "Step 1 done" labels do not match this pattern).

- [ ] **Step 6: Run the whole check**

Run: `npm run check > /tmp/ss-t1.txt 2>&1; echo $?; grep -E "Tests |error" /tmp/ss-t1.txt`
Expected: exit 0; all core, CLI, and web tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -q -m "Give each cut step a title, a method, a pick-up line, numbered actions, and labelled results" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Outline the piece on the Shop diagram

**Files:**
- Modify: `packages/core/src/reports/svg.ts` (`SheetSvgOptions`, before the `if (options.showCuts ?? true)` block)
- Test: `packages/core/test/reports/svg.test.ts`

**Interfaces:**
- Consumes: `Step.piece` (existing).
- Produces: `SheetSvgOptions.focus?: boolean`. With `focus` and a `highlight` step on this sheet, the SVG has `<path data-focus="true" …>` and `<rect data-piece="true" x=… y=… width=… height=…>`.

- [ ] **Step 1: Write the failing test**

Add to the `describe` block in `packages/core/test/reports/svg.test.ts`:

```ts
  it("pales the sheet outside the piece of the highlighted step and outlines the piece, only with focus", () => {
    const { analysis, svg } = drawn(sampleProject(), { highlight: 5, focus: true });
    const piece = analysis.steps.find((step) => step.step === 5)!.piece;
    expect(svg).toContain(`<rect data-piece="true" x="${piece.x}" y="${piece.y}" width="${piece.length}" height="${piece.width}"`);
    expect(count(svg, /data-focus="true"/g)).toBe(1);
    expect(svg.indexOf('data-piece="true"')).toBeLessThan(svg.indexOf('data-step="1"'));
    expect(drawn(sampleProject(), { highlight: 5 }).svg).not.toMatch(/data-piece|data-focus/);
    expect(drawn(sampleProject(), { highlight: 99, focus: true }).svg).not.toMatch(/data-piece|data-focus/);
  });
```

(`drawn` and `count` are the helpers at the top of the file; `count(text, pattern)` counts matches of a global regex. Step 5 of the sample project has the piece `{ x: 0.25, y: 0.25, length: 95.5, width: 47.5 }`.)

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run --root packages/core test/reports/svg.test.ts`
Expected: FAIL — the SVG has no `data-piece` rect (and a type error on `focus` is reported by the typecheck later, not by Vitest).

- [ ] **Step 3: Write the implementation**

In `SheetSvgOptions`, after `highlight`:

```ts
  /** Pales the sheet outside the piece of the `highlight` step and outlines that piece. */
  focus?: boolean;
```

Before `if (options.showCuts ?? true) {`:

```ts
  const focused = options.focus ? steps.find((step) => step.step === options.highlight && step.sheetNumber === number) : undefined;
  if (focused) {
    const p = focused.piece;
    const box = (x: number, y: number, length: number, width: number) => `M${num(x)} ${num(y)}h${num(length)}v${num(width)}h${num(-length)}z`;
    out.push(
      `<path data-focus="true" d="${box(0, 0, stock.length, stock.width)} ${box(p.x, p.y, p.length, p.width)}" fill="#fff" fill-opacity="0.55" fill-rule="evenodd"/>`,
      `<rect data-piece="true" x="${num(p.x)}" y="${num(p.y)}" width="${num(p.length)}" height="${num(p.width)}" fill="none" stroke="#111" stroke-width="${num(base * 0.15)}"/>`,
    );
  }
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run --root packages/core test/reports/svg.test.ts`
Expected: PASS. If `num` writes `0.25` differently from `${piece.x}`, the test uses the same values; if it fails on formatting only, compare with `num(piece.x)` output and record a ruling.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -q -m "Let the sheet drawing pale the sheet outside the current piece and outline the piece" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The Shop tab shows the structured step

**Files:**
- Modify: `apps/web/src/shop/ShopTab.tsx` (the `shop-current` section and the step list)
- Modify: `apps/web/src/styles.css` (after `.shop-text` at line 130)
- Test: `apps/web/test/ShopTab.test.tsx`

**Interfaces:**
- Consumes: `describeStep`, `resultLabel` from `@opencutplan/core` (Task 1); `sheetSvg(..., { focus: true })` (Task 2).
- Produces: DOM: `p.shop-method`, `p.shop-pickup`, `ol.shop-actions > li`, `ul.shop-results > li` with `span.result-label.<kind>`, and a `button` "Go to step N" for a next result. List buttons `"<n>. <headline>"` (plus `" · <tool>"` when the run has more than one tool). Run heading `"Sheet <n> · <tool>"` when the run has one tool.

- [ ] **Step 1: Write the failing tests**

In `apps/web/test/ShopTab.test.tsx`:

1. In "makes a step current from the list and from Previous and Next", change the heading check and the list button names:

```ts
    expect(within(list).getByRole("heading", { name: "Sheet 1 · Table saw", level: 4 })).toBeTruthy();
    await userEvent.click(within(list).getByRole("button", { name: /^3\. Trim 1\/4" off the left edge$/ }));
```

   and change every other list button name in the file from `/^Step N · /` (after Task 1) to `/^N\. /` (for example line 168: `/^1\. /`, line 113: `/^3\. /`).

2. Add these tests in the `describe("ShopTab")` block:

```ts
  it("shows the method, the piece to pick up, the numbered actions, and a label for each result", async () => {
    renderShop();
    await userEvent.click(within(screen.getByRole("region", { name: "Cut sequence" })).getByRole("button", { name: /^5\. / }));
    const step = within(document.querySelector<HTMLElement>(".shop-current")!);
    expect(heading()).toBe('Step 5 · Cut 12" off the panel');
    expect(document.querySelector(".shop-method")?.textContent).toBe("Table saw · rip: a cut along the length of the sheet");
    expect(document.querySelector(".shop-pickup")?.textContent).toBe('Pick up the panel 95 1/2" × 47 1/2" from step 4.');
    expect([...document.querySelectorAll(".shop-actions li")].map((li) => li.textContent)).toEqual([
      'Set the fence 12" from the blade.',
      'Put a 95 1/2" edge of the panel against the fence.',
      "Make the cut.",
    ]);
    expect([...document.querySelectorAll(".shop-results .result-label")].map((label) => label.textContent)).toEqual(["Next", "Next"]);
    expect(document.querySelector(".shop-results li")?.textContent).toContain("between the fence and the blade");
    await userEvent.click(step.getByRole("button", { name: "Go to step 7" }));
    expect(heading()).toBe('Step 7 · Cut 30" off the panel');
    expect([...document.querySelectorAll(".shop-results .result-label")].map((label) => label.textContent)).toEqual(["Part", "Offcut"]);
  });

  it("outlines the piece of the current step on the diagram", () => {
    renderShop();
    const diagram = screen.getByRole("img", { name: /^Sheet 1: .*step 1 marked$/ });
    expect(diagram.querySelector('[data-piece="true"]')?.getAttribute("width")).toBe("96");
  });

  it("names the tool on each list item when a sheet uses two tools", () => {
    const project = sampleProject();
    project.tools = [
      { id: "ts", name: "Table saw", type: "table-saw", kerf: 0.125, enabled: true, maxRip: 10 },
      { id: "track", name: "Track saw", type: "track-saw", kerf: 0.125, enabled: true },
    ];
    renderShop(project);
    const list = screen.getByRole("region", { name: "Cut sequence" });
    expect(within(list).getByRole("heading", { name: "Sheet 1", level: 4 })).toBeTruthy();
    const names = within(list).getAllByRole("button").map((button) => button.textContent);
    expect(names.some((name) => name!.endsWith(" · Track saw"))).toBe(true);
    expect(names.some((name) => name!.endsWith(" · Table saw"))).toBe(true);
  });
```

(`renderShop(project?, onPrint?)` and `heading()` exist at the top of the file. The web `sampleProject` has the same sheet and the same two sides as the core one, so its steps 1–8 match Task 1. With `maxRip: 10`, the 12" rips go to the track saw, and the crosscuts stay on the table saw.)

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root apps/web test/ShopTab.test.tsx`
Expected: FAIL — no `.shop-method`, no "Sheet 1 · Table saw" heading, no `data-piece`.

- [ ] **Step 3: Write the implementation**

In `apps/web/src/shop/ShopTab.tsx`:

- Import `resultLabel` from `@opencutplan/core`.
- Replace `<p className="shop-text">{text.body}</p>` with:

```tsx
          <p className="shop-method muted">{text.method}</p>
          <p className="shop-pickup">Pick up {text.pickUp}.</p>
          <ol className="shop-actions">
            {text.actions.map((action, index) => (
              <li key={index}>{action}</li>
            ))}
          </ol>
          <h3 className="shop-result-title">Result</h3>
          <ul className="shop-results">
            {text.results.map((result, index) => (
              <li key={index}>
                <span className={`result-label ${result.kind}`}>{resultLabel(result)}</span>
                <span className="result-text">
                  <strong>{result.parts.length > 0 ? result.parts.join(", ") : result.size}</strong>
                  {result.parts.length > 0 && <small> {result.size}</small>}
                  {result.where && <small className="muted"> ({result.where})</small>}
                  {result.kind === "offcut" && <small> Set it aside.</small>}
                </span>
                {result.next !== null && (
                  <button type="button" className="link" onClick={() => setChosen(result.next)}>
                    Go to step {result.next}
                  </button>
                )}
              </li>
            ))}
          </ul>
```

- In the `sheetSvg` call, add `focus: true` to the options.
- In the step list, compute the tools of a run and use the headline:

```tsx
          {runs.map((run) => {
            const tools = new Set(run.map((s) => s.tool?.name ?? "No tool"));
            const oneTool = tools.size === 1 ? [...tools][0]! : null;
            return (
              <div key={run[0]!.step}>
                <h4>{oneTool ? `Sheet ${run[0]!.sheetNumber} · ${oneTool}` : `Sheet ${run[0]!.sheetNumber}`}</h4>
                <ol start={run[0]!.step}>
                  {run.map((s) => {
                    const done = state.done.has(s.step);
                    return (
                      <li key={s.step} className={done ? "done" : undefined} aria-current={s.step === current ? "step" : undefined}>
                        <input type="checkbox" checked={done} onChange={(event) => tick(s.step, event.target.checked)} disabled={state.stale} aria-label={`Step ${s.step} done`} />
                        <button type="button" className="link" onClick={() => setChosen(s.step)}>
                          {s.step}. {describeStep(ctx, s).headline}
                          {oneTool ? "" : ` · ${s.tool?.name ?? "No tool"}`}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
```

In `apps/web/src/styles.css`, replace the `.shop-text` rule (line 130) with:

```css
.shop-method { margin: -4px 0 8px; font-size: 13px; }
.shop-pickup { font-size: 16px; margin: 0 0 6px; }
.shop-actions { font-size: 17px; margin: 0 0 10px; padding-left: 24px; max-width: 60ch; }
.shop-actions li { margin: 0 0 4px; }
.shop-result-title { font-size: 14px; margin: 10px 0 4px; }
.shop-results { list-style: none; padding: 0; margin: 0 0 12px; display: flex; flex-direction: column; gap: 6px; font-size: 15px; }
.shop-results li { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.result-label { font-size: 12px; font-weight: 700; padding: 1px 8px; border-radius: 10px; color: #fff; min-width: 52px; text-align: center; }
.result-label.part { background: #2f7d3a; }
.result-label.next { background: #2a62b8; }
.result-label.offcut { background: #b7791f; }
.result-label.waste { background: #8a8a8a; }
```

Search for other uses of `shop-text`: `grep -rn "shop-text" apps/web`. Expected: none after the change.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run --root apps/web test/ShopTab.test.tsx test/Workspace.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -q -m "Show the numbered actions, the labelled results, and the piece outline on the Shop tab" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The printed cut sequence

**Files:**
- Modify: `apps/web/src/print/PrintView.tsx` (`SequencePages`, the `li` of each step)
- Test: `apps/web/test/print.test.tsx` ("prints the cut sequence with a box to tick for each step")

**Interfaces:**
- Consumes: `describeStep`, `resultSentence` (Task 1).

- [ ] **Step 1: Write the failing test**

In "prints the cut sequence with a box to tick for each step", replace the `items[0]` check with:

```ts
    expect(items[0]!.querySelector(".print-box")?.textContent).toBe("☐");
    expect([...items[0]!.querySelectorAll(":scope > div > div")].map((line) => line.textContent)).toEqual([
      'Step 1 · Trim 1/4" off the top edge · Table saw · trim: a cut that removes the rough factory edge',
      'Pick up the full sheet 96" × 48" (sheet 1). 1. Cut 1/4" off the top edge.',
      'Waste: 96" × 1/8". Next: 96" × 47 3/4" with Side 1, Side 2, for step 2.',
    ]);
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run --root apps/web test/print.test.tsx`
Expected: FAIL — the `li` has one `div` with the title and the body.

- [ ] **Step 3: Write the implementation**

In `SequencePages`, import `resultSentence` from `@opencutplan/core`, and replace the `<div>` inside each step `li` with:

```tsx
                    <div>
                      <div>
                        <strong>{text.title}</strong> · {text.method}
                      </div>
                      <div>
                        Pick up {text.pickUp}. {text.actions.map((action, index) => `${index + 1}. ${action}`).join(" ")}
                      </div>
                      <div>{text.results.map(resultSentence).join(" ")}</div>
                    </div>
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run --root apps/web test/print.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -q -m "Print each cut step as the title, the actions, and the results" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `report sequence` in the CLI

**Files:**
- Modify: `packages/cli/src/commands/report.ts` (the `report sequence` command: `output` and the `text`)
- Test: `packages/cli/test/report-export.test.ts` ("gives the cut steps with their text, for all sheets or one")

**Interfaces:**
- Consumes: `describeStep`, `resultSentence` (Task 1). The JSON already spreads `describeStep(...)`, so it gets the new fields with no code change.

- [ ] **Step 1: Write the failing test**

In "gives the cut steps with their text, for all sheets or one", after the `toMatchObject` on `all.steps[0]`, add:

```ts
    expect(all.steps[0]).toMatchObject({
      headline: 'Trim 1/4" off the top edge',
      method: "Table saw · trim: a cut that removes the rough factory edge",
      pickUp: 'the full sheet 60" × 60" (sheet 1)',
      actions: ['Cut 1/4" off the top edge.'],
    });
    expect(all.steps[0].results[1]).toMatchObject({ kind: "next", next: 2 });
    const text = (await cli(["report", "sequence", SHELF, "--sheet", "s1"], withExamples())).stdout;
    expect(text.split("\n").slice(0, 5)).toEqual([
      'Step 1 · Trim 1/4" off the top edge',
      "  Table saw · trim: a cut that removes the rough factory edge",
      '  Pick up the full sheet 60" × 60" (sheet 1).',
      '  1. Cut 1/4" off the top edge.',
      expect.stringMatching(/^ {2}Waste: /),
    ]);
```

(`SHELF` is the living-room shelf example. Its step 1 trims 1/4" off the top of a 60" × 60" sheet with the table saw; the Shop tab showed this text in the browser. If the first trim of this example is not the top edge, correct the expected edge from the output and record a ruling.)

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run --root packages/cli test/report-export.test.ts`
Expected: FAIL on the text output: the second line is the old body.

- [ ] **Step 3: Write the implementation**

In `packages/cli/src/commands/report.ts`, import `resultSentence` from `@opencutplan/core` (next to `describeStep`). Replace the `text` line of `report sequence` with:

```ts
    const lines = (step: (typeof steps)[number]) =>
      [
        step.title,
        `  ${step.method}`,
        `  Pick up ${step.pickUp}.`,
        ...step.actions.map((action, index) => `  ${index + 1}. ${action}`),
        ...step.results.map((result) => `  ${resultSentence(result)}`),
      ].join("\n");
    const text = steps.length === 0 ? "No cuts." : steps.map(lines).join("\n");
```

In the `output` string, replace `title, body }]` with:

```
title, headline, method, pickUp, actions [string], results [{ kind (part|next|offcut|waste), where, size, parts [string], next }], body }]
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run --root packages/cli`
Expected: PASS (the help-text tests, if any snapshot the `output` string, pass after the change; update an exact-match help test to the new string if one fails on it only).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -q -m "Give report sequence the structured step in its JSON and text" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: e2e and docs

**Files:**
- Modify: `apps/web/e2e/plan.e2e.ts` (after the Shop tab click, near line 76)
- Modify: `docs/cut-analysis.md:83-88`, `docs/web-app.md:137-138`, `docs/cli.md:275`

- [ ] **Step 1: Add the e2e checks**

After `await expect(page.getByRole("heading", { level: 2 })).toHaveText(/^Step 1 · /);` add:

```ts
  await expect(page.locator(".shop-pickup")).toHaveText(/^Pick up the full sheet 96" × 48" \(sheet 1\)\.$/);
  await expect(page.locator(".shop-actions li").first()).toHaveText(/\.$/);
  await expect(page.locator(".shop-diagram [data-piece]")).toHaveCount(1);
```

- [ ] **Step 2: Run e2e**

Run: `npm run e2e -w @opencutplan/web > /tmp/ss-e2e.txt 2>&1; echo $?; grep -E "passed|failed" /tmp/ss-e2e.txt`
Expected: exit 0, 3 passed.

- [ ] **Step 3: Update the docs**

`docs/cut-analysis.md`: replace the example and the paragraph after `` `describeStep(context, step)` gives the shop text, for example: `` with:

```markdown
`describeStep(context, step)` gives the shop text in parts: a `title` and a `headline` that say what the cut does, a
`method` (the tool and the kind of cut, with its meaning), the piece to pick up (`pickUp`), numbered `actions`, and
one `results` item for each side of the cut. For example:

> **Step 5 · Cut 15 3/8" off the panel** — Table saw · rip: a cut along the length of the sheet
>
> Pick up the panel 59 1/2" × 59 1/2" from step 4.
> 1. Set the fence 15 3/8" from the blade. 2. Put a 59 1/2" edge of the panel against the fence. 3. Make the cut.
>
> Next (between the fence and the blade): 59 1/2" × 15 3/8" with B Top, for step 8. Next: 59 1/2" × 44" with
> B Bottom, A Top, A Shelf 1, for step 6.

A result is a `part` (finished), `next` (a later step cuts it), `offcut` (set it aside), or `waste`. The measured side
comes first and says where it is at the saw. Trims name the edge ("Trim 1/4" off the top edge"). A table saw rip sets
the fence; a table saw crosscut and a panel saw set the stop; a track saw, a circular saw, and a step with no tool
mark the cut. `resultSentence(result)` gives one result as a sentence; `body` joins the pick-up line, the actions,
and the result sentences.
```

`docs/web-app.md`: replace the first Shop bullet (`- The current step shows its text …`) with:

```markdown
- The current step shows its title, the tool and the kind of cut, the piece to pick up, numbered actions, and a
  result for each side of the cut: **Part**, **Next** (with **Go to step N**), **Offcut**, or **Waste**. On the
  drawing, the piece to pick up has an outline and the rest of the sheet is pale; the current cut is thick and filled,
  and the cuts that are done are grey.
- The list shows each step as its number and what it does. When all the steps of a sheet use one tool, the sheet
  heading names the tool; otherwise each step names its tool.
```

`docs/cli.md:275`: change the comment `# .steps[].title and .body` to `# .steps[].title, .actions, .results, and .body`.

- [ ] **Step 4: Run the full check**

Run: `npm run check > /tmp/ss-check.txt 2>&1; echo $?; grep -E "Tests |error" /tmp/ss-check.txt`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -q -m "Check the structured step in e2e and describe it in the docs" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Finish

- Look at the Shop tab in a browser (the preview build, one table saw rip and one trim) and check the layout at 1440 × 900 and 390 × 844.
- Final review, then from the main repo: `git merge --ff-only shop-steps`, `npm run check`, `npm run e2e -w @opencutplan/web`, `git worktree remove worktrees/shop-steps`, `git branch -d shop-steps`.
