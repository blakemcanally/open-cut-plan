import type { ArgSpec, CommandSpec, GroupSpec, OptionSpec } from "./spec.ts";

export const PROGRAM = "opencutplan";

export const COMMON_OPTIONS: OptionSpec[] = [
  { name: "json", type: "boolean", description: 'Print one JSON document to stdout: { "ok": true, ... } or { "ok": false, "error": { "code", "message" } }.' },
  { name: "help", short: "h", type: "boolean", description: "Show this help." },
];

function argText(arg: ArgSpec): string {
  const name = `<${arg.name}>${arg.variadic ? "..." : ""}`;
  return arg.optional ? `[${name}]` : name;
}

function optionName(option: OptionSpec): string {
  const long = `--${option.name}${option.type === "string" ? ` ${option.value ?? "<value>"}` : ""}`;
  return option.short ? `-${option.short}, ${long}` : long;
}

export function usageLine(spec: CommandSpec): string {
  const required = spec.options.filter((option) => option.required).map(optionName);
  const hasOptional = spec.options.some((option) => !option.required);
  return [PROGRAM, spec.name, ...spec.args.map(argText), ...required, ...(hasOptional ? ["[options]"] : [])].join(" ");
}

function wrap(text: string, width: number, indent: string): string {
  const words = text.split(/\s+/).filter((word) => word !== "");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line !== "" && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line === "" ? word : `${line} ${word}`;
    }
  }
  if (line !== "") lines.push(line);
  return lines.join(`\n${indent}`);
}

function rows(entries: readonly [string, string][]): string[] {
  const column = Math.min(34, Math.max(...entries.map(([name]) => name.length)) + 2);
  const indent = " ".repeat(column + 2);
  return entries.map(([name, text]) => {
    const head = `  ${name}`;
    const body = wrap(text, 76, indent);
    return head.length + 2 > column + 2 ? `${head}\n${indent}${body}` : `${head.padEnd(column + 2)}${body}`;
  });
}

export function commandHelp(spec: CommandSpec): string {
  const out = [`Usage: ${usageLine(spec)}`, "", wrap(spec.description, 110, "")];
  if (spec.args.length > 0) {
    out.push("", "Arguments:", ...rows(spec.args.map((arg) => [argText(arg), arg.description])));
  }
  const options = [...spec.options, ...COMMON_OPTIONS];
  out.push("", "Options:", ...rows(options.map((option) => [optionName(option), `${option.required ? "(required) " : ""}${option.multiple ? "(repeatable) " : ""}${option.description}`])));
  out.push("", "Output (--json):", `  ${wrap(spec.output, 108, "  ")}`);
  out.push("", "Examples:");
  for (const example of spec.examples) out.push(`  # ${example.description}`, `  ${example.command}`);
  return `${out.join("\n")}\n`;
}

export function groupHelp(group: GroupSpec): string {
  const out = [`Usage: ${PROGRAM} ${group.name} <command> ...`, "", group.summary, "", "Commands:"];
  out.push(...rows(group.commands.map((spec) => [spec.name, spec.summary])));
  out.push("", `Run '${PROGRAM} help ${group.name} <command>' for the options and examples of a command.`);
  return `${out.join("\n")}\n`;
}

export function mainHelp(commands: readonly CommandSpec[], groups: readonly GroupSpec[]): string {
  const out = [
    `Usage: ${PROGRAM} <command> [arguments] [options]`,
    "",
    "OpenCutPlan on the command line: create, edit, check, optimize, and report on .cutplan.json project files.",
    "",
    "Commands:",
    ...rows(commands.map((spec) => [spec.name, spec.summary])),
  ];
  for (const group of groups) out.push("", `${group.summary}:`, ...rows(group.commands.map((spec) => [spec.name, spec.summary])));
  out.push(
    "",
    "Conventions:",
    "  <file> is a .cutplan.json path, or - to read the project from standard input.",
    "  Lengths are in the project units. They accept what the app accepts: 30, 30.5, \"30 1/2\", 30-1/2, '30\"', 2'6, 762mm, 45.7cm.",
    "  Ids are the ids in the file. New ids come from the name, as in the app (\"Side panel\" -> side-panel, side-panel-2).",
    "  Commands that change the project write the file in place (atomically). Use --out <path|-> to write elsewhere,",
    "  --dry-run to write nothing, and --strict to refuse a result that has errors.",
    "  --json prints one JSON document to stdout. Warnings go to stderr.",
    "",
    "Exit codes:",
    "  0  success",
    "  1  the command ran and found errors (validation errors, a failed --strict check, a refused edit)",
    "  2  usage error (unknown command or option, a bad value, an unknown id)",
    "  3  the input file cannot be read, or it is not a readable OpenCutPlan project",
    "",
    `Run '${PROGRAM} help <command>' or '${PROGRAM} <command> --help' for details.`,
    `Run '${PROGRAM} help --json' for every command, argument, and option as JSON.`,
  );
  return `${out.join("\n")}\n`;
}

export function commandJson(spec: CommandSpec): Record<string, unknown> {
  return {
    name: spec.name,
    summary: spec.summary,
    description: spec.description,
    usage: usageLine(spec),
    args: spec.args.map((arg) => ({ name: arg.name, description: arg.description, optional: arg.optional === true, variadic: arg.variadic === true })),
    options: [...spec.options, ...COMMON_OPTIONS].map((option) => ({
      name: `--${option.name}`,
      ...(option.short ? { short: `-${option.short}` } : {}),
      type: option.type,
      ...(option.value ? { value: option.value } : {}),
      required: option.required === true,
      multiple: option.multiple === true,
      description: option.description,
    })),
    output: spec.output,
    examples: spec.examples,
  };
}
