import type { Candidate, Round, Run } from "./contracts";

export type TraceCandidate = Omit<Candidate, "candidate_id"> & {
  candidate_id: string | null;
};
type TraceRound = Omit<Round, "candidates"> & { candidates: TraceCandidate[] };

// Failed/running runs have no final result. Reconstruct only fields actually logged.
// In particular, never infer a score, eligibility, ranking or selected response.
export function traceRounds(run: Run): TraceRound[] {
  if (run.result) return run.result.rounds;
  const rounds = new Map<number, TraceRound>();
  const candidates = new Map<string, Candidate>();
  for (const event of run.events) {
    const p = event.payload;
    if (event.stage === "candidate") {
      const c = { ...p } as Candidate;
      candidates.set(c.candidate_id, c);
      if (!rounds.has(c.round_index))
        rounds.set(c.round_index, {
          index: c.round_index,
          candidates: [],
          ranking: [],
          refinement_feedback: [],
        });
      rounds.get(c.round_index)!.candidates.push(c);
    }
    if (event.stage === "simulation" || event.stage === "assessment") {
      const c = candidates.get(p.candidate_id);
      if (c) Object.assign(c, { [event.stage]: p.output });
    }
    if (event.stage === "ranking") {
      const round = rounds.get(p.round_index);
      if (round) {
        round.ranking = p.ranked_candidates.map(
          (c: Candidate) => c.candidate_id,
        );
        for (const c of p.ranked_candidates)
          Object.assign(candidates.get(c.candidate_id) || {}, c);
      }
    }
    if (event.stage === "refinement") {
      const round = rounds.get(p.from_round);
      if (round) round.refinement_feedback = p.feedback;
    }
  }
  // Generation can succeed before the pipeline fails on the first candidate.
  // Preserve the remaining real drafts without inventing backend candidate UUIDs.
  for (const event of run.events) {
    if (!["generation", "baseline"].includes(event.stage)) continue;
    const index = event.payload.round_index ?? 0;
    if (!rounds.has(index))
      rounds.set(index, {
        index,
        candidates: [],
        ranking: [],
        refinement_feedback: [],
      });
    const round = rounds.get(index)!;
    for (const draft of event.payload.output?.candidates || []) {
      if (
        !round.candidates.some(
          (c) => c.strategy === draft.strategy && c.text === draft.text,
        )
      ) {
        round.candidates.push({
          ...draft,
          candidate_id: null,
          round_index: index,
          simulation: null,
          assessment: null,
          score: null,
          eligible: false,
          decision_reasons: [],
        });
      }
    }
  }
  return [...rounds.values()].sort((a, b) => a.index - b.index);
}

export function usage(run: Run) {
  const metadata = run.events
    .filter((e) => e.payload.metadata)
    .map((e) => e.payload.metadata);
  const sum = (key: string) => {
    const values = metadata
      .map((m) => m[key])
      .filter((v) => typeof v === "number" && Number.isFinite(v));
    return {
      value: values.length ? values.reduce((a, b) => a + b, 0) : null,
      partial: values.length < metadata.length,
    };
  };
  return {
    calls: metadata.length,
    input: sum("input_tokens"),
    output: sum("output_tokens"),
    latency: sum("latency_ms"),
    provenance: [
      ...new Set(metadata.map((m) => m.provenance || "unspecified")),
    ] as string[],
  };
}
export const pretty = (text: string) => text.replaceAll("_", " ");
export const amount = (n: number | null | undefined, digits = 3) =>
  n == null
    ? "Unavailable"
    : n.toLocaleString(undefined, { maximumFractionDigits: digits });
export const date = (value: string) => new Date(value).toLocaleString();
