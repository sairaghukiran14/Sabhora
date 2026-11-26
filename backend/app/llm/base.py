"""The one interface every LLM provider implements, plus typed (JSON) completion."""
import json
import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol, TypeVar

from pydantic import BaseModel, ValidationError

from ..budget import TokenBudget
from .quality import copies_instructions, strings_in


@dataclass
class LLMResult:
    text: str
    input_tokens: int
    output_tokens: int

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens


class LLMError(Exception):
    """Any provider failure: network, HTTP error, refusal, or unusable output."""


class LLMClient(Protocol):
    """Like a TypeScript interface: any class with these members is an LLMClient."""
    name: str

    async def complete(
        self,
        system: str,
        user: str,
        *,
        max_tokens: int,
        output: type[BaseModel] | None = None,
    ) -> LLMResult: ...


def inline_refs(schema: dict) -> dict:
    """Pydantic puts nested models under $defs and points to them with $ref.
    Some providers handle $ref poorly, so we copy each definition in place."""
    defs = schema.get("$defs", {})

    def resolve(node: object) -> object:
        if isinstance(node, dict):
            if "$ref" in node:
                return resolve(defs[node["$ref"].split("/")[-1]])
            return {k: resolve(v) for k, v in node.items() if k != "$defs"}
        if isinstance(node, list):
            return [resolve(item) for item in node]
        return node

    return resolve(schema)  # type: ignore[return-value]


def extract_json(text: str) -> dict:
    """Pull the JSON object out of a model reply that may contain fences or thinking."""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("No JSON object in reply")
    return json.loads(text[start:end + 1])


T = TypeVar("T", bound=BaseModel)


async def complete_typed(
    client: LLMClient,
    system: str,
    user: str,
    output: type[T],
    *,
    budget: TokenBudget,
    max_tokens: int = 4000,
    check: Callable[[T], None] | None = None,
    attempts: int = 2,
) -> T:
    """Ask for JSON matching `output`, validate it, retry once with the error message.

    `check` adds a quality rule on top of the schema (e.g. "don't repeat the pitch back"):
    it raises ValueError to reject a reply, which triggers the same single retry.
    """
    prompt = user
    for attempt in range(attempts):
        budget.check()  # cost guard BEFORE spending
        result = await client.complete(system, prompt, max_tokens=max_tokens, output=output)
        budget.spend(result.total_tokens)
        try:
            value = output.model_validate(extract_json(result.text))
            # General rule for every reply: no text field may be lifted from the instructions.
            for text in strings_in(value.model_dump()):
                if copies_instructions(text, system):
                    raise ValueError("a field repeats the instructions instead of answering them")
            if check:
                check(value)
            return value
        except (ValueError, ValidationError) as err:
            if attempt == attempts - 1:
                raise LLMError(f"{client.name} returned invalid {output.__name__}: {err}") from err
            prompt = (f"{user}\n\nYour previous reply was invalid ({str(err)[:300]}). "
                      "Reply again with ONLY a JSON object matching the schema.")
    raise LLMError("unreachable")
