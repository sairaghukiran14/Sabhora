"""A free, offline stand-in for a real LLM.

It reads the requested output model's name to decide what kind of JSON to return.
Use it for development, tests and demos so you only spend credits when you choose to.
"""
import asyncio
import json
import random
import re
import zlib

from pydantic import BaseModel

from .base import LLMResult

SHARK_LINES = [
    "Who exactly pays for this, and how often do they pay? Walk me through one customer.",
    "I like the energy, but the numbers in this pitch are doing a disappearing act.",
    "Big market, sure. What stops a bigger player copying you within a month?",
    "Bhai, show me ten paying customers who came back a second time and we can talk.",
    "The idea is fine. The moat is a puddle, and puddles dry up by lunchtime.",
    "What does it cost you to acquire one customer, honestly, not the optimistic number?",
    "If this works in Pune, why hasn't someone already done it in Bengaluru?",
    "Distribution is the business here. The product is the easy part, so who sells it?",
    "Your best customer today, would they be upset if you shut down tomorrow? Be honest.",
    "I want the churn number, not the signup number. How many stopped using it last month?",
    "You've told me what it does. Tell me why someone switches from what they do today.",
    "Margins first, vision later. What do you keep from every rupee that comes in?",
    "This sounds like a feature a bigger app adds in one sprint. Why are you the company?",
    "Who did you lose a customer to, and why did they choose them over you?",
    "Your founder story is lovely, but investors buy numbers. Give me three of them.",
    "If I gave you one crore tomorrow, where exactly does the first ten lakh go?",
]
OUT_LINES = [
    "Achha, I've heard enough. The numbers don't hold up for me yet, so I'm out.",
    "Honestly, I can't see how you stay ahead of a bigger company here, so I'm out.",
    "Dekho, this is outside what I understand well enough to back, so I'm out.",
    "I don't see a path to profit that I believe in right now, and that's why I'm out.",
    "Without repeat customers I can't put money in today, so for this one I'm out.",
]
DEAL_LINES = {
    "offer": "Theek hai, here is my offer. The terms are on the table, so think carefully.",
    "join": "I like this offer and I can add what is missing, so let us do it together.",
    "improve": "Chalo, I want this one, so I am making my offer better for you.",
    "hold": "My offer stays as it is, because I think these terms are fair for the risk.",
    "withdraw": "Looking at the competition here, I am taking my offer back. All the best.",
    "accept": "Done. I can live with your numbers, so let us shake hands on it.",
    "revise": "I cannot take your numbers, but here is my final offer, somewhere in between.",
    "out": "I have thought about it carefully, and I am not going to invest, so I'm out.",
}
NO_TERMS = {"investment_lakh": 0, "equity_pct": 0, "debt_lakh": 0, "debt_interest_pct": 0,
            "royalty_pct": 0, "royalty_until_lakh": 0}
CROWD_LINES = {
    "agree": ["I would honestly use this every single week.", "My whole family needs this, honestly speaking.",
              "If it stays cheap, I am definitely in.", "Finally someone is solving this problem for us."],
    "neutral": ["Depends on the price, bhai, tell me that first.", "Sounds nice, but will it work in my city?",
                "I need to see a friend use it first.", "Maybe, if there is a proper Hindi version."],
    "disagree": ["Another app? My phone is already completely full.", "I will not pay a subscription for this, sorry.",
                 "We already solve this offline with one phone call.", "This is too complicated for my parents to use."],
}
CHAT_LINES = [
    "Hmm, I hear you, but I still need to see how it works for someone like me.",
    "That's a fair point, though my main worry about cost hasn't gone away yet.",
    "Okay, if it really saves me time every week, I would give it a proper try.",
    "Tell me who else in my area is using it, then I will think about it again.",
    "Arre, the idea is fine, but show me the price clearly before anything else.",
    "Accha, that answers one doubt; the trust part is still open for me though.",
]
ROASTS = [
    "The headline says a lot and means nothing. Bold choice for a page this important.",
    "Okay but why is this button here? I scrolled three times to find the price.",
    "Beta, but what does it actually do? I read it twice and still don't know.",
    "Vibes are premium, proof is missing. Where are the testimonials?",
    "Clean page, mid copy. No cap, I'd scroll past this in about two seconds flat.",
    "Let's talk about your value proposition, because I can't find it.",
]


class FakeClient:
    name = "fake"

    def __init__(self, delay_s: float = 0.0, model: str = "fake") -> None:
        self.delay_s = delay_s
        self.model = model

    async def complete(self, system, user, *, max_tokens, output: type[BaseModel] | None = None):
        await asyncio.sleep(self.delay_s)  # pretend to think, so streaming looks live
        rng = random.Random(zlib.crc32((system + user).encode()))  # same input -> same output
        kind = output.__name__ if output else ""
        data = self._make(kind, user, rng)
        text = json.dumps(data) if data is not None else "This is a fake reply."
        return LLMResult(text, input_tokens=len(system + user) // 4, output_tokens=len(text) // 4)

    def _deal(self, kind: str, user: str, rng: random.Random) -> dict:
        """Deal-table moves that always respect the offer limits."""
        keys = list(NO_TERMS)
        mine = re.search(r"YOUR_NUMBERS: (.*)", user)
        terms = (dict(zip(keys, map(float, mine.group(1).split()), strict=True))
                 if mine else dict(NO_TERMS))
        if kind == "SharkOffer":
            amount, equity = map(float, re.search(r"ASK_NUMBERS: (\S+) (\S+)", user).groups())
            joinable = re.search(r"JOINABLE OFFER IDS: (.*)", user).group(1)
            decision = rng.choices(["offer", "join", "out"], weights=[55, 15, 30])[0]
            if decision == "join" and joinable == "none":
                decision = "offer"
            if decision == "offer":
                stake = round(min(75.0, equity * rng.choice([1.5, 2, 3])), 1)
                terms = {**NO_TERMS, "investment_lakh": amount, "equity_pct": stake}
                if rng.random() < 0.3:
                    terms.update(royalty_pct=2, royalty_until_lakh=amount)
            partner = joinable.split(", ")[0] if decision == "join" else ""
            return {"decision": decision, "partner_id": partner, "terms": terms,
                    "message": DEAL_LINES[decision]}
        if kind == "SharkRaise":
            decision = rng.choices(["improve", "hold", "withdraw"], weights=[45, 45, 10])[0]
            if decision == "improve":
                if terms["equity_pct"] > 0:
                    terms["equity_pct"] = round(terms["equity_pct"] * 0.85, 2)
                else:
                    decision = "hold"
        else:
            decision = rng.choices(["accept", "revise", "hold", "out"],
                                   weights=[35, 35, 20, 10])[0]
            if decision == "revise" and terms["equity_pct"] > 0:
                terms["equity_pct"] = round(terms["equity_pct"] * 0.9, 2)
        return {"decision": decision, "terms": terms, "message": DEAL_LINES[decision]}

    def _make(self, kind: str, user: str, rng: random.Random) -> dict | None:
        if kind == "SharkTurn":
            found = re.search(r"ROUND (\d+) of", user)
            leaving = bool(found) and int(found.group(1)) > 1 and rng.random() < 0.12
            lines = OUT_LINES if leaving else SHARK_LINES
            unused = [line for line in lines if line not in user] or lines
            stance = "maybe" if not found or int(found.group(1)) == 1 else (
                "pass" if leaving else rng.choice(["invest", "maybe", "pass"]))
            # The placeholder lines quote no figures, so there is nothing to work out.
            return {"maths": [], "message": rng.choice(unused), "out": leaving,
                    "stance": stance, "confidence": rng.randint(4, 9)}
        if kind in ("SharkOffer", "SharkRaise", "SharkCounterReply"):
            return self._deal(kind, user, rng)
        if kind.startswith("ChatReply_"):
            asked = re.search(r"THE FOUNDER NOW SAYS: (.*)", user)
            topic = asked.group(1)[:60] if asked else "that"
            unused = [line for line in CHAT_LINES if line not in user] or CHAT_LINES
            out: dict = {"reply": f"{rng.choice(unused)} You asked about: {topic}"}
            if kind == "ChatReply_crowd":
                out["vote_now"] = rng.choice(["agree", "neutral", "disagree"])
            elif kind == "ChatReply_shark":
                out["stance_now"] = rng.choice(["invest", "maybe", "pass"])
            return out
        if kind == "SharkVerdictKeyed":
            found = re.search(r"SHARK IDS: (.*)", user)
            ids = [x.split(" = ")[0] for x in found.group(1).split(", ")] if found else []
            votes = {sid: {"stance": rng.choice(["invest", "maybe", "pass"]),
                           "reason": "Fake reason for testing."} for sid in ids}
            return {"score": rng.randint(3, 8), "decision": "maybe",
                    "one_liner": "Promising idea, unproven business.", "votes": votes,
                    "top_risks": ["No paying customers yet", "Easy for others to copy",
                                  "Customer acquisition cost is unknown"],
                    "next_steps": ["Get ten paying users this month", "Test one price point with them",
                                   "Find one repeatable sales channel quickly"]}
        if kind in ("PersonReaction", "CrowdBatchKeyed"):
            # "[j001] Aman, 34, Kirana shop owner in Indore (tier 2), ..."
            people = re.findall(r"\[(j\d+)\] [^,]+, (\d+), (.+?) in (\w+)", user)

            def one(age: str, job: str, city: str) -> dict:
                vote = rng.choice(["agree", "agree", "neutral", "disagree"])
                # avoid lines the crowd digest already quotes (the copy check would reject them)
                line = rng.choice([x for x in CROWD_LINES[vote] if x not in user]
                                  or CROWD_LINES[vote])
                return {"comment": f"As a {age}-year-old {job.lower()} in {city}: {line}",
                        "vote": vote, "would_pay": vote == "agree" and rng.random() < 0.6}
            if kind == "PersonReaction":
                return one(*people[0][1:]) if people else one("30", "shopper", "Pune")
            return {pid: one(age, job, city) for pid, age, job, city in people}
        if kind == "JantaSummary":
            return {"headline": "The crowd is split: useful, but price-sensitive.",
                    "reasons_for": ["It saves people time", "Solves a real daily pain", "Easy to explain quickly"],
                    "reasons_against": ["People hate more subscriptions", "They don't trust it yet",
                                        "Offline habits are strong"],
                    "advice": ["Offer a free tier first", "Add proper Hindi language support", "Start in just one city"]}
        if kind == "RoastReview":
            def score() -> int:
                return rng.randint(3, 9)
            return {"roast": rng.choice(ROASTS), "clarity": score(), "trust": score(),
                    "design": score(), "cta": score(), "fix": "Say what you do in eight words."}
        if kind == "RoastVerdict":
            return {"overall": rng.randint(4, 8), "one_liner": "Pretty page, mystery product.",
                    "top_fixes": ["Rewrite the headline in plain words", "Keep one clear main button", "Add real customer proof above the fold"]}
        return None
