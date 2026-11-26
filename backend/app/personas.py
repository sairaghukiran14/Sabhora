"""Persona loading: sharks and roasters from YAML, the Janta crowd from a generator."""
import random
from functools import lru_cache
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel

PERSONAS_DIR = Path(__file__).resolve().parent.parent / "personas"


class Persona(BaseModel):
    """A shark or a roaster: hand-written in YAML."""
    id: str
    name: str
    title: str
    background: str
    style: str
    cares_about: list[str] = []
    red_flags: list[str] = []
    risk_appetite: Literal["low", "medium", "high"] = "medium"


class CrowdPersona(BaseModel):
    """One member of the Janta crowd: generated, not hand-written."""
    id: str
    name: str
    age: int
    city: str
    city_tier: int
    language: str
    occupation: str
    income: str
    attitude: str
    attitude_hint: str
    # Facts that let a model judge FIT, not just mood (see personas/janta/dimensions.yaml)
    household: str = ""
    work: str = ""
    pays_for: str = ""
    pains: list[str] = []
    phone: str = ""
    phone_label: str = ""
    # Set only when the pitch names a market (app/targeting.py): is this person in it?
    in_market: bool | None = None

    def one_line(self, show_attitude: bool = True) -> str:
        """The profile used in prompts. Starts '[id] Name, age, job in City' (the fake
        provider parses that); attitude comes LAST and as a tendency, so the facts about
        the person's life carry more weight than the label.

        show_attitude=False leaves the label out (the app's default, JANTA_SHOW_ATTITUDE):
        shown, it decided most votes in docs/05 (early adopters gave 59 of 90 agrees, 9 of
        90 hidden). The attitude still shaped the person's phone habits."""
        base = (f"[{self.id}] {self.name}, {self.age}, {self.occupation} in {self.city} "
                f"(tier {self.city_tier}), {self.income}.")
        if not self.household:
            return f"{base} {self.attitude}: {self.attitude_hint}" if show_attitude else base
        facts = (f"{base} Home: {self.household}. Work: {self.work}. "
                 f"Already pays for: {self.pays_for}. Phone: {self.phone}. "
                 f"Pain points: {'; '.join(self.pains)}.")
        if not show_attitude:
            return facts
        return f"{facts} General tendency: {self.attitude.lower()} ({self.attitude_hint})."

    @property
    def age_band(self) -> str:
        if self.age < 25:
            return "18-24"
        if self.age < 35:
            return "25-34"
        if self.age < 50:
            return "35-49"
        return "50+"


def _load_yaml_folder(folder: str) -> list[Persona]:
    """Every *.yaml in personas/<folder>, sorted by file name (= speaking order)."""
    paths = sorted((PERSONAS_DIR / folder).glob("*.yaml"))
    personas = []
    for path in paths:
        with open(path, encoding="utf-8") as f:
            personas.append(Persona.model_validate(yaml.safe_load(f)))  # validates every field
    ids = [p.id for p in personas]
    if len(ids) != len(set(ids)):
        raise ValueError(f"Duplicate persona ids in {folder}: {ids}")
    return personas


@lru_cache
def load_sharks() -> tuple[Persona, ...]:
    return tuple(_load_yaml_folder("sharks"))


@lru_cache
def load_roasters() -> tuple[Persona, ...]:
    return tuple(_load_yaml_folder("roasters"))


@lru_cache
def generate_crowd(size: int = 50, seed: int = 42, cities: tuple[str, ...] = (),
                   jobs: tuple[str, ...] = ()) -> tuple[CrowdPersona, ...]:
    """Mix the building blocks into `size` personas. Same seed -> same crowd.

    With target `cities` and/or `jobs` (from app/targeting.py), the slots that
    targeting.in_target picks are moved into them; everyone else is the usual even spread.
    Without a target the crowd is exactly what it always was."""
    from .targeting import in_target  # here, not at the top: targeting imports this module
    with open(PERSONAS_DIR / "janta" / "dimensions.yaml", encoding="utf-8") as f:
        dims = yaml.safe_load(f)
    rng = random.Random(seed)
    low, high = dims["age_range"]
    phone_levels = dims["phone_levels"]
    crowd = []
    city_by_name = {c["name"]: c for c in dims["cities"]}
    job_by_title = {o["title"]: o for o in dims["occupations"]}
    for i in range(size):
        city = dims["cities"][i % len(dims["cities"])]  # spread evenly across cities
        job = rng.choice(dims["occupations"])
        targeted = bool(cities or jobs) and in_target(i)
        if targeted:
            # A separate generator, so the untargeted people keep their usual draws.
            pick = random.Random(f"{seed}-target-{i}")
            if cities:
                city = city_by_name[cities[i % len(cities)]]
            if jobs:
                job = job_by_title[pick.choice(jobs)]
        attitude = dims["attitudes"][i % len(dims["attitudes"])]  # balanced attitudes
        age = rng.randint(18, 23) if job["title"] == "College student" else rng.randint(low, high)
        name = rng.choice(dims["first_names"][city["region"]])
        # Everything below uses a separate per-person generator, so the base crowd above
        # (names, cities, jobs, attitudes) stays exactly as it was before these fields existed.
        extra = random.Random(f"{seed}-{i}")
        min_age, max_age = job.get("min_age", low), job.get("max_age", high)
        if not min_age <= age <= max_age:  # e.g. a 19-year-old "retired" bank manager
            age = extra.randint(min_age, max_age)
        person = CrowdPersona(
            id=f"j{i + 1:03d}",
            name=name,
            age=age,
            city=city["name"],
            city_tier=city["tier"],
            language=city["language"],
            occupation=job["title"],
            income=job["income"],
            attitude=attitude["label"],
            attitude_hint=attitude["hint"],
            # From where they actually live and work: someone in the comparison group
            # can still land in the target city by the usual spread.
            in_market=((not cities or city["name"] in cities)
                       and (not jobs or job["title"] in jobs)) if (cities or jobs) else None,
        )
        band = person.age_band
        weights = list(dims["phone_weights"][band])  # [power, daily, basic, feature]
        if attitude["id"] == "early_adopter":  # an early adopter on a feature phone is a contradiction
            weights[2], weights[3] = weights[2] * 0.3, 0
        elif attitude["id"] == "traditional":
            weights[0] *= 0.2
        level = extra.choices(phone_levels, weights=weights)[0]
        person.household = extra.choice(dims["households"][band])
        person.work = job.get("work", "")
        person.pays_for = job.get("pays_for", "")
        person.pains = extra.sample(job.get("pains", []), k=min(2, len(job.get("pains", []))))
        person.phone, person.phone_label = level["text"], level["label"]
        crowd.append(person)
    return tuple(crowd)
