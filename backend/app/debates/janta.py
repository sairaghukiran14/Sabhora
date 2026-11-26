"""Janta mode: a generated crowd of Indian personas reacts to a pitch and votes.

How the crowd is asked, chosen by JANTA_BATCH_SIZE (measured on sarvam-105b):
- 3 (default): one call per 3 people, with a schema that has one REQUIRED field per person
  id (comment before vote). Varied votes, real comments, a third of the calls.
- 1: one call per person. Most reliable, but 100 people x 2 rounds = 200 calls, which
  hits Sarvam's ~50-60 requests/minute limit (about 4 minutes per run).
- 5 and up: votes stay varied, but comments degrade into copies of the instructions.
- 10 with a plain list: came back short (1 of 10 people) or all with the same vote.
A failed batch falls back to asking its people one at a time.

Round 2 re-asks only the swing voters (all neutrals + a third of the decided), one person
per call, after they hear a digest of round 1. Batching failed there (see run()).

Either way calls run with a concurrency cap, round 2 lets people react to what the rest of
the crowd said, and segment breakdowns are computed in code (zero tokens).
"""
import asyncio
import logging
import re
from collections import Counter
from difflib import SequenceMatcher

from .. import prompts
from ..budget import BudgetExceeded, TokenBudget
from ..llm.base import LLMError, complete_typed
from ..llm.base import LLMClient
from ..llm.factory import LLMs, model_label
from ..llm.quality import is_real_text, real_words, require_text
from ..models import CrowdReaction, JantaSummary, PersonReaction, crowd_batch_model
from ..personas import CrowdPersona, generate_crowd
from ..sessions import DebateSession
from ..settings import Settings

log = logging.getLogger(__name__)

SEGMENTS = {
    "City tier": lambda p: f"Tier {p.city_tier}",
    "Age": lambda p: p.age_band,
    "Attitude": lambda p: p.attitude,
    "Phone use": lambda p: p.phone_label or "Unknown",
}
# Phrases that mean the model described a comment, or copied the instructions, instead of
# writing one. Each was seen on sarvam-105b ("1-2 sentences in their own words, light
# Hinglish or regional flavour is fine" came back as dozens of people's "comment").
_META = ("own voice", "own words", "their comment", "his comment", "her comment",
         "in character", "1-2 sentences", "one or two sentences", "regional flavour",
         "light hinglish", "comment here", "out loud about", "repeat these rules")
_NAME_SAID = re.compile(r"^\s*\w+ (said|says)\s*:", re.IGNORECASE)


def check_reaction(r: PersonReaction, others: list[str] | None = None) -> None:
    """Quality rules, each from a real reply: meta text ("Neha's comment in her own voice"),
    filler ("Ravi said: ....", "....//....//...."), and round 2 copying someone else's
    round-1 comment word for word. `others` excludes the person's own earlier comment."""
    text = r.comment.lower()
    if any(m in text for m in _META) or _NAME_SAID.match(r.comment) \
            or not is_real_text(r.comment, min_words=5):
        raise ValueError("comment must be the person's actual words: a full sentence they say")
    for quoted in others or []:
        if SequenceMatcher(None, text, quoted.lower()).ratio() > 0.8:
            raise ValueError("comment copies what someone else said; write this person's own view")


def summary_check(s: JantaSummary) -> None:
    require_text("headline", s.headline, min_words=4)
    require_text("every reason and piece of advice",
                 *s.reasons_for, *s.reasons_against, *s.advice, min_words=4)


def fallback_summary(final: dict, votes: dict[str, CrowdReaction],
                     by_id: dict[str, CrowdPersona]) -> JantaSummary:
    """If the judge can't write a summary, quote the crowd itself: real, attributed voices
    instead of empty sections. Longest comments first (they usually say the most)."""
    def quotes(vote: str) -> list[str]:
        picked = sorted((r for r in votes.values() if r.vote == vote),
                        key=lambda r: len(r.comment), reverse=True)[:3]
        return [f"{by_id[r.persona_id].occupation}, {by_id[r.persona_id].city}: "
                f"“{r.comment}”" for r in picked]
    return JantaSummary.model_construct(
        headline=f"{final['agree']} of {final['total']} agree; {final['would_pay_pct']}% would pay.",
        reasons_for=quotes("agree"), reasons_against=quotes("disagree"), advice=quotes("neutral"))


def tally(votes: dict[str, CrowdReaction]) -> dict:
    counts = Counter(r.vote for r in votes.values())
    n = len(votes) or 1
    pay = sum(r.would_pay for r in votes.values())
    return {"agree": counts["agree"], "neutral": counts["neutral"],
            "disagree": counts["disagree"], "total": len(votes),
            "would_pay": pay, "would_pay_pct": round(100 * pay / n)}


def segment_breakdown(votes: dict[str, CrowdReaction], by_id: dict[str, CrowdPersona],
                      model_of: dict[str, str] | None = None) -> dict:
    """Vote split per segment, so the founder sees WHO likes it, not just how many.
    With a mixed crowd, 'Model' is a segment too: if one model is harsher, it shows."""
    out: dict[str, dict] = {}
    segments = dict(SEGMENTS)
    if model_of and len(set(model_of.values())) > 1:
        segments["Model"] = lambda p: model_of[p.id]
    for seg_name, key in segments.items():
        groups: dict[str, dict] = {}
        for pid, r in votes.items():
            g = groups.setdefault(key(by_id[pid]),
                                  {"n": 0, "agree": 0, "neutral": 0, "disagree": 0, "would_pay": 0})
            g["n"] += 1
            g[r.vote] += 1
            g["would_pay"] += int(r.would_pay)
        out[seg_name] = dict(sorted(groups.items()))
    return out


def digest(votes: dict[str, CrowdReaction]) -> tuple[str, dict[str, str]]:
    """What round 2 hears about round 1: the split plus a few voices from each side.
    Also returns who said each quoted line, so the copy check can skip a person's own words."""
    t = tally(votes)
    lines = [f"Votes so far: {t['agree']} agree, {t['neutral']} neutral, {t['disagree']} disagree."]
    quotes: dict[str, str] = {}
    for side in ("agree", "disagree"):
        for r in [r for r in votes.values() if r.vote == side][:3]:
            lines.append(f"({side}) {r.comment}")
            quotes[r.persona_id] = r.comment
    return "\n".join(lines), quotes


def swing_voters(crowd, votes: dict[str, CrowdReaction]) -> list[CrowdPersona]:
    """Who reconsiders after round 1: everyone neutral, plus a third of the decided."""
    return [p for p in crowd if p.id in votes and
            (votes[p.id].vote == "neutral" or int(p.id[1:]) % 3 == 0)]


async def ask_batch(client: LLMClient, pitch: str, batch: list[CrowdPersona], heard: str | None,
                    budget: TokenBudget, quotes: dict[str, str] | None = None) -> list[CrowdReaction]:
    """One call for this batch; returns one reaction per person in it."""
    quotes = quotes or {}

    def others(pid: str) -> list[str]:
        return [c for who, c in quotes.items() if who != pid]

    user = prompts.crowd_user(pitch, batch, heard)
    if len(batch) == 1:
        pid = batch[0].id
        r = await complete_typed(client, prompts.crowd_system(single=True), user,
                                 PersonReaction, budget=budget, max_tokens=600,
                                 check=lambda x: check_reaction(x, others(pid)), attempts=3)
        return [CrowdReaction(persona_id=pid, **r.model_dump())]
    model = crowd_batch_model([p.id for p in batch])

    def check(value) -> None:
        for p in batch:
            check_reaction(getattr(value, p.id), others(p.id))

    try:
        out = await complete_typed(client, prompts.crowd_system(single=False), user, model,
                                   budget=budget, max_tokens=400 * len(batch), check=check)
    except LLMError:
        # The batch failed twice (e.g. broken JSON): ask each person on their own instead,
        # so nobody silently drops out of the crowd.
        results = await asyncio.gather(
            *[ask_batch(client, pitch, [p], heard, budget, quotes) for p in batch],
            return_exceptions=True)
        got = [r[0] for r in results if isinstance(r, list)]
        if not got:
            raise
        return got
    return [CrowdReaction(persona_id=p.id, **getattr(out, p.id).model_dump()) for p in batch]


async def run(session: DebateSession, llms: LLMs, s: Settings) -> None:
    pitch = session.request["pitch"]
    size = min(session.request.get("panel_size") or s.janta_size, s.janta_max_size)
    crowd = generate_crowd(size)
    by_id = {p.id: p for p in crowd}
    # Budget scales with people x rounds. Measured on sarvam-105b with 3 people per call:
    # ~700-900 tokens per person per round including retries; 1,500 leaves headroom.
    budget = TokenBudget(size * s.janta_rounds * s.janta_tokens_per_person)
    session.budgets.append(budget)
    votes: dict[str, CrowdReaction] = {}
    sem = asyncio.Semaphore(s.janta_parallel)
    heard: str | None = None
    quotes: dict[str, str] = {}
    last_error: Exception | None = None
    step = max(1, s.janta_batch_size)
    # Mixed crowd: each person is always played by the same model (both rounds), spread
    # evenly by id so every attitude and city gets a mix of models.
    pool = llms.crowd_pool()

    def client_for(p: CrowdPersona) -> LLMClient:
        return pool[int(p.id[1:]) % len(pool)]

    model_of = {p.id: model_label(client_for(p)) for p in crowd}

    def make_batches(people: list[CrowdPersona], n: int) -> list[list[CrowdPersona]]:
        groups: dict[int, list[CrowdPersona]] = {}
        for p in people:  # a batch must share one model
            groups.setdefault(id(client_for(p)), []).append(p)
        return [g[i:i + n] for g in groups.values() for i in range(0, len(g), n)]

    await session.emit("start", mode="janta", size=size, rounds=s.janta_rounds, crowd=[
        {"id": p.id, "name": p.name, "age": p.age, "city": p.city, "city_tier": p.city_tier,
         "occupation": p.occupation, "attitude": p.attitude, "model": model_of[p.id],
         "household": p.household, "phone": p.phone_label}
        for p in crowd])

    async def run_batch(batch: list[CrowdPersona], context: str | None):
        async with sem:
            try:
                return await ask_batch(client_for(batch[0]), pitch, batch, context, budget,
                                       quotes), None
            except (LLMError, BudgetExceeded) as err:
                log.warning("crowd batch failed",
                            extra={"debate_id": session.id, "error": str(err)[:300]})
                return None, err

    for rnd in range(1, s.janta_rounds + 1):
        if rnd == 1:
            asked, step_now = list(crowd), step
        else:
            # Round 2+: only swing voters reconsider (the decided third is a control), one
            # person per call. Batched round-2 replies with the crowd digest failed 8/10
            # times on sarvam-105b; single calls passed 30/30.
            asked = swing_voters(crowd, votes)
            step_now = 1
        await session.emit("round", round=rnd, asked=len(asked))
        batches = make_batches(asked, step_now)
        tally_every = max(1, size // 10)  # live tally about 10 times per round
        heard_in_round = 0
        for next_done in asyncio.as_completed([run_batch(b, heard) for b in batches]):
            reactions, err = await next_done
            if reactions is None:
                last_error = err
                continue
            for r in reactions:
                before = votes.get(r.persona_id)
                votes[r.persona_id] = r
                heard_in_round += 1
                await session.emit("reaction", round=rnd, persona_id=r.persona_id, vote=r.vote,
                                   comment=r.comment, would_pay=r.would_pay,
                                   changed=bool(before and before.vote != r.vote))
                await asyncio.sleep(s.janta_pace_s)
                if heard_in_round % tally_every == 0:
                    await session.emit("tally", round=rnd, **tally(votes))
        await session.emit("tally", round=rnd, **tally(votes))
        if not votes:
            raise last_error or LLMError("The crowd did not respond")
        if isinstance(last_error, BudgetExceeded):
            await session.emit("notice", text="The crowd ran out of time. Wrapping up.")
            break
        heard, quotes = digest(votes)

    missing = size - len(votes)
    if missing:
        await session.emit("notice", text=f"{missing} of {size} people didn't answer; "
                                          "the results use the rest.")
    final = tally(votes)
    segments = segment_breakdown(votes, by_id, model_of)
    await session.emit("judging")
    judge_budget = TokenBudget(s.judge_reserve_tokens)
    session.budgets.append(judge_budget)
    sample = [f"{by_id[pid].occupation}, {by_id[pid].city} ({r.vote}): {r.comment}"
              for pid, r in list(votes.items())[:40]]
    try:
        summary = await complete_typed(
            llms.judge, prompts.janta_summary_system(),
            prompts.janta_summary_user(pitch, final, segments, sample),
            JantaSummary, budget=judge_budget, max_tokens=6000, check=summary_check,
            attempts=3)
    except (LLMError, BudgetExceeded) as err:
        log.warning("janta judge failed, using fallback",
                    extra={"debate_id": session.id, "error": str(err)[:300]})
        summary = fallback_summary(final, votes, by_id)
    await session.emit("verdict", summary=summary.model_dump(), tally=final, segments=segments)
