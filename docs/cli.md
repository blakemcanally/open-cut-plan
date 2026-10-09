# Command line

The `opencutplan` command reads and changes `.cutplan.json` project files. It uses the same core library as the web
app, so a file that the CLI writes opens in the app, and the reports are the same. The CLI is for scripts and for AI
agents: every command has a `--json` result, a fixed exit code, and help with examples.

## Install and run

The CLI is the workspace package `packages/cli`. It runs its TypeScript source directly, so it has no build step. It
needs Node.js 24 or later.

```bash
npm install                        # links the opencutplan command into node_modules/.bin
npx opencutplan --help             # run it from the repository
npm run cli -- show examples/living-room-shelf.cutplan.json
node packages/cli/src/main.ts help parts add
```

`opencutplan help` lists all commands. `opencutplan help <group>` lists the commands of a group. `opencutplan help
<command>` and `opencutplan <command> --help` show the arguments, the options, the JSON result, and examples.
`opencutplan help --json` gives the same information as data.

## Conventions

### Output

- The readable output goes to stdout. Warnings and errors go to stderr.
- `--json` prints one JSON document to stdout and nothing more. The document is
  `{ "ok": true, "command": "...", ... }` or `{ "ok": false, "command": "...", "error": { "code", "message", ... } }`.
  Warnings go to stderr, and the document also has them in `warnings`.
- `ok` is true only when the exit code is 0. When a command runs but finds errors (exit 1), the document has
  `"ok": false`, the `error`, and the normal data.
- Error codes are stable words, such as `not-found`, `missing-option`, `invalid-value`, `in-use`, `generated-part`,
  `strict`, and `unreadable-project`. The error can have more fields, such as `option`, `id`, or `known`.

### Exit codes

| Code | Meaning |
| ---- | ------- |
| 0 | Success. |
| 1 | The command ran but found errors: a plan error with `--strict`, an invalid file for `validate`, a material in use, no free spot, a CSV that needs a column map, a change to a generated part, a design with an error. |
| 2 | A usage error: an unknown command or option, a bad value, a missing argument, or an unknown id. Nothing is read or written. |
| 3 | The input cannot be read: the file is missing, or it is not a readable OpenCutPlan project. |

### Files, stdin, and stdout

- A command that changes a project writes the file in place. The write is atomic: the CLI writes a temporary file
  next to the target and then renames it. A reader sees the old file or the new file, never a part. The file mode
  stays the same, and a symbolic link stays a link.
- `--out <path>` writes the result to another file. The source does not change.
- `--out -` writes the result project to stdout. With `--json`, the project is in the `project` field of the result.
- `--dry-run` does the change and reports it, but writes nothing.
- `--strict` writes nothing and exits 1 when the result has plan errors. `optimize --strict` also fails when copies
  cannot be placed, and CSV `import --strict` also fails when a row has an error.
- `-` as the file reads the project from stdin. The result then goes to stdout.
- Every change result has `changes` (what changed, by id; `groups` lists the groups whose colour changed), `validation` (`errors`, `warnings`, `issues`), `written`
  (the path, or null), and `dryRun`.
- The CLI does not write a file that core cannot read back. It stops with exit 1 and the code `invalid-result`.
- The CLI does not write a file that core refuses. A refused input is exit 3, and the file does not change.
- When the input file has cut lists (`plan.sheets[].cuts`), the CLI makes them again on each write, so they agree
  with the plan.
- The CLI makes the parts of each design again on each write, so they agree with the design. A file that was changed
  by hand gets the correct parts on its next write.

### Ids

- Ids do not change. `set` commands do not change an id. The one exception is `design set --id`, which also changes
  the ids of the design parts, and keeps their copies on the sheets.
- A new id comes from the name, as in the app: `Side panel` becomes `side-panel`, and a used id gets a number, such
  as `side-panel-2`. `--id` gives the id yourself.
- A sheet reference is a sheet id, or its 1-based number in the plan: `s3` or `3`.
- A part copy is `<part> --copy <n>`. The copy number starts at 0, as in the file. You must give `--copy` when the part
  quantity is more than 1.

### Lengths and values

- A length is in the project units. You can write `18`, `18.5`, `18 1/2`, `3/4`, `1' 6"`, or `8'` for inches, and `18`
  or `18.5` for millimetres. You can also give a unit: `450mm`, `2.5cm`, or `18in`.
- A length that the display rounds starts with `~`, for example `~13 3/16"`. A length field shows the exact value, as a
  fraction to 1/64" or a decimal to 0.0001". You can write the `~` in a length that you give, and the command ignores it.
- A switch that `set` can change is `true` or `false`, for example `--enabled false`.
- `--unset <field>` removes an optional field, for example `parts set <file> side --unset group`.
- `--material` takes a material id or a unique name. You can leave it out when the project has only one material.

## Commands

The examples use `shelf.cutplan.json`. Every command accepts `--json` and `--help`.

### Project

| Command | What it does | Example |
| ------- | ------------ | ------- |
| `new <file>` | Creates a project with a table saw and a track saw. `--force` replaces a file. | `opencutplan new desk.cutplan.json --name "Desk" --units in` |
| `show <file>` | Shows the counts, the placed copies, the issues, the totals, and the total cut length. | `opencutplan show shelf.cutplan.json` |
| `validate <file>` | Checks the file format and the plan. Exit 1 when there is an error. `--strict` also fails on warnings. | `opencutplan validate shelf.cutplan.json --json` |
| `schema` | Prints the JSON Schema of the project file. | `opencutplan schema > cutplan.schema.json` |
| `help [command]` | Shows the help. | `opencutplan help optimize` |
| `version` | Prints the CLI version and the format version. | `opencutplan version --json` |

### Parts, stock, materials, and tools

Each group has `list`, `get`, `add`, `set`, and `remove`. `parts` and `stock` also have `import` and `export` for CSV
files. `parts` also has `colors` and `group-color` for the colours of the layout, and `rename-group`.

| Command | What it does | Example |
| ------- | ------------ | ------- |
| `parts list <file>` | Lists the parts and their placed copies. | `opencutplan parts list shelf.cutplan.json` |
| `parts get <file> <id>` | Shows one part. | `opencutplan parts get shelf.cutplan.json a-side --json` |
| `parts add <file>` | Adds a part. | `opencutplan parts add shelf.cutplan.json --name Side --material bb18 --length 30 --width "11 1/4" --quantity 2` |
| `parts set <file> <id>` | Changes a part. A lower quantity removes the extra placements. | `opencutplan parts set shelf.cutplan.json a-side --quantity 3 --grain none` |
| `parts set <file> <id> --factory-edge <long\|none>` | Asks for a long edge of the part on a factory edge of the sheet (`long`), or for none. `--unset factory-edge` gives the choice back to the rule `factoryEdge.minLength`. `parts add` takes the same option. | `opencutplan parts set shelf.cutplan.json a-side --factory-edge long` |
| `parts remove <file> <id>...` | Removes parts and their placements. | `opencutplan parts remove shelf.cutplan.json a-back` |
| `parts colors <file>` | Lists the colour of each design unit and each group, as the layout shows them. | `opencutplan parts colors shelf.cutplan.json` |
| `parts group-color <file> <group> <#rrggbb\|auto>` | Chooses the colour of a group of parts without a design. `auto` gives the automatic colour again. | `opencutplan parts group-color shelf.cutplan.json "3x2 A" "#ff8800"` |
| `parts rename-group <file> <group> <new name>` | Gives every part without a design in the group the new name. The chosen colour moves with the group. When parts already have the new name, the groups become one, and that group keeps its own colour when it has one. | `opencutplan parts rename-group shelf.cutplan.json "3x2 A" "Cabinet A"` |
| `parts import <file> <csv>` | Adds the parts in a CSV file. `--map length=Len` reads the length from the column `Len`. | `opencutplan parts import shelf.cutplan.json parts.csv --dry-run` |
| `parts export <file>` | Writes the parts as CSV. | `opencutplan parts export shelf.cutplan.json --out parts.csv` |
| `stock list <file>` | Lists the stock and the sheets cut from each item. | `opencutplan stock list shelf.cutplan.json` |
| `stock get <file> <id>` | Shows one stock item. | `opencutplan stock get shelf.cutplan.json bb18-5x5` |
| `stock add <file>` | Adds a sheet size or an owned offcut. `--catalog <size id>` adds a catalogue size. `--suggested` adds the [suggested sheet](catalog.md#suggested-sheet) of the material. | `opencutplan stock add shelf.cutplan.json --material bb18 --length "8'" --width "4'" --cost 65` |
| `stock set <file> <id>` | Changes a stock item. `--trim` is a length, `factory`, or `project`. | `opencutplan stock set shelf.cutplan.json bb18-5x5 --quantity 4 --factory-edges` |
| `stock remove <file> <id>...` | Removes stock and the sheets cut from it. | `opencutplan stock remove shelf.cutplan.json bb6-5x5` |
| `stock import <file> <csv>` | Adds the stock in a CSV file. | `opencutplan stock import shelf.cutplan.json stock.csv` |
| `stock export <file>` | Writes the stock as CSV. | `opencutplan stock export shelf.cutplan.json` |
| `stock save-offcuts <file>` | Adds the usable offcuts of the plan to the stock. | `opencutplan stock save-offcuts shelf.cutplan.json` |
| `materials list <file>` | Lists the materials and the parts and stock that use them, with a status, for example "Used by 13 parts · 1 size · no price". | `opencutplan materials list shelf.cutplan.json` |
| `materials get <file> <id>` | Shows one material. | `opencutplan materials get shelf.cutplan.json bb18` |
| `materials add <file>` | Adds a material. `--catalog <id>` adds a catalogue material. `--measured true` says the thickness is a measured, actual thickness. | `opencutplan materials add shelf.cutplan.json --catalog mdf-3-4` |
| `materials set <file> <id>` | Changes a material. `--measured true` says the thickness is a measured, actual thickness. | `opencutplan materials set shelf.cutplan.json bb18 --color "#d9b98c"` |
| `materials remove <file> <id>...` | Removes materials. A material in use gives exit 1. | `opencutplan materials remove shelf.cutplan.json mdf-3-4` |
| `tools list <file>` | Lists the saws in preference order. | `opencutplan tools list shelf.cutplan.json` |
| `tools get <file> <id>` | Shows one saw. | `opencutplan tools get shelf.cutplan.json table-saw` |
| `tools add <file>` | Adds a saw with its kerf and limits. `--type` is `table-saw`, `track-saw`, `circular-saw`, `panel-saw`, or `miter-saw`. `--preset` adds a common saw with typical values: `jobsite-table-saw`, `cabinet-saw-sled`, `track-saw-55`, `track-saw-118`, or `sliding-miter-saw`. Other options change the values. | `opencutplan tools add shelf.cutplan.json --type track-saw --max-cut 110 --position 1` |
| `tools set <file> <id>` | Changes a saw. A table saw has `--max-piece-length` and `--max-piece-width` for a rip, and `--max-crosscut-piece-length` and `--max-crosscut-piece-width` for a crosscut. | `opencutplan tools set shelf.cutplan.json table-saw --max-crosscut-piece-length 48 --max-crosscut-piece-width 24` |
| `tools remove <file> <id>...` | Removes saws. | `opencutplan tools remove shelf.cutplan.json track-saw` |
| `tools move <file> <id>` | Changes the place of a saw in the preference order. | `opencutplan tools move shelf.cutplan.json track-saw --position 1` |

A nominal thickness is a trade size, such as 3/4", that differs from the actual thickness of the stock. In an inch project:

- `materials add` and `materials set` give the warning `nominal-thickness` when the thickness is a nominal value.
- `materials list` and `materials get` give `nominal` for each material. It is `null` when the thickness is not nominal.
- `--measured true` stops the warning.
- A new `--thickness` with no `--measured` clears `measured`.

### Catalogue

The [catalogue](catalog.md) is a list of common sheet goods from Home Depot, Lowe's, and specialty sellers, with a
typical price. The prices are approximate and dated.

| Command | What it does | Example |
| ------- | ------------ | ------- |
| `catalog list` | Lists the catalogue materials and sizes, with the typical price, the store (or "median of N listings"), and the date. It needs no file. `--family` selects one family, and `--units` selects `in` (the default) or `mm`. | `opencutplan catalog list --family mdf --units mm` |
| `materials add <file> --catalog <id>` | Adds a catalogue material, with its name, its actual thickness, and its grain. | `opencutplan materials add shelf.cutplan.json --catalog baltic-birch-18mm` |
| `stock add <file> --catalog <size id>` | Adds a catalogue sheet size as unlimited stock, and its material when the project does not have it. | `opencutplan stock add shelf.cutplan.json --catalog mdf-3-4-4x8 --quantity 2` |

- With `--catalog`, `stock add` refuses `--material`, `--length`, `--width`, and `--kind`, and `materials add`
  refuses `--name`, `--thickness`, and `--grained` (exit 2, `conflict`). An unknown id is exit 2, `not-found`.
- The cost of the new stock is the typical price when the project currency is USD. `--cost` sets another cost.
- When the project has the material or the sheet, the command changes nothing, and `added` is `false`.
- The result has `added`. `stock add --catalog` also has `material` and `addedMaterial`.
- `stock add --suggested --material <id|name>` adds the [suggested sheet](catalog.md#suggested-sheet) of the
  material: the largest size of the catalogue material with the same id or name, or a 96" × 48" (2440 × 1220 mm)
  sheet with no cost. It refuses `--catalog`, `--length`, `--width`, and `--kind` (exit 2, `conflict`). It is the
  same as **Add stock** in the app.

### Designs

A design is a cabinet box: a top and a bottom that run the full width, the sides and the dividers between them, and
the shelves between the sides and the dividers, all joined with pocket screws. The CLI makes the parts of the design, and you cannot change them with `parts set` or `parts remove`
(exit 1, `generated-part`). Change the design, or use `design detach` to make them normal parts.

| Command | What it does | Example |
| ------- | ------------ | ------- |
| `design systems` | Lists `kallax`, `eket`, and `custom`, with the IKEA numbers and their sources. It needs no file. | `opencutplan design systems --json` |
| `design list <file>` | Lists the designs with the outside size and the part counts. | `opencutplan design list hall.cutplan.json` |
| `design get <file> <id>` | Shows one design, its parts, an estimate of its sheets, and its checks. | `opencutplan design get hall.cutplan.json kallax-2x4 --json` |
| `design add <file>` | Adds a design and makes its parts. | `opencutplan design add hall.cutplan.json --system kallax --cols 2 --rows 4` |
| `design set <file> <id>` | Changes a design and makes its parts again. | `opencutplan design set hall.cutplan.json kallax-2x4 --rows 5` |
| `design combine <file> <id>` | Combines a rectangle of cells into one cell. | `opencutplan design combine hall.cutplan.json kallax-4x2 --cell 1,1 --to 2,1` |
| `design split <file> <id>` | Splits combined cells into single cells again. | `opencutplan design split hall.cutplan.json kallax-4x2 --cell 1,1` |
| `design remove <file> <id>...` | Removes designs, their parts, and the copies on the sheets. | `opencutplan design remove hall.cutplan.json kallax-2x4` |
| `design detach <file> <id>` | Keeps the parts as normal parts, and removes the design. | `opencutplan design detach hall.cutplan.json kallax-2x4` |
| `design drawing <file> <id>` | Draws the front view as SVG, to `--out` or to stdout. `--step <n>` draws assembly step n of the design, as the Assembly tab does: the boards of the step are blue, the boards of earlier steps have the colour of the design, and the boards of later steps are grey outlines. The JSON then also has `step`, `title`, and `description` (a text alternative for the drawing). | `opencutplan design drawing hall.cutplan.json kallax-2x4 --step 5 --out step-5.svg` |

The flags of `design add` and `design set`:

- `--system kallax|eket|custom`. The default for `add` is `custom`.
- `--cols <n>` and `--rows <n>`. For `kallax`, each cell gets the KALLAX opening (335 mm) and the depth is 390 mm. For
  `eket`, each cell is one 350 mm module and the depth is 350 mm. A `custom` design also needs `--width` and
  `--height`.
- `--width <length>` and `--height <length>`: the outside size. The cells divide it equally.
- `--column-openings <list>` and `--row-openings <list>`: each opening, for example `335,400`. They replace `--cols`
  and `--width`, or `--rows` and `--height`.
- `--depth <length>`, `--material <id|name>`, `--back <id|name|none>`, `--mount floor|legs|feet|wall-rail`,
  `--quantity <n>`, `--name <text>`, and `--id <id>`.
- `--color <unit>=<#rrggbb|auto>`: the colour of one unit in the layout, for example `--color 2=#ff8800`. The units
  count from 1, up to the quantity. `auto` gives the unit its automatic colour again. Give the flag one time for each
  unit.

The IKEA numbers are in millimetres. The CLI converts them to the project units, so an inch project gets `~13 3/16"` for
335 mm. Without `--name`, the name is the system and the grid, such as `KALLAX 2x4`, and the id comes from the name:
`kallax-2x4`. A change that gives a design error, such as stock that is too thin for pocket screws, is refused with
exit 1 and `invalid-value`, and `error.issues` lists the checks. `design set` gives `partChanges` (the parts that were
added, removed, or resized) and `removedPlacements` (the copies that went to the tray).

`design get` gives `estimate`: for each material of the design, the number of sheets that its parts need. The
estimate is a short optimizer run on the parts of this design alone. It uses each enabled sheet stock of the material
with no limit on the quantity, and no offcuts. `noStock` is true when the project has no sheet stock of the material.
`unplaced` counts the copies that do not fit on the sheets. Run `optimize` for the plan of the whole project.

`design combine` and `design split` change the combined cells (`combined` in [format.md](format.md)):

- `--cell <column>,<row>` gives a cell, for example `--cell 2,1` for column 2, row 1. The columns count from the left
  and the rows from the top, from 1, as in the web app.
- `--to <column>,<row>` gives the cell at the other corner of a rectangle. Without `--to`, the rectangle is the one
  cell.
- When the rectangle touches a combined cell, it becomes larger to hold all of it. The result gives the rectangle
  after it grew in `cell`.
- `design combine` makes the rectangle into one cell. The combined cells inside it become part of the new cell. A
  rectangle of 1 cell is refused with exit 2 and `invalid-value`.
- `design split` makes each combined cell in the rectangle into single cells again. A rectangle with no combined cell
  is refused with exit 2 and `invalid-value`.
- Both commands give `design`, `parts`, `partChanges`, and `removedPlacements`, as `design set` does.

When `design set` changes the columns or the rows, it fits each combined cell to the new grid, and removes a combined
cell that has only one cell left.

When the material or the back material of `design add` has no enabled stock, the command adds its
[suggested sheet](catalog.md#suggested-sheet), as the app does. `design set` does the same for a `--material` or a
`--back` that it gets. `addedStock` lists the ids of the new stock, and the text output names them.

### Settings

`settings get` shows all settings or one setting. `settings set` takes one or more key and value pairs. The pairs
apply in order, so a length after `units` is in the new units. `opencutplan help settings set` lists all keys.

| Command | Example |
| ------- | ------- |
| `settings get <file> [key]` | `opencutplan settings get shelf.cutplan.json trim` |
| `settings set <file> <key> <value>...` | `opencutplan settings set shelf.cutplan.json trim 1/4 orderMode setup optimizer.seed 7` |

The keys are `name`, `notes`, `units`, `trim` (a length, or `factory`), `orderMode`, `minOffcut.length`,
`minOffcut.width`, `minOffcut` (`default`), `factoryEdge.minLength` (a length, or `none`), `display.inch`, `display.mm`, `optimizer.timeLimitMs`, `optimizer.seed`
(a number, or `none`), `optimizer.goal` (`cost`, `offcuts`, or `cuts`), `optimizer.extraCostPercent` (0 to 100),
`optimizer.keepGroupsTogether` (`true` or `false`), `currency`, and `features.<name>` for each feature switch. A change of `units` converts all
lengths in the project. `--factory-edges` is the same as `trim factory`. With `factoryEdge.minLength`, each part with
a long side of at least that length asks for a long edge on a factory edge of the sheet. The choice of a part with
`parts set --factory-edge` comes first. See [Factory edges](format.md#factory-edges-added-in-16).

### Optimize

`optimize <file>` plans the parts on the stock and stores the plan in the file.

- The default mode keeps the pinned sheets and plans all other copies again.
- `--rest-only` keeps all sheets and plans only the copies in the tray.
- `--continue` starts from the current plan. For the goal `cost`, the result is not worse than the current plan. For
  the goals `offcuts` and `cuts`, the search first tries its fixed candidates again to find the cheapest cost, so the
  result can cost less and have a worse goal measure than the current plan. When the search finds no better plan, the
  text output says `The search found no better plan. The plan did not change.`
- `--time <seconds>` sets the search time. `--seed <n>` sets the random seed.
- `--goal <goal>` and `--extra-cost <percent>` set the goal and the extra cost for this run only. The stored settings
  do not change. The cut trees follow the goal in the settings: only `optimizer.goal` `offcuts` makes them prefer
  the largest offcut to the shortest cuts. See [`optimizer.md`](optimizer.md#objective).
- `--keep-groups <true|false>` sets for this run only whether the optimizer keeps the groups together. When it does,
  it puts the parts of each design unit and each part group on as few sheets as it can, but never at a higher cost.
  The default is the `optimizer.keepGroupsTogether` setting.
- `--iterations <n>` tries a fixed number of candidates and ignores the time. Use it when you need the same result
  each time. A timed run can stop at a different candidate on a different computer, even with the same seed.

The text output names the goal. For each material whose plan costs more than the cheapest plan found, it adds a line:
`Plywood: 3 sheets, 4 % more cost than the cheapest plan found.` When the groups stay together, a `Groups:` line tells
which units and groups are on more than one sheet, for example `Groups: Hall KALLAX is on 2 sheets.`, or
`Groups: Each unit is on one sheet.` When a placed copy asks for a factory edge, a `Factory edges:` line tells how
many get one, for example `Factory edges: 5 of 6 copies that ask for one get one.` The `validation` issues have a
`factory-edge` warning for each copy that does not get one.

Each copy that the run cannot place has a line with its reason, for example
`not placed: Side (side copy 0): no-stock-for-material`. The reasons are in [`optimizer.md`](optimizer.md#result).
For each material with the reason `no-stock-for-material`, a line gives the command that adds a sheet:
`Plywood has no enabled stock. Add a sheet with: opencutplan stock add shelf.cutplan.json --suggested --material ply`.

The `--json` output has `goal`, `extraCostPercent` (the limit of the run), `keepGroupsTogether`, and `materials`:
`{ material, score, cheapestCost, extraCostPercent }` for each material, where `extraCostPercent` is the extra cost
that the plan uses, rounded to one decimal (0 when `cheapestCost` is 0). The `score` has `groupSpread`: for each unit
or group, the sheets of the material that hold it minus 1, summed, and `factoryEdgeMisses`: the placed copies that
ask for a factory edge and do not get one. `groups` lists `{ key, label, material, sheets }`
for each unit or group that is on more than one sheet of a material. `planChanged` is false when the plan is the same
as before the run.

```bash
opencutplan optimize shelf.cutplan.json --iterations 200 --seed 1 --strict
opencutplan optimize shelf.cutplan.json --goal offcuts --extra-cost 15
```

`optimize` removes the saved cuts of each sheet that it plans again. A pinned sheet keeps them.

### Optimize cuts

`optimize-cuts <file>` keeps every placement, unless you give `--slide`, and searches the cut tree of each sheet again. It saves the new tree in
`savedCuts` of the sheet only when the tree has fewer cuts than the tree that the sheet uses now. The search puts the
fewest cuts first, then the shortest cut length. See [`cut-analysis.md`](cut-analysis.md#saved-cuts).

- `--sheet <ref>` searches one sheet only.
- `--time <seconds>` sets the search time for each sheet. The default is `optimizer.timeLimitMs`.
- `--passes <n>` stops each sheet after pass n and ignores the time. Use it when you need the same result each time.
- `--slide` also lets the parts slide inside their pieces when that gives fewer cuts. It saves the new placements with
  the new cuts. A pinned sheet and a sheet with locked cuts do not slide, and a slide never takes a factory edge from
  a part. See [`cut-analysis.md`](cut-analysis.md#saved-cuts).
- `--clear` removes the saved cuts, so that the sheets use the automatic cuts again. With `--sheet`, it removes them
  from one sheet only. You cannot give `--clear` with `--time`, `--passes`, or `--slide`.

The text output has one line for each sheet, for example `Sheet 1 (s1): 8 → 6 cuts, 272" → 258 1/2" of cuts.` When
parts slide, the line ends with, for example, `Slid 1 part inside its piece.` The counts and the lengths include the
trim cuts. The `--json` output has `sheets`: `{ number, id, before, after, saved, slid, passes, complete }` for each
sheet, where `before` and `after` are `{ cuts, length }`, `slid` is the number of parts that slid, and `complete` is
true when a longer search cannot find a better tree. A sheet with no parts, or with stuck parts, is not searched. The search keeps
each locked cut (`cuts lock`) with the same position and ends, and searches the other cuts. `--clear` removes the locks
with the saved cuts.

A layout command that changes the placements of a sheet removes its saved cuts. `layout show` tells for each sheet
whether it uses saved cuts or automatic cuts.

```bash
opencutplan optimize-cuts shelf.cutplan.json --passes 4
opencutplan optimize-cuts shelf.cutplan.json --slide --passes 4
opencutplan optimize-cuts shelf.cutplan.json --sheet 2 --clear
```

### Layout

The layout commands change the plan by hand. x and y are from the top-left corner of the full stock piece.

| Command | What it does | Example |
| ------- | ------------ | ------- |
| `layout show <file>` | Shows the sheets (with `cuts`: saved or automatic), the placements, the tray, and the issues. | `opencutplan layout show shelf.cutplan.json --sheet 2` |
| `layout pin <file> <sheet>...` | Pins sheets, so `optimize` keeps them. | `opencutplan layout pin shelf.cutplan.json 1 2` |
| `layout unpin <file> <sheet>...` | Unpins sheets. | `opencutplan layout unpin shelf.cutplan.json s1` |
| `layout move <file> <part>` | Puts a copy on a sheet. Without `--x` and `--y`, it finds the first free spot. | `opencutplan layout move shelf.cutplan.json a-shelf --copy 2 --sheet 5` |
| `layout tray <file> <part>` | Takes a copy off its sheet. | `opencutplan layout tray shelf.cutplan.json a-top` |
| `layout rotate <file> <part>` | Turns a placed copy a quarter turn. | `opencutplan layout rotate shelf.cutplan.json a-shelf --copy 0` |
| `layout add-sheet <file>` | Adds an empty sheet of a stock item. | `opencutplan layout add-sheet shelf.cutplan.json --stock bb18-5x5` |
| `layout remove-sheet <file> <sheet>...` | Removes sheets. Their copies go to the tray. | `opencutplan layout remove-sheet shelf.cutplan.json 7` |
| `layout remove-empty <file>` | Removes the sheets that have no parts. | `opencutplan layout remove-empty shelf.cutplan.json` |
| `layout tool <file> <step>` | Chooses the tool for one cut. `--recommended` goes back to the recommended tool. | `opencutplan layout tool shelf.cutplan.json 5 --tool track-saw` |

A move to an exact spot is done even when the copy overlaps another part. The result then has plan errors in
`validation`. Use `--strict` to refuse such a change.

### Cuts

The cuts commands change the cut tree of one sheet by hand. Each one takes `--sheet <ref>` and `--step <n>`, the step
number as in `cuts show` and `report sequence`. A trim cut cannot change (the code `trim`). The first change to the
cuts of a sheet saves its cuts in `savedCuts`, the same as `optimize-cuts`, so that a layout change to the sheet removes
them. See [`cut-analysis.md`](cut-analysis.md#cut-edits).

| Command | What it does | Example |
| ------- | ------------ | ------- |
| `cuts show <file>` | Lists the cuts of the sheet and the stops of each end. A `+` stop extends the end, and a `-` stop shortens it. | `opencutplan cuts show shelf.cutplan.json --sheet 1` |
| `cuts extend <file>` | Moves `--end from` or `--end to` out to a stop: `--to <length>`, `next`, or `max`. | `opencutplan cuts extend shelf.cutplan.json --sheet 1 --step 6 --end to --to max` |
| `cuts shorten <file>` | Moves an end in: the cross cut at `--to <position>` (or `next`) goes through the cut first. | `opencutplan cuts shorten shelf.cutplan.json --sheet 1 --step 1 --end to --to next` |
| `cuts join <file>` | Extends each end to the stop that joins the most cuts on the same line. | `opencutplan cuts join shelf.cutplan.json --sheet 1 --step 5` |
| `cuts remove <file>` | Removes a cut that the parts do not need, such as a cut through waste. | `opencutplan cuts remove shelf.cutplan.json --sheet 1 --step 9` |
| `cuts lock <file>` | Locks a cut, so that `optimize-cuts` keeps it. | `opencutplan cuts lock shelf.cutplan.json --sheet 1 --step 3` |
| `cuts unlock <file>` | Unlocks a cut, so that `optimize-cuts` and the edits can change it. | `opencutplan cuts unlock shelf.cutplan.json --sheet 1 --step 3` |
| `cuts move <file>` | Moves a cut just `--before <m>` or just `--after <m>` another cut of the sheet. | `opencutplan cuts move shelf.cutplan.json --sheet 1 --step 5 --after 1` |

A stop is `{ end, length, cuts, joins, noTool }`, and a shorten stop also has `across`, the position of the cross cut.
`cuts` is the cut count of the sheet after the edit, with the trims. `noTool` is true when the edit gives the sheet more
cuts that no enabled tool can make. An end that is not a stop fails with the code `no-stop`, and the error lists the
stops. `cuts join` fails with `no-join` when no stop joins a cut, and `cuts remove` fails with `not-removable` when the
cuts then do not free every part. An extended cut keeps its tool choice while that tool can make it. A locked cut cannot
be extended, shortened, joined, or removed (the code `locked`), and no stop splits it or joins it into another cut.
`cuts show` marks it `locked`.

`cuts move` keeps an order that the shop can follow: a cut stays after the cut that makes its piece and before the first
cut inside that piece. A move past these limits fails with the code `order-limit`, and the error has `after` and
`before`, the step numbers of the limits. The shop order follows the new order when `orderMode` is `sheet`. With
`orderMode` `setup`, the setups set the order, and the command tells this.

### Reports

The reports do not change the file.

| Command | What it does | Example |
| ------- | ------------ | ------- |
| `report shopping <file>` | What to buy, the cost, and the use of each sheet. | `opencutplan report shopping shelf.cutplan.json` |
| `report sequence <file>` | The cut steps in shop order, with the text of the Cut tab, and the total cut length. Each step has its `setup`. With `orderMode setup`, a "Setup: …" line starts each group of steps with the same setup. | `opencutplan report sequence shelf.cutplan.json --sheet 1` |
| `report offcuts <file>` | The usable offcuts, and if the stock has them. | `opencutplan report offcuts shelf.cutplan.json --json` |
| `report labels <file>` | One label for each copy, with `factoryEdge` (true when the copy asks for a factory edge). `--layout` splits them into pages. | `opencutplan report labels shelf.cutplan.json --layout avery-5160` |
| `report cutlist <file>` | All parts with the size, count, factory edge request (`long` or `null`), and sheet numbers. | `opencutplan report cutlist shelf.cutplan.json` |
| `report assembly <file>` | The steps to build each design. `--design <id>` selects one. In `--json`, each step has its `action` and its `boards` (see below). | `opencutplan report assembly hall.cutplan.json --json` |

In `report assembly --json`, the `action` of a step is `drill`, `mark`, `spacers`, `subassembly`, `join`, `square`,
`mount`, or `anchor`. The `boards` list gives the boards that the step works on. A `join` step lists only the boards
that it adds to the unit. A board is `{ kind: "top" | "bottom" | "back" }`, `{ kind: "side", side: "left" | "right" }`,
or `{ kind: "divider" | "shelf", line, from, to }`. For a divider, `line` is the column line, and for a shelf, it is
the row line. Line j is between the cells j and j + 1, counted from 1. `from` and `to` are the first and the last cell
along the line, counted from 0. The step numbers of `design drawing --step` are the positions in this list, from 1.

`report shopping` also lists the hardware for the designs in `hardware`: the pocket screws, the back screws, the
glue, and the IKEA legs, feet, or rails, with the IKEA article numbers. The hardware has no prices.

When the plan has an error, or a part is not on a sheet, `report shopping`, `report sequence`, `report offcuts`,
`report labels`, and `report cutlist` give a warning, as the Cut and Reports tabs do. The warning names the parts,
for example `warning: The plan is not ready to cut. 1 part is not on a sheet: Door. Run 'opencutplan validate
shelf.cutplan.json' to list the problems.` The report is still complete.

Money in the readable output is `12.00 USD`. In `--json`, money is a number, and `null` means that a price is not
known.

### Export

| Command | What it does | Example |
| ------- | ------------ | ------- |
| `export svg <file>` | Draws the sheets as SVG. A directory gets one `<name>-sheet-N.svg` file for each sheet. `--cut-colors tool` colours the cuts by tool, as the **Colour cuts by** choice of the app does. The default is `stage`. | `opencutplan export svg shelf.cutplan.json --out svg/` |
| `export parts-csv <file>` | Writes the parts as CSV. | `opencutplan export parts-csv shelf.cutplan.json --out parts.csv` |
| `export stock-csv <file>` | Writes the stock as CSV. | `opencutplan export stock-csv shelf.cutplan.json --out stock.csv` |
| `export plan <file>` | Writes the project with the cut list of each sheet. `--plan-only` writes only the plan. | `opencutplan export plan shelf.cutplan.json --out shelf-cuts.cutplan.json` |

The export commands write to stdout when you do not give `--out`. `export svg` needs `--out` unless you choose one
sheet with `--sheet`.

## For agents

Use `--json` on every call. Read `ok` and `error.code`, and use the exit code to decide the next step. Use
`opencutplan help <command> --json` to get the options and the result fields of a command.

This recipe makes a project, plans it, and draws it:

```bash
F=desk.cutplan.json
opencutplan new $F --name "Desk" --units in --json
opencutplan materials add $F --catalog birch-ply-3-4 --json
opencutplan stock add $F --length "8'" --width "4'" --cost 60 --json
opencutplan parts add $F --name Top --length 60 --width 30 --json
opencutplan parts add $F --name "Leg panel" --length "28 1/2" --width 24 --quantity 2 --json
opencutplan optimize $F --iterations 200 --seed 1 --strict --json   # exit 1 when a copy does not fit
opencutplan report shopping $F --json                               # .total, .sheetsToBuy
opencutplan report sequence $F --json                               # .steps[].title, .actions, .results, .tool, and .chosen
opencutplan export svg $F --out svg --json                          # .files[].path
opencutplan validate $F --strict --json                             # .valid
```

This recipe makes a KALLAX 2x4 from a track saw, pocket screws, and one sheet size:

```bash
F=hall.cutplan.json
opencutplan new $F --name "Hall storage" --units mm --json
opencutplan tools add $F --type track-saw --max-cut 2800 --position 1 --json
opencutplan materials add $F --name "Birch ply 18" --thickness 18 --json
opencutplan stock add $F --length 2440 --width 1220 --cost 80 --json
opencutplan design add $F --system kallax --cols 2 --rows 4 --json      # .design.id is kallax-2x4
opencutplan design combine $F kallax-2x4 --cell 1,1 --to 2,1 --json     # one wide cell at the top
opencutplan optimize $F --iterations 200 --seed 1 --strict --json
opencutplan report assembly $F --json                                   # .designs[].steps[]
opencutplan report shopping $F --json                                   # .hardware[]
opencutplan design drawing $F kallax-2x4 --out hall.svg
opencutplan design drawing $F kallax-2x4 --step 1 --json                # .description
```

Some rules help an agent:

- Use `--dry-run --json` to see `changes` and `validation` before a change.
- Use `--iterations` with `optimize` when a later step compares results.
- Use `--strict` so that a change with plan errors is not written.
- Read the id of a new item from the result (`part.id`, `stock.id`, `material.id`, `design.id`), and use it in the
  next calls.
- An error with exit 2 has the name of the bad option or id in `error.option` or `error.id`. Many errors also list the
  known ids in `error.known`.
