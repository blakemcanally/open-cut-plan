# Optimizer goal — design spec

Status: draft for review. Date: 2026-09-29.

## 1. Summary

The optimizer now always looks for the lowest cost. This change lets the user choose a goal: the lowest cost, the best
offcuts, or the fewest cuts. A goal other than cost can spend a limited amount of extra cost. Fitting every part always
comes first.

## 2. Goals and success criteria

1. The user can choose the goal in the file (`settings.optimizer.goal`), with the CLI (`settings set` and one-run
   flags), and on the Settings tab of the web app.
2. The user can limit the extra cost, as a percent of the cheapest plan that the search finds.
3. With the goal `cost`, the optimizer gives exactly the plans that it gives now, for the same seed and iterations.
4. The chosen plan never costs more than the limit allows, also after "Keep searching" or `optimize --continue`.
5. The user can see the goal and the extra cost that the chosen plan uses.

Not goals: prices for hardware or edge banding, a goal for each material, a goal that combines two measures with
weights, and a measure of saw setup changes or cut length.

## 3. File format 1.2

`FORMAT_VERSION` becomes `"1.2"`. A 1.1 file needs no migration. Two optional fields go in `settings.optimizer`:

| Field | Default | Meaning |
|---|---|---|
| `goal` | `"cost"` | `"cost"`, `"offcuts"`, or `"cuts"`. |
| `extraCostPercent` | `10` | A number from 0 to 100. The most extra cost that a goal other than `cost` can use, as a percent of the cheapest plan found. The optimizer ignores it when the goal is `cost`. |

- The value set of `goal` is open, like `designs[].system`: a later minor version can add a goal. A reader that does
  not know the value gives the warning `unknown-goal`, uses `cost`, and writes the value back unchanged.
- An `extraCostPercent` that is not a number from 0 to 100 makes the file invalid, as other bad settings do now.
- When the `cost` feature is off, or a sheet stock of the material has no price, the cost is the stock area, as now.
  The percent then applies to the area.
- `docs/format.md` and the JSON Schema in `schema/` describe version 1.2. The compatibility section lists `goal` with
  the open value sets.

## 4. Measures

The goals use measures that the search already has, with one addition.

- **Cost**: the current `Score.cost`.
- **Offcuts**: `Score.offcuts`, a new field. It holds the area of every offcut of the material, largest first.
  `listOffcuts` gives the offcuts, so the `minOffcut` rule and the `offcuts` feature apply as they do now. When the
  `offcuts` feature is off, the list is empty. `Score.largestOffcut` stays, and is `offcuts[0]`, or 0 for an empty list.
  So with the `offcuts` feature off, the goal `offcuts` gives the same plan as the goal `cost`. The Settings tab says
  this next to the goal.
- **Cuts**: the current `Score.cuts`, the number of cut steps, with the trims.

Two offcut lists compare in order: the larger first area wins; when the first areas are equal, the larger second area
wins, and so on. A list that ends first loses to a list that has one more offcut. Areas are equal when they differ by
less than the relative tolerance that `compareScores` uses now.

## 5. Choosing a plan

The search chooses one plan for each material, as now.

### 5.1 The rule

For the goal `cost`, the search uses `compareScores`, with no change.

For the goals `offcuts` and `cuts`:

1. Keep the plans with the fewest unplaced copies.
2. Let C be the lowest cost of those plans. Keep the plans that cost at most C × (1 + extraCostPercent / 100). Use the
   same relative tolerance, so a plan that costs exactly the limit stays.
3. Choose by the goal: the better offcut list (section 4), or fewer cuts.
4. When plans are still equal, use `compareScores`: cost, then the largest offcut, then cuts, then sheets.

### 5.2 The trade-off list

The limit depends on C, and C can change as the search runs. So the search cannot compare two plans without the other
plans. For each material, it keeps a list of plans instead of one best plan.

- The list holds only plans with the fewest unplaced copies found so far. A plan with fewer unplaced copies clears the
  list.
- A plan leaves the list when another plan in the list has a cost that is not higher and a goal measure that is not
  worse, and is better in one of the two. Equal plans keep the one that was found first.
- A plan leaves the list when its cost is more than C × (1 + limit). C can only go down, so such a plan can never be
  chosen again.
- The chosen plan is the plan in the list that the rule in 5.1 picks. The random changes of the second stage start from
  it, as they start from the best plan now.

### 5.3 Continuing a search

- Each entry of `OptimizeResult.materials` gets `cheapestCost`: C for that material. For the goal `cost`, it is the cost
  of the chosen plan.
- When a search starts from an earlier result (`start`) and that result has `cheapestCost` for a material, C starts at
  that value, and not at the cost of the chosen plan. Without this, each "Keep searching" could add the limit again.
- `optimize --continue` in the CLI builds its start from the plan in the file, with no `cheapestCost`. For each material
  with no `cheapestCost`, the search runs its first stage (the fixed combinations of orders and constructors), and does
  not skip it. That stage finds a cheap plan again, so C is close to the C of the earlier run. This applies only to the
  goals `offcuts` and `cuts`; for the goal `cost` the search skips the first stage, as now.
- The search does not store the list in the result. A continued search builds its list again from the start plan and C.

## 6. Options and interfaces

- `OptimizeOptions` gets `goal` and `extraCostPercent`. The defaults are the project settings, as for `timeLimitMs` and
  `seed`.
- The worker protocol does not change: the new options go in the `options` of the `start` message.
- `Score` gets `offcuts`. `MaterialResult` gets `cheapestCost`.

## 7. CLI

- `settings set` gets two keys: `optimizer.goal` (`cost`, `offcuts`, or `cuts`) and `optimizer.extraCostPercent` (0 to
  100). `settings get` shows both.
- `optimize --goal <goal>` and `optimize --extra-cost <percent>` change one run. They do not change the stored
  settings. The command still writes the new plan, as now.
- A bad value for a key or a flag gives exit 1 and the code `invalid-value`.
- The text output names the goal and the limit. For each material whose chosen plan costs more than C, it adds one line,
  for example: `Plywood: 3 sheets, 4 % more cost than the cheapest plan found.`
- The `--json` output adds `goal` and `extraCostPercent` for the run. Each entry of `materials` has `cheapestCost` and
  `extraCostPercent`, the extra cost that the chosen plan uses, rounded to one decimal. It is 0 when C is 0.
- `docs/cli.md` describes the keys, the flags, and the output fields.

## 8. Web app

- **Settings tab**, in the Optimizer group:
  - **Goal**: a drop-down with "Lowest cost", "Best offcuts", and "Fewest cuts". A goal that the app does not know
    shows as "<value> (unknown)", as an unknown mount does on the Design tab.
  - **Extra cost allowed (%)**: a number field from 0 to 100. It is disabled when the goal is "Lowest cost".
- **Layout tab**: one line near **Optimize**, for example "Goal: best offcuts, up to 10 % extra cost." For the goal cost,
  the line is "Goal: lowest cost." The line ends with a **Change** link that opens the Settings tab. After a run, when
  a material uses extra cost, the line adds it, for example "Plywood: 4 % more cost than the cheapest plan found."
- A change of the goal changes the project, so **Keep searching** is not offered after it, as for other edits.
- `docs/web-app.md` describes both tabs.

## 9. Error handling

| Case | Result |
|---|---|
| Unknown `goal` in a file | Warning `unknown-goal`; the optimizer uses `cost`; the value is written back. |
| `extraCostPercent` outside 0 to 100, or not a number | The file is invalid. |
| Bad `--goal`, `--extra-cost`, or `settings set` value | Exit 1, code `invalid-value`. |
| C is 0 (only owned offcuts are used) | The limit is 0 × (1 + p) = 0, so only plans that use no bought stock stay. |

## 10. Testing

- **No change for the goal cost**: for fixed seeds and iterations, the plans of the examples and of the current
  optimizer tests are the same as before the change.
- **Offcuts**: a case with priced stock where a plan that costs 5 % more leaves a much larger offcut. With a limit of
  10 %, the goal `offcuts` picks that plan. With a limit of 0, it picks the cheapest plan.
- **Cuts**: a similar case, where a plan that costs a little more has fewer cut steps.
- **Offcut lists**: the comparison of section 4, with equal first areas and lists of different lengths.
- **Property tests** (fast-check, random parts and stock): the chosen plan never costs more than C × (1 + limit), and
  never has more unplaced copies than the cheapest plan. This also holds after three continued runs, with and without
  `cheapestCost` in the start.
- **Format**: a 1.2 file round-trips, a 1.1 file loads with no change, an unknown goal gives the warning and survives a
  save, and a bad percent makes the file invalid. The JSON Schema is current.
- **CLI**: the two keys, the two flags, the exit codes, and the JSON fields.
- **Web**: the Settings fields, the disabled percent field, the unknown goal, and the Layout line with its link and
  the extra cost after a run.

## 11. Delivery

One implementation plan, in this order: the format, the measures and the comparison, the search and its list, the
options and the result, the CLI, the web app, and the docs.
