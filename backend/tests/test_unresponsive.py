"""Unresponsive crew member detection (renamed from collapse detection): protocol, events, optional PPG fields."""
from app import sensor, store


def test_old_collapse_protocol_id_still_works(client):
    assert client.get("/api/protocols/collapse").json()["id"] == "unresponsive"
    assert client.get("/api/protocols/unresponsive").json()["title"].startswith("Crew member not responding")


def test_collapse_protocol_order_and_no_auto_route():
    """Nov 15: the medical lead's Collapse Protocol CL00-CL13. Responds? (CL01) -> breathing? (CL03) -> pulse? (CL05)
    -> CPR (CL07). Sensors never move the crew on: no red_flag_routes."""
    steps = {s["id"]: s for s in store.protocol("unresponsive")["steps"]}
    assert list(steps)[0] == "CL00" and steps["CL00"]["next"] == "CL01"
    assert steps["CL01"]["on_no"] == "CL03" and steps["CL03"]["on_no"] == "CL05" and steps["CL05"]["on_no"] == "CL07"
    assert steps["CL07"]["cpr"] and steps["CL13"]["cpr"] and steps["CL13"]["next"] == "CL08"
    assert store.protocol("unresponsive")["red_flag_routes"] == []


def test_event_types_renamed(client):
    ok = {"t": "2026-11-14T10:00:00Z", "type": "unresponsive_suspected", "signals": {"limb_motion": 0.01}}
    assert client.post("/api/events?persona=A", json=ok).json() == {"ok": True, "alert_id": None}
    old = {**ok, "type": "collapse_suspected"}
    assert client.post("/api/events?persona=A", json=old).status_code == 422


def test_optional_ppg_fields_pass_through_and_can_be_left_out():
    with_fields = sensor.hub.push({"hr": 60, "hrv_rmssd": 50, "spo2": 98, "rr": 14, "signal_quality": 0.9, "irregular": False,
                                   "pulse_amplitude": 0.8, "beats_detected": 1, "ppg_baseline": 0.6})
    assert with_fields["pulse_amplitude"] == 0.8 and with_fields["beats_detected"] == 1
    without = sensor.hub.push({"hr": 60, "hrv_rmssd": 50, "spo2": 98, "rr": 14, "signal_quality": 0.9, "irregular": False})
    assert "pulse_amplitude" not in without


def test_persona_c_replay_loses_the_pulse_and_cv_block_is_complete():
    c = store.persona("C", original=True)
    assert c["unresponsive_s"] == 480
    end = c["stream"][-1]
    assert end["pulse_amplitude"] < 0.1 and end["beats_detected"] == 0 and end["signal_quality"] >= 0.6
    cv = store.thresholds()["cv"]
    for key in ("limb_motion_low", "limb_motion_spike", "nbp", "drift", "ppg", "weights", "unresponsive_threshold"):
        assert key in cv, key
    assert "headDrop" not in str(cv) and "head_drop_ratio" not in cv


# ---------- Nov 14: event fields as sent, camera alarm -> backend alert, falls where there is gravity ----------

CV_ALARM = {"t": "2026-11-14T10:05:00Z", "type": "alarm", "signals": {
    "source": "cv", "limb_motion": 0.012, "body_drift": 0.03, "nbp": 0.91, "eyes_closed_s": 24.2, "score": 0.88,
    "pulse": "ok", "from": "CHECK_IN", "to": "ALARM", "reason": 'No response to "Are you OK?" within 15 s',
    "text": 'Unresponsive detection: No response to "Are you OK?" within 15 s'}}


def test_event_signals_match_what_the_frontend_sends(client):
    from app.models import EventSignals
    declared = {f.alias or name for name, f in EventSignals.model_fields.items()}
    assert {"source", "limb_motion", "body_drift", "nbp", "eyes_closed_s", "score", "pulse", "from", "to", "reason",
            "text", "origin", "protocol", "kind"} <= declared
    assert not {"motion", "posture"} & declared  # old collapse-era fields nothing sends
    assert client.post("/api/events?persona=A", json={**CV_ALARM, "type": "checkin_started"}).status_code == 200
    stored = client.get("/api/events?persona=A").json()[-1]["signals"]
    assert stored["from"] == "CHECK_IN" and stored["to"] == "ALARM" and stored["limb_motion"] == 0.012
    bad = {**CV_ALARM, "signals": {**CV_ALARM["signals"], "pulse": "maybe"}}
    assert client.post("/api/events?persona=A", json=bad).status_code == 422
    for sender in ({"source": "crew_alarm", "origin": "cv", "reason": "x", "text": "Crew alarm: x"},
                   {"source": "emergency", "protocol": "unresponsive", "kind": "step", "text": "Step 2"}):
        assert client.post("/api/events?persona=A", json={"t": CV_ALARM["t"], "type": "alarm", "signals": sender}).status_code == 200


def test_camera_alarm_creates_an_act_now_alert_with_a_draft(client):
    res = client.post("/api/events?persona=A&env=mars", json=CV_ALARM).json()
    assert res["ok"] and res["alert_id"]
    alert = next(a for a in client.get("/api/alerts?persona=A").json() if a["id"] == res["alert_id"])
    assert alert["level"] == "red" and alert["region"] == "heart" and alert["source"] == "cv"
    assert alert["message_draft_id"] and "unresponsive" in alert["link"]
    draft = next(m for m in client.get("/api/messages?persona=A").json() if m["id"] == alert["message_draft_id"])
    assert draft["status"] == "draft" and draft["env"] == "mars"
    # The same open alarm is not repeated; the crew alarm screen and the emergency log never create one.
    assert client.post("/api/events?persona=A", json=CV_ALARM).json()["alert_id"] is None
    for source in ("crew_alarm", "emergency"):
        other = {**CV_ALARM, "signals": {"source": source, "text": "x"}}
        assert client.post("/api/events?persona=B", json=other).json()["alert_id"] is None
    assert not [a for a in client.get("/api/alerts?persona=B").json() if a["source"] == "cv"]


def test_fall_detection_wherever_there_is_gravity():
    envs = store.thresholds()["cv"]["fall"]["environments"]
    assert set(envs) == {"moon", "rover:moon", "rover:mars"}
    assert "iss" not in envs and "mars" not in envs
    for key in envs:  # every entry is a real location key
        assert store.environment(key) is not None, key
