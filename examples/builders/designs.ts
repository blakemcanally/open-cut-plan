import { parseProject, regenerateDesigns, type ProjectInput } from "../../packages/core/src/index.ts";

export function withDesignParts(input: ProjectInput): ProjectInput {
  const result = parseProject(input);
  if (!result.ok) throw new Error(result.errors.map((issue) => issue.message).join("; "));
  return regenerateDesigns(result.project);
}
