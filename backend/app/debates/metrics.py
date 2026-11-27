"""Standard investor figures, worked out in code from the founder's own numbers.

Why: the figure check (numbers.py) proves a shark's arithmetic is right, not that the
formula means anything. On the fourth real run (27 Nov 2026) a shark divided the ₹900 CAC by
"15 new subscribers a month" and called it a 60-month payback. The arithmetic was right, the
formula was nonsense, two sharks and the judge repeated it, and the panel walked out over
it. Three sharks had worked out the real payback (about 1.1 months) the round before.

So once the record holds what a payback needs (a CAC and a monthly margin per customer),
this module works it out, the sharks and the judge see it under ESTABLISHED FACTS, and any
payback figure they state must agree with it.
"""
import re
from collections.abc import Iterable
from dataclasses import dataclass

_NUM = r"(\d[\d,]*(?:\.\d+)?)"
_RS = r"(?:₹|rs\.?|inr)?\s*"
# Words that mean the same unit of sale ("Rs 36 margin per meal" + "22 lunches a month").
_UNITS = {
    "meal": ("meal", "meals", "lunch", "lunches", "dinner", "dinners", "tiffin", "tiffins", "box", "boxes", "plate", "plates"),
    "order": ("order", "orders", "delivery", "deliveries"),
    "unit": ("unit", "units", "item", "items", "piece", "pieces"),
    "ride": ("ride", "rides", "trip", "trips"),
    "visit": ("visit", "visits", "session", "sessions", "class", "classes"),
}
_UNIT_OF = {word: unit for unit, words in _UNITS.items() for word in words}
_UNIT_WORDS = "|".join(sorted(_UNIT_OF, key=len, reverse=True))

_CAC = re.compile(
    rf"\b(?:CAC|customer acquisition cost|cost to acquire (?:a|each|one) (?:customer|subscriber|user))"
    rf"\b[^\d₹\n]{{0,25}}{_RS}{_NUM}", re.IGNORECASE)
_MARGIN_PER_UNIT = (
    re.compile(rf"{_RS}{_NUM}\s*(?:gross\s+|contribution\s+)?margin\s+(?:per|a|an|each)\s+({_UNIT_WORDS})\b",
               re.IGNORECASE),
    re.compile(rf"\b(?:gross\s+|contribution\s+)?margin\s+(?:per|a|on each)\s+({_UNIT_WORDS})\s*"
               rf"(?:is|of|=|:|comes to)?\s*{_RS}{_NUM}", re.IGNORECASE),
)
_UNITS_PER_MONTH = (
    re.compile(rf"(?:a|per|each)\s+month\s+for\s+(\d+)\s+({_UNIT_WORDS})\b", re.IGNORECASE),
    re.compile(rf"\b(\d+)\s+({_UNIT_WORDS})\s+(?:a|per|each|every)\s+month\b", re.IGNORECASE),
)
_PRICE_PER_MONTH = re.compile(rf"{_RS}{_NUM}\s*(?:a|per|/)\s*month", re.IGNORECASE)
_MARGIN_PCT = re.compile(rf"{_NUM}\s*%\s*(?:gross\s+)?margin|(?:gross\s+)?margin\s+(?:of|is)\s+{_NUM}\s*%",
                         re.IGNORECASE)


def _f(text: str) -> float:
    return float(text.replace(",", ""))


@dataclass(frozen=True)
class Payback:
    months: float
    how: str  # the working, in words the founder will recognise

    def fact(self) -> str:
        return (f"CAC payback, worked out from the founder's numbers: {self.how} = about "
                f"{self.months:.1f} months, before churn")


def payback(record: Iterable[str]) -> Payback | None:
    """CAC ÷ monthly margin per customer, when the record gives both; latest figure wins
    (a founder's answer can correct the pitch)."""
    text = "\n".join(record)
    cac = [_f(m) for m in _CAC.findall(text)]
    if not cac:
        return None
    cac_rs = cac[-1]
    # 1) margin per unit x units a customer buys each month
    per_unit = []
    for rx in _MARGIN_PER_UNIT:
        for m in rx.finditer(text):
            a, b = m.groups()
            value, word = (a, b) if rx is _MARGIN_PER_UNIT[0] else (b, a)
            per_unit.append((m.start(), _f(value), _UNIT_OF[word.lower()]))
    volumes = []
    for rx in _UNITS_PER_MONTH:
        for m in rx.finditer(text):
            volumes.append((m.start(), _f(m.group(1)), _UNIT_OF[m.group(2).lower()]))
    if per_unit and volumes:
        _, margin, unit = max(per_unit)
        same = [v for v in volumes if v[2] == unit] or volumes
        _, count, _ = max(same)
        monthly = margin * count
        if monthly > 0:
            return Payback(cac_rs / monthly,
                           f"₹{cac_rs:,.0f} CAC ÷ (₹{margin:g} margin per {unit} × {count:g} {unit}s a month)")
    # 2) monthly price x gross margin %
    prices, pcts = _PRICE_PER_MONTH.findall(text), _MARGIN_PCT.findall(text)
    if prices and pcts:
        price = _f(prices[-1])
        pct = _f(next(x for x in pcts[-1] if x))
        monthly = price * pct / 100
        if 0 < pct <= 100 and monthly > 0:
            return Payback(cac_rs / monthly,
                           f"₹{cac_rs:,.0f} CAC ÷ ({pct:g}% margin on ₹{price:,.0f} a month)")
    return None


# A payback stated as a duration: "payback period 60 months", "5 saal ka payback",
# "a 60-month payback", "pays back in 25 weeks".
_DUR = r"(\d+(?:\.\d+)?)[\s-]*(months?|mahine|mahina|years?|saal|weeks?|hafte|hafta|days?|din)\b"
_PAYBACK_WORD = r"\b(?:pay\s?back|paid back|pays back|recover)"
# The words between "payback" and its duration may not start a new thought ("..., par tu 12
# months mein Pune chhodne wala hai") or reach another "payback", which is matched on its own.
_NEW_THOUGHT = r"\b(?:but|par|lekin|magar|kyunki|kyonki|because|although|though|however|while|whereas)\b"
_PAYBACK_AFTER = re.compile(
    rf"{_PAYBACK_WORD}\w*\b(?:(?!{_NEW_THOUGHT}|{_PAYBACK_WORD})[^.?!\n]){{0,60}}?{_DUR}",
    re.IGNORECASE)
_PAYBACK_BEFORE = re.compile(rf"{_DUR}\s*(?:ka|ki|of|ke)?\s*(?:CAC\s+)?(?:pay\s?back|recovery)", re.IGNORECASE)
_TO_MONTHS = {"month": 1, "mahin": 1, "year": 12, "saal": 12, "week": 12 / 52, "haft": 12 / 52,
              "day": 1 / 30, "din": 1 / 30}


def _months(n: str, unit: str) -> float:
    key = next(k for k in _TO_MONTHS if unit.lower().startswith(k))
    return float(n) * _TO_MONTHS[key]


def stated_paybacks(text: str) -> list[tuple[str, float]]:
    """Every (words, months) the text gives as a payback.

    A "payback" that already has its figure in front ("1.1 months ka CAC payback") is not
    read again with whatever duration follows it. On the real run of 27 Nov 2026 that took
    the founder's "12 months" in Pune for a 12-month payback and rejected all three tries
    at the only offer."""
    before = list(_PAYBACK_BEFORE.finditer(text))
    after = [m for m in _PAYBACK_AFTER.finditer(text)
             if not any(b.start() <= m.start() < b.end() for b in before)]
    return [(m.group(0), _months(m.group(1), m.group(2))) for m in (*after, *before)]


def payback_error(text: str, record: Iterable[str]) -> str | None:
    """An error message if `text` states a payback that disagrees with the one worked out
    from the record. Within 35% (or half a month) counts as agreeing: rounding, and adding
    packaging or similar, move it a little; a wrong formula moves it many times over."""
    pb = payback(record)
    if pb is None:
        return None
    for said, months in stated_paybacks(text):
        if abs(months - pb.months) > max(0.5, 0.35 * pb.months):
            return (f"you said '{said.strip()}', but {pb.fact()} ({pb.how}). Use that figure. "
                    "If you think churn or another cost changes it, say so in words instead of "
                    "a new number")
    return None
