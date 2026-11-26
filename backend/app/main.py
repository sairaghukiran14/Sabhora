"""App factory: wires settings, shared state, API routes and the frontend page."""
import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .api import router
from .budget import DailyBudget
from .logging_setup import setup_logging
from .ratelimit import RateLimiter
from .sessions import SessionStore
from .settings import Settings, get_settings
from .store import close_store, open_store

FRONTEND = Path(__file__).resolve().parents[2] / "frontend" / "index.html"


def create_app(settings: Settings | None = None) -> FastAPI:
    s = settings or get_settings()
    setup_logging(s.log_level)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        store = open_store(s)
        await asyncio.to_thread(store.check)
        logging.getLogger(__name__).info("saving debates to %s", store.kind)
        yield
        close_store(s)

    app = FastAPI(title="Sabhora API", version="0.1.0", lifespan=lifespan)
    app.state.settings = s
    app.state.sessions = SessionStore(s.session_ttl_s, s.max_active_debates)
    app.state.daily = DailyBudget(s.daily_token_limit)
    app.state.limiter = RateLimiter(s.rate_limit_per_hour)
    app.state.chat_limiter = RateLimiter(s.chat_rate_per_hour)
    app.add_middleware(CORSMiddleware, allow_origins=s.cors_origins, allow_methods=["*"],
                       allow_headers=["*"])
    app.include_router(router)

    # The prototype frontend is one HTML file, served from the same origin (no CORS, no build).
    @app.get("/", include_in_schema=False)
    @app.get("/d/{debate_id}", include_in_schema=False)
    async def page(debate_id: str | None = None) -> FileResponse:
        return FileResponse(FRONTEND, headers={"Cache-Control": "no-cache"})

    return app


app = create_app()
