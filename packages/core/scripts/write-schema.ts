import { mkdirSync, writeFileSync } from "node:fs";
import { buildJsonSchema } from "../src/format/jsonSchema.ts";

const dir = new URL("../../../schema/", import.meta.url);
mkdirSync(dir, { recursive: true });
const target = new URL("cutplan.schema.json", dir);
writeFileSync(target, `${JSON.stringify(buildJsonSchema(), null, 2)}\n`);
console.log(`wrote ${target.pathname}`);
