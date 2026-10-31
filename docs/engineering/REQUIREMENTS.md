# Requirements traceability

Authority: **`docs/PROJ_2.pdf`, read completely (7 pages)**. Product additions below come from the current user request and compatible `PROJECT_SPEC.md`. These are requirements and acceptance gates, not claims that all features are implemented. Test names identify the planned or implemented evidence; see `PROJECT_STATUS.md` for actual results.

| ID | Approved objective / source | Components | Acceptance evidence |
|---|---|---|---|
| R01 | Predict the original speaker's reaction to each potential reply before selection (proposal p.2, objective 1) | `pipeline`, provider `simulate`, candidate trace | Two different candidates receive separate simulation calls; distributions validated; final links to ranked candidate |
| R02 | Bounded reaction-driven feedback/refinement (p.2, objective 2) | `pipeline`, immutable policy config | Adverse first round triggers revised candidates with recorded feedback; bound enforced; abstain when no safe candidate exists |
| R03 | Multi-turn dialogue and escalation trends (p.2, objective 3; p.3 deliverables) | conversation store, context builder, history ablation; later synthetic-dialogue CLI | Observed second turn reaches model context; stored trend uses actual input analyses; simulated turns never enter observed memory. Synthetic rollout/validation remains a later gate |
| R04 | English + Indian-language transfer evaluation (p.2–3, objective 4) | language-aware structured prompts, evaluator, held-out cases | Per-language pipeline contracts plus genuine model and native-speaker validation before claiming transfer |
| R05 | English, Hindi, Malayalam, Hinglish, Minglish; native/romanized input and switching (user §5) | five language enums, script-aware instructions, explicit override | Parameterized Unicode/romanized fixtures; language override and switched second turn retained; live language quality remains unvalidated |
| R06 | Automatic toxicity, quality, argument strength evaluation (p.3) | separate candidate assessment and evaluation export | Dimensions, provenance, and missing metrics are explicit; no judge score represented as independent ground truth |
| R07 | One-shot zero-shot comparison (p.3 deliverable 1) | new `single_shot` mode, experiment configs | Exactly one generation call; no reaction/refinement/context leakage; controlled model/settings recorded |
| R08 | Genuine human study, approx. 100–150 evaluated examples (p.3) | study protocol, blinded export and rating validation (later) | Consent/ethics decision, real raters, paired design, actual ratings, agreement and uncertainty; never prefill ratings |
| R09 | Reusable human-validated synthetic multi-turn dataset (p.3 deliverable 2) | dataset provenance/splits, future synthetic rollout and validation workflow | Every generated turn marked synthetic, model/prompt recorded, human validation and license recorded; no dataset claimed yet |
| R10 | Easy-to-use demonstration web interface (p.3); separate internal dashboard (user §3B) | future React dashboard, shared run/trace API | Browser E2E follows exact run ID; every round, candidate, simulation, decision, history and failure comes from API |
| R11 | YouTube-first Chrome/Edge extension (user §3A) | future MV3 content adapter, popup, service worker | Capture only loaded comments, manual selection fallback, edit/copy, exact trace link, no posting handler/permissions |
| R12 | Shared complete pipeline (user §3C) | FastAPI + provider protocol + policy + SQL store | Understanding → generation → per-candidate simulation/assessment → ranking → bounded refinement → recommendation/abstention |
| R13 | Real traces; no hidden reasoning or fake inference (user §3B; spec §4) | schema-versioned trace events, provider metadata | Persist validated structured outputs, calculated scores, prompts version/hash, latency/token counts; no chain-of-thought field; fixture provider available only in tests |
| R14 | Observed messages separate from simulated reactions (user §6) | `turns`, candidate simulation records, explicit provenance | Only submitted observed turns enter conversation history; suggestions never counted as posted replies |
| R15 | Replaceable providers, protected credentials (user §5) | provider protocol, OpenAI-compatible HTTP adapter, server-only settings | Mock HTTP contract, malformed/refusal/timeout/retry tests, missing provider returns 503, no credential returned in trace |
| R16 | Persistent, modular, reproducible services (user §5) | SQLAlchemy, Alembic, PostgreSQL compose, SQLite local tests, CI | Reopen DB and retrieve identical trace; migration checks; PostgreSQL test job; Docker execution reported separately |
| R17 | Safe failure handling and minimized context (spec §4) | input caps, data/instruction separation, auth, CORS, per-conversation lease | Invalid payload, unauthorized access, busy conversation, unsafe candidates, provider outage and prompt-boundary tests |
| R18 | Controlled comparisons / ablations (spec §6) | baseline, no-simulation, no-history, full mode + versioned configs | Disabling a component measurably removes its calls/context; same test group held out across modes |
| R19 | Licensing, dataset identity and split hygiene (proposal p.3; spec §6) | data/evaluation protocol | Verify source licenses and source/conversation-level splits before download/use; no old data imported |
| R20 | Working increments, status and tests (user §7) | branch, docs, tests, `PROJECT_STATUS.md` | Actual commands/results; no direct main commits; blockers and next-session instructions |

## Source discrepancy requiring care, not scope change

The proposal p.3 attributes French/Italian multilingual subsets to “CONAN-MT”. Its bibliography [6] is multilingual CONAN (2019), while [7] is the multi-target dataset (2021). Preserve the proposal's multilingual objective; do **not** assume the named datasets have interchangeable language coverage. Verify primary dataset cards/licenses before selecting evaluation data. No academic objective has been changed.

The Saha paper PDF is not supplied. The new baseline will implement the documented high-level **single-shot zero-shot** paradigm, citing proposal reference [1]. It must not be described as an exact reproduction of that paper's prompts or reported results until the original methods have been checked.
