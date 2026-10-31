"""Deterministic TEST ONLY fixtures: never an offline production provider."""

import copy

import pytest
from fastapi.testclient import TestClient

from counterspeech.api import create_app
from counterspeech.config import Settings
from counterspeech.providers.base import Completion, ProviderError
from counterspeech.store import Store

ACCESS_KEY = "unit-test-access-token-at-least-24-characters"
HEADERS = {"X-API-Key": ACCESS_KEY}

# Authored contract examples, not research data or proof of multilingual model quality.
TEXTS = {
    "english": [
        "I understand your concern; blaming a whole group hurts people.",
        "One person's behavior does not establish a claim about everyone.",
        "Everyone deserves respect, even when we disagree.",
        "Could we discuss the specific concern without blaming a group?",
    ],
    "hindi": [
        "आपकी चिंता समझता हूँ, पर पूरे समुदाय को दोष देना उचित नहीं है।",
        "एक व्यक्ति का व्यवहार पूरे समुदाय का प्रतिनिधित्व नहीं करता।",
        "असहमति के बावजूद सभी सम्मान के हकदार हैं।",
        "क्या हम किसी समुदाय को दोष दिए बिना समस्या पर बात कर सकते हैं?",
    ],
    "malayalam": [
        "നിങ്ങളുടെ ആശങ്ക മനസ്സിലാകുന്നു, പക്ഷേ എല്ലാവരെയും കുറ്റപ്പെടുത്തുന്നത് ശരിയല്ല.",
        "ഒരാളുടെ പ്രവൃത്തി ഒരു സമൂഹത്തെ മുഴുവൻ പ്രതിനിധീകരിക്കുന്നില്ല.",
        "അഭിപ്രായവ്യത്യാസമുണ്ടെങ്കിലും എല്ലാവരും ബഹുമാനം അർഹിക്കുന്നു.",
        "ഒരു സമൂഹത്തെ കുറ്റപ്പെടുത്താതെ പ്രശ്നം ചർച്ച ചെയ്യാമോ?",
    ],
    "hinglish": [
        "Aapki concern samajh aati hai, par poore group ko blame karna sahi nahi.",
        "Ek insaan ka behavior poori community ko define nahi karta.",
        "Disagreement ho sakta hai, phir bhi sab respect deserve karte hain.",
        "Kya hum group ko blame kiye bina specific concern discuss kar sakte hain?",
    ],
    "minglish": [
        "Ningalude concern manassilaakunnu, paksha ellavareyum blame cheyyaruthu.",
        "Oraalude behavior oru communitye muzhuvan define cheyyunnilla.",
        "Disagreement undenkilum ellavarkkum respect venam.",
        "Oru communitye blame cheyyathe specific issue discuss cheyyaamo?",
    ],
}

# Script-specific authored fixtures. These fix previously misleading tests that
# returned native Hindi for a Romanized request (and Latin for native Hinglish).
ROMANIZED_TEXTS = {
    "hindi": [
        "Aapki chinta samajhta hoon, par poore samuday ko dosh dena uchit nahi hai.",
        "Ek vyakti ka vyavahar poore samuday ka pratinidhitva nahi karta.",
        "Asahmati ke bavjood sabhi samman ke haqdar hain.",
        "Kya hum samuday ko dosh diye bina samasya par baat kar sakte hain?",
    ],
    "malayalam": [
        "Ningalude aashanka manassilaakunnu, paksha ellavareyum kuttappedutharuthu.",
        "Oraalude pravruthi oru samoohathe muzhuvan prathinidheekarikkunnilla.",
        "Abhiprayavyathyasam undenkilum ellavarum bahumanam arhikkunnu.",
        "Oru samoohathe kuttappeduthaathe prashnam charcha cheyyaamo?",
    ],
}
NATIVE_MIXED_TEXTS = {
    "hinglish": [
        "आपकी concern समझता हूँ, पर पूरे group को blame करना सही नहीं है।",
        "एक व्यक्ति का behavior पूरी community को define नहीं करता।",
        "Disagreement के बावजूद सभी respect के हकदार हैं।",
        "क्या हम group को blame किए बिना issue पर बात कर सकते हैं?",
    ],
    "minglish": [
        "നിങ്ങളുടെ concern മനസ്സിലാകുന്നു, പക്ഷേ എല്ലാവരെയും blame ചെയ്യരുത്.",
        "ഒരാളുടെ behavior ഒരു communityയെ മുഴുവൻ define ചെയ്യുന്നില്ല.",
        "Disagreement ഉണ്ടെങ്കിലും എല്ലാവർക്കും respect വേണം.",
        "ഒരു communityയെ blame ചെയ്യാതെ issue ചർച്ച ചെയ്യാമോ?",
    ],
}


class FixtureProvider:
    def __init__(self, adverse_rounds=0, fail_stage=None, unsafe=False, language_matches=True):
        self.calls = []
        self.round_index = 0
        self.adverse_rounds = adverse_rounds
        self.fail_stage = fail_stage
        self.unsafe = unsafe
        self.language_matches = language_matches
        self.hostility = 0.8
        self.closed = False

    async def complete(self, stage, system, data, schema):
        self.calls.append((stage, system, copy.deepcopy(data)))
        if stage == self.fail_stage:
            raise ProviderError("fixture_provider_failed")
        language = data.get("output_language") or "english"
        if stage == "analysis":
            output = {
                "detected_language": language,
                "detected_script": "latin",
                "suggested_output_language": language,
                "target": "group named in input",
                "emotion": "anger",
                "hostility": self.hostility,
                "language_uncertainty": "Test fixture, not a real detection.",
                "context_summary": "Structured TEST fixture context.",
            }
        elif stage in {"generation", "baseline"}:
            self.round_index = data.get("round_index", 0)
            strategies = data.get("requested_strategies", ["direct_response"])
            texts = TEXTS[language]
            native = data.get("required_output_script") in {"devanagari", "malayalam"}
            if data.get("output_script") == "romanized" or (
                data.get("required_output_script") == "latin"
            ):
                texts = ROMANIZED_TEXTS.get(language, texts)
            if data.get("output_script") == "native" or native:
                texts = NATIVE_MIXED_TEXTS.get(language, texts)
            output = {
                "candidates": [
                    {"strategy": strategy, "text": texts[i] + f" ({self.round_index})"}
                    for i, strategy in enumerate(strategies)
                ]
            }
        elif stage == "simulation":
            adverse = self.round_index < self.adverse_rounds
            # Make candidates receive different outputs, rather than only checking call count.
            deescalate = (
                0.1 if adverse else (0.8 if data["candidate"]["strategy"] == "empathy" else 0.7)
            )
            escalate = 0.8 if adverse else 0.1
            output = {
                "reaction_class": "escalate" if adverse else "deescalate",
                "probabilities": {
                    "deescalate": deescalate,
                    "neutral": round(1 - deescalate - escalate, 6),
                    "escalate": escalate,
                },
                "simulated_reply": "TEST-ONLY imagined reply, never observed.",
                "decision_summary": "Deterministic fixture for orchestration tests.",
                "uncertainty": "Not a real prediction.",
            }
        elif stage == "assessment":
            output = {
                "safe": not self.unsafe,
                "toxicity": 0.95 if self.unsafe else 0.05,
                "relevance": 0.9,
                "argument_strength": 0.8,
                "language_quality": 0.9,
                "language_matches": self.language_matches,
                "decision_summary": "Test-only assessment, not a validated metric.",
            }
        else:
            raise AssertionError(f"Unexpected stage {stage}")
        return Completion(
            output=schema.model_validate(output),
            metadata={
                "provider": "TEST_FIXTURE",
                "provenance": "deterministic_test_fixture",
                "input_tokens": None,
                "output_tokens": None,
                "cost": None,
            },
        )

    async def close(self):
        self.closed = True


@pytest.fixture
def settings(tmp_path):
    return Settings(database_url=f"sqlite:///{tmp_path}/test.db", research_api_key=ACCESS_KEY)


@pytest.fixture
def store(settings):
    result = Store(settings.database_url)
    result.initialize()
    yield result
    result.close()


@pytest.fixture
def provider():
    return FixtureProvider()


@pytest.fixture
def client(settings, provider):
    with TestClient(create_app(settings, provider)) as result:
        yield result
