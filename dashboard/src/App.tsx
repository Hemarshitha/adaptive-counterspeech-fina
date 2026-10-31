import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  ChevronRight,
  CircleHelp,
  FlaskConical,
  History,
  Layers3,
  LoaderCircle,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Terminal,
  X,
} from "lucide-react";
import { api, ApiError, errorMessage } from "./api";
import type {
  Capabilities,
  Conversation,
  Language,
  Mode,
  Run,
  RunRequest,
  RunSummary,
} from "./contracts";
import { amount, date, pretty } from "./trace";
import { StatusBadge } from "./common";
import { RunHeader, TraceView, EventsView } from "./Evidence";

const languages: [Language, string][] = [
  ["english", "English"],
  ["hindi", "हिन्दी · Hindi"],
  ["malayalam", "മലയാളം · Malayalam"],
  ["hinglish", "Hinglish"],
  ["minglish", "Minglish"],
];
const pathRun = () =>
  window.location.pathname.match(/^\/runs\/([^/]+)$/)?.[1] ||
  new URLSearchParams(window.location.search).get("run_id") ||
  "";
const validId = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function App() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [limit, setLimit] = useState(30);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(pathRun);
  const [run, setRun] = useState<Run | null>(null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("trace");
  const [runQuery, setRunQuery] = useState("");
  const [text, setText] = useState("");
  const [language, setLanguage] = useState<Language | "">("english");
  const [script, setScript] = useState<RunRequest["output_script"]>("auto");
  const [mode, setMode] = useState<Mode>("full");
  const [count, setCount] = useState(2);
  const [refinements, setRefinements] = useState(1);
  const [conversationId, setConversationId] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pollError, setPollError] = useState("");
  const [observedText, setObservedText] = useState("");
  const [speaker, setSpeaker] = useState<"original_speaker" | "human_reply">(
    "human_reply",
  );
  const [recording, setRecording] = useState(false);
  const [confirmedObservation, setConfirmedObservation] = useState(false);
  const busy = submitting || !!pending;
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [capabilities, list] = await Promise.all([
        api<Capabilities>("/v1/capabilities"),
        api<{ runs: RunSummary[] }>(`/v1/runs?limit=${limit}`),
      ]);
      if (!mounted.current) return;
      setCaps(capabilities);
      setRuns(list.runs);
      setConnectionError("");
    } catch (e) {
      if (mounted.current) {
        setConnectionError(errorMessage(e));
        setCaps(null);
      }
    }
  }, [limit]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);
  const navigate = useCallback((id: string) => {
    setSelectedId(id);
    setTab("trace");
    setError("");
    window.history.pushState({}, "", id ? `/runs/${id}` : "/");
  }, []);
  useEffect(() => {
    const pop = () => setSelectedId(pathRun());
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);

  useEffect(() => {
    let alive = true;
    setRun(null);
    setConversation(null);
    setPollError("");
    if (!selectedId) {
      setLoading(false);
      return;
    }
    if (!validId(selectedId)) {
      setError("Enter a valid UUID run ID.");
      setLoading(false);
      return;
    }
    setLoading(true);
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      let shouldPoll = true;
      try {
        const view = await api<Run>(`/v1/runs/${selectedId}`);
        if (!alive) return;
        setRun(view);
        setLoading(false);
        setPollError("");
        shouldPoll = view.status === "running";
        try {
          const c = await api<Conversation>(
            `/v1/conversations/${view.conversation_id}`,
          );
          if (alive) setConversation(c);
        } catch (e) {
          if (alive) setPollError(`Conversation: ${errorMessage(e)}`);
        }
      } catch (e) {
        if (!alive) return;
        setLoading(false);
        setPollError(errorMessage(e));
        shouldPoll = !(
          e instanceof ApiError && [404, 422, 401, 503].includes(e.status)
        );
      }
      if (alive && shouldPoll) timer = setTimeout(load, 1500);
    };
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [selectedId]);

  // The existing synchronous POST does not return its ID until completion. Its
  // conversation exposes active_run_id while executing, so no API change is needed.
  useEffect(() => {
    if (!pending) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const discover = async () => {
      try {
        const c = await api<Conversation>(`/v1/conversations/${pending}`);
        if (!alive) return;
        if (c.active_run_id && c.active_run_id !== selectedId)
          navigate(c.active_run_id);
      } catch (e) {
        if (alive) setPollError(errorMessage(e));
      }
      if (alive) timer = setTimeout(discover, 1200);
    };
    void discover();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [pending, selectedId, navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !text.trim()) return;
    setSubmitting(true);
    setError("");
    setPollError("");
    let cid = conversationId.trim();
    let knownRuns: string[] = [];
    try {
      if (cid && !validId(cid)) throw new Error("Invalid conversation ID");
      if (!cid) {
        const c = await api<{ conversation_id: string }>("/v1/conversations", {
          title: "",
        });
        cid = c.conversation_id;
      } else {
        const c = await api<Conversation>(`/v1/conversations/${cid}`);
        if (c.active_run_id) throw new ApiError(409, "conversation_busy");
        knownRuns = c.runs.map((r) => r.run_id);
      }
      setConversationId(cid);
      setPending(cid);
      const view = await api<Run>("/v1/runs", {
        text: text.trim(),
        conversation_id: cid,
        output_language: language || null,
        output_script: script,
        mode,
        candidate_count: count,
        max_refinements: refinements,
      } satisfies RunRequest);
      navigate(view.run_id);
      setRun(view);
      setConversation(await api<Conversation>(`/v1/conversations/${cid}`));
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && e.runId) {
        navigate(e.runId);
        setError(errorMessage(e));
        try {
          setRun(await api<Run>(`/v1/runs/${e.runId}`));
        } catch {
          /* polling displays retrieval errors */
        }
      } else if (cid && validId(cid)) {
        // A dropped POST response is ambiguous. Retrieve persisted work; never retry inference automatically.
        try {
          const c = await api<Conversation>(`/v1/conversations/${cid}`);
          setConversation(c);
          const recovered =
            c.active_run_id ||
            c.runs.find((r) => !knownRuns.includes(r.run_id))?.run_id;
          if (recovered) {
            navigate(recovered);
            setError(errorMessage(e));
          }
        } catch {
          /* original error remains visible */
        }
      }
    } finally {
      setSubmitting(false);
      setPending(null);
      void refresh();
    }
  }

  async function recordObserved(event: React.FormEvent) {
    event.preventDefault();
    if (
      !conversation ||
      !confirmedObservation ||
      !observedText.trim() ||
      recording
    )
      return;
    setRecording(true);
    setError("");
    try {
      await api(`/v1/conversations/${conversation.conversation_id}/turns`, {
        speaker,
        text: observedText.trim(),
      });
      setConversation(
        await api<Conversation>(
          `/v1/conversations/${conversation.conversation_id}`,
        ),
      );
      setObservedText("");
      setConfirmedObservation(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRecording(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          href="/"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            if (!busy) navigate("");
          }}
        >
          <span className="brand-icon">
            <Layers3 size={21} />
          </span>
          <span>
            counterpoint
            <span className="brand-sub">COUNTERSPEECH RESEARCH</span>
          </span>
        </a>
        <div className="sidebar-section">WORKSPACE</div>
        <button
          className="workspace-link active"
          onClick={() => {
            if (!busy) {
              navigate("");
              setConversationId("");
            }
          }}
          disabled={busy}
        >
          <FlaskConical size={17} /> Research console <ChevronRight size={14} />
        </button>
        <div className="sidebar-section run-list-heading">
          <span>SAVED RUNS</span>
          <button
            className="icon-button"
            aria-label="Refresh saved runs"
            onClick={() => void refresh()}
          >
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="run-list">
          {runs.length === 0 && (
            <p className="sidebar-empty">
              {connectionError
                ? "Run library unavailable."
                : "Your persisted runs will appear here."}
            </p>
          )}
          {runs.map((item) => (
            <button
              className={`run-link ${selectedId === item.run_id ? "selected" : ""}`}
              key={item.run_id}
              disabled={busy && selectedId !== item.run_id}
              onClick={() => navigate(item.run_id)}
            >
              <span className={`run-indicator ${item.status}`} />
              <span>
                <span className="mono">{item.run_id.slice(0, 8)}</span>
                <small>{date(item.created_at)}</small>
              </span>
              <span className="run-state">{item.status}</span>
            </button>
          ))}
        </div>
        <label className="library-limit">
          Recent runs
          <select
            aria-label="Number of recent runs"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            <option value={30}>30</option>
            <option value={100}>100</option>
          </select>
        </label>
        <form
          className="exact-run"
          onSubmit={(e) => {
            e.preventDefault();
            if (validId(runQuery.trim())) navigate(runQuery.trim());
            else setError("Enter a valid UUID run ID.");
          }}
        >
          <label htmlFor="run-id">Open exact trace</label>
          <div className="input-action">
            <input
              id="run-id"
              placeholder="Paste run UUID"
              value={runQuery}
              onChange={(e) => setRunQuery(e.target.value)}
              disabled={busy}
            />
            <button aria-label="Open run ID" disabled={busy}>
              <Search size={16} />
            </button>
          </div>
        </form>
        <div className="sidebar-footer">
          <ShieldCheck size={18} />
          <span>
            Internal research only<small>Human review required</small>
          </span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="muted">Workspace</span>
            <ChevronRight size={14} />
            <strong>Research console</strong>
          </div>
          <span className={`connection ${caps ? "connected" : ""}`}>
            <span className="status-dot" />
            {caps
              ? caps.inference_configured
                ? "Backend connected · inference configured"
                : "Backend connected · inference unavailable"
              : "Backend unavailable"}
          </span>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <p className="eyebrow">PREDICTIVE REACTION SIMULATION</p>
              <h1>Research console</h1>
              <p className="subtitle">
                Generate, inspect and trace a response through the research
                pipeline.
              </p>
            </div>
            <span className="workspace-tag">
              <FlaskConical size={15} /> Internal workspace
            </span>
          </div>
          {connectionError && (
            <div className="notice error" role="alert">
              {connectionError}. Check the backend and the dashboard server’s
              environment configuration.
              <button className="text-button" onClick={() => void refresh()}>
                Retry connection
              </button>
            </div>
          )}
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className="research-grid">
            <section
              className="panel compose-panel"
              aria-labelledby="new-run-heading"
            >
              <div className="panel-heading">
                <span className="heading-icon">
                  <Plus size={17} />
                </span>
                <div>
                  <h2 id="new-run-heading">Configure a run</h2>
                  <p>A real call to the shared research engine</p>
                </div>
              </div>
              <form onSubmit={submit}>
                <div className="conversation-target">
                  <span>
                    {conversationId
                      ? "Continuing conversation"
                      : "New conversation"}
                  </span>
                  {conversationId && (
                    <>
                      <code>{conversationId}</code>
                      <button
                        type="button"
                        className="text-button"
                        disabled={busy}
                        onClick={() => setConversationId("")}
                      >
                        Clear conversation
                      </button>
                    </>
                  )}
                </div>
                <label htmlFor="comment">Comment to respond to</label>
                <textarea
                  id="comment"
                  required
                  maxLength={8000}
                  placeholder="Enter the comment you want to investigate…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={busy}
                  rows={7}
                />
                <div className="field-hint">
                  <span>Saved as a researcher-submitted input</span>
                  <span>{text.length}/8000</span>
                </div>
                <label htmlFor="language">Response language</label>
                <select
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as Language | "")}
                  disabled={busy}
                >
                  <option value="">Detect automatically</option>
                  {languages.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
                <label htmlFor="script">
                  Required script <span className="muted">· optional</span>
                </label>
                <select
                  id="script"
                  value={script}
                  onChange={(e) =>
                    setScript(e.target.value as RunRequest["output_script"])
                  }
                  disabled={busy}
                >
                  <option value="auto">Automatic</option>
                  <option value="native">Native script</option>
                  <option value="romanized">Romanized</option>
                </select>
                <div className="form-row">
                  <div>
                    <label htmlFor="count">Candidates</label>
                    <select
                      id="count"
                      value={count}
                      onChange={(e) => setCount(Number(e.target.value))}
                      disabled={busy || mode === "single_shot"}
                    >
                      {[2, 3, 4].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="refinements">Refinement limit</label>
                    <select
                      id="refinements"
                      value={refinements}
                      onChange={(e) => setRefinements(Number(e.target.value))}
                      disabled={
                        busy ||
                        mode === "single_shot" ||
                        mode === "no_simulation"
                      }
                    >
                      {[0, 1, 2].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <details className="advanced">
                  <summary>Conversation & experiment settings</summary>
                  <label htmlFor="conversation-id">
                    Continue conversation UUID
                  </label>
                  <input
                    id="conversation-id"
                    placeholder="Blank starts a new conversation"
                    value={conversationId}
                    onChange={(e) => setConversationId(e.target.value)}
                    disabled={busy}
                    pattern="[0-9a-fA-F-]{36}"
                  />
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() => setConversationId("")}
                  >
                    Start a new conversation
                  </button>
                  <label htmlFor="mode">Experiment mode</label>
                  <select
                    id="mode"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as Mode)}
                    disabled={busy}
                  >
                    <option value="full">Full adaptive pipeline</option>
                    <option value="no_history">
                      Ablation · without history
                    </option>
                    <option value="no_simulation">
                      Ablation · without simulation
                    </option>
                    <option value="single_shot">
                      Single-shot baseline · unevaluated
                    </option>
                  </select>
                  <p className="help">
                    {mode === "single_shot"
                      ? "One response, no simulation or quality assessment. Candidate and refinement settings are ignored by the backend."
                      : mode === "no_simulation"
                        ? "Reaction simulation and refinement are disabled by the backend."
                        : "Refinement occurs only when no candidate passes the policy gates."}
                  </p>
                </details>
                <button
                  className="primary run-button"
                  disabled={busy || !caps?.inference_configured || !text.trim()}
                >
                  {busy ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <Activity size={17} />
                  )}
                  {busy ? "Processing real pipeline…" : "Run pipeline"}
                  {!busy && <ArrowRight size={17} />}
                </button>
                <p className="help run-help">
                  Calls use your server’s configured model. No response is
                  posted to any platform.
                </p>
              </form>
            </section>
            <section className="results-area" aria-label="Research evidence">
              {pollError && (
                <div className="notice error" role="alert">
                  Trace retrieval: {pollError}. Saved evidence is retained by
                  the backend.
                </div>
              )}
              {busy && (
                <div className="notice processing" role="status">
                  <LoaderCircle size={18} className="spin" />
                  <span>
                    Processing on the backend. Events appear as they are
                    persisted. No estimated progress percentage.
                    <small>
                      If this connection drops, inspect saved runs before
                      retrying.
                    </small>
                  </span>
                </div>
              )}
              {loading && !run ? (
                <div className="panel empty-state">
                  <LoaderCircle className="spin" size={28} />
                  <h2>Loading exact trace</h2>
                  <p className="mono">{selectedId}</p>
                </div>
              ) : run ? (
                <>
                  <RunHeader run={run} />
                  <div className="tabs" role="tablist" aria-label="Trace views">
                    {[
                      ["trace", "Run trace", Layers3],
                      ["conversation", "Conversation", MessageSquareText],
                      ["events", "Execution log", Terminal],
                    ].map(([id, label, Icon]) => {
                      const Glyph = Icon as typeof Layers3;
                      return (
                        <button
                          key={id as string}
                          role="tab"
                          id={`tab-${id}`}
                          aria-controls={`panel-${id}`}
                          aria-selected={tab === id}
                          onClick={() => setTab(id as string)}
                        >
                          <Glyph size={16} />
                          {label as string}
                          {id === "events" && (
                            <span className="tab-count">
                              {run.events.length}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div
                    role="tabpanel"
                    id={`panel-${tab}`}
                    aria-labelledby={`tab-${tab}`}
                  >
                    {tab === "trace" && <TraceView run={run} />}
                    {tab === "events" && <EventsView run={run} />}
                    {tab === "conversation" &&
                      (conversation ? (
                        <div className="panel conversation-panel">
                          <div className="section-title">
                            <History size={18} />
                            <h2>Observed conversation</h2>
                          </div>
                          <p className="help">
                            Researcher-submitted records, separate from
                            model-simulated replies. API provenance does not
                            independently verify human origin. This is the
                            current full conversation; later turns may postdate
                            this run.
                          </p>
                          <div className="id-line">
                            Conversation{" "}
                            <code>{conversation.conversation_id}</code>
                          </div>
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() => {
                              setConversationId(conversation.conversation_id);
                              document.getElementById("comment")?.focus();
                            }}
                          >
                            Use this conversation for next run{" "}
                            <ArrowRight size={14} />
                          </button>
                          <h3>Model-assessed hostility across inputs</h3>
                          <p className="help">
                            Scores describe observed inputs as assessed by the
                            model; they do not measure actual de-escalation.
                          </p>
                          <div className="trend-list">
                            {conversation.hostility_trend.length === 0 ? (
                              <p className="muted">
                                No completed input assessments available.
                              </p>
                            ) : (
                              conversation.hostility_trend.map(
                                (point, index) => (
                                  <button
                                    className="trend-row"
                                    key={point.run_id}
                                    disabled={busy}
                                    onClick={() => navigate(point.run_id)}
                                  >
                                    <span>
                                      Input {index + 1} ·{" "}
                                      {pretty(point.detected_language)}
                                    </span>
                                    <meter
                                      min={0}
                                      max={1}
                                      value={point.hostility}
                                      aria-label={`Hostility input ${index + 1}`}
                                    />
                                    <strong>{amount(point.hostility)}</strong>
                                    <code>{point.run_id.slice(0, 8)}</code>
                                  </button>
                                ),
                              )
                            )}
                          </div>
                          <div className="turn-list">
                            {conversation.turns.map((turn) => (
                              <article
                                className={`turn ${turn.speaker}`}
                                key={turn.turn_id}
                              >
                                <div>
                                  <strong>
                                    {turn.sequence.toString().padStart(2, "0")}{" "}
                                    ·{" "}
                                    {turn.speaker === "human_reply"
                                      ? "Recorded posted reply"
                                      : "Submitted speaker message"}
                                  </strong>
                                  <time>{date(turn.created_at)}</time>
                                </div>
                                <p className="generated-text">{turn.text}</p>
                                <small>{turn.provenance}</small>
                              </article>
                            ))}
                          </div>
                          <h3>Runs in this conversation</h3>
                          <div className="conversation-runs">
                            {conversation.runs.map((r) => (
                              <button
                                className="secondary"
                                disabled={busy}
                                key={r.run_id}
                                onClick={() => navigate(r.run_id)}
                              >
                                <code>{r.run_id.slice(0, 8)}</code>
                                <StatusBadge status={r.status} />
                              </button>
                            ))}
                          </div>
                          <form
                            className="record-form"
                            onSubmit={recordObserved}
                          >
                            <h3>Record an observed turn</h3>
                            <p className="help">
                              Record only an actual message or actually posted
                              reply. To analyze the next speaker message, enter
                              it in “Comment to respond to” and run the pipeline
                              instead; do not record it twice.
                            </p>
                            <label htmlFor="speaker">Speaker</label>
                            <select
                              id="speaker"
                              value={speaker}
                              onChange={(e) =>
                                setSpeaker(e.target.value as typeof speaker)
                              }
                            >
                              <option value="human_reply">
                                Actually posted human reply
                              </option>
                              <option value="original_speaker">
                                Earlier observed speaker message
                              </option>
                            </select>
                            <label htmlFor="observed-text">Actual text</label>
                            <textarea
                              id="observed-text"
                              required
                              maxLength={8000}
                              value={observedText}
                              onChange={(e) => setObservedText(e.target.value)}
                              rows={3}
                            />
                            <label className="checkbox-label">
                              <input
                                type="checkbox"
                                checked={confirmedObservation}
                                onChange={(e) =>
                                  setConfirmedObservation(e.target.checked)
                                }
                              />
                              I confirm this is an observed message, not a
                              simulated reply or an unposted recommendation.
                            </label>
                            <button
                              className="secondary"
                              disabled={
                                busy ||
                                recording ||
                                !!conversation.active_run_id ||
                                !confirmedObservation ||
                                !observedText.trim()
                              }
                            >
                              Save observed turn
                            </button>
                          </form>
                        </div>
                      ) : (
                        <div className="panel empty-state">
                          <h2>Conversation unavailable</h2>
                          <p>Check the trace retrieval error above.</p>
                        </div>
                      ))}
                  </div>
                </>
              ) : (
                !loading && (
                  <div className="panel empty-state">
                    <div className="empty-icon">
                      <FlaskConical size={30} />
                    </div>
                    <span className="eyebrow">YOUR RESEARCH STARTS HERE</span>
                    <h2>One input. Every decision, visible.</h2>
                    <p>
                      Submit a comment to inspect real candidates, predicted
                      reactions, quality gates and refinement rounds. Or open a
                      persisted run from the library.
                    </p>
                    <div className="empty-flow">
                      <span>Analyze</span>
                      <ChevronRight size={14} />
                      <span>Generate</span>
                      <ChevronRight size={14} />
                      <span>Simulate</span>
                      <ChevronRight size={14} />
                      <span>Select or abstain</span>
                    </div>
                    <div className="empty-note">
                      <CircleHelp size={17} />
                      <span>
                        This workspace contains no sample results. Evidence
                        appears only after the backend records it.
                      </span>
                    </div>
                  </div>
                )
              )}
            </section>
          </div>
          <footer className="page-footer">
            <span>Counterpoint · Final-year counterspeech research</span>
            <span>
              Model predictions are uncalibrated. Human review is always
              required.
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
