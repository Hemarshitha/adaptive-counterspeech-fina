import { createServer, request } from "node:http";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "./proxy.mjs";

// Real HTTP boundary tests, with a deliberately mocked upstream fetch implementation.
const key = "TEST-ONLY-SERVER-ACCESS-KEY-DO-NOT-USE";
let server, origin, lastRequest, reply;
before(async () => {
  reply = () =>
    new Response('{"runs":[]}', {
      headers: { "content-type": "application/json" },
    });
  server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  origin = `http://127.0.0.1:${port}`;
  const handler = createHandler({
    backendUrl: "http://127.0.0.1:8000",
    apiKey: key,
    port,
    dist: new URL("../dist", import.meta.url).pathname,
    fetchImpl: async (url, options) => {
      lastRequest = { url: String(url), options };
      return reply();
    },
  });
  server.on("request", handler);
});
after(() => new Promise((resolve) => server.close(resolve)));
test("injects credentials server-side, ignores browser credentials and preserves JSON", async () => {
  const response = await fetch(origin + "/api/v1/runs?limit=100", {
    headers: { "X-API-Key": "BROWSER-ATTACK" },
  });
  assert.equal(response.status, 200);
  assert.equal(lastRequest.options.headers["X-API-Key"], key);
  assert.equal(lastRequest.url, "http://127.0.0.1:8000/v1/runs?limit=100");
  assert.equal(lastRequest.options.redirect, "error");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert(!JSON.stringify([...response.headers]).includes(key));
  assert(!(await response.text()).includes(key));
});
test("rejects cross-origin writes, missing origins and DNS rebinding hosts", async () => {
  for (const headers of [{ Origin: "https://attacker.example" }, {}]) {
    const response = await fetch(origin + "/api/v1/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: "{}",
    });
    assert.equal(response.status, 403);
  }
  const status = await new Promise((resolve) => {
    const req = request(
      origin + "/api/v1/runs",
      { headers: { Host: "attacker.example" } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.end();
  });
  assert.equal(status, 403);
});
test("allows same-origin JSON writes only through the route whitelist", async () => {
  const response = await fetch(origin + "/api/v1/runs", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: '{"text":"TEST"}',
  });
  assert.equal(response.status, 200);
  assert.equal(lastRequest.options.body.toString(), '{"text":"TEST"}');
  assert.equal((await fetch(origin + "/api/v1/private/secrets")).status, 404);
  assert.equal((await fetch(origin + "/.env")).status, 404);
  assert.equal((await fetch(origin + "/server/index.mjs")).status, 404);
});
test("preserves provider failure trace IDs and sanitizes transport exceptions", async () => {
  reply = () =>
    new Response(
      '{"detail":{"code":"provider_rate_limited","run_id":"persisted-id"}}',
      { status: 502, headers: { "content-type": "application/json" } },
    );
  const response = await fetch(origin + "/api/v1/runs");
  assert.equal(response.status, 502);
  assert.equal((await response.json()).detail.run_id, "persisted-id");
  reply = () => {
    throw new Error(key);
  };
  const failure = await fetch(origin + "/api/v1/runs");
  assert.equal(failure.status, 502);
  assert(!(await failure.text()).includes(key));
});
test("rejects oversized bodies before forwarding", async () => {
  const response = await fetch(origin + "/api/v1/runs", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: "x".repeat(140000),
  });
  assert.equal(response.status, 413);
});
test("does not permit remote credential destinations or embedded URL credentials", () => {
  for (const backendUrl of [
    "https://attacker.example",
    "http://user:password@127.0.0.1:8000",
    "http://127.0.0.1:8000/redirect",
  ]) {
    assert.throws(() => createHandler({ backendUrl, port: 5173, apiKey: key }));
  }
});

test("development middleware never receives private file or server-source requests", async () => {
  let handler;
  const local = createServer((req, res) => handler(req, res));
  await new Promise((resolve) => local.listen(0, "127.0.0.1", resolve));
  const port = local.address().port;
  const visited = [];
  handler = createHandler({
    backendUrl: "http://127.0.0.1:8000",
    port,
    apiKey: key,
    development: (req, res) => {
      visited.push(req.url);
      res.end("TEST dev module");
    },
  });
  try {
    for (const path of [
      "/.env",
      "/.env.local",
      "/@fs/workspace/.env",
      "/server/index.mjs",
      "/.git/config",
    ]) {
      assert.equal(
        (await fetch(`http://127.0.0.1:${port}${path}`)).status,
        404,
      );
    }
    assert.equal(
      (await fetch(`http://127.0.0.1:${port}/src/main.tsx`)).status,
      200,
    );
    assert.deepEqual(visited, ["/src/main.tsx"]);
  } finally {
    await new Promise((resolve) => local.close(resolve));
  }
});
