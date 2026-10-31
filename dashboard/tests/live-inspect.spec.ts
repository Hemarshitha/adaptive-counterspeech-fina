import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Run } from "../src/contracts";

// GET-only verification of previously persisted live-model records. Makes no inference calls.
test("inspects genuine selected and failed records after API restart without new inference", async ({
  page,
}) => {
  const dir = resolve("../docs/verification/dashboard-2026-10-31");
  const evidence = JSON.parse(
    await readFile(resolve(dir, "evidence.json"), "utf8"),
  ) as { runs: Run[]; input_origin: string };
  const inspected = [];
  const postRequests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") postRequests.push(request.url());
  });
  for (const run of evidence.runs) {
    await page.goto(`/runs/${run.run_id}`);
    await expect(
      page.getByRole("heading", { name: `Run ${run.run_id.slice(0, 8)}` }),
    ).toBeVisible();
    const exact = await (
      await page.request.get(`/api/v1/runs/${run.run_id}`)
    ).json();
    expect(exact).toEqual(run);
    if (run.status === "failed") {
      await expect(
        page.getByRole("heading", { name: "Run failed · no recommendation" }),
      ).toBeVisible();
      await expect(
        page.getByText("provider rate limited", { exact: false }),
      ).toBeVisible();
      await expect(page.locator(".candidate-card")).toHaveCount(0);
      await page.getByRole("tab", { name: "Execution log" }).click();
      await expect(page.locator(".event")).toHaveCount(run.events.length);
    } else {
      const candidates = run.result!.rounds.flatMap(
        (round) => round.candidates,
      );
      await expect(page.locator(".candidate-card")).toHaveCount(
        candidates.length,
      );
      for (const c of candidates) {
        const card = page.locator(".candidate-card").filter({
          has: page.locator(".candidate-id", { hasText: c.candidate_id }),
        });
        await expect(card.locator(".candidate-text")).toHaveText(c.text);
        await expect(card.locator(".simulated-reply p")).toHaveText(
          c.simulation!.simulated_reply || "No reply text recorded",
        );
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: resolve("../work/dashboard-live", "desktop-verified.png"),
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: resolve("../work/dashboard-live", "mobile-verified.png"),
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await page.getByRole("tab", { name: "Conversation", exact: true }).click();
    await expect(page.locator(".turn")).toHaveCount(evidence.runs.length);
    await expect(page.locator(".turn-list")).not.toContainText(
      "Simulated future reply",
    );
    inspected.push({
      run_id: run.run_id,
      status: run.status,
      retrieved_after_restart_equal: true,
      browser_verified: true,
    });
  }
  expect(postRequests).toEqual([]);
  const conversation = await (
    await page.request.get(
      `/api/v1/conversations/${evidence.runs[0].conversation_id}`,
    )
  ).json();
  expect(conversation.turns.map((turn: { text: string }) => turn.text)).toEqual(
    evidence.runs.map((run) => run.request.text),
  );
  await writeFile(
    resolve(dir, "conversation.json"),
    JSON.stringify(
      { input_origin: evidence.input_origin, ...conversation },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    resolve(dir, "inspection.json"),
    JSON.stringify(
      {
        inspected,
        new_inference_requests: 0,
        method:
          "GET-only browser inspection of persisted live records after API restart",
      },
      null,
      2,
    ) + "\n",
  );
});
