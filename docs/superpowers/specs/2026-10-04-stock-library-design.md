# Stock library: more catalogue stock, a thickness picker, and a nominal warning — design spec

Status: draft for review. Date: 2026-10-04.

Builds on: backlog item 4 (the catalogue) and [`docs/catalog.md`](../../catalog.md). This spec adds to the
catalogue. It does not replace it.

## 1. Summary

Most sheet goods and boards are thinner than their nominal size. A sheet sold as 3/4" plywood is often 23/32"
(0.703") thick, and a 1x4 board is 0.75" × 3.5". A design makes its parts from the thickness of its material, so a
nominal thickness adds an error at each panel. A KALLAX-style unit four cells wide has five vertical panels; at 3/4"
in place of 0.703", the box is 0.235" off.

The catalogue already stores the actual thickness. But a material that the user types has no check, and the user
types each thickness by hand. This spec adds three things:

1. **More catalogue stock:** the missing sheet thicknesses, pine 1x boards, and 2x framing lumber (§3).
2. **A thickness picker:** a list beside each Thickness field on the Stock tab (§4).
3. **A nominal warning:** a warning when a typed thickness is a nominal value, with a **Measured** checkbox to stop
   it (§5).

## 2. Goals and success criteria

**Goals**

1. The user can set the actual thickness of a material from a list, with no typing.
2. The app warns when the thickness of a typed material is probably nominal, and tells the likely actual values.
3. A design warns when its material has that warning, and gives the size of the error.
4. The catalogue has the common sheet thicknesses of the big-box stores, pine 1x boards, and 2x framing lumber.
5. A board from the catalogue keeps its factory edges.

**Not goals**

- Edge-glued panels, hardwood boards (poplar, oak), and plastics.
- A personal library of materials that the user saves across projects.
- An optimizer rule that stops rips on boards. A board is normal sheet stock, and the optimizer can rip it.
- A picker in the CLI. `materials add --catalog` and `catalog list` already give the actual thickness.
- A warning in a millimetre project.

**Success criteria**

- On the Stock tab, a pick of `3/4" → 0.703"` sets the thickness to 0.703", and the design on the Design tab gets
  the new outside size.
- A typed material `Plywood 3/4` at 0.75" in an inch project shows the warning on the Stock tab and in the checks of
  each design that uses it. A tick on **Measured** removes both.
- `stock add --catalog common-pine-1x-1x4-8ft` adds a 96" × 3.5" stock with `trim: 0`, in a material 0.75" thick.
- Every file in `examples/` loads with no new warning. (No example has a nominal thickness now.)
- `npm run check` and `npm run e2e` pass.

## 3. Catalogue data

### 3.1 New sheet goods

The missing common thicknesses, from Home Depot and Lowe's:

- Construction and sanded pine plywood: 3/8" (11/32") and 5/8" (19/32").
- Birch plywood: 1/8".
- MDF: 5/8".
- Particleboard: 5/8".
- White hardboard (tileboard): 1/8".
- Sizes of the existing materials that the stores sell and the catalogue does not have.

A product that no store sells on the date of the research is left out, and the backlog item says so.

### 3.2 Pine boards

A new family, `Pine boards`, with two materials:

| Id | Name | Nominal | Actual thickness |
|---|---|---|---|
| `common-pine-1x` | `Common pine board 1x` | `1x` | 0.75" (19 mm) |
| `select-pine-1x` | `Select pine board 1x` | `1x` | 0.75" (19 mm) |

Each width and length is one size. The label is the trade name and the length, for example `1x4 × 8 ft`. The id is
the material id, the trade width, and the length, for example `common-pine-1x-1x4-8ft`.

| Trade width | 1x2 | 1x3 | 1x4 | 1x6 | 1x8 | 1x10 | 1x12 |
|---|---|---|---|---|---|---|---|
| Actual width | 1.5" | 2.5" | 3.5" | 5.5" | 7.25" | 9.25" | 11.25" |

The lengths are 6, 8, 10, and 12 ft. Select pine also gets the short lengths (2, 3, 4 ft) that the stores sell. The
length is the length that the store lists.

### 3.3 Framing lumber

A new family, `Framing lumber`, with one material:

| Id | Name | Nominal | Actual thickness |
|---|---|---|---|
| `whitewood-2x` | `Whitewood 2x (SPF)` | `2x` | 1.5" (38 mm) |

The widths are 2x2, 2x3, 2x4, 2x6, 2x8, 2x10, and 2x12, with the actual widths of §3.2 (2x2 is 1.5" × 1.5"). The
lengths are 8, 10, 12, and 16 ft. 2x4 and 2x6 also get the precut stud lengths 92-5/8" and 104-5/8".

### 3.4 The `edges` field

`CatalogMaterial` gets an optional field `edges?: "factory"`. It means that the edges of each size are good, finished
edges. The two board families have it. No sheet material has it.

When `addCatalogStock` adds a size of a material with `edges: "factory"`, the new stock gets `trim: 0`: "use factory
edges", the per-stock setting that exists now. The project trim then does not cut 1/4" off each side of a 3.5" board.
`suggestedStock` does the same for the largest size of such a material.

The file format does not change for this section.

### 3.5 Research and the data rules

- The research uses the Home Depot and Lowe's web sites, on one date. Each listing has its store, its price or
  `null`, its page, and its date, as in [`catalog.md`](../../catalog.md). No price is guessed.
- When the two stores give different actual sizes, the catalogue uses the Home Depot size, and the notes give the
  other size.
- Subagents collect the three groups (§3.1, §3.2, §3.3) in parallel. Each result is checked against these rules
  before it goes into `data.ts`.
- The data test also checks:
  - each `edges` value is `"factory"` or missing;
  - each material with a non-metric `nominal` has a nominal value that §5.2 can read;
  - each board width is one of the actual widths in §3.2.

## 4. The thickness picker

### 4.1 Core

```ts
export interface ThicknessOption {
  /** For example `3/4"` or `1x`. */
  nominal: string;
  /** In the project units. */
  thickness: number;
  /** The catalogue materials with this nominal value and this thickness, in catalogue order. */
  materials: string[];
}

export interface ThicknessGroup {
  family: string;
  options: ThicknessOption[];
}

export function catalogThicknesses(units: Units): ThicknessGroup[];
```

- The groups follow `CATALOG_FAMILIES`. In a group, the options go from the thinnest to the thickest.
- One option is one pair of nominal value and actual thickness. When one nominal value has two thicknesses in one
  family (for example 1/4" hardwood plywood: 0.188" for birch and red oak, 0.22" for maple), the group has two options.

### 4.2 Web app

A new component, `ThicknessPicker`, goes beside each Thickness field on the Stock tab.

- It is a native `<select>`, with an `<optgroup>` for each family. An option reads
  `3/4" → 0.703" (Birch, Red oak, Maple, Sanded)`: the nominal value, the actual thickness as a decimal (as the
  catalogue dialog shows it), and the short material names (the name without its thickness and without the last word
  of the family).
- The first option is `Pick…`. The list shows the option whose thickness is equal to the thickness of the material,
  within the catalogue tolerance (0.005" or 0.1 mm). With no equal option, it shows `Pick…`. When two options in two
  families have the same thickness, it shows the first.
- A pick sets the thickness and `measured: true` (§5.3) in one edit. It does not change the name, the grain, or the
  colour.
- The accessible name is `Pick the thickness of <material name>`.
- On a narrow screen, the list goes under the Thickness field in the card.

### 4.3 Docs that teach the nominal value

The README example and the `docs/cli.md` examples use `materials add --thickness 3/4`. They change to
`materials add --catalog birch-ply-3-4`, or to a measured value with `--thickness 23/32`.

## 5. The nominal warning

### 5.1 Format 1.9

- `FORMAT_VERSION` becomes `"1.9"`, and `SUPPORTED_MINOR` becomes 9. The migration from 1.8 does nothing.
- A material gets one optional field: `measured` (boolean). `true` means that the thickness is an actual thickness:
  the user measured it, or picked it from the catalogue.
- A 1.8 reader ignores `measured` and writes it back. It shows the warning, and nothing else changes.
- `npm run schema` makes the JSON Schema again. `docs/format.md` gets the field, "(added in 1.9)".

### 5.2 The rule

```ts
export interface NominalThickness {
  /** For example `3/4"`. */
  nominal: string;
  /** The nominal value in inches, for example 0.75. */
  value: number;
  /** The catalogue thicknesses for this nominal value that are not equal to it, most common first. */
  likely: number[];
}

export function nominalThickness(project: Project, materialId: string): NominalThickness | null;
```

The **nominal value** of a catalogue material comes from the start of its `nominal` text: `3/4"` and
`3/4" (23/32")` give 0.75, `1x` gives 1, and `2x` gives 2. A metric text such as `18 mm` gives no value.

The function gives a result only when all of these are true:

1. The project units are `in`.
2. The thickness of the material is equal to a nominal value, within 0.005".
3. The catalogue has a thickness for that nominal value that is not equal to it (more than 0.005" away). These
   thicknesses are `likely`, sorted by the number of catalogue materials that have them, then in catalogue order. For
   0.75 with the data of today they are 0.703, 0.688, 0.719, and 0.734. 0.75 itself (MDF) is not in the list, and
   Baltic birch is not in it, because its nominal text is metric.
4. The material is not a catalogue material: `projectMaterialFor` finds no catalogue material with its id or name and
   its thickness.
5. `measured` is not `true`.

### 5.3 The `measured` field in the app

- The **Measured** checkbox sets and clears it.
- A pick in the thickness list sets it (§4.2).
- A typed change of the thickness clears it, because nobody has checked the new value. `updateMaterial` with a new
  `thickness` and no `measured` removes the field.
- The checkbox shows beside the Thickness field while the warning is on, or while `measured` is `true`. The
  accessible name is `<material name> thickness is measured`.

### 5.4 Where the warning shows

**Stock tab.** The Status cell has the warning:

> ⚠ 3/4" is a nominal thickness. Stock sold as 3/4" is often 0.703" or 0.688" thick. Measure it, or pick it from the
> list.

The first value is the thickness of the material in the display format of the project. The second is the `nominal`
text of the catalogue (`3/4"`, `1x`, or `2x`). The text gives at most two `likely` values. For a material at 1", the
text is: "⚠ 1" is a nominal thickness. Stock sold as 1x is often 0.75" thick."

**Design checks.** `checkDesigns` adds a warning `nominal-thickness` for each design whose box material or back
material has a result. The error across the width is (columns + 1) × (value − first likely value); across the
height it is (rows + 1) × the same difference. The message gives the larger of the two:

> Design "Hall" uses Plywood 3/4 at 3/4", a nominal thickness. If the stock is 0.703", the error across the width
> adds up to 0.235". Measure the stock, or pick its thickness on the Stock tab.

For a back material, the message names the back and gives the error in the depth: the panels are the outside depth
less the back, so the box depth is off by (value − first likely value).
The warning shows where the design checks show now: the Design tab, the Cut tab, the Reports tab, the print, and
`design get` and `validate` in the CLI.

**CLI.**

- `materials list` and `materials get` show the warning in the status, and `--json` has `nominal` (the result of
  §5.2, or `null`).
- `materials add` and `materials set` return it in `warnings`.
- `materials set --measured true|false` sets the field. `materials add` takes `--measured` too.
- `materials set --thickness` with no `--measured` clears the field, as in §5.3.

## 6. Order of work

1. Catalogue types: `edges`, `trim: 0` from `addCatalogStock` and `suggestedStock`, and the new data test rules.
2. Research (§3.5), then `data.ts`.
3. `catalogThicknesses` and `ThicknessPicker`.
4. Format 1.9, `nominalThickness`, the Stock tab warning and checkbox, the design check, and the CLI.
5. Docs: `catalog.md` (families, counts, `edges`, boards), `format.md`, `web-app.md`, `cli.md`, `README.md`, and
   backlog item 23 with the chosen approach.

## 7. Tests

- **Data:** the rules in §3.5.
- **Catalogue:** `addCatalogStock` and `suggestedStock` give `trim: 0` for a board and no `trim` for a sheet.
- **`catalogThicknesses`:** the groups and their order, one nominal value with two thicknesses, and millimetres.
- **`nominalThickness`:** one test for each condition in §5.2; the order of `likely`; `1x` and `2x`; a catalogue
  material at 0.75" (MDF) with no result.
- **`measured`:** a pick sets it; a typed thickness clears it; the checkbox sets and clears it.
- **Design check:** the error size for openings mode and for outside mode; a back material.
- **Format:** a 1.8 file loads with no change; `measured` survives a load and a save.
- **CLI:** `--measured`, `warnings` from `materials add`, and `nominal` in `materials get --json`.
- **End to end:** pick a thickness on the Stock tab and see the new outside size on the Design tab; tick
  **Measured** and see the warning go.
- **By hand:** run the app, and look at the picker and the warning on a wide screen and on a narrow screen.
