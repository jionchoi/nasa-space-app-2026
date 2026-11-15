"""Labels, schema additions, alerts, SQLite persistence and the sensor/replay switch."""
import time

from fastapi.testclient import TestClient

from app import alerts, db, sensor, store, ws
from app.main import app
from app.models import Alert, Labels, ThresholdEntry


def frame(**over):
    base = {"hr": 70, "hrv_rmssd": 45, "spo2": 98, "rr": 14, "signal_quality": 0.93, "irregular": False}
    return {**base, **over}


# ---------- labels and schema ----------

def test_labels_endpoint_reads_the_file(client, temp_data):
    assert Labels.model_validate(client.get("/api/labels").json()).root["red"] == "Act now"
    temp_data("labels.json", lambda d: d.update(red="Call now"))
    assert client.get("/api/labels").json()["red"] == "Call now"


def test_every_metric_has_unit_and_only_ranges():
    """thresholds.json keeps ranges and sources; how to measure lives in measurements.json (Nov 14)."""
    for key, entry in store.thresholds().items():
        if isinstance(entry, dict) and key not in ("red_flags", "daily_targets", "cv", "dose_estimates", "pvt", "plausible"):
            parsed = ThresholdEntry.model_validate(entry)
            assert parsed.unit, key
            assert "how_to_measure" not in entry, key


# ---------- alerts ----------

def test_region_alerts_created_once(client):
    client.get("/api/status?persona=B")
    first = client.get("/api/alerts?persona=B").json()
    by_region = {a["region"]: a for a in first}
    assert by_region["heart"]["level"] == "orange" and by_region["heart"]["source"] == "rules"
    assert by_region["bones_muscles"]["level"] == "yellow"
    assert "Warning" in by_region["heart"]["message"]  # status word from labels.json
    for a in first:
        Alert.model_validate(a)
    client.get("/api/status?persona=B")  # same statuses again: no duplicates
    assert len(client.get("/api/alerts?persona=B").json()) == len(first)
    client.get("/api/status?persona=A")
    assert client.get("/api/alerts?persona=A").json() == []


def test_ack_alert(client):
    client.get("/api/status?persona=B")
    alert = client.get("/api/alerts?persona=B").json()[0]
    acked = client.post(f"/api/alerts/{alert['id']}/ack").json()
    assert acked["acknowledged"] is True
    assert client.post("/api/alerts/nope/ack").status_code == 404


def test_red_live_vitals_create_one_alert_each():
    assert alerts.check_frame("C", frame()) == []
    created = alerts.check_frame("C", frame(hr=135, irregular=True))
    assert {a["metric"] for a in created} == {"hr", "irregular"}
    assert all(a["level"] == "red" and a["source"] == "vitals" and a["region"] == "heart" for a in created)
    assert alerts.check_frame("C", frame(hr=136, irregular=True)) == []  # still red: no repeat
    assert alerts.check_frame("C", frame(hr=150, signal_quality=0.3)) == []  # poor signal is ignored


def test_alerts_websocket_pushes_new_alerts(client):
    with client.websocket_connect("/ws/alerts?persona=B") as feed:
        assert feed.receive_json() == {"type": "snapshot", "alerts": []}
        client.get("/api/status?persona=B")
        message = feed.receive_json()
        assert message["type"] == "alert" and message["alert"]["persona"] == "B"


def test_emergency_log_creates_alert(client):
    body = {"persona": "C", "protocol": "chest_pain", "title": "Chest pain or pressure",
            "started": "2026-11-14T10:00:00Z", "ended": "2026-11-14T10:06:00Z", "duration_s": 360,
            "log": [{"t": "2026-11-14T10:00:00Z", "kind": "start", "text": "Emergency started"}]}
    res = client.post("/api/emergency-logs", json=body).json()
    assert res["alert_id"]
    assert client.get("/api/emergency-logs?persona=C").json()[0]["log"][0]["kind"] == "start"
    assert client.get("/api/alerts?persona=C").json()[0]["source"] == "emergency"


# ---------- SQLite persistence ----------

def restart():
    """What a backend restart loses: every in-memory structure. The database file stays."""
    store.reset()
    alerts.reset()
    sensor.hub.reset()
    db.forget_schema_cache()
    return TestClient(app)


def test_everything_survives_a_restart(client):
    b = store.persona("B")["stream"]
    client.post("/api/check", json={"persona": "B", "seated_frames": b[:120], "stand_frames": [], "answers": {"mood": 2}})
    client.post("/api/events?persona=C", json={"t": "2026-11-14T10:00:00Z", "type": "alarm", "signals": {"motion": 0.01}})
    client.post("/api/messages", json={"persona": "C", "env": "mars", "text": "URGENT: chest pain", "delay_s": 750})
    client.post("/api/forms", json={"persona": "B", "kind": "meal", "data": {"meal_type": "lunch", "water_l": 0.6, "notes": "640 kcal"}})
    client.get("/api/status?persona=B")
    first_alert = client.get("/api/alerts?persona=B").json()[0]
    client.post(f"/api/alerts/{first_alert['id']}/ack")

    client = restart()
    assert len(client.get("/api/persona/B/daily").json()) == 31  # today's check is back
    assert client.get("/api/daily-checks?persona=B").json()[0]["day"] == 31
    assert client.get("/api/events").json()[0]["signals"]["motion"] == 0.01
    assert client.get("/api/messages?persona=C").json()[0]["delay_s"] == 750
    assert client.get("/api/forms?kind=meal").json()[0]["data"]["notes"] == "640 kcal"
    assert client.get("/api/streaks/B").json()["current"] == 1
    saved = {a["id"]: a for a in client.get("/api/alerts?persona=B").json()}
    assert saved[first_alert["id"]]["acknowledged"] is True
    count = len(saved)
    client.get("/api/status?persona=B")  # same statuses after restart: no duplicate alerts
    assert len(client.get("/api/alerts?persona=B").json()) == count


def test_admin_reset_clears_only_the_database(client):
    client.get("/api/status?persona=B")
    client.post("/api/forms", json={"persona": "B", "kind": "meal", "data": {}})
    assert client.get("/api/admin/summary").json()["counts"]["alerts"] > 0
    counts = client.post("/api/admin/reset").json()["counts"]
    assert set(counts.values()) == {0}
    assert len(client.get("/api/persona/B/daily").json()) == 30  # JSON files untouched


# ---------- live sensor / replay switch ----------

def test_raw_samples_without_compute_vitals_are_ignored():
    buffer = sensor.RawBuffer()
    accepted, error = sensor.handle_message({"samples": [0.0] * 1100, "fs": 100}, buffer)
    assert (accepted, error) == (0, None)
    assert sensor.hub.latest is None
    assert sensor.handle_message({"samples": [1, 2]}, buffer)[1]  # missing fs is an error
    assert sensor.handle_message({"hr": "fast"}, buffer)[1]  # bad frame is an error


def read_until(conn, predicate, limit=400):
    for _ in range(limit):
        message = conn.receive_json()
        if predicate(message):
            return message
    raise AssertionError("expected message not received")


def test_vitals_switch_to_sensor_and_back_to_replay(client, monkeypatch):
    monkeypatch.setattr(sensor, "FRESH_S", 0.6)
    monkeypatch.setattr(ws, "SENSOR_POLL_S", 0.05)
    fake = sensor.persona_frames("C", 300)  # the same frames scripts/fake_sensor.py sends
    with client.websocket_connect("/ws/vitals?persona=A&speed=20") as vitals:
        assert vitals.receive_json() == {"type": "source_changed", "source": "replay"}
        assert vitals.receive_json()["source"] == "replay"
        with client.websocket_connect("/ws/sensor") as sensor_ws:
            sent = [next(fake) for _ in range(3)]
            for f in sent:
                sensor_ws.send_json(f)
            read_until(vitals, lambda m: m == {"type": "source_changed", "source": "sensor"})
            live = read_until(vitals, lambda m: m.get("source") == "sensor")
            assert live["hr"] in {f["hr"] for f in sent}
        time.sleep(0.7)  # sensor silent for longer than FRESH_S
        read_until(vitals, lambda m: m == {"type": "source_changed", "source": "replay"})
        assert read_until(vitals, lambda m: "hr" in m)["source"] == "replay"
