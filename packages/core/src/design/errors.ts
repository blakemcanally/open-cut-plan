import { MAX_PART_QUANTITY, type Design, type Project } from "../format/schema.ts";
import { EPSILON } from "../geometry/rect.ts";
import { convertLength } from "../geometry/units.ts";
import { planError, type PlanIssue, type PlanRef } from "../plan/issues.ts";
import { designGeometry, materialsById } from "./geometry.ts";
import { buildDesignParts } from "./parts.ts";
import { MIN_POCKET_THICKNESS_MM } from "./systems.ts";

export function designRef(design: Design): PlanRef[] {
  return [{ kind: "design", design: design.id }];
}

/** The problems that stop a design from making parts. */
export function designErrors(project: Project, design: Design): PlanIssue[] {
  const ref = designRef(design);
  const materials = materialsById(project);
  const issues: PlanIssue[] = [];
  for (const material of [design.material, design.back?.material]) {
    if (material !== undefined && !materials.has(material)) {
      issues.push(planError("bad-ref", `Design "${design.name}" uses material "${material}", which does not exist.`, ref));
    }
  }
  const geometry = designGeometry(design, materials);
  if (!geometry) return issues;

  if (geometry.thickness < convertLength(MIN_POCKET_THICKNESS_MM, "mm", project.project.units) - EPSILON) {
    issues.push(
      planError("pocket-thickness", `Design "${design.name}" uses stock that is too thin for pocket screws. Use stock that is 15/32" (11.9 mm) thick or more.`, ref),
    );
  }
  if ([...geometry.columns, ...geometry.rows].some((opening) => opening <= EPSILON) || geometry.panelDepth <= EPSILON) {
    issues.push(planError("design-too-small", `Design "${design.name}" is too small: the panels leave no room for the cells.`, ref));
    return issues;
  }

  const parts = buildDesignParts(design, geometry);
  if (parts.some((part) => part.quantity > MAX_PART_QUANTITY)) {
    issues.push(
      planError("design-too-large", `Design "${design.name}" needs more than ${MAX_PART_QUANTITY} copies of one part. Use fewer cells or a lower quantity.`, ref),
    );
  }
  const ids = new Set(parts.map((part) => part.id));
  for (const part of project.parts) {
    if (!ids.has(part.id) || part.design === design.id) continue;
    issues.push(
      planError("design-conflict", `Part "${part.name}" already uses the id "${part.id}". Change the id of design "${design.name}".`, [
        ...ref,
        { kind: "part", part: part.id, copy: 0 },
      ]),
    );
  }
  return issues;
}
