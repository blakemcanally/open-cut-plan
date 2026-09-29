import type { Project } from "../format/schema.ts";
import { formatLength } from "../geometry/format.ts";
import { EPSILON } from "../geometry/rect.ts";
import { convertLength } from "../geometry/units.ts";
import { planWarning, type PlanIssue } from "../plan/issues.ts";
import { designErrors, designRef } from "./errors.ts";
import { designParts, generatedParts, sameParts } from "./generate.ts";
import { designGeometry, materialsById } from "./geometry.ts";
import {
  EKET,
  EKET_TOLERANCE_MM,
  isDesignMount,
  isDesignSystem,
  KALLAX,
  KALLAX_CLEARANCE_MM,
  MAX_POCKET_CHART_MM,
  SHELF_SPAN_RATIO,
} from "./systems.ts";

export function checkDesigns(project: Project): PlanIssue[] {
  const units = project.project.units;
  const mm = (value: number) => convertLength(value, "mm", units);
  const show = (value: number) => formatLength(value, units, project.settings.display);
  const materials = materialsById(project);
  const issues: PlanIssue[] = [];

  for (const design of project.designs ?? []) {
    const ref = designRef(design);
    const name = `Design "${design.name}"`;
    if (!isDesignSystem(design.system)) {
      issues.push(planWarning("design-unknown-system", `${name} uses the system "${design.system}", which this app does not know. Its parts stay as they are.`, ref));
      continue;
    }
    if (design.mount !== undefined && !isDesignMount(design.mount)) {
      issues.push(planWarning("design-unknown-mount", `${name} uses the mount "${design.mount}", which this app does not know. The hardware list leaves it out.`, ref));
    }
    const errors = designErrors(project, design);
    issues.push(...errors);
    if (errors.length > 0) continue;
    const geometry = designGeometry(design, materials)!;

    if (geometry.thickness > mm(MAX_POCKET_CHART_MM) + EPSILON) {
      issues.push(planWarning("pocket-chart", `${name} uses stock thicker than 1 1/2" (38 mm). The pocket screw chart has no screw for it.`, ref));
    }
    if (design.system === "kallax") {
      const needed = mm(KALLAX.insert.mm + KALLAX_CLEARANCE_MM);
      const smallest = Math.min(...geometry.columns, ...geometry.rows);
      if (smallest < needed - EPSILON) {
        issues.push(planWarning("kallax-opening", `${name} has a cell of ${show(smallest)}. KALLAX inserts need at least ${show(needed)}.`, ref));
      }
      const boxDepth = mm(KALLAX.boxDepth.mm);
      if (geometry.panelDepth < boxDepth - EPSILON) {
        issues.push(planWarning("kallax-depth", `${name} has panels ${show(geometry.panelDepth)} deep. KALLAX boxes need at least ${show(boxDepth)}.`, ref));
      }
    }
    if (design.system === "eket") {
      const module = mm(EKET.module.mm);
      const tolerance = mm(EKET_TOLERANCE_MM);
      const onGrid = (value: number) => Math.round(value / module) >= 1 && Math.abs(value - Math.round(value / module) * module) <= tolerance;
      const depthFits = [EKET.depth.mm, EKET.shallowDepth.mm].some((depth) => Math.abs(geometry.depth - mm(depth)) <= tolerance);
      if (!onGrid(geometry.outsideWidth) || !onGrid(geometry.outsideHeight) || !depthFits) {
        issues.push(
          planWarning(
            "eket-grid",
            `${name} is ${show(geometry.outsideWidth)} × ${show(geometry.outsideHeight)} × ${show(geometry.depth)}. EKET units are multiples of 350 mm, and 250 or 350 mm deep.`,
            ref,
          ),
        );
      }
    }
    const span = SHELF_SPAN_RATIO * geometry.thickness;
    const longest = Math.max(...geometry.columns);
    if (longest > span + EPSILON) {
      issues.push(planWarning("shelf-span", `${name} has a shelf of ${show(longest)}. A shelf longer than ${show(span)} in this stock can sag.`, ref));
    }
    if (design.mount === "wall-rail" && design.system !== "eket") {
      issues.push(planWarning("mount-system", `${name} uses the EKET wall rail, which is made for EKET units.`, ref));
    }
    const parts = designParts(project, design);
    if (parts && !sameParts(generatedParts(project, design.id), parts)) {
      issues.push(planWarning("design-stale", `The parts of design "${design.name}" do not match the design. The next change makes them again.`, ref));
    }
  }
  return issues;
}
