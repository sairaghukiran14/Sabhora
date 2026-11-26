"""Runs any mode as a background task and always finishes it cleanly.

Whatever happens inside a debate, the browser gets either a verdict or a readable error,
then a final "done" event; the finished debate is saved so its share link can replay it.
"""
import asyncio
import logging
import time

from ..budget import DailyBudget
from ..llm.base import LLMError
from ..llm.factory import LLMs
from ..scraper import ScrapeError
from ..sessions import DebateSession
from ..settings import Settings
from ..store import DebateStore, open_store
from . import janta, roast, sharks

log = logging.getLogger(__name__)
ENGINES = {"sharks": sharks.run, "janta": janta.run, "roast": roast.run}


def _persist(store: DebateStore, session: DebateSession) -> None:
    """Saves unless the owner deleted the debate. Runs in a thread, so the second check
    catches a delete that arrived while the save was in flight."""
    if session.deleted:
        return
    store.save(session.snapshot())
    if session.deleted:
        store.delete(session.id)


async def run_debate(session: DebateSession, llms: LLMs, s: Settings,
                     daily: DailyBudget, byok: bool) -> None:
    started = time.monotonic()
    try:
        await ENGINES[session.mode](session, llms, s)
    except ScrapeError as err:
        await session.emit("error", message=str(err))
    except LLMError as err:
        await session.emit("error", message=f"The AI provider failed: {err}")
    except Exception:  # noqa: BLE001 - never leave a browser hanging
        log.exception("debate crashed", extra={"debate_id": session.id, "mode": session.mode})
        await session.emit("error", message="Something went wrong on our side. Please try again.")
    finally:
        if not byok:
            daily.add(session.tokens_used)  # BYOK runs spend the visitor's credits, not yours
        await session.emit("done", tokens=session.tokens_used,
                           crowd_model=llms.crowd.name, judge_model=llms.judge.name)
        log.info("debate finished", extra={"debate_id": session.id, "mode": session.mode,
                                           "tokens": session.tokens_used,
                                           "ms": int(1000 * (time.monotonic() - started))})
        try:
            await asyncio.to_thread(_persist, open_store(s), session)
        except Exception:  # noqa: BLE001 - the web app keeps its own copy of the result
            log.exception("could not save debate", extra={"debate_id": session.id})
