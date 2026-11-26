"""Figures a shark is allowed to say, and checking the ones it says.

The first real run (26 Nov 2026) showed why this exists: five sharks repeated "₹4,812 a
month" for 18 shops at ₹299 (really ₹5,382), and called a four-month payback "decades".
Models read facts out of a pitch well and do arithmetic badly, so the model must show its
working in `maths` and this module does the sums.

A figure is allowed when it appears in the pitch, the ask or a founder's answer, or when it
equals one of the shark's own checked calculations. Only figures written with a rupee sign,
or worth 1000 or more, are checked, so counts ("40 shops") and percentages pass untouched.
"""
import ast
import operator
import re
from collections.abc import Iterable
from dataclasses import dataclass

# Indian money words. "k" and "cr" need the word boundary below or they match inside words.
UNITS = {"k": 1e3, "thousand": 1e3, "lakh": 1e5, "lakhs": 1e5, "lac": 1e5, "lacs": 1e5,
         "crore": 1e7, "crores": 1e7, "cr": 1e7, "million": 1e6, "mn": 1e6}

_MONEY = re.compile(
    r"(?P<sign>₹|rs\.?|inr)?\s*"
    r"(?<![\w.\-])(?P<num>\d[\d,]*(?:\.\d+)?)"            # 4,812 and 1,20,000 both work
    r"\s*(?P<unit>lakhs?|lacs?|crores?|cr|k|thousand|million|mn)?\b",
    re.IGNORECASE)
_PERCENT = re.compile(r"\s*(%|per\s?cent\b|pct\b)", re.IGNORECASE)

CHECK_FROM = 1000.0   # below this a bare number is a count, not a claim about money
TOLERANCE = 0.02      # "about ₹5,400" may stand for 5,382
ARITHMETIC_TOLERANCE = 0.005


@dataclass(frozen=True)
class Mention:
    raw: str
    value: float      # in rupees
    checked: bool     # whether this one has to be justified


def mentions(text: str) -> list[Mention]:
    """Every number in `text`, with the rupee value it stands for."""
    found = []
    for m in _MONEY.finditer(text):
        try:
            number = float(m.group("num").replace(",", ""))
        except ValueError:  # pragma: no cover - the pattern already guarantees digits
            continue
        unit = (m.group("unit") or "").lower()
        value = number * UNITS.get(unit, 1.0)
        is_percent = bool(_PERCENT.match(text[m.end():]))
        has_sign = bool(m.group("sign"))
        found.append(Mention(m.group(0).strip(), value,
                             not is_percent and (has_sign or value >= CHECK_FROM)))
    return found


def values_in(texts: Iterable[str]) -> set[float]:
    """Every rupee value stated in these texts, whatever its size."""
    return {m.value for text in texts for m in mentions(text)}


def established(pitch: str, founder_answers: Iterable[str], ask: dict | None) -> set[float]:
    """What the founder has put on the record, in rupees."""
    allowed = values_in([pitch, *founder_answers])
    if ask:
        for key in ("investment_lakh", "valuation_lakh"):
            if ask.get(key):
                allowed.add(ask[key] * 1e5)
    return allowed


def matches(value: float, allowed: Iterable[float], tolerance: float = TOLERANCE) -> bool:
    return any(abs(value - a) <= max(1.0, abs(a) * tolerance) for a in allowed)


# ---------- arithmetic the model shows ----------

_OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
        ast.Div: operator.truediv, ast.USub: operator.neg, ast.UAdd: operator.pos}


def _walk(node: ast.AST) -> float:
    if isinstance(node, ast.Constant) and isinstance(node.value, int | float):
        return float(node.value)
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_walk(node.left), _walk(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_walk(node.operand))
    raise ValueError("not plain arithmetic")


def evaluate(expression: str) -> float | None:
    """The value of a plain arithmetic string, or None if it isn't one.

    Parsed, never executed: only numbers and + - * / survive, so powers (which could hang
    the server) and anything with a name in it are refused.
    """
    expression = expression.strip()
    if not expression or len(expression) > 80:
        return None
    try:
        return float(_walk(ast.parse(expression, mode="eval").body))
    except (SyntaxError, ValueError, TypeError, ZeroDivisionError, OverflowError,
            RecursionError, MemoryError):
        return None


def rupees(value: float) -> str:
    return f"₹{value:,.0f}"


def check_calcs(calcs) -> set[float]:
    """Recomputes what the model claims. Raises ValueError naming the first wrong sum."""
    verified = set()
    for calc in calcs:
        got = evaluate(calc.expression)
        if got is None:
            raise ValueError(
                f"maths expression {calc.expression!r} must be plain arithmetic using only "
                "digits and + - * / ( ), for example '18 * 299'")
        if abs(got - calc.value) > max(0.5, abs(got) * ARITHMETIC_TOLERANCE):
            raise ValueError(
                f"your arithmetic is wrong: {calc.expression} comes to {got:,.2f}, not "
                f"{calc.value:,.2f}. Correct the value, and any figure in your message "
                "that depended on it")
        verified.add(got)
    return verified


def check_message(message: str, allowed: Iterable[float]) -> None:
    """Raises ValueError if the message states a figure nobody established."""
    allowed = list(allowed)
    for mention in mentions(message):
        if mention.checked and not matches(mention.value, allowed):
            raise ValueError(
                f"you said {mention.raw!r}, which is not in the pitch, the ask, the "
                "founder's answers or your own maths. Either show how you get it by adding "
                "the arithmetic to maths (for example 18 * 299), or leave the figure out. "
                "Never estimate a total in your head")
