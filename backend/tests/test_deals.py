"""The Sharks deal table, on the free fake provider and on scripted shark moves."""
import asyncio
import json

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.budget import DailyBudget
from app.chat import find_persona
from app.debates import deals
from app.debates.runner import run_debate
from app.debates.sharks import round_check
from app.llm.base import LLMResult
from app.llm.factory import LLMs, UserKeys, build_llms
from app.llm.fake_client import FakeClient
from app.main import create_app
from app.models import CreateDebate, FounderDeal, SharkTurn
from app.sessions import DebateSession
from app.settings import Settings

PITCH = "A WhatsApp-first app that helps kirana shops in tier-2 cities reorder stock in one tap."
ASK = {"pitch": PITCH, "tone": "roast", "ask_amount_lakh": 50, "ask_equity_pct": 5}


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(_env_file=None, env="test", fake_delay_s=0, founder_wait_s=0.05,
                    deal_wait_s=2, data_dir=str(tmp_path), llm_provider="fake",
                    judge_provider="fake")


def terms(investment=50.0, equity=10.0, debt=0.0, interest=0.0, royalty=0.0, until=0.0) -> dict:
    return {"investment_lakh": investment, "equity_pct": equity, "debt_lakh": debt,
            "debt_interest_pct": interest, "royalty_pct": royalty, "royalty_until_lakh": until}


class Scripted(FakeClient):
    """Fake AI whose deal-table moves follow a script: {shark first name: [moves in order]}."""

    def __init__(self, script: dict[str, list[dict]]) -> None:
        super().__init__()
        self.script = {k: list(v) for k, v in script.items()}

    async def complete(self, system, user, *, max_tokens, output=None):
        if output.__name__ == "SharkTurn":
            reply = await super().complete(system, user, max_tokens=max_tokens, output=output)
            data = json.loads(reply.text) | {"out": False, "stance": "maybe"}
            return LLMResult(json.dumps(data), 10, 10)
        if output.__name__.startswith("Shark") and "Verdict" not in output.__name__:
            who = system.split("You are ", 1)[1].split(" ", 1)[0]
            moves = self.script.get(who)
            move = moves.pop(0) if moves else {"decision": "out"}
            data = {"partner_id": "", "terms": terms(0, 0),
                    "message": "Here is exactly where I stand on this deal today."} | move
            return LLMResult(json.dumps(data), 10, 10)
        return await super().complete(system, user, max_tokens=max_tokens, output=output)


async def play(settings, script: dict, founder: list[dict], request: dict = ASK) -> DebateSession:
    """Runs a debate; `founder` is the list of moves made each time offers wait for them."""
    session = DebateSession("sharks", dict(request))
    llms = LLMs(crowd=Scripted(script), judge=FakeClient())
    task = asyncio.create_task(run_debate(session, llms, settings, DailyBudget(10**9), byok=False))
    moves = list(founder)
    async with asyncio.timeout(20):
        while not task.done():
            if session.open_deal and moves and session.deal_inbox.empty():
                move = {"offer_id": None, "investment_lakh": None, "equity_pct": None,
                        "royalty_pct": None} | moves.pop(0)
                session.deal_inbox.put_nowait(move)
                while session.open_deal and not session.deal_inbox.empty():
                    await asyncio.sleep(0.005)
            await asyncio.sleep(0.005)
    await task
    return session


def of(session: DebateSession, type_: str) -> list[dict]:
    return [e for e in session.events if e["type"] == type_]


def verdict_stances(session) -> dict:
    return {v["shark"].split()[0]: v["stance"] for v in of(session, "verdict")[0]["verdict"]["votes"]}


OFFER = {"decision": "offer", "terms": terms(50, 10)}


async def test_founder_accepts_an_offer_and_valuations_are_worked_out_in_code(settings):
    run = await play(settings, {"Meera": [OFFER]}, [{"action": "accept", "offer_id": "meera"}])
    assert of(run, "start")[0]["ask"]["valuation_lakh"] == 1000  # 50 lakh for 5% = 10 crore
    deal = of(run, "deal")[0]
    assert deal["reason"] == "accepted" and deal["offer"]["valuation_lakh"] == 500
    votes = verdict_stances(run)
    assert votes["Meera"] == "invest"  # facts beat whatever the judge model said
    assert all(votes[n] == "pass" for n in ("Arjun", "Ananya", "Vikram", "Farah"))
    types = [e["type"] for e in run.events]
    assert types.index("deal") < types.index("judging")
    shark = find_persona(run.snapshot(), "meera")
    assert "How it ended: a deal with Meera Kapoor" in shark.system
    assert "10% equity" in shark.system


async def test_sharks_team_up_and_compete(settings):
    script = {
        "Meera": [OFFER, {"decision": "improve", "terms": terms(50, 8)}],
        "Arjun": [{"decision": "join", "partner_id": "meera"}],
        "Ananya": [{"decision": "offer", "terms": terms(25, 4, debt=25, interest=12)}],
    }
    run = await play(settings, script, [{"action": "walk"}])
    table = of(run, "founder_choice")[0]["offers"]
    joint = next(o for o in table if o["id"] == "meera")
    assert joint["sharks"] == ["meera", "arjun"] and joint["equity_pct"] == 8  # improved
    assert {o["id"] for o in table} == {"meera", "ananya"}
    assert of(run, "deal")[0]["reason"] == "walked"
    assert verdict_stances(run)["Arjun"] == "invest"


async def test_accepted_counter_uses_the_founders_numbers(settings):
    script = {"Meera": [OFFER, {"decision": "accept", "terms": terms(1, 70)}]}
    run = await play(settings, script, [{"action": "counter", "offer_id": "meera",
                                         "investment_lakh": 50, "equity_pct": 7}])
    deal = of(run, "deal")[0]
    assert deal["reason"] == "counter_accepted"
    assert (deal["offer"]["investment_lakh"], deal["offer"]["equity_pct"]) == (50, 7)


async def test_one_counter_only_then_the_revised_offer_can_be_taken(settings):
    script = {"Meera": [OFFER, {"decision": "revise", "terms": terms(50, 9)}]}
    run = await play(settings, script, [
        {"action": "counter", "offer_id": "meera", "investment_lakh": 50, "equity_pct": 6},
        {"action": "accept", "offer_id": "meera"}])
    assert [c["can_counter"] for c in of(run, "founder_choice")] == [True, False]
    assert of(run, "deal")[0]["offer"]["equity_pct"] == 9


async def test_a_shark_can_walk_out_on_a_counter(settings):
    script = {"Meera": [OFFER, {"decision": "out"}]}
    run = await play(settings, script, [{"action": "counter", "offer_id": "meera",
                                         "investment_lakh": 50, "equity_pct": 1}])
    assert of(run, "deal")[0]["reason"] == "withdrawn"
    assert verdict_stances(run)["Meera"] == "pass"


async def test_all_out_and_timeout(settings):
    nobody = await play(settings, {}, [])
    assert of(nobody, "deal")[0]["reason"] == "all_out" and not of(nobody, "founder_choice")
    silent = await play(settings.model_copy(update={"deal_wait_s": 0.05}), {"Meera": [OFFER]}, [])
    assert of(silent, "deal")[0]["reason"] == "timeout" and silent.open_deal is None


async def test_bad_terms_are_retried_never_shown(settings):
    bad = {"decision": "offer", "terms": terms(5000, 99)}
    run = await play(settings, {"Meera": [bad, OFFER]}, [{"action": "walk"}])
    shown = [e["offer"] for e in of(run, "offer") if e["offer"]]
    assert [o["equity_pct"] for o in shown] == [10]


async def test_a_shark_who_cannot_make_a_valid_move_is_skipped(settings):
    bad = {"decision": "offer", "terms": terms(5000, 99)}
    run = await play(settings, {"Meera": [bad, bad, bad]}, [])
    assert of(run, "deal")[0]["reason"] == "no_offers"  # not "all out": Meera never answered
    assert any("didn't make a move" in n["text"] for n in of(run, "notice"))


async def test_deal_budget_is_separate_and_capped(settings):
    broke = settings.model_copy(update={"deal_reserve_tokens": 0})
    run = await play(broke, {"Meera": [OFFER]}, [])
    assert not of(run, "offer") and of(run, "verdict")  # no spend on offers, verdict still lands


async def test_free_fake_ai_can_run_the_whole_table(settings):
    llms = build_llms(settings.model_copy(update={"deal_wait_s": 0.05}), UserKeys())
    session = DebateSession("sharks", dict(ASK))
    await run_debate(session, llms, settings.model_copy(update={"deal_wait_s": 0.05}),
                     DailyBudget(10**9), byok=False)
    assert of(session, "deal") and of(session, "verdict") and not of(session, "error")
    assert not any("didn't make a move" in n["text"] for n in of(session, "notice"))


def test_term_limits_and_improvement_rule():
    ask = deals.make_ask(ASK)
    deals.check_terms(terms(25, 5, debt=25, interest=12, royalty=2, until=40), ask)
    deals.check_terms(terms(0, 0, debt=50, interest=10), ask)  # a pure loan
    for bad in (terms(10, 5), terms(200, 5), terms(50, 80), terms(50, 0), terms(0, 5, debt=50),
                terms(50, 5, royalty=2), terms(50, 5, royalty=20, until=50),
                terms(25, 5, debt=25, interest=40)):
        with pytest.raises(ValueError):
            deals.check_terms(bad, ask)
    assert deals.is_better(terms(50, 8), terms(50, 10))
    assert not deals.is_better(terms(50, 10), terms(50, 10))
    assert not deals.is_better(terms(50, 8, royalty=1, until=50), terms(50, 10))


def test_nobody_leaves_in_round_one_and_requests_are_validated():
    turn = SharkTurn(message="x" * 60, out=True, stance="pass", confidence=5)
    with pytest.raises(ValueError, match="round 1"):
        round_check(1, lambda t: None)(turn)
    round_check(2, lambda t: None)(turn)
    with pytest.raises(ValidationError):
        CreateDebate(mode="sharks", pitch=PITCH, ask_amount_lakh=50)
    for bad in ({"action": "accept"}, {"action": "counter", "offer_id": "meera"}):
        with pytest.raises(ValidationError):
            FounderDeal(**bad)


def test_deal_endpoint_guards(settings):
    with TestClient(create_app(settings)) as client:
        assert client.post("/api/debates/nope/deal", json={"action": "walk"}).status_code == 404
        sessions = client.app.state.sessions
        live = sessions.create("sharks", {})
        url = f"/api/debates/{live.id}/deal"
        assert client.post(url, json={"action": "walk"}).status_code == 409  # nothing open
        live.open_deal = {"offer_ids": ["meera"], "can_counter": False}
        assert client.post(url, json={"action": "accept", "offer_id": "arjun"}).status_code == 409
        assert client.post(url, json={"action": "counter", "offer_id": "meera",
                                      "investment_lakh": 50, "equity_pct": 5}).status_code == 409
        assert client.post(url, json={"action": "accept", "offer_id": "meera"}).status_code == 200
        assert client.post(url, json={"action": "walk"}).status_code == 409  # already answered


# ---------- why no shark ever made an offer (27 Nov 2026) ----------
# Replaying the deal-table move on real AI: 0 offers in 10 with "Going out is a good answer
# if your doubts were not resolved", 6 in 10 once sharks were told to price risk in. 4 of
# those 6 then kept the valuation they had just called "pagalpan".

def test_deal_prompt_prices_risk_in_instead_of_walking_out():
    from app import prompts
    from app.personas import load_sharks
    text = prompts.deal_system(load_sharks()[0])
    assert "Going out is a good answer" not in text
    assert "ANY valuation" in text and "more equity" in text


def test_calling_the_valuation_too_high_needs_a_lower_valuation():
    from app.debates.deals import check_valuation_stance
    ask = {"investment_lakh": 40, "equity_pct": 8, "valuation_lakh": 500}
    vikram = ("180 subscribers pe 5 crore ka valuation aur 12 months ki Pune limit mujhe "
              "pagalpan lagti hai. Main 60 lakh mein 12% equity lunga.")
    with pytest.raises(ValueError, match="more equity"):
        check_valuation_stance(vikram, {"investment_lakh": 60, "equity_pct": 12}, ask)  # ₹5 cr
    check_valuation_stance(vikram, {"investment_lakh": 60, "equity_pct": 20}, ask)  # ₹3 cr
    farah = ("Main seedha 5 crore ka valuation nahi maan sakti, isliye main 60 lakh ka offer "
             "15% equity ke liye de rahi hoon.")
    check_valuation_stance(farah, {"investment_lakh": 60, "equity_pct": 15}, ask)  # ₹4 cr
    happy = "Payback in 1.1 months is strong, so I take your 40 lakh for 8%."
    check_valuation_stance(happy, {"investment_lakh": 40, "equity_pct": 8}, ask)
    debt_only = "The valuation is too high for me, so I will lend you 40 lakh instead."
    check_valuation_stance(debt_only, {"investment_lakh": 0, "equity_pct": 0}, ask)


def test_a_revising_shark_may_quote_the_founders_counter(settings):
    """First real counter (27 Nov 2026): Farah revised and mentioned the counter's ₹3 crore
    valuation, and her reply was rejected as an unknown figure."""
    from app.debates.deals import Table, make_offer
    from app.models import OfferTerms, SharkCounterReply
    from app.personas import load_sharks
    sharks = load_sharks()
    farah = next(p for p in sharks if p.id == "farah")
    ask = deals.make_ask({"ask_amount_lakh": 40, "ask_equity_pct": 8})
    session = DebateSession("sharks", {"pitch": PITCH})
    table = Table(session, build_llms(settings, UserKeys()), settings, sharks, PITCH, ask, [])
    zero = {k: 0.0 for k in deals.TERM_KEYS}
    table.offers["farah"] = make_offer([farah], {**zero, "investment_lakh": 36, "equity_pct": 20})
    counter = make_offer([farah], {**zero, "investment_lakh": 36, "equity_pct": 12})
    revised = {**zero, "investment_lakh": 36, "equity_pct": 16}
    out = SharkCounterReply(decision="revise", terms=OfferTerms(**revised),
                            message="Aapka 3 crore ka counter zyada hai, main 36 lakh mein 16% "
                                    "equity par final offer deti hoon.")
    table.speech_check(farah, out, counter, revised)  # no longer raises


async def test_deal_figures_reach_the_judges_record(settings):
    """The verdict must be allowed to quote offers and counters (first real deal, 27 Nov
    2026: "Rs 36 lakh" got the judge rejected three times)."""
    from app.debates.deals import Table, make_offer
    from app.personas import load_sharks
    sharks = load_sharks()
    ask = deals.make_ask({"ask_amount_lakh": 40, "ask_equity_pct": 8})
    record: set[float] = {4e6}
    table = Table(DebateSession("sharks", {"pitch": PITCH}), build_llms(settings, UserKeys()),
                  settings, sharks, PITCH, ask, [], record)
    zero = {k: 0.0 for k in deals.TERM_KEYS}
    offer = make_offer([sharks[-1]], {**zero, "investment_lakh": 36, "equity_pct": 20})
    await table.say("offer", sharks[-1], "Main 36 lakh mein 20% equity lungi.", "offer", offer)
    assert 36e5 in record and 180e5 in record  # the money and the ₹1.8 crore valuation


def test_a_revised_offer_sits_between_the_original_and_the_counter():
    """Real run (27 Nov 2026): Farah offered 40 lakh for 16%, the founder countered 10%, and
    her "final offer" was 20%, worse for the founder than where she started."""
    from app.debates.deals import check_between
    zero = {k: 0.0 for k in deals.TERM_KEYS}
    original = {**zero, "investment_lakh": 40, "equity_pct": 16}
    counter = {**zero, "investment_lakh": 40, "equity_pct": 10}
    with pytest.raises(ValueError, match="equity % is 20, outside 10 to 16"):
        check_between({**original, "equity_pct": 20}, original, counter)
    check_between({**original, "equity_pct": 13}, original, counter)  # meets halfway
    with pytest.raises(ValueError, match="choose \"hold\""):
        check_between(dict(original), original, counter)
    with pytest.raises(ValueError, match="choose \"accept\""):
        check_between(dict(counter), original, counter)
    with pytest.raises(ValueError, match="royalty % is 5"):  # sneaking in a new royalty
        check_between({**original, "equity_pct": 13, "royalty_pct": 5, "royalty_until_lakh": 40},
                      original, counter)


def test_counter_prompt_states_the_range():
    from app import prompts
    zero = {k: 0.0 for k in deals.TERM_KEYS}
    ask = deals.make_ask({"ask_amount_lakh": 40, "ask_equity_pct": 8})
    text = prompts.counter_user(PITCH, ask, [], {**zero, "investment_lakh": 40, "equity_pct": 16},
                                {**zero, "investment_lakh": 40, "equity_pct": 10}, "Farah Merchant")
    assert "equity between 16% and 10%" in text and "never worse for the founder" in text
