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
| `project` | yes | `name` (text), `units` (`"in"` or `"mm"`), optional `notes`, `created`, `modified` (should be ISO 8601 date-times; readers accept any string). |
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
| `quantity` | yes | Whole number, 1 to 10000. |
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
| `orderMode` | `"sheet"` | `"sheet"`: finish each sheet before the next. `"setup"`: group cuts that share a tool, cut kind, and displayed setting. |
| `trim` | `0` | Edge trim on every edge of the stock. |
| `minOffcut` | none | {`length`, `width`}: waste at least this size, in either orientation, is kept as an offcut. Readers use 12 × 6 in or 300 × 150 mm when it is absent. |
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

A reader loads a file whose plan has invalid references (a sheet with an unknown stock id, a placement of an unknown
part or of a copy past the part's `quantity`, a copy placed twice, a duplicate sheet id, or a cut with an unknown tool)
and reports each problem as a warning. It keeps the plan as it is, so a re-save does not lose data. Duplicate ids in
`materials`, `stock`, `parts`, or `tools`, and stock or parts that use an unknown material, make the file invalid.

## Compatibility

- Readers must refuse a file whose major version they do not support.
- Readers must accept a newer minor version, ignore the fields they do not know, and write those fields back
  unchanged when they save the file. The same applies to `extensions`.
- Minor versions only add optional fields.
- Readers must load a file whose `plan` has invalid references, and report the problems as warnings.
- The value sets of `type`, `grain`, `kind`, `units`, `orderMode`, `axis`, and `display.inch`/`display.mm` are fixed
  within a major version. Adding a value requires a new major version, so a reader can refuse a value it does not know.

## CSV part and stock lists

For exchange with spreadsheets and other cut-list tools:

- **Parts:** `name,length,width,quantity,material,grain,group,notes`
- **Stock:** `material,length,width,thickness,quantity,cost,kind,name`

Material is given by name. `quantity` for stock may be `unlimited` (an empty cell also means unlimited).

**Export.** Files are UTF-8 with a leading byte order mark, so Excel shows names with accents correctly. Cells are
comma-delimited with RFC 4180 quoting and CRLF line ends.

**Import.**

- **Delimiter.** Comma, semicolon, and tab are detected from the first line. A first line such as `sep=;` (written by
  Excel) sets the delimiter and is skipped. A leading byte order mark is ignored.
- **Header row.** The first row is a header when none of its cells is a length. Otherwise every row is data, and the columns are named `Column 1`, `Column 2`, and so on until the user maps
  them. Blank lines are skipped, but row numbers in messages count them, as a spreadsheet does.
- **Column names.** Headers are compared without case, spaces, or punctuation; `#` reads as "number", so `Part #` is not
  the part name. Common names from other tools are known, for example `Qty`, `Count`, `Copies`, `Anzahl`, `L`, `W`,
  and `Part name`. When a file has both a cutting size and another size (`Cutting length` and `Length`), the cutting
  size is used. When no quantity column is found and some columns are not used, the import warns that each part has
  quantity 1.
- **Header units.** A header may declare its unit in parentheses or brackets: `mm`, `cm`, `m`, `in`, `inch`, `inches`,
  `"`, `ft`, `feet`, or `'`, for example `Length (cm)`. Plain numbers in that column are converted to the project
  units. Other text in parentheses, such as `Name (optional)`, is ignored.
- **Lengths.** Decimals, fractions (`15 3/8`, `15-3/8`, `15⅜`), feet and inches (`4' 6"`), and values with a unit
  (`18mm`, `45.7cm`) are accepted.
- **Decimal commas.** In a comma- or tab-delimited file, a comma followed by exactly three digits separates thousands
  (`2,440`); any other comma is a decimal comma (`764,5`). In a semicolon-delimited file, a comma is always the
  decimal mark and dots separate thousands (`2.440` is 2440, `1.234,5` is 1234.5). This applies to lengths,
  quantities, and costs.
- **Costs.** Currency symbols and a three-letter currency code before or after the number (`$95.00`, `42,50 €`,
  `EUR 42,50`) are removed. A negative cost, or a cost with other text in it, gives a warning and is ignored.
- **Grain.** `length`, `L`, `long`, `lengthwise`, `yes`, `y`, `true`, `1`, and `x` mean `"length"`. `width`, `W`,
  `widthwise`, and `cross` mean `"width"`. `none`, `no`, `n`, `false`, `0`, `-`, `any`, and `free` mean `"none"`.
  An empty cell means `"length"`. Other values give a warning and use `"length"`.
- **Stock kind.** `sheet`, `new`, `panel`, and `board` mean `"sheet"`. `offcut`, `off-cut`, `remnant`, `scrap`, and
  `leftover` mean `"offcut"`. An empty cell means `"sheet"`.
- **Problems.** A row with an unreadable length or quantity is skipped with an error. A row with more cells than the
  header is kept with a warning, because an unquoted comma is the usual cause. A quote that is not closed, for
  example an inch mark at the start of a cell, gives a warning, and quotes from that row on are read as plain text.
- **Materials.** An imported row uses the existing material with the same name (or id). When the row gives a thickness
  that differs from that material, a new material is created, named with the thickness, for example `Plywood (6 mm)`.

## Relation to other formats

No open industry standard for cut plans exists. CSV part lists are common but differ between tools. PTX, used by
Homag/Holzma panel saws and several optimizers, has no public specification. The field names here map to PTX's
known sections (`JOBS` → `project`, `BOARDS` → `stock`, `PARTS_REQ`/`PARTS_INF` → `parts`) so a PTX exporter can be
added once sample files are available.
