import { LIMIT_WORDS, toolLimit, type Step, type Tool } from "@opencutplan/core";

/** The text of a tool in the tool list of a cut, for example "Track saw (recommended)" or "Table saw (over its largest piece)". */
export function toolOption(step: Step, tool: Tool, limits: boolean): string {
  if (tool.id === step.recommended?.id) return `${tool.name} (recommended)`;
  const limit = toolLimit(tool, { ...step, length: step.to - step.from }, limits);
  if (limit === "crosscutOnly") return `${tool.name} (${LIMIT_WORDS[limit]})`;
  return limit ? `${tool.name} (over its ${LIMIT_WORDS[limit]})` : tool.name;
}
