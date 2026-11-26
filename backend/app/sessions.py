"""Live debate sessions: an event log the browser streams, and an inbox for founder replies.

Every event is kept in order with an id, so a browser that reconnects (or opens late)
gets everything it missed: we "replay" from the last id it saw.
"""
import asyncio
import time
import uuid
from collections.abc import AsyncIterator
from functools import partial

TERMINAL = "done"


class DebateSession:
    def __init__(self, mode: str, request: dict) -> None:
        self.id = uuid.uuid4().hex[:12]
        self.mode = mode
        self.request = request  # what the user submitted (pitch, tone, url)
        self.events: list[dict] = []
        self.finished = False
        self.deleted = False  # the owner asked for it to be removed: never save it
        self.awaiting_founder = False
        self.founder_inbox: asyncio.Queue[str | None] = asyncio.Queue(maxsize=3)
        # Set while offers await the founder: {"offer_ids": [...], "can_counter": bool}
        self.open_deal: dict | None = None
        self.deal_inbox: asyncio.Queue[dict] = asyncio.Queue(maxsize=1)
        self.created_at = time.monotonic()
        self.budgets: list = []  # every TokenBudget this debate used, so spend is counted even on failure
        self.task: asyncio.Task | None = None  # keep a reference so it is not garbage-collected
        self._changed = asyncio.Condition()

    @property
    def tokens_used(self) -> int:
        return sum(b.used for b in self.budgets)

    async def emit(self, type_: str, **data: object) -> dict:
        """Append one event and wake every listener."""
        event = {"id": len(self.events), "type": type_, **data}
        async with self._changed:
            self.events.append(event)
            if type_ == TERMINAL:
                self.finished = True
            self._changed.notify_all()
        return event

    def _has_news(self, cursor: int) -> bool:
        return len(self.events) > cursor or self.finished

    async def subscribe(self, after: int = -1, heartbeat_s: float = 15.0) -> AsyncIterator[dict | None]:
        """Yield events with id > after, live. Yields None as a heartbeat when quiet."""
        cursor = after + 1
        while True:
            async with self._changed:
                try:
                    await asyncio.wait_for(
                        self._changed.wait_for(partial(self._has_news, cursor)),
                        timeout=heartbeat_s,
                    )
                except TimeoutError:
                    pending: list[dict] = []
                else:
                    pending = self.events[cursor:]
            if not pending:
                if self.finished:
                    return
                yield None  # heartbeat
                continue
            for event in pending:
                yield event
                cursor = event["id"] + 1
                if event["type"] == TERMINAL:
                    return

    def snapshot(self) -> dict:
        return {"id": self.id, "mode": self.mode, "request": self.request,
                "events": self.events, "finished": self.finished}


class SessionStore:
    """In-memory store. One server is enough for this prototype; swap for Redis to scale out."""

    def __init__(self, ttl_s: int, max_active: int) -> None:
        self._sessions: dict[str, DebateSession] = {}
        self.ttl_s = ttl_s
        self.max_active = max_active

    def _sweep(self) -> None:
        now = time.monotonic()
        for sid in [sid for sid, s in self._sessions.items()
                    if s.finished and now - s.created_at > self.ttl_s]:
            del self._sessions[sid]

    def active_count(self) -> int:
        return sum(1 for s in self._sessions.values() if not s.finished)

    def create(self, mode: str, request: dict) -> DebateSession:
        self._sweep()
        session = DebateSession(mode, request)
        self._sessions[session.id] = session
        return session

    def remove(self, sid: str) -> None:
        """Forget a debate, stopping it first if it is still running."""
        session = self._sessions.pop(sid, None)
        if session is None:
            return
        session.deleted = True
        if session.task and not session.task.done():
            session.task.cancel()

    def get(self, sid: str) -> DebateSession | None:
        return self._sessions.get(sid)
