import {
  applyRun,
  copyLabel,
  describeGoal,
  describeGroupSpread,
  extraCostPercent,
  factoryEdgeRequest,
  MAX_EXTRA_COST_PERCENT,
  OPTIMIZER_GOALS,
  optimize,
  optimizeRequest,
  planContext,
  projectGoal,
  regenerateDesigns,
  sheetFactoryEdgeMisses,
  spreadGroups,
  type OptimizeOptions,
  type OptimizeResult,
  type Project,
} from "@opencutplan/core";
import { PROGRAM } from "../help.ts";
import { FILE_ARG, finishMutation, loadProject, OUTPUT_OPTIONS } from "../project.ts";
import { usageError, type CommandSpec } from "../spec.ts";
import { planStats, type PlanStats } from "../stats.ts";
import { money, plural } from "../text.ts";
import { flag, integerValue, numberValue, optionalBoolean, optionalChoice, str } from "../values.ts";

function factoryEdgeLine(project: Project): string | null {
  const ctx = planContext(project);
  const sheets = project.plan?.sheets ?? [];
  const asking = sheets.reduce((sum, sheet) => sum + sheet.placements.filter((p) => ctx.parts.has(p.part) && factoryEdgeRequest(project, ctx.parts.get(p.part)!) !== null).length, 0);
  if (asking === 0) return null;
  const misses = sheets.reduce((sum, sheet) => sum + sheetFactoryEdgeMisses(ctx, sheet), 0);
  return `Factory edges: ${asking - misses} of ${plural(asking, "copy", "copies")} that ask for one get one.`;
}

function statsLine(stats: PlanStats): string {
  return `${plural(stats.sheets, "sheet")}, ${stats.placedCopies} of ${stats.copies} copies placed, buy ${plural(stats.sheetsToBuy, "sheet")}, cost ${money(stats.cost, stats.currency)}`;
}

function brief(stats: PlanStats) {
  return { sheets: stats.sheets, placedCopies: stats.placedCopies, unplacedCopies: stats.unplacedCopies, sheetsToBuy: stats.sheetsToBuy, cost: stats.cost, errors: stats.errors };
}

export const optimizeCommand: CommandSpec = {
  name: "optimize",
  summary: "Plan the parts on the stock, store the plan, and report what changed.",
  description:
    "Run the optimizer and store its plan in the project. By default pinned sheets stay as they are and every other copy is planned again (the app's Optimize). --rest-only keeps every sheet and plans only the copies in the tray (Optimize the rest). --continue starts the search from the current plan. For the goal cost, the result is never worse than the current plan; for the goals offcuts and cuts, the search first tries its fixed candidates again, so the result can cost less and have a worse goal measure. --goal, --extra-cost, and --keep-groups change the goal for this run only; the stored settings stay. When the groups stay together, the optimizer puts the parts of each design unit and each part group on as few sheets as it can, but never at a higher cost. A run with --iterations gives the same result for the same seed on every computer; a timed run can stop at a different candidate. The currency of cost is the project currency.",
  args: [FILE_ARG],
  options: [
    { name: "time", type: "string", value: "<seconds>", description: "The search time. Default: the optimizer.timeLimitMs setting (2 s). Ignored with --iterations." },
    { name: "seed", type: "string", value: "<n>", description: "The random seed. Default: the optimizer.seed setting, else 1." },
    { name: "goal", type: "string", value: OPTIMIZER_GOALS.join("|"), description: "The goal for this run: the lowest cost, the best offcuts, or the fewest cut steps. Default: the optimizer.goal setting." },
    {
      name: "extra-cost",
      type: "string",
      value: "<percent>",
      description: "The most extra cost that the goal offcuts or cuts can use in this run, in percent of the cheapest plan found (0 to 100). Default: the optimizer.extraCostPercent setting.",
    },
    {
      name: "keep-groups",
      type: "string",
      value: "<true|false>",
      description: "Whether this run puts the parts of each design unit and each part group on as few sheets as possible. Default: the optimizer.keepGroupsTogether setting.",
    },
    { name: "iterations", type: "string", value: "<n>", description: "Try exactly n candidates per material and ignore the time. The result then depends only on the project and the seed." },
    { name: "keep-pinned", type: "boolean", description: "Keep the pinned sheets and plan everything else again. This is the default." },
    { name: "rest-only", type: "boolean", description: "Keep every sheet as it is and plan only the unplaced copies." },
    { name: "continue", type: "boolean", description: "Start from the current plan (the app's Keep searching)." },
    ...OUTPUT_OPTIONS,
  ],
  examples: [
    { command: `${PROGRAM} optimize shelf.cutplan.json --iterations 200 --seed 1`, description: "Plan every part, the same result every time." },
    { command: `${PROGRAM} optimize shelf.cutplan.json --rest-only --strict`, description: "Place only the parts in the tray; fail when some cannot be placed." },
    { command: `${PROGRAM} optimize shelf.cutplan.json --time 10 --continue --json`, description: "Search 10 more seconds from the current plan." },
  ],
  output:
    'mode ("all" or "rest"), continued, goal, extraCostPercent (the limit of the run), keepGroupsTogether, seed, timeLimitMs (null with --iterations), iterations (candidates tried), deterministic, before and after { sheets, placedCopies, unplacedCopies, sheetsToBuy, cost, errors }, unplaced [{ part, copy, name, reason }] (reason: too-large, no-stock, no-tool, not-guillotine), materials [{ material, score (with groupSpread: the sheets past the first that hold each unit or group, summed; factoryEdgeMisses: the placed copies that ask for a factory edge and do not get one), cheapestCost, extraCostPercent (the extra cost that the plan uses) }], groups [{ key, label, material, sheets }] (the units and groups on more than one sheet of a material), changes, validation, written, dryRun. With --strict, unplaced copies also give exit 1.',
  async run(invocation) {
    const { args, options, io } = invocation;
    if (flag(options, "rest-only") && flag(options, "keep-pinned")) throw usageError("Give --keep-pinned or --rest-only, not both.", "conflict");
    const loaded = await loadProject(io, args[0]!);
    const project = regenerateDesigns(loaded.project);
    const mode = flag(options, "rest-only") ? "rest" : "all";
    const request = optimizeRequest(project, mode);
    const settings = project.settings.optimizer;
    const opts: OptimizeOptions = {};
    const time = str(options, "time");
    if (time !== undefined) {
      const seconds = numberValue(time, "time");
      if (seconds <= 0) throw usageError("--time must be greater than 0.", "invalid-value", { option: "time" });
      opts.timeLimitMs = Math.max(1, Math.round(seconds * 1000));
    }
    const seedText = str(options, "seed");
    if (seedText !== undefined) opts.seed = integerValue(seedText, "seed");
    const iterationsText = str(options, "iterations");
    if (iterationsText !== undefined) opts.iterations = integerValue(iterationsText, "iterations", 1);
    const goalOption = optionalChoice(options, "goal", OPTIMIZER_GOALS);
    if (goalOption !== undefined) opts.goal = goalOption;
    const extraText = str(options, "extra-cost");
    if (extraText !== undefined) opts.extraCostPercent = numberValue(extraText, "extra-cost", 0, MAX_EXTRA_COST_PERCENT);
    const keepGroups = optionalBoolean(options, "keep-groups");
    if (keepGroups !== undefined) opts.keepGroupsTogether = keepGroups;
    const goal = opts.goal ?? projectGoal(project);
    const extra = opts.extraCostPercent ?? settings.extraCostPercent;
    const together = opts.keepGroupsTogether ?? settings.keepGroupsTogether;
    const continued = flag(options, "continue");
    if (continued) {
      const start: OptimizeResult = { sheets: request.input.plan?.sheets ?? [], unplaced: [], materials: [], iterations: 0 };
      opts.start = start;
    }
    const result = optimize(request.input, opts);
    const next = applyRun(request, result);
    const before = planStats(project);
    const after = planStats(next);
    const parts = new Map(project.parts.map((part) => [part.id, part]));
    const unplaced = result.unplaced.map((u) => ({ ...u, name: copyLabel(parts.get(u.part)!, u.copy) }));
    const deterministic = opts.iterations !== undefined;
    const materials = result.materials.map((m) => ({ ...m, extraCostPercent: extraCostPercent(m.score.cost, m.cheapestCost) }));
    const names = new Map(project.materials.map((material) => [material.id, material.name]));
    const groupText = together ? describeGroupSpread(next) : null;
    const edgeLine = factoryEdgeLine(next);
    const groups = spreadGroups(next).map((g) => ({ key: g.key.key, label: g.key.label, material: g.material, sheets: g.sheets }));
    const details = [
      `Before: ${statsLine(before)}.`,
      `After: ${statsLine(after)}.`,
      `Goal: ${describeGoal(goal, extra)}.`,
      ...materials
        .filter((m) => m.extraCostPercent > 0)
        .map((m) => `  ${names.get(m.material) ?? m.material}: ${plural(m.score.sheets, "sheet")}, ${m.extraCostPercent} % more cost than the cheapest plan found.`),
      ...(groupText === null ? [] : [`Groups: ${groupText}`]),
      ...(edgeLine === null ? [] : [edgeLine]),
      ...unplaced.map((u) => `  not placed: ${u.name} (${u.part} copy ${u.copy}): ${u.reason}`),
      `Tried ${result.iterations} candidates${deterministic ? "" : " (a timed run; use --iterations for the same result every time)"}.`,
    ];
    return finishMutation(invocation, loaded, next, {
      summary: mode === "rest" ? "Planned the unplaced copies." : `Planned every copy that is not on a pinned sheet.`,
      details,
      data: {
        mode,
        continued,
        goal,
        extraCostPercent: extra,
        keepGroupsTogether: together,
        seed: opts.seed ?? settings.seed ?? 1,
        timeLimitMs: deterministic ? null : (opts.timeLimitMs ?? settings.timeLimitMs),
        iterations: result.iterations,
        deterministic,
        before: brief(before),
        after: brief(after),
        unplaced,
        materials,
        groups,
      },
      ...(after.unplacedCopies > 0 ? { strictFailure: `${plural(after.unplacedCopies, "copy", "copies")} could not be placed.` } : {}),
    });
  },
};
