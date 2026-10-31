# Predictive Reaction Simulation for Adaptive, Multi-Turn, Multilingual Counterspeech

Original B.Tech research implementation governed by [PROJ_2.pdf](docs/PROJ_2.pdf). No previous-semester source, models, generated data or results are used.

**Current increment:** Deterministic Unicode output-script validation strengthens all five language variants across the existing FastAPI engine, research dashboard and YouTube MV3 extension. Generated candidates and refinements with invalid scripts are withheld independently of model assessment. The historical Hinglish failure is covered by regression tests; one controlled real Groq generation request produced two valid Romanized Hinglish drafts. See [script verification](docs/verification/multilingual-script-2026-10-31/REPORT.md) and [PROJECT_STATUS.md](PROJECT_STATUS.md) for actual results and limitations. The human study remains future work.

The engine generates strategy-specific candidates, simulates each candidate's possible reaction, separately assesses safety/quality, applies explicit ranking/gates, and either refines within a bound, recommends a response, or abstains. Each stage is stored. Simulations are **uncalibrated model estimates**, not observed behavior. Recommendations never become real conversation turns unless a human explicitly records an actually posted reply.

## Project documents

- [Requirements traceability](docs/engineering/REQUIREMENTS.md)
- [Architecture, API, data model and structure](docs/engineering/ARCHITECTURE.md)
- [Milestones, acceptance gates and dependencies](docs/engineering/MILESTONES.md)
- [Evaluation protocol](docs/engineering/EVALUATION.md)
- [Original proposal](docs/PROJ_2.pdf) and [constraints](AGENTS.md)

## Local startup

### Windows / PowerShell: backend and dashboard

Install **Python 3.12** and **Node.js 22.12+** (Node 24 is also supported). Start in the repository root on `feat/greenfield-research-engine`. The copy/token steps below are for first setup; preserve any existing configured `.env` files. No global Python activation or PowerShell execution-policy change is needed:

```powershell
New-Item -ItemType Directory -Force work | Out-Null
py -3.12 -m venv work\.venv
.\work\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.lock
.\work\.venv\Scripts\python.exe -m pip install --no-deps -e .\backend
Copy-Item .env.example .env
Copy-Item dashboard\.env.example dashboard\.env

# Generate one server-side research token and put it in BOTH ignored server files.
$researchToken = & .\work\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(32))"
(Get-Content .env) -replace '^RESEARCH_API_KEY=.*$', "RESEARCH_API_KEY=$researchToken" | Set-Content -Encoding utf8 .env
(Get-Content dashboard\.env) -replace '^RESEARCH_API_KEY=.*$', "RESEARCH_API_KEY=$researchToken" | Set-Content -Encoding utf8 dashboard\.env
$researchToken = $null
notepad .env
```

In the root `.env`, set `LLM_API_KEY`, `LLM_BASE_URL` and `LLM_MODEL` to your provider configuration. For Groq's OpenAI-compatible endpoint the base URL is `https://api.groq.com/openai/v1`; choose an available multilingual JSON-capable model. `openai/gpt-oss-120b` was used in the recorded checks. Model availability and quota depend on the provider account. Keep the templates secret-free; edit only ignored `.env` files. Preserve the default `DATABASE_URL=sqlite:///./work/research.db` for local persistence. No provider key belongs in `dashboard/.env`.

In **terminal 1**, from the repository root:

```powershell
.\work\.venv\Scripts\python.exe -m uvicorn counterspeech.api:app_factory --factory --env-file .env --host 127.0.0.1 --port 8000
```

In **terminal 2**, from the repository root:

```powershell
Set-Location dashboard
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:5173**. `npm start` serves the verified production build. For frontend development, stop it and run `npm run dev` on the same port. After source changes rebuild before using `npm start`. Both commands run the Node credential proxy; plain `vite`, `vite preview` or opening `dist/index.html` cannot provide the authenticated API connection.

The Node server reads `dashboard/.env` once at startup and forwards only allowed API routes to `DASHBOARD_BACKEND_URL` (default `http://127.0.0.1:8000`). The research token must match the backend token. Credentials never enter React, browser storage or browser API headers. Vite `.env` loading is disabled; do not introduce `VITE_` secrets. Existing environment variables take precedence over `.env` in both servers.

The dashboard is deliberately a **loopback-only internal application**. It accepts loopback backend URLs and enforces Host, Origin and JSON-write checks. Deployment with remote users needs an actual identity/session system and HTTPS; do not expose this local credential proxy publicly. If changing backend `MAX_RUN_SECONDS`, keep server `DASHBOARD_TIMEOUT_MS` longer (default 660000 ms for a 600-second run).

### macOS / Linux backend

Python 3.12 recommended. Run from the repository root:

```bash
mkdir -p work
python -m venv work/.venv
source work/.venv/bin/activate
python -m pip install -r backend/requirements-dev.lock
python -m pip install --no-deps -e ./backend
cp .env.example .env
```

Edit `.env` locally. Generate `RESEARCH_API_KEY` with `python -c 'import secrets; print(secrets.token_urlsafe(32))'` and save it in that ignored file. This protects the local research API and is separate from the provider key. Set `LLM_BASE_URL`, `LLM_MODEL` and `LLM_API_KEY` for real inference. The base URL typically ends in `/v1`; the adapter appends `/chat/completions`. Choose a multilingual model supporting JSON-object output, temperature 0 and a 3,000-token output cap. Temperature 0 does not guarantee deterministic hosted inference.

```bash
uvicorn counterspeech.api:app_factory --factory --env-file .env --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000/docs`. Supply the research token in the protected endpoint's `x-api-key` input. Without model configuration, health works and run creation returns **503 `inference_not_configured`**. There is no production fixture generator or canned fallback. Without a configured research token, all research routes are closed.

Local startup uses SQLite and creates development tables. For migrations instead, load the server's `DATABASE_URL`, run `alembic -c backend/alembic.ini upgrade head`, and set `INITIALIZE_DATABASE=false`. Use migrations for existing deployment schemas.

For the dashboard, copy `dashboard/.env.example` to `dashboard/.env`, set the matching server-side research token, then `cd dashboard && npm ci && npm run build && npm start` in a second terminal.

## YouTube extension — Windows Chrome/Edge

Follow the complete [Windows extension installation and pairing guide](extension/README.md#windows-chrome-installation-and-startup). Keep the backend and dashboard startup commands above; both use the existing database/API contracts. From the repository root:

```powershell
node extension\build.mjs
.\work\.venv\Scripts\python.exe extension\package.py
```

Open **chrome://extensions**, enable **Developer Mode**, click **Load unpacked**, and select **`extension\dist\unpacked`** (the folder containing `manifest.json`). Pin Counterpoint. In `dashboard/.env`, set `DASHBOARD_EXTENSION_ID=igplhknffgcbdgeobbppamkgnbjppkoi` (verify against the installed extension's actual ID). Start/restart the dashboard; its terminal prints a single-use five-minute pairing code. Click the extension toolbar icon on a YouTube video and pair with **http://127.0.0.1:5173** using that code. Edge uses **edge://extensions** and the same steps.

Capture highlighted comment text, pick a visible comment, or paste manually. Review/edit the comment and any earlier context, select language/script and consent, then submit once. Only explicitly checked/role-confirmed earlier messages are sent; loaded replies may be incomplete or later than the selected comment. The real backend chooses a recommendation or abstains/fails. The panel shows actual model reaction/assessment scores and opens the exact `/runs/<run_id>` in the dashboard. Edit/copy for **manual posting only**. To continue, reuse its conversation ID; record actually posted replies explicitly in the dashboard. On timeout, recover the stored run before resubmitting.

The extension stores only an expiring, scoped session credential/recovery IDs in `chrome.storage.session`; research/provider secrets stay server-side. Pairing uses a separate route boundary and never relaxes the dashboard's general origin validation or backend CORS. See the guide for exact permission/data limits, security design, troubleshooting and verification commands. Automated inference is fixture-based; previous genuine Groq evidence is only read. See [extension verification](docs/verification/extension-2026-10-31/REPORT.md) for installed-extension versus browser-harness evidence and remaining manual checks.

## Research dashboard workflow

- Enter the actual comment, choose English, Hindi, Malayalam, Hinglish or Minglish (or automatic detection), optionally require native/romanized script, and submit. Candidate count and bounded refinement are sent to the existing API. Experiment settings also expose full, no-history, no-simulation and single-shot modes without changing their contracts.
- The dashboard discovers the active run through its conversation and polls the stored trace while the existing synchronous POST is processing. It displays recorded events, not an estimated completion percentage. Avoid repeating a submission after a dropped connection; first inspect persisted runs.
- Inspect the input, IDs, context actually supplied, detected language, hostility/change, every candidate and its simulated future reply, uncalibrated reaction distribution, separate model quality assessment, score, recorded eligibility reasons, thresholds and ranking. Refinement appears only when actually logged. Abstention has no selected response. A failed trace preserves partial evidence without inventing assessment or scoring.
- **Conversation** displays researcher-submitted observations separately from simulated future replies, with model-assessed hostility by input. Use an existing conversation for a next run, or enter its UUID in settings. Record an actually posted reply through the explicit observation form; the generated recommendation is never automatically inserted. Submitted provenance does not independently prove human origin. Controlled research messages must be described honestly in study evidence.
- Browse the latest 30/100 persisted runs, or open any known run ID. Stable links are `http://127.0.0.1:5173/runs/<run_id>`; `/?run_id=<run_id>` also works. The extension links directly to the same backend UUID. Download exports the exact retrieved JSON.
- **Execution log** exposes structured events and genuinely reported per-call metadata. Unknown usage/cost stays unavailable; partial token totals are labeled and failed calls may have unreported usage. No hidden model reasoning, calibrated probability, actual future human behavior or independent human quality score is claimed.

An empty database shows an empty library. Checked-in verification JSON is research evidence and is **not** automatically imported, seeded, replayed as live output, or used as frontend mock data. Earlier local SQLite files are not included in Git; point the backend at your existing database to browse it.

## API workflow

1. `POST /v1/runs` with a comment and optional initial observed context. Omit `conversation_id` to create a new conversation:

```json
{
  "text": "People from that community are all untrustworthy.",
  "output_language": "english",
  "output_script": "auto",
  "candidate_count": 3,
  "max_refinements": 1,
  "mode": "full",
  "initial_context": []
}
```

2. Save `run_id` and `conversation_id`. `GET /v1/runs/{run_id}` retrieves the exact trace; `GET /v1/runs` lists recent runs. Provider failures return 502 with a run ID; partial traces remain available. Completion is synchronous, with a default 600-second overall deadline. Background jobs are a later milestone.
3. Review/edit manually. Only after a real reply is posted, record it via `POST /v1/conversations/{conversation_id}/turns` with `{"speaker":"human_reply","text":"Actual posted text"}`. The backend never posts to platforms.
4. For the next real message, call `/v1/runs` with that text and the existing conversation ID. Do not resend `initial_context`. Read `/v1/conversations/{conversation_id}` for observed history and model-assessed hostility trends.

Languages: `english`, `hindi`, `malayalam`, `hinglish`, `minglish`. Scripts: `auto`, `native`, `romanized`. Leave output language null for model-based detection, or override ambiguous cases. Romanized output requires Latin letters throughout, including Hindi/Malayalam words and quoted names. Native Hindi/Hinglish requires Devanagari words; native Malayalam/Minglish requires Malayalam words; natural English words remain allowed in either. English uses Latin letters. Auto uses the current input's Latin/native script and selected output language, independently of earlier turns or the model's detected-script claim.

Each candidate records `script_validation` (Unicode/version, expected script, letter counts, disallowed code points and reasons). Wrong-script candidates receive no fabricated score/assessment and cannot be recommended. If no candidate passes, full/no-history modes may regenerate within the existing `max_refinements` bound; otherwise they abstain. No extra correction retries, local transliteration or character deletion occurs. No-simulation and single-shot retain their existing zero-refinement behavior; the single-shot baseline still makes exactly one generation call and is unevaluated apart from the script check. Historical traces without this field display that no deterministic check was recorded. Script correctness cannot establish language, fluent code mixing, meaning preservation or human efficacy; model assessment and competent language review remain necessary.

Modes: `full`, `no_history`, `no_simulation`, `single_shot`. Single-shot uses one generation call with no assessment/simulation/refinement and is labeled unevaluated. Configurations are in `configs/experiments/`. Independent metrics, human ratings and research results are not prepopulated.

## Tests

```bash
pytest backend/tests -q
ruff check backend
ruff format --check backend
python -m pip check
```

PostgreSQL integration is skipped unless `TEST_DATABASE_URL` points to a designated **test database** with schema-creation privileges. It creates/drops only an isolated random `test_<uuid>` schema. CI provisions a PostgreSQL test service; remote CI has not run until the branch is pushed.

Fixture providers are confined to `backend/tests/` and `dashboard/tests/` and are labeled `deterministic_test_fixture`. Adapter tests use mocked HTTP transport. Neither proves live inference. Locks capture tested dependency versions; rerun checks after updating them. Current Starlette emits a TestClient HTTPX deprecation warning; passing results remain valid.

Dashboard checks on Windows (from the repository root):

```powershell
.\work\.venv\Scripts\python.exe -m pytest backend\tests -q
$env:PYTHON = (Resolve-Path work\.venv\Scripts\python.exe).Path
Set-Location dashboard
npm ci
npm run build
npm run format:check
npm test
npx playwright install chromium
npm run test:e2e
```

`npm test` has mocked UI/projection tests and HTTP proxy tests with a mocked upstream. `test:e2e` uses a real Chromium browser, Node proxy, FastAPI service and SQLite, with an explicitly test-only deterministic LLM provider. It verifies refinement/selection, abstention, partial failure, processing events, observed/simulated separation, language switching, experiment modes, exact retrieval and mobile layout. It is **not a real-model evaluation**. Browser artifacts and test databases stay under ignored `work/`. An installed browser can be selected with `$env:CHROMIUM_PATH="C:\path\to\chrome.exe"`.

The separate optional **real-model** browser test costs provider quota. It requires provider variables in the **terminal's server environment** (the live harness does not read root `.env`), creates an ephemeral server-only research token, uses `work/dashboard-live/research.db`, and submits two assistant-authored controlled English→Hindi messages. Do not run it in ordinary CI:

```powershell
# In the dashboard directory; configure these in this terminal without committing values.
$env:LLM_BASE_URL = "https://api.groq.com/openai/v1"
$env:LLM_MODEL = "openai/gpt-oss-120b"
$providerSecret = Read-Host "Provider API key" -AsSecureString
$env:LLM_API_KEY = [System.Net.NetworkCredential]::new("", $providerSecret).Password
Remove-Variable providerSecret
$env:PYTHON = (Resolve-Path ..\work\.venv\Scripts\python.exe).Path
$env:RUN_REAL_MODEL_TESTS = "1"
npm run test:live
```

It preserves real API evidence, including failures, under `docs/verification/dashboard-2026-10-31/` for review; rerunning replaces those evidence files and should be an intentional new experiment. A failed live suite remains a failure, never converted to fabricated success. The recorded second submission was rate-limited, so no Hindi completion or live refinement is claimed for this milestone. `LIVE_INSPECT_ONLY=1` selects a GET-only inspection of those IDs after an API restart and makes no new inference calls; it requires their original local live-test database.

## PostgreSQL + Docker Compose

```bash
cp compose.env.example .env.compose
# Edit secrets locally: URL-safe database password, matching DATABASE_URL, and API token.
docker compose --env-file .env.compose up --build -d
docker compose --env-file .env.compose ps
```

The API binds to loopback port 8000, runs as non-root, applies migrations, and persists records in PostgreSQL. `DATABASE_URL` must use host **db** inside Compose. `docker compose --env-file .env.compose down` preserves the database volume; adding `--volumes` deletes it. Scoped identities and automatic retention/deletion are later work; use this local research service with an appropriate study data policy.

Managed proxy builds can use `docker build --secret id=proxy_ca,src=/etc/ssl/certs/ca-certificates.crt -t counterspeech-engine:m1 backend`. Keep TLS verification on. If Docker's buildx directory is read-only, set `BUILDX_CONFIG` under `work/`, preserving `DOCKER_CONFIG`. Live HTTPS inside containers may additionally need a read-only mounted combined CA bundle selected through `SSL_CERT_FILE`.

## Continue

Read `AGENTS.md`, `PROJECT_SPEC.md`, `PROJECT_STATUS.md` and the proposal before changes. Next: manually smoke-check the extension toolbar/YouTube adapter on Windows Chrome/Edge and collect independent multilingual/human evaluation. The bounded Hinglish generation-only live recheck passed; full live selection/refinement and broader language quality remain unverified in this increment. Never present fixture output as live inference. Preserve the original documents and work on the feature branch; keep PR #1 open and unmerged.
