"""HTTP routes. The browser only ever: starts a debate, streams it, and (Sharks) replies."""
import asyncio
import hmac
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response, StreamingResponse

from .budget import BudgetExceeded, DailyBudget, TokenBudget
from .chat import client_for, find_persona
from .chat import reply as chat_reply
from .debates.runner import run_debate
from .llm.base import LLMError
from .llm.factory import UserKeys, build_llms
from .personas import load_sharks
from .models import ChatRequest, CreateDebate, FounderDeal, FounderReply, SpeechRequest
from .ratelimit import RateLimiter
from .sessions import SessionStore
from .settings import Settings
from .store import open_store
from .voice import (AUDIO_TYPES, MAX_CLIP_BYTES, SPOKEN_EVENTS, VoiceError, VoiceLimit,
                    voice_mode)

router = APIRouter(prefix="/api")
log = logging.getLogger(__name__)


def require_internal(request: Request) -> None:
    """Only the web app may use the debate routes (no-op when no token is configured)."""
    expected = request.app.state.settings.internal_api_token
    if expected and not hmac.compare_digest(
            request.headers.get("x-internal-token", "").encode(), expected.encode()):
        raise HTTPException(401, "Not allowed")


INTERNAL = [Depends(require_internal)]


def _client_key(request: Request) -> str:
    """Who to rate-limit. Behind the web app every request has the same IP, so a caller that
    proved it is the web app may name the end user instead."""
    user = request.headers.get("x-client-id", "")
    if request.app.state.settings.internal_api_token and user:
        return f"user:{user[:64]}"  # only reachable after require_internal passed
    return request.client.host if request.client else "unknown"


def _state(request: Request) -> tuple[Settings, SessionStore, DailyBudget, RateLimiter]:
    st = request.app.state
    return st.settings, st.sessions, st.daily, st.limiter


def _user_keys(request: Request) -> UserKeys:
    # BYOK: keys travel in headers for one debate only; never stored or logged.
    return UserKeys(anthropic=request.headers.get("x-anthropic-key") or None,
                    sarvam=request.headers.get("x-sarvam-key") or None)


@router.get("/health")
async def health(request: Request) -> dict:
    s, sessions, daily, _ = _state(request)
    return {"status": "ok", "env": s.env, "active_debates": sessions.active_count(),
            "daily_tokens_used": daily.used}


@router.get("/config")
async def config(request: Request) -> dict:
    """What the UI needs to know: which models play, and the debate shape."""
    s, *_ = _state(request)
    return {"crowd_provider": s.llm_provider, "judge_provider": s.judge_provider,
            "shark_rounds": s.shark_rounds, "founder_wait_s": s.founder_wait_s,
            "janta_size": s.janta_size, "janta_max_size": s.janta_max_size,
            "janta_rounds": s.janta_rounds, "voice": voice_mode(s)}


@router.post("/debates", status_code=201, dependencies=INTERNAL)
async def create_debate(body: CreateDebate, request: Request) -> dict:
    s, sessions, daily, limiter = _state(request)
    keys = _user_keys(request)
    if not limiter.allow(_client_key(request)):
        raise HTTPException(429, "You've started a lot of debates this hour. Try again later.")
    if not keys.any and not daily.available():
        raise HTTPException(503, "Today's free capacity is used up. Add your own API key, "
                                 "or come back tomorrow.")
    if sessions.active_count() >= s.max_active_debates:
        raise HTTPException(503, "The panel is full right now. Try again in a minute.")
    if body.mode == "janta" and body.panel_size and body.panel_size > s.janta_max_size:
        raise HTTPException(400, f"Crowd size is limited to {s.janta_max_size} in this prototype.")
    if body.voice and (body.mode != "sharks" or voice_mode(s) == "off"):
        raise HTTPException(400, "Voice isn't available for this run")
    try:
        llms = build_llms(s, keys)
    except LLMError as err:  # e.g. provider set to anthropic but no key in .env
        raise HTTPException(400, f"Server isn't configured for real models yet: {err}") from err

    session = sessions.create(body.mode, body.model_dump(mode="json"))
    session.task = asyncio.create_task(run_debate(session, llms, s, daily, byok=keys.any))
    return {"id": session.id, "mode": session.mode}


@router.get("/debates/{debate_id}", dependencies=INTERNAL)
async def get_debate(debate_id: str, request: Request) -> dict:
    """Full event list: used for share-link replays (live or saved)."""
    s, sessions, *_ = _state(request)
    session = sessions.get(debate_id)
    if session:
        return session.snapshot()
    saved = await asyncio.to_thread(open_store(s).load, debate_id)
    if not saved:
        raise HTTPException(404, "Debate not found")
    return saved


@router.delete("/debates/{debate_id}", status_code=204, dependencies=INTERNAL)
async def remove_debate(debate_id: str, request: Request) -> None:
    """Erase a debate (pitch, transcript, verdict) when its owner deletes it."""
    s, sessions, *_ = _state(request)
    sessions.remove(debate_id)
    request.app.state.voice.forget(debate_id)
    await asyncio.to_thread(open_store(s).delete, debate_id)


@router.get("/debates/{debate_id}/stream", dependencies=INTERNAL)
async def stream(debate_id: str, request: Request, after: int = -1) -> StreamingResponse:
    _, sessions, *_ = _state(request)
    session = sessions.get(debate_id)
    if not session:
        raise HTTPException(404, "Debate not found (it may have finished; open its share link)")
    last = request.headers.get("last-event-id")
    if last and last.isdigit():  # EventSource reconnect: resume after what it already has
        after = max(after, int(last))

    async def events():
        async for event in session.subscribe(after):
            if await request.is_disconnected():
                break
            if event is None:
                yield ": ping\n\n"  # heartbeat keeps proxies from closing the connection
                continue
            yield f"id: {event['id']}\ndata: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/debates/{debate_id}/chat", dependencies=INTERNAL)
async def chat(debate_id: str, body: ChatRequest, request: Request) -> dict:
    """Follow-up chat with one persona after the verdict. Stateless: the browser sends the
    conversation so far; nothing is stored."""
    s, sessions, daily, _ = _state(request)
    live = sessions.get(debate_id)
    snapshot = (live.snapshot() if live
                else await asyncio.to_thread(open_store(s).load, debate_id))
    if not snapshot:
        raise HTTPException(404, "Debate not found")
    if not any(e["type"] == "verdict" for e in snapshot["events"]):
        raise HTTPException(409, "You can chat with the panel once the verdict is in")
    keys = _user_keys(request)
    if not request.app.state.chat_limiter.allow(_client_key(request)):
        raise HTTPException(429, "That's a lot of messages this hour. Try again later.")
    if not keys.any and not daily.available():
        raise HTTPException(503, "Today's free capacity is used up. Add your own API key, "
                                 "or come back tomorrow.")
    try:
        persona = find_persona(snapshot, body.persona_id, s.janta_show_attitude)
    except LookupError as err:
        raise HTTPException(404, "Nobody with that id took part in this debate") from err
    try:
        llms = build_llms(s, keys)
    except LLMError as err:
        raise HTTPException(400, f"Server isn't configured for real models yet: {err}") from err

    budget = TokenBudget(s.chat_tokens_per_message)
    try:
        return await chat_reply(client_for(llms, persona), persona, snapshot, body, budget)
    except (LLMError, BudgetExceeded) as err:
        raise HTTPException(502, f"{persona.name} couldn't answer just now. Try again. "
                                 f"({str(err)[:120]})") from err
    finally:
        if not keys.any:
            daily.add(budget.used)


@router.post("/debates/{debate_id}/reply", dependencies=INTERNAL)
async def reply(debate_id: str, body: FounderReply, request: Request) -> dict:
    _, sessions, *_ = _state(request)
    session = sessions.get(debate_id)
    if not session or session.mode != "sharks":
        raise HTTPException(404, "No live Sharks debate with that id")
    if not session.awaiting_founder:
        raise HTTPException(409, "The sharks aren't waiting for your answer right now")
    try:
        session.founder_inbox.put_nowait(None if body.skip else body.text.strip())
    except asyncio.QueueFull as err:
        raise HTTPException(409, "Answer already received") from err
    return {"ok": True}


@router.post("/debates/{debate_id}/deal", dependencies=INTERNAL)
async def deal(debate_id: str, body: FounderDeal, request: Request) -> dict:
    """The founder accepts, counters or walks away from the offers on the table."""
    _, sessions, *_ = _state(request)
    session = sessions.get(debate_id)
    if not session or session.mode != "sharks":
        raise HTTPException(404, "No live Sharks debate with that id")
    table = session.open_deal
    if table is None:
        raise HTTPException(409, "No offers are waiting for your answer right now")
    if body.action != "walk" and body.offer_id not in table["offer_ids"]:
        raise HTTPException(409, "That offer isn't on the table")
    if body.action == "counter" and not table["can_counter"]:
        raise HTTPException(409, "You've already used your counter-offer")
    try:
        session.deal_inbox.put_nowait(body.model_dump())
    except asyncio.QueueFull as err:
        raise HTTPException(409, "Answer already received") from err
    return {"ok": True}


# ---------- voice ----------

@router.post("/voice/transcribe", dependencies=INTERNAL)
async def transcribe(request: Request) -> dict:
    """One recorded clip (the raw audio is the request body) to text. Not stored."""
    s, *_ = _state(request)
    if voice_mode(s) == "off":
        raise HTTPException(400, "Voice isn't available right now")
    content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if content_type not in AUDIO_TYPES:
        raise HTTPException(415, "That recording format isn't supported")
    audio = bytearray()
    async for chunk in request.stream():  # stop reading as soon as it is too big
        audio += chunk
        if len(audio) > MAX_CLIP_BYTES:
            raise HTTPException(413, "That recording is too long")
    if not audio:
        raise HTTPException(400, "The recording was empty")
    if not request.app.state.clip_limiter.allow(_client_key(request)):
        raise HTTPException(429, "That's a lot of recordings this hour. Type instead, or try later.")
    try:
        text = await request.app.state.voice.transcribe(bytes(audio), content_type)
    except VoiceLimit as err:
        raise HTTPException(503, str(err)) from err
    except VoiceError as err:
        log.warning("transcribe failed", extra={"error": str(err)[:300]})
        raise HTTPException(502, "Couldn't turn that into text. Try again.") from err
    return {"text": text}


@router.post("/debates/{debate_id}/speech", dependencies=INTERNAL)
async def speech(debate_id: str, body: SpeechRequest, request: Request) -> Response:
    """The audio of one thing a shark said in this debate."""
    s, sessions, *_ = _state(request)
    live = sessions.get(debate_id)
    snapshot = (live.snapshot() if live
                else await asyncio.to_thread(open_store(s).load, debate_id))
    if not snapshot:
        raise HTTPException(404, "Debate not found")
    if not snapshot.get("request", {}).get("voice") or voice_mode(s) == "off":
        raise HTTPException(409, "This run doesn't include voice")
    event = next((e for e in snapshot["events"] if e["id"] == body.event_id), None)
    shark = event and next((p for p in load_sharks() if p.id == event.get("speaker")), None)
    if not event or event["type"] not in SPOKEN_EVENTS or not event.get("text") or not shark:
        raise HTTPException(404, "Nothing to read out there")
    try:
        audio, mime = await request.app.state.voice.speak(
            debate_id, body.event_id, event["text"], shark.voice)
    except VoiceLimit as err:
        raise HTTPException(429, str(err)) from err
    except VoiceError as err:
        log.warning("speech failed", extra={"debate_id": debate_id, "error": str(err)[:300]})
        raise HTTPException(502, "Couldn't voice that line") from err
    return Response(audio, media_type=mime)


@router.post("/debates/{debate_id}/hold", dependencies=INTERNAL)
async def hold(debate_id: str, request: Request) -> dict:
    """A voice run's founder is still listening or recording: restart their clock."""
    _, sessions, *_ = _state(request)
    session = sessions.get(debate_id)
    if not session or not session.request.get("voice"):
        raise HTTPException(404, "No live voice debate with that id")
    expires_at = await session.hold()
    if expires_at is None:
        raise HTTPException(409, "Nothing is waiting for you right now")
    return {"expires_at": expires_at}
