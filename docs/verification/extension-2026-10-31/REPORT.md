# Milestone 6 — YouTube extension verification

Date: 31 October 2026. Branch: `feat/greenfield-research-engine`.

## Starting point and preservation

Fetched the requested feature branch and checked out **`49233244b547262485d2682c407f9aa330fafd25` before substantive changes**. The remote head matched it. Read AGENTS.md, PROJECT_SPEC.md, PROJECT_STATUS.md, README.md, all seven extracted pages of docs/PROJ_2.pdf, backend routes/schemas and existing dashboard/API contracts. Implemented the extension gate using original new code. No historical repository was accessed.

Backend source/tests, prompts, policy, generated OpenAPI, migrations, original proposal/spec/instructions, earlier multilingual and dashboard evidence remain byte-for-byte unchanged from that commit. The dashboard's UI is unchanged. Its Node proxy gains an independent opt-in `/extension/` pairing boundary; all existing dashboard Host/Origin/JSON checks remain and their regression tests pass. Main is not changed; PR #1 remains open and unmerged.

## Implemented and executed

- Secret-free MV3 package and polished responsive light side panel/equivalent full-tab view. On-demand `activeTab` extraction/picking; no persistent YouTube content scripts, scanning, URL/author collection or whole-page transmission. Parent/loaded reply preview is capped, excerpts labeled and initially excluded. User confirms earlier chronology and observed roles before including context; manual entry always works.
- Five language/script overrides, proper Unicode text controls, explicit reviewed-data/provider consent, full existing pipeline with two candidates and zero/one refinements. No automatic posting; editing/copying never appends an observed turn.
- Single-use five-minute code, exact configured extension identity and 30-minute scoped/revocable session; token only in trusted Chrome session storage. Known conversations can be explicitly attached; no bulk run listing/general proxy access. Server injects the long-lived research key into loopback backend requests only. Backend CORS/authentication are unchanged.
- Real create/attach/observed-turn/run/trace API calls and stable server UUIDs. Loading uses stored events. Completed selected output only; abstention, partial failure, rate limits, invalid context and unreachable services are explicit. Original model predictions/scores remain separate from edits and actual observations. Recovery never retries a POST and never presents an older run as a rejected follow-up's result.
- Built `extension/dist/unpacked` and packaged `extension/dist/counterpoint-extension.zip`; exact Windows Chrome/Edge startup/install/pairing/recovery instructions in extension/README.md and root README.md. CI builds/tests/packages and publishes a ZIP artifact.

## Actual local checks

| Check | Actual result / evidence boundary |
|---|---|
| Existing backend `pytest backend/tests -q -o faulthandler_timeout=20` | **67 passed, 1 skipped**, optional PostgreSQL test URL absent; one upstream Starlette/HTTPX deprecation warning |
| Existing dashboard UI/projection tests | **7 passed**, mocked UI/API data |
| Node proxy/pairing HTTP tests | **17 passed**: 7 existing + 10 new; real HTTP boundary, explicitly mocked upstream |
| Extension client/read-only trace tests | **4 passed**; transport exception is mocked; genuine prior Groq JSON is read-only file evidence |
| Existing dashboard production browser suite | **9 passed**, real Chromium/Node/FastAPI/SQLite; deterministic test-only model provider |
| Extension UI/service browser suite | **13 passed**, real Chromium/Node/FastAPI/SQLite and unchanged dashboard; Chrome APIs and extension-origin transport **emulated in explicit web_harness mode**, deterministic test-only provider, authored/intercepted YouTube HTML; one HTTP 429 response deliberately mocked for stale-output regression |
| Lint/build/format/dependencies | Strict dashboard TypeScript/Vite build; Prettier dashboard/extension checks; Ruff backend/dashboard tests/package checks; Python dependency consistency and whitespace checks passed |
| Source/evidence preservation | `git diff --quiet 49233244b547262485d2682c407f9aa330fafd25 -- backend AGENTS.md PROJECT_SPEC.md docs/PROJ_2.pdf docs/verification/dashboard-2026-10-31 docs/verification/live-multilingual-2026-10-31` passed |

Local system Chromium is 154.0.8037.57. Its managed `ExtensionInstallBlocklist=["*"]` rejects unpacked extension installation (actual `ERR_BLOCKED_BY_CLIENT`, no service worker). The policy was not modified or bypassed. Initial installed-extension browser attempt failed at this environment boundary; it is not counted as a pass. The explicit web_harness mode mocks Chrome storage/tab access and rewrites extension-origin transport **only in tests**; production has no harness, fixture provider or origin bypass. The default CI suite installs the actual packaged extension with native Chrome APIs and does not enable this fallback. Its remote outcome is recorded below after publication, not inferred from local checks.

The DOM extraction/picking function executes in a real Chromium page against authored YouTube markup, proving scoped extraction/visibility/Unicode/picking logic, not compatibility with today's live YouTube DOM. Headless tests cannot click the browser toolbar to grant activeTab; native toolbar/side-panel presentation and live YouTube changes need a manual Windows Chrome/Edge smoke check.

## Exact-ID fixture workflow

`fixture-workflow.json` contains the actual persisted run and conversation from the local UI/service test. It is prominently **deterministic_test_fixture**, not genuine inference or human research data. The run selected after a real second refinement round; the API persisted every structured event and score. Tests compare extension response text/reaction/score, the exact dashboard `/runs/<uuid>` and direct authenticated FastAPI GET JSON for equality. The observed conversation contains only the researcher-authored submitted input, never the simulated future reply or edited/unposted recommendation. The local screenshot `ui-harness-fixture.png` is explicitly a browser API harness with test model outputs; it is not an installed-side-panel screenshot or live YouTube screenshot.

## Real versus mocked

**No new live model calls were made.** Prior genuine Groq English run `8858a371-4542-47f3-81d7-0477858c762f` and failed Hindi run `e9a7f10a-7446-4523-9bc4-b690c9ff1cba` are read from unchanged checked-in evidence for client selection/failure regression. This is not a fresh backend GET or new inference; their original local database is not supplied in this checkout. The selected English candidate is retained; failed/running/abstained traces cannot be promoted into a recommendation. All newly generated browser results use the deterministic provider under tests only. No claim of live extension→Groq completion, native fluency, calibrated reaction prediction or human de-escalation is made.

## Remaining checks and limitations

- Manual Windows Chrome and Edge installation, toolbar activeTab grant, native side-panel behavior and an actual current YouTube thread. CI's unpacked/full-tab MV3 automation is a separate engineering check.
- A new real-provider end-to-end demonstration only once quota is established and necessary. Do not retry the previous rate limit. Live refinement is not newly verified.
- Preserve and later address the earlier genuine Hinglish romanization failure and incomplete model language gate; native-speaker evaluation and independent human efficacy study remain outstanding.
- Local single-researcher pairing is not multi-user/remote identity. Synchronous runs, retention, background jobs and global quota/cost governance remain project limitations. Closing the panel loses unsent drafts/edits; only recovery IDs/session credential are retained. Context appends are sequential existing API operations; if a request fails, inspect stored observations before repeating it.
- This runtime's `/codex` filesystem is read-only, so a chat-output copy could not be created. Source, evidence, build commands and CI artifact publication preserve the deliverable in the repository/workflow.

## Remote publication

Implementation is committed/pushed on the requested feature branch only. The remote installed-extension/CI outcome will be added after observing the actual workflow run. PR #1 must remain open and unmerged.
