from dataclasses import dataclass
from typing import Protocol

from counterspeech.schemas import StrictModel


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
