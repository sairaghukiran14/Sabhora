"""All configuration in one typed object, read from environment variables and .env."""
from functools import lru_cache
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Provider = Literal["fake", "sarvam", "anthropic"]
Effort = Literal["low", "medium", "high"]


class Settings(BaseSettings):
    # Read .env if present; ignore unknown variables instead of crashing
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: Literal["dev", "test", "prod"] = "dev"
    log_level: str = "INFO"

    # --- LLM providers ---
    llm_provider: Provider = "fake"  # plays sharks, crowd and roasters (many calls)
    judge_provider: Provider = "fake"  # writes the final verdicts (few calls, must be reliable)
    sarvam_api_key: str = ""
    sarvam_model: str = "sarvam-105b"
    sarvam_base_url: str = "https://api.sarvam.ai/v1"
    # Thinking depth. Empty = the model's own default (see llm/sarvam_client.py MODELS):
    # low for Sarvam and GLM, off for Gemma 4 and DeepSeek V4.1 Flash.
    sarvam_reasoning_effort: Literal["none", "low", "high", "max"] | None = None
    sarvam_rpm: int = 50  # requests per minute across ALL debates (key limit measured ~50-60)
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-haiku-5-5"
    anthropic_effort: Effort = "low"  # thinking depth; low keeps persona turns fast and cheap
    llm_timeout_s: float = 60.0
    fake_delay_s: float = 0.4  # makes the fake provider feel "live"

    # --- Cost caps (tokens) ---
    max_tokens_per_debate: int = 60_000
    judge_reserve_tokens: int = 30_000  # held back so a verdict can always be written
    deal_reserve_tokens: int = 25_000  # Sharks only: separate cap for offers and counters
    daily_token_limit: int = 600_000  # protects YOUR credits; BYOK runs skip it

    # --- Debate shape ---
    shark_rounds: int = 3
    founder_wait_s: float = 45
    deal_wait_s: float = 90  # time to accept, counter or walk away
    janta_size: int = 50
    janta_max_size: int = 100
    janta_batch_size: int = 3  # people per call; see debates/janta.py for the measurements
    # Comma-separated Sarvam models for a MIXED Janta crowd, e.g.
    # "sarvam-105b-conversations,glm5.3-flash". Empty or one model = everyone on SARVAM_MODEL.
    janta_models: str = ""
    janta_tokens_per_person: int = 1500  # per round; caps a 50-person, 2-round run at 150k
    janta_parallel: int = 6
    janta_rounds: int = 2
    janta_pace_s: float = 0.08  # delay between crowd messages, for the live feel
    roast_parallel: int = 3

    # --- Infrastructure ---
    # Shared secret with the web app. When set, every /api/debates route requires it, so
    # only our own server can start runs (and spend AI credits). Required in prod.
    internal_api_token: str = ""
    # Postgres address for saved debates. Empty = JSON files under data_dir.
    database_url: str = ""
    data_dir: str = "./data"
    cors_origins: list[str] = ["http://localhost:8000", "http://127.0.0.1:8000"]
    rate_limit_per_hour: int = 30
    chat_rate_per_hour: int = 120  # follow-up chat messages per visitor per hour
    chat_tokens_per_message: int = 12_000  # cap per chat reply, retries included
    max_active_debates: int = 20
    session_ttl_s: int = 1800

    @model_validator(mode="after")
    def _prod_needs_token(self) -> "Settings":
        if self.env == "prod" and len(self.internal_api_token) < 32:
            raise ValueError("Set INTERNAL_API_TOKEN (32+ characters) when ENV=prod")
        return self

    @field_validator("janta_size")
    @classmethod
    def _positive(cls, v: int) -> int:
        if v < 5:
            raise ValueError("janta_size must be at least 5")
        return v


@lru_cache
def get_settings() -> Settings:
    """One shared Settings object (created on first use)."""
    return Settings()
