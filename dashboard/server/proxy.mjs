import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { createExtensionBridge } from "./extension.mjs";

const uuid =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const readRoute = new RegExp(
  `^/(health|v1/capabilities|v1/runs(?:/${uuid})?|v1/conversations/${uuid})$`,
);
const writeRoute = new RegExp(`^/v1/(runs|conversations(?:/${uuid}/turns)?)$`);
const json = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
};

export function createHandler({
  backendUrl,
  apiKey,
  port,
  timeoutMs = 660000,
  dist,
  development,
  fetchImpl = fetch,
  extensionId,
  extensionOptions = {},
}) {
  const backend = new URL(backendUrl);
  if (
    backend.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(backend.hostname) ||
    backend.username ||
    backend.password ||
    backend.search ||
    backend.hash ||
    backend.pathname !== "/"
  ) {
    throw new Error(
      "Dashboard backend must be a loopback HTTP origin without credentials or path",
    );
  }
  const hosts = new Set([
    `localhost:${port}`,
    `127.0.0.1:${port}`,
    `[::1]:${port}`,
  ]);
  const origins = new Set([...hosts].map((host) => `http://${host}`));
  const extension = createExtensionBridge({
    extensionId,
    backend,
    apiKey,
    fetchImpl,
    timeoutMs,
    ...extensionOptions,
  });
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      `default-src 'self'; script-src 'self'${development ? " 'unsafe-inline'" : ""}; style-src 'self' 'unsafe-inline'; connect-src 'self'${development ? " ws://localhost:* ws://127.0.0.1:*" : ""}; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
    );
    if (!hosts.has(req.headers.host)) {
      return json(res, 403, { detail: { code: "dashboard_origin_rejected" } });
    }
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/extension/")) {
      if (extensionId) return extension(req, res, url);
      return json(res, 403, {
        detail: { code: "extension_pairing_not_enabled" },
      });
    }
    if (
      (req.headers.origin && !origins.has(req.headers.origin)) ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return json(res, 403, { detail: { code: "dashboard_origin_rejected" } });
    if (url.pathname.startsWith("/api/")) {
      const path = url.pathname.slice(4);
      const allowed =
        req.method === "GET"
          ? readRoute.test(path)
          : req.method === "POST" && writeRoute.test(path);
      if (!allowed)
        return json(res, 404, {
          detail: { code: "dashboard_route_not_found" },
        });
      if (!apiKey)
        return json(res, 503, {
          detail: { code: "dashboard_access_not_configured" },
        });
      if (
        req.method === "POST" &&
        (!origins.has(req.headers.origin) ||
          !req.headers["content-type"]?.startsWith("application/json"))
      ) {
        return json(res, 403, {
          detail: { code: "dashboard_json_origin_required" },
        });
      }
      // Only the bounded list limit is forwarded; never forward arbitrary destinations/headers.
      const query =
        path === "/v1/runs" &&
        req.method === "GET" &&
        url.searchParams.has("limit")
          ? `?limit=${encodeURIComponent(url.searchParams.get("limit"))}`
          : "";
      let body;
      if (req.method === "POST") {
        const chunks = [];
        let length = 0;
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 131072)
            return json(res, 413, {
              detail: { code: "dashboard_request_too_large" },
            });
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks);
      }
      try {
        const upstream = await fetchImpl(new URL(path + query, backend), {
          method: req.method,
          body,
          headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
          redirect: "error",
          signal: AbortSignal.timeout(timeoutMs),
        });
        const data = await upstream.text();
        if (
          !upstream.headers.get("content-type")?.includes("application/json")
        ) {
          return json(res, 502, {
            detail: { code: "backend_invalid_response" },
          });
        }
        res.writeHead(upstream.status, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(data);
      } catch {
        // Never echo transport exceptions, environment values or credential-bearing request objects.
        json(res, 502, {
          detail: { code: "backend_unreachable_or_timed_out" },
        });
      }
      return;
    }
    // Apply this before Vite's SPA fallback as well as production file handling.
    // A missing .env must never become a successful HTML fallback, and a present
    // one must never be served through a development middleware route.
    if (
      /(^|\/)\.env(?:\.|$)|(^|\/)\.(git|aws|codex|agents)(\/|$)|^\/server(?:\/|$)/.test(
        decodeURIComponent(url.pathname),
      )
    ) {
      return json(res, 404, { detail: { code: "private_path_not_found" } });
    }
    if (development) return development(req, res);
    if (req.method !== "GET" && req.method !== "HEAD")
      return json(res, 405, { detail: { code: "method_not_allowed" } });
    const root = resolve(dist);
    const file = resolve(root, "." + url.pathname);
    if (file !== root && !file.startsWith(root + sep))
      return json(res, 404, {});
    const publicPath =
      url.pathname === "/" || /^\/runs\/[0-9a-f-]+$/i.test(url.pathname)
        ? resolve(root, "index.html")
        : file;
    // The production server exposes only the built public assets, never source or .env files.
    if (
      publicPath !== resolve(root, "index.html") &&
      !publicPath.startsWith(resolve(root, "assets") + sep)
    ) {
      return json(res, 404, {});
    }
    try {
      const content = await readFile(publicPath);
      const mime =
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
        }[extname(publicPath)] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch {
      json(res, 404, {
        detail: { code: "asset_not_found_build_dashboard_first" },
      });
    }
  };
}
