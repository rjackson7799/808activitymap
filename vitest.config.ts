import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname) },
  },
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
        resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
      },
      {
        test: {
          name: "db",
          environment: "node",
          include: ["tests/db/**/*.test.ts"],
          // DB suites share one local Postgres; serialize files so fixtures
          // and GUC-based role simulation never interleave.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
        resolve: { alias: { "@": path.resolve(import.meta.dirname) } },
      },
    ],
  },
});
