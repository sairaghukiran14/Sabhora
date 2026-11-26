"""Sharks mode: investor personas debate a pitch over rounds, then talk money.

A shark may say "I'm out" from round 2. If the founder gave an ask, the sharks still in go to
the deal table (see deals.py). The founder may reply between rounds. A rule-based supervisor (zero tokens) decides who
speaks next; only the turns and the final verdict call the LLM.
"""
import asyncio
import logging
import re
import time
from difflib import SequenceMatcher

from .. import prompts
from ..budget import BudgetExceeded, TokenBudget
from ..llm.base import LLMError, complete_typed
from ..llm.factory import LLMs
from ..llm.quality import (crowded_objection, ignores_record, is_real_text, record_error,
                           repeats_point, require_text, taken_objections, unmentioned_city)
from ..models import SharkTurn, SharkVerdict, SharkVote, Stance, shark_verdict_model
from ..personas import Persona, load_sharks
from ..sessions import DebateSession
from ..settings import Settings
from . import deals, metrics, numbers

log = logging.getLogger(__name__)
SKEPTIC_FIRST = {"pass": 0, "maybe": 1, "invest": 2}


def speaking_order(sharks: tuple[Persona, ...], rnd: int, stances: dict[str, str]) -> list[Persona]:
    """Who speaks next. Round 1: file order. Later rounds: rotate the start, then let the
    most skeptical sharks press first (pass, then maybe, then invest). Pure and testable."""
    if rnd == 1:
        return list(sharks)
    n = len(sharks)
    rotated = [sharks[(i + rnd - 1) % n] for i in range(n)]
    return sorted(rotated, key=lambda s: SKEPTIC_FIRST.get(stances.get(s.id, "maybe"), 1))


# Structured fields the model sometimes repeats at the end of its spoken message
_TRAILING_LABELS = re.compile(r"\s*\(?\s*(stance|confidence)\s*[:=].*$", re.IGNORECASE | re.DOTALL)
# Signs the model narrated instead of speaking, or echoed the prompt
_NOT_SPEECH = re.compile(r"^\s*[\(\*\[]|your turn|^\s*i (pause|lean|look|nod|smile)|"
                         r"\b(gaze|glances?|leans back)\b|PITCH:|ROUND \d", re.IGNORECASE)


# Stance or confidence said out loud ("Mera confidence 6 hai, stance maybe"): seen in 3 of 14
# turns on the third real run. They belong in their own fields.
_LABEL_TALK = re.compile(r"\bconfidence\b[^.?!]{0,12}\d|\bstance\b\s*(?:is|hai|:)?\s*(?:maybe|invest|pass)\b"
                         r"|\b(?:maybe|invest|pass)\s+stance\b"
                         r"|\b(?:maybe|invest|pass)\s*,?\s*\d+\s*/\s*10\b", re.IGNORECASE)  # "Maybe, 5/10"
# What the shark says it is doing, to compare with the stance field (Hinglish and English).
_SAYS_PASS = re.compile(r"\bi'?m out\b|\bmain out\b|\bpass kar (?:raha|rahi)\b|\bwon'?t invest\b"
                        r"|\bwill not invest\b|\binvest nahi\b|\bpaisa nahi lag", re.IGNORECASE)
_SAYS_INVEST = re.compile(r"\bi'?m in\b|\binvest kar (?:raha|rahi|unga|ungi)\b|\bi'?ll invest\b"
                          r"|\bi will invest\b", re.IGNORECASE)


def stance_error(turn: SharkTurn, msg: str) -> str | None:
    """The stance fields must say what the words say."""
    if _LABEL_TALK.search(msg):
        return ("don't say your stance or confidence out loud; they go in their own fields. "
                "Just say what you think")
    says_pass, says_invest = bool(_SAYS_PASS.search(msg)), bool(_SAYS_INVEST.search(msg))
    if says_pass and not says_invest and turn.stance != "pass":
        return "your words say you are passing, so set stance to pass (or say something else)"
    if says_invest and not says_pass and (turn.out or turn.stance != "invest"):
        return "your words say you will invest, so set stance to invest and out to false"
    return None


def clean_message(text: str) -> str:
    return _TRAILING_LABELS.sub("", text).strip()


def turn_check(pitch: str, transcript: list[tuple[str, str]] | None = None,
               allowed: set[float] | None = None, speaker: str = ""):
    """Quality rules for a shark turn, each one seen on a real model: the 'message' was the
    pitch repeated back, an echo of 'Your turn', a stage direction instead of speech, a
    near-copy of a line already said, another shark's point reworded, or an invented figure.

    `allowed` is every rupee value the debate has established. A turn that passes adds its
    own checked arithmetic to it, so a later shark may quote a figure already worked out.
    """
    # Quoting the founder back is good; echoing another shark is not.
    others = [said for who, said in transcript or [] if who != "Founder"]
    record = [pitch, *(said for who, said in transcript or [] if who == "Founder")]

    def check(turn: SharkTurn) -> None:
        msg = clean_message(turn.message)
        if len(msg) < 25 or _NOT_SPEECH.search(msg) or not is_real_text(msg, min_words=6):
            raise ValueError("message must be only the words you say out loud to the founder, "
                             "reacting to the pitch: no narration and no repeating the prompt")
        if SequenceMatcher(None, msg.lower(), pitch.lower()).ratio() > 0.6:
            raise ValueError("message repeats the pitch; react to it in your own words instead")
        for said in others:
            if SequenceMatcher(None, msg.lower(), said.lower()).ratio() > 0.75:
                raise ValueError("that was already said in this debate; make a NEW point")
        if repeats_point(msg, others):
            raise ValueError("that point has already been made in this debate, just in other "
                             "words. Drop it and raise something nobody has raised yet")
        topic = ignores_record(msg, record)
        if topic:
            raise ValueError(record_error(topic))
        wrong_stance = stance_error(turn, msg)
        if wrong_stance:
            raise ValueError(wrong_stance)
        city = unmentioned_city(msg, record)
        if city:
            raise ValueError(f"nobody mentioned {city}. Only name places the pitch or the "
                             "founder mentioned")
        crowded = crowded_objection(msg, speaker, transcript or [])
        if crowded:
            raise ValueError(crowded)
        mixup = numbers.unit_mixup(msg, record)
        if mixup:
            raise ValueError(mixup)
        wrong_payback = metrics.payback_error(msg, record)
        if wrong_payback:
            raise ValueError(wrong_payback)
        verified = numbers.check_calcs(turn.maths)
        if allowed is not None:
            numbers.check_message(msg, allowed | verified)
            allowed.update(verified)  # only now that the whole turn is good
    return check


MAX_EXITS_PER_ROUND = 2


def round_check(rnd: int, base, exits_so_far: int = 0):
    """Round 1 is for questions: nobody leaves, and nobody has a position yet. Without this,
    four of five sharks opened at "pass" on the first real run and the panel never recovered.

    Later rounds allow at most MAX_EXITS_PER_ROUND walk-outs. On both real runs (25 and 26
    Nov 2026) the sharks left in a cascade after one answer, so the deal table never ran:
    with 5 sharks and 2 rounds of exits, at least one now hears the founder out to the end."""
    def check(turn: SharkTurn) -> None:
        if rnd == 1 and (turn.out or turn.stance != "maybe"):
            raise ValueError("round 1 is for questions: set out to false and stance to "
                             "\"maybe\", then ask what you most need to know")
        if turn.out and exits_so_far >= MAX_EXITS_PER_ROUND:
            raise ValueError("two sharks have already walked out this round, so you stay in: "
                             "set out to false, keep stance pass if you lean that way, and put "
                             "your hardest doubt to the founder as a question")
        base(turn)
    return check


def offer_figures(events: list[dict]) -> dict[str, set[float]]:
    """Shark id -> the rupee figures of every offer that shark made or joined."""
    out: dict[str, set[float]] = {}
    for e in events:
        offer = e.get("offer") if e.get("type") in ("offer", "raise", "counter_reply") else None
        if offer:
            for sid in offer["sharks"]:
                out.setdefault(sid, set()).update(deals.terms_values(offer))
    return out


def verdict_check(allowed: set[float] | None = None, record: list[str] | None = None,
                  offers: dict[str, set[float]] | None = None):
    """The judge must write real text (a real reply had a one-liner of just '....') and may
    not invent figures either: the made-up "₹4,812 a month" reached the verdict unchallenged.
    Nor may it call something missing that the founder covered (`record`): "no FSSAI process
    was described" reached the top risks after the founder said the kitchens were registered."""
    def check(raw) -> None:
        require_text("one_liner", raw.one_liner)
        require_text("top_risks and next_steps", *raw.top_risks, *raw.next_steps, min_words=4)
        for sid, v in raw.votes:
            require_text(f"the vote reason for {sid}", v.reason, min_words=4)
        if allowed is not None:
            for text in [raw.one_liner, *raw.top_risks, *raw.next_steps,
                         *(v.reason for _, v in raw.votes)]:
                numbers.check_message(text, allowed)
        for sid, v in raw.votes:  # each shark's reason may quote only that shark's own offer
            mine = (offers or {}).get(sid, set())
            theirs = {f for other, figs in (offers or {}).items() if other != sid for f in figs}
            for m in numbers.mentions(v.reason):
                if m.checked and numbers.matches(m.value, theirs - mine) and not numbers.matches(m.value, mine):
                    raise ValueError(f"the reason for {sid} quotes {m.raw}, which is another "
                                     "shark's offer, not theirs. Give each shark only their own terms")
        if record:
            for text in [raw.one_liner, *raw.top_risks, *raw.next_steps,
                         *(v.reason for _, v in raw.votes)]:
                wrong_payback = metrics.payback_error(text, record)
                if wrong_payback:  # e.g. quoting a shark's "60-month payback" as a risk
                    raise ValueError(wrong_payback + ". If a shark said otherwise, say they "
                                     "were wrong instead of repeating it")
                mixup = numbers.unit_mixup(text, record)
                if mixup:  # e.g. repeating a shark's "25 weeks" for 25 meals as its reason
                    raise ValueError(mixup + ". If a shark got this wrong, say so instead "
                                     "of repeating it")
                topic = ignores_record(text, record)
                if topic:
                    raise ValueError(f"the founder already covered {topic}; do not call it "
                                     "missing or undescribed. Say what would prove or disprove "
                                     "their claim instead")
    return check


def to_verdict(raw, sharks: tuple[Persona, ...],
               fixed: dict[str, str] | None = None) -> SharkVerdict:
    """Turn the judge's keyed votes (one required field per shark id) into the app's verdict.
    `fixed` holds stances that are already facts (offered = invest, went out = pass)."""
    fixed = fixed or {}
    votes = [SharkVote(shark=s.name, stance=fixed.get(s.id, getattr(raw.votes, s.id).stance),
                       reason=getattr(raw.votes, s.id).reason) for s in sharks]
    return SharkVerdict(score=raw.score, decision=raw.decision, one_liner=raw.one_liner,
                        votes=votes, top_risks=raw.top_risks[:3], next_steps=raw.next_steps[:3])


def fallback_verdict(sharks: tuple[Persona, ...], stances: dict[str, str]) -> SharkVerdict:
    """Used only if the judge model fails: a verdict built from the final stances alone."""
    votes = [SharkVote(shark=s.name, stance=stances.get(s.id, "maybe"),  # type: ignore[arg-type]
                       reason="Based on their final stance in the debate.") for s in sharks]
    invest = sum(v.stance == "invest" for v in votes)
    decision: Stance = ("invest" if invest * 2 > len(sharks)
                        else "pass" if invest == 0 else "maybe")
    return SharkVerdict(
        score=3 + round(6 * invest / len(sharks)), decision=decision,
        one_liner="The panel has spoken; the judge was unavailable for details.",
        votes=votes, top_risks=["Not enough evidence of demand", "Unclear moat", "Unproven economics"],
        next_steps=["Talk to 10 target customers", "Test one price point", "Find one repeatable channel"],
    )


async def _wait_for_founder(session: DebateSession, wait_s: float) -> str | None:
    session.awaiting_founder = True
    # expires_at (epoch seconds) lets a page that reloads mid-wait show the right countdown
    await session.emit("founder_turn", wait_s=wait_s, expires_at=time.time() + wait_s)
    try:
        return await asyncio.wait_for(session.founder_inbox.get(), timeout=wait_s)
    except TimeoutError:
        return None
    finally:
        session.awaiting_founder = False


async def run(session: DebateSession, llms: LLMs, s: Settings) -> None:
    sharks = load_sharks()
    pitch = session.request["pitch"]
    tone = session.request.get("tone", "roast")
    budget = TokenBudget(s.max_tokens_per_debate)
    session.budgets.append(budget)
    transcript: list[tuple[str, str]] = []
    stances: dict[str, str] = {}
    # Every rupee figure anyone may state, grown by each turn's checked arithmetic.
    allowed = numbers.established(pitch, [], deals.make_ask(session.request))
    last_error: LLMError | None = None
    gone: set[str] = set()  # sharks who said "I'm out"
    ask = deals.make_ask(session.request)

    await session.emit("start", mode="sharks", rounds=s.shark_rounds, ask=ask,
                       panel=[{"id": p.id, "name": p.name, "title": p.title} for p in sharks])
    try:
        for rnd in range(1, s.shark_rounds + 1):
            if len(gone) == len(sharks):
                break
            await session.emit("round", round=rnd)
            exits = 0
            for shark in speaking_order(sharks, rnd, stances):
                if shark.id in gone:
                    continue
                await session.emit("typing", speaker=shark.id, name=shark.name)
                try:
                    turn = await complete_typed(
                        llms.crowd, prompts.shark_system(shark, tone),
                        prompts.shark_user(pitch, transcript, rnd, s.shark_rounds, shark.name, ask),
                        SharkTurn, budget=budget, max_tokens=800,
                        check=round_check(rnd, turn_check(pitch, transcript, allowed, shark.name), exits),
                        attempts=3)
                except LLMError as err:
                    last_error = err
                    log.warning("shark turn failed",
                                extra={"debate_id": session.id, "error": str(err)[:300]})
                    await session.emit("notice", text=f"{shark.name} passed on this turn.")
                    continue
                message = clean_message(turn.message)
                transcript.append((shark.name, message))
                stance = "pass" if turn.out else turn.stance
                stances[shark.id] = stance
                if turn.out:
                    gone.add(shark.id)
                    exits += 1
                await session.emit("message", round=rnd, speaker=shark.id, name=shark.name,
                                   text=message, stance=stance,
                                   confidence=turn.confidence, out=turn.out)
            if not transcript and last_error:
                raise last_error  # nobody could speak: a config problem, not a debate
            if rnd < s.shark_rounds and len(gone) < len(sharks):
                reply = await _wait_for_founder(session, s.founder_wait_s)
                if reply:
                    transcript.append(("Founder", reply))
                    allowed |= numbers.values_in([reply])  # the founder's figures are facts
                    await session.emit("founder", round=rnd, text=reply)
                else:
                    await session.emit("founder_skipped", round=rnd)
    except BudgetExceeded:
        await session.emit("notice", text="The panel ran out of time for more questions.")

    fixed = {sid: "pass" for sid in gone}
    if ask:
        result = await deals.run_table(session, llms, s, sharks, pitch, ask, transcript,
                                       stances, gone, allowed)
        fixed.update(result)
        stances.update(result)

    await session.emit("judging")
    judge_budget = TokenBudget(s.judge_reserve_tokens)  # held back so a verdict always gets written
    session.budgets.append(judge_budget)
    try:
        raw = await complete_typed(
            llms.judge, prompts.verdict_system(),
            prompts.verdict_user(pitch, transcript, list(sharks), stances, ask),
            shark_verdict_model([p.id for p in sharks]), budget=judge_budget, max_tokens=6000,
            check=verdict_check(allowed, [pitch, *(t for who, t in transcript if who == "Founder")],
                                offer_figures(session.events)),
            attempts=3)
        verdict = to_verdict(raw, sharks, fixed)
    except (LLMError, BudgetExceeded) as err:
        log.warning("judge failed, using fallback verdict",
                    extra={"debate_id": session.id, "error": str(err)[:300]})
        verdict = fallback_verdict(sharks, stances)
    await session.emit("verdict", verdict=verdict.model_dump())
