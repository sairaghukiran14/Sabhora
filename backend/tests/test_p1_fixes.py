"""The P1 problems from the first real web run (reports/full-product-real-ai-test-2026-11-26.md).
Each test uses the real reply or pitch that showed the problem. All on the fake provider."""
import re

import pytest

from app.budget import DailyBudget
from app.debates.janta import segment_breakdown, summary_check
from app.debates.runner import run_debate
from app.debates.sharks import MAX_EXITS_PER_ROUND, round_check, verdict_check
from app.llm.factory import UserKeys, build_llms
from app.llm.quality import ignores_record
from app.models import CrowdReaction, JantaSummary, SharkTurn
from app.personas import PERSONAS_DIR, generate_crowd
from app.sessions import DebateSession
from app.settings import Settings
from app.targeting import find_target

DABBA = ("DabbaDost: a subscription tiffin service for working professionals in Pune, cooked "
         "in 3 partner home kitchens. Rs 3,200 a month for 22 lunches. 180 paying subscribers "
         "after 5 months, 64% renew month 2. Food cost Rs 85 per meal, delivery Rs 18 per "
         "meal via own riders.\nTarget customer: Working professionals in Pune IT parks\n"
         "Price: Rs 3,200 a month")
ANSWER = ("Unit economics: revenue per meal is Rs 145 (3200/22). Food 85 + delivery 18 = Rs 103, "
          "so Rs 42 gross margin per meal, 29%. CAC is Rs 900 via office WhatsApp groups, paid "
          "back in about 1 month. Kitchens are FSSAI registered.")


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(_env_file=None, env="test", fake_delay_s=0, founder_wait_s=0.3,
                    janta_pace_s=0, data_dir=str(tmp_path), llm_provider="fake",
                    judge_provider="fake")


# ---------- 1. Janta: no "why people agreed" when nobody agreed ----------

def summary(n_for: int, n_against: int) -> JantaSummary:
    point = "Software engineers in Pune liked the desk delivery by 1 pm."
    return JantaSummary(reasons_for=[point] * n_for, reasons_against=[point] * n_against,
                        advice=[point] * 3, headline="The crowd is split on the price.")


def test_summary_reasons_follow_the_votes():
    nobody_agreed = {"agree": 0, "neutral": 10, "disagree": 15}
    with pytest.raises(ValueError, match="reasons_for must have exactly 0"):
        summary_check(nobody_agreed)(summary(3, 3))  # the real reply: 3 invented reasons
    summary_check(nobody_agreed)(summary(0, 3))
    two_agreed = {"agree": 2, "neutral": 0, "disagree": 1}
    summary_check(two_agreed)(summary(2, 1))
    with pytest.raises(ValueError):
        summary_check(two_agreed)(summary(3, 1))


# ---------- 2. Janta: the crowd leans to the founder's market ----------

def test_target_read_from_the_pitch():
    t = find_target(DABBA)
    assert t.cities == ("Pune",)
    assert set(t.jobs) == {"Software engineer", "Marketing executive"}
    # "own riders" in the pitch body is not a pitch to delivery riders
    assert "Delivery rider" not in t.jobs
    assert find_target("Kirana reorder app for Bangalore and Gurgaon shops").cities == (
        "Delhi", "Bengaluru")
    assert not find_target("An app for IT teams that automates renewals")  # IT is not a city


def test_targeted_crowd_is_mostly_in_market_and_untargeted_crowd_is_unchanged():
    t = find_target(DABBA)
    crowd = generate_crowd(25, cities=t.cities, jobs=t.jobs)
    inside = [p for p in crowd if p.in_market]
    assert len(inside) >= 17  # 70% of 25, plus anyone the usual spread puts there
    assert all(p.city == "Pune" and p.occupation in t.jobs for p in inside)
    assert generate_crowd(25) == generate_crowd(25, cities=(), jobs=())
    assert all(p.in_market is None for p in generate_crowd(25))


def test_market_is_the_first_segment():
    t = find_target(DABBA)
    crowd = generate_crowd(10, cities=t.cities, jobs=t.jobs)
    by_id = {p.id: p for p in crowd}
    votes = {p.id: CrowdReaction(persona_id=p.id, vote="agree" if p.in_market else "disagree",
                                 comment="x", would_pay=bool(p.in_market)) for p in crowd}
    seg = segment_breakdown(votes, by_id)
    assert list(seg)[0] == "Market"
    assert seg["Market"]["In your market"]["disagree"] == 0


async def test_janta_run_tells_the_founder_how_the_crowd_was_picked(settings):
    session = DebateSession("janta", {"pitch": DABBA, "panel_size": 20})
    session.id = "abcdef123456"
    await run_debate(session, build_llms(settings, UserKeys()), settings, DailyBudget(10**9),
                     byok=False)
    notes = [e["text"] for e in session.events if e["type"] == "notice"]
    assert any(n.startswith("Crowd matched to your market: 14 of 20") for n in notes)
    verdict = next(e for e in session.events if e["type"] == "verdict")
    assert "Market" in verdict["segments"]
    assert len(verdict["summary"]["reasons_for"]) == min(3, verdict["tally"]["agree"])


# ---------- 3. Sharks: no "never described" when the founder described it ----------

REAL_MISSES = [  # each said after the founder's ANSWER above
    "3 partner home kitchens par bina standardized quality check aur FSSAI compliance process "
    "samjhao, step by step, yeh model mere liye ek black box hai.",
    "Three partner home kitchens in Pune are a single point of failure, and no standardized "
    "quality check or FSSAI compliance process was described to the sharks.",
    "Main is stage par invest nahi kar sakti kyunki aapka unit economics abhi bhi ek black box hai.",
]
FAIR = [
    "CAC of 900 is fine, but without a second kitchen you are one bad day from shutting down.",
    "Your 29% margin is thin, and I worry what a 10% discount war does to it.",
    "FSSAI registration is the floor; who audits these kitchens every week?",
]


def test_calling_the_record_missing_is_caught():
    for text in REAL_MISSES:
        assert ignores_record(text, [DABBA, ANSWER]), text
    for text in FAIR:
        assert ignores_record(text, [DABBA, ANSWER]) is None, text
    # Before the founder answered, asking about FSSAI was a fair question
    assert ignores_record("Aapne nahi bataya ki kitchens mein FSSAI process hai.", [DABBA]) is None


def test_verdict_may_not_repeat_a_shark_misreading():
    class Raw:  # the shape of a keyed verdict, as the judge returns it
        one_liner = "DabbaDost has paying subscribers but unproven retention beyond month 2."
        top_risks = [REAL_MISSES[1], "Month-2 renewal of 64% means many subscribers leave early.",
                     "Rs 42 margin per meal leaves little room for discounts."]
        next_steps = ["Pull month-by-month cohort data for all 180 subscribers this month."] * 3
        votes = [("farah", type("V", (), {"reason": "She worries about kitchen audits."})())]
    with pytest.raises(ValueError, match="already covered FSSAI"):
        verdict_check(None, [DABBA, ANSWER])(Raw)


# ---------- 4. Sharks: no walk-out cascade ----------

def turn(out: bool) -> SharkTurn:
    return SharkTurn(maths=[], message="I'm out, beta: a 29 percent margin cannot carry a discount war "
                             "against bigger players in Pune.", out=out,
                     stance="pass" if out else "maybe", confidence=8)


def test_at_most_two_sharks_leave_per_round():
    ok = lambda t: None  # noqa: E731
    round_check(2, ok, exits_so_far=MAX_EXITS_PER_ROUND - 1)(turn(out=True))
    with pytest.raises(ValueError, match="already walked out"):
        round_check(2, ok, exits_so_far=MAX_EXITS_PER_ROUND)(turn(out=True))
    round_check(2, ok, exits_so_far=MAX_EXITS_PER_ROUND)(turn(out=False))  # staying is fine


def test_shark_styles_have_no_lines_to_parrot():
    """A quoted example line in a persona's style came back word for word in every turn
    (Farah: "process samjhao, step by step"; Ananya named Indore and Patna in a Pune pitch)."""
    for path in sorted((PERSONAS_DIR / "sharks").glob("*.yaml")):
        style = path.read_text(encoding="utf-8").split("style:")[1].split("cares_about:")[0]
        quoted = [q for q in re.findall(r'"([^"]+)"', style) if len(q.split()) > 1]
        assert not quoted, f"{path.name}: {quoted}"
        assert "Indore" not in style and "Patna" not in style


# ---------- 5. Janta: the attitude label no longer reaches the model ----------

def test_crowd_prompts_hide_the_attitude_label_by_default():
    from app import prompts
    from app.settings import Settings
    assert Settings(_env_file=None).janta_show_attitude is False
    person = generate_crowd(10)[0]
    hidden = prompts.crowd_user("An idea", [person], None, show_attitude=False)
    shown = prompts.crowd_user("An idea", [person], None)
    assert "General tendency" not in hidden and "General tendency" in shown
    assert person.pains[0] in hidden  # the facts about their life stay
    assert "early adopter" not in prompts.crowd_system(True, show_attitude=False).lower()
    assert "early adopter" in prompts.crowd_system(True).lower()


async def test_janta_run_sends_no_labels(settings, monkeypatch):
    from app.llm.fake_client import FakeClient
    seen: list[str] = []
    real = FakeClient.complete

    async def spy(self, system, user, **kw):
        seen.append(system + user)
        return await real(self, system, user, **kw)
    monkeypatch.setattr(FakeClient, "complete", spy)
    session = DebateSession("janta", {"pitch": DABBA, "panel_size": 10})
    session.id = "abcdef123456"
    await run_debate(session, build_llms(settings, UserKeys()), settings, DailyBudget(10**9),
                     byok=False)
    crowd_calls = [t for t in seen if "PEOPLE:" in t]
    assert crowd_calls and not any("General tendency" in t for t in crowd_calls)
    verdict = next(e for e in session.events if e["type"] == "verdict")
    assert "Attitude" not in verdict["segments"]


def test_chat_rebuilds_the_targeted_crowd_member():
    """Chat used generate_crowd(size) without the target, so a targeted crowd member got
    someone else's home, work and pain points."""
    from app.chat import find_persona
    t = find_target(DABBA)
    crowd = generate_crowd(10, cities=t.cities, jobs=t.jobs)
    p = next(x for x in crowd if x.in_market)
    snapshot = {"mode": "janta", "request": {"pitch": DABBA}, "events": [
        {"type": "start", "size": 10, "crowd": [{"id": p.id, "name": p.name, "age": p.age,
                                                 "city": p.city, "occupation": p.occupation}]},
        {"type": "reaction", "round": 1, "persona_id": p.id, "vote": "agree",
         "comment": "Desk delivery by 1 pm would save my lunch break.", "would_pay": True},
        {"type": "verdict"}]}
    chat = find_persona(snapshot, p.id)
    assert p.household in chat.system and p.work in chat.system


# ---------- 6. Sharks: stance matches words; no panel-wide echo; own deal terms ----------

def shark_turn(message: str, stance: str = "maybe", out: bool = False) -> SharkTurn:
    return SharkTurn(maths=[], message=message, out=out, stance=stance, confidence=6)


def test_stance_said_out_loud_or_contradicted_is_rejected():
    from app.debates.sharks import stance_error
    # Real third-run lines
    ananya = ("88% renewal month 3 baad achha hai, phir bhi yeh backup kitchen Swiggy ko nahi "
              "hara payega. Main invest kar rahi hoon, confidence 7.")
    assert "out loud" in stance_error(shark_turn(ananya, "invest"), ananya)
    vikram = "Par yeh kitchens kabhi bhi band ho sakte hain. Mera confidence 6 hai, stance maybe."
    assert "out loud" in stance_error(shark_turn(vikram), vikram)
    farah = "Supply chain sustain karne ka koi plan nahi dikha, isliye main abhi pass kar rahi hoon."
    assert stance_error(shark_turn(farah, "pass"), farah) is None
    assert "set stance to pass" in stance_error(shark_turn(farah, "invest"), farah)
    keen = "Payback in 1.1 months is real proof. I'll invest if the kitchens are audited."
    assert "set stance to invest" in stance_error(shark_turn(keen, "pass", out=True), keen)
    arjun = ("Main abhi pass nahi kar raha, par mujhe yeh jaanna hai ki in teeno partner kitchens "
             "ka unit economics kaisa dikhta hai.")  # real run-3 line; a negation, not passing
    assert stance_error(shark_turn(arjun), arjun) is None


def test_a_third_shark_cannot_repeat_the_panels_objection():
    from app.llm.quality import crowded_objection
    said = [("Arjun Reddy", "Yeh home-kitchen wrapper hai jisme switching cost zero hai."),
            ("Ananya Iyer", "Swiggy aur Zomato ke saamne zero switching cost hai.")]
    farah = "Pune ke IT parks mein zero switching cost ke saath yeh commitment risky hai."
    assert "Ananya Iyer and Arjun Reddy" in crowded_objection(farah, "Farah Merchant", said)
    assert crowded_objection(farah, "Arjun Reddy", said) is None  # one of the two may go on
    fresh = "Agar ek kitchen ka FSSAI audit fail hua toh poore Pune ka lunch band ho jayega."
    assert crowded_objection(fresh, "Farah Merchant", said) is None
    founder_said = said + [("Founder", "Switching cost is low, so we win on taste.")]
    assert crowded_objection(farah, "Farah Merchant", founder_said) is None


def test_prompt_lists_objections_already_taken():
    from app import prompts
    said = [("Arjun Reddy", "No moat, zero switching cost."), ("Ananya Iyer", "Switching cost is zero.")]
    text = prompts.shark_user(DABBA, said, 2, 3, "Farah Merchant")
    assert "POINTS ALREADY MADE BY TWO SHARKS" in text and "switching cost" in text


def test_verdict_reason_may_quote_only_that_sharks_offer():
    from app.debates.sharks import offer_figures, verdict_check
    zero = {"debt_lakh": 0.0, "debt_interest_pct": 0.0, "royalty_pct": 0.0, "royalty_until_lakh": 0.0}
    events = [
        {"type": "offer", "speaker": "vikram", "offer": {"sharks": ["vikram"], "investment_lakh": 24,
         "equity_pct": 15, **zero, "royalty_pct": 10, "royalty_until_lakh": 48}},
        {"type": "offer", "speaker": "farah", "offer": {"sharks": ["farah"], "investment_lakh": 36,
         "equity_pct": 20, **zero}},
    ]
    figs = offer_figures(events)
    V = lambda r: type("V", (), {"reason": r})()  # noqa: E731

    class Raw:
        one_liner = "DabbaDost turns Pune office lunches into a habit that pays back in a month."
        top_risks = ["Three partner kitchens are a single supply risk for 180 subscribers."] * 3
        next_steps = ["Track cohort renewal for every subscriber for 60 days."] * 3
        votes = [("vikram", V("Vikram invested on the accepted terms of Rs 36 lakh for 20 percent.")),
                 ("farah", V("Farah invested Rs 36 lakh for 20 percent equity in the kitchens."))]
    with pytest.raises(ValueError, match="another shark's offer"):
        verdict_check(None, None, figs)(Raw)
    Raw.votes = [("vikram", V("Vikram offered Rs 24 lakh plus a royalty until Rs 48 lakh is repaid.")),
                 Raw.votes[1]]
    verdict_check(None, None, figs)(Raw)


def test_cities_nobody_mentioned_and_score_talk_are_caught():
    """Fourth real run (27 Nov 2026): Ananya asked about "Meerut ya Kochi" in a Pune-only
    pitch and ended a turn with "Maybe, 5/10."."""
    from app.debates.sharks import stance_error
    from app.llm.quality import unmentioned_city
    ananya = ("Aapka model sirf Pune ke English-speaking IT crowd tak limited hai, Meerut ya Kochi "
              "tak language aur trust ka scale kaise jayega? Maybe, 5/10.")
    assert unmentioned_city(ananya, [DABBA]) == "Meerut"
    assert unmentioned_city("Pune IT parks mein delivery by 1 pm tight hai.", [DABBA]) is None
    assert "out loud" in stance_error(shark_turn(ananya), ananya)


# ---------- 7. Payback worked out in code ----------
# Fourth real run (27 Nov 2026): "900 divided by 15 which is 60 months, yaani 5 saal". Right
# arithmetic, meaningless formula; two sharks and the judge repeated it.

def test_payback_is_worked_out_from_the_founders_numbers():
    from app.debates.metrics import payback
    assert payback([DABBA]) is None  # no CAC yet: nothing to work out
    pb = payback([DABBA, ANSWER])
    assert round(pb.months, 2) == 0.97  # 900 / (42 x 22), ANSWER's figures
    assert "₹42 margin per meal × 22 meals a month" in pb.how
    # price x margin % when there is no per-unit margin
    saas = "BillBook: invoicing for shops at Rs 499 a month with 80% gross margin. CAC is Rs 2,000."
    assert round(payback([saas]).months, 1) == 5.0


def test_wrong_paybacks_are_rejected_and_close_ones_pass():
    from app.debates.metrics import payback_error
    record = [DABBA, ANSWER]
    for wrong in ["Rs 900 CAC ke saath payback period 900 divided by 15 which is 60 months, yaani 5 saal hai.",
                  "Rs 900 CAC ka matlab hai ki aapka payback period lagbhag 5 saal ban raha hai.",
                  "The 900 rupee CAC over 15 new subscribers per month implies a roughly 60-month payback.",
                  "Rs 36 margin per meal mein Rs 900 CAC nikalne par payback period 25 months banta hai."]:
        assert "about 1.0 months" in payback_error(wrong, record), wrong
    for fine in ["Rs 42 margin per meal aur Rs 900 CAC dekar tumhara payback 1.4 months aa raha hai.",
                 "900 / 42 = 21 meals, matlab roughly 1 month.",
                 "Pays back in about five weeks if churn stays low."]:
        assert payback_error(fine, record) is None, fine


def test_sharks_and_judge_see_the_payback_as_a_fact():
    from app import prompts
    from app.personas import load_sharks
    text = prompts.shark_user(DABBA, [("Founder", ANSWER)], 2, 3, "Vikram Sethia")
    assert "CAC payback, worked out from the founder's numbers" in text and "1.0 months" in text
    verdict = prompts.verdict_user(DABBA, [("Founder", ANSWER)], list(load_sharks()), {})
    assert "about 1.0 months" in verdict


# Real run of 27 Nov 2026: all three of Vikram's offers had the payback right and were
# rejected, because a later "12 months" (the founder's time in Pune) was read as one.
@pytest.mark.parametrize("said", [
    "1.1 months ka CAC payback sunke mera pet nahi bhara kyunki tu 12 months mein Pune chhodne wala hai.",
    "1.1 months ka CAC payback accha hai par 12 months ka Pune expiry risk hai, isliye valuation cut kar raha hoon.",
    "1.1 months ka CAC payback accha lagta hai, par 12 months mein Pune se bahar koi plan nahi hai.",
    "Payback is quick, but you leave Pune in 12 months.",
    "Payback theek hai lekin 12 months baad kya karoge?",
])
def test_a_duration_about_something_else_is_not_a_payback(said):
    from app.debates.metrics import payback_error
    assert payback_error(said, [DABBA, ANSWER]) is None, said


@pytest.mark.parametrize("said", [
    "A 60-month payback is far too long for me.",
    "CAC payback, jo aap bata rahe ho, 60 months hai.",
    "1 month ka payback nahi hai, actual payback 60 months banta hai.",
    "1 month ka payback bolte ho par asli payback period 5 saal hai.",
    "Par payback to 25 months ka hai.",
    "You will recover the CAC only after 2 years.",
])
def test_a_wrong_payback_is_still_rejected(said):
    from app.debates.metrics import payback_error
    assert payback_error(said, [DABBA, ANSWER]), said
