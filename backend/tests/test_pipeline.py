import asyncio

import pytest
from conftest import FixtureProvider

from counterspeech.pipeline import Pipeline
from counterspeech.schemas import Mode, ObservedTurn, RunRequest
from counterspeech.store import ConversationBusy, Store


async def execute(store, provider, settings, **values):
    request = RunRequest(text="People from that community are all untrustworthy.", **values)
    run_id, conversation_id = store.start_run(request)
    view = await Pipeline(store, provider, settings).execute(run_id, conversation_id, request)
    return view


async def test_candidate_specific_simulation_and_separate_assessment(store, provider, settings):
    run = await execute(store, provider, settings)
    assert run.status == "completed"
    candidates = run.result.rounds[0].candidates
    assert len(candidates) == 3
    simulations = [data for stage, _, data in provider.calls if stage == "simulation"]
    assessments = [data for stage, _, data in provider.calls if stage == "assessment"]
    assert [s["candidate"]["text"] for s in simulations] == [c.text for c in candidates]
    assert len({c.simulation.probabilities.deescalate for c in candidates}) > 1
    assert all("simulation" not in data and "probabilities" not in data for data in assessments)
    assert run.result.selected.candidate_id == run.result.rounds[0].ranking[0]
    assert run.result.selected.strategy == "empathy"
    assert [e.sequence for e in run.events] == list(range(1, len(run.events) + 1))
    assert all(
        e.payload["metadata"]["provenance"] == "deterministic_test_fixture"
        for e in run.events
        if "metadata" in e.payload
    )
    assert "uncalibrated" in run.result.disclosure


async def test_adverse_reactions_trigger_real_bounded_refinement(store, settings):
    provider = FixtureProvider(adverse_rounds=1)
    run = await execute(store, provider, settings, max_refinements=2)
    assert run.status == "completed"
    assert len(run.result.rounds) == 2
    assert not any(c.eligible for c in run.result.rounds[0].candidates)
    revised = [data for stage, _, data in provider.calls if stage == "generation"][1]
    assert len(revised["refinement_feedback"]) == 3
    assert "escalation_above_threshold" in revised["refinement_feedback"][0]["rejection_reasons"]
    assert run.result.selected.round_index == 1
    assert sum(e.stage == "refinement" for e in run.events) == 1


async def test_exhausted_refinement_abstains_instead_of_unsafe_fallback(store, settings):
    provider = FixtureProvider(adverse_rounds=99)
    run = await execute(store, provider, settings, max_refinements=2)
    assert run.status == "abstained" and run.result.selected is None
    assert len(run.result.rounds) == 3
    assert len([c for c in provider.calls if c[0] == "simulation"]) == 9
    assert store.get_conversation(str(run.conversation_id))["active_run_id"] is None


@pytest.mark.parametrize(
    "options,reason",
    [
        ({"unsafe": True}, "safety_rejected"),
        ({"language_matches": False}, "language_or_script_mismatch"),
    ],
)
async def test_safety_and_language_gates_override_favorable_reactions(
    store, settings, options, reason
):
    run = await execute(store, FixtureProvider(**options), settings, max_refinements=0)
    assert run.status == "abstained"
    assert all(reason in c.decision_reasons for c in run.result.rounds[0].candidates)


async def test_multiturn_observed_history_and_language_switch(store, provider, settings):
    first = await execute(store, provider, settings)
    cid = str(first.conversation_id)
    human_reply = "I edited and actually posted this respectful reply."
    store.append_observed(cid, ObservedTurn(speaker="human_reply", text=human_reply))
    provider.calls.clear()
    provider.hostility = 0.3
    request = RunRequest(
        text="ठीक है, सभी लोग एक जैसे नहीं होते।", conversation_id=cid, output_language="hindi"
    )
    rid, _ = store.start_run(request)
    second = await Pipeline(store, provider, settings).execute(rid, cid, request)
    analysis_input = next(data for stage, _, data in provider.calls if stage == "analysis")
    assert analysis_input["observed_history"][-1]["text"] == human_reply
    assert first.result.selected.text not in [t["text"] for t in analysis_input["observed_history"]]
    assert "TEST-ONLY imagined reply" not in str(analysis_input)
    conversation = store.get_conversation(cid)
    assert len(conversation["turns"]) == 3
    assert [x["detected_language"] for x in conversation["hostility_trend"]] == ["english", "hindi"]
    adaptation = next(e.payload for e in second.events if e.stage == "context_adaptation")
    assert adaptation["hostility_delta"] == -0.5
    assert second.result.output_language == "hindi"


@pytest.mark.parametrize(
    "language,text,script",
    [
        ("english", "I dislike that whole community.", "auto"),
        ("hindi", "उस समुदाय के सभी लोग खराब हैं।", "native"),
        ("hindi", "Us samuday ke sabhi log kharab hain.", "romanized"),
        ("malayalam", "ആ സമൂഹത്തിലെ എല്ലാവരും മോശമാണ്.", "native"),
        ("malayalam", "Aa samoohathile ellavarum mosham aanu.", "romanized"),
        ("hinglish", "Us community ke log all bad hain.", "romanized"),
        ("hinglish", "उस community के लोग all bad हैं।", "native"),
        ("minglish", "Aa communityile people ellam mosham aanu.", "romanized"),
        ("minglish", "ആ communityയിലെ people എല്ലാവരും മോശമാണ്.", "native"),
    ],
)
async def test_multilingual_contracts_not_model_quality(store, settings, language, text, script):
    provider = FixtureProvider()
    request = RunRequest(text=text, output_language=language, output_script=script)
    rid, cid = store.start_run(request)
    run = await Pipeline(store, provider, settings).execute(rid, cid, request)
    assert run.status == "completed"
    for _stage, system, data in provider.calls:
        assert data["current_text"] == text
        assert data["output_language"] == language and data["output_script"] == script
        assert "romanized" in system and "minglish" in system
    assert run.result.output_language == language
    assert all(
        c.simulation is not None and c.assessment is not None
        for c in run.result.rounds[0].candidates
    )


async def test_single_shot_has_exactly_one_generation_no_history_or_judging(
    store, provider, settings
):
    request = RunRequest(
        text="I hate that group.",
        mode=Mode.SINGLE_SHOT,
        initial_context=[ObservedTurn(speaker="human_reply", text="Prior observed turn")],
    )
    rid, cid = store.start_run(request)
    run = await Pipeline(store, provider, settings).execute(rid, cid, request)
    assert [stage for stage, _, _ in provider.calls] == ["baseline"]
    assert "observed_history" not in provider.calls[0][2]
    assert "Prior observed turn" not in str(provider.calls)
    assert run.result.selected.simulation is None and run.result.selected.assessment is None
    assert not run.result.selected.eligible
    assert "Unevaluated" in run.result.disclosure


async def test_no_simulation_ablation_really_removes_simulation_and_refinement(
    store, provider, settings
):
    run = await execute(store, provider, settings, mode=Mode.NO_SIMULATION, max_refinements=2)
    assert run.status == "completed"
    assert not any(stage == "simulation" for stage, _, _ in provider.calls)
    assert len(run.result.rounds) == 1
    assert run.result.selected.simulation is None


async def test_no_history_ablation_removes_observed_context_and_trend(store, provider, settings):
    await execute(store, provider, settings)  # independent run never used as history
    provider.calls.clear()
    request = RunRequest(
        text="I hate them.",
        mode=Mode.NO_HISTORY,
        initial_context=[ObservedTurn(speaker="human_reply", text="Do not leak this earlier turn")],
    )
    rid, cid = store.start_run(request)
    await Pipeline(store, provider, settings).execute(rid, cid, request)
    assert "Do not leak" not in str(provider.calls)
    for _, _, data in provider.calls:
        assert data["observed_history"] == [] and data["hostility_trend"] == []


async def test_failure_preserves_partial_trace_and_unlocks_conversation(store, settings):
    provider = FixtureProvider(fail_stage="assessment")
    run = await execute(store, provider, settings)
    assert run.status == "failed" and run.error_code == "fixture_provider_failed"
    assert "simulation" in [e.stage for e in run.events]
    assert run.result is None
    assert store.get_conversation(str(run.conversation_id))["active_run_id"] is None
    # Original observed message remains real history even though the model call failed.
    assert len(store.get_conversation(str(run.conversation_id))["turns"]) == 1


async def test_trace_survives_store_restart(store, provider, settings):
    run = await execute(store, provider, settings)
    second = Store(settings.database_url)
    try:
        assert second.get_run(str(run.run_id)).model_dump() == run.model_dump()
    finally:
        second.close()


def test_database_claim_prevents_concurrent_runs_and_turn_reordering(store):
    request = RunRequest(text="First input")
    rid, cid = store.start_run(request)
    with pytest.raises(ConversationBusy):
        store.start_run(RunRequest(text="Must not be saved", conversation_id=cid))
    with pytest.raises(ConversationBusy):
        store.append_observed(cid, ObservedTurn(speaker="human_reply", text="Must not reorder"))
    assert len(store.get_conversation(cid)["turns"]) == 1
    store.finish(rid, None, "test_cleanup")
    store.append_observed(cid, ObservedTurn(speaker="human_reply", text="Now append is permitted"))


def test_history_cap_is_explicit_and_keeps_latest_complete_turns(store, settings):
    request = RunRequest(
        text="current",
        initial_context=[
            ObservedTurn(speaker="human_reply", text="A" * 20),
            ObservedTurn(speaker="original_speaker", text="B" * 20),
            ObservedTurn(speaker="human_reply", text="C" * 20),
        ],
    )
    _, cid = store.start_run(request)
    memory = store.model_memory(cid, max_turns=2, max_chars=30)
    assert memory["history_total"] == 3 and memory["history_included"] == 1
    assert memory["history_truncated"] is True
    assert memory["observed_history"][0]["text"] == "C" * 20


async def test_overall_deadline_fails_and_releases_history_claim(store, settings):
    class SlowProvider(FixtureProvider):
        async def complete(self, *args, **kwargs):
            await asyncio.Event().wait()

    settings = settings.model_copy(update={"max_run_seconds": 0.02})
    run = await execute(store, SlowProvider(), settings)
    assert run.status == "failed" and run.error_code == "run_timeout"
    assert store.get_conversation(str(run.conversation_id))["active_run_id"] is None


async def test_task_cancellation_is_recorded_and_releases_claim(store, settings):
    started = asyncio.Event()

    class WaitingProvider(FixtureProvider):
        async def complete(self, *args, **kwargs):
            started.set()
            await asyncio.Event().wait()

    request = RunRequest(text="Observed input before disconnect")
    rid, cid = store.start_run(request)
    task = asyncio.create_task(
        Pipeline(store, WaitingProvider(), settings).execute(rid, cid, request)
    )
    await started.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert store.get_run(rid).error_code == "run_cancelled"
    assert store.get_conversation(cid)["active_run_id"] is None


async def test_refinement_cannot_relabel_unchanged_text_as_a_revision(store, settings):
    class UnchangedProvider(FixtureProvider):
        async def complete(self, stage, system, data, schema):
            if stage == "generation":
                data = {**data, "round_index": 0}
            return await super().complete(stage, system, data, schema)

    run = await execute(store, UnchangedProvider(adverse_rounds=99), settings)
    assert run.status == "failed" and run.error_code == "provider_refinement_unchanged"


async def test_wrong_strategy_count_is_a_provider_contract_error(store, settings):
    class WrongStrategiesProvider(FixtureProvider):
        async def complete(self, stage, system, data, schema):
            if stage == "generation":
                data = {**data, "requested_strategies": ["empathy"]}
            return await super().complete(stage, system, data, schema)

    run = await execute(store, WrongStrategiesProvider(), settings)
    assert run.status == "failed" and run.error_code == "provider_candidate_strategy_mismatch"


def test_explicit_orphan_recovery_does_not_clear_recent_runs(store):
    from sqlalchemy import update

    from counterspeech.store import RunRow

    old_id, old_cid = store.start_run(RunRequest(text="orphan input"))
    current_id, current_cid = store.start_run(RunRequest(text="recent input"))
    with store.session.begin() as db:
        db.execute(
            update(RunRow).where(RunRow.id == old_id).values(updated_at="2020-01-01T00:00:00+00:00")
        )
    assert store.recover_stale_runs() == [old_id]
    assert store.get_run(old_id).error_code == "orphaned_run_recovered"
    assert store.get_conversation(old_cid)["active_run_id"] is None
    assert store.get_run(current_id).status == "running"
    assert store.get_conversation(current_cid)["active_run_id"] == current_id
