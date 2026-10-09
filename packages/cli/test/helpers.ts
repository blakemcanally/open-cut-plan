import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { createProject, parseProject, serializeProject, type Project } from "@opencutplan/core";
import type { Io, PathKind } from "../src/io.ts";
import { run } from "../src/run.ts";

export const EXAMPLES = new URL("../../../examples/", import.meta.url);

export function example(name: string): string {
  return readFileSync(new URL(name, EXAMPLES), "utf8");
}

export interface MemoryIo extends Io {
  files: Map<string, string>;
  writes: string[];
}

export function memoryIo(files: Record<string, string> = {}, stdin = ""): MemoryIo {
  const map = new Map(Object.entries(files));
  const writes: string[] = [];
  const dirs = new Set<string>();
  const io: MemoryIo = {
    files: map,
    writes,
    readStdin: async () => stdin,
    stdout: () => undefined,
    stderr: () => undefined,
    readFile: async (path) => {
      const text = map.get(path);
      if (text === undefined) throw Object.assign(new Error(`ENOENT: no such file, open '${path}'`), { code: "ENOENT" });
      return text;
    },
    writeFile: async (path, text) => {
      map.set(path, text);
      writes.push(path);
    },
    pathKind: async (path): Promise<PathKind> => {
      const clean = path.replace(/\/+$/, "");
      if (map.has(clean)) return "file";
      if (dirs.has(clean) || [...map.keys()].some((key) => dirname(key) === clean)) return "directory";
      return null;
    },
    mkdir: async (path) => void dirs.add(path.replace(/\/+$/, "")),
  };
  return io;
}

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
  io: MemoryIo;
  json(): Record<string, any>;
  file(path: string): Project;
}

export async function cli(argv: string[], io: MemoryIo = memoryIo()): Promise<CliResult> {
  let stdout = "";
  let stderr = "";
  io.stdout = (text) => void (stdout += text);
  io.stderr = (text) => void (stderr += text);
  const code = await run(argv, io);
  return {
    code,
    stdout,
    stderr,
    io,
    json: () => JSON.parse(stdout) as Record<string, any>,
    file: (path) => {
      const parsed = parseProject(io.files.get(path) ?? "");
      if (!parsed.ok) throw new Error(`${path} is not a readable project`);
      return parsed.project;
    },
  };
}

export const SHELF = "living-room-shelf.cutplan.json";
export const BOOKCASE = "simple-bookcase-mm.cutplan.json";

export function withExamples(extra: Record<string, string> = {}, stdin = ""): MemoryIo {
  return memoryIo({ "shelf.cutplan.json": example(SHELF), "bookcase.cutplan.json": example(BOOKCASE), ...extra }, stdin);
}

export const KALLAX = "kallax.cutplan.json";
export const EKET = "eket.cutplan.json";

/** The KALLAX 2x4 example (mm, design id kallax) and the EKET wall example (in, design id eket), with no plan. */
export function withDesignExamples(extra: Record<string, string> = {}): MemoryIo {
  return memoryIo({ [KALLAX]: example("kallax-2x4-mm.cutplan.json"), [EKET]: example("eket-wall-in.cutplan.json"), ...extra });
}

/** Changes one JSON file in the memory io by hand, as a person with a text editor would. */
export function editFile(io: MemoryIo, path: string, change: (file: Record<string, any>) => void): void {
  const file = JSON.parse(io.files.get(path)!) as Record<string, any>;
  change(file);
  io.files.set(path, `${JSON.stringify(file, null, 2)}\n`);
}

export const ROW = "row.cutplan.json";

/** A 96 × 48 sheet with no trim: two 20 × 40 posts with two 20 × 10 rails between them, one kerf apart in a row. The automatic tree takes 8 cuts; Optimize cuts finds 6. */
export function rowFile(): string {
  const base = createProject("Row", "in");
  const project: Project = {
    ...base,
    settings: { ...base.settings, trim: 0, features: { ...base.settings.features, toolLimits: false } },
    materials: [{ id: "ply", name: "Plywood 3/4", thickness: 0.75, grained: false }],
    stock: [{ id: "ply-4x8", material: "ply", length: 96, width: 48, quantity: null, cost: 60, kind: "sheet" }],
    parts: [
      { id: "post", name: "Post", material: "ply", length: 20, width: 40, quantity: 2, grain: "none" },
      { id: "rail", name: "Rail", material: "ply", length: 20, width: 10, quantity: 2, grain: "none" },
    ],
    tools: [{ id: "ts", name: "Table saw", type: "table-saw", kerf: 0.125, enabled: true }],
    plan: {
      sheets: [
        {
          id: "s1",
          stock: "ply-4x8",
          placements: [
            { part: "post", copy: 0, x: 0, y: 0, rotated: false },
            { part: "rail", copy: 0, x: 20.125, y: 0, rotated: false },
            { part: "rail", copy: 1, x: 40.25, y: 0, rotated: false },
            { part: "post", copy: 1, x: 60.375, y: 0, rotated: false },
          ],
        },
      ],
    },
  };
  return serializeProject(project);
}
