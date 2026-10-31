import { useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  Check,
  CircleHelp,
  Copy,
  MessageSquareText,
  ShieldCheck,
  Terminal,
  X,
} from "lucide-react";
import type { Analysis, Run } from "./contracts";
import { amount, date, pretty, traceRounds, usage } from "./trace";
import type { TraceCandidate } from "./trace";
import { Json, StatusBadge } from "./common";

export function RunHeader({ run }: { run: Run }) {
  const u = usage(run);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const duration = Math.max(
    0,
    (new Date(run.updated_at).getTime() - new Date(run.created_at).getTime()) /
      1000,
  );
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        window.location.origin + `/runs/${run.run_id}`,
      );
      setCopied(true);
      setCopyError("");
    } catch {
      setCopyError("Copy unavailable. Use the run ID or browser address.");
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(run, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `run-${run.run_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="panel run-header">
      <div className="run-heading">
        <div>
          <span className="eyebrow">PERSISTED EXECUTION TRACE</span>
          <h2>
            Run <span className="mono">{run.run_id.slice(0, 8)}</span>
            <StatusBadge status={run.status} />
          </h2>
        </div>
        <div className="header-actions">
          <button
            className="icon-button"
            aria-label="Copy exact trace link"
            title="Copy exact trace link"
            onClick={() => void copy()}
          >
            {copied ? <Check size={17} /> : <Copy size={17} />}
          </button>
          <button
            className="icon-button"
            aria-label="Download actual trace JSON"
            title="Download actual trace JSON"
            onClick={download}
          >
            <ArrowDownToLine size={17} />
          </button>
        </div>
      </div>
      <div className="id-line">
        Run <code>{run.run_id}</code>
      </div>
      <div className="id-line">
        Conversation <code>{run.conversation_id}</code>
      </div>
      {copyError && (
        <p role="status" className="help">
          {copyError}
        </p>
      )}
      <div className="run-facts">
        <div>
          <small>Mode</small>
          <strong>{pretty(run.request.mode)}</strong>
        </div>
        <div>
          <small>
            Recorded duration{run.status === "running" ? " so far" : ""}
          </small>
          <strong>{amount(duration, 2)} s</strong>
        </div>
        <div>
          <small>Logged model calls</small>
          <strong>{u.calls}</strong>
        </div>
        <div>
          <small>Reported tokens · in / out</small>
          <strong>
            {amount(u.input.value, 0)} / {amount(u.output.value, 0)}
            {(u.input.partial || u.output.partial) && " (partial)"}
          </strong>
        </div>
      </div>
      <p className="help">
        {date(run.created_at)} ·{" "}
        {u.provenance.length
          ? u.provenance.map(pretty).join(", ")
          : "No model provenance logged yet"}
        . Cost unavailable unless recorded per event. Failed attempts may have
        unreported usage.
      </p>
    </div>
  );
}

export function TraceView({ run }: { run: Run }) {
  const analysis = (run.result?.analysis ||
    run.events.find((e) => e.stage === "analysis")?.payload.output) as
    Analysis | undefined;
  const adaptation = run.events.find(
    (e) => e.stage === "context_adaptation",
  )?.payload;
  const context = run.events.find((e) => e.stage === "context")?.payload;
  const rounds = traceRounds(run);
  const selected = run.result?.selected;
  return (
    <div className="trace-view">
      <div className="disclosure">
        <ShieldCheck size={18} />
        <span>
          {run.result?.disclosure ||
            "Simulated reactions and assessment scores are uncalibrated model predictions, not observed human behavior or independently validated evaluation."}
        </span>
      </div>
      <section className="panel input-panel">
        <div className="section-title">
          <MessageSquareText size={17} />
          <h2>Submitted input</h2>
          <span className="label-tag">Researcher submitted</span>
        </div>
        <p className="input-text">{run.request.text}</p>
        <div className="input-config">
          <span>
            Requested language{" "}
            <strong>
              {run.request.output_language || "Automatic detection"}
            </strong>
          </span>
          <span>
            Script <strong>{run.request.output_script}</strong>
          </span>
          <span>
            Refinement limit <strong>{run.request.max_refinements}</strong>
          </span>
        </div>
      </section>
      <section className="panel analysis-panel">
        <div className="section-title">
          <Activity size={17} />
          <h2>Context & escalation</h2>
          <span className="label-tag">Model assessment</span>
        </div>
        {analysis ? (
          <>
            <div className="analysis-stats">
              <div>
                <small>Detected language / script</small>
                <strong>
                  {pretty(analysis.detected_language)} /{" "}
                  {analysis.detected_script}
                </strong>
              </div>
              <div>
                <small>Input hostility · 0–1</small>
                <strong>{amount(analysis.hostility)}</strong>
              </div>
              <div>
                <small>Hostility change from prior input</small>
                <strong>
                  {adaptation?.hostility_delta == null
                    ? "No prior assessment"
                    : `${adaptation.hostility_delta > 0 ? "+" : ""}${amount(adaptation.hostility_delta)}`}
                </strong>
              </div>
            </div>
            <p>{analysis.context_summary}</p>
            <dl className="analysis-details">
              <div>
                <dt>Target</dt>
                <dd>{analysis.target}</dd>
              </div>
              <div>
                <dt>Emotion</dt>
                <dd>{analysis.emotion}</dd>
              </div>
              <div>
                <dt>Language uncertainty</dt>
                <dd>{analysis.language_uncertainty}</dd>
              </div>
              <div>
                <dt>Effective output</dt>
                <dd>
                  {run.result?.output_language ||
                    run.request.output_language ||
                    analysis.suggested_output_language}{" "}
                  · {run.request.output_script}
                </dd>
              </div>
            </dl>
            {context && (
              <details>
                <summary>
                  Observed context actually supplied to this run (
                  {context.history_included ?? 0} earlier turns)
                </summary>
                <p className="help">
                  {context.history_suppressed_by_ablation
                    ? "History suppressed by experiment mode."
                    : context.history_truncated
                      ? "History was truncated to the backend context budget."
                      : "History inclusion is recorded by the backend."}
                </p>
                <Json value={context} />
              </details>
            )}
          </>
        ) : (
          <p className="muted">
            {run.request.mode === "single_shot"
              ? "The single-shot baseline does not analyze context."
              : "No context analysis has been recorded yet."}
          </p>
        )}
      </section>
      {run.status === "abstained" && (
        <div className="decision-banner abstention">
          <ShieldCheck size={22} />
          <div>
            <h2>Abstained · no response selected</h2>
            <p>
              No candidate passed all required policy gates within this run’s
              refinement budget. Review the recorded reasons below.
            </p>
          </div>
        </div>
      )}
      {run.status === "failed" && (
        <div className="decision-banner failure" role="alert">
          <X size={22} />
          <div>
            <h2>Run failed · no recommendation</h2>
            <p>
              {pretty(run.error_code || "unknown failure")}. Partial candidates
              and completed events remain inspectable below.
            </p>
          </div>
        </div>
      )}
      {selected && (
        <div className="decision-banner recommendation">
          <Check size={22} />
          <div>
            <h2>
              {run.request.mode === "single_shot"
                ? "Unevaluated baseline output"
                : "Selected response · human review required"}
            </h2>
            <p className="generated-text">{selected.text}</p>
            <p className="help">
              {run.request.mode === "single_shot"
                ? "No eligibility, quality or safety approval is implied."
                : "The selected candidate passed the recorded gates and ranked first among eligible candidates in its round."}{" "}
              This response has not been posted.
            </p>
            <code>{selected.candidate_id}</code>
          </div>
        </div>
      )}
      {rounds.map((round) => (
        <section
          className="round-section"
          key={round.index}
          aria-label={`Round ${round.index}`}
        >
          <div className="round-heading">
            <div>
              <span className="round-number">
                {String(round.index).padStart(2, "0")}
              </span>
              <h2>
                {round.index === 0
                  ? "Initial candidates"
                  : `Refinement round ${round.index}`}
              </h2>
              <span className="label-tag">
                {round.candidates.length} recorded
              </span>
            </div>
            <span className="help">
              {round.ranking.length
                ? "Backend ranking recorded"
                : "Ranking not recorded"}
            </span>
          </div>
          <div className="candidate-grid">
            {round.candidates.map((candidate, index) => (
              <CandidateCard
                key={
                  candidate.candidate_id ||
                  `unassigned-draft-${round.index}-${index}`
                }
                candidate={candidate}
                selected={selected?.candidate_id === candidate.candidate_id}
                rank={
                  candidate.candidate_id
                    ? round.ranking.indexOf(candidate.candidate_id) + 1
                    : 0
                }
                run={run}
              />
            ))}
          </div>
          {round.refinement_feedback.length > 0 && (
            <details className="panel refinement">
              <summary>
                Refinement triggered · no candidate passed required gates
              </summary>
              <p className="help">
                Candidate-specific feedback actually supplied to the next
                generation round.
              </p>
              <Json value={round.refinement_feedback} />
            </details>
          )}
        </section>
      ))}
      {rounds.length === 0 && (
        <div className="panel no-candidates">
          <p className="muted">No candidate event has been recorded.</p>
        </div>
      )}
    </div>
  );
}

function CandidateCard({
  candidate: c,
  selected,
  rank,
  run,
}: {
  candidate: TraceCandidate;
  selected: boolean;
  rank: number;
  run: Run;
}) {
  const s = c.simulation;
  const a = c.assessment;
  const assessed = c.score != null;
  const policy = run.events.find((e) => e.stage === "started")?.payload.policy;
  const gates =
    a && policy
      ? [
          ["Safety", a.safe ? "Approved" : "Rejected", "Required", a.safe],
          [
            "Toxicity",
            amount(a.toxicity),
            `≤ ${policy.max_toxicity}`,
            a.toxicity <= policy.max_toxicity,
          ],
          [
            "Relevance",
            amount(a.relevance),
            `≥ ${policy.min_relevance}`,
            a.relevance >= policy.min_relevance,
          ],
          [
            "Language / script",
            a.language_matches ? "Matches" : "Mismatch",
            "Must match",
            a.language_matches,
          ],
          ...(s
            ? [
                [
                  "Predicted escalation",
                  amount(s.probabilities.escalate),
                  `≤ ${policy.max_escalation}`,
                  s.probabilities.escalate <= policy.max_escalation,
                ],
                [
                  "Predicted de-escalation",
                  amount(s.probabilities.deescalate),
                  `≥ ${policy.min_deescalation}`,
                  s.probabilities.deescalate >= policy.min_deescalation,
                ],
              ]
            : []),
        ]
      : [];
  return (
    <article
      className={`panel candidate-card ${selected ? "chosen" : assessed && !c.eligible ? "rejected" : ""}`}
    >
      <div className="candidate-heading">
        <span className="strategy">{pretty(c.strategy)}</span>
        <span
          className={`decision-pill ${selected ? "selected" : assessed && !c.eligible ? "rejected" : ""}`}
        >
          {selected
            ? run.request.mode === "single_shot"
              ? "Baseline output"
              : "Selected"
            : assessed
              ? c.eligible
                ? "Eligible · not selected"
                : "Rejected"
              : "Not assessed"}
        </span>
      </div>
      <p className="generated-text candidate-text">{c.text}</p>
      <div className="candidate-score">
        <span>{rank > 0 ? `Rank #${rank}` : "Unranked"}</span>
        <span>
          Score <strong>{amount(c.score, 6)}</strong>
        </span>
      </div>
      <div className="candidate-block">
        <h3>
          Model-estimated reaction{" "}
          {s && <span>{pretty(s.reaction_class)}</span>}
        </h3>
        <p className="prediction-label">
          Uncalibrated predictions · not observed outcomes
        </p>
        {s ? (
          <>
            <div className="probabilities">
              {Object.entries(s.probabilities).map(([key, value]) => (
                <div className={`probability ${key}`} key={key}>
                  <span>
                    {key === "deescalate"
                      ? "De-escalate"
                      : key === "escalate"
                        ? "Escalate"
                        : "Neutral"}
                  </span>
                  <meter
                    min={0}
                    max={1}
                    value={value}
                    aria-label={`${key} model estimate`}
                  />
                  <strong>{amount(value * 100, 2)}%</strong>
                </div>
              ))}
            </div>
            <div className="simulated-reply">
              <span className="eyebrow">SIMULATED FUTURE REPLY</span>
              <p className="generated-text">
                {s.simulated_reply || "No reply text recorded"}
              </p>
            </div>
            <p className="help">{s.decision_summary}</p>
            <p className="uncertainty">
              <CircleHelp size={14} />
              {s.uncertainty}
            </p>
          </>
        ) : (
          <p className="muted">
            {["single_shot", "no_simulation"].includes(run.request.mode)
              ? "Simulation disabled by experiment mode."
              : "Simulation not recorded."}
          </p>
        )}
      </div>
      <div className="candidate-block">
        <h3>Quality assessment</h3>
        {a ? (
          <>
            <div className="quality-grid">
              <span>
                Toxicity <strong>{amount(a.toxicity)}</strong>
              </span>
              <span>
                Relevance <strong>{amount(a.relevance)}</strong>
              </span>
              <span>
                Argument strength <strong>{amount(a.argument_strength)}</strong>
              </span>
              <span>
                Language quality <strong>{amount(a.language_quality)}</strong>
              </span>
            </div>
            <p className="help">{a.decision_summary}</p>
            <p className="help">
              Separate model assessment, not independent human evaluation.
            </p>
          </>
        ) : (
          <p className="muted">
            {run.request.mode === "single_shot"
              ? "Assessment disabled for the baseline."
              : "Assessment not recorded."}
          </p>
        )}
      </div>
      <div className="candidate-block decision-reasons">
        <h3>Recorded decision</h3>
        {c.decision_reasons.length ? (
          <ul>
            {c.decision_reasons.map((reason) => (
              <li key={reason}>{pretty(reason)}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">No eligibility decision recorded.</p>
        )}
        {gates.length > 0 && (
          <details>
            <summary>Inspect thresholds & scoring</summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Gate</th>
                    <th>Value</th>
                    <th>Policy</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {gates.map(([name, value, threshold, pass]) => (
                    <tr key={String(name)}>
                      <td>{name}</td>
                      <td>{value}</td>
                      <td>{threshold}</td>
                      <td className={pass ? "pass-text" : "fail-text"}>
                        {pass ? "Pass" : "Fail"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="help">
              Recorded policy: {policy.version}. These thresholds are
              engineering hypotheses.
            </p>
            {policy.version === "policy-1.0-hypothesis" && (
              <p className="help">
                Score = 0.15 relevance + 0.15 argument strength + 0.15 (1 −
                toxicity) + 0.10 language quality
                {s
                  ? " + 0.45 predicted de-escalation"
                  : ", divided by 0.55 without simulation"}
                . Eligibility takes priority over score. Generation order breaks
                ties. A later round is generated only after all candidates in
                the earlier round fail.
              </p>
            )}
          </details>
        )}
      </div>
      <code className="candidate-id">
        {c.candidate_id || "Generated draft · no candidate ID assigned"}
      </code>
    </article>
  );
}

export function EventsView({ run }: { run: Run }) {
  return (
    <section className="panel events-panel">
      <div className="section-title">
        <Terminal size={18} />
        <h2>Persisted execution events</h2>
      </div>
      <p className="help">
        Structured inputs, outputs and decisions recorded by the backend. Timing
        and tokens appear only when reported. No hidden model reasoning is
        exposed.
      </p>
      {run.events.map((event) => (
        <details className="event" key={event.sequence}>
          <summary>
            <span className="event-sequence">
              {String(event.sequence).padStart(2, "0")}
            </span>
            <span className="event-name">
              {pretty(event.stage)}
              {event.payload.candidate_id && (
                <small>
                  Candidate {event.payload.candidate_id.slice(0, 8)}
                </small>
              )}
            </span>
            <span className="event-meta">
              {event.payload.metadata?.latency_ms != null
                ? `${amount(event.payload.metadata.latency_ms)} ms`
                : "Timing unavailable"}
              <small>{date(event.created_at)}</small>
            </span>
          </summary>
          {event.payload.metadata && (
            <dl className="event-metadata">
              {Object.entries(event.payload.metadata).map(([key, value]) => (
                <div key={key}>
                  <dt>{pretty(key)}</dt>
                  <dd>{value == null ? "Unavailable" : String(value)}</dd>
                </div>
              ))}
            </dl>
          )}
          <Json value={event.payload} />
        </details>
      ))}
    </section>
  );
}
