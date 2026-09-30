import { applyRun, copyLabel, optimize, optimizeRequest, regenerateDesigns, type OptimizeOptions, type OptimizeResult } from "@opencutplan/core";
import { PROGRAM } from "../help.ts";
import { FILE_ARG, finishMutation, loadProject, OUTPUT_OPTIONS } from "../project.ts";
import { usageError, type CommandSpec } from "../spec.ts";
import { planStats, type PlanStats } from "../stats.ts";
import { money, plural } from "../text.ts";
import { flag, integerValue, numberValue, str } from "../values.ts";

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
    "Run the optimizer and store its plan in the project. By default pinned sheets stay as they are and every other copy is planned again (the app's Optimize). --rest-only keeps every sheet and plans only the copies in the tray (Optimize the rest). --continue starts the search from the current plan, so the result is never worse than it (by the optimizer's objective). A run with --iterations gives the same result for the same seed on every computer; a timed run can stop at a different candidate. The currency of cost is the project currency.",
  args: [FILE_ARG],
  options: [
    { name: "time", type: "string", value: "<seconds>", description: "The search time. Default: the optimizer.timeLimitMs setting (2 s). Ignored with --iterations." },
    { name: "seed", type: "string", value: "<n>", description: "The random seed. Default: the optimizer.seed setting, else 1." },
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
    'mode ("all" or "rest"), continued, seed, timeLimitMs (null with --iterations), iterations (candidates tried), deterministic, before and after { sheets, placedCopies, unplacedCopies, sheetsToBuy, cost, errors }, unplaced [{ part, copy, name, reason }] (reason: too-large, no-stock, no-tool, not-guillotine), materials [{ material, score }], changes, validation, written, dryRun. With --strict, unplaced copies also give exit 1.',
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
    const details = [
      `Before: ${statsLine(before)}.`,
      `After: ${statsLine(after)}.`,
      ...unplaced.map((u) => `  not placed: ${u.name} (${u.part} copy ${u.copy}): ${u.reason}`),
      `Tried ${result.iterations} candidates${deterministic ? "" : " (a timed run; use --iterations for the same result every time)"}.`,
    ];
    return finishMutation(invocation, loaded, next, {
      summary: mode === "rest" ? "Planned the unplaced copies." : `Planned every copy that is not on a pinned sheet.`,
      details,
      data: {
        mode,
        continued,
        seed: opts.seed ?? settings.seed ?? 1,
        timeLimitMs: deterministic ? null : (opts.timeLimitMs ?? settings.timeLimitMs),
        iterations: result.iterations,
        deterministic,
        before: brief(before),
        after: brief(after),
        unplaced,
        materials: result.materials,
      },
      ...(after.unplacedCopies > 0 ? { strictFailure: `${plural(after.unplacedCopies, "copy", "copies")} could not be placed.` } : {}),
    });
  },
};
