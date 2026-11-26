"""Where finished debates are kept, so share links can replay them.

With DATABASE_URL set they go to Postgres (table engine.debates, created by the web app's
`npm run db:migrate`). Without it they are JSON files under DATA_DIR, which keeps tests and
the offline demo free of any database.

Both stores are blocking; async code calls them with asyncio.to_thread.
"""
import json
import re
import threading
from pathlib import Path
from typing import Protocol

from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from .settings import Settings

_SAFE_ID = re.compile(r"^[a-f0-9]{12}$")


class DebateStore(Protocol):
    kind: str

    def check(self) -> None: ...
    def save(self, snapshot: dict) -> None: ...
    def load(self, debate_id: str) -> dict | None: ...
    def delete(self, debate_id: str) -> None: ...
    def close(self) -> None: ...


class FileStore:
    """One JSON file per debate."""

    kind = "files"

    def __init__(self, data_dir: str) -> None:
        self.folder = Path(data_dir) / "debates"

    def _path(self, debate_id: str) -> Path | None:
        if not _SAFE_ID.match(debate_id):  # ids are hex; refuse anything that could escape
            return None
        return self.folder / f"{debate_id}.json"

    def check(self) -> None:
        pass

    def save(self, snapshot: dict) -> None:
        path = self._path(snapshot["id"])
        if path is None:
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(snapshot, ensure_ascii=False), encoding="utf-8")

    def load(self, debate_id: str) -> dict | None:
        path = self._path(debate_id)
        if path is None or not path.exists():
            return None
        return json.loads(path.read_text(encoding="utf-8"))

    def delete(self, debate_id: str) -> None:
        path = self._path(debate_id)
        if path is not None:
            path.unlink(missing_ok=True)

    def close(self) -> None:
        pass


def _without_nul(value: object) -> object:
    """Postgres can't store the NUL character, which model or user text could contain."""
    if isinstance(value, str):
        return value.replace("\x00", "")
    if isinstance(value, dict):
        return {k: _without_nul(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_without_nul(v) for v in value]
    return value


class PostgresStore:
    kind = "postgres"

    def __init__(self, url: str) -> None:
        # Opened on first use, so importing the app never needs a database. The timeouts are
        # generous because a hosted database that scales to zero takes a few seconds to wake,
        # and `check` throws away a connection the host closed while it sat idle.
        self._pool = ConnectionPool(url, min_size=1, max_size=5, timeout=20, open=False,
                                    kwargs={"connect_timeout": 15},
                                    check=ConnectionPool.check_connection)
        self._lock = threading.Lock()
        self._opened = False

    def _connection(self):
        with self._lock:
            if not self._opened:
                self._pool.open()
                self._opened = True
        return self._pool.connection()  # commits on success, rolls back on error

    def check(self) -> None:
        """Fail at startup, with a fix, rather than when the first debate finishes."""
        with self._connection() as conn:
            row = conn.execute("SELECT to_regclass('engine.debates')").fetchone()
        if row is None or row[0] is None:
            raise RuntimeError("The engine.debates table is missing. "
                               "Run `npm run db:migrate` in web/ against this DATABASE_URL.")

    def save(self, snapshot: dict) -> None:
        if not _SAFE_ID.match(snapshot["id"]):
            return
        with self._connection() as conn:
            conn.execute(
                "INSERT INTO engine.debates (id, mode, snapshot) VALUES (%s, %s, %s) "
                "ON CONFLICT (id) DO UPDATE SET mode = excluded.mode, "
                "snapshot = excluded.snapshot, updated_at = now()",
                (snapshot["id"], snapshot["mode"], Jsonb(_without_nul(snapshot))))

    def load(self, debate_id: str) -> dict | None:
        if not _SAFE_ID.match(debate_id):
            return None
        with self._connection() as conn:
            row = conn.execute("SELECT snapshot FROM engine.debates WHERE id = %s",
                               (debate_id,)).fetchone()
        return row[0] if row else None

    def delete(self, debate_id: str) -> None:
        if not _SAFE_ID.match(debate_id):
            return
        with self._connection() as conn:
            conn.execute("DELETE FROM engine.debates WHERE id = %s", (debate_id,))

    def close(self) -> None:
        with self._lock:
            if self._opened:
                self._pool.close()


_stores: dict[tuple[str, str], DebateStore] = {}


def open_store(s: Settings) -> DebateStore:
    """The store for these settings. Shared, so there is one connection pool per database."""
    key = ("postgres", s.database_url) if s.database_url else ("files", s.data_dir)
    if key not in _stores:
        _stores[key] = PostgresStore(s.database_url) if s.database_url else FileStore(s.data_dir)
    return _stores[key]


def close_store(s: Settings) -> None:
    key = ("postgres", s.database_url) if s.database_url else ("files", s.data_dir)
    store = _stores.pop(key, None)
    if store:
        store.close()
