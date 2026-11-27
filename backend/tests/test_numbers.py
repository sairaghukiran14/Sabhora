"""Figures the sharks are allowed to say, and the rules added after the first real run.

Every example here is taken from that run (26 Nov 2026), where five sharks repeated an
invented "₹4,812 a month" for 18 shops at ₹299, called a four-month payback "decades",
reworded each other, and all opened at "pass" before the founder had answered anything.
"""
import pytest
from pydantic import ValidationError

from app.debates import numbers
from app.debates.sharks import round_check, turn_check
from app.llm.base import inline_refs
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
    answer = ANSWER + " Gross margin is 70%."  # a shark may not assume this for itself
    allowed = numbers.established(PITCH, [answer], ASK)
    turn_check(PITCH, [("Founder", answer)], allowed)(turn(
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


# ---------- second real web run (27 Nov 2026) ----------
# 5 of 15 shark turns were dropped for CORRECT figures done in the head, and two sharks
# called 25 meals of payback "25 months" and "25 weeks".

DABBA = ("DabbaDost: tiffins for working professionals in Pune. Rs 3,200 a month for 22 "
         "lunches. 180 paying subscribers after 5 months, 64% renew month 2. Food cost Rs 85 "
         "per meal, delivery Rs 18 per meal.")
DABBA_ANSWER = ("Unit economics: revenue per meal is Rs 145 (3200/22). Food 85 + delivery 18 + "
                "packaging 6 = Rs 109, so Rs 36 gross margin per meal. CAC is Rs 900.")


def dabba_allowed() -> set[float]:
    arjun = Calc(expression="180 * 0.64", value=115.2)  # his shown working, said as "115"
    return (numbers.established(DABBA, [DABBA_ANSWER], ASK) | numbers.check_calcs([arjun]))


@pytest.mark.parametrize("said", ["₹5,76,000 a month", "576000 rupees", "6480 rupees margin",
                                  "₹4,140 a month", "about ₹6,500 a month"])
def test_correct_mental_arithmetic_on_the_record_passes(said):
    numbers.check_message(said, dabba_allowed())  # 180x3200, 180x36, 115x36, ~180x36


def test_invented_figures_still_fail_one_step_matching():
    allowed = numbers.established(PITCH, [ANSWER], ASK)
    with pytest.raises(ValueError):
        numbers.check_message("₹4,812 a month", allowed)  # 18 x 299 is 5,382
    numbers.check_message("₹5,382 a month", allowed)
    with pytest.raises(ValueError):
        numbers.check_message("₹6,483 a month", dabba_allowed())  # precise, but not 6,480


def test_meals_called_months_are_caught():
    record = [DABBA, DABBA_ANSWER]
    for wrong in ["Rs 36 gross margin per meal mein Rs 900 CAC nikalne par payback period "
                  "25 months banta hai",
                  "900 / 36 = 25 meals banta hai, matlab 25 weeks, not 5 weeks."]:
        assert "number of meals" in numbers.unit_mixup(wrong, record)
    for fine in ["25 / 22 = 1.14 months, yaani lagbhag 5 weeks hai",  # Farah, correct
                 "After 5 months you have 180 subscribers",
                 "36% churn ka matlab hai 8 mahine mein aadha customer chala jayega"]:
        assert numbers.unit_mixup(fine, record) is None, fine


# ---------- the numbers inside the maths must be established too ----------
# "4812000 * 1" is correct arithmetic, and it used to turn any invented figure into a
# checked one.

@pytest.mark.parametrize("expression", [
    "4812000 * 1", "4812000", "4812 * 1000", "481.2 * 10000", "4800000 + 12000",
    "12 * 1000",           # constants only: nothing from the record
    "180 * 26733",         # one real figure does not vouch for an invented one
])
def test_maths_cannot_launder_an_invented_figure(expression):
    calc = Calc(expression=expression, value=numbers.evaluate(expression))
    with pytest.raises(ValueError, match="your maths"):
        numbers.check_calcs([calc], dabba_allowed())


def test_the_bypass_is_closed_for_a_whole_turn_and_nothing_is_recorded():
    allowed = numbers.established(PITCH, [ANSWER], ASK)
    before = set(allowed)
    check = turn_check(PITCH, [("Founder", ANSWER)], allowed)
    with pytest.raises(ValueError, match="your maths"):
        check(turn("Your market has 4812000 kirana shops waiting, so how will you reach them?",
                   [Calc(expression="4812000 * 1", value=4812000)]))
    assert allowed == before


@pytest.mark.parametrize("expression", [
    "180 * 3200", "180 * 0.64", "900 / 36 / 22", "900 / (36 * 22)", "3200 / 22 - 85 - 18 - 6",
    "(85 + 18 + 6) * 22", "109 * 22", "103 * 22",   # 103 = 85 + 18
    "40 * 100 / 8",        # the ask, in lakh and percent
    "36 * 22 * 12",
])
def test_sums_built_from_the_record_still_pass(expression):
    calc = Calc(expression=expression, value=numbers.evaluate(expression))
    numbers.check_calcs([calc], numbers.established(DABBA, [DABBA_ANSWER], ASK | {
        "investment_lakh": 40, "equity_pct": 8, "valuation_lakh": 500}))


def test_a_later_maths_line_may_use_an_earlier_result_even_rounded():
    numbers.check_calcs([Calc(expression="3200 / 22", value=145.4545),
                         Calc(expression="145.45 - 109", value=36.45),
                         Calc(expression="900 / 36.45", value=24.69)], dabba_allowed())
    with pytest.raises(ValueError, match="your maths"):  # not before the line that makes it
        numbers.check_calcs([Calc(expression="145.45 - 109", value=36.45)],
                            numbers.established(DABBA, [], None))


def test_a_middle_step_must_be_shown_on_its_own_line():
    allowed = numbers.established(DABBA, [DABBA_ANSWER], ASK)
    with pytest.raises(ValueError, match="uses 25"):
        numbers.check_calcs([Calc(expression="25 / 22", value=1.136)], allowed)
    numbers.check_calcs([Calc(expression="900 / 36", value=25),
                         Calc(expression="25 / 22", value=1.136)], allowed)


def test_a_shark_may_not_assume_its_own_margin():
    check = turn_check(PITCH, [("Founder", ANSWER)], numbers.established(PITCH, [ANSWER], ASK))
    with pytest.raises(ValueError, match="0.7"):
        check(turn("At my guess of a 70 percent margin, each shop earns you about ₹209.",
                   [Calc(expression="299 * 0.7", value=209.3)]))


def test_a_reply_must_include_maths_though_it_may_be_empty():
    """Left optional, the real model skipped it in 21 of 21 replies (27 Nov 2026)."""
    schema = inline_refs(SharkTurn.model_json_schema())
    assert "maths" in schema["required"] and list(schema["properties"])[0] == "maths"
    reply = {"message": "x" * 60, "out": False, "stance": "maybe", "confidence": 5}
    with pytest.raises(ValidationError, match="maths"):
        SharkTurn.model_validate(reply)
    assert SharkTurn.model_validate(reply | {"maths": []}).maths == []
