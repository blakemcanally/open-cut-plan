#!/usr/bin/env node
import { nodeIo } from "./io.ts";
import { run } from "./run.ts";

process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code !== "EPIPE") throw error;
  process.exit(process.exitCode ?? 0);
});

process.exitCode = await run(process.argv.slice(2), nodeIo());
