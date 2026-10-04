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
- Every change result has `changes` (what changed, by id), `validation` (`errors`, `warnings`, `issues`), `written`
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
files.

| Command | What it does | Example |
| ------- | ------------ | ------- |
| `parts list <file>` | Lists the parts and their placed copies. | `opencutplan parts list shelf.cutplan.json` |
| `parts get <file> <id>` | Shows one part. | `opencutplan parts get shelf.cutplan.json a-side --json` |
| `parts add <file>` | Adds a part. | `opencutplan parts add shelf.cutplan.json --name Side --material bb18 --length 30 --width "11 1/4" --quantity 2` |
| `parts set <file> <id>` | Changes a part. A lower quantity removes the extra placements. | `opencutplan parts set shelf.cutplan.json a-side --quantity 3 --grain none` |
| `parts remove <file> <id>...` | Removes parts and their placements. | `opencutplan parts remove shelf.cutplan.json a-back` |
| `parts import <file> <csv>` | Adds the parts in a CSV file. `--map length=Len` reads the length from the column `Len`. | `opencutplan parts import shelf.cutplan.json parts.csv --dry-run` |
| `parts export <file>` | Writes the parts as CSV. | `opencutplan parts export shelf.cutplan.json --out parts.csv` |
| `stock list <file>` | Lists the stock and the sheets cut from each item. | `opencutplan stock list shelf.cutplan.json` |
| `stock get <file> <id>` | Shows one stock item. | `opencutplan stock get shelf.cutplan.json bb18-5x5` |
| `stock add <file>` | Adds a sheet size or an owned offcut. `--catalog <size id>` adds a catalogue size. | `opencutplan stock add shelf.cutplan.json --material bb18 --length "8'" --width "4'" --cost 65` |
| `stock set <file> <id>` | Changes a stock item. `--trim` is a length, `factory`, or `project`. | `opencutplan stock set shelf.cutplan.json bb18-5x5 --quantity 4 --factory-edges` |
| `stock remove <file> <id>...` | Removes stock and the sheets cut from it. | `opencutplan stock remove shelf.cutplan.json bb6-5x5` |
| `stock import <file> <csv>` | Adds the stock in a CSV file. | `opencutplan stock import shelf.cutplan.json stock.csv` |
| `stock export <file>` | Writes the stock as CSV. | `opencutplan stock export shelf.cutplan.json` |
| `stock save-offcuts <file>` | Adds the usable offcuts of the plan to the stock. | `opencutplan stock save-offcuts shelf.cutplan.json` |
| `materials list <file>` | Lists the materials and the parts and stock that use them. | `opencutplan materials list shelf.cutplan.json` |
| `materials get <file> <id>` | Shows one material. | `opencutplan materials get shelf.cutplan.json bb18` |
| `materials add <file>` | Adds a material. `--catalog <id>` adds a catalogue material. | `opencutplan materials add shelf.cutplan.json --name "MDF 3/4" --thickness 3/4 --grained false` |
| `materials set <file> <id>` | Changes a material. | `opencutplan materials set shelf.cutplan.json bb18 --color "#d9b98c"` |
| `materials remove <file> <id>...` | Removes materials. A material in use gives exit 1. | `opencutplan materials remove shelf.cutplan.json mdf-3-4` |
| `tools list <file>` | Lists the saws in preference order. | `opencutplan tools list shelf.cutplan.json` |
| `tools get <file> <id>` | Shows one saw. | `opencutplan tools get shelf.cutplan.json table-saw` |
| `tools add <file>` | Adds a saw with its kerf and limits. | `opencutplan tools add shelf.cutplan.json --type track-saw --max-cut 110 --position 1` |
| `tools set <file> <id>` | Changes a saw. | `opencutplan tools set shelf.cutplan.json table-saw --max-rip 30` |
| `tools remove <file> <id>...` | Removes saws. | `opencutplan tools remove shelf.cutplan.json track-saw` |
| `tools move <file> <id>` | Changes the place of a saw in the preference order. | `opencutplan tools move shelf.cutplan.json track-saw --position 1` |

### Catalogue

The [catalogue](catalog.md) is a list of common sheet goods from Home Depot, Lowe's, and specialty sellers, with a
typical price. The prices are approximate and dated.

| Command | What it does | Example |
| ------- | ------------ | ------- |
| `catalog list` | Lists the catalogue materials and sizes, with the typical price, the store, and the date. It needs no file. `--family` selects one family, and `--units` selects `in` (the default) or `mm`. | `opencutplan catalog list --family mdf --units mm` |
| `materials add <file> --catalog <id>` | Adds a catalogue material, with its name, its actual thickness, and its grain. | `opencutplan materials add shelf.cutplan.json --catalog baltic-birch-18mm` |
| `stock add <file> --catalog <size id>` | Adds a catalogue sheet size as unlimited stock, and its material when the project does not have it. | `opencutplan stock add shelf.cutplan.json --catalog mdf-3-4-4x8 --quantity 2` |

- With `--catalog`, `stock add` refuses `--material`, `--length`, `--width`, and `--kind`, and `materials add`
  refuses `--name`, `--thickness`, and `--grained` (exit 2, `conflict`). An unknown id is exit 2, `not-found`.
- The cost of the new stock is the typical price when the project currency is USD. `--cost` sets another cost.
- When the project has the material or the sheet, the command changes nothing, and `added` is `false`.
- The result has `added`. `stock add --catalog` also has `material` and `addedMaterial`.

### Designs

A design is a cabinet box: a top and a bottom that run the full width, the sides and the dividers between them, and
the shelves between the sides and the dividers, all joined with pocket screws. The CLI makes the parts of the design, and you cannot change them with `parts set` or `parts remove`
(exit 1, `generated-part`). Change the design, or use `design detach` to make them normal parts.

| Command | What it does | Example |
| ------- | ------------ | ------- |
| `design systems` | Lists `kallax`, `eket`, and `custom`, with the IKEA numbers and their sources. It needs no file. | `opencutplan design systems --json` |
| `design list <file>` | Lists the designs with the outside size and the part counts. | `opencutplan design list hall.cutplan.json` |
| `design get <file> <id>` | Shows one design, its parts, and its checks. | `opencutplan design get hall.cutplan.json kallax-2x4 --json` |
| `design add <file>` | Adds a design and makes its parts. | `opencutplan design add hall.cutplan.json --system kallax --cols 2 --rows 4` |
| `design set <file> <id>` | Changes a design and makes its parts again. | `opencutplan design set hall.cutplan.json kallax-2x4 --rows 5` |
| `design remove <file> <id>...` | Removes designs, their parts, and the copies on the sheets. | `opencutplan design remove hall.cutplan.json kallax-2x4` |
| `design detach <file> <id>` | Keeps the parts as normal parts, and removes the design. | `opencutplan design detach hall.cutplan.json kallax-2x4` |
| `design drawing <file> <id>` | Draws the front view as SVG, to `--out` or to stdout. | `opencutplan design drawing hall.cutplan.json kallax-2x4 --out hall.svg` |

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

The IKEA numbers are in millimetres. The CLI converts them to the project units, so an inch project gets 13 3/16" for
335 mm. Without `--name`, the name is the system and the grid, such as `KALLAX 2x4`, and the id comes from the name:
`kallax-2x4`. A change that gives a design error, such as stock that is too thin for pocket screws, is refused with
exit 1 and `invalid-value`, and `error.issues` lists the checks. `design set` gives `partChanges` (the parts that were
added, removed, or resized) and `removedPlacements` (the copies that went to the tray).

### Settings

`settings get` shows all settings or one setting. `settings set` takes one or more key and value pairs. The pairs
apply in order, so a length after `units` is in the new units. `opencutplan help settings set` lists all keys.

| Command | Example |
| ------- | ------- |
| `settings get <file> [key]` | `opencutplan settings get shelf.cutplan.json trim` |
| `settings set <file> <key> <value>...` | `opencutplan settings set shelf.cutplan.json trim 1/4 orderMode setup optimizer.seed 7` |

The keys are `name`, `notes`, `units`, `trim` (a length, or `factory`), `orderMode`, `minOffcut.length`,
`minOffcut.width`, `minOffcut` (`default`), `display.inch`, `display.mm`, `optimizer.timeLimitMs`, `optimizer.seed`
(a number, or `none`), `optimizer.goal` (`cost`, `offcuts`, or `cuts`), `optimizer.extraCostPercent` (0 to 100),
`currency`, and `features.<name>` for each feature switch. A change of `units` converts all
lengths in the project. `--factory-edges` is the same as `trim factory`.

### Optimize

`optimize <file>` plans the parts on the stock and stores the plan in the file.

- The default mode keeps the pinned sheets and plans all other copies again.
- `--rest-only` keeps all sheets and plans only the copies in the tray.
- `--continue` starts from the current plan. For the goal `cost`, the result is not worse than the current plan. For
  the goals `offcuts` and `cuts`, the search first tries its fixed candidates again to find the cheapest cost, so the
  result can cost less and have a worse goal measure than the current plan.
- `--time <seconds>` sets the search time. `--seed <n>` sets the random seed.
- `--goal <goal>` and `--extra-cost <percent>` set the goal and the extra cost for this run only. The stored settings
  do not change. See [`optimizer.md`](optimizer.md#objective).
- `--iterations <n>` tries a fixed number of candidates and ignores the time. Use it when you need the same result
  each time. A timed run can stop at a different candidate on a different computer, even with the same seed.

The text output names the goal. For each material whose plan costs more than the cheapest plan found, it adds a line:
`Plywood: 3 sheets, 4 % more cost than the cheapest plan found.` The `--json` output has `goal` and
`extraCostPercent` (the limit of the run), and `materials`: `{ material, score, cheapestCost, extraCostPercent }` for
each material, where `extraCostPercent` is the extra cost that the plan uses, rounded to one decimal (0 when
`cheapestCost` is 0).

```bash
opencutplan optimize shelf.cutplan.json --iterations 200 --seed 1 --strict
opencutplan optimize shelf.cutplan.json --goal offcuts --extra-cost 15
```

### Layout

The layout commands change the plan by hand. x and y are from the top-left corner of the full stock piece.

| Command | What it does | Example |
| ------- | ------------ | ------- |
| `layout show <file>` | Shows the sheets, the placements, the tray, and the issues. | `opencutplan layout show shelf.cutplan.json --sheet 2` |
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

### Reports

The reports do not change the file.

| Command | What it does | Example |
| ------- | ------------ | ------- |
| `report shopping <file>` | What to buy, the cost, and the use of each sheet. | `opencutplan report shopping shelf.cutplan.json` |
| `report sequence <file>` | The cut steps in shop order, with the text of the Shop mode, and the total cut length. | `opencutplan report sequence shelf.cutplan.json --sheet 1` |
| `report offcuts <file>` | The usable offcuts, and if the stock has them. | `opencutplan report offcuts shelf.cutplan.json --json` |
| `report labels <file>` | One label for each copy. `--layout` splits them into pages. | `opencutplan report labels shelf.cutplan.json --layout avery-5160` |
| `report cutlist <file>` | All parts with the size, count, and sheet numbers. | `opencutplan report cutlist shelf.cutplan.json` |
| `report assembly <file>` | The steps to build each design. `--design <id>` selects one. | `opencutplan report assembly hall.cutplan.json --json` |

`report shopping` also lists the hardware for the designs in `hardware`: the pocket screws, the back screws, the
glue, and the IKEA legs, feet, or rails, with the IKEA article numbers. The hardware has no prices.

Money in the readable output is `12.00 USD`. In `--json`, money is a number, and `null` means that a price is not
known.

### Export

| Command | What it does | Example |
| ------- | ------------ | ------- |
| `export svg <file>` | Draws the sheets as SVG. A directory gets one `<name>-sheet-N.svg` file for each sheet. | `opencutplan export svg shelf.cutplan.json --out svg/` |
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
opencutplan materials add $F --name "Plywood 3/4" --thickness 3/4 --json
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
opencutplan optimize $F --iterations 200 --seed 1 --strict --json
opencutplan report assembly $F --json                                   # .designs[].steps[]
opencutplan report shopping $F --json                                   # .hardware[]
opencutplan design drawing $F kallax-2x4 --out hall.svg
```

Some rules help an agent:

- Use `--dry-run --json` to see `changes` and `validation` before a change.
- Use `--iterations` with `optimize` when a later step compares results.
- Use `--strict` so that a change with plan errors is not written.
- Read the id of a new item from the result (`part.id`, `stock.id`, `material.id`, `design.id`), and use it in the
  next calls.
- An error with exit 2 has the name of the bad option or id in `error.option` or `error.id`. Many errors also list the
  known ids in `error.known`.
