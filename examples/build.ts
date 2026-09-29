import { mkdirSync, writeFileSync } from "node:fs";
import { exportPartsCsv, exportStockCsv, parseProject, serializeProject } from "../packages/core/src/index.ts";
import { EXAMPLES } from "./builders/index.ts";

mkdirSync(new URL("./csv/", import.meta.url), { recursive: true });
for (const [slug, build] of Object.entries(EXAMPLES)) {
  const result = parseProject(build());
  if (!result.ok) throw new Error(`${slug}: ${result.errors.map((issue) => issue.message).join("; ")}`);
  writeFileSync(new URL(`./${slug}.cutplan.json`, import.meta.url), serializeProject(result.project));
  writeFileSync(new URL(`./csv/${slug}-parts.csv`, import.meta.url), exportPartsCsv(result.project));
  writeFileSync(new URL(`./csv/${slug}-stock.csv`, import.meta.url), exportStockCsv(result.project));
  console.log(`wrote ${slug}`);
}
