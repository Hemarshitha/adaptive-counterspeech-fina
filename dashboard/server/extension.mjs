import { randomBytes, timingSafeEqual } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const equal = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const json = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
};
async function bodyJSON(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) throw new Error("body_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

// Independent, opt-in boundary. Never adds extension origins to the dashboard API.
export function createExtensionBridge({
  extensionId,
  backend,
  apiKey,
  fetchImpl,
  timeoutMs,
  now = Date.now,
  announce = console.log,
}) {
  if (!extensionId) return () => false;
  if (!/^[a-p]{32}$/.test(extensionId))
    throw new Error("Invalid DASHBOARD_EXTENSION_ID");
  const origin = `chrome-extension://${extensionId}`;
  let code = randomBytes(24).toString("base64url");
  const pairDeadline = now() + 5 * 60_000;
  let attempts = 0;
  let session;
  announce(
    `Extension pairing code (single use, expires in 5 minutes): ${code}`,
  );

  return async (req, res, url) => {
    if (!url.pathname.startsWith("/extension/")) return false;
    // Some Chromium extension fetches omit Origin when host permissions authorize
    // the request. Require the configured ID header in that case; the one-time
    // code/session credential is still mandatory. Web origins are never accepted.
    if (
      req.headers.origin !== origin &&
      (req.headers.origin || req.headers["x-extension-id"] !== extensionId)
    )
      return json(res, 403, { detail: { code: "extension_origin_rejected" } });
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    if (req.method === "OPTIONS") {
      if (
        !["GET", "POST"].includes(
          req.headers["access-control-request-method"],
        ) ||
        (req.headers["access-control-request-headers"] || "")
          .split(",")
          .some(
            (h) =>
              h.trim() &&
              !["content-type", "x-extension-token", "x-extension-id"].includes(
                h.trim().toLowerCase(),
              ),
          )
      )
        return json(res, 403, {
          detail: { code: "extension_preflight_rejected" },
        });
      res.setHeader("Access-Control-Allow-Methods", "GET, POST");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, X-Extension-Token, X-Extension-ID",
      );
      res.writeHead(204);
      res.end();
      return;
    }
    if (url.search || !["GET", "POST"].includes(req.method))
      return json(res, 404, { detail: { code: "extension_route_not_found" } });
    let body;
    if (req.method === "POST") {
      if (req.headers["content-type"]?.split(";")[0] !== "application/json")
        return json(res, 415, { detail: { code: "extension_json_required" } });
      try {
        body = await bodyJSON(req);
      } catch (error) {
        return json(res, error.message === "body_too_large" ? 413 : 400, {
          detail: { code: "extension_invalid_body" },
        });
      }
      if (!body || typeof body !== "object" || Array.isArray(body))
        return json(res, 400, { detail: { code: "extension_invalid_body" } });
    }
    if (url.pathname === "/extension/pair" && req.method === "POST") {
      if (!apiKey)
        return json(res, 503, {
          detail: { code: "dashboard_access_not_configured" },
        });
      attempts++;
      if (
        !code ||
        now() >= pairDeadline ||
        attempts > 5 ||
        !equal(body.code, code)
      )
        return json(res, 401, {
          detail: { code: "pairing_invalid_or_expired_restart_dashboard" },
        });
      code = null;
      session = {
        token: randomBytes(32).toString("base64url"),
        expires: now() + 30 * 60_000,
        conversations: new Set(),
        runs: new Set(),
        busy: false,
      };
      return json(res, 201, {
        token: session.token,
        expires_at: session.expires,
      });
    }
    if (
      !session ||
      now() >= session.expires ||
      !equal(req.headers["x-extension-token"], session.token)
    )
      return json(res, 401, {
        detail: { code: "extension_session_expired_pair_again" },
      });
    if (url.pathname === "/extension/disconnect" && req.method === "POST") {
      session = null;
      return json(res, 200, { disconnected: true });
    }
    const grant = session; // keep an in-flight run scoped if the user disconnects
    let path = url.pathname.slice("/extension".length);
    let method = req.method;
    const attach = path === "/v1/attach" && method === "POST";
    if (attach) {
      if (Object.keys(body).length !== 1 || !UUID.test(body.conversation_id))
        return json(res, 422, { detail: { code: "invalid_conversation_id" } });
      path = `/v1/conversations/${body.conversation_id}`;
      method = "GET";
    }
    const parts = path.split("/");
    const id = parts[3];
    const caps = path === "/v1/capabilities" && method === "GET";
    const create = path === "/v1/conversations" && method === "POST";
    const run = path === "/v1/runs" && method === "POST";
    const conversation =
      parts.length === 4 &&
      parts[2] === "conversations" &&
      UUID.test(id) &&
      method === "GET" &&
      (attach || grant.conversations.has(id));
    const turn =
      parts.length === 5 &&
      parts[2] === "conversations" &&
      parts[4] === "turns" &&
      UUID.test(id) &&
      method === "POST" &&
      grant.conversations.has(id);
    const read =
      parts.length === 4 &&
      parts[2] === "runs" &&
      UUID.test(id) &&
      method === "GET" &&
      grant.runs.has(id);
    if (!(caps || create || run || conversation || turn || read))
      return json(res, 403, { detail: { code: "extension_scope_rejected" } });
    if (
      run &&
      (!grant.conversations.has(body.conversation_id) ||
        body.mode !== "full" ||
        body.candidate_count !== 2 ||
        ![0, 1].includes(body.max_refinements) ||
        body.initial_context?.length)
    )
      return json(res, 422, {
        detail: { code: "extension_run_scope_invalid" },
      });
    if (method === "POST" && grant.busy)
      return json(res, 409, {
        detail: { code: "extension_request_in_progress" },
      });
    if (method === "POST") grant.busy = true;
    try {
      const response = await fetchImpl(new URL(path, backend), {
        method,
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: method === "POST" ? JSON.stringify(body) : undefined,
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.headers.get("content-type")?.includes("application/json"))
        throw new Error();
      const data = await response.json();
      if (
        response.ok &&
        (create || conversation) &&
        UUID.test(data.conversation_id)
      ) {
        grant.conversations.add(data.conversation_id);
        for (const item of data.runs || [])
          if (UUID.test(item.run_id)) grant.runs.add(item.run_id);
        if (UUID.test(data.active_run_id)) grant.runs.add(data.active_run_id);
      }
      const detail = response.ok ? data : data.detail;
      if (run && UUID.test(detail?.run_id)) grant.runs.add(detail.run_id);
      return json(res, response.status, data);
    } catch {
      return json(res, 502, {
        detail: { code: "backend_unreachable_or_timed_out" },
      });
    } finally {
      if (method === "POST") grant.busy = false;
    }
  };
}
