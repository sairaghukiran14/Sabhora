"""Claude via the official SDK.

Typed output uses structured outputs: `output_config.format` with the model's JSON schema,
run through the SDK's `transform_schema` (which turns constraints the API doesn't enforce,
like minLength, into description hints). We return the JSON text and let complete_typed()
validate it, run the quality checks and retry, exactly like every other provider.

Not `messages.parse()`: it validates inside the SDK, so a reply that breaks a constraint
would raise outside our retry loop. And not the guide's forced tool call + `temperature`:
current Claude models reject both.
"""
from pydantic import BaseModel

from .base import LLMError, LLMResult


class AnthropicClient:
    name = "anthropic"

    def __init__(self, api_key: str, model: str, timeout: float, effort: str = "low") -> None:
        if not api_key:
            raise LLMError("ANTHROPIC_API_KEY is missing")
        from anthropic import AsyncAnthropic  # imported here so tests never need the SDK

        self._client = AsyncAnthropic(api_key=api_key, timeout=timeout, max_retries=2)
        self.model = model
        self.effort = effort

    async def complete(self, system, user, *, max_tokens, output: type[BaseModel] | None = None):
        import anthropic

        output_config: dict = {"effort": self.effort}
        if output is not None:
            output_config["format"] = {"type": "json_schema",
                                       "schema": anthropic.transform_schema(output)}
        try:
            resp = await self._client.messages.create(
                model=self.model,
                system=system,
                # Thinking tokens count toward max_tokens, so leave generous headroom.
                max_tokens=max(max_tokens, 4000),
                output_config=output_config,
                messages=[{"role": "user", "content": user}],
            )
        except anthropic.AuthenticationError as err:
            raise LLMError("anthropic: the API key was rejected (check ANTHROPIC_API_KEY)") from err
        except anthropic.RateLimitError as err:
            raise LLMError("anthropic: rate limited, try again shortly") from err
        except anthropic.APIStatusError as err:
            raise LLMError(f"anthropic: HTTP {err.status_code}: {err.message}") from err
        except anthropic.APIConnectionError as err:
            raise LLMError("anthropic: could not reach the API") from err

        if resp.stop_reason == "refusal":
            raise LLMError("anthropic: the model declined this request")
        if resp.stop_reason == "max_tokens":
            raise LLMError("anthropic: the reply was cut off at max_tokens")
        text = "".join(b.text for b in resp.content if b.type == "text")
        return LLMResult(text, resp.usage.input_tokens, resp.usage.output_tokens)
