import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { config } from "dotenv";
import { Agent } from "undici";
import { createHandler } from "./proxy.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
config({ path: resolve(root, ".env"), quiet: true });
const port = Number(process.env.DASHBOARD_PORT || 5173);
const timeoutMs = Number(process.env.DASHBOARD_TIMEOUT_MS || 660000);
if (
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535 ||
  !Number.isFinite(timeoutMs) ||
  timeoutMs < 1000
) {
  throw new Error("Invalid dashboard port or timeout");
}
const production = process.argv.includes("--production");
// Node fetch otherwise has a shorter default header deadline than a backend run.
const dispatcher = new Agent({
  headersTimeout: timeoutMs,
  bodyTimeout: timeoutMs,
});
let vite;
if (!production) {
  const { createServer: createViteServer } = await import("vite");
  vite = await createViteServer({
    root,
    server: {
      host: "127.0.0.1",
      hmr: { host: "127.0.0.1" },
      middlewareMode: true,
      allowedHosts: ["localhost", "127.0.0.1"],
    },
    appType: "spa",
  });
}
const handler = createHandler({
  backendUrl: process.env.DASHBOARD_BACKEND_URL || "http://127.0.0.1:8000",
  apiKey: process.env.RESEARCH_API_KEY,
  port,
  timeoutMs,
  dist: resolve(root, "dist"),
  development: vite?.middlewares,
  fetchImpl: (url, options) => fetch(url, { ...options, dispatcher }),
});
const server = createServer((req, res) => {
  Promise.resolve(handler(req, res)).catch(() => {
    if (!res.headersSent)
      res.writeHead(500, { "Content-Type": "application/json" });
    res.end('{"detail":{"code":"dashboard_internal_error"}}');
  });
});
server.requestTimeout = timeoutMs + 10000;
server.listen(port, "127.0.0.1", () =>
  console.log(`Research dashboard: http://127.0.0.1:${port}`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    await vite?.close();
    await dispatcher.close();
    server.close();
  });
