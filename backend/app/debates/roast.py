"""Roast mode: six influencer personas review a landing page, then a judge sums up."""
import asyncio
import logging

from .. import prompts
from ..budget import BudgetExceeded, TokenBudget
from ..llm.base import LLMError, complete_typed
from ..llm.factory import LLMs
from ..models import RoastReview, RoastVerdict
from ..personas import Persona, load_roasters
from ..scraper import fetch_page
from ..sessions import DebateSession
from ..settings import Settings
from ..llm.quality import require_text

log = logging.getLogger(__name__)
SCORES = ("clarity", "trust", "design", "cta")


def verdict_check(v: RoastVerdict) -> None:
    """A real judge reply had a one-liner of just '....'."""
    require_text("one_liner", v.one_liner)
    require_text("each of top_fixes", *v.top_fixes, min_words=4)


def averages(reviews: list[RoastReview]) -> dict[str, float]:
    if not reviews:
        return {k: 0.0 for k in SCORES}
    return {k: round(sum(getattr(r, k) for r in reviews) / len(reviews), 1) for k in SCORES}


async def run(session: DebateSession, llms: LLMs, s: Settings) -> None:
    url = session.request["url"]
    roasters = load_roasters()
    await session.emit("start", mode="roast", url=url,
                       panel=[{"id": p.id, "name": p.name, "title": p.title} for p in roasters])
    await session.emit("fetching", url=url)
    page = await fetch_page(url)  # ScrapeError is shown to the user by the runner
    await session.emit("page", url=page["url"], title=page["title"],
                       description=page["description"], headings=page["headings"][:6])
    if len(page["text"]) < 200:
        await session.emit("notice", text="This page shows very little text without JavaScript, "
                                          "so the reviewers only see what loads statically.")

    budget = TokenBudget(s.max_tokens_per_debate)
    session.budgets.append(budget)
    sem = asyncio.Semaphore(s.roast_parallel)
    user = prompts.roast_user(page)

    def check(r: RoastReview) -> None:  # a real reply was just "..."
        require_text("roast", r.roast, min_words=10)
        require_text("fix", r.fix)

    async def review(p: Persona):
        async with sem:
            try:
                r = await complete_typed(llms.crowd, prompts.roast_system(p), user, RoastReview,
                                         budget=budget, max_tokens=800, check=check)
                return p, r, None
            except (LLMError, BudgetExceeded) as err:
                return p, None, err

    done: list[tuple[Persona, RoastReview]] = []
    last_error: Exception | None = None
    for nxt in asyncio.as_completed([review(p) for p in roasters]):
        p, r, err = await nxt
        if r is None:
            last_error = err
            continue
        done.append((p, r))
        await session.emit("review", roaster=p.id, name=p.name, title=p.title, review=r.model_dump())
    if not done:
        raise last_error or LLMError("No reviewer could read the page")

    avg = averages([r for _, r in done])
    await session.emit("judging")
    judge_budget = TokenBudget(s.judge_reserve_tokens)
    session.budgets.append(judge_budget)
    try:
        verdict = await complete_typed(
            llms.judge, prompts.roast_verdict_system(),
            prompts.roast_verdict_user(page, [(p.name, r.model_dump()) for p, r in done]),
            RoastVerdict, budget=judge_budget, max_tokens=6000, check=verdict_check,
            attempts=3)
    except (LLMError, BudgetExceeded) as err:
        log.warning("roast judge failed, using fallback",
                    extra={"debate_id": session.id, "error": str(err)[:300]})
        # Built from the reviews alone: weakest score first, then the reviewers' own fixes.
        weakest = min(avg, key=avg.get)
        label = "CTA" if weakest == "cta" else weakest
        verdict = RoastVerdict.model_construct(
            overall=round(sum(avg.values()) / 4),
            one_liner=f"Weakest spot: {label}, at {avg[weakest]}/10 across six reviewers.",
            top_fixes=[r.fix for _, r in sorted(done, key=lambda x: getattr(x[1], weakest))][:3])
    await session.emit("verdict", verdict=verdict.model_dump(), averages=avg)
