// Mirrors backend/src/counterspeech/schemas.py, schema_version 1.0.
// API contract changes must be reflected here and exercised through integration tests.
export type Language =
  "english" | "hindi" | "malayalam" | "hinglish" | "minglish";
export type Mode = "full" | "no_history" | "no_simulation" | "single_shot";
export type Status = "running" | "completed" | "abstained" | "failed";
export interface RunRequest {
  text: string;
  conversation_id?: string;
  output_language: Language | null;
  output_script: "auto" | "native" | "romanized";
  mode: Mode;
  candidate_count: number;
  max_refinements: number;
}
export interface Analysis {
  detected_language: string;
  detected_script: string;
  suggested_output_language: Language;
  target: string;
  emotion: string;
  hostility: number;
  language_uncertainty: string;
  context_summary: string;
}
export interface Simulation {
  reaction_class: string;
  probabilities: { deescalate: number; neutral: number; escalate: number };
  simulated_reply: string;
  decision_summary: string;
  uncertainty: string;
}
export interface Assessment {
  safe: boolean;
  toxicity: number;
  relevance: number;
  argument_strength: number;
  language_quality: number;
  language_matches: boolean;
  decision_summary: string;
}
export interface Candidate {
  candidate_id: string;
  round_index: number;
  strategy: string;
  text: string;
  script_validation?: {
    validator_version: string;
    unicode_version: string;
    requested_script: string;
    expected_script: string;
    valid: boolean;
    reasons: string[];
    letter_counts: Record<string, number>;
    disallowed_codepoints: string[];
  } | null;
  simulation: Simulation | null;
  assessment: Assessment | null;
  score: number | null;
  eligible: boolean;
  decision_reasons: string[];
}
export interface Round {
  index: number;
  candidates: Candidate[];
  ranking: string[];
  refinement_feedback: unknown[];
}
export interface TraceEvent {
  sequence: number;
  stage: string;
  payload: Record<string, any>;
  created_at: string;
}
export interface RunSummary {
  run_id: string;
  conversation_id: string;
  status: Status;
  mode: Mode;
  created_at: string;
  error_code: string | null;
}
export interface Run extends Omit<RunSummary, "mode"> {
  request: RunRequest;
  result: null | {
    schema_version: "1.0";
    mode: Mode;
    analysis: Analysis | null;
    output_language: Language | null;
    output_script: string;
    rounds: Round[];
    selected: Candidate | null;
    outcome: "completed" | "abstained";
    disclosure: string;
  };
  events: TraceEvent[];
  updated_at: string;
}
export interface Conversation {
  conversation_id: string;
  title: string;
  active_run_id: string | null;
  turns: {
    turn_id: string;
    sequence: number;
    speaker: "original_speaker" | "human_reply";
    text: string;
    provenance: string;
    created_at: string;
  }[];
  runs: { run_id: string; status: Status }[];
  hostility_trend: {
    run_id: string;
    hostility: number;
    detected_language: string;
    provenance: string;
  }[];
}
export interface Capabilities {
  inference_configured: boolean;
  languages: Language[];
  modes: Mode[];
  max_refinements: number;
}
