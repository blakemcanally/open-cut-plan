# Clear Cut Instructions and Tool Choice on the Shop Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-line step text with a structured step, outline the piece on the Shop diagram, give new projects a table saw and a track saw with sane limits, and let the carpenter pick the tool of each cut on the Shop tab (stored in the file, format 1.3).

**Architecture:** Core `describeStep` returns the structured `StepText`; `resultSentence` turns one result into a sentence. `sheetSvg` gets a `focus` option. `newTool` gets default limits and `defaultTools(units)` gives the two tools of a new project. Each plan sheet can store `toolChoices`; the sequence applies them and reports `recommended`, `chosen`, and `overLimit` on each `Step`. The web Shop tab renders the new text and a Tool select, and keeps the ticks on their cuts through a change of tool. The print and the CLI render the new fields; the CLI gets `layout tool`.

**Tech Stack:** TypeScript (strict, `erasableSyntaxOnly`), Zod, Vitest, React 19 + Testing Library, Playwright; npm workspaces `packages/core`, `packages/cli`, `apps/web`.

**Spec:** `docs/superpowers/specs/2026-09-30-shop-step-instructions-design.md`

## Global Constraints

- The UI and text strings are exactly those in spec sections 4 and 8 (for example `Step 7 · Cut 15 3/8" off the panel`, `Set the fence 15 3/8" from the blade.`, `This cut is over a limit of the Table saw: largest piece 96" × 24".`). The separator in the title and the method is ` · ` (space, U+00B7, space).
- Sizes use `formatIn` and `formatSize` from `packages/core/src/plan/context.ts`; never format a number by hand.
- Top, bottom, left, right are the diagram directions: x grows to the right along the stock length, y grows down along the stock width.
- Default limits (spec section 7): table saw `maxPiece` 96 × 24 in / 2440 × 610 mm, `maxRip` 24 / 610, `maxCrosscut` 24 / 610; track saw `maxCut` 110 / 2800. Order: table saw, then track saw.
- `FORMAT_VERSION` becomes `"1.3"`; the only new field is `plan.sheets[].toolChoices`. Existing projects, tool profiles, and example tools do not change.
- Comments: none that restate code. Match the density of the file.
- Worktree: `worktrees/shop-steps` on branch `shop-steps` from main (Task 0).
- Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. A chosen tool that the user then turns off: the step goes back to the recommended tool and `chosen` is false; the choice stays in the file while its cut exists. Pinned in Task 4.
2. A change of tool in the setup order, which moves steps: every ticked cut stays ticked under its new step number, and the banner does not show. Pinned in Task 5.
3. Tools exist but none can make the cut (all over their limits): the Tool select shows a "No tool" option as the value, and the actions start with the no-tool warning. Pinned in Task 5.
4. A cut whose measured side is the remainder (the released side is a sliver): the headline is `Cut the panel to …`, and `where` goes on the remainder result, which comes first. Pinned in Task 1.
5. `focus` with a highlight step on another sheet: that drawing has no outline and no pale layer. Pinned in Task 2.

---

### Task 0: Worktree

- [ ] **Step 1: Create the worktree and the package links**

```bash
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
- Test: `packages/core/test/sequence/text.test.ts` (whole file), `packages/core/test/sequence/sequence.test.ts:116,119`
- Modify (old-title assertions only): `packages/cli/test/report-export.test.ts:24`, `apps/web/test/ShopTab.test.tsx`, `apps/web/test/Workspace.test.tsx:29`, `apps/web/test/print.test.tsx:133`, `apps/web/e2e/plan.e2e.ts:76,79`

**Interfaces:**
- Produces (exported from `@opencutplan/core` through `export * from "./sequence/text.ts"`):
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

In `packages/core/test/sequence/sequence.test.ts`, change line 116 (the old body said `Fence at 0"`):

```ts
        expect(describeStep(ctx, step).actions.join(" ")).not.toMatch(/ 0" from /);
```

and line 119:

```ts
    expect(describeStep(planContext(gap), sliver).actions[0]).toBe('Set the fence 35 5/16" from the blade.');
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root packages/core test/sequence/text.test.ts test/sequence/sequence.test.ts`
Expected: FAIL — `title` is `Step 1. Table saw, trim.`; `headline`, `method`, `pickUp`, `actions`, `results` are undefined.

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

- [ ] **Step 4: Run the core tests to see them pass**

Run: `npx vitest run --root packages/core test/sequence`
Expected: PASS. If a size string differs (for example the trim strip is not `96" × 1/8"`), print `formatSize(ctx, step.released)`; correct the test only when the code follows the spec rule, and record a ruling.

- [ ] **Step 5: Update the assertions on the old title in the other packages**

- `packages/cli/test/report-export.test.ts:24`: in the `toMatchObject`, replace `title: "Step 1. Table saw, trim."` with `title: 'Step 1 · Trim 1/4" off the top edge'`.
- `apps/web/test/ShopTab.test.tsx`: replace `/^Step 1\. Table saw, /` (line 32) with `/^Step 1 · Trim 1\/4" off the top edge$/`. Replace every other `/^Step N\. /` with `/^Step N · /`: `sed -E -i '' 's#/\^Step ([0-9]+)\\\. /#/^Step \1 · /#g' apps/web/test/ShopTab.test.tsx`. This also changes the list button names, which show the title until Task 5.
- `apps/web/test/Workspace.test.tsx:29`: `/^Step 1\. /` → `/^Step 1 · /`.
- `apps/web/test/print.test.tsx:133`: `/^☐Step 1\. Table saw, /` → `/^☐Step 1 · Trim 1\/4" off the top edge/`.
- `apps/web/e2e/plan.e2e.ts:76,79`: `/^Step 1\. /` → `/^Step 1 · /`, `/^Step 2\. /` → `/^Step 2 · /`.

Then: `grep -rn 'Step [0-9]*\\\. \|Table saw, ' apps/web/test apps/web/e2e packages/cli/test`
Expected: no match that refers to a cut step title.

- [ ] **Step 6: Run the whole check**

Run: `npm run check > /tmp/ss-t1.txt 2>&1; echo $?; grep -E "Tests |error" /tmp/ss-t1.txt`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -q -m "Give each cut step a title, a method, a pick-up line, numbered actions, and labelled results" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Outline the piece on the Shop diagram

**Files:**
- Modify: `packages/core/src/reports/svg.ts` (`SheetSvgOptions`, and before the `if (options.showCuts ?? true)` block)
- Test: `packages/core/test/reports/svg.test.ts`

**Interfaces:**
- Produces: `SheetSvgOptions.focus?: boolean`. With `focus` and a `highlight` step on this sheet, the SVG has `<path data-focus="true" …>` and `<rect data-piece="true" x=… y=… width=… height=…>`.

- [ ] **Step 1: Write the failing test**

Add to the `describe("sheetSvg")` block (`drawn` and `count` are the helpers at the top of the file):

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

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run --root packages/core test/reports/svg.test.ts`
Expected: FAIL — no `data-piece` rect.

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

(Use the names that `sheetSvg` already has for the sheet number, the stock, the output array, and the margin; read the function first and adapt `number`, `stock`, `out`, `base` to them. Record a ruling for any rename.)

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run --root packages/core test/reports/svg.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -q -m "Let the sheet drawing pale the sheet outside the current piece and outline the piece" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The default tools

**Files:**
- Modify: `packages/core/src/edit/tools.ts` (`newTool`, new `defaultTools`)
- Modify: `apps/web/src/screens/Home.tsx:19-23` (`newProject`)
- Modify: `packages/cli/src/commands/project.ts:33` (`new`)
- Test: `packages/core/test/edit/edit.test.ts:92-93`, `packages/core/test/sequence/sequence.test.ts`, `apps/web/test/App.test.tsx:21,30`, `packages/cli/test/project.test.ts:15`

**Interfaces:**
- Produces: `defaultTools(units: Units): Tool[]` → `[table saw, track saw]`, ids `"table-saw"` and `"track-saw"`. `newTool(type, units, taken)` adds the default limits of its type.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/edit/edit.test.ts`, replace line 93 with:

```ts
    expect(project.tools[1]).toEqual({ id: "track-saw", name: "Track saw", type: "track-saw", kerf: 0.125, enabled: true, maxCut: 110 });
```

and add a test in the same `describe` block (import `defaultTools` and `newTool` from `../../src/index.ts`):

```ts
  it("gives a new project a table saw and a track saw with the default limits", () => {
    expect(defaultTools("in")).toEqual([
      { id: "table-saw", name: "Table saw", type: "table-saw", kerf: 0.125, enabled: true, maxPiece: { length: 96, width: 24 }, maxRip: 24, maxCrosscut: 24 },
      { id: "track-saw", name: "Track saw", type: "track-saw", kerf: 0.125, enabled: true, maxCut: 110 },
    ]);
    expect(defaultTools("mm")).toEqual([
      { id: "table-saw", name: "Table saw", type: "table-saw", kerf: 3, enabled: true, maxPiece: { length: 2440, width: 610 }, maxRip: 610, maxCrosscut: 610 },
      { id: "track-saw", name: "Track saw", type: "track-saw", kerf: 3, enabled: true, maxCut: 2800 },
    ]);
    expect(newTool("circular-saw", "in", new Set())).toEqual({ id: "circular-saw", name: "Circular saw", type: "circular-saw", kerf: 0.125, enabled: true });
  });
```

In `packages/core/test/sequence/sequence.test.ts`, add (import `defaultTools`):

```ts
  it("sends the full-sheet cuts to the track saw and the strip crosscuts to the table saw with the default tools", () => {
    const project = sampleProject();
    project.tools = defaultTools("in");
    expect(sequencePlan(project).map((step) => step.tool?.id)).toEqual(["track-saw", "track-saw", "track-saw", "track-saw", "track-saw", "track-saw", "table-saw", "table-saw"]);
  });
```

In `apps/web/test/App.test.tsx`, rename the test at line 21 to `"creates a millimetre project with a table saw and a track saw and opens it on the Parts tab"` and replace line 30 with:

```ts
    expect(created.tools.map((t) => [t.type, t.kerf])).toEqual([["table-saw", 3], ["track-saw", 3]]);
```

In `packages/cli/test/project.test.ts`, replace line 15 with:

```ts
    expect(project.tools).toEqual(defaultTools("in"));
```

(import `defaultTools` from `@opencutplan/core`).

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root packages/core test/edit/edit.test.ts test/sequence/sequence.test.ts`
Expected: FAIL — `defaultTools` is not exported; the track saw has no `maxCut`.

- [ ] **Step 3: Write the implementation**

In `packages/core/src/edit/tools.ts`:

```ts
const DEFAULT_LIMITS: Readonly<Record<Units, Partial<Record<ToolType, object>>>> = {
  in: { "table-saw": { maxPiece: { length: 96, width: 24 }, maxRip: 24, maxCrosscut: 24 }, "track-saw": { maxCut: 110 } },
  mm: { "table-saw": { maxPiece: { length: 2440, width: 610 }, maxRip: 610, maxCrosscut: 610 }, "track-saw": { maxCut: 2800 } },
};

export function newTool(type: ToolType, units: Units, taken: ReadonlySet<string>): Tool {
  const name = TOOL_TYPE_NAMES[type];
  return { id: uniqueId(slugify(name), taken), name, type, kerf: DEFAULT_KERF[units], enabled: true, ...DEFAULT_LIMITS[units][type] } as Tool;
}

/** The tools of a new project: the table saw takes the cuts within its limits, the track saw breaks down the full sheets. */
export function defaultTools(units: Units): Tool[] {
  const table = newTool("table-saw", units, new Set());
  return [table, newTool("track-saw", units, new Set([table.id]))];
}
```

In `apps/web/src/screens/Home.tsx`, import `defaultTools` in place of `newTool`, and:

```ts
/** A new project starts with a table saw and a track saw so the plan can be cut at once. */
export function newProject(name: string, units: Units): Project {
  return { ...createProject(name, units), tools: defaultTools(units) };
}
```

In `packages/cli/src/commands/project.ts:33`, import `defaultTools` in place of `newTool`:

```ts
    const project = { ...createProject(name, units), tools: defaultTools(units) };
```

- [ ] **Step 4: Run the whole check**

Run: `npm run check > /tmp/ss-t3.txt 2>&1; echo $?; grep -E "Tests |FAIL|error" /tmp/ss-t3.txt | head -20`
Expected: exit 0. Other tests that pin the old limits of a new tool (for example a CLI `tools add --type table-saw` output, or the Tools tab after **Add tool**) fail only on the new default limits: update those expected values to the Global Constraints values and record a ruling for each file. A test that `tools add --type panel-saw --max-cut 62` gives `maxCut: 62` must still pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -q -m "Start each new project with a table saw and a track saw with sane limits" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Tool choices in the file and the cut analysis

**Files:**
- Modify: `packages/core/src/format/schema.ts` (`ToolChoiceSchema`, `PlanSheetSchema`, `FORMAT_VERSION`, type `CutToolChoice`)
- Modify: `packages/core/src/format/version.ts:2` (`SUPPORTED_MINOR = 3`)
- Modify: `packages/core/src/format/references.ts` (after the `cuts` check)
- Modify: `packages/core/src/sequence/tools.ts` (`ToolLimit`, `toolLimit`, `toolCanCut`)
- Modify: `packages/core/src/sequence/sequence.ts` (`Step`, `collectSheet`, `withCuts`, new `matchesChoice`)
- Modify: `packages/core/src/sequence/text.ts` (the over-limit action, `LIMIT_WORDS`)
- Modify: `packages/core/src/edit/tools.ts` (`setToolChoice`)
- Modify: `packages/core/src/edit/units.ts` (`convertProjectUnits`)
- Regenerate: `schema/cutplan.schema.json` (`npm run schema`), `examples/*.cutplan.json` (`npm run examples`)
- Test: `packages/core/test/sequence/choice.test.ts` (create), version assertions in `packages/core/test/format/schema.test.ts:9`, `packages/core/test/format/parse.test.ts:134`, `packages/cli/test/project.test.ts:63`

**Interfaces:**
- Consumes: `defaultTools` (Task 3); `describeStep` (Task 1).
- Produces:
  ```ts
  export type CutToolChoice = { axis: "x" | "y"; at: number; from: number; to: number; tool: string };
  // PlanSheet.toolChoices?: CutToolChoice[]
  export type ToolLimit = "maxPiece" | "maxRip" | "maxCrosscut" | "maxCut" | "maxStages";
  export function toolLimit(tool: Tool, cut: CutGeometry, limits: boolean): ToolLimit | null;
  // Step gains: recommended: Tool | null; chosen: boolean; overLimit: ToolLimit | null
  export function matchesChoice(cut: Pick<Step, "axis" | "at" | "from" | "to">, choice: CutToolChoice): boolean;
  export function setToolChoice(project: Project, step: Pick<Step, "sheet" | "axis" | "at" | "from" | "to" | "recommended">, tool: string | null): Project;
  export const LIMIT_WORDS: Readonly<Record<ToolLimit, string>>;
  ```

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/sequence/choice.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { convertProjectUnits, defaultTools, describeStep, parseProject, planContext, sequencePlan, serializeProject, setToolChoice, withCuts, type Project } from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

function twoTools(): Project {
  const project = sampleProject();
  project.tools.push({ id: "track", name: "Track saw", type: "track-saw", kerf: 0.125, enabled: true });
  return project;
}

const rip = (project: Project) => sequencePlan(project)[4]!;

describe("tool choices", () => {
  it("uses the chosen tool, and the recommended tool again when the choice is removed", () => {
    const project = twoTools();
    expect(rip(project)).toMatchObject({ tool: { id: "ts" }, recommended: { id: "ts" }, chosen: false, overLimit: null });
    const chosen = setToolChoice(project, rip(project), "track");
    expect(chosen.plan!.sheets[0]!.toolChoices).toEqual([{ axis: "y", at: rip(project).at, from: 0.25, to: 95.75, tool: "track" }]);
    expect(rip(chosen)).toMatchObject({ tool: { id: "track" }, recommended: { id: "ts" }, chosen: true, side: "released", setting: 12 });
    expect(describeStep(planContext(chosen), rip(chosen)).actions[0]).toBe('Mark 12" from the top edge, at the two ends of the cut.');
    expect(sequencePlan(chosen).filter((step) => step.chosen)).toHaveLength(1);
    expect(setToolChoice(chosen, rip(chosen), "ts").plan!.sheets[0]).not.toHaveProperty("toolChoices");
    expect(setToolChoice(chosen, rip(chosen), null).plan!.sheets[0]).not.toHaveProperty("toolChoices");
  });

  it("names the limit that a chosen tool is over and warns first", () => {
    const project = sampleProject();
    project.tools = defaultTools("in");
    expect(sequencePlan(project)[0]).toMatchObject({ tool: { id: "track-saw" }, overLimit: null });
    const chosen = setToolChoice(project, sequencePlan(project)[0]!, "table-saw");
    const step = sequencePlan(chosen)[0]!;
    expect(step).toMatchObject({ tool: { id: "table-saw" }, chosen: true, overLimit: "maxPiece" });
    expect(describeStep(planContext(chosen), step).actions).toEqual(['This cut is over a limit of the Table saw: largest piece 96" × 24".', 'Cut 1/4" off the top edge.']);

    const narrow = twoTools();
    narrow.tools[0] = { id: "ts", name: "Table saw", type: "table-saw", kerf: 0.125, enabled: true, maxRip: 10 };
    expect(rip(narrow)).toMatchObject({ tool: { id: "track" }, recommended: { id: "track" } });
    const forced = setToolChoice(narrow, rip(narrow), "ts");
    expect(rip(forced)).toMatchObject({ tool: { id: "ts" }, overLimit: "maxRip", side: "released" });
    expect(describeStep(planContext(forced), rip(forced)).actions[0]).toBe('This cut is over a limit of the Table saw: widest rip 10".');
  });

  it("ignores a choice of a tool that is turned off, and keeps it in the file", () => {
    const chosen = setToolChoice(twoTools(), rip(twoTools()), "track");
    chosen.tools[1]!.enabled = false;
    expect(rip(chosen)).toMatchObject({ tool: { id: "ts" }, chosen: false });
    expect(withCuts(chosen).plan!.sheets[0]!.toolChoices).toHaveLength(1);
  });

  it("drops a choice that matches no cut when it saves, and warns about an unknown tool", () => {
    const moved = setToolChoice(twoTools(), rip(twoTools()), "track");
    moved.plan!.sheets[0]!.placements[1]!.y = 20;
    moved.plan!.sheets[0]!.placements[0]!.y = 3;
    expect(withCuts(moved).plan!.sheets[0]).not.toHaveProperty("toolChoices");
    const off = setToolChoice(twoTools(), rip(twoTools()), "track");
    off.settings.features.cutOrder = false;
    expect(withCuts(off).plan!.sheets[0]!.toolChoices).toHaveLength(1);
    const unknown = setToolChoice(twoTools(), rip(twoTools()), "track");
    unknown.tools.pop();
    const result = parseProject(serializeProject(unknown));
    expect(result.ok && result.warnings.some((issue) => issue.code === "bad-ref" && issue.path.join(".") === "plan.sheets.0.toolChoices.0.tool")).toBe(true);
  });

  it("converts the choices with the units, and reads a 1.2 file", () => {
    const chosen = setToolChoice(twoTools(), rip(twoTools()), "track");
    const mm = convertProjectUnits(chosen, "mm");
    expect(mm.plan!.sheets[0]!.toolChoices![0]).toMatchObject({ from: 6.35, to: 2432.05, tool: "track" });
    expect(rip(mm)).toMatchObject({ tool: { id: "track" }, chosen: true });
    const old = JSON.parse(serializeProject(sampleProject()));
    old.version = "1.2";
    const result = parseProject(JSON.stringify(old));
    expect(result.ok && result.project.version).toBe("1.3");
  });
});
```

(The moved placements make the first rip start at another `at`; if the rip still has the same `at`, `from`, and `to`, pick another move and record a ruling. The rounding of the mm values follows `convertLength`; if it gives other decimals, use the values it gives. `serializeProject` may call `withCuts`; if it drops the choice with the unknown tool, build the JSON with `JSON.stringify(unknown)` instead.)

Change the current-version assertions: `packages/core/test/format/schema.test.ts:9` and `packages/core/test/format/parse.test.ts:134` from `"1.2"` to `"1.3"`. `packages/cli/test/project.test.ts:63` reads the example file: it becomes `"1.3"` after `npm run examples` in Step 4.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root packages/core test/sequence/choice.test.ts`
Expected: FAIL — `setToolChoice` is not exported.

- [ ] **Step 3: Write the implementation**

`packages/core/src/format/schema.ts`: `export const FORMAT_VERSION = "1.3";`. After `CutSchema`:

```ts
export const ToolChoiceSchema = z
  .object({
    axis: z.enum(["x", "y"]),
    at: z.number(),
    from: z.number(),
    to: z.number(),
    tool: id,
  })
  .loose();
```

In `PlanSheetSchema`, after `cuts`: `toolChoices: z.array(ToolChoiceSchema).optional(),`. After `export type Cut`: `export type CutToolChoice = StripIndex<z.output<typeof ToolChoiceSchema>>;`.

`packages/core/src/format/version.ts:2`: `export const SUPPORTED_MINOR = 3;`.

`packages/core/src/format/references.ts`, after the `(sheet.cuts ?? []).forEach(...)` block:

```ts
    (sheet.toolChoices ?? []).forEach((choice, choiceIndex) => {
      if (!tools.has(choice.tool)) {
        issues.push(
          warningIssue("bad-ref", `A cut on sheet "${sheet.id}" is set to tool "${choice.tool}", which does not exist.`, [...base, "toolChoices", choiceIndex, "tool"]),
        );
      }
    });
```

`packages/core/src/sequence/tools.ts`: replace `toolCanCut` with:

```ts
export type ToolLimit = "maxPiece" | "maxRip" | "maxCrosscut" | "maxCut" | "maxStages";

type TableSaw = Extract<Tool, { type: "table-saw" }>;

function tableRipSide(tool: TableSaw, cut: CutGeometry): SettingSide | null {
  if (measuredSide(cut) === "released" && within(sizeAlong(cut.released, "y"), tool.maxRip)) return "released";
  if (within(sizeAlong(cut.remainder, "y"), tool.maxRip)) return "remainder";
  return null;
}

/** The first limit of the tool that the cut is over, or null when the tool can make the cut. */
export function toolLimit(tool: Tool, cut: CutGeometry, limits: boolean): ToolLimit | null {
  if (!limits) return null;
  switch (tool.type) {
    case "table-saw":
      if (tool.maxPiece && !fitsWithin(cut.piece, tool.maxPiece)) return "maxPiece";
      if (cut.axis === "x") return within(cut.length, tool.maxCrosscut) ? null : "maxCrosscut";
      return tableRipSide(tool, cut) ? null : "maxRip";
    case "track-saw":
    case "circular-saw":
      return within(cut.length, tool.maxCut) ? null : "maxCut";
    case "panel-saw":
      if (!within(cut.length, tool.maxCut)) return "maxCut";
      return tool.maxStages === undefined || cut.stage <= tool.maxStages ? null : "maxStages";
  }
}

export function toolCanCut(tool: Tool, cut: CutGeometry, limits: boolean): SettingSide | null {
  if (toolLimit(tool, cut, limits)) return null;
  if (limits && tool.type === "table-saw" && cut.axis === "y") return tableRipSide(tool, cut);
  return measuredSide(cut);
}
```

`packages/core/src/sequence/sequence.ts`:
- Imports: add `EPSILON` from `../geometry/rect.ts`, `type CutToolChoice` from `../format/schema.ts`, and `toolCanCut, toolLimit, type ToolLimit` from `./tools.ts`.
- In `Step`, after `tool: Tool | null;`:

```ts
  /** The tool that the cut analysis picks; `tool` is another tool when a stored choice sets it. */
  recommended: Tool | null;
  chosen: boolean;
  /** The limit of `tool` that the cut is over, or null. */
  overLimit: ToolLimit | null;
```

- Add:

```ts
export function matchesChoice(cut: Pick<Step, "axis" | "at" | "from" | "to">, choice: CutToolChoice): boolean {
  return cut.axis === choice.axis && Math.abs(cut.at - choice.at) <= EPSILON && Math.abs(cut.from - choice.from) <= EPSILON && Math.abs(cut.to - choice.to) <= EPSILON;
}
```

- In `collectSheet`, before `push`: `const choices = analysis.sheet.toolChoices ?? [];`. In `push`, replace the lines from `const choice = assignTool(...)` to `const side = …;` with:

```ts
    const cutGeometry = { ...geometry, length: to - from };
    const limits = ctx.features.toolLimits;
    const recommended = assignTool(ctx.tools, cutGeometry, limits);
    const stored = choices.find((choice) => matchesChoice({ axis: geometry.axis, at: geometry.at, from, to }, choice));
    const chosen = stored ? ctx.tools.find((tool) => tool.id === stored.tool) : undefined;
    const tool = chosen ?? recommended?.tool ?? null;
    const side = chosen ? (toolCanCut(chosen, cutGeometry, limits) ?? measuredSide(geometry)) : (recommended?.side ?? measuredSide(geometry));
```

  and in the `RawCut` literal, replace `tool: choice?.tool ?? null,` with `tool, recommended: recommended?.tool ?? null, chosen: chosen !== undefined, overLimit: tool ? toolLimit(tool, cutGeometry, limits) : null,`.

- In `withCuts`, replace the `sheets` map with:

```ts
  const sheets = project.plan.sheets.map((sheet, index): PlanSheet => {
    const { cuts: _old, toolChoices, ...rest } = sheet;
    const sheetSteps = steps.filter((step) => step.sheetNumber === index + 1);
    const cuts = sheetSteps.map(toCut);
    const next: PlanSheet = cuts.length > 0 ? { ...rest, cuts } : rest;
    const kept = project.settings.features.cutOrder ? (toolChoices ?? []).filter((choice) => sheetSteps.some((step) => matchesChoice(step, choice))) : (toolChoices ?? []);
    if (kept.length > 0) next.toolChoices = kept;
    return next;
  });
```

  and change its doc comment to: ``/** Returns the project with each sheet's `cuts` set from the sequence, and only the `toolChoices` that match a cut. */``.

`packages/core/src/edit/tools.ts`:

```ts
export function setToolChoice(project: Project, step: Pick<Step, "sheet" | "axis" | "at" | "from" | "to" | "recommended">, tool: string | null): Project {
  if (!project.plan) return project;
  const sheets = project.plan.sheets.map((sheet): PlanSheet => {
    if (sheet.id !== step.sheet) return sheet;
    const { toolChoices, ...rest } = sheet;
    const kept = (toolChoices ?? []).filter((choice) => !matchesChoice(step, choice));
    const choices = tool === null || tool === step.recommended?.id ? kept : [...kept, { axis: step.axis, at: step.at, from: step.from, to: step.to, tool }];
    return choices.length > 0 ? { ...rest, toolChoices: choices } : rest;
  });
  return { ...project, plan: { ...project.plan, sheets } };
}
```

(imports: `type PlanSheet` from `../format/schema.ts`; `matchesChoice, type Step` from `../sequence/sequence.ts`).

`packages/core/src/edit/units.ts`, in the `plan` branch of `convertProjectUnits` (import `type PlanSheet`):

```ts
    const sheets = project.plan.sheets.map((sheet) => {
      const { cuts: _cuts, toolChoices, ...rest } = sheet;
      const next: PlanSheet = { ...rest, placements: sheet.placements.map((placement) => ({ ...placement, x: c(placement.x), y: c(placement.y) })) };
      if (toolChoices) next.toolChoices = toolChoices.map((choice) => ({ ...choice, at: c(choice.at), from: c(choice.from), to: c(choice.to) }));
      return next;
    });
```

`packages/core/src/sequence/text.ts`: import `type Tool` from `../format/schema.ts` and `type ToolLimit` from `./tools.ts`, and add:

```ts
export const LIMIT_WORDS: Readonly<Record<ToolLimit, string>> = {
  maxRip: "widest rip",
  maxCrosscut: "longest crosscut",
  maxPiece: "largest piece",
  maxCut: "longest cut",
  maxStages: "most cut stages",
};

function limitValue(ctx: PlanContext, tool: Tool, limit: ToolLimit): string {
  const values = tool as Partial<Record<"maxRip" | "maxCrosscut" | "maxCut" | "maxStages", number>> & { maxPiece?: { length: number; width: number } };
  if (limit === "maxPiece") return `${formatIn(ctx, values.maxPiece!.length)} × ${formatIn(ctx, values.maxPiece!.width)}`;
  if (limit === "maxStages") return String(values.maxStages);
  return formatIn(ctx, values[limit]!);
}
```

In `describeStep`, make `finish` put the warning first:

```ts
  const finish = (headline: string, stepActions: string[], results: StepResult[]): StepText => {
    const actions =
      step.tool && step.overLimit
        ? [`This cut is over a limit of the ${step.tool.name}: ${LIMIT_WORDS[step.overLimit]} ${limitValue(ctx, step.tool, step.overLimit)}.`, ...stepActions]
        : stepActions;
    return {
      title: `Step ${step.step} · ${headline}`,
      headline,
      method,
      pickUp,
      actions,
      results,
      body: [`Pick up ${pickUp}.`, ...actions.map((action, i) => `${i + 1}. ${action}`), ...results.map(resultSentence)].join(" "),
    };
  };
```

- [ ] **Step 4: Regenerate the schema and the examples, then run the core tests**

Run: `npm run schema && npm run examples && git diff --stat -- schema examples`
Expected: `schema/cutplan.schema.json` gains `toolChoices`; each `examples/*.cutplan.json` changes only its `"version"` line (check with `git diff examples/*.json | grep '^[-+] ' | sort -u`).

Run: `npx vitest run --root packages/core > /tmp/ss-t4.txt 2>&1; echo $?; tail -5 /tmp/ss-t4.txt`
Expected: exit 0.

- [ ] **Step 5: Run the whole check**

Run: `npm run check > /tmp/ss-t4c.txt 2>&1; echo $?; grep -E "Tests |FAIL|error" /tmp/ss-t4c.txt | head -20`
Expected: exit 0. A web or CLI test that builds a `Step` literal by hand fails the typecheck on the three new fields: add `recommended: <the same tool>, chosen: false, overLimit: null` to it.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -q -m "Store a chosen tool for a cut in the plan and apply it in the cut sequence (format 1.3)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The Shop tab: structured step, Tool select, and ticks that stay

**Files:**
- Modify: `apps/web/src/shop/ShopTab.tsx`
- Modify: `apps/web/src/shop/progress.ts` (new `chooseTool`)
- Modify: `apps/web/src/styles.css` (replace `.shop-text` at line 130)
- Test: `apps/web/test/ShopTab.test.tsx`, `apps/web/test/progress.test.ts`

**Interfaces:**
- Consumes: `describeStep`, `resultLabel`, `LIMIT_WORDS` (Tasks 1, 4); `toolLimit`, `setToolChoice`, `sequencePlan` (Task 4); `sheetSvg(..., { focus: true })` (Task 2).
- Produces: `chooseTool(project: Project, steps: readonly Step[], step: Step, tool: string): Project` in `progress.ts`. DOM: `select` labelled "Tool" (option values are tool ids), `p.shop-method`, `p.shop-pickup`, `ol.shop-actions > li`, `ul.shop-results > li` with `span.result-label.<kind>` and a "Go to step N" button for a next result; list buttons `"<n>. <headline>"` (plus `" · <tool>"` when the run has more than one tool); run heading `"Sheet <n> · <tool>"` when the run has one tool.

- [ ] **Step 1: Write the failing tests**

In `apps/web/test/progress.test.ts`, import `chooseTool` from `../src/shop/progress.ts`, `EXAMPLES` from `../src/examples.ts`, and `sequencePlan` from `@opencutplan/core`, and add:

```ts
  it("keeps each tick on its cut when a change of tool moves the steps", () => {
    const parsed = parseProject(EXAMPLES[0]!.text);
    if (!parsed.ok) throw new Error("example did not load");
    const project: Project = { ...parsed.project, settings: { ...parsed.project.settings, orderMode: "setup" } };
    project.tools = [...project.tools, { id: "track", name: "Track saw", type: "track-saw", kerf: project.tools[0]!.kerf, enabled: true }];
    const before = sequencePlan(project);
    const cutKey = (s: (typeof before)[number]) => [s.sheet, s.kind, s.axis, s.at, s.from, s.to].join(",");
    let ticked = project;
    for (const step of before.filter((s) => s.step % 2 === 1)) ticked = setStepDone(ticked, before, step.step, true);
    const moving = before.find((step) => {
      const after = sequencePlan(chooseTool(ticked, before, step, "track"));
      return after.some((s, i) => cutKey(s) !== cutKey(before[i]!));
    });
    expect(moving).toBeDefined();
    const next = chooseTool(ticked, before, moving!, "track");
    const after = sequencePlan(next);
    const tickedCuts = new Set(before.filter((s) => s.step % 2 === 1).map(cutKey));
    expect(readProgress(next)!.done).toEqual(after.filter((s) => tickedCuts.has(cutKey(s))).map((s) => s.step));
    expect(shopState(next, after).stale).toBe(false);
  });

  it("leaves old ticks as they are when they are already out of date", () => {
    const project = sampleProject();
    project.tools.push({ id: "track", name: "Track saw", type: "track-saw", kerf: 0.125, enabled: true });
    const steps = stepsOf(project);
    const ticked = writeProgress(project, { sequence: "0-old", done: [1] });
    const next = chooseTool(ticked, steps, steps[4]!, "track");
    expect(readProgress(next)).toEqual({ sequence: "0-old", done: [1] });
    expect(next.plan!.sheets[0]!.toolChoices).toHaveLength(1);
  });
```

In `apps/web/test/ShopTab.test.tsx`:

1. In "makes a step current from the list and from Previous and Next", change the run heading and the list button names:

```ts
    expect(within(list).getByRole("heading", { name: "Sheet 1 · Table saw", level: 4 })).toBeTruthy();
    await userEvent.click(within(list).getByRole("button", { name: /^3\. Trim 1\/4" off the left edge$/ }));
```

   and change every other list button name in the file (after Task 1 they read `/^Step N · /`) to `/^N\. /`: `sed -E -i '' 's#name: /\^Step ([0-9]+) · /#name: /^\1\\. /#g' apps/web/test/ShopTab.test.tsx`. Do not change the `heading()` checks.

2. Add, in the `describe("ShopTab")` block (import `defaultTools` from `@opencutplan/core`):

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

  it("changes the tool of the current step, keeps the ticks, and marks the recommended tool and the limits", async () => {
    const project = sampleProject();
    project.tools = defaultTools("in");
    const { current } = renderShop(setStepDone(project, analyzeProject(project).steps, 1, true));
    const select = screen.getByLabelText<HTMLSelectElement>("Tool");
    expect(heading()).toMatch(/^Step 2 · /);
    expect([...select.options].map((option) => option.textContent)).toEqual(["Table saw (over its largest piece)", "Track saw (recommended)"]);
    expect(select.value).toBe("track-saw");
    await userEvent.selectOptions(select, "table-saw");
    expect(document.querySelector(".shop-method")?.textContent).toMatch(/^Table saw · trim: /);
    expect(document.querySelector(".shop-actions li")?.textContent).toBe('This cut is over a limit of the Table saw: largest piece 96" × 24".');
    expect(screen.getByRole("checkbox", { name: "Step 1 done" })).toHaveProperty("checked", true);
    expect(readProgress(current().project)?.done).toEqual([1]);
    expect(current().project.plan!.sheets[0]!.toolChoices).toMatchObject([{ axis: "y", tool: "table-saw" }]);
    await userEvent.selectOptions(screen.getByLabelText("Tool"), "track-saw");
    expect(current().project.plan!.sheets[0]).not.toHaveProperty("toolChoices");
    act(() => current().undo());
    expect(current().project.plan!.sheets[0]!.toolChoices).toHaveLength(1);
  });

  it("shows No tool in the Tool list when no tool can make the cut", () => {
    const project = sampleProject();
    project.tools[0] = { id: "ts", name: "Table saw", type: "table-saw", kerf: 0.125, enabled: true, maxPiece: { length: 10, width: 10 } };
    renderShop(project);
    const select = screen.getByLabelText<HTMLSelectElement>("Tool");
    expect(select.value).toBe("");
    expect([...select.options].map((option) => option.textContent)).toEqual(["No tool", "Table saw (over its largest piece)"]);
    expect(document.querySelector(".shop-actions li")?.textContent).toBe("No enabled tool can make this cut. Check the Tools tab.");
  });
```

(With the default tools, step 2 trims the bottom edge of a 96" × 47 3/4" panel: it is over the largest piece of the table saw, so the track saw is recommended. If the first step that is not done is not step 2, change the `heading()` check to the step the test shows and record a ruling.)

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root apps/web test/ShopTab.test.tsx test/progress.test.ts`
Expected: FAIL — `chooseTool` is not exported; no `.shop-method`, no "Tool" select, no "Sheet 1 · Table saw" heading, no `data-piece`.

- [ ] **Step 3: Write the implementation**

`apps/web/src/shop/progress.ts` (import `sequencePlan, setToolChoice, type Step` from `@opencutplan/core`):

```ts
const cutKey = (s: Step) => [s.sheet, s.kind, s.axis, round(s.at), round(s.from), round(s.to)].join(",");

/** Sets the tool of a cut and moves the ticks to the new step numbers of their cuts. Old ticks that are out of date stay as they are. */
export function chooseTool(project: Project, steps: readonly Step[], step: Step, tool: string): Project {
  const state = shopState(project, steps);
  const next = setToolChoice(project, step, tool);
  if (state.stale || state.done.size === 0) return next;
  const ticked = new Set(steps.filter((s) => state.done.has(s.step)).map(cutKey));
  const after = sequencePlan(next);
  return writeProgress(next, { sequence: sequenceKey(after), done: after.filter((s) => ticked.has(cutKey(s))).map((s) => s.step) });
}
```

`apps/web/src/shop/ShopTab.tsx`:

- Imports from `@opencutplan/core`: add `LIMIT_WORDS`, `resultLabel`, `toolLimit`, `type Tool`. From `./progress.ts`: add `chooseTool`.
- Add, above `ShopTab`:

```tsx
function toolOption(step: Step, tool: Tool, limits: boolean): string {
  if (tool.id === step.recommended?.id) return `${tool.name} (recommended)`;
  const limit = toolLimit(tool, { ...step, length: step.to - step.from }, limits);
  return limit ? `${tool.name} (over its ${LIMIT_WORDS[limit]})` : tool.name;
}
```

- Replace `<p className="shop-text">{text.body}</p>` with:

```tsx
          {ctx.tools.length > 0 && (
            <label className="shop-tool">
              Tool
              <select value={step.tool?.id ?? ""} onChange={(event) => edit((p) => chooseTool(p, steps, step, event.target.value))}>
                {step.tool === null && <option value="">No tool</option>}
                {ctx.tools.map((tool) => (
                  <option key={tool.id} value={tool.id}>
                    {toolOption(step, tool, ctx.features.toolLimits)}
                  </option>
                ))}
              </select>
            </label>
          )}
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
- Replace the `runs.map(...)` block with:

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

`apps/web/src/styles.css`: replace the `.shop-text` rule with:

```css
.shop-tool { display: inline-flex; gap: 8px; align-items: center; font-size: 14px; margin: 0 0 4px; }
.shop-method { margin: 0 0 8px; font-size: 13px; }
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

Then `grep -rn "shop-text" apps/web` — expected: no match.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run --root apps/web > /tmp/ss-t5.txt 2>&1; echo $?; tail -5 /tmp/ss-t5.txt`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -q -m "Show the structured step, a Tool list, and the piece outline on the Shop tab" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The printed cut sequence

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

(Read the current `li` markup first; if the tick box is not a `.print-box` element directly in the `li`, adapt the two selectors to the markup and record a ruling.)

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run --root apps/web test/print.test.tsx`
Expected: FAIL — the `li` has one line with the title and the body.

- [ ] **Step 3: Write the implementation**

In `SequencePages`, import `resultSentence` from `@opencutplan/core`, and replace the content of each step `li` after the tick box with:

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

Run: `npx vitest run --root apps/web test/print.test.tsx test/Workspace.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -q -m "Print each cut step as the title, the actions, and the results" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The CLI: `report sequence` and `layout tool`

**Files:**
- Modify: `packages/cli/src/commands/report.ts` (the `report sequence` command)
- Modify: `packages/cli/src/commands/layout.ts` (new `layout tool` command, `layoutGroup.commands`)
- Test: `packages/cli/test/report-export.test.ts` ("gives the cut steps with their text, for all sheets or one"), `packages/cli/test/layout.test.ts`

**Interfaces:**
- Consumes: `describeStep`, `resultSentence` (Task 1); `setToolChoice`, `Step.recommended/chosen/overLimit` (Task 4).

- [ ] **Step 1: Write the failing tests**

In `packages/cli/test/report-export.test.ts`, in "gives the cut steps with their text, for all sheets or one", after the first `toMatchObject` on `all.steps[0]`, add:

```ts
    expect(all.steps[0]).toMatchObject({
      headline: 'Trim 1/4" off the top edge',
      method: "Table saw · trim: a cut that removes the rough factory edge",
      pickUp: 'the full sheet 60" × 60" (sheet 1)',
      actions: ['Cut 1/4" off the top edge.'],
      recommendedTool: "table-saw",
      chosen: false,
      overLimit: null,
    });
    expect(all.steps[0]).not.toHaveProperty("recommended");
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

(If the first trim of this example is not the top edge, correct the expected edge from the output and record a ruling.)

In `packages/cli/test/layout.test.ts`, add:

```ts
  it("sets the tool of one cut and goes back to the recommended tool", async () => {
    const io = withExamples();
    await cli(["tools", "add", SHELF, "--type", "track-saw"], io);
    const set = await cli(["layout", "tool", SHELF, "5", "--tool", "track-saw", "--json"], io);
    expect(set.code).toBe(0);
    expect(set.json()).toMatchObject({ step: 5, sheet: "s1", tool: "track-saw", recommendedTool: "table-saw" });
    expect(set.file(SHELF).plan!.sheets[0]!.toolChoices).toMatchObject([{ tool: "track-saw" }]);
    const step = (await cli(["report", "sequence", SHELF, "--json"], io)).json().steps[4];
    expect(step).toMatchObject({ tool: "track-saw", chosen: true, recommendedTool: "table-saw" });
    const back = await cli(["layout", "tool", SHELF, "5", "--recommended", "--json"], io);
    expect(back.json()).toMatchObject({ tool: "table-saw" });
    expect(back.file(SHELF).plan!.sheets[0]).not.toHaveProperty("toolChoices");
    expect((await cli(["layout", "tool", SHELF, "5", "--tool", "nope", "--json"], io)).json().error.code).toBe("not-found");
    expect((await cli(["layout", "tool", SHELF, "999", "--tool", "track-saw", "--json"], io)).json().error.code).toBe("not-found");
    expect((await cli(["layout", "tool", SHELF, "5", "--json"], io)).code).toBe(2);
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root packages/cli test/report-export.test.ts test/layout.test.ts`
Expected: FAIL — the text output is the old two lines; `recommendedTool` is missing; `layout tool` is an unknown command.

- [ ] **Step 3: Write the implementation**

`packages/cli/src/commands/report.ts`, in `report sequence`: import `resultSentence` next to `describeStep`, and replace the `steps` map and the `text` with:

```ts
      .map((step) => {
        const { tool, recommended, releasedPlacements: _released, remainderPlacements: _remainder, ...rest } = step;
        return { ...rest, tool: tool?.id ?? null, toolName: tool?.name ?? null, recommendedTool: recommended?.id ?? null, ...describeStep(analysis.context, step) };
      });
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

In its `output` string, replace `tool (id or null), toolName,` with `tool (id or null), toolName, recommendedTool (id or null), chosen, overLimit (maxPiece|maxRip|maxCrosscut|maxCut|maxStages or null),` and replace `title, body }]` with `title, headline, method, pickUp, actions [string], results [{ kind (part|next|offcut|waste), where, size, parts [string], next }], body }]`.

`packages/cli/src/commands/layout.ts`: import `setToolChoice` from `@opencutplan/core` (`findById`, `integerValue`, `str`, `usageError`, `analyzeProject` are already imported). Add before `layoutGroup`:

```ts
const toolCommand: CommandSpec = {
  name: "layout tool",
  summary: "Choose the tool for one cut.",
  description:
    "Choose the tool for the cut of one step, in the current shop order (see report sequence). The file stores the choice with the sheet; the choice applies while the cut exists. --recommended removes the choice, so the cut analysis picks the tool again. A tool over one of its limits is allowed; report sequence names the limit.",
  args: [FILE_ARG, { name: "step", description: "The step number, as in report sequence." }],
  options: [
    { name: "tool", type: "string", value: "<id>", description: "The tool id." },
    { name: "recommended", type: "boolean", description: "Remove the choice and use the recommended tool." },
    ...OUTPUT_OPTIONS,
  ],
  examples: [
    { command: `${PROGRAM} layout tool shelf.cutplan.json 5 --tool track-saw`, description: "Cut step 5 with the track saw." },
    { command: `${PROGRAM} layout tool shelf.cutplan.json 5 --recommended`, description: "Go back to the recommended tool for step 5." },
  ],
  output: "step, sheet, tool (the tool id of the step after the change, or null), recommendedTool, changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, options, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const toolId = str(options, "tool");
    const recommended = options.recommended === true;
    if ((toolId === undefined) === !recommended) throw usageError("Give --tool <id> or --recommended.", "missing-option", { option: "tool" });
    const steps = analyzeProject(loaded.project).steps;
    const number = integerValue(args[1]!, "step", 1);
    const step = steps.find((s) => s.step === number);
    if (!step) throw usageError(`No step ${number}. The plan has ${steps.length} steps.`, "not-found", { step: number });
    if (toolId !== undefined) findById(loaded.project.tools, toolId, "tool");
    const next = setToolChoice(loaded.project, step, toolId ?? null);
    const after = analyzeProject(next).steps.find((s) => s.sheet === step.sheet && s.axis === step.axis && s.at === step.at && s.from === step.from && s.to === step.to);
    return finishMutation(invocation, loaded, next, {
      summary: `Step ${number} uses ${after?.tool?.name ?? "no tool"}${after?.chosen ? "" : " (recommended)"}.`,
      data: { step: number, sheet: step.sheet, tool: after?.tool?.id ?? null, recommendedTool: step.recommended?.id ?? null },
    });
  },
};
```

and add `toolCommand` at the end of `layoutGroup.commands`. (Read how `project.ts` reads a boolean option — `flag(options, …)` — and use the same helper; if `missing-option` is not a code that `usageError` accepts, use the code the other commands use for a missing option and record a ruling.)

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run --root packages/cli > /tmp/ss-t7.txt 2>&1; echo $?; tail -5 /tmp/ss-t7.txt`
Expected: exit 0. A help test that lists the `layout` commands or snapshots `report sequence --help` fails only on the new command or the new output string: update it to the new text.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -q -m "Give report sequence the structured step and add layout tool to choose the tool of a cut" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: e2e and docs

**Files:**
- Modify: `apps/web/e2e/plan.e2e.ts` (the Shop part, near line 76)
- Modify: `docs/cut-analysis.md:59-89`, `docs/web-app.md` (Tools and Shop sections), `docs/cli.md` (the `layout` table and line 275), `docs/format.md` (title, `version`, the Plan section)

- [ ] **Step 1: Add the e2e checks**

After `await expect(page.getByRole("heading", { level: 2 })).toHaveText(/^Step 1 · /);` add:

```ts
  await expect(page.locator(".shop-pickup")).toHaveText(/^Pick up the full sheet 96" × 48" \(sheet 1\)\.$/);
  await expect(page.locator(".shop-actions li").first()).toHaveText(/\.$/);
  await expect(page.locator(".shop-diagram [data-piece]")).toHaveCount(1);
```

After `await expect(page.getByRole("checkbox", { name: "Step 1 done" })).toBeChecked();` (after the reload) add:

```ts
  const tool = page.getByLabel("Tool", { exact: true });
  const other = (await tool.inputValue()) === "track-saw" ? "table-saw" : "track-saw";
  await tool.selectOption(other);
  await expect(page.locator(".shop-method")).toHaveText(new RegExp(`^${other === "track-saw" ? "Track" : "Table"} saw · `));
  await expect(page.getByRole("checkbox", { name: "Step 1 done" })).toBeChecked();
  await expect.poll(() => savedData(page)).toContain('"toolChoices"');
```

- [ ] **Step 2: Run e2e**

Run: `npm run e2e -w @opencutplan/web > /tmp/ss-e2e.txt 2>&1; echo $?; grep -E "passed|failed" /tmp/ss-e2e.txt`
Expected: exit 0, 3 passed.

- [ ] **Step 3: Update the docs**

`docs/cut-analysis.md`:
- After the tool rules table (line 62), add:

```markdown
A new project has a table saw (largest piece 96" × 24", widest rip 24", longest crosscut 24"; 2440 × 610, 610, and
610 mm) and then a track saw (longest cut 110", 2800 mm, for a 118" or 3000 mm rail). So the track saw breaks down
full sheets, and the table saw cuts the pieces that fit it.

A sheet can store a chosen tool for a cut (`toolChoices`). The step then uses that tool, even when the cut is over one
of its limits; `overLimit` names the limit, and the step text warns first. `recommended` is the tool that the rules
above pick, and `chosen` is true when a stored choice sets the tool. A choice of a tool that is turned off has no
effect.
```

- Replace the example and the paragraph after `` `describeStep(context, step)` gives the shop text, for example: `` with:

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

`docs/web-app.md`:
- In the Tools section, after the first paragraph, add: `A new project starts with a table saw and a track saw, with limits that send the breakdown of full sheets to the track saw. **Add tool** gives a new table saw or track saw the same limits.`
- Replace the first Shop bullet (`- The current step shows its text …`) with:

```markdown
- The current step shows its title, a **Tool** list, the tool and the kind of cut, the piece to pick up, numbered
  actions, and a result for each side of the cut: **Part**, **Next** (with **Go to step N**), **Offcut**, or
  **Waste**. On the drawing, the piece to pick up has an outline and the rest of the sheet is pale; the current cut
  is thick and filled, and the cuts that are done are grey.
- **Tool** changes the tool of the current cut. The recommended tool has "(recommended)"; a tool that is over one of
  its limits for the cut says which limit, and the first action warns about it. The file keeps the choice. The ticks
  stay on their cuts.
- The list shows each step as its number and what it does. When all the steps of a sheet use one tool, the sheet
  heading names the tool; otherwise each step names its tool.
```

`docs/cli.md`:
- In the `layout` table, after `layout remove-empty`, add: ``| `layout tool <file> <step>` | Chooses the tool for one cut. `--recommended` goes back to the recommended tool. | `opencutplan layout tool shelf.cutplan.json 5 --tool track-saw` |``
- Line 275: change `# .steps[].title and .body` to `# .steps[].title, .actions, .results, .tool, and .chosen`.
- Where `opencutplan new` is described, if the text says it adds one table saw, change it to "a table saw and a track saw".

`docs/format.md`:
- Title: `version 1.3`; the `version` row: `this document describes "1.3"`.
- In the Plan section, change `placements`, and optional `cuts`. to `placements`, optional `cuts`, and optional `toolChoices` (added in 1.3).`, and after the **Cut.** paragraph add:

```markdown
**Tool choice (added in 1.3).** `axis`, `at`, `from`, and `to` (the same values as the cut they belong to) and `tool`
(a tool id). The cut of the sheet with the same axis, position, and extent uses that tool, when the tool is enabled.
A writer keeps only the choices that match a cut. A choice with an unknown tool is a warning, like a cut with an
unknown tool.
```

- In the list of invalid references in the Plan section, change `or a cut with an unknown tool)` to `a cut with an unknown tool, or a tool choice with an unknown tool)`.

- [ ] **Step 4: Run the full check**

Run: `npm run check > /tmp/ss-check.txt 2>&1; echo $?; grep -E "Tests |error" /tmp/ss-check.txt`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -q -m "Check the structured step and the tool choice in e2e and describe them in the docs" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Finish

- Look at the Shop tab in a browser (the preview build of the worktree, a new project with the default tools): one track saw trim, one table saw crosscut, and a change of tool; check the layout at 1440 × 900 and 390 × 844.
- Final review, then from the main repo: `git merge --ff-only shop-steps`, `npm run check`, `npm run e2e -w @opencutplan/web`, `git worktree remove worktrees/shop-steps`, `git branch -d shop-steps`.
