import assert from "node:assert/strict";
import { test } from "node:test";
import { deadlines } from "./deadlines.mjs";

test("accepts explicit long deadlines with proxy headroom and preserves defaults", () => {
  assert.equal(deadlines().timeoutMs, 660000);
  assert.deepEqual(deadlines("1800", "1860000"), {
    backendRunSeconds: 1800,
    timeoutMs: 1860000,
  });
});

test("rejects shorter, equal, invalid and unbounded proxy deadlines", () => {
  for (const timeout of [
    0,
    600000,
    1800000,
    "NaN",
    "Infinity",
    -1,
    3600001,
    1860000.1,
  ])
    assert.throws(() => deadlines(1800, timeout));
  for (const backend of [0, -1, "NaN", "Infinity", 1801])
    assert.throws(() => deadlines(backend, 1860000));
});
