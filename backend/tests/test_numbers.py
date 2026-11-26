"""Figures the sharks are allowed to say, and the rules added after the first real run.

Every example here is taken from that run (26 Nov 2026), where five sharks repeated an
invented "₹4,812 a month" for 18 shops at ₹299, called a four-month payback "decades",
reworded each other, and all opened at "pass" before the founder had answered anything.
"""
import pytest

from app.debates import numbers
from app.debates.sharks import round_check, turn_check
from app.llm.quality import repeats_point
from app.models import Calc, SharkTurn

PITCH = ("StockSaathi: a WhatsApp-first app that lets kirana shops reorder stock in one tap.\n"
         "Price: ₹299 a month")
ASK = {"investment_lakh": 50, "equity_pct": 5, "valuation_lakh": 1000}
ANSWER = "40 shops in Indore, 32 reorder weekly, 18 pay ₹299 a month. CAC is about ₹900."


def turn(message: str, maths=(), stance="maybe", out=False) -> SharkTurn:
    return SharkTurn(maths=list(maths), message=message.ljust(60), out=out, stance=stance,
                     confidence=7)


# ---------- reading figures out of text ----------

def test_rupees_lakh_and_crore_are_understood():
    found = {m.raw: (m.value, m.checked) for m in numbers.mentions(
        "₹299 a month, 18 shops, ₹4,812 total, ₹50 lakh for 5%, ₹2.5 crore, 70 percent")}
    assert found["₹50 lakh"] == (5_000_000, True)
    assert found["₹2.5 crore"] == (25_000_000, True)
    assert found["₹4,812"] == (4812, True)      # comma grouping, and big enough to check
    assert found["₹299"] == (299, True)         # small, but written as money
    assert found["18"] == (18, False)           # a count, not a claim about money
    assert found["5"][1] is False and found["70"][1] is False  # percentages


def test_established_figures_come_from_the_pitch_the_ask_and_the_founder():
    allowed = numbers.established(PITCH, [ANSWER], ASK)
    for value in (299, 40, 32, 18, 900, 50 * 1e5, 1000 * 1e5):
        assert numbers.matches(value, allowed), value
    assert not numbers.matches(4812, allowed)


# ---------- arithmetic ----------

def test_only_plain_arithmetic_is_evaluated():
    assert numbers.evaluate("18 * 299") == 5382
    assert numbers.evaluate("(900 / (299 * 0.7))") == pytest.approx(4.3, abs=0.05)
    for refused in ("2 ** 999999", "__import__('os').system('ls')", "1/0", "x + 1", "", "9" * 90):
        assert numbers.evaluate(refused) is None


def test_wrong_arithmetic_is_rejected_with_the_right_answer():
    numbers.check_calcs([Calc(expression="18 * 299", value=5382)])
    with pytest.raises(ValueError, match="5,382"):
        numbers.check_calcs([Calc(expression="18 * 299", value=4812)])
    with pytest.raises(ValueError, match="plain arithmetic"):
        numbers.check_calcs([Calc(expression="eighteen times 299", value=5382)])


# ---------- what a shark may say ----------

def test_the_invented_figure_from_the_real_run_is_rejected():
    check = turn_check(PITCH, [("Founder", ANSWER)], numbers.established(PITCH, [ANSWER], ASK))
    with pytest.raises(ValueError, match="4,812"):
        check(turn("18 paying stores at ₹299 is only ₹4,812 a month, which is nothing."))


def test_a_figure_the_shark_works_out_is_allowed_and_then_shared():
    allowed = numbers.established(PITCH, [ANSWER], ASK)
    check = turn_check(PITCH, [("Founder", ANSWER)], allowed)
    check(turn("Eighteen payers at ₹299 is ₹5,382 a month, so you are not a business yet.",
               [Calc(expression="18 * 299", value=5382)]))
    assert numbers.matches(5382, allowed)  # a later shark may now quote it without redoing it
    turn_check(PITCH, [], allowed)(turn("That ₹5,382 a month will not cover one salary, boss."))


def test_rounding_a_figure_you_established_is_fine():
    allowed = numbers.established(PITCH, [ANSWER], ASK) | {5382.0}
    turn_check(PITCH, [], allowed)(turn("Roughly ₹5,400 a month is not a company, it is a side "
                                        "project with a WhatsApp number."))


def test_established_and_computed_payback_months_pass_untouched():
    allowed = numbers.established(PITCH, [ANSWER], ASK)
    turn_check(PITCH, [("Founder", ANSWER)], allowed)(turn(
        "₹900 to win a shop against ₹209 of margin is about 4.3 months of payback, not decades.",
        [Calc(expression="299 * 0.7", value=209.3),
         Calc(expression="900 / (299 * 0.7)", value=4.3)]))


# ---------- saying it in your own words ----------

def test_a_reworded_point_is_rejected_and_a_new_one_is_not():
    # Both turns are real, from round 3 of that debate. They are only 0.64 alike by
    # SequenceMatcher, so the old near-verbatim check waved the second one through.
    first = ("Arre, ₹900 per shop CAC aur sirf 18 paying stores se ₹5,382 monthly revenue "
             "matlab tumhara payback period toh kabhi nahi aayega. Distributors se abhi tak "
             "ek rupaya nahi liya, toh bina unke trust ke tumhara ₹299 ka model Patna aur "
             "Indore mein tikega nahi, yeh bilkul metro-first thinking hai.")
    echo = ("₹900 CAC aur 18 stores se ₹5,382 monthly revenue matlab tumhara payback period "
            "kabhi nahi aayega, seedhi baat karo. Distributors se abhi tak ek rupaya nahi "
            "liya, toh bina unke trust ke yeh ₹299 ka model tikega nahi, main out hoon "
            "kyunki yeh business bina distributor payment ke bas ek cash-burn feature hai.")
    fresh = ("Who actually signs the renewal at a kirana shop, the owner or the son who "
             "installed it? I want to hear one name and one renewal date.")
    assert repeats_point(echo, [first]) and not repeats_point(fresh, [first])
    check = turn_check(PITCH, [("Vikram Sethia", first)], numbers.established(PITCH, [ANSWER], ASK))
    with pytest.raises(ValueError, match="other words"):
        check(turn(echo))
    check(turn(fresh))


def test_quoting_the_founder_back_is_not_a_repeat():
    check = turn_check(PITCH, [("Founder", ANSWER)], numbers.established(PITCH, [ANSWER], ASK))
    check(turn("You said 32 of 40 reorder weekly, so the habit is real; the ₹900 to get each "
               "shop is what worries me now."))


# ---------- round 1 is for questions ----------

def test_nobody_takes_a_position_in_round_one():
    base = turn_check(PITCH, [], numbers.established(PITCH, [], ASK))
    for refused in (turn("Show me the churn before I believe any of this works.", stance="pass"),
                    turn("I love it, let us talk terms right now please.", stance="invest"),
                    turn("This is not for me at all, so I am leaving it.", stance="pass", out=True)):
        with pytest.raises(ValueError, match="round 1"):
            round_check(1, base)(refused)
    round_check(1, base)(turn("How many of the 40 shops reordered twice without a reminder?"))
    round_check(2, base)(turn("Still no proof of a second order, so I am passing on this.",
                              stance="pass"))
