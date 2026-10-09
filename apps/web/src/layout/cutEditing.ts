import { cutStops, extendCut, sameLine, shortenCut, shortenStops, type Axis, type CutEnd, type CutLine, type CutOrder, type CutStop, type Project, type Step } from "@opencutplan/core";

export interface EndStop extends CutStop {
  kind: "extend" | "shorten";
}

export interface SelectedCut {
  sheet: string;
  line: CutLine;
}

export const KIND_NAMES = { rip: "Rip", crosscut: "Crosscut", trim: "Trim" } as const;

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

/** Why the cut cannot move one place earlier or later. */
export function orderLimitText(steps: readonly Step[], step: Step, limits: CutOrder, later: boolean): string {
  const stepOf = (line: CutLine | null) => (line ? steps.find((s) => s.kind !== "trim" && sameLine(s, line))?.step : undefined);
  if (later) {
    const first = stepOf(limits.first);
    return first === undefined ? `Step ${step.step} is the last cut of the sheet.` : `Step ${step.step} must stay before step ${first}, the first cut inside its piece.`;
  }
  const requires = stepOf(limits.requires);
  return requires === undefined ? `Step ${step.step} is the first cut of the sheet after the trims.` : `Step ${step.step} must stay after step ${requires}, the cut that makes its piece.`;
}

/** The project after the end goes to the stop, and the line of the selected cut after the edit. */
export function applyStop(project: Project, sheet: string, line: CutLine, end: CutEnd, stop: EndStop): { project: Project; line: CutLine } | null {
  const next = stop.kind === "extend" ? extendCut(project, sheet, line, end, stop.end) : shortenCut(project, sheet, line, end, stop.across!);
  return next && { project: next, line: { ...lineOf(line), [end]: stop.end } };
}
