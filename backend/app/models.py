"""Typed data shapes: API requests and every structured LLM output.

Rule: anything an LLM returns is validated against one of these models before we use it.
"""
from typing import Annotated, Literal

from pydantic import BaseModel, Field, HttpUrl, create_model, field_validator, model_validator

Mode = Literal["sharks", "janta", "roast"]
Tone = Literal["serious", "roast"]
Stance = Literal["invest", "maybe", "pass"]  # a shark's position
Vote = Literal["agree", "neutral", "disagree"]  # a crowd member's position
# A sentence-length list item. On sarvam-105b, verdict lists otherwise came back with blank
# items; minLength (and exactly 3 items) in the schema makes the model write them out.
Point = Annotated[str, Field(min_length=15, max_length=400)]
Three = Field(min_length=3, max_length=3)


def _clamp(value: object, low: int, high: int) -> object:
    """LLMs sometimes answer 11/10. Clamp numbers instead of failing validation."""
    if isinstance(value, int | float) and not isinstance(value, bool):
        return max(low, min(high, int(value)))
    return value


# ---------- API requests ----------

class CreateDebate(BaseModel):
    mode: Mode
    tone: Tone = "roast"
    pitch: str | None = Field(default=None, min_length=20, max_length=2000)
    url: HttpUrl | None = None  # Roast mode only
    panel_size: int | None = Field(default=None, ge=5, le=500)  # Janta crowd size
    # Sharks mode: the founder's ask, e.g. 50 (lakh rupees) for 5 (percent equity).
    # Without an ask the sharks debate but make no offers.
    ask_amount_lakh: float | None = Field(default=None, ge=1, le=100_000)
    ask_equity_pct: float | None = Field(default=None, ge=0.1, le=100)

    @model_validator(mode="after")
    def _needs_input(self) -> "CreateDebate":
        if (self.ask_amount_lakh is None) != (self.ask_equity_pct is None):
            raise ValueError("An ask needs both an amount and an equity percentage")
        if self.mode == "roast" and not self.url:
            raise ValueError("Roast mode needs a url")
        if self.mode != "roast" and not self.pitch:
            raise ValueError("This mode needs a pitch of at least 20 characters")
        return self


class FounderReply(BaseModel):
    text: str | None = Field(default=None, max_length=500)
    skip: bool = False

    @model_validator(mode="after")
    def _text_or_skip(self) -> "FounderReply":
        if not self.skip and not (self.text and self.text.strip()):
            raise ValueError("Send some text, or skip=true")
        return self


class FounderDeal(BaseModel):
    """The founder's move once offers are on the table. A counter changes the money, equity
    and royalty of one offer; any debt in that offer stays as it was."""
    action: Literal["accept", "counter", "walk"]
    offer_id: str | None = Field(default=None, max_length=20)
    investment_lakh: float | None = Field(default=None, ge=1, le=100_000)
    equity_pct: float | None = Field(default=None, ge=0.1, le=100)
    royalty_pct: float | None = Field(default=None, ge=0, le=15)

    @model_validator(mode="after")
    def _complete(self) -> "FounderDeal":
        if self.action != "walk" and not self.offer_id:
            raise ValueError("Say which offer you mean")
        if self.action == "counter" and (self.investment_lakh is None or self.equity_pct is None):
            raise ValueError("A counter needs an amount and an equity percentage")
        return self


class ChatTurn(BaseModel):
    role: Literal["founder", "persona"]
    text: str = Field(min_length=1, max_length=1000)


class ChatRequest(BaseModel):
    """A follow-up message to one persona of a finished debate. The browser keeps the
    conversation and sends it back each time (the server stores no chats)."""
    persona_id: str = Field(min_length=1, max_length=20)
    message: str = Field(min_length=1, max_length=500)
    history: list[ChatTurn] = Field(default_factory=list, max_length=40)


def chat_reply_model(kind: str) -> type[BaseModel]:
    """The reply comes first, then where they stand now (say it, then decide), so the
    position follows from what they actually said."""
    fields: dict = {"reply": (str, Field(min_length=20, max_length=900))}
    if kind == "crowd":
        fields["vote_now"] = (Vote, ...)
    elif kind == "shark":
        fields["stance_now"] = (Stance, ...)
    return create_model(f"ChatReply_{kind}", **fields)


# ---------- Sharks mode ----------

class Calc(BaseModel):
    """One arithmetic step, shown before the shark speaks. debates/numbers.py recomputes it."""
    expression: str = Field(max_length=80, description=(
        "Plain arithmetic, digits and + - * / ( ) only, no words or units. Example: 18 * 299"))
    value: float = Field(description=(
        "What that expression comes to. It is recomputed here, and the turn is rejected if "
        "this is wrong, so do not round it."))


class SharkTurn(BaseModel):
    """One shark message plus where the shark currently stands.

    Min lengths on spoken fields are deliberate: in schema mode, sarvam-105b otherwise
    often returns "" or "..." for the text once there's a conversation to react to.

    `maths` comes first because field order is generation order: the model works a figure
    out before it says it, instead of inventing one mid-sentence (it said "₹4,812 a month"
    for 18 shops at ₹299 on the first real run)."""
    maths: list[Calc] = Field(default_factory=list, max_length=4, description=(
        "Work out here every figure you are about to say that is not already in ESTABLISHED "
        "FACTS. Leave empty if you state no new figures."))
    message: str = Field(min_length=60, max_length=700)
    out: bool  # "I'm out": the shark leaves this pitch for good
    stance: Stance
    confidence: int = Field(ge=1, le=10)

    @field_validator("confidence", mode="before")
    @classmethod
    def _c(cls, v: object) -> object:
        return _clamp(v, 1, 10)


class OfferTerms(BaseModel):
    """Deal numbers a shark fills in. All required (use 0 when a part doesn't apply), because
    some models skip optional fields. The terms come BEFORE the spoken message so the words
    follow the numbers."""
    investment_lakh: float = Field(ge=0, description="Money paid for equity, in lakh rupees")
    equity_pct: float = Field(ge=0, le=100, description="Equity taken for that money")
    debt_lakh: float = Field(ge=0, description="Loan on top, in lakh rupees; 0 if none")
    debt_interest_pct: float = Field(ge=0, description="Yearly interest on the loan")
    royalty_pct: float = Field(ge=0, description="Share of revenue as royalty; 0 if none")
    royalty_until_lakh: float = Field(ge=0, description="Royalty stops once this much is repaid")


class SharkOffer(BaseModel):
    """A shark's first move at the deal table."""
    decision: Literal["offer", "join", "out"]
    partner_id: str = Field(description="For join: id of the shark whose offer you join; else empty")
    terms: OfferTerms
    message: str = Field(min_length=40, max_length=700)


class SharkRaise(BaseModel):
    """A shark who has an offer on the table responds to competing offers."""
    decision: Literal["improve", "hold", "withdraw"]
    terms: OfferTerms
    message: str = Field(min_length=40, max_length=700)


class SharkCounterReply(BaseModel):
    """A shark's answer to the founder's counter-offer."""
    decision: Literal["accept", "revise", "hold", "out"]
    terms: OfferTerms
    message: str = Field(min_length=40, max_length=700)


class SharkVote(BaseModel):
    shark: str
    stance: Stance
    reason: str


class SharkVoteBody(BaseModel):
    reason: str = Field(min_length=10)
    stance: Stance


def shark_verdict_model(shark_ids: list[str]) -> type[BaseModel]:
    """What the judge must return: one REQUIRED vote field per shark id, so no shark can be
    left out (a plain list came back with only one vote on a real model)."""
    votes = create_model("VerdictVotes", **{sid: (SharkVoteBody, ...) for sid in shark_ids})
    # Field order is generation order: the judge writes its case BEFORE choosing a score.
    return create_model(
        "SharkVerdictKeyed",
        votes=(votes, ...),
        top_risks=(list[Point], Field(min_length=3, max_length=3, description="The 3 biggest risks")),
        next_steps=(list[Point], Field(min_length=3, max_length=3, description="3 concrete next steps")),
        one_liner=(str, Field(min_length=15, description="Punchy, shareable one-line summary")),
        decision=(Stance, ...),
        score=(int, Field(ge=0, le=10, description="Overall viability 0-10, decided last")),
    )


class SharkVerdict(BaseModel):
    score: int = Field(ge=0, le=10, description="Overall viability 0-10")
    decision: Stance
    one_liner: str = Field(description="Punchy, shareable one-line summary")
    votes: list[SharkVote]
    top_risks: list[str] = Field(description="The 3 biggest risks")
    next_steps: list[str] = Field(description="3 concrete next steps")

    @field_validator("score", mode="before")
    @classmethod
    def _s(cls, v: object) -> object:
        return _clamp(v, 0, 10)


# ---------- Janta mode ----------

class PersonReaction(BaseModel):
    """What one crowd member says, then decides. The comment comes FIRST on purpose:
    writing the reason before the vote keeps votes varied instead of all-the-same."""
    comment: str = Field(min_length=25, max_length=300)
    vote: Vote
    would_pay: bool


class CrowdReaction(BaseModel):
    """One crowd member's reaction, as the app stores and streams it."""
    persona_id: str
    vote: Vote
    comment: str
    would_pay: bool


def crowd_batch_model(ids: list[str]) -> type[BaseModel]:
    """A schema with one REQUIRED field per person id, so a batched reply can't skip anyone
    or invent ids. (Plain arrays came back short on real models.)"""
    return create_model("CrowdBatchKeyed", **{pid: (PersonReaction, ...) for pid in ids})


class JantaSummary(BaseModel):
    # 0-3, not exactly 3: with 0 agrees, a fixed 3 made the judge invent "reasons people
    # agreed" from unsure and disagreeing people (real run, 26 Nov 2026). janta.summary_check
    # ties each count to how many people actually voted that way.
    reasons_for: list[Point] = Field(min_length=0, max_length=3, description=(
        "Up to 3 reasons from people who voted agree. Empty if nobody agreed"))
    reasons_against: list[Point] = Field(min_length=0, max_length=3, description=(
        "Up to 3 reasons from people who voted disagree. Empty if nobody disagreed"))
    advice: list[Point] = Field(min_length=3, max_length=3,
                                description="Top 3 changes the crowd suggested")
    headline: str = Field(min_length=15, description="One-line verdict of the crowd, written last")


# ---------- Roast mode ----------

class RoastReview(BaseModel):
    roast: str = Field(min_length=60, max_length=700,
                       description="2-3 sentence review in the persona's voice")
    clarity: int = Field(ge=1, le=10)
    trust: int = Field(ge=1, le=10)
    design: int = Field(ge=1, le=10)
    cta: int = Field(ge=1, le=10, description="Call-to-action strength")
    fix: str = Field(min_length=15, description="The single most important fix")

    @field_validator("clarity", "trust", "design", "cta", mode="before")
    @classmethod
    def _c(cls, v: object) -> object:
        return _clamp(v, 1, 10)


class RoastVerdict(BaseModel):
    top_fixes: list[Point] = Field(min_length=3, max_length=3,
                                   description="3 fixes, most important first")
    one_liner: str = Field(min_length=15)
    overall: int = Field(ge=0, le=10, description="Decided last, after the fixes")

    @field_validator("overall", mode="before")
    @classmethod
    def _o(cls, v: object) -> object:
        return _clamp(v, 0, 10)
