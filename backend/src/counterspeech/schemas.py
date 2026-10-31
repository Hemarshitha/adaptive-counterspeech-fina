"""Public data contracts. All model estimates remain explicitly uncalibrated."""

from enum import StrEnum
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StringConstraints, model_validator

Unit = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False, strict=True)]
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8000)]
Brief = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=600)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Language(StrEnum):
    ENGLISH = "english"
    HINDI = "hindi"
    MALAYALAM = "malayalam"
    HINGLISH = "hinglish"
    MINGLISH = "minglish"


class Script(StrEnum):
    AUTO = "auto"
    NATIVE = "native"
    ROMANIZED = "romanized"


class Mode(StrEnum):
    FULL = "full"
    NO_HISTORY = "no_history"
    NO_SIMULATION = "no_simulation"
    SINGLE_SHOT = "single_shot"


class Strategy(StrEnum):
    EMPATHY = "empathy"
    FACTS = "factual_correction"
    SHARED_VALUES = "shared_values"
    QUESTION = "reflective_question"
    DIRECT = "direct_response"


class ObservedTurn(StrictModel):
    speaker: Literal["original_speaker", "human_reply"]
    text: Text
    provenance: Literal["user_provided_observation"] = "user_provided_observation"


class ConversationCreate(StrictModel):
    title: Annotated[str, StringConstraints(strip_whitespace=True, max_length=150)] = ""


class RunRequest(StrictModel):
    text: Text
    conversation_id: UUID | None = None
    initial_context: list[ObservedTurn] = Field(default_factory=list, max_length=12)
    output_language: Language | None = None
    output_script: Script = Script.AUTO
    mode: Mode = Mode.FULL
    candidate_count: int = Field(default=3, ge=2, le=4)
    max_refinements: int = Field(default=1, ge=0, le=2)

    @model_validator(mode="after")
    def initial_context_only(self):
        if self.conversation_id and self.initial_context:
            raise ValueError("initial_context is only accepted for a new conversation")
        return self


class Analysis(StrictModel):
    detected_language: Literal["english", "hindi", "malayalam", "hinglish", "minglish", "ambiguous"]
    detected_script: Literal["latin", "devanagari", "malayalam", "mixed", "unknown"]
    suggested_output_language: Language
    target: Brief
    emotion: Brief
    hostility: Unit
    language_uncertainty: Brief
    context_summary: Brief


class Draft(StrictModel):
    strategy: Strategy
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class Generation(StrictModel):
    candidates: list[Draft] = Field(min_length=1, max_length=4)

    @model_validator(mode="after")
    def unique_candidates(self):
        if len({c.strategy for c in self.candidates}) != len(self.candidates):
            raise ValueError("strategies must be distinct")
        if len({c.text.casefold() for c in self.candidates}) != len(self.candidates):
            raise ValueError("candidate texts must be distinct")
        return self


class ReactionProbabilities(StrictModel):
    deescalate: Unit
    neutral: Unit
    escalate: Unit

    @model_validator(mode="after")
    def sums_to_one(self):
        if abs(self.deescalate + self.neutral + self.escalate - 1) > 1e-6:
            raise ValueError("reaction distribution must sum to one within 1e-6")
        return self


class Simulation(StrictModel):
    reaction_class: Literal["deescalate", "neutral", "escalate"]
    probabilities: ReactionProbabilities
    simulated_reply: Annotated[str, StringConstraints(max_length=2000)]
    decision_summary: Brief
    uncertainty: Brief

    @model_validator(mode="after")
    def class_matches_distribution(self):
        values = self.probabilities.model_dump()
        if values[self.reaction_class] < max(values.values()):
            raise ValueError("reaction_class must be a maximum-probability class")
        return self


class Assessment(StrictModel):
    safe: StrictBool
    toxicity: Unit
    relevance: Unit
    argument_strength: Unit
    language_quality: Unit
    language_matches: StrictBool
    decision_summary: Brief


class OutputScriptValidation(StrictModel):
    validator_version: Literal["unicode-script-1.0"] = "unicode-script-1.0"
    unicode_version: str
    requested_script: Script
    expected_script: Literal["latin", "devanagari", "malayalam", "undetermined"]
    valid: bool
    reasons: list[str]
    letter_counts: dict[str, int]
    disallowed_codepoints: list[str]


class Candidate(StrictModel):
    candidate_id: UUID
    round_index: int
    strategy: Strategy
    text: str
    # None identifies historical traces that predate the deterministic gate.
    script_validation: OutputScriptValidation | None = None
    simulation: Simulation | None = None
    assessment: Assessment | None = None
    score: Unit | None = None
    eligible: bool = False
    decision_reasons: list[str] = Field(default_factory=list)


class Round(StrictModel):
    index: int
    candidates: list[Candidate]
    ranking: list[UUID] = Field(default_factory=list)
    refinement_feedback: list[dict] = Field(default_factory=list)


class RunResult(StrictModel):
    schema_version: Literal["1.0"] = "1.0"
    mode: Mode
    analysis: Analysis | None
    output_language: Language | None
    output_script: Script
    rounds: list[Round]
    selected: Candidate | None
    outcome: Literal["completed", "abstained"]
    disclosure: str = (
        "Simulated reactions and assessment scores are uncalibrated model estimates, "
        "not observed human behavior or independently validated evaluation. Human review required."
    )


class TraceEvent(StrictModel):
    sequence: int
    stage: str
    payload: dict
    created_at: str


class RunView(StrictModel):
    run_id: UUID
    conversation_id: UUID
    status: Literal["running", "completed", "abstained", "failed"]
    request: dict
    result: RunResult | None
    error_code: str | None
    events: list[TraceEvent]
    created_at: str
    updated_at: str
