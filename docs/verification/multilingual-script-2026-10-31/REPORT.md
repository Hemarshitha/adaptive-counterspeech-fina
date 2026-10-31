# Multilingual output-script correction — 31 October 2026

Continued `feat/greenfield-research-engine` from exactly `af8cb9fbdc3e02514551504084a54a82a787983c`. Original proposal, specification, academic scope, experiment modes and historical evidence are preserved. Main is unchanged; PR #1 remains open and unmerged.

## Cause established from actual evidence

The earlier genuine Groq run `e3a6e570-f915-4914-a27c-86ab13d0eb3a` correctly received `output_language=hinglish`, `output_script=romanized`; analysis correctly identified Latin script. Both generated candidates nevertheless contained Devanagari. This rules out a missing language/script override in that recorded backend request. The generation JSON schema constrained strategy/text, but imposed no script constraint on text. The common prompt said only “For romanized use Latin transliteration”; generation/refinement had no explicit Hinglish/Minglish prohibition, concrete examples or deterministic check.

Selection relied on the model assessor's combined `language_matches` Boolean. It rejected one wrong-script draft but incorrectly approved the other (which contained “सही नहीं है” and substantially more Devanagari). That draft was ultimately withheld by its predicted de-escalation threshold, not by script enforcement. A more favorable reaction estimate could therefore have let a wrong-script recommendation through. The exact internal cause of the model's instruction-following failure is not observable; the demonstrated software defect was trusting model compliance/assessment as the only script gate.

[Historical regression evidence](historical-regression.json) preserves both exact texts, original assessor Booleans and their new deterministic rejection. Prior evidence files were not rewritten.

## Implemented behavior

- Prompt `greenfield-1.1-script` explicitly requires all Hindi/Malayalam words in Romanized output to use Latin transliteration, including quotes/names. Romanized Hinglish preserves Hindi + English; Romanized Minglish preserves Malayalam + English. Refinement instructions preserve meaning, negation and code mixing while addressing actual feedback. Native instructions require the corresponding Indian script while allowing English words.
- `output_script.py` inspects an NFC-normalized copy using Python Unicode categories/names and Devanagari/Malayalam block ranges, including Devanagari extensions. Candidate text itself is never rewritten. Non-target letters/marks and script-specific digits are rejected. Latin diacritics, neutral punctuation/numbers, emoji and native joining forms are handled. Native requests require native **letters**, not just a digit, vowel mark or punctuation. No fixed percentage/word quota restricts natural English mixing.
- `auto` resolves from the current input and resolved output language, not prior turns or the model's detected-script claim. Latin input stays Romanized; native input uses the relevant target script. English always uses Latin. The single-shot baseline has no language-analysis call: it infers only the input script when language is unspecified and abstains on ambiguous dual-native input.
- Each new candidate includes optional/additive `script_validation`: validator/Unicode versions, expected/requested script, validity, reasons, letter counts and disallowed code points. Legacy traces remain readable and display “No deterministic script check recorded”; absence is never retroactively called a pass. OpenAPI and dashboard types are updated.
- Validation occurs **before simulation/assessment for every generated candidate in every round**. Invalid drafts are persisted and rejected with null simulation, assessment and score; no model values are invented. Selection policy `policy-1.1-script-hypothesis` independently refuses invalid/missing validation. All original safety, toxicity, relevance, language and reaction thresholds/weights remain.
- If no candidate passes in full/no-history mode, feedback includes actual script evidence and regeneration can use only the existing `max_refinements` budget (0–2). There is no extra correction loop or hidden provider retry. Invalid regeneration is checked again; exhausted budgets abstain. No-simulation keeps zero refinements. The single-shot baseline still makes exactly one generation call, with no model assessment/simulation/refinement; invalid output abstains with its raw draft retained for evaluation. The additional deterministic script gate is disclosed in baseline results.
- Dashboard distinguishes script rejection from absent model assessment and exposes Unicode evidence. The extension shows the selected candidate's script-check result and abstention reasons. Wrong-script abstention has no recommendation/edit/copy output. Existing human review, credential, origin/pairing and no-auto-posting protections remain.

## Automated outcomes

All model responses in automated integration tests are explicitly authored deterministic fixtures. They verify software behavior, not model language quality or human de-escalation.

| Check | Actual local result |
|---|---|
| Backend (`work/.venv/bin/pytest backend/tests -q -o faulthandler_timeout=20`) | **117 passed, 1 skipped** (PostgreSQL URL not supplied), one upstream Starlette/HTTPX deprecation warning |
| Dashboard UI/projection (`npm test`) | **7 passed** |
| Dashboard proxy/pairing HTTP (`npm test`) | **17 passed** |
| Extension client/read-only trace (`npm run extension:test`) | **4 passed** |
| Dashboard browser (`CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`) | **15 passed**; real Chromium → Node → FastAPI → SQLite |
| Extension browser (`EXTENSION_BROWSER_MODE=web_harness CHROMIUM_PATH=/usr/bin/chromium npm run test:extension`) | **14 passed**; actual UI/services, explicitly emulated Chrome APIs/origin transport |
| TypeScript/Vite build, frontend/extension formatting, extension build/ZIP packaging | Passed |
| Ruff lint/format for backend and browser fixtures; `pip check`; `git diff --check` | Passed |

Fifty new backend cases exercise Unicode boundaries, native Hindi/Malayalam, Latin Hindi/Malayalam, native and Romanized Hinglish/Minglish, accents/emoji/joiners, native digit/mark/punctuation leaks, foreign alphabet confusables, all experiment modes, the exact observed Hinglish outputs, invalid refinement, bounded regeneration (0/1/2), valid independent candidate selection, original safety/reaction/language rejection and exact API persistence. Previously misleading multilingual fixtures are corrected: native output is no longer returned in tests claiming Romanized Hindi/Malayalam success, and native Hinglish/Minglish fixtures actually contain the required native script.

The backend switches English → Hindi → Malayalam → Hinglish → Minglish in one stored conversation and verifies the exact submitted and explicitly recorded reply texts on every turn. Unposted recommendations and simulated replies never enter observed history. Dashboard browser cases now actually submit each of the five languages/script settings and compare returned text and persisted JSON; previous coverage only selected all options. Extension browser cases compare all five request settings, exact recommendation text in panel/dashboard, direct FastAPI JSON and continuation history. Both interfaces test deterministic wrong-script abstention with no fabricated assessments/scores.

Local installed-extension verification is not claimed: the managed browser's previously documented installation restriction remains; this local run deliberately uses the existing disclosed web harness. The normal CI workflow installs actual MV3 with native Chrome APIs and runs PostgreSQL. Remote outcomes for the pushed commit must be checked separately; local results above do not imply CI success.

## Single controlled real-model check

**Passed, generation/script scope only.** [Complete actual input, outputs, metadata and Unicode checks](live-hinglish.json).

One production `OpenAICompatibleProvider.complete` generation request used Groq `openai/gpt-oss-120b`, the strengthened production prompt, the **same original hostile Hinglish input**, two strategies, temperature 0 and **zero provider retries**. There was exactly **one inference request**, no regeneration and no subsequent live calls. It returned both requested strategies and two Romanized Hinglish drafts. Both passed the production Unicode validator and a separate direct native-character-range audit; neither contained Devanagari or Malayalam characters. Provider-reported usage: **1,067 input + 659 output = 1,726 tokens**; monetary cost unavailable. The output file includes actual prompt/data hashes and timestamps. Credentials and hidden model reasoning are absent.

No conversation analysis, reaction simulation, quality assessment, candidate selection or refinement was requested in this live smoke check. Neither draft is presented as a recommendation. This deliberately bounded check verifies the original script symptom with a real model while avoiding another multi-stage inference cycle. It does **not** establish a live selected-response/refinement path or general model reliability. The test input is researcher-controlled and assistant-authored, not an organically observed human comment.

## Remaining limitations

- Unicode validation proves the declared script policy, not that Latin text is actually Hindi/Malayalam, naturally code mixed, fluent, faithful, safe or effective. English-only drift, wrong-language Latin output, awkward transliteration, dialect variation and semantic changes during model regeneration still need language assessment and competent native-speaker review. No scientific accuracy/efficacy claim is made.
- No deterministic text stripping or transliteration changes meaning locally. Model-dependent meaning preservation is instructed but not guaranteed. The live empathy draft primarily acknowledges frustration; its safety/relevance/argument quality was not assessed in this generation-only check.
- A model may still emit wrong script despite the strengthened prompt. The deterministic gate prevents such drafts from being selected; a one-sample live pass is not evidence that future generation always complies. Broader fresh live checks for other languages and live refinements were intentionally not performed.
- All automated model judgments/reactions are fixtures. Historical real judgments remain uncalibrated model estimates. Full real-provider selection/refinement, current YouTube/Windows Chrome/Edge manual behavior, held-out multilingual evaluation and the proposal's human study remain pending.
