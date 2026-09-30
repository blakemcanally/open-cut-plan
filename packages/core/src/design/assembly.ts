import { formatLength } from "../geometry/format.ts";
import { convertLength } from "../geometry/units.ts";
import type { Project } from "../format/schema.ts";
import { designParts } from "./generate.ts";
import { designGeometry, materialsById, roundLength } from "./geometry.ts";
import { backScrewCount, backScrewName, pocketHolesPerEnd, pocketScrew, railsFor } from "./hardware.ts";
import { IKEA_FEET, IKEA_LEGS, IKEA_RAIL_35, IKEA_RAIL_70, RAIL_CLEARANCE_MM } from "./ikea.ts";
import { DEFAULT_DESIGN_MOUNT, DEFAULT_DESIGN_QUANTITY, isDesignMount } from "./systems.ts";

export interface AssemblyStep {
  title: string;
  body: string;
}

function joinList(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** The steps to build one unit of a design, or null when the design does not exist or cannot make parts. */
export function assemblySteps(project: Project, designId: string): AssemblyStep[] | null {
  const design = project.designs?.find((candidate) => candidate.id === designId);
  if (!design || designParts(project, design) === null) return null;
  const geometry = designGeometry(design, materialsById(project))!;
  const units = project.project.units;
  const show = (value: number) => formatLength(value, units, project.settings.display);
  const mm = (value: number) => convertLength(value, units, "mm");
  const fromMm = (value: number) => convertLength(value, "mm", units);
  const quantity = design.quantity ?? DEFAULT_DESIGN_QUANTITY;
  const mount = design.mount ?? DEFAULT_DESIGN_MOUNT;
  const { thickness, columns, rows } = geometry;
  const lines = rows.length + 1;
  const pieces = columns.length * lines;
  const screw = pocketScrew(mm(thickness));
  const screws = screw ? `${screw.screw} coarse-thread pocket screws` : "pocket screws (the chart has no length for this stock)";
  const steps: AssemblyStep[] = [];

  const setting = screw ? ` Set the jig and the drill collar to the ${formatLength(screw.setting, "in", { inch: 8, mm: 1 })} mark.` : "";
  steps.push({
    title: "Drill the pocket holes",
    body: `${quantity > 1 ? `Build ${quantity} of these. The numbers in these steps are for one unit. ` : ""}Drill ${pocketHolesPerEnd(mm(geometry.panelDepth))} pocket holes in each end of ${pieces === 1 ? "the shelf" : `all ${pieces} shelves`}, on the underside, for ${show(thickness)} stock.${setting}`,
  });

  const marks = [0];
  for (let row = rows.length - 1; row >= 0; row--) marks.push(roundLength(marks.at(-1)! + thickness + rows[row]!));
  steps.push({ title: "Mark the shelf positions", body: `Mark the underside of each shelf on the vertical panels at ${joinList(marks.map(show))} from the bottom end.` });

  const spacers = [...new Set(rows)].map((opening) => `2 spacers to ${show(opening)}`);
  steps.push({ title: "Cut spacers", body: `Cut ${joinList(spacers)} from an offcut. They hold each shelf on its mark while you drive the screws.` });

  columns.forEach((opening, index) => {
    const start = index === 0 ? "Lay the first vertical panel on its side, with the marks up." : `Use the right panel of column ${index} as the left panel.`;
    steps.push({
      title: `Assemble column ${index + 1} of ${columns.length}`,
      body: `${start} Put the ${lines} shelves of this column (${show(opening)} long) on their marks, with the pocket holes down, and screw them to the panel with ${screws}. Then put the next vertical panel on the other ends of the shelves, and screw it on.`,
    });
  });

  const diagonal = roundLength(Math.hypot(geometry.outsideWidth, geometry.outsideHeight));
  steps.push({ title: "Check that it is square", body: `Measure the two diagonals of the front. Both must be ${show(diagonal)}. If they are not the same, push the long diagonal in until they are.` });

  if (design.back) {
    steps.push({
      title: "Fit the back",
      body: `Glue the back to the rear edges, then screw it on with ${backScrewCount(geometry, units)} ${backScrewName(mm(geometry.backThickness))}: ${show(fromMm(25))} from the ends of each edge, and at most ${show(fromMm(150))} apart.`,
    });
  }

  if (!isDesignMount(mount)) return steps;
  if (mount === "legs") {
    const guides = IKEA_LEGS.filter((legs) => legs.guide !== undefined).map((legs) => `${legs.guide} (${legs.name})`);
    steps.push({ title: "Fit the legs", body: `Screw the 4 EKET legs to the bottom panel, as the IKEA assembly guide of your legs shows: ${joinList(guides)}.` });
  }
  if (mount === "feet") steps.push({ title: "Fit the feet", body: `Screw the 4 EKET adjustable feet to the bottom panel, as IKEA assembly guide ${IKEA_FEET.guide} shows.` });
  if (mount === "wall-rail") {
    const rails = railsFor(mm(geometry.outsideWidth));
    const names = [...(rails.long > 0 ? [`${rails.long} × ${IKEA_RAIL_70.name}`] : []), ...(rails.short > 0 ? [`${rails.short} × ${IKEA_RAIL_35.name}`] : [])];
    steps.push({
      title: "Hang the unit",
      body: `Screw the rails (${joinList(names)}) to the wall with screws and plugs for your wall type, and hang the unit on them at its top back edge, as IKEA assembly guide ${IKEA_RAIL_70.guide} shows. Leave at least ${show(fromMm(RAIL_CLEARANCE_MM))} free above the unit.`,
    });
  } else {
    steps.push({ title: "Anchor the unit", body: "Fix the unit to the wall with the anti-tip fitting, as IKEA says to do for KALLAX and EKET units. Use screws and plugs for your wall type." });
  }
  return steps;
}
