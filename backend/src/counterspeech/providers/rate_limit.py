"""Opt-in Groq pacing. State is shared by one adapter, never by user/run data.

Groq's token headers describe TPM; request headers describe RPD, not RPM.
The configured minimum interval covers RPM. Headers are hints, not quota grants.
"""

import asyncio
import math
import re
import time
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime

from counterspeech.providers.base import ProviderError, provider_event

_DURATION = re.compile(r"(\d+(?:\.\d+)?)(ms|s|m|h|d)")
_UNITS = {"ms": 0.001, "s": 1, "m": 60, "h": 3600, "d": 86400}


def duration(value):
    """Groq compound durations (e.g. 1m2.5s), or numeric seconds."""
    if not isinstance(value, str) or len(value) > 128:
        return None
    value = value.strip()
    if re.fullmatch(r"\d+(?:\.\d+)?", value):
        seconds = float(value)
    else:
        parts = list(_DURATION.finditer(value))
        if not parts or "".join(p.group() for p in parts) != value:
            return None
        seconds = sum(float(p[1]) * _UNITS[p[2]] for p in parts)
    return seconds if math.isfinite(seconds) and seconds >= 0 else None


def retry_after(value, *, now=None):
    if not isinstance(value, str) or len(value) > 128:
        return None
    # Retry-After uses seconds or an HTTP date, not the Groq duration format.
    if re.fullmatch(r"\d+(?:\.\d+)?", value.strip()):
        return duration(value)
    try:
        date = parsedate_to_datetime(value)
        if date.tzinfo is None:
            return None
        seconds = (date - (now if now is not None else datetime.now(UTC))).total_seconds()
        return seconds if math.isfinite(seconds) and seconds >= 0 else None
    except (ValueError, TypeError, OverflowError):
        return None


def count(value):
    if isinstance(value, str) and re.fullmatch(r"\d{1,16}", value.strip()):
        return int(value)
    return None


def daily_exhausted(response):
    # Inspect only for classification; never log or persist the body/message.
    if count(response.headers.get("x-ratelimit-remaining-requests")) == 0:
        return True
    if len(response.content) > 1_000_000:
        return False
    try:
        error = response.json().get("error", {})
        code = error.get("code")
        message = str(error.get("message", "")).lower()
        return code in {
            "insufficient_quota",
            "daily_limit_exceeded",
            "daily_quota_exceeded",
        } or bool(
            re.search(
                r"\b(tpd|rpd)\b|tokens per day|requests per day|daily.*(quota|limit)", message
            )
        )
    except (ValueError, AttributeError, TypeError):
        return False


class GroqPacer:
    def __init__(self, settings, *, clock=time.monotonic, sleep=asyncio.sleep):
        self.settings = settings
        self.clock = clock
        self.sleep = sleep
        self.lock = asyncio.Lock()
        self.next_request = 0.0
        self.fallback_until = 0.0
        self.cooldown_until = 0.0
        self.daily_until = 0.0
        self.remaining_tokens = None
        self.token_reset = 0.0

    async def wait(self, estimated_tokens):
        now = self.clock()
        if self.daily_until > now:
            provider_event("provider_quota_exhausted", reason="daily_quota")
            raise ProviderError("provider_daily_quota_exhausted")
        targets = [
            (self.next_request, "request_spacing"),
            (self.fallback_until, "missing_or_invalid_headers"),
            (self.cooldown_until, "rate_limit_cooldown"),
        ]
        if (
            self.remaining_tokens is not None
            and self.remaining_tokens < estimated_tokens
            and self.token_reset > now
        ):
            targets.append((self.token_reset, "token_budget"))
        target, reason = max(targets)
        seconds = max(0.0, target - now)
        if seconds:
            provider_event(
                "provider_wait_exhausted"
                if seconds > self.settings.groq_max_wait_seconds
                else "provider_wait",
                reason=reason,
                wait_seconds=round(seconds, 3),
                remaining_tokens=self.remaining_tokens,
            )
            if seconds > self.settings.groq_max_wait_seconds:
                raise ProviderError("provider_rate_limit_wait_exhausted")
            await self.sleep(seconds)
        now = self.clock()
        self.next_request = now + self.settings.groq_min_request_interval_seconds
        # If the request is cancelled or loses its response, its quota use is unknown.
        self.fallback_until = now + self.settings.groq_missing_headers_wait_seconds

    def observe(self, response):
        now = self.clock()
        headers = response.headers
        self.remaining_tokens = count(headers.get("x-ratelimit-remaining-tokens"))
        reset = duration(headers.get("x-ratelimit-reset-tokens"))
        self.token_reset = now + reset if reset is not None else 0.0
        if self.remaining_tokens is not None and reset is not None and reset > 0:
            self.fallback_until = 0.0
        else:
            self.fallback_until = now + self.settings.groq_missing_headers_wait_seconds
        request_reset = duration(headers.get("x-ratelimit-reset-requests"))
        if count(headers.get("x-ratelimit-remaining-requests")) == 0:
            self.daily_until = now + (request_reset or 86400)
        if response.status_code != 429:
            return
        if daily_exhausted(response):
            self.daily_until = max(self.daily_until, now + (request_reset or 86400))
            provider_event("provider_quota_exhausted", reason="daily_quota")
            raise ProviderError("provider_daily_quota_exhausted")
        after = retry_after(headers.get("retry-after"))
        # On 429, a valid token reset is also a lower bound. Never retry early
        # by clipping a provider's wait; fail if the wait cannot fit our budgets.
        delay = max(after or 0, reset or 0)
        if delay <= 0:
            delay = self.settings.groq_missing_headers_wait_seconds
        self.cooldown_until = max(self.cooldown_until, now + delay)
