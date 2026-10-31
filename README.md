# Predictive Reaction Simulation for Adaptive, Multi-Turn, Multilingual Counterspeech

Original B.Tech research implementation governed by [PROJ_2.pdf](docs/PROJ_2.pdf). No previous-semester source, models, generated data or results are used.

**Current increment:** backend engine and research interfaces. The dashboard, extension and human study are later milestones. See [PROJECT_STATUS.md](PROJECT_STATUS.md) for verified work and limitations. No live-model or multilingual-quality result is claimed without real inference and independent evaluation.

The engine generates strategy-specific candidates, simulates each candidate's possible reaction, separately assesses safety/quality, applies explicit ranking/gates, and either refines within a bound, recommends a response, or abstains. Each stage is stored. Simulations are **uncalibrated model estimates**, not observed behavior. Recommendations never become real conversation turns unless a human explicitly records an actually posted reply.

## Project documents

- [Requirements traceability](docs/engineering/REQUIREMENTS.md)
- [Architecture, API, data model and structure](docs/engineering/ARCHITECTURE.md)
- [Milestones, acceptance gates and dependencies](docs/engineering/MILESTONES.md)
- [Evaluation protocol](docs/engineering/EVALUATION.md)
- [Original proposal](docs/PROJ_2.pdf) and [constraints](AGENTS.md)

## Local startup

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

Languages: `english`, `hindi`, `malayalam`, `hinglish`, `minglish`. Scripts: `auto`, `native`, `romanized`. Leave output language null for model-based detection, or override ambiguous cases. Unicode and language switching have contract tests; actual language quality needs live/native-speaker validation.

Modes: `full`, `no_history`, `no_simulation`, `single_shot`. Single-shot uses one generation call with no assessment/simulation/refinement and is labeled unevaluated. Configurations are in `configs/experiments/`. Independent metrics, human ratings and research results are not prepopulated.

## Tests

```bash
pytest backend/tests -q
ruff check backend
ruff format --check backend
python -m pip check
```

PostgreSQL integration is skipped unless `TEST_DATABASE_URL` points to a designated **test database** with schema-creation privileges. It creates/drops only an isolated random `test_<uuid>` schema. CI provisions a PostgreSQL test service; remote CI has not run until the branch is pushed.

Fixture providers exist only under `backend/tests/` and are labeled `deterministic_test_fixture`. Adapter tests use mocked HTTP transport. Neither proves live inference. Locks capture tested dependency versions; rerun checks after updating them. Current Starlette emits a TestClient HTTPX deprecation warning; passing results remain valid.

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

Read `AGENTS.md`, `PROJECT_SPEC.md`, `PROJECT_STATUS.md` and the proposal before changes. Next: configure approved live inference and validate all language variants, then build the separate dashboard and MV3 extension using these real run IDs. Never present fixture output as live inference. Preserve the original documents and work on a feature branch.
