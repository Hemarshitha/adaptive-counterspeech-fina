import asyncio
import logging
from uuid import uuid4

from counterspeech.config import Settings
from counterspeech.output_script import required_script, validate_output_script
from counterspeech.policy import SelectionPolicy, rank_candidates, score_candidate
from counterspeech.prompts import PROMPT_VERSION, system_prompt
from counterspeech.providers.base import Provider, ProviderError, provider_event_sink
from counterspeech.schemas import (
    Analysis,
    Assessment,
    Candidate,
    Generation,
    Mode,
    Round,
    RunRequest,
    RunResult,
    Simulation,
    Strategy,
)
from counterspeech.store import Store

logger = logging.getLogger(__name__)
STRATEGIES = [Strategy.EMPATHY, Strategy.FACTS, Strategy.SHARED_VALUES, Strategy.QUESTION]


class Pipeline:
    def __init__(self, store: Store, provider: Provider, settings: Settings, policy=None):
        self.store = store
        self.provider = provider
        self.settings = settings
        self.policy = policy or SelectionPolicy()

    async def _call(self, run_id, stage, data, schema, **links):
        try:
            with provider_event_sink(
                lambda kind, payload: self.store.add_event(
                    run_id, kind, {"stage": stage, **links, **payload}
                )
            ):
                response = await self.provider.complete(stage, system_prompt(stage), data, schema)
        except ProviderError as exc:
            self.store.add_event(
                run_id, "stage_failed", {"stage": stage, "code": exc.code, **links}
            )
            raise
        # Adapters must satisfy the same contract, including user-provided custom providers.
        output = schema.model_validate(response.output.model_dump())
        self.store.add_event(
            run_id,
            stage,
            {
                **links,
                "prompt_version": PROMPT_VERSION,
                "output": output.model_dump(mode="json"),
                "metadata": response.metadata,
            },
        )
        return output

    async def execute(self, run_id: str, conversation_id: str, request: RunRequest):
        try:
            async with asyncio.timeout(self.settings.max_run_seconds):
                result = await self._execute(run_id, conversation_id, request)
            self.store.add_event(
                run_id,
                result.outcome,
                {
                    "selected_candidate_id": str(result.selected.candidate_id)
                    if result.selected
                    else None,
                    "human_review_required": True,
                    "recommendation_is_observed_reply": False,
                },
            )
            self.store.finish(run_id, result)
        except asyncio.CancelledError:
            self.store.add_event(run_id, "failed", {"code": "run_cancelled"})
            self.store.finish(run_id, None, "run_cancelled")
            raise
        except Exception as exc:
            code = (
                exc.code
                if isinstance(exc, ProviderError)
                else ("run_timeout" if isinstance(exc, TimeoutError) else "internal_pipeline_error")
            )
            # Do not log exception bodies, user text or API keys.
            logger.error("research_run_failed", extra={"run_id": run_id, "error_code": code})
            self.store.add_event(run_id, "failed", {"code": code})
            self.store.finish(run_id, None, code)
        return self.store.get_run(run_id)

    async def _execute(self, run_id, conversation_id, request):
        self.store.add_event(
            run_id,
            "started",
            {
                "mode": request.mode.value,
                "prompt_version": PROMPT_VERSION,
                "policy": self.policy.model_dump(),
                "schema_version": "1.0",
                "reaction_probability_kind": "uncalibrated_model_estimate",
            },
        )
        if request.mode == Mode.SINGLE_SHOT:
            return await self._baseline(run_id, request)

        if request.mode == Mode.NO_HISTORY:
            memory = {
                "observed_history": [],
                "hostility_trend": [],
                "history_included": 0,
                "history_suppressed_by_ablation": True,
            }
        else:
            memory = self.store.model_memory(
                conversation_id, self.settings.max_history_turns, self.settings.max_history_chars
            )
        self.store.add_event(run_id, "context", memory)
        data = {
            "current_text": request.text,
            **memory,
            "output_language": request.output_language,
            "output_script": request.output_script.value,
        }
        analysis = await self._call(run_id, "analysis", data, Analysis)
        output_language = request.output_language or analysis.suggested_output_language
        data.update(
            {
                "analysis": analysis.model_dump(mode="json"),
                "output_language": output_language.value,
                "required_output_script": required_script(
                    output_language, request.output_script, request.text
                ),
            }
        )
        trend = memory["hostility_trend"]
        self.store.add_event(
            run_id,
            "context_adaptation",
            {
                "current_hostility": analysis.hostility,
                "hostility_delta": round(analysis.hostility - trend[-1]["hostility"], 6)
                if trend
                else None,
                "basis": "model_assessment_of_real_observed_inputs",
            },
        )
        use_simulation = request.mode != Mode.NO_SIMULATION
        max_refinements = request.max_refinements if use_simulation else 0
        strategies = STRATEGIES[: request.candidate_count]
        rounds = []
        feedback = []
        previous_texts = set()
        for round_index in range(max_refinements + 1):
            generated = await self._call(
                run_id,
                "generation",
                {
                    **data,
                    "requested_strategies": [s.value for s in strategies],
                    "round_index": round_index,
                    "refinement_feedback": feedback,
                },
                Generation,
                round_index=round_index,
            )
            if [c.strategy for c in generated.candidates] != strategies:
                raise ProviderError("provider_candidate_strategy_mismatch")
            if any(d.text.casefold() in previous_texts for d in generated.candidates):
                raise ProviderError("provider_refinement_unchanged")
            previous_texts.update(d.text.casefold() for d in generated.candidates)
            candidates = []
            current = Round(index=round_index, candidates=candidates)
            for draft in generated.candidates:
                candidate = Candidate(
                    candidate_id=uuid4(),
                    round_index=round_index,
                    **draft.model_dump(),
                    script_validation=validate_output_script(
                        draft.text, output_language, request.output_script, request.text
                    ),
                )
                if not candidate.script_validation.valid:
                    score_candidate(candidate, self.policy, use_simulation)
                self.store.add_event(run_id, "candidate", candidate.model_dump(mode="json"))
                current.candidates.append(candidate)
                if not candidate.script_validation.valid:
                    # Reject before expensive inference. The ordinary refinement
                    # budget is the ONLY retry path; never silently repair text.
                    continue
                candidate_data = {**data, "candidate": draft.model_dump(mode="json")}
                links = {"round_index": round_index, "candidate_id": str(candidate.candidate_id)}
                if use_simulation:
                    candidate.simulation = await self._call(
                        run_id, "simulation", candidate_data, Simulation, **links
                    )
                candidate.assessment = await self._call(
                    run_id, "assessment", candidate_data, Assessment, **links
                )
                score_candidate(candidate, self.policy, use_simulation)
            ranked = rank_candidates(current.candidates)
            current.ranking = [c.candidate_id for c in ranked]
            rounds.append(current)
            self.store.add_event(
                run_id,
                "ranking",
                {
                    "round_index": round_index,
                    "policy": self.policy.model_dump(),
                    "ranked_candidates": [c.model_dump(mode="json") for c in ranked],
                    "tie_breaker": "original_generation_order",
                },
            )
            selected = next((c for c in ranked if c.eligible), None)
            if selected:
                return RunResult(
                    mode=request.mode,
                    analysis=analysis,
                    output_language=output_language,
                    output_script=request.output_script,
                    rounds=rounds,
                    selected=selected,
                    outcome="completed",
                )
            if round_index < max_refinements:
                feedback = [
                    {
                        "candidate_id": str(c.candidate_id),
                        "strategy": c.strategy.value,
                        "text": c.text,
                        "rejection_reasons": c.decision_reasons,
                        "simulation": c.simulation.model_dump(mode="json")
                        if c.simulation
                        else None,
                        "assessment": c.assessment.model_dump(mode="json")
                        if c.assessment
                        else None,
                        "script_validation": c.script_validation.model_dump(mode="json"),
                    }
                    for c in ranked
                ]
                current.refinement_feedback = feedback
                self.store.add_event(
                    run_id,
                    "refinement",
                    {
                        "from_round": round_index,
                        "to_round": round_index + 1,
                        "reason": "no_candidate_passed_required_gates",
                        "feedback": feedback,
                    },
                )
        return RunResult(
            mode=request.mode,
            analysis=analysis,
            output_language=output_language,
            output_script=request.output_script,
            rounds=rounds,
            selected=None,
            outcome="abstained",
        )

    async def _baseline(self, run_id, request):
        generated = await self._call(
            run_id,
            "baseline",
            {
                "current_text": request.text,
                "output_language": request.output_language,
                "output_script": request.output_script.value,
                "required_output_script": required_script(
                    request.output_language, request.output_script, request.text
                ),
            },
            Generation,
        )
        if len(generated.candidates) != 1 or generated.candidates[0].strategy != Strategy.DIRECT:
            raise ProviderError("provider_baseline_contract_mismatch")
        candidate = Candidate(
            candidate_id=uuid4(),
            round_index=0,
            **generated.candidates[0].model_dump(),
            script_validation=validate_output_script(
                generated.candidates[0].text,
                request.output_language,
                request.output_script,
                request.text,
            ),
            decision_reasons=["single_shot_baseline_unevaluated_requires_human_review"],
        )
        if not candidate.script_validation.valid:
            score_candidate(candidate, self.policy, False)
        self.store.add_event(run_id, "candidate", candidate.model_dump(mode="json"))
        return RunResult(
            mode=request.mode,
            analysis=None,
            output_language=request.output_language,
            output_script=request.output_script,
            rounds=[Round(index=0, candidates=[candidate])],
            selected=candidate if candidate.script_validation.valid else None,
            outcome="completed" if candidate.script_validation.valid else "abstained",
            disclosure="Single-shot zero-shot baseline: deterministic script validation only; no simulation, model safety/quality assessment or refinement. Unevaluated research output; human review required.",
        )
