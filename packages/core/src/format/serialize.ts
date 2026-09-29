import type { Project } from "./schema.ts";

export function serializeProject(project: Project): string {
  return `${JSON.stringify(project, null, 2)}\n`;
}
