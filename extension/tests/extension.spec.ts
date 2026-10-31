import {
  test,
  expect,
  chromium,
  type BrowserContext,
  type Page,
} from "../../dashboard/node_modules/@playwright/test/index.mjs";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { captureYouTube } from "../capture.js";

// Installed MV3 extension → actual Node server → actual FastAPI → actual SQLite.
// Only the model provider and YouTube HTML are authored, explicitly labeled fixtures.
const extensionId = "igplhknffgcbdgeobbppamkgnbjppkoi";
const origin = "http://127.0.0.1:5181";
// Explicit fallback for managed Chromium that forbids installing any extension.
// Browser APIs + the extension-origin transport are emulated ONLY in this mode.
// Default/CI mode installs the actual packaged MV3 extension with no API shims.
const webHarness = process.env.EXTENSION_BROWSER_MODE === "web_harness";
const panelURL = webHarness
  ? "http://127.0.0.1:5182/panel.html"
  : `chrome-extension://${extensionId}/panel.html`;
let server: ChildProcess;
let context: BrowserContext;
let panel: Page;
let pairingCode: string;
let serviceLogs = "";

test.beforeEach(async () => {
  serviceLogs = "";
  server = spawn(process.execPath, ["server/index.mjs", "--production"], {
    cwd: resolve("."),
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      RESEARCH_API_KEY:
        "extension-test-only-research-key-at-least-24-characters",
      DASHBOARD_PORT: "5181",
      DASHBOARD_BACKEND_URL: "http://127.0.0.1:8013",
      DASHBOARD_EXTENSION_ID: extensionId,
    },
  });
  server.stdout!.on("data", (chunk) => {
    serviceLogs += chunk.toString();
  });
  // Do not print the single-use credential in reports or record network traces.
  await expect
    .poll(() => serviceLogs.includes("Research dashboard:"))
    .toBe(true);
  pairingCode = serviceLogs.match(/minutes\): ([A-Za-z0-9_-]+)/)![1];
  const path = resolve("../extension/dist/unpacked");
  const profile = await mkdtemp(resolve("../work/extension-tests/profile-"));
  context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: webHarness
      ? []
      : [`--disable-extensions-except=${path}`, `--load-extension=${path}`],
    viewport: { width: 390, height: 844 },
  });
  if (webHarness) {
    await context.addInitScript(
      ({ extensionId }) => {
        const get = async () =>
          JSON.parse(localStorage.getItem("TEST_ONLY_chrome_session") || "{}");
        (globalThis as any).chrome = {
          runtime: { id: extensionId },
          storage: {
            session: {
              get,
              set: async (data: unknown) =>
                localStorage.setItem(
                  "TEST_ONLY_chrome_session",
                  JSON.stringify({ ...(await get()), ...(data as any) }),
                ),
            },
            local: { get: async () => ({}) },
            sync: { get: async () => ({}) },
          },
          tabs: {
            query: async () => {
              throw new Error("TEST ONLY inaccessible tab. Paste manually.");
            },
          },
        };
      },
      { extensionId },
    );
    await context.route("http://127.0.0.1:5182/**", async (route) => {
      const name = new URL(route.request().url()).pathname.slice(1);
      if (!/^(panel\.(html|js|css)|capture\.js|client\.js)$/.test(name))
        return route.abort();
      await route.fulfill({
        contentType: name.endsWith(".js")
          ? "text/javascript"
          : name.endsWith(".css")
            ? "text/css"
            : "text/html",
        body: await readFile(resolve(path, name)),
      });
    });
    await context.route(origin + "/extension/**", async (route) => {
      const response = await route.fetch({
        headers: {
          ...route.request().headers(),
          Origin: `chrome-extension://${extensionId}`,
        },
        maxRedirects: 0,
      });
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          "access-control-allow-origin": "http://127.0.0.1:5182",
        },
      });
    });
  } else {
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent("serviceworker", { timeout: 10000 }));
    expect(worker.url().split("/")[2]).toBe(extensionId);
  }
  panel = await context.newPage();
  await panel.goto(panelURL);
  await panel.getByLabel("Dashboard address").fill(origin);
  await panel.getByLabel("Single-use pairing code").fill(pairingCode);
  await panel.getByRole("button", { name: "Pair local service" }).click();
  await expect(panel.getByRole("status")).toContainText(
    "Paired with the local research backend",
  );
});
test.afterEach(async () => {
  await context?.close();
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill("SIGTERM");
    await exited;
  }
});

async function submit(
  text: string,
  language = "english",
  script = "auto",
  refinements = "1",
) {
  await panel.getByLabel("Comment to respond to").fill(text);
  await panel.getByLabel("Response language").selectOption(language);
  await panel.getByLabel("Required script").selectOption(script);
  const details = panel
    .locator("details")
    .filter({ has: panel.locator("#conversation") });
  await details.evaluate((el) => ((el as HTMLDetailsElement).open = true));
  await panel.getByLabel("Refinement limit").selectOption(refinements);
  await panel.getByLabel("I reviewed the comment").check();
  await panel.getByRole("button", { name: "Generate counterspeech" }).click();
}
async function actualRun() {
  await expect(panel.locator("#dashboard-link")).toHaveAttribute(
    "href",
    /\/runs\/[0-9a-f-]{36}$/,
  );
  const href = await panel.locator("#dashboard-link").getAttribute("href");
  const dashboard = await context.newPage();
  await dashboard.goto(href!);
  const runId = href!.split("/").at(-1)!;
  const run = await (
    await dashboard.request.get(`${origin}/api/v1/runs/${runId}`)
  ).json();
  expect(run.run_id).toBe(runId);
  const upstream = await dashboard.request.get(
    `http://127.0.0.1:8013/v1/runs/${runId}`,
    {
      headers: {
        "X-API-Key": "extension-test-only-research-key-at-least-24-characters",
      },
    },
  );
  expect(await upstream.json()).toEqual(run);
  return { run, dashboard, runId };
}

test("manual fallback → real persisted refinement → edit/copy → exact dashboard run and restart recovery", async () => {
  await submit(
    "TEST extension full workflow · researcher-authored fixture input.",
  );
  await expect(panel.getByLabel("Editable recommendation")).toBeVisible();
  await expect(panel.locator("#result-note")).toContainText("TEST FIXTURE");
  const { run, dashboard, runId } = await actualRun();
  expect(run.status).toBe("completed");
  expect(run.result.rounds).toHaveLength(2);
  await expect(panel.getByLabel("Editable recommendation")).toHaveValue(
    run.result.selected.text,
  );
  await expect(panel.locator("#reaction")).toHaveText(
    run.result.selected.simulation.reaction_class,
  );
  await expect(panel.locator("#simulated")).toHaveText(
    run.result.selected.simulation.simulated_reply,
  );
  await expect(panel.locator("#scores")).toContainText(
    `Selection score: ${run.result.selected.score}`,
  );
  await expect(
    dashboard.getByRole("heading", { name: `Run ${runId.slice(0, 8)}` }),
  ).toBeVisible();
  await expect(
    dashboard.getByRole("heading", {
      name: "Selected response · human review required",
    }),
  ).toBeVisible();
  const posts: string[] = [];
  panel.on("request", (r) => {
    if (r.method() === "POST") posts.push(r.url());
  });
  const edited = run.result.selected.text + " Edited by the reviewer.";
  await panel.getByLabel("Editable recommendation").fill(edited);
  await expect(panel.locator("#edit-note")).toBeVisible();
  await panel.getByRole("button", { name: "Copy for manual posting" }).click();
  await expect(panel.getByRole("status")).toContainText("Copied");
  // Actual clipboard read through a user paste; no clipboard permission added to the package.
  await panel.getByLabel("Comment to respond to").fill("");
  await panel.getByLabel("Comment to respond to").press("Control+V");
  await expect(panel.getByLabel("Comment to respond to")).toHaveValue(edited);
  expect(posts).toEqual([]);
  expect(
    await panel.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await panel.screenshot({
    path: resolve("../work/extension-tests/selected-fixture.png"),
    fullPage: true,
  });
  const conversation = await (
    await dashboard.request.get(
      `${origin}/api/v1/conversations/${run.conversation_id}`,
    )
  ).json();
  expect(conversation.turns.map((t: any) => t.text)).toEqual([
    run.request.text,
  ]);
  await writeFile(
    resolve("../work/extension-tests/integrated-run.json"),
    JSON.stringify(
      {
        disclosure: `Deterministic test-only model provider. ${webHarness ? "Browser UI harness with emulated Chrome APIs/origin" : "Installed MV3 extension"}; real HTTP API, SQLite and dashboard.`,
        run,
        conversation,
      },
      null,
      2,
    ),
  );
  await panel.close();
  panel = await context.newPage();
  await panel.goto(panelURL);
  await panel.getByRole("button", { name: "Recover stored run" }).click();
  await expect(panel.getByLabel("Editable recommendation")).toHaveValue(
    run.result.selected.text,
  );
  await expect(panel.locator("#dashboard-link")).toHaveAttribute(
    "href",
    `${origin}/runs/${runId}`,
  );
});

test("abstention and provider rate limits never create a selected response or trigger retry", async () => {
  await submit(
    "TEST abstain · intentionally adverse test model.",
    "english",
    "auto",
    "0",
  );
  await expect(
    panel.getByRole("heading", { name: "No response selected", exact: true }),
  ).toBeVisible();
  await expect(panel.getByLabel("Editable recommendation")).toBeHidden();
  const first = await actualRun();
  expect(first.run.result.selected).toBeNull();
  await panel.getByRole("button", { name: "Start a new thread" }).click();
  let calls = 0;
  panel.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/v1/runs")) calls++;
  });
  await submit("TEST rate limit · simulated provider quota exhaustion.");
  await expect(
    panel.getByRole("heading", { name: "Run failed · no recommendation" }),
  ).toBeVisible();
  await expect(panel.getByRole("alert")).toContainText(
    "Provider rate limit reached",
  );
  await expect(
    panel.getByRole("button", { name: "Copy for manual posting" }),
  ).toBeHidden();
  const second = await actualRun();
  expect(second.run.error_code).toBe("provider_rate_limited");
  await panel.getByRole("button", { name: "Recover stored run" }).click();
  expect(calls).toBe(1);
});

test("loading, partial failures and invalid context have honest, recoverable states", async () => {
  await submit("TEST processing slow extension input", "english", "auto", "0");
  await expect(
    panel.getByRole("button", { name: "Generate counterspeech" }),
  ).toBeDisabled();
  await expect(
    panel.getByRole("heading", { name: "Processing on the backend" }),
  ).toBeVisible();
  await expect(
    panel.getByRole("heading", { name: "No response selected", exact: true }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Start a new thread" }).click();
  await submit("TEST failed · partial fixture assessment error");
  await expect(
    panel.getByRole("heading", { name: "Run failed · no recommendation" }),
  ).toBeVisible();
  await expect(panel.getByLabel("Editable recommendation")).toBeHidden();
  const { run } = await actualRun();
  expect(run.events.some((e: any) => e.stage === "simulation")).toBe(true);
  await panel.getByRole("button", { name: "Start a new thread" }).click();
  await panel.getByLabel("Existing conversation ID").fill("invalid");
  await submit("TEST invalid context");
  await expect(panel.getByRole("alert")).toContainText(
    "valid conversation UUID",
  );
});

for (const [language, text, script] of [
  ["english", "TEST English input", "auto"],
  ["hindi", "TEST यह नियंत्रित हिन्दी संदेश है।", "native"],
  ["malayalam", "TEST ഇത് നിയന്ത്രിത മലയാളം സന്ദേശമാണ്.", "native"],
  ["hinglish", "TEST Yeh controlled Hinglish message hai.", "romanized"],
  ["minglish", "TEST Ithu controlled Minglish message aanu.", "romanized"],
])
  test(`preserves ${language} input, script override and observed continuation`, async () => {
    await submit(text, language, script);
    await expect(panel.getByLabel("Editable recommendation")).toBeVisible();
    const { run, dashboard } = await actualRun();
    expect(run.request.text).toBe(text);
    expect(run.request.output_language).toBe(language);
    expect(run.request.output_script).toBe(script);
    expect(run.result.selected.script_validation.valid).toBe(true);
    await expect(panel.locator("#scores")).toContainText(
      "Unicode script check: passed",
    );
    await expect(
      dashboard.locator(".decision-banner.recommendation .generated-text"),
    ).toHaveText(run.result.selected.text);
    await expect(panel.getByLabel("Editable recommendation")).toHaveValue(
      run.result.selected.text,
    );
    await submit("TEST अगला नियंत्रित संदेश।", "hindi", "native");
    await expect(panel.getByRole("status")).toContainText(
      "Stored result retrieved",
    );
    const continued = await actualRun();
    expect(continued.run.conversation_id).toBe(run.conversation_id);
    expect(continued.run.run_id).not.toBe(run.run_id);
    const conversation = await (
      await dashboard.request.get(
        `${origin}/api/v1/conversations/${run.conversation_id}`,
      )
    ).json();
    expect(conversation.turns.map((t: any) => t.text)).toEqual([
      text,
      "TEST अगला नियंत्रित संदेश।",
    ]);
    expect(
      conversation.turns.some((t: any) => t.text.includes("imagined reply")),
    ).toBe(false);
  });

const youtubeFixture = `<!doctype html><meta charset="utf-8"><style>ytd-comment-thread-renderer,ytd-comment-view-model,ytd-comment-renderer{display:block;padding:12px}</style><p>UNRELATED PAGE TEXT SHOULD NEVER BE CAPTURED</p><ytd-comment-thread-renderer><ytd-comment-view-model><div id="content-text">TEST Parent · earlier visible comment</div></ytd-comment-view-model><div id="replies"><ytd-comment-view-model><div id="content-text">TEST Selected · हिन्दी മലയാളം comment</div></ytd-comment-view-model><ytd-comment-renderer><div id="content-text">TEST Another loaded reply</div></ytd-comment-renderer><ytd-comment-renderer style="display:none"><div id="content-text">HIDDEN REPLY</div></ytd-comment-renderer></div></ytd-comment-thread-renderer>`;

test("real Chromium extracts only the selected comment and loaded thread context from authored YouTube DOM", async () => {
  const youtube = await context.newPage();
  await youtube.route("https://www.youtube.com/**", (r) =>
    r.fulfill({ contentType: "text/html", body: youtubeFixture }),
  );
  await youtube.goto("https://www.youtube.com/watch?v=test_fixture");
  await youtube
    .locator("#content-text")
    .nth(1)
    .evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    });
  // Same self-contained function used by executeScript; evaluated in Chromium because
  // headless automation cannot grant activeTab by clicking the browser toolbar.
  const captured = await youtube.evaluate(captureYouTube, false);
  expect(captured.text).toBe("TEST Selected · हिन्दी മലയാളം comment");
  expect(captured.context.map((c: any) => c.text)).toEqual([
    "TEST Parent · earlier visible comment",
    "TEST Another loaded reply",
  ]);
  expect(JSON.stringify(captured)).not.toContain("UNRELATED");
  expect(JSON.stringify(captured)).not.toContain("HIDDEN");
  const picking = youtube.evaluate(captureYouTube, true);
  await youtube
    .getByText("Counterpoint: click a comment", { exact: false })
    .waitFor();
  await youtube.locator("#content-text").nth(1).click();
  expect((await picking).text).toBe(captured.text);
  await panel.bringToFront();
  await submit(captured.text);
  await expect(panel.getByLabel("Editable recommendation")).toBeVisible();
  const { run } = await actualRun();
  expect(run.request.text).toBe(captured.text);
});

test("context is opt-in, role-checked and persisted separately from simulations", async () => {
  await panel
    .locator("#context-details")
    .evaluate((el) => ((el as HTMLDetailsElement).open = true));
  await panel.getByRole("button", { name: "Add earlier message" }).click();
  await panel
    .getByLabel("Context message 1")
    .fill("TEST Earlier observed parent.");
  await panel.getByLabel("Include earlier message").check();
  await submit("TEST current comment with real fixture context");
  await expect(panel.getByRole("alert")).toContainText("observed role");
  await panel.getByLabel("Observed role 1").selectOption("original_speaker");
  await panel.getByLabel("I reviewed the comment").check();
  await panel.getByRole("button", { name: "Generate counterspeech" }).click();
  await expect(panel.getByLabel("Editable recommendation")).toBeVisible();
  const { run, dashboard } = await actualRun();
  const conversation = await (
    await dashboard.request.get(
      `${origin}/api/v1/conversations/${run.conversation_id}`,
    )
  ).json();
  expect(conversation.turns.map((t: any) => t.text)).toEqual([
    "TEST Earlier observed parent.",
    run.request.text,
  ]);
});

test("inaccessible tab fallback, disconnected service and revocation are clear", async () => {
  await panel.getByRole("button", { name: "Capture selection" }).click();
  await expect(panel.getByRole("alert")).toContainText(/paste|manually/i);
  await panel
    .locator("#connection")
    .evaluate((el) => ((el as HTMLDetailsElement).open = true));
  await panel.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "Generate counterspeech" }),
  ).toBeDisabled();
  await panel.getByLabel("Dashboard address").fill("http://127.0.0.1:59999");
  await panel.getByLabel("Single-use pairing code").fill("not-a-secret");
  await panel.getByRole("button", { name: "Pair local service" }).click();
  await expect(panel.getByRole("alert")).toContainText(
    "Local service unavailable",
  );
});

test("packaged permissions and browser storage contain no long-lived research or provider secret", async () => {
  if (!webHarness) {
    const worker = context.serviceWorkers()[0];
    expect(
      await worker.evaluate(() => chrome.sidePanel.getPanelBehavior()),
    ).toEqual({ openPanelOnActionClick: true });
  }
  const manifest = JSON.parse(
    await readFile(resolve("../extension/dist/unpacked/manifest.json"), "utf8"),
  );
  expect(manifest.permissions.sort()).toEqual(
    ["activeTab", "scripting", "sidePanel", "storage"].sort(),
  );
  expect(manifest.host_permissions).toEqual(["http://127.0.0.1/*"]);
  expect(manifest.content_scripts).toBeUndefined();
  const storage = await panel.evaluate(async () => ({
    session: await chrome.storage.session.get(null),
    local: await chrome.storage.local.get(null),
    sync: await chrome.storage.sync.get(null),
  }));
  expect(storage.local).toEqual({});
  expect(storage.sync).toEqual({});
  expect(JSON.stringify(storage)).not.toContain(
    "extension-test-only-research-key",
  );
  expect(JSON.stringify(storage)).not.toContain(pairingCode);
});

test("a rejected follow-up cannot display an earlier run as its recommendation", async () => {
  await submit("TEST first completed run before a transport rejection");
  await expect(panel.getByLabel("Editable recommendation")).toBeVisible();
  await expect(panel.getByRole("status")).toContainText(
    "Stored result retrieved",
  );
  // Deliberate HTTP fixture for a pre-run capacity rejection (no run is created).
  await panel.route(origin + "/extension/v1/runs", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ detail: { code: "run_capacity_exceeded" } }),
    }),
  );
  await submit("TEST follow-up with a mocked capacity rejection");
  await expect(panel.getByRole("alert")).toContainText("run capacity exceeded");
  await expect(panel.getByLabel("Editable recommendation")).toBeHidden();
  await expect(
    panel.getByRole("button", { name: "Copy for manual posting" }),
  ).toBeHidden();
  await panel.getByRole("button", { name: "Recover stored run" }).click();
  await expect(panel.getByRole("status")).toContainText("No run recorded");
  await expect(panel.getByLabel("Editable recommendation")).toBeHidden();
});

test("wrong-script Hinglish is withheld in panel and exact dashboard trace", async () => {
  await submit(
    "TEST wrong script: controlled Hinglish failure.",
    "hinglish",
    "romanized",
    "1",
  );
  await expect(
    panel.getByRole("heading", { name: "No response selected", exact: true }),
  ).toBeVisible();
  await expect(panel.getByLabel("Editable recommendation")).toBeHidden();
  await expect(
    panel.getByRole("button", { name: "Copy for manual posting" }),
  ).toBeHidden();
  await expect(panel.locator("#candidate-evidence")).toContainText(
    "deterministic output script rejected",
  );
  const { run, dashboard } = await actualRun();
  expect(run.result.selected).toBeNull();
  expect(run.events.filter((e: any) => e.stage === "generation")).toHaveLength(
    2,
  );
  expect(
    run.events.some((e: any) => ["simulation", "assessment"].includes(e.stage)),
  ).toBe(false);
  await expect(dashboard.locator(".decision-pill.rejected")).toHaveCount(4);
});
