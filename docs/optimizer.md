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

Each candidate plan comes from one constructor, a part order, a stock order, a rotation policy, and group affinity
(on or off).

- **Strip**: rips a strip along the stock length at the width of its first part, crosscuts the strip into segments,
  and re-rips narrower parts out of the rest of each segment. This is the common shop practice.
- **Guillotine best-area-fit**: places each part in the free rectangle of any open sheet that it fills best, then
  splits the rest of that rectangle in two (Jylänki, "A Thousand Ways to Pack the Bin"). The four split rules are
  `short-axis`, `long-axis`, `min-area`, and `max-area`.

Parts are at least one kerf apart and may touch the edge of the usable area. When no open sheet has room, the
constructor opens the first stock in the stock order that has pieces left and that the part fits.

The **rotation policy** decides which orientation a part that may rotate tries first: `keep` (as defined), `long`
(long side along the stock length), or `short`.

**Group affinity** puts a copy on a sheet that holds its [group](#objective) before it mixes groups. The guillotine
constructor first tries the open sheets that hold the group of the copy, then the other open sheets. The strip
constructor first takes the parts of the groups that the sheet holds, then the next part in the order that fits. Only
candidates that keep the groups together use group affinity.

## Search

1. The optimizer first tries every combination of four part orders (area, longest side, length, and width, each
   largest first), the five constructors, up to six sheet stock orders, and the rotation policies.
   - When the groups stay together and the copies make two or more runs, it then tries one more part order with
     each constructor, stock order, and rotation policy, with group affinity on. In this order, the copies of each
     group are together. The group with the largest total area is first, and the copies with no group are last.
     Each run is in order of area. The copies of each group make one run, and the copies with no group make one run.
2. It then tries random changes to the chosen candidate so far (see [Objective](#objective)): swaps in the part order, a new order by area with
   random noise, another constructor, another stock order, or another rotation policy.
   - When the groups stay together and the copies make two or more runs, some changes move whole groups. Such a
     change puts the copies of each group together, and then moves one group to the start, swaps two groups, or
     gives one group a new order by area with random noise. A change can also turn group affinity on or off.
3. When a candidate has [factory edge misses](#objective), and its unplaced copies and cost can still win, the
   search also tries the **pushed** copy of the candidate. The push moves the pieces of each sheet against the factory
   edges with `pushToFactoryEdges` (see [Factory edges](cut-analysis.md#factory-edges)). The cuts stay the same, and
   no part turns. The pushed copy goes through the validator and the objective like any candidate, but it does not
   count against `iterations`.
   - The random changes start from the chosen candidate when the misses do not count. So the search tries the same
     candidates as for the same project with no requests, and the misses never make a plan cost more or leave more
     copies unplaced.
4. It stops at `timeLimitMs` (default `settings.optimizer.timeLimitMs`), but only after every material has at least
   one candidate. With `iterations`, it runs exactly that many candidates per material and ignores the time.

The random numbers come from `seed` (default `settings.optimizer.seed`, else 1). The same seed and iteration count
always give the same result. A timed run can stop at a different candidate on a different computer.

**Keep searching**: pass the previous result as `start`. The search starts from its plans, skips the first stage, and
continues with new random numbers. For the goals `offcuts` and `cuts`, the cheapest cost C of each material starts at
the `cheapestCost` of that material in `start`. A material with no `cheapestCost` in `start` (the CLI builds such a
start for `optimize --continue`) runs the first stage again, so that the search finds a cheap plan again. Those
first-stage candidates do not count against `iterations`. Copies that are now on a pinned sheet, or no longer in the project, are left out of
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
3. **Factory edge misses**: the placed copies that ask for a factory edge and do not get one. Fewer is better.
4. **Group spread**, only when the groups stay together (see below): fewer is better.
5. **Largest offcut** area: bigger is better (0 when the `offcuts` feature is off).
6. **Cut steps**, including trims: fewer is better.
7. **Cut length**: the total length of the cut lines of those steps. Shorter is better.
8. **Sheets**: fewer is better.

**Factory edges.** A copy asks for a factory edge by its `factoryEdge` value or by the rule
`settings.factoryEdge.minLength` (see [Factory edges](format.md#factory-edges-added-in-16)). The copy gets a factory
edge when a long edge of the copy is on the edge of a sheet with factory edges: sheet stock with no trim. The misses
come after the cost, so they never make a plan cost more or leave more copies unplaced. When no copy asks for a
factory edge, the misses are always 0, and the search gives the same plans as before.

**Groups.** A group is a colour key (see [Colours](format.md#colours-added-in-14)): one unit of a design, or one group
of parts without a design. A copy with no colour key is in no group. The **group spread** of a material is the number
of sheets of that material that hold copies of a group, minus 1, summed over the groups. Pinned sheets count. A
group spread of 0 means that each group is on one sheet of the material.

The groups stay together when `keepGroupsTogether` is true (default `settings.optimizer.keepGroupsTogether`, which is
true when the file does not give it). The group spread comes after the cost, so it never makes a plan cost more or
leave more copies unplaced. When the groups need not stay together, the search does not use the group spread.

For the goals `offcuts` and `cuts`, the search chooses a plan for each material with this rule:

1. It keeps the candidates with the fewest unplaced copies.
2. C is the lowest cost of those candidates. It keeps the candidates that cost at most
   C × (1 + `extraCostPercent` / 100). `extraCostPercent` defaults to `settings.optimizer.extraCostPercent`.
3. It chooses the fewest factory edge misses.
4. When the groups stay together, it chooses the smallest group spread.
5. It chooses by the goal. For `offcuts`, the offcut areas compare largest first: the larger first area wins, then
   the larger second area, and so on, and a list that ends first loses. For `cuts`, fewer cut steps win, and of
   two candidates with the same number of cut steps, the shorter cut length wins.
6. When candidates are still equal, the order of the goal `cost` decides. Of two equal candidates, the first found
   stays.

Costs and areas that differ by less than a small relative tolerance are equal, so a candidate that costs exactly the
limit stays. C can only go down, so the search drops a candidate when its cost goes over the limit. With the
`offcuts` feature off, every offcut list is empty, and the goal `offcuts` gives the same plan as the goal `cost`.

## Result

`OptimizeResult` has:

- `sheets`: the pinned sheets, then the new sheets of each material, in project material order. When the groups stay
  together, the new sheets of a material are in group order: the next sheet is the first sheet left that shares a
  group with the sheet before it, else the first sheet left. So the sheets of a group are often next to each other.
  The order does not change the score, and the new sheet ids follow the order;
- `unplaced`: `{ part, copy, reason }` for each copy with no place, grouped by material in project material order,
  and in part order, then copy order, within each material;
- `materials`: `{ material, score, cheapestCost }`. The `score` has the measures above (`unplaced`, `cost`,
  `factoryEdgeMisses`, `groupSpread`, `largestOffcut`, `cuts`, `cutLength`, and `sheets`), with `offcuts`: the area of
  every offcut, largest first. The score gives the group spread also when the groups need not stay together.
  `cheapestCost` is C for the goals `offcuts` and `cuts`, and the cost of the chosen plan for the goal `cost`;
- `iterations`: the candidates tried, over all materials, including those of a `start` result.

| `reason` | Meaning |
|---|---|
| `no-stock-for-material` | the material of the copy has no enabled stock |
| `too-large` | the material has enabled stock, but the copy fits none of it in any allowed orientation |
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
