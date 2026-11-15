from app import store
from app.models import Environment, Protocol, VitalsFrame


def test_health(client):
    assert client.get("/api/health").json() == {"ok": True}


def test_status_endpoint(client):
    rows = client.get("/api/status?persona=B&env=mars").json()
    assert [r["region"] for r in rows] == [
        "brain_mood", "heart", "lungs", "immune", "metabolism", "bones_muscles", "radiation"]
    assert set(rows[0]) == {"region", "status", "score", "trend", "time_to_act_days", "reason", "advice_level",
                            "metric_status"}  # metric_status added Nov 14 (additive)


def test_unknown_persona_falls_back_to_a(client):
    assert client.get("/api/status?persona=ZZ").json() == client.get("/api/status?persona=A").json()


def test_daily_and_personas(client):
    daily = client.get("/api/persona/B/daily").json()
    assert len(daily) == 30 and "exercise_min_7d" in daily[-1] and "radiation_total_msv" in daily[-1]
    assert [p["id"] for p in client.get("/api/personas").json()] == ["A", "B", "C"]


def test_config_files(client):
    for env in client.get("/api/environments").json():
        Environment.model_validate(env)
    for pid in ("chest_pain", "unresponsive"):
        protocol = Protocol.model_validate(client.get(f"/api/protocols/{pid}").json())
        # Nov 15: medical lead's node protocols. CPR is a step (CL07, CL13); chest pain hands an unresponsive crew member to CL00.
        assert any(s.cpr for s in protocol.steps) or any(s.on_no == "CL00" for s in protocol.steps)
    assert client.get("/api/protocols/nope").status_code == 404
    assert len(client.get("/api/questionnaire").json()["questions"]) == 9  # incl. the optional SANS eyesight question
    assert client.get("/api/cpr").json()["rate_per_min"] > 0


def test_events_log(client):
    event = {"t": "2026-11-14T10:00:00Z", "type": "unresponsive_suspected",
             "signals": {"source": "cv", "limb_motion": 0.02, "nbp": 0.9, "eyes_closed_s": 24, "pulse": "ok"}}
    assert client.post("/api/events", json=event).json() == {"ok": True, "alert_id": None}
    assert client.get("/api/events").json() == [event]
    assert client.post("/api/events", json={**event, "type": "nope"}).status_code == 422


def test_ws_replays_and_jumps(client):
    with client.websocket_connect("/ws/vitals?persona=C&speed=20&start=500") as ws:
        assert ws.receive_json() == {"type": "source_changed", "source": "replay"}  # control message first
        frames = [VitalsFrame.model_validate(ws.receive_json()) for _ in range(3)]
    assert frames[0].irregular is True and frames[0].source == "replay"
    assert frames[0].t != store.persona("C")["stream"][500]["t"]  # fresh timestamps


def test_editing_thresholds_file_changes_status(client, temp_data):
    assert all(r["status"] == "green" for r in client.get("/api/status?persona=A").json())
    temp_data("thresholds.json", lambda t: t["spo2"].update(orange=[99.5, None]))
    lungs = next(r for r in client.get("/api/status?persona=A").json() if r["region"] == "lungs")
    assert lungs["status"] == "orange"
