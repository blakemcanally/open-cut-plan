import { parseLength, type Units } from "@opencutplan/core";
import { usageError, type OptionSpec, type OptionValues } from "./spec.ts";

export function str(options: OptionValues, name: string): string | undefined {
  const value = options[name];
  return typeof value === "string" ? value : undefined;
}

export function flag(options: OptionValues, name: string): boolean {
  return options[name] === true;
}

export function list(options: OptionValues, name: string): string[] {
  const value = options[name];
  return Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
}

function invalid(name: string, text: string, expected: string) {
  return usageError(`--${name} "${text}" is not ${expected}.`, "invalid-value", { option: name, value: text });
}

export interface LengthRules {
  allowZero?: boolean;
}

export function lengthValue(text: string, units: Units, name: string, rules: LengthRules = {}): number {
  const value = parseLength(text, units);
  if (value === null || !Number.isFinite(value) || value < 0 || (value === 0 && !rules.allowZero)) {
    throw invalid(name, text, rules.allowZero ? "a length of 0 or more" : "a length greater than 0");
  }
  return value;
}

export function optionalLength(options: OptionValues, name: string, units: Units, rules: LengthRules = {}): number | undefined {
  const text = str(options, name);
  return text === undefined ? undefined : lengthValue(text, units, name, rules);
}

export function integerValue(text: string, name: string, minimum = Number.NEGATIVE_INFINITY): number {
  const value = /^-?\d+$/.test(text.trim()) ? Number(text) : Number.NaN;
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw invalid(name, text, minimum === 1 ? "a whole number of 1 or more" : minimum === 0 ? "a whole number of 0 or more" : "a whole number");
  }
  return value;
}

export function numberValue(text: string, name: string, minimum = 0): number {
  const value = /^\d+(?:\.\d+)?$|^\.\d+$/.test(text.trim()) ? Number(text) : Number.NaN;
  if (!Number.isFinite(value) || value < minimum) throw invalid(name, text, `a number of ${minimum} or more`);
  return value;
}

export function booleanValue(text: string, name: string): boolean {
  if (text === "true") return true;
  if (text === "false") return false;
  throw invalid(name, text, "true or false");
}

export function optionalBoolean(options: OptionValues, name: string): boolean | undefined {
  const text = str(options, name);
  return text === undefined ? undefined : booleanValue(text, name);
}

export function choiceValue<T extends string>(text: string, name: string, choices: readonly T[]): T {
  if ((choices as readonly string[]).includes(text)) return text as T;
  throw invalid(name, text, `one of ${choices.join(", ")}`);
}

export function optionalChoice<T extends string>(options: OptionValues, name: string, choices: readonly T[]): T | undefined {
  const text = str(options, name);
  return text === undefined ? undefined : choiceValue(text, name, choices);
}

export function required(options: OptionValues, spec: readonly OptionSpec[]): void {
  for (const option of spec) {
    if (option.required && options[option.name] === undefined) throw usageError(`--${option.name} is required.`, "missing-option", { option: option.name });
  }
}
