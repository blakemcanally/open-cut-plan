# OpenCutPlan

An open-source planner for cutting plywood and other sheet goods with a table saw, track saw, circular saw, or panel
saw. This repository contains the core library (file format, CSV, cut analysis, and the optimizer) and a web app to enter
parts, stock, and tools, to edit layouts, to follow the cut sequence at the saw, and to print sheet diagrams, the cut
sequence, a shopping list, and part labels.

- **File format:** [`docs/format.md`](docs/format.md) and the JSON Schema in [`schema/`](schema/).
- **Cut analysis:** [`docs/cut-analysis.md`](docs/cut-analysis.md) — the layout validator, guillotine cut tree, tool
  rules, shop sequence, offcuts, and reports.
- **Optimizer:** [`docs/optimizer.md`](docs/optimizer.md) — plan generation, the objective, pinning, and the worker
  protocol.
- **Web app:** [`docs/web-app.md`](docs/web-app.md) — the screens, the layout editor and its keys, the Shop
  checklist, reports, printing, and where projects are stored.
- **Command line:** [`docs/cli.md`](docs/cli.md) — the `opencutplan` command for scripts and AI agents.
- **Examples:** [`examples/`](examples/) — `living-room-shelf` (inches, with a full layout) and
  `simple-bookcase-mm` (metric, with an owned offcut and two saws).
- **Design:** [`docs/superpowers/specs/`](docs/superpowers/specs/).

## Command line

The `opencutplan` command creates, changes, checks, optimizes, and reports on project files. Each command has a
`--json` result and a fixed exit code, so scripts and AI agents can use it. See [`docs/cli.md`](docs/cli.md).

```bash
npx opencutplan new desk.cutplan.json --name "Desk" --units in
npx opencutplan materials add desk.cutplan.json --name "Plywood 3/4" --thickness 3/4
npx opencutplan stock add desk.cutplan.json --length "8'" --width "4'" --cost 60
npx opencutplan parts add desk.cutplan.json --name Top --length 60 --width 30
npx opencutplan optimize desk.cutplan.json --iterations 200
npx opencutplan report shopping desk.cutplan.json
npx opencutplan help
```

## Development

Requires Node.js 24 or later.

```bash
npm install
npm run dev        # start the web app at http://localhost:5173
npm run build      # build the web app into apps/web/dist
npm run check      # typecheck, run all tests, and build the web app
npm run cli -- …   # run the opencutplan command
npm run e2e        # run the Playwright end-to-end tests (first: npx playwright install chromium)
npm run schema     # regenerate schema/cutplan.schema.json after changing the format
npm run examples   # regenerate the files in examples/ after changing a builder
```
