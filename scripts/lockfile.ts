import { readFileSync, writeFileSync } from "node:fs";

const REGISTRY = "https://registry.npmjs.org/";
const TARBALL = /\/((?:@[^/]+\/)?[^/]+\/-\/[^/]+\.tgz)$/;

interface Entry {
  resolved?: string;
  link?: boolean;
}

const file = new URL("../package-lock.json", import.meta.url);
const lock = JSON.parse(readFileSync(file, "utf8")) as { packages: Record<string, Entry> };
const fix = process.argv.includes("--fix");

const foreign: string[] = [];
for (const [path, entry] of Object.entries(lock.packages)) {
  if (entry.link === true || entry.resolved === undefined || entry.resolved.startsWith(REGISTRY)) continue;
  const tarball = TARBALL.exec(entry.resolved)?.[1];
  if (fix && tarball !== undefined) entry.resolved = `${REGISTRY}${tarball}`;
  else foreign.push(`${path}: ${entry.resolved}`);
}

if (fix) writeFileSync(file, `${JSON.stringify(lock, null, 2)}\n`);
if (foreign.length > 0) {
  console.error(`package-lock.json has ${foreign.length} packages outside ${REGISTRY}:`);
  for (const line of foreign.slice(0, 10)) console.error(`  ${line}`);
  if (!fix) console.error("Run `npm run lockfile -- --fix` to point them at the public registry.");
  process.exit(1);
}
console.log(`package-lock.json resolves every package from ${REGISTRY}`);
