import { createServer, request } from "node:http";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "./proxy.mjs";

const extensionId = "a".repeat(32);
const extensionOrigin = `chrome-extension://${extensionId}`;
const conversationId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const researchKey = "SERVER-ONLY-RESEARCH-KEY";
async function harness(fn) {
  let code,
    time = 0,
    last,
    answer;
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;
  server.on(
    "request",
    createHandler({
      backendUrl: "http://127.0.0.1:8000",
      apiKey: researchKey,
      port,
      extensionId,
      extensionOptions: {
        now: () => time,
        announce: (text) => {
          code = text.split(": ").at(-1);
        },
      },
      fetchImpl: async (url, options) => {
        last = { url: String(url), options };
        return new Response(
          JSON.stringify(
            answer || {
              conversation_id: conversationId,
              runs: [{ run_id: runId }],
            },
          ),
          {
            status: answer?.detail ? 502 : 201,
            headers: { "content-type": "application/json" },
          },
        );
      },
    }),
  );
  const send = (path, body, token, extra = {}) =>
    fetch(origin + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Origin: extensionOrigin,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { "X-Extension-Token": token } : {}),
        ...extra,
      },
      body:
        body === undefined
          ? undefined
          : typeof body === "string"
            ? body
            : JSON.stringify(body),
    });
  const pair = async () =>
    (await (await send("/extension/pair", { code })).json()).token;
  try {
    await fn({
      send,
      pair,
      origin,
      getCode: () => code,
      advance: (ms) => {
        time += ms;
      },
      last: () => last,
      reply: (data) => {
        answer = data;
      },
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
test("single-use pairing issues an expiring credential without revealing research keys", () =>
  harness(async (h) => {
    const code = h.getCode();
    const response = await h.send("/extension/pair", { code });
    assert.equal(response.status, 201);
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      extensionOrigin,
    );
    assert.equal(response.headers.get("cache-control"), "no-store");
    const result = await response.json();
    assert(result.token && !JSON.stringify(result).includes(researchKey));
    assert.equal(result.expires_at, 30 * 60_000);
    assert.equal((await h.send("/extension/pair", { code })).status, 401);
  }));
test("rejects unknown/missing origins and leaves all dashboard origin checks intact", () =>
  harness(async (h) => {
    const token = await h.pair();
    for (const Origin of [
      "https://www.youtube.com",
      `chrome-extension://${"b".repeat(32)}`,
      "null",
      "",
    ]) {
      const r = await h.send("/extension/v1/capabilities", undefined, token, {
        Origin,
      });
      assert.equal(r.status, 403);
      assert.equal(r.headers.get("access-control-allow-origin"), null);
    }
    for (const path of ["/api/v1/runs", "/", "/assets/app.js"]) {
      assert.equal((await h.send(path, undefined, token)).status, 403);
    }
    const status = await new Promise((resolve) => {
      request(
        h.origin + "/extension/v1/capabilities",
        { headers: { Host: "evil.example", Origin: extensionOrigin } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      ).end();
    });
    assert.equal(status, 403);
  }));
test("requires session tokens and scopes reads to explicitly attached conversations", () =>
  harness(async (h) => {
    assert.equal((await h.send("/extension/v1/capabilities")).status, 401);
    const token = await h.pair();
    assert.equal(
      (await h.send(`/extension/v1/runs/${runId}`, undefined, token)).status,
      403,
    );
    assert.equal(
      (await h.send("/extension/v1/runs", undefined, token)).status,
      403,
    );
    assert.equal(
      (
        await h.send(
          "/extension/v1/attach",
          { conversation_id: conversationId },
          token,
        )
      ).status,
      201,
    );
    assert.equal(h.last().options.method, "GET");
    assert.equal(
      (await h.send(`/extension/v1/runs/${runId}`, undefined, token)).status,
      201,
    );
    assert.equal(h.last().options.headers["X-API-Key"], researchKey);
    assert.equal(h.last().options.redirect, "error");
  }));
test("bounds pairing attempts and expires unused pairing codes", () =>
  harness(async (h) => {
    const code = h.getCode();
    for (let i = 0; i < 5; i++)
      assert.equal(
        (await h.send("/extension/pair", { code: "wrong" })).status,
        401,
      );
    assert.equal((await h.send("/extension/pair", { code })).status, 401);
  }));
test("pair and session deadlines plus explicit revocation are enforced", async () => {
  await harness(async (h) => {
    h.advance(300000);
    assert.equal(
      (await h.send("/extension/pair", { code: h.getCode() })).status,
      401,
    );
  });
  await harness(async (h) => {
    const token = await h.pair();
    h.advance(1800000);
    assert.equal(
      (await h.send("/extension/v1/capabilities", undefined, token)).status,
      401,
    );
  });
  await harness(async (h) => {
    const token = await h.pair();
    assert.equal(
      (await h.send("/extension/disconnect", {}, token)).status,
      200,
    );
    assert.equal(
      (await h.send("/extension/v1/capabilities", undefined, token)).status,
      401,
    );
  });
});
test("restricts run work, destinations, query strings and oversized/invalid bodies", () =>
  harness(async (h) => {
    const token = await h.pair();
    for (const path of [
      "/extension/v1/private",
      "/extension/v1/capabilities?destination=https://evil.example",
      "/extension/v1/runs",
    ]) {
      assert(
        [403, 404].includes((await h.send(path, undefined, token)).status),
      );
    }
    assert.equal(
      (
        await h.send(
          "/extension/v1/attach",
          { conversation_id: "invalid" },
          token,
        )
      ).status,
      422,
    );
    assert.equal(
      (await h.send("/extension/v1/attach", "{", token)).status,
      400,
    );
    assert.equal(
      (await h.send("/extension/v1/attach", { junk: "x".repeat(70000) }, token))
        .status,
      413,
    );
    await h.send("/extension/v1/conversations", {}, token);
    const body = {
      conversation_id: conversationId,
      text: "TEST",
      mode: "full",
      candidate_count: 2,
      max_refinements: 0,
    };
    for (const changes of [
      { mode: "single_shot" },
      { max_refinements: 2 },
      { candidate_count: 4 },
      { initial_context: [{ text: "duplicate" }] },
    ])
      assert.equal(
        (await h.send("/extension/v1/runs", { ...body, ...changes }, token))
          .status,
        422,
      );
    assert.equal((await h.send("/extension/v1/runs", body, token)).status, 201);
  }));
test("preserves rate-limit failure and exact run/conversation IDs for recovery", () =>
  harness(async (h) => {
    const token = await h.pair();
    await h.send("/extension/v1/conversations", {}, token);
    h.reply({
      detail: {
        code: "provider_rate_limited",
        run_id: runId,
        conversation_id: conversationId,
      },
    });
    const response = await h.send(
      "/extension/v1/runs",
      {
        conversation_id: conversationId,
        mode: "full",
        candidate_count: 2,
        max_refinements: 0,
      },
      token,
    );
    assert.equal(response.status, 502);
    assert.deepEqual((await response.json()).detail, {
      code: "provider_rate_limited",
      run_id: runId,
      conversation_id: conversationId,
    });
    h.reply({ run_id: runId });
    assert.equal(
      (await h.send(`/extension/v1/runs/${runId}`, undefined, token)).status,
      201,
    );
  }));
test("CORS preflight is limited to the one origin, methods and token header", () =>
  harness(async (h) => {
    const headers = {
      Origin: extensionOrigin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,x-extension-token",
    };
    assert.equal(
      (
        await fetch(h.origin + "/extension/pair", {
          method: "OPTIONS",
          headers,
        })
      ).status,
      204,
    );
    assert.equal(
      (
        await fetch(h.origin + "/extension/pair", {
          method: "OPTIONS",
          headers: {
            ...headers,
            "Access-Control-Request-Headers": "x-api-key",
          },
        })
      ).status,
      403,
    );
  }));
test("extension bridge remains disabled unless explicitly configured", () => {
  assert.throws(() =>
    createHandler({
      backendUrl: "http://127.0.0.1:8000",
      port: 5173,
      extensionId: "*",
    }),
  );
});

test("host-permission fetches without Origin require the exact extension ID plus session", () =>
  harness(async (h) => {
    const token = await h.pair();
    const get = (headers) =>
      fetch(h.origin + "/extension/v1/capabilities", { headers });
    assert.equal((await get({ "X-Extension-ID": extensionId })).status, 401);
    assert.equal(
      (
        await get({
          "X-Extension-ID": "b".repeat(32),
          "X-Extension-Token": token,
        })
      ).status,
      403,
    );
    assert.equal(
      (await get({ "X-Extension-ID": extensionId, "X-Extension-Token": token }))
        .status,
      201,
    );
    assert.equal(
      (
        await get({
          Origin: "https://www.youtube.com",
          "X-Extension-ID": extensionId,
          "X-Extension-Token": token,
        })
      ).status,
      403,
    );
  }));
