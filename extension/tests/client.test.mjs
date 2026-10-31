import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { serviceOrigin, recommendation, request, explain } from "../client.js";

test("only loopback HTTP service origins can receive a scoped session", () => {
  assert.equal(serviceOrigin("http://127.0.0.1:5173"), "http://127.0.0.1:5173");
  for (const url of [
    "https://evil.example",
    "http://localhost:5173",
    "http://user:pw@127.0.0.1:5173",
    "http://127.0.0.1:5173/path",
    "http://127.0.0.1:5173?key=x",
    "http://127.0.0.1",
  ])
    assert.throws(() => serviceOrigin(url));
});
test("never selects partial, failed, running or abstained candidates", () => {
  const selected = { text: "TEST-ONLY" };
  for (const status of ["failed", "running", "abstained"])
    assert.equal(
      recommendation({ status, result: { outcome: "completed", selected } }),
      null,
    );
  assert.equal(
    recommendation({
      status: "completed",
      result: { outcome: "completed", selected },
    }),
    selected,
  );
  assert.equal(
    recommendation({
      status: "completed",
      result: { outcome: "completed", selected: null },
    }),
    null,
  );
});
test("GET-only file inspection of genuine recorded traces preserves selection and failure", async () => {
  // No model or HTTP calls; genuine checked-in evidence, not newly produced results.
  const evidence = JSON.parse(
    await readFile(
      new URL(
        "../../docs/verification/dashboard-2026-10-31/evidence.json",
        import.meta.url,
      ),
    ),
  );
  assert.equal(evidence.runs.length, 2);
  const completed = evidence.runs.find((r) => r.status === "completed");
  const failed = evidence.runs.find((r) => r.status === "failed");
  assert.equal(completed.run_id, "8858a371-4542-47f3-81d7-0477858c762f");
  assert.equal(
    recommendation(completed).candidate_id,
    completed.result.selected.candidate_id,
  );
  assert.equal(recommendation(failed), null);
  assert.equal(failed.error_code, "provider_rate_limited");
  assert.match(explain(new Error(failed.error_code)), /Do not retry/);
});
test("fetch timeout is surfaced without retrying a write", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("private transport details");
  };
  try {
    await assert.rejects(
      request("http://127.0.0.1:5173", "test", "/v1/runs", {}),
      /Recover stored run/,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
