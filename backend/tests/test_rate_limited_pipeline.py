"""Mock HTTP inference only; exercises the production adapter and complete pipeline."""

import asyncio
import json

import httpx
import pytest
from conftest import FixtureProvider
from pydantic import SecretStr
from test_provider import GOOD_HEADERS, FakeClock, envelope

from counterspeech.pipeline import Pipeline
from counterspeech.providers.openai_compatible import OpenAICompatibleProvider
from counterspeech.schemas import (
    Analysis,
    Assessment,
    Generation,
    ObservedTurn,
    RunRequest,
    Simulation,
)
from counterspeech.store import Store


def adapter(settings, fixture, first_response=None, **options):
    calls = []
    schemas = {
        "analysis": Analysis,
        "generation": Generation,
        "simulation": Simulation,
        "assessment": Assessment,
    }

    async def handler(request):
        nonlocal first_response
        if first_response is not None:
            response, first_response = first_response, None
            return response
        body = json.loads(request.content)
        system, user = [m["content"] for m in body["messages"]]
        data = json.loads(user)
        stage, schema = next(
            (stage, schema)
            for stage, schema in schemas.items()
            if f'"title": "{schema.__name__}"' in system
        )
        calls.append((stage, data))
        result = await fixture.complete(stage, system, data, schema)
        return httpx.Response(
            200,
            headers={**GOOD_HEADERS, "x-ratelimit-remaining-tokens": "100"},
            json=envelope(json.dumps(result.output.model_dump(mode="json"), ensure_ascii=False)),
        )

    configured = settings.model_copy(
        update={
            "llm_base_url": "https://mock.example/v1",
            "llm_model": "mock-only",
            "llm_api_key": SecretStr("test-secret"),
            "provider_groq_pacing": True,
            "max_run_seconds": 1800,
            **options,
        }
    )
    provider = OpenAICompatibleProvider(configured, transport=httpx.MockTransport(handler))
    clock = FakeClock()
    provider.pacer.clock = clock.monotonic
    provider.pacer.sleep = clock.sleep
    return provider, configured, clock, calls


@pytest.mark.parametrize("count", [2, 3, 4])
@pytest.mark.parametrize("adverse_rounds,outcome", [(2, "completed"), (99, "abstained")])
@pytest.mark.parametrize(
    "language,text,script",
    [
        ("english", "People from that group are all bad.", "auto"),
        ("hindi", "उस समुदाय के सभी लोग खराब हैं।", "native"),
        ("malayalam", "ആ സമൂഹത്തിലെ എല്ലാവരും മോശമാണ്.", "native"),
        ("hinglish", "Us community ke log all bad hain.", "romanized"),
        ("minglish", "Aa communityile people ellam mosham aanu.", "romanized"),
    ],
)
async def test_paced_full_runs_preserve_candidates_refinement_and_multiturn(
    store, settings, count, adverse_rounds, outcome, language, text, script
):
    fixture = FixtureProvider()
    provider, configured, clock, calls = adapter(settings, fixture)
    try:
        first_request = RunRequest(
            text="Earlier English complaint about blue bins.",
            output_language="english",
            candidate_count=2,
        )
        rid, cid = store.start_run(first_request)
        first = await Pipeline(store, provider, configured).execute(rid, cid, first_request)
        assert first.status == "completed"
        posted = "An actually observed human reply about blue bins."
        store.append_observed(cid, ObservedTurn(speaker="human_reply", text=posted))
        fixture.adverse_rounds = adverse_rounds
        calls.clear()
        clock.waits.clear()
        request = RunRequest(
            text=text,
            conversation_id=cid,
            output_language=language,
            output_script=script,
            candidate_count=count,
            max_refinements=2,
        )
        rid, _ = store.start_run(request)
        run = await Pipeline(store, provider, configured).execute(rid, cid, request)
        assert run.status == outcome
        assert len(run.result.rounds) == 3
        assert len(calls) == 1 + 3 * (1 + 2 * count)
        assert sum(e.stage == "refinement" for e in run.events) == 2
        assert len(clock.waits) == len(calls)  # includes cooldown from prior run
        assert sum(clock.waits) <= configured.max_run_seconds
        for current in run.result.rounds:
            assert len(current.candidates) == count
            assert len(current.ranking) == count
            assert all(
                c.script_validation.valid and c.simulation and c.assessment
                for c in current.candidates
            )
            simulations = [
                e
                for e in run.events
                if e.stage == "simulation" and e.payload["round_index"] == current.index
            ]
            assessments = [
                e
                for e in run.events
                if e.stage == "assessment" and e.payload["round_index"] == current.index
            ]
            assert {e.payload["candidate_id"] for e in simulations} == {
                str(c.candidate_id) for c in current.candidates
            }
            assert len(assessments) == count
        analysis_data = calls[0][1]
        assert [t["text"] for t in analysis_data["observed_history"]] == [
            first_request.text,
            posted,
        ]
        assert all(
            data["current_text"] == text
            and data["output_language"] == language
            and data["output_script"] == script
            for _, data in calls
        )
        assert all(
            "TEST-ONLY imagined reply" not in t["text"] and t["text"] != first.result.selected.text
            for t in analysis_data["observed_history"]
        )
        if outcome == "completed":
            assert run.result.selected.round_index == 2
        else:
            assert run.result.selected is None
        waits = [e for e in run.events if e.stage == "provider_wait"]
        assert waits and all(
            e.payload["stage"] in {"analysis", "generation", "simulation", "assessment"}
            for e in waits
        )
        assert any(e.payload.get("candidate_id") for e in waits)
        restarted = Store(configured.database_url)
        try:
            assert restarted.get_run(rid).model_dump() == run.model_dump()
        finally:
            restarted.close()
        assert store.get_conversation(cid)["active_run_id"] is None
    finally:
        await provider.close()


@pytest.mark.parametrize("retries,outcome", [(1, "completed"), (0, "failed")])
async def test_429_retry_events_survive_persistence_and_sanitize_error_bodies(
    store, settings, retries, outcome
):
    provider, configured, clock, _ = adapter(
        settings,
        FixtureProvider(),
        first_response=httpx.Response(
            429,
            headers={**GOOD_HEADERS, "retry-after": "70"},
            text="private input and provider-secret must never be stored",
        ),
        provider_retries=retries,
    )
    request = RunRequest(text="Test input", candidate_count=2, max_refinements=0)
    rid, cid = store.start_run(request)
    try:
        run = await Pipeline(store, provider, configured).execute(rid, cid, request)
        assert run.status == outcome
        kind = "provider_retry" if retries else "provider_retry_exhausted"
        retry = next(e for e in run.events if e.stage == kind)
        assert retry.payload == {
            "stage": "analysis",
            "attempt": 1,
            "status_code": 429,
            "reason": "rate_limited",
        }
        if retries:
            assert clock.waits[0] == 70
        else:
            assert run.error_code == "provider_rate_limited"
        stored = store.get_run(rid).model_dump_json()
        assert "private input" not in stored and "provider-secret" not in stored
        assert store.get_conversation(cid)["active_run_id"] is None
    finally:
        await provider.close()


@pytest.mark.parametrize("cancel", [False, True])
async def test_run_deadline_or_cancellation_during_pacing_persists_partial_trace_and_releases_claim(
    store, settings, cancel
):
    provider, configured, clock, _ = adapter(
        settings, FixtureProvider(), max_run_seconds=0.02 if not cancel else 600
    )
    waiting = asyncio.Event()

    async def blocked(seconds):
        waiting.set()
        await asyncio.Event().wait()

    provider.pacer.sleep = blocked
    request = RunRequest(text="Test input", candidate_count=4)
    rid, cid = store.start_run(request)
    task = asyncio.create_task(Pipeline(store, provider, configured).execute(rid, cid, request))
    try:
        await waiting.wait()
        partial = store.get_run(rid)
        assert partial.status == "running" and any(
            e.stage == "provider_wait" for e in partial.events
        )
        if cancel:
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
        else:
            await task
        run = store.get_run(rid)
        assert run.error_code == ("run_cancelled" if cancel else "run_timeout")
        assert any(e.stage == "analysis" for e in run.events)
        assert not provider.pacer.lock.locked()
        assert store.get_conversation(cid)["active_run_id"] is None
    finally:
        await provider.close()
