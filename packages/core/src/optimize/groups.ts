/** Each next sheet is the first one left that shares a group with the sheet before it, else the first one left. */
export function orderByGroup<T>(sheets: readonly T[], groupsOf: (sheet: T) => ReadonlySet<string>): T[] {
  const left = [...sheets];
  const out: T[] = [];
  while (left.length > 0) {
    const last = out.at(-1);
    const held = last === undefined ? new Set<string>() : groupsOf(last);
    const index = Math.max(0, left.findIndex((sheet) => [...groupsOf(sheet)].some((group) => held.has(group))));
    out.push(...left.splice(index, 1));
  }
  return out;
}
