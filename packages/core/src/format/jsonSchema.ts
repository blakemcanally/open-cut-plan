import { z } from "zod";
import { ProjectSchema } from "./schema.ts";

export function buildJsonSchema(): Record<string, unknown> {
  return {
    ...z.toJSONSchema(ProjectSchema, { target: "draft-2020-12", io: "input" }),
    title: "OpenCutPlan project",
    description: "A sheet-goods cut plan: parts, stock, tools, settings, and an optional layout. See docs/format.md.",
  };
}
