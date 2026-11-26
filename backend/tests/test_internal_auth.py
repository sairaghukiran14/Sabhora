"""The web app's shared secret: debate routes are closed to anyone without it."""
import time

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import Settings

TOKEN = "t" * 40
BODY = {"mode": "sharks", "pitch": "A WhatsApp-first app that helps kirana shops reorder stock."}


def make_client(tmp_path, **extra) -> TestClient:
    settings = Settings(_env_file=None, env="test", fake_delay_s=0, founder_wait_s=0.1,
                        janta_pace_s=0, data_dir=str(tmp_path), llm_provider="fake",
                        judge_provider="fake", **extra)
    return TestClient(create_app(settings))


@pytest.mark.parametrize("headers", [{}, {"x-internal-token": "wrong"},
                                     {"x-client-id": "someone"}])
def test_debate_routes_need_the_token(tmp_path, headers):
    with make_client(tmp_path, internal_api_token=TOKEN) as client:
        assert client.post("/api/debates", json=BODY, headers=headers).status_code == 401
        assert client.get("/api/debates/abc123abc123", headers=headers).status_code == 401
        assert client.get("/api/debates/abc123abc123/stream", headers=headers).status_code == 401
        assert client.post("/api/debates/abc123abc123/reply", json={"skip": True},
                           headers=headers).status_code == 401
        assert client.post("/api/debates/abc123abc123/deal", json={"action": "walk"},
                           headers=headers).status_code == 401
        assert client.post("/api/debates/abc123abc123/chat",
                           json={"persona_id": "meera", "message": "hi"},
                           headers=headers).status_code == 401
        assert client.get("/api/health").status_code == 200  # still open for monitoring


def test_rate_limit_is_per_end_user_behind_the_web_app(tmp_path):
    with make_client(tmp_path, internal_api_token=TOKEN, rate_limit_per_hour=1) as client:
        def start(user: str) -> int:
            return client.post("/api/debates", json=BODY,
                               headers={"x-internal-token": TOKEN, "x-client-id": user}).status_code
        assert start("alice") == 201
        assert start("alice") == 429
        assert start("bob") == 201  # one user's limit doesn't block another


def test_client_id_is_ignored_without_a_token(tmp_path):
    """With no secret configured, a visitor can't dodge the limit by inventing ids."""
    with make_client(tmp_path, rate_limit_per_hour=1) as client:
        assert client.post("/api/debates", json=BODY,
                           headers={"x-client-id": "a"}).status_code == 201
        assert client.post("/api/debates", json=BODY,
                           headers={"x-client-id": "b"}).status_code == 429


def test_prod_refuses_to_start_without_a_token():
    with pytest.raises(ValueError, match="INTERNAL_API_TOKEN"):
        Settings(_env_file=None, env="prod")
    assert Settings(_env_file=None, env="prod", internal_api_token=TOKEN)


def test_delete_erases_a_debate_and_needs_the_token(tmp_path):
    auth = {"x-internal-token": TOKEN, "x-client-id": "alice"}
    with make_client(tmp_path, internal_api_token=TOKEN) as client:
        debate_id = client.post("/api/debates", json=BODY, headers=auth).json()["id"]
        client.get(f"/api/debates/{debate_id}/stream", headers=auth)  # runs to the end
        saved = tmp_path / "debates" / f"{debate_id}.json"
        for _ in range(50):
            if saved.exists():
                break
            time.sleep(0.05)
        assert saved.exists()
        assert client.delete(f"/api/debates/{debate_id}").status_code == 401
        assert client.delete(f"/api/debates/{debate_id}", headers=auth).status_code == 204
        assert not saved.exists()
        assert client.get(f"/api/debates/{debate_id}", headers=auth).status_code == 404


def test_deleting_a_running_debate_stops_it_and_saves_nothing(tmp_path):
    auth = {"x-internal-token": TOKEN, "x-client-id": "alice"}
    with make_client(tmp_path, internal_api_token=TOKEN) as client:
        debate_id = client.post("/api/debates", json=BODY, headers=auth).json()["id"]
        assert client.delete(f"/api/debates/{debate_id}", headers=auth).status_code == 204
        time.sleep(0.5)
        assert not (tmp_path / "debates" / f"{debate_id}.json").exists()
        assert client.get(f"/api/debates/{debate_id}", headers=auth).status_code == 404
