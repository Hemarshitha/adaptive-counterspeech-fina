import { defineConfig } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

mkdirSync(resolve("../work/extension-tests"), { recursive: true });
export default defineConfig({
  testDir: "../extension/tests",
  testMatch: "extension.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 45000,
  expect: { timeout: 10000 },
  outputDir: "../work/extension-test-results",
  reporter: "list",
  webServer: {
    command: `"${process.env.PYTHON || "../work/.venv/bin/python"}" -m uvicorn tests.serve_extension_fixture:app --host 127.0.0.1 --port 8013`,
    url: "http://127.0.0.1:8013/health",
    reuseExistingServer: false,
    env: {
      RESEARCH_API_KEY:
        "extension-test-only-research-key-at-least-24-characters",
      DATABASE_URL: `sqlite:///${resolve("../work/extension-tests/research.db")}`,
    },
  },
});
