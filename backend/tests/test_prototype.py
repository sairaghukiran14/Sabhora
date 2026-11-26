"""End-to-end checks for the prototype, all on the free fake provider."""
import asyncio
import time

import pytest
from fastapi.testclient import TestClient

from app.budget import DailyBudget
from app.debates import roast as roast_mode
from app.debates.runner import run_debate
from app.debates.sharks import speaking_order
from app.llm.factory import UserKeys, build_llms
from app.main import create_app
from app.models import CreateDebate, FounderReply
from app.personas import generate_crowd, load_roasters, load_sharks
from app.scraper import ScrapeError, fetch_page, parse_html
from app.sessions import DebateSession
from app.settings import Settings
from app.store import open_store

PITCH = "A WhatsApp-first app that helps kirana shops in tier-2 cities reorder stock in one tap."


@pytest.fixture
def settings(tmp_path) -> Settings:
    return Settings(_env_file=None, env="test", fake_delay_s=0, founder_wait_s=0.3,
                    janta_pace_s=0, data_dir=str(tmp_path), llm_provider="fake",
                    judge_provider="fake")


def types(session: DebateSession) -> list[str]:
    return [e["type"] for e in session.events]


# ---------- personas and supervisor ----------

def test_personas_load():
    assert [s.id for s in load_sharks()] == ["meera", "arjun", "ananya", "vikram", "farah"]
    assert len(load_roasters()) == 6
    crowd = generate_crowd(100)
    assert len({p.id for p in crowd}) == 100
    assert generate_crowd(100)[0] == crowd[0]  # same seed, same crowd


def test_crowd_profiles_are_complete_and_consistent():
    import yaml
    from app.personas import PERSONAS_DIR
    dims = yaml.safe_load((PERSONAS_DIR / "janta" / "dimensions.yaml").read_text())
    bounds = {o["title"]: (o.get("min_age", 18), o.get("max_age", 68)) for o in dims["occupations"]}
    for p in generate_crowd(100):
        assert p.household and p.work and p.pays_for and p.phone and len(p.pains) == 2
        lo, hi = bounds[p.occupation]
        assert lo <= p.age <= hi, (p.id, p.occupation, p.age)  # no 19-year-old retired bankers
        assert not (p.attitude == "Early adopter" and p.phone_label == "Feature phone")
        line = p.one_line()
        assert line.startswith(f"[{p.id}] {p.name}, {p.age}, {p.occupation} in {p.city}")
        assert "General tendency" in line and line.index("Home:") < line.index("General tendency")


def test_speaking_order_puts_skeptics_first():
    sharks = load_sharks()
    assert [s.id for s in speaking_order(sharks, 1, {})] == [p.id for p in sharks]
    order = speaking_order(sharks, 2, {"meera": "invest", "arjun": "maybe", "ananya": "pass"})
    assert order[0].id == "ananya" and order[-1].id == "meera"


def test_request_validation():
    with pytest.raises(ValueError):
        CreateDebate(mode="roast")  # needs a url
    with pytest.raises(ValueError):
        CreateDebate(mode="sharks", pitch="too short")
    with pytest.raises(ValueError):
        FounderReply()  # needs text or skip
    assert FounderReply(skip=True).skip


# ---------- engines ----------

async def run_mode(mode: str, request: dict, s: Settings) -> DebateSession:
    session = DebateSession(mode, request)
    session.id = "abcdef123456"
    await run_debate(session, build_llms(s, UserKeys()), s, DailyBudget(10**9), byok=False)
    return session


async def test_sharks_full_debate_with_founder_reply(settings):
    session = DebateSession("sharks", {"pitch": PITCH, "tone": "roast"})
    llms = build_llms(settings, UserKeys())
    task = asyncio.create_task(run_debate(session, llms, settings, DailyBudget(10**9), byok=False))
    while not session.awaiting_founder and not task.done():  # founder answers the first gap
        await asyncio.sleep(0.01)
    assert session.awaiting_founder, [e for e in session.events if e["type"] == "error"]
    session.founder_inbox.put_nowait("We already have 40 paying shops in Indore at Rs 299/month.")
    await task
    t = types(session)
    messages = [e for e in session.events if e["type"] == "message"]
    # 5 sharks in round 1; after that, anyone who went out never speaks again
    assert len([m for m in messages if m["round"] == 1]) == 5
    assert not any(m["out"] for m in messages if m["round"] == 1)
    # Round 1 is for questions, so nobody has taken a position yet.
    assert {m["stance"] for m in messages if m["round"] == 1} == {"maybe"}
    for i, m in enumerate(messages):
        if m["out"]:
            assert m["stance"] == "pass"
            assert m["speaker"] not in [later["speaker"] for later in messages[i + 1:]]
    assert "offers_open" not in t and "deal" not in t  # no ask, so no deal table
    assert "founder" in t and "founder_skipped" in t  # answered once, timed out once
    verdict = next(e for e in session.events if e["type"] == "verdict")["verdict"]
    assert len(verdict["votes"]) == 5 and 0 <= verdict["score"] <= 10
    assert verdict["one_liner"] == "Promising idea, unproven business."  # the judge, not the fallback
    assert t[-1] == "done" and session.tokens_used > 0


async def test_janta_crowd_of_30(settings):
    session = await run_mode("janta", {"pitch": PITCH, "panel_size": 30}, settings)
    t = types(session)
    round2 = [e for e in session.events if e["type"] == "round" and e["round"] == 2][0]
    assert 0 < round2["asked"] < 30  # only swing voters reconsider in round 2
    assert t.count("reaction") == 30 + round2["asked"]
    verdict = next(e for e in session.events if e["type"] == "verdict")
    assert verdict["tally"]["total"] == 30
    assert set(verdict["segments"]) == {"City tier", "Age", "Phone use"}  # attitude hidden by default
    assert len(verdict["summary"]["advice"]) == 3  # the judge's summary, not the fallback
    assert "error" not in t


async def test_janta_mixed_model_crowd(settings):
    from app.debates import janta
    from app.llm.factory import LLMs
    from app.llm.fake_client import FakeClient

    llms = LLMs(crowd=FakeClient(), judge=FakeClient(),
                pool=[FakeClient(model="model-a"), FakeClient(model="model-b")])
    session = DebateSession("janta", {"pitch": PITCH, "panel_size": 30})
    await janta.run(session, llms, settings)
    crowd = next(e for e in session.events if e["type"] == "start")["crowd"]
    assert {p["model"] for p in crowd} == {"model-a", "model-b"}  # both models play people
    verdict = next(e for e in session.events if e["type"] == "verdict")
    assert verdict["tally"]["total"] == 30  # nobody lost when batches are split by model
    assert set(verdict["segments"]["Model"]) == {"model-a", "model-b"}
    assert sum(g["n"] for g in verdict["segments"]["Model"].values()) == 30


def test_janta_models_setting_builds_a_pool(settings):
    s = settings.model_copy(update={"llm_provider": "sarvam", "sarvam_api_key": "test-key",
                                    "janta_models": "sarvam-105b-conversations, glm5.3-flash"})
    llms = build_llms(s, UserKeys())
    assert [c.model for c in llms.crowd_pool()] == ["sarvam-105b-conversations", "glm5.3-flash"]
    assert llms.crowd_pool()[1]._url.endswith("/v2")  # Token Factory endpoint
    single = build_llms(settings, UserKeys())
    assert single.crowd_pool() == [single.crowd]  # no JANTA_MODELS = one model, as before


async def test_janta_batched_mode_keeps_everyone(settings):
    s = settings.model_copy(update={"janta_batch_size": 10})
    session = await run_mode("janta", {"pitch": PITCH, "panel_size": 30}, s)
    verdict = next(e for e in session.events if e["type"] == "verdict")
    assert verdict["tally"]["total"] == 30 and "error" not in types(session)


def test_quality_checks_reject_bad_replies():
    """Each rejected example below is a real reply sarvam-105b gave during testing."""
    from app.debates.janta import check_reaction
    from app.debates.sharks import clean_message, turn_check
    from app.models import PersonReaction, SharkTurn, shark_verdict_model

    check = turn_check(PITCH)
    for bad in (PITCH, "Your turn, Ananya Iyer.",
                "I pause, looking at the founder with a calm, analytical gaze."):
        with pytest.raises(ValueError):  # model_construct: test the check, not the schema
            check(SharkTurn.model_construct(message=bad, stance="maybe", confidence=5))
    check(SharkTurn(message="Forty shops in one city is a pilot, not traction. Show me a second city.",
                    out=False, stance="pass", confidence=8))
    assert clean_message("Your margin is pocket change. Stance: Pass Confidence: 9/10") == \
        "Your margin is pocket change."
    repeat = "Founder, 32 of 40 weekly in Indore still doesn't tell me this works in Patna."
    with pytest.raises(ValueError):  # a shark repeating a line already said in the debate
        turn_check(PITCH, [("Ananya Iyer", repeat)])(
            SharkTurn(message=repeat + " Show me.", out=False, stance="pass", confidence=7))
    for bad in ("Neha's comment in her own voice", "Ravi said: .... .... .... ....",
                "....//....//....//....//....//",
                "1-2 sentences in their own words, light Hinglish or regional flavour is fine"):
        with pytest.raises(ValueError):
            check_reaction(PersonReaction(comment=bad, vote="agree", would_pay=True))
    copied = "2000 rupaye mahine ka subscription dekh ke toh bhaad mein jaayega"
    with pytest.raises(ValueError):  # round 2 copying a round-1 voice word for word
        check_reaction(PersonReaction(comment=copied, vote="disagree", would_pay=False),
                       others=[copied])
    check_reaction(PersonReaction(comment="ये व्हाट्सएप वाला ऐप मेरी दुकान के लिए काम का लगता है", vote="agree",
                                  would_pay=False))  # Hindi in Devanagari is real speech
    from app.llm.quality import is_real_text
    for placeholder in ("reason 1  reason 2  reason 3", "one line, under 15 words",
                        "<reason 1>.<reason 2>.<reason 3>", "Comment here</arg_key>...",
                        '{"comment":"...comment...</arg_key> would_pay'):  # all real replies
        assert not is_real_text(placeholder), placeholder
    assert is_real_text("Delivery riders in Mumbai worry about data costs on WhatsApp.")
    assert not is_real_text("People liked it because...")
    from app.llm.quality import copies_instructions
    from app.prompts import janta_summary_system
    assert copies_instructions("Write a short, punchy headline that sums up the crowd's verdict.",
                               janta_summary_system())
    assert not copies_instructions("Indore's 40-shop trial wins hearts, but trust lags.",
                                   janta_summary_system())
    model = shark_verdict_model(["meera", "arjun", "ananya"])
    with pytest.raises(ValueError):  # the judge can't leave a shark out
        model.model_validate({"score": 5, "decision": "maybe", "one_liner": "x", "top_risks": [],
                              "next_steps": [], "votes": {"meera": {"stance": "pass",
                                                                    "reason": "GMV too low"}}})


async def test_roast_with_stubbed_page(settings, monkeypatch):
    async def fake_fetch(url):
        return parse_html(url, "<title>Kirana One</title><h1>Reorder in one tap</h1>"
                               "<p>" + "Built for shops. " * 30 + "</p><button>Start free</button>")
    monkeypatch.setattr(roast_mode, "fetch_page", fake_fetch)
    session = await run_mode("roast", {"url": "https://example.com/"}, settings)
    t = types(session)
    assert t.count("review") == 6
    verdict = next(e for e in session.events if e["type"] == "verdict")
    assert set(verdict["averages"]) == {"clarity", "trust", "design", "cta"}
    assert not verdict["verdict"]["one_liner"].startswith("Weakest spot")  # judge, not fallback
    assert open_store(settings).load("abcdef123456")["mode"] == "roast"  # saved for replay


async def test_scraper_blocks_private_addresses():
    for url in ("http://127.0.0.1/", "http://localhost:8000/", "file:///etc/passwd"):
        with pytest.raises(ScrapeError):
            await fetch_page(url)


async def test_missing_key_is_a_clear_error(settings):
    s = settings.model_copy(update={"llm_provider": "anthropic", "anthropic_api_key": ""})
    with pytest.raises(Exception, match="ANTHROPIC_API_KEY is missing"):
        build_llms(s, UserKeys())


# ---------- HTTP API ----------

def test_api_start_stream_and_replay(settings):
    # `with` keeps one event loop alive, like a real server, so background debates keep running
    with TestClient(create_app(settings)) as client:
        _start_stream_and_replay(client)


def _start_stream_and_replay(client: TestClient) -> None:
    assert client.get("/api/health").json()["status"] == "ok"
    assert client.get("/").status_code == 200
    r = client.post("/api/debates", json={"mode": "janta", "pitch": PITCH, "panel_size": 10})
    assert r.status_code == 201, r.text
    debate_id = r.json()["id"]
    deadline = time.time() + 20
    while time.time() < deadline:
        snap = client.get(f"/api/debates/{debate_id}").json()
        if snap["finished"]:
            break
        time.sleep(0.1)
    assert snap["finished"] and snap["events"][-1]["type"] == "done"
    with client.stream("GET", f"/api/debates/{debate_id}/stream") as stream:
        body = "".join(stream.iter_text())
    assert '"type": "verdict"' in body and '"type": "done"' in body
    assert client.get("/d/" + debate_id).status_code == 200


def test_api_rejects_bad_requests(settings):
    client = TestClient(create_app(settings))
    assert client.post("/api/debates", json={"mode": "roast"}).status_code == 422
    assert client.post("/api/debates/nope/reply", json={"text": "hi"}).status_code == 404
    assert client.get("/api/debates/../../etc").status_code == 404


# ---------- follow-up chat ----------

async def test_chat_with_crowd_member_shark_and_roaster(settings, monkeypatch):
    from app.budget import TokenBudget
    from app.chat import find_persona, reply
    from app.models import ChatRequest, ChatTurn

    llms = build_llms(settings, UserKeys())
    janta_run = await run_mode("janta", {"pitch": PITCH, "panel_size": 10}, settings)
    snap = janta_run.snapshot()
    first = next(e for e in snap["events"] if e["type"] == "reaction")
    person = find_persona(snap, first["persona_id"])
    assert person.kind == "crowd" and first["comment"] in person.system  # remembers what they said
    assert "Home:" in person.system  # and who they are
    req = ChatRequest(persona_id=person.id, message="What would make you pay for this?",
                      history=[ChatTurn(role="founder", text="Hi"), ChatTurn(role="persona",
                               text="Hello beta, I already told the panel what I think.")])
    out = await reply(llms.crowd, person, snap, req, TokenBudget(10**6))
    assert out["position"] in ("agree", "neutral", "disagree") and len(out["reply"]) >= 20

    sharks_run = await run_mode("sharks", {"pitch": PITCH, "tone": "roast"}, settings)
    shark = find_persona(sharks_run.snapshot(), "arjun")
    assert shark.kind == "shark" and shark.position in ("invest", "maybe", "pass")
    out = await reply(llms.crowd, shark, sharks_run.snapshot(),
                      ChatRequest(persona_id="arjun", message="What would make you invest?"),
                      TokenBudget(10**6))
    assert out["position"] in ("invest", "maybe", "pass")

    async def fake_fetch(url):
        return parse_html(url, "<title>Kirana One</title><h1>Reorder in one tap</h1>"
                               "<p>" + "Built for shops. " * 30 + "</p><button>Start free</button>")
    monkeypatch.setattr(roast_mode, "fetch_page", fake_fetch)
    roast_run = await run_mode("roast", {"url": "https://example.com/"}, settings)
    roaster = find_persona(roast_run.snapshot(), "dev")
    assert roaster.kind == "roaster" and "Your review" in roaster.system
    out = await reply(llms.crowd, roaster, roast_run.snapshot(),
                      ChatRequest(persona_id="dev", message="What should the button say?"),
                      TokenBudget(10**6))
    assert out["position"] is None

    with pytest.raises(LookupError):
        find_persona(snap, "j999")


def test_chat_endpoint(settings):
    with TestClient(create_app(settings)) as client:
        r = client.post("/api/debates", json={"mode": "janta", "pitch": PITCH, "panel_size": 6})
        debate_id = r.json()["id"]
        deadline = time.time() + 20
        while time.time() < deadline and not client.get(f"/api/debates/{debate_id}").json()["finished"]:
            time.sleep(0.1)
        ok = client.post(f"/api/debates/{debate_id}/chat",
                         json={"persona_id": "j001", "message": "Why did you vote that way?"})
        assert ok.status_code == 200, ok.text
        assert ok.json()["name"] and ok.json()["reply"]
        assert client.post(f"/api/debates/{debate_id}/chat",
                           json={"persona_id": "j999", "message": "hi"}).status_code == 404
        assert client.post("/api/debates/abcdefabcdef/chat",
                           json={"persona_id": "j001", "message": "hi"}).status_code == 404
        assert client.post(f"/api/debates/{debate_id}/chat",
                           json={"persona_id": "j001", "message": ""}).status_code == 422
