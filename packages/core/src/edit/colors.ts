import type { Design, Project } from "../format/schema.ts";

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
