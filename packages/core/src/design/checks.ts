import { nominalThickness } from "../catalog/nominal.ts";
import type { Design, Project } from "../format/schema.ts";
import { formatExactLength, formatLength } from "../geometry/format.ts";
import { fromNm, toNm } from "../geometry/precision.ts";
import { EPSILON } from "../geometry/rect.ts";
import { convertLength } from "../geometry/units.ts";
import { planWarning, type PlanIssue } from "../plan/issues.ts";
import { designErrors, designRef } from "./errors.ts";
import { designParts, generatedParts, sameParts } from "./generate.ts";
import { designGeometry, materialsById } from "./geometry.ts";
import { freeSpans } from "./layout.ts";
import { isOpenBox, kallaxFitIssues } from "./openBox.ts";
import { shelfName } from "./parts.ts";
import {
  EKET,
  designCorners,
  designFastener,
  designKind,
  EKET_TOLERANCE_MM,
  isDesignCorners,
  isDesignFastener,
  isDesignKind,
  isDesignMount,
  isDesignSystem,
  KALLAX,
  KALLAX_CLEARANCE_MM,
  MAX_POCKET_CHART_MM,
  SHELF_SPAN_RATIO,
} from "./systems.ts";

const LIFTED = { legs: "stands on legs", feet: "stands on feet", "wall-rail": "hangs on the wall rail" } as const;

function staleWarnings(project: Project, design: Design): PlanIssue[] {
  const parts = designParts(project, design);
  if (!parts || sameParts(generatedParts(project, design.id), parts)) return [];
  return [planWarning("design-stale", `The parts of design "${design.name}" do not match the design. The next change makes them again.`, designRef(design))];
}

export function checkDesigns(project: Project, options: { keepHidden?: boolean } = {}): PlanIssue[] {
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
    if (!isDesignKind(designKind(design))) {
      issues.push(planWarning("design-unknown-kind", `${name} has the kind "${designKind(design)}", which this app does not know. Its parts stay as they are.`, ref));
      continue;
    }
    if (!isDesignCorners(designCorners(design))) {
      issues.push(planWarning("design-unknown-corners", `${name} has the corners "${designCorners(design)}", which this app does not know. Its parts stay as they are.`, ref));
      continue;
    }
    if (!isDesignFastener(designFastener(design))) {
      issues.push(planWarning("design-unknown-fastener", `${name} uses the fastener "${designFastener(design)}", which this app does not know. Its parts stay as they are.`, ref));
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
    const exact = (value: number) => formatExactLength(value, units);
    const error = (a: number, b: number, panels: number) => fromNm(Math.abs(toNm(a, units) - toNm(b, units)) * panels, units);
    const advice = "Measure the stock, or pick its thickness on the Stock tab.";
    const boxNominal = nominalThickness(project, design.material);
    if (boxNominal) {
      const across = geometry.rows.length > geometry.columns.length ? "height" : "width";
      const panels = (across === "height" ? geometry.rows.length : geometry.columns.length) + 1;
      issues.push(
        planWarning(
          "nominal-thickness",
          `${name} uses ${materials.get(design.material)!.name} at ${exact(geometry.thickness)}, a nominal thickness. If the stock is ${exact(boxNominal.likely[0]!)}, the error across the ${across} adds up to ${exact(error(geometry.thickness, boxNominal.likely[0]!, panels))}. ${advice}`,
          ref,
        ),
      );
    }
    if (isOpenBox(design)) {
      issues.push(...kallaxFitIssues(design, geometry, project), ...staleWarnings(project, design));
      continue;
    }
    const backMaterial = design.back ? materials.get(design.back.material) : undefined;
    const backNominal = backMaterial ? nominalThickness(project, backMaterial.id) : null;
    if (backMaterial && backNominal) {
      issues.push(
        planWarning(
          "nominal-thickness",
          `${name} has a back of ${backMaterial.name} at ${exact(backMaterial.thickness)}, a nominal thickness. If the stock is ${exact(backNominal.likely[0]!)}, the depth of the box is off by ${exact(error(backMaterial.thickness, backNominal.likely[0]!, 1))}. ${advice}`,
          ref,
        ),
      );
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
    const longest = freeSpans(geometry, { mount: design.mount }).reduce((worst, next) => (next.span > worst.span + EPSILON ? next : worst));
    if (longest.span > span + EPSILON) {
      if (longest.board === "bottom") {
        const back = !design.back && freeSpans(geometry, { mount: design.mount, back: true }).every((free) => free.board !== "bottom" || free.span <= span + EPSILON);
        issues.push(
          planWarning(
            "shelf-span",
            `${name} ${LIFTED[design.mount as keyof typeof LIFTED]}, so the floor does not hold the bottom. The bottom spans ${show(longest.span)} between two supports. A board longer than ${show(span)} in this stock can sag.${
              back ? " A back holds each divider in place, so that the dividers can hold up the bottom." : ""
            }`,
            ref,
          ),
        );
      } else {
        const what = !geometry.combined
          ? `a shelf of ${show(longest.span)}.`
          : `${longest.board === "top" ? "a top" : `a shelf (${shelfName(longest.board, geometry.columns)})`} that spans ${show(longest.span)} with no support under it.`;
        issues.push(planWarning("shelf-span", `${name} has ${what} A shelf longer than ${show(span)} in this stock can sag.`, ref));
      }
    }
    if (design.mount === "wall-rail" && design.system !== "eket") {
      issues.push(planWarning("mount-system", `${name} uses the EKET wall rail, which is made for EKET units.`, ref));
    }
    issues.push(...staleWarnings(project, design));
  }
  return options.keepHidden ? issues : withoutHidden(project, issues);
}

function withoutHidden(project: Project, issues: PlanIssue[]): PlanIssue[] {
  const hidden = new Map((project.designs ?? []).filter((design) => design.hiddenWarnings?.length).map((design) => [design.id, new Set(design.hiddenWarnings)]));
  if (hidden.size === 0) return issues;
  return issues.filter((issue) => {
    if (issue.severity === "error") return true;
    return !issue.refs.some((ref) => ref.kind === "design" && hidden.get(ref.design)?.has(issue.code));
  });
}
