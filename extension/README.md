# Counterpoint — YouTube-first MV3 extension

Light-mode Chrome/Edge side panel connected to the existing FastAPI engine through the dashboard's opt-in local pairing bridge. Human review, editing and copying only; no automatic posting. The extension contains no provider or long-lived research API credential.

## Windows Chrome installation and startup

Requirements: Windows 10/11, current Chrome (116+), Python 3.12 and Node.js 22.12+. Use the **same checkout and database** for both servers. Keep `feat/greenfield-research-engine`; do not replace the backend/dashboard or start from main. The initial checkout for this milestone was exactly `49233244b547262485d2682c407f9aa330fafd25`; install the latest verified feature-branch changes.

1. Complete the root [README's Windows setup](../README.md#local-startup): create `work\.venv`, install the locked Python dependencies/editable backend, create ignored root `.env` and `dashboard\.env`, put the same randomly generated `RESEARCH_API_KEY` in both. Configure `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` **only on the backend**. Preserve existing secrets/database files; do not copy templates over configured files. For low-quota demonstrations set `PROVIDER_RETRIES=0` in root `.env`. Do not retry `provider_rate_limited` without established quota.
2. From the repository root, build and optionally package:

   ```powershell
   node extension\build.mjs
   .\work\.venv\Scripts\python.exe extension\package.py
   ```

   The unpacked directory is `extension\dist\unpacked` and ZIP is `extension\dist\counterpoint-extension.zip`. These generated artifacts are ignored. The ZIP has `manifest.json` at its root: extract it into a permanent folder before loading. Keep that folder after installation. Building the extension itself needs no npm dependencies.
3. Open **chrome://extensions**. Enable **Developer Mode** (top right). Click **Load unpacked** and select the **`extension\dist\unpacked` folder containing `manifest.json`**. Do not select the repository root, `extension`, or the ZIP. Pin Counterpoint using Chrome's puzzle-piece Extensions menu. Check that its ID is `igplhknffgcbdgeobbppamkgnbjppkoi`; the checked-in public manifest key stabilizes this ID, and is not a secret.
4. In `dashboard\.env`, set the exact ID shown by Chrome:

   ```dotenv
   DASHBOARD_EXTENSION_ID=igplhknffgcbdgeobbppamkgnbjppkoi
   ```

   Leave the dashboard's default `DASHBOARD_BACKEND_URL=http://127.0.0.1:8000` and `DASHBOARD_PORT=5173`. Do not add extension/YouTube origins to backend CORS or disable dashboard origin checks.
5. **Terminal 1**, repository root — start the real backend:

   ```powershell
   .\work\.venv\Scripts\python.exe -m uvicorn counterspeech.api:app_factory --factory --env-file .env --host 127.0.0.1 --port 8000
   ```

6. **Terminal 2**, repository root — build/start the dashboard:

   ```powershell
   Set-Location dashboard
   npm ci
   npm run build
   npm start
   ```

   Open **http://127.0.0.1:5173**. Terminal 2 prints a **single-use pairing code valid for five minutes** when an extension ID is configured. The production server and development `npm run dev` both support pairing. Stop/restart the dashboard for a new code; this revokes its previous extension session. Neither research nor model key is printed as the pairing code.
7. On a YouTube video, click the **Counterpoint toolbar icon** to open the side panel and grant temporary access to that tab. In Local research connection, use **`http://127.0.0.1:5173`**, paste the terminal's single-use code and click **Pair local service**. A 30-minute session stays in Chrome's session-only extension storage. Re-pair after expiry, disconnect or server/browser restart. Allow the browser's local-network prompt if presented for this local connection.
8. Highlight text **within one comment** and click **Capture selection**, or click **Pick a comment** then click the desired comment on YouTube. Picking cancels with Esc or after 20 seconds. Capture reads the comment's full loaded text and up to four visible messages from that thread. Expand comments/replies first if needed. If access/extraction fails, **paste directly into Comment to respond to**. Review/edit the comment before submission.
9. Earlier observed context is **unchecked by default**. Review captured parent/reply excerpts, include only messages known to precede this comment, and explicitly choose their observed role. Replies can be later messages or different authors; the adapter does not infer chronology/authorship or invent unloaded context. Selected messages can be edited; manual earlier messages can be added. The current comment is capped at 8,000 characters and each of up to four context messages at 1,000. Excerpts are labeled.
10. Choose **English, Hindi, Malayalam, Hinglish or Minglish**, or auto detection, and optionally native/romanized script. Default is two candidates, zero refinements to reduce quota use; one refinement can be enabled. Confirm the reviewed data/provider consent checkbox and click **Generate counterspeech** once. Loading shows stored events; it never invents progress or a response. Abstention and failures are explicit. Do not repeat a request after timeout: use **Recover stored run** or inspect the dashboard first.
11. Review the actual selected response, original candidate's predicted reaction and model assessment/selection scores. Edit, then **Copy for manual posting**; paste/post yourself on YouTube if appropriate. Predictions refer to the original response, and edited text has not been re-scored. Copying records no conversation turn and sends no posting request. **View exact run in research dashboard** opens `/runs/<actual backend run_id>`.
12. The conversation ID is retained for a related next comment. For an unrelated comment click **Start a new thread**. You may enter a known existing conversation UUID; its history is fetched from the real API, and captured initial context must be unchecked to avoid duplication. Record an actually posted reply through the dashboard's explicit observed-turn form before continuing. Generated recommendations and simulated replies never enter observed memory automatically.

**Edge:** follow the same instructions at **edge://extensions**, enable Developer mode and Load unpacked; use the actual ID shown there in `dashboard\.env`. The same MV3 side panel targets modern Chromium browsers. Windows Chrome/Edge toolbar behavior still needs a manual smoke check on those OS/browser builds; see the verification report for automated checks actually executed.

After source updates rerun `node extension\build.mjs`, click **Reload** on the extension card at chrome://extensions, close/reopen the panel, rebuild/restart the dashboard if its source changed, and pair with the fresh terminal code. A managed browser policy may disallow loading unpacked extensions; use an authorized development browser profile/installation rather than modifying organization policies.

## Connection and data boundary

The backend's `/v1` schemas, IDs, authentication, prompts and scoring policy remain unchanged. The dashboard still serves its normal UI and same-origin `/api` proxy. The additional `/extension/` bridge is **disabled unless an exact extension ID is configured**. It accepts that `chrome-extension://` origin only. Chromium host-permission requests that omit Origin must supply the configured extension-ID header; a valid single-use code or session token is still mandatory. Explicit web/null/other-extension origins are rejected. Host validation runs first, including for the bridge. The extension's public ID alone is not an authentication secret.

Pairing uses 192 bits of randomness, expires after five minutes, locks after five failed attempts and can be redeemed once. A 256-bit session token expires after 30 minutes and is bound to the server's configured extension. Disconnect/server restart revokes it. It is scoped to capabilities, new conversations, explicitly attached known conversation IDs, their observed turns and runs, and full-mode submissions with two candidates/at most one refinement. It cannot list all runs or use the general dashboard proxy. The bridge adds `X-API-Key` only on server-to-loopback-backend requests, forbids redirects/arbitrary destinations/query strings, bounds JSON bodies to 64 KiB and uses the existing run timeout. HTTPS and actual identities are needed for remote deployment; this is a local single-researcher integration.

The only persistent host permission is `http://127.0.0.1/*` because Chrome match patterns cannot restrict ports. Client validation/CSP restrict requests to local HTTP, and no background page scan occurs. `activeTab` + `scripting` grant on-demand selected-tab access; `sidePanel` opens the interface; `storage` holds the temporary session token, expiry, local origin and recovery UUIDs in `chrome.storage.session` (trusted extension contexts only). No `tabs`, browsing history, cookies, clipboard, YouTube-wide persistent host permission, content scripts, external messaging or remote code permissions are requested. Clipboard write happens on an explicit user click. No page URL/title, author handle, unrelated comments or whole-page HTML is sent. Submitted text/context is persisted in the existing research backend and sent to its configured provider, with explicit review/consent. The existing project's retention/identity limitations apply.

## Verification commands

From repository root, with backend dependencies installed:

```powershell
$env:PYTHON = (Resolve-Path work\.venv\Scripts\python.exe).Path
Set-Location dashboard
npm ci
npm run build
npm test
npm run extension:build
npm run extension:format
npm run extension:test
npx playwright install chromium
npm run test:extension
```

`npm test` covers existing UI/projection and HTTP proxy/pairing boundary tests with mocked upstream responses. `extension:test` verifies client validation/failure handling and reads genuine saved Groq traces **without new inference**. `test:extension` loads the actual packaged MV3 extension in a persistent Chromium profile, connects to the real Node server/FastAPI/SQLite and opens the actual dashboard run. Only its provider is `deterministic_test_fixture`; YouTube markup is authored/intercepted test HTML. The self-contained extraction/picking function runs in a real Chromium page; headless automation cannot click the browser toolbar to grant `activeTab`, so it does not prove live YouTube DOM compatibility or native toolbar/side-panel presentation. No test auto-posts or invokes the production provider.

If a managed Chromium installation blocks **all** unpacked extensions, an explicit local fallback is available:

```powershell
$env:EXTENSION_BROWSER_MODE = "web_harness"
npm run test:extension
Remove-Item Env:EXTENSION_BROWSER_MODE
```

This uses genuine Chromium and real services, but **emulates Chrome storage/tab APIs and extension-origin transport**. It is a UI/service integration test, not proof that an MV3 extension installed. Default CI does not set this fallback. Optional `CHROMIUM_PATH` selects an installed browser executable. Fixture browser databases/profiles/screenshots stay under ignored `work/`; credentials/network traces are not recorded. Earlier live-model evidence and its documented Hinglish script failure are preserved; interface tests do not establish language quality or human de-escalation.
