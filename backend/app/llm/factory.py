"""Builds the two LLM clients a debate needs, honouring BYOK (Bring Your Own Key)."""
from dataclasses import dataclass, field

from ..settings import Settings
from .anthropic_client import AnthropicClient
from .base import LLMClient
from .fake_client import FakeClient
from .sarvam_client import SarvamClient


@dataclass
class LLMs:
    crowd: LLMClient  # many cheap calls: sharks, crowd, roasters
    judge: LLMClient  # few calls that must be reliable: verdicts
    pool: list[LLMClient] = field(default_factory=list)  # Janta crowd models; empty = [crowd]

    def crowd_pool(self) -> list[LLMClient]:
        return self.pool or [self.crowd]


def model_label(client: LLMClient) -> str:
    """The model a client runs (e.g. 'glm5.3-flash'), for segments and tooltips."""
    return getattr(client, "model", None) or client.name


@dataclass
class UserKeys:
    """Keys a visitor sends in request headers. Used for one debate, never stored or logged."""
    anthropic: str | None = None
    sarvam: str | None = None

    @property
    def any(self) -> bool:
        return bool(self.anthropic or self.sarvam)


def _make(provider: str, s: Settings, keys: UserKeys) -> LLMClient:
    if provider == "sarvam":
        return SarvamClient(keys.sarvam or s.sarvam_api_key, s.sarvam_model,
                            s.sarvam_base_url, s.llm_timeout_s, s.sarvam_reasoning_effort,
                            s.sarvam_rpm)
    if provider == "anthropic":
        return AnthropicClient(keys.anthropic or s.anthropic_api_key, s.anthropic_model,
                               s.llm_timeout_s, s.anthropic_effort)
    return FakeClient(delay_s=s.fake_delay_s)


def build_llms(s: Settings, keys: UserKeys) -> LLMs:
    crowd, judge = s.llm_provider, s.judge_provider
    # A visitor with their own key gets real models even if the server runs on "fake"
    if keys.sarvam:
        crowd = "sarvam"
    if keys.anthropic:
        judge = "anthropic"
        if not keys.sarvam:
            crowd = "anthropic"
    pool: list[LLMClient] = []
    models = [m.strip() for m in s.janta_models.split(",") if m.strip()]
    if crowd == "sarvam" and len(models) > 1:
        # A mixed crowd: each person is played by one of these models (see debates/janta.py)
        pool = [SarvamClient(keys.sarvam or s.sarvam_api_key, m, s.sarvam_base_url,
                             s.llm_timeout_s, s.sarvam_reasoning_effort, s.sarvam_rpm)
                for m in models]
    return LLMs(crowd=_make(crowd, s, keys), judge=_make(judge, s, keys), pool=pool)
