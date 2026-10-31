import asyncio
import hashlib
import json
import time

import httpx
from pydantic import ValidationError

from counterspeech.config import Settings
from counterspeech.providers.base import Completion, ProviderError
from counterspeech.schemas import StrictModel


class OpenAICompatibleProvider:
    """JSON-mode adapter, validated locally against strict per-stage schemas."""

    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        if not settings.provider_configured:
            raise ValueError("Live provider is not configured")
        self.settings = settings
        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(settings.provider_timeout_seconds),
            transport=transport,
            follow_redirects=False,
        )

    async def complete(self, stage, system, data, schema: type[StrictModel]):
        schema_json = json.dumps(schema.model_json_schema(), ensure_ascii=False)
        trusted_system = f"{system}\nReturn only a JSON object matching this schema:\n{schema_json}"
        untrusted_data = json.dumps(data, ensure_ascii=False, allow_nan=False)
        body = {
            "model": self.settings.llm_model,
            "temperature": 0,
            "max_tokens": 3000,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": trusted_system},
                {"role": "user", "content": untrusted_data},
            ],
        }
        started = time.monotonic()
        attempts = 0
        for attempt in range(self.settings.provider_retries + 1):
            attempts += 1
            try:
                response = await self.client.post(
                    self.settings.llm_base_url.rstrip("/") + "/chat/completions",
                    headers={
                        "Authorization": "Bearer " + self.settings.llm_api_key.get_secret_value()
                    },
                    json=body,
                )
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                if attempt < self.settings.provider_retries:
                    await asyncio.sleep(min(0.25 * 2**attempt, 2))
                    continue
                raise ProviderError("provider_unavailable") from exc
            if response.status_code in {408, 429, 500, 502, 503, 504}:
                if attempt < self.settings.provider_retries:
                    # Never honor unbounded external Retry-After values.
                    await asyncio.sleep(min(0.25 * 2**attempt, 2))
                    continue
                raise ProviderError(
                    "provider_rate_limited"
                    if response.status_code == 429
                    else "provider_unavailable"
                )
            if response.status_code != 200:
                raise ProviderError("provider_request_rejected")
            if len(response.content) > 1_000_000:
                raise ProviderError("provider_response_too_large")
            try:
                envelope = response.json()
                choice = envelope["choices"][0]
                message = choice["message"]
                if message.get("refusal") or choice.get("finish_reason") != "stop":
                    raise ProviderError("provider_refused_or_truncated")
                content = message["content"]
                # Reject duplicate keys and nonstandard JSON constants, not just schema errors.
                payload = json.loads(
                    content, object_pairs_hook=_unique_keys, parse_constant=_invalid_constant
                )
                output = schema.model_validate(payload)
                usage = envelope.get("usage") or {}
                metadata = {
                    "provider": "openai_compatible",
                    "requested_model": self.settings.llm_model,
                    "reported_model": str(envelope.get("model", "unspecified"))[:200],
                    "latency_ms": round((time.monotonic() - started) * 1000, 2),
                    "attempts": attempts,
                    "input_tokens": _token_count(usage.get("prompt_tokens")),
                    "output_tokens": _token_count(usage.get("completion_tokens")),
                    "cost": None,
                    "temperature": 0,
                    "max_tokens": 3000,
                    "prompt_sha256": hashlib.sha256(trusted_system.encode()).hexdigest(),
                    "data_sha256": hashlib.sha256(untrusted_data.encode()).hexdigest(),
                    "provenance": "live_provider_response",
                }
            except ProviderError:
                raise
            except (ValueError, ValidationError, TypeError, KeyError, IndexError) as exc:
                raise ProviderError("provider_invalid_output") from exc
            return Completion(output=output, metadata=metadata)
        raise ProviderError("provider_unavailable")

    async def close(self):
        await self.client.aclose()


def _unique_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key")
        result[key] = value
    return result


def _invalid_constant(value):
    raise ValueError("Invalid JSON constant")


def _token_count(value):
    return value if type(value) is int and value >= 0 else None
