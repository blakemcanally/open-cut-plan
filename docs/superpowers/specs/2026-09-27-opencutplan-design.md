# OpenCutPlan — design spec

Date: 2026-09-27
Status: draft for review
Working name: **OpenCutPlan** (app) / `.cutplan.json` (file format). The name can change before publication.

## 1. Summary

OpenCutPlan is a free, open-source, browser-based planner for cutting sheet goods (plywood, MDF, melamine) with
guillotine saws: table saw, track saw, circular saw with a straightedge, and panel saw. The user enters or imports a
parts list, selects stock, and describes the tools they own. The app generates a cutting plan, lets the user edit it
by drag and drop, checks it against the saw rules, orders the cuts into shop steps, and produces printable sheet
diagrams, a step-by-step cut sequence, a shopping list with cost, and part labels.

It also defines an open file format for cut plans, because no open industry standard exists (see §4.1).

It generalizes the single-project tool in `~/Development/living-room-shelf/cut-planner.html`. That shelf becomes a
sample project.

## 2. Goals, users, success criteria

**Users.** Hobby and small-shop woodworkers who cut sheet goods with hand-held or bench saws. Different users own
different tools, so every tool-dependent behaviour is configurable.

**Goals (v1)**
1. Any project: arbitrary parts, materials, stock sizes, units (inch or mm).
2. Stock selection: new sheets with optional prices, plus owned offcuts, per material.
3. Plan generation: an optimizer that only produces layouts the user's tools can cut.
4. Cut ordering: a guillotine cut tree turned into ordered shop steps with fence settings.
5. Import/export: the `.cutplan.json` format, CSV part and stock lists, SVG sheet drawings.
6. Feature switches: the user can turn optional behaviour on or off (§8).
7. Shop outputs: sheet diagrams, cut sequence, shopping list + cost, part labels.

**Non-goals (v1)**
- CNC nesting (free placement, toolpaths).
- Linear stock (1D cutting of boards).
- Parametric project templates (cabinet generators). Parts come from a list.
- PTX export. The format is designed so a PTX exporter can be added later (§4.6).
- Edge banding, veneer, and wood defects. The format's extension rules allow them in a later minor version.
- Accounts, servers, sync. All data stays on the user's machine.

**Success criteria**
- The living-room-shelf project loads from `examples/`, and the optimizer produces a valid plan with no more sheets
  than the hand-made plan (5 × 18mm, 2 × 6mm).
- Every plan the optimizer returns passes the core validator (property-tested).
- A new user can go from a pasted CSV parts list to a printed cut sheet without reading docs.
- A third-party tool can read and write `.cutplan.json` using only `docs/format.md` and the published JSON Schema.

## 3. Architecture

npm workspaces, TypeScript strict mode.

```
opencutplan/
  packages/core/          no DOM; pure functions; Vitest
    src/format/           zod schemas + types, validate(), migrate(), JSON Schema generation
    src/csv/              CSV import (delimiter, header, and column detection), export, and adding rows to a project
    src/geometry/         rect math, units, fraction/decimal formatting
    src/plan/             optimizer, layout validator, guillotine analysis
    src/sequence/         cut tree → ordered shop steps, tool assignment
    src/reports/          shopping list, cost, waste, offcuts, label data
  apps/web/               React + Vite; UI only; imports @opencutplan/core
  schema/                 generated cutplan.schema.json (checked in; CI verifies it is current)
  docs/format.md          human-readable format specification
  examples/               sample .cutplan.json projects + sample CSVs
```

**Single source of truth.** The web app holds one `Project` document (the file format type). Every edit produces a new
document. Everything else — issues, cut tree, sequence, reports — is derived by core from the document and never
stored, except that export may include the computed cut sequence for other readers (§4.4).

**Schema.** zod schemas in `core/src/format` define the types. The JSON Schema (draft 2020-12) is generated from them
with zod's `toJSONSchema`, so types, runtime validation, and the published schema cannot drift.

**Workers.** The optimizer runs in a Web Worker. The UI sends `{project, options}` and receives progress events and the
best plan so far; it can cancel.

**Persistence.** Projects autosave to IndexedDB (a project list on the home screen). Users open and save
`.cutplan.json` files with the File System Access API where available, and download/upload otherwise. Tool profiles
and view choices (show cut lines, draw cut lines at kerf width) are kept in the browser, not in the project file.

**Hosting.** Static build. It runs from any static host (GitHub Pages after publication).

## 4. File format (`.cutplan.json`, version 1.0)

### 4.1 Research basis

- No open, widely adopted cut-list or cut-plan format exists. CSV is the informal standard for part lists; every tool
  uses different columns (OpenCutList, CutList Plus fx, MaxCut, CutList Optimizer).
- PTX (Homag/Holzma, Cut Rite, Magi-Cut, SmartCut) is the closest thing to a standard for full plans, but it is
  vendor-controlled with no public specification or known licence terms. Confirmed sections: `JOBS`, `BOARDS`,
  `PARTS_REQ`, `PARTS_INF`, `PARTS_UDI` (source: smartcut.dev, single third-party source).
- OpenCutList convention: grain runs along the length (first dimension). SmartCut models grain and rotation as
  separate concerns.

### 4.2 Document

All lengths are decimal numbers in `project.units`. All `id` values are strings, unique within their collection.

| Field | Type | Notes |
|---|---|---|
| `format` | `"opencutplan"` | required |
| `version` | `"MAJOR.MINOR"` | `"1.0"` |
| `project` | object | `name`, `units` (`"in"` \| `"mm"`), optional `notes`, `created`, `modified` (ISO 8601) |
| `materials` | array | see §4.3 |
| `stock` | array | see §4.3 |
| `parts` | array | see §4.3 |
| `tools` | array | see §4.3 |
| `settings` | object | see §4.3 |
| `plan` | object, optional | see §4.4 |
| `extensions` | object, optional | keys are namespaces (`"opencutplan.app"`, `"com.example.tool"`); values are free-form |

### 4.3 Collections and settings

**Material** — `id`, `name`, `thickness`, `grained` (boolean; sheets of a grained material have grain along their
length), optional `color`.

**Stock** — `id`, `material` (ref), `length`, `width`, `quantity` (integer, or `null` = unlimited, can buy more),
optional `cost` (per piece, project currency), `kind` (`"sheet"` \| `"offcut"`), optional `trim` (edge trim applied to
every edge; default from settings), optional `enabled` (default `true`; the optimizer only uses enabled stock), optional
`name`.

**Part** — `id`, `name`, `material` (ref), `length`, `width`, `quantity` (integer ≥ 1), `grain`
(`"length"` \| `"width"` \| `"none"`: which part dimension must run along the sheet grain), optional `group`, `notes`.
A part may rotate when its `grain` is `"none"`, its material is not grained, or the grain feature is off.

**Tool** — `id`, `name`, `type`, `kerf`, `enabled`, plus limits by type (all optional; missing = no limit):

| `type` | Limits |
|---|---|
| `table-saw` | `maxRip` (fence-to-blade capacity), `maxCrosscut` (sled/miter capacity), `maxPiece` {`length`,`width`} (largest piece the user can control) |
| `track-saw` | `maxCut` (track length) |
| `circular-saw` | `maxCut` (straightedge length) |
| `panel-saw` | `maxCut`, `maxStages` |

**Settings**
- `features`: booleans, see §8.
- `orderMode`: `"sheet"` \| `"setup"` (§6.3).
- `trim`: default edge trim. New projects use 0, so they use the factory edges.
- `minOffcut`: {`length`, `width`}; waste pieces at least this size, in either orientation, are kept as offcuts.
  Default 12 × 6 in or 300 × 150 mm.
- `display`: {`inch`, `mm`}: `inch` is a denominator `8|16|32|64` or `"decimal"` (default 32); `mm` is a step
  `1|0.5|0.1` (default 0.5).
- `optimizer`: {`timeLimitMs` (default 2000), `seed`}.
- `currency`: ISO 4217 code, default `"USD"`.

### 4.4 Plan

`plan.sheets[]`: `id`, `stock` (ref), optional `pinned` (boolean), `placements[]`, optional `cuts[]`.

- **Placement** — `part` (ref), `copy` (0-based index < part quantity), `x`, `y`, `rotated`.
  Coordinates: origin at the top-left corner of the full stock piece; `x` along stock length, `y` along stock width;
  `(x, y)` is the placed part's top-left corner. `rotated: true` means the part length runs along the stock width.
- **Cut** — `step` (1-based order), `stage` (1 = across the full sheet), `axis` (`"x"` = a line of constant x,
  `"y"` = a line of constant y), `at`, `from`, `to` (extent along the other axis), optional `tool` (ref), optional
  `trim` (true for edge-trim cuts).

`cuts` is derived output. Readers may ignore it and compute their own. If `cuts` and `placements` disagree,
`placements` wins.

### 4.5 Compatibility rules

- Readers must reject a file whose major version they do not support, with a clear message.
- Readers must ignore unknown fields and preserve `extensions` they do not understand when they re-save.
- Minor versions only add optional fields.
- The value sets of `type`, `grain`, `kind`, `units`, `orderMode`, `axis`, and `display.inch`/`display.mm` are fixed
  within a major version. Adding a value requires a new major version.
- `migrate()` in core upgrades older minor versions in memory.

### 4.6 CSV and other formats

- **Parts CSV** columns: `name, length, width, quantity, material, grain, group, notes`.
- **Stock CSV** columns: `material, length, width, thickness, quantity, cost, kind, name`.
- Import auto-detects delimiter (comma, semicolon, tab), header row, and known header sets (OpenCutList, CutList Plus
  fx, SmartCut-style `l,w,q`). Unknown headers open a column-mapping dialog. Unknown material names create materials
  (the user confirms). Grain values accept `length/width/none`, `L/W/-`, `yes/no`.
- Export writes the same columns, UTF-8, comma-delimited, RFC 4180 quoting.
- **SVG** export of each sheet diagram.
- **PTX (later).** Mapping plan: `project` → `JOBS`, `stock` → `BOARDS`, `parts` → `PARTS_REQ` + `PARTS_INF`. Not in
  v1; requires real sample files to verify.

## 5. Plan generation

### 5.1 Inputs

The project's parts (expanded to copies), enabled stock per material, enabled tools, and feature switches.

**Planning kerf** = the largest kerf among enabled tools (0 if the kerf feature is off). **Trim** = stock trim or the
settings default (0 if the trim feature is off).

### 5.2 Algorithm

Each material is planned independently. [`docs/optimizer.md`](../../optimizer.md) gives the exact rules.

1. **Constructors** (each builds a full plan for a part order and stock choice):
   - *Strip*: rip strips along the grain at the part widths, crosscut parts from strips, re-rip narrow parts out of
     strip remainders. Matches common shop practice and the living-room-shelf plan.
   - *Guillotine best-area-fit*: free-rectangle guillotine packing with several split rules (shorter-leftover-axis,
     longer-leftover-axis, min-area, max-area) (Jylänki, "A Thousand Ways to Pack the Bin").
2. **Search**: seeded random restarts over part orders (area desc, length desc, width desc, random perturbations) ×
   constructors × stock choices, until `timeLimitMs`. The worker streams the best plan so far. **Keep searching** runs
   another time slice from the current best. The same seed and iteration count always give the same plan.
3. **Validation**: every candidate goes through the same validator as manual layouts (§5.4). A sheet with an error is
   dropped from the candidate and its parts become unplaced, so the optimizer never returns a sheet with an error.
   When no tool is enabled at all, the plan-wide `no-tool` error drops nothing.
4. **Objective** (lexicographic, per material): (1) fewest unplaced copies; (2) total stock cost, with owned offcuts
   at 0, or total stock area when the cost feature is off or any enabled sheet stock of the material has no price;
   (3) largest usable offcut area (bigger is better); (4) number of cuts; (5) number of sheets.
5. **Stock selection**: offcuts (`kind: "offcut"`) are tried first. Stock with `quantity` limits is respected; if the
   parts cannot fit, the result lists the parts that could not be placed.

### 5.3 Pinning

The user can pin sheets. **Optimize the rest** keeps pinned sheets and their parts unchanged and re-plans all other
parts onto new sheets.

### 5.4 Validator

Returns a list of issues `{severity: "error" | "warning", code, message, refs}`. `refs` point to parts, sheets, cuts.

| Code | Severity | Condition |
|---|---|---|
| `off-sheet` | error | placement extends past the stock, or into the trim zone when trim is on |
| `overlap` | error | two placements overlap or are closer than the planning kerf |
| `wrong-material` | error | part material ≠ stock material |
| `grain` | error | grain on, material grained, part grain ≠ `none`, and the part's grain dimension does not run along the stock length |
| `not-guillotine` | error | cut order on and no guillotine cut order frees a group of parts (§6.1); one issue per group, leaving out parts that already have `off-sheet` or `overlap` |
| `no-tool` | error | cut order on, and either no tool is enabled (one issue) or tool limits are on and no enabled tool can make a cut (§6.2) |
| `unplaced` | warning | copies of a part are not on any sheet (one issue per part) |
| `stock-exceeded` | error | more sheets of a stock are used than its `quantity` |
| `bad-ref`, `bad-copy`, `duplicate-placement` | error | reference to a missing part, stock, or copy index; a part copy placed twice |

## 6. Cut ordering and shop sequence

### 6.1 Cut tree

Built recursively from placements: find the straight lines that run fully across the current region without crossing a
placement, cut there, and recurse into each piece. At stage 1, rip cuts (parallel to the stock length, which is the
grain direction for grained materials) are tried before crosscuts.
Any valid through-cut preserves feasibility, so the greedy split is complete: a layout fails only if no cut order
frees its parts. Regions shrink to the bounding box of their parts plus half a kerf so cut lines do not run into
waste. When trim is on, trim cuts on each factory edge come first (`trim: true`). Sheets without placements get no cuts.
The exact kerf placement rules are in `docs/cut-analysis.md`.

### 6.2 Tool assignment

Each cut gets the first enabled tool, in profile order, that can make it:
- *Table saw rip*: the piece on the fence side is ≤ `maxRip` and the piece being cut is ≤ `maxPiece`. The cut-off side
  goes against the fence; when only the remainder fits `maxRip`, the remainder does.
- *Table saw crosscut*: cut length ≤ `maxCrosscut` and piece ≤ `maxPiece`.
- *Track/circular saw*: cut length ≤ `maxCut`.
- *Panel saw*: cut length ≤ `maxCut` and stage ≤ `maxStages`.

If none can, the validator reports `no-tool` ("No tool in your profile can make cut 7 (a 58" crosscut)").

### 6.3 Order

- `orderMode: "sheet"` (default): depth-first per sheet; finish a sheet before starting the next.
- `orderMode: "setup"`: group cuts with the same tool, cut kind, and displayed setting across all sheets, while respecting the tree
  dependencies (a cut is only available after its parent piece exists).

### 6.4 Step text

Each step: tool, cut type (rip, crosscut, trim), the piece being cut (source and size), the setting, and the result.

> **Step 4. Table saw, rip.** Piece: sheet 2, remaining panel 60 × 44 5/8. Fence at **15 3/8"**. Keep the fence-side
> strip (C Top + C Shelf 1). The other side goes to step 5.

The fence setting is the width of the piece between fence and blade. For track and circular saws the text gives the
mark position from the reference edge.

### 6.5 Offcuts

Waste regions at least `minOffcut` in both dimensions are listed as offcuts with sizes. **Save offcuts to stock** adds
them as `stock` entries with `kind: "offcut"`, `quantity: 1`, `cost: 0`, `trim: 0` (every edge is a cut edge), and the name
"Offcut from <project>, sheet N".

## 7. Web app

### 7.1 Screens

- **Home** — project list (IndexedDB), New project, Open file, Open example.
- **Project workspace** — tabs:
  1. **Parts** — editable table (name, L, W, qty, material, grain, group, notes); paste from spreadsheet; CSV import
     with column mapping; totals.
  2. **Stock** — materials table and stock table (size, qty or unlimited, cost, kind, enabled); CSV import.
  3. **Tools** — tool profiles: add tools by type, set kerf and limits, enable/disable, reorder. Profiles can be saved
     to the browser and reused across projects.
  4. **Layout** — the sheet editor and optimizer (§7.2).
  5. **Shop** — the cut sequence checklist (§7.3).
  6. **Reports** — shopping list and cost, offcuts, labels, print and export.
  7. **Settings** — units and precision, factory edges or trim, snapping and the grid, cut order, minimum offcut,
     optimizer time, currency, view choices, and the other feature switches (§8). The common settings come first.

### 7.2 Layout editor

Carried over from the living-room-shelf tool and generalized:
- Sheets drawn to scale in SVG; parts coloured by `group`; grain stripes; cross-grain marker; trim zone dashed.
- Drag parts between sheets and the unplaced tray; snapping to edges, trim, and neighbours at one kerf, with a guide
  line for each snapped edge, else to a grid (a browser setting, default 1 in / 25 mm); the dragged part shows the
  snapped position; hold ⌥/Alt to disable; `R` rotate, `Del` to tray, arrows nudge by the display precision
  (Shift = 1 in / 25 mm).
- Live validation: invalid parts turn red; the issue list links to the part.
- Cut lines numbered in sequence order, coloured by stage.
- **Optimize** (pinned sheets stay), **Optimize the rest** (every sheet stays; only the tray is planned), **Keep
  searching** (continues the last search while the layout is still its result), per-sheet **Pin**; progress bar while
  the worker runs. **Stop** uses the best plan so far. A result is not used when the project changed during the run.
- Undo/redo (document history, 100 steps).
- Zoom and fit-to-screen.

### 7.3 Shop view

Phone-friendly checklist of steps (§6.4). The current step is highlighted on the sheet diagram. Ticking a step saves
progress in `extensions["opencutplan.app"].progress` as `{ sequence, done }`: a fingerprint of the steps and the
ticked step numbers. Any edit to the plan that changes the sequence resets progress after a confirmation: the old
ticks stop showing, and a banner offers **Start over** or **Keep my ticks**. Editing is never blocked.

### 7.4 Accessibility and responsiveness

Keyboard access for all editor actions; visible focus; colour is never the only signal (icons and text accompany red,
grain, and stage colours). The layout editor needs a desktop or tablet; Parts, Stock, and Shop work on a phone.

## 8. Feature switches (`settings.features`)

| Switch | Default | Effect when off |
|---|---|---|
| `grain` | on | every part may rotate; no grain issues; grain stripes hidden |
| `kerf` | on | planning kerf = 0 |
| `trim` | on | trim = 0; no trim cuts |
| `cutOrder` | on | no cut lines, no sequence, no `not-guillotine` check on manual layouts. The optimizer still only builds guillotine layouts |
| `toolLimits` | on | tools' capacity limits are ignored (kerf still applies) |
| `offcuts` | on | no offcut list, no Save offcuts |
| `cost` | on | no prices in the shopping list; objective uses area |
| `labels` | on | Labels report hidden |
| `snapping` | on | drag without snapping |

The Settings tab shows `trim` as the factory-edges choice (use the factory edges, or trim each edge), and `snapping`
next to the grid size. The other switches are in its Features list.

## 9. Outputs

- **Sheet diagrams** — print stylesheet, one sheet per page, to scale when it fits, with part names and sizes, grain
  arrow, numbered cut lines, and a key. Browser "Save as PDF" covers PDF.
- **Cut sequence** — printable and on-screen checklist (§7.3).
- **Shopping list** — per material: stock size, count to buy (excluding owned offcuts), unit cost, line cost, total;
  sheet utilization and waste %.
- **Labels** — one per part copy: name, group, size, material, grain arrow, sheet/step reference. Layouts for common
  sheet sizes (Avery 5160/L7160-style grids and a 2×4 in thermal label); the user picks the grid and a start position.
- **Exports** — `.cutplan.json`, parts CSV, stock CSV, SVG per sheet.

## 10. Error handling

- **Import**: schema errors are reported with the JSON path (and CSV row/column). Nothing is overwritten on failure.
  Unknown major version: refuse with the version found and supported. Unknown minor version: load, warn, preserve
  unknown fields.
- **Validation issues** are data, not exceptions; the UI never blocks editing because a plan is invalid.
- **Optimizer**: timeouts return the best valid plan so far; if no complete plan exists, it returns the partial plan
  plus the unplaced parts and the reason (e.g. part larger than every enabled stock, or larger than every tool can cut).
- **Worker crash**: the UI shows the error and keeps the current document.
- **Storage**: autosave failures (quota, private mode) show a persistent banner suggesting file save.

## 11. Testing

- **Core (Vitest)**
  - Format: every example validates; round-trip `parse(serialize(x)) = x`; unknown-field preservation; migrations;
    JSON Schema in `schema/` matches the generated one.
  - CSV: import fixtures for each known header set, delimiter detection, quoting, round-trip.
  - Geometry: formatting and rounding in both unit systems.
  - Guillotine analysis: strip layouts pass; pinwheel fails; cut order dependencies (a crosscut valid only after a
    rip) pass.
  - Optimizer: property tests (fast-check) — random projects produce plans with zero error issues and every copy
    placed or reported unplaced; the living-room-shelf example uses ≤ 5 + 2 sheets; fixed seed and iteration count ⇒ same plan.
  - Sequence: tool assignment against each limit; fence settings; `setup` order respects dependencies.
- **Web**: component tests for the parts table and CSV mapping; Playwright end-to-end smoke tests: CSV paste →
  optimize → shop view → print preview; drag, rotate, and undo in the editor.
- **CI**: typecheck, lint, tests, schema up-to-date check, build, and the Playwright tests
  (`.github/workflows/ci.yml`). TypeScript's strict mode is the lint; the schema check is a core test.

## 12. Delivery phases

Each phase gets its own implementation plan, written after the previous phase lands. Each phase ends with working, tested software:

1. **Core foundation** — format schemas, validation, migration, JSON Schema generation, CSV import/export, geometry
   and formatting, examples (including living-room-shelf).
2. **Cut analysis** — layout validator, guillotine cut tree, tool assignment, shop sequence, offcuts, reports data.
3. **Optimizer** — constructors, seeded search, objective, pinning, worker protocol.
4. **Web app** — workspace tabs, layout editor (ported from the shelf tool), settings and feature switches,
   persistence, undo/redo. The Shop and Reports tabs arrive with their content in phase 5.
5. **Outputs** — print stylesheets, shop view, shopping list, labels, SVG export; end-to-end tests.

## 13. Publication

This is intended as a public open-source project. From a Block laptop it must go through Block's open-source process
(OSPO review; licence chosen there — MIT or Apache-2.0 suggested) before any public push. Until then the repo stays
local.
