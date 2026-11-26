"""Both debate stores. The Postgres tests need a migrated test database and are skipped
without one:  DATABASE_URL=$TEST_DATABASE_URL npm run db:migrate  (in web/)."""
import os
import time
import uuid

import psycopg
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import Settings
from app.store import FileStore, PostgresStore, close_store, open_store

TEST_URL = os.environ.get("TEST_DATABASE_URL",
                          "postgresql://127.0.0.1:5432/pitch_panchayat_test")
PITCH = "A WhatsApp-first app that helps kirana shops in tier-2 cities reorder stock in one tap."


def postgres_ready() -> bool:
    try:
        with psycopg.connect(TEST_URL, connect_timeout=2) as conn:
            return conn.execute("SELECT to_regclass('engine.debates')").fetchone()[0] is not None
    except psycopg.Error:
        return False


needs_postgres = pytest.mark.skipif(not postgres_ready(), reason="no migrated test database")


@pytest.fixture(params=["files", pytest.param("postgres", marks=needs_postgres)])
def store(request, tmp_path):
    made = FileStore(str(tmp_path)) if request.param == "files" else PostgresStore(TEST_URL)
    made.check()
    yield made
    made.close()


def test_save_load_update_delete(store):
    debate_id = uuid.uuid4().hex[:12]
    snap = {"id": debate_id, "mode": "sharks", "finished": True,
            "request": {"pitch": "₹50 lakh के लिए"}, "events": [{"id": 0, "type": "done"}]}
    try:
        assert store.load(debate_id) is None
        store.save(snap)
        assert store.load(debate_id) == snap
        store.save(snap | {"events": []})  # saving again replaces
        assert store.load(debate_id)["events"] == []
    finally:
        store.delete(debate_id)
    assert store.load(debate_id) is None
    store.delete(debate_id)  # deleting twice is fine


def test_unsafe_ids_are_refused(store):
    for bad in ("../../etc", "ABCDEF123456", "x' OR 1=1 --", ""):
        assert store.load(bad) is None
        store.delete(bad)


@needs_postgres
def test_text_with_a_nul_character_is_still_saved():
    store = PostgresStore(TEST_URL)
    debate_id = uuid.uuid4().hex[:12]
    try:
        store.save({"id": debate_id, "mode": "janta", "events": [{"text": "a\x00b"}]})
        assert store.load(debate_id)["events"] == [{"text": "ab"}]
    finally:
        store.delete(debate_id)
        store.close()


@needs_postgres
def test_a_debate_survives_an_engine_restart_and_can_be_erased(tmp_path):
    settings = Settings(_env_file=None, env="test", fake_delay_s=0, janta_pace_s=0,
                        data_dir=str(tmp_path), database_url=TEST_URL, llm_provider="fake",
                        judge_provider="fake")
    with TestClient(create_app(settings)) as client:
        debate_id = client.post("/api/debates", json={"mode": "janta", "pitch": PITCH,
                                                      "panel_size": 6}).json()["id"]
        deadline = time.time() + 20
        while time.time() < deadline and open_store(settings).load(debate_id) is None:
            time.sleep(0.05)
    close_store(settings)
    try:
        with TestClient(create_app(settings)) as restarted:  # nothing left in memory
            saved = restarted.get(f"/api/debates/{debate_id}")
            assert saved.status_code == 200 and saved.json()["events"][-1]["type"] == "done"
            assert restarted.delete(f"/api/debates/{debate_id}").status_code == 204
            assert restarted.get(f"/api/debates/{debate_id}").status_code == 404
        assert not list(tmp_path.rglob("*.json"))  # nothing was written to files
    finally:
        cleanup = PostgresStore(TEST_URL)
        cleanup.delete(debate_id)
        cleanup.close()
