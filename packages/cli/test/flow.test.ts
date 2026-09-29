import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nodeIo } from "../src/io.ts";
import { run } from "../src/run.ts";
import { cli } from "./helpers.ts";

const MAIN = fileURLToPath(new URL("../src/main.ts", import.meta.url));

async function real(argv: string[]) {
  let stdout = "";
  let stderr = "";
  const io = { ...nodeIo(), stdout: (text: string) => void (stdout += text), stderr: (text: string) => void (stderr += text) };
  const code = await run(argv, io);
  return { code, stdout, stderr, json: () => JSON.parse(stdout) as Record<string, any> };
}

describe("the program", () => {
  it("prints the help when node runs main.ts", async () => {
    const { stdout } = await promisify(execFile)(process.execPath, [MAIN, "--help"]);
    expect(stdout).toContain("Usage: opencutplan <command>");
    expect(stdout).toContain("export svg");
  });

  it("sets the exit code from the result", async () => {
    const failed = await promisify(execFile)(process.execPath, [MAIN, "nope"]).catch((error: { code: number; stderr: string }) => error);
    expect(failed).toMatchObject({ code: 2 });
  });

  it("has help with an example for every command", async () => {
    const { commands } = (await cli(["help", "--json"])).json();
    expect(commands.length).toBeGreaterThan(50);
    for (const command of commands as { name: string; examples: unknown[] }[]) {
      expect(command.examples.length, command.name).toBeGreaterThan(0);
      const help = await cli(["help", ...command.name.split(" ")]);
      expect(help.code, command.name).toBe(0);
      expect(help.stdout, command.name).toContain("Examples:");
    }
  });
});

describe("an agent flow in a real directory", () => {
  let dir = "";
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ocp-cli-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("creates, fills, optimizes, reports, and draws a project", async () => {
    const file = join(dir, "desk.cutplan.json");
    expect((await real(["new", file, "--name", "Desk", "--units", "in", "--json"])).code).toBe(0);
    const material = await real(["materials", "add", file, "--name", "Plywood 3/4", "--thickness", "3/4", "--json"]);
    expect(material.json()).toMatchObject({ ok: true, material: { id: "plywood-3-4" } });
    const stock = await real(["stock", "add", file, "--length", "8'", "--width", "4'", "--cost", "60", "--json"]);
    expect(stock.json().stock).toMatchObject({ material: "plywood-3-4", length: 96, width: 48 });
    expect((await real(["parts", "add", file, "--name", "Top", "--length", "60", "--width", "30", "--json"])).code).toBe(0);
    expect((await real(["parts", "add", file, "--name", "Leg panel", "--length", "28 1/2", "--width", "24", "--quantity", "2", "--json"])).code).toBe(0);
    expect((await real(["parts", "add", file, "--name", "Shelf", "--length", "56\"", "--width", "12", "--grain", "none", "--json"])).code).toBe(0);
    const optimized = await real(["optimize", file, "--iterations", "50", "--seed", "3", "--strict", "--json"]);
    expect(optimized.code).toBe(0);
    expect(optimized.json().after).toMatchObject({ unplacedCopies: 0, errors: 0 });
    const shopping = await real(["report", "shopping", file, "--json"]);
    expect(shopping.json().total).toBe(60 * shopping.json().sheetsToBuy);
    const steps = await real(["report", "sequence", file, "--json"]);
    expect(steps.json().steps.length).toBeGreaterThan(0);
    const svg = await real(["export", "svg", file, "--out", join(dir, "svg"), "--json"]);
    expect(svg.code).toBe(0);
    const files = await readdir(join(dir, "svg"));
    expect(files).toEqual(svg.json().files.map((f: { sheetNumber: number }) => `Desk-sheet-${f.sheetNumber}.svg`));
    expect(await readFile(join(dir, "svg", files[0]!), "utf8")).toMatch(/^<svg /);
    const valid = await real(["validate", file, "--strict", "--json"]);
    expect(valid.json()).toMatchObject({ ok: true, valid: true });
    expect((await readdir(dir)).sort()).toEqual(["desk.cutplan.json", "svg"]);
  });

  it("gives exit 3 for a file that is missing or not a project", async () => {
    expect((await real(["show", join(dir, "missing.json")])).code).toBe(3);
    const bad = join(dir, "bad.json");
    await real(["new", bad, "--name", "X", "--units", "mm"]);
    await nodeIo().writeFile(bad, "{ not json");
    const result = await real(["parts", "add", bad, "--name", "A", "--length", "1", "--width", "1", "--json"]);
    expect(result.code).toBe(3);
    expect(result.json().error.code).toBe("unreadable-project");
    expect(await readFile(bad, "utf8")).toBe("{ not json");
  });
});
