# Research dashboard verification — 31 October 2026

Continued from `0f6eaa03059b341832d417c1a86c3f1177184404` on `feat/greenfield-research-engine`. The existing backend implementation, API schema, prompts, policy, database migrations and earlier multilingual evidence are unchanged. The original seven-page proposal and repository source-of-truth documents were read before implementation. No historical project implementation was accessed.

## Implemented

React/TypeScript dashboard with a responsive light interface, real run submission, language/script overrides, experiment modes, active-run discovery and persisted-event polling, candidate-specific reaction/quality/selection inspection, bounded refinement display, honest abstention, failure/partial-trace inspection, conversation history and model-assessed hostility trend, exact UUID links, recent-run browsing and exact JSON export. Drafts generated before a later failure remain visible even if the backend has not assigned them candidate IDs; unknown assessments/eligibility/scores remain unknown.

The Node server attaches `RESEARCH_API_KEY` to the existing FastAPI routes. Browser requests use same-origin `/api/...` without credentials in JavaScript, storage or request headers. The server binds to loopback, rejects untrusted Host/Origin and cross-site requests, requires same-origin JSON writes, restricts upstream routes and loopback destinations, disables redirects, bounds request size, sanitizes transport errors, prevents caching and serves only built public assets in production. Its HTTP dispatcher supports the documented synchronous-run timeout. Vite does not load `.env` files into the build. This is a local internal service, not a remotely authenticated deployment.

## Actual automated verification

| Check | Observed result | Evidence boundary |
|---|---|---|
| `pytest backend/tests -q -o faulthandler_timeout=20` | **67 passed, 1 skipped** | Existing backend tests; PostgreSQL skipped because `TEST_DATABASE_URL` is absent. Provider responses are fixtures/mocked HTTP. One upstream Starlette/HTTPX deprecation warning. |
| Remote backend CI with PostgreSQL | **68 passed**, no skips | Actual GitHub backend job at `a6f0cc3`; includes the real PostgreSQL test service. Provider responses remain fixtures. |
| `npm test` | **7 UI/projection tests + 7 HTTP proxy tests passed** | UI fetches / upstream model API are mocked. Real local HTTP sockets exercise the proxy boundary. |
| `npm run test:e2e` | **9 browser integration tests passed** | Real Chromium, built React app, Node proxy, FastAPI and SQLite. Only LLM responses use the deterministic test-only provider. |
| `npm run build` | Passed | Strict TypeScript including unused declarations, then Vite production bundle. |
| `npm run format:check`, Ruff lint/format and `pip check` | Passed | Frontend/server formatting, original backend plus test-only Python launcher, dependency consistency. |
| Development-server browser smoke | Passed | Vite development app rendered without page errors, showed the actual unreachable-backend error and disabled submission; private environment paths were denied before middleware. |
| `npm audit --omit=dev` | **0 vulnerabilities reported** | Registry advisory check for the installed production dependency lock at verification time. |
| GET-only live-record inspection | **1 browser test passed** | Restarted real API and retrieved both genuine live records byte-for-structure equal to the saved JSON; verified real candidate text/simulated reply rendering, failure display, current conversation, mobile layout. No new inference requests. |
| New real-model two-turn suite | **Failed on the second submission** | English completed and selected a response. Hindi analysis was rate-limited. Failure is retained, not converted into a successful live test. |

Browser cases cover adverse→refinement→selection, exhausted-budget abstention, a failure after generation/simulation with unprocessed drafts, processing events while running, multi-turn observation recording and a switched Hindi request, exact trace retrieval/reload/export, all five language choices, 390px layout, absence of server secrets from the bundle, single-shot unevaluated baseline, no-simulation and no-history modes. These tests establish UI/orchestration behavior; they do not establish real-model refinement success or language quality.

The environment blocked Playwright's browser download host with HTTP 403. Its already-installed `/usr/bin/chromium` was used through `CHROMIUM_PATH`; no network-policy bypass or TLS weakening was used. Local production-browser checks are actual executions. CI configuration includes the new checks; remote outcomes must be read from GitHub, not inferred from local success.

The first remote CI run passed its backend job and frontend build/unit checks but exposed a clean-checkout setup defect: the browser launcher assumed ignored `work/` already existed, so SQLite could not create its test database. The launcher now creates the directory before starting services. A fresh archived checkout with no pre-existing scratch directory built successfully and passed all **9 browser tests**. Python executable paths are quoted; a path containing spaces also passed a browser smoke test. These executions used Linux/Chromium; Windows PowerShell commands are documented, but a native Windows runtime was not available in this session.

## Genuine provider integration

The separate opt-in live harness used the configured server-side Groq model `openai/gpt-oss-120b`, two requested candidates, no provider retries, and the original policy. It sent assistant-authored researcher-controlled park-cleanup comments. These inputs are **not organically observed human messages**. The `user_provided_observation` API label establishes submission provenance, not independent human origin. No human posted the recommendation.

- Conversation: `4c66160d-a93b-4d80-96f3-ff3b05d54bc1`.
- English run: `8858a371-4542-47f3-81d7-0477858c762f`. POST **201**, persisted status **completed**. Six successful logged provider calls: context analysis, generation, two separate candidate simulations and two separate assessments. Provider-reported usage: **5,839 input + 2,118 output = 7,957 tokens**. Monetary cost unavailable. One initial generation round; refinement budget was one but no refinement was triggered because an eligible candidate existed.
- Selected candidate: `5c979a3b-ce31-4b76-9cee-dc2c8e51f693`, empathy strategy. It passed the actual recorded gates. The factual-correction candidate was rejected for `deescalation_below_threshold`. Scores/distributions are uncalibrated model outputs plus the versioned engineering selection rule, not independent evidence of efficacy.
- Hindi follow-up: `e9a7f10a-7446-4523-9bc4-b690c9ff1cba`. POST **502**, persisted **failed**, code **`provider_rate_limited`**, during analysis. Its context event includes the earlier English input. No Hindi candidates, detected-language output, quality result, reaction distribution or selected response was produced. Usage of the failed call is unavailable. No retry or further inference was attempted after the rate limit.
- Exact GET retrieval matched both saved records. A fresh API process then retrieved both again, and the browser verified the selected and failed displays. Conversation history contains exactly the two controlled submitted messages; no recommendation or simulated reply became an observation. Only the English run has a completed hostility assessment.

See [evidence.json](evidence.json) for complete actual API traces, [conversation.json](conversation.json) for observations and trend, and [inspection.json](inspection.json) for the GET-only restart audit. No provider credentials or hidden model reasoning are included. The original live SQLite database remains under ignored `work/dashboard-live/research.db`; Git does not ship or automatically seed it.

## Remaining limits

The Hindi follow-up and live multi-turn completion are blocked by provider capacity. Actual new live refinement was not reached. The earlier five-language evidence remains preserved, including the known Hinglish romanized-script failure and incomplete model language gate. Neither this dashboard nor fixture tests resolve it. Native-speaker assessment, held-out evaluation, calibrated probabilities and the proposal's genuine human study remain outstanding. The YouTube extension, background job queue, remote scoped user authentication and retention controls are later milestones. Existing synchronous backend calls and stable run/conversation UUIDs remain compatible with that extension work.
