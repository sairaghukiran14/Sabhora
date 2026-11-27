"""Speech in and out: the founder's recording to text, and a shark's line to audio.

Real voices come from Sarvam (docs read, and both calls tried with a real key on generated
speech, 27 Nov 2026):
- speech-to-text: POST /speech-to-text, multipart, at most 30 seconds a clip
- text-to-speech: POST /text-to-speech, JSON, at most 2,500 characters, base64 audio back

Speech costs real money (about Rs 2 per 1,000 spoken characters and Rs 0.49 per minute
heard), far more per run than the text models, so every path here is capped. Recordings are
passed straight through and never stored or logged.
"""
import asyncio
import base64
import io
import math
import struct
import wave
from collections import OrderedDict
from typing import Literal

import httpx

from .budget import DailyBudget
from .settings import Settings

VoiceMode = Literal["live", "demo", "off"]

# What browsers record (Chrome/Firefox: webm or ogg; Safari: mp4), plus wav.
AUDIO_TYPES = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "mp4", "audio/wav": "wav"}
MAX_CLIP_BYTES = 1_500_000  # a 30 s clip at the app's 32 kbps is about 120 KB
# Events whose words a shark actually said. Only these are ever turned into audio, so the
# speech route cannot be used to read out arbitrary text on our key.
SPOKEN_EVENTS = {"message", "offer", "counter_reply"}
CACHE_BYTES = 60_000_000

DEMO_TRANSCRIPT = ("This is demo speech to text. We deliver home cooked tiffin to office "
                   "workers in Pune.")


class VoiceError(Exception):
    """The speech provider failed, or there was nothing to hear."""


class VoiceLimit(Exception):
    """A spending cap was reached."""


def voice_mode(s: Settings) -> VoiceMode:
    """"demo" (placeholder audio) is only offered alongside the demo AI. A server with real
    models but no real voice offers none, so nobody pays credits for a beep."""
    if s.voice_provider == "sarvam":
        return "live" if s.sarvam_api_key else "off"
    return "demo" if s.llm_provider == "fake" else "off"


def _demo_audio(text: str) -> bytes:
    """A soft tone whose length follows the text, so playback and timing can be tested."""
    rate = 8000
    seconds = min(4.0, 0.4 + len(text) / 400)
    frames = b"".join(
        struct.pack("<h", int(1500 * math.sin(2 * math.pi * 330 * i / rate)))
        for i in range(int(rate * seconds)))
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(frames)
    return out.getvalue()


class VoiceService:
    """One per server. Holds the caps and a small cache, so replaying a debate does not pay
    for the same line twice (until the server restarts)."""

    def __init__(self, s: Settings) -> None:
        self.s = s
        self.daily_chars = DailyBudget(s.voice_daily_chars)
        self.daily_clips = DailyBudget(s.voice_daily_clips)
        self._spent: dict[str, int] = {}  # debate id -> characters synthesised
        self._cache: OrderedDict[tuple[str, int], tuple[bytes, str]] = OrderedDict()
        self._cached_bytes = 0
        self._locks: dict[tuple[str, int], asyncio.Lock] = {}

    # ---------- text to speech ----------

    async def speak(self, debate_id: str, event_id: int, text: str,
                    speaker: str) -> tuple[bytes, str]:
        key = (debate_id, event_id)
        lock = self._locks.setdefault(key, asyncio.Lock())
        try:
            async with lock:  # two tabs asking for the same line pay once
                if key in self._cache:
                    self._cache.move_to_end(key)
                    return self._cache[key]
                chars = len(text[:2500])
                if self._spent.get(debate_id, 0) + chars > self.s.voice_max_chars_per_debate:
                    raise VoiceLimit("This run has used all of its voice time")
                if not self.daily_chars.available():
                    raise VoiceLimit("Today's voice capacity is used up")
                # Counted before the call, so parallel requests cannot slip past the cap.
                self._spent[debate_id] = self._spent.get(debate_id, 0) + chars
                try:
                    audio = await self._synthesise(text[:2500], speaker)
                except BaseException:
                    self._spent[debate_id] -= chars
                    raise
                self.daily_chars.add(chars)
                self._remember(key, audio)
                return audio
        finally:
            if not lock.locked():
                self._locks.pop(key, None)

    def _remember(self, key: tuple[str, int], audio: tuple[bytes, str]) -> None:
        self._cache[key] = audio
        self._cached_bytes += len(audio[0])
        while self._cached_bytes > CACHE_BYTES and len(self._cache) > 1:
            _, (old, _mime) = self._cache.popitem(last=False)
            self._cached_bytes -= len(old)

    def forget(self, debate_id: str) -> None:
        """The owner deleted the debate: drop its audio too."""
        for key in [k for k in self._cache if k[0] == debate_id]:
            self._cached_bytes -= len(self._cache.pop(key)[0])

    async def _synthesise(self, text: str, speaker: str) -> tuple[bytes, str]:
        if self.s.voice_provider == "fake":
            return _demo_audio(text), "audio/wav"
        data = await self._post("/text-to-speech", json={
            "text": text, "model": self.s.sarvam_tts_model, "speaker": speaker,
            "language_code": self.s.sarvam_tts_language, "output_audio_codec": "mp3",
            "enable_preprocessing": True,
        })
        try:
            return base64.b64decode(data["audios"][0]), "audio/mpeg"
        except (KeyError, IndexError, ValueError) as err:
            raise VoiceError("the speech provider sent no audio") from err

    # ---------- speech to text ----------

    async def transcribe(self, audio: bytes, content_type: str) -> str:
        if not self.daily_clips.available():
            raise VoiceLimit("Today's voice capacity is used up")
        self.daily_clips.add(1)  # counted per attempt: a failed call may still be billed
        if self.s.voice_provider == "fake":
            return DEMO_TRANSCRIPT
        data = await self._post(
            "/speech-to-text",
            files={"file": (f"clip.{AUDIO_TYPES[content_type]}", audio, content_type)},
            # See sarvam_stt_mode in settings.py: the figure checks and crowd targeting
            # need digits and English spellings.
            data={"model": self.s.sarvam_stt_model, "mode": self.s.sarvam_stt_mode,
                  "language_code": "unknown"},
        )
        return str(data.get("transcript") or "").strip()

    async def _post(self, path: str, **kwargs) -> dict:
        # The speech endpoints sit at the root, not under the chat API's /v1.
        root = self.s.sarvam_base_url.rstrip("/").rsplit("/v", 1)[0]
        try:
            async with httpx.AsyncClient(timeout=self.s.llm_timeout_s) as http:
                r = await http.post(f"{root}{path}", **kwargs,
                                    headers={"api-subscription-key": self.s.sarvam_api_key})
        except httpx.HTTPError as err:
            raise VoiceError(f"sarvam: {err!r}") from err
        if r.status_code >= 400:
            raise VoiceError(f"sarvam: HTTP {r.status_code}: {r.text[:200]}")
        try:
            return r.json()
        except ValueError as err:
            raise VoiceError("sarvam: the reply was not JSON") from err
