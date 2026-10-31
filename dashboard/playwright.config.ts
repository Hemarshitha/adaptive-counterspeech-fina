import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";

// A clean checkout does not contain ignored scratch/database directories.
mkdirSync(resolve("../work"), { recursive: true });
const key = "browser-test-only-access-key-at-least-24-characters";
export default defineConfig({
  testDir: "./tests",
  testMatch: "dashboard.spec.ts",
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  outputDir: "../work/browser-test-results",
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "retain-on-failure",
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  },
  webServer: [
    {
      command: `"${process.env.PYTHON || "../work/.venv/bin/python"}" -m uvicorn tests.serve_fixture:app --host 127.0.0.1 --port 8011`,
      url: "http://127.0.0.1:8011/health",
      reuseExistingServer: false,
      env: {
        RESEARCH_API_KEY: key,
        DATABASE_URL: `sqlite:///${resolve("../work/browser-tests.db")}`,
      },
    },
    {
      command: "node server/index.mjs --production",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
      env: {
        RESEARCH_API_KEY: key,
        DASHBOARD_PORT: "5174",
        DASHBOARD_BACKEND_URL: "http://127.0.0.1:8011",
      },
    },
  ],
});
