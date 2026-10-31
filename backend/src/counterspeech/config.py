import os

from pydantic import ConfigDict, Field, SecretStr, field_validator

from counterspeech.schemas import StrictModel


class Settings(StrictModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True, allow_inf_nan=False)
    database_url: str = Field(default="sqlite:///./research.db", repr=False)
    research_api_key: SecretStr | None = None
    llm_api_key: SecretStr | None = None
    llm_base_url: str | None = None
    llm_model: str | None = None
    allowed_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])
    provider_timeout_seconds: float = Field(default=45, gt=0, le=120)
    provider_retries: int = Field(default=2, ge=0, le=3)
    # Opt in explicitly: other OpenAI-compatible providers retain their own behavior.
    provider_groq_pacing: bool = False
    provider_call_deadline_seconds: float = Field(default=300, gt=0, le=3600)
    groq_min_request_interval_seconds: float = Field(default=2.1, gt=0, le=60)
    groq_missing_headers_wait_seconds: float = Field(default=60, gt=0, le=3600)
    groq_max_wait_seconds: float = Field(default=120, gt=0, le=3600)
    max_history_turns: int = Field(default=16, ge=1, le=40)
    max_history_chars: int = Field(default=24000, ge=8000, le=100000)
    max_concurrent_runs: int = Field(default=2, ge=1, le=16)
    max_run_seconds: float = Field(default=600, gt=0, le=1800)
    initialize_database: bool = True

    @field_validator("research_api_key")
    @classmethod
    def strong_access_key(cls, value):
        if value is not None and len(value.get_secret_value()) < 24:
            raise ValueError("RESEARCH_API_KEY must contain at least 24 characters")
        return value

    @field_validator("llm_base_url")
    @classmethod
    def valid_base_url(cls, value):
        if value:
            from urllib.parse import urlparse

            parsed = urlparse(value)
            if parsed.username or parsed.password or parsed.query or parsed.fragment:
                raise ValueError("LLM_BASE_URL must not contain credentials, query or fragment")
            if parsed.scheme != "https" and not (
                parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}
            ):
                raise ValueError("Use HTTPS or an explicit local HTTP inference endpoint")
        return value

    @property
    def provider_configured(self):
        return bool(self.llm_api_key and self.llm_base_url and self.llm_model)

    @classmethod
    def from_environment(cls):
        values = {}
        for field in cls.model_fields:
            raw = os.getenv(field.upper())
            if raw is not None:
                if field == "allowed_origins":
                    values[field] = [origin.strip() for origin in raw.split(",") if origin.strip()]
                else:
                    values[field] = raw
        return cls.model_validate(values)
