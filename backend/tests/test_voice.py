"""Voice: the speech routes, their caps, and the founder's clock. All on the fake provider."""
import asyncio

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.sessions import DebateSession
from app.settings import Settings
from app.voice import VoiceLimit, VoiceService, voice_mode


def make(tmp_path, **over) -> Settings:
    base = dict(_env_file=None, env="test", fake_delay_s=0, founder_wait_s=0.1, deal_wait_s=0.1,
                voice_founder_wait_s=0.1, data_dir=str(tmp_path), database_url="")
    return Settings(**{**base, **over})


def test_demo_voice_is_never_offered_beside_real_models(tmp_path):
    assert voice_mode(make(tmp_path)) == "demo"
    assert voice_mode(make(tmp_path, llm_provider="sarvam")) == "off"
    assert voice_mode(make(tmp_path, voice_provider="sarvam")) == "off"  # no key
    assert voice_mode(make(tmp_path, voice_provider="sarvam", sarvam_api_key="k")) == "live"


def test_transcribe_checks_type_size_and_hourly_limit(tmp_path):
    with TestClient(create_app(make(tmp_path, voice_clip_rate_per_hour=1))) as c:
        post = lambda body, kind: c.post("/api/voice/transcribe", content=body,
                                         headers={"content-type": kind})
        assert post(b"x", "text/plain").status_code == 415
        assert post(b"", "audio/webm").status_code == 400
        assert post(b"x" * 1_500_001, "audio/webm").status_code == 413
        ok = post(b"x" * 100, "audio/webm;codecs=opus")
        assert ok.status_code == 200 and ok.json()["text"]
        assert post(b"x", "audio/mp4").status_code == 429


def test_transcribe_needs_the_internal_token(tmp_path):
    with TestClient(create_app(make(tmp_path, internal_api_token="t" * 40))) as c:
        r = c.post("/api/voice/transcribe", content=b"x", headers={"content-type": "audio/webm"})
        assert r.status_code == 401


def run_sharks(c, voice: bool) -> tuple[str, list[dict]]:
    body = {"mode": "sharks", "pitch": "A tiffin service for office workers in Pune.",
            "voice": voice}
    sid = c.post("/api/debates", json=body).json()["id"]
    with c.stream("GET", f"/api/debates/{sid}/stream") as r:
        for _ in r.iter_lines():
            pass
    return sid, c.get(f"/api/debates/{sid}").json()["events"]


def test_speech_reads_only_what_a_shark_said(tmp_path):
    with TestClient(create_app(make(tmp_path))) as c:
        sid, events = run_sharks(c, voice=True)
        line = next(e for e in events if e["type"] == "message")
        r = c.post(f"/api/debates/{sid}/speech", json={"event_id": line["id"]})
        assert r.status_code == 200 and r.headers["content-type"] == "audio/wav"
        assert r.content[:4] == b"RIFF"
        assert c.post(f"/api/debates/{sid}/speech", json={"event_id": 0}).status_code == 404
        assert c.post(f"/api/debates/{sid}/speech", json={"event_id": 9999}).status_code == 404


def test_a_run_without_voice_gets_no_speech(tmp_path):
    with TestClient(create_app(make(tmp_path))) as c:
        sid, events = run_sharks(c, voice=False)
        line = next(e for e in events if e["type"] == "message")
        assert c.post(f"/api/debates/{sid}/speech", json={"event_id": line["id"]}).status_code == 409


def test_voice_is_refused_outside_sharks(tmp_path):
    with TestClient(create_app(make(tmp_path))) as c:
        r = c.post("/api/debates", json={"mode": "janta", "voice": True,
                                         "pitch": "A tiffin service for office workers."})
        assert r.status_code == 400


async def test_speech_is_capped_per_run_and_cached_lines_cost_nothing(tmp_path):
    voice = VoiceService(make(tmp_path, voice_max_chars_per_debate=20))
    await voice.speak("d", 1, "a" * 15, "s")
    await voice.speak("d", 1, "a" * 15, "s")  # same line: from the cache
    with pytest.raises(VoiceLimit):
        await voice.speak("d", 2, "b" * 15, "s")
    await voice.speak("other", 2, "b" * 15, "s")  # each run has its own allowance
    voice.forget("d")
    with pytest.raises(VoiceLimit):  # forgetting audio does not refill the allowance
        await voice.speak("d", 1, "a" * 15, "s")


async def test_hold_restarts_the_clock_but_never_past_the_limit():
    session = DebateSession("sharks", {"voice": True})
    assert await session.hold() is None  # nothing waiting
    inbox: asyncio.Queue = asyncio.Queue()
    task = asyncio.create_task(session.wait_for_founder_input(inbox, 1.5, 3.0))
    await asyncio.sleep(1.2)
    first = session.deadline
    assert await session.hold() > first  # pushed later
    assert session.events[-1]["type"] == "clock"
    await asyncio.sleep(0.6)  # past the original deadline, still waiting
    assert not task.done()
    inbox.put_nowait("my answer")
    assert await task == "my answer"


async def test_wait_ends_at_the_limit_even_when_held_forever():
    session = DebateSession("sharks", {"voice": True})
    inbox: asyncio.Queue = asyncio.Queue()
    task = asyncio.create_task(session.wait_for_founder_input(inbox, 1.2, 2.5))
    started = asyncio.get_running_loop().time()
    while not task.done():
        await asyncio.sleep(0.3)
        await session.hold()
    with pytest.raises(TimeoutError):
        await task
    assert asyncio.get_running_loop().time() - started < 3.2
