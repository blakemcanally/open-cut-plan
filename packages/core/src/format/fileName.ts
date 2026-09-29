export function fileBase(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|]+/g, "-") || "project";
}

export function projectFileName(name: string): string {
  return `${fileBase(name)}.cutplan.json`;
}
