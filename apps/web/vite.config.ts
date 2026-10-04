import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  plugins: [react()],
  worker: { format: "es" },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    testTimeout: 30_000,
  },
});
