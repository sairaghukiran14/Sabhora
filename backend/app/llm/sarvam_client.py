"""Sarvam AI via its OpenAI-style chat completions endpoint (plain HTTP with httpx).

Endpoint, headers and json_schema follow the build guide; three things were changed after
testing against the live API (Nov 2026):
- reasoning_effort "none" is rejected (400); the API accepts low | medium | high.
- sarvam-105b is a reasoning model, so max_tokens needs headroom for hidden thinking.
- The key allows roughly 50-60 requests per minute. Every Sarvam call in the app shares one
  limiter, and a 429 waits and retries instead of failing the persona.
"""
import asyncio
import random
import time
from collections import deque

import httpx
from pydantic import BaseModel

from .base import LLMError, LLMResult, inline_refs

RETRYABLE = {429, 500, 502, 503, 504}
MAX_ATTEMPTS = 5

# Per-model API version and default thinking setting, from the Sarvam docs (Nov 2026).
# Sarvam's own models are on /v1; "Token Factory" models are on /v2. None = don't send
# reasoning_effort (Gemma 4 then doesn't think); "none" turns DeepSeek's thinking off.
# GLM 5.3 and GLM 5.3 Flash can't turn thinking off, so "low" is their minimum.
MODELS: dict[str, tuple[str, str | None]] = {
    "sarvam-105b": ("v1", "low"),
    "sarvam-105b-conversations": ("v1", "low"),
    "glm5.3": ("v2", "low"),
    "glm5.3-flash": ("v2", "low"),
    "gemma4": ("v2", None),
    "deepseekv4.1-flash-1017": ("v2", "none"),
    "deepseekv4.1-flash-1017-interactive": ("v2", "none"),
}


def endpoint_for(model: str, base_url: str) -> str:
    """https://api.sarvam.ai/v1 -> .../v2 for Token Factory models."""
    version = MODELS.get(model, ("v1", None))[0]
    root = base_url.rstrip("/").rsplit("/v", 1)[0]
    return f"{root}/{version}"


class MinuteLimiter:
    """At most `rpm` requests in any 60-second window, shared by every debate."""

    def __init__(self, rpm: int) -> None:
        self.rpm = rpm
        self._sent: deque[float] = deque()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:  # waiters queue up in order
            while True:
                now = time.monotonic()
                while self._sent and now - self._sent[0] >= 60:
                    self._sent.popleft()
                if len(self._sent) < self.rpm:
                    self._sent.append(now)
                    return
                await asyncio.sleep(60 - (now - self._sent[0]) + 0.05)


_limiters: dict[tuple[int, int], MinuteLimiter] = {}


def shared_limiter(rpm: int) -> MinuteLimiter:
    """One limiter per event loop (the server has one; tests may create several)."""
    key = (id(asyncio.get_running_loop()), rpm)
    if key not in _limiters:
        _limiters[key] = MinuteLimiter(rpm)
    return _limiters[key]


class SarvamClient:
    name = "sarvam"

    def __init__(self, api_key: str, model: str, base_url: str, timeout: float,
                 reasoning_effort: str | None = None, rpm: int = 50) -> None:
        if not api_key:
            raise LLMError("SARVAM_API_KEY is missing")
        self._key, self.model, self._timeout = api_key, model, timeout
        self._url = endpoint_for(model, base_url)
        # An explicit setting wins; otherwise the model's own default from MODELS.
        self.reasoning_effort = reasoning_effort or MODELS.get(model, ("v1", "low"))[1]
        self.rpm = rpm
        self.usage_in = self.usage_out = 0  # running totals, for cost reports

    async def complete(self, system, user, *, max_tokens, output: type[BaseModel] | None = None):
        body: dict = {
            "model": self.model,
            "messages": [{"role": "system", "content": system},
                         {"role": "user", "content": user}],
            # Hidden thinking counts toward max_tokens and occasionally kicks in even at
            # "low"; too small a limit cuts the answer off mid-JSON.
            "max_tokens": max(max_tokens, 1500),
            "temperature": 0.9,
        }
        if self.reasoning_effort:  # low keeps hidden "thinking" short: faster, cheaper turns
            body["reasoning_effort"] = self.reasoning_effort
        if output is not None:
            schema = inline_refs(output.model_json_schema())
            body["response_format"] = {"type": "json_schema",
                                       "json_schema": {"name": "response", "schema": schema}}
        headers = {"Authorization": f"Bearer {self._key}", "api-subscription-key": self._key}
        limiter = shared_limiter(self.rpm)

        last_error = "unknown"
        async with httpx.AsyncClient(timeout=self._timeout) as http:
            for attempt in range(MAX_ATTEMPTS):
                await limiter.acquire()
                wait = min(20.0, 1.5 * 2 ** attempt) + random.uniform(0, 1)  # back off + jitter
                try:
                    r = await http.post(f"{self._url}/chat/completions", json=body, headers=headers)
                except httpx.HTTPError as err:
                    last_error = repr(err)
                else:
                    if r.status_code < 400:
                        data = r.json()
                        text = data["choices"][0]["message"].get("content") or ""
                        usage = data.get("usage") or {}
                        self.usage_in += usage.get("prompt_tokens", 0)
                        self.usage_out += usage.get("completion_tokens", 0)
                        return LLMResult(text, usage.get("prompt_tokens", 0),
                                         usage.get("completion_tokens", 0))
                    last_error = f"HTTP {r.status_code}: {r.text[:200]}"
                    if r.status_code not in RETRYABLE:
                        break  # a 400 or 401 will not fix itself
                    retry_after = r.headers.get("retry-after", "")
                    if retry_after.replace(".", "", 1).isdigit():
                        wait = min(30.0, float(retry_after))
                if attempt < MAX_ATTEMPTS - 1:
                    await asyncio.sleep(wait)
        raise LLMError(f"sarvam: {last_error}")
