"""One-to-one follow-up chat with any persona from a finished debate.

The founder can talk to a crowd member, a shark or a roaster after the verdict. Each persona
remembers who they are (their profile) and what they said in the debate, and the reply comes
with where they stand now, so the UI can show whether the founder moved them.

The conversation lives in the browser and is sent back with each message; the server stores
no chats. The rule that matters most is in prompts.CHAT_RULES: a persona changes their mind
only for a reason that fits their life, never because the founder is friendly or persistent.
"""
import re
from dataclasses import dataclass
from difflib import SequenceMatcher

from . import prompts
from .budget import TokenBudget
from .llm.base import LLMClient, complete_typed
from .llm.factory import LLMs
from .llm.quality import require_text
from .models import ChatRequest, chat_reply_model
from .personas import generate_crowd, load_roasters, load_sharks
from .targeting import find_target

# Things a persona must never say about themselves
_BREAKS_CHARACTER = re.compile(r"\b(as an ai|language model|i am an ai|i'm an ai|simulation|"
                               r"this persona|my persona|role-?play)\b", re.IGNORECASE)


@dataclass
class ChatPersona:
    kind: str  # crowd | shark | roaster
    id: str
    name: str
    title: str
    system: str
    position: str | None  # current vote (crowd) or stance (shark); None for roasters


def _events(snapshot: dict, type_: str) -> list[dict]:
    return [e for e in snapshot["events"] if e["type"] == type_]


def find_persona(snapshot: dict, persona_id: str, show_attitude: bool = False) -> ChatPersona:
    """Build the persona and their memory of the debate. Raises LookupError if not found."""
    mode = snapshot["mode"]
    if mode == "janta":
        start = _events(snapshot, "start")[0]
        stored = next((p for p in start.get("crowd", []) if p["id"] == persona_id), None)
        if stored is None:
            raise LookupError(persona_id)
        # Rebuild the same crowd the debate used: targeted at the pitch's market, if any
        target = find_target(snapshot.get("request", {}).get("pitch", ""))
        person = next(p for p in generate_crowd(start["size"], cities=target.cities,
                                               jobs=target.jobs) if p.id == persona_id)
        # The debate's own record wins for the basics (older runs predate age fixes)
        person = person.model_copy(update={k: stored[k] for k in ("name", "age", "city",
                                                                  "occupation") if k in stored})
        said = [(e["round"], e["vote"], e["comment"]) for e in _events(snapshot, "reaction")
                if e["persona_id"] == persona_id]
        return ChatPersona("crowd", persona_id, person.name,
                           f"{person.age}, {person.occupation}, {person.city}",
                           prompts.chat_system_crowd(person.one_line(show_attitude=show_attitude), said),
                           said[-1][1] if said else None)
    if mode == "sharks":
        shark = next((s for s in load_sharks() if s.id == persona_id), None)
        if shark is None:
            raise LookupError(persona_id)
        said = [(e["round"], e["stance"], e["text"]) for e in _events(snapshot, "message")
                if e["speaker"] == persona_id]
        said += [("deal table", e["action"], e["text"] + (
                     f" [Terms: {prompts.terms_text(e['offer'])}]" if e.get("offer") else ""))
                 for e in snapshot["events"]
                 if e["type"] in ("offer", "counter_reply") and e["speaker"] == persona_id]
        outcome = next(iter(_events(snapshot, "deal")), None)
        verdicts = _events(snapshot, "verdict")
        final = next((v["stance"] for v in verdicts[0]["verdict"]["votes"]
                      if v["shark"] == shark.name), None) if verdicts else None
        return ChatPersona("shark", shark.id, shark.name, shark.title,
                           prompts.chat_system_shark(shark, said, final, outcome),
                           final or (said[-1][1] if said else None))
    if mode == "roast":
        roaster = next((r for r in load_roasters() if r.id == persona_id), None)
        if roaster is None:
            raise LookupError(persona_id)
        review = next((e["review"] for e in _events(snapshot, "review")
                       if e["roaster"] == persona_id), None)
        pages = _events(snapshot, "page")
        return ChatPersona("roaster", roaster.id, roaster.name, roaster.title,
                           prompts.chat_system_roaster(roaster, review, pages[0] if pages else None),
                           None)
    raise LookupError(persona_id)


def client_for(llms: LLMs, persona: ChatPersona) -> LLMClient:
    """Crowd members keep the model that played them in the debate (mixed crowds)."""
    pool = llms.crowd_pool()
    if persona.kind == "crowd" and len(pool) > 1:
        return pool[int(persona.id[1:]) % len(pool)]
    return llms.crowd


async def reply(client: LLMClient, persona: ChatPersona, snapshot: dict, req: ChatRequest,
                budget: TokenBudget) -> dict:
    idea = snapshot["request"].get("pitch") or snapshot["request"].get("url", "")
    history = [(t.role, t.text) for t in req.history]
    earlier = [text for role, text in history if role == "persona"]

    def check(out) -> None:
        require_text("reply", out.reply, min_words=4)
        if _BREAKS_CHARACTER.search(out.reply):
            raise ValueError("stay in character: never mention being an AI or a simulation")
        for said in earlier:
            if SequenceMatcher(None, out.reply.lower(), said.lower()).ratio() > 0.8:
                raise ValueError("that repeats your earlier reply; answer the new message")

    out = await complete_typed(
        client, persona.system, prompts.chat_user(idea, history, req.message, persona.name),
        chat_reply_model(persona.kind), budget=budget, max_tokens=900, check=check, attempts=3)
    position = getattr(out, "vote_now", None) or getattr(out, "stance_now", None)
    return {"persona_id": persona.id, "name": persona.name, "reply": out.reply,
            "position": position, "position_before": persona.position}
