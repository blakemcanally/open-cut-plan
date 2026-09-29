# OpenCutPlan Phase 5 — Outputs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the outputs: a core SVG drawing of each sheet and the label sheet layouts; in the web app, the Shop tab (a checklist of the cut sequence with saved progress), the Reports tab (shopping list, offcuts, labels, exports), printing of sheet diagrams, the cut sequence, the shopping list, and labels; Playwright end-to-end tests and a CI workflow.

**Architecture:** Core gets `sheetSvg` (a pure string builder) and moves the drawing colours out of the web app, so the SVG export, the printed diagrams, and the Shop view draw sheets the same way. Shop progress lives in the project (`extensions["opencutplan.app"].progress`) as a fingerprint of the steps plus the ticked step numbers, so a tick is a normal undoable edit. Printing renders the chosen output into a `.print-root` element on `document.body`, calls `window.print()` once, and removes it on `afterprint`; print CSS hides the app.

**Tech Stack:** as in phase 4, plus `@playwright/test` 1.63.0 (Chromium) for the end-to-end tests.

**Spec:** `docs/superpowers/specs/2026-09-27-opencutplan-design.md` (§7.1 screens, §7.3 shop view, §7.4 accessibility, §8 feature switches, §9 outputs, §11 tests, §12 phase 5).

## Global Constraints

- Add exactly one dependency: `@playwright/test` 1.63.0 in `apps/web` devDependencies (Task 6), pinned. Add no others.
- ESM only. Relative imports use the `.ts` / `.tsx` extension. Only erasable TypeScript syntax. The web app imports core only from `"@opencutplan/core"`, never a deep path.
- Core stays pure: no DOM, no React. `sheetSvg` returns a string, and every piece of text in it goes through `escapeXml`, because the web app puts it in the page with `dangerouslySetInnerHTML`.
- Single source of truth (spec §3): the app state is one `Project`. Shop progress is stored in the project and changed only through `store.edit`, so it is undoable and autosaved. Steps, labels, offcuts, and the shopping list come from `analyzeProject` and are never stored.
- Validation and stale progress never block editing (spec §10, §7.3).
- Accessibility (spec §7.4): every action works from the keyboard; controls have accessible names; colour is never the only signal (cut numbers and "stage N" text go with the stage colours; ↔ ↕ ⟂ go with the grain stripes).
- The Shop tab works on a phone (spec §7.4): one column below 800 px.
- UI text is plain English, short sentences, one idea each. Copy the strings in this plan exactly; the tests match them.
- Comments: default to none. Only a comment that carries information the code cannot.
- Commit after every task. Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` after a blank line (use two `-m` flags exactly as shown).
- The repo stays local. Do not add a git remote or push (Block policy; spec §13). The CI workflow file is added but never run from here.

## Review Focus

1. **Stale shop progress** — the user ticks steps, then an edit changes the cut sequence: the old ticks stop showing, a banner offers Start over and Keep my ticks, and editing goes on. Pinned in Task 3 (`offers to start over or keep the ticks when the steps changed`, `marks the ticks stale when the sequence changes…`).
2. **Save offcuts twice, or two offcuts of the same size** — each offcut is added to stock once, and two equal offcuts count separately. Pinned in Task 5 (`saves each offcut to stock once…`, `counts two offcuts of the same size separately`).
3. **A part name with markup or quotes** (`<img onerror…>`, `30"`) in an SVG that the page inlines: it is escaped. Pinned in Task 1 (`escapes names so that they cannot add markup`).
4. **A sheet too large for any standard scale** (a 20 m strip): the print says "Not to scale" and the drawing fills the box. Pinned in Task 4 (`fills the box and has no scale when even 1:50 is too large`).
5. **React StrictMode runs effects twice in development**: the print dialog opens once per job, not twice. Pinned in Task 4 (`prints one page per sheet outside the app root, once, …`, rendered in `<StrictMode>`).

## Decisions

These choices go beyond the spec's text. Task 7 records the user-visible ones in the spec and in `docs/web-app.md`.

- One drawing builder: core `sheetSvg(ctx, sheet, steps, options)` feeds the SVG export, the printed diagrams, and the Shop view. It draws a margin of min(length, width)/30 past each sheet edge (`sheetSvgExtent`), so the numbers on edge cuts are not clipped; the default `width`/`height` are that extent in project units. `idPrefix` keeps pattern ids unique when two drawings of one sheet are in the same page (the Shop view uses `shop`, print uses `print`).
- The colour helpers (`groupColors`, `stageColor`, `NO_GROUP_COLOR`, `STAGE_COLORS`) move from `apps/web/src/layout/colors.ts` to `packages/core/src/reports/colors.ts`.
- Label sheets are data in core (`LABEL_LAYOUTS`): Avery 5160, Avery L7160, and a 4 × 2 in thermal label. `labelPages` fills from a start position, row by row, and clamps the start to the page.
- Shop progress is `{ sequence, done }`: `sequence` is an FNV-1a fingerprint of each step's sheet, kind, axis, position, extent, and tool. When it differs from the current steps, the ticks are stale: they do not show, and the banner offers **Start over** (clear) or **Keep my ticks** (store the same step numbers for the new fingerprint). This is the spec's "resets progress after a confirmation".
- The current Shop step is the first step that is not done, until the user picks one. **Mark done** moves to the next step that is not done. A tick in the list keeps the current step.
- Printing uses one element on `document.body` for the job, with an inline `@page` rule: sheet diagrams landscape with 12 mm margins, labels at the label sheet's page size with no margin, the rest portrait with 15 mm margins. `window.print()` runs once per job (a ref guards against StrictMode's second effect run), and the job ends on `afterprint`.
- Sheet diagrams print at the largest of 1:1, 1:2, 1:4, 1:5, 1:8, 1:10, 1:12, 1:16, 1:20, 1:25, 1:50 that fits the box, or "Not to scale". The key goes below the drawing (a 250 × 130 mm box) or beside it (190 × 160 mm), whichever gives the larger scale.
- Money uses `Intl.NumberFormat` with the project currency, and falls back to `12.50 XYZ` for a code the browser does not know.
- **Save offcuts to stock** adds only the offcuts that are not in stock yet: stock of kind `offcut` with the same name, material, and size counts as saved, once each.
- Export file names start with the project name made safe (`fileBase`): `<name>-parts.csv`, `<name>-stock.csv`, `<name>-sheet-N.svg`.
- The Playwright tests run with `npm run e2e`, not in `npm run check`. CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm run check`, then the Playwright tests. There is no separate lint step: TypeScript's strict mode is the lint, and the schema check is a core test.

## File Structure

| File | Responsibility |
|---|---|
| `packages/core/src/reports/colors.ts` | Group and stage colours (moved from the web app) |
| `packages/core/src/reports/svg.ts` | `sheetSvg`, `sheetSvgExtent`, `escapeXml` |
| `packages/core/src/reports/labelSheets.ts` | Label sheet layouts and `labelPages` |
| `apps/web/src/shop/progress.ts` | The progress model: fingerprint, read, write, stale state, tick, keep |
| `apps/web/src/shop/ShopTab.tsx` | The Shop tab |
| `apps/web/src/print/scale.ts` | Standard print scales and the key position |
| `apps/web/src/print/PrintView.tsx` | `PrintJob` and the print pages for each job |
| `apps/web/src/reports/money.ts` | Money and percent text |
| `apps/web/src/reports/ShoppingTables.tsx` | The shopping list tables (Reports tab and print) |
| `apps/web/src/reports/offcuts.ts` | Which offcuts are not in stock yet |
| `apps/web/src/reports/ReportsTab.tsx` | The Reports tab |
| `apps/web/src/screens/Workspace.tsx` | The Shop and Reports tabs, and the print job |
| `apps/web/playwright.config.ts`, `apps/web/e2e/*` | End-to-end tests |
| `.github/workflows/ci.yml` | CI |

Tasks create new files in full. For a file that already exists, a task gives a unified diff: save the diff block to a file and apply it with `git apply`. Extract every code block with `sed -n 'START,ENDp'` from the task brief rather than retyping it: the files contain non-ASCII text (`×`, `↔`, `⟂`, `☐`) that must stay byte for byte.

Run one package's tests with `npx vitest run --root packages/core <files>` or `npx vitest run --root apps/web <files>`, and everything with `npm run check` from the repo root.

---

### Task 1: Sheet drawings and colours in core

**Files:**
- Move: `apps/web/src/layout/colors.ts` → `packages/core/src/reports/colors.ts` (with one import change)
- Create: `packages/core/src/reports/svg.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `apps/web/src/layout/SheetView.tsx`
- Modify: `apps/web/src/layout/Tray.tsx`
- Modify: `apps/web/src/layout/LayoutTab.tsx`
- Test: `packages/core/test/reports/svg.test.ts`

**Interfaces:**
- Consumes: Nothing from earlier tasks. Core already has `PlanContext`, `SheetAnalysis`, `Step`, `copyLabel`, `formatSize`, `grainOk`, `stockLabel`, `usableRect`, `analyzeProject`.
- Produces (new or changed exports):
  - `packages/core/src/index.ts` re-exports the new core modules, so the web app imports them from `@opencutplan/core`.
  - `packages/core/src/reports/colors.ts`: `const NO_GROUP_COLOR = "#d9d4c7";`; `const STAGE_COLORS = ["#c0392b", "#1a5fd0", "#7a4bb5", "#1e8449", "#b9770e"];`; `function groupColors(project: Project): Map<string, string>`; `function stageColor(stage: number): string`
  - `packages/core/src/reports/svg.ts`: `interface SheetSvgOptions`; `function escapeXml(text: string): string`; `interface SvgExtent`; `function sheetSvgExtent(sheet: SheetAnalysis): SvgExtent`; `function sheetSvg(ctx: PlanContext, sheet: SheetAnalysis, steps: readonly Step[], options: SheetSvgOptions = {}): string`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/reports/svg.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { analyzeProject, escapeXml, groupColors, sheetSvg, sheetSvgExtent, stageColor, type Project } from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

function drawn(project: Project, options?: Parameters<typeof sheetSvg>[3]) {
  const analysis = analyzeProject(project);
  return { analysis, svg: sheetSvg(analysis.context, analysis.sheets[0]!, analysis.steps, options) };
}

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

describe("sheetSvg", () => {
  it("draws the sheet at its real size with one group per part and one numbered cut per step", () => {
    const { analysis, svg } = drawn(sampleProject());
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1.6 -1.6 99.2 51.2" width="99.2in" height="51.2in"')).toBe(true);
    expect(svg).toContain('<title>Sheet 1: Plywood 3/4 96&quot; × 48&quot;</title>');
    expect(count(svg, /data-part="/g)).toBe(2);
    expect(svg).toContain('data-part="side#0"');
    expect(count(svg, /data-step="/g)).toBe(analysis.steps.length);
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("names each part with its size and a grain arrow, and marks a part across the grain", () => {
    const project = sampleProject();
    project.plan!.sheets[0]!.placements[1]!.rotated = true;
    const { svg } = drawn(project);
    expect(svg).toContain(">Side 1 ↔</text>");
    expect(svg).toContain('>30&quot; × 12&quot;</text>');
    expect(svg).toContain(">Side 2 ↕ ⟂</text>");
  });

  it("uses millimetres for a millimetre project", () => {
    const project = sampleProject();
    project.project.units = "mm";
    expect(drawn(project).svg).toContain('width="99.2mm" height="51.2mm"');
  });

  it("draws a margin around the sheet so that edge cuts show in full", () => {
    const { analysis } = drawn(sampleProject());
    expect(sheetSvgExtent(analysis.sheets[0]!)).toEqual({ margin: 1.6, length: 99.2, width: 51.2 });
  });

  it("starts the pattern ids with the prefix it is given", () => {
    const { svg } = drawn(sampleProject(), { idPrefix: "shop" });
    expect(svg).toContain('<pattern id="shop-s1-h"');
    expect(svg).toContain('fill="url(#shop-s1-h)"');
    expect(svg).not.toContain("ocp-s1");
  });

  it("takes the width and height it is given", () => {
    expect(drawn(sampleProject(), { width: "200mm", height: "100mm" }).svg).toContain('width="200mm" height="100mm"');
  });

  it("escapes names so that they cannot add markup", () => {
    const project = sampleProject();
    project.parts[0]!.name = `<img src=x onerror="alert(1)"> & 'b'`;
    const { svg } = drawn(project);
    expect(svg).not.toContain("<img");
    expect(svg).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &apos;b&apos; 1");
  });

  it("colours parts by group and leaves out the grain when the feature is off", () => {
    const project = sampleProject();
    project.parts[0]!.group = "Case";
    project.settings.features.grain = false;
    const { svg } = drawn(project, { colors: groupColors(project) });
    expect(svg).toContain(`fill="${groupColors(project).get("Case")}"`);
    expect(svg).not.toContain("<pattern");
    expect(svg).toContain(">Side 1</text>");
  });

  it("highlights one step, greys the steps that are done, and can leave out the cuts", () => {
    const { analysis, svg } = drawn(sampleProject(), { highlight: 2, done: new Set([1, 2]) });
    expect(svg).toMatch(/data-step="2" data-highlight="true"/);
    expect(svg).toMatch(/data-step="1" data-done="true"/);
    expect(svg).not.toMatch(/data-step="2"[^>]*data-done/);
    expect(svg).toContain(`stroke="${stageColor(analysis.steps[2]!.stage)}"`);
    expect(drawn(sampleProject(), { showCuts: false }).svg).not.toContain("data-step");
  });
});

describe("escapeXml", () => {
  it("escapes the five XML characters", () => {
    expect(escapeXml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;");
  });
});

describe("groupColors", () => {
  it("gives each group a colour in the order the groups first appear", () => {
    const project = sampleProject();
    project.parts.push({ ...project.parts[0]!, id: "a", group: "B" }, { ...project.parts[0]!, id: "b", group: "A" }, { ...project.parts[0]!, id: "c", group: "B" });
    expect([...groupColors(project).keys()]).toEqual(["B", "A"]);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root packages/core test/reports/svg.test.ts`

Expected: FAIL — the new modules or exports do not exist yet (`Failed to resolve import`, `is not a function`, or a missing element).

- [ ] **Step 3: Write the code**

Move the file with `git mv apps/web/src/layout/colors.ts packages/core/src/reports/colors.ts`, then apply this diff to it (`git apply <file>`):

```diff
--- a/packages/core/src/reports/colors.ts
+++ b/packages/core/src/reports/colors.ts
@@ -1,4 +1,4 @@
-import type { Project } from "@opencutplan/core";
+import type { Project } from "../format/schema.ts";
 
 const PALETTE = ["#9cc3e6", "#f2c27b", "#a8d5a2", "#e6a6c7", "#c7b8ea", "#f4a582", "#b8e0d2", "#e8d27a"];
 export const NO_GROUP_COLOR = "#d9d4c7";
```

Create `packages/core/src/reports/svg.ts`:

```ts
import { copyLabel, formatSize, grainOk, stockLabel, usableRect, type PlanContext } from "../plan/context.ts";
import type { SheetAnalysis } from "../plan/sheets.ts";
import type { Step } from "../sequence/sequence.ts";
import { NO_GROUP_COLOR, stageColor } from "./colors.ts";

export interface SheetSvgOptions {
  /** Fill colour for each part group; see `groupColors`. */
  colors?: ReadonlyMap<string, string>;
  /** The `width` and `height` attributes. They default to the real size of `sheetSvgExtent`, such as `99.2in` and `51.2in` for a 96 × 48 sheet. */
  width?: string;
  height?: string;
  /** Defaults to true. */
  showCuts?: boolean;
  /** A step number to draw stronger than the others. */
  highlight?: number | null;
  /** Step numbers to draw as done. */
  done?: ReadonlySet<number>;
  /** Starts every element id. Give each drawing in one page its own prefix, or the drawings share their patterns. Defaults to `ocp`. */
  idPrefix?: string;
}

const DONE_COLOR = "#9a9a9a";

export function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function num(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

export interface SvgExtent {
  /** Space past each sheet edge, so that the numbers on edge cuts are not clipped. */
  margin: number;
  length: number;
  width: number;
}

/** The area `sheetSvg` draws, in project units: the sheet and a margin on every side. */
export function sheetSvgExtent(sheet: SheetAnalysis): SvgExtent {
  const margin = Math.min(sheet.stock.length, sheet.stock.width) / 30;
  return { margin, length: sheet.stock.length + 2 * margin, width: sheet.stock.width + 2 * margin };
}

/** A standalone SVG drawing of one sheet in project units: parts, grain, trim, and numbered cut lines. */
export function sheetSvg(ctx: PlanContext, sheet: SheetAnalysis, steps: readonly Step[], options: SheetSvgOptions = {}): string {
  const { stock } = sheet;
  const number = sheet.index + 1;
  const extent = sheetSvgExtent(sheet);
  const base = extent.margin;
  const material = ctx.materials.get(stock.material);
  const grained = ctx.features.grain && material?.grained === true;
  const prefix = `${options.idPrefix ?? "ocp"}-s${number}`;
  const width = options.width ?? `${num(extent.length)}${ctx.units}`;
  const height = options.height ?? `${num(extent.width)}${ctx.units}`;
  const out: string[] = [];

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(-base)} ${num(-base)} ${num(extent.length)} ${num(extent.width)}" width="${width}" height="${height}" font-family="Helvetica, Arial, sans-serif">`,
    `<title>${escapeXml(`Sheet ${number}: ${stockLabel(ctx, stock)}`)}</title>`,
  );
  if (grained) {
    const size = num(base * 0.4);
    out.push(
      "<defs>",
      `<pattern id="${prefix}-h" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><line x1="0" y1="${size}" x2="${size}" y2="${size}" stroke="#00000022" stroke-width="${num(base * 0.04)}"/></pattern>`,
      `<pattern id="${prefix}-v" width="${size}" height="${size}" patternUnits="userSpaceOnUse"><line x1="${size}" y1="0" x2="${size}" y2="${size}" stroke="#00000022" stroke-width="${num(base * 0.04)}"/></pattern>`,
      "</defs>",
    );
  }
  out.push(`<rect x="0" y="0" width="${num(stock.length)}" height="${num(stock.width)}" fill="#efe3c8" stroke="#333" stroke-width="${num(base * 0.08)}"/>`);
  if (grained) out.push(`<rect x="0" y="0" width="${num(stock.length)}" height="${num(stock.width)}" fill="url(#${prefix}-h)"/>`);
  if (sheet.trim > 0) {
    const usable = usableRect(ctx, stock);
    out.push(
      `<rect x="${num(usable.x)}" y="${num(usable.y)}" width="${num(usable.length)}" height="${num(usable.width)}" fill="none" stroke="#00000066" stroke-width="${num(base * 0.04)}" stroke-dasharray="${num(base * 0.3)} ${num(base * 0.2)}"/>`,
    );
  }

  for (const item of sheet.items) {
    const placement = sheet.sheet.placements[item.index]!;
    const part = ctx.parts.get(placement.part)!;
    const { rect } = item;
    const fill = (part.group !== undefined && options.colors?.get(part.group)) || NO_GROUP_COLOR;
    const striped = grained && part.grain !== "none";
    const horizontal = (part.grain === "length") !== placement.rotated;
    const cross = striped && !grainOk(ctx, part, placement.rotated);
    const name = `${copyLabel(part, placement.copy)}${striped ? (horizontal ? " ↔" : " ↕") : ""}${cross ? " ⟂" : ""}`;
    const size = formatSize(ctx, rect);
    out.push(
      `<g data-part="${escapeXml(`${placement.part}#${placement.copy}`)}" transform="translate(${num(rect.x)} ${num(rect.y)})">`,
      `<rect width="${num(rect.length)}" height="${num(rect.width)}" fill="${escapeXml(fill)}"/>`,
    );
    if (striped) out.push(`<rect width="${num(rect.length)}" height="${num(rect.width)}" fill="url(#${prefix}-${horizontal ? "h" : "v"})"/>`);
    out.push(`<rect width="${num(rect.length)}" height="${num(rect.width)}" fill="none" stroke="#333" stroke-width="${num(base * 0.05)}"/>`);
    const font = Math.min(base, rect.width / 3, rect.length / (0.62 * Math.max(name.length, size.length) + 1));
    if (font >= base * 0.3) {
      const cx = num(rect.length / 2);
      const twoLines = rect.width > 3 * font;
      const y = rect.width / 2 - (twoLines ? font * 0.55 : 0);
      out.push(`<text x="${cx}" y="${num(y)}" font-size="${num(font)}" font-weight="600" text-anchor="middle" dominant-baseline="middle" fill="#222">${escapeXml(name)}</text>`);
      if (twoLines) {
        out.push(`<text x="${cx}" y="${num(y + font * 1.15)}" font-size="${num(font * 0.85)}" text-anchor="middle" dominant-baseline="middle" fill="#222">${escapeXml(size)}</text>`);
      }
    }
    out.push("</g>");
  }

  if (options.showCuts ?? true) {
    for (const step of steps) {
      if (step.sheetNumber !== number) continue;
      const [x1, y1, x2, y2] = step.axis === "x" ? [step.at, step.from, step.at, step.to] : [step.from, step.at, step.to, step.at];
      const current = options.highlight === step.step;
      const done = options.done?.has(step.step) === true && !current;
      const color = done ? DONE_COLOR : stageColor(step.stage);
      const attributes = `data-step="${step.step}"${current ? ' data-highlight="true"' : ""}${done ? ' data-done="true"' : ""}`;
      const dash = step.kind === "trim" ? ` stroke-dasharray="${num(base * 0.3)} ${num(base * 0.2)}"` : "";
      const r = base * (current ? 0.75 : 0.55);
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      out.push(
        `<g ${attributes}>`,
        `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="${color}" stroke-width="${num(base * (current ? 0.22 : 0.07))}"${dash}/>`,
        `<circle cx="${num(mx)}" cy="${num(my)}" r="${num(r)}" fill="${current ? color : "#fff"}" stroke="${color}" stroke-width="${num(base * 0.06)}"/>`,
        `<text x="${num(mx)}" y="${num(my)}" font-size="${num(r * 1.1)}" text-anchor="middle" dominant-baseline="central" fill="${current ? "#fff" : color}">${step.step}</text>`,
        "</g>",
      );
    }
  }
  out.push("</svg>");
  return out.join("\n");
}
```

Apply this diff to `packages/core/src/index.ts` (save it to a file, then `git apply <file>`):

```diff
--- a/packages/core/src/index.ts
+++ b/packages/core/src/index.ts
@@ -30,6 +30,8 @@
 export * from "./reports/offcuts.ts";
 export * from "./reports/shopping.ts";
 export * from "./reports/labels.ts";
+export * from "./reports/colors.ts";
+export * from "./reports/svg.ts";
 export * from "./analysis.ts";
 export type { UnplacedCopy, UnplacedReason } from "./optimize/problem.ts";
 export * from "./optimize/evaluate.ts";
```

Apply this diff to `apps/web/src/layout/SheetView.tsx` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/src/layout/SheetView.tsx
+++ b/apps/web/src/layout/SheetView.tsx
@@ -2,7 +2,9 @@
   copyLabel,
   formatSize,
   grainOk,
+  NO_GROUP_COLOR,
   placedRect,
+  stageColor,
   stockLabel,
   usableRect,
   type PlanContext,
@@ -12,7 +14,6 @@
 } from "@opencutplan/core";
 import { useId, type PointerEvent } from "react";
 import { sameCopy, type CopyRef } from "../edit/layout.ts";
-import { NO_GROUP_COLOR, stageColor } from "./colors.ts";
 
 export interface DropPreview {
   rect: Rect;
```

Apply this diff to `apps/web/src/layout/Tray.tsx` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/src/layout/Tray.tsx
+++ b/apps/web/src/layout/Tray.tsx
@@ -1,7 +1,6 @@
-import { copyLabel, formatSize, materialName, type PlanContext, type UnplacedReason } from "@opencutplan/core";
+import { copyLabel, formatSize, materialName, NO_GROUP_COLOR, type PlanContext, type UnplacedReason } from "@opencutplan/core";
 import type { PointerEvent } from "react";
 import { sameCopy, type CopyRef } from "../edit/layout.ts";
-import { NO_GROUP_COLOR } from "./colors.ts";
 import { copyKey } from "./SheetView.tsx";
 
 export const REASON_TEXT: Readonly<Record<UnplacedReason, string>> = {
```

Apply this diff to `apps/web/src/layout/LayoutTab.tsx` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/src/layout/LayoutTab.tsx
+++ b/apps/web/src/layout/LayoutTab.tsx
@@ -1,6 +1,7 @@
 import {
   contains,
   copyLabel,
+  groupColors,
   stockLabel,
   usableRect,
   type ProjectAnalysis,
@@ -30,7 +31,6 @@
 import type { OptimizeRuns } from "../optimizer/useOptimizeRuns.ts";
 import type { ViewPrefs } from "../state/prefs.ts";
 import type { ProjectStore } from "../state/useProject.ts";
-import { groupColors } from "./colors.ts";
 import { Inspector } from "./Inspector.tsx";
 import { IssueList } from "./IssueList.tsx";
 import { copyKey, SheetView, type DropPreview } from "./SheetView.tsx";
```

After the move, `apps/web/src/layout/colors.ts` no longer exists; the three web files above import the colours from `@opencutplan/core`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run --root packages/core test/reports/svg.test.ts`

Expected: PASS (core: 11 new tests).

- [ ] **Step 5: Run the full check**

Run: `npm run check` from the repo root.

Expected: the typecheck is clean; core has 362 tests and the web app has 83 tests, all passing; the build succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A apps/web/src/layout/colors.ts
git add packages/core/src/reports/colors.ts packages/core/src/reports/svg.ts packages/core/src/index.ts apps/web/src/layout/SheetView.tsx apps/web/src/layout/Tray.tsx apps/web/src/layout/LayoutTab.tsx packages/core/test/reports/svg.test.ts
git commit -m "feat(core): draw sheets as SVG and move the drawing colours into core" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```


---

### Task 2: Label sheet layouts

**Files:**
- Create: `packages/core/src/reports/labelSheets.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/reports/labelSheets.test.ts`

**Interfaces:**
- Consumes: Nothing from earlier tasks.
- Produces (new or changed exports):
  - `packages/core/src/index.ts` re-exports the new core modules, so the web app imports them from `@opencutplan/core`.
  - `packages/core/src/reports/labelSheets.ts`: `type LabelLayoutId = "avery-5160" | "avery-l7160" | "thermal-4x2";`; `interface LabelLayout`; `const LABEL_LAYOUTS: readonly LabelLayout[] = [`; `function labelLayout(id: LabelLayoutId): LabelLayout`; `function labelsPerPage(layout: LabelLayout): number`; `function labelPages<T>(labels: readonly T[], layout: LabelLayout, start = 1): (T | null)[][]`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/reports/labelSheets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { LABEL_LAYOUTS, labelLayout, labelPages, labelsPerPage } from "../../src/index.ts";

describe("label layouts", () => {
  it("fit every label inside the page", () => {
    for (const layout of LABEL_LAYOUTS) {
      const right = layout.margin.left + (layout.columns - 1) * layout.pitch.x + layout.label.width;
      const bottom = layout.margin.top + (layout.rows - 1) * layout.pitch.y + layout.label.height;
      expect(right, layout.id).toBeLessThanOrEqual(layout.page.width + 1e-9);
      expect(bottom, layout.id).toBeLessThanOrEqual(layout.page.height + 1e-9);
    }
  });

  it("count the labels on a page", () => {
    expect(labelsPerPage(labelLayout("avery-5160"))).toBe(30);
    expect(labelsPerPage(labelLayout("avery-l7160"))).toBe(21);
    expect(labelsPerPage(labelLayout("thermal-4x2"))).toBe(1);
  });
});

describe("labelPages", () => {
  const letters = "abcdefghijklmnopqrstuvwxyz".split("");
  const avery = labelLayout("avery-l7160");

  it("fills pages row by row and pads the last page", () => {
    const pages = labelPages(letters, avery);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toEqual(letters.slice(0, 21));
    expect(pages[1]).toEqual([...letters.slice(21), ...Array(16).fill(null)]);
  });

  it("starts at the given position on the first page", () => {
    const pages = labelPages(letters.slice(0, 3), avery, 20);
    expect(pages).toHaveLength(2);
    expect(pages[0]!.slice(18)).toEqual([null, "a", "b"]);
    expect(pages[1]![0]).toBe("c");
  });

  it("keeps the start position on the page", () => {
    expect(labelPages(["a"], avery, 0)[0]![0]).toBe("a");
    expect(labelPages(["a"], avery, 99)[0]![20]).toBe("a");
    expect(labelPages(["a"], avery, 2.7)[0]![1]).toBe("a");
  });

  it("gives no pages for no labels", () => {
    expect(labelPages([], avery, 5)).toEqual([]);
  });

  it("puts one label on each thermal page", () => {
    expect(labelPages(["a", "b"], labelLayout("thermal-4x2"), 3)).toEqual([["a"], ["b"]]);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root packages/core test/reports/labelSheets.test.ts`

Expected: FAIL — the new modules or exports do not exist yet (`Failed to resolve import`, `is not a function`, or a missing element).

- [ ] **Step 3: Write the code**

Create `packages/core/src/reports/labelSheets.ts`:

```ts
export type LabelLayoutId = "avery-5160" | "avery-l7160" | "thermal-4x2";

/** A sheet of labels. Every length is in `unit`; `margin` is the distance from the page edge to the first label. */
export interface LabelLayout {
  id: LabelLayoutId;
  name: string;
  unit: "in" | "mm";
  page: { width: number; height: number };
  columns: number;
  rows: number;
  label: { width: number; height: number };
  margin: { top: number; left: number };
  /** The distance from one label to the next, across and down. */
  pitch: { x: number; y: number };
}

export const LABEL_LAYOUTS: readonly LabelLayout[] = [
  {
    id: "avery-5160",
    name: "Avery 5160 (US Letter, 30 labels)",
    unit: "in",
    page: { width: 8.5, height: 11 },
    columns: 3,
    rows: 10,
    label: { width: 2.625, height: 1 },
    margin: { top: 0.5, left: 0.1875 },
    pitch: { x: 2.75, y: 1 },
  },
  {
    id: "avery-l7160",
    name: "Avery L7160 (A4, 21 labels)",
    unit: "mm",
    page: { width: 210, height: 297 },
    columns: 3,
    rows: 7,
    label: { width: 63.5, height: 38.1 },
    margin: { top: 15.15, left: 7.21 },
    pitch: { x: 66.04, y: 38.1 },
  },
  {
    id: "thermal-4x2",
    name: "Thermal label, 4 × 2 in",
    unit: "in",
    page: { width: 4, height: 2 },
    columns: 1,
    rows: 1,
    label: { width: 4, height: 2 },
    margin: { top: 0, left: 0 },
    pitch: { x: 4, y: 2 },
  },
];

export function labelLayout(id: LabelLayoutId): LabelLayout {
  return LABEL_LAYOUTS.find((layout) => layout.id === id)!;
}

export function labelsPerPage(layout: LabelLayout): number {
  return layout.columns * layout.rows;
}

/**
 * Splits labels into pages of `labelsPerPage` slots, row by row. `start` is the 1-based position of the first label
 * on the first page, so a part-used sheet can be used again; the slots before it are null.
 */
export function labelPages<T>(labels: readonly T[], layout: LabelLayout, start = 1): (T | null)[][] {
  if (labels.length === 0) return [];
  const perPage = labelsPerPage(layout);
  const skip = Math.min(Math.max(Math.trunc(start), 1), perPage) - 1;
  const slots: (T | null)[] = [...Array<null>(skip).fill(null), ...labels];
  const pages: (T | null)[][] = [];
  for (let i = 0; i < slots.length; i += perPage) pages.push(slots.slice(i, i + perPage));
  const last = pages[pages.length - 1]!;
  while (last.length < perPage) last.push(null);
  return pages;
}
```

Apply this diff to `packages/core/src/index.ts` (save it to a file, then `git apply <file>`):

```diff
--- a/packages/core/src/index.ts
+++ b/packages/core/src/index.ts
@@ -30,6 +30,7 @@
 export * from "./reports/offcuts.ts";
 export * from "./reports/shopping.ts";
 export * from "./reports/labels.ts";
+export * from "./reports/labelSheets.ts";
 export * from "./reports/colors.ts";
 export * from "./reports/svg.ts";
 export * from "./analysis.ts";
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run --root packages/core test/reports/labelSheets.test.ts`

Expected: PASS (core: 7 new tests).

- [ ] **Step 5: Run the full check**

Run: `npm run check` from the repo root.

Expected: the typecheck is clean; core has 369 tests and the web app has 83 tests, all passing; the build succeeds.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/reports/labelSheets.ts packages/core/src/index.ts packages/core/test/reports/labelSheets.test.ts
git commit -m "feat(core): add label sheet layouts" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```


---

### Task 3: Shop progress and the Shop tab

**Files:**
- Create: `apps/web/src/shop/progress.ts`
- Create: `apps/web/src/shop/ShopTab.tsx`
- Modify: `apps/web/src/screens/Workspace.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/test/progress.test.ts`
- Test: `apps/web/test/ShopTab.test.tsx`
- Test (modify): `apps/web/test/Workspace.test.tsx`

**Interfaces:**
- Consumes: Task 1: `sheetSvg(ctx, sheet, steps, { colors, highlight, done, idPrefix })`, `groupColors`. Core: `describeStep(ctx, step) → { title, body }` (the title is like `Step 1. Table saw, rip.`), `analyzeProject`. Web: `ProjectStore` (`project`, `edit`, `undo`), `sampleProject()` in `test/helpers.ts` (one 96 × 48 sheet with two sides placed, 8 steps).
- Produces (new or changed exports):
  - `apps/web/src/shop/progress.ts`: `const APP_EXTENSION = "opencutplan.app";`; `interface ShopProgress`; `interface ShopState`; `function sequenceKey(steps: readonly Step[]): string`; `function readProgress(project: Project): ShopProgress | null`; `function writeProgress(project: Project, progress: ShopProgress | null): Project`; `function shopState(project: Project, steps: readonly Step[]): ShopState`; `function setStepDone(project: Project, steps: readonly Step[], step: number, done: boolean): Project`; `function keepProgress(project: Project, steps: readonly Step[]): Project`
  - `apps/web/src/shop/ShopTab.tsx`: `function ShopTab({ store, analysis }: ShopTabProps)`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/progress.test.ts`:

```ts
import { analyzeProject, parseProject, serializeProject, type Project } from "@opencutplan/core";
import { describe, expect, it } from "vitest";
import { APP_EXTENSION, keepProgress, readProgress, sequenceKey, setStepDone, shopState, writeProgress } from "../src/shop/progress.ts";
import { sampleProject } from "./helpers.ts";

const stepsOf = (project: Project) => analyzeProject(project).steps;

function moved(project: Project): Project {
  const next = structuredClone(project);
  next.plan!.sheets[0]!.placements[1]!.y = 20;
  return next;
}

describe("sequenceKey", () => {
  it("is the same for the same steps and changes when a cut moves", () => {
    const project = sampleProject();
    expect(sequenceKey(stepsOf(project))).toBe(sequenceKey(stepsOf(structuredClone(project))));
    expect(sequenceKey(stepsOf(moved(project)))).not.toBe(sequenceKey(stepsOf(project)));
    expect(sequenceKey([])).toBe("0-811c9dc5");
  });
});

describe("shop progress", () => {
  it("ticks and unticks steps, and removes the progress when no step is ticked", () => {
    const project = sampleProject();
    const steps = stepsOf(project);
    const ticked = setStepDone(setStepDone(project, steps, 3, true), steps, 1, true);
    expect(readProgress(ticked)).toEqual({ sequence: sequenceKey(steps), done: [1, 3] });
    expect([...shopState(ticked, steps).done]).toEqual([1, 3]);
    const cleared = setStepDone(setStepDone(ticked, steps, 1, false), steps, 3, false);
    expect(cleared.extensions).toBeUndefined();
    expect(project.extensions).toBeUndefined();
  });

  it("keeps other extension data", () => {
    const project: Project = { ...sampleProject(), extensions: { "com.example": { a: 1 }, [APP_EXTENSION]: { theme: "dark" } } };
    const steps = stepsOf(project);
    const ticked = setStepDone(project, steps, 2, true);
    expect(ticked.extensions).toEqual({ "com.example": { a: 1 }, [APP_EXTENSION]: { theme: "dark", progress: { sequence: sequenceKey(steps), done: [2] } } });
    expect(writeProgress(ticked, null).extensions).toEqual(project.extensions);
  });

  it("survives saving and opening the file", () => {
    const project = sampleProject();
    const ticked = setStepDone(project, stepsOf(project), 2, true);
    const reopened = parseProject(serializeProject(ticked));
    if (!reopened.ok) throw new Error("the file did not parse");
    expect([...shopState(reopened.project, stepsOf(reopened.project)).done]).toEqual([2]);
  });

  it("marks the ticks stale when the sequence changes, until the user keeps or clears them", () => {
    const project = sampleProject();
    const ticked = setStepDone(project, stepsOf(project), 2, true);
    const edited = moved(ticked);
    const steps = stepsOf(edited);
    expect(shopState(edited, steps)).toMatchObject({ stale: true, done: new Set() });
    expect(shopState(keepProgress(edited, steps), steps)).toMatchObject({ stale: false, done: new Set([2]) });
    expect(shopState(writeProgress(edited, null), steps)).toMatchObject({ stale: false, done: new Set() });
  });

  it("ignores malformed progress and step numbers past the end", () => {
    const steps = stepsOf(sampleProject());
    const bad: Project = { ...sampleProject(), extensions: { [APP_EXTENSION]: { progress: { sequence: 3, done: "1" } } } };
    expect(readProgress(bad)).toBeNull();
    const extra = writeProgress(sampleProject(), { sequence: sequenceKey(steps), done: [1, 0, 2.5, 99] });
    expect([...shopState(extra, steps).done]).toEqual([1]);
  });
});
```

Create `apps/web/test/ShopTab.test.tsx`:

```tsx
import { analyzeProject, type Project } from "@opencutplan/core";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo } from "react";
import { describe, expect, it, vi } from "vitest";
import { readProgress, setStepDone } from "../src/shop/progress.ts";
import { ShopTab } from "../src/shop/ShopTab.tsx";
import { useProject, type ProjectStore } from "../src/state/useProject.ts";
import { sampleProject } from "./helpers.ts";

function renderShop(initial: Project = sampleProject()) {
  let latest: ProjectStore | null = null;
  function Harness() {
    const store = useProject(initial);
    latest = store;
    const analysis = useMemo(() => analyzeProject(store.project), [store.project]);
    return <ShopTab store={store} analysis={analysis} />;
  }
  const result = render(<Harness />);
  return { ...result, current: () => latest! };
}

const stepCount = () => analyzeProject(sampleProject()).steps.length;
const heading = () => screen.getByRole("heading", { level: 2 }).textContent;
const currentItem = () => document.querySelector('li[aria-current="step"]');

describe("ShopTab", () => {
  it("ticks the current step, moves to the next one, and stores the tick in the project", async () => {
    const { current } = renderShop();
    const total = stepCount();
    expect(heading()).toMatch(/^Step 1\. Table saw, /);
    expect(screen.getByText(`0 of ${total} steps done.`)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Mark done" }));
    expect(readProgress(current().project)?.done).toEqual([1]);
    expect(heading()).toMatch(/^Step 2\. /);
    expect(screen.getByText(`1 of ${total} steps done.`)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Step 1 done" })).toHaveProperty("checked", true);
    act(() => current().undo());
    expect(readProgress(current().project)).toBeNull();
  });

  it("makes a step current from the list and from Previous and Next", async () => {
    renderShop();
    const list = screen.getByRole("region", { name: "Cut sequence" });
    expect(within(list).getByRole("heading", { name: "Sheet 1", level: 4 })).toBeTruthy();
    await userEvent.click(within(list).getByRole("button", { name: /^Step 3\. / }));
    expect(heading()).toMatch(/^Step 3\. /);
    expect(within(currentItem() as HTMLElement).getByRole("checkbox").getAttribute("aria-label")).toBe("Step 3 done");
    await userEvent.click(screen.getByRole("button", { name: "← Previous" }));
    expect(heading()).toMatch(/^Step 2\. /);
    await userEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(heading()).toMatch(/^Step 3\. /);
  });

  it("starts at the first step that is not done, and a tick in the list does not move the current step", async () => {
    const project = sampleProject();
    const { current } = renderShop(setStepDone(setStepDone(project, analyzeProject(project).steps, 1, true), analyzeProject(project).steps, 2, true));
    expect(heading()).toMatch(/^Step 3\. /);
    await userEvent.click(screen.getByRole("checkbox", { name: "Step 1 done" }));
    expect(readProgress(current().project)?.done).toEqual([2]);
    expect(heading()).toMatch(/^Step 3\. /);
  });

  it("draws the current step strongly and the done steps in grey", async () => {
    renderShop();
    await userEvent.click(screen.getByRole("button", { name: "Mark done" }));
    const diagram = screen.getByRole("img", { name: /^Sheet 1: .*step 2 marked$/ });
    expect(diagram.querySelector('[data-highlight="true"]')?.getAttribute("data-step")).toBe("2");
    expect(diagram.querySelector('[data-done="true"]')?.getAttribute("data-step")).toBe("1");
    expect(diagram.querySelector("pattern")?.id).toBe("shop-s1-h");
  });

  it("asks before it clears every tick", async () => {
    const project = sampleProject();
    const { current } = renderShop(setStepDone(project, analyzeProject(project).steps, 1, true));
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await userEvent.click(screen.getByRole("button", { name: "Reset progress" }));
    expect(readProgress(current().project)?.done).toEqual([1]);
    await userEvent.click(screen.getByRole("button", { name: "Reset progress" }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(readProgress(current().project)).toBeNull();
  });

  it("offers to start over or keep the ticks when the steps changed", async () => {
    const project = sampleProject();
    const ticked = setStepDone(project, analyzeProject(project).steps, 1, true);
    ticked.plan!.sheets[0]!.placements[1]!.y = 20;
    const { current } = renderShop(ticked);
    expect(screen.getByText(/The cut steps changed after you ticked some of them/)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Step 1 done" })).toHaveProperty("checked", false);
    await userEvent.click(screen.getByRole("button", { name: "Keep my ticks" }));
    expect(screen.queryByText(/The cut steps changed/)).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Step 1 done" })).toHaveProperty("checked", true);
    act(() => current().undo());
    await userEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(readProgress(current().project)).toBeNull();
    expect(screen.queryByText(/The cut steps changed/)).toBeNull();
  });

  it("says when there are no steps", () => {
    renderShop({ ...sampleProject(), plan: { sheets: [] } });
    expect(screen.getByText(/There are no cut steps/)).toBeTruthy();
  });
});
```

Apply this diff to `apps/web/test/Workspace.test.tsx` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/test/Workspace.test.tsx
+++ b/apps/web/test/Workspace.test.tsx
@@ -1,7 +1,7 @@
 import { render, screen, waitFor, within } from "@testing-library/react";
 import userEvent from "@testing-library/user-event";
 import { afterEach, describe, expect, it } from "vitest";
-import { Workspace } from "../src/screens/Workspace.tsx";
+import { TABS, Workspace } from "../src/screens/Workspace.tsx";
 import { openStorage, unavailableStorage, type Storage } from "../src/storage/db.ts";
 import { inProcessWorkers, sampleProject } from "./helpers.ts";
 
@@ -24,8 +24,13 @@
     expect(screen.getByRole("tab", { name: "Layout" }).getAttribute("aria-selected")).toBe("true");
     screen.getByRole("tab", { name: "Layout" }).focus();
     await userEvent.keyboard("{ArrowRight}");
+    expect(screen.getByRole("tab", { name: "Shop" }).getAttribute("aria-selected")).toBe("true");
+    expect(screen.getByRole("heading", { level: 2 }).textContent).toMatch(/^Step 1\. /);
+    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}");
     expect(screen.getByRole("tab", { name: "Parts" }).getAttribute("aria-selected")).toBe("true");
     expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Parts" }));
+    await userEvent.keyboard("{ArrowLeft}");
+    expect(screen.getByRole("tab", { name: TABS.at(-1)!.label }).getAttribute("aria-selected")).toBe("true");
   });
 
   it("undoes and redoes layout edits with the keyboard and the buttons", async () => {
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root apps/web test/progress.test.ts test/ShopTab.test.tsx test/Workspace.test.tsx`

Expected: FAIL — the new modules or exports do not exist yet (`Failed to resolve import`, `is not a function`, or a missing element).

- [ ] **Step 3: Write the code**

Create `apps/web/src/shop/progress.ts`:

```ts
import type { Project, Step } from "@opencutplan/core";

export const APP_EXTENSION = "opencutplan.app";

/** Stored in `extensions["opencutplan.app"].progress`. */
export interface ShopProgress {
  /** The `sequenceKey` of the steps that the ticks belong to. */
  sequence: string;
  done: number[];
}

export interface ShopState {
  key: string;
  done: ReadonlySet<number>;
  /** True when steps were ticked for a sequence that has since changed. */
  stale: boolean;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** A short fingerprint of the steps: it changes when any cut, its order, or its tool changes. */
export function sequenceKey(steps: readonly Step[]): string {
  const text = steps.map((s) => [s.sheet, s.kind, s.axis, round(s.at), round(s.from), round(s.to), s.tool?.id ?? ""].join(",")).join(";");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${steps.length}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function readProgress(project: Project): ShopProgress | null {
  const progress = asRecord(asRecord(project.extensions?.[APP_EXTENSION])?.progress);
  if (!progress || typeof progress.sequence !== "string" || !Array.isArray(progress.done)) return null;
  const done = progress.done.filter((n): n is number => Number.isInteger(n) && n > 0);
  return { sequence: progress.sequence, done };
}

/** Keeps every other extension; removes the namespace and `extensions` when they become empty. */
export function writeProgress(project: Project, progress: ShopProgress | null): Project {
  const app = { ...asRecord(project.extensions?.[APP_EXTENSION]) };
  if (progress) app.progress = progress;
  else delete app.progress;
  const extensions: Record<string, unknown> = { ...project.extensions };
  if (Object.keys(app).length > 0) extensions[APP_EXTENSION] = app;
  else delete extensions[APP_EXTENSION];
  const { extensions: _old, ...rest } = project;
  return Object.keys(extensions).length > 0 ? { ...rest, extensions } : rest;
}

export function shopState(project: Project, steps: readonly Step[]): ShopState {
  const key = sequenceKey(steps);
  const progress = readProgress(project);
  if (!progress) return { key, done: new Set(), stale: false };
  if (progress.sequence !== key) return { key, done: new Set(), stale: progress.done.length > 0 };
  return { key, done: new Set(progress.done.filter((n) => n <= steps.length)), stale: false };
}

export function setStepDone(project: Project, steps: readonly Step[], step: number, done: boolean): Project {
  const state = shopState(project, steps);
  const next = new Set(state.done);
  if (done) next.add(step);
  else next.delete(step);
  return writeProgress(project, next.size > 0 ? { sequence: state.key, done: [...next].sort((a, b) => a - b) } : null);
}

/** Keeps the ticked step numbers for the new sequence. */
export function keepProgress(project: Project, steps: readonly Step[]): Project {
  const progress = readProgress(project);
  if (!progress) return project;
  const done = progress.done.filter((n) => n <= steps.length);
  return writeProgress(project, done.length > 0 ? { sequence: sequenceKey(steps), done } : null);
}
```

Create `apps/web/src/shop/ShopTab.tsx`:

```tsx
import { describeStep, groupColors, sheetSvg, stockLabel, type ProjectAnalysis, type Step } from "@opencutplan/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectStore } from "../state/useProject.ts";
import { keepProgress, setStepDone, shopState, writeProgress } from "./progress.ts";

interface ShopTabProps {
  store: ProjectStore;
  analysis: ProjectAnalysis;
}

/** Consecutive steps on the same sheet; in setup order the sequence can go back to an earlier sheet. */
function sheetRuns(steps: readonly Step[]): Step[][] {
  const runs: Step[][] = [];
  for (const step of steps) {
    const last = runs.at(-1);
    if (last && last[0]!.sheetNumber === step.sheetNumber) last.push(step);
    else runs.push([step]);
  }
  return runs;
}

export function ShopTab({ store, analysis }: ShopTabProps) {
  const { project, edit } = store;
  const { steps, context: ctx } = analysis;
  const state = useMemo(() => shopState(project, steps), [project, steps]);
  const colors = useMemo(() => groupColors(project), [project]);
  const [chosen, setChosen] = useState<number | null>(null);
  const list = useRef<HTMLElement>(null);
  const runs = useMemo(() => sheetRuns(steps), [steps]);

  const nextUndone = (after: number) => steps.find((s) => s.step > after && !state.done.has(s.step))?.step ?? null;
  const firstUndone = nextUndone(0);
  const current = chosen !== null && chosen <= steps.length ? chosen : (firstUndone ?? steps.length);

  useEffect(() => {
    list.current?.querySelector('[aria-current="step"]')?.scrollIntoView?.({ block: "nearest" });
  }, [current]);

  if (steps.length === 0) {
    return <p className="muted">There are no cut steps. Optimize on the Layout tab, or place parts on a sheet.</p>;
  }

  const step = steps[current - 1]!;
  const text = describeStep(ctx, step);
  const sheet = analysis.sheets.find((s) => s.index === step.sheetNumber - 1);
  const isDone = state.done.has(current);

  const tick = (number: number, done: boolean) => {
    edit((p) => setStepDone(p, steps, number, done));
    setChosen(done && number === current ? (nextUndone(number) ?? number) : current);
  };
  const reset = () => {
    if (window.confirm("Clear the ticks on every step?")) edit((p) => writeProgress(p, null));
  };

  return (
    <div className="shop">
      {state.stale && (
        <div role="status" className="banner">
          <p>⚠ The cut steps changed after you ticked some of them. The old ticks may not match the new steps.</p>
          <div className="buttons">
            <button type="button" onClick={() => edit((p) => writeProgress(p, null))}>
              Start over
            </button>
            <button type="button" onClick={() => edit((p) => keepProgress(p, steps))}>
              Keep my ticks
            </button>
          </div>
        </div>
      )}
      <div className="toolbar">
        <span aria-live="polite">
          {state.done.size} of {steps.length} steps done.
        </span>
        <span className="spacer" />
        <button type="button" onClick={reset} disabled={state.done.size === 0}>
          Reset progress
        </button>
      </div>
      <div className="shop-body">
        <section className="shop-current" aria-labelledby="shop-current-title">
          <h2 id="shop-current-title">{text.title}</h2>
          <p className="shop-text">{text.body}</p>
          <div className="buttons">
            <button type="button" onClick={() => setChosen(current - 1)} disabled={current <= 1}>
              ← Previous
            </button>
            <button type="button" className={isDone ? undefined : "primary"} onClick={() => tick(current, !isDone)}>
              {isDone ? "Mark not done" : "Mark done"}
            </button>
            <button type="button" onClick={() => setChosen(current + 1)} disabled={current >= steps.length}>
              Next →
            </button>
          </div>
          {sheet && (
            <figure className="shop-diagram">
              <div
                role="img"
                aria-label={`Sheet ${step.sheetNumber}: ${stockLabel(ctx, sheet.stock)}, step ${current} marked`}
                dangerouslySetInnerHTML={{ __html: sheetSvg(ctx, sheet, steps, { colors, highlight: current, done: state.done, idPrefix: "shop" }) }}
              />
              <figcaption className="muted">
                Sheet {step.sheetNumber} of {analysis.sheets.length}: {stockLabel(ctx, sheet.stock)}
              </figcaption>
            </figure>
          )}
        </section>
        <section className="shop-steps" aria-labelledby="shop-steps-title" ref={list}>
          <h3 id="shop-steps-title">Cut sequence</h3>
          {runs.map((run) => (
            <div key={run[0]!.step}>
              <h4>Sheet {run[0]!.sheetNumber}</h4>
              <ol start={run[0]!.step}>
                {run.map((s) => {
                  const done = state.done.has(s.step);
                  return (
                    <li key={s.step} className={done ? "done" : undefined} aria-current={s.step === current ? "step" : undefined}>
                      <input type="checkbox" checked={done} onChange={(event) => tick(s.step, event.target.checked)} aria-label={`Step ${s.step} done`} />
                      <button type="button" className="link" onClick={() => setChosen(s.step)}>
                        {describeStep(ctx, s).title}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
```

Apply this diff to `apps/web/src/screens/Workspace.tsx` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/src/screens/Workspace.tsx
+++ b/apps/web/src/screens/Workspace.tsx
@@ -6,6 +6,7 @@
 import type { WorkerFactory } from "../optimizer/useOptimizer.ts";
 import { usePrefs } from "../state/prefs.ts";
 import { useAutosave } from "../state/useAutosave.ts";
+import { ShopTab } from "../shop/ShopTab.tsx";
 import { useProject } from "../state/useProject.ts";
 import type { Storage } from "../storage/db.ts";
 import { projectFileName, saveProjectFile } from "../storage/files.ts";
@@ -19,6 +20,7 @@
   { id: "stock", label: "Stock" },
   { id: "tools", label: "Tools" },
   { id: "layout", label: "Layout" },
+  { id: "shop", label: "Shop" },
 ] as const;
 
 export type TabId = (typeof TABS)[number]["id"];
@@ -160,6 +162,7 @@
         {tab === "stock" && <StockTab store={store} />}
         {tab === "tools" && <ToolsTab store={store} storage={storage} />}
         {tab === "layout" && <LayoutTab store={store} analysis={analysis} prefs={prefs} runs={runs} />}
+        {tab === "shop" && <ShopTab store={store} analysis={analysis} />}
       </div>
       {settingsOpen && <SettingsDrawer store={store} prefs={prefs} onPrefs={setPrefs} onClose={() => setSettingsOpen(false)} />}
     </div>
```

Apply this diff to `apps/web/src/styles.css` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/src/styles.css
+++ b/apps/web/src/styles.css
@@ -122,9 +122,25 @@
 .sheet-area .drop-preview.bad { fill: #c6282822; stroke: var(--bad); }
 .ghost { position: fixed; pointer-events: none; z-index: 100; background: #9cc3e6cc; border: 1px solid #333; box-shadow: 0 4px 14px #0004; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; overflow: hidden; }
 .ghost.bad { background: #f6b3b3cc; outline: 2px solid var(--bad); }
+.shop-body { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
+.shop-current h2 { font-size: 20px; }
+.shop-text { font-size: 16px; max-width: 60ch; }
+.shop-current .buttons button { padding: 10px 16px; font-size: 15px; }
+.shop-diagram { margin: 12px 0 0; }
+.shop-diagram svg { display: block; width: 100%; height: auto; max-height: 70vh; }
+.shop-steps { position: sticky; top: 8px; max-height: calc(100vh - 16px); overflow-y: auto; }
+.shop-steps h4 { margin: 10px 0 2px; }
+.shop-steps ol { list-style: none; padding: 0; margin: 0; }
+.shop-steps li button.link { color: inherit; text-decoration: none; text-align: left; padding: 2px 0; }
+.shop-steps li { display: flex; gap: 8px; align-items: center; padding: 4px 6px; border-radius: 4px; }
+.shop-steps li[aria-current="step"] { background: #eaf1fb; outline: 1px solid var(--focus); }
+.shop-steps li.done button { color: var(--muted); text-decoration: line-through; }
+.shop-steps input[type="checkbox"] { width: 20px; height: 20px; flex: none; }
 
 @media (max-width: 800px) {
   .layout-body { grid-template-columns: 1fr; }
   .layout-side { border-left: none; padding-left: 0; }
+  .shop-body { grid-template-columns: 1fr; }
+  .shop-steps { position: static; max-height: none; }
   .panel { padding: 10px; }
 }
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run --root apps/web test/progress.test.ts test/ShopTab.test.tsx test/Workspace.test.tsx`

Expected: PASS (web: 13 new tests).

- [ ] **Step 5: Run the full check**

Run: `npm run check` from the repo root.

Expected: the typecheck is clean; core has 369 tests and the web app has 96 tests, all passing; the build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/shop/progress.ts apps/web/src/shop/ShopTab.tsx apps/web/src/screens/Workspace.tsx apps/web/src/styles.css apps/web/test/progress.test.ts apps/web/test/ShopTab.test.tsx apps/web/test/Workspace.test.tsx
git commit -m "feat(web): add the Shop tab with saved progress" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```


---

### Task 4: Printing

**Files:**
- Create: `apps/web/src/print/scale.ts`
- Create: `apps/web/src/reports/money.ts`
- Create: `apps/web/src/reports/ShoppingTables.tsx`
- Create: `apps/web/src/print/PrintView.tsx`
- Modify: `apps/web/src/shop/ShopTab.tsx`
- Modify: `apps/web/src/screens/Workspace.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/test/print.test.tsx`
- Test (modify): `apps/web/test/ShopTab.test.tsx`
- Test (modify): `apps/web/test/Workspace.test.tsx`

**Interfaces:**
- Consumes: Task 1: `sheetSvg`, `sheetSvgExtent`, `groupColors`, `stageColor`. Task 2: `labelLayout`, `labelPages`, `LabelLayoutId`. Task 3: `ShopTab`. Core: `ProjectAnalysis` (`shopping`, `labels`, `steps`, `sheets`, `context`), `describeStep`.
- Produces (new or changed exports):
  - `apps/web/src/print/scale.ts`: `const STANDARD_SCALES = [1, 2, 4, 5, 8, 10, 12, 16, 20, 25, 50] as const;`; `interface PrintScale`; `interface Box`; `function printScale(size: Size, units: PlanContext["units"], box: Box): PrintScale`; `const KEY_BELOW_BOX: Box = { width: 250, height: 130 };`; `const KEY_BESIDE_BOX: Box = { width: 190, height: 160 };`; `interface SheetPrintLayout`; `function sheetPrintLayout(size: Size, units: PlanContext["units"]): SheetPrintLayout`
  - `apps/web/src/reports/money.ts`: `function formatMoney(amount: number, currency: string): string`; `function formatPercent(ratio: number): string`
  - `apps/web/src/reports/ShoppingTables.tsx`: `function ShoppingTables({ analysis, level }: ShoppingTablesProps)`
  - `apps/web/src/print/PrintView.tsx`: `type PrintJob = { kind: "sheets" } | { kind: "sequence" } | { kind: "shopping" } | { kind: "labels"; layout: LabelLayoutId; start: number };`; `function PrintView({ job, analysis, onDone }: PrintViewProps)`
  - `apps/web/src/shop/ShopTab.tsx`: `function ShopTab({ store, analysis, onPrint }: ShopTabProps)`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/print.test.tsx`:

```tsx
import { analyzeProject, type Project } from "@opencutplan/core";
import { act, render, screen, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrintView, type PrintJob } from "../src/print/PrintView.tsx";
import { printScale, sheetPrintLayout } from "../src/print/scale.ts";
import { formatMoney } from "../src/reports/money.ts";
import { sampleProject } from "./helpers.ts";

let print: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  print = vi.spyOn(window, "print").mockImplementation(() => undefined);
});

afterEach(() => {
  print.mockRestore();
});

function renderPrint(job: PrintJob, project: Project = sampleProject(), onDone = vi.fn()) {
  const view = render(
    <StrictMode>
      <div id="root-marker" />
      <PrintView job={job} analysis={analyzeProject(project)} onDone={onDone} />
    </StrictMode>,
  );
  const root = document.body.querySelector<HTMLElement>(":scope > .print-root");
  if (!root) throw new Error("no print root");
  return { ...view, root, onDone };
}

describe("printScale", () => {
  it("picks the largest standard scale that fits the box", () => {
    expect(printScale({ length: 96, width: 48 }, "in", { width: 250, height: 130 })).toEqual({ ratio: 10, width: "243.8mm", height: "121.9mm" });
    expect(printScale({ length: 2440, width: 1220 }, "mm", { width: 250, height: 130 })).toEqual({ ratio: 10, width: "244mm", height: "122mm" });
    expect(printScale({ length: 200, width: 100 }, "mm", { width: 250, height: 130 })).toEqual({ ratio: 1, width: "200mm", height: "100mm" });
    expect(printScale({ length: 96, width: 48 }, "in", { width: 170, height: 90 })).toMatchObject({ ratio: 16 });
  });

  it("fills the box and has no scale when even 1:50 is too large", () => {
    expect(printScale({ length: 20000, width: 1000 }, "mm", { width: 250, height: 130 })).toEqual({ ratio: null, width: "250mm", height: "12.5mm" });
  });
});

describe("sheetPrintLayout", () => {
  it("puts the key below a long sheet and beside a square one", () => {
    expect(sheetPrintLayout({ length: 99.2, width: 51.2 }, "in")).toEqual({ keyBeside: false, scale: { ratio: 12, width: "210mm", height: "108.4mm" } });
    expect(sheetPrintLayout({ length: 64, width: 64 }, "in")).toEqual({ keyBeside: true, scale: { ratio: 12, width: "135.5mm", height: "135.5mm" } });
    expect(sheetPrintLayout({ length: 40000, width: 40000 }, "mm")).toMatchObject({ keyBeside: false, scale: { ratio: null } });
  });
});

describe("formatMoney", () => {
  it("formats a currency and falls back for a code the browser does not know", () => {
    expect(formatMoney(60, "USD")).toMatch(/60\.00/);
    expect(formatMoney(12.5, "US")).toBe("12.50 US");
  });
});

describe("PrintView", () => {
  it("prints one page per sheet outside the app root, once, and ends when the dialog closes", () => {
    const { root, onDone } = renderPrint({ kind: "sheets" });
    expect(print).toHaveBeenCalledTimes(1);
    expect(root.parentElement).toBe(document.body);
    expect(root.querySelector("style")?.textContent).toBe("@page { size: landscape; margin: 12mm; }");
    const pages = root.querySelectorAll(".print-page");
    expect(pages).toHaveLength(1);
    const page = within(pages[0] as HTMLElement);
    expect(page.getByRole("heading", { name: 'Sheet 1 of 1: Plywood 96" × 48"' })).toBeTruthy();
    expect(page.getByText(/^Scale 1:12 · Test$/)).toBeTruthy();
    const svg = pages[0]!.querySelector("svg")!;
    expect([svg.getAttribute("width"), svg.getAttribute("height")]).toEqual(["210mm", "108.4mm"]);
    expect(svg.querySelector("pattern")?.id).toBe("print-s1-h");
    expect(page.getByText("Side 1").parentElement?.textContent).toBe('Side 1 30" × 12" ↔');
    expect(page.getByText(/The number on a cut line is its step/)).toBeTruthy();
    act(() => window.dispatchEvent(new Event("afterprint")));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("prints the cut sequence with a box to tick for each step", () => {
    const { root } = renderPrint({ kind: "sequence" });
    const steps = analyzeProject(sampleProject()).steps;
    expect(root.querySelector("style")?.textContent).toBe("@page { size: portrait; margin: 15mm; }");
    expect(within(root).getByRole("heading", { name: "Test: cut sequence" })).toBeTruthy();
    const items = root.querySelectorAll(".print-steps li");
    expect(items).toHaveLength(steps.length);
    expect(items[0]!.textContent).toMatch(/^☐Step 1\. Table saw, /);
    expect(within(root).getByText("Scale 1:16")).toBeTruthy();
  });

  it("prints the shopping list", () => {
    const { root } = renderPrint({ kind: "shopping" });
    expect(within(root).getByRole("heading", { name: "Test: shopping list" })).toBeTruthy();
    expect(within(root).getByRole("heading", { name: "Plywood", level: 2 })).toBeTruthy();
    expect(within(root).getByText(/^Total: .*60\.00/)).toBeTruthy();
  });

  it("places labels on the label sheet from the start position", () => {
    const { root } = renderPrint({ kind: "labels", layout: "avery-5160", start: 3 });
    expect(root.querySelector("style")?.textContent).toBe("@page { size: 8.5in 11in; margin: 0; }");
    const labels = [...root.querySelectorAll<HTMLElement>(".label")];
    expect(labels.map((label) => label.querySelector("strong")?.textContent)).toEqual(["Side 1", "Side 2", "Shelf"]);
    expect([labels[0]!.style.left, labels[0]!.style.top, labels[0]!.style.width]).toEqual(["5.6875in", "0.5in", "2.625in"]);
    expect([labels[1]!.style.left, labels[1]!.style.top]).toEqual(["0.1875in", "1.5in"]);
    const freedAt = analyzeProject(sampleProject()).labels[0]!.step;
    expect(labels[0]!.textContent).toBe(`Side 130" × 12" · PlywoodGrain ↔Sheet 1 · step ${freedAt}`);
    expect(labels[2]!.textContent).toBe('Shelf20" × 10" · PlywoodANot placed');
  });

  it("uses mm for an A4 label sheet", () => {
    const { root } = renderPrint({ kind: "labels", layout: "avery-l7160", start: 1 });
    expect(root.querySelector("style")?.textContent).toBe("@page { size: 210mm 297mm; margin: 0; }");
    expect(root.querySelector<HTMLElement>(".label")!.style.height).toBe("38.1mm");
  });
});
```

Apply this diff to `apps/web/test/ShopTab.test.tsx` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/test/ShopTab.test.tsx
+++ b/apps/web/test/ShopTab.test.tsx
@@ -3,18 +3,19 @@
 import userEvent from "@testing-library/user-event";
 import { useMemo } from "react";
 import { describe, expect, it, vi } from "vitest";
+import type { PrintJob } from "../src/print/PrintView.tsx";
 import { readProgress, setStepDone } from "../src/shop/progress.ts";
 import { ShopTab } from "../src/shop/ShopTab.tsx";
 import { useProject, type ProjectStore } from "../src/state/useProject.ts";
 import { sampleProject } from "./helpers.ts";
 
-function renderShop(initial: Project = sampleProject()) {
+function renderShop(initial: Project = sampleProject(), onPrint: (job: PrintJob) => void = () => undefined) {
   let latest: ProjectStore | null = null;
   function Harness() {
     const store = useProject(initial);
     latest = store;
     const analysis = useMemo(() => analyzeProject(store.project), [store.project]);
-    return <ShopTab store={store} analysis={analysis} />;
+    return <ShopTab store={store} analysis={analysis} onPrint={onPrint} />;
   }
   const result = render(<Harness />);
   return { ...result, current: () => latest! };
@@ -97,6 +98,13 @@
     expect(screen.queryByText(/The cut steps changed/)).toBeNull();
   });
 
+  it("prints the cut sequence", async () => {
+    const onPrint = vi.fn();
+    renderShop(sampleProject(), onPrint);
+    await userEvent.click(screen.getByRole("button", { name: "Print cut sequence" }));
+    expect(onPrint).toHaveBeenCalledWith({ kind: "sequence" });
+  });
+
   it("says when there are no steps", () => {
     renderShop({ ...sampleProject(), plan: { sheets: [] } });
     expect(screen.getByText(/There are no cut steps/)).toBeTruthy();
```

Apply this diff to `apps/web/test/Workspace.test.tsx` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/test/Workspace.test.tsx
+++ b/apps/web/test/Workspace.test.tsx
@@ -1,6 +1,6 @@
-import { render, screen, waitFor, within } from "@testing-library/react";
+import { act, render, screen, waitFor, within } from "@testing-library/react";
 import userEvent from "@testing-library/user-event";
-import { afterEach, describe, expect, it } from "vitest";
+import { afterEach, describe, expect, it, vi } from "vitest";
 import { TABS, Workspace } from "../src/screens/Workspace.tsx";
 import { openStorage, unavailableStorage, type Storage } from "../src/storage/db.ts";
 import { inProcessWorkers, sampleProject } from "./helpers.ts";
@@ -137,4 +137,17 @@
     expect(part("Side 2").getAttribute("aria-label")).not.toContain("across the grain");
     expect(stripes()).toBe(0);
   });
+
+  it("prints the cut sequence from the Shop tab and removes the print pages after the dialog", async () => {
+    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
+    await renderWorkspace();
+    await userEvent.click(screen.getByRole("tab", { name: "Shop" }));
+    await userEvent.click(screen.getByRole("button", { name: "Print cut sequence" }));
+    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
+    const root = document.body.querySelector(":scope > .print-root");
+    expect(root?.getAttribute("data-job")).toBe("sequence");
+    act(() => window.dispatchEvent(new Event("afterprint")));
+    expect(document.body.querySelector(".print-root")).toBeNull();
+    print.mockRestore();
+  });
 });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root apps/web test/print.test.tsx test/ShopTab.test.tsx test/Workspace.test.tsx`

Expected: FAIL — the new modules or exports do not exist yet (`Failed to resolve import`, `is not a function`, or a missing element).

- [ ] **Step 3: Write the code**

Create `apps/web/src/print/scale.ts`:

```ts
import type { PlanContext, Size } from "@opencutplan/core";

export const STANDARD_SCALES = [1, 2, 4, 5, 8, 10, 12, 16, 20, 25, 50] as const;

export interface PrintScale {
  /** The N of "1:N", or null when no standard scale fits and the drawing is not to scale. */
  ratio: number | null;
  width: string;
  height: string;
}

export interface Box {
  width: number;
  height: number;
}

const MM_PER_UNIT = { in: 25.4, mm: 1 } as const;

function mm(value: number): string {
  return `${Math.round(value * 10) / 10}mm`;
}

/** The largest standard scale at which a drawing of `size` fits the box (in mm). */
export function printScale(size: Size, units: PlanContext["units"], box: Box): PrintScale {
  const realLength = size.length * MM_PER_UNIT[units];
  const realWidth = size.width * MM_PER_UNIT[units];
  for (const ratio of STANDARD_SCALES) {
    if (realLength / ratio <= box.width && realWidth / ratio <= box.height) {
      return { ratio, width: mm(realLength / ratio), height: mm(realWidth / ratio) };
    }
  }
  const factor = Math.min(box.width / realLength, box.height / realWidth);
  return { ratio: null, width: mm(realLength * factor), height: mm(realWidth * factor) };
}

/** Key below the drawing: a wide box. Key beside it: a tall box. Both fit a landscape Letter or A4 page with 12 mm margins. */
export const KEY_BELOW_BOX: Box = { width: 250, height: 130 };
export const KEY_BESIDE_BOX: Box = { width: 190, height: 160 };

export interface SheetPrintLayout {
  scale: PrintScale;
  keyBeside: boolean;
}

/** Puts the key beside the drawing only when that gives a larger scale. */
export function sheetPrintLayout(size: Size, units: PlanContext["units"]): SheetPrintLayout {
  const below = printScale(size, units, KEY_BELOW_BOX);
  const beside = printScale(size, units, KEY_BESIDE_BOX);
  const keyBeside = (beside.ratio ?? Infinity) < (below.ratio ?? Infinity);
  return { scale: keyBeside ? beside : below, keyBeside };
}
```

Create `apps/web/src/reports/money.ts`:

```ts
/** Falls back to "12.50 XYZ" for a code the browser does not know. */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
```

Create `apps/web/src/reports/ShoppingTables.tsx`:

```tsx
import { formatSize, stockLabel, type ProjectAnalysis } from "@opencutplan/core";
import { formatMoney, formatPercent } from "./money.ts";

interface ShoppingTablesProps {
  analysis: ProjectAnalysis;
  /** The heading level of each material; the sheet table uses the same level. */
  level: 2 | 3;
}

export function ShoppingTables({ analysis, level }: ShoppingTablesProps) {
  const { shopping, context: ctx } = analysis;
  const Heading = level === 2 ? "h2" : "h3";
  const cost = ctx.features.cost;
  const money = (value: number | null) => (value === null ? "—" : formatMoney(value, shopping.currency));

  if (shopping.materials.length === 0) return <p className="muted">The plan uses no stock.</p>;

  const missing = shopping.missingPrices.map((id) => {
    const stock = ctx.stock.get(id);
    return stock ? stockLabel(ctx, stock) : id;
  });

  return (
    <div className="shopping">
      {shopping.materials.map((material) => (
        <section key={material.material} className="shopping-material">
          <Heading>{material.name}</Heading>
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th scope="col">Stock</th>
                  <th scope="col">Size</th>
                  <th scope="col">In the plan</th>
                  <th scope="col">To buy</th>
                  {cost && <th scope="col">Unit cost</th>}
                  {cost && <th scope="col">Cost</th>}
                </tr>
              </thead>
              <tbody>
                {material.lines.map((line) => (
                  <tr key={line.stock}>
                    <td>
                      {line.label}
                      {line.kind === "offcut" ? " (offcut you have)" : ""}
                    </td>
                    <td>{formatSize(ctx, line)}</td>
                    <td>{line.used}</td>
                    <td>{line.buy}</td>
                    {cost && <td>{money(line.unitCost)}</td>}
                    {cost && <td>{money(line.lineCost)}</td>}
                  </tr>
                ))}
              </tbody>
              {cost && (
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={5}>
                      Subtotal
                    </th>
                    <td>{money(material.cost)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="muted">
            Parts use {formatPercent(material.utilization)} of this stock. Waste is {formatPercent(1 - material.utilization)}.
          </p>
        </section>
      ))}
      {cost &&
        (shopping.total !== null ? (
          <p className="shopping-total">Total: {money(shopping.total)}</p>
        ) : (
          <p className="warning">⚠ The total is not known. This stock has no price: {missing.join(", ")}.</p>
        ))}
      <section className="shopping-sheets">
        <Heading>Sheet use</Heading>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th scope="col">Sheet</th>
                <th scope="col">Stock</th>
                <th scope="col">Parts use</th>
              </tr>
            </thead>
            <tbody>
              {shopping.sheets.map((sheet) => {
                const stock = ctx.stock.get(sheet.stock);
                return (
                  <tr key={sheet.sheet}>
                    <td>{sheet.sheetNumber}</td>
                    <td>{stock ? stockLabel(ctx, stock) : sheet.stock}</td>
                    <td>{formatPercent(sheet.utilization)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
```

Create `apps/web/src/print/PrintView.tsx`:

```tsx
import {
  copyLabel,
  describeStep,
  formatSize,
  grainOk,
  groupColors,
  labelLayout,
  labelPages,
  sheetSvg,
  sheetSvgExtent,
  stageColor,
  stockLabel,
  type LabelLayoutId,
  type PartLabel,
  type ProjectAnalysis,
  type SheetAnalysis,
} from "@opencutplan/core";
import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { ShoppingTables } from "../reports/ShoppingTables.tsx";
import { printScale, sheetPrintLayout } from "./scale.ts";

export type PrintJob = { kind: "sheets" } | { kind: "sequence" } | { kind: "shopping" } | { kind: "labels"; layout: LabelLayoutId; start: number };

interface PrintViewProps {
  job: PrintJob;
  analysis: ProjectAnalysis;
  onDone(): void;
}

const SEQUENCE_BOX = { width: 170, height: 90 };

function pageRule(job: PrintJob): string {
  if (job.kind === "sheets") return "@page { size: landscape; margin: 12mm; }";
  if (job.kind === "labels") {
    const layout = labelLayout(job.layout);
    return `@page { size: ${layout.page.width}${layout.unit} ${layout.page.height}${layout.unit}; margin: 0; }`;
  }
  return "@page { size: portrait; margin: 15mm; }";
}

/** Renders the job outside `#root` and opens the print dialog; `onDone` runs when the dialog closes. */
export function PrintView({ job, analysis, onDone }: PrintViewProps) {
  useEffect(() => {
    window.addEventListener("afterprint", onDone);
    return () => window.removeEventListener("afterprint", onDone);
  }, [onDone]);

  const printed = useRef<PrintJob | null>(null);
  useEffect(() => {
    if (printed.current === job) return;
    printed.current = job;
    window.print();
  }, [job]);

  return createPortal(
    <div className="print-root" data-job={job.kind}>
      <style>{pageRule(job)}</style>
      {job.kind === "sheets" && <SheetPages analysis={analysis} />}
      {job.kind === "sequence" && <SequencePages analysis={analysis} />}
      {job.kind === "shopping" && (
        <section className="print-page">
          <h1>{analysis.context.project.project.name}: shopping list</h1>
          <ShoppingTables analysis={analysis} level={2} />
        </section>
      )}
      {job.kind === "labels" && <LabelPages analysis={analysis} layout={job.layout} start={job.start} />}
    </div>,
    document.body,
  );
}

function sheetTitle(analysis: ProjectAnalysis, sheet: SheetAnalysis): string {
  return `Sheet ${sheet.index + 1} of ${analysis.sheets.length}: ${stockLabel(analysis.context, sheet.stock)}`;
}

function scaleText(ratio: number | null): string {
  return ratio === null ? "Not to scale" : `Scale 1:${ratio}`;
}

function grainText(analysis: ProjectAnalysis, sheet: SheetAnalysis, index: number): string {
  const ctx = analysis.context;
  const placement = sheet.sheet.placements[index]!;
  const part = ctx.parts.get(placement.part)!;
  if (!ctx.features.grain || ctx.materials.get(sheet.stock.material)?.grained !== true || part.grain === "none") return "";
  const horizontal = (part.grain === "length") !== placement.rotated;
  return `${horizontal ? " ↔" : " ↕"}${grainOk(ctx, part, placement.rotated) ? "" : " ⟂ across the grain"}`;
}

function SheetPages({ analysis }: { analysis: ProjectAnalysis }) {
  const ctx = analysis.context;
  const colors = useMemo(() => groupColors(ctx.project), [ctx.project]);
  return (
    <>
      {analysis.sheets.map((sheet) => {
        const { scale, keyBeside } = sheetPrintLayout(sheetSvgExtent(sheet), ctx.units);
        const steps = analysis.steps.filter((step) => step.sheetNumber === sheet.index + 1);
        const stages = [...new Set(steps.map((step) => step.stage))].sort((a, b) => a - b);
        return (
          <section key={sheet.sheet.id} className="print-page print-sheet">
            <h2>{sheetTitle(analysis, sheet)}</h2>
            <p className="print-meta">
              {scaleText(scale.ratio)} · {ctx.project.project.name}
            </p>
            <div className={keyBeside ? "print-sheet-body key-beside" : "print-sheet-body"}>
              <div className="print-diagram" dangerouslySetInnerHTML={{ __html: sheetSvg(ctx, sheet, analysis.steps, { colors, width: scale.width, height: scale.height, idPrefix: "print" }) }} />
              <ul className="print-key">
                {sheet.items.map((item) => {
                  const placement = sheet.sheet.placements[item.index]!;
                  const part = ctx.parts.get(placement.part)!;
                  return (
                    <li key={item.index}>
                      <strong>{copyLabel(part, placement.copy)}</strong> {formatSize(ctx, item.rect)}
                      {grainText(analysis, sheet, item.index)}
                    </li>
                  );
                })}
              </ul>
            </div>
            {stages.length > 0 && (
              <p className="print-note">
                The number on a cut line is its step in the cut sequence. The colour shows the stage:{" "}
                {stages.map((stage) => (
                  <span key={stage} className="print-stage" style={{ color: stageColor(stage) }}>
                    ■ stage {stage}
                  </span>
                ))}
                . A dashed line is a trim cut.
              </p>
            )}
          </section>
        );
      })}
    </>
  );
}

function SequencePages({ analysis }: { analysis: ProjectAnalysis }) {
  const ctx = analysis.context;
  const colors = useMemo(() => groupColors(ctx.project), [ctx.project]);
  return (
    <section className="print-page">
      <h1>{ctx.project.project.name}: cut sequence</h1>
      {analysis.steps.length === 0 && <p>There are no cut steps.</p>}
      {analysis.sheets.map((sheet) => {
        const steps = analysis.steps.filter((step) => step.sheetNumber === sheet.index + 1);
        if (steps.length === 0) return null;
        const scale = printScale(sheetSvgExtent(sheet), ctx.units, SEQUENCE_BOX);
        return (
          <section key={sheet.sheet.id} className="print-sequence-sheet">
            <h2>{sheetTitle(analysis, sheet)}</h2>
            <div className="print-diagram" dangerouslySetInnerHTML={{ __html: sheetSvg(ctx, sheet, analysis.steps, { colors, width: scale.width, height: scale.height, idPrefix: "print" }) }} />
            <p className="print-meta">{scaleText(scale.ratio)}</p>
            <ol className="print-steps">
              {steps.map((step) => {
                const text = describeStep(ctx, step);
                return (
                  <li key={step.step}>
                    <span className="print-box" aria-hidden="true">
                      ☐
                    </span>
                    <div>
                      <strong>{text.title}</strong> {text.body}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </section>
  );
}

function labelLines(analysis: ProjectAnalysis, label: PartLabel): string[] {
  const ctx = analysis.context;
  const grain = label.grain === "length" ? "Grain ↔" : label.grain === "width" ? "Grain ↕" : "";
  const where = label.sheetNumber === null ? "Not placed" : `Sheet ${label.sheetNumber}${label.step === null ? "" : ` · step ${label.step}`}`;
  return [`${formatSize(ctx, label)} · ${label.material}`, [label.group, grain].filter(Boolean).join(" · "), where].filter(Boolean);
}

function LabelPages({ analysis, layout: id, start }: { analysis: ProjectAnalysis; layout: LabelLayoutId; start: number }) {
  const layout = labelLayout(id);
  const pages = labelPages(analysis.labels, layout, start);
  const u = (value: number) => `${value}${layout.unit}`;
  return (
    <>
      {pages.map((page, pageIndex) => (
        <div key={pageIndex} className="print-page label-page" data-layout={layout.id} style={{ width: u(layout.page.width), height: u(layout.page.height) }}>
          {page.map((label, index) => {
            if (!label) return null;
            const column = index % layout.columns;
            const row = Math.floor(index / layout.columns);
            return (
              <div
                key={index}
                className="label"
                style={{
                  left: u(layout.margin.left + column * layout.pitch.x),
                  top: u(layout.margin.top + row * layout.pitch.y),
                  width: u(layout.label.width),
                  height: u(layout.label.height),
                }}
              >
                <strong>{label.name}</strong>
                {labelLines(analysis, label).map((line, lineIndex) => (
                  <span key={lineIndex}>{line}</span>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}
```

Apply this diff to `apps/web/src/shop/ShopTab.tsx` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/src/shop/ShopTab.tsx
+++ b/apps/web/src/shop/ShopTab.tsx
@@ -1,11 +1,13 @@
 import { describeStep, groupColors, sheetSvg, stockLabel, type ProjectAnalysis, type Step } from "@opencutplan/core";
 import { useEffect, useMemo, useRef, useState } from "react";
+import type { PrintJob } from "../print/PrintView.tsx";
 import type { ProjectStore } from "../state/useProject.ts";
 import { keepProgress, setStepDone, shopState, writeProgress } from "./progress.ts";
 
 interface ShopTabProps {
   store: ProjectStore;
   analysis: ProjectAnalysis;
+  onPrint(job: PrintJob): void;
 }
 
 /** Consecutive steps on the same sheet; in setup order the sequence can go back to an earlier sheet. */
@@ -19,7 +21,7 @@
   return runs;
 }
 
-export function ShopTab({ store, analysis }: ShopTabProps) {
+export function ShopTab({ store, analysis, onPrint }: ShopTabProps) {
   const { project, edit } = store;
   const { steps, context: ctx } = analysis;
   const state = useMemo(() => shopState(project, steps), [project, steps]);
@@ -76,6 +78,9 @@
         <button type="button" onClick={reset} disabled={state.done.size === 0}>
           Reset progress
         </button>
+        <button type="button" onClick={() => onPrint({ kind: "sequence" })}>
+          Print cut sequence
+        </button>
       </div>
       <div className="shop-body">
         <section className="shop-current" aria-labelledby="shop-current-title">
```

Apply this diff to `apps/web/src/screens/Workspace.tsx` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/src/screens/Workspace.tsx
+++ b/apps/web/src/screens/Workspace.tsx
@@ -1,8 +1,9 @@
 import { analyzeProject, serializeProject, withCuts, type Project } from "@opencutplan/core";
-import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
+import { useCallback, useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
 import { TextInput } from "../components/fields.tsx";
 import { LayoutTab } from "../layout/LayoutTab.tsx";
 import { useOptimizeRuns } from "../optimizer/useOptimizeRuns.ts";
+import { PrintView, type PrintJob } from "../print/PrintView.tsx";
 import type { WorkerFactory } from "../optimizer/useOptimizer.ts";
 import { usePrefs } from "../state/prefs.ts";
 import { useAutosave } from "../state/useAutosave.ts";
@@ -51,6 +52,8 @@
   const [notices, setNotices] = useState(initialNotices);
   const [handle, setHandle] = useState(initialHandle);
   const [fileStatus, setFileStatus] = useState<string | null>(null);
+  const [printJob, setPrintJob] = useState<PrintJob | null>(null);
+  const endPrint = useCallback(() => setPrintJob(null), []);
   const saveError = useAutosave(storage, id, project, stored);
 
   useEffect(() => {
@@ -162,8 +165,9 @@
         {tab === "stock" && <StockTab store={store} />}
         {tab === "tools" && <ToolsTab store={store} storage={storage} />}
         {tab === "layout" && <LayoutTab store={store} analysis={analysis} prefs={prefs} runs={runs} />}
-        {tab === "shop" && <ShopTab store={store} analysis={analysis} />}
+        {tab === "shop" && <ShopTab store={store} analysis={analysis} onPrint={setPrintJob} />}
       </div>
+      {printJob && <PrintView job={printJob} analysis={analysis} onDone={endPrint} />}
       {settingsOpen && <SettingsDrawer store={store} prefs={prefs} onPrefs={setPrefs} onClose={() => setSettingsOpen(false)} />}
     </div>
   );
```

Apply this diff to `apps/web/src/styles.css` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/src/styles.css
+++ b/apps/web/src/styles.css
@@ -137,6 +137,35 @@
 .shop-steps li.done button { color: var(--muted); text-decoration: line-through; }
 .shop-steps input[type="checkbox"] { width: 20px; height: 20px; flex: none; }
 
+.print-root { display: none; }
+@media print {
+  html, body { background: #fff; }
+  body:has(> .print-root) > #root { display: none; }
+  .print-root { display: block; font-size: 10pt; color: #000; }
+  .print-page { break-after: page; }
+  .print-page:last-child { break-after: auto; }
+  .print-root h1 { font-size: 16pt; margin: 0 0 8pt; }
+  .print-root h2 { font-size: 13pt; margin: 0 0 2pt; }
+  .print-meta { margin: 0 0 6pt; color: #444; }
+  .print-diagram svg { display: block; }
+  .print-key { list-style: none; padding: 0; margin: 6pt 0 0; columns: 3; column-gap: 12pt; font-size: 9pt; }
+  .print-note { font-size: 8.5pt; margin: 4pt 0 0; }
+  .print-stage { margin-left: 6pt; font-weight: 600; }
+  .print-sheet-body.key-beside { display: flex; gap: 6mm; align-items: flex-start; }
+  .print-sheet-body.key-beside .print-key { columns: 1; margin: 0; }
+  .print-sequence-sheet { margin-bottom: 14pt; }
+  .print-sequence-sheet > h2, .print-sequence-sheet > .print-diagram { break-after: avoid; }
+  .print-steps { list-style: none; padding: 0; margin: 6pt 0 0; }
+  .print-steps li { display: flex; gap: 6pt; margin: 0 0 5pt; break-inside: avoid; }
+  .print-box { font-size: 13pt; line-height: 1; }
+  .print-root table.grid th, .print-root table.grid td { border-bottom: 0.5pt solid #999; }
+  .label-page { position: relative; overflow: hidden; }
+  .label { position: absolute; box-sizing: border-box; padding: 0.06in 0.1in; overflow: hidden; display: flex; flex-direction: column; justify-content: center; font-size: 8pt; line-height: 1.2; }
+  .label strong { font-size: 9pt; }
+  .label-page[data-layout="thermal-4x2"] .label { font-size: 14pt; padding: 0.15in 0.2in; }
+  .label-page[data-layout="thermal-4x2"] .label strong { font-size: 18pt; }
+}
+
 @media (max-width: 800px) {
   .layout-body { grid-template-columns: 1fr; }
   .layout-side { border-left: none; padding-left: 0; }
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run --root apps/web test/print.test.tsx test/ShopTab.test.tsx test/Workspace.test.tsx`

Expected: PASS (web: 11 new tests).

- [ ] **Step 5: Run the full check**

Run: `npm run check` from the repo root.

Expected: the typecheck is clean; core has 369 tests and the web app has 107 tests, all passing; the build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/print/scale.ts apps/web/src/reports/money.ts apps/web/src/reports/ShoppingTables.tsx apps/web/src/print/PrintView.tsx apps/web/src/shop/ShopTab.tsx apps/web/src/screens/Workspace.tsx apps/web/src/styles.css apps/web/test/print.test.tsx apps/web/test/ShopTab.test.tsx apps/web/test/Workspace.test.tsx
git commit -m "feat(web): print sheet diagrams, the cut sequence, the shopping list, and labels" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```


---

### Task 5: Reports tab

**Files:**
- Modify: `apps/web/src/storage/files.ts`
- Create: `apps/web/src/reports/offcuts.ts`
- Create: `apps/web/src/reports/ReportsTab.tsx`
- Modify: `apps/web/src/screens/Workspace.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/test/ReportsTab.test.tsx`
- Test (modify): `apps/web/test/Workspace.test.tsx`

**Interfaces:**
- Consumes: Task 1: `sheetSvg`, `groupColors`. Task 2: `LABEL_LAYOUTS`, `labelLayout`, `labelPages`, `labelsPerPage`. Task 4: `PrintJob`, `ShoppingTables`. Core: `saveOffcutsToStock`, `exportPartsCsv`, `exportStockCsv`. Web: `downloadText(text, name, type)` in `src/storage/files.ts`.
- Produces (new or changed exports):
  - `apps/web/src/storage/files.ts`: `function fileBase(name: string): string`
  - `apps/web/src/reports/offcuts.ts`: `function unsavedOffcuts(project: Project, offcuts: readonly Offcut[]): Offcut[]`
  - `apps/web/src/reports/ReportsTab.tsx`: `function ReportsTab({ store, analysis, onPrint }: ReportsTabProps)`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/test/ReportsTab.test.tsx`:

```tsx
import { analyzeProject, type Project } from "@opencutplan/core";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrintJob } from "../src/print/PrintView.tsx";
import { unsavedOffcuts } from "../src/reports/offcuts.ts";
import { ReportsTab } from "../src/reports/ReportsTab.tsx";
import { useProject, type ProjectStore } from "../src/state/useProject.ts";
import { fileBase } from "../src/storage/files.ts";
import { sampleProject } from "./helpers.ts";

function renderReports(initial: Project = sampleProject(), onPrint: (job: PrintJob) => void = () => undefined) {
  let latest: ProjectStore | null = null;
  function Harness() {
    const store = useProject(initial);
    latest = store;
    const analysis = useMemo(() => analyzeProject(store.project), [store.project]);
    return <ReportsTab store={store} analysis={analysis} onPrint={onPrint} />;
  }
  render(<Harness />);
  return () => latest!;
}

function withFeatures(features: Partial<Project["settings"]["features"]>): Project {
  const project = sampleProject();
  return { ...project, settings: { ...project.settings, features: { ...project.settings.features, ...features } } };
}

function captureDownloads() {
  const files: { name: string; blob: Blob }[] = [];
  let last: Blob | null = null;
  URL.createObjectURL = (blob: Blob) => {
    last = blob;
    return "blob:report";
  };
  URL.revokeObjectURL = () => undefined;
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    files.push({ name: this.download, blob: last! });
  });
  return files;
}

afterEach(() => {
  delete (URL as { createObjectURL?: unknown }).createObjectURL;
  delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
  vi.restoreAllMocks();
});

const section = (name: string) => screen.getByRole("region", { name });

describe("ReportsTab", () => {
  it("shows the shopping list with costs, the subtotal, the total, and the sheet use", () => {
    renderReports();
    const shopping = within(section("Shopping list"));
    expect(shopping.getByRole("heading", { name: "Plywood", level: 3 })).toBeTruthy();
    expect(shopping.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Stock", "Size", "In the plan", "To buy", "Unit cost", "Cost", "Sheet", "Stock", "Parts use"]);
    const row = shopping.getAllByRole("row")[1]!;
    expect(within(row).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(['Plywood 96" × 48"', '96" × 48"', "1", "1", "$60.00", "$60.00"]);
    expect(shopping.getByRole("rowheader", { name: "Subtotal" })).toBeTruthy();
    expect(shopping.getByText("Parts use 16% of this stock. Waste is 84%.")).toBeTruthy();
    expect(shopping.getByText("Total: $60.00")).toBeTruthy();
  });

  it("hides the costs when the cost feature is off", () => {
    renderReports(withFeatures({ cost: false }));
    const shopping = within(section("Shopping list"));
    expect(shopping.queryByRole("columnheader", { name: "Cost" })).toBeNull();
    expect(shopping.queryByText(/Total/)).toBeNull();
  });

  it("names the stock that has no price instead of a total", () => {
    const project = sampleProject();
    delete project.stock[0]!.cost;
    renderReports(project);
    expect(screen.getByText('⚠ The total is not known. This stock has no price: Plywood 96" × 48".')).toBeTruthy();
  });

  it("saves each offcut to stock once, and the save can be undone", async () => {
    const current = renderReports();
    const offcuts = within(section("Offcuts"));
    expect(offcuts.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      'Sheet 1: 65 3/8" × 12" Plywood',
      'Sheet 1: 65 3/8" × 12" Plywood',
      'Sheet 1: 95 1/2" × 23 1/4" Plywood',
    ]);
    await userEvent.click(offcuts.getByRole("button", { name: "Save offcuts to stock" }));
    expect(current().project.stock.filter((stock) => stock.kind === "offcut")).toHaveLength(3);
    expect(offcuts.getByRole("status").textContent).toBe("3 offcuts were added to the Stock tab.");
    expect(offcuts.getByRole("button", { name: "Every offcut is in stock" })).toHaveProperty("disabled", true);
    act(() => current().undo());
    expect(offcuts.getByRole("button", { name: "Save offcuts to stock" })).toHaveProperty("disabled", false);
  });

  it("counts two offcuts of the same size separately", () => {
    const project = sampleProject();
    const { offcuts } = analyzeProject(project);
    const oneSaved = { ...project, stock: [...project.stock, { id: "o1", material: "ply", length: 65.375, width: 12, quantity: 1, cost: 0, kind: "offcut" as const, trim: 0, name: "Offcut from Test, sheet 1" }] };
    expect(unsavedOffcuts(oneSaved, offcuts).map((offcut) => offcut.rect.y)).toEqual([12.375, 24.5]);
    renderReports(oneSaved);
    expect(screen.getByRole("button", { name: "Save 2 new offcuts to stock" })).toBeTruthy();
  });

  it("counts the label pages from the start position and prints the labels", async () => {
    const onPrint = vi.fn();
    renderReports(sampleProject(), onPrint);
    const labels = within(section("Labels"));
    expect(labels.getByRole("combobox", { name: "Label sheet" })).toHaveProperty("value", "avery-5160");
    expect(labels.getByText("3 labels on 1 page.")).toBeTruthy();
    await userEvent.selectOptions(labels.getByRole("combobox", { name: "Start at label" }), "30");
    expect(labels.getByText("3 labels on 2 pages.")).toBeTruthy();
    await userEvent.click(labels.getByRole("button", { name: "Print labels" }));
    expect(onPrint).toHaveBeenCalledWith({ kind: "labels", layout: "avery-5160", start: 30 });
    await userEvent.selectOptions(labels.getByRole("combobox", { name: "Label sheet" }), "thermal-4x2");
    expect(labels.queryByRole("combobox", { name: "Start at label" })).toBeNull();
    expect(labels.getByText("3 labels on 3 pages.")).toBeTruthy();
  });

  it("hides offcuts and labels when their features are off", () => {
    renderReports(withFeatures({ offcuts: false, labels: false }));
    expect(screen.queryByRole("region", { name: "Offcuts" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Labels" })).toBeNull();
  });

  it("prints and exports", async () => {
    const onPrint = vi.fn();
    const files = captureDownloads();
    renderReports({ ...sampleProject(), project: { ...sampleProject().project, name: "Shelf: v2" } }, onPrint);
    const output = within(section("Print and export"));
    await userEvent.click(output.getByRole("button", { name: "Print sheet diagrams" }));
    await userEvent.click(output.getByRole("button", { name: "Print cut sequence" }));
    await userEvent.click(output.getByRole("button", { name: "Print shopping list" }));
    expect(onPrint.mock.calls.map(([job]) => job)).toEqual([{ kind: "sheets" }, { kind: "sequence" }, { kind: "shopping" }]);
    await userEvent.click(output.getByRole("button", { name: "Export parts CSV" }));
    await userEvent.click(output.getByRole("button", { name: "Export stock CSV" }));
    await userEvent.click(output.getByRole("button", { name: "Sheet 1 as SVG" }));
    expect(files.map((file) => [file.name, file.blob.type])).toEqual([
      ["Shelf- v2-parts.csv", "text/csv"],
      ["Shelf- v2-stock.csv", "text/csv"],
      ["Shelf- v2-sheet-1.svg", "image/svg+xml"],
    ]);
    expect(await files[0]!.blob.text()).toMatch(/^name,length,width,quantity,material,grain,group,notes\r?\nSide,30,12,2,Plywood,length,,/);
    expect(await files[2]!.blob.text()).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="-1\.6 -1\.6 99\.2 51\.2" width="99\.2in"/);
  });

  it("says there is no plan and keeps the CSV exports", () => {
    renderReports({ ...sampleProject(), plan: { sheets: [] } });
    expect(screen.getByText("There is no plan yet. Optimize on the Layout tab.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Print sheet diagrams" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Print cut sequence" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Export parts CSV" })).toHaveProperty("disabled", false);
    expect(screen.queryByRole("region", { name: "Shopping list" })).toBeNull();
  });
});

describe("fileBase", () => {
  it("makes the project name safe for a file name", () => {
    expect(fileBase('  a/b:c*"d"  ')).toBe("a-b-c-d-");
    expect(fileBase("   ")).toBe("project");
  });
});
```

Apply this diff to `apps/web/test/Workspace.test.tsx` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/test/Workspace.test.tsx
+++ b/apps/web/test/Workspace.test.tsx
@@ -150,4 +150,14 @@
     expect(document.body.querySelector(".print-root")).toBeNull();
     print.mockRestore();
   });
+
+  it("prints the sheet diagrams from the Reports tab", async () => {
+    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
+    await renderWorkspace();
+    await userEvent.click(screen.getByRole("tab", { name: "Reports" }));
+    await userEvent.click(screen.getByRole("button", { name: "Print sheet diagrams" }));
+    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
+    expect(document.body.querySelector(":scope > .print-root")?.getAttribute("data-job")).toBe("sheets");
+    print.mockRestore();
+  });
 });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run --root apps/web test/ReportsTab.test.tsx test/Workspace.test.tsx`

Expected: FAIL — the new modules or exports do not exist yet (`Failed to resolve import`, `is not a function`, or a missing element).

- [ ] **Step 3: Write the code**

Apply this diff to `apps/web/src/storage/files.ts` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/src/storage/files.ts
+++ b/apps/web/src/storage/files.ts
@@ -84,7 +84,11 @@
   }
 }
 
+/** The project name made safe for a file name. */
+export function fileBase(name: string): string {
+  return name.trim().replace(/[\\/:*?"<>|]+/g, "-") || "project";
+}
+
 export function projectFileName(name: string): string {
-  const base = name.trim().replace(/[\\/:*?"<>|]+/g, "-") || "project";
-  return `${base}.cutplan.json`;
+  return `${fileBase(name)}.cutplan.json`;
 }
```

Create `apps/web/src/reports/offcuts.ts`:

```ts
import { saveOffcutsToStock, type Offcut, type Project, type Stock } from "@opencutplan/core";

function key(stock: Stock): string {
  return [stock.name ?? "", stock.material, stock.length, stock.width].join("|");
}

/** The offcuts that "Save offcuts to stock" has not added yet: stock of kind offcut with the same name, material, and size counts as saved, once each. */
export function unsavedOffcuts(project: Project, offcuts: readonly Offcut[]): Offcut[] {
  const saved = new Map<string, number>();
  for (const stock of project.stock) {
    if (stock.kind === "offcut") saved.set(key(stock), (saved.get(key(stock)) ?? 0) + 1);
  }
  return offcuts.filter((offcut) => {
    const stock = saveOffcutsToStock(project, [offcut]).stock.at(-1)!;
    const count = saved.get(key(stock)) ?? 0;
    if (count === 0) return true;
    saved.set(key(stock), count - 1);
    return false;
  });
}
```

Create `apps/web/src/reports/ReportsTab.tsx`:

```tsx
import {
  exportPartsCsv,
  exportStockCsv,
  formatSize,
  groupColors,
  LABEL_LAYOUTS,
  labelLayout,
  labelPages,
  labelsPerPage,
  materialName,
  saveOffcutsToStock,
  sheetSvg,
  type LabelLayoutId,
  type ProjectAnalysis,
} from "@opencutplan/core";
import { useMemo, useState } from "react";
import type { PrintJob } from "../print/PrintView.tsx";
import type { ProjectStore } from "../state/useProject.ts";
import { downloadText, fileBase } from "../storage/files.ts";
import { unsavedOffcuts } from "./offcuts.ts";
import { ShoppingTables } from "./ShoppingTables.tsx";

interface ReportsTabProps {
  store: ProjectStore;
  analysis: ProjectAnalysis;
  onPrint(job: PrintJob): void;
}

export function ReportsTab({ store, analysis, onPrint }: ReportsTabProps) {
  const { project, edit } = store;
  const ctx = analysis.context;
  const planned = analysis.sheets.length > 0;
  const base = fileBase(project.project.name);
  const colors = useMemo(() => groupColors(project), [project]);
  const unsaved = useMemo(() => unsavedOffcuts(project, analysis.offcuts), [project, analysis.offcuts]);
  const [offcutStatus, setOffcutStatus] = useState<string | null>(null);
  const [layoutId, setLayoutId] = useState<LabelLayoutId>(ctx.units === "in" ? "avery-5160" : "avery-l7160");
  const [start, setStart] = useState(1);
  const layout = labelLayout(layoutId);
  const perPage = labelsPerPage(layout);
  const firstLabel = Math.min(start, perPage);
  const pageCount = labelPages(analysis.labels, layout, firstLabel).length;

  const saveOffcuts = () => {
    edit((p) => saveOffcutsToStock(p, unsavedOffcuts(p, analysis.offcuts)));
    setOffcutStatus(`${unsaved.length === 1 ? "1 offcut was" : `${unsaved.length} offcuts were`} added to the Stock tab.`);
  };

  return (
    <div className="reports">
      <section aria-labelledby="reports-output">
        <h2 id="reports-output">Print and export</h2>
        {!planned && <p className="muted">There is no plan yet. Optimize on the Layout tab.</p>}
        <div className="buttons">
          <button type="button" onClick={() => onPrint({ kind: "sheets" })} disabled={!planned}>
            Print sheet diagrams
          </button>
          <button type="button" onClick={() => onPrint({ kind: "sequence" })} disabled={analysis.steps.length === 0}>
            Print cut sequence
          </button>
          <button type="button" onClick={() => onPrint({ kind: "shopping" })} disabled={!planned}>
            Print shopping list
          </button>
          <button type="button" onClick={() => downloadText(exportPartsCsv(project), `${base}-parts.csv`, "text/csv")}>
            Export parts CSV
          </button>
          <button type="button" onClick={() => downloadText(exportStockCsv(project), `${base}-stock.csv`, "text/csv")}>
            Export stock CSV
          </button>
        </div>
        {planned && (
          <div className="buttons" role="group" aria-label="SVG drawings">
            {analysis.sheets.map((sheet) => (
              <button
                key={sheet.sheet.id}
                type="button"
                onClick={() => downloadText(sheetSvg(ctx, sheet, analysis.steps, { colors }), `${base}-sheet-${sheet.index + 1}.svg`, "image/svg+xml")}
              >
                Sheet {sheet.index + 1} as SVG
              </button>
            ))}
          </div>
        )}
      </section>

      {planned && (
        <section aria-labelledby="reports-shopping">
          <h2 id="reports-shopping">Shopping list</h2>
          <ShoppingTables analysis={analysis} level={3} />
        </section>
      )}

      {planned && ctx.features.offcuts && (
        <section aria-labelledby="reports-offcuts">
          <h2 id="reports-offcuts">Offcuts</h2>
          {analysis.offcuts.length === 0 ? (
            <p className="muted">This plan leaves no offcuts.</p>
          ) : (
            <>
              <ul>
                {analysis.offcuts.map((offcut, index) => (
                  <li key={index}>
                    Sheet {offcut.sheetNumber}: {formatSize(ctx, offcut.rect)} {materialName(ctx, offcut.material)}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={saveOffcuts} disabled={unsaved.length === 0}>
                {unsaved.length === 0 ? "Every offcut is in stock" : unsaved.length === analysis.offcuts.length ? "Save offcuts to stock" : `Save ${unsaved.length} new ${unsaved.length === 1 ? "offcut" : "offcuts"} to stock`}
              </button>
            </>
          )}
          {offcutStatus && (
            <p role="status" className="ok">
              {offcutStatus}
            </p>
          )}
        </section>
      )}

      {ctx.features.labels && (
        <section aria-labelledby="reports-labels">
          <h2 id="reports-labels">Labels</h2>
          <div className="toolbar">
            <label className="inline">
              Label sheet
              <select value={layoutId} onChange={(event) => setLayoutId(event.target.value as LabelLayoutId)}>
                {LABEL_LAYOUTS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            {perPage > 1 && (
              <label className="inline">
                Start at label
                <select value={firstLabel} onChange={(event) => setStart(Number(event.target.value))}>
                  {Array.from({ length: perPage }, (_, index) => (
                    <option key={index} value={index + 1}>
                      {index + 1}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <p>
            {analysis.labels.length} labels on {pageCount} {pageCount === 1 ? "page" : "pages"}.
          </p>
          <button type="button" onClick={() => onPrint({ kind: "labels", layout: layoutId, start: firstLabel })} disabled={analysis.labels.length === 0}>
            Print labels
          </button>
        </section>
      )}
    </div>
  );
}
```

Apply this diff to `apps/web/src/screens/Workspace.tsx` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/src/screens/Workspace.tsx
+++ b/apps/web/src/screens/Workspace.tsx
@@ -4,6 +4,7 @@
 import { LayoutTab } from "../layout/LayoutTab.tsx";
 import { useOptimizeRuns } from "../optimizer/useOptimizeRuns.ts";
 import { PrintView, type PrintJob } from "../print/PrintView.tsx";
+import { ReportsTab } from "../reports/ReportsTab.tsx";
 import type { WorkerFactory } from "../optimizer/useOptimizer.ts";
 import { usePrefs } from "../state/prefs.ts";
 import { useAutosave } from "../state/useAutosave.ts";
@@ -22,6 +23,7 @@
   { id: "tools", label: "Tools" },
   { id: "layout", label: "Layout" },
   { id: "shop", label: "Shop" },
+  { id: "reports", label: "Reports" },
 ] as const;
 
 export type TabId = (typeof TABS)[number]["id"];
@@ -166,6 +168,7 @@
         {tab === "tools" && <ToolsTab store={store} storage={storage} />}
         {tab === "layout" && <LayoutTab store={store} analysis={analysis} prefs={prefs} runs={runs} />}
         {tab === "shop" && <ShopTab store={store} analysis={analysis} onPrint={setPrintJob} />}
+        {tab === "reports" && <ReportsTab store={store} analysis={analysis} onPrint={setPrintJob} />}
       </div>
       {printJob && <PrintView job={printJob} analysis={analysis} onDone={endPrint} />}
       {settingsOpen && <SettingsDrawer store={store} prefs={prefs} onPrefs={setPrefs} onClose={() => setSettingsOpen(false)} />}
```

Apply this diff to `apps/web/src/styles.css` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/src/styles.css
+++ b/apps/web/src/styles.css
@@ -137,6 +137,12 @@
 .shop-steps li.done button { color: var(--muted); text-decoration: line-through; }
 .shop-steps input[type="checkbox"] { width: 20px; height: 20px; flex: none; }
 
+.reports section + section { margin-top: 24px; }
+.reports h2 { margin-bottom: 6px; }
+.shopping-material + .shopping-material { margin-top: 14px; }
+.shopping-total { font-size: 16px; font-weight: 700; }
+.shopping-sheets { margin-top: 14px; }
+
 .print-root { display: none; }
 @media print {
   html, body { background: #fff; }
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run --root apps/web test/ReportsTab.test.tsx test/Workspace.test.tsx`

Expected: PASS (web: 11 new tests).

- [ ] **Step 5: Run the full check**

Run: `npm run check` from the repo root.

Expected: the typecheck is clean; core has 369 tests and the web app has 118 tests, all passing; the build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/storage/files.ts apps/web/src/reports/offcuts.ts apps/web/src/reports/ReportsTab.tsx apps/web/src/screens/Workspace.tsx apps/web/src/styles.css apps/web/test/ReportsTab.test.tsx apps/web/test/Workspace.test.tsx
git commit -m "feat(web): add the Reports tab with exports and offcuts" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```


---

### Task 6: End-to-end tests and CI

**Files:**
- Modify: `apps/web/package.json`
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/tsconfig.json`
- Create: `apps/web/e2e/plan.e2e.ts`
- Create: `.github/workflows/ci.yml`
- Modify: `package-lock.json` (by `npm install`)

**Interfaces:**
- Consumes: Every earlier task: the tests drive the Parts, Stock, Layout, Shop, and Reports tabs by their accessible names.
- Produces (new or changed exports): nothing that later tasks import.

- [ ] **Step 1: Add Playwright and the scripts**

Apply this diff to `apps/web/package.json` (save it to a file, then `git apply <file>`):

```diff
--- a/apps/web/package.json
+++ b/apps/web/package.json
@@ -7,7 +7,8 @@
     "dev": "vite",
     "build": "vite build",
     "preview": "vite preview",
-    "test": "vitest run"
+    "test": "vitest run",
+    "e2e": "playwright test"
   },
   "dependencies": {
     "@opencutplan/core": "0.1.0",
@@ -15,6 +16,7 @@
     "react-dom": "19.3.0"
   },
   "devDependencies": {
+    "@playwright/test": "1.63.0",
     "@testing-library/dom": "10.4.2",
     "@testing-library/react": "16.3.3",
     "@testing-library/user-event": "14.6.7",
```

Apply this diff to `package.json` (save it to a file, then `git apply <file>`):

```diff
--- a/package.json
+++ b/package.json
@@ -12,11 +12,12 @@
   "scripts": {
     "dev": "npm run dev -w @opencutplan/web",
     "build": "npm run build -w @opencutplan/web",
-    "typecheck": "tsc -p packages/core && tsc -p examples && tsc -p apps/web",
+    "typecheck": "tsc -p packages/core && tsc -p examples && tsc -p apps/web && tsc -p apps/web/e2e",
     "test": "npm test -w @opencutplan/core && npm test -w @opencutplan/web",
     "schema": "node packages/core/scripts/write-schema.ts",
     "examples": "node examples/build.ts",
-    "check": "npm run typecheck && npm test && npm run build"
+    "check": "npm run typecheck && npm test && npm run build",
+    "e2e": "npm run e2e -w @opencutplan/web"
   },
   "devDependencies": {
     "@types/node": "26.6.3",
```

Apply this diff to `.gitignore` (save it to a file, then `git apply <file>`):

```diff
--- a/.gitignore
+++ b/.gitignore
@@ -1,3 +1,5 @@
 node_modules/
 dist/
 .DS_Store
+test-results/
+playwright-report/
```

Run `npm install` from the repo root. Expected: it adds `@playwright/test` 1.63.0 and updates `package-lock.json`, with no errors. Then run `npx playwright install chromium` (it prints nothing, or downloads Chromium once).

- [ ] **Step 2: Add the Playwright config, the end-to-end tests, and the CI workflow**

Create `apps/web/playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

const PORT = 4180;

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } }],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

Create `apps/web/e2e/tsconfig.json`:

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["es2023", "dom", "dom.iterable"],
    "types": ["node"]
  },
  "include": [".", "../playwright.config.ts"]
}
```

Create `apps/web/e2e/plan.e2e.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";

const PARTS = `name,length,width,quantity,material,grain
Side,30,12,2,Plywood,length
Shelf,20,10,3,Plywood,none`;

const STOCK = `material,length,width,quantity,cost
Plywood,96,48,unlimited,60`;

declare global {
  interface Window {
    printed?: number;
  }
}

async function optimize(page: Page) {
  await page.getByRole("tab", { name: "Layout" }).click();
  await page.getByRole("button", { name: "Optimize", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator("[data-copy-key][role=button]").first()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {
      window.printed = (window.printed ?? 0) + 1;
    };
  });
});

test("plans a project from CSV, keeps shop progress, and prints and exports it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await page.getByLabel("Name").fill("E2E shelf");
  await page.getByRole("button", { name: "Create project" }).click();

  await page.getByRole("button", { name: "Paste rows…" }).click();
  await page.getByLabel("Rows (paste from a spreadsheet, or edit)").fill(PARTS);
  await page.getByRole("button", { name: "Import 2 rows" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("tab", { name: "Stock" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import CSV…" }).click();
  await (await chooser).setFiles({ name: "stock.csv", mimeType: "text/csv", buffer: Buffer.from(STOCK) });
  await page.getByRole("button", { name: "Import 1 row" }).click();

  await optimize(page);

  await page.getByRole("tab", { name: "Shop" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(/^Step 1\. /);
  await page.getByRole("button", { name: "Mark done" }).click();
  await expect(page.getByText(/^1 of \d+ steps done\.$/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(/^Step 2\. /);
  await page.waitForTimeout(1000);
  await page.reload();
  await page.getByRole("tab", { name: "Shop" }).click();
  await expect(page.getByRole("checkbox", { name: "Step 1 done" })).toBeChecked();

  await page.getByRole("tab", { name: "Reports" }).click();
  await expect(page.getByText(/^Total: /)).toBeVisible();
  await page.getByRole("button", { name: "Print sheet diagrams" }).click();
  await expect.poll(() => page.evaluate(() => window.printed)).toBe(1);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-root .print-page").first()).toBeVisible();
  await expect(page.locator(".print-root").getByRole("heading", { name: /^Sheet 1 of \d+: Plywood 96" × 48"$/ })).toBeVisible();
  await expect(page.locator("#root")).toBeHidden();
  const pdf = await page.pdf();
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.emulateMedia({ media: "screen" });
  await expect(page.locator(".print-root")).toHaveCount(0);
  await expect(page.locator("#root")).toBeVisible();

  const svgDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Sheet 1 as SVG" }).click();
  const svg = await svgDownload;
  expect(svg.suggestedFilename()).toBe("E2E shelf-sheet-1.svg");
  expect(await readDownload(svg)).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);

  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export parts CSV" }).click();
  const csv = await csvDownload;
  expect(csv.suggestedFilename()).toBe("E2E shelf-parts.csv");
  expect(await readDownload(csv)).toMatch(/^\uFEFFname,length,width,quantity,material,grain,group,notes\r?\nSide,30,12,2,Plywood,length,,/);

  expect(errors).toEqual([]);
});

test("edits the layout with the mouse and the keyboard, and undoes the edits", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Name").fill("E2E editor");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("button", { name: "Paste rows…" }).click();
  await page.getByLabel("Rows (paste from a spreadsheet, or edit)").fill(PARTS);
  await page.getByRole("button", { name: "Import 2 rows" }).click();
  await page.getByRole("tab", { name: "Stock" }).click();
  await page.getByRole("button", { name: "Paste rows…" }).click();
  await page.getByLabel("Rows (paste from a spreadsheet, or edit)").fill(STOCK);
  await page.getByRole("button", { name: "Import 1 row" }).click();
  await optimize(page);

  const tray = page.getByRole("region", { name: /Unplaced parts/ });
  const part = page.getByRole("button", { name: /^Side 1,/ });
  const from = (await part.boundingBox())!;
  const to = (await tray.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2 + 20, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(tray.getByRole("button", { name: /Side 1/ })).toBeVisible();

  await page.getByRole("button", { name: /^Side 2,/ }).focus();
  await page.keyboard.press("r");
  await expect(page.getByRole("button", { name: /^Side 2,/ })).toHaveAttribute("aria-label", /turned/);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: /^Side 2,/ })).not.toHaveAttribute("aria-label", /turned/);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(tray.getByRole("button", { name: /Side 1/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Side 1,/ })).toBeVisible();
});

async function readDownload(download: { createReadStream(): Promise<NodeJS.ReadableStream> }): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
```

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-results
          path: apps/web/test-results
```

- [ ] **Step 3: Run the end-to-end tests**

Run: `npm run e2e` from the repo root.

Expected: it builds the app, starts `vite preview` on port 4180, and reports `2 passed`. The two tests are `plans a project from CSV, keeps shop progress, and prints and exports it` and `edits the layout with the mouse and the keyboard, and undoes the edits`. Vitest must not pick up `e2e/*.e2e.ts`: the web tests stay at 118.

- [ ] **Step 4: Run the full check**

Run: `npm run check` from the repo root.

Expected: the typecheck is clean, now also for `apps/web/e2e`; core has 369 tests and the web app has 118 tests, all passing; the build succeeds. `git status --short` shows no `test-results/` or `playwright-report/` (they are ignored).

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json package.json .gitignore apps/web/playwright.config.ts apps/web/e2e/tsconfig.json apps/web/e2e/plan.e2e.ts .github/workflows/ci.yml package-lock.json
git commit -m "test(web): add Playwright end-to-end tests and a CI workflow" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```


---

### Task 7: Documentation

**Files:**
- Modify: `docs/cut-analysis.md`
- Modify: `docs/web-app.md`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-27-opencutplan-design.md`

**Interfaces:**
- Consumes: Every earlier task.
- Produces (new or changed exports): nothing that later tasks import.

- [ ] **Step 1: Update the guides, the README, and the spec**

Apply this diff to `docs/cut-analysis.md` (save it to a file, then `git apply <file>`):

```diff
--- a/docs/cut-analysis.md
+++ b/docs/cut-analysis.md
@@ -103,3 +103,12 @@
 - `partLabels`: one label per part copy with its name, group, size, material, grain (`none` when grain does not
   constrain the part), sheet number, and the step that cuts it free. A stuck part has no such step. `analyzeProject`
   returns no labels when the `labels` feature is off.
+- `sheetSvg`: a standalone SVG drawing of one sheet in project units, with the parts in their group colours, grain
+  stripes and arrows, the trim zone, and numbered cut lines in stage colours. Options pick the group colours, the
+  `width` and `height` attributes, a step to draw stronger, and the steps to draw as done. `sheetSvgExtent` gives the
+  area it draws: the sheet and a margin on every side, so the numbers on edge cuts are not clipped. All text is
+  escaped, so the result is safe to put in a page.
+- `groupColors` and `stageColor` give the colours that the drawings use. A part without a group is `NO_GROUP_COLOR`.
+- `LABEL_LAYOUTS` has the label sheets: Avery 5160 (US Letter, 3 × 10), Avery L7160 (A4, 3 × 7), and a 4 × 2 in
+  thermal label. `labelPages(labels, layout, start)` puts the labels on pages from a start position (1 is the top
+  left, then along the row) and fills the rest of the last page with `null`.
```

Apply this diff to `docs/web-app.md` (save it to a file, then `git apply <file>`):

````diff
--- a/docs/web-app.md
+++ b/docs/web-app.md
@@ -6,6 +6,7 @@
 ```bash
 npm run dev        # start a development server
 npm run build      # write a static build to apps/web/dist
+npm run e2e        # build, start a preview server, and run the Playwright tests
 ```
 
 The build uses relative paths, so `apps/web/dist` works from any static host or folder.
@@ -36,8 +37,8 @@
   use **Save file**.
 - **Save file** writes the project with its computed cut sequence (`plan.cuts`), so other tools can read the cuts.
 
-The tabs are **Parts**, **Stock**, **Tools**, and **Layout**. The left and right arrow keys move between tabs.
-The **Shop** and **Reports** tabs come in the next phase, with printing and export.
+The tabs are **Parts**, **Stock**, **Tools**, **Layout**, **Shop**, and **Reports**. The left and right arrow keys
+move between tabs.
 
 ### Parts
 
@@ -92,6 +93,53 @@
 
 A layout with problems is never blocked: the user can keep editing, and the Problems list updates after each change.
 
+### Shop
+
+The cut sequence as a checklist for use at the saw. It works on a phone: the step and its sheet come first, and the
+list follows.
+
+- The current step shows its text (the piece, the fence or stop setting, and what each side of the cut holds) and its
+  sheet. On the drawing, the current cut is thick and filled, and the cuts that are done are grey.
+- **Mark done** ticks the current step and goes to the next step that is not done. **← Previous** and **Next →** move
+  without a tick. The list groups the steps by sheet; a click on a step makes it current, and its box ticks it.
+- The ticks are saved in the project (`extensions["opencutplan.app"].progress`), so they stay after a reload and go
+  with the file. A tick is an edit, so **Undo** removes it.
+- The saved ticks belong to one cut sequence. When an edit changes the sequence, the ticks no longer show, and a
+  banner offers **Start over** (clear them) or **Keep my ticks** (use the same step numbers for the new sequence).
+  Editing is never blocked.
+- **Reset progress** clears every tick after a confirmation. **Print cut sequence** prints the checklist.
+
+### Reports
+
+- **Print and export**: **Print sheet diagrams**, **Print cut sequence**, **Print shopping list**, **Export parts
+  CSV**, **Export stock CSV**, and one **Sheet N as SVG** button for each sheet. File names start with the project
+  name: `Shelf-parts.csv`, `Shelf-stock.csv`, `Shelf-sheet-1.svg`.
+- **Shopping list**: for each material, the stock, its size, the sheets in the plan, the count to buy (owned offcuts
+  are not bought), the unit cost, the cost, and a subtotal; then the share of the stock that parts use, and the waste.
+  The total follows, or a warning that names the stock with no price. The cost columns are hidden when the `cost`
+  feature is off. A second table gives the use of each sheet.
+- **Offcuts** (when the `offcuts` feature is on) lists the waste pieces that are at least the smallest useful offcut.
+  **Save offcuts to stock** adds them to the Stock tab as owned offcuts. It adds each offcut once: an offcut that is
+  already in stock with the same name, material, and size is not added again.
+- **Labels** (when the `labels` feature is on): pick the label sheet and the first free label on it, then **Print
+  labels**. Each label has the part name, size, material, group, grain arrow (↔ along the length, ↕ along the width),
+  and the sheet and step that cut it, or "Not placed".
+
+With no plan, the tab says so and offers only the CSV exports.
+
+### Printing
+
+Each print button opens the browser's print dialog with only that output; the app is hidden on paper. Use the
+dialog's "Save as PDF" for a PDF.
+
+- **Sheet diagrams**: one landscape page per sheet with the sheet number, the stock, and the scale. The drawing uses
+  the largest of 1:1, 1:2, 1:4, 1:5, 1:8, 1:10, 1:12, 1:16, 1:20, 1:25, and 1:50 that fits; the page says "Scale
+  1:12", or "Not to scale" when none fits. The key lists the parts with their sizes and grain, and explains the cut
+  numbers and stage colours. The key goes beside the drawing when that gives a larger scale.
+- **Cut sequence**: portrait pages with a small drawing of each sheet and a box to tick for each step.
+- **Shopping list**: the tables from the Reports tab.
+- **Labels**: the page size of the label sheet with no margins. Print at 100% ("Actual size"), not "Fit to page".
+
 ### Settings
 
 The settings drawer has the feature switches, units and display precision, cut order, edge trim, the smallest useful
@@ -103,3 +151,9 @@
 
 `npm test -w @opencutplan/web` runs the component tests with Vitest, jsdom, Testing Library, and fake-indexeddb.
 The optimizer tests run the real worker protocol in the test thread.
+
+`npm run e2e` runs the Playwright tests in `apps/web/e2e` in Chromium against a production build. They cover a new
+project from CSV through optimize, the Shop checklist across a reload, printing (with a PDF of the print pages), and
+the SVG and CSV downloads; and drag, rotate, and undo in the layout editor. Install the browser once with
+`npx playwright install chromium`. `npm run check` does not run them; CI runs both
+(`.github/workflows/ci.yml`).
````

Apply this diff to `README.md` (save it to a file, then `git apply <file>`):

````diff
--- a/README.md
+++ b/README.md
@@ -1,16 +1,17 @@
 # OpenCutPlan
 
 An open-source planner for cutting plywood and other sheet goods with a table saw, track saw, circular saw, or panel
-saw. It is under development: this repository contains the core library (file format, CSV, cut analysis, and the
-optimizer) and a web app to enter parts, stock, and tools and to edit layouts.
+saw. This repository contains the core library (file format, CSV, cut analysis, and the optimizer) and a web app to enter
+parts, stock, and tools, to edit layouts, to follow the cut sequence at the saw, and to print sheet diagrams, the cut
+sequence, a shopping list, and part labels.
 
 - **File format:** [`docs/format.md`](docs/format.md) and the JSON Schema in [`schema/`](schema/).
 - **Cut analysis:** [`docs/cut-analysis.md`](docs/cut-analysis.md) — the layout validator, guillotine cut tree, tool
   rules, shop sequence, offcuts, and reports.
 - **Optimizer:** [`docs/optimizer.md`](docs/optimizer.md) — plan generation, the objective, pinning, and the worker
   protocol.
-- **Web app:** [`docs/web-app.md`](docs/web-app.md) — the screens, the layout editor and its keys, and where projects
-  are stored.
+- **Web app:** [`docs/web-app.md`](docs/web-app.md) — the screens, the layout editor and its keys, the Shop
+  checklist, reports, printing, and where projects are stored.
 - **Examples:** [`examples/`](examples/) — `living-room-shelf` (inches, with a full layout) and
   `simple-bookcase-mm` (metric, with an owned offcut and two saws).
 - **Design:** [`docs/superpowers/specs/`](docs/superpowers/specs/).
@@ -24,6 +25,7 @@
 npm run dev        # start the web app at http://localhost:5173
 npm run build      # build the web app into apps/web/dist
 npm run check      # typecheck, run all tests, and build the web app
+npm run e2e        # run the Playwright end-to-end tests (first: npx playwright install chromium)
 npm run schema     # regenerate schema/cutplan.schema.json after changing the format
 npm run examples   # regenerate the files in examples/ after changing a builder
 ```
````

Apply this diff to `docs/superpowers/specs/2026-09-27-opencutplan-design.md` (save it to a file, then `git apply <file>`):

```diff
--- a/docs/superpowers/specs/2026-09-27-opencutplan-design.md
+++ b/docs/superpowers/specs/2026-09-27-opencutplan-design.md
@@ -308,8 +308,9 @@
 ### 7.3 Shop view
 
 Phone-friendly checklist of steps (§6.4). The current step is highlighted on the sheet diagram. Ticking a step saves
-progress in `extensions["opencutplan.app"].progress`. Any edit to the plan that changes the sequence resets progress
-after a confirmation.
+progress in `extensions["opencutplan.app"].progress` as `{ sequence, done }`: a fingerprint of the steps and the
+ticked step numbers. Any edit to the plan that changes the sequence resets progress after a confirmation: the old
+ticks stop showing, and a banner offers **Start over** or **Keep my ticks**. Editing is never blocked.
 
 ### 7.4 Accessibility and responsiveness
 
@@ -366,7 +367,8 @@
   - Sequence: tool assignment against each limit; fence settings; `setup` order respects dependencies.
 - **Web**: component tests for the parts table and CSV mapping; Playwright end-to-end smoke tests: CSV paste →
   optimize → shop view → print preview; drag, rotate, and undo in the editor.
-- **CI**: typecheck, lint, tests, schema up-to-date check, build.
+- **CI**: typecheck, lint, tests, schema up-to-date check, build, and the Playwright tests
+  (`.github/workflows/ci.yml`). TypeScript's strict mode is the lint; the schema check is a core test.
 
 ## 12. Delivery phases
 
```

- [ ] **Step 2: Check that nothing else changed**

Run: `git diff --stat`

Expected: only the four files above change.

- [ ] **Step 3: Run the full check**

Run: `npm run check` from the repo root.

Expected: the typecheck is clean; core has 369 tests and the web app has 118 tests, all passing; the build succeeds.

- [ ] **Step 4: Commit**

```bash
git add docs/cut-analysis.md docs/web-app.md README.md docs/superpowers/specs/2026-09-27-opencutplan-design.md
git commit -m "docs: describe the Shop and Reports tabs, printing, and the end-to-end tests" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

