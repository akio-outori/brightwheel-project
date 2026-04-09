// Vitest config for the integration suite.
//
// These tests hit the real Anthropic API and the real MinIO stack.
// They are NOT included in the default `npm test` run. Run them
// with `npm run test:integration` when you want to verify trust-loop
// behavior against a live model.
//
// Guardrails:
// - fileParallelism: false (sequential files) to avoid rate-limiting
// - testTimeout: 45s per test — real model calls are usually 1-3s
//   on Haiku but can spike
// - Include only lib/__integration__/**/*.test.ts
// - helpers file (_helpers.ts) is excluded from collection via the
//   leading underscore not matching the include glob

import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/__integration__/**/*.test.ts"],
    exclude: ["node_modules", ".next", "dist"],
    testTimeout: 45_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
