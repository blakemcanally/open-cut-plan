# Stock library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put each length that the app writes on a nanometre grid and show `~` before a rounded length; then add the missing sheet thicknesses, pine 1x boards, and 2x framing lumber to the catalogue; add a thickness picker on the Stock tab; and warn when a typed thickness is a nominal value.

**Architecture:** A new core module, `geometry/precision.ts`, snaps lengths to whole nanometres where they go into the project, and `formatLength` marks a rounded value with `~`. The catalogue data stays in `packages/core/src/catalog/`, with the two board families in their own data files. Two new core modules, `nominal.ts` (the warning rule and its text) and `thicknesses.ts` (the picker options), serve the design checks, the CLI, and the web app. The file format goes to 1.9 for one optional material field, `measured`.

**Tech Stack:** TypeScript, Zod (file schema), Vitest, React (web app), Playwright (end-to-end tests), Node.js 24+.

**Spec:** [`docs/superpowers/specs/2026-10-04-stock-library-design.md`](../specs/2026-10-04-stock-library-design.md)

## Global Constraints

- Work in the worktree `/Users/bmcanally/Development/open-cut-plan/worktrees/stock-library`, on the branch `stock-library`. Run every command from the worktree root.
- Catalogue rules (`docs/catalog.md`): each listing has `store`, `priceUsd` (or `null`), `source` (an `https://` address), and `checked` (`YYYY-MM-DD`). Never guess a price. Give the length before the width. Give each size in inches and in millimetres (`lengthMm = Math.round(lengthIn * 25.4)`). Give `thicknessMm` to 0.1 mm. Do not change an existing id.
- When the stores give different actual sizes, use the Home Depot size, and give the other size in `notes`.
- The thickness tolerance is 0.005" (0.1 mm), the same as `THICKNESS_TOLERANCE` in `packages/core/src/catalog/catalog.ts`.
- Lengths: the app writes each length on a grid of whole nanometres (`snapLength`, Task 1). A length that the display rounds shows with `~` (Task 2).
- An actual thickness, a likely thickness, and the size of an error always show with `formatExactLength(value, units)` (Task 2): a fraction to 1/64", else a decimal to 0.0001"; 0.001 in millimetres. Other lengths use `formatLength` with the project display (`project.settings.display`).
- A catalogue thickness that a store gives as a 64th rounded to 3 places is the exact fraction, for example `45 / 64` (Task 3). New catalogue data follows the same rule.
- The file format becomes `"1.9"`. The only new file field is `materials[].measured` (boolean, optional).
- The app's own default materials stay as they are: `DEFAULT_THICKNESS.in` is 0.75 (`packages/core/src/edit/parts.ts`) and the default back is `Plywood 1/4"` at 0.25 (`apps/web/src/design/form.ts`). The warning fires for them on purpose: the app does not know what the user bought.
- The warning is for inch projects only.
- Docs use the plain style of the existing docs: short sentences, one idea in each sentence, active voice.
- Code comments: no comment that restates the code. Match the comment density of the file.
- Commit messages follow the repository style: one plain sentence that starts with a verb, for example "Add pine 1x boards to the catalogue". End each message with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Before each commit, run the tests of the packages that the task touched. Task 2 and Task 15 run `npm run e2e` too. Task 15 runs `npm run check`.

## Review Focus

1. **A measured value that equals another nominal value.** 3/16" (birch 1/4" actual) is itself a nominal value. 7/16" (CDX 15/32" actual) is too. A user who types a measured 3/16" gets a 3/16" warning. **Measured** must stop it, and the choice must survive a save and a load. Test: Task 9 (the rule), Task 8 (load and save).
2. **Unit conversion.** A project converted from inches to millimetres and back keeps `measured`, and a millimetre project never warns. Test: Task 8 and Task 9.
3. **Two project materials that look like one catalogue material.** Two materials both named `MDF 3/4"` at 0.75" must both be exempt. A rule that uses `projectMaterialFor` (it returns only the first match) would warn for the second. Test: Task 9.
4. **The picker in a millimetre project.** The options show millimetres, and a pick stores the catalogue millimetre value (for example 18, not 17.99). Test: Task 10 and Task 13.
5. **A catalogue name with the wrong thickness.** A material named `Birch plywood 3/4"` at 0.75" is not the catalogue material (the catalogue gives 45/64"), so it must warn. Test: Task 9.
6. **A rounded value in a field.** A field shows the exact value, so a user who tabs through a field with `~0.7087"` (18 mm in an inch project) must not change the value. `parseLength` reads the `~`, and the value goes back to the same grid point. Test: Task 1 (`parseLength` with `~`) and Task 2 (`formatExactLength`).
7. **The setup order and `~`.** Two fence settings at the same mark, one exact and one rounded, must stay in one setup group. Test: Task 2.

---

### Task 1: A nanometre grid for the lengths that the app writes

**Files:**
- Create: `packages/core/src/geometry/precision.ts`
- Modify: `packages/core/src/index.ts` (export it)
- Modify: `packages/core/src/geometry/parse.ts` (`parseLength`)
- Modify: `packages/core/src/csv/mapping.ts` (the length of a cell, near line 106)
- Modify: `packages/core/src/edit/units.ts` (`converter`)
- Modify: `packages/core/src/design/generate.ts` (`designParts`)
- Modify: `docs/format.md`
- Create: `packages/core/test/geometry/precision.test.ts`
- Modify: `packages/core/test/geometry/parse.test.ts`, `packages/core/test/design/units.test.ts`, `packages/core/test/design/generate.test.ts`

**Interfaces:**
- Consumes: `Units`, `convertLength` (`packages/core/src/geometry/units.ts`).
- Produces:

```ts
export const NM_PER_UNIT: Readonly<Record<Units, number>>; // { in: 25_400_000, mm: 1_000_000 }
export function toNm(value: number, units: Units): number; // a whole number of nanometres
export function fromNm(nm: number, units: Units): number;
export function snapLength(value: number, units: Units): number; // fromNm(toNm(value, units), units)
```

Background. A length in the file stays a number in the project units. The app now puts each length that it writes on a grid of whole nanometres. 1 in is 25,400,000 nm, so 1/64", 0.001", and 0.1 mm are whole numbers of nanometres. KiCad (`PCB_IU_PER_MM = 1e6`) and Gerber files (6 decimals of a millimetre) use the same grid. JSON does not lose a number: `JSON.parse(JSON.stringify(x)) === x` for each finite double. The errors come from arithmetic and conversion, and the grid removes them at the places where a length goes into the project. The optimizer and `EPSILON` (`packages/core/src/geometry/rect.ts`) do not change. The file format does not change.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/geometry/precision.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { convertLength, fromNm, NM_PER_UNIT, snapLength, toNm } from "../../src/index.ts";

describe("the nanometre grid", () => {
  it("holds 1/64 inch, 0.001 inch, and 0.1 mm as whole numbers", () => {
    expect(NM_PER_UNIT).toEqual({ in: 25_400_000, mm: 1_000_000 });
    expect(toNm(1 / 64, "in")).toBe(396_875);
    expect(toNm(0.001, "in")).toBe(25_400);
    expect(toNm(0.1, "mm")).toBe(100_000);
    expect(fromNm(396_875, "in")).toBe(1 / 64);
  });

  it("removes the error of arithmetic", () => {
    expect(snapLength(5 * (0.75 - 0.703), "in")).toBe(0.235);
    expect(snapLength(0.1 + 0.2, "mm")).toBe(0.3);
    expect(snapLength(5 * (0.75 - 45 / 64), "in")).toBe(15 / 64);
  });

  it("gives the same value again for a value on the grid", () => {
    for (const value of [0.75, 45 / 64, 13.188976378, 1219.2, 0.1]) {
      const snapped = snapLength(value, "in");
      expect(snapLength(snapped, "in")).toBe(snapped);
    }
  });

  it("converts millimetres to inches and back with no change", () => {
    for (const mm of [18, 1219.2, 335, 0.1, 2438, 17.9]) {
      const inches = snapLength(convertLength(mm, "mm", "in"), "in");
      expect(snapLength(convertLength(inches, "in", "mm"), "mm")).toBe(mm);
    }
  });

  it("writes and reads a value on the grid through JSON with no change", () => {
    const values = [snapLength(18 / 25.4, "in"), snapLength(13.188976378, "in"), 45 / 64, 1219.2];
    expect(JSON.parse(JSON.stringify(values))).toEqual(values);
  });
});
```

Add to `packages/core/test/geometry/parse.test.ts` (import `snapLength` with the other names):

```ts
describe("parseLength on the nanometre grid", () => {
  it("puts the value on the grid of the project units", () => {
    expect(parseLength("18 mm", "in")).toBe(snapLength(18 / 25.4, "in"));
    expect(parseLength("0.1", "mm")).toBe(0.1);
    expect(parseLength("45/64", "in")).toBe(45 / 64);
  });

  it("reads a value that starts with ~, as the app shows a rounded value", () => {
    expect(parseLength('~3/4"', "in")).toBe(0.75);
    expect(parseLength("~ 17.9 mm", "mm")).toBe(17.9);
    expect(parseLength("~", "in")).toBeNull();
  });
});
```

Add to `packages/core/test/design/units.test.ts` (import `snapLength` and `regenerateDesigns`, and use the fixtures that the file has):

```ts
it("puts each converted length on the grid, so that a conversion to inches and back gives the same project", () => {
  const project = regenerateDesigns(designProject([kallaxDesign()]));
  const inches = convertProjectUnits(project, "in");
  expect(inches.parts.length).toBeGreaterThan(0);
  for (const part of inches.parts) {
    expect(snapLength(part.length, "in")).toBe(part.length);
    expect(snapLength(part.width, "in")).toBe(part.width);
  }
  expect(convertProjectUnits(inches, "mm")).toEqual(project);
});
```

Add to `packages/core/test/design/generate.test.ts` (use the fixtures that the file has, and import `convertProjectUnits` and `snapLength`):

```ts
it("gives generated parts a length and a width on the grid", () => {
  const project = regenerateDesigns(convertProjectUnits(regenerateDesigns(designProject([kallaxDesign()])), "in"));
  for (const part of project.parts) {
    expect(snapLength(part.length, "in"), part.id).toBe(part.length);
    expect(snapLength(part.width, "in"), part.id).toBe(part.width);
  }
});
```

If a file has no `designProject` or `kallaxDesign` fixture, copy the fixture from `packages/core/test/design/checks.test.ts`, or import it from `packages/core/test/helpers.ts` if it is there.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run test/geometry test/design --root packages/core`
Expected: FAIL: `toNm` is not exported.

- [ ] **Step 3: Implement**

Create `packages/core/src/geometry/precision.ts`:

```ts
import type { Units } from "./units.ts";

/** Whole nanometres hold 1/64 in, 0.001 in, and 0.1 mm with no error. KiCad and Gerber files use the same grid. */
export const NM_PER_UNIT: Readonly<Record<Units, number>> = { in: 25_400_000, mm: 1_000_000 };

export function toNm(value: number, units: Units): number {
  return Math.round(value * NM_PER_UNIT[units]);
}

export function fromNm(nm: number, units: Units): number {
  return nm / NM_PER_UNIT[units];
}

export function snapLength(value: number, units: Units): number {
  return fromNm(toNm(value, units), units);
}
```

In `packages/core/src/index.ts`, after `export * from "./geometry/units.ts";`:

```ts
export * from "./geometry/precision.ts";
```

In `packages/core/src/geometry/parse.ts`:

```ts
export function parseLength(text: string, units: Units, options: NumberOptions = {}): number | null {
  const value = finite(lengthOf(text.trim().replace(/^~\s*/, ""), units, options));
  return value === null ? null : snapLength(value, units);
}
```

In `packages/core/src/csv/mapping.ts`, near line 106, put the converted value on the grid:

```ts
  return { text, value: value === null ? null : snapLength(convertLength(value, base, units), units) };
```

In `packages/core/src/edit/units.ts`, replace `converter` and its comment:

```ts
function converter(from: Units, to: Units): (value: number) => number {
  return (value) => snapLength(convertLength(value, from, to), to);
}
```

The grid step is 1/25,400,000 in, so the rounding error is less than 2e-8 in. A layout check adds up to four converted values, and 4 × 2e-8 is well below `EPSILON` (1e-6). Keep the part of the old comment that says the step must stay below `EPSILON / 4`, and change the example to the grid.

In `packages/core/src/design/generate.ts`, in `designParts`:

```ts
  const units = project.project.units;
  const snap = (part: Part): Part => ({ ...part, length: snapLength(part.length, units), width: snapLength(part.width, units) });
  return buildDesignParts(design, geometry).map((part) => keepStoredSize(snap(part), stored.get(part.id)));
```

In `docs/format.md`, after the paragraph that says that lengths are in the project units, add:

```markdown
The app writes each length on a grid of whole nanometres: a multiple of 1/25,400,000 in, or of 0.000001 mm. This grid holds 1/64", 0.001", and 0.1 mm with no error. A file from another program can have any length; the app puts a length on the grid when it changes it.
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --root packages/core && npx vitest run --root packages/cli && npx vitest run --root apps/web`
Expected: PASS. An old test can expect a value such as `1219.1999999999998` or a 1e-9 rounding. Change it to the value on the grid only when the new value is nearer to the true value. If a test fails for another reason, stop and report it.

- [ ] **Step 5: Commit**

```bash
git add packages/core docs/format.md
git commit -m "Put each length that the app writes on a grid of whole nanometres

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Show `~` before a rounded length, and show exact lengths where they matter

**Files:**
- Modify: `packages/core/src/geometry/format.ts`
- Modify: `packages/core/src/sequence/sequence.ts` (the setup key, near line 186)
- Modify: `apps/web/src/components/fields.tsx` (`LengthInput`)
- Modify: `apps/web/src/components/CatalogDialog.tsx` (the actual thickness, near line 72)
- Modify: `packages/cli/src/commands/catalog.ts` (the actual thickness)
- Modify: `packages/core/test/geometry/format.test.ts`, and the tests in `packages`, `apps/web/test`, and `apps/web/e2e` that expect a rounded length
- Modify: `docs/web-app.md`, `docs/cli.md`, `docs/format.md` (the `display` row)

**Interfaces:**
- Consumes: `toNm` (Task 1).
- Produces:

```ts
export function formatLength(value: number, units: Units, display?: DisplayPrecision): string; // "~" before a value that the display rounds
export function formatExactLength(value: number, units: Units): string;
```

Background. The display rounds a length to 1/32" or 0.5 mm by default, so `0.703"` and `45/64"` both show as `23/32"`. The user cannot see that the value is not exact. OpenCutList puts `~` before a rounded value. This task does the same. Where the exact value matters (an input, an actual thickness, the size of an error), the app uses `formatExactLength`: a fraction to 1/64" or a decimal to 4 places in inches, and 3 decimals in millimetres.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/geometry/format.test.ts`, import `formatExactLength`. Change the rows of the two `it.each` tables to:

```ts
    [42.59370078740158, 32, '~42 19/32"'],
    [15.375, 32, '15 3/8"'],
    [0.25, 16, '1/4"'],
    [60, 32, '60"'],
    [27.21, 8, '~27 1/4"'],
    [0.99, 8, '~1"'],
    [15.375, "decimal", '15.375"'],
    [-1.5, 32, '-1 1/2"'],
    [-0.001, 32, '~0"'],
    [-0.0001, "decimal", '~0"'],
    [42.5, "decimal", '42.5"'],
```

```ts
    [1081.5, 0.5, "1081.5 mm"],
    [1081.7, 0.5, "~1081.5 mm"],
    [1081.76, 0.1, "~1081.8 mm"],
    [18, 1, "18 mm"],
    [1082, 0.5, "1082 mm"],
    [0.35, 0.1, "~0.4 mm"],
```

Add:

```ts
describe("the ~ before a rounded length", () => {
  it("shows ~ only when the display rounds the value", () => {
    expect(formatLength(45 / 64, "in", { inch: 32, mm: 1 })).toBe('~23/32"');
    expect(formatLength(45 / 64, "in", { inch: 64, mm: 1 })).toBe('45/64"');
    expect(formatLength(13.188976378, "in")).toBe('~13 3/16"');
    expect(formatLength(0.703, "in", { inch: "decimal", mm: 1 })).toBe('0.703"');
    expect(formatLength(1219.2, "mm")).toBe("~1219 mm");
    expect(formatLength(1219.2, "mm", { inch: 32, mm: 0.1 })).toBe("1219.2 mm");
    expect(formatLength(-0.3, "in", { inch: 8, mm: 1 })).toBe('~-1/4"');
  });
});

describe("formatExactLength", () => {
  it.each<[number, "in" | "mm", string]>([
    [45 / 64, "in", '45/64"'],
    [0.75, "in", '3/4"'],
    [28.625, "in", '28 5/8"'],
    [0.22, "in", '0.22"'],
    [18 / 25.4, "in", '~0.7087"'],
    [15 / 64, "in", '15/64"'],
    [18, "mm", "18 mm"],
    [17.9, "mm", "17.9 mm"],
    [1 / 3, "mm", "~0.333 mm"],
    [0, "in", '0"'],
  ])("%d %s is %s", (value, units, expected) => {
    expect(formatExactLength(value, units)).toBe(expected);
  });
});
```

Find the setup-order test in `packages/core/test/sequence/` (search for `orderMode: "setup"`). Add a test there, in the style of that file, that makes two rip cuts with the settings 13.1875 and 13.188976378 in an inch project at the default display. Expect the two cuts in one group, next to each other, as now: both settings show at the `13 3/16"` mark, one with `~` and one without.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run test/geometry test/sequence --root packages/core`
Expected: FAIL: no `~`, and `formatExactLength` is not exported.

- [ ] **Step 3: Implement**

In `packages/core/src/geometry/format.ts`, import `toNm` from `./precision.ts`, and change `formatLength`:

```ts
export function formatLength(value: number, units: Units, display: DisplayPrecision = DEFAULT_DISPLAY): string {
  const text = units === "in" ? formatInches(value, display.inch) : formatMillimetres(value, display.mm);
  return toNm(Math.abs(value), units) % gridStep(units, display) === 0 ? text : `~${text}`;
}

function gridStep(units: Units, display: DisplayPrecision): number {
  if (units === "mm") return Math.round(display.mm * 1_000_000);
  return display.inch === "decimal" ? 25_400 : 25_400_000 / display.inch;
}

/** A fraction to 1/64" or a decimal to 0.0001" in inches, and to 0.001 mm in millimetres, with ~ only past those digits. */
export function formatExactLength(value: number, units: Units): string {
  const nm = toNm(Math.abs(value), units);
  if (units === "in" && nm % 396_875 === 0) return formatInches(value, 64);
  const digits = units === "in" ? 4 : 3;
  const step = units === "in" ? 2_540 : 1_000;
  const text = trimZeros(Math.abs(value).toFixed(digits));
  const sign = value < 0 && text !== "0" ? "-" : "";
  const body = units === "in" ? `${sign}${text}"` : `${sign}${text} mm`;
  return nm % step === 0 ? body : `~${body}`;
}
```

The grid steps: 25,400,000 / 32 = 793,750 nm for 1/32"; 25,400 nm for 0.001"; 500,000 nm for 0.5 mm.

In `packages/core/src/sequence/sequence.ts`, near line 186, keep the old groups: take the `~` off the setting in the key.

```ts
  return `${cut.tool?.id ?? ""}|${cut.kind}|${formatIn(ctx, cut.setting).replace(/^~/, "")}`;
```

In `apps/web/src/components/fields.tsx`, `LengthInput` shows its value with `formatExactLength(value, units)` in place of `formatLength(value, units, display)`. If `display` is then not used, take it out of the props of `LengthInput` and of its callers. `parseLength` reads a leading `~` (Task 1), so a value that the user does not change commits with no change.

In `apps/web/src/components/CatalogDialog.tsx` near line 72, and in `packages/cli/src/commands/catalog.ts`, show the actual thickness with `formatExactLength(material.thickness, units)`. Keep the sizes as they are.

- [ ] **Step 4: Run all the tests and update the expected texts**

Run: `npx vitest run --root packages/core && npx vitest run --root packages/cli && npx vitest run --root apps/web && npm run e2e`

Expected: FAIL in many tests that expect a rounded length. Update each expected text by hand. **Rule:** a change may only add `~` before a length, or (for an input or an actual thickness) show the exact value in place of the rounded one. If a test needs any other change, stop and report it. Tests in millimetre projects at 0.5 mm need few changes. Tests in inch projects converted from millimetres need many.

After the update, run the same commands again. Expected: PASS.

- [ ] **Step 5: Update the docs**

In `docs/web-app.md` and `docs/cli.md`, where the docs tell how lengths show, add: "A length that the display rounds starts with `~`, for example `~13 3/16"`. A length field shows the exact value, as a fraction to 1/64" or a decimal to 0.0001"." In `docs/format.md`, in the `display` row, add: "A rounded value shows with `~`." Change any example output in the docs that now has `~`.

- [ ] **Step 6: Commit**

```bash
git add packages apps/web docs
git commit -m "Show ~ before a rounded length, and show the exact length in the fields and the catalogue thicknesses

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Exact store fractions in the catalogue

**Files:**
- Modify: `packages/core/src/catalog/data.ts`
- Modify: `packages/core/test/catalog/data.test.ts`, `packages/core/test/catalog/catalog.test.ts`, `packages/cli/test/catalog.test.ts`
- Modify: `docs/catalog.md`

**Interfaces:**
- Consumes: nothing new.
- Produces: catalogue thicknesses that are exact 64ths where the store gives a rounded 64th, for example `thicknessIn: 45 / 64` (0.703125) in place of 0.703.

Background. A store gives `0.703"` for a 45/64" sheet: the number is the fraction, rounded to 3 places. The catalogue now stores the fraction. Then the sum of five panels is exact, and the app can show `45/64"`.

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/catalog/data.test.ts`:

```ts
  it("gives a thickness that is a rounded 64th of an inch as the exact 64th", () => {
    for (const material of CATALOG) {
      const t = material.thicknessIn;
      const near = Math.round(t * 64) / 64;
      if (Math.abs(t - near) <= 0.0005) expect(t, material.id).toBe(near);
    }
  });
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run test/catalog/data.test.ts --root packages/core`
Expected: FAIL for `birch-ply-3-4` and others: 0.703 is not 0.703125.

- [ ] **Step 3: Change the data**

In `packages/core/src/catalog/data.ts`, change each such `thicknessIn` to a fraction literal. Do not change `thicknessMm`.

| Now | New |
|---|---|
| `0.188` | `3 / 16` |
| `0.203` | `13 / 64` |
| `0.234` | `15 / 64` |
| `0.438` | `7 / 16` |
| `0.469` | `15 / 32` |
| `0.688` | `11 / 16` |
| `0.703` | `45 / 64` |
| `0.719` | `23 / 32` |
| `0.734` | `47 / 64` |

Do not change a thickness that is not within 0.0005" of a 64th, for example `0.22`, `0.236`, `0.205`, or `0.709`. Those are decimal or metric products.

- [ ] **Step 4: Update the tests and the docs**

In `packages/core/test/catalog/catalog.test.ts`, the first `catalogFor` test expects `thickness: 45 / 64`. In `packages/cli/test/catalog.test.ts`, the two places that expect `thickness: 0.703` expect `45 / 64`. Search the tests for the other values in the table (`grep -rn "0\.703\|0\.188\|0\.469\|0\.438\|0\.688\|0\.719\|0\.734\|0\.234\|0\.203" packages apps/web --include="*.ts" --include="*.tsx"`) and change a value only where it comes from the catalogue.

In `docs/catalog.md`, after the line that says the thickness is the actual thickness, add: "When the store gives a thickness that is a 64th of an inch rounded to 3 places, for example 0.703", the catalogue stores the fraction (`45 / 64`). The data test checks this."

- [ ] **Step 5: Run the tests**

Run: `npx vitest run --root packages/core && npx vitest run --root packages/cli && npx vitest run --root apps/web`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages docs/catalog.md
git commit -m "Store the catalogue thicknesses that stores round from a 64th as the exact fraction

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Missing sheet thicknesses in the catalogue

**Files:**
- Modify: `packages/core/src/catalog/data.ts`
- Modify: `packages/core/test/catalog/data.test.ts`
- Modify: `packages/cli/test/catalog.test.ts:26-29` (the MDF list gets `mdf-5-8`)

**Interfaces:**
- Consumes: `CatalogMaterial`, `CatalogSize`, `CatalogListing` from `packages/core/src/catalog/types.ts`.
- Produces: new catalogue ids that later tasks may use in tests. The ids below are the names to use when the product exists.

| Id | Family | Name | Nominal |
|---|---|---|---|
| `birch-ply-1-8` | Hardwood plywood | `Birch plywood 1/8"` | `1/8"` |
| `cdx-ply-11-32` | Construction plywood | `CDX plywood 11/32"` | `3/8" (11/32")` |
| `cdx-ply-19-32` | Construction plywood | `CDX plywood 19/32"` | `5/8" (19/32")` |
| `pine-ply-11-32` | Construction plywood | `Sanded pine plywood 11/32"` | `3/8" (11/32")` |
| `pine-ply-19-32` | Construction plywood | `Sanded pine plywood 19/32"` | `5/8" (19/32")` |
| `mdf-5-8` | MDF | `MDF 5/8"` | `5/8"` |
| `particleboard-5-8` | Particleboard | `Particleboard 5/8"` | `5/8"` |
| `hardboard-white-1-8` | Hardboard | `White hardboard 1/8"` | `1/8"` |

- [ ] **Step 1: Research the listings**

Use WebSearch and WebFetch on homedepot.com and lowes.com. For each product in the table, find the product pages at both stores. Record, for each page: the actual thickness (titles often say "Actual 0.703 in."), each sheet size, the price (or `null` when the page shows none), the page address, and today's date (`date +%F`). Also record the sizes of the existing materials that a store sells and the catalogue does not have (for example a 2 × 4 ft or 4 × 4 ft panel). Write the findings to the scratchpad as TypeScript entries in the shape of `data.ts`. When a thickness is within 0.0005" of a 64th, write the fraction (for example `thicknessIn: 23 / 32` for 0.719"); the data test of Task 3 checks this:

```ts
  {
    id: "mdf-5-8",
    family: "MDF",
    name: 'MDF 5/8"',
    nominal: '5/8"',
    thicknessIn: 0.625,
    thicknessMm: 15.9,
    grained: false,
    notes: "Home Depot lists 0.625 in.",
    sizes: [
      {
        id: "mdf-5-8-4x8",
        label: "4 × 8 ft",
        lengthIn: 96,
        widthIn: 48,
        lengthMm: 2438,
        widthMm: 1219,
        listings: [
          { store: "Home Depot", priceUsd: 0, source: "https://www.homedepot.com/p/…", checked: "YYYY-MM-DD" },
        ],
      },
    ],
  },
```

(The numbers above show the shape only. Use the values from the pages.) When neither store sells a product, leave it out and add it to a list of left-out products. Task 15 puts that list in the backlog. When the page gives no actual thickness, use the nominal value, and write the note `The thickness is the nominal X; the actual thickness is not checked.`, as `pine-ply-15-32` does.

- [ ] **Step 2: Write the failing test**

In `packages/core/test/catalog/data.test.ts`, add a test with the ids that Step 1 found (this example lists all eight; remove the ids of left-out products):

```ts
  it("has the common thicknesses from 1/8 to 3/4 inch", () => {
    const ids = CATALOG.map((material) => material.id);
    expect(ids).toEqual(
      expect.arrayContaining(["birch-ply-1-8", "cdx-ply-11-32", "cdx-ply-19-32", "pine-ply-11-32", "pine-ply-19-32", "mdf-5-8", "particleboard-5-8", "hardboard-white-1-8"]),
    );
  });
```

- [ ] **Step 3: Run the test to see it fail**

Run: `npx vitest run packages/core/test/catalog/data.test.ts --root packages/core`
Expected: FAIL in "has the common thicknesses from 1/8 to 3/4 inch".

- [ ] **Step 4: Add the data**

Put each new material in `data.ts` next to the materials of its family, from the thinnest to the thickest. For example, `birch-ply-1-8` goes before `birch-ply-1-4`, and `cdx-ply-11-32` goes before `cdx-ply-15-32`. A family must stay together (the data test checks it). Give the sizes of a material from the largest to the smallest. Add the new sizes of existing materials in the same order.

- [ ] **Step 5: Run the core and CLI tests**

Run: `npx vitest run --root packages/core && npx vitest run --root packages/cli`
Expected: the data test passes. In `packages/cli/test/catalog.test.ts`, the MDF test now gets four materials. Change the expectations to `["mdf-1-4", "mdf-1-2", "mdf-5-8", "mdf-3-4"]`, `materials[3]` for the 3/4" size check, and `toHaveLength(4)`. Fix any other test that counts the catalogue in the same way, then run again. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/catalog/data.ts packages/core/test/catalog/data.test.ts packages/cli/test/catalog.test.ts
git commit -m "Add the missing 1/8, 3/8, and 5/8 inch sheet goods to the catalogue

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Pine 1x boards in the catalogue

**Files:**
- Modify: `packages/core/src/catalog/types.ts` (the `edges` field)
- Create: `packages/core/src/catalog/pine-boards.ts`
- Modify: `packages/core/src/catalog/data.ts` (append the boards to `CATALOG`)
- Modify: `packages/core/test/catalog/data.test.ts`

**Interfaces:**
- Produces: `CatalogMaterial.edges?: "factory"`; `PINE_BOARDS: readonly CatalogMaterial[]`; the ids `common-pine-1x` and `select-pine-1x`; size ids such as `common-pine-1x-1x4-8ft`; the family `Pine boards`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/core/test/catalog/data.test.ts`:

```ts
const TRADE_WIDTHS: Readonly<Record<number, number>> = { 2: 1.5, 3: 2.5, 4: 3.5, 6: 5.5, 8: 7.25, 10: 9.25, 12: 11.25 };

  it("gives edges only as factory", () => {
    for (const material of CATALOG) expect([undefined, "factory"], material.id).toContain(material.edges);
  });

  it("gives each board the actual width of its trade size, and a label and id from the trade size", () => {
    for (const material of CATALOG.filter((entry) => entry.edges === "factory")) {
      for (const size of material.sizes) {
        const match = /^([12])x(\d+) × /.exec(size.label);
        expect(match, size.id).not.toBeNull();
        expect(`${match![1]}x`, size.id).toBe(material.nominal);
        expect(TRADE_WIDTHS[Number(match![2])], size.id).toBe(Math.min(size.widthIn, size.lengthIn));
        expect(size.id.startsWith(`${material.id}-${match![1]}x${match![2]}-`), size.id).toBe(true);
      }
    }
  });

  it("has common and select pine 1x boards from 1x2 to 1x12", () => {
    for (const id of ["common-pine-1x", "select-pine-1x"]) {
      const material = CATALOG.find((entry) => entry.id === id)!;
      expect(material).toMatchObject({ family: "Pine boards", nominal: "1x", thicknessIn: 0.75, thicknessMm: 19.1, grained: true, edges: "factory" });
      expect(new Set(material.sizes.map((size) => size.label.split(" × ")[0]))).toEqual(new Set(["1x2", "1x3", "1x4", "1x6", "1x8", "1x10", "1x12"]));
    }
    expect(CATALOG.find((entry) => entry.id === "common-pine-1x")!.sizes.find((size) => size.id === "common-pine-1x-1x4-8ft")).toMatchObject({
      label: "1x4 × 8 ft",
      lengthIn: 96,
      widthIn: 3.5,
      lengthMm: 2438,
      widthMm: 89,
    });
  });
```

The `TRADE_WIDTHS` constant goes at the top of the file, under `sizes`. The three `it` blocks go in the `describe`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run packages/core/test/catalog/data.test.ts --root packages/core`
Expected: FAIL. TypeScript may also report that `edges` does not exist on `CatalogMaterial`.

- [ ] **Step 3: Add the type**

In `packages/core/src/catalog/types.ts`, add to `CatalogMaterial` after `grained`:

```ts
  /** "factory" when each size has good, finished edges, as a board has. */
  edges?: "factory";
```

- [ ] **Step 4: Research the listings**

Use WebSearch and WebFetch on homedepot.com and lowes.com. Find "Common Board" (the #2 or common pine board) and "Select Pine" (the clear board) for 1x2, 1x3, 1x4, 1x6, 1x8, 1x10, and 1x12, in 6, 8, 10, and 12 ft. Also find the short select pine lengths (2, 3, 4 ft) that a store sells. Record the store, the price (or `null`), the page address, and today's date. Record only the sizes that a store sells. The actual width is the trade width in the table of Step 1 of this task. The length is the length that the store lists (8 ft is 96").

- [ ] **Step 5: Write the data**

Create `packages/core/src/catalog/pine-boards.ts`. The labels are `1x4 × 8 ft` (for 2, 3, or 4 ft: `1x4 × 2 ft`). The ids are `<material id>-<trade>-<feet>ft`. Sort the sizes from the largest area to the smallest. The shape:

```ts
import type { CatalogMaterial } from "./types.ts";

export const PINE_BOARDS: readonly CatalogMaterial[] = [
  {
    id: "common-pine-1x",
    family: "Pine boards",
    name: "Common pine board 1x",
    nominal: "1x",
    thicknessIn: 0.75,
    thicknessMm: 19.1,
    grained: true,
    edges: "factory",
    notes: "Common (#2) pine board. The actual size of a 1x4 is 3/4 × 3 1/2 in.",
    sizes: [
      {
        id: "common-pine-1x-1x12-12ft",
        label: "1x12 × 12 ft",
        lengthIn: 144,
        widthIn: 11.25,
        lengthMm: 3658,
        widthMm: 286,
        listings: [{ store: "Home Depot", priceUsd: null, source: "https://www.homedepot.com/p/…", checked: "YYYY-MM-DD" }],
      },
    ],
  },
  {
    id: "select-pine-1x",
    family: "Pine boards",
    name: "Select pine board 1x",
    nominal: "1x",
    thicknessIn: 0.75,
    thicknessMm: 19.1,
    grained: true,
    edges: "factory",
    notes: "Select (clear) pine board.",
    sizes: [],
  },
];
```

(The listing above shows the shape only. Use the values from the pages. Each material must have at least one size.)

In `packages/core/src/catalog/data.ts`, rename the array to `SHEET_GOODS` and export the composed catalogue:

```ts
import { PINE_BOARDS } from "./pine-boards.ts";
import type { CatalogMaterial } from "./types.ts";

const SHEET_GOODS: readonly CatalogMaterial[] = [
  // … the existing entries, unchanged …
];

export const CATALOG: readonly CatalogMaterial[] = [...SHEET_GOODS, ...PINE_BOARDS];
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run --root packages/core && npx vitest run --root packages/cli`
Expected: PASS. A test that counts the families (for example in `packages/cli/test/catalog.test.ts`) may need the new family; update it.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/catalog packages/core/test/catalog packages/cli/test
git commit -m "Add common and select pine 1x boards to the catalogue, with factory edges

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 2x framing lumber in the catalogue

**Files:**
- Create: `packages/core/src/catalog/framing-lumber.ts`
- Modify: `packages/core/src/catalog/data.ts`
- Modify: `packages/core/test/catalog/data.test.ts`

**Interfaces:**
- Consumes: `CatalogMaterial.edges` (Task 5).
- Produces: `FRAMING_LUMBER: readonly CatalogMaterial[]`; the id `whitewood-2x`; size ids such as `whitewood-2x-2x4-8ft` and `whitewood-2x-2x4-92-5-8in`; the family `Framing lumber`.

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/catalog/data.test.ts`:

```ts
  it("has 2x framing lumber from 2x2 to 2x12, with the precut stud lengths", () => {
    const material = CATALOG.find((entry) => entry.id === "whitewood-2x")!;
    expect(material).toMatchObject({ family: "Framing lumber", name: "Whitewood 2x (SPF)", nominal: "2x", thicknessIn: 1.5, thicknessMm: 38.1, grained: true, edges: "factory" });
    expect(new Set(material.sizes.map((size) => size.label.split(" × ")[0]))).toEqual(new Set(["2x2", "2x3", "2x4", "2x6", "2x8", "2x10", "2x12"]));
    expect(material.sizes.find((size) => size.id === "whitewood-2x-2x4-92-5-8in")).toMatchObject({ label: "2x4 × 92 5/8 in", lengthIn: 92.625, widthIn: 3.5 });
  });
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run packages/core/test/catalog/data.test.ts --root packages/core`
Expected: FAIL in the new test.

- [ ] **Step 3: Research the listings**

Use WebSearch and WebFetch on homedepot.com and lowes.com. Find the whitewood, SPF, or "Prime" 2x lumber for 2x2, 2x3, 2x4, 2x6, 2x8, 2x10, and 2x12, in 8, 10, 12, and 16 ft. Find the 2x4 and 2x6 precut studs at 92 5/8" and 104 5/8". Record the store, the price (or `null`), the page address, and today's date. Record only the sizes that a store sells. The actual widths are 1.5, 2.5, 3.5, 5.5, 7.25, 9.25, and 11.25 in. 2x2 is 1.5 × 1.5 in.

- [ ] **Step 4: Write the data**

Create `packages/core/src/catalog/framing-lumber.ts`, in the shape of `pine-boards.ts`:

```ts
import type { CatalogMaterial } from "./types.ts";

export const FRAMING_LUMBER: readonly CatalogMaterial[] = [
  {
    id: "whitewood-2x",
    family: "Framing lumber",
    name: "Whitewood 2x (SPF)",
    nominal: "2x",
    thicknessIn: 1.5,
    thicknessMm: 38.1,
    grained: true,
    edges: "factory",
    notes: "Whitewood or SPF framing lumber. The actual size of a 2x4 is 1 1/2 × 3 1/2 in. The edges are rounded.",
    sizes: [
      // from the largest area to the smallest; labels "2x12 × 16 ft" and "2x4 × 92 5/8 in";
      // ids "whitewood-2x-2x12-16ft" and "whitewood-2x-2x4-92-5-8in"
    ],
  },
];
```

Fill `sizes` with the researched sizes, and remove the comment. In `data.ts`, import it and change the export to:

```ts
export const CATALOG: readonly CatalogMaterial[] = [...SHEET_GOODS, ...PINE_BOARDS, ...FRAMING_LUMBER];
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run --root packages/core && npx vitest run --root packages/cli`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/catalog packages/core/test/catalog packages/cli/test
git commit -m "Add 2x framing lumber to the catalogue, with the precut stud lengths

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Boards from the catalogue keep their factory edges

**Files:**
- Modify: `packages/core/src/catalog/catalog.ts` (`addCatalogStock`)
- Modify: `packages/core/src/catalog/suggest.ts` (`suggestedStock`)
- Modify: `packages/core/test/catalog/catalog.test.ts`
- Modify: `packages/core/test/catalog/suggest.test.ts`
- Modify: `docs/catalog.md`

**Interfaces:**
- Consumes: `CatalogMaterial.edges`, `common-pine-1x`, `whitewood-2x` (Tasks 5 and 6).
- Produces: stock with `trim: 0` for a size of a material with `edges: "factory"`.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/catalog/catalog.test.ts`, in the `describe` of `addCatalogStock` (or a new `describe("addCatalogStock with boards")`):

```ts
  it("keeps the factory edges of a board, and trims a sheet as the project says", () => {
    const board = addCatalogStock(project(), "common-pine-1x-1x4-8ft");
    expect(board.project.stock[0]).toMatchObject({ id: "common-pine-1x-1x4-8ft", length: 96, width: 3.5, kind: "sheet", trim: 0 });
    expect(board.project.materials[0]).toMatchObject({ id: "common-pine-1x", thickness: 0.75 });
    const sheet = addCatalogStock(project(), "birch-ply-3-4-4x8");
    expect(sheet.project.stock[0]).not.toHaveProperty("trim");
  });
```

If the size `common-pine-1x-1x4-8ft` does not exist after Task 5, use another `common-pine-1x` size that exists.

In `packages/core/test/catalog/suggest.test.ts`:

```ts
  it("keeps the factory edges of the largest board of a board material", () => {
    const base = project();
    const boards = { ...base, materials: [{ id: "whitewood-2x", name: "Studs", thickness: 1.5, grained: true }] };
    expect(suggestedStock(boards, "whitewood-2x")).toMatchObject({ material: "whitewood-2x", trim: 0 });
    expect(suggestedStock(project(), "birch")).not.toHaveProperty("trim");
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run packages/core/test/catalog --root packages/core`
Expected: FAIL: the board stock has no `trim`.

- [ ] **Step 3: Implement**

In `addCatalogStock` in `catalog.ts`, after the `stock` object:

```ts
  if (found.material.edges === "factory") stock.trim = 0;
```

In `suggestedStock` in `suggest.ts`, after the `stock` object of a catalogue entry:

```ts
  if (entry.edges === "factory") stock.trim = 0;
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --root packages/core`
Expected: PASS.

- [ ] **Step 5: Update `docs/catalog.md`**

- In "The catalogue is a list of common sheet goods…": say that it also has pine 1x boards and 2x framing lumber.
- In "The data": the data is in `data.ts` (sheet goods), `pine-boards.ts`, and `framing-lumber.ts`. Give the new counts of materials and sizes (count them with a short script or a test print; do not guess). Add `edges` to the Material row: `"factory"` when the edges of each size are good, as on a board.
- Add a section "Boards":
  - A board is normal stock: a narrow sheet with grain. The optimizer can rip it.
  - The label of a size is the trade size and the length, for example `1x4 × 8 ft`. The size is the actual size, for example 96" × 3.5".
  - Stock that comes from a board size gets `trim: 0` ("use factory edges"), so the project trim does not cut the board. The suggested sheet of a board material does the same.
- In "Where the data comes from": add the date of the new research.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/catalog packages/core/test/catalog docs/catalog.md
git commit -m "Keep the factory edges of boards from the catalogue, and describe the boards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: File format 1.9 with `measured` on a material

**Files:**
- Modify: `packages/core/src/format/schema.ts` (`FORMAT_VERSION`, `MaterialSchema`)
- Modify: `packages/core/src/format/version.ts` (`SUPPORTED_MINOR`)
- Modify: `packages/core/src/edit/stock.ts` (`updateMaterial`)
- Modify: `packages/core/test/edit/edit.test.ts`, `packages/core/test/format/parse.test.ts`, and the tests that name the version (see Step 6)
- Modify: `schema/cutplan.schema.json` (generated), `examples/*.cutplan.json` (generated)
- Modify: `docs/format.md`

**Interfaces:**
- Produces: `Material.measured?: boolean`. `updateMaterial(project, id, patch)` removes `measured` when `patch.thickness` is a new value and `patch` has no `measured` key.

- [ ] **Step 1: Write the failing tests**

In `packages/core/test/edit/edit.test.ts` (import `updateMaterial` and `convertProjectUnits` from `../../src/index.ts` if the file does not yet):

```ts
describe("updateMaterial and measured", () => {
  const withMeasured = (): Project => {
    const project = sampleProject();
    return { ...project, materials: project.materials.map((m) => ({ ...m, measured: true })) };
  };

  it("clears measured when the thickness changes, and keeps it for the same thickness or another field", () => {
    const id = withMeasured().materials[0]!.id;
    expect(updateMaterial(withMeasured(), id, { thickness: 0.5 }).materials[0]).not.toHaveProperty("measured");
    expect(updateMaterial(withMeasured(), id, { thickness: withMeasured().materials[0]!.thickness }).materials[0]!.measured).toBe(true);
    expect(updateMaterial(withMeasured(), id, { name: "Shop ply" }).materials[0]!.measured).toBe(true);
  });

  it("keeps measured when the patch sets it with the thickness", () => {
    const id = withMeasured().materials[0]!.id;
    expect(updateMaterial(withMeasured(), id, { thickness: 45 / 64, measured: true }).materials[0]).toMatchObject({ thickness: 45 / 64, measured: true });
  });

  it("keeps measured through a change of units and back", () => {
    const there = convertProjectUnits(withMeasured(), "mm");
    expect(there.materials[0]!.measured).toBe(true);
    expect(convertProjectUnits(there, "in").materials[0]!.measured).toBe(true);
  });
});
```

Use the `sampleProject` helper that the file already imports; if the file has none, import it from `../helpers.ts`.

In `packages/core/test/format/parse.test.ts`, next to the 1.7 test:

```ts
  it("loads a 1.8 file as version 1.9 with no warnings, and keeps measured through a save and a load", () => {
    const doc = JSON.parse(serializeProject(sampleProject()));
    doc.version = "1.8";
    const result = parseProject(doc);
    expect(result.ok && result.project.version).toBe("1.9");
    expect(result.warnings).toEqual([]);
    const measured = JSON.parse(serializeProject(sampleProject()));
    measured.materials[0].measured = true;
    const loaded = parseProject(measured);
    expect(loaded.ok && loaded.project.materials[0]!.measured).toBe(true);
    const again = parseProject(serializeProject(loaded.ok ? loaded.project : sampleProject()));
    expect(again.ok && again.project.materials[0]!.measured).toBe(true);
  });

  it("refuses a material whose measured is not a boolean", () => {
    const doc = JSON.parse(serializeProject(sampleProject()));
    doc.materials[0].measured = "yes";
    expect(parseProject(doc).ok).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run packages/core/test/edit/edit.test.ts packages/core/test/format/parse.test.ts --root packages/core`
Expected: FAIL: the version is 1.8, `measured` is kept after a thickness change, and `"yes"` is accepted.

- [ ] **Step 3: Implement the format change**

In `packages/core/src/format/schema.ts`:

```ts
export const FORMAT_VERSION = "1.9";
```

and in `MaterialSchema`, after `color`:

```ts
    measured: z.boolean().optional(),
```

In `packages/core/src/format/version.ts`:

```ts
export const SUPPORTED_MINOR = 9;
```

- [ ] **Step 4: Implement the edit rule**

Replace `updateMaterial` in `packages/core/src/edit/stock.ts`:

```ts
/** A new thickness with no `measured` in the patch removes `measured`: nobody has checked the new value. */
export function updateMaterial(project: Project, id: string, patch: Patch<Material>): Project {
  return {
    ...project,
    materials: project.materials.map((material) => {
      if (material.id !== id) return material;
      const retyped = patch.thickness !== undefined && patch.thickness !== material.thickness && !("measured" in patch);
      return applyPatch(material, retyped ? { ...patch, measured: undefined } : patch);
    }),
  };
}
```

- [ ] **Step 5: Run the new tests**

Run: `npx vitest run packages/core/test/edit/edit.test.ts packages/core/test/format/parse.test.ts --root packages/core`
Expected: PASS for the new tests.

- [ ] **Step 6: Update the version in the other tests, the schema, and the examples**

Commit `42b1a1e` made the same change from 1.7 to 1.8; follow it. Find the places:

```bash
grep -rn '"1\.8"\|"1\.9"\|version 1\.8\|version 1\.9\|as version 1\.8' packages/*/test apps/web/test apps/web/e2e
```

- A test that expects the current version: change `1.8` to `1.9`. The existing "loads a 1.x file as version 1.8" test names become "as version 1.9".
- A test that makes a file from a newer minor version: change `1.9` to `1.10`, and the expected message to "format version 1.10, which is newer than this app (1.9)".

Then:

```bash
npm run schema
npm run examples
```

Run: `npx vitest run --root packages/core && npx vitest run --root packages/cli && npx vitest run --root apps/web`
Expected: PASS.

- [ ] **Step 7: Update `docs/format.md`**

- The title and the `version` row: `1.9`.
- The Materials table: add the row `| measured | no | true when the thickness is an actual thickness: measured, or picked from the catalogue (added in 1.9). An app clears it when the user types a new thickness. |`.
- Change the `thickness` row to: `Actual thickness, not nominal. See [Nominal thickness](#nominal-thickness-added-in-19).`
- Add a short section "Nominal thickness (added in 1.9)": in an inch project, an app can warn when a thickness is equal to a nominal value of the catalogue, and the material is not a catalogue material and is not `measured`. A 1.8 reader ignores `measured` and writes it back.

- [ ] **Step 8: Commit**

```bash
git add packages apps schema examples docs/format.md
git commit -m "Add measured to a material in file format 1.9, and clear it when the thickness changes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The nominal thickness rule

**Files:**
- Create: `packages/core/src/catalog/nominal.ts`
- Modify: `packages/core/src/index.ts` (export it)
- Create: `packages/core/test/catalog/nominal.test.ts`
- Modify: `packages/core/test/catalog/data.test.ts`

**Interfaces:**
- Consumes: `CATALOG` (`data.ts`), `Material.measured` (Task 8), `formatLength` and `formatExactLength` (Task 2).
- Produces:

```ts
export const NOMINAL_TOLERANCE_IN = 0.005;
export function nominalInches(nominal: string): number | null;
export interface NominalThickness { nominal: string; value: number; likely: number[] }
export function nominalThickness(project: Project, materialId: string): NominalThickness | null;
export function nominalThicknessText(project: Project, materialId: string): string | null;
```

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/catalog/nominal.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CATALOG, createProject, nominalInches, nominalThickness, nominalThicknessText, type Material, type Project } from "../../src/index.ts";

function project(materials: Material[], units: "in" | "mm" = "in"): Project {
  return { ...createProject("Test", units), materials };
}

const ply = (patch: Partial<Material> = {}): Material => ({ id: "ply", name: "Plywood", thickness: 0.75, grained: true, ...patch });

describe("nominalInches", () => {
  it("reads inch fractions, trade sizes, and nothing from millimetres", () => {
    expect(nominalInches('3/4"')).toBe(0.75);
    expect(nominalInches('1/2" (15/32")')).toBe(0.5);
    expect(nominalInches('1/4" (5.2 mm)')).toBe(0.25);
    expect(nominalInches("1x")).toBe(1);
    expect(nominalInches("2x")).toBe(2);
    expect(nominalInches("18 mm")).toBeNull();
  });
});

describe("nominalThickness", () => {
  it("gives the likely actual thicknesses of 3/4 inch, the most common first, then in catalogue order", () => {
    expect(nominalThickness(project([ply()]), "ply")).toEqual({ nominal: '3/4"', value: 0.75, likely: [45 / 64, 11 / 16, 23 / 32, 47 / 64] });
  });

  it("gives the likely thicknesses of 1/2 inch, 1x, and 2x", () => {
    expect(nominalThickness(project([ply({ thickness: 0.5 })]), "ply")!.likely).toEqual([15 / 32, 7 / 16]);
    expect(nominalThickness(project([ply({ thickness: 1 })]), "ply")).toEqual({ nominal: "1x", value: 1, likely: [0.75] });
    expect(nominalThickness(project([ply({ thickness: 2 })]), "ply")).toEqual({ nominal: "2x", value: 2, likely: [1.5] });
  });

  it("uses a tolerance of 0.005 inch", () => {
    expect(nominalThickness(project([ply({ thickness: 0.754 })]), "ply")).not.toBeNull();
    expect(nominalThickness(project([ply({ thickness: 0.756 })]), "ply")).toBeNull();
  });

  it("gives nothing in a millimetre project, for a thickness that is not nominal, or for a measured material", () => {
    expect(nominalThickness(project([ply({ thickness: 19.05 })], "mm"), "ply")).toBeNull();
    expect(nominalThickness(project([ply({ thickness: 45 / 64 })]), "ply")).toBeNull();
    expect(nominalThickness(project([ply({ measured: true })]), "ply")).toBeNull();
    expect(nominalThickness(project([ply()]), "gone")).toBeNull();
  });

  it("gives nothing for a catalogue material at its catalogue thickness, found by id or by name, for each material", () => {
    expect(nominalThickness(project([ply({ id: "mdf-3-4", name: "Board" })]), "mdf-3-4")).toBeNull();
    const two = project([ply({ id: "a", name: 'MDF 3/4"' }), ply({ id: "b", name: 'mdf 3/4"' })]);
    expect(nominalThickness(two, "a")).toBeNull();
    expect(nominalThickness(two, "b")).toBeNull();
  });

  it("warns for a catalogue name at a thickness that is not the catalogue thickness", () => {
    expect(nominalThickness(project([ply({ name: 'Birch plywood 3/4"' })]), "ply")).not.toBeNull();
  });

  it("warns for a measured value that is equal to another nominal value, until the material is measured", () => {
    expect(nominalThickness(project([ply({ thickness: 3 / 16 })]), "ply")).toMatchObject({ nominal: '3/16"' });
    expect(nominalThickness(project([ply({ thickness: 3 / 16, measured: true })]), "ply")).toBeNull();
  });

  it("gives no likely thickness that is equal to the nominal value", () => {
    for (const thickness of [0.125, 0.25, 0.5, 0.75, 1, 2]) {
      const result = nominalThickness(project([ply({ thickness })]), "ply");
      if (result) expect(result.likely.every((value) => Math.abs(value - thickness) > 0.005), String(thickness)).toBe(true);
    }
  });
});

describe("nominalThicknessText", () => {
  it("names the nominal thickness and at most two likely thicknesses", () => {
    expect(nominalThicknessText(project([ply()]), "ply")).toBe('3/4" is a nominal thickness. Stock sold as 3/4" is often 45/64" or 11/16" thick.');
    expect(nominalThicknessText(project([ply({ thickness: 1 })]), "ply")).toBe('1" is a nominal thickness. Stock sold as 1x is often 3/4" thick.');
    expect(nominalThicknessText(project([ply({ measured: true })]), "ply")).toBeNull();
  });
});

describe("catalogue nominal values", () => {
  it("reads the nominal value of each material that has no metric nominal", () => {
    for (const material of CATALOG.filter((entry) => !entry.nominal.endsWith("mm"))) expect(nominalInches(material.nominal), material.id).not.toBeNull();
  });
});
```

The expected `likely` lists come from the data of 2026-10-04. If Task 4 added a material that changes a list, work out the new list by hand with the rule in Step 3 (count each thickness, most common first, ties in catalogue order), and use that list.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run packages/core/test/catalog/nominal.test.ts --root packages/core`
Expected: FAIL: `nominalInches` is not exported.

- [ ] **Step 3: Implement**

Create `packages/core/src/catalog/nominal.ts`:

```ts
import type { Material, Project } from "../format/schema.ts";
import { formatExactLength } from "../geometry/format.ts";
import { CATALOG } from "./data.ts";

export const NOMINAL_TOLERANCE_IN = 0.005;

export interface NominalThickness {
  /** For example `3/4"` or `1x`. */
  nominal: string;
  value: number;
  /** The catalogue thicknesses for the nominal value, most common first, then in catalogue order. */
  likely: number[];
}

/** `3/4"` and `3/4" (23/32")` give 0.75, `1x` gives 1, and a metric nominal such as `18 mm` gives null. */
export function nominalInches(nominal: string): number | null {
  const trade = /^(\d+)x$/.exec(nominal);
  if (trade) return Number(trade[1]);
  const inches = /^(\d+)(?:\/(\d+))?"/.exec(nominal);
  if (!inches) return null;
  return inches[2] === undefined ? Number(inches[1]) : Number(inches[1]) / Number(inches[2]);
}

const close = (a: number, b: number) => Math.abs(a - b) <= NOMINAL_TOLERANCE_IN;

function isCatalogMaterial(material: Material): boolean {
  const name = material.name.trim().toLowerCase();
  return CATALOG.some((entry) => (entry.id === material.id || entry.name.toLowerCase() === name) && close(entry.thicknessIn, material.thickness));
}

export function nominalThickness(project: Project, materialId: string): NominalThickness | null {
  if (project.project.units !== "in") return null;
  const material = project.materials.find((item) => item.id === materialId);
  if (!material || material.measured === true || isCatalogMaterial(material)) return null;
  const matches = CATALOG.filter((entry) => {
    const value = nominalInches(entry.nominal);
    return value !== null && close(value, material.thickness);
  });
  if (matches.length === 0) return null;
  const value = nominalInches(matches[0]!.nominal)!;
  const counts = new Map<number, number>();
  for (const entry of matches) if (!close(entry.thicknessIn, value)) counts.set(entry.thicknessIn, (counts.get(entry.thicknessIn) ?? 0) + 1);
  if (counts.size === 0) return null;
  const likely = [...counts.keys()].toSorted((a, b) => counts.get(b)! - counts.get(a)!);
  return { nominal: matches[0]!.nominal.replace(/\s*\(.*\)$/, ""), value, likely };
}

/** For example `3/4" is a nominal thickness. Stock sold as 3/4" is often 45/64" or 11/16" thick.` */
export function nominalThicknessText(project: Project, materialId: string): string | null {
  const result = nominalThickness(project, materialId);
  if (!result) return null;
  const material = project.materials.find((item) => item.id === materialId)!;
  const likely = result.likely.slice(0, 2).map((value) => formatExactLength(value, "in"));
  return `${formatExactLength(material.thickness, "in")} is a nominal thickness. Stock sold as ${result.nominal} is often ${likely.join(" or ")} thick.`;
}
```

In `packages/core/src/index.ts`, after the line `export * from "./catalog/suggest.ts";`:

```ts
export * from "./catalog/nominal.ts";
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --root packages/core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/catalog/nominal.ts packages/core/src/index.ts packages/core/test/catalog
git commit -m "Find a nominal thickness in an inch project, with the likely actual thicknesses from the catalogue

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The thickness options of the catalogue

**Files:**
- Create: `packages/core/src/catalog/thicknesses.ts`
- Modify: `packages/core/src/catalog/catalog.ts` (export `sameThickness`)
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/test/catalog/thicknesses.test.ts`

**Interfaces:**
- Consumes: `CATALOG`, `CATALOG_FAMILIES`, `THICKNESS_TOLERANCE` (in `catalog.ts`).
- Produces:

```ts
export function sameThickness(a: number, b: number, units: Units): boolean;
export interface ThicknessOption { nominal: string; thickness: number; materials: string[] }
export interface ThicknessGroup { family: string; options: ThicknessOption[] }
export function catalogShortName(entry: CatalogMaterial): string;
export function catalogThicknesses(units: Units): ThicknessGroup[];
```

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/catalog/thicknesses.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CATALOG, CATALOG_FAMILIES, catalogMaterial, catalogShortName, catalogThicknesses, sameThickness } from "../../src/index.ts";

describe("catalogShortName", () => {
  it("drops the thickness, and the last word of the family", () => {
    const short = (id: string) => catalogShortName(catalogMaterial(id)!);
    expect(short("birch-ply-3-4")).toBe("Birch");
    expect(short("cdx-ply-23-32")).toBe("CDX");
    expect(short("baltic-birch-18mm")).toBe("Baltic birch");
    expect(short("mdf-3-4")).toBe("MDF");
    expect(short("common-pine-1x")).toBe("Common pine");
    expect(short("whitewood-2x")).toBe("Whitewood");
  });
});

describe("catalogThicknesses", () => {
  it("has one group for each family, in catalogue order", () => {
    expect(catalogThicknesses("in").map((group) => group.family)).toEqual(CATALOG_FAMILIES);
  });

  it("gives one option for each nominal value and thickness, thin to thick, with the short names", () => {
    const hardwood = catalogThicknesses("in").find((group) => group.family === "Hardwood plywood")!;
    expect(hardwood.options).toContainEqual({ nominal: '3/4"', thickness: 45 / 64, materials: ["Birch", "Red oak", "Maple", "Sanded"] });
    expect(hardwood.options).toContainEqual({ nominal: '1/4"', thickness: 3 / 16, materials: ["Birch", "Red oak"] });
    expect(hardwood.options).toContainEqual({ nominal: '1/4"', thickness: 0.22, materials: ["Maple"] });
    const thicknesses = hardwood.options.map((option) => option.thickness);
    expect(thicknesses).toEqual(thicknesses.toSorted((a, b) => a - b));
  });

  it("drops the part of the nominal value in brackets", () => {
    const construction = catalogThicknesses("in").find((group) => group.family === "Construction plywood")!;
    expect(construction.options.map((option) => option.nominal)).not.toContainEqual(expect.stringContaining("("));
  });

  it("gives the thicknesses in millimetres", () => {
    const baltic = catalogThicknesses("mm").find((group) => group.family === "Baltic birch plywood")!;
    expect(baltic.options.map((option) => option.thickness)).toEqual(["baltic-birch-6mm", "baltic-birch-12mm", "baltic-birch-18mm"].map((id) => catalogMaterial(id)!.thicknessMm));
    expect(baltic.options[2]).toMatchObject({ nominal: "18 mm", materials: ["Baltic birch"] });
  });

  it("names every catalogue material once", () => {
    expect(catalogThicknesses("in").flatMap((group) => group.options.flatMap((option) => option.materials)).length).toBe(CATALOG.length);
  });
});

describe("sameThickness", () => {
  it("uses the catalogue tolerance", () => {
    expect(sameThickness(45 / 64, 0.707, "in")).toBe(true);
    expect(sameThickness(45 / 64, 0.709, "in")).toBe(false);
    expect(sameThickness(18, 18.1, "mm")).toBe(true);
    expect(sameThickness(18, 18.2, "mm")).toBe(false);
  });
});
```

If Task 4 added a material that changes the 3/4" or 1/4" hardwood options (for example a 1/8" birch is a new option, which is fine), keep the expectations that are still true and update the others.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run packages/core/test/catalog/thicknesses.test.ts --root packages/core`
Expected: FAIL: the functions are not exported.

- [ ] **Step 3: Implement**

In `packages/core/src/catalog/catalog.ts`, after `SIZE_TOLERANCE`:

```ts
export function sameThickness(a: number, b: number, units: Units): boolean {
  return Math.abs(a - b) <= THICKNESS_TOLERANCE[units];
}
```

Create `packages/core/src/catalog/thicknesses.ts`:

```ts
import type { Units } from "../geometry/units.ts";
import { CATALOG_FAMILIES } from "./catalog.ts";
import { CATALOG } from "./data.ts";
import type { CatalogMaterial } from "./types.ts";

export interface ThicknessOption {
  /** For example `3/4"` or `1x`. */
  nominal: string;
  /** In the project units. */
  thickness: number;
  /** The short names of the catalogue materials, in catalogue order. */
  materials: string[];
}

export interface ThicknessGroup {
  family: string;
  options: ThicknessOption[];
}

/** `Birch plywood 3/4"` in the family "Hardwood plywood" gives "Birch". */
export function catalogShortName(entry: CatalogMaterial): string {
  const base = entry.name.replace(/\s+(\d[\d/]*"?|\dx)(\s.*)?$/, "");
  const suffix = ` ${entry.family.split(" ").at(-1)!.replace(/s$/i, "")}`.toLowerCase();
  return base.toLowerCase().endsWith(suffix) ? base.slice(0, -suffix.length) : base;
}

export function catalogThicknesses(units: Units): ThicknessGroup[] {
  return CATALOG_FAMILIES.map((family) => {
    const options: ThicknessOption[] = [];
    for (const entry of CATALOG.filter((material) => material.family === family)) {
      const nominal = entry.nominal.replace(/\s*\(.*\)$/, "");
      const thickness = units === "in" ? entry.thicknessIn : entry.thicknessMm;
      const same = options.find((option) => option.nominal === nominal && option.thickness === thickness);
      if (same) same.materials.push(catalogShortName(entry));
      else options.push({ nominal, thickness, materials: [catalogShortName(entry)] });
    }
    return { family, options: options.toSorted((a, b) => a.thickness - b.thickness) };
  });
}
```

In `packages/core/src/index.ts`, after the `nominal.ts` export:

```ts
export * from "./catalog/thicknesses.ts";
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --root packages/core`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src packages/core/test/catalog
git commit -m "Group the catalogue thicknesses by family, for a thickness picker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: A design check for a nominal thickness

**Files:**
- Modify: `packages/core/src/plan/issues.ts` (`PlanIssueCode`)
- Modify: `packages/core/src/design/checks.ts`
- Modify: `packages/core/test/design/checks.test.ts`

**Interfaces:**
- Consumes: `nominalThickness` (Task 9), `formatExactLength`, `toNm`, `fromNm` (Tasks 1 and 2), `designGeometry` (existing).
- Produces: a `warning` with the code `"nominal-thickness"` and a `design` ref.

- [ ] **Step 1: Write the failing tests**

Add to `packages/core/test/design/checks.test.ts`:

```ts
describe("the nominal-thickness check", () => {
  function inches(design: Design, materials: Record<string, { name: string; thickness: number; measured?: boolean }>): Project {
    const project = convertProjectUnits(regenerateDesigns(designProject([design])), "in");
    return regenerateDesigns({ ...project, materials: project.materials.map((m) => (materials[m.id] ? { ...m, ...materials[m.id] } : m)) });
  }
  const nominal = (project: Project) => checkDesigns(project).filter((issue) => issue.code === "nominal-thickness");

  it("warns about the box material and gives the error across the axis with more panels", () => {
    const issues = nominal(inches(kallaxDesign(), { ply18: { name: "Plywood 3/4", thickness: 0.75 } }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: "warning", refs: [{ kind: "design", design: "kx" }] });
    expect(issues[0]!.message).toBe(
      'Design "Hall KALLAX" uses Plywood 3/4 at 3/4", a nominal thickness. If the stock is 45/64", the error across the height adds up to 15/64". Measure the stock, or pick its thickness on the Stock tab.',
    );
  });

  it("gives the error across the width for a design with outside sizes", () => {
    const issues = nominal(inches(eketDesign(), { ply18: { name: "Plywood 3/4", thickness: 0.75 } }));
    expect(issues[0]!.message).toContain("the error across the width adds up to 9/64\".");
  });

  it("warns about the back, with the error in the depth", () => {
    const issues = nominal(inches(eketDesign(), { ply6: { name: "Back 1/4", thickness: 0.25 } }));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toBe(
      'Design "Wall EKET" has a back of Back 1/4 at 1/4", a nominal thickness. If the stock is 3/16", the depth of the box is off by 1/16". Measure the stock, or pick its thickness on the Stock tab.',
    );
  });

  it("gives nothing for measured stock, actual stock, or a millimetre project", () => {
    expect(nominal(inches(kallaxDesign(), { ply18: { name: "Plywood 3/4", thickness: 0.75, measured: true } }))).toEqual([]);
    expect(nominal(inches(kallaxDesign(), { ply18: { name: "Plywood 3/4", thickness: 45 / 64 } }))).toEqual([]);
    expect(nominal(current(kallaxDesign()))).toEqual([]);
  });
});
```

The numbers: the KALLAX has 2 columns and 4 rows, so the width has 3 panels and the height has 5. The difference is 3/4 − 45/64 = 3/64"; 5 × 3/64 = 15/64". The EKET has 2 columns and 1 row (outside sizes): 3 × 3/64 = 9/64". The back: 1/4 − 3/16 = 1/16". The check works in whole nanometres, so the sums are exact, and `formatExactLength` shows them as fractions.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run packages/core/test/design/checks.test.ts --root packages/core`
Expected: FAIL: no `nominal-thickness` issue.

- [ ] **Step 3: Implement**

In `packages/core/src/plan/issues.ts`, add `| "nominal-thickness"` to `PlanIssueCode`, after `"design-unknown-mount"`.

In `packages/core/src/design/checks.ts`, import `nominalThickness` from `../catalog/nominal.ts`, `formatExactLength` from `../geometry/format.ts`, and `toNm` and `fromNm` from `../geometry/precision.ts`. In `checkDesigns`, add after the `pocket-chart` check:

```ts
    const exact = (value: number) => formatExactLength(value, units);
    const error = (a: number, b: number, panels: number) => fromNm(Math.abs(toNm(a, units) - toNm(b, units)) * panels, units);
    const advice = "Measure the stock, or pick its thickness on the Stock tab.";
    const boxNominal = nominalThickness(project, design.material);
    if (boxNominal) {
      const across = geometry.rows.length > geometry.columns.length ? "height" : "width";
      const panels = (across === "height" ? geometry.rows.length : geometry.columns.length) + 1;
      issues.push(
        planWarning(
          "nominal-thickness",
          `${name} uses ${materials.get(design.material)!.name} at ${exact(geometry.thickness)}, a nominal thickness. If the stock is ${exact(boxNominal.likely[0]!)}, the error across the ${across} adds up to ${exact(error(geometry.thickness, boxNominal.likely[0]!, panels))}. ${advice}`,
          ref,
        ),
      );
    }
    const backMaterial = design.back ? materials.get(design.back.material) : undefined;
    const backNominal = backMaterial ? nominalThickness(project, backMaterial.id) : null;
    if (backMaterial && backNominal) {
      issues.push(
        planWarning(
          "nominal-thickness",
          `${name} has a back of ${backMaterial.name} at ${exact(backMaterial.thickness)}, a nominal thickness. If the stock is ${exact(backNominal.likely[0]!)}, the depth of the box is off by ${exact(error(backMaterial.thickness, backNominal.likely[0]!, 1))}. ${advice}`,
          ref,
        ),
      );
    }
```

`materialsById` returns a `Map` of the materials, as `designErrors` in `errors.ts` shows (`materials.has(...)`).

- [ ] **Step 4: Run the tests**

Run: `npx vitest run --root packages/core && npx vitest run --root packages/cli && npx vitest run --root apps/web`
Expected: the new tests PASS. Some old tests of inch designs at 0.75" (for example in `apps/web/test/DesignTab.test.tsx` near line 117) can now get the new warning. For a test that is not about thickness, add `measured: true` to the material of its fixture. Do not change a test that checks the stock thickness itself. Run again. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages apps/web/test
git commit -m "Warn in the design checks when the box or the back has a nominal thickness, with the size of the error

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The nominal warning and `--measured` in the CLI

**Files:**
- Modify: `packages/cli/src/project.ts` (`Mutation.warnings`)
- Modify: `packages/cli/src/commands/materials.ts`
- Modify: `packages/cli/test/materials.test.ts`
- Modify: `docs/cli.md`, `README.md` (the examples)

**Interfaces:**
- Consumes: `nominalThickness`, `nominalThicknessText` (Task 9); `updateMaterial` with `measured` (Task 8).
- Produces: `materials list --json` → each material has `nominal` (`NominalThickness | null`); `materials get --json` → `nominal`; `materials add|set` → `warnings` has `warning: nominal-thickness: <text>`; the option `--measured <true|false>` on `materials add` and `materials set`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/cli/test/materials.test.ts`:

```ts
describe("materials and nominal thickness", () => {
  it("warns when a material is added at a nominal thickness, and not when it is measured", async () => {
    const io = withExamples();
    const added = await cli(["materials", "add", SHELF, "--name", "Plywood 3/4", "--thickness", "3/4", "--json"], io);
    expect(added.code).toBe(0);
    expect(added.json().warnings).toContainEqual(expect.stringContaining('nominal-thickness: 3/4" is a nominal thickness. Stock sold as 3/4" is often 45/64" or 11/16" thick.'));
    const measured = await cli(["materials", "add", SHELF, "--name", "Shop MDF", "--thickness", "3/4", "--measured", "true", "--json"], io);
    expect(measured.json().material).toMatchObject({ name: "Shop MDF", measured: true });
    expect(measured.json().warnings).not.toContainEqual(expect.stringContaining("nominal-thickness"));
  });

  it("lists and gets the nominal result", async () => {
    const io = withExamples();
    await cli(["materials", "add", SHELF, "--name", "Plywood 3/4", "--thickness", "3/4", "--id", "p34"], io);
    const list = (await cli(["materials", "list", SHELF, "--json"], io)).json();
    expect(list.materials.find((m: { id: string }) => m.id === "p34")).toMatchObject({ nominal: { nominal: '3/4"', value: 0.75 } });
    expect(list.materials.find((m: { id: string }) => m.id === "bb18").nominal).toBeNull();
    const text = await cli(["materials", "get", SHELF, "p34"], io);
    expect(text.stdout).toContain('Warning: 3/4" is a nominal thickness.');
  });

  it("sets measured, and clears it with a new thickness", async () => {
    const io = withExamples();
    expect((await cli(["materials", "set", SHELF, "bb6", "--thickness", "1/4", "--json"], io)).json().warnings).toContainEqual(expect.stringContaining("nominal-thickness: 1/4\""));
    const measured = await cli(["materials", "set", SHELF, "bb6", "--measured", "true", "--json"], io);
    expect(measured.json().material.measured).toBe(true);
    expect(measured.json().warnings).not.toContainEqual(expect.stringContaining("nominal-thickness"));
    const retyped = await cli(["materials", "set", SHELF, "bb6", "--thickness", "0.24", "--json"], io);
    expect(retyped.json().material).not.toHaveProperty("measured");
  });

  it("refuses --measured with --catalog", async () => {
    const result = await cli(["materials", "add", SHELF, "--catalog", "mdf-3-4", "--measured", "true", "--json"], withExamples());
    expect(result.code).toBe(2);
    expect(result.json().error.code).toBe("conflict");
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run packages/cli/test/materials.test.ts --root packages/cli`
Expected: FAIL: unknown option `--measured`, and no warning.

- [ ] **Step 3: Let a mutation add warnings**

In `packages/cli/src/project.ts`, add to `Mutation`:

```ts
  /** Lines for `warnings`, after the file warnings, for example "warning: nominal-thickness: …". */
  warnings?: string[];
```

and in `finishMutation`, change the `warnings` of the outcome to:

```ts
    warnings: [...warningLines(loaded), ...(mutation.warnings ?? [])],
```

- [ ] **Step 4: Implement the materials changes**

In `packages/cli/src/commands/materials.ts`:

1. Import `nominalThickness` and `nominalThicknessText` from `@opencutplan/core`.
2. Add a helper:

```ts
function nominalWarnings(project: Project, id: string): string[] {
  const text = nominalThicknessText(project, id);
  return text === null ? [] : [`warning: nominal-thickness: ${text}`];
}
```

3. In `listed`, add `nominal: nominalThickness(project, material.id)`, and add ` · nominal thickness` to the end of `status` when `nominal` is not null.
4. In `get`, add `nominal: nominalThickness(project, material.id)` to `data`, and add the line `Warning: ${text} Measure it, and give it with --thickness and --measured true.` to the text when `nominalThicknessText` gives a text.
5. Add to `FIELD_OPTIONS`:

```ts
  measured: { name: "measured", type: "string", value: "<true|false>", description: "true when the thickness is an actual, measured thickness. It stops the nominal thickness warning. A new --thickness with no --measured clears it." },
```

6. `add`: add `FIELD_OPTIONS.measured` to `options`; after `grained`, read `const measured = optionalBoolean(options, "measured"); if (measured !== undefined) material.measured = measured;`; pass `warnings: nominalWarnings(next, material.id)` to `finishMutation`. In `addFromCatalog`, add `"measured"` to the `assertNoCatalogConflict` list.
7. `set`: add `FIELD_OPTIONS.measured` to `options`; read it into `patch.measured`; pass `warnings: nominalWarnings(next, old.id)`.
8. Update the `output` texts of `list`, `get`, `add`, and `set` to name `nominal` and `warnings`.
9. Change the example `--name MDF --thickness 3/4 --grained false --id mdf` to `--name "Shop birch" --thickness 23/32 --id shop-birch`, with the description "Add a material at its measured thickness."

- [ ] **Step 5: Run the tests**

Run: `npx vitest run --root packages/cli`
Expected: PASS. A help or snapshot test that lists the options may need the new option; update it.

- [ ] **Step 6: Update the docs**

- `docs/cli.md`: in the materials table, add `--measured` to `materials add` and `materials set`. Add a short list under the table: in an inch project, `materials add` and `materials set` give the warning `nominal-thickness` when the thickness is a nominal value; `materials list` and `materials get` give `nominal`; `--measured true` stops the warning; a new `--thickness` clears `measured`. Change the example at the line `opencutplan materials add $F --name "Plywood 3/4" --thickness 3/4 --json` to `opencutplan materials add $F --catalog birch-ply-3-4 --json`, and fix the later lines of that script if they use the old material id.
- `README.md`: change `npx opencutplan materials add desk.cutplan.json --name "Plywood 3/4" --thickness 3/4` to `npx opencutplan materials add desk.cutplan.json --catalog birch-ply-3-4`. Check that the next lines of the example still work: run the six commands of the example in a temporary directory with `npm run cli --`, and confirm exit 0 for each.

- [ ] **Step 7: Commit**

```bash
git add packages/cli docs/cli.md README.md
git commit -m "Give the nominal thickness warning and --measured in the materials commands of the CLI

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: The thickness picker and the warning on the Stock tab

**Files:**
- Create: `apps/web/src/components/ThicknessPicker.tsx`
- Modify: `apps/web/src/screens/StockTab.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/test/screens.test.tsx`
- Modify: `docs/web-app.md`

**Interfaces:**
- Consumes: `catalogThicknesses`, `sameThickness` (Task 10); `nominalThickness`, `nominalThicknessText` (Task 9); `formatExactLength` (Task 2); `updateMaterial` with `measured` (Task 8).
- Produces: `ThicknessPicker({ name, value, units, onPick })`; on the Stock tab, the select `Pick the thickness of <name>` and the checkbox `<name> thickness is measured`.

- [ ] **Step 1: Write the failing tests**

Add to the `describe("StockTab")` in `apps/web/test/screens.test.tsx` (add `type Project` to the core import if needed):

```tsx
  it("warns about a nominal thickness, and a pick sets the actual thickness and measured", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <StockTab store={store} />);
    const status = () => screen.getByRole("table", { name: "Materials" }).querySelector(".material-status")!.textContent;
    expect(status()).toContain('⚠ 3/4" is a nominal thickness. Stock sold as 3/4" is often 45/64" or 11/16" thick. Measure it, or pick it from the list.');
    const picker = screen.getByRole("combobox", { name: "Pick the thickness of Plywood" });
    expect((picker as HTMLSelectElement).value).toBe("");
    const option = within(picker).getAllByRole("option").find((item) => item.textContent!.startsWith('3/4" → 45/64"'))!;
    expect(option.textContent).toBe('3/4" → 45/64" (Birch, Red oak, Maple, Sanded)');
    await userEvent.selectOptions(picker, option);
    expect(current().project.materials[0]).toMatchObject({ thickness: 45 / 64, measured: true });
    expect(status()).not.toContain("nominal thickness");
    expect((screen.getByRole("combobox", { name: "Pick the thickness of Plywood" }) as HTMLSelectElement).selectedOptions[0]!.textContent).toBe(option.textContent);
  });

  it("stops the warning with Measured, and a typed thickness clears Measured", async () => {
    const { current } = renderWithStore(sampleProject(), (store) => <StockTab store={store} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Plywood thickness is measured" }));
    expect(current().project.materials[0]!.measured).toBe(true);
    expect(screen.getByRole("table", { name: "Materials" }).querySelector(".material-status")!.textContent).not.toContain("nominal thickness");
    const thickness = screen.getByRole("textbox", { name: "Thickness of Plywood" });
    await userEvent.clear(thickness);
    await userEvent.type(thickness, "1/2{Enter}");
    expect(current().project.materials[0]).not.toHaveProperty("measured");
    expect(screen.getByRole("table", { name: "Materials" }).querySelector(".material-status")!.textContent).toContain('1/2" is a nominal thickness.');
  });

  it("hides Measured for an actual thickness", () => {
    const project = sampleProject();
    renderWithStore({ ...project, materials: [{ ...project.materials[0]!, thickness: 45 / 64 }] }, (store) => <StockTab store={store} />);
    expect(screen.queryByRole("checkbox", { name: "Plywood thickness is measured" })).toBeNull();
  });

  it("gives the options in millimetres, and a pick stores the catalogue value", async () => {
    const mm = { ...createProject("Metric", "mm"), materials: [{ id: "ply", name: "Plywood", thickness: 19, grained: true }] };
    const { current } = renderWithStore(mm, (store) => <StockTab store={store} />);
    expect(screen.queryByText(/nominal thickness/)).toBeNull();
    const picker = screen.getByRole("combobox", { name: "Pick the thickness of Plywood" });
    const option = within(picker).getAllByRole("option").find((item) => item.textContent!.startsWith("18 mm → 18 mm"))!;
    await userEvent.selectOptions(picker, option);
    expect(current().project.materials[0]!.thickness).toBe(18);
  });
```

`sampleProject()` in `apps/web/test/helpers.ts` is an inch project with the material `Plywood` at 0.75". The option text `(Birch, Red oak, Maple, Sanded)` assumes that Task 4 added no 3/4" hardwood plywood; if it did, use the text that `catalogThicknesses` gives.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run apps/web/test/screens.test.tsx --root apps/web`
Expected: FAIL: no picker, no warning.

- [ ] **Step 3: Write the component**

Create `apps/web/src/components/ThicknessPicker.tsx`:

```tsx
import { catalogThicknesses, formatExactLength, sameThickness, type Units } from "@opencutplan/core";

interface ThicknessPickerProps {
  /** The material name, for the accessible name. */
  name: string;
  value: number;
  units: Units;
  onPick(thickness: number): void;
}

export function ThicknessPicker({ name, value, units, onPick }: ThicknessPickerProps) {
  const groups = catalogThicknesses(units);
  const keyed = groups.flatMap((group, g) => group.options.map((option, o) => ({ key: `${g}-${o}`, option })));
  const selected = keyed.find(({ option }) => sameThickness(option.thickness, value, units))?.key ?? "";
  return (
    <select
      className="thickness-picker"
      aria-label={`Pick the thickness of ${name}`}
      value={selected}
      onChange={(event) => {
        const found = keyed.find(({ key }) => key === event.target.value);
        if (found) onPick(found.option.thickness);
      }}
    >
      <option value="">Pick…</option>
      {groups.map((group, g) => (
        <optgroup key={group.family} label={group.family}>
          {group.options.map((option, o) => (
            <option key={`${g}-${o}`} value={`${g}-${o}`}>
              {`${option.nominal} → ${formatExactLength(option.thickness, units)} (${option.materials.join(", ")})`}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
```

- [ ] **Step 4: Use it on the Stock tab**

In `apps/web/src/screens/StockTab.tsx`:

1. Import `nominalThickness` and `nominalThicknessText` from `@opencutplan/core`, and `ThicknessPicker` from `../components/ThicknessPicker.tsx`.
2. In the `project.materials.map` callback, after `const status = …`:

```tsx
                const nominal = nominalThickness(project, material.id);
                const nominalText = nominalThicknessText(project, material.id);
                const warn = stockless || status.unpriced > 0;
```

(and remove the old `const warn` line).
3. Replace the content of the Thickness cell:

```tsx
                    <td data-label="Thickness">
                      <div className="thickness-field">
                        <LengthInput
                          aria-label={`Thickness of ${material.name}`}
                          value={material.thickness}
                          units={units}
                          display={display}
                          onChange={(thickness) => thickness !== undefined && edit((p) => updateMaterial(p, material.id, { thickness }))}
                        />
                        <ThicknessPicker name={material.name} value={material.thickness} units={units} onPick={(thickness) => edit((p) => updateMaterial(p, material.id, { thickness, measured: true }))} />
                        {(nominal !== null || material.measured === true) && (
                          <label className="measured">
                            <input
                              type="checkbox"
                              aria-label={`${material.name} thickness is measured`}
                              checked={material.measured === true}
                              onChange={(event) => edit((p) => updateMaterial(p, material.id, { measured: event.target.checked ? true : undefined }))}
                            />
                            Measured
                          </label>
                        )}
                      </div>
                    </td>
```

4. In the Status cell, change the class to `material-status wide${warn || nominalText !== null ? " warning" : ""}`, and after the `stockless` block add:

```tsx
                      {nominalText !== null && <div className="nominal-warning">⚠ {nominalText} Measure it, or pick it from the list.</div>}
```

- [ ] **Step 5: Add the styles**

In `apps/web/src/styles.css`, next to `.material-status`:

```css
.thickness-field { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
.thickness-picker { max-width: 16em; }
.measured { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.nominal-warning { margin-top: 4px; }
```

and in the narrow-screen block, after `table.grid.cards .material-status { min-width: 0; }`:

```css
  table.grid.cards .thickness-picker { max-width: none; }
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run --root apps/web`
Expected: the new tests PASS. Old Stock tab tests that read the status of an inch material at 0.75" now see the warning (for example "shows one status line for each material…"). Update their expected text to the new text, for example `'Used by 2 parts · 1 size⚠ 3/4" is a nominal thickness. Stock sold as 3/4" is often 45/64" or 11/16" thick. Measure it, or pick it from the list.'`. Run again. Expected: PASS.

- [ ] **Step 7: Update `docs/web-app.md`**

In the "### Stock" section, add:

- The **Pick…** list beside each Thickness field gives the catalogue thicknesses by family, for example `3/4" → 45/64" (Birch, Red oak, Maple, Sanded)`. A pick sets the actual thickness and marks it as measured. It does not change the name, the grain, or the colour.
- In an inch project, a material at a nominal thickness, for example exactly 3/4", gets a warning with the likely actual thicknesses, unless it is a catalogue material. The **Measured** checkbox stops the warning. A typed thickness clears **Measured**.
- A design whose material has the warning gets the check `nominal-thickness`, with the size of the error.

- [ ] **Step 8: Commit**

```bash
git add apps/web docs/web-app.md
git commit -m "Pick a catalogue thickness on the Stock tab, and warn about a nominal thickness with a Measured checkbox

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: End-to-end test of the picker and the design

**Files:**
- Modify: `apps/web/e2e/plan.e2e.ts`

**Interfaces:**
- Consumes: the Stock tab controls of Task 13; the Design tab front view (existing).

- [ ] **Step 1: Write the test**

Add at the end of `apps/web/e2e/plan.e2e.ts`:

```ts
test("picks an actual thickness on the Stock tab, and the design follows it", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Name").fill("E2E thickness");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("button", { name: "Add design" }).click();
  await expect(page.getByRole("img", { name: 'Front view of KALLAX 2x2: 28 5/8" × 28 5/8" × 15 11/32"' })).toBeVisible();

  await page.getByRole("tab", { name: "Stock" }).click();
  const materials = page.getByRole("table", { name: "Materials" });
  await expect(materials.getByText(/3\/4" is a nominal thickness/)).toBeVisible();
  await expect(materials.getByText(/1\/4" is a nominal thickness/)).toBeVisible();

  const picker = page.getByRole("combobox", { name: "Pick the thickness of Plywood", exact: true });
  const value = await picker.locator("option", { hasText: /^3\/4" → 45\/64"/ }).first().getAttribute("value");
  await picker.selectOption(value!);
  await expect(materials.getByText(/3\/4" is a nominal thickness/)).toHaveCount(0);

  await page.getByRole("checkbox", { name: 'Plywood 1/4" thickness is measured' }).check();
  await expect(materials.getByText(/is a nominal thickness/)).toHaveCount(0);

  await page.getByRole("tab", { name: "Design" }).click();
  await expect(page.getByRole("img", { name: 'Front view of KALLAX 2x2: 28 1/2" × 28 1/2" × 15 11/32"' })).toBeVisible();
});
```

The sizes: a new inch project gets `Plywood` at 0.75" and `Plywood 1/4"` at 0.25". The KALLAX 2x2 has two openings of 13.189" on each axis: 2 × 13.189 + 3 × 3/4 = 28.628" (`~28 5/8"`), and 2 × 13.189 + 3 × 45/64 = 28.487" (`~28 1/2"`). The depth does not change, because the back stays at 1/4". The front-view names show the sizes with the project display, so check them with `formatLength` after Task 2: if a size starts with `~`, put the `~` in the expected name.

- [ ] **Step 2: Run it**

Run: `npm run e2e:install` (once, if Chromium is missing), then `npm run e2e`
Expected: all end-to-end tests PASS, the new one too. If the first expectation fails, check whether `Add design` opens the Design tab in a new project (the "designs a unit" test shows that it does).

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/plan.e2e.ts
git commit -m "Test end to end that a picked thickness changes the size of a design

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: The backlog, the full checks, and a look at the app

**Files:**
- Modify: `docs/backlog.md`
- Modify: `README.md` (the feature list)

- [ ] **Step 1: Add backlog item 23**

Append to `docs/backlog.md`, in the style of item 22:

```markdown
## 23. A stock library: more catalogue stock, a thickness picker, and a nominal warning

**Status:** Done.

**Size:** M.

**Problem:** Most sheet goods and boards are thinner than their nominal size. A design makes its parts from the
thickness of its material, so a typed nominal thickness adds an error at each panel. The user types each thickness by
hand, and the catalogue has no boards and no 3/8" or 5/8" sheets.

**Chosen approach:**

- The catalogue has the missing sheet thicknesses, pine 1x boards (common and select), and 2x framing lumber. A board
  is a narrow sheet with factory edges: stock from a board size gets `trim: 0`. See [catalog.md](catalog.md).
- The Stock tab has a **Pick…** list beside each Thickness field, with the catalogue thicknesses by family.
- In an inch project, a material at a nominal thickness gets a warning with the likely actual thicknesses, on the
  Stock tab, in the design checks (`nominal-thickness`, with the size of the error), and in the CLI. File format 1.9
  adds `measured` to a material; the **Measured** checkbox and `--measured` set it.
- Not done: edge-glued panels, hardwood boards, plastics, a personal library across projects, and a rule that stops
  rips on boards.
```

Add one line to "Not done" for each product that Task 4 left out, for example "White hardboard 1/8" (no store sold it on 2026-10-04)".

- [ ] **Step 2: Update the README feature list**

In `README.md`, change the "Material catalogue" bullet to: `**Material catalogue.** Add common sheet goods, pine boards, and framing lumber, with their actual sizes and typical, dated prices. Pick an actual thickness from a list. The app warns when a thickness looks nominal.`

- [ ] **Step 3: Run the full checks**

Run: `npm run check`
Expected: the lockfile, lint, typecheck, unit tests, and build all pass.

Run: `npm run e2e`
Expected: PASS.

- [ ] **Step 4: Look at the app**

Run `npm run dev` in the background, open http://localhost:5173 in a browser (Playwright or the `run` skill), create an inch project, and add a design. On the Stock tab, take a screenshot at 1280 px wide and at 390 px wide. Check that: the Pick list, the Thickness field, and the Measured checkbox fit in the card on the narrow screen; the warning reads well; a pick changes the outside size on the Design tab; **Add from catalogue…** lists the Pine boards and Framing lumber families, and a 1x4 × 8 ft added from it shows "use factory edges" in the Stock table. Fix what is wrong, and run the tests again.

- [ ] **Step 5: Commit**

```bash
git add docs/backlog.md README.md
git commit -m "Describe the stock library in the backlog and the README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
