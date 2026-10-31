# Incremental implementation and phase gates

| Phase | Deliverable | Testable exit gate |
|---|---|---|
| 1 — backend foundation (authorized now) | Fresh package, strict contracts, real provider adapter, persistent API, candidate-specific simulation/assessment, deterministic ranking and bounded refinement, observed history, language interfaces, one-shot and ablation modes, original tests, migrations and CI | Local automated backend tests pass; fixture tests explicitly identified; 503 without credentials; restart persistence; refinement/abstention/failure/history/language tests; HTTP adapter contract tests. Live model, PostgreSQL and Docker validation separately reported |
| 2 — real inference and multilingual validation | Configure model and access, approved multilingual held-out prompts, smoke script and budget controls | Real provider output for all five language variants, native and romanized scripts, language switching and actual adverse→refinement case; native-speaker assessment; no fixture results presented as model validation |
| 3 — dashboard | Separate React research site over run/history API with every event, round and failure | Real run ID loads actual backend data; input→candidates→simulations→ranking→refinement visible; simulated vs observed labeled; browser E2E and accessibility checks |
| 4 — browser extension | MV3 loaded-comment adapter, context minimization, manual fallback, output language, edit/copy, trace link | Chrome/Edge manual loaded YouTube comment capture, API round trip and matching dashboard; clipboard behavior; no automatic posting; broken selector fallback |
| 5 — reproducible evaluation | Licensed held-out data, experiment runner and failure accounting, independent metrics, blind annotation import/export, paired intervals/agreement, synthetic rollout dataset | Source/conversation split audit; same examples/models/config across modes; real metrics and 100–150 example human-study target; actual human validation for generated dialogues; zero invented ratings |
| 6 — reliable live demo | Background jobs, scoped identity, retention/deletion, cost limits, deployment and demo runbook | Full extension→backend→dashboard→next observed turn with configured provider; PostgreSQL restart/migrations; container health; safe outage recovery and budget limits |

Each phase ends with `PROJECT_STATUS.md` updates containing exact commands and observed results. Phases 2–6 must not be marked complete based on source files or fixture tests.

## External dependencies and unresolved blockers

- Python 3.11+ (workspace: 3.12), FastAPI/Pydantic, HTTPX, SQLAlchemy, psycopg, Alembic, pytest/pytest-asyncio, Ruff; pinned resolution recorded after install.
- PostgreSQL 16+ and Docker/Compose for deployment; SQLite provides local persistence/tests without claiming PostgreSQL validation.
- A model supporting multilingual JSON generation, an OpenAI-compatible `/chat/completions` endpoint, server-side `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, and an inference budget. No outbound identity, secret or model endpoint is configured in this workspace. The network policy must allow the chosen host before live calls. No need to request or reveal credentials in chat.
- `RESEARCH_API_KEY` is a separately generated local API access token. `DATABASE_URL` belongs only on the server.
- Dashboard phase: Node 22+, React toolchain; extension phase: Chrome/Edge developer mode and a real YouTube page for manual capture validation.
- Dataset license/access and language coverage must be checked before import; verify CONAN vs multi-target CONAN discrepancy without changing proposal objectives.
- Original Saha et al. paper methods/prompt text are not included; baseline initially follows the high-level cited paradigm rather than claiming exact reproduction.
- Genuine human reviewers, native speakers and institution-specific consent/ethics decisions are needed for human study and synthetic-dialogue validation. No study data exists yet.
- The supplied signed design PDF is optional reference; no need to use it to override the original proposal.
