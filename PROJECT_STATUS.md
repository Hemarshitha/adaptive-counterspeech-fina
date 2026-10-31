# Project status — backend milestone 1

Updated: **31 October 2026**. Branch: `feat/greenfield-research-engine`.

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

**Evidence boundary:** all LLM outputs in tests are authored test fixtures or mocked HTTP responses. PostgreSQL, API HTTP, migrations and containers were actually executed. No external LLM inference, native-speaker quality study, human rating, calibrated prediction or empirical de-escalation result was produced. Token/cost fields remain null when unavailable; there are no invented research metrics. At the original implementation handoff GitHub CI had not run remotely. Subsequent remote check results must be read from GitHub rather than inferred from local tests.

Environment-specific issues were resolved during validation: pip and TestClient needed the permitted network/socket execution context; Docker buildx needed its writable cache under `work/`. Neither required changing network policy, disabling TLS or writing to the user's home directory. An upstream TestClient deprecation warning remains.

Disposable Docker verification containers and their test-only volume were removed after verification; the built image remains available. The application is not left running. Source changes remain in the repository. Downloadable archive export was unavailable because this runtime cannot create the configured projectless output directory beneath the read-only `/codex` path.

## Preservation verification — 31 October 2026

- Confirmed `feat/greenfield-research-engine`, the original base commit, all 42 new milestone files and the modified `README.md`. No backend application or test source was changed during preservation.
- Re-ran the complete suite against a disposable real PostgreSQL 16 instance: **68 passed in 1.36s**, with the same upstream TestClient deprecation warning. Lint, formatting, dependency consistency and source-document preservation checks passed.
- Reviewed candidate files for credential patterns and sensitive/generated paths. The two credential-URL flags were deliberate non-live CI/test values. No actual provider keys, private keys or runtime `.env` files are included. Only `.env.example` and `compose.env.example` templates with blank secret fields are included.
- `work/`, virtual environments, bytecode, caches, generated package metadata, local databases, scratch test configuration and audit files remain ignored and outside the commit. The generated OpenAPI file is an intentional versioned API contract.
- Commit only this verified milestone and its status update on the feature branch. Preserve main, do not force-push, and leave any review PR unmerged. Publication must be confirmed using the actual remote operation and matching commit SHA; no success is assumed in advance.

## Blockers and limitations

1. **Live inference:** no model endpoint, model identity, API secret or budget is configured. Set server-side `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`; the selected host must be allowed by environment policy. No live request was attempted without configuration. Do not paste secrets into chat or frontend code.
2. **Research validity:** thresholds/weights are versioned engineering hypotheses. Language detection, reaction/safety judgments and generation use the provider; no local trained classifier is claimed. Same-model judging may have correlated biases. Native/romanized/code-mixed quality and language switching must be assessed using real model calls and competent human reviewers.
3. **Interfaces:** the separate React dashboard and Chrome/Edge MV3 YouTube extension have not been implemented. Backend run/conversation IDs and trace APIs are ready for their integration. No claim of a full live demonstration is made.
4. **Evaluation/data:** experiment modes/configs and study protocol exist; an independent evaluator/experiment runner, blind annotation workflow, paired intervals/agreement analysis, licensed held-out datasets and human-validated synthetic multi-turn rollout dataset remain to build. No data or ratings have been collected.
5. **Source verification:** proposal p.3 confuses multilingual CONAN coverage with multi-target CONAN; verify primary dataset language coverage/licenses before use. The Saha paper methods/prompt text are not supplied. Baseline implements the cited high-level paradigm, not a verified exact paper reproduction. No academic objectives were changed.
6. **Deployment maturity:** completion is synchronous; job queue/202 workflow, scoped user identities, retention/deletion, global cost/rate controls, resumable jobs and frontend browser tests remain. The access token is suitable for a local internal research service; Compose binds to loopback. Run orphan recovery only with workers quiesced and after confirming jobs are no longer active.

## Remaining milestones and how to continue

1. Read project instructions, this file and the original proposal. Reuse the feature branch or create another feature branch; do not commit to main.
2. Follow `README.md` to install locked dependencies and run the 68-test suite. Without a PostgreSQL test URL, the one optional PostgreSQL test skips rather than pretending to pass.
3. Configure an approved live provider in the server environment, with a defined budget and allowed destination. Test real inference in all five languages, native/romanized/mixed scripts, a language-switched next observed turn, and at least one actual adverse→refinement run. Save genuine traces and report failures honestly.
4. Implement the dashboard against exact stored run IDs: every candidate, simulation, decision, round, context and failure. Label observed history and simulated/model-assessed quantities visibly. Use structured evidence, never hidden reasoning.
5. Implement the YouTube-first MV3 extension: loaded DOM context only, selection/manual fallback, language override, human edit/copy and exact dashboard link. Never add automatic posting or provider credentials.
6. Build evaluation ingestion/runners/annotation against verified licenses and grouped splits. Compare the new baseline and all ablations; collect actual human study ratings (proposal target approximately 100–150 examples) and separate human validation of synthetic dialogue data. Report outcomes only when measured.
7. Finish background jobs, access/retention/cost controls and a real end-to-end extension→backend→dashboard demonstration. Update this status after every verified phase.

See `docs/engineering/MILESTONES.md` for detailed gates and external dependencies. This first milestone is complete at the **backend contract, orchestration, storage and local deployment** level; later product/research gates remain open.
