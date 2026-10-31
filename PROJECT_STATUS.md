# Project status — opt-in Groq rate-limit pacing

Updated: **1 November 2026**. Work branch: `fix/groq-rate-limit-pacing`, based on exactly `3cb7b3d60d3fbfb3628961da8b01f13634f8b09a` from `feat/greenfield-research-engine`. No merge into main, database reset/migration, local credential-file replacement, extension modification, prompt/threshold/scoring change or new evaluation result.

Implemented opt-in asynchronous Groq pacing shared by a backend provider instance. Successful token-budget/reset headers guide admission; the configured RPM interval remains separate from Groq's daily request headers. HTTP 429 honors valid Retry-After/token reset lower bounds and uses conservative fallback for missing/invalid hints. Over-budget waits fail without clipping provider hints or retrying early. Daily quota classification/latching, finite attempt/call/run budgets, cancellation-safe locking and task-local sanitized persisted progress events preserve the actual inference pipeline. The dashboard validates proxy headroom against the configured backend deadline, extends its Undici timers, and cancels its fetch on client disconnect. Its existing execution log displays the saved progress events.

[Configuration, limitations and exact minimal Windows ZIP update instructions](docs/engineering/GROQ_PACING.md). [Runtime-only update ZIP](docs/updates/groq-pacing-update.zip): **nine runtime files plus UPDATE-WINDOWS.md**. No dependencies, frontend assets, extension files, secrets or SQLite data are packaged; no reinstall or dashboard rebuild is required. ZIP contents were compared byte-for-byte with the source and CRC-checked. The configured projectless output directory was read-only, so the archive is versioned on this separate repository branch.

## Actual verification

- Final complete backend suite on **Python 3.11.17**: `work/.venv311/bin/python -m pytest backend/tests -q` → **190 passed, 1 skipped in 11.15s**. The optional PostgreSQL test skipped because `TEST_DATABASE_URL` was not configured. One existing upstream Starlette/HTTPX deprecation warning. SQLite tests use temporary databases only.
- Backend tests include header-driven successful pacing, RPM spacing, 429 success/exhaustion, malformed/missing headers, excessive Retry-After without early retry, daily exhaustion, concurrent serialization with isolated progress sinks, cancellation during queue/pacing/HTTP, call/run deadlines, persisted wait/retry/failure events and claim release. Thirty full mock-HTTP multi-turn cases cover 2/3/4 candidates × five languages × selection/abstention after exactly two triggered refinements. Candidate-specific simulations/assessments, ranking, deterministic script gates and observed-history separation remain verified. Earlier Python 3.12.14 regression also passed 188 tests before the final two persistence cases were added; the final 190-test result is Python 3.11.
- Dashboard on **Node 22.23.4**: `npm test` → **7 UI/projection tests + 22 HTTP server/proxy/pairing/deadline tests passed**, no failures. Includes delayed upstream headers/body and client-disconnect cancellation.
- Browser: `PATH=<Node 22 bin> PYTHON=<Python 3.11 venv> CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` → **15 passed in 31.5s**. Real Chromium → Node → FastAPI → temporary SQLite; all model outputs are explicit test fixtures. No extension browser testing was needed; extension source is unchanged and existing proxy/pairing tests passed.
- `npm run build`, `npm run format:check`, `ruff check backend`, `ruff format --check backend`, `pip check` and `git diff --check` passed. Final Python formatting checks cover 24 files. Node 24/Python 3.12 were also used during initial checks; the requested Python 3.11/Node 22 combination was then explicitly verified.
- Preservation audit: proposal/spec/instructions, prompts, policy, script validator, model/request schemas, store, migrations, extension, prior verification/evaluation evidence, dependency locks and browser source/assets are unchanged. No `.env` or saved database is tracked in this update.
- **No live Groq request was made or quota spent.** No successful real-model, fluency, efficacy, human evaluation or calibrated prediction is claimed. Remote CI outcomes must be read separately after publication; local results do not establish a CI pass.

## Changed files (19)

Runtime (nine):

- `backend/src/counterspeech/api.py`
- `backend/src/counterspeech/config.py`
- `backend/src/counterspeech/pipeline.py`
- `backend/src/counterspeech/providers/base.py`
- `backend/src/counterspeech/providers/openai_compatible.py`
- `backend/src/counterspeech/providers/rate_limit.py` (new)
- `dashboard/server/deadlines.mjs` (new)
- `dashboard/server/index.mjs`
- `dashboard/server/proxy.mjs`

Tests (four):

- `backend/tests/test_provider.py`
- `backend/tests/test_rate_limited_pipeline.py` (new)
- `dashboard/server/deadlines.test.mjs` (new)
- `dashboard/server/proxy.test.mjs`

Templates/documentation/artifact (six):

- `.env.example`
- `dashboard/.env.example`
- `README.md`
- `PROJECT_STATUS.md`
- `docs/engineering/GROQ_PACING.md` (new)
- `docs/updates/groq-pacing-update.zip` (new)

## Operational limits and remaining verification

Use one backend process/provider instance for local coordination. Other processes/apps/keys have independent state; provider limits always remain authoritative. Header information can be incomplete, token allowance is conservative, a single oversized request cannot be fixed by pacing, and daily quota may be exhausted. Runs may still time out under slow inference/concurrent load; all waits and attempts are bounded and partial traces survive. A proxy disconnect cancels the upstream fetch but does not guarantee ASGI task cancellation; inspect the saved run before resubmitting. The synchronous API and research selection/refinement triggers are unchanged.

Recommended explicit settings for this account: root `.env` `PROVIDER_GROQ_PACING=true`, `PROVIDER_RETRIES=2`, `PROVIDER_CALL_DEADLINE_SECONDS=300`, `MAX_RUN_SECONDS=1800`; existing `dashboard/.env` `DASHBOARD_TIMEOUT_MS=1860000`. Set retries explicitly because an earlier local smoke-test configuration may have disabled them. Existing default spacing is 2.1 seconds, missing-header fallback 60 seconds and maximum single wait 120 seconds. Keep all existing credentials and the exact database path. A real Groq test remains pending explicit user authorization.

Historical status and evaluation evidence follows unchanged.

---

# Project status — multilingual script validation

Updated: **31 October 2026**. Continued `feat/greenfield-research-engine` from exactly **`af8cb9fbdc3e02514551504084a54a82a787983c`**. Main is unchanged; PR #1 remains open/unmerged. Original academic scope and source documents are preserved.

Fixed the demonstrated Hinglish script-gate defect: explicit Romanized Hinglish/Minglish generation/refinement instructions plus independent deterministic Unicode validation of every generated/refined candidate. Invalid text is preserved and rejected before simulation/assessment, with null model scores, candidate-specific script feedback and only the existing bounded refinement budget. The one-call baseline also rejects invalid script without gaining model assessment or refinement. Native Hindi/Malayalam and native code mixing with English are accepted. Current-turn auto resolution and stored real history are preserved; legacy traces identify missing checks honestly. Dashboard/extension display actual script evidence and abstention, with no copyable wrong-script recommendation.

Actual local results: **117 backend passed / 1 optional PostgreSQL skipped**, **7 dashboard UI + 17 proxy/pairing HTTP**, **4 extension client**, **15 dashboard browser**, **14 extension web-harness browser tests passed**. Build, lint/format, dependency consistency, extension packaging and whitespace checks passed. Normal remote CI additionally uses PostgreSQL and an installed MV3 extension; inspect the pushed commit's CI separately. Local extension browser coverage explicitly emulates Chrome APIs/origin transport because managed Chromium forbids installation.

**One controlled real Groq generation request passed** with `openai/gpt-oss-120b`: same original Hinglish input, two actual drafts, zero retries, both entirely Latin by production Unicode validation and a separate native-range audit. **1,726 reported tokens**. No further inference was made. This is generation-only script verification: no live analysis/simulation/assessment/selection/refinement was requested, and no draft is called a recommendation. Broader multilingual/model quality, meaning preservation during regeneration, native-speaker assessment, full live refinement and human efficacy remain unverified. Future model script failures are rejected, not silently recommended.

See [full report](docs/verification/multilingual-script-2026-10-31/REPORT.md), exact historical-output regression evidence and actual live JSON beside it. New automated language fixtures establish contracts only; they are not research data. The historical sections below retain their original-time results and limitations.

---

# Project status — Milestone 6: YouTube browser extension

Updated: **31 October 2026**. Branch: `feat/greenfield-research-engine`. Started from the explicitly requested **`49233244b547262485d2682c407f9aa330fafd25`** after fetching/checking it out; main is unchanged and PR #1 stays open/unmerged.

Implemented MV3 light side panel, selected/picked loaded YouTube comment/context preview, manual fallback, all five language/script controls, explicit data review, real existing FastAPI requests, stable run/conversation IDs, observed-history continuation, actual recommendation/abstention/failure, prediction/score display, editing/copying and exact dashboard links. Never posts automatically. Context is minimized, unchecked until reviewed, and requires explicit earlier-observation role confirmation. No whole-page or author/URL collection.

The dashboard's loopback server adds an **opt-in explicit pairing bridge**: exact extension ID, single-use five-minute code, 30-minute scoped session in Chrome session storage, revocation and no general run listing. Research/provider credentials stay server-side. Normal dashboard origins/Host/write protections and backend authentication/CORS/contracts remain unchanged. Backend code/prompts/policy/migrations, original documents and earlier multilingual/dashboard evidence are preserved.

Local checks: **67 backend passed / 1 optional PostgreSQL skipped**, **7 dashboard UI tests**, **17 proxy/pairing HTTP tests**, **4 extension client/read-only trace tests**, **9 existing dashboard browser tests**, and **13 extension UI/service browser tests passed**. Build/lint/format/dependency/preservation checks passed and extension package built. New model outputs are deterministic test fixtures; no new live model calls were made. The same actual fixture run is compared across extension UI, direct FastAPI GET and dashboard trace. Genuine earlier Groq JSON is read only, without re-import or new inference.

**Browser evidence boundary:** managed local Chromium blocks all new extensions; its actual installed-extension attempt failed and policies were preserved. Local 13-case extension browser coverage explicitly emulates Chrome APIs/origin transport while using genuine Chromium and real Node/FastAPI/SQLite. **Remote CI passed all 13 installed-MV3 browser tests with native Chrome APIs**, plus all 68 backend/PostgreSQL tests, 7 dashboard UI, 17 proxy/pairing, 4 client and 9 dashboard browser tests; both jobs succeeded at implementation commit `8c81828637bfd7e8460f3f45e547e479330ab9bd` in [run 41223061466](https://github.com/Hemarshitha/adaptive-counterspeech-fina/actions/runs/41223061466). Its extension ZIP is published as a workflow artifact. See ci.json in the verification directory for the observed logs/IDs. This is fixture-based model testing; the local harness remains separately disclosed. Live YouTube/native Windows toolbar/side-panel behavior still needs manual verification. Prior Hinglish script failure, native-speaker evaluation, live quota/refinement and human-study limitations remain.

See [Windows installation/pairing guide](extension/README.md), [verification report](docs/verification/extension-2026-10-31/REPORT.md), fixture trace and labeled screenshot there. Build from the root with `node extension/build.mjs`; package with `python extension/package.py`; install `extension/dist/unpacked` via chrome://extensions → Developer Mode → Load unpacked (Edge: edge://extensions). Start the existing backend/dashboard per README; configure the exact extension ID in dashboard/.env and enter its terminal's single-use code in the panel. Recover stored runs before retrying timeouts.

Next: manually verify Windows Chrome/Edge + current YouTube, and perform a controlled real-provider demo only when quota is established. Continue independent evaluation and the existing language-gate work. The records below are preserved historical milestone evidence and describe their original time, not the latest extension state.

---

# Project status — internal research dashboard milestone

Updated: **31 October 2026**. Branch: `feat/greenfield-research-engine`.

## Current milestone — functional internal research dashboard

Implemented on the existing feature branch from `0f6eaa03059b341832d417c1a86c3f1177184404`. The backend source, prompts, policy, OpenAPI contracts, migrations, proposal and earlier research evidence are unchanged. PR #1 is to remain open and unmerged; main is not modified.

### Implemented behavior

- Professional responsive React/TypeScript light interface: real comment submission, all five language choices, optional native/romanized script, candidate/refinement limits and existing experiment modes.
- Real FastAPI connection through a loopback Node server. Both API keys stay server-side; React uses same-origin `/api/` routes. No long-lived key in browser JavaScript, storage or browser headers. Vite environment-file loading is disabled. Route/destination restrictions, Host/Origin/JSON-write checks, no redirects/cache, bounded bodies and sanitized transport errors protect this local credential boundary.
- Input/run/conversation IDs; actual analysis, hostility/change and exact included context; every generated draft/candidate, candidate-linked simulation and uncalibrated model distribution, separate model assessment, score, eligibility reasons, actual thresholds and backend ranking. Unprocessed drafts have no invented UUID, score or eligibility decision.
- Recorded refinement feedback/rounds; valid abstention without a selected response; honest partial/failure evidence; event polling while the existing synchronous backend processes. No simulated completion percentage or fabricated result.
- Observed conversation/history and model-assessed hostility trend remain separate from simulated future replies. Continue a conversation or explicitly record an actually observed/posted message. API submission provenance does not prove organically human origin; current full conversation may contain later turns than a selected historical run.
- Browse latest 30/100 stored runs, open any exact UUID, share `/runs/<run_id>` (also accepts `?run_id=`), download the actual retrieved JSON. The dashboard never seeds an empty database with evidence or fixtures.
- Per-call event inspection and available model/provenance/timing/token metadata. Missing cost/usage remains unavailable, partial known totals are labeled, failed-call usage may be absent. Baseline and ablations preserve their actual missing assessments/simulations.
- Secret-free templates and exact Windows PowerShell/backend/dashboard/test commands in README. Locked frontend dependencies and CI for the new interface.

### Verified results and evidence boundary

| Check | Actual result |
|---|---|
| Existing backend suite | **67 passed, 1 skipped**; PostgreSQL URL not configured. One upstream Starlette/HTTPX warning. |
| Remote backend CI with PostgreSQL | **68 passed**, no skips, one upstream warning; actual GitHub job at implementation commit `a6f0cc3`. |
| Dashboard unit / proxy tests | **7 UI/projection + 7 HTTP proxy tests passed**. UI/upstream responses mocked. |
| Production browser integration | **9 passed**, real Chromium → Node → FastAPI → SQLite; deterministic **test-only LLM** provider. Covers processing, refinement/selection, abstention, partial failure/unprocessed drafts, multi-turn/history, all modes, exact retrieval and mobile layout. |
| Build / formatting / dependencies | Strict TypeScript + Vite production build, Prettier, Ruff lint/format, `pip check`, whitespace checks passed. |
| Genuine live submission | English POST **201**, **completed**, two actual candidates, six successful recorded provider calls, a selected empathy response and a rejected factual-correction response. **5,839 input + 2,118 output = 7,957 reported tokens**; no cost reported. No refinement triggered. |
| Second genuine submission | Hindi follow-up POST **502**, **failed**, `provider_rate_limited` during analysis. No candidates or Hindi completion. No additional inference after that error. The opt-in two-turn live suite therefore **failed**. |
| Genuine record inspection after restart | **1 GET-only browser test passed**, both exact traces equal the saved API records; selected response/failure and observed-history separation verified, no new inference. |

Real-model runs used Groq `openai/gpt-oss-120b`, two candidates and zero provider retries. Conversation `4c66160d-a93b-4d80-96f3-ff3b05d54bc1`; completed English run `8858a371-4542-47f3-81d7-0477858c762f`; failed Hindi run `e9a7f10a-7446-4523-9bc4-b690c9ff1cba`. These are assistant-authored, researcher-controlled test messages, **not organically observed human comments**. All model predictions/assessments remain uncalibrated and independently unvalidated. Recorded selection is an engineering outcome, not demonstrated human de-escalation.

Full actual traces, inputs, decisions and restart inspection are in [the dashboard verification report](docs/verification/dashboard-2026-10-31/REPORT.md) and its adjacent JSON evidence. Ignored local live database: `work/dashboard-live/research.db`. The checked-in JSON is not automatically replayed or imported by the dashboard. The environment blocked Playwright's download host; browser checks used the already installed `/usr/bin/chromium` without bypassing network policy.

Publication: implementation commit `a6f0cc314d9e361b446314fd37170cc1c27aefa3` was pushed to the feature branch; PR #1 remains open and unmerged and remote main stayed at `7cf44d6254214f77c1c3a093f8c34211ae6ce756`. The first remote CI run passed the backend job and dashboard build/unit checks, but browser startup failed because a clean checkout lacked ignored `work/`. The browser launcher now creates that directory itself; the correction is verified from a fresh archived checkout before publication. Remote final CI outcomes are reported separately from the local test results above.

### Remaining blockers / next work

1. Provider quota stopped the Hindi follow-up. Re-run live multi-turn completion only when capacity is available; do not infer success from the English run. Live refinement remains unverified in this milestone; its UI path is verified with explicitly deterministic fixture responses.
2. The previous genuine Hinglish romanization failure and incomplete model language gate remain unchanged. Native-speaker checks and broader independent multilingual evaluation are still needed.
3. Next product milestone: YouTube-first Chrome/Edge MV3 extension, loaded DOM/manual fallback, human edit/copy and exact dashboard run link. Preserve current UUID/API contracts and never auto-post.
4. Independent metrics, licensed held-out data, human rating workflow/study, remote scoped identities, background queue, retention and global quota/cost controls remain outstanding. Current dashboard is for local internal use.

The sections below preserve historical backend milestone and multilingual verification evidence. They describe the state at their recorded time, before the dashboard milestone above.

## Historical backend verification — live multilingual smoke tests

Verified the existing backend at source commit `86afda94a1c93bcb110b4a5ae24c7efaeabcc109` using the configured real Groq model `openai/gpt-oss-120b`. No application source, prompts, policies or API contracts were changed; no backend image was rebuilt, dashboard started, extension implemented, commit published or branch merged.

- Five distinct, assistant-authored researcher-controlled hostile inputs covered English, Hindi/Devanagari, Malayalam/Malayalam script, Hinglish and Minglish. A separate two-turn English→Hindi controlled conversation tested switching. These are **not organically observed human messages**. The API's `user_provided_observation` label does not establish human origin; the evidence explicitly records the researcher-created source. All simulated replies remain separate model hypotheses.
- Each full-mode run used the minimum **2 candidates**, **0 refinements** and **0 provider retries**. **42 actual provider requests returned HTTP 200**; no provider errors or rate limits occurred. Provider-reported usage totaled **43,012 prompt + 17,600 completion = 60,612 tokens**, including any reasoning-token usage counted by the provider. Monetary cost is unknown.
- All seven run POSTs returned **201** and all trace GETs returned **200**. Each run generated two distinct candidates, made candidate-linked simulation and separate assessment calls, and persisted ranking and a **valid abstention**. All 14 candidates missed reaction-policy thresholds; no response was selected. Score/gate recalculation, ranking and abstention checks passed. All seven exact traces were retrieved again through a fresh app/database connection.
- **English, Hindi, Malayalam and romanized Minglish preserved the tested language/script. Hinglish had a concrete romanization failure:** both generated candidates included Devanagari despite `output_script=romanized`. The model assessor caught only one of these two script mismatches. Both were withheld by reaction thresholds, but this remains a failed script check. No non-English case became an English-only reply. Native fluency, transliteration quality and efficacy were not validated.
- **Conversation context survived English→Hindi:** conversation `c4dbc145-70fe-409d-bf16-4bf943989916` retained exactly two submitted test turns. The Hindi analysis referenced the earlier English park-cleanup/blue-bin complaint; its context event included the exact earlier input. No simulated reply or unposted recommendation entered observed memory.
- Regression: `PYTHONPATH=backend/src work/.venv/bin/python -m pytest backend/tests -q -o faulthandler_timeout=20` → **67 passed, 1 skipped in 1.75s**, with one upstream TestClient/HTTPX deprecation warning. PostgreSQL skipped because no `TEST_DATABASE_URL` was configured. Lint, formatting (20 Python files), dependency consistency and whitespace checks passed.

See [the verification report](docs/verification/live-multilingual-2026-10-31/REPORT.md) and [complete structured evidence](docs/verification/live-multilingual-2026-10-31/evidence.json) for all actual inputs, run/conversation/candidate IDs, output samples, status codes, model estimates, gate decisions, usage and retrieval audits. The local SQLite traces remain in ignored `work/multilingual-live/research.db`; no credentials or raw hidden reasoning are included in the report/evidence. The projectless `/codex/.../output` directory could not be created because `/codex` is read-only, so deliverables are preserved in this repository instead.

Remaining: fix and reverify the observed Hinglish script mismatch and incomplete model language gate in a later authorized task; competent native-speaker review, broader held-out multilingual evaluation, other switch directions/longer contexts, a live selected-response path (all current runs abstained), live refinement and actual human follow-ups. This task stops at verification and reporting.

## Scope and source review

Read `AGENTS.md`, `PROJECT_SPEC.md`, `CODEX_KICKOFF_PROMPT.md` completely and extracted/read all **7 pages** of `docs/PROJ_2.pdf` before implementation. The original proposal is the academic authority. The current user request explicitly authorized the first implementation milestone; no additional approval was needed despite older kickoff wording. Existing source documents and PDFs are unchanged.

The supplied repository contained project documents only. All application code and tests in this increment are original. No historical repository, source, model, generated dataset or results were accessed or reused. At the initial implementation handoff, changes were uncommitted and unpushed on the feature branch. The user subsequently authorized committing, pushing that branch, and opening an unmerged review PR. Main is not modified by this preservation workflow; Git history and remote refs record the actual publication outcome.

## Implemented and verified

- Requirements traceability for 20 academic/product/engineering requirements, complete component architecture, API/data contracts, repository structure, six phased milestones, dependencies and evaluation protocol in `docs/engineering/`.
- Installable Python/FastAPI package with generated OpenAPI (`docs/engineering/openapi.json`), authenticated research routes, strict request/model-output validation, UUID references, explicit failures, exact-origin CORS and request-size limits.
- Replaceable asynchronous provider protocol and OpenAI-compatible JSON adapter. Server-only secrets, separate trusted instructions/untrusted JSON input, strict schema validation, bounded transient retries, HTTP timeouts, overall run deadline, refusal/truncation handling, token/latency metadata and prompt/data hashes. No production fixture provider or invented fallback.
- Context/language/target/emotion/hostility analysis → distinct strategy-conditioned candidates → separate candidate-specific reaction simulations → separate safety/relevance/argument/language assessment → deterministic gates and ranking → bounded candidate-specific refinement → recommendation or abstention.
- Explicit reaction probability validation and disclosure: **uncalibrated model estimates**, never calibrated probabilities or observed human reactions. Assessment is a separate call, but can use the same model and is not an independently validated metric.
- SQLite development persistence, PostgreSQL-compatible SQLAlchemy storage, initial Alembic migration, complete event traces including partial failures, per-conversation database claim, observed real-turn history, hostility trend/delta, history caps and language switching. Recommendations and simulated replies never become observed memory automatically.
- Newly implemented one-call single-shot zero-shot baseline, no-simulation ablation (no simulation/refinement calls), no-history ablation (no past context/trend), full mode and versioned experiment configurations.
- Language and script contracts for English, Hindi, Malayalam, Hinglish, Minglish; native and romanized inputs, explicit output-language/script overrides, mixed scripts and switched second turns. **These are interface/orchestration tests, not verified multilingual model performance.**
- Reproducible dependency locks, lint/format configuration, PostgreSQL CI definition, non-root Docker image and PostgreSQL Compose deployment. Setup and API workflow in `README.md`.

## Actual verification results

| Check | Command / method | Observed result |
|---|---|---|
| Backend suite with real PostgreSQL | `TEST_DATABASE_URL=<local test DB> work/.venv/bin/python -m pytest backend/tests -q -o faulthandler_timeout=20` | **68 passed in 1.40s**, one upstream Starlette TestClient HTTPX deprecation warning; no skipped tests in this run |
| Lint | `work/.venv/bin/ruff check backend` | All checks passed |
| Formatting | `work/.venv/bin/ruff format --check backend` | 20 Python files already formatted |
| Local dependencies | `work/.venv/bin/python -m pip check` | No broken requirements |
| SQLite migrations | Automated fresh upgrade, model/schema parity, downgrade, re-upgrade | Passed as part of suite |
| Real PostgreSQL integration | PostgreSQL 16 Alpine; isolated random test schema; migration/model parity; actual pipeline orchestration with fixture provider; second connection checks claim and stored trace | Passed as part of suite |
| Docker build | BuildKit with mounted combined CA secret; image `counterspeech-engine:m1` | Built successfully, including latest backend changes |
| Compose | Original `compose.yaml` with scratch-only image tag/test environment override; `up -d --no-build --wait` | PostgreSQL and API healthy; migrations executed on startup |
| Container HTTP checks | Actual loopback HTTP requests | Health 200; unauthenticated research read 401; authenticated conversation creation 201; absent-provider run creation 503 |
| Restart persistence | Create conversation, restart API container, retrieve same conversation from PostgreSQL | Passed |
| Container dependencies | `docker exec <test API> python -m pip check` | No broken requirements |
| Existing source preservation | `git diff --quiet -- AGENTS.md PROJECT_SPEC.md CODEX_KICKOFF_PROMPT.md docs/PROJ_2.pdf docs/pp_2_2_signed.pdf` | Unchanged |
| Whitespace | `git diff --check` | Passed |

Tests include adverse→refinement→selection, exhausted-budget abstention, safety/language rejection despite favorable reactions, strategy count/unchanged revision rejection, partial trace recovery, timeout/cancellation claim release, concurrent request rejection without extra turns, persistent retrieval, observed/simulated separation, ablation call/context differences, finite normalized distributions, malformed provider JSON, refusal, truncation, rate limits, timeout, and prompt-message separation.

**Historical milestone-suite evidence boundary:** all LLM outputs in the automated tests are authored test fixtures or mocked HTTP responses. PostgreSQL, API HTTP, migrations and containers were actually executed. At that milestone, no external LLM inference, native-speaker quality study, human rating, calibrated prediction or empirical de-escalation result was produced. The later genuine live inference is recorded in the latest verification section above; native-speaker/human/causal validation remains absent. Token/cost fields remain null when unavailable; there are no invented research metrics. At the original implementation handoff GitHub CI had not run remotely. Subsequent remote check results must be read from GitHub rather than inferred from local tests.

Environment-specific issues were resolved during validation: pip and TestClient needed the permitted network/socket execution context; Docker buildx needed its writable cache under `work/`. Neither required changing network policy, disabling TLS or writing to the user's home directory. An upstream TestClient deprecation warning remains.

Disposable Docker verification containers and their test-only volume were removed after verification; the built image remains available. The application is not left running. Source changes remain in the repository. Downloadable archive export was unavailable because this runtime cannot create the configured projectless output directory beneath the read-only `/codex` path.

## Preservation verification — 31 October 2026

- Confirmed `feat/greenfield-research-engine`, the original base commit, all 42 new milestone files and the modified `README.md`. No backend application or test source was changed during preservation.
- Re-ran the complete suite against a disposable real PostgreSQL 16 instance: **68 passed in 1.36s**, with the same upstream TestClient deprecation warning. Lint, formatting, dependency consistency and source-document preservation checks passed.
- Reviewed candidate files for credential patterns and sensitive/generated paths. The two credential-URL flags were deliberate non-live CI/test values. No actual provider keys, private keys or runtime `.env` files are included. Only `.env.example` and `compose.env.example` templates with blank secret fields are included.
- `work/`, virtual environments, bytecode, caches, generated package metadata, local databases, scratch test configuration and audit files remain ignored and outside the commit. The generated OpenAPI file is an intentional versioned API contract.
- Commit only this verified milestone and its status update on the feature branch. Preserve main, do not force-push, and leave any review PR unmerged. Publication must be confirmed using the actual remote operation and matching commit SHA; no success is assumed in advance.

## Blockers and limitations

1. **Live inference:** this session had a ready server-side Groq endpoint/model/secret binding and permitted destination; genuine multilingual calls are recorded above. All runs abstained with refinement disabled, and Hinglish romanized output failed its script check. Continue only under the next user instruction; preserve free-tier limits and keep credentials server-side. Configuration readiness must be rechecked in future sessions.
2. **Research validity:** thresholds/weights are versioned engineering hypotheses. Language detection, reaction/safety judgments and generation use the provider; no local trained classifier is claimed. Same-model judging may have correlated biases. Native/romanized/code-mixed quality and language switching must be assessed using real model calls and competent human reviewers.
3. **Interfaces (updated by the current milestone):** React dashboard is implemented and tested as recorded above. The Chrome/Edge MV3 YouTube extension remains unimplemented. No complete extension-to-dashboard live demonstration is claimed.
4. **Evaluation/data:** experiment modes/configs and study protocol exist; an independent evaluator/experiment runner, blind annotation workflow, paired intervals/agreement analysis, licensed held-out datasets and human-validated synthetic multi-turn rollout dataset remain to build. No data or ratings have been collected.
5. **Source verification:** proposal p.3 confuses multilingual CONAN coverage with multi-target CONAN; verify primary dataset language coverage/licenses before use. The Saha paper methods/prompt text are not supplied. Baseline implements the cited high-level paradigm, not a verified exact paper reproduction. No academic objectives were changed.
6. **Deployment maturity:** completion is synchronous; job queue/202 workflow, scoped user identities, retention/deletion, global cost/rate controls and resumable jobs remain. Frontend browser tests now exist as recorded above. The access token is suitable for a local internal research service; Compose and dashboard bind to loopback. Run orphan recovery only with workers quiesced and after confirming jobs are no longer active.

## Remaining milestones and how to continue

1. Read project instructions, this file and the original proposal. Reuse the feature branch or create another feature branch; do not commit to main.
2. Follow `README.md` to install locked dependencies and run the 68-test suite. Without a PostgreSQL test URL, the one optional PostgreSQL test skips rather than pretending to pass.
3. Review the saved genuine live multilingual evidence before additional work. Reverify the observed Hinglish romanization failure after a separately authorized fix, collect competent language review and broader cases, and budget a live adverse→refinement check (not attempted in this smoke task). Recheck provider readiness, preserve real traces and stop on rate limits.
4. Dashboard implemented in the current milestone. Preserve its exact stored run links, structured evidence, observed/simulated separation and explicit uncalibrated-model disclosures during extension integration.
5. Implement the YouTube-first MV3 extension: loaded DOM context only, selection/manual fallback, language override, human edit/copy and exact dashboard link. Never add automatic posting or provider credentials.
6. Build evaluation ingestion/runners/annotation against verified licenses and grouped splits. Compare the new baseline and all ablations; collect actual human study ratings (proposal target approximately 100–150 examples) and separate human validation of synthetic dialogue data. Report outcomes only when measured.
7. Finish background jobs, access/retention/cost controls and a real end-to-end extension→backend→dashboard demonstration. Update this status after every verified phase.

See `docs/engineering/MILESTONES.md` for detailed gates and external dependencies. This first milestone is complete at the **backend contract, orchestration, storage and local deployment** level; later product/research gates remain open.
