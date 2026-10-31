from counterspeech.schemas import Candidate, StrictModel, Unit


class SelectionPolicy(StrictModel):
    version: str = "policy-1.0-hypothesis"
    max_toxicity: Unit = 0.20
    min_relevance: Unit = 0.50
    max_escalation: Unit = 0.25
    min_deescalation: Unit = 0.55


def score_candidate(candidate: Candidate, policy: SelectionPolicy, with_simulation: bool):
    assessment = candidate.assessment
    if assessment is None:
        raise ValueError("Cannot score a candidate without assessment")
    reasons = []
    if not assessment.safe:
        reasons.append("safety_rejected")
    if assessment.toxicity > policy.max_toxicity:
        reasons.append("toxicity_above_threshold")
    if assessment.relevance < policy.min_relevance:
        reasons.append("relevance_below_threshold")
    if not assessment.language_matches:
        reasons.append("language_or_script_mismatch")
    weighted = (
        0.15 * assessment.relevance
        + 0.15 * assessment.argument_strength
        + 0.15 * (1 - assessment.toxicity)
        + 0.10 * assessment.language_quality
    )
    if with_simulation:
        if candidate.simulation is None:
            raise ValueError("Simulation required by policy")
        probabilities = candidate.simulation.probabilities
        weighted += 0.45 * probabilities.deescalate
        if probabilities.escalate > policy.max_escalation:
            reasons.append("escalation_above_threshold")
        if probabilities.deescalate < policy.min_deescalation:
            reasons.append("deescalation_below_threshold")
    else:
        weighted /= 0.55
    candidate.score = round(weighted, 6)
    candidate.eligible = not reasons
    candidate.decision_reasons = reasons or ["all_required_gates_passed"]
    return candidate


def rank_candidates(candidates):
    # Stable generation order is the documented tie breaker. Ineligible never outranks eligible.
    return sorted(candidates, key=lambda c: (c.eligible, c.score or 0), reverse=True)
