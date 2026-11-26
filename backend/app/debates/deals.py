"""The Sharks deal table: offers, bidding against each other, and the founder's choice.

1. Every shark still in makes a move, keenest first: own offer, join another's, or "I'm out".
   Later sharks see earlier offers, so they can undercut or team up.
2. If two or more offers compete, those who haven't seen the final table get one chance to
   improve, hold or withdraw.
3. The founder accepts one, counters once, or walks away.

Models only choose; the code enforces the limits, works out valuations and decides what was
agreed. An accepted counter uses the founder's numbers, never a model's retelling of them.
"""
import asyncio
import logging
import re
import time

from .. import prompts
from ..budget import BudgetExceeded, TokenBudget
from ..llm.base import LLMError, complete_typed
from ..llm.factory import LLMs
from ..llm.quality import ignores_record, record_error, repeats_point, require_text
from ..models import OfferTerms, SharkCounterReply, SharkOffer, SharkRaise
from ..personas import Persona
from ..sessions import DebateSession
from ..settings import Settings
from . import metrics, numbers

log = logging.getLogger(__name__)

TERM_KEYS = tuple(OfferTerms.model_fields)
KEENEST_FIRST = {"invest": 0, "maybe": 1, "pass": 2}
MAX_EQUITY, MAX_ROYALTY, MAX_INTEREST = 75, 15, 24


def make_ask(request: dict) -> dict | None:
    amount, equity = request.get("ask_amount_lakh"), request.get("ask_equity_pct")
    if not amount or not equity:
        return None
    return {"investment_lakh": amount, "equity_pct": equity,
            "valuation_lakh": prompts.valuation_lakh(amount, equity)}


def tidy(terms: dict) -> dict:
    """Drop details that mean nothing, e.g. interest on a loan of zero."""
    t = {k: round(float(terms[k]), 2) for k in TERM_KEYS}
    if t["debt_lakh"] <= 0:
        t["debt_interest_pct"] = 0.0
    if t["royalty_pct"] <= 0:
        t["royalty_until_lakh"] = 0.0
    return t


def check_terms(t: dict, ask: dict) -> None:
    """The limits every offer must respect. Raises ValueError with what to fix."""
    total, wanted = t["investment_lakh"] + t["debt_lakh"], ask["investment_lakh"]
    if not 0.5 * wanted <= total <= 1.5 * wanted:
        raise ValueError(f"total money (equity plus debt) must be between {0.5 * wanted:g} and "
                         f"{1.5 * wanted:g} lakh")
    if (t["investment_lakh"] > 0) != (t["equity_pct"] > 0):
        raise ValueError("money paid for equity needs an equity percentage, and equity needs money")
    if t["equity_pct"] > MAX_EQUITY:
        raise ValueError(f"equity can be at most {MAX_EQUITY}%")
    if t["royalty_pct"] > MAX_ROYALTY:
        raise ValueError(f"royalty can be at most {MAX_ROYALTY}%")
    if t["royalty_pct"] > 0 and t["royalty_until_lakh"] <= 0:
        raise ValueError("a royalty needs royalty_until_lakh, the amount after which it stops")
    if t["debt_interest_pct"] > MAX_INTEREST:
        raise ValueError(f"interest can be at most {MAX_INTEREST}% a year")


# A sentence that calls the valuation too high, in English or Hinglish.
_VALUATION = re.compile(r"\bvaluations?\b|\bvaluing\b", re.IGNORECASE)
_TOO_HIGH = re.compile(
    r"too (high|much|rich|steep)|\bhigh\b|\bsteep\b|inflated|crazy|unjustified|"
    r"not justified|out of line|\bexpensive\b|\bpagalpan\b|\bbakwaas\b|\bgalat\b|"
    r"\bzyada\b|\bmehe?nga\b|nahi maan|can'?t accept|cannot accept|\brisky\b",
    re.IGNORECASE)


def calls_valuation_too_high(message: str) -> bool:
    return any(_VALUATION.search(s) and _TOO_HIGH.search(s)
               for s in re.split(r"(?<=[.!?।])\s+", message))


def check_valuation_stance(message: str, terms: dict, ask: dict) -> None:
    """A shark who calls the founder's valuation too high must offer a lower one. In the
    deal-table replay (27 Nov 2026), 4 of 6 offers kept the ₹5 crore valuation the same
    sharks had just called "pagalpan" and only raised the money."""
    worth = prompts.valuation_lakh(terms["investment_lakh"], terms["equity_pct"])
    if worth and worth >= ask["valuation_lakh"] and calls_valuation_too_high(message):
        raise ValueError(
            f"you said the valuation is too high, but your offer values the company at "
            f"{prompts.money(worth)}, no lower than the founder's "
            f"{prompts.money(ask['valuation_lakh'])}. Ask for more equity for your money, or "
            "say why the price is acceptable to you after all")


def is_better(new: dict, old: dict) -> bool:
    """Better for the founder: nothing got worse and something got better."""
    def score(t: dict) -> tuple[float, ...]:  # every entry: higher is better for the founder
        return (t["investment_lakh"], t["investment_lakh"] + t["debt_lakh"], -t["equity_pct"],
                -t["royalty_pct"], -t["debt_interest_pct"], -t["royalty_until_lakh"])
    pairs = list(zip(score(new), score(old), strict=True))
    return all(n >= o for n, o in pairs) and any(n > o for n, o in pairs)


_TERM_LABELS = {"investment_lakh": "equity money (lakh)", "equity_pct": "equity %",
                "debt_lakh": "debt (lakh)", "debt_interest_pct": "interest %",
                "royalty_pct": "royalty %", "royalty_until_lakh": "royalty cap (lakh)"}


def check_between(revised: dict, original: dict, counter: dict) -> None:
    """A revised offer after the founder's counter must sit between the shark's original
    offer and the counter, term by term. On the first real counter that got an answer
    (27 Nov 2026) Farah's "final offer" was 40 lakh for 20%, worse for the founder than her
    original 16%, after a counter of 10%."""
    if all(revised[k] == original[k] for k in TERM_KEYS):
        raise ValueError("that is your original offer unchanged: choose \"hold\" instead")
    if all(revised[k] == counter[k] for k in TERM_KEYS):
        raise ValueError("those are exactly the founder's terms: choose \"accept\" instead")
    for k in TERM_KEYS:
        low, high = sorted((original[k], counter[k]))
        if not low <= revised[k] <= high:
            raise ValueError(
                f"a revised offer must sit between your offer and the founder's counter on "
                f"every term, but your {_TERM_LABELS[k]} is {revised[k]:g}, outside "
                f"{low:g} to {high:g}. Meet the founder part of the way, or choose \"hold\"")


def terms_values(terms: dict) -> set[float]:
    """The rupee figures an offer puts on the table, so its sharks may say them out loud."""
    values = {terms[k] * 1e5 for k in ("investment_lakh", "debt_lakh", "royalty_until_lakh")
              if terms.get(k)}
    worth = prompts.valuation_lakh(terms.get("investment_lakh", 0), terms.get("equity_pct", 0))
    return values | ({worth * 1e5} if worth else set())


def make_offer(members: list[Persona], terms: dict) -> dict:
    """An offer as stored and streamed. Its id is the lead shark's id."""
    return {"id": members[0].id, "sharks": [p.id for p in members],
            "names": [p.name for p in members], **terms,
            "valuation_lakh": prompts.valuation_lakh(terms["investment_lakh"],
                                                     terms["equity_pct"])}


class Table:
    def __init__(self, session: DebateSession, llms: LLMs, s: Settings,
                 sharks: tuple[Persona, ...], pitch: str, ask: dict,
                 transcript: list[tuple[str, str]], allowed: set[float] | None = None) -> None:
        self.session, self.llms, self.s = session, llms, s
        self.sharks = {p.id: p for p in sharks}
        self.pitch, self.ask, self.transcript = pitch, ask, transcript
        # Figures established in the debate. No maths happens here, so this only grows with
        # what the offers and the founder's counter put on the table. Shared with the caller
        # (not copied), so the judge may quote them: on the first real deal (27 Nov 2026) the
        # verdict said "Rs 36 lakh" for the accepted offer, was rejected 3 times as an unknown
        # figure, and the run fell back to a generic verdict.
        self.allowed = allowed if allowed is not None else set()
        self.said: list[tuple[str, str]] = []  # (shark id, message) at the table
        self.offers: dict[str, dict] = {}
        self.stances: dict[str, str] = {}  # facts for the verdict
        self.debate_stances: dict[str, str] = {}  # where each shark ended the debate
        self.budget = TokenBudget(s.deal_reserve_tokens)
        session.budgets.append(self.budget)

    @property
    def standing(self) -> list[dict]:
        return list(self.offers.values())

    def speech_check(self, shark: Persona, out, *proposed: dict) -> None:
        """What a shark may say at the table: their own words, and only figures on it."""
        require_text("message", out.message, min_words=5)
        others = [m for who, m in self.said if who != shark.id]
        if repeats_point(out.message, others):
            raise ValueError("another shark has already said that at the table; give your "
                             "own reason in your own words")
        allowed = set(self.allowed)
        for offer in (*self.standing, *proposed):
            allowed |= terms_values(offer)
        numbers.check_message(out.message, allowed)
        topic = ignores_record(out.message, [self.pitch, *self.answers])
        if topic:
            raise ValueError(record_error(topic))
        mixup = numbers.unit_mixup(out.message, [self.pitch, *self.answers])
        if mixup:
            raise ValueError(mixup)
        wrong_payback = metrics.payback_error(out.message, [self.pitch, *self.answers])
        if wrong_payback:
            raise ValueError(wrong_payback)

    @property
    def answers(self) -> list[str]:
        return [text for who, text in self.transcript if who == "Founder"]

    async def ask_shark(self, shark: Persona, user: str, output, check):
        """One deal-table call. None if the model couldn't produce a valid move."""
        await self.session.emit("typing", speaker=shark.id, name=shark.name)
        try:
            return await complete_typed(self.llms.crowd, prompts.deal_system(shark), user,
                                        output, budget=self.budget, max_tokens=900,
                                        check=check, attempts=3)
        except LLMError as err:
            log.warning("deal turn failed",
                        extra={"debate_id": self.session.id, "error": str(err)[:300]})
            return None

    async def say(self, type_: str, shark: Persona, text: str, action: str,
                  offer: dict | None) -> None:
        note = f" [Terms: {prompts.terms_text(offer)}]" if offer else " [No offer]"
        self.transcript.append((shark.name, text + note))
        self.said.append((shark.id, text))
        if offer:
            self.allowed |= terms_values(offer)
        await self.session.emit(type_, speaker=shark.id, name=shark.name, text=text,
                                action=action, offer=offer)

    # ---- step 1: opening moves

    async def opening(self, order: list[Persona]) -> list[str]:
        """Returns the ids of sharks in the order they made or joined offers."""
        moved: list[str] = []
        for shark in order:
            joinable = {o["id"] for o in self.standing if len(o["sharks"]) == 1}

            def check(out: SharkOffer, joinable=joinable, shark=shark) -> None:
                if out.decision == "join" and out.partner_id not in joinable:
                    raise ValueError("join needs partner_id from the joinable offer ids: "
                                     f"{', '.join(sorted(joinable)) or 'none, so offer or out'}")
                terms = tidy(out.terms.model_dump())
                if out.decision == "offer":
                    check_terms(terms, self.ask)
                    check_valuation_stance(out.message, terms, self.ask)
                self.speech_check(shark, out, terms)

            out = await self.ask_shark(
                shark, prompts.offer_user(self.pitch, self.ask, self.transcript, self.standing,
                                          shark.name, self.debate_stances.get(shark.id)),
                SharkOffer, check)
            if out is None:
                await self.session.emit("notice", text=f"{shark.name} didn't make a move.")
                continue
            offer = None
            if out.decision == "offer":
                offer = self.offers[shark.id] = make_offer([shark], tidy(out.terms.model_dump()))
            elif out.decision == "join":
                host = self.offers[out.partner_id]
                offer = self.offers[out.partner_id] = make_offer(
                    [self.sharks[host["id"]], shark], {k: host[k] for k in TERM_KEYS})
            if offer:
                for member in offer["sharks"]:
                    self.stances[member] = "invest"
                moved.append(shark.id)
            else:
                self.stances[shark.id] = "pass"
            await self.say("offer", shark, out.message.strip(), out.decision, offer)
        return moved

    # ---- step 2: bidding against each other

    async def bidding(self, moved: list[str]) -> None:
        if len(self.offers) < 2:
            return
        # The last mover already saw the whole table; everyone else leading an offer hasn't.
        late = [oid for oid, o in self.offers.items() if moved and moved[-1] not in o["sharks"]]
        for oid in late:
            if len(self.offers) < 2:
                return
            mine, shark = self.offers[oid], self.sharks[oid]

            def check(out: SharkRaise, mine=mine, shark=shark) -> None:
                new = tidy(out.terms.model_dump())
                if out.decision == "improve":
                    check_terms(new, self.ask)
                    if not is_better(new, mine):
                        raise ValueError("an improved offer must be better for the founder with "
                                         "nothing made worse; otherwise choose hold")
                self.speech_check(shark, out, new if out.decision == "improve" else mine)

            out = await self.ask_shark(
                shark, prompts.raise_user(self.pitch, self.ask, self.transcript,
                                          self.standing, mine, shark.name), SharkRaise, check)
            if out is None:
                continue  # the offer stands unchanged
            if out.decision == "withdraw":
                self.withdraw(oid)
                offer = None
            else:
                if out.decision == "improve":
                    self.offers[oid] = make_offer([self.sharks[i] for i in mine["sharks"]],
                                                  tidy(out.terms.model_dump()))
                offer = self.offers[oid]
            await self.say("offer", shark, out.message.strip(), out.decision, offer)

    def withdraw(self, offer_id: str) -> None:
        for member in self.offers.pop(offer_id)["sharks"]:
            self.stances[member] = "pass"

    # ---- step 3: the founder's choice

    async def wait_for_founder(self, can_counter: bool) -> dict | None:
        self.session.open_deal = {"offer_ids": list(self.offers), "can_counter": can_counter}
        await self.session.emit("founder_choice", offers=self.standing, can_counter=can_counter,
                                wait_s=self.s.deal_wait_s,
                                expires_at=time.time() + self.s.deal_wait_s)
        try:
            return await asyncio.wait_for(self.session.deal_inbox.get(),
                                          timeout=self.s.deal_wait_s)
        except TimeoutError:
            return None
        finally:
            self.session.open_deal = None

    async def founder_choice(self) -> None:
        can_counter = True
        while self.offers:
            move = await self.wait_for_founder(can_counter)
            if move is None:
                return await self.close("timeout")
            if move["action"] == "walk":
                await self.session.emit("founder_deal", action="walk", offer=None)
                self.transcript.append(("Founder", "I'm walking away without a deal."))
                return await self.close("walked")
            offer = self.offers[move["offer_id"]]  # the API only lets standing ids through
            if move["action"] == "accept":
                await self.session.emit("founder_deal", action="accept", offer=offer)
                self.transcript.append(("Founder", f"I accept {' and '.join(offer['names'])}: "
                                                   f"{prompts.terms_text(offer)}."))
                return await self.close("accepted", offer)
            can_counter = False
            counter = make_offer(
                [self.sharks[i] for i in offer["sharks"]],
                tidy({**{k: offer[k] for k in TERM_KEYS},
                      "investment_lakh": move["investment_lakh"],
                      "equity_pct": move["equity_pct"],
                      "royalty_pct": offer["royalty_pct"] if move["royalty_pct"] is None
                      else move["royalty_pct"],
                      # a royalty the founder adds back keeps the offer's stop point
                      "royalty_until_lakh": offer["royalty_until_lakh"]
                      or move["investment_lakh"]}))
            await self.session.emit("founder_deal", action="counter", offer=counter)
            self.allowed |= terms_values(counter)
            self.transcript.append(("Founder", f"My counter to {' and '.join(offer['names'])}: "
                                               f"{prompts.terms_text(counter)}."))
            if await self.answer_counter(offer, counter):
                return None
        return await self.close("withdrawn")

    async def answer_counter(self, offer: dict, counter: dict) -> bool:
        """The lead shark answers. True if that closed a deal."""
        shark = self.sharks[offer["id"]]

        def check(out: SharkCounterReply) -> None:
            revised = tidy(out.terms.model_dump())
            if out.decision == "revise":
                check_terms(revised, self.ask)
                check_between(revised, {k: offer[k] for k in TERM_KEYS},
                              {k: counter[k] for k in TERM_KEYS})
            # The founder's counter is on the table whatever the shark decides: on the first
            # real counter (27 Nov 2026) a revising shark quoted its "₹3 crore" valuation and
            # the reply was rejected, because only the revised terms counted.
            proposed = (counter, revised) if out.decision == "revise" else (counter,)
            self.speech_check(shark, out, *proposed)

        try:
            out = await self.ask_shark(
                shark, prompts.counter_user(self.pitch, self.ask, self.transcript, offer,
                                            counter, shark.name), SharkCounterReply, check)
        except BudgetExceeded:
            out = None
        if out is None:
            await self.session.emit("notice", text=f"{shark.name} couldn't answer the counter. "
                                                   "The original offer still stands.")
            return False
        if out.decision == "accept":
            await self.say("counter_reply", shark, out.message.strip(), "accept", counter)
            await self.close("counter_accepted", counter)
            return True
        if out.decision == "out":
            self.withdraw(offer["id"])
            await self.say("counter_reply", shark, out.message.strip(), "out", None)
            return False
        if out.decision == "revise":
            self.offers[offer["id"]] = make_offer(
                [self.sharks[i] for i in offer["sharks"]], tidy(out.terms.model_dump()))
        await self.say("counter_reply", shark, out.message.strip(), out.decision,
                       self.offers[offer["id"]])
        return False

    async def close(self, reason: str, offer: dict | None = None) -> None:
        await self.session.emit("deal", outcome="deal" if offer else "no_deal",
                                reason=reason, offer=offer)
        # Name whose offer it was: with only the terms, the judge gave Farah's accepted deal to
        # Vikram as his reason (first real deal, 27 Nov 2026).
        self.transcript.append(("Result", f"Deal with {' and '.join(offer['names'])}: "
                                          f"{prompts.terms_text(offer)}" if offer
                                else f"No deal ({reason})."))


async def run_table(session: DebateSession, llms: LLMs, s: Settings,
                    sharks: tuple[Persona, ...], pitch: str, ask: dict,
                    transcript: list[tuple[str, str]], stances: dict[str, str],
                    gone: set[str], allowed: set[float] | None = None) -> dict[str, str]:
    """Runs the whole deal stage, appending to `transcript`. Returns the stances that are now
    facts: invest for sharks with an offer, pass for those who declined or withdrew."""
    table = Table(session, llms, s, sharks, pitch, ask, transcript, allowed)
    table.debate_stances = dict(stances)
    still_in = [p for p in sharks if p.id not in gone]
    still_in.sort(key=lambda p: KEENEST_FIRST.get(stances.get(p.id, "maybe"), 1))
    if still_in:
        await session.emit("offers_open")
        try:
            moved = await table.opening(still_in)
            await table.bidding(moved)
        except BudgetExceeded:
            await session.emit("notice", text="The sharks ran out of time to make more offers.")
    if table.offers:
        await table.founder_choice()
    else:
        everyone_declined = all(p.id in gone or table.stances.get(p.id) == "pass"
                                for p in sharks)
        await table.close("all_out" if everyone_declined else "no_offers")
    return table.stances
