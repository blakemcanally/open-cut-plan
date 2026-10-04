import { formatLength } from "../geometry/format.ts";
import { convertLength } from "../geometry/units.ts";
import type { Project } from "../format/schema.ts";
import { designParts } from "./generate.ts";
import { designGeometry, materialsById, roundLength, type DesignGeometry } from "./geometry.ts";
import { backScrewCount, backScrewName, pocketHolesPerEnd, pocketScrew, railsFor } from "./hardware.ts";
import { boardLength, cellStarts, designLayout, segments, spanLength, type Board, type BoardLayout } from "./layout.ts";
import { dividerName, shelfName } from "./parts.ts";
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
  const layout = designLayout(geometry);
  const dividers = layout.dividers.length;
  const shelves = layout.shelves.length;
  const screw = pocketScrew(mm(thickness));
  const screws = screw ? `${screw.screw} coarse-thread pocket screws` : "pocket screws (the chart has no length for this stock)";
  const uprights = dividers === 0 ? "the sides" : "the sides and the dividers";
  const steps: AssemblyStep[] = [];

  const setting = screw ? ` Set the jig and the drill collar to the ${formatLength(screw.setting, "in", { inch: 8, mm: 1 })} mark.` : "";
  const drilled =
    dividers === 0
      ? "the 2 sides, on the inside face of each side"
      : `the 2 sides and the ${dividers} ${dividers === 1 ? "divider" : "dividers"}, on the inside face of each side and on one face of ${dividers === 1 ? "the divider" : "each divider"}`;
  const drilledShelves = shelves === 0 ? "" : `, and in each end of ${shelves === 1 ? "the shelf" : `the ${shelves} shelves`}, on the underside`;
  steps.push({
    title: "Drill the pocket holes",
    body: `${quantity > 1 ? `Build ${quantity} of these. The numbers in these steps are for one unit. ` : ""}Drill ${pocketHolesPerEnd(mm(geometry.panelDepth))} pocket holes in each end of ${drilled}${drilledShelves}, for ${show(thickness)} stock.${setting}`,
  });

  if (geometry.combined) {
    steps.push(...combinedSteps(geometry, layout, show, screws));
  } else {
    const perColumn = rows.length - 1;
    if (perColumn > 0) {
      const marks = [rows.at(-1)!];
      for (let row = rows.length - 2; row > 0; row--) marks.push(roundLength(marks.at(-1)! + thickness + rows[row]!));
      steps.push({ title: "Mark the shelf positions", body: `Mark the underside of each shelf on ${uprights} at ${joinList(marks.map(show))} from the bottom end.` });
    }

    if (dividers > 0) {
      const marks: number[] = [];
      let x = 0;
      for (let column = 0; column < dividers; column++) {
        x = roundLength(x + thickness + columns[column]!);
        marks.push(x);
      }
      steps.push({ title: "Mark the divider positions", body: `Mark the left face of each divider on the top and the bottom at ${joinList(marks.map(show))} from the left end.` });
    }

    if (perColumn > 0) {
      const spacers = [...new Set(rows.slice(1))].map((opening) => `2 spacers to ${show(opening)}`);
      steps.push({ title: "Cut spacers", body: `Cut ${joinList(spacers)} from an offcut. They hold each shelf on its mark while you drive the screws.` });

      columns.forEach((opening, index) => {
        const start = index === 0 ? "Lay the left side on its outside face, with the marks up." : `Use the divider on the right of column ${index} as the left panel.`;
        const put =
          perColumn === 1
            ? `Put the shelf of this column (${show(opening)} long) on its mark, with the pocket holes down, and screw it to the panel with ${screws}.`
            : `Put the ${perColumn} shelves of this column (${show(opening)} long) on their marks, with the pocket holes down, and screw them to the panel with ${screws}.`;
        const next = index === dividers ? "the right side" : "the next divider";
        steps.push({
          title: `Assemble column ${index + 1} of ${columns.length}`,
          body: `${start} ${put} Then put ${next} on the other ends of the ${perColumn === 1 ? "shelf" : "shelves"}, and screw it on.`,
        });
      });
    }
  }

  const reach = geometry.combined && layout.dividers.some((board) => board.from > 0 || board.to < rows.length - 1) ? " that reach it" : "";
  const onMark = dividers === 0 ? "" : ", with each divider on its mark";
  steps.push({
    title: "Fit the bottom and the top",
    body:
      shelves > 0
        ? `Lay the frame on its back. Put the bottom on the lower ends of ${uprights}${reach}${onMark}, and screw it on through the pocket holes in their ends. Then fit the top the same way.`
        : `Stand ${uprights} on the bottom${onMark}, and screw them to it through the pocket holes in their ends. Then fit the top the same way.`,
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

export interface ColumnStep {
  /** 0-based. */
  column: number;
  /** The shelf boards that start in the column, each with the dividers of its assembly. */
  shelves: Board[];
  /** The divider boards on the right of the column that are not in the assembly of a long shelf; none for the last column. */
  dividers: Board[];
}

/**
 * The short dividers to join to each long shelf before the shelf goes in: each divider that stands on the shelf, and
 * each divider that hangs from it and stands on the bottom. Every short divider is in one assembly.
 */
export function shelfAssemblies(layout: BoardLayout, rows: number): Map<Board, Board[]> {
  const assemblies = new Map<Board, Board[]>(layout.shelves.filter((board) => board.from !== board.to).map((board) => [board, []]));
  const across = (line: number, column: number) => layout.shelves.find((board) => board.line === line && board.from < column && board.to >= column)!;
  for (const board of layout.dividers) {
    if (board.from === 0 && board.to === rows - 1) continue;
    assemblies.get(board.to < rows - 1 ? across(board.to + 1, board.line) : across(board.from, board.line))!.push(board);
  }
  return assemblies;
}

/** For each column from the left: the shelf boards that start in it, with their assemblies, then the other divider boards on its right. Each step only screws a board to a board that this step or an earlier one put in place. */
export function columnSteps(layout: BoardLayout, columns: number, rows: number): ColumnStep[] {
  const joined = new Set([...shelfAssemblies(layout, rows).values()].flat());
  return Array.from({ length: columns }, (_, column) => ({
    column,
    shelves: layout.shelves.filter((board) => board.from === column),
    dividers: layout.dividers.filter((board) => board.line === column + 1 && !joined.has(board)),
  }));
}

function combinedSteps(geometry: DesignGeometry, layout: BoardLayout, show: (value: number) => string, screws: string): AssemblyStep[] {
  const { thickness: t, columns, rows } = geometry;
  const n = columns.length;
  const m = rows.length;
  const has = segments(n, m, geometry.combined ?? []);
  const lineX = [0, ...cellStarts(columns, t).map((start, column) => roundLength(start + columns[column]!))];
  const cellX = cellStarts(columns, t);
  const full = (board: Board) => board.from === 0 && board.to === m - 1;
  const dividerText = (board: Board) => `the divider on the right of column ${board.line}${full(board) ? "" : ` (${dividerName(board, m)})`}`;
  const shelfText = (board: Board) => `the shelf under row ${board.line} (${shelfName(board, columns)})`;
  const its = (count: number, one: string, many: string) => (count === 1 ? one : many);
  const steps: AssemblyStep[] = [];

  if (layout.shelves.length > 0) {
    const uprights = [
      { name: "the left side", line: 0, from: 0, to: m - 1 },
      ...layout.dividers.map((board) => ({ name: dividerText(board), ...board })),
      { name: "the right side", line: n, from: 0, to: m - 1 },
    ];
    const groups = new Map<string, string[]>();
    for (const upright of uprights) {
      const marks: number[] = [];
      for (let line = upright.to; line > upright.from; line--) {
        if ((upright.line > 0 && has.shelf(line, upright.line - 1)) || (upright.line < n && has.shelf(line, upright.line))) marks.push(spanLength(rows, line, upright.to, t));
      }
      if (marks.length === 0) continue;
      const key = joinList(marks.map(show));
      groups.set(key, [...(groups.get(key) ?? []), upright.name]);
    }
    const clauses = [...groups].map(([marks, names]) => {
      const sides = names.includes("the left side") && names.includes("the right side");
      const named = sides ? ["the sides", ...names.filter((name) => !name.endsWith(" side"))] : names;
      return `on ${joinList(named)} at ${marks}`;
    });
    steps.push({ title: "Mark the shelf positions", body: `Mark the underside of each shelf, from the bottom end of the panel: ${clauses.join("; ")}.` });
  }

  if (layout.dividers.length > 0) {
    const top = layout.dividers.filter((board) => board.from === 0).map((board) => lineX[board.line]!);
    const bottom = layout.dividers.filter((board) => board.to === m - 1).map((board) => lineX[board.line]!);
    const list = (marks: number[]) => joinList([...new Set(marks)].sort((a, b) => a - b).map(show));
    const clauses =
      list(top) === list(bottom) ? [`on the top and the bottom at ${list(top)}`] : [...(top.length > 0 ? [`on the top at ${list(top)}`] : []), ...(bottom.length > 0 ? [`on the bottom at ${list(bottom)}`] : [])];
    for (const shelf of layout.shelves.filter((board) => board.from !== board.to)) {
      const left = cellX[shelf.from]!;
      const above: number[] = [];
      const below: number[] = [];
      for (let line = shelf.from + 1; line <= shelf.to; line++) {
        if (has.divider(line, shelf.line - 1)) above.push(roundLength(lineX[line]! - left));
        if (has.divider(line, shelf.line)) below.push(roundLength(lineX[line]! - left));
      }
      if (above.length > 0) clauses.push(`on the top face of ${shelfText(shelf)} at ${list(above)}`);
      if (below.length > 0) clauses.push(`on the underside of ${shelfText(shelf)} at ${list(below)}`);
    }
    steps.push({ title: "Mark the divider positions", body: `Mark the left face of each divider, from the left end: ${clauses.join("; ")}.` });
  }

  if (layout.shelves.length === 0) return steps;
  const under = (line: number, column: number) => {
    const span = geometry.combined!.find((cell) => column + 1 >= cell.column && column < cell.column - 1 + cell.columns && cell.row === line + 1);
    return span ? spanLength(rows, line, line + span.rows - 1, t) : rows[line]!;
  };
  const heights = layout.shelves.flatMap((board) => [under(board.line, board.from), under(board.line, board.to)]);
  const spacers = [...new Set(heights)].map((height) => `2 spacers to ${show(height)}`);
  steps.push({ title: "Cut spacers", body: `Cut ${joinList(spacers)} from an offcut. They hold each shelf on its mark while you drive the screws.` });

  const assemblies = shelfAssemblies(layout, m);
  const across = (line: number, column: number) => layout.shelves.find((board) => board.line === line && board.from < column && board.to >= column);
  const joins: string[] = [];
  for (const [shelf, stems] of assemblies) {
    if (stems.length === 0) continue;
    const above = stems.filter((stem) => stem.to + 1 === shelf.line);
    const below = stems.filter((stem) => stem.from === shelf.line);
    if (above.length > 0) {
      joins.push(
        `Lay ${shelfText(shelf)} on its underside. Stand ${joinList(above.map(dividerText))} on ${its(above.length, "its mark", "their marks")} on the top face, and screw ${its(above.length, "it", "them")} on through the pocket holes in ${its(above.length, "its lower end", "their lower ends")}.`,
      );
    }
    if (below.length > 0) {
      joins.push(
        `${above.length > 0 ? "Turn it over." : `Lay ${shelfText(shelf)} on its top face.`} Stand ${joinList(below.map(dividerText))} on ${its(below.length, "its mark", "their marks")} on the underside, and screw ${its(below.length, "it", "them")} on through the pocket holes in ${its(below.length, "its upper end", "their upper ends")}.`,
      );
    }
  }
  if (joins.length > 0) steps.push({ title: "Assemble the long shelves", body: `${joins.join(" ")} Hold each divider square to the shelf while you drive the screws.` });

  const placed = new Map<Board, number>();
  const plan = columnSteps(layout, n, m);
  for (const step of plan) {
    for (const board of [...step.shelves, ...step.dividers]) placed.set(board, step.column);
    for (const board of step.shelves) for (const stem of assemblies.get(board) ?? []) placed.set(stem, step.column);
  }
  const tops = [...assemblies]
    .flatMap(([shelf, stems]) => stems.filter((stem) => stem.to + 1 === shelf.line && stem.from > 0))
    .map((stem) => ({ stem, shelf: across(stem.from, stem.line)! }))
    .map((joint) => ({ ...joint, step: Math.max(placed.get(joint.stem)!, placed.get(joint.shelf)!) }));

  for (const step of plan) {
    const c = step.column;
    const sentences: string[] = [];
    if (step.shelves.length > 0) {
      if (c === 0) sentences.push("Lay the left side on its outside face, with the marks up.");
      else {
        const left = layout.dividers.filter((board) => board.line === c);
        sentences.push(left.length === 1 ? `Use ${dividerText(left[0]!)} as the left panel.` : `Use the dividers on the right of column ${c} as the left panels.`);
      }
      const short = step.shelves.filter((board) => board.from === board.to);
      const items = [
        ...(short.length === 0 ? [] : [`${its(short.length, "the shelf of this column", `the ${short.length} shelves of this column`)} (${shelfName(short[0]!, columns)}, ${show(columns[c]!)} long)`]),
        ...step.shelves
          .filter((board) => board.from !== board.to)
          .map((board) => {
            const stems = assemblies.get(board)!.length;
            return `the shelf under row ${board.line} (${shelfName(board, columns)}, ${show(boardLength(board, geometry))} long)${stems === 0 ? "" : `, with ${its(stems, "its divider", "its dividers")},`}`;
          }),
      ];
      const one = step.shelves.length === 1;
      sentences.push(`Put ${joinList(items)} on ${one ? "its mark" : "their marks"}, with the pocket holes down, and screw ${one ? "it" : "them"} to the panel with ${screws}.`);
    }
    const ending = layout.shelves.filter((board) => board.to === c);
    const right = c === n - 1 ? "the right side" : step.dividers.length > 0 ? dividerText(step.dividers[0]!) : null;
    const holdsEnd = (board: Board) => layout.dividers.find((divider) => divider.line === c + 1 && divider.from <= board.line - 1 && divider.to >= board.line)!;
    const into = c === n - 1 ? ending : ending.filter((board) => step.dividers.includes(holdsEnd(board)));
    const intoStems = c === n - 1 ? [] : ending.filter((board) => !step.dividers.includes(holdsEnd(board)));
    if (right !== null && into.length > 0) {
      const local = into.filter((board) => board.from === c);
      const longs = into.filter((board) => board.from < c);
      const ends = [
        ...(local.length === 0 ? [] : [`${its(local.length, "the other end of the shelf", "the other ends of the shelves")}${longs.length > 0 ? " of this column" : ""}`]),
        ...longs.map((board) => `the right end of ${shelfText(board)}`),
      ];
      sentences.push(`${sentences.length === 0 ? "Put" : "Then put"} ${right} on ${joinList(ends)}, and screw it on.`);
    }
    for (const divider of new Set(intoStems.map(holdsEnd))) {
      const boards = intoStems.filter((board) => holdsEnd(board) === divider);
      const local = boards.filter((board) => board.from === c);
      const ends = [
        ...(local.length === 0 ? [] : [its(local.length, "the other end of the shelf of this column", `the other ends of the ${local.length} shelves of this column`)]),
        ...boards.filter((board) => board.from < c).map((board) => `the right end of ${shelfText(board)}`),
      ];
      sentences.push(`Screw ${joinList(ends)} to ${dividerText(divider)}.`);
    }
    for (const joint of tops.filter((candidate) => candidate.step === c)) sentences.push(`Screw the top end of ${dividerText(joint.stem)} to ${shelfText(joint.shelf)}.`);
    if (sentences.length > 0) steps.push({ title: `Assemble column ${c + 1} of ${n}`, body: sentences.join(" ") });
  }
  return steps;
}
