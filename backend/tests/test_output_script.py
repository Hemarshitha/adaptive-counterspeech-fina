"""Unicode and pipeline regressions; fixtures are not language-quality evidence."""

import json
from pathlib import Path

import pytest
from conftest import FixtureProvider

from counterspeech.output_script import validate_output_script
from counterspeech.pipeline import Pipeline
from counterspeech.providers.base import Completion
from counterspeech.schemas import Generation, ObservedTurn, RunRequest


@pytest.mark.parametrize(
    "language,script,current,text,valid,expected",
    [
        ("english", "native", "English input", "Respect matters.", True, "latin"),
        ("english", "auto", "हिन्दी input", "Respect matters.", True, "latin"),
        ("hindi", "native", "input", "कृपया team की बात सुनें।", True, "devanagari"),
        ("malayalam", "native", "input", "എല്ലാവർക്കും respect വേണം.", True, "malayalam"),
        ("hinglish", "native", "input", "Team की बात सुनना सही है।", True, "devanagari"),
        ("minglish", "native", "input", "Team പറയുന്നത് കേൾക്കണം.", True, "malayalam"),
        ("hindi", "romanized", "हिन्दी input", "Sabki baat sunni chahiye.", True, "latin"),
        ("malayalam", "romanized", "മലയാളം", "Ellavarkkum bahumanam venam.", True, "latin"),
        ("hinglish", "romanized", "input", "Sabki opinion sunna sahi hai.", True, "latin"),
        ("minglish", "romanized", "input", "Ellavarkkum respect venam.", True, "latin"),
        ("hinglish", "romanized", "input", "Yeh सही nahi hai.", False, "latin"),
        ("minglish", "romanized", "input", "Ithu ശരിയല്ല, please listen.", False, "latin"),
        ("hindi", "native", "input", "English only.", False, "devanagari"),
        ("malayalam", "native", "input", "Malayalam alla.", False, "malayalam"),
        ("hindi", "native", "input", "शांति മലയാളം", False, "devanagari"),
        ("malayalam", "native", "input", "ശാന്തി हिन्दी", False, "malayalam"),
        ("hinglish", "romanized", "input", "Sahi hai।", False, "latin"),
        ("hinglish", "romanized", "input", "Sahi hai १", False, "latin"),
        ("minglish", "romanized", "input", "Shari aanu ാ", False, "latin"),
        ("hinglish", "romanized", "input", "Sahi hai ꣠", False, "latin"),
        ("hinglish", "romanized", "input", "Sahi hai \U00011b00", False, "latin"),
        ("hinglish", "romanized", "input", "Rеspect sabko.", False, "latin"),  # Cyrillic е
        ("minglish", "romanized", "input", "Nanni தமிழ்", False, "latin"),
        ("hinglish", "romanized", "input", "Sahi hai ੧", False, "latin"),
        ("minglish", "romanized", "input", "123 🙂", False, "latin"),
        ("hindi", "native", "input", "English १२३।", False, "devanagari"),
        ("malayalam", "native", "input", "English ാ", False, "malayalam"),
        (
            "hinglish",
            "romanized",
            "input",
            "Āpki baat, cafe\u0301, respect — 2026 🙂",
            True,
            "latin",
        ),
        ("malayalam", "native", "input", "അവന്\u200d respect വേണം.", True, "malayalam"),
        ("hinglish", "auto", "Yeh input hai.", "Sabko respect do.", True, "latin"),
        ("hinglish", "auto", "यह mixed input है।", "सबको respect दो।", True, "devanagari"),
        ("minglish", "auto", "ഇത് mixed input ആണ്.", "എല്ലാവർക്കും respect വേണം.", True, "malayalam"),
        ("minglish", "auto", "Ithu input aanu.", "എല്ലാവർക്കും respect വേണം.", False, "latin"),
        (None, "auto", "हिन्दी input", "सबको respect दो।", True, "devanagari"),
        (None, "auto", "हिन्दी മലയാളം", "Respect.", False, "undetermined"),
    ],
)
def test_unicode_script_boundaries(language, script, current, text, valid, expected):
    result = validate_output_script(text, language, script, current)
    assert result.valid is valid
    assert result.expected_script == expected
    assert bool(result.reasons) is not valid


def historical_hinglish():
    path = (
        Path(__file__).resolve().parents[2]
        / "docs/verification/live-multilingual-2026-10-31/evidence.json"
    )
    evidence = json.loads(path.read_text())
    # Use the actual recorded outputs, including the assessor's false negative.
    case = next(c for c in evidence["runs"] if c["case"] == "hinglish")
    return case["trace"]["result"]["rounds"][0]["candidates"]


class ScriptFixture(FixtureProvider):
    def __init__(self, rounds, **kwargs):
        super().__init__(**kwargs)
        self.rounds = rounds

    async def complete(self, stage, system, data, schema):
        result = await super().complete(stage, system, data, schema)
        if stage in {"generation", "baseline"}:
            texts = self.rounds[data.get("round_index", 0)]
            candidates = [
                {"strategy": c.strategy, "text": text}
                for c, text in zip(result.output.candidates, texts, strict=True)
            ]
            return Completion(output=Generation(candidates=candidates), metadata=result.metadata)
        return result


async def run_fixture(store, settings, provider, **overrides):
    values = dict(
        text="Night shift wale sab careless hain.",
        output_language="hinglish",
        output_script="romanized",
        candidate_count=2,
        max_refinements=0,
    )
    request = RunRequest(**(values | overrides))
    rid, cid = store.start_run(request)
    return await Pipeline(store, provider, settings).execute(rid, cid, request)


async def test_actual_hinglish_failure_rejected_without_relying_on_assessor(store, settings):
    old = historical_hinglish()
    assert old[1]["assessment"]["language_matches"] is True
    texts = [c["text"] for c in old]
    provider = ScriptFixture([texts], language_matches=True)
    run = await run_fixture(store, settings, provider)
    assert run.status == "abstained" and run.result.selected is None
    assert [stage for stage, _, _ in provider.calls] == ["analysis", "generation"]
    for c, original in zip(run.result.rounds[0].candidates, texts, strict=True):
        assert c.text == original  # No stripping or lossy automatic transliteration.
        assert not c.eligible and not c.script_validation.valid
        assert c.score is None and c.assessment is None and c.simulation is None
        assert "deterministic_output_script_rejected" in c.decision_reasons
    assert store.get_run(str(run.run_id)).model_dump() == run.model_dump()


@pytest.mark.parametrize("budget", [0, 1, 2])
async def test_invalid_regeneration_is_strictly_bounded(store, settings, budget):
    provider = ScriptFixture(
        [[f"Yeh सही nahi {i}", f"Sab गलत nahi {i}"] for i in range(budget + 1)]
    )
    run = await run_fixture(store, settings, provider, max_refinements=budget)
    assert run.status == "abstained" and run.result.selected is None
    assert len(run.result.rounds) == budget + 1
    assert [s for s, _, _ in provider.calls] == ["analysis"] + ["generation"] * (budget + 1)
    for _, _, data in provider.calls[2:]:
        assert data["required_output_script"] == "latin"
        assert all(not f["script_validation"]["valid"] for f in data["refinement_feedback"])
        assert all(f["assessment"] is None for f in data["refinement_feedback"])


async def test_script_correction_uses_existing_refinement_and_all_original_gates(store, settings):
    provider = ScriptFixture(
        [
            ["Yeh सही nahi hai", "Sab गलत nahi hain"],
            [
                "Yeh sahi nahi hai; team ko sunna chahiye.",
                "Sab galat nahi hain; each opinion matters.",
            ],
        ]
    )
    run = await run_fixture(store, settings, provider, max_refinements=1)
    assert run.status == "completed" and run.result.selected.round_index == 1
    assert all(
        c.script_validation.valid and c.assessment and c.simulation
        for c in run.result.rounds[1].candidates
    )
    assert all(not c.eligible for c in run.result.rounds[0].candidates)
    assert [s for s, _, _ in provider.calls].count("generation") == 2


async def test_wrong_script_introduced_in_refinement_cannot_be_selected(store, settings):
    provider = ScriptFixture(
        [
            ["Sabki baat sunni chahiye.", "Har opinion matters."],
            ["Sabki बात sunni chahiye.", "Har opinion मायने rakhti hai."],
        ],
        adverse_rounds=1,
    )
    run = await run_fixture(store, settings, provider, max_refinements=1)
    assert run.status == "abstained"
    assert all(not c.script_validation.valid for c in run.result.rounds[1].candidates)
    assert [s for s, _, _ in provider.calls].count("assessment") == 2


@pytest.mark.parametrize(
    "options,reason",
    [
        ({"unsafe": True}, "safety_rejected"),
        ({"language_matches": False}, "language_or_script_mismatch"),
        ({"adverse_rounds": 99}, "escalation_above_threshold"),
    ],
)
async def test_script_validity_never_bypasses_model_or_safety_gates(
    store, settings, options, reason
):
    provider = ScriptFixture([["Sabki baat sunni chahiye.", "Har opinion matters."]], **options)
    run = await run_fixture(store, settings, provider)
    assert run.status == "abstained"
    assert all(
        c.script_validation.valid and reason in c.decision_reasons
        for c in run.result.rounds[0].candidates
    )


async def test_only_invalid_candidate_is_withheld_valid_candidate_is_really_assessed(
    store, settings
):
    provider = ScriptFixture([["Yeh सही nahi hai", "Har opinion matters."]])
    run = await run_fixture(store, settings, provider)
    assert run.status == "completed"
    assert run.result.selected.strategy == "factual_correction"
    assert run.result.selected.text == "Har opinion matters."
    assert [d["candidate"]["text"] for s, _, d in provider.calls if s == "assessment"] == [
        "Har opinion matters."
    ]


@pytest.mark.parametrize("mode", ["single_shot", "no_simulation", "no_history"])
async def test_all_experiment_modes_enforce_script_without_extra_inference(store, settings, mode):
    texts = (
        ["Yeh सही nahi hai"] if mode == "single_shot" else ["Yeh सही nahi hai", "Sab गलत nahi hain"]
    )
    provider = ScriptFixture([texts])
    run = await run_fixture(store, settings, provider, mode=mode)
    assert run.status == "abstained" and run.result.selected is None
    assert not any(s in {"assessment", "simulation"} for s, _, _ in provider.calls)
    if mode == "single_shot":
        assert [s for s, _, _ in provider.calls] == ["baseline"]


async def test_switching_across_all_five_languages_preserves_exact_real_history(store, settings):
    provider = FixtureProvider()
    inputs = [
        ("english", "native", "First real input."),
        ("hindi", "native", "पहला हिन्दी turn।"),
        ("malayalam", "native", "അടുത്ത മലയാളം turn."),
        ("hinglish", "romanized", "Ab Hinglish mein baat karein."),
        ("minglish", "romanized", "Ini Minglish samsaarikkaam."),
    ]
    cid = None
    observed = []
    for language, script, text in inputs:
        provider.calls.clear()
        run = await run_fixture(
            store,
            settings,
            provider,
            text=text,
            conversation_id=cid,
            output_language=language,
            output_script=script,
        )
        assert run.status == "completed"
        context = next(e.payload for e in run.events if e.stage == "context")
        assert [t["text"] for t in context["observed_history"]] == observed
        assert "imagined reply" not in str(context)
        observed.append(text)
        cid = str(run.conversation_id)
        posted = f"Actually recorded reply after {language}."
        store.append_observed(cid, ObservedTurn(speaker="human_reply", text=posted))
        observed.append(posted)
        assert [t["text"] for t in store.get_conversation(cid)["turns"]] == observed


def test_wrong_script_api_abstention_round_trip(settings):
    from conftest import HEADERS
    from fastapi.testclient import TestClient

    from counterspeech.api import create_app

    provider = ScriptFixture([["Yeh सही nahi hai", "Sab गलत nahi hain"]])
    with TestClient(create_app(settings, provider)) as client:
        response = client.post(
            "/v1/runs",
            headers=HEADERS,
            json={
                "text": "Yeh controlled input hai.",
                "output_language": "hinglish",
                "output_script": "romanized",
                "candidate_count": 2,
                "max_refinements": 0,
            },
        )
        assert response.status_code == 201
        run = response.json()
        assert run["status"] == "abstained" and run["result"]["selected"] is None
        assert client.get(f"/v1/runs/{run['run_id']}", headers=HEADERS).json() == run
        assert all(
            not c["script_validation"]["valid"] for c in run["result"]["rounds"][0]["candidates"]
        )
