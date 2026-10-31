import { describe, expect, it } from "vitest";
import type { Run } from "./contracts";
import { traceRounds, usage } from "./trace";

// Authored test data only. Never shipped to the dashboard as demonstration output.
function partial(): Run {
  return {
    run_id: "10000000-0000-0000-0000-000000000001",
    conversation_id: "20000000-0000-0000-0000-000000000001",
    status: "failed",
    request: {
      text: "TEST ONLY",
      output_language: "english",
      output_script: "auto",
      mode: "full",
      candidate_count: 2,
      max_refinements: 1,
    },
    result: null,
    error_code: "test_failure",
    created_at: "2026-10-31T00:00:00Z",
    updated_at: "2026-10-31T00:00:01Z",
    events: [
      {
        sequence: 1,
        stage: "candidate",
        created_at: "",
        payload: {
          candidate_id: "c1",
          round_index: 0,
          strategy: "empathy",
          text: "TEST candidate",
          simulation: null,
          assessment: null,
          score: null,
          eligible: false,
          decision_reasons: [],
        },
      },
      {
        sequence: 2,
        stage: "simulation",
        created_at: "",
        payload: {
          candidate_id: "c1",
          output: {
            simulated_reply: "TEST simulated future",
            probabilities: { deescalate: 0.1, neutral: 0.1, escalate: 0.8 },
          },
          metadata: {
            provenance: "deterministic_test_fixture",
            input_tokens: null,
            output_tokens: null,
          },
        },
      },
    ],
  };
}
describe("persisted trace projection", () => {
  it("retains generated drafts that have not been assigned candidate IDs", () => {
    const run = partial();
    run.events.unshift({
      sequence: 0,
      stage: "generation",
      created_at: "",
      payload: {
        round_index: 0,
        output: {
          candidates: [
            { strategy: "empathy", text: "TEST candidate" },
            { strategy: "factual_correction", text: "TEST unprocessed draft" },
          ],
        },
      },
    });
    const candidates = traceRounds(run)[0].candidates;
    expect(candidates).toHaveLength(2);
    expect(candidates[0].candidate_id).toBe("c1");
    expect(candidates[1].candidate_id).toBeNull();
    expect(candidates[1].score).toBeNull();
    expect(candidates[1].assessment).toBeNull();
  });
  it("retains partial evidence without inferring eligibility, scores or ranking", () => {
    const run = partial();
    const rounds = traceRounds(run);
    expect(rounds[0].candidates[0].simulation?.simulated_reply).toBe(
      "TEST simulated future",
    );
    expect(rounds[0].candidates[0].score).toBeNull();
    expect(rounds[0].candidates[0].decision_reasons).toEqual([]);
    expect(rounds[0].ranking).toEqual([]);
    expect(run.events[0].payload.simulation).toBeNull(); // projection never mutates stored events
  });
  it("uses actual ranking and feedback events across multiple rounds", () => {
    const run = partial();
    const c = run.events[0].payload;
    run.events.push({
      sequence: 3,
      stage: "ranking",
      created_at: "",
      payload: {
        round_index: 0,
        ranked_candidates: [
          {
            ...c,
            score: 0.2,
            eligible: false,
            decision_reasons: ["escalation_above_threshold"],
          },
        ],
      },
    });
    run.events.push({
      sequence: 4,
      stage: "refinement",
      created_at: "",
      payload: {
        from_round: 0,
        to_round: 1,
        feedback: [
          {
            candidate_id: "c1",
            rejection_reasons: ["escalation_above_threshold"],
          },
        ],
      },
    });
    run.events.push({
      sequence: 5,
      stage: "candidate",
      created_at: "",
      payload: { ...c, candidate_id: "c2", round_index: 1 },
    });
    const rounds = traceRounds(run);
    expect(rounds).toHaveLength(2);
    expect(rounds[0].ranking).toEqual(["c1"]);
    expect(rounds[0].refinement_feedback).toHaveLength(1);
    expect(rounds[1].candidates[0].score).toBeNull();
  });
  it("keeps missing usage unavailable and labels partial known totals", () => {
    const run = partial();
    expect(usage(run).input.value).toBeNull();
    expect(usage(run).provenance).toEqual(["deterministic_test_fixture"]);
    run.events.push({
      sequence: 3,
      stage: "analysis",
      created_at: "",
      payload: {
        metadata: { input_tokens: 12, output_tokens: 8, latency_ms: 13.4 },
      },
    });
    expect(usage(run).input).toEqual({ value: 12, partial: true });
  });
});
