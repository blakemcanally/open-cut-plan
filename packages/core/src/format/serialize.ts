import { parseProject } from "./parse.ts";
import type { Project } from "./schema.ts";

export function serializeProject(project: Project): string {
  return `${JSON.stringify(project, null, 2)}\n`;
}

/** Like serializeProject, but throws when the text would not load again, for example when JSON writes a non-finite number as null. */
export function serializeProjectChecked(project: Project): string {
  const text = serializeProject(project);
  const result = parseProject(text);
  if (!result.ok) throw new Error(`The project cannot be saved: ${result.errors.map((issue) => issue.message).join(" ")}`);
  return text;
}
