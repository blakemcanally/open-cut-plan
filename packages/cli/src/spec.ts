import type { Io } from "./io.ts";

export const EXIT = { ok: 0, failed: 1, usage: 2, input: 3 } as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export class CliError extends Error {
  readonly exitCode: ExitCode;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(exitCode: ExitCode, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.exitCode = exitCode;
    this.code = code;
    this.details = details;
  }
}

export function usageError(message: string, code = "usage", details: Record<string, unknown> = {}): CliError {
  return new CliError(EXIT.usage, code, message, details);
}

export interface OptionSpec {
  name: string;
  type: "string" | "boolean";
  /** The value placeholder in help, such as `<length>`. */
  value?: string;
  multiple?: boolean;
  short?: string;
  required?: boolean;
  description: string;
}

export interface ArgSpec {
  name: string;
  description: string;
  optional?: boolean;
  variadic?: boolean;
}

export interface Example {
  command: string;
  description: string;
}

export type OptionValues = Record<string, string | boolean | string[] | undefined>;

export interface Invocation {
  args: string[];
  options: OptionValues;
  json: boolean;
  io: Io;
}

export interface Outcome {
  /** Fields of the JSON envelope, after `ok` and `command`. */
  data: Record<string, unknown>;
  /** The readable result. It goes to stdout, or to stderr when `payload` takes stdout. */
  text: string;
  /** Printed to stdout in place of `text` when `--json` is not given: a project file, a CSV, an SVG, or the schema. */
  payload?: string;
  /** Set for exit code 1: the command ran and found errors. */
  error?: { code: string; message: string };
  /** Problems that do not stop the command, such as a newer file version. They go to stderr and into the envelope. */
  warnings?: string[];
}

export interface CommandSpec {
  name: string;
  summary: string;
  description: string;
  args: ArgSpec[];
  options: OptionSpec[];
  examples: Example[];
  /** The fields of the JSON result. */
  output: string;
  run(invocation: Invocation): Promise<Outcome>;
}

export interface GroupSpec {
  name: string;
  summary: string;
  commands: CommandSpec[];
}
