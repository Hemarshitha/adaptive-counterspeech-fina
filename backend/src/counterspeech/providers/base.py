from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Protocol

from counterspeech.schemas import StrictModel

# Task-local so concurrent pipelines sharing one adapter cannot mix run traces.
_event_sink = ContextVar("provider_event_sink", default=None)


@contextmanager
def provider_event_sink(sink):
    token = _event_sink.set(sink)
    try:
        yield
    finally:
        _event_sink.reset(token)


def provider_event(kind, **payload):
    sink = _event_sink.get()
    if sink is not None:
        sink(kind, payload)


class ProviderError(Exception):
    """A safe error code; never include raw provider bodies or credentials."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class Completion:
    output: StrictModel
    metadata: dict


class Provider(Protocol):
    async def complete(
        self, stage: str, system: str, data: dict, schema: type[StrictModel]
    ) -> Completion: ...

    async def close(self) -> None: ...
