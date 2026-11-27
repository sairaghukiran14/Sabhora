"""Figures a shark is allowed to say, and checking the ones it says.

The first real run (26 Nov 2026) showed why this exists: five sharks repeated "₹4,812 a
month" for 18 shops at ₹299 (really ₹5,382), and called a four-month payback "decades".
Models read facts out of a pitch well and do arithmetic badly, so the model must show its
working in `maths` and this module does the sums.

A figure is allowed when it appears in the pitch, the ask or a founder's answer, or when it
equals one of the shark's own checked calculations. A calculation counts only if the numbers
inside it are established too (see `check_operands`): otherwise "4812000 * 1" would turn any
invented figure into a checked one. Only figures written with a rupee sign,
or worth 1000 or more, are checked, so counts ("40 shops") and percentages pass untouched.
"""
import ast
import itertools
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
        if ask.get("equity_pct"):
            allowed.add(float(ask["equity_pct"]))
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


# ---------- where the numbers inside the arithmetic come from ----------

# Numbers any sum may use without the record: small counts, calendar and unit conversions.
# They can't make up a figure alone, because a sum also needs a number from the record.
CONSTANTS = frozenset([*range(1, 13), 4.33, 24, 30, 52, 100, 365, 1e3, 1e5, 1e7])


def _same(a: float, b: float) -> bool:
    return abs(a - b) <= 1e-9 * max(1.0, abs(b))


def _operands(node: ast.AST):
    if isinstance(node, ast.Constant):
        yield float(node.value)
    for child in ast.iter_child_nodes(node):
        yield from _operands(child)


def _on_record(n: float, known: set[float]) -> bool:
    """`n` is a known figure as written, a known percentage as a fraction (64 -> 0.64), a
    known rupee total in thousands, lakh or crore (4000000 -> 40), or the exact sum or
    difference of two known figures (85 + 18 -> 103). Products and ratios are not accepted
    here: they have to be shown as their own maths line."""
    for k in known:
        if _same(n, k) or (0 < k <= 100 and _same(n, k / 100)):
            return True
        if any(k >= unit and _same(n, k / unit) for unit in (1e3, 1e5, 1e7)):
            return True
    return any(_same(n, a + b) or _same(n, abs(a - b))
               for a, b in itertools.combinations(known, 2))


def check_operands(expression: str, known: set[float]) -> None:
    """Raises ValueError if the sum uses a number nobody established, or none from the record."""
    from_record = False
    for n in _operands(ast.parse(expression.strip(), mode="eval")):
        if any(_same(n, c) for c in CONSTANTS):
            # a free number; it counts as the record's only if the record states it outright
            # (not as a sum: 6 + 6 must not turn "12 * 1000" into a sum about this pitch)
            from_record |= any(_same(n, k) for k in known)
        elif _on_record(n, known):
            from_record = True
        else:
            raise ValueError(
                f"your maths {expression!r} uses {n:.12g}, which is not in the pitch, the ask, "
                "the founder's answers or an earlier maths line. Build every sum from those "
                "figures (work out a middle step on its own line first), or leave the "
                "figure out. Your own assumption is not an established figure")
    if not from_record:
        raise ValueError(
            f"your maths {expression!r} uses no figure from the pitch, the ask or the "
            "founder's answers, so it establishes nothing")


def check_calcs(calcs, known: Iterable[float] | None = None) -> set[float]:
    """Recomputes what the model claims. Raises ValueError naming the first wrong sum.

    With `known` (every established figure) it also checks where each sum's numbers come
    from; a line may use the results of the lines before it."""
    verified = set()
    known = None if known is None else set(known)
    for calc in calcs:
        got = evaluate(calc.expression)
        if got is None:
            raise ValueError(
                f"maths expression {calc.expression!r} must be plain arithmetic using only "
                "digits and + - * / ( ), for example '18 * 299'")
        if known is not None:
            check_operands(calc.expression, known | verified | {round(v, 2) for v in verified})
        if abs(got - calc.value) > max(0.5, abs(got) * ARITHMETIC_TOLERANCE):
            raise ValueError(
                f"your arithmetic is wrong: {calc.expression} comes to {got:,.2f}, not "
                f"{calc.value:,.2f}. Correct the value, and any figure in your message "
                "that depended on it")
        verified.add(got)
        verified.add(float(round(got)))  # 180 * 0.64 = 115.2 is then spoken as "115"
    return verified


# ---------- one step of mental arithmetic ----------
# The second real web run (27 Nov 2026) dropped 5 of 15 shark turns for figures that were
# RIGHT: 180 x 3,200 = 5,76,000, 180 x 36 = 6,480, 115 x 36 = 4,140, 110 x 36 = 3,960. The
# sharks multiplied in their heads instead of using `maths`. A figure one step away from two
# established figures is now accepted, but only if it matches that step closely (see
# `precision`), so an invented total like 4,812 for 18 x 299 = 5,382 is still refused.

def derived(allowed: Iterable[float]) -> set[float]:
    """Every value one + - x / step (or "a percent of b") away from two established figures."""
    base = sorted({a for a in allowed if a})
    out: set[float] = set()
    for i, a in enumerate(base):
        for b in base[i:]:
            out.update((a * b, a + b, abs(a - b), a / b, b / a))
            if b <= 100:
                out.add(a * b / 100)
            if a <= 100:
                out.add(a * b / 100)
    return out


def precision(raw: str, value: float) -> float:
    """How far a stated figure may sit from the exact result: what its own rounding allows
    ("₹6,500" can stand for 6,480; "₹6,480" must be 6,480), but never more than 1%."""
    m = _MONEY.search(raw)
    digits = m.group("num").replace(",", "") if m else raw
    unit = UNITS.get((m.group("unit") or "").lower(), 1.0) if m else 1.0
    if "." in digits:
        step = 10 ** -len(digits.split(".")[1]) * unit
    else:
        step = 10 ** (len(digits) - len(digits.rstrip("0"))) * unit
    return max(0.5, min(step / 2, abs(value) * 0.01))


def check_message(message: str, allowed: Iterable[float]) -> None:
    """Raises ValueError if the message states a figure nobody established, directly or by
    one step of arithmetic on established figures."""
    allowed = list(allowed)
    one_step: set[float] | None = None  # built only when a figure needs it
    for mention in mentions(message):
        if not mention.checked or matches(mention.value, allowed):
            continue
        if one_step is None:
            one_step = derived(allowed)
        slack = precision(mention.raw, mention.value)
        if any(abs(mention.value - d) <= slack for d in one_step):
            continue
        raise ValueError(
            f"you said {mention.raw!r}, which is not in the pitch, the ask, the "
            "founder's answers or your own maths. Either show how you get it by adding "
            "the arithmetic to maths (for example 18 * 299), or leave the figure out. "
            "Never estimate a total in your head")


# ---------- per-meal results passed off as months ----------
# Same run: CAC ₹900 / ₹36 margin per meal = 25 MEALS (about five weeks at 22 meals a
# month). One shark called it "25 months", another "25 weeks" and told the founder his maths
# was wrong, and the judge repeated it. The arithmetic was right; the unit was not.

_UNITS_OF_SALE = r"(meal|order|unit|delivery|deliveries|box|lunch|dinner|plate|ride|trip|item|cup|visit)"
_PER_BEFORE = re.compile(  # "Rs 36 gross margin per meal"
    rf"(\d[\d,]*(?:\.\d+)?)[^\d\n]{{0,30}}?\bper {_UNITS_OF_SALE}(?:e?s)?\b", re.IGNORECASE)
_PER_AFTER = re.compile(  # "revenue per meal is Rs 145"
    rf"\bper {_UNITS_OF_SALE}(?:e?s)?\s*(?:is|=|:|of|comes to)?\s*(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)",
    re.IGNORECASE)
_DURATION = re.compile(
    r"(?<![\d.,])(\d+(?:\.\d+)?)\s*(months?|weeks?|days?|years?|mahine|mahina|hafte|hafta|saal)\b",
    re.IGNORECASE)


def per_unit_figures(texts: Iterable[str]) -> dict[float, str]:
    """Figures the record gives per meal / per order and so on: {36.0: 'meal'}."""
    out: dict[float, str] = {}
    for text in texts:
        for num, unit in _PER_BEFORE.findall(text):
            out[float(num.replace(",", ""))] = unit.lower()
        for unit, num in _PER_AFTER.findall(text):
            out[float(num.replace(",", ""))] = unit.lower()
    return {v: u for v, u in out.items() if v > 0}


def unit_mixup(message: str, record: Iterable[str]) -> str | None:
    """An error message if `message` gives a duration that is really a count of meals (or
    orders...): a rupee total divided by a per-meal figure, labelled months/weeks/days.
    Only rupee figures count as totals; a count (180 subscribers / 36 = 5) is a coincidence."""
    record = list(record)
    per = per_unit_figures(record)
    if not per:
        return None
    totals = {m.value for text in record for m in mentions(text)
              if m.checked and m.value and m.value not in per}  # ₹145 per meal is not a total
    for m in _DURATION.finditer(message):
        n, said = float(m.group(1)), m.group(2)
        for b, unit in per.items():
            for a in totals:
                # a well above b (a total over a per-meal figure, not two unit costs), and a
                # close match: "5 months" must not pass for 85 / 18 = 4.7
                if a >= 5 * b and abs(a / b - n) <= max(0.05, 0.02 * n):
                    return (f"{a:g} / {b:g} = {n:g} is a number of {unit}s, because {b:g} is "
                            f"per {unit}, not {n:g} {said}. Turn {unit}s into time only with "
                            f"how many {unit}s a customer buys in a month, and show it in maths")
    return None
