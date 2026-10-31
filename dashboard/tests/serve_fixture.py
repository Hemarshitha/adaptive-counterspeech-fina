"""TEST ONLY HTTP backend. Model responses are deterministic fixtures, never real inference."""

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend" / "tests"))

from conftest import FixtureProvider
from counterspeech.api import create_app
from counterspeech.config import Settings
from counterspeech.providers.base import Completion, ProviderError
from counterspeech.schemas import Generation


class BrowserFixture(FixtureProvider):
    async def complete(self, stage, system, data, schema):
        text = data.get("current_text", "")
        if "TEST processing" in text:
            await asyncio.sleep(1)
        self.adverse_rounds = 10 if "TEST abstain" in text else 1
        if "TEST failed" in text and stage == "assessment":
            raise ProviderError("test_only_assessment_failure")
        result = await super().complete(stage, system, data, schema)
        if stage == "generation" and "TEST wrong script" in text:
            # Deliberately broken TEST provider. No production fallback or repair.
            candidates = [
                {
                    "strategy": c.strategy,
                    "text": f"Yeh सही nahi hai {i} ({data['round_index']})",
                }
                for i, c in enumerate(result.output.candidates)
            ]
            return Completion(
                output=Generation(candidates=candidates), metadata=result.metadata
            )
        return result


app = create_app(
    Settings(
        database_url=os.environ["DATABASE_URL"],
        research_api_key=os.environ["RESEARCH_API_KEY"],
    ),
    BrowserFixture(),
)
