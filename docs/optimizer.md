# Optimizer

`optimize(project, options)` in `@opencutplan/core` builds a plan for every part copy that is not on a pinned sheet.
`applyOptimizeResult(project, result)` puts the result into the project's plan. The optimizer never changes the
project it is given.

## What it keeps

- **Pinned sheets** (`pinned: true`) stay exactly as they are, with their placements. Their copies are not planned
  again, and each pinned sheet counts against its stock's `quantity`. All other sheets in the plan are replaced.
- **New sheet ids** are `s<n>`, where `n` is the sheet's place in the plan (pinned sheets first). When a pinned
  sheet already uses that id, a suffix makes it unique: `s2-2`, then `s2-3`, and so on.

## Inputs

Each material is planned on its own, with:

- its part copies, with the orientations the grain allows (see `grain` in [`cut-analysis.md`](cut-analysis.md));
- its enabled stock (`enabled` is not `false`): owned offcuts first, then sheets;
- the planning kerf and trim from [`cut-analysis.md`](cut-analysis.md#terms).

The optimizer always builds guillotine layouts, even when the `cutOrder` feature is off.

## Constructors

Each candidate plan comes from one constructor, a part order, a stock order, and a rotation policy.

- **Strip**: rips a strip along the stock length at the width of its first part, crosscuts the strip into segments,
  and re-rips narrower parts out of the rest of each segment. This is the common shop practice.
- **Guillotine best-area-fit**: places each part in the free rectangle of any open sheet that it fills best, then
  splits the rest of that rectangle in two (Jylänki, "A Thousand Ways to Pack the Bin"). The four split rules are
  `short-axis`, `long-axis`, `min-area`, and `max-area`.

Parts are at least one kerf apart and may touch the edge of the usable area. When no open sheet has room, the
constructor opens the first stock in the stock order that has pieces left and that the part fits.

The **rotation policy** decides which orientation a part that may rotate tries first: `keep` (as defined), `long`
(long side along the stock length), or `short`.

## Search

1. The optimizer first tries every combination of four part orders (area, longest side, length, and width, each
   largest first), the five constructors, up to six sheet stock orders, and the rotation policies.
2. It then tries random changes to the chosen candidate so far (see [Objective](#objective)): swaps in the part order, a new order by area with
   random noise, another constructor, another stock order, or another rotation policy.
3. It stops at `timeLimitMs` (default `settings.optimizer.timeLimitMs`), but only after every material has at least
   one candidate. With `iterations`, it runs exactly that many candidates per material and ignores the time.

The random numbers come from `seed` (default `settings.optimizer.seed`, else 1). The same seed and iteration count
always give the same result. A timed run can stop at a different candidate on a different computer.

**Keep searching**: pass the previous result as `start`. The search starts from its plans, skips the first stage, and
continues with new random numbers. For the goals `offcuts` and `cuts`, the cheapest cost C of each material starts at
the `cheapestCost` of that material in `start`. A material with no `cheapestCost` in `start` (the CLI builds such a
start for `optimize --continue`) runs the first stage again, so that the search finds a cheap plan again. Copies that are now on a pinned sheet, or no longer in the project, are left out of
those plans, and so are sheets past a stock's `quantity`.

## Validation

Every candidate goes through the validator in [`cut-analysis.md`](cut-analysis.md). A sheet with any error is dropped,
and its parts become unplaced. So the optimizer never returns a sheet with an error. When no tool is enabled at all,
the plan-wide `no-tool` error drops nothing; the validator still reports it.

## Objective

The goal is `goal` (default `settings.optimizer.goal`). A goal that this version does not know is `cost`.

For the goal `cost`, candidates are compared per material, in this order:

1. **Unplaced copies**: fewer is better.
2. **Cost**: the sum of the stock `cost` of the sheets used. Owned offcuts count as 0. When the `cost` feature is off,
   or any enabled sheet stock of the material has no `cost`, the stock area is used in place of the cost.
3. **Largest offcut** area: bigger is better (0 when the `offcuts` feature is off).
4. **Cut steps**, including trims: fewer is better.
5. **Sheets**: fewer is better.

For the goals `offcuts` and `cuts`, the search chooses a plan for each material with this rule:

1. It keeps the candidates with the fewest unplaced copies.
2. C is the lowest cost of those candidates. It keeps the candidates that cost at most
   C × (1 + `extraCostPercent` / 100). `extraCostPercent` defaults to `settings.optimizer.extraCostPercent`.
3. It chooses by the goal. For `offcuts`, the offcut areas compare largest first: the larger first area wins, then
   the larger second area, and so on, and a list that ends first loses. For `cuts`, fewer cut steps win.
4. When candidates are still equal, the order of the goal `cost` decides. Of two equal candidates, the first found
   stays.

Costs and areas that differ by less than a small relative tolerance are equal, so a candidate that costs exactly the
limit stays. C can only go down, so the search drops a candidate when its cost goes over the limit. With the
`offcuts` feature off, every offcut list is empty, and the goal `offcuts` gives the same plan as the goal `cost`.

## Result

`OptimizeResult` has:

- `sheets`: the pinned sheets, then the new sheets of each material, in project material order;
- `unplaced`: `{ part, copy, reason }` for each copy with no place, grouped by material in project material order,
  and in part order, then copy order, within each material;
- `materials`: `{ material, score, cheapestCost }`. The `score` has the measures above, with `offcuts`: the area of
  every offcut, largest first. `cheapestCost` is C for the goals `offcuts` and `cuts`, and the cost of the chosen plan
  for the goal `cost`;
- `iterations`: the candidates tried, over all materials, including those of a `start` result.

| `reason` | Meaning |
|---|---|
| `too-large` | the copy fits no enabled stock of its material in any allowed orientation |
| `no-stock` | the stock quantities ran out |
| `no-tool` | no enabled tool can make a cut that its sheet needs |
| `not-guillotine` | its sheet failed the validator for another reason; the constructors are not expected to cause it |

## Worker protocol

The web app runs the optimizer in a Web Worker. `createOptimizerHost(post)` returns the worker's message handler:

```ts
const handle = createOptimizerHost((message) => self.postMessage(message));
self.onmessage = (event) => handle(event.data);
```

| Message | Direction | Fields |
|---|---|---|
| `start` | to the worker | `id`, `project`, optional `options` (all `OptimizeOptions` except `now`), optional `progressMs` (default 100) |
| `cancel` | to the worker | `id` |
| `progress` | from the worker | `id`, `result` (the best result so far) |
| `done` | from the worker | `id`, `result`, `cancelled` |
| `error` | from the worker | `id`, `message` |

The worker runs the search in slices of `progressMs` and sends `progress` after each slice. It yields between slices,
so a `cancel` can arrive. A cancelled job sends `done` with `cancelled: true` and its best result so far. A new
`start` cancels the running job first.

For code that does not use a worker, `createSearch(project, options)` returns a search with `step(budgetMs)`, which
returns true when the search is finished, and `result()`. Before it builds a result, `result()` tries one candidate for
each material that has none yet, so every result accounts for every copy, also when a search is cancelled at once.
