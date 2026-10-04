import {
  convertProjectUnits,
  DEFAULT_MIN_OFFCUT,
  FEATURE_KEYS,
  INCH_PRECISIONS,
  MAX_EXTRA_COST_PERCENT,
  MM_PRECISIONS,
  OPTIMIZER_GOALS,
  OrderModeSchema,
  UnitsSchema,
  type Project,
  type Settings,
} from "@opencutplan/core";
import { PROGRAM } from "../help.ts";
import { FILE_ARG, finishMutation, loadProject, OUTPUT_OPTIONS, warningLines } from "../project.ts";
import { usageError, type CommandSpec, type GroupSpec } from "../spec.ts";
import { len, table } from "../text.ts";
import { booleanValue, choiceValue, flag, integerValue, lengthValue, numberValue } from "../values.ts";

interface Key {
  key: string;
  values: string;
  description: string;
  get(project: Project): string | number | boolean | null;
  set?(project: Project, value: string): Project;
}

function withSettings(project: Project, change: (settings: Settings) => Settings): Project {
  return { ...project, settings: change(project.settings) };
}

function minOffcut(project: Project) {
  return project.settings.minOffcut ?? DEFAULT_MIN_OFFCUT[project.project.units];
}

const KEYS: Key[] = [
  {
    key: "name",
    values: "<text>",
    description: "The project name.",
    get: (p) => p.project.name,
    set: (p, v) => {
      if (v.trim() === "") throw usageError("The name must not be empty.", "invalid-value", { key: "name" });
      return { ...p, project: { ...p.project, name: v } };
    },
  },
  {
    key: "notes",
    values: "<text>",
    description: 'The project notes. "" removes them.',
    get: (p) => p.project.notes ?? null,
    set: (p, v) => {
      const { notes: _old, ...rest } = p.project;
      return { ...p, project: v === "" ? rest : { ...rest, notes: v } };
    },
  },
  {
    key: "units",
    values: "in|mm",
    description: "The project units. A change converts every length in the project and removes the stored cut list, as the app does.",
    get: (p) => p.project.units,
    set: (p, v) => convertProjectUnits(p, choiceValue(v, "units", UnitsSchema.options)),
  },
  {
    key: "trim",
    values: "<length>|factory",
    description: "The edge trim on every edge of each sheet. factory (or 0) uses the factory edges. A width above 0 also turns the trim feature on, as the app does. Stock can override it (stock set --trim).",
    get: (p) => p.settings.trim,
    set: (p, v) => {
      const trim = v === "factory" ? 0 : lengthValue(v, p.project.units, "trim", { allowZero: true });
      return withSettings(p, (s) => (trim > 0 ? { ...s, trim, features: { ...s.features, trim: true } } : { ...s, trim }));
    },
  },
  {
    key: "orderMode",
    values: "sheet|setup",
    description: "The cut order: sheet finishes each sheet before the next; setup groups cuts that share a tool, cut kind, and setting.",
    get: (p) => p.settings.orderMode,
    set: (p, v) => withSettings(p, (s) => ({ ...s, orderMode: choiceValue(v, "orderMode", OrderModeSchema.options) })),
  },
  {
    key: "minOffcut.length",
    values: "<length>",
    description: "The smallest useful offcut, length. Default: 12\" or 300 mm.",
    get: (p) => minOffcut(p).length,
    set: (p, v) => withSettings(p, (s) => ({ ...s, minOffcut: { ...minOffcut(p), length: lengthValue(v, p.project.units, "minOffcut.length") } })),
  },
  {
    key: "minOffcut.width",
    values: "<length>",
    description: "The smallest useful offcut, width. Default: 6\" or 150 mm.",
    get: (p) => minOffcut(p).width,
    set: (p, v) => withSettings(p, (s) => ({ ...s, minOffcut: { ...minOffcut(p), width: lengthValue(v, p.project.units, "minOffcut.width") } })),
  },
  {
    key: "minOffcut",
    values: "default",
    description: "default removes the stored minimum offcut, so the default size applies.",
    get: (p) => (p.settings.minOffcut === undefined ? "default" : "custom"),
    set: (p, v) => {
      choiceValue(v, "minOffcut", ["default"] as const);
      return withSettings(p, ({ minOffcut: _old, ...rest }) => rest);
    },
  },
  {
    key: "factoryEdge.minLength",
    values: "<length>|none",
    description:
      "Each part with a long side of at least this length asks for a long edge on a factory edge of the sheet, as parts set --factory-edge long does. The choice of a part (parts set --factory-edge) comes first. none removes the rule. Default: none.",
    get: (p) => p.settings.factoryEdge?.minLength ?? null,
    set: (p, v) =>
      withSettings(p, ({ factoryEdge: old, ...s }) => (v === "none" ? s : { ...s, factoryEdge: { ...old, minLength: lengthValue(v, p.project.units, "factoryEdge.minLength") } })),
  },
  {
    key: "display.inch",
    values: INCH_PRECISIONS.join("|"),
    description: "The rounding of inch lengths in text: to 1/8, 1/16, 1/32, or 1/64, or decimal.",
    get: (p) => p.settings.display.inch,
    set: (p, v) => {
      const inch = choiceValue(v, "display.inch", INCH_PRECISIONS);
      return withSettings(p, (s) => ({ ...s, display: { ...s.display, inch } }));
    },
  },
  {
    key: "display.mm",
    values: MM_PRECISIONS.join("|"),
    description: "The rounding of millimetre lengths in text.",
    get: (p) => p.settings.display.mm,
    set: (p, v) => {
      const mm = choiceValue(v, "display.mm", MM_PRECISIONS);
      return withSettings(p, (s) => ({ ...s, display: { ...s.display, mm } }));
    },
  },
  {
    key: "optimizer.timeLimitMs",
    values: "<ms>",
    description: "The optimizer search time in milliseconds (a whole number of 1 or more). Default: 2000.",
    get: (p) => p.settings.optimizer.timeLimitMs,
    set: (p, v) => withSettings(p, (s) => ({ ...s, optimizer: { ...s.optimizer, timeLimitMs: integerValue(v, "optimizer.timeLimitMs", 1) } })),
  },
  {
    key: "optimizer.seed",
    values: "<n>|none",
    description: "The optimizer random seed (a whole number). none removes it; the optimizer then uses 1.",
    get: (p) => p.settings.optimizer.seed ?? null,
    set: (p, v) =>
      withSettings(p, (s) => {
        const { seed: _old, ...optimizer } = s.optimizer;
        return { ...s, optimizer: v === "none" ? optimizer : { ...optimizer, seed: integerValue(v, "optimizer.seed") } };
      }),
  },
  {
    key: "optimizer.goal",
    values: OPTIMIZER_GOALS.join("|"),
    description: "What the optimizer looks for after it fits every part: the lowest cost, the best offcuts (the largest offcut first), or the fewest cut steps. Default: cost.",
    get: (p) => p.settings.optimizer.goal,
    set: (p, v) => withSettings(p, (s) => ({ ...s, optimizer: { ...s.optimizer, goal: choiceValue(v, "optimizer.goal", OPTIMIZER_GOALS) } })),
  },
  {
    key: "optimizer.extraCostPercent",
    values: "<percent>",
    description: "The most extra cost that the goal offcuts or cuts can use, in percent of the cheapest plan found (0 to 100). Default: 10.",
    get: (p) => p.settings.optimizer.extraCostPercent,
    set: (p, v) =>
      withSettings(p, (s) => ({ ...s, optimizer: { ...s.optimizer, extraCostPercent: numberValue(v, "optimizer.extraCostPercent", 0, MAX_EXTRA_COST_PERCENT) } })),
  },
  {
    key: "optimizer.keepGroupsTogether",
    values: "true|false",
    description: "Put the parts of each design unit and each part group on as few sheets as possible, at no extra cost. Default: true.",
    get: (p) => p.settings.optimizer.keepGroupsTogether,
    set: (p, v) => withSettings(p, (s) => ({ ...s, optimizer: { ...s.optimizer, keepGroupsTogether: booleanValue(v, "optimizer.keepGroupsTogether") } })),
  },
  {
    key: "currency",
    values: "<code>",
    description: "The ISO 4217 code of the stock costs, such as USD or EUR.",
    get: (p) => p.settings.currency,
    set: (p, v) => {
      if (!/^[A-Za-z]{3}$/.test(v)) throw usageError(`The currency "${v}" is not a three-letter code.`, "invalid-value", { key: "currency", value: v });
      return withSettings(p, (s) => ({ ...s, currency: v.toUpperCase() }));
    },
  },
  ...FEATURE_KEYS.map(
    (feature): Key => ({
      key: `features.${feature}`,
      values: "true|false",
      description: `The ${feature} feature switch.`,
      get: (p) => p.settings.features[feature],
      set: (p, v) => withSettings(p, (s) => ({ ...s, features: { ...s.features, [feature]: booleanValue(v, `features.${feature}`) } })),
    }),
  ),
];

function findKey(key: string): Key {
  const found = KEYS.find((candidate) => candidate.key === key);
  if (!found) throw usageError(`Unknown setting "${key}". Settings: ${KEYS.map((k) => k.key).join(", ")}.`, "unknown-setting", { key, known: KEYS.map((k) => k.key) });
  return found;
}

function values(project: Project): Record<string, string | number | boolean | null> {
  return Object.fromEntries(KEYS.map((key) => [key.key, key.get(project)]));
}

function show(project: Project, key: Key): string {
  const value = key.get(project);
  const lengthKeys = ["trim", "minOffcut.length", "minOffcut.width", "factoryEdge.minLength"];
  return typeof value === "number" && lengthKeys.includes(key.key) ? `${value} (${len(project, value)})` : String(value);
}

const KEY_TABLE = KEYS.map((key) => `${key.key} (${key.values}): ${key.description}`).join(" ");

const get: CommandSpec = {
  name: "settings get",
  summary: "Show the settings, or one setting.",
  description: `Show every setting, or one setting, with the value that applies (defaults included). Keys: ${KEY_TABLE}`,
  args: [FILE_ARG, { name: "key", description: "A setting key, such as trim or features.grain.", optional: true }],
  options: [],
  examples: [
    { command: `${PROGRAM} settings get shelf.cutplan.json`, description: "Show every setting." },
    { command: `${PROGRAM} settings get shelf.cutplan.json trim --json`, description: "Show the trim." },
  ],
  output: "Without a key: units, settings { key: value } for every key. With a key: key, value.",
  async run({ args, io }) {
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const warnings = warningLines(loaded);
    if (args[1] !== undefined) {
      const key = findKey(args[1]);
      return { data: { key: key.key, value: key.get(project) }, text: show(project, key), warnings };
    }
    return { data: { units: project.project.units, settings: values(project) }, text: table(["key", "value"], KEYS.map((key) => [key.key, show(project, key)])), warnings };
  },
};

const set: CommandSpec = {
  name: "settings set",
  summary: "Change one or more settings.",
  description: `Change settings. Give one or more key and value pairs; they apply in order, so a length after "units" is read in the new units. Keys: ${KEY_TABLE}`,
  args: [FILE_ARG, { name: "key", description: "A setting key.", optional: true }, { name: "value", description: "The new value. More key and value pairs can follow.", optional: true, variadic: true }],
  options: [{ name: "factory-edges", type: "boolean", description: "The same as the pair trim factory." }, ...OUTPUT_OPTIONS],
  examples: [
    { command: `${PROGRAM} settings set shelf.cutplan.json trim 1/4`, description: "Trim 1/4\" off every sheet edge." },
    { command: `${PROGRAM} settings set shelf.cutplan.json --factory-edges`, description: "Use the factory edges (no trim)." },
    { command: `${PROGRAM} settings set shelf.cutplan.json units mm display.mm 1 optimizer.seed 7`, description: "Convert to millimetres, round to 1 mm, and fix the seed." },
    { command: `${PROGRAM} settings set shelf.cutplan.json features.cost false`, description: "Turn the cost feature off." },
  ],
  output: "settings { key: value } after the change, changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, options, io } = invocation;
    const pairs = args.slice(1);
    if (flag(options, "factory-edges")) pairs.push("trim", "factory");
    if (pairs.length === 0) throw usageError("Give a key and a value, such as: trim 1/4.", "missing-argument");
    if (pairs.length % 2 !== 0) throw usageError(`The key "${pairs.at(-1)}" has no value.`, "missing-argument", { key: pairs.at(-1) });
    const loaded = await loadProject(io, args[0]!);
    let next = loaded.project;
    const keys: string[] = [];
    for (let i = 0; i < pairs.length; i += 2) {
      const key = findKey(pairs[i]!);
      if (!key.set) throw usageError(`The setting ${key.key} cannot be changed.`, "invalid-value", { key: key.key });
      next = key.set(next, pairs[i + 1]!);
      keys.push(`${key.key} = ${show(next, key)}`);
    }
    return finishMutation(invocation, loaded, next, { summary: `Set ${keys.join(", ")}.`, data: { settings: values(next) } });
  },
};

export const settingsGroup: GroupSpec = { name: "settings", summary: "Project settings", commands: [get, set] };
