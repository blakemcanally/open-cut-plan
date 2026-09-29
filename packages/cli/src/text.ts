import { formatLength, type Project } from "@opencutplan/core";

export function len(project: Project, value: number): string {
  return formatLength(value, project.project.units, project.settings.display);
}

export function size(project: Project, item: { length: number; width: number }): string {
  return `${len(project, item.length)} × ${len(project, item.width)}`;
}

export function money(amount: number | null, currency: string): string {
  return amount === null ? "unknown" : `${amount.toFixed(2)} ${currency}`;
}

export function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const all = [header, ...rows];
  const widths = header.map((_, i) => Math.max(...all.map((row) => (row[i] ?? "").length)));
  return all.map((row) => row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i]!))).join("  ").trimEnd()).join("\n");
}
