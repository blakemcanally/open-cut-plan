import type { Project } from "@opencutplan/core";

export interface CollectionChanges {
  added: string[];
  removed: string[];
  changed: string[];
  reordered: boolean;
}

export interface PlanChanges {
  sheetsBefore: number;
  sheetsAfter: number;
  added: string[];
  removed: string[];
  changed: string[];
  placementsBefore: number;
  placementsAfter: number;
}

export interface Changes {
  changed: boolean;
  project: string[];
  materials: CollectionChanges;
  stock: CollectionChanges;
  parts: CollectionChanges;
  tools: CollectionChanges;
  settings: string[];
  plan: PlanChanges;
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function collection<T extends { id: string }>(before: readonly T[], after: readonly T[], strip: (item: T) => unknown = (item) => item): CollectionChanges {
  const old = new Map(before.map((item) => [item.id, stableStringify(strip(item))]));
  const next = new Map(after.map((item) => [item.id, stableStringify(strip(item))]));
  const kept = (ids: readonly string[], other: ReadonlyMap<string, string>) => ids.filter((id) => other.has(id));
  const beforeIds = before.map((item) => item.id);
  const afterIds = after.map((item) => item.id);
  return {
    added: afterIds.filter((id) => !old.has(id)),
    removed: beforeIds.filter((id) => !next.has(id)),
    changed: afterIds.filter((id) => old.has(id) && old.get(id) !== next.get(id)),
    reordered: stableStringify(kept(beforeIds, next)) !== stableStringify(kept(afterIds, old)),
  };
}

export function flatten(value: unknown, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) Object.assign(out, flatten(child, prefix === "" ? key : `${prefix}.${key}`));
  } else if (prefix !== "") {
    out[prefix] = value;
  }
  return out;
}

function changedKeys(before: unknown, after: unknown): string[] {
  const a = flatten(before);
  const b = flatten(after);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return keys.filter((key) => stableStringify(a[key]) !== stableStringify(b[key]));
}

function isEmpty(changes: CollectionChanges): boolean {
  return changes.added.length === 0 && changes.removed.length === 0 && changes.changed.length === 0 && !changes.reordered;
}

export function diffProjects(before: Project, after: Project): Changes {
  const beforeSheets = before.plan?.sheets ?? [];
  const afterSheets = after.plan?.sheets ?? [];
  const sheets = collection(beforeSheets, afterSheets, ({ cuts: _cuts, ...rest }) => rest);
  const count = (project: Project) => (project.plan?.sheets ?? []).reduce((sum, sheet) => sum + sheet.placements.length, 0);
  const changes: Changes = {
    changed: false,
    project: changedKeys(before.project, after.project),
    materials: collection(before.materials, after.materials),
    stock: collection(before.stock, after.stock),
    parts: collection(before.parts, after.parts),
    tools: collection(before.tools, after.tools),
    settings: changedKeys(before.settings, after.settings),
    plan: {
      sheetsBefore: beforeSheets.length,
      sheetsAfter: afterSheets.length,
      added: sheets.added,
      removed: sheets.removed,
      changed: sheets.changed,
      placementsBefore: count(before),
      placementsAfter: count(after),
    },
  };
  changes.changed =
    changes.project.length > 0 ||
    changes.settings.length > 0 ||
    !isEmpty(changes.materials) ||
    !isEmpty(changes.stock) ||
    !isEmpty(changes.parts) ||
    !isEmpty(changes.tools) ||
    !isEmpty(sheets) ||
    (before.plan === undefined) !== (after.plan === undefined);
  return changes;
}

export function describeChanges(changes: Changes): string[] {
  if (!changes.changed) return ["No changes."];
  const lines: string[] = [];
  const noun = { materials: "material", stock: "stock", parts: "part", tools: "tool" } as const;
  for (const key of ["materials", "stock", "parts", "tools"] as const) {
    const c = changes[key];
    if (c.added.length > 0) lines.push(`Added ${noun[key]}: ${c.added.join(", ")}.`);
    if (c.changed.length > 0) lines.push(`Changed ${noun[key]}: ${c.changed.join(", ")}.`);
    if (c.removed.length > 0) lines.push(`Removed ${noun[key]}: ${c.removed.join(", ")}.`);
    if (c.reordered) lines.push(`Changed the order of the ${key}.`);
  }
  if (changes.project.length > 0) lines.push(`Changed the project: ${changes.project.join(", ")}.`);
  if (changes.settings.length > 0) lines.push(`Changed the settings: ${changes.settings.join(", ")}.`);
  const plan = changes.plan;
  if (plan.added.length > 0 || plan.removed.length > 0 || plan.changed.length > 0) {
    lines.push(
      `Plan: ${plan.sheetsBefore} → ${plan.sheetsAfter} sheets, ${plan.placementsBefore} → ${plan.placementsAfter} placed copies.`,
    );
  }
  return lines;
}
