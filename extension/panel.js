import { captureFromTab } from "./capture.js";
import {
  request,
  serviceOrigin,
  uuid,
  recommendation,
  explain,
} from "./client.js";

const $ = (id) => document.getElementById(id);
let state = {};
let busy = false;
let contexts = [];
let polling;
let latestRun;
const notice = (text) => {
  $("notice").textContent = text;
};
const api = (path, body, timeout) =>
  request(state.origin, state.token, path, body, timeout);
async function save() {
  await chrome.storage.session.set({ counterpoint: state });
}
function controls() {
  $("submit").disabled =
    busy || !state.token || !$("consent").checked || !$("comment").value.trim();
  for (const id of [
    "pair",
    "disconnect",
    "capture",
    "pick",
    "new-thread",
    "add-context",
    "conversation",
    "language",
    "script",
    "refinements",
    "comment",
  ])
    $(id).disabled = busy;
  $("recover").hidden = !state.conversationId;
  $("recover").disabled = busy;
  $("disconnect").hidden = !state.token;
  for (const input of document.querySelectorAll(
    ".context-row input, .context-row textarea, .context-row select",
  ))
    input.disabled = busy;
  $("characters").textContent =
    `${$("comment").value.length.toLocaleString()} / 8,000`;
}
function error(error) {
  $("error").textContent = explain(error);
  $("error").hidden = false;
}
function clearError() {
  $("error").hidden = true;
}
function on(id, event, fn) {
  $(id).addEventListener(event, async () => {
    clearError();
    try {
      await fn();
    } catch (err) {
      error(err);
    } finally {
      controls();
    }
  });
}
function contextUI() {
  $("context-list").replaceChildren();
  contexts.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "context-row";
    const label = document.createElement("label");
    label.className = "check";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = !!item.include;
    label.append(
      check,
      document.createTextNode(`Include ${item.label.toLowerCase()}`),
    );
    check.addEventListener("change", () => {
      item.include = check.checked;
      $("consent").checked = false;
      controls();
    });
    const text = document.createElement("textarea");
    text.rows = 3;
    text.maxLength = 1000;
    text.dir = "auto";
    text.value = item.text;
    text.setAttribute("aria-label", `Context message ${index + 1}`);
    text.addEventListener("input", () => {
      item.text = text.value;
      $("consent").checked = false;
      controls();
    });
    const speaker = document.createElement("select");
    speaker.setAttribute("aria-label", `Observed role ${index + 1}`);
    for (const [value, title] of [
      ["", "Choose observed role…"],
      ["original_speaker", "Earlier original-speaker message"],
      ["human_reply", "Actually posted human reply"],
    ]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = title;
      speaker.append(option);
    }
    speaker.value = item.speaker || "";
    speaker.addEventListener("change", () => {
      item.speaker = speaker.value;
      $("consent").checked = false;
      controls();
    });
    row.append(label, text, speaker);
    $("context-list").append(row);
  });
  $("context-count").textContent = `${contexts.length} messages`;
  $("add-context").disabled = contexts.length >= 4;
}
async function capture(pick) {
  if (busy) return;
  busy = true;
  controls();
  notice(
    pick
      ? "Click a comment on the YouTube page. Esc cancels."
      : "Reading your selected comment…",
  );
  try {
    const data = await captureFromTab(pick);
    $("comment").value = data.text;
    contexts = data.context;
    contextUI();
    $("context-details").open = contexts.length > 0;
    $("source").textContent = "Captured from loaded YouTube DOM · editable";
    $("consent").checked = false;
    notice(data.note);
  } catch (err) {
    notice("");
    throw err;
  } finally {
    busy = false;
  }
}
function showHistory(conversation) {
  $("history").replaceChildren();
  for (const turn of conversation.turns) {
    const p = document.createElement("p");
    p.dir = "auto";
    p.textContent = `${turn.speaker === "human_reply" ? "Observed posted reply" : "Submitted speaker message"}: ${turn.text}`;
    $("history").append(p);
  }
}
function renderRun(run) {
  latestRun = run;
  $("result").hidden = false;
  $("outcome").textContent = run.status;
  $("ids").textContent =
    `Run: ${run.run_id}\nConversation: ${run.conversation_id}`;
  $("ids").style.whiteSpace = "pre-wrap";
  $("dashboard-link").href = `${state.origin}/runs/${run.run_id}`;
  const selected = recommendation(run);
  $("recommendation").hidden = !selected;
  $("copy").hidden = !selected;
  $("prediction").hidden = !selected;
  $("edit-note").hidden = true;
  const fixture = run.events.some((e) =>
    JSON.stringify(e.payload).includes("deterministic_test_fixture"),
  );
  const prefix = fixture
    ? "TEST FIXTURE · deterministic model responses, not live inference. "
    : "";
  $("result-heading").textContent = selected
    ? "Your recommendation"
    : run.status === "abstained"
      ? "No response selected"
      : run.status === "running"
        ? "Processing on the backend"
        : "Run failed · no recommendation";
  $("result-note").textContent =
    prefix +
    (selected
      ? "Review and edit before manually posting. Model scores refer to the original text."
      : run.status === "abstained"
        ? "The backend abstained. No candidate passed its selection policy. Open the trace to inspect candidates and scores."
        : run.status === "running"
          ? `Recorded ${run.events.length} event(s). Keep this panel open, or recover the stored run later.`
          : explain(new Error(run.error_code || "Run failed")));
  if (selected) {
    $("recommendation").value = selected.text;
    $("reaction").textContent =
      selected.simulation?.reaction_class || "Prediction unavailable";
    const p = selected.simulation?.probabilities;
    const a = selected.assessment;
    $("scores").textContent =
      `${p ? `De-escalate: ${p.deescalate} · Neutral: ${p.neutral} · Escalate: ${p.escalate}\n` : ""}Selection score: ${selected.score ?? "unavailable"}${a ? `\nModel assessment · toxicity: ${a.toxicity} · relevance: ${a.relevance} · argument strength: ${a.argument_strength} · language quality: ${a.language_quality}` : ""}`;
    $("scores").textContent += selected.script_validation
      ? `\nUnicode script check: ${selected.script_validation.valid ? "passed" : "rejected"} · required ${selected.script_validation.expected_script}`
      : "\nNo deterministic script check recorded.";
    $("simulated").textContent =
      selected.simulation?.simulated_reply || "No simulated reply recorded.";
    $("uncertainty").textContent =
      selected.simulation?.uncertainty || "Uncertainty unavailable.";
  }
  const candidates =
    run.result?.rounds.flatMap((round) => round.candidates) || [];
  $("candidate-evidence").replaceChildren();
  if (!selected && candidates.length) {
    const heading = document.createElement("h3");
    heading.textContent = "Candidate predictions · no response selected";
    $("candidate-evidence").append(heading);
    for (const candidate of candidates) {
      const p = document.createElement("p");
      p.className = "help";
      p.textContent = `Round ${candidate.round_index} · ${candidate.strategy}: ${candidate.simulation?.reaction_class || "prediction unavailable"}; score ${candidate.score ?? "unavailable"}. ${candidate.decision_reasons.join(", ").replaceAll("_", " ")}.`;
      $("candidate-evidence").append(p);
    }
    const disclosure = document.createElement("p");
    disclosure.className = "help";
    disclosure.textContent =
      "Uncalibrated model estimates. Open the exact trace for each candidate's text, distribution and assessment.";
    $("candidate-evidence").append(disclosure);
  }
}
async function refresh() {
  if (!state.conversationId) return;
  const conversation = await api(
    `/v1/conversations/${state.conversationId}`,
    undefined,
    15000,
  );
  showHistory(conversation);
  const id =
    state.runId ||
    conversation.active_run_id ||
    conversation.runs.at(-1)?.run_id;
  if (id && (state.runId || id !== state.beforeRunId)) {
    const run = await api(`/v1/runs/${id}`, undefined, 15000);
    state.runId = run.run_id;
    await save();
    renderRun(run);
    return run;
  }
}
function startPolling() {
  clearInterval(polling);
  let refreshing = false;
  polling = setInterval(async () => {
    if (refreshing) return;
    refreshing = true;
    try {
      const run = await refresh();
      if (run && run.status !== "running") clearInterval(polling);
    } catch (err) {
      clearInterval(polling);
      error(err);
    } finally {
      refreshing = false;
    }
  }, 1500);
}
on("pair", "click", async () => {
  const origin = serviceOrigin($("service").value);
  const result = await request(
    origin,
    null,
    "/pair",
    { code: $("code").value.trim() },
    15000,
  );
  state = { ...state, origin, token: result.token, expires: result.expires_at };
  await save();
  $("code").value = "";
  const caps = await api("/v1/capabilities", undefined, 15000);
  $("connection-state").textContent = "Paired · local only";
  $("expiry").textContent =
    "Session lasts 30 minutes; server restart or Disconnect revokes access.";
  $("connection").open = false;
  notice(
    caps.inference_configured
      ? "Paired with the local research backend."
      : "Paired. Backend inference is not configured yet.",
  );
});
on("disconnect", "click", async () => {
  clearInterval(polling);
  try {
    await api("/disconnect", {}, 15000);
  } finally {
    state = { origin: state.origin };
    await save();
    $("connection-state").textContent = "Not paired";
    $("connection").open = true;
    $("expiry").textContent = "";
    $("result").hidden = true;
    notice("Disconnected. Stored research runs remain in your backend.");
  }
});
on("capture", "click", () => capture(false));
on("pick", "click", () => capture(true));
on("add-context", "click", () => {
  if (contexts.length < 4) {
    contexts.push({ text: "", label: "Earlier message" });
    contextUI();
  }
});
on("comment", "input", () => {
  $("consent").checked = false;
  controls();
});
on("consent", "change", controls);
on("new-thread", "click", async () => {
  clearInterval(polling);
  delete state.conversationId;
  delete state.runId;
  delete state.beforeRunId;
  await save();
  $("conversation").value = "";
  $("result").hidden = true;
  contexts = [];
  contextUI();
  $("consent").checked = false;
  notice(
    "New thread ready. Enter or capture a comment; earlier stored conversations are preserved.",
  );
});
on("recommendation", "input", () => {
  $("edit-note").hidden =
    $("recommendation").value === recommendation(latestRun)?.text;
});
on("copy", "click", async () => {
  try {
    await navigator.clipboard.writeText($("recommendation").value);
    notice("Copied. You decide whether to post it manually on YouTube.");
  } catch {
    $("recommendation").focus();
    $("recommendation").select();
    throw new Error(
      "Clipboard unavailable. Press Ctrl+C to copy the selected response.",
    );
  }
});
on("recover", "click", async () => {
  busy = true;
  controls();
  try {
    const id = state.conversationId;
    await api("/v1/attach", { conversation_id: id }, 15000);
    const run = await refresh();
    notice(
      run
        ? "Retrieved the stored run. No new inference request was made."
        : "No run recorded for this conversation. Inspect the dashboard before submitting again.",
    );
    if (run?.status === "running") startPolling();
  } finally {
    busy = false;
  }
});
on("submit", "click", async () => {
  let prepared = false;
  busy = true;
  controls();
  clearInterval(polling);
  $("result").hidden = true;
  notice(
    "Submitting to your paired backend. Keep this panel open; do not repeat the request.",
  );
  try {
    const text = $("comment").value.trim();
    const existing = $("conversation").value.trim();
    const included = contexts.filter((c) => c.include);
    if (existing && !uuid.test(existing))
      throw new Error("Enter a valid conversation UUID or leave it blank.");
    if (existing && included.length)
      throw new Error(
        "Existing conversations use stored history. Uncheck captured context to avoid adding it twice.",
      );
    if (included.some((c) => !c.text.trim() || !c.speaker))
      throw new Error(
        "Each included context message needs text and an observed role.",
      );
    let conversationId;
    let beforeRunId;
    if (existing) {
      const attached = await api(
        "/v1/attach",
        { conversation_id: existing },
        15000,
      );
      conversationId = attached.conversation_id;
      if (attached.active_run_id) throw new Error("conversation_busy");
      beforeRunId = attached.runs.at(-1)?.run_id;
    } else {
      conversationId = (
        await api(
          "/v1/conversations",
          { title: "YouTube · user-reviewed input" },
          15000,
        )
      ).conversation_id;
    }
    state.conversationId = conversationId;
    state.beforeRunId = beforeRunId;
    delete state.runId;
    await save();
    prepared = true;
    $("conversation").value = conversationId;
    for (const item of included)
      await api(
        `/v1/conversations/${conversationId}/turns`,
        { speaker: item.speaker, text: item.text.trim() },
        15000,
      );
    startPolling();
    const run = await api("/v1/runs", {
      text,
      conversation_id: conversationId,
      output_language: $("language").value || null,
      output_script: $("script").value,
      candidate_count: 2,
      max_refinements: Number($("refinements").value),
      mode: "full",
    });
    state.runId = run.run_id;
    await save();
    renderRun(run);
    await refresh();
    notice(
      "Stored result retrieved. Open the exact run for full research evidence.",
    );
  } catch (err) {
    if (err.runId && uuid.test(err.runId)) {
      state.runId = err.runId;
      await save();
    }
    try {
      if (prepared) await refresh();
    } catch {
      /* Original failure remains primary. Recover is explicit. */
    }
    notice("");
    throw err;
  } finally {
    clearInterval(polling);
    busy = false;
    $("consent").checked = false;
  }
});

async function initialize() {
  // Session storage is inaccessible to content scripts by default; never relax its access level.
  state = (await chrome.storage.session.get("counterpoint")).counterpoint || {};
  $("extension-id").textContent = `Extension ID: ${chrome.runtime.id}`;
  if (state.origin) $("service").value = state.origin;
  if (state.conversationId) $("conversation").value = state.conversationId;
  if (state.token) {
    try {
      await api("/v1/capabilities", undefined, 15000);
      $("connection-state").textContent = "Paired · local only";
      $("connection").open = false;
      $("expiry").textContent = "Session expires 30 minutes after pairing.";
      if (state.conversationId) {
        notice(
          "Recover the stored run to continue. No request is automatically resubmitted.",
        );
      }
    } catch (err) {
      delete state.token;
      await save();
      error(err);
    }
  }
  controls();
}
initialize().catch(error);
