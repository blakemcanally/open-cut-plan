# OpenCutPlan

An open-source planner for cutting plywood and other sheet goods with a table saw, track saw, circular saw, panel
saw, or mitre saw. This repository contains the core library (file format, CSV, cut analysis, and the optimizer) and a web app to enter
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
- **Catalogue:** [`docs/catalog.md`](docs/catalog.md) — common sheet goods and sizes with typical, dated prices.
- **Examples:** [`examples/`](examples/) — `living-room-shelf` (inches, with a full layout),
  `simple-bookcase-mm` (metric, with an owned offcut and two saws), `kallax-2x4-mm` (a KALLAX-style design),
  `kallax-4x2-combined-mm` (a KALLAX-style design with two cells combined), and `eket-wall-in` (two EKET-style wall
  units, in inches).
- **Design:** [`docs/superpowers/specs/`](docs/superpowers/specs/).

## Command line

The `opencutplan` command creates, changes, checks, optimizes, and reports on project files. Each command has a
`--json` result and a fixed exit code, so scripts and AI agents can use it. See [`docs/cli.md`](docs/cli.md). The
package is not on npm, so run these commands in a clone of this repository after `npm install`.

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

You need Node.js 24 or later. The repository pins the version in `.nvmrc`, so `nvm use` or `fnm use` selects it.
`npm install` stops with an error on an older Node.js.

```bash
git clone https://github.com/blakemcanally/open-cut-plan.git
cd open-cut-plan
npm install
npm run dev        # open http://localhost:5173
```

The app runs in the browser only. It has no server, no account, and no environment variables. Projects stay in the
browser's IndexedDB and in the `.cutplan.json` files that you save. To try it, click **Open example** on the home
screen.

| Command | What it does |
| ------- | ------------ |
| `npm run dev` | Starts the web app at http://localhost:5173, with hot reload. |
| `npm run check` | Checks the lockfile, lints, typechecks, runs all unit tests, and builds the web app. Run it before you push. |
| `npm test` | Runs the unit tests of all packages with Vitest. |
| `npm run build` | Builds the web app into `apps/web/dist`. |
| `npm run preview` | Serves `apps/web/dist` at http://localhost:4173, as a static host serves it. |
| `npm run e2e:install` | Downloads Chromium for the end-to-end tests. Run it once. |
| `npm run e2e` | Builds the web app and runs the Playwright end-to-end tests. |
| `npm run lint` | Lints with oxlint, with type-aware rules (config: `.oxlintrc.json`). |
| `npm run cli -- …` | Runs the `opencutplan` command. |
| `npm run schema` | Regenerates `schema/cutplan.schema.json` after a change to the format. |
| `npm run examples` | Regenerates the files in `examples/` after a change to a builder. |
| `npm run lockfile` | Makes sure that `package-lock.json` resolves every package from the public npm registry. Add `-- --fix` to rewrite the URLs of a private mirror. |

### Deploy

The web app is a static site. The `CI` workflow (`.github/workflows/ci.yml`) runs `npm run check` and the end-to-end
tests on each push and pull request. On a push to `main`, it also publishes `apps/web/dist` to GitHub Pages. The build
uses relative paths and hash routes, so it works at `https://<owner>.github.io/<repo>/` with no change. To turn on
the deploy, set **Settings → Pages → Source** to **GitHub Actions** once.

## License

OpenCutPlan is free software: you can redistribute it and/or modify it under the terms of the GNU General Public
License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later
version. See [`LICENSE`](LICENSE).
