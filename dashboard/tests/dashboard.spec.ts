import { test, expect, type Page } from "@playwright/test";

// Real browser → Node credential proxy → real FastAPI → real SQLite.
// LLM calls alone use the existing deterministic TEST provider. No research efficacy claim.
async function submit(page: Page, text: string, refinements = "1") {
  await page.goto("/");
  await expect(
    page.getByText("Backend connected · inference configured"),
  ).toBeVisible();
  await page.getByLabel("Comment to respond to").fill(text);
  await page.getByLabel("Refinement limit").selectOption(refinements);
  await page.getByRole("button", { name: "Run pipeline" }).click();
}

test("refines, explains selection, reloads the exact persisted run and preserves actual JSON", async ({
  page,
}) => {
  let created: any;
  page.on("response", async (response) => {
    if (
      response.url().endsWith("/api/v1/runs") &&
      response.request().method() === "POST" &&
      response.status() === 201
    )
      created = await response.json();
  });
  await submit(
    page,
    "TEST refinement input, authored for deterministic browser verification.",
  );
  await expect(
    page.getByRole("heading", {
      name: "Selected response · human review required",
    }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Round 0", exact: true })
      .locator(".candidate-card"),
  ).toHaveCount(2);
  await expect(
    page
      .getByRole("region", { name: "Round 1", exact: true })
      .locator(".candidate-card"),
  ).toHaveCount(2);
  await expect(page.getByText("escalation above threshold")).toHaveCount(2);
  await expect(
    page.getByText("Uncalibrated predictions · not observed outcomes"),
  ).toHaveCount(4);
  await expect(
    page.getByText("deterministic test fixture", { exact: false }).first(),
  ).toBeVisible();
  await page.getByText("Inspect thresholds & scoring").first().click();
  await expect(
    page.getByRole("cell", { name: "Fail", exact: true }).first(),
  ).toBeVisible();
  await expect.poll(() => created?.run_id).toBeTruthy();
  const runId = created.run_id;
  expect(new URL(page.url()).pathname).toBe(`/runs/${runId}`);
  const exact = await page.request.get(`/api/v1/runs/${runId}`);
  expect(await exact.json()).toEqual(created);
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download actual trace JSON" })
    .click();
  expect((await downloadEvent).suggestedFilename()).toBe(`run-${runId}.json`);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Selected response · human review required",
    }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Execution log" }).click();
  await expect(
    page.getByRole("heading", { name: "Persisted execution events" }),
  ).toBeVisible();
  await expect(page.locator(".event")).toHaveCount(created.events.length);
});

test("supports actual abstention with no selected response", async ({
  page,
}) => {
  await submit(
    page,
    "TEST abstain: adverse test-only responses exhaust the configured budget.",
    "0",
  );
  await expect(
    page.getByRole("heading", { name: "Abstained · no response selected" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Selected response · human review required",
    }),
  ).toHaveCount(0);
  await expect(page.locator(".candidate-card")).toHaveCount(2);
  await expect(page.locator(".decision-pill.rejected")).toHaveCount(2);
});

test("retrieves failed partial traces without inventing a quality decision", async ({
  page,
}) => {
  await submit(
    page,
    "TEST failed: fail the test-only assessor after generation and simulation.",
  );
  await expect(
    page.getByRole("heading", { name: "Run failed · no recommendation" }),
  ).toBeVisible();
  await expect(
    page.getByText("test only assessment failure", { exact: false }).first(),
  ).toBeVisible();
  await expect(page.getByText("Not assessed", { exact: true })).toHaveCount(2);
  await expect(
    page.getByText("Assessment not recorded.", { exact: true }),
  ).toHaveCount(2);
  await expect(page.getByText("No eligibility decision recorded.")).toHaveCount(
    2,
  );
  await expect(
    page.getByText("Generated draft · no candidate ID assigned"),
  ).toBeVisible();
  await expect(
    page.getByText("TEST-ONLY imagined reply, never observed."),
  ).toBeVisible();
});

test("keeps submitted observations separate from simulated replies and supports switched next turns", async ({
  page,
}) => {
  await submit(page, "TEST multi-turn first input.");
  await expect(
    page.getByRole("heading", {
      name: "Selected response · human review required",
    }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Conversation", exact: true }).click();
  await expect(page.locator(".turn")).toHaveCount(1);
  await expect(page.locator(".turn-list")).not.toContainText(
    "TEST-ONLY imagined reply",
  );
  await page
    .getByLabel("Actual text")
    .fill("TEST researcher-recorded posted reply.");
  await expect(
    page.getByRole("button", { name: "Save observed turn" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save observed turn" }).click();
  await expect(page.locator(".turn")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Use this conversation for next run" })
    .click();
  await page
    .getByLabel("Comment to respond to")
    .fill("TEST यह दूसरा नियंत्रित संदेश है।");
  await page.getByLabel("Response language").selectOption("hindi");
  await page.getByLabel("Required script").selectOption("native");
  await page.getByRole("button", { name: "Run pipeline" }).click();
  await expect(
    page.getByText("TEST यह दूसरा नियंत्रित संदेश है।", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Selected response · human review required",
    }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Conversation", exact: true }).click();
  await expect(page.locator(".turn")).toHaveCount(3);
  await expect(page.locator(".conversation-runs button")).toHaveCount(2);
  await expect(page.locator(".trend-row")).toHaveCount(2);
});

test("offers all five languages, preserves narrow-screen usability and exposes no server secrets", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByText("Backend connected · inference configured"),
  ).toBeVisible();
  for (const language of [
    "english",
    "hindi",
    "malayalam",
    "hinglish",
    "minglish",
  ])
    await page.getByLabel("Response language").selectOption(language);
  await expect(
    page.getByRole("button", { name: "Run pipeline" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect((await page.request.get("/.env")).status()).toBe(404);
  expect((await page.request.get("/server/index.mjs")).status()).toBe(404);
  const html = await (await page.request.get("/")).text();
  const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)].map(
    (match) => match[1],
  );
  for (const src of scripts) {
    const js = await (await page.request.get(src)).text();
    expect(js).not.toContain("browser-test-only-access-key");
    expect(js).not.toContain("LLM_API_KEY");
  }
});

test("polls actual persisted events during processing without invented progress", async ({
  page,
}) => {
  await submit(
    page,
    "TEST processing: slow fixture calls expose partial persisted evidence.",
    "0",
  );
  await expect(page.getByRole("status")).toContainText(
    "Processing on the backend",
  );
  await expect(page.locator(".badge.running")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Submitted input" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Abstained · no response selected" }),
  ).toBeVisible();
  await expect(page.locator(".candidate-card")).toHaveCount(2);
});

for (const mode of ["single_shot", "no_simulation", "no_history"]) {
  test(`faithfully displays ${mode} experiment mode`, async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByText("Backend connected · inference configured"),
    ).toBeVisible();
    await page
      .getByLabel("Comment to respond to")
      .fill("TEST mode contract verification.");
    await page.getByText("Conversation & experiment settings").click();
    await page.getByLabel("Experiment mode").selectOption(mode);
    await page.getByRole("button", { name: "Run pipeline" }).click();
    if (mode === "single_shot") {
      await expect(
        page.getByRole("heading", { name: "Unevaluated baseline output" }),
      ).toBeVisible();
      await expect(
        page.getByText("Assessment disabled for the baseline."),
      ).toBeVisible();
      await expect(
        page.getByText("Baseline output", { exact: true }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole("heading", {
          name: "Selected response · human review required",
        }),
      ).toBeVisible();
      if (mode === "no_simulation")
        await expect(
          page.getByText("Simulation disabled by experiment mode."),
        ).toHaveCount(2);
      else {
        await page.getByText("Observed context actually supplied").click();
        await expect(
          page.getByText("History suppressed by experiment mode."),
        ).toBeVisible();
      }
    }
  });
}

for (const [language, script, text] of [
  ["english", "native", "TEST English comment"],
  ["hindi", "native", "TEST हिन्दी comment"],
  ["malayalam", "native", "TEST മലയാളം comment"],
  ["hinglish", "romanized", "TEST Yeh Hinglish comment hai"],
  ["minglish", "romanized", "TEST Ithu Minglish comment aanu"],
]) {
  test(`transmits and displays actual ${language} output and script evidence`, async ({
    page,
  }) => {
    await page.goto("/");
    await expect(
      page.getByText("Backend connected · inference configured"),
    ).toBeVisible();
    await page.getByLabel("Comment to respond to").fill(text);
    await page.getByLabel("Response language").selectOption(language);
    await page.getByLabel("Required script").selectOption(script);
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/v1/runs") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Run pipeline" }).click();
    const run = await (await response).json();
    expect(run.request.output_language).toBe(language);
    expect(run.request.output_script).toBe(script);
    expect(run.request.text).toBe(text);
    expect(run.result.selected.script_validation.valid).toBe(true);
    const selected = page.locator(
      ".decision-banner.recommendation .generated-text",
    );
    await expect(selected).toHaveText(run.result.selected.text);
    await expect(
      page.getByRole("heading", { name: "Deterministic script validation" }),
    ).toHaveCount(4);
    const stored = await page.request.get(`/api/v1/runs/${run.run_id}`);
    expect(await stored.json()).toEqual(run);
  });
}

test("wrong-script candidates are visibly rejected without fabricated assessments or recommendation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Backend connected · inference configured"),
  ).toBeVisible();
  await page
    .getByLabel("Comment to respond to")
    .fill("TEST wrong script: controlled Hinglish failure.");
  await page.getByLabel("Response language").selectOption("hinglish");
  await page.getByLabel("Required script").selectOption("romanized");
  await page.getByLabel("Refinement limit").selectOption("1");
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/v1/runs") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Run pipeline" }).click();
  const run = await (await response).json();
  expect(run.status).toBe("abstained");
  expect(run.result.selected).toBeNull();
  expect(run.events.filter((e: any) => e.stage === "generation")).toHaveLength(
    2,
  );
  expect(
    run.events.some((e: any) => ["simulation", "assessment"].includes(e.stage)),
  ).toBe(false);
  await expect(
    page.getByRole("heading", { name: "Abstained · no response selected" }),
  ).toBeVisible();
  await expect(page.locator(".decision-pill.rejected")).toHaveCount(4);
  await expect(
    page.getByText(
      "Script mismatch. Withheld before simulation and model assessment.",
    ),
  ).toHaveCount(4);
  await expect(page.locator(".decision-banner.recommendation")).toHaveCount(0);
});
