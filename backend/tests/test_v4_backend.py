"""v4 backend additions: Polish wording (hidden without a key; the key is never returned) and the mood form."""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_status_without_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    res = client.get("/api/assist/status")
    assert res.status_code == 200
    assert res.json() == {"available": False}


def test_polish_without_key_is_unavailable(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    res = client.post("/api/assist/polish", json={"text": "Day 45, ISS. Heart: Warning."})
    assert res.status_code == 503


def test_status_never_returns_the_key(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-secret")
    from app.routers import assist
    monkeypatch.setattr(assist, "_is_online", lambda: False)
    body = client.get("/api/assist/status").text
    assert "sk-test-secret" not in body
    assert '"available":false' in body.replace(" ", "")


def test_mood_form_is_validated():
    ok = client.post("/api/forms", json={"persona": "A", "kind": "mood", "data": {"mood": 7, "symptoms": ["headache"], "notes": ""}})
    assert ok.status_code == 200 and ok.json()["ok"]
    bad = client.post("/api/forms", json={"persona": "A", "kind": "mood", "data": {"mood": 11}})
    assert bad.status_code == 422
