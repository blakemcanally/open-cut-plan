import { errorMessage, FORMAT_VERSION } from "@opencutplan/core";
import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import { COMMANDS, GROUPS } from "./commands/index.ts";
import { commandHelp, commandJson, COMMON_OPTIONS, groupHelp, mainHelp, PROGRAM } from "./help.ts";
import type { Io } from "./io.ts";
import { CliError, EXIT, usageError, type CommandSpec, type ExitCode, type GroupSpec, type OptionValues, type Outcome } from "./spec.ts";
import { required } from "./values.ts";

export const CLI_VERSION = "0.1.0";

const LEADING_FLAGS = new Set(["--json", "--help", "-h", "--version"]);

const versionCommand: CommandSpec = {
  name: "version",
  summary: "Print the CLI version and the file format version it writes.",
  description: "Print the version of this tool and the OpenCutPlan file format version that it reads and writes.",
  args: [],
  options: [],
  examples: [{ command: `${PROGRAM} version --json`, description: "Get the versions as JSON." }],
  output: 'version (the CLI version) and format (the file format version, "MAJOR.MINOR").',
  run: async () => ({ data: { version: CLI_VERSION, format: FORMAT_VERSION }, text: `${PROGRAM} ${CLI_VERSION} (file format ${FORMAT_VERSION})` }),
};

const helpCommand: CommandSpec = {
  name: "help",
  summary: "Show help for all commands, a group, or one command.",
  description:
    "Show help. With no command, list every command and the conventions. With a group (such as parts) or a command (such as parts add), show its arguments, options, output, and examples. With --json, print the same information as JSON.",
  args: [{ name: "command", description: "A command or a group, such as optimize, parts, or parts add.", optional: true, variadic: true }],
  options: [],
  examples: [
    { command: `${PROGRAM} help parts add`, description: "Show the options of parts add." },
    { command: `${PROGRAM} help --json`, description: "Get every command, argument, and option as JSON." },
  ],
  output: "Without a command: commands (a list of command descriptions). With a command: command (its name, summary, description, usage, args, options, output, and examples). With a group: group and commands.",
  run: async ({ args }) => helpFor(args),
};

const TOP: CommandSpec[] = [...COMMANDS, helpCommand, versionCommand];

function allCommands(): CommandSpec[] {
  return [...TOP, ...GROUPS.flatMap((group) => group.commands)];
}

function findGroup(name: string): GroupSpec | undefined {
  return GROUPS.find((group) => group.name === name);
}

function unknownCommand(words: readonly string[]): CliError {
  const text = words.join(" ");
  return usageError(`Unknown command "${text}". Run '${PROGRAM} help' for the list of commands.`, "unknown-command", { command: text });
}

function helpFor(words: readonly string[]): Outcome {
  if (words.length === 0) {
    return { data: { commands: allCommands().map(commandJson) }, text: mainHelp(TOP, GROUPS).trimEnd() };
  }
  const group = findGroup(words[0]!);
  if (group && words.length === 1) {
    return { data: { group: group.name, summary: group.summary, commands: group.commands.map(commandJson) }, text: groupHelp(group).trimEnd() };
  }
  const spec = allCommands().find((command) => command.name === words.join(" "));
  if (!spec) throw unknownCommand(words);
  return { data: { command: commandJson(spec) }, text: commandHelp(spec).trimEnd() };
}

interface Resolved {
  spec: CommandSpec | null;
  group: GroupSpec | null;
  rest: string[];
}

function resolve(argv: readonly string[]): Resolved {
  const rest = [...argv];
  const take = (): string | undefined => {
    const index = rest.findIndex((token) => !LEADING_FLAGS.has(token));
    if (index < 0 || rest[index]!.startsWith("-")) return undefined;
    return rest.splice(index, 1)[0];
  };
  const first = take();
  if (first === undefined) return { spec: null, group: null, rest };
  const group = findGroup(first);
  if (group) {
    const second = take();
    if (second === undefined) return { spec: null, group, rest };
    const spec = group.commands.find((command) => command.name === `${group.name} ${second}`);
    if (!spec) throw unknownCommand([first, second]);
    return { spec, group, rest };
  }
  const spec = TOP.find((command) => command.name === first);
  if (!spec) throw unknownCommand([first]);
  return { spec, group: null, rest };
}

function parseConfig(spec: CommandSpec): ParseArgsOptionsConfig {
  const config: ParseArgsOptionsConfig = {};
  for (const option of [...spec.options, ...COMMON_OPTIONS]) {
    config[option.name] = { type: option.type, ...(option.short ? { short: option.short } : {}), ...(option.multiple ? { multiple: true } : {}) };
  }
  return config;
}

function parse(spec: CommandSpec, tokens: string[]) {
  try {
    return parseArgs({ args: tokens, options: parseConfig(spec), allowPositionals: true, strict: true });
  } catch (error) {
    const message = errorMessage(error).replace(/\s+To specify a positional argument.*$/s, "");
    throw usageError(`${message} Run '${PROGRAM} help ${spec.name}' for the options.`, "bad-option");
  }
}

function checkArgs(spec: CommandSpec, positionals: readonly string[]): void {
  const min = spec.args.filter((arg) => !arg.optional).length;
  const variadic = spec.args.some((arg) => arg.variadic);
  const max = variadic ? Number.POSITIVE_INFINITY : spec.args.length;
  if (positionals.length < min) {
    const missing = spec.args.slice(positionals.length).find((arg) => !arg.optional)!;
    throw usageError(`Missing <${missing.name}>. Usage: ${commandHelp(spec).split("\n")[0]!.replace("Usage: ", "")}`, "missing-argument", { argument: missing.name });
  }
  if (positionals.length > max) {
    throw usageError(`Too many arguments: ${positionals.slice(max).join(" ")}. Run '${PROGRAM} help ${spec.name}' for the usage.`, "extra-argument");
  }
}

function emit(io: Io, json: boolean, command: string, outcome: Outcome): ExitCode {
  const warnings = outcome.warnings ?? [];
  for (const warning of warnings) io.stderr(`${warning}\n`);
  if (json) {
    const envelope = {
      ok: outcome.error === undefined,
      command,
      ...(outcome.error ? { error: outcome.error } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
      ...outcome.data,
    };
    io.stdout(`${JSON.stringify(envelope, null, 2)}\n`);
  } else if (outcome.payload !== undefined) {
    io.stdout(outcome.payload);
    if (outcome.text !== "") io.stderr(`${outcome.text}\n`);
  } else if (outcome.text !== "") {
    io.stdout(`${outcome.text}\n`);
  }
  if (outcome.error && !json) io.stderr(`error: ${outcome.error.message}\n`);
  return outcome.error ? EXIT.failed : EXIT.ok;
}

function emitError(io: Io, json: boolean, command: string | null, error: CliError): ExitCode {
  if (json) {
    io.stdout(`${JSON.stringify({ ok: false, command, error: { code: error.code, message: error.message, ...error.details } }, null, 2)}\n`);
  } else {
    io.stderr(`error: ${error.message}\n`);
  }
  return error.exitCode;
}

/** Runs one command line. `argv` excludes the node and script paths. Returns the exit code. */
export async function run(argv: readonly string[], io: Io): Promise<ExitCode> {
  const json = argv.includes("--json");
  const wantsHelp = argv.includes("--help") || argv.includes("-h");
  let command: string | null = null;
  try {
    const { spec, group, rest } = resolve(argv);
    if (!spec) {
      if (group) {
        if (wantsHelp) return emit(io, json, "help", helpFor([group.name]));
        throw usageError(`Missing a ${group.name} command: ${group.commands.map((c) => c.name.split(" ")[1]).join(", ")}. Run '${PROGRAM} help ${group.name}'.`, "missing-command");
      }
      if (argv.includes("--version")) return emit(io, json, "version", await versionCommand.run({ args: [], options: {}, json, io }));
      if (wantsHelp) return emit(io, json, "help", helpFor([]));
      if (!json) io.stderr(mainHelp(TOP, GROUPS));
      throw usageError(`Missing a command. Run '${PROGRAM} help' for the list of commands.`, "missing-command");
    }
    command = spec.name;
    if (wantsHelp && spec !== helpCommand) return emit(io, json, "help", helpFor(spec.name.split(" ")));
    const { values, positionals } = parse(spec, rest);
    checkArgs(spec, positionals);
    const { json: _json, help: _help, ...options } = values as OptionValues;
    required(options, spec.options);
    const outcome = await spec.run({ args: positionals, options, json, io });
    return emit(io, json, spec.name, outcome);
  } catch (error) {
    if (error instanceof CliError) return emitError(io, json, command, error);
    return emitError(io, json, command, new CliError(EXIT.failed, "internal-error", `Unexpected error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`));
  }
}
