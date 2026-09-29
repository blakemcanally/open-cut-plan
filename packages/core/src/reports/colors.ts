import type { Project } from "../format/schema.ts";

const PALETTE = ["#9cc3e6", "#f2c27b", "#a8d5a2", "#e6a6c7", "#c7b8ea", "#f4a582", "#b8e0d2", "#e8d27a"];
export const NO_GROUP_COLOR = "#d9d4c7";
export const STAGE_COLORS = ["#c0392b", "#1a5fd0", "#7a4bb5", "#1e8449", "#b9770e"];

/** One colour per part group, in the order groups first appear in the parts list. */
export function groupColors(project: Project): Map<string, string> {
  const colors = new Map<string, string>();
  for (const part of project.parts) {
    if (part.group !== undefined && !colors.has(part.group)) colors.set(part.group, PALETTE[colors.size % PALETTE.length]!);
  }
  return colors;
}

export function stageColor(stage: number): string {
  return STAGE_COLORS[(stage - 1) % STAGE_COLORS.length]!;
}
