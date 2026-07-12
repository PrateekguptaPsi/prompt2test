import { defineConfig } from "@playwright/test";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";

// Everything is anchored to this config's directory, NOT process.cwd():
// the suite must behave identically whether launched from the repo root or
// from inside 05_automation/ (the cwd-dependent version nested its own
// reports under 05_automation/05_automation/).
const AUTOMATION_DIR = __dirname;
const REPO_ROOT = path.resolve(AUTOMATION_DIR, "..");

function loadDotEnvFileIfPresent(): void {
  const envPath = path.join(REPO_ROOT, ".env");
  if (!existsSync(envPath)) return;

  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;

    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadDotEnvFileIfPresent();

const ODOO_URL = process.env.ODOO_URL;
export const AUTH_STATE = path.join(AUTOMATION_DIR, ".auth", "user.json");

if (!ODOO_URL) {
  throw new Error("Missing required environment variable: ODOO_URL");
}

export default defineConfig({
  testDir: path.join(AUTOMATION_DIR, "tests"),
  // The themed SPA on this shared hackathon server is slow: module nav alone
  // can take 45s to mount after a redeploy. 60s total was causing timeouts.
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  // All FE cases live in one spec file, so parallelism requires fullyParallel
  // (workers alone only parallelize across files). Safe now that every page
  // self-heals its session; each test is independent (own nav + discard).
  fullyParallel: true,
  // Tune with PW_WORKERS; default 3 balances speed against the shared
  // hackathon server's latency (too many workers = server-side slowdowns).
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : 3,
  retries: 1,
  reporter: [
    ["html", { outputFolder: path.join(AUTOMATION_DIR, "reports", "html"), open: "never" }],
    ["junit", { outputFile: path.join(AUTOMATION_DIR, "reports", "junit", "results.xml") }],
    [path.join(AUTOMATION_DIR, "reporters", "psiSummaryReporter.ts")],
    ["list"],
  ],
  use: {
    baseURL: ODOO_URL,
    headless: true,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
    viewport: { width: 1920, height: 1080 },
  },
  outputDir: path.join(AUTOMATION_DIR, "test-results"),
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      testMatch: /.*\.spec\.ts/,
      dependencies: ["setup"],
      use: {
        browserName: "chromium",
        storageState: AUTH_STATE,
      },
    },
  ],
});
