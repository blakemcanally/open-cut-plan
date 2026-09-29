import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export type PathKind = "file" | "directory" | null;

export interface Io {
  readStdin(): Promise<string>;
  stdout(text: string): void;
  stderr(text: string): void;
  readFile(path: string): Promise<string>;
  /** Replaces the whole file at once: readers see the old content or the new content, never a part. */
  writeFile(path: string, text: string): Promise<void>;
  pathKind(path: string): Promise<PathKind>;
  mkdir(path: string): Promise<void>;
}

async function readAll(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function atomicWrite(path: string, text: string): Promise<void> {
  let target = path;
  let mode: number | undefined;
  try {
    target = await realpath(path);
    mode = (await stat(target)).mode & 0o777;
  } catch {
    target = path;
  }
  const temp = join(dirname(target), `.${basename(target)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    await writeFile(temp, text, "utf8");
    if (mode !== undefined) await chmod(temp, mode);
    await rename(temp, target);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw error;
  }
}

export function nodeIo(): Io {
  return {
    readStdin: () => readAll(process.stdin),
    stdout: (text) => void process.stdout.write(text),
    stderr: (text) => void process.stderr.write(text),
    readFile: (path) => readFile(path, "utf8"),
    writeFile: atomicWrite,
    pathKind: async (path) => {
      try {
        const info = await stat(path);
        return info.isDirectory() ? "directory" : "file";
      } catch {
        return null;
      }
    },
    mkdir: async (path) => void (await mkdir(path, { recursive: true })),
  };
}
