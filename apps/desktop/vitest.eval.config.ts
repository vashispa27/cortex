import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Separate from `npm test`: these runs call a real model and take minutes.
export default defineConfig({
  resolve: { alias: { "@tauri-apps/api/core": fileURLToPath(new URL("./evals/tauri-shim.ts", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["evals/*.eval.ts", "evals/decision/*.eval.ts"],
    setupFiles: ["evals/setup.ts"],
    testTimeout: 6 * 60 * 60 * 1000,
    hookTimeout: 5 * 60 * 1000,
    fileParallelism: false,
  },
});
