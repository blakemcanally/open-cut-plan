import type { Design } from "../format/schema.ts";
import type { PlanRef } from "../plan/issues.ts";

export function designRef(design: Design): PlanRef[] {
  return [{ kind: "design", design: design.id }];
}
