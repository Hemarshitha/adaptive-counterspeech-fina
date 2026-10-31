# Live multilingual verification — 31 October 2026

Tested branch: `feat/greenfield-research-engine`, source commit `86afda94a1c93bcb110b4a5ae24c7efaeabcc109`. Report generated 31 October 2026, 21:02 IST (Asia/Calcutta).

## Method and provenance

Used the existing full pipeline through authenticated FastAPI ASGI routes in process, with genuine HTTPS calls to configured Groq model `openai/gpt-oss-120b` at `https://api.groq.com/openai/v1`. This was not a dashboard, extension or deployed HTTP-server test. No backend application source, provider implementation, prompt, policy, model parameters, dashboard or extension was changed or built. Installed the existing locked dependencies and used `PYTHONPATH=backend/src`.

Every run used the contract minimum `candidate_count=2` (empathy and factual correction), `max_refinements=0`, explicit output language/script and `mode=full`. Each complete run required six live calls: analysis, generation, two separate simulations and two separate assessments. Provider retries were set to zero. Calls were sequential, spaced at least 15 seconds, with additional provider token-reset pacing. A persistent stop guard would prevent further live calls after any HTTP 429.

All seven user-side input turns below were created by the assistant as controlled researcher test inputs under the user's instruction. None was organically observed, supplied verbatim by a human participant, scraped or posted online. There were five distinct smoke examples and a separate two-turn controlled conversation. The current API labels submitted inputs `user_provided_observation`; it has no synthetic-input provenance enum. The conversation titles and accompanying evidence explicitly identify the researcher-created source rather than claiming this enum proves human origin. All simulated replies remain model hypotheses; none was appended as observed history. No `human_reply` was recorded.

English text in internal structured decision summaries is distinct from the requested counterspeech and simulated-reply language. Script observations below are text inspection/Unicode checks, not native-speaker validation or an independent quality score. All model reaction and assessment numbers in evidence are uncalibrated model estimates; selection scores are the existing deterministic policy calculation.

## Actual runs

| Case | Run ID | POST / GET trace | Outcome | Detected language/script | Calls |
|---|---|---|---|---|---|
| english | `e6bc70ca-a3ed-4e7f-9305-7d71aee8e879` | 201 / 200 | abstained | english / latin | 6 |
| hindi | `8f416e63-6c5f-441b-ba62-dfe7d3ed2845` | 201 / 200 | abstained | hindi / devanagari | 6 |
| hinglish | `e3a6e570-f915-4914-a27c-86ab13d0eb3a` | 201 / 200 | abstained | hinglish / latin | 6 |
| malayalam | `38999914-c6ed-4048-a4a7-86f171d2f633` | 201 / 200 | abstained | malayalam / malayalam | 6 |
| minglish | `a3a8d872-8241-4075-bd06-0b5a69e3bdb4` | 201 / 200 | abstained | minglish / latin | 6 |
| switch_1_english | `16b5ac56-ae3d-4457-94ec-13973fe58576` | 201 / 200 | abstained | english / latin | 6 |
| switch_2_hindi | `bdba681b-9775-4e46-b103-581fd48984a5` | 201 / 200 | abstained | hindi / devanagari | 6 |

All status codes are actual responses from the existing in-process API routes; provider HTTP codes are separately recorded in `evidence.json`.

### english

Conversation: `61f37013-0eed-4e8e-ab45-5908e6e50bde`. Output override: `english` / `romanized`.

Controlled input:

> Students from that college are all lazy and should stay out of our study group.

Selected response: **none** (abstention). Actual candidate sample:

> I understand that you’re feeling frustrated and worried about the group’s progress, and it’s natural to feel upset when you think others aren’t pulling their weight.

- Candidate `45f127d0-6776-4a98-9d45-46f52e4c9cdc` (empathy): eligible=false; decision=deescalation_below_threshold; model-assessed language match=true. Text contains 0 Devanagari, 0 Malayalam codepoints and 134 ASCII Latin letters.
- Candidate `948e8491-734e-4bd4-91c7-26d3e12a6594` (factual_correction): eligible=false; decision=escalation_above_threshold, deescalation_below_threshold; model-assessed language match=true. Text contains 0 Devanagari, 0 Malayalam codepoints and 146 ASCII Latin letters.

Actual simulated-reaction sample (model hypothesis):

> I get that you’re trying to be understanding, but I still feel the students from that college aren’t contributing, so I think they should stay out of the group.

Provider HTTP codes: `[200, 200, 200, 200, 200, 200]`. Validated live calls: 6. Provider-reported usage: 5,808 prompt + 2,325 completion tokens (completion usage may include reasoning tokens). Error code: `None`.

Trace audit: candidate-linked simulations/assessments, distinct simulation-input hashes, score/gate recalculation, ranking and selection/abstention checks all passed. Fresh app/database-connection retrieval: HTTP 200, exact trace equality=True.

### hindi

Conversation: `75725441-6e33-4559-a5f1-33873fa572de`. Output override: `hindi` / `native`.

Controlled input:

> इस कॉलोनी के किरायेदार हमेशा शोर करते हैं; इन्हें हमारी बैठक में बोलने मत दो।

Selected response: **none** (abstention). Actual candidate sample:

> मैं समझता हूँ कि लगातार शोर से आप बहुत परेशान हैं; यह असहज महसूस कराता है और आपके तनाव को बढ़ा सकता है।

- Candidate `96540964-97bd-410a-b786-c4e1d0abc709` (empathy): eligible=false; decision=deescalation_below_threshold; model-assessed language match=true. Text contains 80 Devanagari, 0 Malayalam codepoints and 0 ASCII Latin letters.
- Candidate `94634fff-6a69-4c72-8ea9-a794cd00bd58` (factual_correction): eligible=false; decision=escalation_above_threshold, deescalation_below_threshold; model-assessed language match=true. Text contains 202 Devanagari, 0 Malayalam codepoints and 0 ASCII Latin letters.

Actual simulated-reaction sample (model hypothesis):

> हां, मैं समझता हूँ कि लगातार शोर से आप बहुत परेशान हैं, लेकिन हमें सभी को सुनने का मौका देना चाहिए; नहीं तो समस्या और बढ़ सकती है।

Provider HTTP codes: `[200, 200, 200, 200, 200, 200]`. Validated live calls: 6. Provider-reported usage: 5,982 prompt + 2,360 completion tokens (completion usage may include reasoning tokens). Error code: `None`.

Trace audit: candidate-linked simulations/assessments, distinct simulation-input hashes, score/gate recalculation, ranking and selection/abstention checks all passed. Fresh app/database-connection retrieval: HTTP 200, exact trace equality=True.

### hinglish

Conversation: `0df446b9-6a2e-4b0d-8823-ea1dca07770f`. Output override: `hinglish` / `romanized`.

Controlled input:

> Night shift wale sab careless hain, unki opinion team meeting mein kyun sunni chahiye?

Selected response: **none** (abstention). Actual candidate sample:

> Main samajh sakta/ sakti hoon ki night shift ka schedule thakane wala ho sakta hai aur kabhi‑kabhi kaam mein galtiyan ho jaati hain, jo aapko निराश कर सकता है।

- Candidate `6432b76e-e68e-4b3a-ae3e-86dff997003e` (empathy): eligible=false; decision=language_or_script_mismatch, deescalation_below_threshold; model-assessed language match=false. Text contains 14 Devanagari, 0 Malayalam codepoints and 114 ASCII Latin letters.
- Candidate `5e0e3f53-d908-4bff-96f4-478c08de262a` (factual_correction): eligible=false; decision=deescalation_below_threshold; model-assessed language match=true. Text contains 130 Devanagari, 0 Malayalam codepoints and 34 ASCII Latin letters.

Actual simulated-reaction sample (model hypothesis):

> Haan, night shift ka schedule bahut thakane wala hota hai aur kabhi‑kabhi galtiyan ho jaati hain. Lekin hum sab ek hi team hain—sabki baat sunna zaroori hai, chahe shift koi bhi ho.

Provider HTTP codes: `[200, 200, 200, 200, 200, 200]`. Validated live calls: 6. Provider-reported usage: 5,980 prompt + 2,675 completion tokens (completion usage may include reasoning tokens). Error code: `None`.

Trace audit: candidate-linked simulations/assessments, distinct simulation-input hashes, score/gate recalculation, ranking and selection/abstention checks all passed. Fresh app/database-connection retrieval: HTTP 200, exact trace equality=True.

### malayalam

Conversation: `7e520a2a-6268-458f-a7d1-698272a6f9f1`. Output override: `malayalam` / `native`.

Controlled input:

> ഈ ക്ലബ്ബിലെ പുതിയ അംഗങ്ങൾ എല്ലാം മടിയന്മാരാണ്; അവരെ പരിപാടിയിൽ നിന്ന് ഒഴിവാക്കണം.

Selected response: **none** (abstention). Actual candidate sample:

> നിങ്ങൾക്ക് പുതിയ അംഗങ്ങളോട് നിരാശയും അസന്തോഷവും ഉണ്ടെന്ന് ഞാൻ മനസ്സിലാക്കുന്നു; എല്ലാവരും ഒരേ രീതിയിൽ പ്രവർത്തിക്കില്ല, ചിലർക്ക് വ്യത്യസ്ത സാഹചര്യങ്ങൾ ഉണ്ടാകാം.

- Candidate `40093128-01ed-4b71-ba4d-f318866f8c54` (empathy): eligible=false; decision=deescalation_below_threshold; model-assessed language match=true. Text contains 0 Devanagari, 142 Malayalam codepoints and 0 ASCII Latin letters.
- Candidate `97b4c9f4-8b84-4d15-b296-afdb03c8c9e8` (factual_correction): eligible=false; decision=deescalation_below_threshold; model-assessed language match=true. Text contains 0 Devanagari, 139 Malayalam codepoints and 0 ASCII Latin letters.

Actual simulated-reaction sample (model hypothesis):

> എന്തിനാണ് നിങ്ങൾ അവരെ ഒഴിവാക്കാൻ ആഗ്രഹിക്കുന്നത്? അവർ lazy ആണെന്ന് നിങ്ങൾക്ക് ഉറപ്പാണോ, അല്ലെങ്കിൽ ചിലർക്ക് വ്യത്യസ്ത സാഹചര്യങ്ങൾ ഉണ്ടാകാമെന്ന് ചിന്തിച്ചിട്ടുണ്ടോ?

Provider HTTP codes: `[200, 200, 200, 200, 200, 200]`. Validated live calls: 6. Provider-reported usage: 6,092 prompt + 2,536 completion tokens (completion usage may include reasoning tokens). Error code: `None`.

Trace audit: candidate-linked simulations/assessments, distinct simulation-input hashes, score/gate recalculation, ranking and selection/abstention checks all passed. Fresh app/database-connection retrieval: HTTP 200, exact trace equality=True.

### minglish

Conversation: `21188f97-6ec4-42cc-9c02-930a57c0830a`. Output override: `minglish` / `romanized`.

Controlled input:

> Ee batchile freshers ellam mandanmar aanu, avare project teamil venda.

Selected response: **none** (abstention). Actual candidate sample:

> Ningalude frustration manassil aanu; freshers-ode project start cheyyunnath stress aakum, pinne team-ile performance kurichu chinthikkunnathu sadharnaanu.

- Candidate `a333df12-4b53-477f-af55-b8d8e6079ec9` (empathy): eligible=false; decision=deescalation_below_threshold; model-assessed language match=true. Text contains 0 Devanagari, 0 Malayalam codepoints and 134 ASCII Latin letters.
- Candidate `051274d2-edf6-4283-b636-74a580b85d29` (factual_correction): eligible=false; decision=deescalation_below_threshold; model-assessed language match=true. Text contains 0 Devanagari, 0 Malayalam codepoints and 182 ASCII Latin letters.

Actual simulated-reaction sample (model hypothesis):

> Ningal paranjathu sari, freshers-ine kurichu chinthikkunnath valare upayogam. Avare nannayi train cheythal team-ile performance improve aavum, pinne ningalude stress kuravakum.

Provider HTTP codes: `[200, 200, 200, 200, 200, 200]`. Validated live calls: 6. Provider-reported usage: 5,968 prompt + 2,738 completion tokens (completion usage may include reasoning tokens). Error code: `None`.

Trace audit: candidate-linked simulations/assessments, distinct simulation-input hashes, score/gate recalculation, ranking and selection/abstention checks all passed. Fresh app/database-connection retrieval: HTTP 200, exact trace equality=True.

### switch_1_english

Conversation: `c4dbc145-70fe-409d-bf16-4bf943989916`. Output override: `english` / `romanized`.

Controlled input:

> The new volunteers ruined the Riverside park cleanup by missing the blue-bin pickup. They are useless; keep them off next Saturday's team.

Selected response: **none** (abstention). Actual candidate sample:

> I understand how frustrating it can be when a cleanup doesn’t go as planned, especially when a task like the blue‑bin pickup is missed.

- Candidate `af615f06-c0e4-41a7-b2b4-325afb8fc37f` (empathy): eligible=false; decision=deescalation_below_threshold; model-assessed language match=true. Text contains 0 Devanagari, 0 Malayalam codepoints and 108 ASCII Latin letters.
- Candidate `3aad1d10-26ee-486e-9b76-d069f4b1cd1b` (factual_correction): eligible=false; decision=deescalation_below_threshold; model-assessed language match=true. Text contains 0 Devanagari, 0 Malayalam codepoints and 131 ASCII Latin letters.

Actual simulated-reaction sample (model hypothesis):

> Thanks for getting that. I agree we need to make sure the volunteers are better briefed and maybe assign a point‑person for the blue‑bin pickup next time.

Provider HTTP codes: `[200, 200, 200, 200, 200, 200]`. Validated live calls: 6. Provider-reported usage: 5,951 prompt + 2,027 completion tokens (completion usage may include reasoning tokens). Error code: `None`.

Trace audit: candidate-linked simulations/assessments, distinct simulation-input hashes, score/gate recalculation, ranking and selection/abstention checks all passed. Fresh app/database-connection retrieval: HTTP 200, exact trace equality=True.

### switch_2_hindi

Conversation: `c4dbc145-70fe-409d-bf16-4bf943989916`. Output override: `hindi` / `native`.

Controlled input:

> मैं उसी शनिवार वाली टीम की बात कर रहा हूँ। नीले डिब्बे न उठाने वालों को अब भी बाहर रखना चाहिए।

Selected response: **none** (abstention). Actual candidate sample:

> मैं समझता हूँ कि आप निराश हैं क्योंकि कुछ स्वयंसेवकों ने इस बार नीले डिब्बे नहीं उठाए और सफ़ाई पर असर पड़ा। आपका समय और मेहनत बहुत महत्वपूर्ण है, और ऐसी स्थिति में निराशा महसूस करना स्वाभाविक है।

- Candidate `af983b80-f88e-428c-ba59-d455c70b306d` (empathy): eligible=false; decision=deescalation_below_threshold; model-assessed language match=true. Text contains 157 Devanagari, 0 Malayalam codepoints and 0 ASCII Latin letters.
- Candidate `b770ba3d-8f71-4226-819b-2435b6416cfd` (factual_correction): eligible=false; decision=escalation_above_threshold, deescalation_below_threshold; model-assessed language match=true. Text contains 198 Devanagari, 0 Malayalam codepoints and 0 ASCII Latin letters.

Actual simulated-reaction sample (model hypothesis):

> धन्यवाद, मैं आपकी निराशा समझता हूँ, लेकिन फिर भी हमें उन स्वयंसेवकों को अगली टीम से बाहर रखना चाहिए।

Provider HTTP codes: `[200, 200, 200, 200, 200, 200]`. Validated live calls: 6. Provider-reported usage: 7,231 prompt + 2,939 completion tokens (completion usage may include reasoning tokens). Error code: `None`.

Trace audit: candidate-linked simulations/assessments, distinct simulation-input hashes, score/gate recalculation, ranking and selection/abstention checks all passed. Fresh app/database-connection retrieval: HTTP 200, exact trace equality=True.

## Language observations

- **english**: Observed pass: detector returned english/latin; both candidates and simulated replies remained English in Latin script.
- **hindi**: Observed pass: detector returned hindi/devanagari; both candidates and simulated replies used Devanagari. No English-only counterspeech translation was produced.
- **malayalam**: Observed script/language-preservation pass: detector returned malayalam/malayalam; both candidates used Malayalam script and both simulated replies retained Malayalam script. One simulated reply included the English word 'lazy'; no reply became an English-only translation. Native fluency/naturalness was not validated.
- **hinglish**: FAILED requested romanized script: detector correctly returned hinglish/latin, but BOTH generated candidates contained Devanagari despite the explicit romanized override. Actual examples include 'निराश कर सकता है' and 'सही नहीं है'. The first assessment set language_matches=false, while the second incorrectly set it true despite the obvious script mismatch. Both simulated replies were romanized. Both candidates were rejected on reaction thresholds, so the run abstained; this does not erase the output-script failure. No English-only translation occurred.
- **minglish**: Observed script/code-mix preservation pass: detector returned minglish/latin; both candidates and simulated replies retained romanized Malayalam plus English (e.g. 'Ellam mandanmar ennu parayunnath oru overgeneralization aanu.'). No Malayalam-script intrusion or English-only translation was observed. Malayalam transliteration and fluency need competent human review.

These are one-example observations. English, Hindi, Malayalam and Minglish preserved their requested language/script in the tested candidates; Hinglish inference and orchestration worked but requested romanization failed. No language variant produced an English-only reply when a non-English language was specified. English internal summaries were not treated as generated replies. No automatic quality score or native-speaker endorsement is inferred from these observations.

## Conversation switching

Both consecutive submitted turns used conversation `c4dbc145-70fe-409d-bf16-4bf943989916`. The second run's persisted `context` event included 1 prior turn(s):

> The new volunteers ruined the Riverside park cleanup by missing the blue-bin pickup. They are useless; keep them off next Saturday's team.

Actual second-turn analysis context summary:

> The user previously complained in English that new volunteers ruined a park cleanup by missing the blue‑bin pickup and should be excluded from the next Saturday team; the current Hindi turn repeats the same hostile stance, urging that those who don’t collect the blue bins stay out.

The conversation contains 2 submitted user-side turns. The final evidence retains the conversation snapshot, model-assessed hostility trend and context-adaptation delta; simulated replies and unposted recommendations did not enter observed history.

## Usage, errors and regression results

Observed 42 provider HTTP requests; status counts `{'200': 42}`. Provider-reported totals: 43,012 prompt + 17,600 completion = 60,612 tokens. These are recorded usage counts, not monetary cost; cost is unknown/null. No extra model call was made for evidence audits or regression tests.

- `PYTHONPATH=backend/src work/.venv/bin/python -m pytest backend/tests -q -o faulthandler_timeout=20`: **67 passed, 1 skipped in 1.75s**. The PostgreSQL integration test skipped because `TEST_DATABASE_URL` is absent. One upstream Starlette TestClient/HTTPX deprecation warning remains. Test providers are fixtures/mock HTTP responses, separate from these live runs.
- `ruff check backend`: passed; `ruff format --check backend`: 20 files already formatted.
- `python -m pip check`: no broken requirements. `git diff --check`: passed.
- No application source or existing API contract was modified, no branch was merged, and no service/dashboard was left running. Research/API tokens were generated only in process and never persisted or displayed. Provider credentials were neither printed nor written into evidence.

## Remaining verification

This is one controlled smoke example per variant plus one English→Hindi controlled switch, not multilingual accuracy, safety, native fluency, calibration or causal de-escalation evaluation. Competent native-speaker review (especially Malayalam and romanized/code-mixed naturalness), wider held-out examples, ambiguous automatic output-language choice, other switch directions and longer conversations remain. All live runs abstained, so a successful live selected-response path remains unverified. Refinement was deliberately disabled and needs a separately authorized/budgeted live check. PostgreSQL regression was not rerun in this session. No real human follow-up, human rating, baseline/ablation experiment, dashboard or extension validation was performed.

`evidence.json` contains the exact submitted inputs, run/conversation/candidate IDs, complete validated structured traces, selected responses or abstentions, model estimates, HTTP metadata, usage and fresh-connection retrieval checks. Raw provider envelopes and hidden reasoning are excluded. The SQLite trace database remains under ignored `work/multilingual-live/research.db` for subsequent local retrieval.
