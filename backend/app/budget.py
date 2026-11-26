"""Cost control. Two layers:

1. TokenBudget: a hard cap per debate. Checked BEFORE every LLM call.
2. DailyBudget: a cap for the whole server per day, to protect your own credits.
"""
from datetime import UTC, datetime


class BudgetExceeded(Exception):
    """Raised when a debate has used its token allowance."""


class TokenBudget:
    def __init__(self, limit: int) -> None:
        self.limit = limit
        self.used = 0

    @property
    def remaining(self) -> int:
        return max(0, self.limit - self.used)

    @property
    def exhausted(self) -> bool:
        return self.used >= self.limit

    def check(self) -> None:
        if self.exhausted:
            raise BudgetExceeded(f"Token budget of {self.limit} used up")

    def spend(self, tokens: int) -> None:
        self.used += tokens


class DailyBudget:
    """Server-wide tokens per UTC day. In memory: resets on restart (fine for one server)."""

    def __init__(self, limit: int) -> None:
        self.limit = limit
        self._day = self._today()
        self.used = 0

    @staticmethod
    def _today() -> str:
        return datetime.now(UTC).date().isoformat()

    def _roll(self) -> None:
        if self._day != self._today():  # a new day: reset the counter
            self._day, self.used = self._today(), 0

    def available(self) -> bool:
        self._roll()
        return self.used < self.limit

    def add(self, tokens: int) -> None:
        self._roll()
        self.used += tokens
