"""Unresponsive crew member detection (renamed from collapse detection): protocol, events, optional PPG fields."""
from app import sensor, store


def test_old_collapse_protocol_id_still_works(client):
    assert client.get("/api/protocols/collapse").json()["id"] == "unresponsive"
    assert client.get("/api/protocols/unresponsive").json()["title"] == "Crew member not responding"


def test_microgravity_order_restrain_before_airway_and_cpr_route():
    steps = store.protocol("unresponsive")["steps"]
    keys = [s.get("key") for s in steps]
    assert keys[0] == "responsive"
    # Stop the drift and restrain come before the airway/breathing check.
    first_check = keys.index("breathing")
    assert any("drift" in s["text"] for s in steps[:first_check])
    assert any("Restrain" in s["text"] for s in steps[:first_check])
    assert keys.index("pulse") > first_check
    routes = {r["flag"]: r["goto"] for r in store.protocol("unresponsive")["red_flag_routes"]}
    assert routes["pulse_lost"] == "cpr"


def test_event_types_renamed(client):
    ok = {"t": "2026-11-14T10:00:00Z", "type": "unresponsive_suspected", "signals": {"limb_motion": 0.01}}
    assert client.post("/api/events?persona=A", json=ok).json() == {"ok": True}
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
