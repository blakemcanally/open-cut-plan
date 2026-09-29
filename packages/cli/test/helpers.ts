import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseProject, type Project } from "@opencutplan/core";
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
