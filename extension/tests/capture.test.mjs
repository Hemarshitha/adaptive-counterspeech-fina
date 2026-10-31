import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { captureFromTab, captureYouTube } from "../capture.js";

const origins = [
  "https://www.youtube.com/*",
  "https://m.youtube.com/*",
  "https://youtube.com/*",
];
const captured = { text: "Visible comment", context: [], note: "Review first" };

test("YouTube access is optional and narrowly scoped; extension identity is unchanged", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../manifest.json", import.meta.url)),
  );
  assert.deepEqual(manifest.optional_host_permissions, origins);
  assert.deepEqual(manifest.host_permissions, ["http://127.0.0.1/*"]);
  assert.deepEqual(manifest.permissions, [
    "activeTab",
    "scripting",
    "sidePanel",
    "storage",
  ]);
  const { createPublicKey, createHash } = await import("node:crypto");
  const key = createPublicKey({
    key: Buffer.from(manifest.key, "base64"),
    format: "der",
    type: "spki",
  });
  const id = createHash("sha256")
    .update(key.export({ format: "der", type: "spki" }))
    .digest("hex")
    .slice(0, 32)
    .replace(/[0-9a-f]/g, (c) => String.fromCharCode(97 + parseInt(c, 16)));
  assert.equal(id, "igplhknffgcbdgeobbppamkgnbjppkoi");
});

for (const pick of [false, true]) {
  test(`${pick ? "picker" : "selection"} requests access in the click stack before tab lookup or injection`, async () => {
    const calls = [];
    let allow;
    globalThis.chrome = {
      permissions: {
        request: (options) => {
          calls.push(["request", options]);
          return new Promise((resolve) => {
            allow = resolve;
          });
        },
      },
      tabs: {
        query: async (options) => {
          calls.push(["query", options]);
          return [{ id: 7, url: "https://www.youtube.com/watch?v=fixture" }];
        },
      },
      scripting: {
        executeScript: async (options) => {
          calls.push(["inject", options]);
          return [{ result: captured }];
        },
      },
    };
    const pending = captureFromTab(pick);
    assert.deepEqual(calls, [["request", { origins }]]);
    allow(true);
    assert.deepEqual(await pending, captured);
    assert.deepEqual(calls[1], [
      "query",
      { active: true, currentWindow: true },
    ]);
    assert.deepEqual(calls[2], [
      "inject",
      { target: { tabId: 7 }, func: captureYouTube, args: [pick] },
    ]);
    // Already granted permissions still pass through the same user-action path.
    chrome.permissions.request = () => Promise.resolve(true);
    assert.deepEqual(await captureFromTab(pick), captured);
  });
}

test("denial and permission-request errors stop before querying or injecting", async () => {
  for (const request of [
    async () => false,
    async () => {
      throw new Error("gesture lost");
    },
  ]) {
    globalThis.chrome = { permissions: { request } };
    await assert.rejects(
      captureFromTab(),
      /access.*(granted|requested).*paste manually/i,
    );
  }
});

test("unavailable tabs, wrong pages and navigated tabs have actionable fallbacks", async () => {
  for (const tabs of [
    [],
    [{ id: 7 }],
    [{ id: 7, url: "chrome://extensions" }],
    [{ id: 7, url: "https://www.youtube.com.evil.test/watch?v=x" }],
  ]) {
    globalThis.chrome = {
      permissions: { request: async () => true },
      tabs: { query: async () => tabs },
    };
    await assert.rejects(captureFromTab(), /paste manually/i);
  }
  for (const message of [
    "Cannot access contents of url",
    "Missing host permission",
    "No tab with id: 7",
    "The frame was removed",
  ]) {
    globalThis.chrome = {
      permissions: { request: async () => true },
      tabs: {
        query: async () => [
          { id: 7, url: "https://www.youtube.com/watch?v=x" },
        ],
      },
      scripting: {
        executeScript: async () => {
          throw new Error(message);
        },
      },
    };
    await assert.rejects(captureFromTab(), /paste manually/i);
  }
});

test("missing injection results and inaccessible/changed DOM preserve parser errors", async () => {
  for (const result of [
    undefined,
    {
      error:
        "This comment is inaccessible. Expand it or paste its text manually.",
    },
    {
      error: "Comment picking cancelled or timed out. You can paste manually.",
    },
  ]) {
    globalThis.chrome = {
      permissions: { request: async () => true },
      tabs: {
        query: async () => [{ id: 7, url: "https://m.youtube.com/watch?v=x" }],
      },
      scripting: { executeScript: async () => (result ? [{ result }] : []) },
    };
    await assert.rejects(
      captureFromTab(),
      result ? { message: result.error } : /Comment unavailable/,
    );
  }
});
