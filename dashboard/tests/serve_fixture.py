"""TEST ONLY HTTP backend. Model responses are deterministic fixtures, never real inference."""

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend" / "tests"))

from conftest import FixtureProvider
from counterspeech.api import create_app
from counterspeech.config import Settings
from counterspeech.providers.base import ProviderError


class BrowserFixture(FixtureProvider):
    async def complete(self, stage, system, data, schema):
        text = data.get("current_text", "")
        if "TEST processing" in text:
            await asyncio.sleep(1)
        self.adverse_rounds = 10 if "TEST abstain" in text else 1
        if "TEST failed" in text and stage == "assessment":
            raise ProviderError("test_only_assessment_failure")
        return await super().complete(stage, system, data, schema)


app = create_app(
    Settings(
        database_url=os.environ["DATABASE_URL"],
        research_api_key=os.environ["RESEARCH_API_KEY"],
    ),
    BrowserFixture(),
)
