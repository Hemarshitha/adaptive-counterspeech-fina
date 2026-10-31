# MASTER PROJECT SPECIFICATION — FINAL-YEAR COUNTERSPEECH SYSTEM

**Status:** Planning/handoff specification. No implementation has been started under this specification.
**Authority:** User decisions in ChatGPT, grounded principally in the official S7 initial proposal `PROJ_2.pdf`.
**Working title:** Predictive Reaction Simulation for Adaptive, Multi-Turn, Multilingual Counterspeech Generation.
**Last aligned:** 2026-10-31.

## 1. ABSOLUTE SOURCE-OF-TRUTH RULES

1. The initial S7 proposal `PROJ_2.pdf` defines academic objectives and requirements; **follow it strictly**.
2. `pp_2_2_signed.pdf` is an implementation reference only where consistent with `PROJ_2.pdf`. Flag conflicts; do not silently override the initial proposal.
3. `s6 report.pdf` (Saha et al., 2024, *On Zero-Shot Counterspeech Generation by LLMs*) and `s6_critique.pdf` are research/background sources and establish the motivation for a single-shot baseline.
4. The previous repository `https://github.com/Hemarshitha/counterspeech_pipeline` and `Mid_Review_Counterspeech.pptx` are **historical context only**. DO NOT copy, fork, import, adapt, or reuse their source code, code organization, trained models, intermediate datasets, experiment logs, generated content, or tests. No requirement to preserve their implementation choices.
5. `claude.pdf` is conceptual historical background, not a governing specification. In particular, do not add platform-style matching as a required feature.
6. Implement a clean **greenfield** project from scratch in a **new GitHub repository**, with new source code, tests, and experiments. Any single-shot baseline needed for research comparison should also be implemented afresh, citing the original paper, rather than copied from mid-review work.
7. The browser extension and internal dashboard are user-approved **new product interfaces** that support, rather than replace, the official research objectives.
8. This specification is a planning aid; final deliverables must be honestly verified. Do not claim an implementation, results, accuracy, model calibration, or live integration exists before testing it.

## 2. OFFICIAL ACADEMIC OBJECTIVES (FROM PROJ_2)

- Generate counterspeech while **predicting the likely original speaker's reaction before a final reply is selected**.
- Use an **iterative feedback/refinement loop** when predicted outcomes are unfavorable, with a bounded number of iterations.
- Make the approach **multi-turn**, use conversation history, and track changes in escalation/de-escalation across turns.
- Operate in **multiple languages**, at a minimum English plus an Indian language, and measure whether reaction-aware generation generalizes beyond English.
- Evaluate against **single-shot zero-shot counterspeech** using automatic measurements such as toxicity, counterspeech quality, and argument strength, plus genuine human assessment.
- Supply an accessible demonstration application, reproducible evaluation artifacts, and a documented, human-validated synthetic multi-turn dialogue dataset where feasible, in line with `PROJ_2.pdf`.
- The initial proposal expects approximately **100–150 evaluated examples** for the human study; do not invent raters or scores.

## 3. USER-APPROVED FINAL LANGUAGE SCOPE

The final system should support:
- English.
- Hindi (Devanagari).
- Malayalam (Malayalam script).
- Hinglish (Hindi/English mixture, including romanized Hindi).
- Minglish (Malayalam/English mixture, including romanized Malayalam).
- Code-mixed, transliterated, and language-switching turns across a conversation.

Each language variant needs end-to-end understanding, candidate generation, reaction prediction, revision, UI display, and **real evaluation cases**, not merely translation of an English output. Assess language correctness and code-mixed behavior without claiming benchmark-level quality before evaluation. Allow the user to select/override output language when automatic detection is ambiguous.

## 4. THREE CONNECTED PRODUCTS, ONE SHARED ENGINE

### A. Browser extension — YouTube-first MVP
- Chrome/Edge Manifest V3 extension.
- A user selects or invokes action on a YouTube comment. Capture comment text, available parent and replies, thread context, and language; do not promise replies not loaded into the DOM.
- Manual text selection/paste fallback if YouTube DOM parsing breaks.
- Send minimized, necessary context to the backend; use no secret LLM API keys in extension code.
- Show several candidate suggestions optionally, prominently show recommended response, predicted reaction with uncertainty, and clear edit/copy actions.
- **Human-in-the-loop:** never automatically post generated responses. Users may manually post after editing/copying.
- Provide 'View internal analysis' that opens the dashboard for the exact backend run ID.
- Extra platforms (Reddit/X/news comments) are optional future work; not a prerequisite.

### B. Research/internal-workings dashboard — a separate website
- Displays the authentic trace for each real run: captured comment/context; language and hostility signals; strategies chosen; every candidate and its text; simulated reaction class and class scores; risk/quality dimensions; ranking; threshold decisions; each revision round and its reasons; final response.
- Shows conversation history with a strict separation between **real observed turns** and **model-simulated reactions**, and charts trend in escalation/de-escalation across turns.
- Make an explicit, inspectable connection (`run_id`, `conversation_id`) from extension results to dashboard traces.
- Include a research/evaluation section showing baseline comparisons, ablations, outcome definitions, errors, latency/cost, and human-study results once actually collected.
- Dashboard explains via **logged inputs, structured model outputs, calculations, and decision rules**. It must not invent or claim to expose hidden LLM reasoning.
- Do not show invented metrics or generated labels as if they were independently observed human behavior. Synthetic/offline demo records must be labeled as such.

### C. Central research backend
- Suggested, compatible stack: Python 3.11+, FastAPI, PostgreSQL, an interchangeable LLM inference provider, validated structured JSON models, and a testable service architecture. Frontend can use React/Next.js. These are implementation choices to verify against the environment, not new research objectives.
- Core pipeline: input/context understanding -> strategy-conditioned generation of multiple candidates -> candidate-specific reaction simulation -> independent safety/quality checks -> score/rank -> bounded adaptive refinement if needed -> final recommendation -> persistent trace.
- Multi-turn state: conversation and turn IDs; real vs simulated roles; memory and escalation trend; per-turn language handling; update when an actual reply becomes available or is entered by a human.
- Do not treat a model's self-reported confidence as empirically calibrated probability. Distinguish *model-estimated* scores from validated probabilities. Avoid claiming predicted de-escalation is an observed outcome.
- Prompt-injection resistance; data minimization; no auto-posting; timeouts, retries, explicit error states, rate-limit handling, logging, and sensible failure fallback.

## 5. END-TO-END USER FLOW

1. User navigates to YouTube, selects a comment, and opens the browser extension.
2. Extension extracts available thread context or requests manual entry where needed.
3. Backend stores a new run with `run_id` and `conversation_id`.
4. Context analysis identifies target, language/code mix, tone, and hostility, considering previous real turns.
5. Multiple different strategies produce candidates in an appropriate language.
6. Each candidate is simulated independently; result records reaction class, uncertainty/estimated probabilities, and structured explanation for candidate-level outputs.
7. Safety + quality checks and the selection rule choose a candidate or trigger a bounded refinement round.
8. Final recommendation is returned to extension for review/edit/copy, without auto-posting.
9. Dashboard shows all authentic events and why the final decision happened.
10. On another real turn, memory/trend analysis is updated and process repeats. Keep simulated turns separate from real replies.

## 6. RESEARCH AND VALIDATION

- Implement a **new** single-shot zero-shot comparison baseline from the S6 paper's documented high-level approach, without copying the mid-review implementation.
- Predefine controlled comparisons: single-shot baseline; multiple candidates without simulation; simulation/refinement without multi-turn history; full adaptive multi-turn multilingual pipeline.
- Evaluate toxicity, relevance, argumentation, safety, fluency, language preservation, de-escalation ratings, latency, cost, and failure rates; use metrics valid for the language when available.
- Hold out independent data by source/example/conversation; prevent shared template or same-thread leakage across training and test. Distinguish synthetic/LLM-generated, original dataset, human-labeled, and real observed follow-up data.
- Build rating rubrics, blinded annotation UI/export, inter-rater agreement analysis, paired comparisons, and confidence intervals. Actual ratings require legitimate human reviewers and any relevant institutional ethics approvals.
- Simulated reaction prediction is only a hypothesis about someone else's response: never claim real-world causal efficacy without appropriate outcome data.
- Data sources named in `PROJ_2.pdf` include CONAN, multi-target CONAN, Reddit/Gab hate-speech material, HASOC/MultiFED, plus synthetic multi-turn conversations. Re-verify each source's licensing, language, annotations, and suitability before use. Do not equate multilingual CONAN and multi-target CONAN.

## 7. BUILD ORDER AND GATES

1. **Repository foundation:** start new blank repository; add this specification, `AGENTS.md`, architecture/plan, reproducible setup, CI and tests. No import of old project files.
2. **New research engine:** define validated request/response and trace schema, context understanding, generation, simulation, scoring, ranking, and independent tests.
3. **Adaptive refinement + multi-turn state:** revision policy, persistent conversation store, language switching, separation of real/simulated turns.
4. **Multilingual:** English, Hindi, Malayalam, Hinglish, Minglish, mixed language tests.
5. **API + integration:** reliable run endpoints, trace endpoints and streaming/polling updates.
6. **Dashboard:** full trace visualization backed by real stored data.
7. **Extension:** Manifest V3, YouTube adapter, fallback selection, backend communication, edit/copy and view-trace.
8. **Evaluation & integration:** baseline, ablations, human-study workflow, privacy/security tests, demo and reproducibility scripts.

Every phase must have measurable acceptance tests, actual test outputs, and a short change log. No untested claims of completion. Make pragmatic progress toward the entire project, while treating unsupported extra social-platform adapters or advanced modeling as clearly optional.

## 8. LIVE DEMONSTRATION ACCEPTANCE CRITERIA

- Extension can capture a real visible YouTube comment or manual selection fallback.
- Real configured backend call yields generated candidates, not hardcoded examples.
- Reaction simulation runs for each candidate, with structured saved outputs.
- Backend ranks candidates and shows at least one tested example with an actual refinement round.
- Dashboard opens the *same run* and displays traceable evidence for candidate selection.
- A second **real user-provided** message changes stored conversation state and response behavior.
- English, Hindi, Malayalam, Hinglish, and Minglish each have tested example cases, and mixed-language turns are tested.
- The user can edit and copy; extension does not auto-post.
- Offline or replay demo is allowed only with prominent disclosure; never pretend replay is live inference.
- Failures are surfaced honestly; no fake performance metrics.

## 9. CONTEXT-HANDOFF PRACTICE

- Keep `PROJECT_SPEC.md` and `AGENTS.md` version-controlled in the new repository.
- Store architectural decisions, implementation status, test evidence, and unresolved questions in a concise `PROJECT_STATUS.md` maintained after each phase.
- Start new Codex sessions by asking them to read `AGENTS.md`, `PROJECT_SPEC.md`, and `PROJECT_STATUS.md` **before** making code changes.
- Keep original authoritative proposal PDF available to Codex by copying it into a docs/ reference folder in the **new** repository (only the academic PDFs; do **not** copy the old source, old training data, or PPT). If the PDFs are not supplied in the Codex workspace, cite `PROJ_2.pdf` as the authority and flag any uncertainty.

## 10. CURRENT STATE AND BOUNDARY

This file records a **greenfield development plan**, not existing final-project implementation. As of handoff, no application code, browser extension, or dashboard for the new project has been created under this plan. Before any implementation, confirm user approval for the specific coding task.
