import type { Design, Part, Project } from "../format/schema.ts";
import { formatLength } from "../geometry/format.ts";
import { EPSILON } from "../geometry/rect.ts";
import { convertLength, type Units } from "../geometry/units.ts";
import { planError, planWarning, type PlanIssue } from "../plan/issues.ts";
import { buildCountText, type AssemblyBoard, type AssemblyStep } from "./assemblyTypes.ts";
import { COUNT_EPSILON, jigSettingText, pocketHolesPerEnd, pocketScrew, pocketScrewsText } from "./pocket.ts";
import { designRef } from "./ref.ts";
import { designGeometry, materialsById, roundLength, type DesignGeometry } from "./geometry.ts";
import { DEFAULT_DESIGN_QUANTITY, designKind, KALLAX, KALLAX_CLEARANCE_MM } from "./systems.ts";

const FRONT: AssemblyBoard = { kind: "front" };
const BACK: AssemblyBoard = { kind: "back" };
const LEFT: AssemblyBoard = { kind: "side", side: "left" };
const RIGHT: AssemblyBoard = { kind: "side", side: "right" };
const BOTTOM: AssemblyBoard = { kind: "bottom" };

export function isOpenBox(design: Design): boolean {
  return designKind(design) === "open-box";
}

/** The problems of an open-top box that a shelf design cannot have. */
export function openBoxErrors(design: Design, geometry: DesignGeometry): PlanIssue[] {
  const ref = designRef(design);
  const name = `Design "${design.name}" is an open-top box`;
  const refuse = (message: string) => planError("design-open-box", `${name}${message}`, ref);
  const issues: PlanIssue[] = [];
  if (design.back) issues.push(refuse(", so it has no back."));
  if (design.mount !== undefined && design.mount !== "floor") issues.push(refuse(", so it has no mount other than the floor."));
  if (design.corners !== undefined) issues.push(refuse(", so it has no corners setting."));
  if (design.fastener !== undefined) issues.push(refuse(", so it has no fastener setting."));
  if (geometry.combined) issues.push(refuse(", so it has no combined cells."));
  const outsideSize = (axis: Design["width"]) => "outside" in axis && axis.cells === 1;
  if (!outsideSize(design.width) || !outsideSize(design.height)) {
    issues.push(refuse(". Give its width and height as outside sizes with 1 cell."));
  }
  if (design.system === "eket") issues.push(refuse(". Use the system kallax or custom."));
  if (issues.length > 0) return issues;

  const { thickness: t, outsideWidth, outsideHeight, depth } = geometry;
  if (outsideWidth - 2 * t <= EPSILON || depth - 2 * t <= EPSILON || outsideHeight - t <= EPSILON) {
    issues.push(planError("design-too-small", `Design "${design.name}" is too small: the walls leave no room inside.`, ref));
  }
  return issues;
}

export function openBoxParts(design: Design, geometry: DesignGeometry): Part[] {
  const quantity = design.quantity ?? DEFAULT_DESIGN_QUANTITY;
  const part = (id: string, name: string, length: number, width: number, count: number): Part => ({
    id: `${design.id}-${id}`,
    name,
    material: design.material,
    length: roundLength(length),
    width: roundLength(width),
    quantity: count * quantity,
    grain: "length",
    group: design.name,
    design: design.id,
  });
  const { thickness: t, outsideWidth: w, outsideHeight: h, depth: d } = geometry;
  return [part("front", "Front", w, h, 1), part("back", "Back", w, h, 1), part("side", "Side", d - 2 * t, h, 2), part("bottom", "Bottom", w - 2 * t, d - 2 * t, 1)];
}

export interface OpenBoxHoles {
  /** Per end of a side. */
  sideEnd: number;
  /** Per front or back edge of the bottom. */
  bottomFrontBack: number;
  /** Per side edge of the bottom. */
  bottomSide: number;
  total: number;
}

/** The pocket holes of one unit: both ends of the 2 sides, and the 4 edges of the bottom. */
export function openBoxPocketHoles(geometry: DesignGeometry, units: Units): OpenBoxHoles {
  const holes = (length: number) => pocketHolesPerEnd(convertLength(length, units, "mm"));
  const { thickness: t, outsideWidth: w, outsideHeight: h, depth: d } = geometry;
  const sideEnd = holes(h);
  const bottomFrontBack = holes(w - 2 * t);
  const bottomSide = holes(d - 2 * t);
  return { sideEnd, bottomFrontBack, bottomSide, total: 4 * sideEnd + 2 * bottomFrontBack + 2 * bottomSide };
}

/** The steps to build one unit of a valid open-top box, before its finish steps. */
export function openBoxSteps(project: Project, design: Design): AssemblyStep[] {
  const geometry = designGeometry(design, materialsById(project))!;
  const units = project.project.units;
  const show = (value: number) => formatLength(value, units, project.settings.display);
  const mm = (value: number) => convertLength(value, units, "mm");
  const quantity = design.quantity ?? DEFAULT_DESIGN_QUANTITY;
  const holes = openBoxPocketHoles(geometry, units);
  const screw = pocketScrew(mm(geometry.thickness));
  const screws = pocketScrewsText(screw);
  const setting = jigSettingText(screw);
  const diagonal = roundLength(Math.hypot(geometry.outsideWidth, geometry.depth));
  return [
    {
      title: "Drill the pocket holes",
      body: `${buildCountText(quantity)}Drill ${holes.sideEnd} pocket holes in each end of the 2 sides, on the inside face of each side. Drill ${holes.bottomFrontBack} pocket holes along the front edge and the back edge of the bottom, and ${holes.bottomSide} along each side edge, on the underside. The holes are for ${show(geometry.thickness)} stock.${setting}`,
      action: "drill",
      boards: [LEFT, RIGHT, BOTTOM],
    },
    {
      title: "Join the sides to the front and the back",
      body: `Put glue on the ends of the 2 sides. Stand them between the front and the back, flush with the top edge and the bottom edge of both. Screw each side to the front and to the back through the pocket holes with ${screws}.`,
      action: "join",
      boards: [FRONT, BACK, LEFT, RIGHT],
    },
    {
      title: "Check that it is square",
      body: `Measure the two diagonals of the top opening. Both must be ${show(diagonal)}. If they are not the same, push the long diagonal in until they are.`,
      action: "square",
      boards: [],
    },
    {
      title: "Fit the bottom",
      body: `Put glue on the edges of the bottom. Set it between the walls, flush with their lower edges, with the pocket holes down. Screw it to the walls through the pocket holes with ${screws}.`,
      action: "join",
      boards: [BOTTOM],
    },
  ];
}

/** A warning for each size of an open-top box for the system kallax that is over what fits a KALLAX-style cube. */
export function kallaxFitIssues(design: Design, geometry: DesignGeometry, project: Project): PlanIssue[] {
  if (design.system !== "kallax") return [];
  const units = project.project.units;
  const show = (value: number) => formatLength(value, units, project.settings.display);
  const mm = (value: number) => convertLength(value, "mm", units);
  const { inch, mm: mmStep } = project.settings.display;
  const step = units === "mm" ? mmStep : inch === "decimal" ? 0.001 : 1 / inch;
  const opening = mm(KALLAX.opening.mm - KALLAX_CLEARANCE_MM);
  const sizes = [
    { value: geometry.outsideWidth, limit: opening, word: "wide" },
    { value: geometry.outsideHeight, limit: opening, word: "tall" },
    { value: geometry.depth, limit: mm(KALLAX.depth.mm), word: "deep" },
  ];
  const down = (value: number) => Math.round(Math.floor(value / step + COUNT_EPSILON) * step * 1e6) / 1e6;
  return sizes
    .filter(({ value, limit }) => value > limit + EPSILON)
    .map(({ value, limit, word }) => {
      const shown = Math.min(down(limit), Math.round(value / step) * step - step);
      return planWarning(
        "kallax-fit",
        `Design "${design.name}" is ${show(Math.max(value - shown, step))} too ${word} for a KALLAX-style cube: it is ${show(value)} ${word}, and the most that fits is ${show(shown)}.`,
        designRef(design),
      );
    });
}
