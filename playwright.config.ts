import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

/**
 * E2E config (CP3). Loads .env.local exactly as Next does, so local runs and CI
 * (which exports the keys from `supabase status` into the environment) share
 * one source of truth. The webServer runs a PRODUCTION build+start — that is
 * the artifact CI ships, and it means the e2e job is the first thing to `next
 * build` the app (catching build breaks the static job can't). Public/ISR
 * revalidation legs of the journey are deferred to CP4 (see the spec).
 */
loadEnvConfig(process.cwd());

const PORT = 3100;
const baseURL = process.env.PORTAL_E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1, // the journey mutates a single shared fixture — never parallel
  forbidOnly: !!process.env.CI, // a stray test.only must fail CI, not pass it
  retries: 0,
  timeout: 150_000, // headroom for MFA window-wait retries across 30s TOTP steps
  expect: { timeout: 12_000 },
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start:e2e",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
