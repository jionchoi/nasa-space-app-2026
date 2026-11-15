"""Escalation queue (drafts + shared messaging), DONKI radiation replay, cabin CO2 feed, DB migration."""
import sqlite3

from app import alerts, db, radiation, store


def heart_alert(client):
    client.get("/api/status?persona=B&env=mars")
    return next(a for a in client.get("/api/alerts?persona=B").json() if a["region"] == "heart")


# ---------- escalation queue ----------

def test_orange_region_gets_alert_and_draft(client):
    alert = heart_alert(client)
    assert alert["level"] == "orange" and alert["message_draft_id"]
    drafts = client.get("/api/messages?persona=B").json()
    draft = next(m for m in drafts if m["id"] == alert["message_draft_id"])
    assert draft["status"] == "draft" and draft["alert_id"] == alert["id"] and draft["region"] == "heart"
    for part in ("Sam Idowu", "Area: Heart", "Trend (Resting heart rate", "Time to act", "Crew actions so far",
                 "Our recommendation", "Latest vitals"):
        assert part in draft["text"], part
    for other in client.get("/api/alerts?persona=B").json():
        if other["level"] == "yellow":
            assert other["message_draft_id"] is None  # yellow: no draft
    client.get("/api/status?persona=B&env=mars")
    assert len(client.get("/api/messages?persona=B").json()) == len(drafts)  # no duplicate drafts


def test_edit_send_and_reply(client):
    draft_id = heart_alert(client)["message_draft_id"]
    assert client.patch(f"/api/messages/{draft_id}", json={"text": "Edited by the crew"}).json()["text"] == "Edited by the crew"
    sent = client.post(f"/api/messages/{draft_id}/send", json={"env": "mars"}).json()
    assert sent["status"] == "sent" and sent["delay_s"] == 750 and sent["sent_at"]
    assert sent["status_text"].startswith("Sent. Arrives in several minutes")
    assert client.patch(f"/api/messages/{draft_id}", json={"text": "too late"}).json()["text"] == "Edited by the crew"
    replied = client.post(f"/api/messages/{draft_id}/reply").json()
    assert replied["status"] == "replied" and "PLACEHOLDER REPLY" in replied["reply"]
    assert client.post("/api/messages/nope/send", json={"env": "iss"}).status_code == 404


def test_delivery_by_environment(client):
    assert client.get("/api/delivery/iss").json() == {"env": "iss", "delay_s": 1.0, "status_text": "Delivered"}
    assert client.get("/api/delivery/moon").json()["status_text"] == "Delivered after ~1.3 s"
    emergency = client.post("/api/messages", json={"persona": "C", "env": "moon", "text": "URGENT", "status": "sent"}).json()
    assert emergency["delay_s"] == 2.0 and emergency["source"] == "emergency"


def test_draft_on_demand_for_a_vitals_alert(client):
    vitals = {"hr": 135, "hrv_rmssd": 20, "spo2": 97, "rr": 16, "signal_quality": 0.9, "irregular": False}
    alerts.check_frame("C", vitals, now=0)
    alert = alerts.check_frame("C", vitals, now=10)[0]  # red for 10 s (RULE-01)
    draft = client.post(f"/api/alerts/{alert['id']}/draft", json={"env": "iss"}).json()
    assert draft["status"] == "draft" and "Heart rate in the danger range" in draft["text"]
    again = client.post(f"/api/alerts/{alert['id']}/draft", json={"env": "iss"}).json()
    assert again["id"] == draft["id"]  # one draft per alert


# ---------- radiation: real DONKI event, simulated dose ----------

def test_radiation_summary_without_event(client):
    data = client.get("/api/radiation?persona=B&env=mars").json()
    assert data["event"] is None and data["event_available"] and not data["fallback_spike_used"]
    assert max(d["msv"] for d in data["daily"]) < 1  # the old spike day is gone
    event = store.space_event()
    assert event["simulated_dose"] is True and event["event"]["sep_id"].endswith("-SEP-001")
    assert event["event"]["link"].startswith("https://")


def test_solar_event_replay(client):
    started = client.post("/api/radiation/replay", json={"action": "start", "minutes": 5}).json()["event"]
    assert started["sep_id"] == store.space_event()["event"]["sep_id"] and started["remaining_s"] > 0
    data = client.get("/api/radiation?persona=B&env=mars").json()
    assert data["status"] == "red" and "storm shelter" in data["event"]["advice"]
    assert "shielded module" in client.get("/api/radiation?persona=B&env=iss").json()["event"]["advice"]
    row = next(r for r in client.get("/api/status?persona=B&env=mars").json() if r["region"] == "radiation")
    assert row["status"] == "red" and "Solar particle event" in row["reason"]
    alert = next(a for a in client.get("/api/alerts?persona=B").json() if a["region"] == "radiation")
    assert alert["message"] == "Solar particle event: go to the shielded area" and alert["message_draft_id"]
    assert any(a["region"] == "radiation" for a in client.get("/api/alerts?persona=A").json())  # whole crew
    client.post("/api/radiation/replay", json={"action": "stop"})
    assert client.get("/api/radiation?persona=B").json()["event"] is None


def test_fallback_spike_when_event_missing(client, temp_data):
    (store.DATA_DIR / "space_weather" / "event.json").unlink()
    store.reset()
    data = client.get("/api/radiation?persona=B").json()
    assert data["fallback_spike_used"] and max(d["msv"] for d in data["daily"]) == 5.2
    assert client.post("/api/radiation/replay", json={"action": "start"}).status_code == 409
    radiation.stop()


# ---------- cabin ----------

def test_cabin_feed_and_co2_context(client, temp_data):
    cabin = client.get("/api/cabin").json()
    assert cabin["kind"] == "real" and not cabin["simulated"] and len(cabin["last_24h"]) == 96
    assert {"co2_ppm", "temp_c", "rh_pct", "t", "measured_at"} <= cabin["now"].keys()
    # The real ISS CO2 rarely passes the PLACEHOLDER watch level; lower it to check the context note.
    temp_data("thresholds.json", lambda d: d["co2_ppm"].update(yellow=[None, 1000]))
    assert client.get("/api/cabin").json()["co2_high_hours_24h"] >= 2
    brain = next(r for r in client.get("/api/status?persona=B").json() if r["region"] == "brain_mood")
    assert "Cabin CO2 has been high" in brain["reason"]
    healthy = next(r for r in client.get("/api/status?persona=A").json() if r["region"] == "brain_mood")
    assert "CO2" not in healthy["reason"]  # green and no headache: no note


# ---------- database migration ----------

def test_old_messages_table_is_migrated(tmp_path, monkeypatch):
    path = tmp_path / "old.db"
    with sqlite3.connect(path) as conn:
        conn.execute("CREATE TABLE messages (id TEXT PRIMARY KEY, persona TEXT, t TEXT NOT NULL, env TEXT, "
                     "text TEXT NOT NULL, status TEXT NOT NULL, delay_s REAL, alert_id TEXT)")
        conn.execute("INSERT INTO messages VALUES ('m1', 'A', '2026-11-13T10:00:00Z', 'iss', 'hello', 'sent', 1, NULL)")
    monkeypatch.setenv("COPILOT_DB", str(path))
    db.forget_schema_cache()
    row = db.query("SELECT * FROM messages")[0]
    assert row["text"] == "hello" and "reply" in row and "sent_at" in row
