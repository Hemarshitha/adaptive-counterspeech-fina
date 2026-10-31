"""TEST ONLY: real API/storage, deterministic provider, no external inference."""

import os

from counterspeech.api import create_app
from counterspeech.config import Settings
from counterspeech.providers.base import ProviderError

from tests.serve_fixture import BrowserFixture


class ExtensionFixture(BrowserFixture):
    async def complete(self, stage, system, data, schema):
        if "TEST rate limit" in data.get("current_text", ""):
            raise ProviderError("provider_rate_limited")
        return await super().complete(stage, system, data, schema)


app = create_app(
    Settings(
        database_url=os.environ["DATABASE_URL"],
        research_api_key=os.environ["RESEARCH_API_KEY"],
    ),
    ExtensionFixture(),
)
