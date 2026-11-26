"""Who the pitch is for, read from the pitch itself, so Janta asks the right crowd.

On the first real web run (26 Nov 2026) a Pune-only tiffin service was judged by a crowd
spread evenly over 16 cities: 2 of 25 lived in Pune, and the verdict was mostly "it doesn't
reach my city". Now the crowd leans towards the founder's market:

- Cities: any crowd city (or alias, e.g. Bangalore, Gurgaon) named anywhere in the pitch.
- Jobs: crowd occupations whose `targets` words appear in the "Target customer:" line the
  web app adds. Only that line, because the rest of a pitch names suppliers and staff too
  ("delivered by our own riders" is not a pitch to delivery riders).

Most of the crowd is drawn from the target (see TARGET_SHARE); the rest stays spread out as
a comparison group, so the verdict can show whether the market reacts differently.
"""
import re
from dataclasses import dataclass
from functools import lru_cache

import yaml

from .personas import PERSONAS_DIR

TARGET_SHARE = 0.7  # of the crowd placed in the target cities / jobs
_CUSTOMER_LINE = re.compile(r"^\s*target customers?\s*:\s*(.+)$", re.IGNORECASE | re.MULTILINE)
_CAPS_ONLY = {"IT", "CA", "CAs", "PG", "SME", "SMEs", "MSME", "MSMEs", "NCR"}  # never lower case


@dataclass(frozen=True)
class Target:
    cities: tuple[str, ...] = ()  # crowd city names, e.g. ("Pune",)
    jobs: tuple[str, ...] = ()    # crowd occupation titles
    customer: str = ""            # the founder's own words, for prompts

    def __bool__(self) -> bool:
        return bool(self.cities or self.jobs)

    def describe(self) -> str:
        parts = []
        if self.cities:
            parts.append("in " + " and ".join(self.cities))
        if self.customer:
            parts.append(f"for {self.customer}")
        return " ".join(parts)


@lru_cache
def _dimensions() -> dict:
    with open(PERSONAS_DIR / "janta" / "dimensions.yaml", encoding="utf-8") as f:
        return yaml.safe_load(f)


def _mentions(text: str, words: list[str]) -> bool:
    for word in words:
        flags = 0 if word in _CAPS_ONLY else re.IGNORECASE
        if re.search(rf"(?<![\w-]){re.escape(word)}(?![\w-])", text, flags):
            return True
    return False


def find_target(pitch: str) -> Target:
    dims = _dimensions()
    cities = tuple(c["name"] for c in dims["cities"]
                   if _mentions(pitch, [c["name"], *c.get("aliases", [])]))
    line = _CUSTOMER_LINE.search(pitch)
    customer = line.group(1).strip() if line else ""
    jobs = tuple(o["title"] for o in dims["occupations"]
                 if customer and _mentions(customer, o.get("targets", [])))
    return Target(cities=cities, jobs=jobs, customer=customer)


def in_target(index: int, share: float = TARGET_SHARE) -> bool:
    """Spread target slots evenly through the crowd (7 of every 10 at 0.7), deterministic so
    the same pitch always gets the same crowd. Cities and jobs use the same slots, so the
    crowd splits cleanly into the market and a comparison group drawn from everywhere."""
    return (index * 7) % 10 < round(share * 10)
