# OpenCutPlan Phase 1 — Core Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@opencutplan/core`'s foundation: the `.cutplan.json` format (schemas, validation, versioning, JSON Schema), length parsing and formatting in inches and millimetres, CSV import/export for parts and stock, and sample projects including the living-room shelf.

**Architecture:** An npm-workspaces monorepo. `packages/core` is a pure TypeScript library with no DOM access: zod schemas are the single source of truth for types, runtime validation, and the published JSON Schema. Node 26 runs the `.ts` sources directly (type stripping), so scripts need no build step; Vitest runs the tests. `examples/` holds TypeScript builders that generate the checked-in sample files, and a test fails when the checked-in files drift.

**Tech Stack:** Node ≥ 24 (developed on 26.10.0), npm workspaces, TypeScript 7.0.2, Vitest 5.0.2, zod 4.6.5, papaparse 5.7.0, fast-check 4.10.2.

**Spec:** `docs/superpowers/specs/2026-09-27-opencutplan-design.md` (§3 architecture, §4 file format, §11 testing, §12 phase 1).

## Global Constraints

- Exact dependency versions (install with `--save-exact`): `typescript@7.0.2`, `@types/node@26.6.3`, `zod@4.6.5`, `papaparse@5.7.0`, `@types/papaparse@5.5.2`, `vitest@5.0.2`, `fast-check@4.10.2`.
- ESM only (`"type": "module"`). Relative imports use the `.ts` extension (`import { x } from "./x.ts"`). Only erasable TypeScript syntax: no `enum`, `namespace`, or constructor parameter properties (`erasableSyntaxOnly` enforces this).
- `packages/core/src` must not use DOM or Node APIs. `node:` modules are allowed only in `packages/core/scripts`, `packages/core/test`, and `examples/`.
- File format constants: `format` is `"opencutplan"`, `version` is `"1.0"`. Readers reject an unknown major version, load a newer minor version with a warning, ignore unknown fields, and preserve unknown fields and `extensions` when re-saving (spec §4.5).
- All lengths in a project are decimal numbers in `project.units` (`"in"` or `"mm"`). Fractions exist only in text shown to or typed by people.
- Length is the first dimension; on stock the grain runs along the length (spec §4.3).
- Comments: default to none. Only add a comment that carries information the code cannot (an API contract or a non-obvious rule).
- Commit after every task. Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- The repo stays local. Do not add a git remote or push (Block policy; spec §13).

## Review Focus

1. **CSV exported from Excel** (UTF-8 BOM, CRLF line endings, blank or all-empty trailing rows): the header row is still recognized and no empty parts are created. Pinned in Task 6.
2. **European CSV** (semicolon delimiter, decimal commas like `764,5`): values parse as 764.5, not as an error or 7645. Pinned in Task 2 and Task 6.
3. **Units declared in a header** (`Length (mm)` in an inch project): values are converted to project units, not taken as inches. Pinned in Task 6.
4. **A `.cutplan.json` saved with a BOM** (Windows editors): it loads instead of failing as invalid JSON. Pinned in Task 5.
5. **A file from a newer minor version with unknown fields and extensions**: it loads with a warning, and saving it again writes every unknown field back unchanged. Pinned in Task 5.

---

## File Structure

```
opencutplan/
  package.json                    root: workspaces, scripts
  tsconfig.base.json              shared compiler options
  .gitignore
  README.md                       (Task 9)
  docs/format.md                  human-readable format spec (Task 9)
  schema/cutplan.schema.json      generated JSON Schema (Task 3)
  examples/
    tsconfig.json                 (Task 9)
    build.ts                      writes the example files (Task 9)
    builders/index.ts             EXAMPLES registry (Task 9)
    builders/living-room-shelf.ts (Task 9)
    builders/simple-bookcase-mm.ts (Task 9)
    *.cutplan.json, csv/*.csv     generated (Task 9)
  packages/core/
    package.json
    tsconfig.json
    scripts/write-schema.ts       (Task 3)
    src/index.ts                  public exports (grows each task)
    src/geometry/units.ts         Units, convertLength (Task 1)
    src/geometry/format.ts        formatLength, display precision (Task 1)
    src/geometry/parse.ts         parseLength, parsePlainNumber (Task 2)
    src/format/schema.ts          zod schemas + types (Task 3)
    src/format/defaults.ts        createProject, DEFAULT_TRIM (Task 3)
    src/format/jsonSchema.ts      buildJsonSchema (Task 3)
    src/format/issues.ts          Issue type + constructors (Task 4)
    src/format/ids.ts             slugify, uniqueId (Task 4)
    src/format/references.ts      checkReferences (Task 4)
    src/format/version.ts         parseVersion, migrate (Task 5)
    src/format/parse.ts           parseProject, formatPath (Task 5)
    src/format/serialize.ts       serializeProject (Task 5)
    src/csv/table.ts              readTable, detectDelimiter (Task 6)
    src/csv/mapping.ts            header aliases, mapping, unit-aware cells (Task 6)
    src/csv/types.ts              CsvImport, CsvRowIssue (Task 6)
    src/csv/parts.ts              importPartsCsv (Task 6)
    src/csv/stock.ts              importStockCsv (Task 7)
    src/csv/export.ts             exportPartsCsv, exportStockCsv (Task 8)
    src/csv/apply.ts              addPartRows, addStockRows (Task 8)
    test/helpers.ts               sampleProject, expectOk
    test/**/*.test.ts
```

---

### Task 1: Workspace scaffold, units, and length formatting

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`
- Create: `packages/core/src/geometry/units.ts`, `packages/core/src/geometry/format.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/geometry/format.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Units = "in" | "mm"`, `const MM_PER_INCH = 25.4`, `convertLength(value: number, from: Units, to: Units): number`
  - `type InchPrecision = 8 | 16 | 32 | 64 | "decimal"`, `type MmPrecision = 1 | 0.5 | 0.1`, `interface DisplayPrecision { inch: InchPrecision; mm: MmPrecision }`, `const DEFAULT_DISPLAY: DisplayPrecision` (`{ inch: 32, mm: 0.5 }`)
  - `formatLength(value: number, units: Units, display?: DisplayPrecision): string` — inch output like `42 19/32"`, `1/4"`, `60"`, `15.375"`; mm output like `1081.5 mm`, `18 mm`.

- [ ] **Step 1: Create the workspace files**

`package.json`:

```json
{
  "name": "opencutplan",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "engines": { "node": ">=24" },
  "scripts": {
    "typecheck": "tsc -p packages/core",
    "test": "npm test -w @opencutplan/core",
    "check": "npm run typecheck && npm test"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "es2023",
    "lib": ["es2023"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true,
    "rewriteRelativeImportExtensions": true,
    "erasableSyntaxOnly": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  }
}
```

`.gitignore`:

```
node_modules/
dist/
.DS_Store
```

`packages/core/package.json`:

```json
{
  "name": "@opencutplan/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run" }
}
```

`packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test", "scripts"]
}
```

- [ ] **Step 2: Install dependencies**

Run from the repo root:

```bash
npm install -D --save-exact typescript@7.0.2 @types/node@26.6.3
npm install -w @opencutplan/core --save-exact zod@4.6.5 papaparse@5.7.0
npm install -w @opencutplan/core -D --save-exact vitest@5.0.2 fast-check@4.10.2 @types/papaparse@5.5.2
```

Expected: `package-lock.json` is created; `packages/core/package.json` now has `dependencies` and `devDependencies` with exact versions.

- [ ] **Step 3: Write the failing test**

`packages/core/test/geometry/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { convertLength, DEFAULT_DISPLAY, formatLength, type InchPrecision, type MmPrecision } from "../../src/index.ts";

describe("convertLength", () => {
  it("converts between inches and millimetres", () => {
    expect(convertLength(60, "in", "mm")).toBeCloseTo(1524, 9);
    expect(convertLength(18, "mm", "in")).toBeCloseTo(0.708661, 6);
    expect(convertLength(12.5, "in", "in")).toBe(12.5);
  });
});

describe("formatLength in inches", () => {
  it.each<[number, InchPrecision, string]>([
    [42.59370078740158, 32, '42 19/32"'],
    [15.375, 32, '15 3/8"'],
    [0.25, 16, '1/4"'],
    [60, 32, '60"'],
    [27.21, 8, '27 1/4"'],
    [0.99, 8, '1"'],
    [15.375, "decimal", '15.375"'],
    [42.5, "decimal", '42.5"'],
  ])("%d at %s is %s", (value, inch, expected) => {
    expect(formatLength(value, "in", { inch, mm: 1 })).toBe(expected);
  });

  it("uses 1/32 by default", () => {
    expect(DEFAULT_DISPLAY).toEqual({ inch: 32, mm: 0.5 });
    expect(formatLength(28.625, "in")).toBe('28 5/8"');
  });
});

describe("formatLength in millimetres", () => {
  it.each<[number, MmPrecision, string]>([
    [1081.5, 0.5, "1081.5 mm"],
    [1081.7, 0.5, "1081.5 mm"],
    [1081.76, 0.1, "1081.8 mm"],
    [18, 1, "18 mm"],
    [1082, 0.5, "1082 mm"],
  ])("%d at step %d is %s", (value, mm, expected) => {
    expect(formatLength(value, "mm", { inch: 32, mm })).toBe(expected);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../../src/index.ts'` (or "Failed to load url").

- [ ] **Step 5: Implement units and formatting**

`packages/core/src/geometry/units.ts`:

```ts
export type Units = "in" | "mm";

export const MM_PER_INCH = 25.4;

export function convertLength(value: number, from: Units, to: Units): number {
  if (from === to) return value;
  return from === "in" ? value * MM_PER_INCH : value / MM_PER_INCH;
}
```

`packages/core/src/geometry/format.ts`:

```ts
import type { Units } from "./units.ts";

export type InchPrecision = 8 | 16 | 32 | 64 | "decimal";
export type MmPrecision = 1 | 0.5 | 0.1;

export interface DisplayPrecision {
  inch: InchPrecision;
  mm: MmPrecision;
}

export const DEFAULT_DISPLAY: DisplayPrecision = { inch: 32, mm: 0.5 };

export function formatLength(value: number, units: Units, display: DisplayPrecision = DEFAULT_DISPLAY): string {
  return units === "in" ? formatInches(value, display.inch) : formatMillimetres(value, display.mm);
}

function formatInches(value: number, precision: InchPrecision): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (precision === "decimal") return `${sign}${trimZeros(abs.toFixed(3))}"`;
  const steps = Math.round(abs * precision);
  const whole = Math.floor(steps / precision);
  let numerator = steps % precision;
  let denominator: number = precision;
  while (numerator > 0 && numerator % 2 === 0) {
    numerator /= 2;
    denominator /= 2;
  }
  if (numerator === 0) return `${sign}${whole}"`;
  if (whole === 0) return `${sign}${numerator}/${denominator}"`;
  return `${sign}${whole} ${numerator}/${denominator}"`;
}

function formatMillimetres(value: number, step: MmPrecision): string {
  const rounded = Math.round(value / step) * step;
  return `${trimZeros(rounded.toFixed(step === 1 ? 0 : 1))} mm`;
}

function trimZeros(text: string): string {
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}
```

`packages/core/src/index.ts`:

```ts
export * from "./geometry/units.ts";
export * from "./geometry/format.ts";
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `npm run check`
Expected: typecheck passes with no output; Vitest reports `Tests 15 passed`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json .gitignore packages/core
git commit -m "feat(core): scaffold workspace; add units and length formatting" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Length parsing

**Files:**
- Create: `packages/core/src/geometry/parse.ts`
- Modify: `packages/core/src/index.ts` (add one export line)
- Test: `packages/core/test/geometry/parse.test.ts`

**Interfaces:**
- Consumes: `convertLength`, `Units` (Task 1).
- Produces:
  - `parseLength(text: string, units: Units): number | null` — returns the length in `units`. Accepts decimals (`15.5`, `.75`), fractions (`3/8`, `15 3/8`, `15-3/8`, `15⅜`), inch marks (`"`, `″`, `in`, `inch`, `inches`), feet (`5'`, `4' 6"`, `4'-6 1/2"`, `4ft 6in`), metric suffixes (`mm`, `cm`, `m`, with `.` or `,` decimals), decimal commas (`764,5`), and thousands separators (`2,440`, `1,299.00`). A plain number is in `units`. A fraction without a unit is in inches. Returns `null` for empty, negative, or unreadable text.
  - `parsePlainNumber(text: string): number | null` — the plain-number rules alone (used for quantities and costs).

- [ ] **Step 1: Write the failing test**

`packages/core/test/geometry/parse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseLength, parsePlainNumber, type Units } from "../../src/index.ts";

describe("parseLength", () => {
  it.each<[string, Units, number]>([
    ["15.5", "in", 15.5],
    [".75", "in", 0.75],
    ["3/8", "in", 0.375],
    ["15 3/8", "in", 15.375],
    ["15-3/8", "in", 15.375],
    ['15 3/8"', "in", 15.375],
    ["15⅜", "in", 15.375],
    ["15 ⅜″", "in", 15.375],
    ["42 19/32 in", "in", 42.59375],
    ["0.75 inch", "in", 0.75],
    ["3 inches", "in", 3],
    ["5'", "in", 60],
    ["5 ft", "in", 60],
    ['4\' 6"', "in", 54],
    ['4\'-6 1/2"', "in", 54.5],
    ["4ft 6in", "in", 54],
    ["18", "mm", 18],
    ["1081,5", "mm", 1081.5],
    ["1081,5 mm", "mm", 1081.5],
    ["2,440", "mm", 2440],
    ["1,299.00", "mm", 1299],
    ["45.7cm", "mm", 457],
    ["1.2 m", "mm", 1200],
  ])("%s (%s) is %d", (text, units, expected) => {
    expect(parseLength(text, units)).toBeCloseTo(expected, 9);
  });

  it("converts between unit systems", () => {
    expect(parseLength("15 3/8", "mm")).toBeCloseTo(390.525, 9);
    expect(parseLength("457mm", "in")).toBeCloseTo(457 / 25.4, 9);
    expect(parseLength("5'", "mm")).toBeCloseTo(1524, 9);
  });

  it.each(["", "   ", "abc", "-5", "1/0", "12 apples", "3/8/2"])("rejects %j", (text) => {
    expect(parseLength(text, "in")).toBeNull();
  });
});

describe("parsePlainNumber", () => {
  it.each<[string, number | null]>([
    ["42", 42],
    ["0,5", 0.5],
    ["1,082", 1082],
    ["12,5", 12.5],
    ["1,299.00", 1299],
    ["2.0", 2],
    ["x", null],
    ["", null],
  ])("%j is %s", (text, expected) => {
    expect(parsePlainNumber(text)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `parseLength is not a function` / `does not provide an export named 'parseLength'`.

- [ ] **Step 3: Implement parsing**

`packages/core/src/geometry/parse.ts`:

```ts
import { convertLength, type Units } from "./units.ts";

const UNICODE_FRACTIONS: Readonly<Record<string, string>> = {
  "½": " 1/2",
  "¼": " 1/4",
  "¾": " 3/4",
  "⅛": " 1/8",
  "⅜": " 3/8",
  "⅝": " 5/8",
  "⅞": " 7/8",
};

const MM_PER: Readonly<Record<string, number>> = { mm: 1, cm: 10, m: 1000 };

const METRIC = /^(\d+(?:[.,]\d+)?)\s*(mm|cm|m)$/;
const FEET = /^(\d+(?:\.\d+)?)\s*(?:'|ft)\s*-?\s*(.*)$/;
const INCH_MARK = /\s*(?:"|inches|inch|in)$/;
const DECIMAL = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const FRACTION = /^(?:(\d+)(?:\s+|-))?(\d+)\/(\d+)$/;

export function parseLength(text: string, units: Units): number | null {
  let s = text
    .trim()
    .toLowerCase()
    .replace(/[″“”]/g, '"')
    .replace(/[′‘’]/g, "'")
    .replace(/[–—]/g, "-");
  for (const [glyph, ascii] of Object.entries(UNICODE_FRACTIONS)) s = s.replaceAll(glyph, ascii);
  s = s.replace(/\s+/g, " ").trim();
  if (s === "") return null;

  const metric = METRIC.exec(s);
  if (metric) {
    const value = Number(metric[1]!.replace(",", ".")) * MM_PER[metric[2]!]!;
    return convertLength(value, "mm", units);
  }

  const feet = FEET.exec(s);
  if (feet) {
    const rest = feet[2]!.replace(INCH_MARK, "");
    const inches = rest === "" ? 0 : parseInches(rest);
    return inches === null ? null : convertLength(Number(feet[1]) * 12 + inches, "in", units);
  }

  if (INCH_MARK.test(s) || FRACTION.test(s)) {
    const inches = parseInches(s.replace(INCH_MARK, ""));
    return inches === null ? null : convertLength(inches, "in", units);
  }

  return parsePlainNumber(s);
}

function parseInches(text: string): number | null {
  const s = text.trim();
  if (DECIMAL.test(s)) return Number(s);
  const fraction = FRACTION.exec(s);
  if (!fraction) return null;
  const denominator = Number(fraction[3]);
  if (denominator === 0) return null;
  return Number(fraction[1] ?? 0) + Number(fraction[2]) / denominator;
}

/** A comma followed by exactly three digits is a thousands separator ("2,440"); otherwise it is a decimal comma ("764,5"). */
export function parsePlainNumber(text: string): number | null {
  const s = text.trim();
  if (DECIMAL.test(s)) return Number(s);
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s)) return Number(s.replaceAll(",", ""));
  if (/^\d+,\d+$/.test(s)) return Number(s.replace(",", "."));
  return null;
}
```

Add to `packages/core/src/index.ts`:

```ts
export * from "./geometry/parse.ts";
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npm run check`
Expected: PASS — all parse and format tests pass; typecheck is clean.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): parse lengths in fractions, feet, metric, and decimal-comma forms" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Format schemas, project defaults, and the JSON Schema

**Files:**
- Create: `packages/core/src/format/schema.ts`, `packages/core/src/format/defaults.ts`, `packages/core/src/format/jsonSchema.ts`
- Create: `packages/core/scripts/write-schema.ts`
- Create (generated): `schema/cutplan.schema.json`
- Modify: `packages/core/src/index.ts`, root `package.json` (add `schema` script)
- Test: `packages/core/test/format/schema.test.ts`, `packages/core/test/format/jsonSchema.test.ts`, `packages/core/test/helpers.ts`

**Interfaces:**
- Consumes: `Units`, `DisplayPrecision` value shapes (Task 1).
- Produces:
  - Constants `FORMAT_ID = "opencutplan"`, `FORMAT_VERSION = "1.0"`.
  - zod schemas: `UnitsSchema`, `GrainSchema`, `MaterialSchema`, `StockSchema`, `PartSchema`, `ToolSchema` (discriminated on `type`: `"table-saw" | "track-saw" | "circular-saw" | "panel-saw"`), `FeaturesSchema`, `DisplaySchema`, `SettingsSchema`, `PlacementSchema`, `CutSchema`, `PlanSheetSchema`, `PlanSchema`, `ProjectInfoSchema`, `ProjectSchema`. Every object schema is `.loose()` (unknown keys are kept).
  - Types (zod output): `Grain`, `Material`, `Stock`, `StockKind`, `Part`, `Tool`, `ToolType`, `Features`, `Settings`, `Placement`, `Cut`, `PlanSheet`, `Plan`, `Project`; input type `ProjectInput`.
  - `const FEATURE_KEYS: readonly (keyof Features)[]` — the nine switch names in spec order.
  - `createProject(name: string, units: Units): Project`, `DEFAULT_TRIM: Record<Units, number>` (`{ in: 0.25, mm: 6 }`).
  - `buildJsonSchema(): Record<string, unknown>` — draft 2020-12, input mode (fields with defaults are optional).
  - Test helper `sampleProject(): Project` in `test/helpers.ts`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/helpers.ts`:

```ts
import { createProject, type Project } from "../src/index.ts";

export function sampleProject(): Project {
  const base = createProject("Test", "in");
  return {
    ...base,
    materials: [{ id: "ply", name: "Plywood 3/4", thickness: 0.75, grained: true }],
    stock: [{ id: "ply-4x8", material: "ply", length: 96, width: 48, quantity: null, cost: 60, kind: "sheet" }],
    parts: [{ id: "side", name: "Side", material: "ply", length: 30, width: 12, quantity: 2, grain: "length" }],
    tools: [{ id: "ts", name: "Table saw", type: "table-saw", kerf: 0.125, enabled: true, maxRip: 30 }],
    plan: {
      sheets: [
        {
          id: "s1",
          stock: "ply-4x8",
          placements: [
            { part: "side", copy: 0, x: 0.25, y: 0.25, rotated: false },
            { part: "side", copy: 1, x: 0.25, y: 12.375, rotated: false },
          ],
        },
      ],
    },
  };
}
```

`packages/core/test/format/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createProject, FEATURE_KEYS, ProjectSchema } from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

describe("createProject", () => {
  it("fills every default", () => {
    const project = createProject("Shelf", "in");
    expect(project.format).toBe("opencutplan");
    expect(project.version).toBe("1.0");
    expect(project.project).toEqual({ name: "Shelf", units: "in" });
    expect(project.settings).toEqual({
      features: Object.fromEntries(FEATURE_KEYS.map((key) => [key, true])),
      orderMode: "sheet",
      trim: 0.25,
      display: { inch: 32, mm: 0.5 },
      optimizer: { timeLimitMs: 2000 },
      currency: "USD",
    });
  });

  it("uses a metric trim for mm projects", () => {
    expect(createProject("Case", "mm").settings.trim).toBe(6);
  });

  it("lists the nine feature switches", () => {
    expect(FEATURE_KEYS).toEqual(["grain", "kerf", "trim", "cutOrder", "toolLimits", "offcuts", "cost", "labels", "snapping"]);
  });
});

describe("ProjectSchema", () => {
  it("accepts the sample project unchanged", () => {
    const project = sampleProject();
    expect(ProjectSchema.parse(project)).toEqual(project);
  });

  it("applies defaults for a file without settings", () => {
    const { settings: _settings, ...withoutSettings } = sampleProject();
    const parsed = ProjectSchema.parse(withoutSettings);
    expect(parsed.settings.features.grain).toBe(true);
    expect(parsed.settings.trim).toBe(0);
  });

  it("keeps unknown fields", () => {
    const project = sampleProject();
    const input = { ...project, parts: [{ ...project.parts[0]!, edgeBanding: { top: "birch" } }] };
    expect(ProjectSchema.parse(input).parts[0]).toHaveProperty("edgeBanding", { top: "birch" });
  });

  it("allows unlimited stock", () => {
    expect(ProjectSchema.parse(sampleProject()).stock[0]!.quantity).toBeNull();
  });

  it("reports the path of an invalid length", () => {
    const project = sampleProject();
    const result = ProjectSchema.safeParse({ ...project, parts: [{ ...project.parts[0]!, length: 0 }] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["parts", 0, "length"]);
  });

  it("rejects an unknown tool type", () => {
    const project = sampleProject();
    const result = ProjectSchema.safeParse({ ...project, tools: [{ id: "x", name: "Laser", type: "laser", kerf: 0, enabled: true }] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path.slice(0, 2)).toEqual(["tools", 0]);
  });

  it("rejects an inch precision that is not a supported denominator", () => {
    const project = sampleProject();
    const result = ProjectSchema.safeParse({ ...project, settings: { ...project.settings, display: { inch: 10, mm: 1 } } });
    expect(result.success).toBe(false);
  });
});
```

`packages/core/test/format/jsonSchema.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildJsonSchema } from "../../src/index.ts";

describe("buildJsonSchema", () => {
  const schema = buildJsonSchema();

  it("targets draft 2020-12", () => {
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.title).toBe("OpenCutPlan project");
  });

  it("requires only the fields without defaults", () => {
    expect(schema.required).toEqual(["format", "version", "project", "materials", "stock", "parts", "tools"]);
  });

  it("matches the checked-in schema/cutplan.schema.json (run `npm run schema` to update)", () => {
    const file = JSON.parse(readFileSync(new URL("../../../../schema/cutplan.schema.json", import.meta.url), "utf8"));
    expect(file).toEqual(schema);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `createProject` / `buildJsonSchema` are not exported.

- [ ] **Step 3: Implement the schemas**

`packages/core/src/format/schema.ts`:

```ts
import { z } from "zod";

export const FORMAT_ID = "opencutplan";
export const FORMAT_VERSION = "1.0";

const id = z.string().min(1);
const positive = z.number().positive();
const nonNegative = z.number().nonnegative();

export const UnitsSchema = z.enum(["in", "mm"]);
export const GrainSchema = z.enum(["length", "width", "none"]);

export const MaterialSchema = z
  .object({
    id,
    name: z.string().min(1),
    thickness: positive,
    grained: z.boolean(),
    color: z.string().optional(),
  })
  .loose();

export const StockSchema = z
  .object({
    id,
    material: id,
    length: positive,
    width: positive,
    quantity: z.number().int().positive().nullable(),
    cost: nonNegative.optional(),
    kind: z.enum(["sheet", "offcut"]),
    trim: nonNegative.optional(),
    enabled: z.boolean().optional(),
    name: z.string().optional(),
  })
  .loose();

export const PartSchema = z
  .object({
    id,
    name: z.string().min(1),
    material: id,
    length: positive,
    width: positive,
    quantity: z.number().int().positive(),
    grain: GrainSchema,
    group: z.string().optional(),
    notes: z.string().optional(),
  })
  .loose();

const toolBase = {
  id,
  name: z.string().min(1),
  kerf: nonNegative,
  enabled: z.boolean(),
};

export const ToolSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...toolBase,
      type: z.literal("table-saw"),
      maxRip: positive.optional(),
      maxCrosscut: positive.optional(),
      maxPiece: z.object({ length: positive, width: positive }).loose().optional(),
    })
    .loose(),
  z.object({ ...toolBase, type: z.literal("track-saw"), maxCut: positive.optional() }).loose(),
  z.object({ ...toolBase, type: z.literal("circular-saw"), maxCut: positive.optional() }).loose(),
  z
    .object({
      ...toolBase,
      type: z.literal("panel-saw"),
      maxCut: positive.optional(),
      maxStages: z.number().int().positive().optional(),
    })
    .loose(),
]);

export const FeaturesSchema = z
  .object({
    grain: z.boolean().default(true),
    kerf: z.boolean().default(true),
    trim: z.boolean().default(true),
    cutOrder: z.boolean().default(true),
    toolLimits: z.boolean().default(true),
    offcuts: z.boolean().default(true),
    cost: z.boolean().default(true),
    labels: z.boolean().default(true),
    snapping: z.boolean().default(true),
  })
  .loose();

export const DisplaySchema = z
  .object({
    inch: z.union([z.literal(8), z.literal(16), z.literal(32), z.literal(64), z.literal("decimal")]).default(32),
    mm: z.union([z.literal(1), z.literal(0.5), z.literal(0.1)]).default(0.5),
  })
  .loose();

export const SettingsSchema = z
  .object({
    features: FeaturesSchema.prefault({}),
    orderMode: z.enum(["sheet", "setup"]).default("sheet"),
    trim: nonNegative.default(0),
    minOffcut: z.object({ length: positive, width: positive }).loose().optional(),
    display: DisplaySchema.prefault({}),
    optimizer: z
      .object({
        timeLimitMs: z.number().int().positive().default(2000),
        seed: z.number().int().optional(),
      })
      .loose()
      .prefault({}),
    currency: z.string().regex(/^[A-Z]{3}$/).default("USD"),
  })
  .loose();

export const PlacementSchema = z
  .object({
    part: id,
    copy: z.number().int().nonnegative(),
    x: z.number(),
    y: z.number(),
    rotated: z.boolean(),
  })
  .loose();

export const CutSchema = z
  .object({
    step: z.number().int().positive(),
    stage: z.number().int().positive(),
    axis: z.enum(["x", "y"]),
    at: z.number(),
    from: z.number(),
    to: z.number(),
    tool: id.optional(),
    trim: z.boolean().optional(),
  })
  .loose();

export const PlanSheetSchema = z
  .object({
    id,
    stock: id,
    pinned: z.boolean().optional(),
    placements: z.array(PlacementSchema),
    cuts: z.array(CutSchema).optional(),
  })
  .loose();

export const PlanSchema = z.object({ sheets: z.array(PlanSheetSchema) }).loose();

export const ProjectInfoSchema = z
  .object({
    name: z.string().min(1),
    units: UnitsSchema,
    notes: z.string().optional(),
    created: z.iso.datetime({ offset: true }).optional(),
    modified: z.iso.datetime({ offset: true }).optional(),
  })
  .loose();

export const ProjectSchema = z
  .object({
    format: z.literal(FORMAT_ID),
    version: z.string().regex(/^\d+\.\d+$/),
    project: ProjectInfoSchema,
    materials: z.array(MaterialSchema),
    stock: z.array(StockSchema),
    parts: z.array(PartSchema),
    tools: z.array(ToolSchema),
    settings: SettingsSchema.prefault({}),
    plan: PlanSchema.optional(),
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .loose();

export type Grain = z.output<typeof GrainSchema>;
export type Material = z.output<typeof MaterialSchema>;
export type Stock = z.output<typeof StockSchema>;
export type StockKind = Stock["kind"];
export type Part = z.output<typeof PartSchema>;
export type Tool = z.output<typeof ToolSchema>;
export type ToolType = Tool["type"];
export type Features = z.output<typeof FeaturesSchema>;
export type Settings = z.output<typeof SettingsSchema>;
export type Placement = z.output<typeof PlacementSchema>;
export type Cut = z.output<typeof CutSchema>;
export type PlanSheet = z.output<typeof PlanSheetSchema>;
export type Plan = z.output<typeof PlanSchema>;
export type Project = z.output<typeof ProjectSchema>;
export type ProjectInput = z.input<typeof ProjectSchema>;

export const FEATURE_KEYS = [
  "grain",
  "kerf",
  "trim",
  "cutOrder",
  "toolLimits",
  "offcuts",
  "cost",
  "labels",
  "snapping",
] as const satisfies readonly (keyof Features)[];
```

`packages/core/src/format/defaults.ts`:

```ts
import type { Units } from "../geometry/units.ts";
import { FORMAT_ID, FORMAT_VERSION, ProjectSchema, type Project } from "./schema.ts";

export const DEFAULT_TRIM: Readonly<Record<Units, number>> = { in: 0.25, mm: 6 };

export function createProject(name: string, units: Units): Project {
  return ProjectSchema.parse({
    format: FORMAT_ID,
    version: FORMAT_VERSION,
    project: { name, units },
    materials: [],
    stock: [],
    parts: [],
    tools: [],
    settings: { trim: DEFAULT_TRIM[units] },
  });
}
```

`packages/core/src/format/jsonSchema.ts`:

```ts
import { z } from "zod";
import { ProjectSchema } from "./schema.ts";

export function buildJsonSchema(): Record<string, unknown> {
  return {
    ...z.toJSONSchema(ProjectSchema, { target: "draft-2020-12", io: "input" }),
    title: "OpenCutPlan project",
    description: "A sheet-goods cut plan: parts, stock, tools, settings, and an optional layout. See docs/format.md.",
  };
}
```

Add to `packages/core/src/index.ts`:

```ts
export * from "./format/schema.ts";
export * from "./format/defaults.ts";
export * from "./format/jsonSchema.ts";
```

- [ ] **Step 4: Add the schema script and generate the file**

`packages/core/scripts/write-schema.ts`:

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { buildJsonSchema } from "../src/format/jsonSchema.ts";

const dir = new URL("../../../schema/", import.meta.url);
mkdirSync(dir, { recursive: true });
const target = new URL("cutplan.schema.json", dir);
writeFileSync(target, `${JSON.stringify(buildJsonSchema(), null, 2)}\n`);
console.log(`wrote ${target.pathname}`);
```

Add to the root `package.json` `scripts`:

```json
"schema": "node packages/core/scripts/write-schema.ts"
```

Run: `npm run schema`
Expected: `wrote /…/opencutplan/schema/cutplan.schema.json`.

- [ ] **Step 5: Run the tests and typecheck**

Run: `npm run check`
Expected: PASS. If `requires only the fields without defaults` fails, check that `settings` uses `.prefault({})` and `buildJsonSchema` passes `io: "input"`.

- [ ] **Step 6: Commit**

```bash
git add package.json packages/core schema
git commit -m "feat(core): define the cutplan format schemas and publish a JSON Schema" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Issues, ids, and reference checks

**Files:**
- Create: `packages/core/src/format/issues.ts`, `packages/core/src/format/ids.ts`, `packages/core/src/format/references.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/format/ids.test.ts`, `packages/core/test/format/references.test.ts`

**Interfaces:**
- Consumes: `Project` (Task 3), `sampleProject()` (Task 3 helper).
- Produces:
  - `type IssueSeverity = "error" | "warning"`; `type IssueCode = "json" | "format" | "version" | "newer-minor" | "schema" | "duplicate-id" | "bad-ref" | "bad-copy" | "duplicate-placement"`; `type IssuePath = readonly (string | number)[]`; `interface Issue { severity; code; message: string; path: IssuePath }`.
  - `errorIssue(code, message, path?): Issue`, `warningIssue(code, message, path?): Issue`.
  - `slugify(text: string): string` (lowercase ASCII words joined by `-`; `"item"` when empty), `uniqueId(base: string, taken: ReadonlySet<string>): string` (`base`, then `base-2`, `base-3`, …).
  - `checkReferences(project: Project): Issue[]` — all errors; copy numbers in messages are 1-based.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/format/ids.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { slugify, uniqueId } from "../../src/index.ts";

describe("slugify", () => {
  it.each([
    ["A Top", "a-top"],
    ["Baltic birch 18mm 60x60", "baltic-birch-18mm-60x60"],
    ["  Étagère — côté  ", "etagere-cote"],
    ["***", "item"],
  ])("%j is %j", (text, expected) => {
    expect(slugify(text)).toBe(expected);
  });
});

describe("uniqueId", () => {
  it("adds the first free suffix", () => {
    expect(uniqueId("side", new Set())).toBe("side");
    expect(uniqueId("side", new Set(["side"]))).toBe("side-2");
    expect(uniqueId("side", new Set(["side", "side-2"]))).toBe("side-3");
  });
});
```

`packages/core/test/format/references.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checkReferences, type Project } from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

function sheet(project: Project) {
  return project.plan!.sheets[0]!;
}

describe("checkReferences", () => {
  it("accepts the sample project", () => {
    expect(checkReferences(sampleProject())).toEqual([]);
  });

  it("finds duplicate ids", () => {
    const project = sampleProject();
    project.materials.push({ ...project.materials[0]! });
    expect(checkReferences(project)).toEqual([
      { severity: "error", code: "duplicate-id", message: 'The id "ply" is used more than once in materials.', path: ["materials", 1, "id"] },
    ]);
  });

  it("finds a part with a missing material", () => {
    const project = sampleProject();
    project.parts[0]!.material = "oak";
    expect(checkReferences(project)).toEqual([
      { severity: "error", code: "bad-ref", message: 'Part "Side" uses material "oak", which does not exist.', path: ["parts", 0, "material"] },
    ]);
  });

  it("finds stock with a missing material", () => {
    const project = sampleProject();
    project.stock[0]!.material = "oak";
    const issues = checkReferences(project);
    expect(issues.map((issue) => issue.path)).toEqual([["stock", 0, "material"]]);
  });

  it("finds a sheet with missing stock", () => {
    const project = sampleProject();
    sheet(project).stock = "ply-5x5";
    expect(checkReferences(project)[0]).toMatchObject({ code: "bad-ref", path: ["plan", "sheets", 0, "stock"] });
  });

  it("finds a placement of a missing part", () => {
    const project = sampleProject();
    sheet(project).placements[0]!.part = "door";
    expect(checkReferences(project)[0]).toMatchObject({
      code: "bad-ref",
      message: 'Sheet "s1" places part "door", which does not exist.',
      path: ["plan", "sheets", 0, "placements", 0, "part"],
    });
  });

  it("finds a copy number past the part quantity", () => {
    const project = sampleProject();
    sheet(project).placements[1]!.copy = 2;
    expect(checkReferences(project)).toEqual([
      {
        severity: "error",
        code: "bad-copy",
        message: 'Sheet "s1" places copy 3 of "Side", but its quantity is 2.',
        path: ["plan", "sheets", 0, "placements", 1, "copy"],
      },
    ]);
  });

  it("finds a copy placed twice", () => {
    const project = sampleProject();
    sheet(project).placements[1]!.copy = 0;
    expect(checkReferences(project)).toEqual([
      {
        severity: "error",
        code: "duplicate-placement",
        message: 'Copy 1 of "Side" is placed more than once.',
        path: ["plan", "sheets", 0, "placements", 1],
      },
    ]);
  });

  it("finds a cut with a missing tool", () => {
    const project = sampleProject();
    sheet(project).cuts = [{ step: 1, stage: 1, axis: "y", at: 12.3125, from: 0, to: 96, tool: "router" }];
    expect(checkReferences(project)[0]).toMatchObject({ code: "bad-ref", path: ["plan", "sheets", 0, "cuts", 0, "tool"] });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `slugify` / `checkReferences` are not exported.

- [ ] **Step 3: Implement issues, ids, and references**

`packages/core/src/format/issues.ts`:

```ts
export type IssueSeverity = "error" | "warning";

export type IssueCode =
  | "json"
  | "format"
  | "version"
  | "newer-minor"
  | "schema"
  | "duplicate-id"
  | "bad-ref"
  | "bad-copy"
  | "duplicate-placement";

export type IssuePath = readonly (string | number)[];

export interface Issue {
  severity: IssueSeverity;
  code: IssueCode;
  message: string;
  path: IssuePath;
}

export function errorIssue(code: IssueCode, message: string, path: IssuePath = []): Issue {
  return { severity: "error", code, message, path };
}

export function warningIssue(code: IssueCode, message: string, path: IssuePath = []): Issue {
  return { severity: "warning", code, message, path };
}
```

`packages/core/src/format/ids.ts`:

```ts
export function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "item" : slug;
}

export function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
```

`packages/core/src/format/references.ts`:

```ts
import { errorIssue, type Issue, type IssuePath } from "./issues.ts";
import type { Project } from "./schema.ts";

function collectIds(items: readonly { id: string }[], path: readonly string[], issues: Issue[]): Set<string> {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      issues.push(errorIssue("duplicate-id", `The id "${item.id}" is used more than once in ${path.join(".")}.`, [...path, index, "id"]));
    }
    seen.add(item.id);
  });
  return seen;
}

export function checkReferences(project: Project): Issue[] {
  const issues: Issue[] = [];
  const materials = collectIds(project.materials, ["materials"], issues);
  const stock = collectIds(project.stock, ["stock"], issues);
  collectIds(project.parts, ["parts"], issues);
  const tools = collectIds(project.tools, ["tools"], issues);
  const parts = new Map(project.parts.map((part) => [part.id, part]));

  project.stock.forEach((item, index) => {
    if (!materials.has(item.material)) {
      issues.push(errorIssue("bad-ref", `Stock "${item.id}" uses material "${item.material}", which does not exist.`, ["stock", index, "material"]));
    }
  });
  project.parts.forEach((part, index) => {
    if (!materials.has(part.material)) {
      issues.push(errorIssue("bad-ref", `Part "${part.name}" uses material "${part.material}", which does not exist.`, ["parts", index, "material"]));
    }
  });

  const sheets = project.plan?.sheets ?? [];
  collectIds(sheets, ["plan", "sheets"], issues);
  const placed = new Set<string>();
  sheets.forEach((sheet, sheetIndex) => {
    const base: IssuePath = ["plan", "sheets", sheetIndex];
    if (!stock.has(sheet.stock)) {
      issues.push(errorIssue("bad-ref", `Sheet "${sheet.id}" uses stock "${sheet.stock}", which does not exist.`, [...base, "stock"]));
    }
    sheet.placements.forEach((placement, placementIndex) => {
      const path: IssuePath = [...base, "placements", placementIndex];
      const part = parts.get(placement.part);
      if (!part) {
        issues.push(errorIssue("bad-ref", `Sheet "${sheet.id}" places part "${placement.part}", which does not exist.`, [...path, "part"]));
        return;
      }
      if (placement.copy >= part.quantity) {
        issues.push(
          errorIssue(
            "bad-copy",
            `Sheet "${sheet.id}" places copy ${placement.copy + 1} of "${part.name}", but its quantity is ${part.quantity}.`,
            [...path, "copy"],
          ),
        );
        return;
      }
      const key = `${placement.part}#${placement.copy}`;
      if (placed.has(key)) {
        issues.push(errorIssue("duplicate-placement", `Copy ${placement.copy + 1} of "${part.name}" is placed more than once.`, path));
      }
      placed.add(key);
    });
    (sheet.cuts ?? []).forEach((cut, cutIndex) => {
      if (cut.tool !== undefined && !tools.has(cut.tool)) {
        issues.push(
          errorIssue("bad-ref", `Cut ${cut.step} on sheet "${sheet.id}" uses tool "${cut.tool}", which does not exist.`, [...base, "cuts", cutIndex, "tool"]),
        );
      }
    });
  });

  return issues;
}
```

Add to `packages/core/src/index.ts`:

```ts
export * from "./format/issues.ts";
export * from "./format/ids.ts";
export * from "./format/references.ts";
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): check ids and references in projects" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Reading and writing project files (versions, migration, round trip)

**Files:**
- Create: `packages/core/src/format/version.ts`, `packages/core/src/format/parse.ts`, `packages/core/src/format/serialize.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/format/version.test.ts`, `packages/core/test/format/parse.test.ts`

**Interfaces:**
- Consumes: `ProjectSchema`, `Project`, `FORMAT_ID`, `FORMAT_VERSION` (Task 3); `checkReferences`, `Issue`, `IssuePath`, `errorIssue`, `warningIssue` (Task 4).
- Produces:
  - `SUPPORTED_MAJOR = 1`, `SUPPORTED_MINOR = 0`, `interface Version { major: number; minor: number }`, `parseVersion(value: unknown): Version | null`.
  - `type Migration = (doc: Record<string, unknown>) => Record<string, unknown>`, `MIGRATIONS: Readonly<Record<number, Migration>>` (key = the minor version a migration upgrades from), `migrate(doc, migrations?, targetMinor?): Record<string, unknown>`.
  - `type ParseResult = { ok: true; project: Project; warnings: Issue[] } | { ok: false; errors: Issue[]; warnings: Issue[] }`, `parseProject(input: unknown): ParseResult` (accepts a JSON string, with or without a BOM, or an already-parsed value), `formatPath(path: IssuePath): string` (`parts[0].length`).
  - `serializeProject(project: Project): string` (2-space JSON plus a trailing newline).

- [ ] **Step 1: Write the failing tests**

`packages/core/test/format/version.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FORMAT_VERSION, migrate, parseVersion, SUPPORTED_MAJOR, SUPPORTED_MINOR } from "../../src/index.ts";

describe("parseVersion", () => {
  it("reads MAJOR.MINOR", () => {
    expect(parseVersion("1.0")).toEqual({ major: 1, minor: 0 });
    expect(parseVersion("2.13")).toEqual({ major: 2, minor: 13 });
  });

  it.each([1, "1", "1.0.0", "v1.0", null, undefined])("rejects %j", (value) => {
    expect(parseVersion(value)).toBeNull();
  });

  it("agrees with FORMAT_VERSION", () => {
    expect(FORMAT_VERSION).toBe(`${SUPPORTED_MAJOR}.${SUPPORTED_MINOR}`);
  });
});

describe("migrate", () => {
  it("leaves a current document unchanged", () => {
    const doc = { version: "1.0", a: 1 };
    expect(migrate(doc)).toEqual(doc);
  });

  it("applies each migration in order and updates the version", () => {
    const migrations = {
      0: (doc: Record<string, unknown>) => ({ ...doc, b: 2 }),
      1: (doc: Record<string, unknown>) => ({ ...doc, c: (doc.b as number) + 1 }),
    };
    expect(migrate({ version: "1.0", a: 1 }, migrations, 2)).toEqual({ version: "1.2", a: 1, b: 2, c: 3 });
  });

  it("leaves a newer minor version alone", () => {
    expect(migrate({ version: "1.4", a: 1 })).toEqual({ version: "1.4", a: 1 });
  });
});
```

`packages/core/test/format/parse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatPath, parseProject, serializeProject, type ParseResult } from "../../src/index.ts";
import { sampleProject } from "../helpers.ts";

function errors(result: ParseResult) {
  if (result.ok) throw new Error("expected the parse to fail");
  return result.errors;
}

describe("parseProject", () => {
  it("reads a serialized project back unchanged", () => {
    const project = sampleProject();
    expect(parseProject(serializeProject(project))).toEqual({ ok: true, project, warnings: [] });
  });

  it("reads a file that starts with a byte order mark", () => {
    const result = parseProject(`\uFEFF${serializeProject(sampleProject())}`);
    expect(result.ok).toBe(true);
  });

  it("reports invalid JSON", () => {
    const [issue] = errors(parseProject("{ not json"));
    expect(issue).toMatchObject({ code: "json", severity: "error" });
    expect(issue!.message).toMatch(/^The file is not valid JSON: /);
  });

  it("reports a value that is not an object", () => {
    expect(errors(parseProject("[1, 2]"))[0]).toMatchObject({ code: "format", message: "The file does not contain a JSON object." });
  });

  it("reports a different format", () => {
    expect(errors(parseProject({ format: "cutlist", version: "1.0" }))[0]).toMatchObject({
      code: "format",
      message: 'This is not an OpenCutPlan file (format is "cutlist").',
      path: ["format"],
    });
  });

  it("refuses an unknown major version", () => {
    const doc = { ...sampleProject(), version: "2.0" };
    expect(errors(parseProject(doc))[0]).toMatchObject({
      code: "version",
      message: "This file uses format version 2.0. This app reads version 1.x files.",
    });
  });

  it("refuses a malformed version", () => {
    expect(errors(parseProject({ ...sampleProject(), version: "1" }))[0]).toMatchObject({ code: "version", path: ["version"] });
  });

  it("reports schema errors with their path", () => {
    const project = sampleProject();
    const doc = { ...project, parts: [{ ...project.parts[0]!, length: -3 }] };
    expect(errors(parseProject(doc))[0]).toMatchObject({
      code: "schema",
      path: ["parts", 0, "length"],
      message: "parts[0].length: Too small: expected number to be >0",
    });
  });

  it("reports reference errors", () => {
    const project = sampleProject();
    project.plan!.sheets[0]!.placements[1]!.copy = 5;
    expect(errors(parseProject(project))[0]).toMatchObject({ code: "bad-copy" });
  });

  it("applies defaults to a minimal file", () => {
    const result = parseProject({
      format: "opencutplan",
      version: "1.0",
      project: { name: "Minimal", units: "mm" },
      materials: [],
      stock: [],
      parts: [],
      tools: [],
    });
    expect(result.ok && result.project.settings.features.cutOrder).toBe(true);
  });

  it("loads a newer minor version with a warning and keeps every unknown field on re-save", () => {
    const project = sampleProject();
    const doc = JSON.parse(serializeProject(project));
    doc.version = "1.4";
    doc.future = { x: 1 };
    doc.parts[0].edgeBanding = { top: "birch", bottom: null };
    doc.stock[0].supplier = "Local yard";
    doc.settings.features.newThing = true;
    doc.plan.sheets[0].placements[0].label = "S1-A";
    doc.extensions = { "com.example.tool": { ids: [1, 2, 3] } };

    const result = parseProject(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toEqual([
      {
        severity: "warning",
        code: "newer-minor",
        message: "This file uses format version 1.4, which is newer than this app (1.0). Unknown fields are kept but ignored.",
        path: ["version"],
      },
    ]);
    expect(JSON.parse(serializeProject(result.project))).toEqual(doc);
  });
});

describe("formatPath", () => {
  it.each([
    [["parts", 0, "length"], "parts[0].length"],
    [["version"], "version"],
    [[], "(root)"],
  ] as const)("%j is %s", (path, expected) => {
    expect(formatPath(path)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `parseProject` / `migrate` are not exported.

- [ ] **Step 3: Implement versions, parsing, and serialization**

`packages/core/src/format/version.ts`:

```ts
export const SUPPORTED_MAJOR = 1;
export const SUPPORTED_MINOR = 0;

export interface Version {
  major: number;
  minor: number;
}

export function parseVersion(value: unknown): Version | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+)\.(\d+)$/.exec(value);
  return match ? { major: Number(match[1]), minor: Number(match[2]) } : null;
}

export type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export function migrate(
  doc: Record<string, unknown>,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
  targetMinor: number = SUPPORTED_MINOR,
): Record<string, unknown> {
  const version = parseVersion(doc.version);
  if (!version) return doc;
  let current = doc;
  for (let minor = version.minor; minor < targetMinor; minor++) {
    const step = migrations[minor];
    current = { ...(step ? step(current) : current), version: `${version.major}.${minor + 1}` };
  }
  return current;
}
```

`packages/core/src/format/parse.ts`:

```ts
import { errorIssue, warningIssue, type Issue, type IssuePath } from "./issues.ts";
import { checkReferences } from "./references.ts";
import { FORMAT_ID, ProjectSchema, type Project } from "./schema.ts";
import { migrate, parseVersion, SUPPORTED_MAJOR, SUPPORTED_MINOR } from "./version.ts";

export type ParseResult =
  | { ok: true; project: Project; warnings: Issue[] }
  | { ok: false; errors: Issue[]; warnings: Issue[] };

export function parseProject(input: unknown): ParseResult {
  const warnings: Issue[] = [];
  const fail = (...errors: Issue[]): ParseResult => ({ ok: false, errors, warnings });

  let doc = input;
  if (typeof input === "string") {
    try {
      doc = JSON.parse(input.replace(/^\uFEFF/, ""));
    } catch (e) {
      return fail(errorIssue("json", `The file is not valid JSON: ${(e as Error).message}`));
    }
  }
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    return fail(errorIssue("format", "The file does not contain a JSON object."));
  }
  const record = doc as Record<string, unknown>;

  if (record.format !== FORMAT_ID) {
    return fail(errorIssue("format", `This is not an OpenCutPlan file (format is ${JSON.stringify(record.format ?? null)}).`, ["format"]));
  }
  const version = parseVersion(record.version);
  if (!version) {
    return fail(errorIssue("version", `The version ${JSON.stringify(record.version ?? null)} is not in MAJOR.MINOR form.`, ["version"]));
  }
  const versionText = `${version.major}.${version.minor}`;
  if (version.major !== SUPPORTED_MAJOR) {
    return fail(
      errorIssue("version", `This file uses format version ${versionText}. This app reads version ${SUPPORTED_MAJOR}.x files.`, ["version"]),
    );
  }
  if (version.minor > SUPPORTED_MINOR) {
    warnings.push(
      warningIssue(
        "newer-minor",
        `This file uses format version ${versionText}, which is newer than this app (${SUPPORTED_MAJOR}.${SUPPORTED_MINOR}). Unknown fields are kept but ignored.`,
        ["version"],
      ),
    );
  }

  const parsed = ProjectSchema.safeParse(migrate(record));
  if (!parsed.success) {
    return fail(
      ...parsed.error.issues.map((issue) => {
        const path = issue.path.map((key) => (typeof key === "symbol" ? key.toString() : key));
        return errorIssue("schema", `${formatPath(path)}: ${issue.message}`, path);
      }),
    );
  }

  const referenceErrors = checkReferences(parsed.data);
  if (referenceErrors.length > 0) return fail(...referenceErrors);

  return { ok: true, project: parsed.data, warnings };
}

export function formatPath(path: IssuePath): string {
  const text = path.reduce<string>(
    (out, key) => (typeof key === "number" ? `${out}[${key}]` : `${out}${out === "" ? "" : "."}${key}`),
    "",
  );
  return text === "" ? "(root)" : text;
}
```

`packages/core/src/format/serialize.ts`:

```ts
import type { Project } from "./schema.ts";

export function serializeProject(project: Project): string {
  return `${JSON.stringify(project, null, 2)}\n`;
}
```

Add to `packages/core/src/index.ts`:

```ts
export * from "./format/version.ts";
export * from "./format/parse.ts";
export * from "./format/serialize.ts";
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npm run check`
Expected: PASS. If the `Too small` message differs, zod's wording changed: update the expected string to the exact message zod 4.6.5 prints — do not loosen the path assertion.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): read and write cutplan files with version checks and field preservation" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: CSV tables, column mapping, and parts import

**Files:**
- Create: `packages/core/src/csv/table.ts`, `packages/core/src/csv/mapping.ts`, `packages/core/src/csv/types.ts`, `packages/core/src/csv/parts.ts`
- Modify: `packages/core/src/index.ts`, `packages/core/test/helpers.ts` (add `expectOk`)
- Test: `packages/core/test/csv/table.test.ts`, `packages/core/test/csv/parts.test.ts`

**Interfaces:**
- Consumes: `parseLength`, `parsePlainNumber` (Task 2); `convertLength`, `Units` (Task 1); `Grain` (Task 3).
- Produces:
  - `interface Table { headers: string[]; rows: string[][]; delimiter: string }`, `detectDelimiter(text: string): string` (`,` `;` or tab, chosen by count in the first line), `readTable(text: string, delimiter?: string): Table` (strips a BOM, skips empty and all-blank rows, trims cells, pads rows to the header width).
  - `type ColumnMapping<F extends string> = Partial<Record<F, number>>`, `normalizeHeader(header): string` (drops `(…)`/`[…]` and non-alphanumerics, lowercases), `headerUnits(header: string | undefined): Units | undefined` (reads `(mm)`, `(in)`, `(inch)`, `(inches)`, `(")`), `guessMapping(headers, aliases)` (each field takes the first unused column that matches its earliest possible alias), `missingFields(mapping, required)`, `cell(row, mapping, field): string`, `lengthCell(row, table, mapping, field, units): { text: string; value: number | null }`.
  - `interface CsvRowIssue { severity: "error" | "warning"; row: number; column?: string; message: string }` (`row` is the spreadsheet row number; the header is row 1). `type CsvImport<R, F extends string> = { status: "ok"; rows: R[]; issues: CsvRowIssue[]; mapping: ColumnMapping<F>; table: Table } | { status: "needs-mapping"; missing: F[]; mapping: ColumnMapping<F>; table: Table }`.
  - `PART_ALIASES`, `type PartField`, `PART_REQUIRED` (`["length", "width"]`), `interface PartRow { name: string; length: number; width: number; quantity: number; material: string; grain: Grain; group?: string; notes?: string; thickness?: number }`, `interface PartImportOptions { units: Units; mapping?: ColumnMapping<PartField>; defaultMaterial?: string }`, `importPartsCsv(text: string, options: PartImportOptions): CsvImport<PartRow, PartField>`.
  - Row rules: a bad length, width, or quantity is an **error** and the row is skipped. An unknown grain or thickness is a **warning** and the row is kept (grain becomes `"length"`, thickness is dropped). Empty name → `Part N` (N = data row number); empty quantity → 1; empty material → `defaultMaterial` or `"Material"`; empty grain → `"length"`.
  - Test helper `expectOk(result)` returns the `ok` variant or throws.

- [ ] **Step 1: Add the test helper**

Change the import line at the top of `packages/core/test/helpers.ts` to:

```ts
import { createProject, type CsvImport, type Project } from "../src/index.ts";
```

and append to the end of the file:

```ts
export function expectOk<R, F extends string>(result: CsvImport<R, F>) {
  if (result.status !== "ok") throw new Error(`expected status ok, got needs-mapping (missing: ${result.missing.join(", ")})`);
  return result;
}
```

- [ ] **Step 2: Write the failing tests**

`packages/core/test/csv/table.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { detectDelimiter, guessMapping, headerUnits, normalizeHeader, readTable } from "../../src/index.ts";

describe("readTable", () => {
  it("handles an Excel export: BOM, CRLF, semicolons, and blank trailing rows", () => {
    const table = readTable("\uFEFFPart;Qty;L;W\r\nSide;2;1800;300\r\nShelf;3;764,5;280\r\n\r\n;;;\r\n");
    expect(table).toEqual({
      headers: ["Part", "Qty", "L", "W"],
      rows: [
        ["Side", "2", "1800", "300"],
        ["Shelf", "3", "764,5", "280"],
      ],
      delimiter: ";",
    });
  });

  it("keeps delimiters, quotes, and newlines inside quoted cells", () => {
    const table = readTable('name,notes\n"Shelf, top","has ""pin""\nholes"\n');
    expect(table.rows).toEqual([["Shelf, top", 'has "pin"\nholes']]);
  });

  it("pads short rows to the header width", () => {
    expect(readTable("a,b,c\n1\n").rows).toEqual([["1", "", ""]]);
  });

  it("returns an empty table for empty text", () => {
    expect(readTable("")).toEqual({ headers: [], rows: [], delimiter: "," });
  });
});

describe("detectDelimiter", () => {
  it.each([
    ["a,b,c\n1;2;3", ","],
    ["a;b;c\n1,5;2;3", ";"],
    ["a\tb\tc", "\t"],
    ["name", ","],
  ])("%j uses %j", (text, expected) => {
    expect(detectDelimiter(text)).toBe(expected);
  });
});

describe("headers", () => {
  it("normalizes headers", () => {
    expect(normalizeHeader(" Cutting Length (mm) ")).toBe("cuttinglength");
    expect(normalizeHeader("Qty.")).toBe("qty");
  });

  it("reads units from headers", () => {
    expect(headerUnits("Length (mm)")).toBe("mm");
    expect(headerUnits('Width (")')).toBe("in");
    expect(headerUnits("Width [inches]")).toBe("in");
    expect(headerUnits("Width")).toBeUndefined();
    expect(headerUnits(undefined)).toBeUndefined();
  });

  it("maps each field to an unused column, trying its aliases in order", () => {
    const aliases = { name: ["name", "part"], length: ["length", "l"], width: ["width", "w"] };
    expect(guessMapping(["Part", "W", "L", "Name"], aliases)).toEqual({ name: 3, length: 2, width: 1 });
  });
});
```

`packages/core/test/csv/parts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { importPartsCsv } from "../../src/index.ts";
import { expectOk } from "../helpers.ts";

describe("importPartsCsv", () => {
  it("reads our own columns with fractions and quoted cells", () => {
    const csv = [
      "name,length,width,quantity,material,grain,group,notes",
      "A Top,42 19/32,15 3/8,1,Baltic birch 18mm,length,3x2 A,",
      '"Shelf, adjustable",13 1/4,15 3/8,3,Baltic birch 18mm,length,3x2 A,"has ""pin"" holes"',
    ].join("\n");
    const result = expectOk(importPartsCsv(csv, { units: "in" }));
    expect(result.issues).toEqual([]);
    expect(result.rows).toEqual([
      { name: "A Top", length: 42.59375, width: 15.375, quantity: 1, material: "Baltic birch 18mm", grain: "length", group: "3x2 A" },
      {
        name: "Shelf, adjustable",
        length: 13.25,
        width: 15.375,
        quantity: 3,
        material: "Baltic birch 18mm",
        grain: "length",
        group: "3x2 A",
        notes: 'has "pin" holes',
      },
    ]);
  });

  it("reads a European Excel export with semicolons and decimal commas", () => {
    const csv = "\uFEFFPart;Qty;L;W;Material;Grain\r\nSide;2;1800;300;MDF;none\r\nShelf;3;764,5;280;MDF;-\r\n\r\n;;;;;\r\n";
    const result = expectOk(importPartsCsv(csv, { units: "mm" }));
    expect(result.rows).toEqual([
      { name: "Side", length: 1800, width: 300, quantity: 2, material: "MDF", grain: "none" },
      { name: "Shelf", length: 764.5, width: 280, quantity: 3, material: "MDF", grain: "none" },
    ]);
  });

  it("recognizes common alternative headers", () => {
    const csv = "Part name,Count,Cutting length,Cutting width,Material name,Grain direction\nDoor,2,700,396,Birch ply,yes\n";
    const result = expectOk(importPartsCsv(csv, { units: "mm" }));
    expect(result.rows).toEqual([{ name: "Door", length: 700, width: 396, quantity: 2, material: "Birch ply", grain: "length" }]);
  });

  it("converts values from units declared in the headers", () => {
    const csv = "Name,Length (mm),Width (mm),Qty,Thickness (mm)\nSide,1800,300,2,18\n";
    const [row] = expectOk(importPartsCsv(csv, { units: "in" })).rows;
    expect(row!.length).toBeCloseTo(1800 / 25.4, 9);
    expect(row!.width).toBeCloseTo(300 / 25.4, 9);
    expect(row!.thickness).toBeCloseTo(18 / 25.4, 9);
  });

  it("asks for a mapping when required columns are unknown, then uses it", () => {
    const csv = "Item,Long side,Short side,How many\nSide,30,12,2\n";
    const first = importPartsCsv(csv, { units: "in" });
    expect(first.status).toBe("needs-mapping");
    if (first.status !== "needs-mapping") return;
    expect(first.missing).toEqual(["length", "width"]);
    expect(first.mapping).toEqual({ name: 0 });
    expect(first.table.headers).toEqual(["Item", "Long side", "Short side", "How many"]);

    const second = expectOk(importPartsCsv(csv, { units: "in", mapping: { name: 0, length: 1, width: 2, quantity: 3 } }));
    expect(second.rows).toEqual([{ name: "Side", length: 30, width: 12, quantity: 2, material: "Material", grain: "length" }]);
  });

  it("skips rows with errors and keeps rows with warnings", () => {
    const csv = [
      "name,length,width,quantity,grain,thickness",
      "Good,10,5,1,,",
      "BadLength,abc,5,1,,",
      "BadQty,10,5,1.5,,",
      "OddGrain,10,5,1,diagonal,thick",
    ].join("\n");
    const result = expectOk(importPartsCsv(csv, { units: "in" }));
    expect(result.rows.map((row) => row.name)).toEqual(["Good", "OddGrain"]);
    expect(result.rows[1]!.grain).toBe("length");
    expect(result.rows[1]).not.toHaveProperty("thickness");
    expect(result.issues).toEqual([
      { severity: "error", row: 3, column: "length", message: 'Row 3: length "abc" is not a valid length.' },
      { severity: "error", row: 4, column: "quantity", message: 'Row 4: quantity "1.5" is not a whole number of 1 or more.' },
      { severity: "warning", row: 5, column: "grain", message: 'Row 5: grain "diagonal" is not recognized, so "length" is used.' },
      { severity: "warning", row: 5, column: "thickness", message: 'Row 5: thickness "thick" is not a valid length, so it is ignored.' },
    ]);
  });

  it("fills defaults for empty cells", () => {
    const result = expectOk(importPartsCsv("length,width\n10,5\n", { units: "in", defaultMaterial: "Pine ply" }));
    expect(result.rows).toEqual([{ name: "Part 1", length: 10, width: 5, quantity: 1, material: "Pine ply", grain: "length" }]);
  });

  it("reads inch fractions in a metric project", () => {
    const [row] = expectOk(importPartsCsv("length,width\n15 3/8,10\n", { units: "mm" })).rows;
    expect(row!.length).toBeCloseTo(390.525, 9);
    expect(row!.width).toBe(10);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `readTable` / `importPartsCsv` are not exported.

- [ ] **Step 4: Implement tables, mapping, and parts import**

`packages/core/src/csv/table.ts`:

```ts
import Papa from "papaparse";

export interface Table {
  headers: string[];
  rows: string[][];
  delimiter: string;
}

const DELIMITERS = [",", ";", "\t"] as const;

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  let best: string = ",";
  let bestCount = 0;
  for (const delimiter of DELIMITERS) {
    const count = firstLine.split(delimiter).length - 1;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

export function readTable(text: string, delimiter?: string): Table {
  const clean = text.replace(/^\uFEFF/, "");
  const used = delimiter ?? detectDelimiter(clean);
  const result = Papa.parse<string[]>(clean, { delimiter: used, skipEmptyLines: "greedy" });
  const [headerRow = [], ...dataRows] = result.data;
  return {
    headers: headerRow.map((header) => header.trim()),
    rows: dataRows.map((row) => Array.from({ length: Math.max(headerRow.length, row.length) }, (_, i) => (row[i] ?? "").trim())),
    delimiter: used,
  };
}
```

`packages/core/src/csv/mapping.ts`:

```ts
import { parseLength } from "../geometry/parse.ts";
import { convertLength, type Units } from "../geometry/units.ts";
import type { Table } from "./table.ts";

export type ColumnMapping<F extends string> = Partial<Record<F, number>>;

export function normalizeHeader(header: string): string {
  return header
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function headerUnits(header: string | undefined): Units | undefined {
  const match = /[([]\s*(mm|in|inch|inches|")\s*[)\]]/i.exec(header ?? "");
  if (!match) return undefined;
  return match[1]!.toLowerCase() === "mm" ? "mm" : "in";
}

export function guessMapping<F extends string>(
  headers: readonly string[],
  aliases: Readonly<Record<F, readonly string[]>>,
): ColumnMapping<F> {
  const mapping: ColumnMapping<F> = {};
  const used = new Set<number>();
  const normalized = headers.map(normalizeHeader);
  for (const field of Object.keys(aliases) as F[]) {
    for (const alias of aliases[field]) {
      const wanted = normalizeHeader(alias);
      const index = normalized.findIndex((header, i) => !used.has(i) && header === wanted);
      if (index >= 0) {
        mapping[field] = index;
        used.add(index);
        break;
      }
    }
  }
  return mapping;
}

export function missingFields<F extends string>(mapping: ColumnMapping<F>, required: readonly F[]): F[] {
  return required.filter((field) => mapping[field] === undefined);
}

export function cell<F extends string>(row: readonly string[], mapping: ColumnMapping<F>, field: F): string {
  const index = mapping[field];
  return index === undefined ? "" : (row[index] ?? "");
}

export function lengthCell<F extends string>(
  row: readonly string[],
  table: Table,
  mapping: ColumnMapping<F>,
  field: F,
  units: Units,
): { text: string; value: number | null } {
  const text = cell(row, mapping, field);
  const index = mapping[field];
  const declared = headerUnits(index === undefined ? undefined : table.headers[index]) ?? units;
  const value = parseLength(text, declared);
  return { text, value: value === null ? null : convertLength(value, declared, units) };
}
```

`packages/core/src/csv/types.ts`:

```ts
import type { ColumnMapping } from "./mapping.ts";
import type { Table } from "./table.ts";

export interface CsvRowIssue {
  severity: "error" | "warning";
  row: number;
  column?: string;
  message: string;
}

export type CsvImport<R, F extends string> =
  | { status: "ok"; rows: R[]; issues: CsvRowIssue[]; mapping: ColumnMapping<F>; table: Table }
  | { status: "needs-mapping"; missing: F[]; mapping: ColumnMapping<F>; table: Table };
```

`packages/core/src/csv/parts.ts`:

```ts
import type { Grain } from "../format/schema.ts";
import { parsePlainNumber } from "../geometry/parse.ts";
import type { Units } from "../geometry/units.ts";
import { cell, guessMapping, lengthCell, missingFields, type ColumnMapping } from "./mapping.ts";
import { readTable } from "./table.ts";
import type { CsvImport, CsvRowIssue } from "./types.ts";

export const PART_ALIASES = {
  name: ["name", "part", "part name", "label", "designation", "description", "item"],
  length: ["length", "l", "len", "cutting length", "final length"],
  width: ["width", "w", "cutting width", "final width"],
  quantity: ["quantity", "qty", "q", "count", "pcs", "pieces"],
  material: ["material", "material name", "mat"],
  grain: ["grain", "grain direction", "grain lock", "grain locked"],
  group: ["group", "cabinet", "assembly", "unit"],
  notes: ["notes", "note", "comment", "comments", "info"],
  thickness: ["thickness", "t", "thick", "cutting thickness"],
} as const satisfies Record<string, readonly string[]>;

export type PartField = keyof typeof PART_ALIASES;

export const PART_REQUIRED: readonly PartField[] = ["length", "width"];

export interface PartRow {
  name: string;
  length: number;
  width: number;
  quantity: number;
  material: string;
  grain: Grain;
  group?: string;
  notes?: string;
  thickness?: number;
}

export interface PartImportOptions {
  units: Units;
  mapping?: ColumnMapping<PartField>;
  defaultMaterial?: string;
}

const GRAIN_WORDS: Readonly<Record<string, Grain>> = {
  length: "length",
  l: "length",
  long: "length",
  lengthwise: "length",
  yes: "length",
  y: "length",
  true: "length",
  "1": "length",
  x: "length",
  width: "width",
  w: "width",
  widthwise: "width",
  cross: "width",
  none: "none",
  no: "none",
  n: "none",
  false: "none",
  "0": "none",
  "-": "none",
  any: "none",
  free: "none",
};

function parseGrain(text: string): Grain | null {
  if (text === "") return "length";
  return GRAIN_WORDS[text.toLowerCase()] ?? null;
}

function parseQuantity(text: string): number | null {
  if (text === "") return 1;
  const value = parsePlainNumber(text);
  return value !== null && Number.isInteger(value) && value >= 1 ? value : null;
}

export function importPartsCsv(text: string, options: PartImportOptions): CsvImport<PartRow, PartField> {
  const table = readTable(text);
  const mapping = options.mapping ?? guessMapping(table.headers, PART_ALIASES);
  const missing = missingFields(mapping, PART_REQUIRED);
  if (missing.length > 0) return { status: "needs-mapping", missing, mapping, table };

  const rows: PartRow[] = [];
  const issues: CsvRowIssue[] = [];
  table.rows.forEach((raw, index) => {
    const row = index + 2;
    const get = (field: PartField) => cell(raw, mapping, field);
    const errors: CsvRowIssue[] = [];

    const requireLength = (field: "length" | "width"): number => {
      const { text: value, value: parsed } = lengthCell(raw, table, mapping, field, options.units);
      if (parsed !== null && parsed > 0) return parsed;
      errors.push({ severity: "error", row, column: field, message: `Row ${row}: ${field} "${value}" is not a valid length.` });
      return 0;
    };
    const length = requireLength("length");
    const width = requireLength("width");
    const quantity = parseQuantity(get("quantity"));
    if (quantity === null) {
      errors.push({ severity: "error", row, column: "quantity", message: `Row ${row}: quantity "${get("quantity")}" is not a whole number of 1 or more.` });
    }
    if (errors.length > 0 || quantity === null) {
      issues.push(...errors);
      return;
    }

    let grain = parseGrain(get("grain"));
    if (grain === null) {
      issues.push({ severity: "warning", row, column: "grain", message: `Row ${row}: grain "${get("grain")}" is not recognized, so "length" is used.` });
      grain = "length";
    }

    const part: PartRow = {
      name: get("name") || `Part ${index + 1}`,
      length,
      width,
      quantity,
      material: get("material") || (options.defaultMaterial ?? "Material"),
      grain,
    };
    if (get("thickness") !== "") {
      const thickness = lengthCell(raw, table, mapping, "thickness", options.units).value;
      if (thickness !== null && thickness > 0) part.thickness = thickness;
      else {
        issues.push({
          severity: "warning",
          row,
          column: "thickness",
          message: `Row ${row}: thickness "${get("thickness")}" is not a valid length, so it is ignored.`,
        });
      }
    }
    if (get("group") !== "") part.group = get("group");
    if (get("notes") !== "") part.notes = get("notes");
    rows.push(part);
  });

  return { status: "ok", rows, issues, mapping, table };
}
```

Add to `packages/core/src/index.ts`:

```ts
export * from "./csv/table.ts";
export * from "./csv/mapping.ts";
export * from "./csv/types.ts";
export * from "./csv/parts.ts";
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): import part lists from CSV with header detection and unit-aware cells" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Stock import from CSV

**Files:**
- Create: `packages/core/src/csv/stock.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/csv/stock.test.ts`

**Interfaces:**
- Consumes: `readTable`, `guessMapping`, `missingFields`, `cell`, `lengthCell`, `ColumnMapping`, `CsvImport`, `CsvRowIssue` (Task 6); `parsePlainNumber` (Task 2); `StockKind` (Task 3).
- Produces:
  - `STOCK_ALIASES`, `type StockField`, `STOCK_REQUIRED` (`["length", "width"]`), `interface StockRow { material: string; length: number; width: number; quantity: number | null; kind: StockKind; thickness?: number; cost?: number; name?: string }`, `interface StockImportOptions { units: Units; mapping?: ColumnMapping<StockField>; defaultMaterial?: string }`, `importStockCsv(text: string, options: StockImportOptions): CsvImport<StockRow, StockField>`.
  - Row rules: bad length or width → error; quantity blank or `unlimited`/`∞`/`inf`/`infinite`/`any`/`-` → `null`; quantity `0`, negative, or fractional → error; cost has currency symbols removed (`$95.00`, `95,00 €`, `"1,299.00"`); an unreadable cost or kind → warning (cost dropped, kind `"sheet"`); kinds `offcut`/`off-cut`/`remnant`/`scrap`/`leftover` → `"offcut"`, and `sheet`/`new`/`panel`/`board`/blank → `"sheet"`.

- [ ] **Step 1: Write the failing test**

`packages/core/test/csv/stock.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { importStockCsv } from "../../src/index.ts";
import { expectOk } from "../helpers.ts";

describe("importStockCsv", () => {
  it("reads sheets and offcuts with prices, thickness, and unlimited quantities", () => {
    const csv = [
      "Material,Length,Width,Thickness,Qty,Price,Kind,Name",
      "Baltic birch 18mm,60,60,18mm,,$95.00,sheet,",
      "Baltic birch 18mm,30,22,18mm,1,,offcut,From the bench",
      'MDF 3/4,96,48,3/4,unlimited,"1,299.00",panel,',
    ].join("\n");
    const result = expectOk(importStockCsv(csv, { units: "in" }));
    expect(result.issues).toEqual([]);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toEqual({ material: "Baltic birch 18mm", length: 60, width: 60, thickness: 18 / 25.4, quantity: null, cost: 95, kind: "sheet" });
    expect(result.rows[1]).toEqual({
      material: "Baltic birch 18mm",
      length: 30,
      width: 22,
      thickness: 18 / 25.4,
      quantity: 1,
      kind: "offcut",
      name: "From the bench",
    });
    expect(result.rows[2]).toEqual({ material: "MDF 3/4", length: 96, width: 48, thickness: 0.75, quantity: null, cost: 1299, kind: "sheet" });
  });

  it("reads euro prices with decimal commas", () => {
    const [row] = expectOk(importStockCsv("material;length;width;cost\nMDF;2440;1220;42,50 €\n", { units: "mm" })).rows;
    expect(row).toEqual({ material: "MDF", length: 2440, width: 1220, quantity: null, cost: 42.5, kind: "sheet" });
  });

  it("reports bad rows and odd values", () => {
    const csv = ["material,length,width,quantity,cost,kind", "A,96,0,1,,", "B,96,48,0,,", "C,96,48,2,free,mystery"].join("\n");
    const result = expectOk(importStockCsv(csv, { units: "in" }));
    expect(result.rows).toEqual([{ material: "C", length: 96, width: 48, quantity: 2, kind: "sheet" }]);
    expect(result.issues).toEqual([
      { severity: "error", row: 2, column: "width", message: 'Row 2: width "0" is not a valid length.' },
      { severity: "error", row: 3, column: "quantity", message: 'Row 3: quantity "0" is not a whole number of 1 or more, or "unlimited".' },
      { severity: "warning", row: 4, column: "cost", message: 'Row 4: cost "free" is not a number, so it is ignored.' },
      { severity: "warning", row: 4, column: "kind", message: 'Row 4: kind "mystery" is not recognized, so "sheet" is used.' },
    ]);
  });

  it("asks for a mapping when length or width is missing", () => {
    const result = importStockCsv("material,size\nMDF,4x8\n", { units: "in" });
    expect(result.status).toBe("needs-mapping");
    expect(result.status === "needs-mapping" && result.missing).toEqual(["length", "width"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `importStockCsv` is not exported.

- [ ] **Step 3: Implement stock import**

`packages/core/src/csv/stock.ts`:

```ts
import type { StockKind } from "../format/schema.ts";
import { parsePlainNumber } from "../geometry/parse.ts";
import type { Units } from "../geometry/units.ts";
import { cell, guessMapping, lengthCell, missingFields, type ColumnMapping } from "./mapping.ts";
import { readTable } from "./table.ts";
import type { CsvImport, CsvRowIssue } from "./types.ts";

export const STOCK_ALIASES = {
  material: ["material", "material name", "mat"],
  length: ["length", "l", "len", "sheet length"],
  width: ["width", "w", "sheet width"],
  thickness: ["thickness", "t", "thick"],
  quantity: ["quantity", "qty", "q", "count", "on hand"],
  cost: ["cost", "price", "unit cost", "unit price", "cost each"],
  kind: ["kind", "type"],
  name: ["name", "label", "description"],
} as const satisfies Record<string, readonly string[]>;

export type StockField = keyof typeof STOCK_ALIASES;

export const STOCK_REQUIRED: readonly StockField[] = ["length", "width"];

export interface StockRow {
  material: string;
  length: number;
  width: number;
  quantity: number | null;
  kind: StockKind;
  thickness?: number;
  cost?: number;
  name?: string;
}

export interface StockImportOptions {
  units: Units;
  mapping?: ColumnMapping<StockField>;
  defaultMaterial?: string;
}

const UNLIMITED = new Set(["", "unlimited", "∞", "inf", "infinite", "any", "-"]);

const KIND_WORDS: Readonly<Record<string, StockKind>> = {
  "": "sheet",
  sheet: "sheet",
  new: "sheet",
  panel: "sheet",
  board: "sheet",
  offcut: "offcut",
  "off-cut": "offcut",
  remnant: "offcut",
  scrap: "offcut",
  leftover: "offcut",
};

type Parsed<T> = { ok: true; value: T } | { ok: false };

function parseStockQuantity(text: string): Parsed<number | null> {
  if (UNLIMITED.has(text.toLowerCase())) return { ok: true, value: null };
  const value = parsePlainNumber(text);
  return value !== null && Number.isInteger(value) && value >= 1 ? { ok: true, value } : { ok: false };
}

function parseCost(text: string): Parsed<number> {
  const digits = text.replace(/[^\d.,]/g, "");
  const value = digits === "" ? null : parsePlainNumber(digits);
  return value === null ? { ok: false } : { ok: true, value };
}

export function importStockCsv(text: string, options: StockImportOptions): CsvImport<StockRow, StockField> {
  const table = readTable(text);
  const mapping = options.mapping ?? guessMapping(table.headers, STOCK_ALIASES);
  const missing = missingFields(mapping, STOCK_REQUIRED);
  if (missing.length > 0) return { status: "needs-mapping", missing, mapping, table };

  const rows: StockRow[] = [];
  const issues: CsvRowIssue[] = [];
  table.rows.forEach((raw, index) => {
    const row = index + 2;
    const get = (field: StockField) => cell(raw, mapping, field);
    const errors: CsvRowIssue[] = [];

    const requireLength = (field: "length" | "width"): number => {
      const { text: value, value: parsed } = lengthCell(raw, table, mapping, field, options.units);
      if (parsed !== null && parsed > 0) return parsed;
      errors.push({ severity: "error", row, column: field, message: `Row ${row}: ${field} "${value}" is not a valid length.` });
      return 0;
    };
    const length = requireLength("length");
    const width = requireLength("width");
    const quantity = parseStockQuantity(get("quantity"));
    if (!quantity.ok) {
      errors.push({
        severity: "error",
        row,
        column: "quantity",
        message: `Row ${row}: quantity "${get("quantity")}" is not a whole number of 1 or more, or "unlimited".`,
      });
    }
    if (errors.length > 0 || !quantity.ok) {
      issues.push(...errors);
      return;
    }

    const stock: StockRow = {
      material: get("material") || (options.defaultMaterial ?? "Material"),
      length,
      width,
      quantity: quantity.value,
      kind: "sheet",
    };
    if (get("thickness") !== "") {
      const thickness = lengthCell(raw, table, mapping, "thickness", options.units).value;
      if (thickness !== null && thickness > 0) stock.thickness = thickness;
      else {
        issues.push({
          severity: "warning",
          row,
          column: "thickness",
          message: `Row ${row}: thickness "${get("thickness")}" is not a valid length, so it is ignored.`,
        });
      }
    }
    if (get("cost") !== "") {
      const cost = parseCost(get("cost"));
      if (cost.ok) stock.cost = cost.value;
      else issues.push({ severity: "warning", row, column: "cost", message: `Row ${row}: cost "${get("cost")}" is not a number, so it is ignored.` });
    }
    const kind = KIND_WORDS[get("kind").toLowerCase()];
    if (kind === undefined) {
      issues.push({ severity: "warning", row, column: "kind", message: `Row ${row}: kind "${get("kind")}" is not recognized, so "sheet" is used.` });
    } else {
      stock.kind = kind;
    }
    if (get("name") !== "") stock.name = get("name");
    rows.push(stock);
  });

  return { status: "ok", rows, issues, mapping, table };
}
```

Warnings for one row appear in column order: thickness, cost, kind.

Add to `packages/core/src/index.ts`:

```ts
export * from "./csv/stock.ts";
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npm run check`
Expected: PASS, including the exact issue order in `reports bad rows and odd values`.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): import stock lists from CSV" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: CSV export and adding imported rows to a project

**Files:**
- Create: `packages/core/src/csv/export.ts`, `packages/core/src/csv/apply.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/csv/export.test.ts`, `packages/core/test/csv/apply.test.ts`

**Interfaces:**
- Consumes: `Project`, `Material`, `Part`, `Stock` (Task 3); `slugify`, `uniqueId` (Task 4); `parseProject`, `serializeProject` (Task 5); `importPartsCsv`, `PartRow` (Task 6); `importStockCsv`, `StockRow` (Task 7).
- Produces:
  - `exportPartsCsv(project: Project): string` — header `name,length,width,quantity,material,grain,group,notes`; material **names**; lengths rounded to 4 decimals; CRLF line endings including a final CRLF; RFC 4180 quoting.
  - `exportStockCsv(project: Project): string` — header `material,length,width,thickness,quantity,cost,kind,name`; `null` quantity → `unlimited`.
  - `interface ApplyResult { project: Project; createdMaterials: Material[] }`, `addPartRows(project, rows: readonly PartRow[]): ApplyResult`, `addStockRows(project, rows: readonly StockRow[]): ApplyResult`. Materials match an existing material by name or id, ignoring case. A new material gets id `slugify(name)` (made unique), the row thickness or the default (`0.75` in / `18` mm), and `grained: true`. New part ids are `uniqueId(slugify(name))`; new stock ids are `uniqueId(slugify("<material name> <length>x<width>"))`. The input project is not modified.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/csv/export.test.ts`:

```ts
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { exportPartsCsv, exportStockCsv, importPartsCsv, importStockCsv, type Grain } from "../../src/index.ts";
import { expectOk, sampleProject } from "../helpers.ts";

describe("exportPartsCsv", () => {
  it("writes our columns with material names", () => {
    expect(exportPartsCsv(sampleProject())).toBe("name,length,width,quantity,material,grain,group,notes\r\nSide,30,12,2,Plywood 3/4,length,,\r\n");
  });

  it("round-trips any part list through importPartsCsv", () => {
    const text = fc.stringMatching(/^[A-Za-z0-9](?:[A-Za-z0-9 ,;"'-]{0,18}[A-Za-z0-9])?$/);
    const size = fc.integer({ min: 1, max: 2_000_000 }).map((n) => n / 10_000);
    const part = fc.record({
      name: text,
      length: size,
      width: size,
      quantity: fc.integer({ min: 1, max: 50 }),
      grain: fc.constantFrom<Grain>("length", "width", "none"),
      group: fc.option(text, { nil: undefined }),
      notes: fc.option(text, { nil: undefined }),
    });
    fc.assert(
      fc.property(fc.array(part, { minLength: 1, maxLength: 20 }), (parts) => {
        const project = { ...sampleProject(), parts: parts.map((p, i) => ({ ...p, id: `p${i}`, material: "ply" })) };
        const imported = expectOk(importPartsCsv(exportPartsCsv(project), { units: "in" }));
        expect(imported.issues).toEqual([]);
        expect(imported.rows).toEqual(parts.map((p) => ({ ...p, material: "Plywood 3/4" })));
      }),
    );
  });
});

describe("exportStockCsv", () => {
  it("writes our columns and marks unlimited quantity", () => {
    expect(exportStockCsv(sampleProject())).toBe("material,length,width,thickness,quantity,cost,kind,name\r\nPlywood 3/4,96,48,0.75,unlimited,60,sheet,\r\n");
  });

  it("round-trips through importStockCsv", () => {
    const project = sampleProject();
    project.stock.push({ id: "offcut", material: "ply", length: 30.5, width: 22, quantity: 1, kind: "offcut", name: "Bench, left side" });
    const imported = expectOk(importStockCsv(exportStockCsv(project), { units: "in" }));
    expect(imported.rows).toEqual([
      { material: "Plywood 3/4", length: 96, width: 48, thickness: 0.75, quantity: null, cost: 60, kind: "sheet" },
      { material: "Plywood 3/4", length: 30.5, width: 22, thickness: 0.75, quantity: 1, kind: "offcut", name: "Bench, left side" },
    ]);
  });
});
```

`packages/core/test/csv/apply.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { addPartRows, addStockRows, importPartsCsv, parseProject, serializeProject } from "../../src/index.ts";
import { expectOk, sampleProject } from "../helpers.ts";

describe("addPartRows", () => {
  it("matches materials by name, creates new ones, and makes unique ids", () => {
    const original = sampleProject();
    const { project, createdMaterials } = addPartRows(original, [
      { name: "Side", length: 30, width: 12, quantity: 1, material: "plywood 3/4", grain: "length" },
      { name: "Door", length: 20, width: 10, quantity: 2, material: "MDF", grain: "none", thickness: 0.5, group: "Doors" },
      { name: "Drawer front", length: 18, width: 6, quantity: 3, material: "mdf", grain: "none" },
    ]);
    expect(createdMaterials).toEqual([{ id: "mdf", name: "MDF", thickness: 0.5, grained: true }]);
    expect(project.parts.map((part) => [part.id, part.material])).toEqual([
      ["side", "ply"],
      ["side-2", "ply"],
      ["door", "mdf"],
      ["drawer-front", "mdf"],
    ]);
    expect(project.parts[2]).toEqual({ id: "door", name: "Door", material: "mdf", length: 20, width: 10, quantity: 2, grain: "none", group: "Doors" });
    expect(original.parts).toHaveLength(1);
    expect(parseProject(serializeProject(project)).ok).toBe(true);
  });

  it("uses the default thickness for the project units", () => {
    const { createdMaterials } = addPartRows(sampleProject(), [{ name: "Top", length: 10, width: 5, quantity: 1, material: "Oak ply", grain: "length" }]);
    expect(createdMaterials[0]!.thickness).toBe(0.75);
  });

  it("turns a pasted CSV into a valid project", () => {
    const rows = expectOk(importPartsCsv("name,length,width,quantity,material\nShelf,30,11 1/4,4,Pine\n", { units: "in" })).rows;
    const { project } = addPartRows(sampleProject(), rows);
    expect(parseProject(project).ok).toBe(true);
  });
});

describe("addStockRows", () => {
  it("adds stock with ids from the material and size", () => {
    const { project, createdMaterials } = addStockRows(sampleProject(), [
      { material: "Plywood 3/4", length: 60, width: 60, quantity: null, kind: "sheet", cost: 95 },
      { material: "Hardboard", length: 96, width: 48, quantity: 2, kind: "sheet", thickness: 0.125 },
    ]);
    expect(createdMaterials).toEqual([{ id: "hardboard", name: "Hardboard", thickness: 0.125, grained: true }]);
    expect(project.stock.slice(1)).toEqual([
      { id: "plywood-3-4-60x60", material: "ply", length: 60, width: 60, quantity: null, kind: "sheet", cost: 95 },
      { id: "hardboard-96x48", material: "hardboard", length: 96, width: 48, quantity: 2, kind: "sheet" },
    ]);
    expect(parseProject(project).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `exportPartsCsv` / `addPartRows` are not exported.

- [ ] **Step 3: Implement export and apply**

`packages/core/src/csv/export.ts`:

```ts
import Papa from "papaparse";
import type { Project } from "../format/schema.ts";

function decimal(value: number): string {
  return String(Math.round(value * 10_000) / 10_000);
}

function toCsv(fields: string[], data: string[][]): string {
  return `${Papa.unparse({ fields, data }, { newline: "\r\n" })}\r\n`;
}

export function exportPartsCsv(project: Project): string {
  const materialNames = new Map(project.materials.map((material) => [material.id, material.name]));
  return toCsv(
    ["name", "length", "width", "quantity", "material", "grain", "group", "notes"],
    project.parts.map((part) => [
      part.name,
      decimal(part.length),
      decimal(part.width),
      String(part.quantity),
      materialNames.get(part.material) ?? part.material,
      part.grain,
      part.group ?? "",
      part.notes ?? "",
    ]),
  );
}

export function exportStockCsv(project: Project): string {
  const materials = new Map(project.materials.map((material) => [material.id, material]));
  return toCsv(
    ["material", "length", "width", "thickness", "quantity", "cost", "kind", "name"],
    project.stock.map((stock) => {
      const material = materials.get(stock.material);
      return [
        material?.name ?? stock.material,
        decimal(stock.length),
        decimal(stock.width),
        material ? decimal(material.thickness) : "",
        stock.quantity === null ? "unlimited" : String(stock.quantity),
        stock.cost === undefined ? "" : decimal(stock.cost),
        stock.kind,
        stock.name ?? "",
      ];
    }),
  );
}
```

`packages/core/src/csv/apply.ts`:

```ts
import { slugify, uniqueId } from "../format/ids.ts";
import type { Material, Part, Project, Stock } from "../format/schema.ts";
import type { Units } from "../geometry/units.ts";
import type { PartRow } from "./parts.ts";
import type { StockRow } from "./stock.ts";

const DEFAULT_THICKNESS: Readonly<Record<Units, number>> = { in: 0.75, mm: 18 };

export interface ApplyResult {
  project: Project;
  createdMaterials: Material[];
}

interface MaterialRow {
  material: string;
  thickness?: number | undefined;
}

function resolveMaterials(project: Project, rows: readonly MaterialRow[]) {
  const materials = [...project.materials];
  const created: Material[] = [];
  const taken = new Set(materials.map((material) => material.id));
  const byKey = new Map<string, string>();
  for (const material of materials) {
    byKey.set(material.id.toLowerCase(), material.id);
    byKey.set(material.name.trim().toLowerCase(), material.id);
  }
  for (const row of rows) {
    const key = row.material.trim().toLowerCase();
    if (byKey.has(key)) continue;
    const id = uniqueId(slugify(row.material), taken);
    taken.add(id);
    const material: Material = {
      id,
      name: row.material.trim(),
      thickness: row.thickness ?? DEFAULT_THICKNESS[project.project.units],
      grained: true,
    };
    materials.push(material);
    created.push(material);
    byKey.set(key, id);
  }
  const idFor = (name: string): string => byKey.get(name.trim().toLowerCase()) ?? slugify(name);
  return { materials, created, idFor };
}

export function addPartRows(project: Project, rows: readonly PartRow[]): ApplyResult {
  const { materials, created, idFor } = resolveMaterials(project, rows);
  const taken = new Set(project.parts.map((part) => part.id));
  const parts = [...project.parts];
  for (const row of rows) {
    const id = uniqueId(slugify(row.name), taken);
    taken.add(id);
    const part: Part = {
      id,
      name: row.name,
      material: idFor(row.material),
      length: row.length,
      width: row.width,
      quantity: row.quantity,
      grain: row.grain,
    };
    if (row.group !== undefined) part.group = row.group;
    if (row.notes !== undefined) part.notes = row.notes;
    parts.push(part);
  }
  return { project: { ...project, materials, parts }, createdMaterials: created };
}

export function addStockRows(project: Project, rows: readonly StockRow[]): ApplyResult {
  const { materials, created, idFor } = resolveMaterials(project, rows);
  const names = new Map(materials.map((material) => [material.id, material.name]));
  const taken = new Set(project.stock.map((stock) => stock.id));
  const stock = [...project.stock];
  for (const row of rows) {
    const material = idFor(row.material);
    const id = uniqueId(slugify(`${names.get(material) ?? material} ${row.length}x${row.width}`), taken);
    taken.add(id);
    const item: Stock = { id, material, length: row.length, width: row.width, quantity: row.quantity, kind: row.kind };
    if (row.cost !== undefined) item.cost = row.cost;
    if (row.name !== undefined) item.name = row.name;
    stock.push(item);
  }
  return { project: { ...project, materials, stock }, createdMaterials: created };
}
```

Add to `packages/core/src/index.ts`:

```ts
export * from "./csv/export.ts";
export * from "./csv/apply.ts";
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npm run check`
Expected: PASS. If the property test fails, fast-check prints the shrunk counterexample — fix the code path it exposes (quoting, trimming, or rounding), not the generator.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): export parts and stock to CSV and add imported rows to projects" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Sample projects, format documentation, and README

**Files:**
- Create: `examples/tsconfig.json`, `examples/build.ts`, `examples/builders/index.ts`, `examples/builders/living-room-shelf.ts`, `examples/builders/simple-bookcase-mm.ts`
- Create (generated): `examples/living-room-shelf.cutplan.json`, `examples/simple-bookcase-mm.cutplan.json`, `examples/csv/*.csv`
- Create: `docs/format.md`, `README.md`, `.gitattributes`
- Modify: root `package.json` (scripts)
- Test: `packages/core/test/examples.test.ts`

**Interfaces:**
- Consumes: `ProjectInput`, `parseProject`, `serializeProject`, `exportPartsCsv`, `exportStockCsv`, `formatLength` (Tasks 1–8).
- Produces: `EXAMPLES: Record<string, () => ProjectInput>` in `examples/builders/index.ts` (keys `"living-room-shelf"`, `"simple-bookcase-mm"`), `livingRoomShelf(): ProjectInput`, `simpleBookcaseMm(): ProjectInput`. Later phases load these examples in tests (for example, the Phase 3 check "the optimizer uses ≤ 5 + 2 sheets").

- [ ] **Step 1: Write the failing test**

`packages/core/test/examples.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../examples/builders/index.ts";
import { exportPartsCsv, exportStockCsv, formatLength, parseProject, serializeProject, type Project } from "../src/index.ts";

const dir = new URL("../../../examples/", import.meta.url);

function parse(slug: string) {
  const result = parseProject(EXAMPLES[slug]!());
  if (!result.ok) throw new Error(result.errors.map((issue) => issue.message).join("\n"));
  return result;
}

function build(slug: string): Project {
  return parse(slug).project;
}

describe.each(Object.keys(EXAMPLES))("example %s", (slug) => {
  it("parses without errors or warnings", () => {
    expect(parse(slug).warnings).toEqual([]);
  });

  it("matches the checked-in files (run `npm run examples` to update)", () => {
    const project = build(slug);
    expect(readFileSync(new URL(`${slug}.cutplan.json`, dir), "utf8")).toBe(serializeProject(project));
    expect(readFileSync(new URL(`csv/${slug}-parts.csv`, dir), "utf8")).toBe(exportPartsCsv(project));
    expect(readFileSync(new URL(`csv/${slug}-stock.csv`, dir), "utf8")).toBe(exportStockCsv(project));
  });
});

describe("examples folder", () => {
  it("has a builder for every .cutplan.json file", () => {
    const files = readdirSync(dir)
      .filter((file) => file.endsWith(".cutplan.json"))
      .map((file) => file.slice(0, -".cutplan.json".length));
    expect(files.sort()).toEqual(Object.keys(EXAMPLES).sort());
  });
});

describe("living-room-shelf", () => {
  const project = build("living-room-shelf");

  it("uses the hand-made plan: 5 sheets of 18mm and 2 sheets of 6mm", () => {
    const sheets = project.plan!.sheets;
    expect(sheets.filter((sheet) => sheet.stock === "bb18-5x5")).toHaveLength(5);
    expect(sheets.filter((sheet) => sheet.stock === "bb6-5x5")).toHaveLength(2);
  });

  it("places every copy of every part exactly once", () => {
    const copies = project.parts.reduce((total, part) => total + part.quantity, 0);
    expect(copies).toBe(31);
    expect(project.plan!.sheets.flatMap((sheet) => sheet.placements)).toHaveLength(31);
  });

  it("has the sizes from the original cut list", () => {
    const size = (id: string) => {
      const part = project.parts.find((p) => p.id === id)!;
      return `${formatLength(part.length, "in")} x ${formatLength(part.width, "in")}`;
    };
    expect(size("a-top")).toBe('42 19/32" x 15 3/8"');
    expect(size("b-top")).toBe('56 17/32" x 15 3/8"');
    expect(size("a-side")).toBe('27 7/32" x 15 3/8"');
    expect(size("b-back")).toBe('56 17/32" x 28 5/8"');
  });

  it("keeps every placement inside its 60 x 60 sheet", () => {
    const parts = new Map(project.parts.map((part) => [part.id, part]));
    for (const placement of project.plan!.sheets.flatMap((sheet) => sheet.placements)) {
      const part = parts.get(placement.part)!;
      expect(placement.x + part.length).toBeLessThanOrEqual(60);
      expect(placement.y + part.width).toBeLessThanOrEqual(60);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `../../../examples/builders/index.ts`.

- [ ] **Step 3: Write the builders**

`examples/builders/living-room-shelf.ts`:

```ts
import type { ProjectInput } from "../../packages/core/src/index.ts";

type PartInput = ProjectInput["parts"][number];
type PlacementInput = NonNullable<ProjectInput["plan"]>["sheets"][number]["placements"][number];

const FRAME = 18 / 25.4;
const MODULE = 13.25;
const DEPTH = 15.375;
const KERF = 0.125;
const TRIM = 0.25;

const SIZE = {
  top3: 3 * MODULE + 4 * FRAME,
  top4: 4 * MODULE + 5 * FRAME,
  tall: 2 * MODULE + FRAME,
  short: MODULE,
  backHeight: 2 * MODULE + 3 * FRAME,
};

function part(id: string, name: string, material: string, length: number, width: number, quantity: number, group: string): PartInput {
  return { id, name, material, length, width, quantity, grain: "length", group };
}

function threeByTwo(unit: "a" | "c"): PartInput[] {
  const label = unit.toUpperCase();
  const group = `3x2 ${label}`;
  return [
    part(`${unit}-top`, `${label} Top`, "bb18", SIZE.top3, DEPTH, 1, group),
    part(`${unit}-bottom`, `${label} Bottom`, "bb18", SIZE.top3, DEPTH, 1, group),
    part(`${unit}-side`, `${label} Side`, "bb18", SIZE.tall, DEPTH, 2, group),
    part(`${unit}-vdiv`, `${label} Divider`, "bb18", SIZE.tall, DEPTH, 2, group),
    part(`${unit}-shelf`, `${label} Shelf`, "bb18", SIZE.short, DEPTH, 3, group),
    part(`${unit}-back`, `${label} Back`, "bb6", SIZE.top3, SIZE.backHeight, 1, group),
  ];
}

const PARTS: PartInput[] = [
  ...threeByTwo("a"),
  ...threeByTwo("c"),
  part("b-top", "B Top", "bb18", SIZE.top4, DEPTH, 1, "4x2 B"),
  part("b-bottom", "B Bottom", "bb18", SIZE.top4, DEPTH, 1, "4x2 B"),
  part("b-side", "B Side", "bb18", SIZE.tall, DEPTH, 2, "4x2 B"),
  part("b-vdiv", "B Divider", "bb18", SIZE.tall, DEPTH, 2, "4x2 B"),
  part("b-long-shelf", "B Long shelf", "bb18", SIZE.tall, DEPTH, 1, "4x2 B"),
  part("b-short-vdiv", "B Short divider", "bb18", SIZE.short, DEPTH, 1, "4x2 B"),
  part("b-shelf", "B Shelf", "bb18", SIZE.short, DEPTH, 2, "4x2 B"),
  part("b-back", "B Back", "bb6", SIZE.top4, SIZE.backHeight, 1, "4x2 B"),
];

type Strip = [partId: string, copy: number][];

const SHEETS: { stock: string; strips: Strip[] }[] = [
  { stock: "bb18-5x5", strips: [[["b-top", 0]], [["b-bottom", 0]], [["a-top", 0], ["a-shelf", 0]]] },
  { stock: "bb18-5x5", strips: [[["a-bottom", 0], ["a-shelf", 1]], [["c-top", 0], ["c-shelf", 0]], [["c-bottom", 0], ["c-shelf", 1]]] },
  { stock: "bb18-5x5", strips: [[["a-side", 0], ["a-side", 1]], [["a-vdiv", 0], ["a-vdiv", 1]], [["c-side", 0], ["c-side", 1]]] },
  { stock: "bb18-5x5", strips: [[["c-vdiv", 0], ["c-vdiv", 1]], [["b-side", 0], ["b-side", 1]], [["b-vdiv", 0], ["b-vdiv", 1]]] },
  {
    stock: "bb18-5x5",
    strips: [
      [["b-long-shelf", 0], ["b-shelf", 0], ["b-shelf", 1]],
      [["a-shelf", 2], ["c-shelf", 2], ["b-short-vdiv", 0]],
    ],
  },
  { stock: "bb6-5x5", strips: [[["b-back", 0]], [["a-back", 0]]] },
  { stock: "bb6-5x5", strips: [[["c-back", 0]]] },
];

function layout(strips: Strip[]): PlacementInput[] {
  const byId = new Map(PARTS.map((p) => [p.id, p]));
  const placements: PlacementInput[] = [];
  let y = TRIM;
  for (const strip of strips) {
    let x = TRIM;
    let height = 0;
    for (const [partId, copy] of strip) {
      const p = byId.get(partId)!;
      placements.push({ part: partId, copy, x, y, rotated: false });
      x += p.length + KERF;
      height = Math.max(height, p.width);
    }
    y += height + KERF;
  }
  return placements;
}

export function livingRoomShelf(): ProjectInput {
  return {
    format: "opencutplan",
    version: "1.0",
    project: {
      name: "Living room shelf",
      units: "in",
      notes: "Two 3x2 cubby cabinets and one 4x2 cabinet with a wide top opening, in 5' x 5' baltic birch.",
    },
    materials: [
      { id: "bb18", name: "Baltic birch 18mm", thickness: FRAME, grained: true },
      { id: "bb6", name: "Baltic birch 6mm", thickness: 6 / 25.4, grained: true },
    ],
    stock: [
      { id: "bb18-5x5", material: "bb18", length: 60, width: 60, quantity: null, kind: "sheet" },
      { id: "bb6-5x5", material: "bb6", length: 60, width: 60, quantity: null, kind: "sheet" },
    ],
    parts: PARTS,
    tools: [{ id: "table-saw", name: "Table saw", type: "table-saw", kerf: KERF, enabled: true }],
    settings: { trim: TRIM },
    plan: { sheets: SHEETS.map((sheet, i) => ({ id: `s${i + 1}`, stock: sheet.stock, placements: layout(sheet.strips) })) },
  };
}
```

`examples/builders/simple-bookcase-mm.ts`:

```ts
import type { ProjectInput } from "../../packages/core/src/index.ts";

export function simpleBookcaseMm(): ProjectInput {
  return {
    format: "opencutplan",
    version: "1.0",
    project: { name: "Simple bookcase (metric)", units: "mm" },
    materials: [
      { id: "mdf18", name: "MDF 18mm", thickness: 18, grained: false },
      { id: "hdf3", name: "Hardboard 3mm", thickness: 3, grained: false },
    ],
    stock: [
      { id: "mdf18-2440x1220", material: "mdf18", length: 2440, width: 1220, quantity: null, cost: 42, kind: "sheet" },
      { id: "mdf18-offcut", material: "mdf18", length: 900, width: 400, quantity: 1, cost: 0, kind: "offcut", name: "Offcut from the desk project" },
      { id: "hdf3-2440x1220", material: "hdf3", length: 2440, width: 1220, quantity: null, cost: 15, kind: "sheet" },
    ],
    parts: [
      { id: "side", name: "Side", material: "mdf18", length: 1800, width: 300, quantity: 2, grain: "none", group: "Carcass" },
      { id: "top-bottom", name: "Top / bottom", material: "mdf18", length: 764, width: 300, quantity: 2, grain: "none", group: "Carcass" },
      { id: "shelf", name: "Shelf", material: "mdf18", length: 762, width: 280, quantity: 4, grain: "none", group: "Shelves" },
      { id: "back", name: "Back", material: "hdf3", length: 1800, width: 800, quantity: 1, grain: "none", group: "Carcass" },
    ],
    tools: [
      { id: "track-saw", name: "Track saw (1.4 m rail)", type: "track-saw", kerf: 2.2, enabled: true, maxCut: 1400 },
      { id: "table-saw", name: "Jobsite table saw", type: "table-saw", kerf: 3.2, enabled: true, maxRip: 610, maxPiece: { length: 1800, width: 800 } },
    ],
    settings: { trim: 6, currency: "EUR", display: { mm: 1 } },
  };
}
```

`examples/builders/index.ts`:

```ts
import type { ProjectInput } from "../../packages/core/src/index.ts";
import { livingRoomShelf } from "./living-room-shelf.ts";
import { simpleBookcaseMm } from "./simple-bookcase-mm.ts";

export const EXAMPLES: Readonly<Record<string, () => ProjectInput>> = {
  "living-room-shelf": livingRoomShelf,
  "simple-bookcase-mm": simpleBookcaseMm,
};
```

`examples/build.ts`:

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { exportPartsCsv, exportStockCsv, parseProject, serializeProject } from "../packages/core/src/index.ts";
import { EXAMPLES } from "./builders/index.ts";

mkdirSync(new URL("./csv/", import.meta.url), { recursive: true });
for (const [slug, build] of Object.entries(EXAMPLES)) {
  const result = parseProject(build());
  if (!result.ok) throw new Error(`${slug}: ${result.errors.map((issue) => issue.message).join("; ")}`);
  writeFileSync(new URL(`./${slug}.cutplan.json`, import.meta.url), serializeProject(result.project));
  writeFileSync(new URL(`./csv/${slug}-parts.csv`, import.meta.url), exportPartsCsv(result.project));
  writeFileSync(new URL(`./csv/${slug}-stock.csv`, import.meta.url), exportStockCsv(result.project));
  console.log(`wrote ${slug}`);
}
```

`.gitattributes` (keeps the generated files byte-identical on Windows checkouts, so the drift test passes there):

```
* text=auto eol=lf
*.csv text eol=crlf
```

`examples/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "include": ["build.ts", "builders"]
}
```

Update the root `package.json` `scripts` to:

```json
"scripts": {
  "typecheck": "tsc -p packages/core && tsc -p examples",
  "test": "npm test -w @opencutplan/core",
  "schema": "node packages/core/scripts/write-schema.ts",
  "examples": "node examples/build.ts",
  "check": "npm run typecheck && npm test"
}
```

- [ ] **Step 4: Generate the example files**

Run: `npm run examples`
Expected:

```
wrote living-room-shelf
wrote simple-bookcase-mm
```

and the files `examples/living-room-shelf.cutplan.json`, `examples/simple-bookcase-mm.cutplan.json`, and four CSVs in `examples/csv/`.

- [ ] **Step 5: Run the tests and typecheck**

Run: `npm run check`
Expected: PASS for all tasks' tests.

- [ ] **Step 6: Write the format documentation**

`docs/format.md`:

````markdown
# The OpenCutPlan file format (`.cutplan.json`), version 1.0

An OpenCutPlan file describes a sheet-goods cutting project: the parts to cut, the stock to cut them from, the tools
available, settings, and optionally a layout of parts on sheets with an ordered list of cuts.

The machine-readable definition is [`schema/cutplan.schema.json`](../schema/cutplan.schema.json) (JSON Schema draft
2020-12). This document explains the meaning of each field. Complete examples are in [`examples/`](../examples).

## Conventions

- **Encoding.** UTF-8 JSON. Readers should accept and ignore a leading byte order mark.
- **Units.** Every length in the file is a decimal number in `project.units`: `"in"` (inches) or `"mm"` (millimetres).
  Fractions such as `15 3/8"` appear only in user interfaces.
- **Length and width.** Length is the first dimension. On stock, the grain runs along the length.
- **Ids.** Every `id` is a non-empty string, unique within its collection. References use ids.
- **Coordinates.** A placement's origin is the top-left corner of the full stock piece (before edge trim). `x` runs
  along the stock length, `y` along the stock width. `(x, y)` is the part's top-left corner.

## Top level

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | Always `"opencutplan"`. |
| `version` | yes | `"MAJOR.MINOR"`; this document describes `"1.0"`. |
| `project` | yes | `name` (text), `units` (`"in"` or `"mm"`), optional `notes`, `created`, `modified` (ISO 8601 date-times). |
| `materials` | yes | Materials; see below. |
| `stock` | yes | Stock pieces available for cutting. |
| `parts` | yes | Parts to cut. |
| `tools` | yes | Saws the user owns (may be empty). |
| `settings` | no | Defaults apply to every missing setting. |
| `plan` | no | A layout of parts on stock. |
| `extensions` | no | Application data, keyed by a namespace such as `"com.example.tool"`. |

## Materials

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | |
| `name` | yes | For example `"Baltic birch 18mm"`. |
| `thickness` | yes | Actual thickness, not nominal. |
| `grained` | yes | `true` when the face has a grain or pattern direction. |
| `color` | no | Display colour (CSS colour string). |

## Stock

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | |
| `material` | yes | A material id. |
| `length`, `width` | yes | Size of the full piece. |
| `quantity` | yes | Pieces available, or `null` when more can be bought. |
| `kind` | yes | `"sheet"` (new stock) or `"offcut"` (left over from earlier work). |
| `cost` | no | Price per piece in `settings.currency`. |
| `trim` | no | Edge trim for this stock; overrides `settings.trim`. |
| `enabled` | no | `false` excludes this stock from planning. Default `true`. |
| `name` | no | Display name. |

## Parts

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | |
| `name` | yes | |
| `material` | yes | A material id. |
| `length`, `width` | yes | Finished size. |
| `quantity` | yes | Whole number, 1 or more. |
| `grain` | yes | Which part dimension must run along the stock grain: `"length"`, `"width"`, or `"none"`. |
| `group` | no | Assembly or cabinet name, used for colour and labels. |
| `notes` | no | |

A part may be rotated on its stock when its `grain` is `"none"`, when its material is not `grained`, or when
`settings.features.grain` is `false`.

## Tools

Every tool has `id`, `name`, `type`, `kerf` (blade width), and `enabled`. Limits are optional; a missing limit means
no limit.

| `type` | Limits |
|---|---|
| `"table-saw"` | `maxRip` (fence-to-blade capacity), `maxCrosscut` (sled or mitre-gauge capacity), `maxPiece` {`length`, `width`} (largest piece the user can control) |
| `"track-saw"` | `maxCut` (track length) |
| `"circular-saw"` | `maxCut` (straightedge length) |
| `"panel-saw"` | `maxCut`, `maxStages` (deepest cut stage) |

## Settings

| Field | Default | Meaning |
|---|---|---|
| `features` | all `true` | Switches: `grain`, `kerf`, `trim`, `cutOrder`, `toolLimits`, `offcuts`, `cost`, `labels`, `snapping`. |
| `orderMode` | `"sheet"` | `"sheet"`: finish each sheet before the next. `"setup"`: group cuts that share a tool and fence setting. |
| `trim` | `0` | Edge trim on every edge of the stock. |
| `minOffcut` | none | {`length`, `width`}: waste at least this size is kept as an offcut. |
| `display` | `{ "inch": 32, "mm": 0.5 }` | Rounding for display: `inch` is `8`, `16`, `32`, `64`, or `"decimal"`; `mm` is `1`, `0.5`, or `0.1`. |
| `optimizer` | `{ "timeLimitMs": 2000 }` | Search time and an optional integer `seed`. |
| `currency` | `"USD"` | ISO 4217 code for `cost`. |

## Plan

`plan.sheets` lists the stock pieces used. Each sheet has `id`, `stock` (a stock id), optional `pinned` (keep this
sheet when re-optimizing), `placements`, and optional `cuts`.

**Placement.** `part` (a part id), `copy` (0-based, less than the part's `quantity`), `x`, `y`, and `rotated` (`true`
when the part length runs along the stock width). Each copy of a part is placed at most once.

**Cut.** `step` (1-based order), `stage` (1 = a cut across the full sheet, 2 = across a piece made by a stage-1 cut, and
so on), `axis` (`"x"` = a line of constant x, `"y"` = a line of constant y), `at` (the line's position), `from` and
`to` (its extent along the other axis), optional `tool` (a tool id), and optional `trim` (`true` for edge-trim cuts).

`cuts` is derived data. Readers may ignore it and compute their own. When `cuts` and `placements` disagree,
`placements` wins.

## Compatibility

- Readers must refuse a file whose major version they do not support.
- Readers must accept a newer minor version, ignore the fields they do not know, and write those fields back
  unchanged when they save the file. The same applies to `extensions`.
- Minor versions only add optional fields.

## CSV part and stock lists

For exchange with spreadsheets and other cut-list tools:

- **Parts:** `name,length,width,quantity,material,grain,group,notes`
- **Stock:** `material,length,width,thickness,quantity,cost,kind,name`

Material is given by name. `quantity` for stock may be `unlimited`. Lengths may be decimals or fractions (`15 3/8`),
and a header may declare units, for example `Length (mm)`. Comma, semicolon, and tab delimiters are accepted.

## Relation to other formats

No open industry standard for cut plans exists. CSV part lists are common but differ between tools. PTX, used by
Homag/Holzma panel saws and several optimizers, has no public specification. The field names here map to PTX's
known sections (`JOBS` → `project`, `BOARDS` → `stock`, `PARTS_REQ`/`PARTS_INF` → `parts`) so a PTX exporter can be
added once sample files are available.
````

- [ ] **Step 7: Write the README**

`README.md`:

````markdown
# OpenCutPlan

An open-source planner for cutting plywood and other sheet goods with a table saw, track saw, circular saw, or panel
saw. It is under development: this repository currently contains the core library and the file format.

- **File format:** [`docs/format.md`](docs/format.md) and the JSON Schema in [`schema/`](schema/).
- **Examples:** [`examples/`](examples/) — `living-room-shelf` (inches, with a full layout) and
  `simple-bookcase-mm` (metric, with an owned offcut and two saws).
- **Design:** [`docs/superpowers/specs/`](docs/superpowers/specs/).

## Development

Requires Node.js 24 or later.

```bash
npm install
npm run check      # typecheck and run all tests
npm run schema     # regenerate schema/cutplan.schema.json after changing the format
npm run examples   # regenerate the files in examples/ after changing a builder
```
````

- [ ] **Step 8: Run the full check**

Run: `npm run check`
Expected: PASS — typecheck for `packages/core` and `examples`, and every test.

- [ ] **Step 9: Commit**

```bash
git add package.json .gitattributes examples docs/format.md README.md packages/core/test/examples.test.ts
git commit -m "feat: add sample projects, format documentation, and README" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Later phases

Each later phase gets its own plan, written after the previous phase lands so it can use the real interfaces:

- **Phase 2 — Cut analysis:** layout validator (issue codes `off-sheet`, `overlap`, `wrong-material`, `grain`, `not-guillotine`, `no-tool`, `unplaced`, `stock-exceeded`), guillotine cut tree, tool assignment, shop sequence, offcuts, report data.
- **Phase 3 — Optimizer:** constructors, seeded search, objective, pinning, worker protocol.
- **Phase 4 — Web app:** workspace tabs, layout editor, settings and feature switches, persistence, undo/redo.
- **Phase 5 — Outputs:** print stylesheets, shop view, shopping list, labels, SVG export, end-to-end tests.
