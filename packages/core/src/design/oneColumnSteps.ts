import { formatLength } from "../geometry/format.ts";
import { convertLength } from "../geometry/units.ts";
import type { Design, Project } from "../format/schema.ts";
import { BOTTOM, buildCountText, joinList, LEFT, RIGHT, TOP, type AssemblyBoard, type AssemblyStep } from "./assemblyTypes.ts";
import { roundLength, type DesignGeometry } from "./geometry.ts";
import { designLayout, spanLength } from "./layout.ts";
import { jigSettingText, pocketHolesPerEnd, pocketScrew, pocketScrewsText } from "./pocket.ts";
import { faceScrew } from "./screws.ts";
import { DEFAULT_DESIGN_QUANTITY, designCorners, designFastener } from "./systems.ts";

/** The steps of a box with 1 column, from the first step to the last join step, for his corners or for face screws. */
export function oneColumnSteps(project: Project, design: Design, geometry: DesignGeometry): AssemblyStep[] {
  const units = project.project.units;
  const show = (value: number) => formatLength(value, units, project.settings.display);
  const mm = (value: number) => convertLength(value, units, "mm");
  const { thickness, rows } = geometry;
  const sidesOver = designCorners(design) === "sides-over-top";
  const face = designFastener(design) === "face-screws";
  const shelves = designLayout(geometry).shelves;
  const count = shelves.length;
  const holes = pocketHolesPerEnd(mm(geometry.panelDepth));
  const shelfText = count === 1 ? "the shelf" : `the ${count} shelves`;
  const steps: AssemblyStep[] = [];

  if (count > 0) {
    const marks = shelves.map((board) => roundLength((sidesOver ? thickness : 0) + spanLength(rows, board.line, rows.length - 1, thickness))).toReversed();
    steps.push({ title: "Mark the shelf positions", body: `Mark the underside of each shelf on the sides at ${joinList(marks.map(show))} from the bottom end.`, action: "mark", boards: [LEFT, RIGHT] });
  }

  if (face) {
    const rule = `Put each hole in line with the middle of the board that it joins. Use ${faceScrew(mm(thickness), units)} screws. The screw heads show on the outer face. A pilot hole keeps the plywood from splitting.`;
    const through = sidesOver
      ? `through each side, at the ends of ${joinList(["the top", "the bottom", ...(count > 0 ? [shelfText] : [])])}`
      : `through the top and the bottom, at each end${count > 0 ? `, and through each side, at the ends of ${shelfText}` : ""}`;
    const boards: AssemblyBoard[] = sidesOver ? [LEFT, RIGHT] : [LEFT, RIGHT, TOP, BOTTOM];
    steps.push({ title: "Drill the pilot holes", body: `Drill ${holes} pilot holes for each joint${sidesOver ? "," : ":"} ${through}. ${rule}`, action: "drill", boards });
  } else {
    const screw = pocketScrew(mm(thickness));
    const inShelves = count === 0 ? "" : `, and in each end of ${shelfText}, on the underside`;
    steps.push({
      title: "Drill the pocket holes",
      body: `Drill ${holes} pocket holes in each end of the top, on the upper face, in each end of the bottom, on the lower face${inShelves}, for ${show(thickness)} stock.${jigSettingText(screw)}`,
      action: "drill",
      boards: [TOP, BOTTOM, ...shelves],
    });
  }

  if (count > 0) {
    const openings = shelves.map((board, index) => spanLength(rows, board.line, (shelves[index + 1]?.line ?? rows.length) - 1, thickness));
    const spacers = [...new Set(openings)].map((opening) => `2 spacers to ${show(opening)}`);
    steps.push({ title: "Cut spacers", body: `Cut ${joinList(spacers)} from an offcut. They hold each shelf on its mark while you drive the screws.`, action: "spacers", boards: [] });
  }

  const shelfRef = count === 1 ? "it" : "each shelf";
  const screws = pocketScrewsText(pocketScrew(mm(thickness)));
  if (sidesOver) {
    steps.push({
      title: "Fit the top and the bottom",
      body: face
        ? "Glue the ends of the top and the bottom. Put them between the sides, flush with the ends of the sides. Drive the screws through the pilot holes in the sides."
        : `Glue the ends of the top and the bottom. Put them between the sides, with the pocket holes of the top up and of the bottom down, flush with the ends of the sides. Screw them on with ${screws} through the pocket holes in their ends.`,
      action: "join",
      boards: [TOP, BOTTOM, LEFT, RIGHT],
    });
    if (count > 0) {
      const place = count === 1 ? "Put it between the sides, with its underside on the marks." : "Put the shelves between the sides, from the bottom up, with the underside of each shelf on the marks for it.";
      const drive = face
        ? `Rest ${shelfRef} on the spacers while you drive the screws through the pilot holes in the sides.`
        : `Rest ${shelfRef} on the spacers, with the pocket holes down, and screw ${shelfRef} on with ${screws} through the pocket holes in its ends.`;
      steps.push({ title: "Fit the shelves", body: `Glue the ends of ${count === 1 ? "the shelf" : "each shelf"}. ${place} ${drive}`, action: "join", boards: shelves });
    }
  } else {
    if (count > 0) {
      const one = count === 1;
      steps.push({
        title: "Assemble column 1 of 1",
        body: `Lay the left side on its outside face, with the marks up. Glue the ends of ${one ? "the shelf" : "each shelf"}. Stand ${one ? "it on its mark" : "the shelves on their marks"} on the left side. Put the right side on the other ${one ? "end" : "ends"} of ${one ? "the shelf" : "the shelves"}. Rest ${shelfRef} on the spacers while you drive the screws through the pilot holes in the right side. Turn the frame over. Drive the screws through the pilot holes in the left side.`,
        action: "join",
        boards: [LEFT, ...shelves, RIGHT],
      });
    }
    steps.push({
      title: "Fit the bottom and the top",
      body:
        count > 0
          ? "Lay the frame on its back. Glue the lower ends of the sides. Put the bottom on them. Drive the screws through the pilot holes in the bottom. Then fit the top the same way."
          : "Glue the lower ends of the sides. Stand them on the bottom. Drive the screws through the pilot holes in the bottom. Then fit the top the same way.",
      action: "join",
      boards: [BOTTOM, TOP, ...(count > 0 ? [] : [LEFT, RIGHT])],
    });
  }

  const [first, ...rest] = steps;
  return [{ ...first!, body: `${buildCountText(design.quantity ?? DEFAULT_DESIGN_QUANTITY)}${first!.body}` }, ...rest];
}
