import type { Units } from "../geometry/units.ts";
import { FORMAT_ID, FORMAT_VERSION, ProjectSchema, type Project } from "./schema.ts";

export const DEFAULT_TRIM: Readonly<Record<Units, number>> = { in: 0.25, mm: 6 };

export function createProject(name: string, units: Units): Project {
  return ProjectSchema.parse({
    format: FORMAT_ID,
    version: FORMAT_VERSION,
    project: { name, units },
    materials: [],
    stock: [],
    parts: [],
    tools: [],
    settings: { trim: 0 },
  });
}
