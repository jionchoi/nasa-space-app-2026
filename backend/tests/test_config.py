"""Allowed browser origins: localhost by default, extra ones only from COPILOT_ALLOWED_ORIGINS."""
from types import SimpleNamespace

from app.config import DEFAULT_ORIGINS, allowed_origins
from app.routers.signals import allowed_origin


def ws(origin):
    return SimpleNamespace(headers={} if origin is None else {"origin": origin})


def test_localhost_only_by_default(monkeypatch):
    monkeypatch.delenv("COPILOT_ALLOWED_ORIGINS", raising=False)
    assert allowed_origins() == list(DEFAULT_ORIGINS)
    assert allowed_origin(ws("http://localhost:5173")) and allowed_origin(ws(None))
    assert not allowed_origin(ws("http://192.168.1.20:5173"))


def test_extra_origin_from_setting(monkeypatch):
    monkeypatch.setenv("COPILOT_ALLOWED_ORIGINS", " http://192.168.1.20:5173/ ,")
    assert allowed_origins() == [*DEFAULT_ORIGINS, "http://192.168.1.20:5173"]
    assert allowed_origin(ws("http://192.168.1.20:5173"))
    assert not allowed_origin(ws("http://evil.example"))
