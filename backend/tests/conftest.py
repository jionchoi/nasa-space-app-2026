import json
import shutil

import pytest
from fastapi.testclient import TestClient

from app import alerts, sensor, store
from app.main import app


@pytest.fixture(autouse=True)
def fresh_store(tmp_path, monkeypatch):
    """Every test gets its own empty SQLite file and clean in-memory state."""
    monkeypatch.setenv("COPILOT_DB", str(tmp_path / "app.db"))
    store.reset()
    alerts.reset()
    sensor.hub.reset()
    yield
    store.reset()
    alerts.reset()
    sensor.hub.reset()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def cfg():
    return store.thresholds(), store.regions(), store.escalation()


@pytest.fixture
def temp_data(tmp_path, monkeypatch):
    """A private copy of backend/data so a test can edit thresholds.json."""
    target = tmp_path / "data"
    shutil.copytree(store.DATA_DIR, target, ignore=shutil.ignore_patterns("app.db*"))
    monkeypatch.setattr(store, "DATA_DIR", target)
    store.reset()

    def edit(name, change):
        path = target / name
        data = json.loads(path.read_text(encoding="utf-8"))
        change(data)
        path.write_text(json.dumps(data), encoding="utf-8")

    return edit
