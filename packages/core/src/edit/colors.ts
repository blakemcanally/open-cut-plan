import type { Design, Part, Project } from "../format/schema.ts";

/** Sets the colour of one unit of a design, from 1; null makes it automatic again. */
export function setDesignColor(project: Project, designId: string, unit: number, color: string | null): Project {
  const designs = (project.designs ?? []).map((design) => (design.id === designId ? withUnitColor(design, unit, color) : design));
  return { ...project, designs };
}

function withUnitColor(design: Design, unit: number, color: string | null): Design {
  const colors = [...(design.colors ?? [])];
  while (colors.length < unit) colors.push("");
  colors[unit - 1] = color?.toLowerCase() ?? "";
  while (colors.at(-1) === "") colors.pop();
  const { colors: _colors, ...rest } = design;
  return colors.length > 0 ? { ...rest, colors } : rest;
}

/** Sets the colour of the parts without a design that have this group; null makes it automatic again. */
export function setGroupColor(project: Project, group: string, color: string | null): Project {
  const { groups: _groups, ...rest } = project;
  const groups = { ...project.groups };
  const { color: _color, ...entry } = groups[group] ?? {};
  if (color !== null) groups[group] = { ...entry, color: color.toLowerCase() };
  else if (Object.keys(entry).length > 0) groups[group] = entry;
  else delete groups[group];
  return Object.keys(groups).length > 0 ? { ...rest, groups } : rest;
}

/**
 * Gives the parts without a design that have the group `from` the group `to`, or no group when `to` is empty, and moves
 * the settings of the group. When parts already have the group `to`, its settings come first. A stale entry for `to`
 * is dropped. The parts of a design keep their group.
 */
export function renameGroup(project: Project, from: string, to: string): Project {
  const designs = new Set((project.designs ?? []).map((design) => design.id));
  const loose = (part: Part) => part.design === undefined || !designs.has(part.design);
  if (from === to || !project.parts.some((part) => part.group === from && loose(part))) return project;
  const inUse = to !== "" && project.parts.some((part) => part.group === to && loose(part));
  const parts = project.parts.map((part) => {
    if (part.group !== from || !loose(part)) return part;
    const { group: _group, ...rest } = part;
    return to === "" ? rest : { ...rest, group: to };
  });
  const { groups: _groups, ...rest } = project;
  const groups = { ...project.groups };
  const moved = groups[from];
  delete groups[from];
  if (to !== "") {
    const merged = { ...moved, ...(inUse ? groups[to] : undefined) };
    if (Object.keys(merged).length > 0) groups[to] = merged;
    else delete groups[to];
  }
  return Object.keys(groups).length > 0 ? { ...rest, parts, groups } : { ...rest, parts };
}
