import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Run } from "../src/contracts";

test("real-model browser → proxy → FastAPI → provider → SQLite → exact dashboard trace", async ({
  page,
}) => {
  const publicEvidence = resolve("../docs/verification/dashboard-2026-10-31");
  await mkdir(publicEvidence, { recursive: true });
  const inputs = [
    {
      language: "english",
      script: "auto",
      refinements: "1",
      text: "I am angry that the park cleanup bins were left overflowing. Those volunteers are all useless and should stay out of our neighborhood.",
    },
    {
      language: "hindi",
      script: "native",
      refinements: "0",
      text: "नीले कूड़ेदान अभी भी भरे हैं। मुझे स्वयंसेवकों की पूरी टीम पर गुस्सा है, लेकिन मैं सफाई की समस्या का हल चाहता हूँ।",
    },
  ];
  const evidence: {
    input_origin: string;
    observation_boundary: string;
    runs: Run[];
    retrieval_equal: boolean[];
  } = {
    input_origin:
      "Assistant-authored researcher-controlled test messages, not organically observed human comments.",
    observation_boundary:
      "Simulated replies and model estimates are hypotheses, not human follow-ups or independently validated research outcomes.",
    runs: [],
    retrieval_equal: [],
  };
  for (const [index, input] of inputs.entries()) {
    if (index === 0) await page.goto("/");
    else {
      await page
        .getByRole("tab", { name: "Conversation", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Use this conversation for next run" })
        .click();
    }
    await expect(
      page.getByText("Backend connected · inference configured"),
    ).toBeVisible();
    await page.getByLabel("Comment to respond to").fill(input.text);
    await page.getByLabel("Response language").selectOption(input.language);
    await page.getByLabel("Required script").selectOption(input.script);
    await page.getByLabel("Refinement limit").selectOption(input.refinements);
    const responsePromise = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/v1/runs") && r.request().method() === "POST",
      { timeout: 660000 },
    );
    await page.getByRole("button", { name: "Run pipeline" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Processing on the backend",
    );
    const response = await responsePromise;
    const body = await response.json();
    let view: Run;
    if (response.status() === 201) view = body;
    else if (body.detail?.run_id)
      view = await (
        await page.request.get(`/api/v1/runs/${body.detail.run_id}`)
      ).json();
    else
      throw new Error(
        `Real backend run rejected before persistence: HTTP ${response.status()}`,
      );
    // Persist actual sanitized API evidence even on a provider failure; never substitute output.
    evidence.runs.push(view);
    const exact = await (
      await page.request.get(`/api/v1/runs/${view.run_id}`)
    ).json();
    evidence.retrieval_equal.push(
      JSON.stringify(exact) === JSON.stringify(view),
    );
    await writeFile(
      resolve(publicEvidence, "evidence.json"),
      JSON.stringify(evidence, null, 2) + "\n",
    );
    expect(response.status(), view.error_code || "real run creation").toBe(201);
    expect(
      view.events
        .filter((e) => e.payload.metadata)
        .every(
          (e) => e.payload.metadata.provenance === "live_provider_response",
        ),
    ).toBe(true);
    expect(view.result?.rounds[0].candidates).toHaveLength(2);
    expect(evidence.retrieval_equal[index]).toBe(true);
    await expect(page).toHaveURL(`/runs/${view.run_id}`);
    const recordedCount = view.result!.rounds.reduce(
      (sum, r) => sum + r.candidates.length,
      0,
    );
    await expect(page.locator(".candidate-card")).toHaveCount(recordedCount);
    for (const round of view.result!.rounds)
      for (const c of round.candidates) {
        const card = page.locator(".candidate-card").filter({
          has: page.locator(".candidate-id", { hasText: c.candidate_id }),
        });
        await expect(card.locator(".candidate-text")).toHaveText(c.text);
        await expect(card.locator(".simulated-reply p")).toHaveText(
          c.simulation!.simulated_reply || "No reply text recorded",
        );
      }
    if (view.result!.selected)
      await expect(
        page.getByRole("heading", {
          name: "Selected response · human review required",
        }),
      ).toBeVisible();
    else
      await expect(
        page.getByRole("heading", { name: "Abstained · no response selected" }),
      ).toBeVisible();
    await page.screenshot({
      path: resolve("../work/dashboard-live", `desktop-${index + 1}.png`),
      fullPage: true,
    });
    await page.reload();
    await expect(page.locator(".candidate-card")).toHaveCount(recordedCount);
    if (index === 0) {
      await page.setViewportSize({ width: 390, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: resolve("../work/dashboard-live", "mobile.png"),
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
  }
  const cid = evidence.runs[0].conversation_id;
  expect(evidence.runs[1].conversation_id).toBe(cid);
  const conversation = await (
    await page.request.get(`/api/v1/conversations/${cid}`)
  ).json();
  expect(conversation.turns.map((t: { text: string }) => t.text)).toEqual(
    inputs.map((i) => i.text),
  );
  await writeFile(
    resolve(publicEvidence, "conversation.json"),
    JSON.stringify(
      { input_origin: evidence.input_origin, ...conversation },
      null,
      2,
    ) + "\n",
  );
});
