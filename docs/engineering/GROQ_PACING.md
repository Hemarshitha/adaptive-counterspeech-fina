# Groq pacing and an existing Windows ZIP installation

This update keeps the real analysis → generation → candidate-specific simulation → separate assessment → ranking → refinement/selection/abstention pipeline. Prompts, model output allowance (3,000 tokens), selection thresholds/weights, script validation, observed-history handling, evaluation artifacts, database schema and extension source are unchanged. No production fixtures or response cache were introduced.

## Minimal Windows update (already installed; no reinstall)

1. Wait for any active run to finish. Stop the backend and dashboard with Ctrl+C in their terminals.
2. Open PowerShell in your **existing project root**, where your working `.env`, `backend`, `dashboard` and saved database already are. Download [`groq-pacing-update.zip`](../updates/groq-pacing-update.zip) from the new branch (GitHub's **Download raw file** button) into that root. The ZIP contains only the nine runtime files listed below and this guide; it contains no `.env`, database, dependency lock, extension or frontend build files. Apply it:

   ```powershell
   Expand-Archive -LiteralPath .\groq-pacing-update.zip -DestinationPath . -Force
   ```

   If using the GitHub branch ZIP instead, extract it to a temporary folder and copy **only these nine paths** into the corresponding paths in the existing installation:

   ```text
   backend/src/counterspeech/api.py
   backend/src/counterspeech/config.py
   backend/src/counterspeech/pipeline.py
   backend/src/counterspeech/providers/base.py
   backend/src/counterspeech/providers/openai_compatible.py
   backend/src/counterspeech/providers/rate_limit.py
   dashboard/server/deadlines.mjs
   dashboard/server/index.mjs
   dashboard/server/proxy.mjs
   ```

3. Edit the **existing root `.env`**, adding or replacing only these entries (one occurrence of each):

   ```dotenv
   PROVIDER_GROQ_PACING=true
   PROVIDER_CALL_DEADLINE_SECONDS=300
   MAX_RUN_SECONDS=1800
   ```

   Keep your working `LLM_BASE_URL`, `LLM_MODEL=openai/gpt-oss-120b`, API keys, `DATABASE_URL` and all other settings. Keep the exact same database path and launch directory. Do not copy `.env.example` over `.env`.

4. Edit the **existing `dashboard/.env`**, replacing/adding only:

   ```dotenv
   DASHBOARD_TIMEOUT_MS=1860000
   ```

   Keep its access key, backend URL, port and extension ID. If `MAX_RUN_SECONDS` is supplied to the backend outside root `.env`, set `DASHBOARD_BACKEND_MAX_RUN_SECONDS=1800` here too, matching the actual backend value.

5. Restart the backend from the same project root, using your existing virtual environment. For the installation layout in README:

   ```powershell
   .\work\.venv\Scripts\python.exe -m uvicorn counterspeech.api:app_factory --factory --env-file .env --host 127.0.0.1 --port 8000
   ```

6. In another PowerShell window at that same root, restart the dashboard:

   ```powershell
   Set-Location .\dashboard
   npm run dev
   ```

   If you already use the production dashboard, use `npm start` instead. Existing `dist` assets still work: there are no browser-source changes, so no rebuild is needed. No `pip install`, `npm install`, virtual-environment recreation or database migration is required. Python 3.11 and Node 22 are supported. Check the existing saved runs in the dashboard before starting another inference run.

## Configuration and deadlines

Pacing is **off by default** for provider compatibility. Opt in explicitly for Groq. These defaults apply only when pacing is enabled:

| Setting | Default | Meaning |
| --- | --- | --- |
| `PROVIDER_GROQ_PACING` | `false` | Use Groq header semantics and one shared asynchronous dispatch lock. |
| `GROQ_MIN_REQUEST_INTERVAL_SECONDS` | `2.1` | Minimum spacing between dispatch starts; appropriate margin for the stated 30 RPM account. Configure for your actual plan. |
| `GROQ_MISSING_HEADERS_WAIT_SECONDS` | `60` | Full fallback cooldown when token headers are missing/invalid or a response is lost. |
| `GROQ_MAX_WAIT_SECONDS` | `120` | Maximum single pacing wait; longer required waits fail rather than retrying early. |
| `PROVIDER_CALL_DEADLINE_SECONDS` | `300` | Total time for one completion, including lock queue, pacing, HTTP and all retries. |
| `PROVIDER_RETRIES` | `2` | At most three HTTP attempts per completion; existing supported range is 0–3 retries. |
| `PROVIDER_TIMEOUT_SECONDS` | `45` | Existing per-HTTP-operation timeout. The completion and run deadlines also bound wall time. |
| `MAX_RUN_SECONDS` | `600` in code; `1800` in updated template | Total pipeline deadline, including all provider waits. Use 1800 for longer paced runs. |
| `DASHBOARD_TIMEOUT_MS` | `660000` in code; `1860000` in updated template | Total upstream proxy deadline; must exceed the configured backend run deadline. |

The dashboard checks the root `.env` backend deadline on startup (or the explicit environment override). An equal/shorter, non-finite or oversized proxy timeout is rejected. Its Undici header/body timers also use the longer proxy deadline. `/v1/capabilities` reports the actual backend `max_run_seconds`. Restart both services after deadline changes. If the backend is launched with different external environment settings, the explicit dashboard override must match those settings.

Groq's `x-ratelimit-remaining-tokens` and `x-ratelimit-reset-tokens` control token admission. Reset parsing supports compound durations such as `1m2.5s` and `250ms`. A conservative prompt allowance uses UTF-8 byte length plus the unchanged output allowance; this is **not reported token usage** and can wait more than an exact tokenizer would. After a reset it permits a fresh request; only Groq can determine whether that request actually fits its limit.

Groq's `x-ratelimit-remaining-requests` / `reset-requests` describe **requests per day**, not RPM. The configured minimum interval controls local RPM spacing. A zero daily request allowance, recognized daily-quota error code or TPD/RPD message terminates with `provider_daily_quota_exhausted`, instead of waiting for a day. The instance remembers this until the reported request reset, conservatively one day if absent. TPD is not inferred from per-minute token headers.

On HTTP 429, valid `Retry-After` seconds/HTTP dates and token reset durations are lower bounds. Missing/malformed hints use the fallback. A required wait beyond the configured budget returns `provider_rate_limit_wait_exhausted`; it is never shortened to issue an early retry. Exhausted HTTP attempts return `provider_rate_limited`. The completion deadline returns `provider_deadline_exceeded`; the outer pipeline deadline remains `run_timeout`. Cancellation propagates and releases the provider lock and conversation claim.

The existing dashboard execution log and polling display persisted `provider_wait`, `provider_retry`, `provider_retry_exhausted`, `provider_wait_exhausted` and `provider_quota_exhausted` events with stage/candidate links and numeric waiting information. Queue waits have no invented duration. Headers, vendor messages, request objects and credentials are not copied to these events. Existing partial results and final failure codes remain retrievable.

## Boundaries

- Coordination is per provider instance in one backend process. Use the existing single Uvicorn process. Multiple workers, other applications and other machines using the same Groq key do not share this lock; provider 429s remain authoritative. A distributed limiter is outside this update.
- The stated 8,000 TPM / 30 RPM / 200,000 TPD / 1,000 RPD are account constraints, not production-wide limits imposed on every provider. Available daily quota is not guaranteed. A single request larger than the provider's token allowance cannot be fixed by pacing.
- Full mode still supports 2–4 candidates and 0–2 **triggered** refinements. Two refinements with four valid candidates make 28 successful model calls, plus bounded HTTP retries. Fewer calls occur only under the existing research policy (early selection or deterministic script rejection). A configured deadline can still expire with very slow responses, long waits, simultaneous runs or insufficient quota.
- The API remains synchronous. The proxy cancels its upstream fetch when a dashboard client disconnects, but an ASGI disconnect need not cancel an already-running pipeline. Inspect the saved run before resubmitting; backend deadlines still bound its work.
- Verification uses deterministic mock HTTP/model responses and temporary SQLite databases. No live Groq quota was used. These tests establish orchestration and failure handling, not multilingual fluency or research efficacy. Existing evaluation evidence is unchanged.
