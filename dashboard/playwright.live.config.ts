import { defineConfig } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

if (process.env.RUN_REAL_MODEL_TESTS !== "1")
  throw new Error(
    "Set RUN_REAL_MODEL_TESTS=1 to explicitly run billable real-model integration.",
  );
for (const field of ["LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL"]) {
  if (!process.env[field])
    throw new Error(`Server environment is missing ${field}`);
}
mkdirSync("../work/dashboard-live", { recursive: true });
const key = randomBytes(32).toString("hex"); // ephemeral server-only access credential
export default defineConfig({
  testDir: "./tests",
  testMatch:
    process.env.LIVE_INSPECT_ONLY === "1"
      ? "live-inspect.spec.ts"
      : "live.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 700000,
  expect: { timeout: 15000 },
  reporter: "list",
  outputDir: "../work/live-browser-results",
  // Never record a Playwright network trace for live credentials / study inputs.
  use: {
    baseURL: "http://127.0.0.1:5175",
    trace: "off",
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  },
  webServer: [
    {
      command: `${process.env.PYTHON || "../work/.venv/bin/python"} -m uvicorn counterspeech.api:app_factory --factory --host 127.0.0.1 --port 8012`,
      url: "http://127.0.0.1:8012/health",
      reuseExistingServer: false,
      env: {
        RESEARCH_API_KEY: key,
        DATABASE_URL:
          process.env.DASHBOARD_LIVE_DATABASE_URL ||
          `sqlite:///${resolve("../work/dashboard-live/research.db")}`,
        PROVIDER_RETRIES: "0",
        MAX_RUN_SECONDS: "600",
        PROVIDER_TIMEOUT_SECONDS: "60",
      },
    },
    {
      command: "node server/index.mjs --production",
      url: "http://127.0.0.1:5175",
      reuseExistingServer: false,
      env: {
        RESEARCH_API_KEY: key,
        DASHBOARD_PORT: "5175",
        DASHBOARD_BACKEND_URL: "http://127.0.0.1:8012",
      },
    },
  ],
});
