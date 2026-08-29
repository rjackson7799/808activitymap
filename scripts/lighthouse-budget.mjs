import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";

const PORT = 3100;
const BASE_URL = process.env.LIGHTHOUSE_BASE_URL ?? `http://127.0.0.1:${PORT}`;
// The homepage is the reproducible CI fixture. Override LIGHTHOUSE_PATH with
// the reference listing once its seeded storage photos are committed/uploaded.
const TARGET_PATH = process.env.LIGHTHOUSE_PATH ?? "/";
// Five samples reduce browser/host scheduling variance around the strict LCP line.
const RUNS = Number(process.env.LIGHTHOUSE_RUNS ?? 5);
const MAX_ATTEMPTS_PER_RUN = 3;
// Two-times slowdown models the required iPhone 12-class launch device.
const CPU_SLOWDOWN = Number(process.env.LIGHTHOUSE_CPU_SLOWDOWN ?? 2);
const OUTPUT_DIR = ".lighthouse";

const BUDGETS = {
  performance: 0.9,
  accessibility: 0.9,
  "best-practices": 0.9,
  largestContentfulPaintMs: 2_500,
  totalByteWeight: 500 * 1024,
};

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startServer() {
  const nextBin = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
  const child = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  return child;
}

const config = {
  extends: "lighthouse:default",
  settings: {
    // SEO is intentionally excluded: local, test, and staging environments are
    // required to disallow indexing, which Lighthouse correctly scores down.
    onlyCategories: ["performance", "accessibility", "best-practices"],
    formFactor: "mobile",
    throttlingMethod: "simulate",
    throttling: {
      rttMs: 150,
      throughputKbps: 1_600,
      requestLatencyMs: 562.5,
      downloadThroughputKbps: 1_474.56,
      uploadThroughputKbps: 675,
      cpuSlowdownMultiplier: CPU_SLOWDOWN,
    },
    screenEmulation: {
      mobile: true,
      width: 360,
      height: 800,
      deviceScaleFactor: 2,
      disabled: false,
    },
  },
};

const shouldStartServer = !process.env.LIGHTHOUSE_BASE_URL;
const server = shouldStartServer ? startServer() : undefined;
let chrome;

try {
  await waitForServer(`${BASE_URL}${TARGET_PATH}`);
  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(`${OUTPUT_DIR}/chrome-profile`, { recursive: true });
  chrome = await chromeLauncher.launch({
    chromePath: process.env.CHROME_PATH,
    userDataDir: `${OUTPUT_DIR}/chrome-profile`,
    chromeFlags: ["--headless", "--no-sandbox", "--disable-dev-shm-usage"],
  });

  const results = [];
  for (let index = 1; index <= RUNS; index += 1) {
    let validResult;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_RUN; attempt += 1) {
      const result = await lighthouse(
        `${BASE_URL}${TARGET_PATH}`,
        {
          port: chrome.port,
          logLevel: process.env.LIGHTHOUSE_LOG_LEVEL ?? "error",
          output: "json",
          maxWaitForLoad: 60_000,
        },
        config,
      );
      const lcp = result?.lhr.audits["largest-contentful-paint"].numericValue;
      const isValid = result && !result.lhr.runtimeError && Number.isFinite(lcp);
      if (isValid) {
        validResult = result;
        break;
      }

      if (result) {
        await writeFile(
          `${OUTPUT_DIR}/run-${index}-attempt-${attempt}-invalid.json`,
          result.report,
          "utf8",
        );
      }
      const reason = result?.lhr.runtimeError?.message ?? "missing a finite LCP measurement";
      console.warn(`Lighthouse run ${index}, attempt ${attempt} was invalid: ${reason}`);
    }

    if (!validResult) {
      throw new Error(
        `Lighthouse run ${index} did not produce a valid trace after ${MAX_ATTEMPTS_PER_RUN} attempts`,
      );
    }
    await writeFile(`${OUTPUT_DIR}/run-${index}.json`, validResult.report, "utf8");
    results.push(validResult.lhr);
  }

  const summary = {
    url: `${BASE_URL}${TARGET_PATH}`,
    runs: RUNS,
    performance: median(results.map((lhr) => lhr.categories.performance.score ?? 0)),
    accessibility: median(results.map((lhr) => lhr.categories.accessibility.score ?? 0)),
    "best-practices": median(results.map((lhr) => lhr.categories["best-practices"].score ?? 0)),
    largestContentfulPaintMs: median(
      results.map((lhr) => lhr.audits["largest-contentful-paint"].numericValue ?? Infinity),
    ),
    totalByteWeight: median(
      results.map((lhr) => lhr.audits["total-byte-weight"].numericValue ?? Infinity),
    ),
  };
  await writeFile(`${OUTPUT_DIR}/summary.json`, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const failures = [];
  for (const category of ["performance", "accessibility", "best-practices"]) {
    if (summary[category] < BUDGETS[category]) {
      failures.push(`${category} ${summary[category]} < ${BUDGETS[category]}`);
    }
  }
  if (summary.largestContentfulPaintMs > BUDGETS.largestContentfulPaintMs) {
    failures.push(
      `LCP ${Math.round(summary.largestContentfulPaintMs)}ms > ${BUDGETS.largestContentfulPaintMs}ms`,
    );
  }
  if (summary.totalByteWeight > BUDGETS.totalByteWeight) {
    failures.push(`page weight ${Math.round(summary.totalByteWeight)}B > ${BUDGETS.totalByteWeight}B`);
  }

  console.log(JSON.stringify(summary, null, 2));
  if (failures.length > 0) {
    throw new Error(`Lighthouse budget failed:\n- ${failures.join("\n- ")}`);
  }
} finally {
  if (chrome) {
    try {
      await chrome.kill();
    } catch (error) {
      console.warn(`Chrome cleanup warning: ${error instanceof Error ? error.message : error}`);
    }
  }
  server?.kill();
}
