export const SUPPORTED_MAJOR = 1;
export const SUPPORTED_MINOR = 9;

export interface Version {
  major: number;
  minor: number;
}

export function parseVersion(value: unknown): Version | null {
  if (typeof value !== "string") return null;
  const match = /^(\d+)\.(\d+)$/.exec(value);
  return match ? { major: Number(match[1]), minor: Number(match[2]) } : null;
}

export function isNewerMinor(value: unknown): boolean {
  const version = parseVersion(value);
  return version !== null && version.major === SUPPORTED_MAJOR && version.minor > SUPPORTED_MINOR;
}

export type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export function migrate(
  doc: Record<string, unknown>,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
  targetMinor: number = SUPPORTED_MINOR,
): Record<string, unknown> {
  const version = parseVersion(doc.version);
  if (!version) return doc;
  let current = doc;
  for (let minor = version.minor; minor < targetMinor; minor++) {
    const step = migrations[minor];
    current = { ...(step ? step(current) : current), version: `${version.major}.${minor + 1}` };
  }
  return current;
}
