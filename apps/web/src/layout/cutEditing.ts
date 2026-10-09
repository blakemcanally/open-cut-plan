import { cutStops, extendCut, shortenCut, shortenStops, type Axis, type CutEnd, type CutLine, type CutStop, type Project } from "@opencutplan/core";

export interface EndStop extends CutStop {
  kind: "extend" | "shorten";
}

export interface SelectedCut {
  sheet: string;
  line: CutLine;
}

export const lineOf = ({ axis, at, from, to }: CutLine): CutLine => ({ axis, at, from, to });

/** The names of the ends: a rip runs left to right, and a crosscut runs top to bottom. */
export function endName(axis: Axis, end: CutEnd): string {
  if (axis === "y") return end === "from" ? "left" : "right";
  return end === "from" ? "top" : "bottom";
}

/** The extend stops and the shorten stops of one end. */
export function endStops(project: Project, sheet: string, line: CutLine, end: CutEnd): EndStop[] {
  return [
    ...cutStops(project, sheet, line, end).map((stop): EndStop => ({ ...stop, kind: "extend" })),
    ...shortenStops(project, sheet, line, end).map((stop): EndStop => ({ ...stop, kind: "shorten" })),
  ];
}

/** The project after the end goes to the stop, and the line of the selected cut after the edit. */
export function applyStop(project: Project, sheet: string, line: CutLine, end: CutEnd, stop: EndStop): { project: Project; line: CutLine } | null {
  const next = stop.kind === "extend" ? extendCut(project, sheet, line, end, stop.end) : shortenCut(project, sheet, line, end, stop.across!);
  return next && { project: next, line: { ...lineOf(line), [end]: stop.end } };
}
